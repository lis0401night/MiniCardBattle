/**
 * src/game/battle/battleCombat.js
 * カードの破棄、プレイ、戦闘フェーズの実行など、
 * バトル中の主要なアクションと戦闘ロジックを管理するモジュール。
 */

import { GameState } from '../../state/gameState.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { ACTIVE_SKILLS } from '../../utils/constants/skills.js';
import {
  PLACE_ANIMATION_DURATION,
  VALKYRIA_GUARD_POPUP_COLOR,
  MAX_HAND_SIZE_DURING_TURN,
} from '../../utils/constants/config.js';
import {
  checkIsFortuneMode,
  getFortuneEnemyCharId,
} from '../../utils/gameUtils.js';
import {
  updateDeckDisplay,
  renderBoard,
  renderHand,
  updateHPBar,
  showDeckRefreshEffect,
  showSpeechBubble,
  updateCardPowerOnly,
  updateCardDetail,
  playSummonAnimation,
} from '../../services/uiBattle.js';
import {
  getSkillValue,
  getSeededRandom,
  playSound,
  createDamagePopup,
  sleep,
  hasSkill,
  shuffleArray,
  mergeCardSkills,
  consumeArmSelf,
} from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playCardVoice } from '../../utils/constants/voices.js';
import {
  canTakeDamage,
  isValkyriaGuardActive,
  applySingleCombat,
  calculateCombatPhase,
} from '../engine.js';
import { playEvents } from '../eventRenderer.js';
import { resolveActiveSkillEffect } from '../skillLogic.js';
import { trackMissionSacrifice, trackMissionPower } from '../missionLogic.js';
import { checkWinCondition } from './battleResult.js';
import { canEquipCard } from './battleSelection.js';
import {
  CHAR_FORTUNE_HANDICAPS,
  HANDICAP_TYPES,
} from '../../utils/constants/fortuneHandicaps.js';

/**
 * 2枚のカードを合体させた新しいカードインスタンスを生成する共通ヘルパー関数。
 * DRY原則に基づき、手札からの召喚による合体および移動時の合体の両経路から利用される。
 *
 * @param {string} owner - 合体カードの所有者 ('blue' | 'red')
 * @param {object} existingCard - 盤面に存在する合体対象の土台カード
 * @param {object} consumedCard - 手札または移動元から重ねられた消費カード
 * @param {object} masterData - 合体後のマスターデータ
 * @returns {object} 生成された合体カードオブジェクト
 */
export function createUnionCard(owner, existingCard, consumedCard, masterData) {
  const masterClone = JSON.parse(JSON.stringify(masterData));
  const unionSkills = JSON.parse(JSON.stringify(masterClone.skills || []));
  const unionCard = {
    ...masterClone,
    uid: `union_${existingCard.uid || existingCard.id}_${consumedCard.uid || consumedCard.id}`,
    owner,
    baseId: masterClone.id,
    basePower: masterClone.power,
    currentPower: masterClone.power,
    skills: [],
    unionMaterials: [existingCard, consumedCard],
    isPremium: !!consumedCard.isPremium || !!existingCard.isPremium,
  };
  mergeCardSkills(unionCard, unionSkills);
  return unionCard;
}

/**
 * 装備カードのパラメータおよびスキル（選択肢含む）を対象カードへ統合・加算適用する共通ヘルパー関数。
 * DRY原則を遵守し、手札からのプレイ (playCard) および移動選択 (resolveMoveDestination) の両方から共通利用する。
 * @param {object} target - 装備される対象カード
 * @param {object} equipment - 装備するカード
 * @param {Set} [movedIds] - 移動済みカードID集合（移動による装備時のみ使用）
 */
export function applyEquipment(target, equipment, movedIds) {
  const equipPower = equipment.currentPower ?? equipment.power ?? 0;
  const currentPower = target.currentPower ?? target.power ?? 0;

  target.power = (target.power || 0) + equipPower;
  target.basePower = (target.basePower || 0) + equipPower;
  target.currentPower = currentPower + equipPower;

  // スキルの統合
  const equipSkills = (equipment.skills || []).filter(
    (skill) => skill.id !== 'equip'
  );
  if (equipSkills.length > 0) {
    mergeCardSkills(target, equipSkills);
  }

  // choiceスキルがある場合は、装備元の選択肢を引き継ぐ
  if (equipment.choices && equipment.choices.length > 0) {
    target.choices = target.choices || [];
    equipment.choices.forEach((pc) => {
      const isDup = target.choices.some(
        (tc) =>
          tc.id === pc.id &&
          tc.value === pc.value &&
          tc.choiceGroup === pc.choiceGroup
      );
      if (!isDup) target.choices.push({ ...pc });
    });
  }
  if (equipment.choices2 && equipment.choices2.length > 0) {
    target.choices2 = target.choices2 || [];
    equipment.choices2.forEach((pc) => {
      const isDup = target.choices2.some(
        (tc) =>
          tc.id === pc.id &&
          tc.value === pc.value &&
          tc.choiceGroup === pc.choiceGroup
      );
      if (!isDup) target.choices2.push({ ...pc });
    });
  }

  target.equippedCards = target.equippedCards || [];
  target.equippedCards.push(equipment);
  consumeArmSelf(target, equipment);

  if (movedIds) {
    movedIds.add(target.uid || target.id);
  }

  return { equipSkills };
}

/**
 * カードをマスターデータから初期状態に復元し、傀儡の返却先所有者を確定する。
 * @param {object} card - 復元対象のカード
 * @param {string} fallbackOwner - puppetOriginalOwner/owner が無い場合の所有者
 * @returns {{ card: object, owner: string }} 復元済みカードと返却先所有者
 */
export function restoreCardForDiscard(card, fallbackOwner) {
  const owner = card.puppetOriginalOwner || card.owner || fallbackOwner;
  const master = CARD_MASTER.find((m) => m.id === (card.baseId || card.id));
  let restored;
  if (master) {
    restored = JSON.parse(JSON.stringify(master));
    restored.uid = card.uid;
    restored.baseId = card.baseId || card.id;
    if (card.isPremium !== undefined) restored.isPremium = card.isPremium;
    restored.basePower = restored.power;
    restored.currentPower = restored.power;
  } else {
    restored = { ...card };
    if ('basePower' in restored) restored.power = restored.basePower;
    restored.currentPower = restored.power;
    restored.skills = [];
  }
  restored.owner = owner;
  delete restored.puppetOriginalOwner;
  return { card: restored, owner };
}

/**
 * 戦闘シミュレーション (Engine) へ渡す state スナップショットを生成する。
 * GameState の盤面・手札・墓地をディープコピーし、副作用が本体へ及ばないようにする。
 * @returns {object} Engine 用の state オブジェクト
 */
function createCombatSnapshot() {
  const cloneCard = (c) => (c ? JSON.parse(JSON.stringify(c)) : null);
  return {
    playerBoard: GameState.playerBoard.map(cloneCard),
    enemyBoard: GameState.enemyBoard.map(cloneCard),
    playerHP: GameState.playerHP,
    enemyHP: GameState.enemyHP,
    playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
    enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
    playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
    enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard)),
    playerSealedLanes: GameState.playerSealedLanes
      ? [...GameState.playerSealedLanes]
      : [0, 0, 0],
    enemySealedLanes: GameState.enemySealedLanes
      ? [...GameState.enemySealedLanes]
      : [0, 0, 0],
    valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
    valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
  };
}

/**
 * カードを墓地に送り、破棄アニメーション・音声・変身解除・ミッション進捗（生贄カウント）等を処理する。
 * @param {string} owner - カード所有者 ('blue' | 'red')
 * @param {object} card - 破棄対象のカードオブジェクト
 * @param {number} [lane] - 破棄が行われたレーンインデックス
 * @param {boolean} [isDestroyed=true] - 破壊による破棄かどうかのフラグ
 * @returns {Promise<boolean>} 分裂等により盤面が既に置換済みの場合は true
 */
export async function discardCard(owner, card, lane, isDestroyed = true) {
  // 防御: card が undefined/null の場合はエラーにならないようガード
  if (!card) {
    console.warn(
      '[discardCard] card は undefined/null です。スキップします。',
      { owner, lane }
    );
    return false;
  }
  // 付属物（装備・合体素材・変身元）の墓地返却処理（restoreCardForDiscard で共通化）
  if (card.equippedCards && card.equippedCards.length > 0) {
    for (const eqCard of card.equippedCards) {
      const { card: restoredEq, owner: eqOwner } = restoreCardForDiscard(
        eqCard,
        owner
      );
      const discardPile =
        eqOwner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
      if (!restoredEq.isToken) {
        if (typeof window.stripEphemeralSkills === 'function') {
          window.stripEphemeralSkills(restoredEq);
        }
        discardPile.push(restoredEq);
      }
    }
    card.equippedCards = [];
  }

  if (card.unionMaterials && card.unionMaterials.length > 0) {
    for (const matCard of card.unionMaterials) {
      const { card: restoredMat, owner: matOwner } = restoreCardForDiscard(
        matCard,
        owner
      );
      const discardPile =
        matOwner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
      if (!restoredMat.isToken) {
        discardPile.push(restoredMat);
      }
    }
    card.unionMaterials = [];
  }

  if (card.originalRevertTarget) {
    const { card: restoredCard, owner: rvOwner } = restoreCardForDiscard(
      card.originalRevertTarget,
      owner
    );
    if (!restoredCard.isToken) {
      (rvOwner === 'blue'
        ? GameState.playerDiscard
        : GameState.enemyDiscard
      ).push(restoredCard);
    }
    updateDeckDisplay(rvOwner);
  }

  if (card.isToken) return false;
  let skillsToResolve = Array.isArray(card.skills) ? [...card.skills] : [];
  let isReplacedOnBoard = false;

  // TODO(リファクタリング): 処刑等の旧直接破棄ロジック（discardCard）と Engine/Renderer（新エンジン）の間で
  // 破棄・墓地送り処理が二重化しています。将来的にはすべて Engine / Renderer 構造へ一元化・統一すべきです。
  if (isDestroyed && lane !== undefined && lane !== null) {
    // 分裂(split): トークンを生成しつつ、元のカード本体も下部の墓地追加処理へ進める
    if (skillsToResolve.some((sk) => sk.id === 'split')) {
      await triggerSplitSkill(owner, lane, card);
      isReplacedOnBoard = true;
    }
    // 誘爆(explode) — 隣接カードにダメージを与える（カード自体は通常通り墓地へ）
    if (skillsToResolve.some((sk) => sk.id === 'explode')) {
      await triggerExplodeSkill(owner, lane, card);
    }
  }

  // スキル発動フラグをリセット
  card.skillTriggered = false;
  card.stunTurns = 0;
  card.stunAppliedThisTurn = false;

  // 一時的なスキルの除去（無敵など）
  if (Array.isArray(card.skills)) {
    card.skills = card.skills.filter((sk) => sk.id !== 'invincible');
  }

  // 変相の復帰処理
  if (card.originalCardId) {
    const originalMaster = CARD_MASTER.find(
      (m) => m.id === card.originalCardId
    );
    if (originalMaster) {
      card.name = originalMaster.name;
      card.power = originalMaster.power || 0;
      card.basePower = originalMaster.power || 0;
      card.currentPower = originalMaster.power || 0;
      card.skills = originalMaster.skills
        ? JSON.parse(JSON.stringify(originalMaster.skills))
        : [];
      card.choices = originalMaster.choices
        ? JSON.parse(JSON.stringify(originalMaster.choices))
        : [];
      card.choices2 = originalMaster.choices2
        ? JSON.parse(JSON.stringify(originalMaster.choices2))
        : null;
      card.rarity = originalMaster.rarity;
      card.imgUrl = originalMaster.imgUrl;
      card.flavor = originalMaster.flavor;
      card.voiceCategory = originalMaster.voiceCategory;
      card.id = originalMaster.id;
      if (card.baseId) card.baseId = originalMaster.id;
      delete card.originalCardId;
    }
  }

  // マスターデータから完全な初期状態を再構成して墓地へ（restoreCardForDiscard で共通化）
  const { card: restoredCard, owner: discardOwner } = restoreCardForDiscard(
    card,
    owner
  );

  if (typeof window.stripEphemeralSkills === 'function') {
    window.stripEphemeralSkills(restoredCard);
  }

  (discardOwner === 'blue'
    ? GameState.playerDiscard
    : GameState.enemyDiscard
  ).push(restoredCard);
  updateDeckDisplay(discardOwner);
  return isReplacedOnBoard;
}

/**
 * 「分裂 (split)」スキルの効果を発動し、指定レーンにトークンカードを生成・配置する。
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {number} lane - 分裂トークンを生成・配置するレーンインデックス
 * @param {object} card - 分裂スキルを保持する親カード
 */
export async function triggerSplitSkill(owner, lane, card) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const sealedLanes =
    owner === 'blue' ? GameState.playerSealedLanes : GameState.enemySealedLanes;
  if (sealedLanes && sealedLanes[lane] > 0) return;

  const tokenId =
    card.summonId ||
    card.skills?.find((s) => s.id === 'split')?.summonId ||
    'token_legs'; // 安全のためのフォールバック値
  const tL = CARD_MASTER.find((m) => m.id === tokenId) || {
    name: 'トークン',
    power: 1,
  };

  // skills配列・skillプロパティの両方に対応したスキル値の取得
  let val = getSkillValue(card, 'split');
  if (val === undefined || val === null || isNaN(val)) {
    val = tL.power || 2;
  }

  board[lane] = {
    ...JSON.parse(JSON.stringify(tL)),
    id: `sp_${Math.floor(getSeededRandom() * 1000000000)}_${lane}`,
    baseId: tokenId,
    isToken: true,
    owner,
    imgUrl: `assets/cards/card_${tokenId}.webp`,
    power: val,
    currentPower: val,
    basePower: val,
    rarity: tL.rarity || 1,
  };

  playSound(SOUNDS.sePlace);
  renderBoard();
  const cEl = document.querySelector(
    `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${lane}"] .card`
  );
  if (cEl) createDamagePopup(cEl, '分裂', '#facc15');
  await sleep(PLACE_ANIMATION_DURATION);
}

/**
 * パワーが0以下になった盤面上のカードを一括検索し、破壊・墓地送り・遺言/爆発スキル処理を行う。
 * @param {object} [excludeCard=null] - クリーニング対象外とするカードオブジェクト
 */
export async function cleanupDestroyedCards(excludeCard = null) {
  let anyDestroyedAtAll = false;
  while (true) {
    let destroyedItems = [];
    [GameState.playerBoard, GameState.enemyBoard].forEach((board, bIdx) => {
      const side = bIdx === 0 ? 'player' : 'enemy';
      for (let i = 0; i < 3; i++) {
        if (
          board[i] &&
          board[i].currentPower <= 0 &&
          board[i] !== excludeCard &&
          !board[i].isSkillResolving
        ) {
          const el = document.querySelector(
            `#${side}-lanes .cell[data-lane="${i}"] .card`
          );
          destroyedItems.push({
            board,
            index: i,
            el,
            owner: bIdx === 0 ? 'blue' : 'red',
            card: board[i],
          });
        }
      }
    });

    if (destroyedItems.length === 0) break;
    anyDestroyedAtAll = true;

    // 演出: 死亡ボイス再生（揺れよりも先に開始）
    destroyedItems.forEach((item) => {
      if (item.card) {
        playCardVoice(item.card, 'death');
      }
    });
    // その後に揺らす
    destroyedItems.forEach((item) => {
      if (item.el) {
        // アニメーションを再トリガーするために一度クラスを外してリフロー
        item.el.classList.remove('anim-shake');
        void item.el.offsetWidth;
        item.el.classList.add('anim-shake');
      }
    });
    playSound(SOUNDS.seDamage);
    await sleep(400);

    // 実際の除去処理
    for (const item of destroyedItems) {
      if (item.board[item.index] !== item.card) continue;
      item.board[item.index] = null;
      await discardCard(item.owner, item.card, item.index);

      // 報復（retaliate）スキルの誘発
      const ownerSide = item.owner; // 'blue' or 'red'
      const alliedBoard =
        ownerSide === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
      const sideLabel = ownerSide === 'blue' ? 'player' : 'enemy';

      for (let j = 0; j < 3; j++) {
        const ally = alliedBoard[j];
        if (ally && hasSkill(ally, 'retaliate')) {
          const buffVal = getSkillValue(ally, 'retaliate') || 2;
          ally.currentPower += buffVal;

          const allyEl = document.querySelector(
            `#${sideLabel}-lanes .cell[data-lane="${j}"] .card`
          );
          if (allyEl) {
            createDamagePopup(allyEl, `報復 +${buffVal}`, '#f87171');
          }
        }
      }
    }

    playSound(SOUNDS.seDestroy);
    renderBoard();
    await sleep(400); // 連続破壊の際の間隔
  }
  return anyDestroyedAtAll;
}

/**
 * 「自爆 (explode)」スキルの効果を発動し、対面カードや周囲にダメージを与える。
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {number} lane - 爆発が発生するレーンインデックス
 * @param {object} card - 爆発スキルを保持するカード
 */
export async function triggerExplodeSkill(owner, lane, card) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const side = owner === 'blue' ? 'player' : 'enemy';
  const val = getSkillValue(card, 'explode') || 3;
  const adj = lane === 1 ? [0, 2] : [1];

  console.log(`Exploding at ${lane} with value ${val}`);

  if (window.triggerVfx) {
    await window.triggerVfx('anm_skill_explode', owner, lane);
  }

  let targetsFound = false;
  const damagedLanes = [];
  const blockedLanes = [];

  adj.forEach((j) => {
    if (board[j]) {
      targetsFound = true;
      // 【加護対応】state(GameState) と所有者を渡し、戦乙女の加護・無効・回避を正しく判定する
      if (canTakeDamage(board[j], val, true, GameState, owner)) {
        board[j].currentPower -= val;
        damagedLanes.push(j);
      } else {
        blockedLanes.push(j);
      }
    }
  });

  if (targetsFound) {
    playSound(SOUNDS.seDamage);
    // renderBoard(); // アニメーションを壊すため避ける

    // ダメージを受けたカードのみパワー描画を更新
    damagedLanes.forEach((j) => updateCardPowerOnly(j, side));

    // ダメージを受けたカードの演出
    damagedLanes.forEach((j) => {
      const cEl = document.querySelector(
        `#${side}-lanes .cell[data-lane="${j}"] .card`
      );
      if (cEl) {
        requestAnimationFrame(() => {
          cEl.classList.remove('anim-shake');
          void cEl.offsetWidth; // リフローを発生させてアニメーションを再トリガー
          cEl.classList.add('anim-shake');
        });
        createDamagePopup(cEl, `誘爆 -${val}`, '#ef4444');
      }
    });

    // ダメージを無効化したカードの演出
    blockedLanes.forEach((j) => {
      const cEl = document.querySelector(
        `#${side}-lanes .cell[data-lane="${j}"] .card`
      );
      if (cEl) {
        createDamagePopup(cEl, '無効', '#94a3b8');
      }
    });

    await sleep(500);
    await cleanupDestroyedCards();
  }
}

/**
 * AIの意思決定キューから指定されたアクションタイプに一致するものを消費・抽出する。
 * @param {Array<string>} types - 抽出対象のアクションタイプ配列
 * @returns {object|null} 抽出されたアクションオブジェクト
 */
export function consumeAIAction(types) {
  if (!GameState.aiDecision || !GameState.aiDecision.actionQueue) return null;
  const typeList = Array.isArray(types) ? types : [types];
  const idx = GameState.aiDecision.actionQueue.findIndex((a) =>
    typeList.includes(a.type)
  );
  if (idx !== -1) {
    return GameState.aiDecision.actionQueue.splice(idx, 1)[0];
  }
  return null;
}

/**
 * 山札から手札へ1枚カードを引く（ドロー）。デッキ切れた場合は墓地リフレッシュを行う。
 * @param {string} owner - プレイヤー種別 ('blue' | 'red')
 */
export function drawCard(owner) {
  let d = owner === 'blue' ? GameState.playerDeck : GameState.enemyDeck,
    h = owner === 'blue' ? GameState.playerHand : GameState.enemyHand,
    ds = owner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;

  // 手札がいっぱいの場合は何もしない
  if (h.length >= MAX_HAND_SIZE_DURING_TURN) {
    updateDeckDisplay(owner);
    return;
  }

  if (d.length === 0 && ds.length > 0) {
    d.push(...shuffleArray(ds));
    ds.length = 0;
    playSound(SOUNDS.seSkill);
    showDeckRefreshEffect(owner);

    // 山札補充時のペナルティ（体力が半分（切り上げ）になるようにダメージ）
    const currentHP = owner === 'blue' ? GameState.playerHP : GameState.enemyHP;
    const newHP = Math.ceil(currentHP / 2);
    const damage = currentHP - newHP;

    if (damage > 0) {
      const hpFill = document.getElementById(
        `${owner === 'blue' ? 'player' : 'enemy'}-hp-fill`
      );
      // 戦乙女の加護（アンジェのリーダースキル）が有効な場合は山札補充ペナルティダメージも0（無効化）にする
      if (isValkyriaGuardActive(GameState, owner)) {
        if (hpFill) {
          createDamagePopup(hpFill, '加護', VALKYRIA_GUARD_POPUP_COLOR);
        }
        playSound(SOUNDS.seSkill);
      } else {
        if (owner === 'blue') {
          GameState.playerHP = newHP;
        } else {
          GameState.enemyHP = newHP;
        }
        if (hpFill) {
          createDamagePopup(hpFill, `-${damage}`, '#ef4444');
        }
        playSound(SOUNDS.seDamage);

        if (window.triggerVfx) {
          window.triggerVfx('anm_deck_reset_joker', owner);
        }

        showSpeechBubble(owner);
        updateHPBar();
        checkWinCondition();
      }
    }
  }

  if (d.length > 0) {
    const drawn = d.pop();
    if (
      drawn.currentPower === undefined ||
      Number.isNaN(drawn.currentPower) ||
      (drawn.currentPower <= 0 && (drawn.power || 0) > 0)
    ) {
      drawn.currentPower = drawn.power || 0;
    }
    h.push(drawn);
  }

  updateDeckDisplay(owner);
  if (owner === 'blue') renderHand();
}

/**
 * 手札から指定レーンへカードをプレイ（召喚/装備/上書き）する。
 * コスト消費・生贄・スキル発動・アニメーション・音声の一連の処理を実行する。
 * @param {string} o - プレイヤー種別 ('blue' | 'red')
 * @param {number} hI - 手札のインデックス番号
 * @param {number} l - プレイ対象のレーンインデックス (0~2)
 * @returns {Promise<boolean>} プレイ成功時は true、失敗/キャンセル時は false
 */
export async function playCard(o, hI, l) {
  const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand,
    b = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const playingCard = h[hI];
  if (!playingCard) return false;

  // 特級目標によるカードプレイ制限（プレイヤーのみ）
  if (
    o === 'blue' &&
    checkIsFortuneMode(GameState.gameMode) &&
    GameState.fortuneHandicaps
  ) {
    const enemyCharId = getFortuneEnemyCharId(GameState.gameMode);
    const handicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];

    const activeBanRules = handicapsList.filter(
      (rule) =>
        rule.type === HANDICAP_TYPES.BAN_SKILL &&
        GameState.fortuneHandicaps[rule.id]
    );

    if (activeBanRules.length > 0) {
      const hasSkillOrChoice = (card, skillId) => {
        if (hasSkill(card, skillId)) return true;
        if ((card.choices || []).some((s) => s.id === skillId)) return true;
        if ((card.choices2 || []).some((s) => s.id === skillId)) return true;
        return false;
      };

      for (const rule of activeBanRules) {
        // skillIds配列内のいずれかのスキルを持っていれば使用禁止
        const forbiddenIds = rule.skillIds || [rule.skillId]; // 互換性のためskillIdも考慮
        for (const fId of forbiddenIds) {
          if (fId && hasSkillOrChoice(playingCard, fId)) {
            if (window.showAlertModalHook) {
              window.showAlertModalHook(
                `特級目標により「${rule.name.replace(/使用禁止/g, '')}」カードは使用できません。`
              );
            }
            return false;
          }
        }
      }
    }
  }

  const sealedLanes =
    o === 'blue'
      ? GameState.playerSealedLanes || [0, 0, 0]
      : GameState.enemySealedLanes || [0, 0, 0];
  const oppBoard = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;

  // 封印（Seal）レーンは絶対に配置・召喚不可（最優先ルール）
  if (sealedLanes[l] > 0) return false;

  // 1ターン目中央制限
  if (GameState.turnCount === 1 && GameState.firstPlayer === o && l !== 1)
    return false;

  // 伝説のカード制限（中央のみ）
  if (hasSkill(playingCard, 'legendary') && l !== 1) return false;

  // 生贄のカード制限（自分のカードがあるレーンのみ）
  if (hasSkill(playingCard, 'takeover') && b[l] === null) return false;

  // 挑戦のカード制限（正面に敵がいるレーンのみ）
  if (hasSkill(playingCard, 'challenge') && oppBoard[l] === null) return false;

  // 頂点のカード制限（自分の伝説カードの上のみ）
  if (hasSkill(playingCard, 'apex')) {
    const targetCard = b[l];
    if (!targetCard || !hasSkill(targetCard, 'legendary')) {
      return false;
    }
  }

  trackMissionSacrifice(GameState, o, playingCard);

  // 手札からのプレイ（召喚・合体・装備含む）時にアニメーションを再生
  await playSummonAnimation(playingCard, o);

  if (b[l]) {
    // 0. 起動（startup）の特別処理（合体や装備に優先して処理される）
    if (hasSkill(b[l], 'startup')) {
      const existingCard = b[l];
      // 起動消滅の特別処理：起動と防御を剥ぎ取る
      existingCard.skills = existingCard.skills.filter(
        (s) => s.id !== 'startup' && s.id !== 'defender'
      );

      // 手札から重ねようとしたカード（playingCard）を消費して直接墓地に送る
      const consumedCard = h.splice(hI, 1)[0];
      await discardCard(o, consumedCard, null, false);

      // ポップアップエフェクト
      const targetEl = document.querySelector(
        `#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`
      );
      if (targetEl) {
        createDamagePopup(targetEl, '起動', '#38bdf8');
      }

      playSound(SOUNDS.sePlace);
      playCardVoice(consumedCard, 'play');

      if (o === 'blue') {
        GameState.selectedCardIndex = null;
        updateCardDetail(null);
      }
      renderHand();
      renderBoard();

      await sleep(PLACE_ANIMATION_DURATION);
      await cleanupDestroyedCards();
      return true; // 起動処理完了
    }

    // 合体（Union）の判定
    const unionSkill =
      playingCard.skills && playingCard.skills.find((s) => s.id === 'union');
    if (
      unionSkill &&
      (b[l].baseId === unionSkill.targetId || b[l].id === unionSkill.targetId)
    ) {
      const targetCard = b[l];
      const combineId = unionSkill.summonId;
      const masterData = CARD_MASTER.find((c) => c.id === combineId);

      if (!masterData) {
        console.error(
          `[playCard] 合体先カード "${combineId}" がマスターデータに存在しません。`
        );
        return false;
      }

      // BattleScreen 等の UI 側で既に合体確認（または破棄確認等による上書き）が完了しているため
      // 即座に合体を実行する。
      const consumedCard = h.splice(hI, 1)[0];
      const unionCard = createUnionCard(
        o,
        targetCard,
        consumedCard,
        masterData
      );

      b[l] = unionCard;

      playSound(SOUNDS.sePlace);
      playCardVoice(unionCard, 'play');

      if (o === 'blue') {
        GameState.selectedCardIndex = null;
        updateCardDetail(null);
      }
      renderHand();
      renderBoard();

      await resolveOnPlaySkill(o, l, unionCard);
      await cleanupDestroyedCards();

      await sleep(100);
      renderBoard();
      return true;
    }

    // 2. 装備（共通ヘルパーcanEquipCardで憑依・反射等の制限を考慮して判定）
    if (canEquipCard(playingCard, b[l])) {
      const targetCard = b[l];
      const consumedCard = h.splice(hI, 1)[0];

      // 共通ヘルパー applyEquipment により装備・パラメータ・スキル・選択肢・武装消費を統合適用
      const { equipSkills } = applyEquipment(targetCard, consumedCard);

      // 配置音・ボイス
      playSound(SOUNDS.sePlace);
      playCardVoice(playingCard, 'play');

      if (o === 'blue') {
        GameState.selectedCardIndex = null;
        updateCardDetail(null);
      }
      renderHand();
      renderBoard();

      // 装備カードが持っていたアクティブスキルを即時発動させる
      for (const sk of equipSkills) {
        if (ACTIVE_SKILLS.includes(sk.id)) {
          await sleep(50);
          const enhancedSk = {
            ...sk,
            _sourceChoices: playingCard.choices,
            _sourceChoices2: playingCard.choices2,
          };
          await resolveActiveSkillEffect(
            o,
            l,
            targetCard,
            sk.id,
            sk.value,
            enhancedSk
          );
        }
      }

      await sleep(100);
      renderBoard();
      await cleanupDestroyedCards();
      return true; // 装備完了
    }
    // 通常の上書き配置時の破棄処理（装備でも合体でもない場合、破壊効果は発動させない）
    if (!(await discardCard(o, b[l], l, false))) b[l] = null;
  } // if (b[l]) end

  b[l] = h.splice(hI, 1)[0];
  const c = b[l];

  // 出現時スキルを持つ場合は即座に保護フラグを立てる（描画待ちの破壊を防ぐ）
  if (hasActiveSkill(c)) {
    c.isSkillResolving = true;
  }

  // 旧環境データ由来等のパワー欠落・異常(手札なのに0やNaN)を自動修復
  if (
    c.currentPower === undefined ||
    Number.isNaN(c.currentPower) ||
    (c.currentPower <= 0 && (c.power || 0) > 0)
  ) {
    c.currentPower = c.power || 0;
    c.basePower = c.power || 0;
  }

  // 配置音とボイスの再生
  playSound(SOUNDS.sePlace);
  playCardVoice(c, 'play');

  if (o === 'blue') {
    GameState.selectedCardIndex = null;
    updateCardDetail(null);
  }
  renderHand();
  renderBoard();

  trackMissionPower(GameState);

  // 出現時スキルの発動（単一または複数）
  if (hasActiveSkill(c)) {
    await sleep(50); // React DOMコミット待機
    await resolveOnPlaySkill(o, l, c);
  }

  // スキル解決後、自分自身（パワー0のスペル等）や他カードの死亡を一括確認する。
  // cleanupDestroyedCards は内部で破壊対象が無くなるまでループするため、1回で十分。
  await cleanupDestroyedCards();
  return true;
}

/**
 * カードがアクティブスキル（召喚時発動スキル）を保持しているか判定する。
 * @param {object} c - 対象カード
 * @returns {boolean} アクティブスキルを保持している場合は true
 */
export function hasActiveSkill(c) {
  if (!c) return false;
  return ACTIVE_SKILLS.some((s) => hasSkill(c, s));
}

/**
 * 召喚時アクティブスキルの効果を非同期で順次発動・解決する。
 * @param {string} o - プレイヤー種別 ('blue' | 'red')
 * @param {number} l - レーンインデックス
 * @param {object} c - 対象カード
 */
export async function resolveOnPlaySkill(o, l, c) {
  // スキル実行中フラグを立てて、パワー0による即時破壊を防ぐ
  c.isSkillResolving = true;

  try {
    // 発動対象スキルのリストを作成
    let skillsToResolve = Array.isArray(c.skills) ? [...c.skills] : [];

    // 召喚時に複数のスキルがある場合は、特定のスキル（quickやchoice等）を後回しにするなどして安全な順序で処理する
    skillsToResolve.sort((a, b) => {
      const order = { quick: 100, choice: 90 }; // 数値が大きいほど後回し
      const orderA = order[a.id] || 0;
      const orderB = order[b.id] || 0;
      return orderA - orderB;
    });

    for (const sk of skillsToResolve) {
      if (ACTIVE_SKILLS.includes(sk.id)) {
        await resolveActiveSkillEffect(o, l, c, sk.id, sk.value, sk);
      }
    }

    // バッジが消える前に一呼吸置く（プレイヤーが効果を確認できるようにするため）
    await sleep(PLACE_ANIMATION_DURATION);

    // 全ての召喚時スキルが完了したらフラグを立てる（ボード上でのバッジ非表示用）
    c.skillTriggered = true;
    renderBoard();

    // スキル解決によって破壊されたカード（自分自身含む）を除去
    await cleanupDestroyedCards();
  } finally {
    // 処理が完了したらフラグを解除する
    c.isSkillResolving = false;
  }
}

/**
 * 特定のレーン単体に対する単発戦闘処理（「速攻」スキル等）を実行する。
 * @param {string} atk - 攻撃側のプレイヤー ('blue' | 'red')
 * @param {number} l - 攻撃を発生させるレーンインデックス
 */
export async function executeSingleCombat(atk, l) {
  // quick スキル等での単発攻撃に対応するための簡易ラッパー
  const state = createCombatSnapshot();

  // 特定のレーンだけ発火させるための個別処理
  const events = [];
  applySingleCombat(state, atk, l, events);

  // UI/演出の実行（イベントログ内で状態も同期更新される）
  await playEvents(events);
  await cleanupDestroyedCards();
  checkWinCondition();
}

/**
 * 戦闘フェーズ（全3レーンの順番計算・自動攻撃・直接攻撃・アニメーション演出）を実行する。
 * @param {string} atk - 攻撃側のプレイヤー ('blue' | 'red')
 */
export async function executeCombatPhase(atk) {
  // 盤面に攻撃可能なカードが1枚もなければ何もしない
  const b = atk === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  if (!b.some((x) => x !== null)) return;

  // --- ロジックの実行 (Engineの呼び出し) ---
  const currentState = createCombatSnapshot();

  // Engineで全レーンの戦闘結果をシミュレートし、イベントログを受け取る
  const events = calculateCombatPhase(currentState, atk, []);

  // --- UI/演出の実行 (Rendererの呼び出し) ---
  // 蓄積されたイベントを順番に再生（攻撃モーション、ダメージポップアップ、破壊音など）
  // イベント再生中にGameStateも連動して更新される
  await playEvents(events);

  // 整合性を取るために最終的な盤面状態を描画
  renderBoard();

  trackMissionPower(GameState);

  // 戦闘フェーズ中に破壊されたカード（トークン含む）を一括クリーニング
  await cleanupDestroyedCards();
  checkWinCondition();
}

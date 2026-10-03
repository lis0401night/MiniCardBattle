/**
 * src/game/passiveSkills.js
 * Mini Card Battle - パッシブスキル統括モジュール
 *
 * 盤面オーラ・常時効果（反転、瘴気、墓守、加護、封印等）の判定関数、
 * およびターン開始時・破壊時に発動するパッシブスキルの効果解決ロジックを集約管理します。
 */

import { CARD_MASTER } from '../../utils/constants/cards.js';
import { MAX_HAND_SIZE_DURING_TURN } from '../../utils/constants/config.js';
import {
  hasSkill,
  getSkillValue,
  isProtectedZeroPowerCard,
  getSeededRandom,
  syncCardStatuses,
} from '../../utils/gameUtils.js';
import {
  damageCard,
  damageLeader,
  getDamageBlockType,
  BLOCK_TYPE_EVENT_MAP,
  simulateDiscardCardsFromHand,
} from './core.js';
import { applyActiveSkillLogic } from './activeSkills.js';

/** 戦乙女の加護の持続カウンター（発動後、次の自分のターン開始時スキル解決完了までを1とする） */
export const VALKYRIA_GUARD_TURNS = 1;

/**
 * サイドに対応する戦乙女の加護カウンターのキー名を返す
 *
 * @param {string} side - 対象サイド ('blue' または 'red')
 * @returns {string} 状態オブジェクトのキー名
 */
export function getValkyriaGuardKey(side) {
  return side === 'blue' ? 'valkyriaGuardBlue' : 'valkyriaGuardRed';
}

/**
 * 指定サイドの戦乙女の加護状態を解除（クリア）する
 * 陣営全体の加護フラグを0にし、該当盤面にあるカードの個別加護フラグを削除してスキル枠と同期します。
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} side - 対象サイド ('blue' または 'red')
 * @returns {void}
 */
export function clearValkyriaGuard(state, side) {
  if (!state) return;
  state[getValkyriaGuardKey(side)] = 0;
  // 該当陣営の盤面にあるカードの個別加護も解除
  const board = side === 'blue' ? state.playerBoard : state.enemyBoard;
  if (board) {
    board.forEach((c) => {
      if (c && (c.valkyriaGuard || c.valkyriaGuardTurns)) {
        delete c.valkyriaGuard;
        delete c.valkyriaGuardTurns;
        syncCardStatuses(c);
      }
    });
  }
}

/**
 * 指定サイドに戦乙女の加護が有効かどうかを判定する
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} side - 'blue' または 'red'
 * @returns {boolean} ガードが有効なら true
 */
export function isValkyriaGuardActive(state, side) {
  if (!state) return false;
  return (state[getValkyriaGuardKey(side)] || 0) > 0;
}

/**
 * 発動者側に「戦乙女の加護」を付与し、VFXイベントを積む共通処理
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} owner - 発動者サイド ('blue' | 'red')
 * @param {Array<Object>} events - イベントログ配列
 * @returns {void}
 */
export function grantValkyriaGuard(state, owner, events) {
  // アンジェ「戦乙女の加護」用VFX：発動者の中央レーン固定で再生
  events.push({
    type: 'vfx_trigger',
    vfxId: 'anm_valkyria_guard',
    side: owner,
    lane: 1,
  });
  state[getValkyriaGuardKey(owner)] = VALKYRIA_GUARD_TURNS;
}

/**
 * カードがスキル・能力によって破壊・除去可能かどうかを判定する
 * （無効(immune)スキル保持、カード自身の加護、または所有者に戦乙女の加護が有効な場合は破壊不可）
 *
 * @param {Object} state - バトル状態
 * @param {Object} card - 対象カード
 * @param {string} [side=null] - 対象カードの所有者 ('blue'|'red')。省略時は card.owner
 * @returns {boolean} 破壊可能なら true、破壊無効（防護中）なら false
 */
export function canCardBeDestroyed(state, card, side = null) {
  if (!card) return false;
  if (hasSkill(card, 'immune')) return false;
  if (card.valkyriaGuard || (card.valkyriaGuardTurns || 0) > 0) return false;
  const owner = side || card.owner;
  if (owner && isValkyriaGuardActive(state, owner)) return false;
  return true;
}

/**
 * 指定レーンが封印されているかどうかを判定する共通関数
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} owner - 陣営 ('blue' | 'red')
 * @param {number} lane - レーンインデックス (0 | 1 | 2)
 * @returns {boolean} 封印されている場合は true
 */
export function isLaneSealed(state, owner, lane) {
  const sealedLanes =
    owner === 'blue' ? state?.playerSealedLanes : state?.enemySealedLanes;
  return Boolean(sealedLanes && sealedLanes[lane] > 0);
}

/**
 * 場に「墓守（grave_keeper）」スキルを持つカードが存在するか判定する
 *
 * @param {Object} state - 状態オブジェクト
 * @returns {boolean} 墓守が発動している場合は true
 */
export const isGraveKeeperActive = (state) => {
  return (
    state.playerBoard.some((c) => c && hasSkill(c, 'grave_keeper')) ||
    state.enemyBoard.some((c) => c && hasSkill(c, 'grave_keeper'))
  );
};

/**
 * 場に「瘴気（miasma）」スキルを持つカードが存在するか判定する
 *
 * @param {Object} state - 現在のゲーム状態オブジェクト
 * @returns {boolean} プレイヤーまたは敵の盤面に瘴気カードが存在する場合は true
 */
export const isMiasmaActive = (state) => {
  const pb = state?.playerBoard || [];
  const eb = state?.enemyBoard || [];
  return (
    pb.some((c) => c && hasSkill(c, 'miasma')) ||
    eb.some((c) => c && hasSkill(c, 'miasma'))
  );
};

/**
 * 場に「反転（reverse）」スキルを持つカードが存在するか判定する
 *
 * @param {Object} state - 現在のゲーム状態オブジェクト
 * @returns {boolean} プレイヤーまたは敵の盤面に反転カードが存在する場合は true
 */
export const isReverseActive = (state) => {
  const pb = state?.playerBoard || [];
  const eb = state?.enemyBoard || [];
  return (
    pb.some((c) => c && hasSkill(c, 'reverse')) ||
    eb.some((c) => c && hasSkill(c, 'reverse'))
  );
};

/**
 * 【神出】ターン開始時、空きレーンが1つのみ存在する場合に確定移動するパッシブをシミュレートする。
 *
 * @param {object} state - バトル状態オブジェクト
 * @param {Array<object|null>} b - 発動陣営の盤面配列
 * @param {object} c - 発動カードオブジェクト
 * @param {number} lane - 現在のレーンインデックス
 * @param {'blue'|'red'} side - 発動陣営
 * @param {Set<string>} teleportMovedIds - 移動済みカードUID/IDの管理セット
 * @param {Array<object>} events - イベント配列
 * @returns {number} 移動後のレーンインデックス
 */
export function handleTeleportSimulation(
  state,
  b,
  c,
  lane,
  side,
  teleportMovedIds,
  events
) {
  if (
    !hasSkill(c, 'teleport') ||
    (c.stunTurns || 0) > 0 ||
    teleportMovedIds.has(c.uid || c.id)
  ) {
    return lane;
  }

  const sealedLanes =
    side === 'blue'
      ? state.playerSealedLanes || [0, 0, 0]
      : state.enemySealedLanes || [0, 0, 0];
  const emptyLanes = [];
  for (let j = 0; j < 3; j++) {
    if (b[j] === null && sealedLanes[j] === 0) {
      emptyLanes.push(j);
    }
  }
  if (emptyLanes.length === 1) {
    const targetLane = emptyLanes[0];
    b[targetLane] = c;
    b[lane] = null;
    teleportMovedIds.add(c.uid || c.id);
    events.push({
      type: 'teleport_simulation',
      side,
      from: lane,
      to: targetLane,
      source: 'teleport',
    });
    return targetLane;
  }
  return lane;
}

/**
 * 【輪廻】指定陣営にカードを1枚ドローさせるシミュレーションヘルパー。
 *
 * @param {object} state - バトル状態オブジェクト
 * @param {'blue'|'red'} p - ドローする陣営
 * @returns {void}
 */
export function simulateDrawForSamsara(state, p) {
  const h = p === 'blue' ? state.playerHand : state.enemyHand;
  const d = p === 'blue' ? state.playerDeck : state.enemyDeck;
  const ds = p === 'blue' ? state.playerDiscard : state.enemyDiscard;

  if (!h || !d) return;
  // 手札上限は実戦の通常ドロー処理（drawCard）と同一の定数を参照
  if (h.length >= MAX_HAND_SIZE_DURING_TURN) return;

  if (d.length === 0 && ds && ds.length > 0) {
    // 墓地を戻す
    d.push(...ds);
    ds.length = 0;
    // シャッフル
    for (let k = d.length - 1; k > 0; k--) {
      const j = Math.floor(getSeededRandom() * (k + 1));
      [d[k], d[j]] = [d[j], d[k]];
    }
    // HP半減
    if (p === 'blue') {
      state.playerHP = Math.ceil(state.playerHP / 2);
    } else {
      state.enemyHP = Math.ceil(state.enemyHP / 2);
    }
  }

  if (d.length > 0) {
    const drawn = d.pop();
    if (drawn) {
      if (
        drawn.currentPower === undefined ||
        Number.isNaN(drawn.currentPower) ||
        (drawn.currentPower <= 0 && (drawn.power || 0) > 0)
      ) {
        drawn.currentPower = drawn.power || 0;
      }
      h.push(drawn);
    }
  }
}

/**
 * 【成長】ターン開始時のパワー増加パッシブをシミュレートする。
 * 反転能力が有効な場合は減少に反転します。
 *
 * @param {object} c - 対象カードオブジェクト
 * @param {number|null} skVal - スキル効果値
 * @param {'blue'|'red'} side - 発動陣営
 * @param {number} lane - 発動レーン
 * @param {Array<object>} events - イベント配列
 * @param {object} [state] - バトル状態オブジェクト
 * @returns {void}
 */
export function handleGrowthPassive(c, skVal, side, lane, events, state) {
  const isReversed = isReverseActive(state);
  const baseV = skVal ?? 1;
  const v = baseV * (isReversed ? -1 : 1);
  c.currentPower += v;
  events.push({
    type: 'power_change',
    side,
    lane,
    amount: v,
    source: 'growth',
    isReversed,
  });
}

/**
 * 【腐食】ターン開始時のパワー減少デバフをシミュレートする。
 * 反転能力が有効な場合は増加（回復）に反転します。
 *
 * @param {object} c - 対象カードオブジェクト
 * @param {number|null} skVal - スキル効果値（腐食値）
 * @param {'blue'|'red'} side - 発動陣営
 * @param {number} lane - 発動レーン
 * @param {Array<object>} events - イベント配列
 * @param {object} [state] - バトル状態オブジェクト
 * @returns {void}
 */
export function handleCorrosionPassive(c, skVal, side, lane, events, state) {
  const isReversed = isReverseActive(state);
  const baseP = skVal ?? 1;
  const pVal = baseP * (isReversed ? -1 : 1);
  c.currentPower -= pVal;
  events.push({
    type: 'power_change',
    side,
    lane,
    amount: -pVal,
    source: 'corrosion',
    isReversed,
  });
}

/**
 * 【迎撃】ターン開始時、相手の最大パワーカードを特定してダメージを与えるパッシブをシミュレートする。
 *
 * @param {object} state - バトル状態オブジェクト
 * @param {object} c - 発動カードオブジェクト
 * @param {number|null} skVal - スキル効果値（ダメージ値）
 * @param {'blue'|'red'} side - 発動陣営
 * @param {number} lane - 発動レーン
 * @param {Array<object>} events - イベント配列
 * @returns {void}
 */
export function handleInterceptPassive(state, c, skVal, side, lane, events) {
  const dmg = skVal || 2;
  const eB = side === 'blue' ? state.enemyBoard : state.playerBoard;
  const oppSide = side === 'blue' ? 'red' : 'blue';
  let maxL = -1,
    maxP = -1;
  for (let j = 0; j < 3; j++) {
    if (eB[j]) {
      const p = eB[j].currentPower;
      // 同値の場合は左（jが小さい方）を優先するため、> を使用
      if (p > maxP) {
        maxP = p;
        maxL = j;
      }
    }
  }
  if (maxL !== -1) {
    events.push({
      type: 'skill_popup',
      side,
      lane,
      skillName: '迎撃',
    });
    const blockType = getDamageBlockType(eB[maxL], dmg, true, state, oppSide);
    if (!blockType) {
      eB[maxL].currentPower -= dmg;
      events.push({
        type: 'damage_card',
        side: oppSide,
        lane: maxL,
        amount: dmg,
        source: 'intercept',
      });
    } else if (blockType === 'valkyria_guard') {
      events.push({
        type: 'valkyria_guard_block',
        side: oppSide,
        lane: maxL,
        amount: dmg,
        source: 'intercept',
      });
    } else {
      events.push({
        type: BLOCK_TYPE_EVENT_MAP[blockType] || `${blockType}_block`,
        side: oppSide,
        lane: maxL,
        source: 'intercept',
      });
    }
  }
}

/**
 * 【契約】ターン開始時の自傷ダメージパッシブをシミュレートする。
 *
 * @param {object} state - バトル状態オブジェクト
 * @param {number|null} skVal - スキル効果値（ダメージ値）
 * @param {'blue'|'red'} side - 発動陣営
 * @param {boolean} skipContract - 契約ダメージのスキップフラグ
 * @param {Array<object>} events - イベント配列
 * @returns {void}
 */
export function handleContractPassive(state, skVal, side, skipContract, events) {
  if (skipContract) return;
  const v = skVal || 3;
  damageLeader(state, side, v, 'contract', events);
}

/**
 * 【輪廻】ターン開始時、お互いの手札を全て破棄し、お互いにカードを3枚引くパッシブスキルをシミュレートする。
 *
 * @param {object} state - ゲーム状態またはシミュレーション状態オブジェクト
 * @param {'blue'|'red'} side - 発動カードの所有陣営
 * @param {number} lane - 発動カードのレーン番号（0〜2）
 * @param {Array<object>} events - 追加先イベント配列
 * @returns {void}
 */
export function handleSamsaraPassive(state, side, lane, events) {
  // 1. お互いの手札を全て捨てる
  for (const p of ['blue', 'red']) {
    const h = p === 'blue' ? state.playerHand : state.enemyHand;
    const dropped = h ? h.splice(0, h.length) : [];
    simulateDiscardCardsFromHand(state, p, dropped, events);
  }

  // 2. お互いに3枚引く
  for (let k = 0; k < 3; k++) {
    simulateDrawForSamsara(state, 'blue');
  }
  for (let k = 0; k < 3; k++) {
    simulateDrawForSamsara(state, 'red');
  }

  events.push({
    type: 'samsara_trigger',
    side,
    lane,
    source: 'samsara',
  });
}

/**
 * 【覚醒】ターン開始時、同レーンに覚醒先トークンを配置（Place）するパッシブをシミュレートする。
 * レーンが封印されている場合は不発（保留）とする。
 *
 * @param {object} state - バトル状態オブジェクト
 * @param {object} c - 発動カードオブジェクト
 * @param {object|string} sk - スキル定義オブジェクトまたはID
 * @param {string} skId - スキルID ('awake' | 'awake_legendary')
 * @param {number|null} skVal - スキル効果値
 * @param {'blue'|'red'} side - 発動陣営
 * @param {number} lane - 発動レーン
 * @param {Array<object>} events - イベント配列
 * @returns {boolean} カードが置換された場合（発動成功時）は true、封印等で発動しなかった場合は false
 */
export function handleAwakePassive(state, c, sk, skId, skVal, side, lane, events) {
  if (isLaneSealed(state, side, lane)) {
    // 封印されたレーンでは覚醒は不発（保留）となり、元のカードのまま場に留まる
    return false;
  }
  const currentAwakeSkillId = skId;
  const v = skVal || 1;
  const awakeSkill = typeof sk === 'object' ? sk : null;
  const summonId =
    awakeSkill?.summonId ||
    (currentAwakeSkillId === 'awake_legendary'
      ? 'token_thebeast'
      : 'token_dragon');

  // 同レーンにトークンを配置（Place）
  events.push({
    type: 'awake_trigger',
    side,
    lane,
    card: c,
    summonId,
    value: v,
  });
  applyActiveSkillLogic(
    state,
    side,
    lane,
    currentAwakeSkillId,
    v,
    events,
    [],
    lane
  );
  return true;
}

/**
 * 破壊されたカードのクリーンアップと、破壊時スキルの処理を行う共通関数
 * （分裂 split、自爆 explode、報復 retaliate 等の破壊時パッシブを解決）
 *
 * @param {object} state - バトル状態オブジェクト
 * @param {Array<object>} events - イベント配列
 * @returns {boolean} 1体でもカードが破壊された場合は true
 */
export function processDestructionTriggers(state, events) {
  let anyDestroyedAtAll = false;
  let anyDestroyed = true;
  while (anyDestroyed) {
    anyDestroyed = false;
    let destroyedThisLoop = [];
    let tokensToSummonThisLoop = [];
    const targets = [
      { board: state.playerBoard, side: 'blue' },
      { board: state.enemyBoard, side: 'red' },
    ];

    targets.forEach(({ board, side }) => {
      for (let i = 0; i < 3; i++) {
        if (
          board[i] &&
          board[i].currentPower <= 0 &&
          !isProtectedZeroPowerCard(board[i])
        ) {
          const deadCard = board[i];
          destroyedThisLoop.push({ side, lane: i, card: deadCard });

          board[i] = null;
          anyDestroyed = true;
          anyDestroyedAtAll = true;

          // 分裂(split)
          if (hasSkill(deadCard, 'split')) {
            const sealedLanes =
              side === 'blue'
                ? state.playerSealedLanes
                : state.enemySealedLanes;
            if (!sealedLanes || sealedLanes[i] === 0) {
              const tokenId =
                deadCard.summonId ||
                deadCard.skills?.find((s) => s.id === 'split')?.summonId ||
                'token_legs'; // 安全のためのフォールバック値
              const tL = CARD_MASTER.find((m) => m.id === tokenId) || {
                name: 'トークン',
                power: 1,
              };
              const val = getSkillValue(deadCard, 'split') || tL.power || 2;

              tokensToSummonThisLoop.push({
                side,
                lane: i,
                card: {
                  ...JSON.parse(JSON.stringify(tL)),
                  id: `sp_${Math.floor(getSeededRandom() * 1000000000)}_${i}_${getSeededRandom().toString(36).substr(2, 5)}`,
                  baseId: tokenId,
                  owner: side,
                  imgUrl: `assets/cards/card_${tokenId}.webp`,
                  power: val,
                  currentPower: val,
                  basePower: val,
                  rarity: tL.rarity || 1,
                },
              });
            }
          }

          // 誘爆(explode)
          if (hasSkill(deadCard, 'explode')) {
            const dmg = getSkillValue(deadCard, 'explode') || 3;
            [i - 1, i + 1].forEach((adj) => {
              if (adj >= 0 && adj < 3 && board[adj]) {
                damageCard(state, side, adj, dmg, 'explode', events, true);
              }
            });
          }
        }
      }
    });

    if (destroyedThisLoop.length > 0) {
      events.push({ type: 'destroy_cards', targets: destroyedThisLoop });

      // 報復（retaliate）スキル: 味方カードが破壊された時、同陣営の生存カードのパワーを上昇させる
      const isReversed = isReverseActive(state);
      destroyedThisLoop.forEach(({ side }) => {
        const alliedBoard =
          side === 'blue' ? state.playerBoard : state.enemyBoard;
        alliedBoard.forEach((allyCard, j) => {
          if (allyCard && hasSkill(allyCard, 'retaliate')) {
            let buffVal = getSkillValue(allyCard, 'retaliate') || 2;
            if (isReversed) buffVal = -buffVal;
            allyCard.currentPower += buffVal;
            events.push({
              type: 'power_change',
              side,
              lane: j,
              amount: buffVal,
              source: 'retaliate',
              isReversed,
            });
          }
        });
      });
    }
    tokensToSummonThisLoop.forEach((t) => {
      const tgtBoard = t.side === 'blue' ? state.playerBoard : state.enemyBoard;
      if (!tgtBoard[t.lane]) {
        tgtBoard[t.lane] = t.card;
        events.push({
          type: 'summon_token',
          side: t.side,
          lane: t.lane,
          card: JSON.parse(JSON.stringify(t.card)),
          source: 'split',
        });
      }
    });
  }
  return anyDestroyedAtAll;
}

/**
 * ターン開始パッシブスキルの統括適用関数
 *
 * @param {object} state - バトル状態オブジェクト
 * @param {'blue'|'red'} side - ターンを開始する陣営
 * @param {boolean} [skipContract=false] - 契約スキルの自傷スキップフラグ
 * @param {Array<object>} [events=[]] - イベント配列
 * @returns {Array<object>} events
 */
export function applyPassiveSkillLogic(
  state,
  side,
  skipContract = false,
  events = []
) {
  // シミュレーション用のクリーンアップと誘爆の処理
  processDestructionTriggers(state, events);

  const b = side === 'blue' ? state.playerBoard : state.enemyBoard;
  const teleportMovedIds = new Set();
  const processedCards = new Set();
  for (let i = 0; i < 3; i++) {
    const c = b[i];
    if (!c || processedCards.has(c)) continue;

    // 神出 (teleport): 空きレーンが1つの時に確定移動をシミュレート
    const activeLane = handleTeleportSimulation(
      state,
      b,
      c,
      i,
      side,
      teleportMovedIds,
      events
    );
    processedCards.add(c);

    // スキルおよび状態の時系列スロット順（付与順）に順次解決
    const cardSkills = Array.isArray(c.skills) ? [...c.skills] : [];

    for (const sk of cardSkills) {
      if (!sk) continue;
      const skId = typeof sk === 'string' ? sk : sk.id;
      const skVal =
        typeof sk === 'object' && sk.value !== undefined ? sk.value : null;

      if (skId === 'growth') {
        handleGrowthPassive(c, skVal, side, activeLane, events, state);
      } else if (skId === 'corrosion') {
        handleCorrosionPassive(c, skVal, side, activeLane, events, state);
      } else if (skId === 'intercept') {
        handleInterceptPassive(state, c, skVal, side, activeLane, events);
      } else if (skId === 'contract') {
        handleContractPassive(state, skVal, side, skipContract, events);
      } else if (skId === 'samsara') {
        handleSamsaraPassive(state, side, activeLane, events);
      } else if (skId === 'awake' || skId === 'awake_legendary') {
        const replaced = handleAwakePassive(
          state,
          c,
          sk,
          skId,
          skVal,
          side,
          activeLane,
          events
        );
        if (replaced) break;
      }
    }
  }

  // ターン開始時効果による死亡（腐食、契約、迎撃など）をクリーンアップ
  processDestructionTriggers(state, events);

  return events;
}

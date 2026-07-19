import { getIsHost } from '../services/multiplayer.js';
import {
  playSummonAnimation,
  renderBoard,
  renderHand,
  showSpeechBubble,
  updateDeckDisplay,
  updateHPBar,
} from '../services/uiBattle.js';
import { GameState } from '../state/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import {
  AI_THINKING_DURATION,
  PLACE_ANIMATION_DURATION,
} from '../utils/constants/config.js';
import { ACTIVE_SKILLS, PASSIVE_SKILLS } from '../utils/constants/skills.js';
import { playCardVoice } from '../utils/constants/voices.js';
import {
  consumeArmSelf,
  createDamagePopup,
  getCardImgUrl,
  getOrCreateUUID,
  getSeededRandom,
  getSkillValue,
  hasSkill,
  mergeCardSkills,
  playSound,
  shuffleArray,
  sleep,
  triggerGraveKeeperEffect,
  unmergeCardSkills,
} from '../utils/gameUtils.js';
import { SOUNDS, playSkillSound } from '../utils/sounds.js';
import {
  canEquipCard,
  checkWinCondition,
  cleanupDestroyedCards,
  confirmOverwrittenLane, // 【追加】根本的リファクタリング用
  consumeAIAction,
  discardCard,
  drawCard,
  executeSingleCombat,
  hasActiveSkill,
  playCard,
  resolveOnPlaySkill,
  waitPlayerAlliedLaneSelection,
  waitPlayerDiscardSelection,
  waitPlayerDualDiscardSelection,
  waitPlayerEnemyLaneSelection,
  waitPlayerHandSelection,
  waitPlayerLaneSelection,
  waitSkillChoice,
} from './battle.js';
import { applyActiveSkillLogic, canTakeDamage } from './engine.js';
import { playEvents } from './eventRenderer.js';
import { hideMessage, showMessage } from './tutorialEngine.js';

/**
 * Mini Card Battle - Skill Implementation Logic
 * 分割されたスキル実行ロジック
 *
 * =========================================================================
 * 【開発ガイドライン：新規アクティブスキルを追加・更新する際の実装統一ルール】
 *
 * 演出（VFXエフェクトや固有SE）を伴うアクティブスキルを追加する際は、以下の構成に従ってください。
 *
 * 1. 実画面での適用と演出（実プレイ時）
 *    - 実プレイ時の演出と処理は、この「src/game/skillLogic.js」内の
 *      「resolveActiveSkillEffect」の個別ロジック分岐（else if 分岐）で行います。
 *    - その中で直接「window.triggerVfx(...)」を呼び出し、実際の盤面状態やHP等の更新、
 *      およびReact UIの更新（updateCardVisualsReact 等）をその場で一貫して記述します。
 *    - 重複するポップアップや共通のSEを防ぐため、必要に応じて「EXCLUDE_POPUP_SKILLS」や
 *      「playSkillSound」の除外対象リストへ追加します。
 *
 * 2. シミュレーション（AI思考時）
 *    - AIの思考シミュレーション用の処理は、「src/game/engine.js」内の
 *      「applyActiveSkillLogic」で行います。
 *    - シミュレーション用の処理では、描画（VFX、DOM、React等）に一切依存せず、
 *      演出イベント（vfx_trigger等）も一切積まずに、純粋な状態データのみを更新するようにします。
 *
 * ※注意：石化（petrify）、英雄（hero）、逆境（adversity）、代償（sacrifice）は
 *   上記設計（パターンA：直接トリガー型）に統一されています。
 * =========================================================================
 */

/**
 * 複数の対象カードを一括して破壊（無効化、アニメーション、墓地送り）する共通処理。
 * @param {Array<{lane: number, card: Object, side: string}>} targets
 */
async function executeGroupDestruction(targets) {
  if (targets.length === 0) return;

  let anyValidTarget = false;
  let playedVoices = new Set();
  for (let t of targets) {
    const sidePrefix = t.side === 'blue' ? 'player' : 'enemy';
    const tgtEl = document.querySelector(
      `#${sidePrefix}-lanes .cell[data-lane="${t.lane}"] .card`
    );

    if (hasSkill(t.card, 'immune')) {
      // 「無効」を持つカードは破壊されない
      if (tgtEl) {
        createDamagePopup(tgtEl, '無効', '#94a3b8');
      }
    } else {
      // React State経由でアニメーションクラスを付与
      t.card.animClass = 'anim-shake anim-card-destroy';

      if (tgtEl) {
        createDamagePopup(tgtEl, '破壊', '#ef4444');
      }
      if (t.card.voiceCategory && !playedVoices.has(t.card.voiceCategory)) {
        playCardVoice(t.card, 'death');
        playedVoices.add(t.card.voiceCategory);
      }
      anyValidTarget = true;
    }
  }

  // アニメーション表示のために再描画
  renderBoard();

  if (anyValidTarget) {
    playSound(SOUNDS.seDestroy);
  }
  await sleep(400); // 破壊または無効演出待ち

  for (let t of targets) {
    if (!hasSkill(t.card, 'immune')) {
      const eB =
        t.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
      if (!(await discardCard(t.side, t.card, t.lane, true))) eB[t.lane] = null;
    }
  }
  renderBoard();
  await sleep(500);
  // 墓地送り完了後はカードが盤面から消去されるため、DOM操作でのクリーンアップは不要です
}

export async function resolveActiveSkillEffect(
  o,
  l,
  c,
  skillId,
  skillValue,
  skObj = null
) {
  const cEl = document.querySelector(
    `#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`
  );

  // 演出用のポップアップと音（一括した基本演出）
  // 演出用のポップアップと音（一括した基本演出）
  // ※ すでに個別ロジック内で個別の色やタイミングで createDamagePopup を実行しているスキルは除外する
  const EXCLUDE_POPUP_SKILLS = [
    'draw',
    'shuffle',
    'fate',
    'toxic',
    'bind',
    'freeze',
    'loss',
    'burial',
    'recurse',
    'bless',
    'call',
    'reinforce',
    'metamorph',
    'petrify',
    'sacrifice',
    'sacrifice_void',
    'heal',
    'heal_void',
  ];

  if (ACTIVE_SKILLS.includes(skillId)) {
    // VFX演出を持つスキルは、VFX側で効果音（se）が再生されるため、ここでの重複再生を無効化する
    if (
      ![
        'hero',
        'adversity',
        'toxic',
        'freeze',
        'bind',
        'seal',
        'snipe',
        'snipe_void',
        'spread',
        'spread_void',
        'artillery',
        'dominate',
        'heal',
        'heal_void',
        'metamorph',
        'petrify',
        'sacrifice',
        'sacrifice_void',
        'cull',
        'execute',
        'call',
      ].includes(skillId)
    ) {
      playSkillSound(skillId);
    }
    const labels = {
      support: '援護',
      hero: '英雄',
      lone_wolf: '単騎',
      morph: '変化',
      spread: '拡散',
      snipe: '狙撃',
      berserk: '狂乱',
      heal: '回復',
      charge: '充填',
      sacrifice: '代償',
      sacrifice_void: '代償(虚)',
      soul_bind: '魂縛',
      soul_bind_void: '魂縛(虚)',
      quick: '速攻',
      oblivion: '沈黙',
      choice: '選択',
      artillery: '砲撃',
      decree: '宣告',
      standby: '待機',
      resurrect: '復活',
      summon: '召喚',
      ambush: '奇襲',
      clone: '分身',
      salvage: '回収',
      dispel: '解除',
      seal: '結界',
      crush: '粉砕',
      treason: '反逆',
      adversity: '逆境',
      double_power: '倍化',
      invite: '招来',
      decay: '減衰',
      puppet: '傀儡',
      leap: '跳躍',
      chant: '詠唱',
      forge: '鍛造',
      explore: '探索',
      cull: '選別',
      execute: '処刑',
      dominate: '支配',
      sublimation: '昇華',
      snipe_void: '狙撃(虚)',
      heal_void: '回復(虚)',
      spread_void: '拡散(虚)',
      support_void: '援護(虚)',
      call: '号令',
      bless: '祝福',
      draw: '入替',
      spend: '消費',
      stealth: '潜伏',
      force: '命令',
      metamorph: '変身',
      shuffle: '攪乱',
      fate: '運命',
      reinforce: '増援',
      toxic: '有毒',
      convert: '対価',
      invade: '侵略',
      petrify: '石化',
      freeze: '凍結',
      loss: '喪失',
      burial: '埋葬',
      recurse: '再帰',
      replicate: '複製',
      hack: '改竄',
      grant_deadly: '付与(必殺)',
      grant_sturdy: '付与(頑丈)',
    };
    if (!EXCLUDE_POPUP_SKILLS.includes(skillId)) {
      if (cEl) createDamagePopup(cEl, labels[skillId] || 'スキル', '#facc15');
      await sleep(200); // Popupを見せる間
    }
  }

  // --- ロジックの実行 (Engineの呼び出し) ---
  const currentState = {
    playerBoard: GameState.playerBoard.map((c) =>
      c ? JSON.parse(JSON.stringify(c)) : null
    ),
    enemyBoard: GameState.enemyBoard.map((c) =>
      c ? JSON.parse(JSON.stringify(c)) : null
    ),
    playerHP: GameState.playerHP,
    enemyHP: GameState.enemyHP,
    playerSP: GameState.playerSP,
    enemySP: GameState.enemySP,
    playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
    enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
    playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
    enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard)),
    playerConfig: GameState.playerConfig,
    enemyConfig: GameState.enemyConfig,
  };

  // 特殊な選択が必要なスキルは個別に扱う (draw, clone, quick, choice, metamorph等)
  if (skillId === 'invite' || skillId === 'chant') {
    let selectedIdx = -1;
    let selectedLane = -1;
    const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;

    // 【詠唱】パワー制限値（招来は制限なし）
    const maxPower = skillId === 'chant' ? (skillValue ?? 3) : Infinity;
    // 【招来】同じレーンのみ、【詠唱】全レーン候補
    const isInvite = skillId === 'invite';

    // パワー制限チェック
    const meetsMaxPower = (card) => {
      if (maxPower === Infinity) return true;
      return (card.power || 0) <= maxPower;
    };

    if (
      o === 'red' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'pvp'
    ) {
      // 【AIの場合】actionQueueからアクションを消費
      let actionIdx = -1;
      if (GameState.aiDecision && GameState.aiDecision.actionQueue) {
        actionIdx = GameState.aiDecision.actionQueue.findIndex(
          (a) => a.type === skillId
        );
      }
      console.log(
        `[AI Chant/Invite] skillId=${skillId}, hasQueue=${!!GameState.aiDecision?.actionQueue}, queueLen=${GameState.aiDecision?.actionQueue?.length ?? 0}, foundAt=${actionIdx}`
      );
      if (actionIdx !== -1) {
        const action = GameState.aiDecision.actionQueue[actionIdx];
        selectedLane = isInvite ? l : (action.laneIdx ?? l);

        // uid優先で手札からカードを検索（インデックスズレを防止）
        if (action.targetUid) {
          selectedIdx = h.findIndex(
            (card) =>
              card &&
              (card.uid === action.targetUid || card.id === action.targetUid)
          );
        }
        // uidで見つからない場合はインデックスにフォールバック
        if (
          selectedIdx === -1 &&
          action.targetIdx !== undefined &&
          action.targetIdx < h.length
        ) {
          selectedIdx = action.targetIdx;
        }
        console.log(
          `[AI Chant/Invite] targetUid=${action.targetUid}, targetIdx=${action.targetIdx}, resolved=${selectedIdx}, lane=${selectedLane}, actionLaneIdx=${action.laneIdx}, parentLane=${l}, hand=[${h.map((c, i) => `${i}:${c?.name}(uid:${c?.uid},id:${c?.id})`).join(', ')}]`
        );
        console.log(`[AI Chant/Invite] Full action:`, JSON.stringify(action));

        // 実行時のパワー制限チェック（シミュレーション時と手札が変わっている可能性がある）
        if (
          selectedIdx >= 0 &&
          selectedIdx < h.length &&
          !meetsMaxPower(h[selectedIdx])
        ) {
          console.log(
            `[AI Chant/Invite] Power check failed: ${h[selectedIdx].name}(P:${h[selectedIdx].power}) > maxPower(${maxPower}). Skipping.`
          );
          selectedIdx = -1;
        }

        GameState.aiDecision.actionQueue.splice(actionIdx, 1);
        if (action.cardTokenLanes) {
          if (!GameState.aiDecision.cardTokenLanes) {
            GameState.aiDecision.cardTokenLanes = [];
          }
          // 既存のレーン情報を破壊しないように先頭に追加
          GameState.aiDecision.cardTokenLanes = [
            ...action.cardTokenLanes,
            ...GameState.aiDecision.cardTokenLanes,
          ];
        }

        if (action.choices !== undefined || action.choices2 !== undefined) {
          if (!GameState.aiDecision.choiceIndexQueue)
            GameState.aiDecision.choiceIndexQueue = [];
          if (action.choices !== undefined)
            GameState.aiDecision.choiceIndexQueue.push(action.choices);
          if (action.choices2 !== undefined)
            GameState.aiDecision.choiceIndexQueue.push(action.choices2);
        }
      } else {
        selectedIdx = -1;
        console.log(
          `[AI Chant/Invite] No action found. queue=`,
          JSON.stringify(GameState.aiDecision?.actionQueue)
        );
      }
    } else {
      // 【プレイヤーの場合】
      // 1) パワー制限を満たすカードが手札にあるか確認
      const hasPlayableCard = h.some((card) => meetsMaxPower(card));
      if (hasPlayableCard) {
        let success = false;
        while (!success) {
          // 手札からカードを選択
          const promptMsg =
            skillId === 'chant'
              ? `パワー${maxPower}以下のカードを1枚まで選んでください`
              : '召喚するカードを1枚まで選んでください';
          let arr = await waitPlayerHandSelection(1, o, false, promptMsg);
          if (!arr || arr.length === 0) {
            break; // キャンセル
          }
          const sIdx = arr[0];
          const pickedCard = h[sIdx];

          // パワー制限チェック
          if (!meetsMaxPower(pickedCard)) {
            if (typeof window.showAlertModal === 'function') {
              window.showAlertModal(
                `パワー${maxPower}以下のカードのみ召喚できます。`
              );
            }
            await sleep(500);
            continue;
          }

          // 2) レーン選択（ハイライト表示付き）
          //    招来: 同じレーンのみ候補 / 詠唱: 全レーン候補
          const restrictLanes = isInvite ? [l] : null;
          GameState.placementMessage = isInvite
            ? `招来: 「${pickedCard.name}」を召喚するレーンを選んでください`
            : `詠唱: 「${pickedCard.name}」を召喚するレーンを選んでください`;
          const lanes = await waitPlayerLaneSelection(
            1,
            o,
            pickedCard,
            false, // isLeaderSkill
            restrictLanes, // tokenLanes（招来: 同じレーンのみ）
            true, // checkConstraints（制約チェック有効）
            true, // canCancel（キャンセル可能）
            'キャンセル'
          );
          GameState.placementMessage = null;

          if (lanes && lanes.length > 0) {
            // 根本的リファクタリング：招来・詠唱による上書き配置時も、合体・装備・破棄の確認モーダルを一貫して表示する
            const proceed = await confirmOverwrittenLane(
              o,
              pickedCard,
              lanes[0],
              true // 招来・詠唱は「召喚」扱いのため、制約チェックは true
            );
            if (!proceed) {
              // React の再レンダリング競合を防止するためディレイを挟む
              await sleep(200);
              // キャンセルされた場合は手札選択からやり直す
              continue;
            }
            selectedIdx = sIdx;
            selectedLane = lanes[0];
            success = true;
          } else {
            // React の再レンダリング競合を防止するためディレイを挟む
            await sleep(200);
            // レーン選択キャンセル → 手札選択からやり直し
            continue;
          }
        }
      }
    }

    if (selectedIdx !== -1 && selectedLane !== -1) {
      // 虚空トークンを手札に追加（playCardの前に追加し、召喚時スキル発動前に手札にある状態にする）
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      const voidToken = {
        ...voidTpl,
        id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_${skillId}`,
        uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_void${skillId}`,
        baseId: 'token_void',
        filter: voidTpl.filter,
        power: voidTpl.power,
        currentPower: voidTpl.power,
        basePower: voidTpl.power,
        voiceCategory: voidTpl.voiceCategory || 'stone',
        isToken: true,
        isMorphToken: true,
      };
      const currentHand =
        o === 'blue' ? GameState.playerHand : GameState.enemyHand;
      currentHand.push(voidToken);
      renderHand();
      await sleep(300);

      await playCard(o, selectedIdx, selectedLane);
    }
    return;
  }

  if (skillId === 'forge') {
    let selectedIdx = -1;
    let selectedLane = -1;
    const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
    const b = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

    const isArmSelfLanes = [];
    const isOccupiedLanes = [];
    b.forEach((c, idx) => {
      if (c) {
        isOccupiedLanes.push(idx);
        if (hasSkill(c, 'arm_self')) isArmSelfLanes.push(idx);
      }
    });

    const isValidHandCard = (card) => {
      if (hasSkill(card, 'equip')) return isOccupiedLanes.length > 0;
      return isArmSelfLanes.length > 0;
    };

    if (
      o === 'red' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'pvp'
    ) {
      let actionIdx = -1;
      if (GameState.aiDecision && GameState.aiDecision.actionQueue) {
        actionIdx = GameState.aiDecision.actionQueue.findIndex(
          (a) => a.type === skillId
        );
      }
      if (actionIdx !== -1) {
        const aiAction = GameState.aiDecision.actionQueue[actionIdx];
        selectedLane = aiAction.laneIdx;
        if (aiAction.targetUid) {
          selectedIdx = h.findIndex(
            (card) =>
              card &&
              (card.uid === aiAction.targetUid ||
                card.id === aiAction.targetUid)
          );
        }
        if (
          selectedIdx === -1 &&
          aiAction.targetIdx !== undefined &&
          aiAction.targetIdx < h.length
        ) {
          selectedIdx = aiAction.targetIdx;
        }
        if (selectedIdx >= 0 && !isValidHandCard(h[selectedIdx]))
          selectedIdx = -1;
        GameState.aiDecision.actionQueue.splice(actionIdx, 1);
      }
    } else {
      const hasPlayableCard = h.some((card) => isValidHandCard(card));
      if (hasPlayableCard) {
        let success = false;
        while (!success) {
          const arr = await waitPlayerHandSelection(
            1,
            o,
            false,
            '召喚するカードを1枚まで選んでください'
          );
          if (!arr || arr.length === 0) break;

          const sIdx = arr[0];
          const pickedCard = h[sIdx];

          if (!isValidHandCard(pickedCard)) {
            if (typeof window.showAlertModal === 'function') {
              window.showAlertModal(
                hasSkill(pickedCard, 'equip')
                  ? '装備できるレーンがありません。'
                  : '「武装」を持つカードのレーンにのみ召喚できます。'
              );
            }
            await sleep(500);
            continue;
          }

          const restrictLanes = hasSkill(pickedCard, 'equip')
            ? isOccupiedLanes
            : isArmSelfLanes;
          const lanes = await waitPlayerLaneSelection(
            1,
            o,
            pickedCard,
            false,
            restrictLanes,
            true,
            true,
            'キャンセル'
          );

          if (lanes && lanes.length > 0) {
            selectedIdx = sIdx;
            selectedLane = lanes[0];
            success = true;
          }
        }
      }
    }

    if (selectedIdx !== -1 && selectedLane !== -1) {
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      const voidToken = {
        ...voidTpl,
        id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_${skillId}`,
        uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_void${skillId}`,
        baseId: 'token_void',
        filter: voidTpl.filter,
        power: voidTpl.power,
        currentPower: voidTpl.power,
        basePower: voidTpl.power,
        voiceCategory: voidTpl.voiceCategory || 'stone',
        isToken: true,
        isMorphToken: true,
      };
      h.push(voidToken);
      renderHand();
      await sleep(300);

      await playCard(o, selectedIdx, selectedLane);
    }
    return;
  }

  // 【跳躍】追加ターンを1回付与（SPなし・攻撃なし）
  if (skillId === 'leap') {
    GameState.extraTurnCount = (GameState.extraTurnCount || 0) + 1;
    GameState.attackSkipCount = (GameState.attackSkipCount || 0) + 1;
    return;
  }

  if (skillId === 'metamorph') {
    // 全マスタカード（トークン除く）からランダムに1枚選択
    const validMasters = CARD_MASTER.filter((c) => !c.isToken);
    const randomMaster =
      validMasters[Math.floor(getSeededRandom() * validMasters.length)];

    // 演出
    playSkillSound(skillId);
    if (cEl) {
      createDamagePopup(cEl, '変身', '#facc15');
      cEl.classList.add('anim-shake');
      await sleep(300);
    }

    // 元のIDを保持（破壊時に戻る用）
    if (!c.originalCardId) c.originalCardId = 'baldanders';

    // 性能の上書き
    c.name = randomMaster.name;
    c.power = randomMaster.power;
    c.currentPower = randomMaster.power;
    c.basePower = randomMaster.power;
    c.skills = randomMaster.skills
      ? JSON.parse(JSON.stringify(randomMaster.skills))
      : [];
    c.choices = randomMaster.choices
      ? JSON.parse(JSON.stringify(randomMaster.choices))
      : [];
    c.choices2 = randomMaster.choices2
      ? JSON.parse(JSON.stringify(randomMaster.choices2))
      : null;
    c.rarity = randomMaster.rarity;

    // イラストの決定（トークン等の特殊なマッピングを考慮）
    let imgUrl = randomMaster.imgUrl;
    if (!imgUrl) {
      if (randomMaster.id === 'token_knight')
        imgUrl = 'assets/cards/card_token_knight.webp';
      else if (randomMaster.id === 'token_ignis') {
        // オーナーがイグニス（dragon）をリーダーとして使用している場合のみスキン画像を参照する
        // イグニス以外のリーダー使用時はスキン情報が存在しないため、デフォルト画像にフォールバック
        const isPlayingAsDragon =
          o === 'blue'
            ? GameState.playerConfig?.id === 'dragon'
            : GameState.enemyConfig?.id === 'dragon';
        if (isPlayingAsDragon) {
          const dragonConfig = CHARACTERS['dragon'];
          const skinId =
            o === 'blue'
              ? GameState.playerSkins?.['dragon'] || 'default'
              : GameState.enemySkins?.['dragon'] || 'default';
          imgUrl =
            getSkinImage(dragonConfig, skinId, 'image') ||
            'assets/characters/char_dragon.webp';
        } else {
          imgUrl = 'assets/characters/char_dragon.webp';
        }
      } else if (randomMaster.id === 'token_satan')
        imgUrl = 'assets/characters/char_satan.webp';
      else imgUrl = `assets/cards/card_${randomMaster.id}.webp`;
    }
    c.imgUrl = imgUrl;

    c.flavor = randomMaster.flavor;
    c.voiceCategory = randomMaster.voiceCategory;

    // 見た目の更新
    renderBoard();
    await sleep(500);

    // 変身後のカードが召喚時スキルを持っていれば発動
    if (hasActiveSkill(c)) {
      await resolveOnPlaySkill(o, l, c);
    }
    await cleanupDestroyedCards(c);
    return;
  }

  if (skillId === 'choice' || skillId === 'force') {
    const baseChoices =
      skObj && skObj._sourceChoices ? skObj._sourceChoices : c.choices;
    const baseChoices2 =
      skObj && skObj._sourceChoices2 ? skObj._sourceChoices2 : c.choices2;
    const choices =
      skObj && skObj.choiceGroup === 2 ? baseChoices2 : baseChoices;

    const adjustedValue = Math.min(
      skillValue || 1,
      choices ? choices.length : skillValue || 1
    );

    let choiceArray;
    if (skillId === 'force') {
      const oppOwner = o === 'blue' ? 'red' : 'blue';
      choiceArray = await waitSkillChoice(
        choices,
        oppOwner,
        c,
        adjustedValue,
        true
      );
    } else {
      choiceArray = await waitSkillChoice(choices, o, c, adjustedValue, false);
    }
    if (choiceArray) {
      const arr = Array.isArray(choiceArray) ? choiceArray : [choiceArray];

      // 【命令スキルの根本治療】
      // プレイヤーが選んだ選択肢のインデックスを特定し、AIのアクション予定ブランチを切り替える
      if (
        skillId === 'force' &&
        GameState.aiDecision &&
        GameState.aiDecision.branches
      ) {
        const selectedIndices = [];
        arr.forEach((ch) => {
          const idx = choices.findIndex(
            (cOpt) => cOpt && cOpt.id === ch.id && cOpt.value === ch.value
          );
          if (idx !== -1) selectedIndices.push(idx);
        });

        const branchKey = selectedIndices.sort((a, b) => a - b).join(',');
        let foundBranch = GameState.aiDecision.branches[branchKey];
        if (!foundBranch) {
          // 部分一致（複数選択などで前方一致するもの）を探す
          const matchingKey = Object.keys(GameState.aiDecision.branches).find(
            (k) => k === branchKey || k.startsWith(branchKey + '|')
          );
          if (matchingKey) {
            foundBranch = GameState.aiDecision.branches[matchingKey];
          }
        }

        if (foundBranch) {
          console.log(
            `[AI Decision Branch Switch] Switched to branch key: ${branchKey}`
          );
          console.log(
            `[AI Decision Branch Switch] foundBranch details: ${JSON.stringify(foundBranch)}`
          );
          GameState.aiDecision.actionQueue = JSON.parse(
            JSON.stringify(foundBranch.actionQueue)
          );
          GameState.aiDecision.cardTokenLanes = [
            ...(foundBranch.cardTokenLanes || []),
          ];
          GameState.aiDecision.choiceIndexQueue = [
            ...(foundBranch.choiceIndexQueue || []),
          ];
        }
      }

      for (const choice of arr) {
        // もしパッシブスキル（機能が場に留まるスキル）を選んだ場合はカード自身に永続付与する
        if (PASSIVE_SKILLS.includes(choice.id)) {
          if (!Array.isArray(c.skills)) c.skills = [];
          c.skills.push({ id: choice.id, value: choice.value });
          renderBoard(); // UI反映
        }
        // 選択されたスキルを順に実行
        await resolveActiveSkillEffect(
          o,
          l,
          c,
          choice.id,
          choice.value,
          choice
        );
      }
    }
    return;
  }

  if (skillId === 'draw') {
    const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
    const count = skillValue || 1;
    playSkillSound(skillId);
    createDamagePopup(cEl, '入替', '#facc15');
    const selectedIndices = await waitPlayerHandSelection(count, o);
    if (o === 'red' && selectedIndices && selectedIndices.length > 0) {
      // AIの思考時間を演出
      await sleep(AI_THINKING_DURATION);
    }
    if (selectedIndices && selectedIndices.length > 0) {
      selectedIndices.sort((a, b) => b - a);
      for (let i of selectedIndices) {
        const discarded = h.splice(i, 1)[0];
        await discardCard(o, discarded);
      }
      for (let i = 0; i < selectedIndices.length; i++) drawCard(o);
    } else if (h.length === 0) {
      drawCard(o);
    }
    await sleep(500);
  } else if (skillId === 'shuffle') {
    playSkillSound(skillId);
    createDamagePopup(cEl, '攪乱', '#facc15');

    // オンライン対戦時、乱数シードの消費順序をホスト・ゲスト間で一致させるため、ホスト側の盤面から処理する順序に固定
    let processOrder = ['blue', 'red'];
    if (GameState.gameMode === 'online') {
      processOrder = getIsHost() ? ['blue', 'red'] : ['red', 'blue'];
    }

    // オンライン対戦時、乱数シードの消費順序や効果の発動順序をホスト・ゲスト間で完全に一致させるため、ホストから順に処理
    for (const p of processOrder) {
      const h = p === 'blue' ? GameState.playerHand : GameState.enemyHand;
      const hCards = [...h]; // 手札のコピーを保持
      h.length = 0; // 手札の配列を先に空にする

      // 順番に1枚ずつ正規に捨てる（バフ・変相のリセットとトークンの自動消滅処理を適用するため）
      for (let i = 0; i < hCards.length; i++) {
        await discardCard(p, hCards[i], undefined, false);
      }
    }

    processOrder.forEach((p) => {
      const g = p === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
      const d = p === 'blue' ? GameState.playerDeck : GameState.enemyDeck;

      // 墓地に送られた（リセット済みの）カードをデッキに全て戻す（トークンは除外）
      while (g.length > 0) {
        const card = g.pop();
        if (!card.isToken) d.push(card);
      }
    });

    // 捨てた状態で一度待機する
    updateDeckDisplay('blue');
    updateDeckDisplay('red');
    renderHand();
    await sleep(1200);

    processOrder.forEach((p) => {
      const h = p === 'blue' ? GameState.playerHand : GameState.enemyHand;
      const d = p === 'blue' ? GameState.playerDeck : GameState.enemyDeck;

      // デッキを再シャッフル
      shuffleArray(d);

      // 互いに3枚引く
      for (let i = 0; i < 3; i++) {
        if (d.length > 0) {
          const card = d.shift();
          // 新しいUIDを割り当てる（同じカードが手元に戻ってきた時のKey重複エラーを防ぐため）
          card.uid = `${p}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
          h.push(card);
        }
      }
    });

    updateDeckDisplay('blue');
    updateDeckDisplay('red');
    renderHand();
    await sleep(600);
  } else if (skillId === 'summon' || skillId === 'ambush') {
    // 【重要仕様】「召喚 X」において X (pValue) はトークンのパワーを指す。
    // 個数は常に 1体 であるため、レーン選択数には 1 を指定する。
    const pValue = skillValue || 1;

    // 特定のスキルオブジェクト(skObj)があればそのsummonIdを優先、なければカード定義から、それもなければデフォルト
    let tId = skObj?.summonId || c.summonId || 'token_drone';
    let tName = 'ドローン';

    if (tId === 'token_drone' || !tId) {
      const cId = c.baseId || c.id;
      if (cId === 'admiral') {
        tId = 'token_knight';
        tName = '騎士';
      } else if (pValue >= 5) {
        tName = 'ゴーレム';
        tId = 'token_golem';
      }
    }

    const baseTC = CARD_MASTER.find((m) => m.id === tId);
    if (baseTC) tName = baseTC.name;

    const tC = baseTC || {
      id: tId,
      name: tName,
      power: pValue,
      isToken: true,
      rarity: 1,
      voiceCategory: pValue >= 5 ? 'monster' : 'machine_new',
    };

    const simulatedToken = {
      ...tC,
      power: pValue,
      currentPower: pValue,
      basePower: pValue,
      skills: [],
    };
    // AIの場合：actionQueueのtoken_placementからsummon用のレーン指定を取り出す（cloneと同パターン）
    let summonPredefinedLanes = null;
    let aiSummonCancelled = false;
    if (
      o === 'red' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'pvp'
    ) {
      if (GameState.aiDecision && GameState.aiDecision.actionQueue) {
        const tpIdx = GameState.aiDecision.actionQueue.findIndex(
          (a) =>
            a.type === 'token_placement' &&
            (a.skillId === 'summon' || a.skillId === 'ambush')
        );
        if (tpIdx !== -1) {
          const tpAction = GameState.aiDecision.actionQueue.splice(tpIdx, 1)[0];
          if (Array.isArray(tpAction.lanes)) {
            summonPredefinedLanes = [...tpAction.lanes];
          }
        } else {
          // actionQueueにsummonがない場合 → キャンセル扱い
          aiSummonCancelled = true;
        }
      } else if (GameState.aiLevel !== 1) {
        // actionQueueなし かつ Normal以上 → キャンセル扱い（フォールバック防止）
        // Easy AIはactionQueueを持たないため、フォールバック配置を許可する
        aiSummonCancelled = true;
      }
    }

    if (!aiSummonCancelled) {
      // 個数(count)には 1 を指定（召喚はパワー指定スキルのため）
      const selectedLanes = await waitPlayerLaneSelection(
        1,
        o,
        simulatedToken,
        false,
        summonPredefinedLanes,
        false,
        false // ルール：スキルによる「召喚」は「配置(Place)」扱いのため、制約チェックは無視する
      );
      if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける

      let events = [];
      const successfullyPlacedLanes = [];
      for (let i = 0; i < selectedLanes.length; i++) {
        const targetLane = selectedLanes[i];

        // 【根本的リファクタリング】既存カードの上書き確認
        const proceed = await confirmOverwrittenLane(
          o,
          simulatedToken,
          targetLane,
          false
        );
        if (!proceed) continue;

        const board =
          o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
        const newToken = {
          id: `sm_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
          baseId: tId,
          owner: o,
          ...tC,
          isToken: true,
          name: tName,
          isPremium:
            c.isPremium !== undefined
              ? c.isPremium
              : GameState.premiumCards.includes(c.baseId || c.id),
          imgUrl:
            typeof getCardImgUrl === 'function' && tC.imgUrl === undefined
              ? getCardImgUrl(tC)
              : tC.imgUrl || `assets/cards/card_${tId}.webp`,
          filter: c.filter,
          power: pValue,
          currentPower: pValue,
          rarity: 1,
          basePower: pValue,
          voiceCategory:
            tC.voiceCategory || (pValue >= 5 ? 'monster' : 'machine_new'),
          skills: [],
        };
        const existingCard = board[targetLane];
        if (existingCard && hasSkill(existingCard, 'startup')) {
          // 起動消滅の特別処理
          existingCard.skills = existingCard.skills.filter(
            (s) => s.id !== 'startup' && s.id !== 'defender'
          );
          const discardPile =
            o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
          discardPile.push(newToken);

          // 起動消滅のVFX/SE再生
          if (cEl) {
            createDamagePopup(cEl, '起動', '#facc15');
            playSound(SOUNDS.seSkill);
          }
        } else if (
          existingCard &&
          (hasSkill(newToken, 'equip') || hasSkill(existingCard, 'arm_self')) &&
          !hasSkill(existingCard, 'possession') &&
          !hasSkill(newToken, 'possession') &&
          !hasSkill(existingCard, 'reflect') &&
          !hasSkill(newToken, 'reflect')
        ) {
          existingCard.power =
            (existingCard.power || 0) + (newToken.power || 0);
          existingCard.basePower =
            (existingCard.basePower || 0) + (newToken.power || 0);
          existingCard.currentPower =
            (existingCard.currentPower || 0) + (newToken.power || 0);

          const equipSkills = [];
          if (
            newToken.skill &&
            newToken.skill !== 'none' &&
            newToken.skill !== 'equip'
          )
            equipSkills.push({
              id: newToken.skill,
              value: newToken.skillValue,
            });
          if (newToken.skills)
            newToken.skills.forEach((s) => {
              if (s.id !== 'equip') equipSkills.push(s);
            });
          mergeCardSkills(existingCard, equipSkills);

          existingCard.equippedCards = existingCard.equippedCards || [];
          existingCard.equippedCards.push(newToken);

          // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
          consumeArmSelf(existingCard, newToken);
          events.push({
            type: 'power_change',
            side: o,
            lane: targetLane,
            amount: newToken.power,
            source: 'equip',
          });
        } else {
          if (board[targetLane]) {
            if (!(await discardCard(o, board[targetLane], targetLane, false)))
              board[targetLane] = null;
          }
          board[targetLane] = newToken;
          events.push({
            type: 'summon_token',
            side: o,
            lane: targetLane,
            card: newToken,
            source: skillId,
          });
        }
        successfullyPlacedLanes.push(targetLane);
      }
      await playEvents(events);
      // 配置演出が完了したので保護フラグを解除
      for (const ev of events) {
        if (ev.card) ev.card.isSkillResolving = false;
      }
      await cleanupDestroyedCards(c);

      // 奇襲（ambush）の場合、配置したレーンでただちに攻撃させる
      if (skillId === 'ambush') {
        for (let i = 0; i < successfullyPlacedLanes.length; i++) {
          const targetLane = successfullyPlacedLanes[i];
          const board =
            o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
          // 配置先にカードが存在すれば攻撃を誘発
          if (board[targetLane]) {
            await sleep(400); // 攻撃演出の前に少し待つ
            await executeSingleCombat(o, targetLane);
          }
        }
      }
    }
  } else if (skillId === 'clone') {
    // UI選択部分はbattle/Rendererでは隠蔽しきれないためここに残す
    const count = skillValue || 1;
    const tC = CARD_MASTER.find((m) => m.id === 'token_clone');

    // スキルの引き継ぎ（分身含む全スキル）
    // 分身(clone)は召喚時にしか発動しないため、コピーしても影響がない
    let inheritedSkills = Array.isArray(c.skills) ? [...c.skills] : [];
    const stunTurns = c.stunTurns || 0;

    const simulatedToken = {
      ...tC,
      power: c.power,
      currentPower: c.currentPower,
      skills: inheritedSkills,
      stunTurns: stunTurns,
    };
    // AIの場合：actionQueueのtoken_placementからclone用のレーン指定を取り出す
    let clonePredefinedLanes = null;
    if (
      o === 'red' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'pvp'
    ) {
      if (GameState.aiDecision && GameState.aiDecision.actionQueue) {
        const tpIdx = GameState.aiDecision.actionQueue.findIndex(
          (a) => a.type === 'token_placement' && a.skillId === 'clone'
        );
        if (tpIdx !== -1) {
          const tpAction = GameState.aiDecision.actionQueue.splice(tpIdx, 1)[0];
          if (Array.isArray(tpAction.lanes)) {
            clonePredefinedLanes = [...tpAction.lanes];
          } else {
            clonePredefinedLanes = [];
          }
        } else {
          // actionQueueにcloneがない場合 → 配置しない（フォールバック防止）
          clonePredefinedLanes = [];
        }
      } else if (GameState.aiLevel !== 1) {
        // actionQueueなし かつ Normal以上 → 配置しない（フォールバック防止）
        // Easy AIはactionQueueを持たないため、フォールバック配置を許可する
        clonePredefinedLanes = [];
      }
    }
    if (
      GameState.gameMode === 'tutorial' &&
      GameState.tutorial?.id === 'leader_cthulhu'
    ) {
      await showMessage(
        '「分身」スキルが発動したよ！\n分身には強化されたパワーが引き継がれる！\n左のレーンに分身を配置してね！'
      );
      hideMessage();
    }

    // 分身スキルの調整：配置先レーンを元のカードがあるレーン l の隣（隣接レーンのみ）に制限する
    const adjacentLanes = l === 1 ? [0, 2] : [1];
    const restrictLanes = Array.isArray(clonePredefinedLanes)
      ? clonePredefinedLanes.filter((lane) => adjacentLanes.includes(lane))
      : adjacentLanes;

    const selectedLanes = await waitPlayerLaneSelection(
      count,
      o,
      simulatedToken,
      false,
      restrictLanes,
      false,
      true
    );
    if (!selectedLanes || selectedLanes.length === 0) return; // キャンセル時はスキル終了
    if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける

    let events = [];
    events.push({
      type: 'skill',
      skillId: 'clone',
      targetLane: l,
      owner: o,
    });
    for (let i = 0; i < selectedLanes.length; i++) {
      const targetLane = selectedLanes[i];

      // 【根本的リファクタリング】既存カードの上書き確認
      const proceed = await confirmOverwrittenLane(
        o,
        simulatedToken,
        targetLane,
        false
      );
      if (!proceed) continue;

      const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
      const newToken = {
        id: `cl_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
        owner: o,
        baseId: c.baseId || c.id,
        ...tC,
        isToken: true,
        name: '分身',
        isPremium:
          c.isPremium !== undefined
            ? c.isPremium
            : GameState.premiumCards.includes(c.baseId || c.id),
        imgUrl: getCardImgUrl(c), // 本体の画像URLを確定させて焼き付ける
        filter: c.filter,
        power: c.power || 0,
        currentPower:
          c.currentPower !== undefined ? c.currentPower : c.power || 0,
        rarity: c.rarity || 1,
        basePower: c.basePower !== undefined ? c.basePower : c.power || 0,
        voiceCategory: c.voiceCategory,
        skills: JSON.parse(JSON.stringify(inheritedSkills)), // スキルを引き継ぐ
        skillTriggered: true, // 配置扱いのため、引き継いだ召喚時スキルのバッジを表示しない
        stunTurns: stunTurns,
      };
      const existingCard = board[targetLane];
      if (existingCard && hasSkill(existingCard, 'startup')) {
        // 起動消滅の特別処理
        existingCard.skills = existingCard.skills.filter(
          (s) => s.id !== 'startup' && s.id !== 'defender'
        );
        const discardPile =
          o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
        discardPile.push(newToken);

        // 起動消滅のVFX/SE再生
        if (cEl) {
          createDamagePopup(cEl, '起動', '#facc15');
          playSound(SOUNDS.seSkill);
        }
      } else if (
        existingCard &&
        (hasSkill(newToken, 'equip') || hasSkill(existingCard, 'arm_self')) &&
        !hasSkill(existingCard, 'possession') &&
        !hasSkill(newToken, 'possession') &&
        !hasSkill(existingCard, 'reflect') &&
        !hasSkill(newToken, 'reflect')
      ) {
        existingCard.power = (existingCard.power || 0) + (newToken.power || 0);
        existingCard.basePower =
          (existingCard.basePower || 0) + (newToken.power || 0);
        existingCard.currentPower =
          (existingCard.currentPower || 0) + (newToken.power || 0);

        const equipSkills = [];
        if (
          newToken.skill &&
          newToken.skill !== 'none' &&
          newToken.skill !== 'equip'
        )
          equipSkills.push({ id: newToken.skill, value: newToken.skillValue });
        if (newToken.skills)
          newToken.skills.forEach((s) => {
            if (s.id !== 'equip') equipSkills.push(s);
          });
        mergeCardSkills(existingCard, equipSkills);

        existingCard.equippedCards = existingCard.equippedCards || [];
        existingCard.equippedCards.push(newToken);

        // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
        consumeArmSelf(existingCard, newToken);
        events.push({
          type: 'power_change',
          side: o,
          lane: targetLane,
          amount: newToken.power,
          source: 'equip',
        });
      } else {
        if (board[targetLane]) {
          if (!(await discardCard(o, board[targetLane], targetLane, false)))
            board[targetLane] = null;
        }
        board[targetLane] = newToken;
        events.push({
          type: 'summon_token',
          side: o,
          lane: targetLane,
          card: newToken,
          source: 'clone',
        });
      }
    }
    await playEvents(events);
    // 配置演出が完了したので保護フラグを解除
    for (const ev of events) {
      if (ev.card) ev.card.isSkillResolving = false;
    }
    await cleanupDestroyedCards(c);
  } else if (skillId === 'fate') {
    const roll = Math.floor(getSeededRandom() * 6) + 1;
    playSound(SOUNDS.seSkill);
    createDamagePopup(cEl, '運命', '#facc15');
    await sleep(500);

    if (roll <= 5) {
      // 新しい確率設計：2/6(出目1,2)で1ダメージ、2/6(出目3,4)で2ダメージ、1/6(出目5)で3ダメージ
      let dmg = 1;
      if (roll === 3 || roll === 4) {
        dmg = 2;
      } else if (roll === 5) {
        dmg = 3;
      }
      if (o === 'blue') {
        GameState.enemyHP -= dmg;
        createDamagePopup(
          document.getElementById('enemy-hp-fill'),
          `-${dmg}`,
          '#ef4444'
        );
        const eh = document.getElementById('playmat-enemy');
        if (eh) {
          eh.classList.remove('anim-shake');
          void eh.offsetWidth; // リフローを発生させてアニメーションを再トリガー
          eh.classList.add('anim-shake');
        }
        showSpeechBubble('red');
        await triggerExtortInAction(c, o);
      } else {
        GameState.playerHP -= dmg;
        createDamagePopup(
          document.getElementById('player-hp-fill'),
          `-${dmg}`,
          '#ef4444'
        );
        document.body.classList.add('anim-shake');
        setTimeout(() => document.body.classList.remove('anim-shake'), 400);
        showSpeechBubble('blue');
        await triggerExtortInAction(c, o);
      }
    } else {
      let dmg = 6;
      if (o === 'blue') {
        GameState.playerHP -= dmg;
        createDamagePopup(
          document.getElementById('player-hp-fill'),
          `-${dmg}`,
          '#ef4444'
        );
        document.body.classList.add('anim-shake');
        setTimeout(() => document.body.classList.remove('anim-shake'), 400);
        showSpeechBubble('blue');
      } else {
        GameState.enemyHP -= dmg;
        createDamagePopup(
          document.getElementById('enemy-hp-fill'),
          `-${dmg}`,
          '#ef4444'
        );
        const eh = document.getElementById('playmat-enemy');
        if (eh) {
          eh.classList.remove('anim-shake');
          void eh.offsetWidth; // リフローを発生させてアニメーションを再トリガー
          eh.classList.add('anim-shake');
        }
        showSpeechBubble('red');
      }
    }
    updateHPBar();
    checkWinCondition();
    await sleep(400);
  } else if (skillId === 'quick') {
    await sleep(400);
    await executeSingleCombat(o, l);
  } else if (skillId === 'oblivion') {
    const myBoard = GameState.playerBoard;
    const oppBoard = GameState.enemyBoard;

    // お互いの場のカードの全ての能力をなくし、一時的効果もクリアする
    const boards = [
      { b: myBoard, side: 'player' },
      { b: oppBoard, side: 'enemy' },
    ];

    for (const { b, side } of boards) {
      for (let i = 0; i < 3; i++) {
        const card = b[i];
        if (card) {
          card.skills = [];
          card.choices = [];
          card.choices2 = null;
          if ('summonId' in card) delete card.summonId;
          card.stunTurns = 0;
          card.stunAppliedThisTurn = false;

          if (window.updateCardVisualsReact) {
            window.updateCardVisualsReact(i, side);
          }
        }
      }
    }

    if (!window.updateCardVisualsReact && window.updateBattleUIHook) {
      window.updateBattleUIHook();
    }
    renderBoard();
    await sleep(400);
  } else if (skillId === 'toxic') {
    createDamagePopup(cEl, '有毒', '#10b981');
    const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
    if (eB[l]) {
      const toxVal = skillValue || 1;
      eB[l].skills = eB[l].skills || [];

      const existIndex = eB[l].skills.findIndex((s) => s.id === 'growth');
      const exist = existIndex !== -1 ? eB[l].skills[existIndex] : null;
      if (exist) {
        const nextValue = (exist.value ?? 1) - toxVal;
        if (nextValue === 0) {
          eB[l].skills.splice(existIndex, 1);
        } else {
          exist.value = nextValue;
        }
      } else {
        eB[l].skills.push({ id: 'growth', value: -toxVal });
      }

      const tgtSide = o === 'blue' ? 'enemy' : 'player';

      // VFX演出（SEも triggerVfx 内で自動再生されます）
      if (window.triggerVfx) {
        await window.triggerVfx('anm_skill_toxic', o, l);
      } else {
        playSound(SOUNDS.seSkillToxic);
      }

      if (window.updateCardVisualsReact)
        window.updateCardVisualsReact(l, tgtSide);
      else {
        const ubHook = window.updateBattleUIHook;
        if (ubHook) ubHook();
      }
    } else {
      // 効果対象が存在しない場合はSEのみ再生
      playSound(SOUNDS.seSkillToxic);
      await sleep(500);
    }
  } else if (skillId === 'petrify') {
    createDamagePopup(cEl, '石化', '#64748b');
    const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
    const oppOwner = o === 'blue' ? 'red' : 'blue';
    const tgtSide = o === 'blue' ? 'enemy' : 'player';

    if (eB[l]) {
      const targetOriginal = JSON.parse(JSON.stringify(eB[l]));
      const statueTpl = CARD_MASTER.find((m) => m.id === 'token_statue') || {
        name: '石像',
        power: 5,
        rarity: 1,
      };
      const statueToken = {
        ...JSON.parse(JSON.stringify(statueTpl)),
        id: `statue_${Math.floor(getSeededRandom() * 1000000000)}`,
        baseId: 'token_statue',
        uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_statue`,
        power: statueTpl.power,
        currentPower: statueTpl.power,
        basePower: statueTpl.power,
        voiceCategory: statueTpl.voiceCategory || 'stone',
        originalRevertTarget: targetOriginal,
        owner: oppOwner,
        isToken: true,
        isMorphToken: true,
        isSkillResolving: true, // 保護フラグ
      };

      if (
        targetOriginal.equippedCards &&
        targetOriginal.equippedCards.length > 0
      ) {
        statueToken.equippedCards = JSON.parse(
          JSON.stringify(targetOriginal.equippedCards)
        );
      }
      if (
        targetOriginal.unionMaterials &&
        targetOriginal.unionMaterials.length > 0
      ) {
        statueToken.unionMaterials = JSON.parse(
          JSON.stringify(targetOriginal.unionMaterials)
        );
      }

      eB[l] = statueToken;
      renderBoard();

      // VFX演出（SEも triggerVfx 内で自動再生されます）
      if (window.triggerVfx) {
        await window.triggerVfx('anm_skill_petrify', o, l);
      } else {
        playSound(SOUNDS.seSkillMorph);
      }

      await sleep(300);
      statueToken.isSkillResolving = false; // 保護解除

      if (window.updateCardVisualsReact) {
        window.updateCardVisualsReact(l, tgtSide);
      } else if (window.updateBattleUIHook) {
        window.updateBattleUIHook();
      }
    } else {
      playSound(SOUNDS.seSkillMorph);
      await sleep(500);
    }
  } else if (skillId === 'hero') {
    // 【開発ガイドライン適用】直接トリガー型アクティブスキル
    const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    const occ = board.filter((x, idx) => x !== null && idx !== l).length;
    const hVal = occ * (skillValue || 3);
    if (hVal > 0) {
      c.currentPower = (c.currentPower || 0) + hVal;

      // VFX演出（SEも triggerVfx 内で自動再生されます）
      if (window.triggerVfx) {
        await window.triggerVfx('anm_skill_hero', o, l);
      } else {
        playSound(SOUNDS.seSkill);
      }

      if (cEl) {
        createDamagePopup(cEl, `+${hVal}`, '#4ade80');
      }

      renderBoard();

      if (window.updateCardVisualsReact) {
        window.updateCardVisualsReact(l, o === 'blue' ? 'player' : 'enemy');
      } else if (window.updateBattleUIHook) {
        window.updateBattleUIHook();
      }
      await sleep(200);
    }
  } else if (skillId === 'adversity') {
    // 【開発ガイドライン適用】直接トリガー型アクティブスキル
    const opB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
    const occ = opB.filter((x) => x !== null).length;
    const advVal = occ * (skillValue || 1);
    if (advVal !== 0) {
      c.currentPower = (c.currentPower || 0) + advVal;

      // VFX演出（SEも triggerVfx 内で自動再生されます）
      if (window.triggerVfx) {
        await window.triggerVfx('anm_skill_adversity', o, l);
      } else {
        playSound(SOUNDS.seSkill);
      }

      if (cEl) {
        createDamagePopup(cEl, `+${advVal}`, '#10b981');
      }

      renderBoard();

      if (window.updateCardVisualsReact) {
        window.updateCardVisualsReact(l, o === 'blue' ? 'player' : 'enemy');
      } else if (window.updateBattleUIHook) {
        window.updateBattleUIHook();
      }
      await sleep(200);
    }
  } else if (skillId === 'sacrifice' || skillId === 'sacrifice_void') {
    // 【開発ガイドライン適用】直接トリガー型アクティブスキル
    const sidePrefix = o === 'blue' ? 'player' : 'enemy';
    const hpFill = document.getElementById(`${sidePrefix}-hp-fill`);

    let dmg = skillValue || 3;
    if (cEl) {
      const sacText = skillId === 'sacrifice_void' ? '代償(虚)' : '代償';
      createDamagePopup(cEl, sacText, '#ef4444');
      await sleep(200);
    }
    if (skillId === 'sacrifice_void') {
      const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
      const voidCount = hand
        ? hand.filter(
            (card) =>
              card && (card.id === 'token_void' || card.baseId === 'token_void')
          ).length
        : 0;
      dmg = (skillValue || 1) * voidCount;
    }

    if (dmg > 0) {
      // 実際のHP減少
      if (o === 'blue') {
        GameState.playerHP = Math.max(0, GameState.playerHP - dmg);
      } else {
        GameState.enemyHP = Math.max(0, GameState.enemyHP - dmg);
      }

      // VFX演出（SEも triggerVfx 内で自動再生されます）
      if (window.triggerVfx) {
        await window.triggerVfx('anm_skill_sacrifice', o, l);
      } else {
        playSound(SOUNDS.seSkillSacrifice);
      }

      // ダメージポップアップと画面揺らし
      if (hpFill) {
        const label = `-${dmg}`;
        createDamagePopup(hpFill, label, '#ef4444');
      }

      const playmat = document.getElementById(`playmat-${sidePrefix}`);
      if (playmat) {
        playmat.classList.remove('anim-shake');
        void playmat.offsetWidth;
        playmat.classList.add('anim-shake');
      }

      playSound(SOUNDS.seDamage);
      updateHPBar();
      showSpeechBubble(o); // 被害側（自傷した本人）のセリフ

      await sleep(300);
      checkWinCondition();
    }
  } else if (skillId === 'dispel') {
    playSound(SOUNDS.seSkillBind); // Wait, dispel sound doesn't exist, we use generic or bind sound.
    const targets = [];
    const checkTargets = (board, side) => {
      for (let i = 0; i < 3; i++) {
        const card = board[i];
        if (card) {
          const hasEquipSkill = hasSkill(card, 'equip');
          const hasEquippedItems =
            card.equippedCards && card.equippedCards.length > 0;
          if (hasEquipSkill || hasEquippedItems) {
            targets.push({
              lane: i,
              card,
              side,
              isSelf: hasEquipSkill,
              isHost: hasEquippedItems,
            });
          }
        }
      }
    };
    checkTargets(GameState.playerBoard, 'blue');
    checkTargets(GameState.enemyBoard, 'red');

    if (targets.length > 0) {
      let anyValidTarget = false;
      let playedVoices = new Set();

      for (let t of targets) {
        const targetCard = t.card;
        const sidePrefix = t.side === 'blue' ? 'player' : 'enemy';
        const tgtEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${t.lane}"] .card`
        );

        const isImmune = hasSkill(targetCard, 'immune');
        let totalPowerLoss = 0;

        if (t.isHost) {
          // 装備カードを全て破壊（墓地に送る）
          for (const eqCard of targetCard.equippedCards) {
            totalPowerLoss += eqCard.power || 0;

            const equipSkills = [];
            if (
              eqCard.skill &&
              eqCard.skill !== 'none' &&
              eqCard.skill !== 'equip'
            ) {
              equipSkills.push({ id: eqCard.skill, value: eqCard.skillValue });
            }
            if (eqCard.skills) {
              eqCard.skills.forEach((s) => {
                if (s.id !== 'equip') equipSkills.push(s);
              });
            }
            unmergeCardSkills(targetCard, equipSkills);
            await discardCard(t.side, eqCard, undefined, false);
          }
        }

        if (tgtEl) {
          tgtEl.classList.remove('anim-shake');
          void tgtEl.offsetWidth; // リフローを発生させてアニメーションを再トリガー
          tgtEl.classList.add('anim-shake');
        }

        if (t.isHost) {
          if (tgtEl) {
            createDamagePopup(tgtEl, `-${totalPowerLoss} 解除`, '#94a3b8');
          }
          targetCard.equippedCards = [];
          targetCard.power -= totalPowerLoss;
          targetCard.currentPower -= totalPowerLoss;
          targetCard.basePower -= totalPowerLoss;
        }

        if (t.isSelf) {
          if (!isImmune) {
            targetCard.currentPower = 0;
          }
        }

        let showImmunePopup = false;
        if (isImmune) {
          if (t.isSelf || targetCard.currentPower <= 0) {
            showImmunePopup = true;
          }
        }

        if (targetCard.currentPower <= 0 && !isImmune) {
          if (tgtEl) {
            tgtEl.classList.add('anim-card-destroy');
            if (!t.isHost) {
              createDamagePopup(tgtEl, '破壊', '#ef4444');
            }
          }
          if (
            targetCard.voiceCategory &&
            !playedVoices.has(targetCard.voiceCategory)
          ) {
            playCardVoice(targetCard, 'death');
            playedVoices.add(targetCard.voiceCategory);
          }
          anyValidTarget = true;
        } else if (showImmunePopup) {
          if (tgtEl) {
            createDamagePopup(tgtEl, '無効', '#94a3b8');
          }
        }
      }

      if (anyValidTarget) {
        playSound(SOUNDS.seDestroy);
        await sleep(400); // 破壊演出待ち
      } else {
        await sleep(400); // 解除・無効のみの演出待ち
      }

      for (let t of targets) {
        const targetCard = t.card;
        if (hasSkill(targetCard, 'immune')) continue;

        if (targetCard.currentPower <= 0) {
          const eB =
            t.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
          if (!(await discardCard(t.side, targetCard, t.lane, true))) {
            eB[t.lane] = null;
          }
        }
      }

      renderBoard();
      await sleep(500);

      for (let t of targets) {
        if (hasSkill(t.card, 'immune')) continue;

        const sidePrefix = t.side === 'blue' ? 'player' : 'enemy';
        const tgtEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${t.lane}"] .card`
        );
        if (tgtEl) {
          tgtEl.classList.remove('anim-shake');
          tgtEl.classList.remove('anim-card-destroy');
        }
      }
    }
  } else if (skillId === 'crush') {
    const targets = [];
    const checkTargets = (board, side) => {
      for (let i = 0; i < 3; i++) {
        if (
          board[i] &&
          (hasSkill(board[i], 'defender') || board[i].stunTurns > 0)
        ) {
          targets.push({ lane: i, card: board[i], side });
        }
      }
    };
    checkTargets(GameState.playerBoard, 'blue');
    checkTargets(GameState.enemyBoard, 'red');

    await executeGroupDestruction(targets);
  } else if (skillId === 'treason') {
    // 【仕様】お互いの場の「伝説」を持つカードを全て破壊する。
    const targets = [];
    const checkTargets = (board, side) => {
      for (let i = 0; i < 3; i++) {
        if (board[i] && hasSkill(board[i], 'legendary')) {
          targets.push({ lane: i, card: board[i], side });
        }
      }
    };
    checkTargets(GameState.playerBoard, 'blue');
    checkTargets(GameState.enemyBoard, 'red');

    await executeGroupDestruction(targets);
  } else if (skillId === 'bind') {
    createDamagePopup(cEl, '拘束', '#facc15');
    const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
    if (eB[l]) {
      // 【仕様通り】+1 はターン終了時の stunTurns-- を見越した補正。
      // val=1 で「このターンは動けない」→ターン終了時に1減って stunTurns=1 → 次ターン防御 → 終了時に0、で計1ターン拘束。
      const turns = (skillValue || 1) + 1;
      eB[l].stunTurns = turns;

      const tgtSide = o === 'blue' ? 'enemy' : 'player';

      // VFX演出（SEも triggerVfx 内で自動再生されます）
      if (window.triggerVfx) {
        await window.triggerVfx('anm_skill_bind', o, l);
      } else {
        playSound(SOUNDS.seSkillBind);
      }

      if (window.updateCardVisualsReact)
        window.updateCardVisualsReact(l, tgtSide);
      else if (window.updateBattleUIHook) window.updateBattleUIHook();
    } else {
      playSound(SOUNDS.seSkillBind);
      await sleep(500);
    }
  } else if (skillId === 'seal') {
    const targetSide = o === 'blue' ? 'enemy' : 'player';
    const targetSealedLanes =
      o === 'blue' ? GameState.enemySealedLanes : GameState.playerSealedLanes;

    if (targetSealedLanes) {
      const turns = skillValue || 1;
      targetSealedLanes[l] = turns;

      const tEl = document.querySelector(
        `#${targetSide}-lanes .cell[data-lane="${l}"]`
      );

      // VFX演出
      if (window.triggerVfx) {
        await window.triggerVfx('anm_skill_seal', o, l);
      } else {
        if (SOUNDS.seSkillSeal) playSound(SOUNDS.seSkillSeal);
      }

      if (tEl) {
        tEl.classList.add('anim-shake');
        createDamagePopup(tEl, '封印', '#94a3b8');
      }
      if (window.updateBattleUIHook) window.updateBattleUIHook();
      await sleep(500);
      if (tEl) tEl.classList.remove('anim-shake');
    } else {
      await sleep(500);
    }
  } else if (skillId === 'freeze') {
    createDamagePopup(cEl, '凍結', '#93c5fd');
    const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
    let targets = [];
    for (let idx of [l - 1, l, l + 1]) {
      if (idx >= 0 && idx <= 2 && eB[idx]) targets.push(idx);
    }

    if (targets.length > 0) {
      // 【仕様通り】+1 はターン終了時の stunTurns-- を見越した補正（bindと同じロジック）。
      const turns = (skillValue || 1) + 1;
      for (const tL of targets) {
        eB[tL].stunTurns = turns;
      }

      // VFX演出の再生（すべての対象レーンで同時に並列再生）
      if (window.triggerVfx) {
        await Promise.all(
          targets.map((tL) => window.triggerVfx('anm_skill_freeze', o, tL))
        );
      } else {
        playSound(SOUNDS.seSkillFreeze);
      }

      if (window.updateBattleUIHook) window.updateBattleUIHook(); // 反映させる
    } else {
      playSound(SOUNDS.seSkillFreeze);
      await sleep(500);
    }
  } else if (skillId === 'artillery') {
    let dmg = skillValue || 1;
    if (window.triggerVfx) {
      await window.triggerVfx('anm_skill_artillery', o);
    }
    if (o === 'blue') {
      GameState.enemyHP -= dmg;
      createDamagePopup(
        document.getElementById('enemy-hp-fill'),
        `-${dmg}`,
        '#ef4444'
      );
      const eh = document.getElementById('playmat-enemy');
      if (eh) eh.classList.add('anim-shake');
      showSpeechBubble('red');
    } else {
      GameState.playerHP -= dmg;
      createDamagePopup(
        document.getElementById('player-hp-fill'),
        `-${dmg}`,
        '#ef4444'
      );
      document.body.classList.add('anim-shake');
      setTimeout(() => document.body.classList.remove('anim-shake'), 400);
      showSpeechBubble('blue');
    }
    playSound(SOUNDS.seDamage);
    await triggerExtortInAction(c, o);
    updateHPBar();
    checkWinCondition();
    await sleep(400);
  } else if (skillId === 'heal' || skillId === 'heal_void') {
    if (cEl) {
      const healText = skillId === 'heal_void' ? '回復(虚)' : '回復';
      createDamagePopup(cEl, healText, '#4ade80');
      await sleep(200);
    }
    if (window.triggerVfx) {
      const vfxPromise = window.triggerVfx('anm_skill_heal', o); // 発動したプレイヤー側（o）に対して回復VFXを再生
      await sleep(150); // 演出開始の瞬間に合わせて回復処理へ移行
      await vfxPromise;
    } else {
      playSound(SOUNDS.seSkillHeal);
      await sleep(150);
    }
    let events = [];
    applyActiveSkillLogic(currentState, o, l, skillId, skillValue || 0, events);
    if (events.length > 0) {
      await playEvents(events);
    }
  } else if (skillId === 'loss') {
    playSound(SOUNDS.seSkill);
    createDamagePopup(cEl, '喪失', '#8b5cf6');
    const d = o === 'blue' ? GameState.playerDeck : GameState.enemyDeck;
    const g = o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
    const count = skillValue || 1;
    let lostCount = 0;
    for (let i = 0; i < count; i++) {
      if (d.length > 0) {
        g.push(d.pop()); // 上から墓地へ送るためpop
        lostCount++;
      }
    }
    if (lostCount > 0) {
      updateDeckDisplay(o);
    }
    await sleep(500);
  } else if (skillId === 'burial') {
    playSound(SOUNDS.seSkill);
    createDamagePopup(cEl, '埋葬', '#8b5cf6');
    const d = o === 'blue' ? GameState.enemyDeck : GameState.playerDeck;
    const g = o === 'blue' ? GameState.enemyDiscard : GameState.playerDiscard;
    const targetSide = o === 'blue' ? 'red' : 'blue';
    const count = skillValue || 1;
    let lostCount = 0;
    for (let i = 0; i < count; i++) {
      if (d.length > 0) {
        g.push(d.pop()); // 上から墓地へ送るためpop
        lostCount++;
      }
    }
    if (lostCount > 0) {
      updateDeckDisplay(targetSide);
    }
    await sleep(500);
  } else if (skillId === 'recurse') {
    playSound(SOUNDS.seSkill);
    createDamagePopup(cEl, '再帰', '#10b981');
    if (await triggerGraveKeeperEffect()) return;
    const maxChoices = skillValue || 1;
    const selectedCards = await waitPlayerDualDiscardSelection(
      GameState.playerDiscard,
      GameState.enemyDiscard,
      maxChoices,
      o,
      'デッキに戻すカードを選択',
      `お互いの墓地から合計${maxChoices}枚まで選びます。`
    );

    if (selectedCards && selectedCards.length > 0) {
      let blueCount = 0;
      let redCount = 0;
      selectedCards.forEach((card) => {
        const isBlue = card.fromTab === 'blue';
        const sourceDiscard = isBlue
          ? GameState.playerDiscard
          : GameState.enemyDiscard;
        const targetDeck = isBlue ? GameState.playerDeck : GameState.enemyDeck;

        const idx = sourceDiscard.findIndex(
          (c) => (c.uid && c.uid === card.uid) || (!c.uid && c.id === card.id)
        );
        if (idx >= 0) {
          const removed = sourceDiscard.splice(idx, 1)[0];
          targetDeck.push(removed);
          if (isBlue) blueCount++;
          else redCount++;
        }
      });

      if (blueCount > 0) {
        shuffleArray(GameState.playerDeck);
        updateDeckDisplay('blue');
      }
      if (redCount > 0) {
        shuffleArray(GameState.enemyDeck);
        updateDeckDisplay('red');
      }
      await sleep(500);
    }
  } else if (skillId === 'bless') {
    const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
    let targetIndices = [];
    if (o === 'blue' || GameState.gameMode === 'online') {
      targetIndices = await waitPlayerHandSelection(
        1,
        o,
        false,
        '手札のカードを1枚選んでください'
      );
    } else {
      let bestIdx = -1;
      let maxPower = -1;
      for (let i = 0; i < hand.length; i++) {
        if (hand[i] !== null && !hand[i].isToken) {
          if (bestIdx === -1 || (hand[i].power || 0) > maxPower) {
            maxPower = hand[i].power || 0;
            bestIdx = i;
          }
        }
      }
      if (bestIdx === -1) {
        bestIdx = hand.findIndex((c) => c !== null);
      }
      if (bestIdx !== -1) {
        targetIndices = [bestIdx];
        await sleep(600);
      }
    }
    if (targetIndices && targetIndices.length > 0) {
      const idx = targetIndices[0];
      const card = hand[idx];
      card.power = (card.power || 0) + (skillValue || 1);
      card.basePower = (card.basePower || 0) + (skillValue || 1);
      card.currentPower = (card.currentPower || 0) + (skillValue || 1);
      if (cEl) createDamagePopup(cEl, '祝福', '#facc15');
      playSound(SOUNDS.seSkill);
      renderHand();
      await sleep(300);
    }
  } else if (skillId === 'standby') {
    // 【仕様】自分のカードに適用するため、+1 補正は不要。
    // bind/freeze は相手カードに適用し、「発動したターンも防御状態にする」ため +1 しているが、
    // standby は自分が召喚したこのターンから待機するため、val そのままで正しい挙動になる。
    const turns = skillValue || 1;
    c.stunTurns = turns;
    renderBoard();
    await sleep(400);
  } else if (skillId === 'decay') {
    // パワーを半分にする
    const currentP =
      c.currentPower !== undefined ? c.currentPower : c.power || 1;
    const halfP = Math.floor(currentP / 2);

    c.power = halfP;
    c.currentPower = halfP;
    c.basePower = halfP;

    renderBoard();
    await sleep(400);
  } else if (skillId === 'resurrect') {
    if (await triggerGraveKeeperEffect()) return;
    const maxPow = skillValue || 1;
    const discard =
      o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
    const validCards = discard.filter(
      (card) => (card.power || 0) <= maxPow && !card.isToken
    );
    let tokenLanes = null;

    if (validCards.length > 0) {
      let selectedCard = null;
      if (
        o === 'red' &&
        GameState.gameMode !== 'online' &&
        GameState.gameMode !== 'pvp'
      ) {
        const aiAction = consumeAIAction('resurrect');
        if (aiAction) {
          // actionQueue取得失敗時のフォールバック防止用（後で上書きされる）
          tokenLanes = [];
          // targetUid が存在する場合はUID優先で照合（validCardsとのインデックスずれを防ぐ）
          if (aiAction.targetUid) {
            selectedCard =
              validCards.find(
                (c) =>
                  c.uid === aiAction.targetUid ||
                  c.id === aiAction.targetUid ||
                  c.baseId === aiAction.targetUid
              ) || null;
          }
          // フォールバック: targetIdx で直接参照（validCards が discard と一致している場合）
          if (!selectedCard && aiAction.targetIdx !== undefined) {
            selectedCard =
              validCards[aiAction.targetIdx] ||
              discard[aiAction.targetIdx] ||
              null;
          }
          if (aiAction.laneIdx !== undefined) tokenLanes = [aiAction.laneIdx];
        } else {
          if (GameState.aiLevel === 1) {
            // Easy AI: actionQueueがないため、最強カードをフォールバック選択（レーンもフォールバック配置）
            const sortedRes = [...validCards].sort(
              (a, b) => (b.power || 0) - (a.power || 0)
            );
            selectedCard = sortedRes[0] || null;
            // tokenLanes = null のまま → evaluateBestLanesForToken で配置
          } else {
            // Normal以上: actionQueueにresurrectがない場合 → 配置しない（フォールバック防止）
            tokenLanes = [];
          }
        }
        // AIの思考時間を演出
        await sleep(AI_THINKING_DURATION);
      } else {
        selectedCard = await waitPlayerDiscardSelection(
          validCards,
          maxPow,
          o,
          '復活: 配置するカードを選択',
          `自分の墓地からパワー${maxPow}以下のカードを1枚配置します。`
        );
      }

      if (selectedCard) {
        let successRes = false;
        let targetLane = -1;
        while (!successRes) {
          const tLanes = await waitPlayerLaneSelection(
            1,
            o,
            selectedCard,
            false,
            tokenLanes,
            false,
            true
          );
          if (!tLanes || tLanes.length === 0) return; // レーン選択キャンセル時はスキル終了
          targetLane = tLanes[0];

          // 【根本的リファクタリング】既存カードの上書き確認と破棄処理
          const proceed = await confirmOverwrittenLane(
            o,
            selectedCard,
            targetLane,
            false
          );
          if (!proceed) {
            await sleep(200);
            continue; // キャンセル時はレーン選択からやり直す
          }
          successRes = true;
        }

        if (targetLane !== -1) {
          // 完全一致するオブジェクトを手動で削除
          const actualIdx = discard.indexOf(selectedCard);
          if (actualIdx !== -1) discard.splice(actualIdx, 1);
          updateDeckDisplay(o);

          const board =
            o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
          const existingCard = board[targetLane];
          if (existingCard && hasSkill(existingCard, 'startup')) {
            // 起動消滅の特別処理
            existingCard.skills = existingCard.skills.filter(
              (s) => s.id !== 'startup' && s.id !== 'defender'
            );
            // 復活させようとしていたカードは墓地に戻す
            const discardPile =
              o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
            discardPile.push(selectedCard);

            const cEl = document.querySelector(
              `#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${targetLane}"] .card`
            );
            if (cEl) {
              createDamagePopup(cEl, '起動', '#facc15');
              playSound(SOUNDS.seSkill);
            }
          } else if (canEquipCard(selectedCard, board[targetLane])) {
            const targetCard = board[targetLane];
            // 装備によるパワー加算
            targetCard.power =
              (targetCard.power || 0) + (selectedCard.power || 0);
            targetCard.basePower =
              (targetCard.basePower || 0) + (selectedCard.power || 0);
            targetCard.currentPower =
              (targetCard.currentPower || 0) + (selectedCard.power || 0);

            // スキルの統合
            if (!targetCard.skills) {
              targetCard.skills = [];
            }

            const equipSkills = [];
            if (selectedCard.skills) {
              selectedCard.skills.forEach((s) => {
                if (s.id !== 'equip') equipSkills.push(s);
              });
            }
            mergeCardSkills(targetCard, equipSkills);
            targetCard.skillTriggered = true; // 配置（復活）からの合体のため、追加スキルのバッジは表示しない
            // ※ユーザー指定に基づき、召喚ではないためアクティブスキルの即発動は行わない

            // 装備したカードは消費されて対象カードにアタッチされる
            targetCard.equippedCards = targetCard.equippedCards || [];
            targetCard.equippedCards.push(selectedCard);

            // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
            consumeArmSelf(targetCard, selectedCard);
          } else {
            const existingCard = board[targetLane];
            const unionSkill =
              selectedCard.skills &&
              selectedCard.skills.find((s) => s.id === 'union');
            const isUnion =
              unionSkill &&
              existingCard &&
              (existingCard.baseId === unionSkill.targetId ||
                existingCard.id === unionSkill.targetId);

            if (isUnion) {
              const combineId = unionSkill.summonId;
              const masterData = CARD_MASTER.find((c) => c.id === combineId);
              let unionCard = JSON.parse(JSON.stringify(masterData));
              unionCard.uid = getOrCreateUUID(null);
              unionCard.owner = o;
              unionCard.isPremium =
                (existingCard && existingCard.isPremium) ||
                (selectedCard && selectedCard.isPremium);
              unionCard.baseId = unionCard.id;
              unionCard.basePower = unionCard.power;
              unionCard.currentPower = unionCard.power;
              unionCard.unionMaterials = [existingCard, selectedCard];
              unionCard.skillTriggered = true; // 配置（復活）からの合体のため召喚時効果は不発
              unionCard.stunTurns = 0;
              unionCard.stunAppliedThisTurn = false;
              board[targetLane] = unionCard;
            } else {
              if (existingCard) {
                if (
                  !(await discardCard(o, board[targetLane], targetLane, false))
                )
                  board[targetLane] = null;
              }
              const newUID = `res_uid_${Math.floor(getSeededRandom() * 1000000000)}`;
              board[targetLane] = {
                ...selectedCard,
                id: `res_${Math.floor(getSeededRandom() * 1000000000)}`,
                uid: newUID,
              };

              // 出現時スキルを持つ場合は即座に保護フラグを立てる
              if (hasActiveSkill(board[targetLane])) {
                board[targetLane].isSkillResolving = true;
              }

              board[targetLane].currentPower = board[targetLane].power;

              board[targetLane].skillTriggered = true; // 召喚効果は発動しない
              board[targetLane].stunTurns = 0;
              board[targetLane].stunAppliedThisTurn = false;
            }
          }

          let voiceCard = board[targetLane];
          if (canEquipCard(selectedCard, board[targetLane])) {
            voiceCard = selectedCard;
          }
          if (voiceCard?.voiceCategory) playCardVoice(voiceCard, 'play');
          playSound(SOUNDS.sePlace);
          renderBoard();
          await sleep(PLACE_ANIMATION_DURATION);
          // 配置演出が完了したので保護フラグを解除（復活したカード自身）
          if (board[targetLane]) board[targetLane].isSkillResolving = false;
          await cleanupDestroyedCards(c);
        }
      }
    }
    await sleep(300);
  } else if (skillId === 'puppet') {
    if (await triggerGraveKeeperEffect()) return;
    // 【傘儀】相手の墓地からカードを展開し、自分の場に配置する（復活の逆版）
    const maxPow = skillValue || 1;
    const oppOwner = o === 'blue' ? 'red' : 'blue';
    const oppDiscard =
      o === 'blue' ? GameState.enemyDiscard : GameState.playerDiscard;
    const validCards = oppDiscard.filter(
      (card) => (card.power || 0) <= maxPow && !card.isToken
    );
    let tokenLanes = null;

    if (validCards.length > 0) {
      let selectedCard = null;

      if (
        o === 'red' &&
        GameState.gameMode !== 'online' &&
        GameState.gameMode !== 'pvp'
      ) {
        // AIの場合：actionQueueのpuppetアクションから指定カードとレーンを取り出す
        const aiAction = consumeAIAction('puppet');
        if (aiAction) {
          tokenLanes = [];
          if (aiAction.targetUid) {
            selectedCard =
              validCards.find(
                (c) =>
                  c.uid === aiAction.targetUid ||
                  c.id === aiAction.targetUid ||
                  c.baseId === aiAction.targetUid
              ) || null;
          }
          if (!selectedCard && aiAction.targetIdx !== undefined) {
            selectedCard =
              validCards[aiAction.targetIdx] ||
              oppDiscard[aiAction.targetIdx] ||
              null;
          }
          if (aiAction.laneIdx !== undefined) tokenLanes = [aiAction.laneIdx];
        } else {
          if (GameState.aiLevel === 1) {
            // Easy AI: 最強カードをフォールバック選択
            const sortedPuppet = [...validCards].sort(
              (a, b) => (b.power || 0) - (a.power || 0)
            );
            selectedCard = sortedPuppet[0] || null;
          } else {
            // Normal以上: アクションがない場合は配置しない
            tokenLanes = [];
          }
        }
        // AIの思考時間を演出
        await sleep(AI_THINKING_DURATION);
      } else {
        // プレイヤー: 復活と同じ選択モーダルを使用
        selectedCard = await waitPlayerDiscardSelection(
          validCards,
          maxPow,
          o,
          '傀儡: 配置するカードを選択',
          `相手の墓地からパワー${maxPow}以下のカードを1枚配置します。`
        );
      }

      if (selectedCard) {
        let successPup = false;
        let targetLane = -1;
        while (!successPup) {
          // 配置先レーンを選択（復活と同様、制約チェックなし）
          const tLanes = await waitPlayerLaneSelection(
            1,
            o,
            selectedCard,
            false,
            tokenLanes,
            false,
            true
          );
          if (!tLanes || tLanes.length === 0) return; // レーン選択キャンセル時はスキル終了
          targetLane = tLanes[0];

          // 【根本的リファクタリング】既存カードの上書き確認と破棄処理
          const proceed = await confirmOverwrittenLane(
            o,
            selectedCard,
            targetLane,
            false
          );
          if (!proceed) {
            await sleep(200);
            continue; // キャンセル時はレーン選択からやり直す
          }
          successPup = true;
        }

        if (targetLane !== -1) {
          // 相手の墓地から取り除く
          const actualIdx = oppDiscard.indexOf(selectedCard);
          if (actualIdx !== -1) oppDiscard.splice(actualIdx, 1);
          updateDeckDisplay(oppOwner);

          const board =
            o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
          const existingCard = board[targetLane];

          if (existingCard && hasSkill(existingCard, 'startup')) {
            // 起動消滅の特別処理
            existingCard.skills = existingCard.skills.filter(
              (s) => s.id !== 'startup' && s.id !== 'defender'
            );
            // 傀儡で出そうとしたカードは元の持ち主の墓地に戻す
            const oppDiscardPile =
              oppOwner === 'blue'
                ? GameState.playerDiscard
                : GameState.enemyDiscard;
            oppDiscardPile.push(selectedCard);

            const cEl = document.querySelector(
              `#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${targetLane}"] .card`
            );
            if (cEl) {
              createDamagePopup(cEl, '起動', '#facc15');
              playSound(SOUNDS.seSkill);
            }
          } else if (canEquipCard(selectedCard, existingCard)) {
            // 【傀儡＋装備】選択カードが装備スキルを持ち、レーンに既存カードがある場合は装備扱いにする（復活と同じロジック）
            const targetCard = existingCard;

            targetCard.power =
              (targetCard.power || 0) + (selectedCard.power || 0);
            targetCard.basePower =
              (targetCard.basePower || 0) + (selectedCard.power || 0);
            targetCard.currentPower =
              (targetCard.currentPower || 0) + (selectedCard.power || 0);

            if (!targetCard.skills) {
              targetCard.skills =
                targetCard.skill && targetCard.skill !== 'none'
                  ? [{ id: targetCard.skill, value: targetCard.skillValue }]
                  : [];
              targetCard.skill = 'none';
            }
            const equipSkills = [];
            if (
              selectedCard.skill &&
              selectedCard.skill !== 'none' &&
              selectedCard.skill !== 'equip'
            ) {
              equipSkills.push({
                id: selectedCard.skill,
                value: selectedCard.skillValue,
              });
            }
            if (selectedCard.skills) {
              selectedCard.skills.forEach((s) => {
                if (s.id !== 'equip') equipSkills.push(s);
              });
            }
            mergeCardSkills(targetCard, equipSkills);

            // 装備カードをアタッチ（元の持ち主フラグも引き継ぐ）
            targetCard.equippedCards = targetCard.equippedCards || [];
            selectedCard.puppetOriginalOwner = oppOwner; // 元の持ち主を記録
            targetCard.equippedCards.push(selectedCard);

            // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
            consumeArmSelf(targetCard, selectedCard);

            if (selectedCard?.voiceCategory)
              playCardVoice(selectedCard, 'play');
            playSound(SOUNDS.sePlace);
            renderBoard();
            await sleep(PLACE_ANIMATION_DURATION);
            await cleanupDestroyedCards(c);
          } else {
            // 通常配置（装備なし・または既存カードなし）
            const existingCard2 = board[targetLane];
            const unionSkill =
              selectedCard.skills &&
              selectedCard.skills.find((s) => s.id === 'union');
            const isUnion =
              unionSkill &&
              existingCard2 &&
              (existingCard2.baseId === unionSkill.targetId ||
                existingCard2.id === unionSkill.targetId);

            if (isUnion) {
              // 【傀儡＋合体】復活と同じロジックで合体処理を行う（召喚時効果は不発）
              const combineId = unionSkill.summonId;
              const masterData = CARD_MASTER.find((cd) => cd.id === combineId);
              let unionCard = JSON.parse(JSON.stringify(masterData));
              unionCard.uid = getOrCreateUUID(null);
              unionCard.owner = o;
              unionCard.isPremium =
                (existingCard2 && existingCard2.isPremium) ||
                (selectedCard && selectedCard.isPremium);
              unionCard.baseId = unionCard.id;
              unionCard.basePower = unionCard.power;
              unionCard.currentPower = unionCard.power;
              unionCard.unionMaterials = [existingCard2, selectedCard];
              unionCard.skillTriggered = true; // 配置（傀儡）からの合体のため召喚時効果は不発
              unionCard.stunTurns = 0;
              unionCard.stunAppliedThisTurn = false;
              board[targetLane] = unionCard;
            } else {
              if (existingCard2) {
                if (
                  !(await discardCard(o, board[targetLane], targetLane, false))
                )
                  board[targetLane] = null;
              }
              const newUID = `puppet_uid_${Math.floor(getSeededRandom() * 1000000000)}`;
              board[targetLane] = {
                ...selectedCard,
                id: `puppet_${Math.floor(getSeededRandom() * 1000000000)}`,
                uid: newUID,
                owner: o,
                // 【傀儡】元の持ち主を記録しておく。破壊・張り替え時に元の墓地へ戻すために使用する
                puppetOriginalOwner: oppOwner,
                skillTriggered: true, // 配置扱いのため召喚時スキルは発動しない
                stunTurns: 0,
                stunAppliedThisTurn: false,
              };

              // 出現時スキルを持つ場合は即座に保護フラグを立てる
              if (hasActiveSkill(board[targetLane])) {
                board[targetLane].isSkillResolving = true;
              }

              board[targetLane].currentPower = board[targetLane].power; // resurrect と同様に代入後に明示設定
            }

            if (board[targetLane]?.voiceCategory)
              playCardVoice(board[targetLane], 'play');
            playSound(SOUNDS.sePlace);
            renderBoard();
            await sleep(PLACE_ANIMATION_DURATION);
            if (board[targetLane]) board[targetLane].isSkillResolving = false;
            await cleanupDestroyedCards(c);
          }
        }
      }
    }
    await sleep(300);
  } else if (skillId === 'salvage') {
    if (await triggerGraveKeeperEffect()) return;
    const discard =
      o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
    const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;

    let discardIndices = await waitPlayerHandSelection(
      skillValue || 1,
      o,
      false,
      `捨てるカードを${skillValue || 1}枚まで選んでください`
    );
    if (o === 'red' && discardIndices && discardIndices.length > 0) {
      // AIの思考時間を演出
      await sleep(AI_THINKING_DURATION);
    }
    if (discardIndices && discardIndices.length > 0) {
      // 後ろから削除するためにインデックスを降順ソート
      const sortedIndices = [...discardIndices].sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        const card = hand.splice(idx, 1)[0];
        await discardCard(o, card, undefined, false);
      }
      updateDeckDisplay(o);
      renderHand();

      const validCards = discard.filter((card) => !card.isToken);
      if (validCards.length > 0) {
        const actualMaxChoices = Math.min(
          discardIndices.length,
          validCards.length
        );
        const selectedResult = await waitPlayerDiscardSelection(
          validCards,
          999,
          o,
          '回収するカードを選択',
          `墓地からカードを${actualMaxChoices}枚選び、手札に加えます。`,
          false,
          actualMaxChoices
        );
        if (o === 'red' && selectedResult) {
          // AIの思考時間を演出
          await sleep(AI_THINKING_DURATION);
        }

        const cardsToProcess = Array.isArray(selectedResult)
          ? selectedResult
          : selectedResult
            ? [selectedResult]
            : [];

        for (const selectedCard of cardsToProcess) {
          const actualIdx = discard.indexOf(selectedCard);
          if (actualIdx !== -1) discard.splice(actualIdx, 1);

          // カードのステータスを初期状態にリセット
          const masterData = CARD_MASTER.find(
            (m) => m.id === (selectedCard.baseId || selectedCard.id)
          );
          const restoredCard = masterData
            ? JSON.parse(JSON.stringify(masterData))
            : { ...selectedCard };
          restoredCard.baseId = selectedCard.baseId || selectedCard.id; // 画像URLのための保全
          restoredCard.basePower = restoredCard.power;
          restoredCard.currentPower = restoredCard.power;
          if (selectedCard.isPremium !== undefined) {
            restoredCard.isPremium = selectedCard.isPremium;
          }

          hand.push({
            ...restoredCard,
            uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`,
          });
          playSound(SOUNDS.seDraw);
          updateDeckDisplay(o);
          renderHand();
        }
      }
    }
    await sleep(400);
  } else if (skillId === 'explore') {
    const deck = o === 'blue' ? GameState.playerDeck : GameState.enemyDeck;
    const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
    const validCards = [...deck];

    if (validCards.length > 0) {
      const selectedCard = await waitPlayerDiscardSelection(
        validCards,
        999,
        o,
        '探索するカードを選択',
        'デッキからカードを1枚選び、手札に加えます。',
        true
      );
      if (o === 'red' && selectedCard) {
        // AIの思考時間を演出
        await sleep(AI_THINKING_DURATION);
      }

      if (selectedCard) {
        // デッキから対象カードを取り除く
        const idx = deck.findIndex(
          (card) =>
            card.id === selectedCard.id || card.baseId === selectedCard.baseId
        );
        if (idx !== -1) deck.splice(idx, 1);

        // カードのステータスを初期状態にリセット
        const masterData = CARD_MASTER.find(
          (m) => m.id === (selectedCard.baseId || selectedCard.id)
        );
        const restoredCard = masterData
          ? JSON.parse(JSON.stringify(masterData))
          : { ...selectedCard };
        restoredCard.baseId = selectedCard.baseId || selectedCard.id;
        restoredCard.basePower = restoredCard.power;
        restoredCard.currentPower = restoredCard.power;
        if (selectedCard.isPremium !== undefined) {
          restoredCard.isPremium = selectedCard.isPremium;
        }

        hand.push({
          ...restoredCard,
          uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`,
        });
        playSound(SOUNDS.seDraw);
        updateDeckDisplay(o);
        renderHand();

        // その後、手札を1枚捨てる
        if (hand.length > 0) {
          let discardIndices = await waitPlayerHandSelection(
            1,
            o,
            true,
            '捨てるカードを1枚選んでください'
          );
          if (o === 'red' && discardIndices && discardIndices.length > 0) {
            // AIの思考時間を演出
            await sleep(AI_THINKING_DURATION);
          }
          if (discardIndices && discardIndices.length > 0) {
            const discardIdx = discardIndices[0];
            const cardToDiscard = hand.splice(discardIdx, 1)[0];
            await discardCard(o, cardToDiscard, undefined, false);
            renderHand();
          }
        }

        // デッキをシャッフルする
        shuffleArray(deck);
        updateDeckDisplay(o);
        await sleep(300);
      }
    }
  } else if (skillId === 'reinforce') {
    const count = skillValue || 1;
    playSkillSound('summon'); // 汎用の音
    if (cEl) createDamagePopup(cEl, '増援', '#facc15');

    const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;

    // AIはランダム、プレイヤーは手動選択のUIを待機
    const selectedHandIndices = await waitPlayerHandSelection(count, o);
    if (o === 'red' && selectedHandIndices && selectedHandIndices.length > 0) {
      // AIの思考時間を演出
      await sleep(AI_THINKING_DURATION);
    }
    let discardedCount = 0;

    if (selectedHandIndices && selectedHandIndices.length > 0) {
      // 降順ソートして削除のずれを防ぐ
      selectedHandIndices.sort((a, b) => b - a);
      for (let i of selectedHandIndices) {
        const discarded = h.splice(i, 1)[0];
        await discardCard(o, discarded);
        discardedCount++;
      }
    }

    if (discardedCount > 0) {
      const tokenId = `token_${c.baseId || c.id}`;
      let tC = CARD_MASTER.find((m) => m.id === tokenId);
      if (!tC) {
        tC = CARD_MASTER.find((m) => m.id === 'token_reinforce');
        if (!tC)
          tC = {
            id: 'token_reinforce',
            name: '増援',
            power: c.currentPower,
            rarity: c.rarity || 1,
            isToken: true,
            voiceCategory: c.voiceCategory,
            flavor: '呼び声に応え、現れた仲間。',
          };
      }

      for (let i = 0; i < discardedCount; i++) {
        const newToken = {
          id: `rf_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
          owner: o,
          ...tC,
          isToken: true,
          isPremium:
            c.isPremium !== undefined
              ? c.isPremium
              : GameState.premiumCards.includes(c.baseId || c.id),
          name: '増援',
          power: c.currentPower !== undefined ? c.currentPower : c.power || 0,
          currentPower:
            c.currentPower !== undefined ? c.currentPower : c.power || 0,
          basePower: c.basePower !== undefined ? c.basePower : c.power || 0,
          imgUrl: getCardImgUrl(c),
          filter: c.filter,
          rarity: c.rarity || 1,
          voiceCategory: c.voiceCategory,
          uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`,
        };
        h.push(newToken);
      }
      updateDeckDisplay(o);
      if (o === 'blue') renderHand();
    }
    await sleep(300);
  } else if (skillId === 'convert') {
    const val = skillValue || 1;
    const discardIndices = await waitPlayerHandSelection(val, o, true);
    if (o === 'red' && discardIndices && discardIndices.length > 0) {
      // AIの思考時間を演出
      await sleep(AI_THINKING_DURATION);
    }
    if (discardIndices && discardIndices.length > 0) {
      const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
      discardIndices.sort((a, b) => b - a);
      for (let idx of discardIndices) {
        const dropped = h.splice(idx, 1)[0];
        await discardCard(o, dropped);
      }
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      for (let i = 0; i < discardIndices.length; i++) {
        const newToken = {
          id: `void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
          owner: o,
          ...voidTpl,
          isToken: true,
          power: voidTpl.power ?? 0,
          basePower: voidTpl.power ?? 0,
          currentPower: voidTpl.power ?? 0,
          imgUrl: o === 'blue' ? getCardImgUrl(voidTpl) : '',
          rarity: 1,
          uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`,
        };
        h.push(newToken);
      }
      updateDeckDisplay(o);
      if (o === 'blue') renderHand();
    }
    await sleep(300);
  } else if (skillId === 'call') {
    const d = o === 'blue' ? GameState.playerDeck : GameState.enemyDeck;
    const hasTopCard = d.length > 0;
    const topCard = hasTopCard ? d[d.length - 1] : null;
    const isSuccess = hasTopCard && (topCard.power || 0) <= (skillValue || 3);

    // 1. まず「号令」ポップアップを出す（成功時は黄色、不発時は灰色）
    if (cEl) {
      const popupColor = isSuccess ? '#facc15' : '#94a3b8';
      createDamagePopup(cEl, '号令', popupColor);
    }

    // 2. 号令スキルのVFXを再生
    if (typeof window.triggerVfx === 'function') {
      await window.triggerVfx('anm_skill_call', o, l);
    } else {
      playSound(SOUNDS.seSkill);
      await sleep(150);
    }

    // 3. アニメーション完了後に、結果のカード名ポップアップを表示
    if (hasTopCard) {
      if (cEl) {
        const nameColor = isSuccess ? '#fbbf24' : '#94a3b8';
        createDamagePopup(cEl, topCard.name, nameColor);
      }

      if (isSuccess) {
        // デッキトップを取り出す
        d.pop();
        updateDeckDisplay(o);

        // キャンセル可能なレーン選択（ループによるやり直しに対応）
        let successCall = false;
        let targetLane = -1;
        while (!successCall) {
          GameState.placementMessage = `号令: 「${topCard.name}」を召喚するレーンを選んでください`;
          const selectedLanes = await waitPlayerLaneSelection(
            1,
            o,
            topCard,
            true,
            null,
            true,
            true,
            '召喚終了'
          );
          GameState.placementMessage = null;

          if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける

          if (!selectedLanes || selectedLanes.length === 0) {
            // レーン選択キャンセル（召喚終了）時は、デッキトップに戻してスキル終了
            d.push(topCard);
            updateDeckDisplay(o);
            return;
          }
          targetLane = selectedLanes[0];

          // 根本的リファクタリング：上書き確認
          const proceed = await confirmOverwrittenLane(
            o,
            topCard,
            targetLane,
            true // 号令は「召喚」扱いのため、制約チェックは true
          );
          if (!proceed) {
            await sleep(200);
            continue; // キャンセル時はレーン選択からやり直す
          }
          successCall = true;
        }

        if (targetLane !== -1) {
          const board =
            o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

          // 演出：号令による召喚の場合もアニメーションを再生
          await playSummonAnimation(topCard, o);

          const existingCard = board[targetLane];
          if (existingCard && hasSkill(existingCard, 'startup')) {
            // 起動消滅の特別処理
            existingCard.skills = existingCard.skills.filter(
              (s) => s.id !== 'startup' && s.id !== 'defender'
            );
            // デッキから出そうとしたカードは墓地に送る
            const discardPile =
              o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
            discardPile.push(topCard);

            const cEl = document.querySelector(
              `#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${targetLane}"] .card`
            );
            if (cEl) {
              createDamagePopup(cEl, '起動', '#facc15');
              playSound(SOUNDS.seSkill);
            }
          } else if (canEquipCard(topCard, board[targetLane])) {
            const targetCard = board[targetLane];

            targetCard.power = (targetCard.power || 0) + (topCard.power || 0);
            targetCard.basePower =
              (targetCard.basePower || 0) + (topCard.power || 0);
            targetCard.currentPower =
              (targetCard.currentPower || 0) + (topCard.power || 0);

            if (!targetCard.skills) {
              targetCard.skills =
                targetCard.skill && targetCard.skill !== 'none'
                  ? [{ id: targetCard.skill, value: targetCard.skillValue }]
                  : [];
              targetCard.skill = 'none';
            }
            const equipSkills = [];
            if (
              topCard.skill &&
              topCard.skill !== 'none' &&
              topCard.skill !== 'equip'
            ) {
              equipSkills.push({
                id: topCard.skill,
                value: topCard.skillValue,
              });
            }
            if (topCard.skills) {
              topCard.skills.forEach((s) => {
                if (s.id !== 'equip') equipSkills.push(s);
              });
            }
            mergeCardSkills(targetCard, equipSkills);

            // 【バグ修正】選択（choice）スキルがある場合は、装備元の選択肢（choices / choices2）を引き継ぐ
            if (topCard.choices && topCard.choices.length > 0) {
              targetCard.choices = targetCard.choices || [];
              topCard.choices.forEach((pc) => {
                const isDup = targetCard.choices.some(
                  (tc) =>
                    tc.id === pc.id &&
                    tc.value === pc.value &&
                    tc.choiceGroup === pc.choiceGroup
                );
                if (!isDup) targetCard.choices.push({ ...pc });
              });
            }
            if (topCard.choices2 && topCard.choices2.length > 0) {
              targetCard.choices2 = targetCard.choices2 || [];
              topCard.choices2.forEach((pc) => {
                const isDup = targetCard.choices2.some(
                  (tc) =>
                    tc.id === pc.id &&
                    tc.value === pc.value &&
                    tc.choiceGroup === pc.choiceGroup
                );
                if (!isDup) targetCard.choices2.push({ ...pc });
              });
            }

            // デッキから出た号令カードを対象にアタッチする
            targetCard.equippedCards = targetCard.equippedCards || [];
            targetCard.equippedCards.push(topCard);

            // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
            consumeArmSelf(targetCard, topCard);

            let callEvents = [];
            callEvents.push({
              type: 'summon_card',
              side: o,
              lane: targetLane,
              card: targetCard,
              source: 'equip',
            });
            await playEvents(callEvents);

            // 装備されたカードが持っていたアクティブスキルを即時発動させる
            for (const sk of equipSkills) {
              if (ACTIVE_SKILLS.includes(sk.id)) {
                await sleep(50);
                // 【バグ修正】選択スキルに装備元の選択肢情報を渡すため、enhancedSk オブジェクトを構築して渡す
                const enhancedSk = {
                  ...sk,
                  _sourceChoices: topCard.choices,
                  _sourceChoices2: topCard.choices2,
                };
                await resolveActiveSkillEffect(
                  o,
                  targetLane,
                  targetCard,
                  sk.id,
                  sk.value,
                  enhancedSk
                );
              }
            }
            await cleanupDestroyedCards(c);
          } else {
            topCard.uid = `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
            topCard.owner = o;

            // 根本的リファクタリング：配置の瞬間（代入の直前）に既存のカードを安全に墓地へ送る
            if (board[targetLane]) {
              if (
                !(await discardCard(o, board[targetLane], targetLane, false))
              ) {
                board[targetLane] = null;
              }
            }
            board[targetLane] = topCard;

            // 出現時スキルを持つ場合は即座に保護フラグを立てる
            if (hasActiveSkill(topCard)) {
              topCard.isSkillResolving = true;
            }

            let callEvents = [];

            callEvents.push({
              type: 'summon_card',
              side: o,
              lane: targetLane,
              card: topCard,
              source: 'call',
            });
            await playEvents(callEvents);

            if (hasActiveSkill(topCard)) {
              await resolveOnPlaySkill(o, targetLane, topCard);
            } else {
              topCard.isSkillResolving = false;
            }
            await cleanupDestroyedCards(c);
          }
        } else {
          // キャンセルされたのでデッキトップに戻す
          d.push(topCard);
          updateDeckDisplay(o);
        }
      } else {
        // 条件を満たさないため失敗時の待機
        await sleep(500);
      }
    } else {
      // デッキが空の場合の待機
      await sleep(500);
    }
  } else if (skillId === 'dominate') {
    // 【支配】召喚時、相手の場のパワーval以下のカード1枚を選び、自分のレーンに移動する。
    const maxPower = skillValue || 0;
    const oppOwner = o === 'blue' ? 'red' : 'blue';
    const oppBoard =
      o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
    const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

    // 自分側の正面レーン封印状態を取得
    const mySealedLanes =
      o === 'blue'
        ? GameState.playerSealedLanes || [0, 0, 0]
        : GameState.enemySealedLanes || [0, 0, 0];

    // 敵の場でパワーがmaxPower以下であり、かつ自分側の同じレーンが封印されていないカードがあるか
    const validOppLanes = [];
    for (let j = 0; j < 3; j++) {
      if (
        oppBoard[j] &&
        (oppBoard[j].currentPower ?? oppBoard[j].power ?? 0) <= maxPower &&
        (mySealedLanes[j] || 0) === 0 // 自分側の同じレーンが封印されていないこと！
      ) {
        validOppLanes.push(j);
      }
    }

    if (validOppLanes.length > 0) {
      let selectedOppLane = -1;

      if (
        o === 'red' &&
        GameState.gameMode !== 'online' &&
        GameState.gameMode !== 'pvp'
      ) {
        const pLanes = await waitPlayerEnemyLaneSelection(
          1,
          o,
          true,
          null,
          false,
          maxPower, // 支配できるパワー上限をフィルターとして適用
          validOppLanes // 【追加】選択可能なレーンを制限するための配列
        );
        if (pLanes && pLanes.length > 0) {
          selectedOppLane = pLanes[0];
        }
        // AIの思考時間を演出
        await sleep(AI_THINKING_DURATION);
      } else {
        // プレイヤーの場合
        const pLanes = await waitPlayerEnemyLaneSelection(
          1,
          o,
          true, // canCancel = true
          '相手のカードを1枚選んでください',
          false,
          maxPower, // 支配できるパワー上限をフィルターとして適用
          validOppLanes // 【追加】選択可能なレーンを制限するための配列
        );

        if (pLanes && pLanes.length > 0) {
          selectedOppLane = pLanes[0];
        }
      }

      if (selectedOppLane !== -1 && oppBoard[selectedOppLane]) {
        const selectedCard = oppBoard[selectedOppLane];
        const targetLane = selectedOppLane; // 選択したカードの正面（対面する同じレーン番号）！

        // 【最終安全ガード】移動先（自分側の正面レーン）が封印されている場合は支配不可（不発）にする
        if ((mySealedLanes[targetLane] || 0) > 0) {
          if (cEl) createDamagePopup(cEl, `封印により支配不可`, '#ef4444');
          await sleep(300);
          return;
        }

        // 支配する対象カードの中央にVFXを再生
        if (window.triggerVfx) {
          await window.triggerVfx('anm_skill_dominate', o, selectedOppLane);
        } else {
          playSound(SOUNDS.seSkillDominate);
        }

        // 相手のレーンから取り除く
        oppBoard[selectedOppLane] = null;
        updateDeckDisplay(oppOwner);

        // 移動するカードおよびその装備に「元の持ち主」を設定
        selectedCard.puppetOriginalOwner =
          selectedCard.puppetOriginalOwner || selectedCard.owner || oppOwner;
        if (
          selectedCard.equippedCards &&
          selectedCard.equippedCards.length > 0
        ) {
          selectedCard.equippedCards.forEach((eqCard) => {
            eqCard.puppetOriginalOwner =
              eqCard.puppetOriginalOwner || eqCard.owner || oppOwner;
          });
        }

        // 装備か通常配置か
        if (canEquipCard(selectedCard, board[targetLane])) {
          const targetCard = board[targetLane];
          targetCard.power =
            (targetCard.power || 0) + (selectedCard.power || 0);
          targetCard.basePower =
            (targetCard.basePower || 0) + (selectedCard.power || 0);
          targetCard.currentPower =
            (targetCard.currentPower || 0) + (selectedCard.power || 0);

          if (!targetCard.skills) {
            targetCard.skills =
              targetCard.skill && targetCard.skill !== 'none'
                ? [{ id: targetCard.skill, value: targetCard.skillValue }]
                : [];
            targetCard.skill = 'none';
          }
          const equipSkills = [];
          if (
            selectedCard.skill &&
            selectedCard.skill !== 'none' &&
            selectedCard.skill !== 'equip'
          ) {
            equipSkills.push({
              id: selectedCard.skill,
              value: selectedCard.skillValue,
            });
          }
          if (selectedCard.skills) {
            selectedCard.skills.forEach((s) => {
              if (s.id !== 'equip') equipSkills.push(s);
            });
          }
          mergeCardSkills(targetCard, equipSkills);

          targetCard.equippedCards = targetCard.equippedCards || [];
          targetCard.equippedCards.push(selectedCard);

          // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
          consumeArmSelf(targetCard, selectedCard);

          if (selectedCard?.voiceCategory) {
            playCardVoice(selectedCard, 'play');
          }
          playSound(SOUNDS.sePlace);
          renderBoard();
          await sleep(PLACE_ANIMATION_DURATION);
          await cleanupDestroyedCards(c);
        } else {
          const existingCard = board[targetLane];
          if (existingCard) {
            if (!(await discardCard(o, board[targetLane], targetLane, false))) {
              board[targetLane] = null;
            }
          }

          board[targetLane] = {
            ...selectedCard,
            owner: o,
            skillTriggered: true, // 配置扱いのため召喚時効果は不発
            stunTurns: selectedCard.stunTurns || 0,
            stunAppliedThisTurn: selectedCard.stunAppliedThisTurn || false,
          };

          if (hasActiveSkill(board[targetLane])) {
            board[targetLane].isSkillResolving = true;
          }

          if (board[targetLane]?.voiceCategory) {
            playCardVoice(board[targetLane], 'play');
          }
          playSound(SOUNDS.sePlace);
          renderBoard();
          await sleep(PLACE_ANIMATION_DURATION);
          if (board[targetLane]) board[targetLane].isSkillResolving = false;
          await cleanupDestroyedCards(c);
        }
      }
    }
    await sleep(300);
  } else if (skillId === 'cull') {
    // 【選別】召喚時、相手は自分の場のカードを指定枚数選び墓地に送る
    const oppOwner = o === 'blue' ? 'red' : 'blue';
    const oppBoard =
      o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;

    const occupiedLanes = oppBoard
      .map((bc, i) => (bc !== null ? i : -1))
      .filter((i) => i !== -1);

    const hasOppCard = occupiedLanes.length > 0;

    if (hasOppCard) {
      const valCount =
        skillValue === undefined || skillValue === 0 ? 1 : skillValue;
      const selectCount = Math.min(valCount, occupiedLanes.length);
      let selectedLanes = [];

      if (
        oppOwner === 'red' &&
        GameState.gameMode !== 'online' &&
        GameState.gameMode !== 'pvp'
      ) {
        // 相手がAIの場合：最もパワーの低いカードを自動選択（自分の損失を最小化）
        const sortedLanes = [...occupiedLanes].sort((a, b) => {
          const aImmune = hasSkill(oppBoard[a], 'immune');
          const bImmune = hasSkill(oppBoard[b], 'immune');
          if (aImmune && !bImmune) return -1;
          if (!aImmune && bImmune) return 1;

          const diff =
            (oppBoard[a].currentPower || 0) - (oppBoard[b].currentPower || 0);
          if (diff !== 0) return diff;
          return a - b;
        });
        selectedLanes = sortedLanes.slice(0, selectCount);
        // AIの思考時間を演出
        await sleep(AI_THINKING_DURATION);
        // React DOMコミットを確実にするため、再描画してから少し待つ
        renderBoard();
        await sleep(100);
      } else {
        // 相手がプレイヤーの場合：自分の場のカードを選択させる
        selectedLanes = await waitPlayerAlliedLaneSelection(
          selectCount,
          oppOwner
        );
      }

      if (selectedLanes && selectedLanes.length > 0) {
        // 選択された複数のカードを順次破壊する
        for (const targetLane of selectedLanes) {
          const targetCard = oppBoard[targetLane];
          if (targetCard) {
            // 「無効」を持つカードは破壊できない
            if (hasSkill(targetCard, 'immune')) {
              const tgtEl = document.querySelector(
                `#${oppOwner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${targetLane}"] .card`
              );
              if (tgtEl) createDamagePopup(tgtEl, '無効', '#94a3b8');
              playSound(SOUNDS.seSkill);
              await sleep(300);
            } else {
              // VFX演出（SEも triggerVfx 内で自動再生されます）
              if (typeof window.triggerVfx === 'function') {
                await window.triggerVfx('anm_skill_cull', o, targetLane);
              } else {
                playSound(SOUNDS.seDestroy);
              }
              const tgtEl = document.querySelector(
                `#${oppOwner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${targetLane}"] .card`
              );
              if (tgtEl) {
                tgtEl.classList.remove('anim-shake');
                void tgtEl.offsetWidth; // リフローを発生させてアニメーションを再トリガー
                tgtEl.classList.add('anim-shake');
                tgtEl.classList.add('anim-card-destroy');
                createDamagePopup(tgtEl, '破壊', '#991b1b');
              }
              if (targetCard.voiceCategory) {
                playCardVoice(targetCard, 'death');
              }
              await sleep(300);
              // discardCardで墓地送り（分裂・誘爆・装備・合体素材・石化・傀儡の完全処理）
              if (!(await discardCard(oppOwner, targetCard, targetLane, true)))
                oppBoard[targetLane] = null;
              renderBoard();
            }
          }
        }
      }
    }
  } else if (skillId === 'execute') {
    // 【処刑】召喚時、自分のカード1枚を選択し、そのカードを破壊する
    const myBoard = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    const hasMyCard = myBoard.some((bc) => bc !== null);

    if (hasMyCard) {
      let selectedLanes;
      if (
        o === 'red' &&
        GameState.gameMode !== 'online' &&
        GameState.gameMode !== 'pvp'
      ) {
        // AIの場合：アクションキューにあればそれを消費、なければ最もパワーの低い自分のカードを自動選択
        const aiAction = consumeAIAction('execute');
        if (
          aiAction &&
          aiAction.targetLane !== undefined &&
          myBoard[aiAction.targetLane] !== null
        ) {
          selectedLanes = [aiAction.targetLane];
        } else {
          const occupiedLanes = myBoard
            .map((bc, i) => (bc !== null ? i : -1))
            .filter((i) => i !== -1);
          occupiedLanes.sort((a, b) => {
            const aImmune = hasSkill(myBoard[a], 'immune');
            const bImmune = hasSkill(myBoard[b], 'immune');
            if (aImmune && !bImmune) return -1;
            if (!aImmune && bImmune) return 1;

            const diff =
              (myBoard[a].currentPower || 0) - (myBoard[b].currentPower || 0);
            if (diff !== 0) return diff;
            return a - b;
          });
          selectedLanes = occupiedLanes.length > 0 ? [occupiedLanes[0]] : [];
        }
        await sleep(AI_THINKING_DURATION);
        // React DOMコミットを確実にするため、再描画してから少し待つ
        renderBoard();
        await sleep(100);
      } else {
        // プレイヤーの場合：自分の場のカード1枚を選択させる
        selectedLanes = await waitPlayerAlliedLaneSelection(1, o);
      }

      if (selectedLanes && selectedLanes.length > 0) {
        const targetLane = selectedLanes[0];
        const targetCard = myBoard[targetLane];
        if (targetCard) {
          // 「無効」を持つカードは破壊できない
          if (hasSkill(targetCard, 'immune')) {
            const tgtEl = document.querySelector(
              `#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${targetLane}"] .card`
            );
            if (tgtEl) createDamagePopup(tgtEl, '無効', '#94a3b8');
            playSound(SOUNDS.seSkill);
            await sleep(300);
          } else {
            // VFX演出（SEも triggerVfx 内で自動再生されます）
            if (typeof window.triggerVfx === 'function') {
              await window.triggerVfx('anm_skill_execute', o, targetLane);
            } else {
              playSound(SOUNDS.seSkillExecute);
            }
            const tgtEl = document.querySelector(
              `#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${targetLane}"] .card`
            );
            if (tgtEl) {
              tgtEl.classList.remove('anim-shake');
              void tgtEl.offsetWidth; // リフローを発生させてアニメーションを再トリガー
              tgtEl.classList.add('anim-shake');
              tgtEl.classList.add('anim-card-destroy');
              createDamagePopup(tgtEl, '破壊', '#991b1b');
            }
            if (targetCard.voiceCategory) {
              playCardVoice(targetCard, 'death');
            }
            await sleep(300);
            // discardCardで墓地送り（分裂・誘爆・装備・合体素材・石化・傀儡の完全処理）
            if (!(await discardCard(o, targetCard, targetLane, true)))
              myBoard[targetLane] = null;
            renderBoard();
          }
        }
      }
    }
  } else if (skillId === 'grant_deadly' || skillId === 'grant_sturdy') {
    const isBlue = o === 'blue';
    const myBoard = isBlue ? GameState.playerBoard : GameState.enemyBoard;
    const targetSkill = skillId === 'grant_deadly' ? 'deadly' : 'sturdy';
    const side = isBlue ? 'player' : 'enemy';

    let activated = false;
    for (let i = 0; i < 3; i++) {
      const tc = myBoard[i];
      if (tc && tc !== c) {
        // 元々の能力を持たないカードを判定
        const originalCard = CARD_MASTER.find(
          (m) => m.id === (tc.baseId || tc.id)
        );
        const isVanilla = originalCard
          ? !originalCard.skills ||
            originalCard.skills.length === 0 ||
            originalCard.skills.every((s) => s.id === 'none')
          : !tc.skills ||
            tc.skills.length === 0 ||
            tc.skills.every((s) => s.id === 'none');
        if (isVanilla) {
          if (!tc.skills) {
            tc.skills = [];
          }
          // 'none' が入っている場合は消去する
          tc.skills = tc.skills.filter((s) => s.id !== 'none');

          // 重複付与を防ぐ（頑丈や必殺は最大1個まで）
          if (!tc.skills.some((s) => s.id === targetSkill)) {
            tc.skills.push({ id: targetSkill });

            // ポップアップなどの演出を各カードに表示
            const tEl = document.querySelector(
              `#${side}-lanes .cell[data-lane="${i}"] .card`
            );
            if (tEl) {
              createDamagePopup(
                tEl,
                targetSkill === 'deadly' ? '必殺' : '頑丈',
                '#c084fc'
              );
            }
            if (window.updateCardVisualsReact) {
              window.updateCardVisualsReact(i, side);
            }
            activated = true;
          }
        }
      }
    }

    if (activated) {
      playSound(SOUNDS.seSkill);
      if (window.updateBattleUIHook) {
        window.updateBattleUIHook();
      }
      await sleep(500);
    }
  } else {
    // 標準的なスキルは完全に Engine と Renderer に移譲
    let events = [];
    applyActiveSkillLogic(currentState, o, l, skillId, skillValue || 0, events);

    // エンジンのイベントによって状態と描画が同期される
    if (events.length > 0) {
      await playEvents(events);
      if (skillId === 'sacrifice' || skillId === 'sacrifice_void')
        checkWinCondition();
    }
  }
}

export async function triggerStartTurnPassive(owner, lane) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const side = owner === 'blue' ? 'player' : 'enemy';
  const c = board[lane];
  if (!c) return false;

  // invincible のターン処理等のために一度 Engine の全体処理を呼ぶべきだが、
  // 既存構成が「カードごとに順次再生」のため、一旦ここで個別評価し、
  // Renderer に流し込む。

  let triggered = false;
  let events = [];

  // Engine 内の個別処理を真似て状態更新ログを作成
  let skillsToResolve = Array.isArray(c.skills) ? [...c.skills] : [];

  for (const sk of skillsToResolve) {
    if (sk.id === 'growth') {
      const val = sk.value ?? 1;
      c.power += val; // RendererがcurrentPowerを処理するのでここはpowerのみアップ
      events.push({
        type: 'power_change',
        side: owner,
        lane,
        amount: val,
        source: 'growth',
      });
      triggered = true;
    }

    // 迎撃: ターン開始時に相手の最大パワーカードにダメージ
    if (sk.id === 'intercept') {
      const dmg = sk.value || 2;
      const eB =
        owner === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
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
        // 自分側にスキル発動のポップアップを出す
        events.push({
          type: 'skill_popup',
          side: owner,
          lane: lane,
          skillName: '迎撃',
        });

        if (canTakeDamage(eB[maxL], dmg)) {
          events.push({
            type: 'damage_card',
            side: owner === 'blue' ? 'red' : 'blue',
            lane: maxL,
            amount: dmg,
            source: 'intercept',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: owner === 'blue' ? 'red' : 'blue',
            lane: maxL,
            source: 'intercept',
          });
        }
      }
      triggered = true;
    }

    if (sk.id === 'invincible') {
      sk.value--;
      if (sk.value <= 0) {
        if (Array.isArray(c.skills)) {
          const idx = c.skills.indexOf(sk);
          if (idx !== -1) c.skills.splice(idx, 1);
        }
        const cEl = document.querySelector(
          `#${side}-lanes .cell[data-lane="${lane}"] .card`
        );
        if (cEl) {
          createDamagePopup(cEl, '無敵終了', '#94a3b8');
          await sleep(150);
        }
      }
      triggered = true;
    }

    if (sk.id === 'contract') {
      const val = sk.value || 3;
      // 自分側にスキル発動のポップアップを出す
      events.push({
        type: 'skill_popup',
        side: owner,
        lane: lane,
        skillName: '契約',
      });
      // HP減少はRenderer側で実施されるためここでは行わない
      events.push({
        type: 'damage_player',
        side: owner,
        amount: val,
        source: 'contract',
      });
      triggered = true;
    }

    if (sk.id === 'samsara') {
      const cEl = document.querySelector(
        `#${side}-lanes .cell[data-lane="${lane}"] .card`
      );
      if (cEl) {
        createDamagePopup(cEl, '輪廻', '#facc15');
      }
      playSkillSound('samsara');

      let processOrder = ['blue', 'red'];
      if (GameState.gameMode === 'online') {
        processOrder = getIsHost() ? ['blue', 'red'] : ['red', 'blue'];
      }

      // 1. お互いの手札を全て捨てる
      for (const p of processOrder) {
        const h = p === 'blue' ? GameState.playerHand : GameState.enemyHand;
        // 【システム解説】手札の末尾から1枚ずつ安全に取り出して捨てる。
        // 配列を一括でクリア（h.length = 0）してから非同期で捨てると、タイミングによってReactやオンライン同期で不整合が生じるため、
        // 1枚ずつ pop で取り出しながら破棄処理を await 実行します。
        while (h.length > 0) {
          const card = h.pop();
          if (card) {
            await discardCard(p, card, undefined, false);
          }
        }
      }

      updateDeckDisplay('blue');
      updateDeckDisplay('red');
      renderHand();
      await sleep(600);

      // 2. お互いにカードを3枚引く
      for (const p of processOrder) {
        for (let i = 0; i < 3; i++) {
          drawCard(p);
        }
      }

      updateDeckDisplay('blue');
      updateDeckDisplay('red');
      renderHand();
      await sleep(600);

      triggered = true;
    }

    if (sk.id === 'awake') {
      const val = sk.value || 1;
      // エンジンのロジックを流用してイベントを生成
      const currentState = {
        playerBoard: GameState.playerBoard.map((c) =>
          c ? JSON.parse(JSON.stringify(c)) : null
        ),
        enemyBoard: GameState.enemyBoard.map((c) =>
          c ? JSON.parse(JSON.stringify(c)) : null
        ),
        playerHP: GameState.playerHP,
        enemyHP: GameState.enemyHP,
        playerDiscard: GameState.playerDiscard,
        enemyDiscard: GameState.enemyDiscard,
        playerHand: GameState.playerHand,
        enemyHand: GameState.enemyHand,
        playerSealedLanes: GameState.playerSealedLanes,
        enemySealedLanes: GameState.enemySealedLanes,
      };

      let awakeEvents = [];
      applyActiveSkillLogic(
        currentState,
        owner,
        lane,
        'awake',
        val,
        awakeEvents
      );

      // 盤面の状態を同期
      if (owner === 'blue') {
        GameState.playerBoard = currentState.playerBoard;
      } else {
        GameState.enemyBoard = currentState.enemyBoard;
      }

      events.push(...awakeEvents);
      triggered = true;
      break; // カードが置換されたので、他のパッシブ処理を中断
    }
  }

  if (events.length > 0) {
    await playEvents(events);
    // パワーアップ等の結果、HP0以下のカードがあれば破壊（ボイス・揺れ演出を含む）
    await cleanupDestroyedCards();
  }

  return triggered;
}

/**
 * UI側での簒奪（強奪）発動用ヘルパー
 */
async function triggerExtortInAction(c, o) {
  if (!hasSkill(c, 'extort')) return;
  const val = getSkillValue(c, 'extort') || 1;
  const oppSide = o === 'blue' ? 'red' : 'blue';
  const eHandRef =
    oppSide === 'blue' ? GameState.playerHand : GameState.enemyHand;

  if (eHandRef && eHandRef.length > 0) {
    let discardedAmount = 0;

    // 【システム解説】
    // UI側での簒奪（extort）処理においても、相手の手札から「最大パワー」のカードを優先的に処理します。
    // 手札のカードをパワー降順（同値の場合は手札インデックスの小さい左側優先）でソートします。
    const validTargets = eHandRef
      .map((card, idx) => ({ card, idx }))
      .filter((item) => item.card !== null)
      .sort((a, b) => {
        const pA = a.card.currentPower ?? a.card.power ?? 0;
        const pB = b.card.currentPower ?? b.card.power ?? 0;
        if (pB !== pA) return pB - pA;
        return a.idx - b.idx; // 同値の場合は左優先
      });

    const actualCount = Math.min(val, validTargets.length);

    for (let i = 0; i < actualCount; i++) {
      const targetInfo = validTargets[i];
      const removeIdx = eHandRef.findIndex((card) => card === targetInfo.card);
      if (removeIdx === -1) continue;

      const discarded = eHandRef.splice(removeIdx, 1)[0];

      if (!discarded) {
        continue;
      }

      await discardCard(oppSide, discarded, undefined, false);

      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      const voidToken = {
        ...voidTpl,
        id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_extUI${i}`,
        uid: `${oppSide}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidextUI${i}`,
        baseId: 'token_void',
        power: voidTpl.power,
        currentPower: voidTpl.power,
        basePower: voidTpl.power,
        voiceCategory: voidTpl.voiceCategory || 'undead',
        isToken: true,
        isMorphToken: true,
      };
      eHandRef.push(voidToken);
      discardedAmount++;
    }

    if (discardedAmount > 0) {
      const lane =
        GameState.playerBoard.indexOf(c) !== -1
          ? GameState.playerBoard.indexOf(c)
          : GameState.enemyBoard.indexOf(c);
      const side = GameState.playerBoard.indexOf(c) !== -1 ? 'player' : 'enemy';
      if (lane !== -1) {
        const cEl = document.querySelector(
          `#${side}-lanes .cell[data-lane="${lane}"] .card`
        );
        if (cEl) createDamagePopup(cEl, '簒奪', '#facc15');
      }
      playSound(SOUNDS.seSkill);
      renderHand();
      await sleep(300);
    }
  }
}

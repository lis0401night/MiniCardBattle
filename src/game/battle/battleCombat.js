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
  applyEquipment,
  getSkillValue,
  getSeededRandom,
  playSound,
  createDamagePopup,
  sleep,
  hasSkill,
  isProtectedZeroPowerCard,
  shuffleArray,
  matchesUnionMaterial,
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
import {
  resolveActiveSkillEffect,
  handleStartupDispelled,
} from '../skillLogic.js';
import { trackMissionSacrifice, trackMissionPower } from '../missionLogic.js';
import { checkWinCondition } from './battleResult.js';
import {
  canEquipCard,
  confirmOverwrittenLane,
  waitPlayerHandSelection,
  waitPlayerLaneSelection,
} from './battleSelection.js';
import {
  CHAR_FORTUNE_HANDICAPS,
  HANDICAP_TYPES,
} from '../../utils/constants/fortuneHandicaps.js';
import { evaluateBestTriggerMove } from '../ai.js';

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
  const unionCard = {
    ...masterClone,
    uid: `union_${existingCard.uid || existingCard.id}_${consumedCard.uid || consumedCard.id}`,
    owner,
    baseId: masterClone.id,
    basePower: masterClone.power,
    currentPower: masterClone.power,
    // マスターデータのスキル配列をそのまま保持する（mergeCardSkills を使うと同名スキルの
    // value が合算されて snipe:2×3 → snipe:6×1 のように個数が潰れるため）
    skills: JSON.parse(JSON.stringify(masterClone.skills || [])),
    unionMaterials: [existingCard, consumedCard],
    isPremium: !!consumedCard.isPremium || !!existingCard.isPremium,
  };
  return unionCard;
}

export { applyEquipment };

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
    playerMaxHP: GameState.playerMaxHP,
    enemyMaxHP: GameState.enemyMaxHP,
    playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
    enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
    playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
    enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard)),
    // 封鎖レーン状態を常に3レーンで正規化する（外部データ由来の配列長不整合を防止）
    playerSealedLanes: Array.from(
      { length: 3 },
      (_, i) => GameState.playerSealedLanes?.[i] ?? 0
    ),
    enemySealedLanes: Array.from(
      { length: 3 },
      (_, i) => GameState.enemySealedLanes?.[i] ?? 0
    ),
    valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
    valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
  };
}

/**
 * 対象のカードが指定オーナーの盤面に召喚可能なレーンインデックスの配列を算出する。
 * 封印レーン、1ターン目先攻制約、伝説・生贄・頂点・挑戦の制約ルールを適用する。
 *
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {object} card - 召喚対象のカードオブジェクト
 * @param {object} [state=null] - 任意のゲーム状態/シミュレーション状態（省略時はGameStateを使用）
 * @returns {number[]} 召喚可能なレーンインデックスの配列 (0〜2)
 */
export function getValidSummonLanes(owner, card, state = null) {
  if (!card) return [];
  const s = state || GameState;
  const board = owner === 'blue' ? s.playerBoard : s.enemyBoard;
  const oppBoard = owner === 'blue' ? s.enemyBoard : s.playerBoard;
  const sealedLanes =
    owner === 'blue'
      ? s.playerSealedLanes || [0, 0, 0]
      : s.enemySealedLanes || [0, 0, 0];
  const turnCount =
    s.turnCount !== undefined ? s.turnCount : GameState.turnCount;
  const firstPlayer =
    s.firstPlayer !== undefined ? s.firstPlayer : GameState.firstPlayer;

  return [0, 1, 2].filter((l) => {
    // 封印レーンは絶対召喚不可
    if (sealedLanes[l] > 0) return false;

    // 1ターン目先攻制約（中央レーンのみ）
    if (turnCount === 1 && firstPlayer === owner && l !== 1) {
      return false;
    }

    // 伝説（中央レーンのみ）
    if (hasSkill(card, 'legendary') && l !== 1) {
      return false;
    }

    // 生贄（既に味方カードがあるレーンのみ）
    if (hasSkill(card, 'takeover') && board[l] === null) {
      return false;
    }

    // 頂点（自分の場の伝説カードの上のみ）
    if (
      hasSkill(card, 'apex') &&
      (!board[l] || !hasSkill(board[l], 'legendary'))
    ) {
      return false;
    }

    // 挑戦（正面に敵がいるレーンのみ）
    if (hasSkill(card, 'challenge') && oppBoard[l] === null) {
      return false;
    }

    return true;
  });
}

/**
 * 狂気スキルによるカード召喚を実行する。
 * 召喚演出、装備/上書き墓地送り、盤面配置、オンプレイスキル発動、クリーンアップを一括処理する。
 *
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {object} card - 召喚するカードオブジェクト
 * @param {number} targetLane - 召喚先レーンインデックス
 * @returns {Promise<void>}
 */
export async function executeMadnessSummon(owner, card, targetLane) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

  // 演出：召喚アニメーション
  await playSummonAnimation(card, owner);

  const existingCard = board[targetLane];
  if (existingCard && hasSkill(existingCard, 'startup')) {
    await handleStartupDispelled(owner, existingCard, targetLane, card);
  } else if (canEquipCard(card, board[targetLane])) {
    const targetCard = board[targetLane];
    const { equipSkills } = applyEquipment(targetCard, card);

    let events = [
      {
        type: 'summon_card',
        side: owner,
        lane: targetLane,
        card: targetCard,
        source: 'madness',
      },
    ];
    await playEvents(events);

    // 装備されたカードのアクティブスキル即時発動
    for (const sk of equipSkills) {
      if (ACTIVE_SKILLS.includes(sk.id)) {
        await sleep(50);
        const enhancedSk = {
          ...sk,
          _sourceChoices: card.choices,
          _sourceChoices2: card.choices2,
        };
        await resolveActiveSkillEffect(
          owner,
          targetLane,
          targetCard,
          sk.id,
          sk.value,
          enhancedSk
        );
      }
    }
    await cleanupDestroyedCards();
  } else {
    card.uid =
      card.uid ||
      `${owner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
    card.owner = owner;

    // 配置直前に既存カードを安全に墓地へ送る（上書き）
    if (board[targetLane]) {
      if (!(await discardCard(owner, board[targetLane], targetLane, false))) {
        board[targetLane] = null;
      }
    }
    board[targetLane] = card;

    if (hasActiveSkill(card)) {
      card.isSkillResolving = true;
    }

    let events = [
      {
        type: 'summon_card',
        side: owner,
        lane: targetLane,
        card: card,
        source: 'madness',
      },
    ];
    await playEvents(events);

    // 相手の誘発スキルチェック
    await checkAndTriggerCounter(owner, card, targetLane);

    if (hasActiveSkill(card)) {
      await resolveOnPlaySkill(owner, targetLane, card);
    } else {
      card.isSkillResolving = false;
    }
    await cleanupDestroyedCards();
  }
}

/**
 * 手札から捨てられたカードに対して「狂気（madness）」スキルを発動させる。
 * 召喚可能なレーンが存在する場合、プレイヤーまたはAIにレーンを選択させ、
 * 制約チェックを満たすレーンへ「召喚」する。
 * キャンセルされた場合や召喚可能レーンがない場合は墓地へ送るため false を返す。
 *
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {object} card - 破棄対象のカードオブジェクト
 * @returns {Promise<boolean>} 召喚に成功した場合は true、キャンセルまたは召喚不可の場合は false
 */
export async function triggerMadnessSkill(owner, card) {
  if (!card || !hasSkill(card, 'madness')) {
    return false;
  }

  // 召喚可能なレーンがあるかチェック
  const validLanes = getValidSummonLanes(owner, card);
  if (validLanes.length === 0) {
    return false;
  }

  let successCall = false;
  let targetLane = -1;

  if (
    owner === 'red' &&
    GameState.gameMode !== 'online' &&
    GameState.gameMode !== 'pvp'
  ) {
    if (GameState.aiDecision && GameState.aiDecision.cardTokenLanes) {
      delete GameState.aiDecision.cardTokenLanes;
    }
  }

  while (!successCall) {
    GameState.placementMessage = `狂気: 「${card.name}」を召喚するレーンを選んでください`;
    // AI（通常・ソロ対戦）の場合は「号令(call)」と同様に、現在の最新盤面を踏まえたリアルタイムシミュレーション
    // （evaluateBestLanesForToken）によって最善レーンを決定させるため、tokenLanes に null を渡す。
    // プレイヤーの場合は合法レーンのみをハイライト・選択制限するため validLanes を渡す。
    const targetTokenLanes =
      owner === 'red' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'pvp'
        ? null
        : validLanes;

    const selectedLanes = await waitPlayerLaneSelection(
      1,
      owner,
      card,
      false, // isLeaderSkill
      targetTokenLanes,
      true, // checkConstraints (召喚ルール制約チェック有効)
      true, // canCancel (キャンセル可能)
      '召喚完了', // buttonText
      true // _skipImmediateDiscard
    );
    GameState.placementMessage = null;

    if (GameState.gameMode !== 'online' && owner !== 'blue') {
      await sleep(600);
    }

    if (!selectedLanes || selectedLanes.length === 0) {
      // キャンセル時は召喚せず、通常の墓地送りへ進む
      return false;
    }

    targetLane = selectedLanes[0];

    // 上書き確認
    const proceed = await confirmOverwrittenLane(owner, card, targetLane);
    if (!proceed) {
      await sleep(200);
      continue;
    }
    successCall = true;
  }

  if (targetLane === -1) {
    return false;
  }

  // 召喚を実行
  await executeMadnessSummon(owner, card, targetLane);
  return true;
}

/**
 * 反魂スキルによるカード召喚を実行する。
 * 召喚演出、装備/上書き墓地送り、盤面配置、オンプレイスキル発動、クリーンアップを一括処理する。
 *
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {object} card - 召喚するカードオブジェクト
 * @param {number} targetLane - 召喚先レーンインデックス
 * @returns {Promise<void>}
 */
export async function executeReanimateSummon(owner, card, targetLane) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

  // 演出：召喚アニメーション
  await playSummonAnimation(card, owner);

  const existingCard = board[targetLane];
  if (existingCard && hasSkill(existingCard, 'startup')) {
    await handleStartupDispelled(owner, existingCard, targetLane, card);
  } else if (canEquipCard(card, board[targetLane])) {
    const targetCard = board[targetLane];
    const { equipSkills } = applyEquipment(targetCard, card);

    let events = [
      {
        type: 'summon_card',
        side: owner,
        lane: targetLane,
        card: targetCard,
        source: 'reanimate',
      },
    ];
    await playEvents(events);

    // 装備されたカードのアクティブスキル即時発動
    for (const sk of equipSkills) {
      if (ACTIVE_SKILLS.includes(sk.id)) {
        await sleep(50);
        const enhancedSk = {
          ...sk,
          _sourceChoices: card.choices,
          _sourceChoices2: card.choices2,
        };
        await resolveActiveSkillEffect(
          owner,
          targetLane,
          targetCard,
          sk.id,
          sk.value,
          enhancedSk
        );
      }
    }
    await cleanupDestroyedCards();
  } else {
    card.uid =
      card.uid ||
      `${owner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
    card.owner = owner;

    // 配置直前に既存カードを安全に墓地へ送る（上書き）
    if (board[targetLane]) {
      if (!(await discardCard(owner, board[targetLane], targetLane, false))) {
        board[targetLane] = null;
      }
    }
    board[targetLane] = card;

    if (hasActiveSkill(card)) {
      card.isSkillResolving = true;
    }

    let events = [
      {
        type: 'summon_card',
        side: owner,
        lane: targetLane,
        card: card,
        source: 'reanimate',
      },
    ];
    await playEvents(events);

    // 相手の誘発スキルチェック
    await checkAndTriggerCounter(owner, card, targetLane);

    if (hasActiveSkill(card)) {
      await resolveOnPlaySkill(owner, targetLane, card);
    } else {
      card.isSkillResolving = false;
    }
    await cleanupDestroyedCards();
  }
}

/**
 * デッキから墓地に送られたカードに対して「反魂（reanimate）」スキルを発動させる。
 * 召喚可能なレーンが存在する場合、プレイヤーまたはAIにレーンを選択させ、
 * 制約チェックを満たすレーンへ「召喚」する。
 * キャンセルされた場合や召喚可能レーンがない場合は墓地へ送るため false を返す。
 *
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {object} card - 破棄対象のカードオブジェクト
 * @returns {Promise<boolean>} 召喚に成功した場合は true、キャンセルまたは召喚不可の場合は false
 */
export async function triggerReanimateSkill(owner, card) {
  if (!card || !hasSkill(card, 'reanimate')) {
    return false;
  }

  // 召喚可能なレーンがあるかチェック
  const validLanes = getValidSummonLanes(owner, card);
  if (validLanes.length === 0) {
    return false;
  }

  let successCall = false;
  let targetLane = -1;

  if (
    owner === 'red' &&
    GameState.gameMode !== 'online' &&
    GameState.gameMode !== 'pvp'
  ) {
    if (GameState.aiDecision && GameState.aiDecision.cardTokenLanes) {
      delete GameState.aiDecision.cardTokenLanes;
    }
  }

  while (!successCall) {
    GameState.placementMessage = `反魂: 「${card.name}」を召喚するレーンを選んでください`;
    // AI（通常・ソロ対戦）の場合は「号令(call)」と同様に、現在の最新盤面を踏まえたリアルタイムシミュレーション
    // （evaluateBestLanesForToken）によって最善レーンを決定させるため、tokenLanes に null を渡す。
    // プレイヤーの場合は合法レーンのみをハイライト・選択制限するため validLanes を渡す。
    const targetTokenLanes =
      owner === 'red' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'pvp'
        ? null
        : validLanes;

    const selectedLanes = await waitPlayerLaneSelection(
      1,
      owner,
      card,
      false, // isLeaderSkill
      targetTokenLanes,
      true, // checkConstraints (召喚ルール制約チェック有効)
      true, // canCancel (キャンセル可能)
      '召喚完了', // buttonText
      true // _skipImmediateDiscard
    );
    GameState.placementMessage = null;

    if (GameState.gameMode !== 'online' && owner !== 'blue') {
      await sleep(600);
    }

    if (!selectedLanes || selectedLanes.length === 0) {
      // キャンセル時は召喚せず、通常の墓地送りへ進む
      return false;
    }

    targetLane = selectedLanes[0];

    // 上書き確認
    const proceed = await confirmOverwrittenLane(owner, card, targetLane);
    if (!proceed) {
      await sleep(200);
      continue;
    }
    successCall = true;
  }

  if (targetLane === -1) {
    return false;
  }

  // 召喚を実行
  await executeReanimateSummon(owner, card, targetLane);
  return true;
}

/**
 * 誘発（trigger）スキルによるカード召喚を実行する。
 * 召喚演出、装備/上書き墓地送り、盤面配置、オンプレイスキル発動、クリーンアップを一括処理する。
 *
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {object} card - 召喚するカードオブジェクト
 * @param {number} targetLane - 配置先レーン (0〜2)
 * @returns {Promise<void>}
 */
export async function executeTriggerSummon(owner, card, targetLane) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

  // 演出：召喚アニメーション
  await playSummonAnimation(card, owner);

  const existingCard = board[targetLane];
  if (existingCard && hasSkill(existingCard, 'startup')) {
    await handleStartupDispelled(owner, existingCard, targetLane, card);
  } else if (canEquipCard(card, board[targetLane])) {
    const targetCard = board[targetLane];
    const { equipSkills } = applyEquipment(targetCard, card);

    let events = [
      {
        type: 'summon_card',
        side: owner,
        lane: targetLane,
        card: targetCard,
        source: 'trigger',
      },
    ];
    await playEvents(events);

    // 装備されたカードのアクティブスキル即時発動
    for (const sk of equipSkills) {
      if (ACTIVE_SKILLS.includes(sk.id)) {
        await sleep(50);
        const enhancedSk = {
          ...sk,
          _sourceChoices: card.choices,
          _sourceChoices2: card.choices2,
        };
        await resolveActiveSkillEffect(
          owner,
          targetLane,
          targetCard,
          sk.id,
          sk.value,
          enhancedSk
        );
      }
    }
    await cleanupDestroyedCards();
  } else {
    card.uid =
      card.uid ||
      `${owner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
    card.owner = owner;

    // 配置直前に既存カードを安全に墓地へ送る（上書き）
    if (board[targetLane]) {
      if (!(await discardCard(owner, board[targetLane], targetLane, false))) {
        board[targetLane] = null;
      }
    }
    board[targetLane] = card;

    if (hasActiveSkill(card)) {
      card.isSkillResolving = true;
    }

    let events = [
      {
        type: 'summon_card',
        side: owner,
        lane: targetLane,
        card: card,
        source: 'trigger',
      },
    ];
    await playEvents(events);

    if (hasActiveSkill(card)) {
      await resolveOnPlaySkill(owner, targetLane, card);
    } else {
      card.isSkillResolving = false;
    }
    await cleanupDestroyedCards();
  }
}

let isTriggeringCounter = false;

/**
 * 相手がカードを召喚したとき、手札の「誘発（trigger）」スキルを持つカードを検知して召喚する。
 * 発動条件（パワーや特定スキル）は撤廃され、相手の召喚時に無条件で誘発可能。
 * 複数の誘発カードを所持している場合でも同時に召喚できるのは1枚のみであり、
 * プレイヤーまたはAIが出すカードを1枚選択する（キャンセル可能）。
 * 召喚に成功した場合、手札に「虚空（パワー0）」トークンを1枚追加する。
 *
 * @param {string} summonOwner - カードを召喚したプレイヤー ('blue' | 'red')
 * @param {object} summonedCard - 召喚されたカードオブジェクト
 * @param {number} [_summonedLane] - 召喚されたレーン番号（シミュレーション自律判定のため任意）
 * @returns {Promise<boolean>} 誘発による召喚が実行された場合は true
 */
export async function checkAndTriggerCounter(
  summonOwner,
  summonedCard,
  _summonedLane
) {
  if (!summonedCard || isTriggeringCounter) return false;

  const triggerOwner = summonOwner === 'blue' ? 'red' : 'blue';
  const triggerHand =
    triggerOwner === 'blue' ? GameState.playerHand : GameState.enemyHand;
  if (!triggerHand || triggerHand.length === 0) return false;

  // 手札に「誘発」スキルを持つカードが1枚もなければ何もしない
  const hasTrigger = triggerHand.some((c) => c && hasSkill(c, 'trigger'));
  if (!hasTrigger) return false;

  // かつ、召喚可能レーンが1つでもある誘発カードが少なくとも1枚存在するかチェック
  const validTriggerCards = triggerHand.filter(
    (c) =>
      c &&
      hasSkill(c, 'trigger') &&
      getValidSummonLanes(triggerOwner, c).length > 0
  );
  if (validTriggerCards.length === 0) return false;

  let selectedIdx = -1;
  let chosenLane = -1;

  isTriggeringCounter = true;
  try {
    if (
      triggerOwner === 'red' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'pvp'
    ) {
      // 【敵AIの場合】
      // 相手ターンの攻撃フェーズから次の自ターンの攻撃後までシミュレートし最善手（またはパス）を決定
      const decision = evaluateBestTriggerMove(validTriggerCards, triggerOwner);
      if (!decision || decision.cardIdx === -1 || decision.laneIdx === -1) {
        return false;
      }
      selectedIdx = decision.cardIdx;
      chosenLane = decision.laneIdx;
      await sleep(300);
    } else {
      // 【プレイヤーの場合（オンライン/PVPのターンプレイヤー含む）】
      while (true) {
        const promptMsg =
          '誘発: 召喚するカードを1枚選んでください（未選択完了でスキップ）';
        const arr = await waitPlayerHandSelection(
          1,
          triggerOwner,
          false,
          promptMsg
        );
        if (!arr || arr.length === 0) {
          // キャンセル（誘発しない）
          return false;
        }

        const sIdx = arr[0];
        const pickedCard = triggerHand[sIdx];

        if (!pickedCard || !hasSkill(pickedCard, 'trigger')) {
          if (typeof window.showAlertModal === 'function') {
            window.showAlertModal(
              '「誘発」スキルを持つカードのみ召喚できます。'
            );
          }
          await sleep(500);
          continue;
        }

        const validLanes = getValidSummonLanes(triggerOwner, pickedCard);
        if (validLanes.length === 0) {
          if (typeof window.showAlertModal === 'function') {
            window.showAlertModal('このカードを召喚できるレーンがありません。');
          }
          await sleep(500);
          continue;
        }

        GameState.placementMessage = `誘発: 「${pickedCard.name}」を召喚するレーンを選んでください`;
        const selectedLanes = await waitPlayerLaneSelection(
          1,
          triggerOwner,
          pickedCard,
          false, // isLeaderSkill
          validLanes, // tokenLanes
          true, // checkConstraints
          true, // canCancel
          'キャンセル', // buttonText
          true // _skipImmediateDiscard
        );
        GameState.placementMessage = null;

        if (!selectedLanes || selectedLanes.length === 0) {
          // レーン選択キャンセル時は手札選択に戻る
          await sleep(200);
          continue;
        }

        const candidateLane = selectedLanes[0];
        // 上書き確認
        const proceed = await confirmOverwrittenLane(
          triggerOwner,
          pickedCard,
          candidateLane
        );
        if (!proceed) {
          await sleep(200);
          continue;
        }

        selectedIdx = sIdx;
        chosenLane = candidateLane;
        break;
      }
    }

    if (selectedIdx === -1 || chosenLane === -1) return false;

    // 召喚確定：手札からカードを消費（1枚のみ）
    const consumedCard = triggerHand.splice(selectedIdx, 1)[0];

    // 手札に「虚空（パワー0）」トークンを追加
    const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
      name: '虚空',
      power: 0,
    };
    const voidToken = {
      ...voidTpl,
      id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_trigger`,
      uid: `${triggerOwner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_void_trigger`,
      baseId: 'token_void',
      filter: voidTpl.filter,
      power: voidTpl.power,
      currentPower: voidTpl.power,
      basePower: voidTpl.power,
      voiceCategory: voidTpl.voiceCategory || 'stone',
      isToken: true,
      isMorphToken: true,
    };
    triggerHand.push(voidToken);
    renderHand();
    await sleep(200);

    // 召喚を実行
    await executeTriggerSummon(triggerOwner, consumedCard, chosenLane);
    return true;
  } finally {
    isTriggeringCounter = false;
  }
}

/**
 * 手札から取り除かれたカード群を一括で墓地へ送り、
 * 狂気（madness）スキルを持つカードを安全に順次解決・召喚する共通関数。
 *
 * 1. 狂気を持たないカード、およびトークンを即座に墓地送り（または消滅）処理する。
 * 2. 狂気を持つカードは一旦保持し、手札・デッキの描画更新が行われた後、
 *    1枚ずつ狂気の召喚処理（triggerMadnessSkill）を実行する。
 * 3. 召喚がキャンセルされた、または盤面に空きがない狂気カードは通常通り墓地へ送る。
 *
 * @param {string} owner - カード所有者 ('blue' | 'red')
 * @param {object[]} cards - 手札から取り除かれた破棄対象カードの配列
 * @returns {Promise<object[]>} 実際に召喚された狂気カードの配列
 */
export async function discardCardsFromHand(owner, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return [];

  const madnessCards = [];
  const normalCards = [];

  for (const card of cards) {
    if (!card) continue;
    if (hasSkill(card, 'madness') && !card.isToken) {
      madnessCards.push(card);
    } else {
      normalCards.push(card);
    }
  }

  // 1. 通常カードを墓地へ送る（fromHand = false で呼ぶため狂気誤爆なし）
  for (const card of normalCards) {
    await discardCard(owner, card, undefined, false, false);
  }

  updateDeckDisplay(owner);
  if (owner === 'blue') renderHand();

  // 2. 狂気カードの召喚を1枚ずつ解決する
  const summonedCards = [];
  for (const madnessCard of madnessCards) {
    const isSummoned = await triggerMadnessSkill(owner, madnessCard);
    if (isSummoned) {
      summonedCards.push(madnessCard);
    } else {
      // キャンセルまたは召喚不可の場合は墓地へ送る
      await discardCard(owner, madnessCard, undefined, false, false);
    }
  }

  updateDeckDisplay(owner);
  if (owner === 'blue') renderHand();

  return summonedCards;
}

/**
 * デッキから取り除かれたカード群を一括で墓地へ送り、
 * 反魂（reanimate）スキルを持つカードを安全に順次解決・召喚する共通関数。
 *
 * 1. 反魂を持たないカード、およびトークンを即座に墓地送り（または消滅）処理する。
 * 2. 反魂を持つカードは一旦保持し、デッキ・墓地の描画更新が行われた後、
 *    1枚ずつ反魂の召喚処理（triggerReanimateSkill）を実行する。
 * 3. 召喚がキャンセルされた、または盤面に空きがない反魂カードは通常通り墓地へ送る。
 *
 * @param {string} owner - カード所有者 ('blue' | 'red')
 * @param {object[]} cards - デッキから取り除かれた破棄対象カードの配列
 * @returns {Promise<object[]>} 実際に召喚された反魂カードの配列
 */
export async function discardCardsFromDeck(owner, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return [];

  const reanimateCards = [];
  const normalCards = [];

  for (const card of cards) {
    if (!card) continue;
    if (hasSkill(card, 'reanimate') && !card.isToken) {
      reanimateCards.push(card);
    } else {
      normalCards.push(card);
    }
  }

  // 1. 通常カードを墓地へ送る
  for (const card of normalCards) {
    await discardCard(owner, card, undefined, false, false);
  }

  updateDeckDisplay(owner);

  // 2. 反魂カードの召喚を1枚ずつ解決する
  const summonedCards = [];
  for (const reanimateCard of reanimateCards) {
    const isSummoned = await triggerReanimateSkill(owner, reanimateCard);
    if (isSummoned) {
      summonedCards.push(reanimateCard);
    } else {
      // キャンセルまたは召喚不可の場合は墓地へ送る
      await discardCard(owner, reanimateCard, undefined, false, false);
    }
  }

  updateDeckDisplay(owner);

  return summonedCards;
}

/**
 * カードを墓地に送り、破棄アニメーション・音声・変身解除・ミッション進捗（生贄カウント）等を処理する。
 * 手札からの破棄時かつ「狂気」スキルを所持している場合は、レーンへの召喚処理を実行する。
 *
 * @param {string} owner - カード所有者 ('blue' | 'red')
 * @param {object} card - 破棄対象のカードオブジェクト
 * @param {number} [lane] - 破棄が行われたレーンインデックス
 * @param {boolean} [isDestroyed=true] - 破壊による破棄かどうかのフラグ
 * @param {boolean} [fromHand=false] - 手札からの破棄かどうかのフラグ
 * @returns {Promise<boolean>} 分裂等により盤面が既に置換済み、または狂気により召喚された場合は true
 */
export async function discardCard(
  owner,
  card,
  lane,
  isDestroyed = true,
  fromHand = false
) {
  // 防御: card が undefined/null の場合はエラーにならないようガード
  if (!card) {
    console.warn(
      '[discardCard] card は undefined/null です。スキップします。',
      { owner, lane }
    );
    return false;
  }

  // 手札から捨てられた時かつ「狂気」スキルを持つ場合、召喚を試行
  if (fromHand && hasSkill(card, 'madness')) {
    const isSummoned = await triggerMadnessSkill(owner, card);
    if (isSummoned) {
      // 狂気により召喚されたため、墓地追加は行わず正常終了
      return true;
    }
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
      // 合体素材が装備品を保持している場合は、先に装備品を墓地へ返却する
      if (matCard.equippedCards && matCard.equippedCards.length > 0) {
        for (const nestedEq of matCard.equippedCards) {
          const { card: restoredNested, owner: nestedOwner } =
            restoreCardForDiscard(nestedEq, owner);
          const nestedDiscardPile =
            nestedOwner === 'blue'
              ? GameState.playerDiscard
              : GameState.enemyDiscard;
          if (!restoredNested.isToken) {
            if (typeof window.stripEphemeralSkills === 'function') {
              window.stripEphemeralSkills(restoredNested);
            }
            nestedDiscardPile.push(restoredNested);
          }
        }
        matCard.equippedCards = [];
      }

      const { card: restoredMat, owner: matOwner } = restoreCardForDiscard(
        matCard,
        owner
      );
      const discardPile =
        matOwner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
      if (!restoredMat.isToken) {
        if (typeof window.stripEphemeralSkills === 'function') {
          window.stripEphemeralSkills(restoredMat);
        }
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
  playCardVoice(board[lane], 'play');
  const cEl = document.querySelector(
    `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${lane}"] .card`
  );
  if (cEl) createDamagePopup(cEl, '分裂', '#facc15');
  await sleep(PLACE_ANIMATION_DURATION);
}

/**
 * 味方カードが破壊された際に、同陣営の生存カードが持つ「報復（retaliate）」スキルを誘発する。
 * @param {string} owner - 破壊されたカードの所有者 ('blue' | 'red')
 */
export function triggerRetaliateSkill(owner) {
  const alliedBoard =
    owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const sideLabel = owner === 'blue' ? 'player' : 'enemy';

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
          !isProtectedZeroPowerCard(board[i])
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
    const retaliateOwners = [];
    for (const item of destroyedItems) {
      if (item.board[item.index] !== item.card) continue;
      item.board[item.index] = null;
      await discardCard(item.owner, item.card, item.index);
      retaliateOwners.push(item.owner);
    }

    // 報復（retaliate）スキルの誘発（盤面上の除去完了後に破壊された各カードの陣営ごとに実施）
    for (const owner of retaliateOwners) {
      triggerRetaliateSkill(owner);
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

        showSpeechBubble(owner, damage);
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
    if (unionSkill && matchesUnionMaterial(b[l], unionSkill)) {
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

  // 相手の手札の「誘発（trigger）」スキルチェック
  await checkAndTriggerCounter(o, c, l);

  // 出現時スキルの発動（単一または複数。沈黙等でスキルが消去された場合は発動しない）
  if (hasActiveSkill(c)) {
    await sleep(50); // React DOMコミット待機
    await resolveOnPlaySkill(o, l, c);
  } else {
    c.isSkillResolving = false;
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

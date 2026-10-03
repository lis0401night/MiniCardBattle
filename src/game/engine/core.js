/**
 * src/game/engine/core.js
 * Mini Card Battle - エンジン基本モジュール
 *
 * ダメージ・回復・ブロック・カード配置・破棄等の共通基本ロジックを管理します。
 */

import { CARD_MASTER } from '../../utils/constants/cards.js';
import { ACTIVE_SKILLS } from '../../utils/constants/skills.js';
import {
  applyEquipment,
  getSeededRandom,
  getSkillValue,
  hasSkill,
  resolveStartupFade,
} from '../../utils/gameUtils.js';
import {
  isValkyriaGuardActive,
  isMiasmaActive,
  processDestructionTriggers,
} from './passiveSkills.js';
import { applySingleCombat } from './combat.js';
import { applyActiveSkillLogic } from './activeSkills.js';

/** 神炎の審判のダメージ量および回復量 */
export const GOD_FLAME_AMOUNT = 3;
/** 断罪のクロスのダメージ量および回復量 */
export const CONDEMNATION_AMOUNT = 5;
/** 凶兆(portent)の強化基準HP。自分のリーダーHPがこの値を下回るほど強化される */
export const PORTENT_THRESHOLD_HP = 13;
/** ラグナロクの全体カードダメージ量 */
export const RAGNAROK_CARD_DAMAGE_AMOUNT = 2;

/** 覇道（supremacy）の発動条件となる、自身以外の味方カードの基本パワー下限 */
export const SUPREMACY_REQUIRED_BASE_POWER = 6;

/** ダメージブロック種別から演出イベント種別へのマッピング定数 */
export const BLOCK_TYPE_EVENT_MAP = {
  valkyria_guard: 'valkyria_guard_block',
  immune: 'immune_block',
  dodge: 'dodge_block',
};

/**
 * カードへのダメージのブロック判定を行い、ブロック時は対応するイベントを積む
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {Object} card - 対象カード
 * @param {number} amount - ダメージ量
 * @param {boolean} isSkill - スキルダメージかどうか
 * @param {string} side - カードの所有者 ('blue'|'red')
 * @param {number} lane - 対象レーン
 * @param {string|null} source - ダメージ発生源
 * @param {Array} events - イベントログ配列
 * @returns {boolean} ブロックされた場合は true
 */
export function pushDamageBlockEvent(
  state,
  card,
  amount,
  isSkill,
  side,
  lane,
  source,
  events
) {
  const blockType = getDamageBlockType(card, amount, isSkill, state, side);
  if (!blockType) return false;
  if (blockType === 'valkyria_guard') {
    events.push({
      type: 'valkyria_guard_block',
      side,
      lane,
      amount,
      source: source || undefined,
    });
  } else {
    events.push({
      type: BLOCK_TYPE_EVENT_MAP[blockType] || `${blockType}_block`,
      side,
      lane,
      source: source || undefined,
    });
  }
  return true;
}

/**
 * カードが受けるダメージのブロック理由（無効化原因）を取得する
 * ※ state は呼び出し側が必ず渡すこと（グローバル状態を参照するとAIシミュレーションが破綻するため）
 *
 * @param {Object} card - 対象カード
 * @param {number} amount - ダメージ量
 * @param {boolean} [isSkill=true] - スキルダメージかどうか
 * @param {Object} [state=null] - バトル状態オブジェクト
 * @param {string} [side=null] - カードの所有者 ('blue'|'red')。未指定時は card.owner
 * @returns {'valkyria_guard'|'immune'|'dodge'|null} ブロック種別（ダメージを受ける場合は null）
 */
export function getDamageBlockType(
  card,
  amount,
  isSkill = true,
  state = null,
  side = null
) {
  if (!card) return null;

  // 1. 戦乙女の加護（個別カードの加護または陣営全体の加護、最優先ブロック）
  if (card.valkyriaGuard || (card.valkyriaGuardTurns || 0) > 0) {
    return 'valkyria_guard';
  }
  const owner = side || card?.owner;
  if (owner && state && isValkyriaGuardActive(state, owner)) {
    return 'valkyria_guard';
  }

  // 2. スキルダメージ無効
  if (isSkill && hasSkill(card, 'immune')) {
    return 'immune';
  }

  // 3. 回避（スタンが付与されている場合は無効）
  const resVal = getSkillValue(card, 'dodge');
  if (resVal > 0 && amount >= resVal && (card.stunTurns || 0) === 0) {
    return 'dodge';
  }

  return null;
}

/**
 * カードがダメージを受けられるか（無効・回避・戦乙女の加護等で防がれないか）を判定する
 *
 * @param {Object} card - 対象カード
 * @param {number} amount - 与えるダメージ量
 * @param {boolean} [isSkill=true] - スキルダメージかどうか
 * @param {Object} [state=null] - バトル状態オブジェクト
 * @param {string} [side=null] - カードの所有者 ('blue'|'red')。未指定時は card.owner
 * @returns {boolean} ダメージを受けられるなら true、無効化・ガード中なら false
 */
export function canTakeDamage(
  card,
  amount,
  isSkill = true,
  state = null,
  side = null
) {
  return getDamageBlockType(card, amount, isSkill, state, side) === null;
}

/**
 * リーダーにダメージを与える
 */
export function damageLeader(state, side, amount, source, events, lane = null) {
  if (amount <= 0) return;

  // 戦乙女の加護: 全ダメージを無効化
  if (isValkyriaGuardActive(state, side)) {
    events.push({
      type: 'valkyria_guard_block',
      side,
      source,
      amount,
    });
    return;
  }

  // 通常通りリーダーダメージ
  if (side === 'blue') {
    state.playerHP = Math.max(0, state.playerHP - amount);
  } else {
    state.enemyHP = Math.max(0, state.enemyHP - amount);
  }

  events.push({
    type: 'damage_player',
    side: side,
    amount: amount,
    source: source,
    lane: lane,
  });
}

/**
 * リーダーHPの回復を適用する共通関数
 * 【瘴気】場に「瘴気」を持つカードが存在する場合、回復せず同量のダメージを受ける（戦乙女の加護も自動適用）。
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} side - 対象陣営 ('blue' | 'red')
 * @param {number} amount - 回復量
 * @param {string} source - 発生元スキルID（イベントの source に記録）
 * @param {Array} events - イベントログの追加先配列
 * @param {number|null} [lane=null] - 演出用のレーン番号
 */
export function healLeader(state, side, amount, source, events, lane = null) {
  if (amount <= 0) return;

  if (isMiasmaActive(state)) {
    // 瘴気: 回復する代わりに同じ値のダメージを受ける（damageLeader内で戦乙女の加護も自動判定）
    damageLeader(state, side, amount, source, events, lane);
    return;
  }

  if (side === 'blue') {
    state.playerHP = Math.min(state.playerMaxHP || 20, state.playerHP + amount);
  } else {
    state.enemyHP = Math.min(state.enemyMaxHP || 20, state.enemyHP + amount);
  }
  events.push({
    type: 'heal_player',
    side,
    amount,
    source,
    lane,
  });
}

/**
 * 戦闘処理中のローカル defHP に対して回復を適用する共通ヘルパー
 * ※ state.xxxHP を直接変更すると戦闘処理末尾の defHP 書き戻しで上書きされるため、更新後の defHP を戻り値で返す。
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {number} defHP - 現在の防御側リーダーHP
 * @param {string} defSide - 防御側陣営 ('blue' | 'red')
 * @param {number} maxHP - 防御側の最大HP
 * @param {number} amount - 回復量
 * @param {string} source - 発生元スキルID
 * @param {Array} events - イベントログの追加先配列
 * @param {number|null} [lane=null] - 演出用のレーン番号
 * @returns {number} 更新後の defHP
 */
export function healDefenderLeaderHP(
  state,
  defHP,
  defSide,
  maxHP,
  amount,
  source,
  events,
  lane = null
) {
  if (amount <= 0) return defHP;

  if (isMiasmaActive(state)) {
    // 瘴気: 回復する代わりに同じ値のダメージを受ける。戦乙女の加護は全ダメージを無効化する。
    if (isValkyriaGuardActive(state, defSide)) {
      events.push({
        type: 'valkyria_guard_block',
        side: defSide,
        amount,
        source,
      });
      return defHP;
    }
    events.push({
      type: 'damage_player',
      side: defSide,
      amount,
      source,
      lane,
    });
    return Math.max(0, defHP - amount);
  }

  events.push({
    type: 'heal_player',
    side: defSide,
    amount,
    source,
    lane,
  });
  return Math.min(maxHP || 20, defHP + amount);
}


/**
 * 盤面上のカードにダメージを適用し、各種ブロック（戦乙女の加護・無効/回避）およびダメージイベントを記録する共通関数
 *
 * 判定順序（加護優先）:
 * 1. 戦乙女の加護 (isValkyriaGuardActive) ➔ 'valkyria_guard_block' イベントを発行し終了
 * 2. ダメージ無効・回避 (canTakeDamage) ➔ 'immune_block' イベントを発行し終了
 * 3. 実際のダメージ適用 (currentPower 減算) ➔ 'damage_card' イベントを発行
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} side - 対象カードの所属陣営 ('blue' | 'red')
 * @param {number} lane - 対象カードのレーンインデックス (0 | 1 | 2)
 * @param {number} amount - 与えるダメージ量
 * @param {string} source - ダメージ発生源 (スキル名や効果識別子)
 * @param {Array} events - イベントログの追加先配列
 * @param {boolean} [isSkill=true] - スキルによるダメージかどうか (無効/回避判定で使用)
 * @returns {boolean} ダメージが実際にカードのPowerに適用された場合は true、ブロックまたは対象なしの場合は false
 */
export function damageCard(
  state,
  side,
  lane,
  amount,
  source,
  events,
  isSkill = true
) {
  if (amount <= 0) return false;

  const board = side === 'blue' ? state.playerBoard : state.enemyBoard;
  if (!board || lane < 0 || lane >= board.length) return false;

  const card = board[lane];
  if (!card) return false;

  // 1. 戦乙女の加護: 全ダメージを無効化
  if (
    card.valkyriaGuard ||
    (card.valkyriaGuardTurns || 0) > 0 ||
    isValkyriaGuardActive(state, side)
  ) {
    events.push({
      type: 'valkyria_guard_block',
      side,
      lane,
      amount,
      source,
    });
    return false;
  }

  // 2. ダメージ無効/回避チェック
  if (!canTakeDamage(card, amount, isSkill, state, side)) {
    events.push({
      type: 'immune_block',
      side,
      lane,
      source,
    });
    return false;
  }

  // 3. 実際のダメージ適用
  card.currentPower -= amount;
  card.hasTakenDamage = true;
  events.push({
    type: 'damage_card',
    side,
    lane,
    amount,
    source,
  });

  return true;
}

/**
 * Mini Card Battle - Core Game Engine
 * DOMや演出に依存しない、純粋な状態更新ロジック
 */

/**
 * 指定されたカード（およびその装備品・合体素材などの付属カード）を初期化して適切な墓地へ送る
 * （上書き配置、消滅、起動スキルによる破棄などで死亡時効果や破壊演出を起こさずに墓地へ送る共通処理）
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {Object} cardToSend - 墓地へ送る対象のカードオブジェクト
 * @param {string} fallBackOwner - 元の持ち主が不明な場合のデフォルトの所有者（'blue' | 'red'）
 * @returns {void}
 */
export function quietDiscardCard(state, cardToSend, fallBackOwner) {
  if (!cardToSend) return;

  // 単体カードを初期化して墓地に送る内部ヘルパー
  const sendSingleToGrave = (c, defaultOwner) => {
    if (c.isToken) return;
    let restoredCard;
    // 【傀儡】傀儡スキル等で奪ったカードは元の持ち主の墓地へ返す
    const cOwner = c.puppetOriginalOwner || c.owner || defaultOwner;
    const cDiscardPile =
      cOwner === 'blue' ? state.playerDiscard : state.enemyDiscard;
    const masterData = CARD_MASTER.find((m) => m.id === (c.baseId || c.id));
    if (masterData) {
      restoredCard = JSON.parse(JSON.stringify(masterData));
      restoredCard.uid = c.uid;
      restoredCard.owner = cOwner;
      restoredCard.baseId = c.baseId || c.id;
      if (c.isPremium !== undefined) restoredCard.isPremium = c.isPremium;
      restoredCard.basePower = restoredCard.power;
      restoredCard.currentPower = restoredCard.power;
    } else {
      restoredCard = { ...c };
      if ('basePower' in restoredCard)
        restoredCard.power = restoredCard.basePower;
      restoredCard.currentPower = restoredCard.power;
      restoredCard.skills = [];
      restoredCard.equippedCards = [];
      restoredCard.unionMaterials = [];
      if (restoredCard.puppetOriginalOwner)
        delete restoredCard.puppetOriginalOwner;
    }
    cDiscardPile.push(restoredCard);
  };

  // 1. 装備カードの返却
  if (cardToSend.equippedCards && cardToSend.equippedCards.length > 0) {
    cardToSend.equippedCards.forEach((eq) =>
      sendSingleToGrave(eq, fallBackOwner)
    );
    cardToSend.equippedCards = [];
  }

  // 2. 合体素材カード（および合体素材が持っていた装備品）の返却
  if (cardToSend.unionMaterials && cardToSend.unionMaterials.length > 0) {
    cardToSend.unionMaterials.forEach((mat) => {
      if (mat.equippedCards && mat.equippedCards.length > 0) {
        mat.equippedCards.forEach((nestedEq) =>
          sendSingleToGrave(nestedEq, fallBackOwner)
        );
        mat.equippedCards = [];
      }
      sendSingleToGrave(mat, fallBackOwner);
    });
    cardToSend.unionMaterials = [];
  }

  // 3. 変身元カード（originalRevertTarget）の返却
  if (cardToSend.originalRevertTarget) {
    sendSingleToGrave(cardToSend.originalRevertTarget, fallBackOwner);
  }

  // 4. 本体カードの返却
  sendSingleToGrave(cardToSend, fallBackOwner);
}

/**
 * 盤面のカードを静かに除外し、必要に応じてリセットして墓地へ送る
 * （上書き配置などのため、破壊演出の発動や死亡時効果を起こさない）
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} owner - 対象レーンの所有者（'blue' | 'red'）
 * @param {number} lane - レーンインデックス（0〜4）
 * @returns {void}
 */
export function quietDiscardFromBoard(state, owner, lane) {
  const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
  const targetCard = b[lane];

  if (!targetCard) return;

  quietDiscardCard(state, targetCard, owner);

  b[lane] = null;
}

let placementEvaluator = null;

/**
 * 盤面シミュレーション評価関数を登録する（ai_normal.js から依存性注入される）。
 * @param {function(object, 'blue' | 'red'): number} fn - 盤面総合評価関数 (state, owner) => score
 */
export function registerPlacementEvaluator(fn) {
  placementEvaluator = fn;
}

/**
 * シミュレーション内において、カードやトークンの最適な配置先レーンを決定する共通関数。
 * 各候補レーンにカードを配置した仮想盤面を作成（structuredClone による完全なディープコピー）し、
 * 戦闘フェーズおよびターン進行後の最終的な盤面評価スコア（evaluateTurnOutcome等）を客観的に比較して最善のレーンを選択・返却する。
 *
 * @param {object} state - シミュレーション中のゲーム状態
 * @param {'blue' | 'red'} owner - 配置を行う側のプレイヤー ('blue' | 'red')
 * @param {object} cardToPlace - 配置対象のカードまたはトークンオブジェクト
 * @param {Array<number>} [candidateLanes=[0, 1, 2]] - 候補レーン配列（分身の隣接制限など）
 * @param {boolean} [checkConstraints=false] - 召喚制約（伝説・生贄等）をチェックするか
 * @returns {number} 決定されたレーンインデックス (0〜2)、配置不可なら -1
 */
export function getBestSimulatedPlacementLane(
  state,
  owner,
  cardToPlace,
  candidateLanes = [0, 1, 2],
  checkConstraints = false
) {
  if (!state || !cardToPlace) return -1;
  const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
  const oppB = owner === 'blue' ? state.enemyBoard : state.playerBoard;
  const sealedLanes =
    owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;

  // 封印レーンの除外
  const validLanes = candidateLanes.filter(
    (l) => l >= 0 && l <= 2 && (!sealedLanes || sealedLanes[l] === 0)
  );
  if (validLanes.length === 0) return -1;

  // 制約チェックが必要な場合（召喚扱いの場合）
  const constrainedLanes = validLanes.filter((l) => {
    if (!checkConstraints) return true;
    if (hasSkill(cardToPlace, 'legendary') && l !== 1) return false;
    if (hasSkill(cardToPlace, 'takeover') && b[l] === null) return false;
    if (hasSkill(cardToPlace, 'challenge') && oppB[l] === null) return false;
    if (
      hasSkill(cardToPlace, 'apex') &&
      (!b[l] || !hasSkill(b[l], 'legendary'))
    )
      return false;
    return true;
  });
  if (constrainedLanes.length === 0) return -1;
  if (constrainedLanes.length === 1) return constrainedLanes[0];

  // 各候補レーンにカードを配置した仮想盤面を作成し、総合評価関数を実行して最もスコアが高いレーンを決定する
  let bestScore = -Infinity;
  let bestLane = constrainedLanes[0];

  for (const l of constrainedLanes) {
    // 正確なシミュレーションを行うため、親状態や他ノードへの参照汚染を防ぐ完全なディープコピーを行う
    const testState = structuredClone(state);
    testState.playerDiscard = testState.playerDiscard || [];
    testState.enemyDiscard = testState.enemyDiscard || [];
    testState.playerBoard = testState.playerBoard || [null, null, null];
    testState.enemyBoard = testState.enemyBoard || [null, null, null];
    testState.playerHP = testState.playerHP ?? 25;
    testState.enemyHP = testState.enemyHP ?? 25;
    testState.playerSealedLanes = testState.playerSealedLanes || [0, 0, 0];
    testState.enemySealedLanes = testState.enemySealedLanes || [0, 0, 0];

    const testCard = JSON.parse(JSON.stringify(cardToPlace));
    testCard.owner = owner;
    testCard.currentPower = testCard.currentPower ?? testCard.power ?? 0;
    testCard.basePower = testCard.basePower ?? testCard.power ?? 0;

    processPlacementOrEquip(testState, owner, l, testCard, 'sim_placement', []);

    // 奇襲（ambush）を持つトークンの場合、配置後の即時単体戦闘もシミュレート
    const targetB =
      owner === 'blue' ? testState.playerBoard : testState.enemyBoard;
    if (hasSkill(testCard, 'ambush') && targetB[l]) {
      targetB[l].isSkillResolving = false;
      applySingleCombat(testState, owner, l, []);
      processDestructionTriggers(testState, []);
    }

    let score;
    if (typeof placementEvaluator === 'function') {
      // evaluateTurnOutcome は常に red 視点のスコアを返すため、blue の配置評価では符号を反転する
      const rawScore = placementEvaluator(testState, owner);
      score = owner === 'blue' ? -rawScore : rawScore;
    } else {
      // フォールバック（評価関数未登録時）: 盤面の純粋な合計パワー差分
      const myPow = (
        owner === 'blue' ? testState.playerBoard : testState.enemyBoard
      ).reduce((sum, c) => sum + (c ? (c.currentPower ?? c.power ?? 0) : 0), 0);
      const oppPow = (
        owner === 'blue' ? testState.enemyBoard : testState.playerBoard
      ).reduce((sum, c) => sum + (c ? (c.currentPower ?? c.power ?? 0) : 0), 0);
      score = myPow - oppPow;
    }

    if (score > bestScore) {
      bestScore = score;
      bestLane = l;
    }
  }

  return bestLane;
}

export function processPlacementOrEquip(
  state,
  owner,
  lane,
  newCard,
  sourceAction,
  events
) {
  const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
  const existingCard = b[lane];
  const isEquip =
    hasSkill(newCard, 'equip') ||
    (existingCard && hasSkill(existingCard, 'arm_self'));
  const targetBlocksEquip =
    (existingCard &&
      (hasSkill(existingCard, 'possession') ||
        hasSkill(existingCard, 'reflect'))) ||
    hasSkill(newCard, 'possession') ||
    hasSkill(newCard, 'reflect');

  if (existingCard && hasSkill(existingCard, 'startup')) {
    const discardPile =
      owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
    if (!newCard.isToken) {
      discardPile.push(newCard);
    }
    resolveStartupFade(owner, existingCard, lane, newCard, events);
  } else if (isEquip && existingCard && !targetBlocksEquip) {
    applyEquipment(existingCard, newCard);

    events.push({
      type: 'power_change',
      side: owner,
      lane: lane,
      amount: newCard.appliedEquipPower ?? newCard.power,
      source: 'equip',
      card: newCard,
    });
  } else {
    if (existingCard) quietDiscardFromBoard(state, owner, lane);
    b[lane] = newCard;
    events.push({
      type: 'summon_token',
      side: owner,
      lane: lane,
      card: JSON.parse(JSON.stringify(newCard)),
      source: sourceAction,
    });
  }
}



/**
 * 手札から破棄されたカード群のシミュレーション処理を行う共通関数。
 * 実戦側の discardCardsFromHand と同じ挙動・仕様に基づき、通常カードを quietDiscardCard で初期化して墓地に送り、
 * 狂気（madness）を持つカードが存在する場合は召喚シミュレーションを実行する。
 *
 * @param {object} state - バトル状態オブジェクト
 * @param {'blue'|'red'} side - カードを破棄する陣営
 * @param {Array<object>} cards - 破棄対象の手札カード配列
 * @param {Array<object>} events - イベント配列
 * @returns {void}
 */
export function simulateDiscardCardsFromHand(state, side, cards, events = []) {
  if (!Array.isArray(cards) || cards.length === 0) return;

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

  // 1. 通常カードを初期化して墓地へ送る
  for (const card of normalCards) {
    quietDiscardCard(state, card, side);
    events.push({
      type: 'discard',
      side,
      card: JSON.parse(JSON.stringify(card)),
    });
  }

  // 2. 狂気（madness）カードの召喚シミュレーション
  for (const madnessCard of madnessCards) {
    // 召喚可能レーンの探索（制約チェック有効）
    const targetLane = getBestSimulatedPlacementLane(
      state,
      side,
      madnessCard,
      [0, 1, 2],
      true
    );

    if (targetLane !== -1) {
      madnessCard.uid =
        madnessCard.uid ||
        `${side}_sim_madness_${Math.floor(getSeededRandom() * 1000000000)}`;
      madnessCard.owner = side;
      madnessCard.currentPower =
        madnessCard.currentPower ?? madnessCard.power ?? 0;
      madnessCard.basePower = madnessCard.basePower ?? madnessCard.power ?? 0;

      processPlacementOrEquip(
        state,
        side,
        targetLane,
        madnessCard,
        'madness',
        events
      );

      // 召喚時スキル（オンプレイ能力）の解決
      const cardSkills = Array.isArray(madnessCard.skills)
        ? [...madnessCard.skills]
        : [];
      for (const sk of cardSkills) {
        if (!sk) continue;
        const skId = typeof sk === 'string' ? sk : sk.id;
        if (!ACTIVE_SKILLS.includes(skId)) continue;
        const skVal =
          typeof sk === 'object' && sk.value !== undefined ? sk.value : null;
        applyActiveSkillLogic(state, side, targetLane, skId, skVal, events);
      }
    } else {
      // 召喚不可の場合は通常通り墓地へ送る
      quietDiscardCard(state, madnessCard, side);
      events.push({
        type: 'discard',
        side,
        card: JSON.parse(JSON.stringify(madnessCard)),
      });
    }
  }
}



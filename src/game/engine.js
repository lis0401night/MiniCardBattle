import { getAIDiscardIndices } from '../utils/aiDiscardLogic.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  ACTIVE_SKILLS,
  FATE_ESTIMATED_DAMAGE,
  METAMORPH_ESTIMATED_POWER,
} from '../utils/constants/skills.js';
import { MAX_HAND_SIZE_DURING_TURN } from '../utils/constants/config.js';
import {
  applyEquipment,
  applyUnleashSkill,
  clearCardAbilities,
  getSeededRandom,
  getSkillValue,
  grantCardStatus,
  hasSkill,
  isProtectedZeroPowerCard,
  resolveCardSupremacySkills,
  resolveStartupFade,
  unmergeCardSkills,
  matchesCardId,
  matchesCardIds,
  matchesCardKeyword,
  matchesUnionMaterial,
  isCardInvincible,
  syncCardStatuses,
} from '../utils/gameUtils.js';

/** 戦乙女の加護の持続カウンター（発動後、次の自分のターン開始時スキル解決完了までを1とする） */
export const VALKYRIA_GUARD_TURNS = 1;

/** 神炎の審判のダメージ量および回復量 */
const GOD_FLAME_AMOUNT = 3;
/** 断罪のクロスのダメージ量および回復量 */
const CONDEMNATION_AMOUNT = 5;
/** 凶兆(portent)の強化基準HP。自分のリーダーHPがこの値を下回るほど強化される */
const PORTENT_THRESHOLD_HP = 13;
/** ラグナロクの全体カードダメージ量 */
const RAGNAROK_CARD_DAMAGE_AMOUNT = 2;

/** 覇道（supremacy）の発動条件となる、自身以外の味方カードの基本パワー下限 */
export const SUPREMACY_REQUIRED_BASE_POWER = 6;

/**
 * サイドに対応する戦乙女の加護カウンターのキー名を返す
 * @param {string} side - 対象サイド ('blue' または 'red')
 * @returns {string} 状態オブジェクトのキー名
 */
function getValkyriaGuardKey(side) {
  return side === 'blue' ? 'valkyriaGuardBlue' : 'valkyriaGuardRed';
}

/**
 * 指定サイドの戦乙女の加護状態を解除（クリア）する
 * 陣営全体の加護フラグを0にし、該当盤面にあるカードの個別加護フラグを削除してスキル枠と同期します。
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} side - 対象サイド ('blue' または 'red')
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
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} owner - 発動者サイド ('blue' | 'red')
 * @param {Array} events - イベントログ配列
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
 * @param {Object} state - バトル状態
 * @param {Object} card - 対象カード
 * @param {string} [side] - 対象カードの所有者 ('blue'|'red')。省略時は card.owner
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
 * 指定レーンが封印されているかを判定する共通関数
 * 【共通最優先ルール】封印されたレーンは「召喚」「配置」のどちらの手段であっても配置不可。
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
 * 破壊されたカードのクリーンアップと、破壊時スキルの処理を行う共通関数
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
      destroyedThisLoop.forEach(({ side }) => {
        const alliedBoard =
          side === 'blue' ? state.playerBoard : state.enemyBoard;
        alliedBoard.forEach((allyCard, j) => {
          if (allyCard && hasSkill(allyCard, 'retaliate')) {
            const buffVal = getSkillValue(allyCard, 'retaliate') || 2;
            allyCard.currentPower += buffVal;
            events.push({
              type: 'power_change',
              side,
              lane: j,
              amount: buffVal,
              source: 'retaliate',
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
 * @param {Object} state - 状態オブジェクト
 * @returns {boolean} 墓守が発動しているか
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
 * 配置時スキルの効果を適用する (純粋関数)
 *
 * =========================================================================
 * 【開発ガイドライン：エンジン側でのアクティブスキル実装統一ルール】
 *
 * AIの思考シミュレーション等で使用されるこの関数内では、描画・VFX演出に関連する処理を
 * 一切記述しないでください。
 * - 「events.push({ type: 'vfx_trigger', ... })」などは絶対に積まないでください。
 * - 純粋に盤面データの更新やリーダーHP、SPの計算のみを処理してください。
 * - 実画面での演出と適用処理は「src/game/skillLogic.js」内の個別ロジックで担当します。
 * =========================================================================
 *
 * @param {Object} state { b, eB, pHP, eHP, pSP, eSP, ... }
 * @param {string} owner 'blue' or 'red'
 * @param {number} l lane index
 * @param {string} sid skillId
 * @param {number} val skillValue
 * @param {Array} events - オプション of イベントログ配列
 * @returns {Array} 発生したイベントログ
 */
export function applyActiveSkillLogic(
  state,
  owner,
  l,
  sid,
  val,
  events = [],
  simulatedTokenLanes = null,
  simulatedLane = undefined
) {
  const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
  const eB = owner === 'blue' ? state.enemyBoard : state.playerBoard;
  const oppOwner = owner === 'blue' ? 'red' : 'blue';
  const c = b[l];
  // 自身（カードオブジェクト）が盤面に存在しないと解決できない（自己バフや自己付与、速攻、覚醒などの）スキル一覧
  const requiresCard = [
    'quick',
    'double_power',
    'decay',
    'hero',
    'adversity',
    'lone_wolf',
    'portent',
    'invade',
    'replicate',
    'standby',
    // 'deteriorate', // 【未実装】劣化能力は現時点では実装を見送り
    'stealth',
    'invincible',
    'buff_void',
    'buff',
    'inspire',
    'supremacy',
    'unleash',
    'awake',
    'awake_legendary',
    'metamorph',
    'assemble',
    'summon',
    'forge',
  ];
  if (!c && requiresCard.includes(sid)) return events;

  switch (sid) {
    case 'choice':
    case 'force':
      // 選択・命令スキル自体は純粋ロジックでは解決できない（上位のシミュレーション層で展開済みのため）
      break;
    case 'oblivion': {
      const myBoard = state.playerBoard;
      const oppBoard = state.enemyBoard;

      [myBoard, oppBoard].forEach((board, bIdx) => {
        const side = bIdx === 0 ? 'blue' : 'red';
        for (let i = 0; i < 3; i++) {
          const card = board[i];
          if (card) {
            clearCardAbilities(card);

            events.push({
              type: 'oblivion_clear',
              side,
              lane: i,
              card: JSON.parse(JSON.stringify(card)),
            });
          }
        }
      });
      break;
    }
    case 'silence': {
      const oppBoard = owner === 'blue' ? state.enemyBoard : state.playerBoard;
      const targetCard = oppBoard[l];
      if (targetCard) {
        clearCardAbilities(targetCard);

        events.push({
          type: 'silence_clear',
          side: owner === 'blue' ? 'red' : 'blue',
          lane: l,
          card: JSON.parse(JSON.stringify(targetCard)),
        });
      }
      break;
    }
    case 'hack': {
      const myOldSP = owner === 'blue' ? state.playerSP : state.enemySP;
      const oppOldSP = owner === 'blue' ? state.enemySP : state.playerSP;
      const totalSP = (myOldSP || 0) + (oppOldSP || 0);

      // 端数切り捨て（両者ともfloor）
      const myNewSP = Math.floor(totalSP / 2);
      const oppNewSP = Math.floor(totalSP / 2);

      if (owner === 'blue') {
        state.playerSP = myNewSP;
        state.enemySP = oppNewSP;
      } else {
        state.enemySP = myNewSP;
        state.playerSP = oppNewSP;
      }

      if (myNewSP !== myOldSP)
        events.push({
          type: 'charge_sp',
          side: owner,
          amount: myNewSP - myOldSP,
          lane: l,
          source: 'hack',
        });
      if (oppNewSP !== oppOldSP)
        events.push({
          type: 'charge_sp',
          side: oppOwner,
          amount: oppNewSP - oppOldSP,
          lane: l,
          source: 'hack',
        });
      break;
    }
    case 'seal': {
      // 召喚時、正面のレーンをvalターン封印する
      // 既存の封印ターン数と比較し、大きい方の値を維持・適用する
      const sealTurns = val || 1;
      if (owner === 'blue') {
        if (state.enemySealedLanes)
          state.enemySealedLanes[l] = Math.max(
            state.enemySealedLanes[l] || 0,
            sealTurns
          );
      } else {
        if (state.playerSealedLanes)
          state.playerSealedLanes[l] = Math.max(
            state.playerSealedLanes[l] || 0,
            sealTurns
          );
      }
      events.push({
        type: 'leader_skill',
        skill: 'seal',
        side: owner,
        targetLane: l,
        amount: sealTurns,
      }); // Use generic event or leader_skill format
      break;
    }
    case 'dominate': {
      const maxPower = val || 0;
      let bestOppLane = -1;
      let maxOppPower = -1;
      for (let j = 0; j < 3; j++) {
        if (eB[j]) {
          const p = eB[j].currentPower ?? eB[j].power ?? 0;
          if (p <= maxPower && p > maxOppPower) {
            maxOppPower = p;
            bestOppLane = j;
          }
        }
      }

      if (bestOppLane !== -1) {
        const stolenCard = eB[bestOppLane];
        const targetLane = bestOppLane; // 奪うカードの正面（対面する同じレーン番号）！

        eB[bestOppLane] = null;

        stolenCard.puppetOriginalOwner =
          stolenCard.puppetOriginalOwner || stolenCard.owner || oppOwner;
        if (stolenCard.equippedCards && stolenCard.equippedCards.length > 0) {
          stolenCard.equippedCards.forEach((eqCard) => {
            eqCard.puppetOriginalOwner =
              eqCard.puppetOriginalOwner || eqCard.owner || oppOwner;
          });
        }

        const existingCard = b[targetLane];
        // 合体（union）スキルは一度だけ解決して再利用する
        const unionSkill = Array.isArray(stolenCard.skills)
          ? stolenCard.skills.find((s) => s.id === 'union')
          : null;

        // 1. 起動（startup）判定
        if (existingCard && hasSkill(existingCard, 'startup')) {
          // 支配で奪ったカード（および装備品・合体素材など）は初期化して元の持ち主の墓地へ返す
          const stolenOwner = stolenCard.puppetOriginalOwner || oppOwner;
          quietDiscardCard(state, stolenCard, stolenOwner);
          resolveStartupFade(
            owner,
            existingCard,
            targetLane,
            stolenCard,
            events
          );
        } else if (
          existingCard &&
          unionSkill &&
          matchesUnionMaterial(existingCard, unionSkill)
        ) {
          // 2. 合体（union）判定
          const mergedCard = CARD_MASTER.find(
            (mc) => mc.id === unionSkill.summonId
          );
          if (mergedCard) {
            const newInstance = JSON.parse(JSON.stringify(mergedCard));
            newInstance.uid = `${owner}_union_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`;
            newInstance.baseId = mergedCard.id;
            newInstance.owner = owner;
            newInstance.basePower = mergedCard.power;
            newInstance.currentPower = mergedCard.power;
            newInstance.skillTriggered = true; // 支配による配置のため召喚時スキルは不発
            newInstance.stunTurns = 0;
            newInstance.stunAppliedThisTurn = false;
            newInstance.unionMaterials = [
              JSON.parse(JSON.stringify(existingCard)),
              JSON.parse(JSON.stringify(stolenCard)),
            ];
            b[targetLane] = newInstance;
            events.push({
              type: 'summon_card',
              side: owner,
              lane: targetLane,
              card: newInstance,
              source: 'union',
            });
          }
        } else if (
          existingCard &&
          (hasSkill(stolenCard, 'equip') ||
            hasSkill(existingCard, 'arm_self')) &&
          !hasSkill(existingCard, 'possession') &&
          !hasSkill(stolenCard, 'possession') &&
          !hasSkill(existingCard, 'reflect') &&
          !hasSkill(stolenCard, 'reflect')
        ) {
          // 3. 装備判定
          const targetCard = existingCard;
          applyEquipment(targetCard, stolenCard);

          events.push({
            type: 'summon_card',
            side: owner,
            lane: targetLane,
            card: targetCard,
            source: 'equip',
          });
        } else {
          // 4. 通常破棄配置
          if (existingCard) {
            events.push({
              type: 'deadly',
              side: owner,
              lane: targetLane,
              source: 'overwrite',
            });
            // 上書きされる既存カードを墓地へ送る（装備・合体素材・傀儡の帰属も処理される）
            quietDiscardFromBoard(state, owner, targetLane);
          }

          b[targetLane] = {
            ...stolenCard,
            owner: owner,
            skillTriggered: true,
            stunTurns: stolenCard.stunTurns || 0,
            stunAppliedThisTurn: stolenCard.stunAppliedThisTurn || false,
          };

          events.push({
            type: 'summon_card',
            side: owner,
            lane: targetLane,
            card: b[targetLane],
            source: 'dominate',
          });
        }
      }
      break;
    }
    case 'buff_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウントするため matchesCardId を使用
      const voidCount = hand
        ? hand.filter((card) => card && matchesCardId(card, 'token_void'))
            .length
        : 0;
      if (voidCount > 0) {
        const bonus = (val || 0) * voidCount;
        c.currentPower += bonus;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: bonus,
          source: sid || 'buff_void',
        });
      }
      break;
    }
    case 'snipe_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウントするため matchesCardId を使用
      const voidCount = hand
        ? hand.filter((card) => card && matchesCardId(card, 'token_void'))
            .length
        : 0;
      if (voidCount > 0) {
        const baseDmg = val || 4;
        const totalDmg = baseDmg * voidCount;
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
          damageCard(
            state,
            oppOwner,
            maxL,
            totalDmg,
            'snipe_void',
            events,
            true
          );
        }
      }
      break;
    }
    case 'heal_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウントするため matchesCardId を使用
      const voidCount = hand
        ? hand.filter((card) => card && matchesCardId(card, 'token_void'))
            .length
        : 0;
      if (voidCount > 0) {
        const hAmt = (val || 3) * voidCount;
        healLeader(state, owner, hAmt, 'heal_void', events);
      }
      break;
    }
    case 'support_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウントするため matchesCardId を使用
      const voidCount = hand
        ? hand.filter((card) => card && matchesCardId(card, 'token_void'))
            .length
        : 0;
      if (voidCount > 0) {
        const adjVal = (val || 2) * voidCount;
        const sAdj = l === 1 ? [0, 2] : [1];
        sAdj.forEach((j) => {
          if (b[j]) {
            b[j].currentPower += adjVal;
            events.push({
              type: 'power_change',
              side: owner,
              lane: j,
              amount: adjVal,
              source: 'support_void',
            });
          }
        });
      }
      break;
    }
    case 'support': {
      const sAdj = l === 1 ? [0, 2] : [1];
      sAdj.forEach((j) => {
        if (b[j]) {
          const adjVal = val || 2;
          b[j].currentPower += adjVal;
          events.push({
            type: 'power_change',
            side: owner,
            lane: j,
            amount: adjVal,
            source: 'support',
          });
        }
      });
      break;
    }
    case 'replicate': {
      let maxOtherPower = 0;
      b.forEach((x, idx) => {
        if (idx !== l && x !== null) {
          if (x.currentPower > maxOtherPower) maxOtherPower = x.currentPower;
        }
      });
      if (maxOtherPower > 0) {
        c.currentPower += maxOtherPower;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: maxOtherPower,
          source: 'replicate',
        });
      }
      break;
    }
    case 'hero': {
      const occ = b.filter((x, idx) => x !== null && idx !== l).length;
      const hVal = occ * (val || 3);
      if (hVal > 0) {
        c.currentPower += hVal;
      }
      break;
    }
    case 'adversity': {
      const opOcc = eB.filter((x) => x !== null).length;
      const advVal = opOcc * (val || 1);
      if (advVal !== 0) {
        c.currentPower += advVal;
      }
      break;
    }
    case 'lone_wolf': {
      const empty = b.filter((x) => x === null).length;
      const wVal = empty * (val || 3);
      if (wVal > 0) {
        c.currentPower += wVal;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: wVal,
          source: 'lone_wolf',
        });
      }
      break;
    }
    case 'portent': {
      const currentHp =
        owner === 'blue' ? state?.playerHP || 0 : state?.enemyHP || 0;
      const bonus = Math.max(0, PORTENT_THRESHOLD_HP - currentHp);
      if (bonus > 0) {
        c.currentPower += bonus;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: bonus,
          source: 'portent',
        });
      }
      break;
    }
    case 'invade': {
      const discard =
        owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
      const uniqueTypes = new Set(
        (discard || []).map((card) => card.baseId || card.id)
      ).size;
      const powerDiff = uniqueTypes;
      if (powerDiff !== 0) {
        c.currentPower += powerDiff;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: powerDiff,
          source: 'invade',
        });
      }
      break;
    }
    case 'buff': {
      // 【「強化」スキル処理】
      // 召喚時、自身のパワーを+valする
      const bVal = val || 1;
      if (bVal !== 0) {
        c.currentPower += bVal;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: bVal,
          source: 'buff',
        });
      }
      break;
    }
    case 'inspire': {
      // 【「鼓舞」スキル処理】
      // 召喚時、自分の場の自身以外のカード1体を選択してパワーを+valする
      const bVal = val || 1;
      if (bVal !== 0) {
        const otherOccupiedLanes = b
          .map((targetCard, laneIdx) =>
            targetCard !== null && laneIdx !== l ? laneIdx : -1
          )
          .filter((idx) => idx !== -1);

        if (otherOccupiedLanes.length > 0) {
          // パワーが最も高いカードを優先（同値なら左レーン優先）
          otherOccupiedLanes.sort((laneA, laneB) => {
            const diff =
              (b[laneB].currentPower || 0) - (b[laneA].currentPower || 0);
            if (diff !== 0) return diff;
            return laneA - laneB;
          });
          const targetLane = otherOccupiedLanes[0];
          b[targetLane].currentPower += bVal;
          events.push({
            type: 'power_change',
            side: owner,
            lane: targetLane,
            amount: bVal,
            source: 'inspire',
          });
        }
      }
      break;
    }
    case 'supremacy': {
      // 召喚時、自分の場に自身以外の元々のパワー（基本パワー）が6以上のカードが存在する場合にサブスキルを発動
      const hasOriginal6Plus = b.some((tc, laneIdx) => {
        if (!tc || laneIdx === l) return false;
        const master = CARD_MASTER.find((m) => m.id === (tc.baseId || tc.id));
        const origPower = master?.power ?? tc.power ?? 0;
        return origPower >= SUPREMACY_REQUIRED_BASE_POWER;
      });

      if (hasOriginal6Plus) {
        const supSkills = resolveCardSupremacySkills(c);
        if (Array.isArray(supSkills) && supSkills.length > 0) {
          for (const subSk of supSkills) {
            applyActiveSkillLogic(
              state,
              owner,
              l,
              subSk.id,
              subSk.value,
              events,
              simulatedTokenLanes,
              simulatedLane
            );
          }
        }
      }
      break;
    }
    case 'unleash': {
      // 召喚時、自身の防御能力を除去し、スタン状態・バッジを完全解除する
      applyUnleashSkill(c);
      events.push({
        type: 'unleash',
        side: owner,
        lane: l,
        source: 'unleash',
      });
      break;
    }
    case 'double_power': {
      const dpVal = c.currentPower || 0;
      if (dpVal > 0) {
        c.currentPower += dpVal;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: dpVal,
          source: 'double_power',
        });
      }
      break;
    }
    case 'explore': {
      const myDeckSim = owner === 'blue' ? state.playerDeck : state.enemyDeck;
      const myHandSim = owner === 'blue' ? state.playerHand : state.enemyHand;
      if (myDeckSim && myDeckSim.length > 0) {
        // シミュレーション：デッキから最も強いカードを引き、手札の最も弱いカードと入れ替える
        let validCards = myDeckSim.filter((card) => card !== undefined);

        const exploreSkill = c?.skills?.find((s) => s.id === 'explore');
        const targetIds = Array.isArray(exploreSkill?.targetIds)
          ? exploreSkill.targetIds
          : exploreSkill?.targetId
            ? [exploreSkill.targetId]
            : [];
        const targetKeyword = exploreSkill?.targetKeyword;

        if (targetIds.length > 0) {
          validCards = validCards.filter((card) =>
            matchesCardIds(card, targetIds)
          );
        } else if (typeof targetKeyword === 'string' && targetKeyword) {
          validCards = validCards.filter((card) =>
            matchesCardKeyword(card, targetKeyword)
          );
        }

        if (validCards.length > 0) {
          const mP = Math.max(...validCards.map((c) => c.power || 0));
          const bestCards = validCards.filter((c) => (c.power || 0) === mP);
          const bestCard =
            bestCards[Math.floor(getSeededRandom() * bestCards.length)];
          const idx = myDeckSim.findIndex(
            (card) =>
              (bestCard.uid && card.uid === bestCard.uid) ||
              card === bestCard ||
              card.id === bestCard.id ||
              (Boolean(bestCard.baseId) &&
                (card.baseId === bestCard.baseId ||
                  card.id === bestCard.baseId))
          );
          if (idx !== -1) myDeckSim.splice(idx, 1);

          myHandSim.push({
            ...bestCard,
            uid: `${owner}_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          });
          events.push({ type: 'draw', side: owner, source: 'explore' });

          if (myHandSim.length > 0) {
            const dropIndices = getAIDiscardIndices(myHandSim, 1);
            if (dropIndices.length > 0) {
              const dIdx = dropIndices[0];
              myHandSim.splice(dIdx, 1);
            }
          }
        }
      }
      break;
    }
    case 'morph': {
      const eHandRef = owner === 'blue' ? state.enemyHand : state.playerHand;
      if (eHandRef && eHandRef.length > 0) {
        const count = Number(val) || 1;

        // 対象となるカードを抽出し、パワーの降順（同値なら左＝インデックス小が優先）でソート
        const validTargets = eHandRef
          .map((card, idx) => ({ card, idx }))
          .filter((item) => item.card !== null)
          .sort((a, b) => {
            const pA = a.card.currentPower ?? a.card.power ?? 0;
            const pB = b.card.currentPower ?? b.card.power ?? 0;
            if (pB !== pA) return pB - pA;
            return a.idx - b.idx; // インデックスが小さい方を優先
          });

        const actualCount = Math.min(count, validTargets.length);
        const newTokens = [];
        console.log(
          `[DEBUG] morph executed. val(skillValue): ${val}, count: ${count}, validTargets length: ${validTargets.length}, actualCount: ${actualCount}`
        );

        for (let i = 0; i < actualCount; i++) {
          const targetInfo = validTargets[i];
          // eHandRef から対象カードを探して削除
          // （※途中で削除するとインデックスがずれるため、一意なプロパティで検索するか、あるいは直接オブジェクト参照で削除する）
          const removeIdx = eHandRef.findIndex((c) => c === targetInfo.card);
          if (removeIdx !== -1) {
            const discarded = eHandRef.splice(removeIdx, 1)[0];
            const eD =
              owner === 'blue' ? state.enemyDiscard : state.playerDiscard;
            if (eD && !discarded.isToken) {
              const masterData = CARD_MASTER.find(
                (m) => m.id === (discarded.baseId || discarded.id)
              );
              if (masterData) {
                const restoredCard = JSON.parse(JSON.stringify(masterData));
                restoredCard.uid = discarded.uid;
                restoredCard.owner = oppOwner;
                restoredCard.baseId = discarded.baseId || discarded.id;
                if (discarded.isPremium !== undefined)
                  restoredCard.isPremium = discarded.isPremium;
                restoredCard.basePower = restoredCard.power;
                restoredCard.currentPower = restoredCard.power;
                eD.push(restoredCard);
              } else {
                eD.push({
                  ...discarded,
                  currentPower: discarded.basePower || discarded.power,
                  skills: [],
                });
              }
            }
            events.push({
              type: 'discard',
              side: oppOwner,
              card: JSON.parse(JSON.stringify(discarded)),
            });

            const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
              name: '虚空',
              power: 0,
            };
            const voidToken = {
              ...voidTpl,
              id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_vp${i}`,
              uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidvp${i}`,
              baseId: 'token_void',
              filter: voidTpl.filter,
              power: voidTpl.power,
              currentPower: voidTpl.power,
              basePower: voidTpl.power,
              voiceCategory: voidTpl.voiceCategory || 'undead',
              isToken: true,
              isMorphToken: true,
            };
            newTokens.push(voidToken);
            events.push({
              type: 'add_hand',
              side: oppOwner,
              card: voidToken,
              source: 'morph',
            });
          }
        }
        newTokens.forEach((t) => eHandRef.push(t));
      }
      break;
    }
    case 'toxic':
      if (eB[l]) {
        const toxVal = val || 1;
        // 【有毒スキル: 腐食状態の付与】
        // 成長スキルの付与ではなく独立した「腐食（corrosion）」状態を付与する。
        // 重ね掛け時はBの仕様（高い方を優先、Math.max）で管理し、スロット順に追加
        grantCardStatus(eB[l], 'corrosion', toxVal);
        events.push({
          type: 'add_status',
          side: oppOwner,
          lane: l,
          status: 'corrosion',
          value: eB[l].corrosion,
          source: 'toxic',
        });
      }
      break;
    /*
    // 【未実装】劣化能力は現時点では実装を見送り
    case 'deteriorate': {
      const pVal = val || 1;
      // 【劣化スキル: 自身の腐食状態付与】
      // 召喚時、自身に腐食を付与する。Bの仕様（高い方を優先、Math.max）で管理し、スロット順に追加
      grantCardStatus(c, 'corrosion', pVal);
      events.push({
        type: 'add_status',
        side: owner,
        lane: l,
        status: 'corrosion',
        value: c.corrosion,
        source: 'deteriorate',
      });
      break;
    }
    */
    case 'spread': {
      const spVal = val || 2;
      [l - 1, l, l + 1].forEach((j) => {
        if (j >= 0 && j < 3 && eB[j]) {
          damageCard(state, oppOwner, j, spVal, 'spread', events, true);
        }
      });
      break;
    }
    case 'bind':
      // 既存の拘束・待機ターン数と比較し、大きい方の値を維持・適用する（スロット順管理）
      if (eB[l]) {
        grantCardStatus(eB[l], 'stun', (val || 1) + 1);
      }
      break;
    case 'standby':
      // 既存の防御・拘束ターン数と比較し、大きい方の値を維持・適用する（スロット順管理）
      grantCardStatus(c, 'stun', val || 1);
      break;
    case 'freeze':
      // 既存の防御・待機ターン数と比較し、大きい方の値を維持・適用する（スロット順管理）
      [l - 1, l, l + 1].forEach((j) => {
        if (j >= 0 && j < 3 && eB[j]) {
          grantCardStatus(eB[j], 'stun', (val || 1) + 1);
        }
      });
      break;
    case 'loss': {
      const lossDeck = owner === 'blue' ? state.playerDeck : state.enemyDeck;
      const lossDiscard =
        owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
      const lossCount = val || 1;
      for (let i = 0; i < lossCount; i++) {
        if (lossDeck.length > 0) lossDiscard.push(lossDeck.pop());
      }
      break;
    }
    case 'burial': {
      const burialDeck = owner === 'blue' ? state.enemyDeck : state.playerDeck;
      const burialDiscard =
        owner === 'blue' ? state.enemyDiscard : state.playerDiscard;
      const burialCount = val || 1;
      for (let i = 0; i < burialCount; i++) {
        if (burialDeck.length > 0) burialDiscard.push(burialDeck.pop());
      }
      break;
    }
    case 'snipe': {
      const snVal = val || 4;
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
        damageCard(state, oppOwner, maxL, snVal, 'snipe', events, true);
      }
      break;
    }
    case 'crush': {
      const targets = [];
      for (let j = 0; j < 3; j++) {
        if (eB[j] && (hasSkill(eB[j], 'defender') || eB[j].stunTurns > 0)) {
          if (canCardBeDestroyed(state, eB[j], oppOwner)) {
            targets.push({ side: oppOwner, lane: j, card: eB[j] });
          }
        }
        if (b[j] && (hasSkill(b[j], 'defender') || b[j].stunTurns > 0)) {
          if (canCardBeDestroyed(state, b[j], owner)) {
            targets.push({ side: owner, lane: j, card: b[j] });
          }
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const tr = targets[i];
        tr.card.currentPower = 0;
      }
      break;
    }
    case 'treason': {
      // お互いの場の「伝説」を持つカードを全て破壊する
      const targets = [];
      for (let j = 0; j < 3; j++) {
        if (eB[j] && hasSkill(eB[j], 'legendary')) {
          if (canCardBeDestroyed(state, eB[j], oppOwner)) {
            targets.push({ side: oppOwner, lane: j, card: eB[j] });
          }
        }
        if (b[j] && hasSkill(b[j], 'legendary')) {
          if (canCardBeDestroyed(state, b[j], owner)) {
            targets.push({ side: owner, lane: j, card: b[j] });
          }
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const tr = targets[i];
        tr.card.currentPower = 0;
      }
      break;
    }
    case 'dispel': {
      // 【AI思考空間：解除(dispel)スキルのシミュレーション】
      const targets = [];

      /**
       * 盤面から「解除」対象（装備カードを保持しているホスト、または自身が装備スキルのカード）を収集するヘルパー
       * @param {Array} board - 対象陣営の盤面
       * @param {string} side - 対象陣営
       */
      const gatherDispelTargets = (board, side) => {
        for (let j = 0; j < 3; j++) {
          if (board[j]) {
            const isEquipHost =
              board[j].equippedCards && board[j].equippedCards.length > 0;
            const isEquipItself = hasSkill(board[j], 'equip');
            if (isEquipHost || isEquipItself) {
              targets.push({
                lane: j,
                side: side,
                targetCard: board[j],
                isHost: isEquipHost,
                isSelf: isEquipItself,
              });
            }
          }
        }
      };
      gatherDispelTargets(eB, oppOwner);
      gatherDispelTargets(b, owner);

      const killTargets = [];
      for (let i = 0; i < targets.length; i++) {
        const tr = targets[i];
        const tgt = tr.targetCard;

        if (tr.isHost) {
          // 1. 装着されている装備カードを全て解除し、ステータス（パワー）を減算する
          let totalLoss = tgt.equippedCards.reduce(
            (sum, eq) =>
              sum + (eq.appliedEquipPower ?? eq.currentPower ?? eq.power ?? 0),
            0
          );
          for (const eqC of tgt.equippedCards) {
            const equipSkills = [];
            if (eqC.skills) {
              eqC.skills.forEach((s) => {
                if (s.id !== 'equip') equipSkills.push(s);
              });
            }
            unmergeCardSkills(tgt, equipSkills);
          }
          tgt.power -= totalLoss;
          tgt.currentPower -= totalLoss;
          tgt.basePower -= totalLoss;
          tgt.equippedCards = [];
          if (events) {
            events.push({
              type: 'dispel_equip',
              side: tr.side,
              lane: tr.lane,
              amount: totalLoss,
              source: 'dispel',
            });
          }
        }

        // 対象カードの破壊不能判定（無効(immune)スキル保持、または所有者の戦乙女の加護が有効な場合は false）
        const canDestroyTgt = canCardBeDestroyed(state, tgt, tr.side);

        // --- AIシミュレーションでの破壊確定条件 ---
        // A) 装備解除によりステータス（パワー）が 0 以下になった場合 (isHost): 戦乙女の加護や無効に関わらず確定破壊 (isKilledByStatLoss)
        // B) 自身が装備スキルのカードの直接破壊 (isSelf): 粉砕や叛逆と同様の直接破壊。canDestroyTgt (加護・無効) で保護される (isKilledBySkill)
        const isKilledByStatLoss = tr.isHost && tgt.currentPower <= 0;
        const isKilledBySkill = tr.isSelf && canDestroyTgt;

        if (isKilledByStatLoss || isKilledBySkill) {
          killTargets.push({ side: tr.side, lane: tr.lane, card: tgt });
          if (tr.side === oppOwner) {
            eB[tr.lane] = null;
          } else {
            b[tr.lane] = null;
          }
        }
      }

      if (killTargets.length > 0 && events) {
        events.push({
          type: 'destroy_cards',
          targets: killTargets,
        });

        // 報復（retaliate）スキル
        killTargets.forEach(({ side }) => {
          const alliedBoard =
            side === 'blue' ? state.playerBoard : state.enemyBoard;
          alliedBoard.forEach((allyCard, j) => {
            if (allyCard && hasSkill(allyCard, 'retaliate')) {
              const buffVal = getSkillValue(allyCard, 'retaliate') || 2;
              allyCard.currentPower += buffVal;
              events.push({
                type: 'power_change',
                side,
                lane: j,
                amount: buffVal,
                source: 'retaliate',
              });
            }
          });
        });
      }
      break;
    }
    case 'berserk': {
      const bVal = val || 2;
      const bAdj = l === 1 ? [0, 2] : [1];
      bAdj.forEach((j) => {
        if (b[j]) {
          damageCard(state, owner, j, bVal, 'berserk', events, true);
        }
      });
      break;
    }
    case 'heal': {
      const hAmt = val || 3;
      healLeader(state, owner, hAmt, 'heal', events);
      break;
    }
    case 'sacrifice': {
      const sacAmt = val || 3;
      damageLeader(state, owner, sacAmt, 'sacrifice', events);
      break;
    }
    case 'artillery': {
      // 砲撃：相手リーダーに直接ダメージ
      const artAmt = val || 3;
      damageLeader(state, oppOwner, artAmt, 'artillery', events);
      break;
    }
    case 'fate': {
      // 【システム解説】運命（fate）スキル：
      // AI思考シミュレーション時は常に最高の結果（相手リーダーに3ダメージ）として見積もり評価する。
      // ※ 実際の対戦プレイ時におけるダイス抽選（5/6で1~3、1/6で自傷6）およびVFXアニメーション・ポップアップ演出は
      //    「src/game/skillLogic.js」内の「resolveActiveSkillEffect」で実行されます。
      const fateMaxDmg = FATE_ESTIMATED_DAMAGE;
      damageLeader(state, oppOwner, fateMaxDmg, 'fate', events);
      break;
    }
    case 'decree': {
      // 宣告：手札の「宣告」を持つカード枚数×valダメージを相手リーダーに与える
      const decreeMultiplier = val || 4;
      const myHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const decreeCount = (myHand || []).filter(
        (card) => card && hasSkill(card, 'decree')
      ).length;
      const decreeDmg = decreeCount * decreeMultiplier;
      if (decreeDmg > 0) {
        damageLeader(state, oppOwner, decreeDmg, 'decree', events);
      }
      break;
    }
    case 'charge': {
      const chgAmt = val || 2;
      const pMaxSP = state.playerConfig?.leaderSkill?.cost || 5;
      const eMaxSP = state.enemyConfig?.leaderSkill?.cost || 5;
      if (owner === 'blue')
        state.playerSP = Math.min(pMaxSP, Math.max(0, state.playerSP + chgAmt));
      else
        state.enemySP = Math.min(eMaxSP, Math.max(0, state.enemySP + chgAmt));
      events.push({ type: 'charge_sp', side: owner, amount: chgAmt });
      break;
    }
    // 消費: 自分リーダーのSPをvalue分減らす（充填の逆）
    case 'spend': {
      const spendAmt = val || 1;
      if (owner === 'blue')
        state.playerSP = Math.max(0, state.playerSP - spendAmt);
      else state.enemySP = Math.max(0, state.enemySP - spendAmt);
      events.push({ type: 'charge_sp', side: owner, amount: -spendAmt });
      break;
    }
    case 'quick':
      applySingleCombat(state, owner, l, events);
      break;
    case 'bless': {
      const blessHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      if (blessHand && blessHand.length > 0) {
        const blessVal = val || 1;
        let bestCard = null;
        for (let hc of blessHand) {
          if (hc === null) continue;
          if (
            !hc.isToken &&
            (!bestCard || (hc.power || 0) > (bestCard.power || 0))
          ) {
            bestCard = hc;
          }
        }
        if (!bestCard) bestCard = blessHand.find((c) => c !== null);
        if (bestCard) {
          bestCard.power = (bestCard.power || 0) + blessVal;
          bestCard.currentPower = (bestCard.currentPower || 0) + blessVal;
          bestCard.basePower = (bestCard.basePower || 0) + blessVal;
          if (events) {
            events.push({
              type: 'skill_popup',
              side: owner,
              lane: l,
              skillName: '祝福',
            });
          }
        }
      }
      break;
    }
    case 'convert': {
      const convertHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const convertCount = val || 1;
      const actualConvertCount = Math.min(
        convertCount,
        convertHand ? convertHand.length : 0
      );
      if (actualConvertCount > 0 && convertHand) {
        const dropIndices = getAIDiscardIndices(
          convertHand,
          actualConvertCount
        );
        const sortedDropIndices = [...dropIndices].sort((a, b) => b - a);
        for (let i of sortedDropIndices) {
          convertHand.splice(i, 1);
        }
      }
      for (let i = 0; i < actualConvertCount; i++) {
        const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
          name: '虚空',
          power: 0,
        };
        const newToken = {
          ...voidTpl,
          isToken: true,
          power: voidTpl.power,
          basePower: voidTpl.power,
          currentPower: voidTpl.power,
          id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_vp${i}`,
          uid: `${owner}_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: 'token_void',
        };
        convertHand.push(newToken);
      }
      break;
    }
    case 'servant':
    case 'ambush': {
      // 【重要仕様】「使役 X」「奇襲 X」において X (val) はトークンのパワーを指す。
      // 個数は常に 1体 であるため、ループは 1回 固定。
      const summonTargetPower = val || 1;
      let tIdEngine = null;
      let tNameEngine = null;

      // カード本体またはスキルから召喚IDを取得
      const skillForSummonId = c?.skills?.find(
        (s) =>
          (s.id === 'servant' ||
            s.id === 'ambush' ||
            s.id === 'awake' ||
            s.id === 'awake_legendary' ||
            s.id === 'split') &&
          s.summonId
      );
      tIdEngine = c?.summonId || skillForSummonId?.summonId;

      if (!tIdEngine) {
        const engineCId = c?.baseId || c?.id;
        if (engineCId === 'admiral') {
          tIdEngine = 'token_knight';
        } else if (summonTargetPower >= 5) {
          tIdEngine = 'token_golem';
        } else {
          tIdEngine = 'token_drone';
        }
      }

      const baseTC = CARD_MASTER.find((m) => m.id === tIdEngine);
      tNameEngine = baseTC?.name || 'トークン';

      const sTC = {
        id: tIdEngine,
        name: tNameEngine,
        isToken: true,
        rarity: 1,
        voiceCategory: baseTC
          ? baseTC.voiceCategory
          : summonTargetPower >= 5
            ? 'monster'
            : 'machine_new',
      };
      for (let i = 0; i < 1; i++) {
        let targetLane = -1;
        if (simulatedLane !== undefined && simulatedLane !== -1) {
          targetLane = simulatedLane;
        } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
          targetLane = simulatedTokenLanes.shift();
        } else if (Array.isArray(simulatedTokenLanes)) {
          targetLane = -1;
        } else {
          // 盤面シミュレーション評価に基づき客観的最適レーンを決定
          targetLane = getBestSimulatedPlacementLane(
            state,
            owner,
            sTC,
            [0, 1, 2],
            false
          );
        }

        if (targetLane !== -1) {
          const newToken = {
            ...sTC,
            id: `sm_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
            baseId: tIdEngine,
            owner,
            isPremium: c?.isPremium || false,
            imgUrl: `assets/cards/card_${tIdEngine}.webp`,
            power: summonTargetPower,
            basePower: summonTargetPower,
            currentPower: summonTargetPower,
            skills: [],
          };
          processPlacementOrEquip(
            state,
            owner,
            targetLane,
            newToken,
            sid,
            events
          );

          // 奇襲（ambush）の場合、配置したレーンでただちに戦闘を行い、戦闘破壊を即座にクリーンアップ
          if (sid === 'ambush' && b[targetLane]) {
            b[targetLane].isSkillResolving = false;
            applySingleCombat(state, owner, targetLane, events);
            processDestructionTriggers(state, events);
          }
        }
      }
      break;
    }
    case 'awake':
    case 'awake_legendary': {
      // 封印（seal）されたレーンでは覚醒は不発（保留）となり、元のカードのまま場に留まる（最優先グローバル制約）
      if (isLaneSealed(state, owner, l)) break;

      // 覚醒 / 覚醒(伝説): 同レーンにトークンを配置し、元のカードを墓地へ送る（変身/置換）
      const awakeVal = val || 1;
      // 解決対象のスキルIDと同一のスキルから summonId を取得する
      const awakeSkill = c.skills?.find((s) => s.id === sid);
      const awakeTid =
        awakeSkill?.summonId ||
        (sid === 'awake_legendary' ? 'token_thebeast' : 'token_dragon');

      const awakeTpl = CARD_MASTER.find((m) => m.id === awakeTid);
      if (!awakeTpl) break;

      const awakeToken = {
        ...JSON.parse(JSON.stringify(awakeTpl)),
        id: `awake_sim_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
        uid: `${owner}_awake_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
        owner,
        isPremium: c.isPremium,
        power: awakeVal,
        basePower: awakeVal,
        currentPower: awakeVal,
        isToken: true,
        baseId: awakeTid,
        imgUrl: `assets/cards/card_${awakeTid}.webp`,
        skills: awakeTpl.skills
          ? JSON.parse(JSON.stringify(awakeTpl.skills))
          : [],
      };

      // 旧カードを盤面から除外（墓地へ送る）
      quietDiscardFromBoard(state, owner, l);

      // 新トークンを配置
      b[l] = awakeToken;
      events.push({
        type: 'summon_token',
        side: owner,
        lane: l,
        card: JSON.parse(JSON.stringify(awakeToken)),
        source: sid,
      });
      break;
    }
    case 'resurrect': {
      if (isGraveKeeperActive(state)) break;
      // 復活 (AIシミュレーション用): 墓地から一番パワーの高いカードを召喚する
      const maxPowSim = val || 1;
      const simDiscard =
        owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
      const validDiscard = simDiscard.filter(
        (c) => c && (c.power || 0) <= maxPowSim && !c.isToken
      );
      if (validDiscard.length === 0) break;

      // パワーが高い順にソートして一番強いのを取得し、シミュ内で墓地から取り除く
      const sortedDiscard = [...validDiscard].sort(
        (a, b) => (b.power || 0) - (a.power || 0)
      );
      const simResCard = sortedDiscard[0];

      let targetLaneRes = -1;
      if (simulatedLane !== undefined && simulatedLane !== -1) {
        targetLaneRes = simulatedLane;
      } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
        targetLaneRes = simulatedTokenLanes.shift();
      } else if (Array.isArray(simulatedTokenLanes)) {
        targetLaneRes = -1;
      } else {
        // 盤面シミュレーション評価に基づき客観的最適レーンを決定
        targetLaneRes = getBestSimulatedPlacementLane(
          state,
          owner,
          simResCard,
          [0, 1, 2],
          false
        );
      }

      if (targetLaneRes !== -1) {
        const existingCard = b[targetLaneRes];
        const unionSkill =
          simResCard.skills && simResCard.skills.find((s) => s.id === 'union');
        const isUnion =
          unionSkill &&
          existingCard &&
          matchesUnionMaterial(existingCard, unionSkill);

        if (isUnion) {
          const masterData =
            CARD_MASTER.find((c) => c.id === unionSkill.summonId) ||
            CARD_MASTER.find((c) => c.id === 'android');
          let unionCard = JSON.parse(JSON.stringify(masterData));
          unionCard.uid = `rs_sim_un_${Math.floor(getSeededRandom() * 1000000000)}`;
          unionCard.owner = owner;
          unionCard.baseId = unionCard.id;
          unionCard.basePower = unionCard.power;
          unionCard.currentPower = unionCard.power;
          unionCard.skills = []; // 蘇生からの合体のためスキル効果は不発
          unionCard.stunTurns = 0;
          b[targetLaneRes] = unionCard;
          events.push({
            type: 'summon_token',
            side: owner,
            lane: targetLaneRes,
            card: JSON.parse(JSON.stringify(unionCard)),
            source: 'union',
          });
        } else {
          const isEquip =
            hasSkill(simResCard, 'equip') ||
            (existingCard && hasSkill(existingCard, 'arm_self'));
          // 【憑依】：憑依を持つカードには装備できない
          const targetBlocksEquip =
            (existingCard &&
              (hasSkill(existingCard, 'possession') ||
                hasSkill(existingCard, 'reflect'))) ||
            hasSkill(simResCard, 'possession') ||
            hasSkill(simResCard, 'reflect');
          if (isEquip && existingCard && !targetBlocksEquip) {
            // 装備（既存カードの上へ）: applyEquipment に処理を集約
            applyEquipment(existingCard, simResCard);

            events.push({
              type: 'power_change',
              side: owner,
              lane: targetLaneRes,
              amount: simResCard.appliedEquipPower ?? simResCard.power,
              source: 'equip',
              card: simResCard,
            });
          } else {
            if (existingCard)
              quietDiscardFromBoard(state, owner, targetLaneRes);
            const newResToken = {
              ...JSON.parse(JSON.stringify(simResCard)),
              id: `rs_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
              baseId: simResCard.baseId || simResCard.id,
              voiceCategory:
                simResCard.voiceCategory ||
                CARD_MASTER.find(
                  (m) => m.id === (simResCard.baseId || simResCard.id)
                )?.voiceCategory,
              owner,
              currentPower: simResCard.power,
              skillTriggered: true, // ルール: 配置(Place)では召喚時スキルは発動しない
            };
            b[targetLaneRes] = newResToken;
            events.push({
              type: 'summon_card',
              side: owner,
              lane: targetLaneRes,
              card: JSON.parse(JSON.stringify(newResToken)),
              source: 'resurrect',
            });
          }
        }

        const resIdx = simDiscard.indexOf(simResCard);
        if (resIdx !== -1) simDiscard.splice(resIdx, 1);
      }
      break;
    }
    case 'puppet': {
      if (isGraveKeeperActive(state)) break;
      // 【傀儡】相手の墓地からパワー以下のカードを1枚選んで自分の場に配置する（復活の逆版）
      // AIシミュレーション: 相手墓地の中で最もパワーが高いカードを優先的に選択する
      const puppetMaxPow = val || 1;
      const oppPuppetDiscard =
        owner === 'blue' ? state.enemyDiscard : state.playerDiscard;
      const validPuppetCards = oppPuppetDiscard.filter(
        (c) => c && (c.power || 0) <= puppetMaxPow && !c.isToken
      );
      if (validPuppetCards.length === 0) break;

      // パワーが高い順にソートして最強カードを選択
      const sortedPuppetDiscard = [...validPuppetCards].sort(
        (a, b) => (b.power || 0) - (a.power || 0)
      );
      const simPuppetCard = sortedPuppetDiscard[0];

      let targetLanePuppet = -1;
      if (simulatedLane !== undefined && simulatedLane !== -1) {
        targetLanePuppet = simulatedLane;
      } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
        targetLanePuppet = simulatedTokenLanes.shift();
      } else if (Array.isArray(simulatedTokenLanes)) {
        targetLanePuppet = -1;
      } else {
        // 盤面シミュレーション評価に基づき客観的最適レーンを決定
        targetLanePuppet = getBestSimulatedPlacementLane(
          state,
          owner,
          simPuppetCard,
          [0, 1, 2],
          false
        );
      }

      if (targetLanePuppet !== -1) {
        const newPuppetCard = {
          ...JSON.parse(JSON.stringify(simPuppetCard)),
          id: `puppet_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: simPuppetCard.baseId || simPuppetCard.id,
          owner,
          currentPower: simPuppetCard.power,
          skillTriggered: true,
        };
        processPlacementOrEquip(
          state,
          owner,
          targetLanePuppet,
          newPuppetCard,
          'puppet',
          events
        );

        // 相手の墓地から取り除く
        const puppetIdx = oppPuppetDiscard.indexOf(simPuppetCard);
        if (puppetIdx !== -1) oppPuppetDiscard.splice(puppetIdx, 1);
      }
      break;
    }
    case 'clone': {
      // 【重要仕様】「分身 X」において X (val) は召喚される個数を指す。
      const cloneCount = val || 1;
      const tC = {
        id: 'token_clone',
        name: '分身',
        isToken: true,
        rarity: c.rarity || 1,
        voiceCategory: c.voiceCategory || 'sword',
      };
      // スキルの引き継ぎ（分身含む全スキル）
      // 分身(clone)は召喚時にしか発動しないため、コピーしても影響がない
      let inheritedSkills = Array.isArray(c.skills) ? [...c.skills] : [];

      for (let i = 0; i < cloneCount; i++) {
        let targetLane = -1;
        if (simulatedLane !== undefined && simulatedLane !== -1) {
          targetLane = simulatedLane;
        } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
          targetLane = simulatedTokenLanes.shift();
        } else if (Array.isArray(simulatedTokenLanes)) {
          targetLane = -1;
        } else {
          // 分身スキルの調整：元のレーン l の隣接レーンのみを対象とする
          const adjacentLanes = l === 1 ? [0, 2] : [1];
          // 隣接候補レーンに対する盤面シミュレーション評価に基づき客観的最適レーンを決定
          targetLane = getBestSimulatedPlacementLane(
            state,
            owner,
            tC,
            adjacentLanes,
            false
          );
        }

        if (targetLane !== -1) {
          const existingCard = b[targetLane];
          const inheritedUnionSkill = inheritedSkills.find(
            (sk) => sk.id === 'union'
          );
          const isUnion =
            inheritedUnionSkill &&
            existingCard &&
            matchesUnionMaterial(existingCard, inheritedUnionSkill);

          if (isUnion) {
            const masterData =
              CARD_MASTER.find(
                (md) => md.id === inheritedUnionSkill.summonId
              ) || CARD_MASTER.find((md) => md.id === 'android');
            let unionCard = JSON.parse(JSON.stringify(masterData));
            unionCard.uid = `cl_sim_un_${Math.floor(getSeededRandom() * 1000000000)}_${i}`;
            unionCard.owner = owner;
            unionCard.baseId = unionCard.id;
            unionCard.basePower = unionCard.power;
            unionCard.currentPower = unionCard.power;
            unionCard.skills = []; // 配置からのため不発
            unionCard.stunTurns = 0;
            b[targetLane] = unionCard;
            events.push({
              type: 'summon_token',
              side: owner,
              lane: targetLane,
              card: JSON.parse(JSON.stringify(unionCard)),
              source: 'union',
            });
          } else {
            const newToken = {
              ...tC,
              id: `cl_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
              baseId: c.baseId || c.id,
              owner,
              isPremium: c.isPremium,
              imgUrl: c.imgUrl, // シミュ内では元の情報を保持していればOK (UI表示は後で行われる)
              rarity: c.rarity || 1,
              power: c.power || 1,
              basePower: c.basePower || c.power || 1,
              currentPower:
                c.currentPower !== undefined ? c.currentPower : c.power || 1,
              skills: JSON.parse(JSON.stringify(inheritedSkills)),
              voiceCategory: c.voiceCategory || 'sword',
              stunTurns: c.stunTurns || 0,
              skillTriggered: true,
            };
            processPlacementOrEquip(
              state,
              owner,
              targetLane,
              newToken,
              'clone',
              events
            );
          }
        }
      }
      break;
    }
    case 'petrify':
      if (eB[l]) {
        const targetOriginal = JSON.parse(JSON.stringify(eB[l]));
        const statueTpl = CARD_MASTER.find((m) => m.id === 'token_statue') || {
          name: '石像',
          power: 5,
          rarity: 1,
        };
        const statueToken = {
          ...statueTpl,
          id: `statue_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: 'token_statue',
          uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_statue`,
          owner: oppOwner,
          power: statueTpl.power,
          basePower: statueTpl.basePower || statueTpl.power,
          currentPower: statueTpl.power,
          isToken: true,
          skills: JSON.parse(JSON.stringify(statueTpl.skills || [])),
          voiceCategory: statueTpl.voiceCategory || 'stone',
          originalRevertTarget: targetOriginal, // 石像破壊時に墓地へ行く元カード
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

        // 既存のカードを消すわけではなく変身扱いとするため、破壊イベントは積まない（あるいは変身イベントを積む）
        eB[l] = statueToken;
      }
      break;
    case 'reinforce': {
      // AIシミュレーション用: 手札の枚数が十分ある前提で最大数捨てるとしてトークンを手札に加える
      const h = owner === 'blue' ? state.playerHand : state.enemyHand;
      const actualReinforceCount = Math.min(val || 1, h.length);

      if (actualReinforceCount > 0 && h.length > 0) {
        // 増援はトークン獲得による強化が主目的のため、強制破棄ロジック（isExact = true）で最大枚数を破棄
        const dropIndices = getAIDiscardIndices(h, actualReinforceCount, true);
        const sortedDropIndices = [...dropIndices].sort((a, b) => b - a);
        for (let i of sortedDropIndices) {
          h.splice(i, 1);
        }
      }

      const rTC = {
        id: 'token_reinforce',
        name: c.name,
        isToken: true,
        rarity: c.rarity || 1,
        power: c.currentPower !== undefined ? c.currentPower : c.power || 1,
        basePower: c.basePower || c.power || 1,
        currentPower:
          c.currentPower !== undefined ? c.currentPower : c.power || 1,
        voiceCategory: c.voiceCategory || 'lizard',
      };

      for (let i = 0; i < actualReinforceCount; i++) {
        h.push({
          ...rTC,
          id: `rf_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
          owner,
          imgUrl: c.imgUrl,
          isPremium: c.isPremium,
        });
      }
      break;
    }
    case 'call':
      // 号令は純粋ロジックでの完全なシミュレーションが不可能なため（ユーザー選択や期待値ベース評価を行うため）
      // engine.jsでは盤面に干渉しない（ai_normal等で独自に+3として期待値評価する）
      break;
    case 'stealth':
    case 'invincible': {
      const invVal = val || 1;
      // 「状態（ステータス）」としてスロット順に追加・管理
      grantCardStatus(c, 'invincible', invVal);
      events.push({
        type: 'add_skill',
        side: owner,
        lane: l,
        skillId: 'invincible',
        value: invVal,
        source: sid,
      });
      break;
    }
    case 'decay': {
      const decayAmt = Math.floor((c.currentPower || c.power || 0) / 2);
      c.power = decayAmt;
      c.currentPower = decayAmt;
      c.basePower = decayAmt;
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: -decayAmt,
        source: 'decay',
      });
      break;
    }
    case 'cull': {
      // 【選別】相手の場でパワーの低いカードを指定枚数破壊（墓地送り）
      const occupiedLanes = eB
        .map((bc, i) => (bc !== null ? i : -1))
        .filter((i) => i !== -1);
      if (occupiedLanes.length > 0) {
        // パワー昇順ソート。ただし免疫(immune)を最優先で選択して損失を回避する
        occupiedLanes.sort((a, b) => {
          const aImmune = hasSkill(eB[a], 'immune');
          const bImmune = hasSkill(eB[b], 'immune');
          if (aImmune && !bImmune) return -1;
          if (!aImmune && bImmune) return 1;

          const diff = (eB[a].currentPower || 0) - (eB[b].currentPower || 0);
          if (diff !== 0) return diff;
          return a - b;
        });

        const count = val === undefined || val === 0 ? 1 : val;
        const selectCount = Math.min(count, occupiedLanes.length);
        const targets = [];

        for (let idx = 0; idx < selectCount; idx++) {
          const targetLane = occupiedLanes[idx];
          const targetCard = eB[targetLane];
          if (targetCard) {
            if (!canCardBeDestroyed(state, targetCard, oppOwner)) {
              events.push({
                type: isValkyriaGuardActive(state, oppOwner)
                  ? 'valkyria_guard_block'
                  : 'immune_block',
                side: oppOwner,
                lane: targetLane,
                card: targetCard,
              });
            } else {
              quietDiscardFromBoard(state, oppOwner, targetLane);
              targets.push({
                side: oppOwner,
                lane: targetLane,
                card: targetCard,
              });
            }
          }
        }

        if (targets.length > 0) {
          events.push({
            type: 'destroy_cards',
            targets: targets,
          });

          // 報復（retaliate）スキル: 破壊された枚数分、相手陣営の生存カードのパワーを上昇させる
          targets.forEach(() => {
            eB.forEach((allyCard, j) => {
              if (allyCard && hasSkill(allyCard, 'retaliate')) {
                const buffVal = getSkillValue(allyCard, 'retaliate') || 2;
                allyCard.currentPower += buffVal;
                events.push({
                  type: 'power_change',
                  side: oppOwner,
                  lane: j,
                  amount: buffVal,
                  source: 'retaliate',
                });
              }
            });
          });
        }
      }
      break;
    }
    case 'grant_deadly':
    case 'grant_sturdy': {
      const targetSkill = sid === 'grant_deadly' ? 'deadly' : 'sturdy';
      const myBoard = owner === 'blue' ? state.playerBoard : state.enemyBoard;

      for (let i = 0; i < 3; i++) {
        const tc = myBoard[i];
        if (tc && tc !== c) {
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
            tc.skills = tc.skills.filter((s) => s.id !== 'none');

            // 重複付与を防ぐ（頑丈や必殺は最大1個まで）
            if (!tc.skills.some((s) => s.id === targetSkill)) {
              tc.skills.push({ id: targetSkill });
              events.push({
                type: 'add_skill',
                side: owner,
                lane: i,
                skillId: targetSkill,
                value: 0,
                source: sid,
              });
            }
          }
        }
      }
      break;
    }
    case 'protection': {
      // 【保護】味方カード1体（自身含む）を選択し、次の自分のターン開始時まで「加護」を付与する。
      // シミュレーション時は、自陣の高パワーカード（加護未付与優先）を選択する
      const myOccupiedLanes = b
        .map((bc, i) => (bc !== null ? i : -1))
        .filter((i) => i !== -1);
      if (myOccupiedLanes.length > 0) {
        myOccupiedLanes.sort((i1, i2) => {
          const g1 = Boolean(b[i1].valkyriaGuard);
          const g2 = Boolean(b[i2].valkyriaGuard);
          if (g1 !== g2) return g1 ? 1 : -1;
          return (b[i2].currentPower || 0) - (b[i1].currentPower || 0);
        });
        const targetLane = myOccupiedLanes[0];
        const targetCard = b[targetLane];
        if (targetCard) {
          targetCard.valkyriaGuard = true;
          targetCard.valkyriaGuardTurns = VALKYRIA_GUARD_TURNS;
          events.push({
            type: 'add_status',
            side: owner,
            lane: targetLane,
            status: 'valkyria_guard',
            source: 'protection',
          });
        }
      }
      break;
    }
    case 'execute': {
      // 【処刑】自分の場で最もパワーの低いカード1枚を破壊（墓地送り）
      const myOccupiedLanes = b
        .map((bc, i) => (bc !== null ? i : -1))
        .filter((i) => i !== -1);
      if (myOccupiedLanes.length > 0) {
        // パワー昇順ソート。ただし免疫(immune)または加護を最優先で選択して損失を回避する
        myOccupiedLanes.sort((a, ab) => {
          const aImmune = !canCardBeDestroyed(state, b[a], owner);
          const bImmune = !canCardBeDestroyed(state, b[ab], owner);
          if (aImmune && !bImmune) return -1;
          if (!aImmune && bImmune) return 1;

          const diff = (b[a].currentPower || 0) - (b[ab].currentPower || 0);
          if (diff !== 0) return diff;
          return a - ab;
        });
        const execLane = myOccupiedLanes[0];
        const execCard = b[execLane];
        if (execCard) {
          if (!canCardBeDestroyed(state, execCard, owner)) {
            events.push({
              type: isValkyriaGuardActive(state, owner)
                ? 'valkyria_guard_block'
                : 'immune_block',
              side: owner,
              lane: execLane,
              card: execCard,
            });
          } else {
            // 分裂(split): 墓地送りの代わりにトークンを配置する
            if (hasSkill(execCard, 'split')) {
              const sealedLanes =
                owner === 'blue'
                  ? state.playerSealedLanes
                  : state.enemySealedLanes;
              if (!sealedLanes || sealedLanes[execLane] === 0) {
                const tokenId =
                  execCard.summonId ||
                  execCard.skills?.find((s) => s.id === 'split')?.summonId ||
                  'token_legs';
                const tL = CARD_MASTER.find((m) => m.id === tokenId) || {
                  name: 'トークン',
                  power: 1,
                };
                const val = getSkillValue(execCard, 'split') || tL.power || 2;
                b[execLane] = {
                  ...JSON.parse(JSON.stringify(tL)),
                  id: `sp_${Math.floor(getSeededRandom() * 1000000000)}_${execLane}_${getSeededRandom().toString(36).substr(2, 5)}`,
                  baseId: tokenId,
                  owner,
                  imgUrl: `assets/cards/card_${tokenId}.webp`,
                  power: val,
                  currentPower: val,
                  basePower: val,
                  rarity: tL.rarity || 1,
                };
                events.push({
                  type: 'summon_token',
                  side: owner,
                  lane: execLane,
                  card: JSON.parse(JSON.stringify(b[execLane])),
                  source: 'split',
                });
              } else {
                // 封印されたレーンでは分裂できないので通常の墓地送り
                quietDiscardFromBoard(state, owner, execLane);
              }
            } else {
              quietDiscardFromBoard(state, owner, execLane);
            }

            // 誘爆(explode): 隣接カードにダメージを与える
            if (hasSkill(execCard, 'explode')) {
              const dmg = getSkillValue(execCard, 'explode') || 3;
              [execLane - 1, execLane + 1].forEach((adj) => {
                if (adj >= 0 && adj < 3 && b[adj]) {
                  if (canTakeDamage(b[adj], dmg, true, state, owner)) {
                    b[adj].currentPower -= dmg;
                    events.push({
                      type: 'damage_card',
                      side: owner,
                      lane: adj,
                      amount: dmg,
                      source: 'explode',
                    });
                  } else {
                    events.push({
                      type: 'immune_block',
                      side: owner,
                      lane: adj,
                      source: 'explode',
                    });
                  }
                }
              });
            }

            events.push({
              type: 'destroy_cards',
              targets: [{ side: owner, lane: execLane, card: execCard }],
            });

            // 報復（retaliate）スキル: 自陣カードが破壊された時、自陣の生存カードのパワーを上昇させる
            b.forEach((allyCard, j) => {
              if (allyCard && hasSkill(allyCard, 'retaliate')) {
                const buffVal = getSkillValue(allyCard, 'retaliate') || 2;
                allyCard.currentPower += buffVal;
                events.push({
                  type: 'power_change',
                  side: owner,
                  lane: j,
                  amount: buffVal,
                  source: 'retaliate',
                });
              }
            });
          }
        }
      }
      break;
    }
    case 'draw': {
      // 【入替(draw)スキル処理】
      // 召喚時、手札をval枚まで捨て、同数引く
      const myDeck = owner === 'blue' ? state.playerDeck : state.enemyDeck;
      const myHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const drawCount = val || 1;
      if (myDeck && myHand && myDeck.length > 0 && myHand.length > 0) {
        const actualDraw = Math.min(drawCount, myDeck.length, myHand.length);
        const dropIndices = getAIDiscardIndices(myHand, actualDraw);
        const sorted = [...dropIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          myHand.splice(idx, 1);
        }
        for (let i = 0; i < actualDraw; i++) {
          if (myDeck.length > 0) {
            myHand.push(myDeck.pop());
          }
        }
        events.push({ type: 'draw', side: owner, source: 'draw' });
      }
      break;
    }
    case 'salvage': {
      // 【回収(salvage)スキル処理】
      // 召喚時、手札をval枚まで捨て、同数自分の墓地からカードを手札に加える
      if (isGraveKeeperActive(state)) break;
      const discard =
        owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const validDiscard = discard
        ? discard.filter((card) => card && !card.isToken)
        : [];
      if (validDiscard.length > 0 && hand && hand.length > 0) {
        const salvageCount = Math.min(
          val || 1,
          validDiscard.length,
          hand.length
        );
        const dropIndices = getAIDiscardIndices(hand, salvageCount);
        const sorted = [...dropIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          hand.splice(idx, 1);
        }
        validDiscard.sort((a, b) => (b.power || 0) - (a.power || 0));
        for (let i = 0; i < salvageCount; i++) {
          const recovered = validDiscard[i];
          const dIdx = discard.indexOf(recovered);
          if (dIdx !== -1) discard.splice(dIdx, 1);
          hand.push(recovered);
        }
        events.push({ type: 'salvage', side: owner, source: 'salvage' });
      }
      break;
    }
    case 'shuffle': {
      // 【攪乱(shuffle)スキル処理】
      // 召喚時、お互いの手札を全て捨て、墓地をリセットし、お互いにカードを3枚引く
      events.push({ type: 'shuffle', side: owner, source: 'shuffle' });
      break;
    }
    case 'leap': {
      // 【跳躍(leap)スキル処理】
      // 召喚時、追加ターンを1回付与（SP増加なし・攻撃なし）
      state.extraTurnCount = (state.extraTurnCount || 0) + 1;
      state.attackSkipCount = (state.attackSkipCount || 0) + 1;
      events.push({ type: 'leap', side: owner, source: 'leap' });
      break;
    }
    case 'recurse': {
      // 【再帰(recurse)スキル処理】
      // 召喚時、お互いの墓地のカードをval枚まで選択してデッキに戻す
      if (isGraveKeeperActive(state)) break;
      events.push({ type: 'recurse', side: owner, source: 'recurse' });
      break;
    }
    case 'metamorph': {
      // 【変身(metamorph)スキル処理】
      // 召喚時、全カードの中からランダムに1枚に変身する。シミュレーションでは期待値パワーを設定
      const metaPower = METAMORPH_ESTIMATED_POWER;
      c.currentPower = metaPower;
      c.power = metaPower;
      c.basePower = metaPower;
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: metaPower,
        source: 'metamorph',
      });
      break;
    }
    case 'assemble': {
      // 【召集(assemble)スキル処理】
      // 召喚時、デッキから条件に合うカード1枚を自分のレーンに召喚する
      const myDeck = owner === 'blue' ? state.playerDeck : state.enemyDeck;
      if (!myDeck || myDeck.length === 0) break;
      const assembleBonus = val || 3;
      c.currentPower += assembleBonus;
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: assembleBonus,
        source: 'assemble',
      });
      break;
    }
    case 'summon': {
      // 【召喚(summon)スキル処理】
      // 召喚時、手札から条件に合うカード1枚を召喚し、「虚空（パワー0）」を手札に加える
      const myHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      if (!myHand || myHand.length === 0) break;
      const summonBonus = val || 3;
      c.currentPower += summonBonus;
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      myHand.push({
        ...voidTpl,
        isToken: true,
        baseId: 'token_void',
        uid: `${owner}_sim_void_${Math.floor(getSeededRandom() * 1000000000)}`,
      });
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: summonBonus,
        source: 'summon',
      });
      break;
    }
    case 'forge': {
      // 【鍛造(forge)スキル処理】
      // 召喚時、カードが配置されているレーンに手札から「装備」を持つカードを召喚し、「虚空」を手札に加える
      const myHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      if (!myHand || myHand.length === 0) break;
      const forgeBonus = 3;
      c.currentPower += forgeBonus;
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      myHand.push({
        ...voidTpl,
        isToken: true,
        baseId: 'token_void',
        uid: `${owner}_sim_void_${Math.floor(getSeededRandom() * 1000000000)}`,
      });
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: forgeBonus,
        source: 'forge',
      });
      break;
    }
  }

  processDestructionTriggers(state, events);
  return events;
}

/**
 * リーダースキルの効果を適用する (純粋関数)
 * @returns {Array} events
 */
/**
 * 盤面への装備（武装）を試み、成功した場合はtrueを返すヘルパー。
 * 「配置（Place）」経路でのトークン装備では原則として召喚時スキルを発動させないため、
 * triggerEquipSkills はデフォルトで false となっています。
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {Array<Object|null>} board - 対象プレイヤーの盤面配列
 * @param {number} lane - 配置・装備先のレーン番号 (0-2)
 * @param {Object} newToken - 装備するトークンまたはカードオブジェクト
 * @param {string} owner - 所有者 ('blue'|'red')
 * @param {Array<Object>} events - 演出イベント配列
 * @param {boolean} [triggerEquipSkills=false] - 装備カード由来のアクティブスキルを発動するかどうか（配置では false）
 * @returns {boolean} 装備（武装）が成功した場合は true、不可能な場合は false
 */
function tryEquipToken(
  state,
  board,
  lane,
  newToken,
  owner,
  events,
  triggerEquipSkills = false
) {
  let boardCard = board[lane];
  if (
    (hasSkill(newToken, 'equip') ||
      (boardCard && hasSkill(boardCard, 'arm_self'))) &&
    boardCard
  ) {
    if (
      !hasSkill(boardCard, 'possession') &&
      !hasSkill(newToken, 'possession') &&
      !hasSkill(boardCard, 'reflect') &&
      !hasSkill(newToken, 'reflect')
    ) {
      // 装備（既存カードの上へ）: applyEquipment に処理を集約
      const { equipSkills } = applyEquipment(boardCard, newToken);
      events.push({
        type: 'equip_card',
        side: owner,
        lane: lane,
        card: JSON.parse(JSON.stringify(newToken)),
      });

      // 召喚経路（triggerEquipSkills = true）の場合のみ、装備カードのアクティブスキルを実行
      // 「配置（Place）」経路ではゲームルールに基づき召喚時アクティブスキルは発動しない
      if (triggerEquipSkills && equipSkills) {
        equipSkills.forEach((sk) => {
          if (ACTIVE_SKILLS.includes(sk.id)) {
            applyActiveSkillLogic(
              state,
              owner,
              lane,
              sk.id,
              sk.value,
              events,
              newToken.cardTokenLanes || null
            );
          }
        });
      }

      return true;
    }
  }
  return false;
}

/**
 * ダメージ＋回復系リーダースキル（神炎 god_flame / 断罪のクロス condemnation）の共通実行ヘルパー
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} action - スキルID ('god_flame' | 'condemnation')
 * @param {string} owner - スキル発動者 ('blue' | 'red')
 * @param {number} damageAmount - 与えるダメージ量および回復量
 * @param {Array} events - イベントログ配列
 */
function executeFlameHealLeaderSkill(
  state,
  action,
  owner,
  damageAmount,
  events
) {
  const isBlue = owner === 'blue';
  const oppOwner = isBlue ? 'red' : 'blue';
  events.push({ type: 'leader_skill', skill: action, side: owner });
  damageLeader(state, oppOwner, damageAmount, action, events);
  healLeader(state, owner, damageAmount, action, events);
}

export function applyLeaderSkillLogic(
  state,
  owner,
  action,
  tokenLanes = null,
  events = [],
  forcedTargetIdx = null,
  forcedTargetUid = null,
  simulatedResurrectLane = null,
  forcedOppTargetIdx = null
) {
  const isBlue = owner === 'blue';
  const board = isBlue ? state.playerBoard : state.enemyBoard;
  const eBoard = isBlue ? state.enemyBoard : state.playerBoard;
  const oppOwner = isBlue ? 'red' : 'blue';

  if (action === 'iron_march' || action === 'last_battalion') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const automataTpl = CARD_MASTER.find((m) => m.id === 'token_automata');
    if (automataTpl) {
      const repeatCount = action === 'last_battalion' ? 5 : 3;
      for (let i = 0; i < repeatCount; i++) {
        if (state.playerHP <= 0 || state.enemyHP <= 0) break;

        let targetLane = -1;
        if (tokenLanes && tokenLanes[i] !== undefined) {
          targetLane = tokenLanes[i];
        } else {
          // 盤面シミュレーション評価に基づき客観的最適レーンを決定
          targetLane = getBestSimulatedPlacementLane(
            state,
            owner,
            automataTpl,
            [0, 1, 2],
            false
          );
        }
        if (targetLane === -1) break;

        // 1. オートマタの配置 or 起動消滅
        const existing = board[targetLane];
        if (existing && hasSkill(existing, 'startup')) {
          const deepClonedToken = JSON.parse(JSON.stringify(automataTpl));
          const deadToken = {
            ...deepClonedToken,
            id: `automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
            uid: `${owner}_automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
            baseId: automataTpl.id,
            owner,
            power: 1,
            currentPower: 1,
            rarity: automataTpl.rarity || 1,
            isToken: true,
          };
          resolveStartupFade(owner, existing, targetLane, deadToken, events);
        } else {
          // 通常の配置
          if (existing) {
            quietDiscardFromBoard(state, owner, targetLane);
          }

          const deepClonedToken = JSON.parse(JSON.stringify(automataTpl));
          board[targetLane] = {
            ...deepClonedToken,
            id: `automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
            uid: `${owner}_automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
            baseId: automataTpl.id,
            owner,
            power: 1, // パワーを1に設定
            currentPower: 1, // 現在のパワーを1に設定
            rarity: automataTpl.rarity || 1,
            isToken: true,
          };
          board[targetLane].skillTriggered = true;

          events.push({
            type: 'summon_token',
            side: owner,
            lane: targetLane,
            card: JSON.parse(JSON.stringify(board[targetLane])),
            source: action,
          });
        }

        // 2. そのレーンのカードをただちに攻撃させる
        applySingleCombat(state, owner, targetLane, events);

        // 戦闘による破壊処理
        processDestructionTriggers(state, events);
      }
    }
  } else if (action === 'void_purge') {
    events.push({ type: 'leader_skill', skill: action, side: owner });

    const myHand = isBlue ? state.playerHand : state.enemyHand;
    const oppHand = isBlue ? state.enemyHand : state.playerHand;
    const myDiscard = isBlue ? state.playerDiscard : state.enemyDiscard;
    const oppDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    // 1. 自分の手札を捨てる
    let myDiscardIndices = [];
    const myCount = Math.min(3, myHand.length);
    if (tokenLanes && Array.isArray(tokenLanes.my)) {
      myDiscardIndices = [...tokenLanes.my];
    } else if (
      tokenLanes &&
      Array.isArray(tokenLanes) &&
      tokenLanes.length > 0
    ) {
      myDiscardIndices = [...tokenLanes];
    } else {
      const sorted = myHand
        .map((c, i) => ({ c, i }))
        .sort(
          (a, b) =>
            (a.c.currentPower ?? a.c.power ?? 0) -
            (b.c.currentPower ?? b.c.power ?? 0)
        );
      myDiscardIndices = sorted.slice(0, myCount).map((x) => x.i);
    }
    myDiscardIndices.sort((a, b) => b - a);
    let myDiscarded = 0;
    for (const idx of myDiscardIndices) {
      if (myHand[idx]) {
        const card = myHand.splice(idx, 1)[0];
        myDiscard.push(card);
        myDiscarded++;
        events.push({
          type: 'discard_card',
          side: owner,
          card: JSON.parse(JSON.stringify(card)),
          source: 'void_purge',
        });
      }
    }

    // 2. 相手の手札を全て捨てる
    let oppDiscarded = 0;
    let voidDiscarded = 0;
    const oppCards = [...oppHand];
    oppHand.length = 0;
    for (const card of oppCards) {
      if (!card) continue;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウント
      if (matchesCardId(card, 'token_void')) {
        voidDiscarded++;
      }
      if (!card.isToken) {
        oppDiscard.push(card);
      }
      oppDiscarded++;
      events.push({
        type: 'discard_card',
        side: oppOwner,
        card: JSON.parse(JSON.stringify(card)),
        source: 'void_purge',
      });
    }

    // 相手が捨てた虚空の枚数分、相手がダメージを受ける
    if (voidDiscarded > 0) {
      damageLeader(state, oppOwner, voidDiscarded, 'void_purge', events);
    }

    // 3. 虚空を追加
    const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
      id: 'token_void',
      name: '虚空',
      power: 0,
    };
    for (let i = 0; i < myDiscarded; i++) {
      myHand.push({
        ...voidTpl,
        uid: `${owner}_void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
        owner: owner,
        baseId: 'token_void',
        isToken: true,
        currentPower: voidTpl.power ?? 0,
      });
    }
    for (let i = 0; i < oppDiscarded; i++) {
      oppHand.push({
        ...voidTpl,
        uid: `${oppOwner}_void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
        owner: oppOwner,
        baseId: 'token_void',
        isToken: true,
        currentPower: voidTpl.power ?? 0,
      });
    }
  } else if (action === 'viola_domination') {
    events.push({ type: 'leader_skill', skill: action, side: owner });

    let targetLane = -1;
    const mySealedLanes = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;
    if (tokenLanes && Array.isArray(tokenLanes) && tokenLanes.length > 0) {
      targetLane = tokenLanes[0];
    } else if (tokenLanes !== null && typeof tokenLanes === 'number') {
      targetLane = tokenLanes;
    } else {
      const validLanes = [];
      for (let i = 0; i < 3; i++) {
        if (eBoard[i] && (!mySealedLanes || mySealedLanes[i] === 0)) {
          validLanes.push(i);
        }
      }
      validLanes.sort(
        (a, b) =>
          (eBoard[b].currentPower ?? eBoard[b].power ?? 0) -
          (eBoard[a].currentPower ?? eBoard[a].power ?? 0)
      );
      if (validLanes.length > 0) {
        targetLane = validLanes[0];
      }
    }

    if (
      targetLane !== -1 &&
      eBoard[targetLane] !== null &&
      (!mySealedLanes || mySealedLanes[targetLane] === 0)
    ) {
      const selectedCard = eBoard[targetLane];
      eBoard[targetLane] = null;

      // 1. VFX再生イベントを登録（演出再生システムに統合）
      events.push({
        type: 'vfx_trigger',
        vfxId: 'anm_viola_arts',
        side: owner,
        lane: targetLane,
      });

      selectedCard.puppetOriginalOwner =
        selectedCard.puppetOriginalOwner || selectedCard.owner || oppOwner;
      if (selectedCard.equippedCards && selectedCard.equippedCards.length > 0) {
        selectedCard.equippedCards.forEach((eqCard) => {
          eqCard.puppetOriginalOwner =
            eqCard.puppetOriginalOwner || eqCard.owner || oppOwner;
        });
      }

      if (
        board[targetLane] &&
        (hasSkill(selectedCard, 'equip') ||
          hasSkill(board[targetLane], 'arm_self')) &&
        !hasSkill(board[targetLane], 'possession') &&
        !hasSkill(selectedCard, 'possession') &&
        !hasSkill(board[targetLane], 'reflect') &&
        !hasSkill(selectedCard, 'reflect')
      ) {
        const targetCard = board[targetLane];
        // 装備（既存カードの上へ）: applyEquipment に処理を集約
        applyEquipment(targetCard, selectedCard);

        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(targetCard)),
          source: 'equip',
          stealFromLane: targetLane, // 奪い元のレーンを指定
        });
      } else {
        const existingCard = board[targetLane];
        if (existingCard) {
          const myDiscard = isBlue ? state.playerDiscard : state.enemyDiscard;
          myDiscard.push(existingCard);
          events.push({
            type: 'discard_card',
            side: owner,
            card: JSON.parse(JSON.stringify(existingCard)),
            source: 'viola_domination_overwrite',
          });
        }

        const movedCard = {
          ...selectedCard,
          owner: owner,
          skillTriggered: true,
          stunTurns: selectedCard.stunTurns || 0,
          stunAppliedThisTurn: selectedCard.stunAppliedThisTurn || false,
        };
        board[targetLane] = movedCard;

        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(movedCard)),
          source: 'viola_domination',
          stealFromLane: targetLane, // 奪い元のレーンを指定
        });
      }
    }
  } else if (action === 'seal_lanes') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    let targets =
      tokenLanes && Array.isArray(tokenLanes) ? [...tokenLanes] : [];
    if (targets.length === 0) {
      const sealedLanes = isBlue
        ? state.enemySealedLanes
        : state.playerSealedLanes;
      const priority = [1, 0, 2]; // 中央 > 左 > 右
      // 1. まず敵カードが居るレーンを優先選択
      for (let l of priority) {
        if ((!sealedLanes || sealedLanes[l] === 0) && eBoard[l] !== null) {
          targets.push(l);
          if (targets.length >= 2) break;
        }
      }
      // 2. まだ選択肢が残っていれば中央→左→右の優先度で埋める
      if (targets.length < 2) {
        for (let l of priority) {
          if (targets.includes(l)) continue;
          if (!sealedLanes || sealedLanes[l] === 0) {
            targets.push(l);
            if (targets.length >= 2) break;
          }
        }
      }
    }

    for (const lane of targets) {
      // Apply Seal (高い方の値を維持・適用)
      if (isBlue) {
        if (state.enemySealedLanes)
          state.enemySealedLanes[lane] = Math.max(
            state.enemySealedLanes[lane] || 0,
            1
          );
      } else {
        if (state.playerSealedLanes)
          state.playerSealedLanes[lane] = Math.max(
            state.playerSealedLanes[lane] || 0,
            1
          );
      }

      // Damage card if exists
      if (eBoard[lane] !== null) {
        damageCard(state, oppOwner, lane, 4, 'seal_lanes', events, true);
      }
    }
  } else if (action === 'night_parade') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const sealedLanes = isBlue
      ? state.enemySealedLanes
      : state.playerSealedLanes;

    let enemyTargets = [];
    if (tokenLanes && tokenLanes.enemy) {
      enemyTargets = [...tokenLanes.enemy];
    } else if (Array.isArray(tokenLanes) && tokenLanes.length > 0) {
      enemyTargets = [...tokenLanes];
    } else {
      // AI Selection Logic
      const priorityLanes = [0, 2, 1].filter(
        (i) => !sealedLanes || sealedLanes[i] === 0
      );
      priorityLanes.sort(
        (a, b) =>
          (eBoard[b]?.currentPower || 0) - (eBoard[a]?.currentPower || 0)
      );
      enemyTargets = priorityLanes.slice(0, 2);
    }

    for (const lane of enemyTargets) {
      // Apply Seal (高い方の値を維持・適用)
      if (isBlue) {
        if (state.enemySealedLanes)
          state.enemySealedLanes[lane] = Math.max(
            state.enemySealedLanes[lane] || 0,
            1
          );
      } else {
        if (state.playerSealedLanes)
          state.playerSealedLanes[lane] = Math.max(
            state.playerSealedLanes[lane] || 0,
            1
          );
      }

      // Damage card if exists
      if (eBoard[lane] !== null) {
        damageCard(state, oppOwner, lane, 4, 'night_parade', events, true);
      }
    }
    // ※ processDestructionTriggers は呼び出し元 (leaderSkills.js) 側で一括実行する
    //    ここで呼ぶとイベントが二重になるため削除

    // Summon Hitodamas
    let allyTargets = [];

    const tM = CARD_MASTER.find((m) => m.id === 'token_soul') || {
      name: '人魂',
      power: 1,
    };

    if (tokenLanes && tokenLanes.allied) {
      allyTargets = [...tokenLanes.allied].slice(0, 1);
    } else {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定
      const bestAllyLane = getBestSimulatedPlacementLane(
        state,
        owner,
        tM,
        [0, 1, 2],
        false
      );
      if (bestAllyLane !== -1) {
        allyTargets = [bestAllyLane];
      }
    }
    for (let idx = 0; idx < allyTargets.length; idx++) {
      const lane = allyTargets[idx];
      const newToken = {
        ...JSON.parse(JSON.stringify(tM)),
        // ...tM のスプレッド後にidを設定し、tM.id による上書きを防ぐ
        id: `tk_np_${Math.floor(getSeededRandom() * 1000000000)}_${idx}`,
        baseId: tM.id,
        owner,
        currentPower: tM.power || 1,
        rarity: tM.rarity || 1,
        isToken: true,
        skillTriggered: true, // 配置なので召喚時スキルは発動させない
      };

      if (!tryEquipToken(state, board, lane, newToken, owner, events)) {
        if (board[lane] !== null) {
          quietDiscardFromBoard(state, owner, lane);
        }
        board[lane] = newToken;
        events.push({
          type: 'summon_token',
          side: owner,
          lane: lane,
          card: JSON.parse(JSON.stringify(newToken)),
          source: 'night_parade',
        });
      }
    }
  } else if (action === 'annihilation') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    for (let i = 0; i < 3; i++) {
      if (eBoard[i]) {
        damageCard(state, oppOwner, i, 4, 'annihilation', events, true);
      }
    }
  } else if (action === 'android_high_volley') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    // 敵の場のすべてのカードに4ダメージ
    for (let i = 0; i < 3; i++) {
      if (eBoard[i]) {
        damageCard(state, oppOwner, i, 4, 'android_high_volley', events, true);
      }
    }
    // 敵リーダーに4ダメージ
    damageLeader(state, oppOwner, 4, 'android_high_volley', events);
  } else if (action === 'dragon_high_ritual') {
    // ===== 焦熱のプレリュード =====
    // 効果①：敵の場のすべてのカードに2ダメージ（免疫は無効）
    events.push({ type: 'leader_skill', skill: action, side: owner });
    for (let i = 0; i < 3; i++) {
      // 相手の場のカードに2ダメージ
      if (eBoard[i]) {
        damageCard(state, oppOwner, i, 2, 'dragon_high_ritual', events, true);
      }
    }
    processDestructionTriggers(state, events);

    // 効果②：自分のレーンにイグニストークン(P:7/伝説)を「配置」（制約チェックなし）
    let dragonRitualLane = -1;
    const tM = CARD_MASTER.find((m) => m.id === 'token_ignis');
    if (tokenLanes && tokenLanes.length > 0) {
      dragonRitualLane = tokenLanes[0];
    } else if (tM) {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定
      dragonRitualLane = getBestSimulatedPlacementLane(
        state,
        owner,
        { ...tM, power: 7, currentPower: 7 },
        [0, 1, 2],
        false
      );
    }
    if (dragonRitualLane !== -1 && tM) {
      const newToken = {
        ...JSON.parse(JSON.stringify(tM)),
        id: `tk_dr_${Math.floor(getSeededRandom() * 1000000000)}`,
        baseId: tM.id,
        owner,
        currentPower: 7,
        rarity: tM.rarity || 1,
        // imgUrl は getCardImgUrl がスキンを参照して解決する
      };
      if (
        !tryEquipToken(state, board, dragonRitualLane, newToken, owner, events)
      ) {
        if (board[dragonRitualLane] !== null) {
          quietDiscardFromBoard(state, owner, dragonRitualLane);
        }
        board[dragonRitualLane] = newToken;
        events.push({
          type: 'summon_token',
          side: owner,
          lane: dragonRitualLane,
          card: JSON.parse(JSON.stringify(newToken)),
          source: 'dragon_high_ritual',
        });
      }
    }
  } else if (action === 'evil_march') {
    events.push({ type: 'leader_skill', skill: action, side: owner });

    // 1. 騎士(P:2)を最大2体「配置」
    const availableLanes = [];
    const sealedLanes = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;
    for (let i = 0; i < 3; i++) {
      if (!sealedLanes || sealedLanes[i] === 0) {
        availableLanes.push(i);
      }
    }

    const tM = CARD_MASTER.find((m) => m.id === 'token_knight') || {
      name: '騎士',
      power: 2,
    };

    // 指定レーンがあれば優先し、なければ客観的評価に基づいて最大2体を順次選定
    let targetLanes = [];
    if (tokenLanes && tokenLanes.length > 0) {
      targetLanes = tokenLanes.slice(0, 2);
    } else {
      // 盤面シミュレーション評価に基づき各騎士の客観的最適レーンを決定
      const candidateLanes = [...availableLanes];
      for (let k = 0; k < 2; k++) {
        if (candidateLanes.length === 0) break;
        const bestL = getBestSimulatedPlacementLane(
          state,
          owner,
          tM,
          candidateLanes,
          false
        );
        if (bestL !== -1) {
          targetLanes.push(bestL);
          // 同一レーンに2体重ねるのを避けるため選出済みレーンを除外
          const remIdx = candidateLanes.indexOf(bestL);
          if (remIdx !== -1) candidateLanes.splice(remIdx, 1);
        }
      }
    }

    for (let idx = 0; idx < targetLanes.length; idx++) {
      const lane = targetLanes[idx];
      const newToken = {
        id: `tk_km_${Math.floor(getSeededRandom() * 1000000000)}_${idx}`,
        uid: `${owner}_tk_km_${Math.floor(getSeededRandom() * 1000000000)}_${idx}`, // for resolution logic
        owner,
        baseId: 'token_knight',
        name: tM.name,
        isToken: true,
        rarity: tM.rarity || 1,
        power: 2,
        basePower: 2,
        currentPower: 2,
        skills: [{ id: 'deadly' }, { id: 'guardian' }],
      };

      if (!tryEquipToken(state, board, lane, newToken, owner, events)) {
        if (board[lane] !== null) {
          quietDiscardFromBoard(state, owner, lane);
        }

        // バフ適用前の状態で召喚イベントを発行
        events.push({
          type: 'summon_token',
          side: owner,
          lane: lane,
          card: JSON.parse(JSON.stringify(newToken)),
          source: 'evil_march',
        });

        board[lane] = newToken;
      }
    }

    // 2. 自分の場のすべてのカードのパワーを+2する
    for (let i = 0; i < 3; i++) {
      if (board[i] !== null) {
        // パワーアップ
        board[i].currentPower += 2;
        events.push({
          type: 'power_change',
          side: owner,
          lane: i,
          amount: 2,
          source: 'evil_march',
        });
      }
    }
  } else if (action === 'otherworld_gate') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const h = isBlue ? state.playerHand : state.enemyHand;
    const opH = isBlue ? state.enemyHand : state.playerHand;

    // 1. 最大2枚捨てる（共通のAI手札選択ロジックを使用、最大2枚まで任意のため isExact=false）
    let dc = 0;
    if (h.length > 0) {
      const dropIndices = getAIDiscardIndices(h, 2, false);
      // Splice from the end to avoid index shifting
      const sortedDropIndices = [...dropIndices].sort((a, b) => b - a);
      for (let i of sortedDropIndices) {
        h.splice(i, 1);
        dc++;
      }
    }

    // 2枚引く（シミュレーションでは仮のカードを引いた体にするか、評価値には直接影響させずとも手札数は補充）
    // ただし引いたカードはシミュレータからは予測不能なため仮カードを入れるか省略する。とりあえず手札数は維持する
    const dummyDraw = { name: 'Unknown', power: 3, currentPower: 3 }; // AIの平均的なパワー期待値
    for (let i = 0; i < dc; i++) {
      h.push(JSON.parse(JSON.stringify(dummyDraw)));
    }

    // 2. 自陣の手札バフ
    h.forEach((c) => {
      if (c.currentPower !== undefined) c.currentPower += 2;
      else c.power += 2;
    });

    // 3. 相手の手札破壊＆虚空（AIからはランダムドロップするだけ）
    let opDc = 0;
    for (let i = 0; i < 2; i++) {
      if (opH.length > 0) {
        const randIdx = Math.floor(getSeededRandom() * opH.length);
        opH.splice(randIdx, 1);
        opDc++;
      }
    }

    if (opDc > 0) {
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        id: 'token_void',
        name: '虚空',
        power: 0,
      };
      for (let i = 0; i < opDc; i++) {
        opH.push({
          ...voidTpl,
          id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_owg${i}`,
          uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidowg${i}`,
          owner: oppOwner,
          baseId: 'token_void',
          isToken: true,
          power: voidTpl.power ?? 0,
          basePower: voidTpl.power ?? 0,
          currentPower: voidTpl.power ?? 0,
        });
      }
    }
  } else if (action === 'targeted_destruction') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    let targetLane = -1;
    if (tokenLanes && tokenLanes.length > 0) {
      targetLane = tokenLanes[0];
    } else {
      let maxP = -1;
      for (let i = 0; i < 3; i++) {
        if (eBoard[i] && eBoard[i].currentPower > maxP) {
          maxP = eBoard[i].currentPower;
          targetLane = i;
        }
      }
    }

    if (targetLane !== -1 && eBoard[targetLane] !== null) {
      const decision = { type: 'targeted_destruction', laneIdx: targetLane };
      if (!state._actionQueue) state._actionQueue = [];
      state._actionQueue.push(decision);

      const targetCard = eBoard[targetLane];

      // 【能力をなくす処理（沈黙化）】
      // 破壊前に対象カードのすべてのスキル・一時効果を消去する
      clearCardAbilities(targetCard);

      events.push({
        type: 'oblivion_clear',
        side: oppOwner,
        lane: targetLane,
        source: 'targeted_destruction',
        silent: true,
        card: JSON.parse(JSON.stringify(targetCard)),
      });

      if (canCardBeDestroyed(state, targetCard, oppOwner)) {
        targetCard.currentPower = 0;
        events.push({
          type: 'deadly',
          side: oppOwner,
          lane: targetLane,
          source: 'targeted_destruction',
        });
      } else {
        events.push({
          type: isValkyriaGuardActive(state, oppOwner)
            ? 'valkyria_guard_block'
            : 'immune_block',
          side: oppOwner,
          lane: targetLane,
          source: 'targeted_destruction',
        });
      }
    }
  } else if (action === 'elf_polarbear_combo') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    let targetLane = -1;
    let myLane = -1;
    if (tokenLanes && tokenLanes.length === 2) {
      targetLane = tokenLanes[0];
      myLane = tokenLanes[1];
    } else if (tokenLanes && tokenLanes.length > 0) {
      // （フォールバックなどのため）
      targetLane = tokenLanes[0];
      myLane = tokenLanes.length > 1 ? tokenLanes[1] : 0; // fallback
    } else {
      // AI用決定ロジック
      let maxP = -1;
      for (let i = 0; i < 3; i++) {
        if (eBoard[i] && eBoard[i].currentPower > maxP) {
          maxP = eBoard[i].currentPower;
          targetLane = i;
        }
      }
      // 盤面シミュレーション評価に基づきヴォイテク配置の客観的最適レーンを決定
      const tBear = CARD_MASTER.find((m) => m.id === 'token_polarbear') || {
        name: 'ヴォイテク',
        power: 4,
      };
      myLane = getBestSimulatedPlacementLane(
        state,
        owner,
        tBear,
        [0, 1, 2],
        false
      );
    }

    if (targetLane !== -1 || myLane !== -1) {
      const decision = { type: 'elf_polarbear_combo', targetLane, myLane };
      if (!state._actionQueue) state._actionQueue = [];
      state._actionQueue.push(decision);
    }

    // パート1: 相手のカードの能力消去および破壊（選ばれた場合のみ）
    if (targetLane !== -1 && eBoard[targetLane] !== null) {
      const targetCard = eBoard[targetLane];

      // 【能力をなくす処理（沈黙化）】
      // 破壊前に対象カードのすべてのスキル・一時効果を消去する
      clearCardAbilities(targetCard);

      events.push({
        type: 'oblivion_clear',
        side: oppOwner,
        lane: targetLane,
        source: 'elf_polarbear_combo',
        silent: true,
        card: JSON.parse(JSON.stringify(targetCard)),
      });

      if (canCardBeDestroyed(state, targetCard, oppOwner)) {
        targetCard.currentPower = 0;
        events.push({
          type: 'deadly',
          side: oppOwner,
          lane: targetLane,
          source: 'elf_polarbear_combo',
        });
      } else {
        events.push({
          type: isValkyriaGuardActive(state, oppOwner)
            ? 'valkyria_guard_block'
            : 'immune_block',
          side: oppOwner,
          lane: targetLane,
          source: 'elf_polarbear_combo',
        });
      }
    }

    // パート2: ヴォイテクの配置
    const mySealedLanesFinal = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;
    if (
      myLane !== -1 &&
      (!mySealedLanesFinal || mySealedLanesFinal[myLane] === 0)
    ) {
      // 既存のカードがあれば墓地へ送る（上書き許可）or 起動
      const tokenMaster = {
        id: 'token_polarbear',
        name: 'ヴォイテク',
        rarity: 1,
        power: 4,
        isToken: true,
        skills: [{ id: 'legendary' }, { id: 'pierce' }],
        voiceCategory: 'beast',
        flavor: 'リナと共に戦う白熊',
      };
      const bearCard = {
        ...tokenMaster,
        uid: 'dng_tk_' + Math.floor(getSeededRandom() * 1000000000),
        owner: owner,
        currentPower: tokenMaster.power,
        skillTriggered: true, // 配置のため召喚時効果（もしあれば）は発動しない
        stunTurns: 0,
        stunAppliedThisTurn: false,
      };

      if (board[myLane] !== null && hasSkill(board[myLane], 'startup')) {
        const discardPile =
          owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
        if (!bearCard.isToken) {
          discardPile.push(bearCard);
        }
        resolveStartupFade(owner, board[myLane], myLane, bearCard, events);
      } else {
        if (board[myLane] !== null) {
          quietDiscardFromBoard(state, owner, myLane);
        }
        board[myLane] = bearCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: myLane,
          card: bearCard,
          source: 'elf_polarbear_combo',
        });
      }
    }
  } else if (action === 'tomb_guard') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const oppDeck = isBlue ? state.enemyDeck : state.playerDeck;
    const oppDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    // 相手のデッキの上から最大4枚を墓地へ送る
    const millCount = Math.min(4, oppDeck.length);
    if (millCount > 0) {
      const milledCards = oppDeck.splice(0, millCount);
      oppDiscard.push(...milledCards);
      events.push({
        type: 'deck_mill',
        side: oppOwner,
        count: millCount,
        source: 'tomb_guard',
      });
    }

    // 相手の場のカード1枚に4ダメージ
    if (tokenLanes && tokenLanes.length > 0) {
      const targetLane = tokenLanes[0];
      const targetCard = eBoard[targetLane];
      if (targetCard) {
        damageCard(state, oppOwner, targetLane, 4, 'tomb_guard', events, true);
      }
    }
  } else if (action === 'death_judgment') {
    // 【死者の審判】相手のデッキを残り1枚になるように墓地に送る + 相手の場のカード1枚に8ダメージ
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const oppDeck = isBlue ? state.enemyDeck : state.playerDeck;
    const oppDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    // 相手のデッキを残り1枚になるまで墓地へ送る
    const REMAINING_DECK_COUNT = 1;
    const DEATH_JUDGMENT_DAMAGE = 4;
    const millCount = Math.max(0, oppDeck.length - REMAINING_DECK_COUNT);
    if (millCount > 0) {
      const milledCards = oppDeck.splice(0, millCount);
      oppDiscard.push(...milledCards);
      events.push({
        type: 'deck_mill',
        side: oppOwner,
        count: millCount,
        source: 'death_judgment',
      });
    }

    // 相手の場のカード1枚に8ダメージ
    if (tokenLanes && tokenLanes.length > 0) {
      const targetLane = tokenLanes[0];
      const targetCard = eBoard[targetLane];
      if (targetCard) {
        damageCard(
          state,
          oppOwner,
          targetLane,
          DEATH_JUDGMENT_DAMAGE,
          'death_judgment',
          events,
          true
        );
      }
    }
  } else if (action === 'devilhunter_resurrect') {
    if (isGraveKeeperActive(state)) return events;
    const discard = isBlue ? state.playerDiscard : state.enemyDiscard;
    const validCards = discard.filter((card) => card && !card.isToken);
    if (validCards.length > 0) {
      let selectedCard = null;
      if (
        forcedTargetIdx !== null &&
        discard[forcedTargetIdx] &&
        !discard[forcedTargetIdx].isToken
      ) {
        selectedCard = discard[forcedTargetIdx];
      } else {
        const sorted = [...validCards].sort((a, b) => b.power - a.power);
        selectedCard = sorted[0];
      }
      let l = -1;
      if (tokenLanes && tokenLanes.length > 0) {
        l = tokenLanes[0];
      } else if (selectedCard) {
        // 盤面シミュレーション評価に基づき客観的最適レーンを決定（配置スキルのため制約チェックなし）
        l = getBestSimulatedPlacementLane(
          state,
          owner,
          selectedCard,
          [0, 1, 2],
          false
        );
      }
      if (l !== -1) {
        const decision = {
          type: 'devilhunter_resurrect',
          targetIdx: discard.indexOf(selectedCard),
          laneIdx: l,
        };
        if (!state._actionQueue) state._actionQueue = [];
        state._actionQueue.push(decision);

        events.push({ type: 'leader_skill', skill: action, side: owner });
        const existingCard = board[l];
        const unionSkill =
          selectedCard.skills &&
          selectedCard.skills.find((s) => s.id === 'union');
        const isUnion =
          unionSkill &&
          existingCard &&
          matchesUnionMaterial(existingCard, unionSkill);
        const isEquip =
          hasSkill(selectedCard, 'equip') ||
          (existingCard && hasSkill(existingCard, 'arm_self'));
        if (isUnion) {
          const masterData =
            CARD_MASTER.find((c) => c.id === unionSkill.summonId) ||
            CARD_MASTER.find((c) => c.id === 'android');
          let unionCard = JSON.parse(JSON.stringify(masterData));
          unionCard.uid = `ls_un_sim_${Math.floor(getSeededRandom() * 1000000000)}`;
          unionCard.owner = owner;
          unionCard.baseId = unionCard.id;
          unionCard.basePower = unionCard.power;
          unionCard.currentPower = unionCard.power;
          unionCard.skillTriggered = true; // 配置からの合体のため召喚時効果は不発
          unionCard.stunTurns = 0;
          board[l] = unionCard;
          events.push({
            type: 'summon_card',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(unionCard)),
            source: 'union',
          });
        } else if (
          isEquip &&
          existingCard &&
          !hasSkill(existingCard, 'possession') &&
          !hasSkill(selectedCard, 'possession') &&
          !hasSkill(existingCard, 'reflect') &&
          !hasSkill(selectedCard, 'reflect')
        ) {
          // 装備（既存カードの上へ）: applyEquipment に処理を集約
          applyEquipment(existingCard, selectedCard);

          events.push({
            type: 'power_change',
            side: owner,
            lane: l,
            amount: selectedCard.appliedEquipPower ?? selectedCard.power,
            source: 'equip',
            card: selectedCard,
          });
        } else if (existingCard && hasSkill(existingCard, 'startup')) {
          if (!selectedCard.isToken) {
            discard.push(selectedCard);
          }
          resolveStartupFade(
            owner,
            existingCard,
            l,
            JSON.parse(JSON.stringify(selectedCard)),
            events
          );
        } else {
          if (existingCard) {
            const simDiscard =
              owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
            simDiscard.push(existingCard);
          }
          const resurrectedCard = {
            ...selectedCard,
            id: `res_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
            baseId: selectedCard.baseId || selectedCard.id,
          };
          resurrectedCard.currentPower = resurrectedCard.power;
          resurrectedCard.skillTriggered = true;
          resurrectedCard.stunTurns = 0;
          board[l] = resurrectedCard;
          events.push({
            type: 'summon_card',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(resurrectedCard)),
            source: 'devilhunter_resurrect',
          });
        }

        if (selectedCard) {
          const removeIdx = discard.findIndex(
            (x) => x && x.id === selectedCard.id
          );
          if (removeIdx !== -1) discard.splice(removeIdx, 1);
        }
      }
    }
  } else if (action === 'overdrive') {
    if (isGraveKeeperActive(state)) return events;
    // 【オーバードライブ】自分の墓地 → tokenLanes[0] に配置、相手の墓地 → tokenLanes[1] に配置
    const myDiscard = isBlue ? state.playerDiscard : state.enemyDiscard;
    const oppDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    let mySelectedCard = null;
    let oppSelectedCard = null;

    const placeFromDiscard = (discard, laneIdx) => {
      const validCards = discard.filter((c) => c && !c.isToken);
      if (validCards.length === 0 || laneIdx === -1) return null;
      const sorted = [...validCards].sort(
        (a, b) => (b.power || 0) - (a.power || 0)
      );
      const selectedCard = sorted[0];
      const existingCard = board[laneIdx];
      if (existingCard) {
        // 上書き: 既存カードを墓地へ
        myDiscard.push(existingCard);
      }
      const resurrectedCard = {
        ...selectedCard,
        id: `od_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
        baseId: selectedCard.baseId || selectedCard.id,
      };
      resurrectedCard.currentPower = resurrectedCard.power;
      resurrectedCard.skillTriggered = true;
      resurrectedCard.stunTurns = 0;
      board[laneIdx] = resurrectedCard;
      events.push({
        type: 'summon_card',
        side: owner,
        lane: laneIdx,
        card: JSON.parse(JSON.stringify(resurrectedCard)),
        source: 'overdrive',
      });
      const removeIdx = discard.findIndex((x) => x && x.id === selectedCard.id);
      if (removeIdx !== -1) discard.splice(removeIdx, 1);
      return selectedCard;
    };

    const mySealed = (isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes) || [0, 0, 0];
    const isLaneAvailable = (l) =>
      typeof l === 'number' && l >= 0 && l < 3 && mySealed[l] === 0;

    // 自分の墓地 → tokenLanes[0] (forcedTargetIdx が指定されている場合はその優先)
    const myCandidates = myDiscard.filter((card) => card && !card.isToken);
    const targetMyCard =
      forcedTargetIdx !== null &&
      myDiscard[forcedTargetIdx] &&
      !myDiscard[forcedTargetIdx].isToken
        ? myDiscard[forcedTargetIdx]
        : [...myCandidates].sort((a, b) => (b.power || 0) - (a.power || 0))[0];

    let lane1 =
      tokenLanes && tokenLanes.length > 0 && isLaneAvailable(tokenLanes[0])
        ? tokenLanes[0]
        : -1;
    if (lane1 === -1 && targetMyCard) {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定（未封印レーンのみ対象）
      lane1 = getBestSimulatedPlacementLane(
        state,
        owner,
        targetMyCard,
        [0, 1, 2],
        false
      );
    }

    // 未封印レーンが存在し、有効なレーンが決定できた場合のみ配置を実行
    if (lane1 !== -1) {
      if (
        forcedTargetIdx !== null &&
        myDiscard[forcedTargetIdx] &&
        !myDiscard[forcedTargetIdx].isToken
      ) {
        const forcedCard = myDiscard[forcedTargetIdx];
        const existingCard = board[lane1];
        if (existingCard) myDiscard.push(existingCard);
        const resurrectedCard = {
          ...forcedCard,
          id: `od_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: forcedCard.baseId || forcedCard.id,
        };
        resurrectedCard.currentPower = resurrectedCard.power;
        resurrectedCard.skillTriggered = true;
        resurrectedCard.stunTurns = 0;
        board[lane1] = resurrectedCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: lane1,
          card: JSON.parse(JSON.stringify(resurrectedCard)),
          source: 'overdrive',
        });
        mySelectedCard = forcedCard;
        myDiscard.splice(forcedTargetIdx, 1);
      } else {
        mySelectedCard = placeFromDiscard(myDiscard, lane1);
      }
    }

    // 相手の墓地 → tokenLanes[1]
    const oppCandidates = oppDiscard.filter((card) => card && !card.isToken);
    const targetOppCard =
      forcedOppTargetIdx !== null &&
      oppDiscard[forcedOppTargetIdx] &&
      !oppDiscard[forcedOppTargetIdx].isToken
        ? oppDiscard[forcedOppTargetIdx]
        : [...oppCandidates].sort((a, b) => (b.power || 0) - (a.power || 0))[0];

    let lane2 =
      tokenLanes &&
      tokenLanes.length > 1 &&
      isLaneAvailable(tokenLanes[1]) &&
      tokenLanes[1] !== lane1
        ? tokenLanes[1]
        : -1;
    if (lane2 === -1 && targetOppCard) {
      const remainingLanes = [0, 1, 2].filter(
        (l) => l !== lane1 && isLaneAvailable(l)
      );
      if (remainingLanes.length > 0) {
        // 盤面シミュレーション評価に基づき客観的最適レーンを決定（未封印の残りレーンのみ対象）
        lane2 = getBestSimulatedPlacementLane(
          state,
          owner,
          targetOppCard,
          remainingLanes,
          false
        );
      }
    }

    // 未封印レーンが存在し、有効なレーンが決定できた場合のみ配置を実行
    if (lane2 !== -1) {
      // 相手墓地のカード選択: forcedOppTargetIdx が指定されている場合はその優先
      if (
        forcedOppTargetIdx !== null &&
        oppDiscard[forcedOppTargetIdx] &&
        !oppDiscard[forcedOppTargetIdx].isToken
      ) {
        const forcedOppCard = oppDiscard[forcedOppTargetIdx];
        const existingCard2 = board[lane2];
        if (existingCard2) {
          myDiscard.push(existingCard2);
        }
        const resurrectedOppCard = {
          ...forcedOppCard,
          id: `od_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: forcedOppCard.baseId || forcedOppCard.id,
        };
        resurrectedOppCard.currentPower = resurrectedOppCard.power;
        resurrectedOppCard.skillTriggered = true;
        resurrectedOppCard.stunTurns = 0;
        board[lane2] = resurrectedOppCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: lane2,
          card: JSON.parse(JSON.stringify(resurrectedOppCard)),
          source: 'overdrive',
        });
        oppSelectedCard = forcedOppCard;
        oppDiscard.splice(forcedOppTargetIdx, 1);
      } else {
        oppSelectedCard = placeFromDiscard(oppDiscard, lane2);
      }
    }

    // AIのアクションキューに決定した復活カード情報を登録（実際のゲームで正しく選択されるようにする）
    if (!state._actionQueue) state._actionQueue = [];
    if (mySelectedCard && lane1 !== -1) {
      state._actionQueue.push({
        type: 'overdrive',
        targetIdx: myDiscard.indexOf(mySelectedCard), // すでに splice されている可能性を考慮するが、基本的には UID 照合を優先するため UID を渡す
        targetUid: mySelectedCard.uid,
        laneIdx: lane1,
      });
    }
    if (oppSelectedCard && lane2 !== -1) {
      state._actionQueue.push({
        type: 'overdrive',
        targetIdx: oppDiscard.indexOf(oppSelectedCard),
        targetUid: oppSelectedCard.uid,
        laneIdx: lane2,
      });
    }
  } else if (action === 'warlock_place_demons') {
    events.push({ type: 'leader_skill', skill: action, side: owner });

    const sealedLanes = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;
    const skeletonTpl = CARD_MASTER.find((m) => m.id === 'token_skeleton');
    const daemonTpl = CARD_MASTER.find((m) => m.id === 'token_daemon');

    // 1. スケルトン1体を配置するレーンの決定
    let targetLane = -1;
    if (tokenLanes && tokenLanes.length > 0) {
      const requestedLane = tokenLanes[0];
      if (
        requestedLane >= 0 &&
        requestedLane < 3 &&
        (!sealedLanes || sealedLanes[requestedLane] === 0)
      ) {
        targetLane = requestedLane;
      }
    } else if (skeletonTpl) {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定
      targetLane = getBestSimulatedPlacementLane(
        state,
        owner,
        skeletonTpl,
        [0, 1, 2],
        false
      );
    }

    // 2. スケルトンを配置 or 起動
    if (targetLane !== -1) {
      if (
        board[targetLane] !== null &&
        hasSkill(board[targetLane], 'startup')
      ) {
        const newSkeleton = {
          ...JSON.parse(JSON.stringify(skeletonTpl)),
          id: `tk_sk_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
          uid: `${owner}_tk_sk_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
          baseId: skeletonTpl.id,
          owner,
          currentPower: skeletonTpl.power,
          rarity: skeletonTpl.rarity || 1,
          imgUrl: 'assets/cards/card_token_skeleton.webp',
          isToken: true,
        };
        resolveStartupFade(
          owner,
          board[targetLane],
          targetLane,
          newSkeleton,
          events
        );
      } else {
        if (board[targetLane] !== null) {
          quietDiscardFromBoard(state, owner, targetLane);
        }
        const newSkeleton = {
          ...JSON.parse(JSON.stringify(skeletonTpl)),
          id: `tk_sk_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
          uid: `${owner}_tk_sk_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
          baseId: skeletonTpl.id,
          owner,
          currentPower: skeletonTpl.power,
          rarity: skeletonTpl.rarity || 1,
          imgUrl: 'assets/cards/card_token_skeleton.webp',
          isToken: true,
        };
        // 【絶対厳守ルール】「配置」なので、召喚時のアクティブスキルは発動させない
        newSkeleton.skillTriggered = true;

        board[targetLane] = newSkeleton;
        events.push({
          type: 'summon_token',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(newSkeleton)),
          source: 'warlock_place_demons',
        });
      }
    }

    // 3. その後、自分のカードが配置されているすべてのレーンにデーモンを配置 or 起動
    for (let l = 0; l < 3; l++) {
      // 自分のカードが存在し、かつ封印されていないレーン
      if (board[l] !== null && (!sealedLanes || sealedLanes[l] === 0)) {
        if (hasSkill(board[l], 'startup')) {
          const newDaemon = {
            ...JSON.parse(JSON.stringify(daemonTpl)),
            id: `tk_d_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            uid: `${owner}_tk_d_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            baseId: daemonTpl.id,
            owner,
            currentPower: daemonTpl.power,
            rarity: daemonTpl.rarity || 1,
            imgUrl: 'assets/cards/card_token_daemon.webp',
            isToken: true,
          };
          resolveStartupFade(owner, board[l], l, newDaemon, events);
        } else {
          // カードを静かに捨てる
          quietDiscardFromBoard(state, owner, l);

          const newDaemon = {
            ...JSON.parse(JSON.stringify(daemonTpl)),
            id: `tk_d_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            uid: `${owner}_tk_d_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            baseId: daemonTpl.id,
            owner,
            currentPower: daemonTpl.power,
            rarity: daemonTpl.rarity || 1,
            imgUrl: 'assets/cards/card_token_daemon.webp',
            isToken: true,
          };
          // 【絶対厳守ルール】「配置」なので、召喚時のアクティブスキルは発動させない
          newDaemon.skillTriggered = true;

          board[l] = newDaemon;
          events.push({
            type: 'summon_token',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(newDaemon)),
            source: 'warlock_place_demons',
          });
        }
      }
    }
  } else if (
    action === 'satan_avatar' ||
    action === 'dragon_summon' ||
    action === 'dungeon_summon_leader'
  ) {
    let power = 5;
    if (action === 'satan_avatar') power = 10;
    else if (action === 'dragon_summon') power = 7;
    else if (action === 'dungeon_summon_leader') {
      const config = isBlue ? state.playerConfig : state.enemyConfig;
      const lc = config?.leaderCardId
        ? CARD_MASTER.find((m) => m.id === config.leaderCardId)
        : null;
      power = lc ? lc.power || 0 : 6;
    }

    let tM = null;
    if (action === 'satan_avatar') {
      tM = CARD_MASTER.find((m) => m.id === 'token_satan');
    } else if (action === 'dragon_summon') {
      tM = CARD_MASTER.find((m) => m.id === 'token_ignis');
    } else if (action === 'dungeon_summon_leader') {
      const config = isBlue ? state.playerConfig : state.enemyConfig;
      if (config && config.leaderCardId) {
        tM = CARD_MASTER.find((m) => m.id === config.leaderCardId);
      }
    }

    if (!tM) return events;

    let l = -1;
    if (tokenLanes && tokenLanes.length > 0) {
      l = tokenLanes[0];
    } else {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定
      // 試練の宮殿は「召喚」（制約あり）、サタン・竜王は「配置」（制約無視）
      const checkConstraints = action === 'dungeon_summon_leader';
      l = getBestSimulatedPlacementLane(
        state,
        owner,
        { ...tM, power, currentPower: power },
        [0, 1, 2],
        checkConstraints
      );
    }

    if (l !== -1) {
      events.push({ type: 'leader_skill', skill: action, side: owner });

      const newToken = {
        ...JSON.parse(JSON.stringify(tM)),
        id: `tk_${Math.floor(getSeededRandom() * 1000000000)}`,
        baseId: tM.id,
        owner,
        currentPower: power,
        rarity: tM.rarity || 1,
      };
      // satan_avatarのみimgUrlを固定設定；dragon系はgetCardImgUrlがスキンを参照して解決する
      if (action === 'satan_avatar')
        newToken.imgUrl = 'assets/cards/card_token_satan.webp';

      const isSummonLeaderAction = action === 'dungeon_summon_leader';
      if (
        !tryEquipToken(
          state,
          board,
          l,
          newToken,
          owner,
          events,
          isSummonLeaderAction
        )
      ) {
        if (board[l] !== null && hasSkill(board[l], 'startup')) {
          resolveStartupFade(
            owner,
            board[l],
            l,
            JSON.parse(JSON.stringify(newToken)),
            events
          );
        } else {
          if (board[l] !== null) {
            quietDiscardFromBoard(state, owner, l);
          }

          board[l] = newToken;
          events.push({
            type: 'summon_token',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(newToken)),
            source: action,
          });
        }

        // 【全通りシミュレーション対応】召喚されたリーダーカードの召喚時復活スキルを評価
        if (state._actionQueue && newToken.skills) {
          newToken.skills.forEach((s) => {
            if (s.id === 'resurrect') {
              const simDiscard =
                owner === 'blue' ? state.playerDiscard : state.enemyDiscard;

              // シミュレータから指定されたカードとレーンで復活をシミュレート
              if (
                forcedTargetIdx !== null &&
                forcedTargetIdx !== -1 &&
                simDiscard[forcedTargetIdx] &&
                simulatedResurrectLane !== null &&
                simulatedResurrectLane !== -1
              ) {
                const simResCard = simDiscard[forcedTargetIdx];
                const resLane = simulatedResurrectLane;

                // 封印されているレーンへの復活（配置）をブロック
                const sealedLanes =
                  owner === 'blue'
                    ? state.playerSealedLanes
                    : state.enemySealedLanes;
                if (sealedLanes && sealedLanes[resLane] > 0) {
                  return;
                }

                // 復活対象の上限とトークン除外の検証
                if (
                  simResCard.isToken ||
                  (simResCard.power || 0) > (s.value || 1)
                ) {
                  return;
                }

                // 盤面への配置 (または合体/装備) の処理を適用
                const existingCard = board[resLane];
                const unionSkill =
                  simResCard.skills &&
                  simResCard.skills.find((us) => us.id === 'union');
                const isUnion =
                  unionSkill &&
                  existingCard &&
                  matchesUnionMaterial(existingCard, unionSkill);
                const isEquip =
                  hasSkill(simResCard, 'equip') ||
                  (existingCard && hasSkill(existingCard, 'arm_self'));
                // 【憑依】：憑依・反射を持つカードには装備できない
                const targetBlocksEquip =
                  (existingCard &&
                    (hasSkill(existingCard, 'possession') ||
                      hasSkill(existingCard, 'reflect'))) ||
                  hasSkill(simResCard, 'possession') ||
                  hasSkill(simResCard, 'reflect');

                if (isUnion) {
                  const masterData =
                    CARD_MASTER.find((m) => m.id === unionSkill.summonId) ||
                    CARD_MASTER.find((m) => m.id === 'android');
                  let unionCard = JSON.parse(JSON.stringify(masterData));
                  unionCard.uid = `ls_un_sim_${Math.floor(getSeededRandom() * 1000000000)}`;
                  unionCard.owner = owner;
                  unionCard.baseId = unionCard.id;
                  unionCard.basePower = unionCard.power;
                  unionCard.currentPower = unionCard.power;
                  unionCard.unionMaterials = [existingCard, simResCard];
                  unionCard.skillTriggered = true; // 配置（復活）からの合体のため召喚時効果は不発
                  unionCard.stunTurns = 0;
                  unionCard.stunAppliedThisTurn = false;
                  board[resLane] = unionCard;

                  events.push({
                    type: 'summon_card',
                    side: owner,
                    lane: resLane,
                    card: unionCard,
                    source: 'union',
                  });
                } else if (isEquip && existingCard && !targetBlocksEquip) {
                  const targetCard = board[resLane];
                  // 装備（既存カードの上へ）: applyEquipment に処理を集約
                  applyEquipment(targetCard, simResCard);

                  events.push({
                    type: 'summon_card',
                    side: owner,
                    lane: resLane,
                    card: targetCard,
                    source: 'equip',
                  });
                } else {
                  if (existingCard) {
                    quietDiscardFromBoard(state, owner, resLane);
                  }
                  board[resLane] = {
                    ...JSON.parse(JSON.stringify(simResCard)),
                    id: `res_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
                    uid: `res_uid_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
                    owner: owner,
                    skillTriggered: true,
                    stunTurns: 0,
                    stunAppliedThisTurn: false,
                  };
                  board[resLane].currentPower = board[resLane].power;

                  events.push({
                    type: 'summon_card',
                    side: owner,
                    lane: resLane,
                    card: board[resLane],
                    source: 'resurrect',
                  });
                }

                // 墓地から削除
                simDiscard.splice(forcedTargetIdx, 1);

                // 【重要】実機での解決用に決定データをアクションキューに登録
                state._actionQueue.push({
                  type: 'resurrect',
                  targetIdx: forcedTargetIdx,
                  targetUid:
                    forcedTargetUid || simResCard.baseId || simResCard.id,
                  laneIdx: resLane,
                  simulated: true, // シミュレーション適用済みフラグ
                });
              }
            }
          });
        }
      }
    }
  } else if (action === 'holy_march') {
    // 騎士召喚（最大2体）
    events.push({ type: 'leader_skill', skill: action, side: owner });
    let count = 0;
    const addKnight = (lane) => {
      const tK = CARD_MASTER.find((m) => m.id === 'token_knight');
      const tk = {
        ...JSON.parse(JSON.stringify(tK)),
        id: `tk_k_${Math.floor(getSeededRandom() * 1000000000)}_${lane}`,
        owner,
        currentPower: tK.power,
        rarity: tK.rarity || 1,
        imgUrl: 'assets/cards/card_token_knight.webp',
      };
      board[lane] = tk;
      // 後続のループで tk自身が +2 されるため、イベントに積むcardは追加時点のものをディープコピーしておく
      events.push({
        type: 'summon_token',
        side: owner,
        lane,
        card: JSON.parse(JSON.stringify(tk)),
        source: 'holy_march',
      });
      count++;
    };

    if (tokenLanes !== null) {
      // 多重防御: UI側の連打バグ等で3レーン以上が渡されても最大2体に制限
      for (let l of tokenLanes) {
        if (count >= 2) break;
        const tK = CARD_MASTER.find((m) => m.id === 'token_knight');
        const tk = {
          ...JSON.parse(JSON.stringify(tK)),
          id: `tk_k_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
          owner,
          currentPower: tK.power,
          rarity: tK.rarity || 1,
          imgUrl: 'assets/cards/card_token_knight.webp',
          isToken: true,
        };

        if (!tryEquipToken(state, board, l, tk, owner, events)) {
          if (board[l] !== null) {
            quietDiscardFromBoard(state, owner, l);
          }
          board[l] = tk;
          events.push({
            type: 'summon_token',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(tk)),
            source: 'holy_march',
          });
        }
        count++;
      }
    } else {
      const tK = CARD_MASTER.find((m) => m.id === 'token_knight') || {
        name: '騎士',
        power: 2,
      };
      const candidateLanes = [0, 1, 2];
      while (count < 2 && candidateLanes.length > 0) {
        // 盤面シミュレーション評価に基づき客観的最適レーンを順次決定
        const bestL = getBestSimulatedPlacementLane(
          state,
          owner,
          tK,
          candidateLanes,
          false
        );
        if (bestL !== -1) {
          addKnight(bestL);
          const remIdx = candidateLanes.indexOf(bestL);
          if (remIdx !== -1) candidateLanes.splice(remIdx, 1);
        } else {
          break;
        }
      }
    }
    // 全体バフ+2
    for (let i = 0; i < 3; i++) {
      if (board[i]) {
        board[i].currentPower += 2;
        board[i].power += 2;
        events.push({
          type: 'power_change',
          side: owner,
          lane: i,
          amount: 2,
          source: 'holy_march',
        });
      }
    }
  } else if (action === 'god_flame') {
    executeFlameHealLeaderSkill(state, action, owner, GOD_FLAME_AMOUNT, events);
  } else if (action === 'condemnation') {
    executeFlameHealLeaderSkill(
      state,
      action,
      owner,
      CONDEMNATION_AMOUNT,
      events
    );
  } else if (action === 'time_stop') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    state.extraTurnCount = (state.extraTurnCount || 0) + 2;
    state.attackSkipCount = (state.attackSkipCount || 0) + 2;
  } else if (action === 'world_reconstruct') {
    // 【世界の再構築】お互いの手札を全て捨て、墓地をリセットし、自分4枚/相手3枚引く＋追加1ターン
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const MY_DRAW_COUNT = 4;
    const OP_DRAW_COUNT = 3;

    const myHand = isBlue ? state.playerHand : state.enemyHand;
    const opHand = isBlue ? state.enemyHand : state.playerHand;
    const myDeck = isBlue ? state.playerDeck : state.enemyDeck;
    const opDeck = isBlue ? state.enemyDeck : state.playerDeck;
    // 墓地配列が存在しない場合（AIシミュレーション等）は初期化する
    if (!state.playerDiscard) state.playerDiscard = [];
    if (!state.enemyDiscard) state.enemyDiscard = [];
    const myDiscard = isBlue ? state.playerDiscard : state.enemyDiscard;
    const opDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    // 1. 互いの手札を全て墓地に送る（トークンは墓地に入れず除外する）
    while (myHand.length > 0) {
      const card = myHand.pop();
      if (!card.isToken) myDiscard.push(card);
    }
    while (opHand.length > 0) {
      const card = opHand.pop();
      if (!card.isToken) opDiscard.push(card);
    }

    // 2. 墓地をリセット（墓地のカードをデッキに戻してシャッフル、トークンは除外）
    while (myDiscard.length > 0) {
      const card = myDiscard.pop();
      if (!card.isToken) myDeck.push(card);
    }
    while (opDiscard.length > 0) {
      const card = opDiscard.pop();
      if (!card.isToken) opDeck.push(card);
    }
    // シャッフル（シード付き乱数でデッキをシャッフル）
    for (let i = myDeck.length - 1; i > 0; i--) {
      const j = Math.floor(getSeededRandom() * (i + 1));
      [myDeck[i], myDeck[j]] = [myDeck[j], myDeck[i]];
    }
    for (let i = opDeck.length - 1; i > 0; i--) {
      const j = Math.floor(getSeededRandom() * (i + 1));
      [opDeck[i], opDeck[j]] = [opDeck[j], opDeck[i]];
    }

    // 3. 自分4枚ドロー
    for (let i = 0; i < MY_DRAW_COUNT && myDeck.length > 0; i++) {
      myHand.push(myDeck.pop());
    }
    // 相手3枚ドロー
    for (let i = 0; i < OP_DRAW_COUNT && opDeck.length > 0; i++) {
      opHand.push(opDeck.pop());
    }

    // 4. 追加ターン1回（SP増加なし・攻撃なし）
    state.extraTurnCount = (state.extraTurnCount || 0) + 1;
    state.attackSkipCount = (state.attackSkipCount || 0) + 1;
  } else if (action === 'valkyria_guard') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    // 戦乙女の加護: 次の自分のターン開始時まで、自分のカードは破壊されず、リーダーとカードが受ける全てのダメージを0にする（加護付与）
    grantValkyriaGuard(state, owner, events);
  } else if (action === 'ragnarok') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    // 敵の場のすべてのカードに2ダメージを与える
    for (let i = 0; i < 3; i++) {
      if (eBoard[i]) {
        damageCard(
          state,
          oppOwner,
          i,
          RAGNAROK_CARD_DAMAGE_AMOUNT,
          'ragnarok',
          events,
          true
        );
      }
    }
    // 戦乙女の加護を自分に付与
    grantValkyriaGuard(state, owner, events);
  }

  processDestructionTriggers(state, events);
  return events;
}

/**
 * 戦闘フェーズの計算 (純粋関数)
 * @param {Object} state
 * @param {string} attackerSide 'blue' or 'red'
 * @param {Array} events - オプションのイベントログ配列
 * @returns {Array} 発生したイベントログ
 */
export function calculateCombatPhase(state, attackerSide, events = []) {
  for (let l = 0; l < 3; l++) {
    if (state.playerHP <= 0 || state.enemyHP <= 0) break;
    applySingleCombat(state, attackerSide, l, events);
  }

  processDestructionTriggers(state, events);
  return events;
}

/**
 * 指定した1レーンのみの戦闘計算（Quick等のシミュレーション用）
 * @returns {Array} events
 */
export function applySingleCombat(state, attackerSide, l, events = []) {
  const atkBoard =
    attackerSide === 'blue' ? state.playerBoard : state.enemyBoard;
  const defBoard =
    attackerSide === 'blue' ? state.enemyBoard : state.playerBoard;
  let defHP = attackerSide === 'blue' ? state.enemyHP : state.playerHP;
  const defSide = attackerSide === 'blue' ? 'red' : 'blue';

  const aC = atkBoard[l];
  if (
    !aC ||
    hasSkill(aC, 'defender') ||
    aC.stunTurns > 0 ||
    aC.cantAttackTurns > 0
  )
    return events;

  const aHasPhase = hasSkill(aC, 'phase');

  let dLane = l;
  // 守護側も位相が一致しないとかばうことができないが、防御を持っていればブロック可能
  const checkGuardian = (c) =>
    c &&
    hasSkill(c, 'guardian') &&
    (hasSkill(c, 'phase') === aHasPhase ||
      hasSkill(c, 'defender') ||
      c.stunTurns > 0);
  // 【重要】守護は隣のレーンに味方カードがいる場合のみ発動する（空きレーンはかばわない）
  let dg = null;
  if (defBoard[l]) {
    dg =
      l === 1
        ? checkGuardian(defBoard[0])
          ? 0
          : checkGuardian(defBoard[2])
            ? 2
            : null
        : l === 0
          ? checkGuardian(defBoard[1])
            ? 1
            : null
          : checkGuardian(defBoard[1])
            ? 1
            : null;
  }
  if (dg !== null && !hasSkill(defBoard[l], 'guardian')) {
    dLane = dg;
    events.push({
      type: 'skill_popup',
      side: defSide,
      lane: dg,
      skillName: '守護',
    });
  }

  // 身替の対応: ダメージを受ける自身が substitute を持つなら、隣の味方に肩代わりさせる
  // 【重要】身替も隣のレーンに味方カードがいる場合のみ発動する
  if (defBoard[dLane] && hasSkill(defBoard[dLane], 'substitute')) {
    const checkSubstituteTarget = (c) =>
      c &&
      (hasSkill(c, 'phase') === aHasPhase ||
        hasSkill(c, 'defender') ||
        c.stunTurns > 0);
    let sub =
      dLane === 1
        ? checkSubstituteTarget(defBoard[0])
          ? 0
          : checkSubstituteTarget(defBoard[2])
            ? 2
            : null
        : dLane === 0
          ? checkSubstituteTarget(defBoard[1])
            ? 1
            : null
          : checkSubstituteTarget(defBoard[1])
            ? 1
            : null;
    if (sub !== null) {
      dLane = sub;
      events.push({
        type: 'skill_popup',
        side: defSide,
        lane: dLane,
        skillName: '身替',
      });
    }
  }

  let aLane = l;
  if (atkBoard[l]) {
    // 【重要】攻撃側の守護も、隣のレーンに味方カードがいる場合のみ発動する
    let ag = null;
    if (atkBoard[l]) {
      ag =
        l === 1
          ? hasSkill(atkBoard[0], 'guardian')
            ? 0
            : hasSkill(atkBoard[2], 'guardian')
              ? 2
              : null
          : l === 0
            ? hasSkill(atkBoard[1], 'guardian')
              ? 1
              : null
            : hasSkill(atkBoard[1], 'guardian')
              ? 1
              : null;
    }
    if (ag !== null) {
      aLane = ag;
      events.push({
        type: 'skill_popup',
        side: attackerSide,
        lane: aLane,
        skillName: '守護',
      });
    }

    // 身替の対応: 反撃を受ける自身が substitute を持つなら、隣の味方に肩代わりさせる
    if (hasSkill(atkBoard[aLane], 'substitute')) {
      let sub =
        aLane === 1
          ? atkBoard[0]
            ? 0
            : atkBoard[2]
              ? 2
              : null
          : aLane === 0
            ? atkBoard[1]
              ? 1
              : null
            : atkBoard[1]
              ? 1
              : null;
      if (sub !== null) {
        aLane = sub;
        events.push({
          type: 'skill_popup',
          side: attackerSide,
          lane: aLane,
          skillName: '身替',
        });
      }
    }
  }

  let dC = defBoard[dLane];
  let isPhaseBypass = false;
  if (dC && hasSkill(dC, 'phase') !== aHasPhase) {
    if (!hasSkill(dC, 'defender') && !(dC.stunTurns > 0)) {
      dC = null; // 位相が合わないため完全すり抜け（直接攻撃扱い）
      isPhaseBypass = true;
    }
  }
  // 正面のカードを特定
  const frontCard = defBoard[l];
  // 位相が一致するか、または防御/拘束などの理由でブロック可能か
  const originalTarget =
    frontCard &&
    (hasSkill(frontCard, 'phase') === aHasPhase ||
      hasSkill(frontCard, 'defender') ||
      frontCard.stunTurns > 0)
      ? frontCard
      : null;
  let aP = Number(aC.currentPower ?? aC.power ?? 0) || 0;

  // 反撃ダメージを与えるカードは、守護や身代わりに関わらず「常に正面の相手」
  let dC_counter = originalTarget;
  // 防御（および拘束・待機、攻撃不能）状態でなく、位相が一致している場合のみ反撃が発生
  let dP =
    dC_counter &&
    !hasSkill(dC_counter, 'defender') &&
    !(dC_counter.stunTurns > 0) &&
    !(dC_counter.cantAttackTurns > 0)
      ? Number(dC_counter.currentPower ?? dC_counter.power ?? 0) || 0
      : 0;

  // 貫通計算用に、実際にダメージを受けるカードの元パワーを保持しておく（肩代わりが発生した場合は肩代わり先を参照）
  let originalTargetPower = dC
    ? Number(dC.currentPower ?? dC.power ?? 0) || 0
    : 0;

  // 反撃ダメージを受けるカード（攻撃者自身、またはその隣の守護）
  const aC_defend = atkBoard[aLane];

  events.push({ type: 'attack', attackerSide, lane: l, targetLane: dLane });

  if (hasSkill(aC, 'brutal')) {
    const brutalDmg = getSkillValue(aC, 'brutal') || 1;

    [l - 1, l + 1].forEach((tj) => {
      if (tj >= 0 && tj <= 2 && atkBoard[tj]) {
        damageCard(state, attackerSide, tj, brutalDmg, 'brutal', events, true);
      }
    });
  }

  if (hasSkill(aC, 'cleave')) {
    let targets = [l - 1, l, l + 1].filter((j) => j >= 0 && j <= 2);
    targets.sort((a, b) => a - b);

    let N = targets.length;
    let base = Math.floor(aP / N);
    let rem = aP % N;
    let hasDoubleStrike = hasSkill(aC, 'double_strike');
    if (hasDoubleStrike && aP > 0) {
      events.push({
        type: 'double_strike_proc',
        side: attackerSide,
        lane: aLane,
      });
    }

    // [1] 与ダメージ分配（肩代わり無効: 守護・身替・憑依のリダイレクトを無視し、各レーンに直接ダメージ）
    let totalActualDmgToDef = 0;
    const preDmgPowers = {}; // 貫通計算用: 各レーンのダメージ前パワーを記録
    for (let targetLane of targets) {
      let currentDmg = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;

      if (currentDmg <= 0) continue;

      let targetCard = defBoard[targetLane];
      let isTargetPhaseBypass = false;
      // 位相（phase）の判定: 位相が一致しないカードは「防御」または「気絶(stun)」を持っていない限りすり抜け（直接攻撃扱い）
      if (targetCard && hasSkill(targetCard, 'phase') !== aHasPhase) {
        if (!hasSkill(targetCard, 'defender') && !(targetCard.stunTurns > 0)) {
          targetCard = null;
          isTargetPhaseBypass = true;
        }
      }

      if (targetCard) {
        if (hasDoubleStrike) currentDmg *= 2;

        preDmgPowers[targetLane] =
          Number(targetCard.currentPower ?? targetCard.power ?? 0) || 0;
        let effectiveDmg = currentDmg;
        if (hasSkill(targetCard, 'sturdy')) {
          events.push({
            type: 'sturdy_block',
            side: defSide,
            lane: targetLane,
          });
          effectiveDmg = Math.floor(effectiveDmg / 2);
        }
        if (isCardInvincible(targetCard)) {
          events.push({
            type: 'invincible_block',
            side: defSide,
            lane: targetLane,
          });
          effectiveDmg = 0;
        }

        if (effectiveDmg > 0) {
          const blockType = getDamageBlockType(
            targetCard,
            effectiveDmg,
            false,
            state,
            defSide
          );
          if (!blockType) {
            if (hasSkill(targetCard, 'possession')) {
              events.push({
                type: 'skill_popup',
                side: defSide,
                lane: targetLane,
                skillName: '憑依',
              });
              if (isValkyriaGuardActive(state, defSide)) {
                events.push({
                  type: 'valkyria_guard_block',
                  side: defSide,
                  amount: effectiveDmg,
                  source: 'possession',
                });
              } else {
                defHP -= effectiveDmg;
                events.push({
                  type: 'damage_player',
                  side: defSide,
                  amount: effectiveDmg,
                  source: 'possession',
                  lane: targetLane,
                });
                // 憑依により相手リーダーに戦闘ダメージが肩代わりされたため、簒奪（extort）を発動
                applyExtort(aC, defSide, attackerSide, aLane, events, state);
                totalActualDmgToDef += effectiveDmg;
              }
            } else {
              targetCard.currentPower -= effectiveDmg;
              events.push({
                type: 'damage_card',
                side: defSide,
                lane: targetLane,
                amount: effectiveDmg,
                source: 'cleave',
              });
              totalActualDmgToDef += effectiveDmg;
            }
          } else if (blockType === 'valkyria_guard') {
            events.push({
              type: 'valkyria_guard_block',
              side: defSide,
              lane: targetLane,
              amount: effectiveDmg,
            });
            effectiveDmg = 0;
          } else {
            events.push({
              type: BLOCK_TYPE_EVENT_MAP[blockType] || `${blockType}_block`,
              side: defSide,
              lane: targetLane,
              source: 'cleave',
            });
            effectiveDmg = 0;
          }

          if (hasSkill(aC, 'deadly')) {
            if (canCardBeDestroyed(state, targetCard, defSide)) {
              targetCard.currentPower = 0;
              events.push({ type: 'deadly', side: defSide, lane: targetLane });
            } else {
              events.push({
                type: isValkyriaGuardActive(state, defSide)
                  ? 'valkyria_guard_block'
                  : 'immune_block',
                side: defSide,
                lane: targetLane,
                source: 'deadly',
              });
            }
          }
        }
      } else {
        // 空レーン: ダメージはリーダーへ
        if (isValkyriaGuardActive(state, defSide)) {
          events.push({
            type: 'valkyria_guard_block',
            side: defSide,
            amount: currentDmg,
            source: 'cleave',
          });
        } else {
          defHP -= currentDmg;
          if (isTargetPhaseBypass) {
            state.phaseBypassDamageTaken =
              (state.phaseBypassDamageTaken || 0) + currentDmg;
          }
          events.push({
            type: 'damage_player',
            side: defSide,
            amount: currentDmg,
            source: 'cleave',
            isPhaseBypass: isTargetPhaseBypass,
          });
          totalActualDmgToDef += currentDmg;
          // 簒奪: リーダーにダメージを与えた際に発動
          applyExtort(aC, defSide, attackerSide, aLane, events, state);
        }
      }
    }

    // [2] 反撃処理 (一掃でも正面からのみ受ける)
    let dmgToAtk = dP;
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'sturdy')) {
      events.push({ type: 'sturdy_block', side: attackerSide, lane: aLane });
      dmgToAtk = Math.floor(dmgToAtk / 2);
    }
    if (dmgToAtk > 0 && isCardInvincible(aC_defend)) {
      events.push({
        type: 'invincible_block',
        side: attackerSide,
        lane: aLane,
      });
      dmgToAtk = 0;
    }

    if (originalTarget && hasSkill(originalTarget, 'double_strike')) {
      if (dmgToAtk > 0)
        events.push({ type: 'double_strike_proc', side: defSide, lane: l });
      dmgToAtk *= 2;
    }
    const isOriginalTargetDefender =
      originalTarget &&
      (hasSkill(originalTarget, 'defender') || originalTarget.stunTurns > 0);
    if (isOriginalTargetDefender) dmgToAtk = 0;

    if (
      dmgToAtk > 0 &&
      pushDamageBlockEvent(
        state,
        aC_defend,
        dmgToAtk,
        false,
        attackerSide,
        aLane,
        null,
        events
      )
    ) {
      dmgToAtk = 0;
    }

    if (dmgToAtk > 0) {
      events.push({
        type: 'damage_card',
        side: attackerSide,
        lane: aLane,
        amount: dmgToAtk,
      });
      aC_defend.currentPower -= dmgToAtk;
      if (originalTarget && hasSkill(originalTarget, 'deadly')) {
        if (canCardBeDestroyed(state, aC_defend, attackerSide)) {
          aC_defend.currentPower = 0;
          events.push({ type: 'deadly', side: attackerSide, lane: aLane });
        } else {
          events.push({
            type: isValkyriaGuardActive(state, attackerSide)
              ? 'valkyria_guard_block'
              : 'immune_block',
            side: attackerSide,
            lane: aLane,
            source: 'deadly',
          });
        }
      }
    }

    // [3] 吸収 (リーダーダメージも含む実際の与ダメージに基づく)
    if (totalActualDmgToDef > 0 && hasSkill(aC, 'absorb')) {
      const healAmt = Math.floor(totalActualDmgToDef / 2);
      healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
    }

    if (dmgToAtk > 0 && originalTarget && hasSkill(originalTarget, 'absorb')) {
      const healAmt = Math.floor(dmgToAtk / 2);
      defHP = healDefenderLeaderHP(
        state,
        defHP,
        defSide,
        attackerSide === 'blue' ? state.enemyMaxHP : state.playerMaxHP,
        healAmt,
        'absorb',
        events,
        l
      );
    }

    // [4] 貫通: 通常攻撃と同様に「分配ダメージ - 防御者パワー」の差分をリーダーに与える
    //     各レーンでの余剰分を合算する（ダメージ前のパワーを基準にするため deadly でも正しく発動）
    if (hasSkill(aC, 'pierce')) {
      let totalPierceDmg = 0;
      // ダメージ分配を再計算（[1]と同じ配分ロジック）
      let pBase = Math.floor(aP / N);
      let pRem = aP % N;
      let hasDoubleStrike = hasSkill(aC, 'double_strike');
      for (let targetLane of targets) {
        let laneDmg = pBase + (pRem > 0 ? 1 : 0);
        if (pRem > 0) pRem--;
        if (hasDoubleStrike) laneDmg *= 2;

        // カードが存在するレーンのみ（空レーンは既にリーダーダメージ処理済み）
        if (preDmgPowers[targetLane] !== undefined) {
          const pierceDmg = Math.max(0, laneDmg - preDmgPowers[targetLane]);
          totalPierceDmg += pierceDmg;
        }
      }
      if (totalPierceDmg > 0) {
        if (isValkyriaGuardActive(state, defSide)) {
          events.push({
            type: 'valkyria_guard_block',
            side: defSide,
            amount: totalPierceDmg,
            source: 'pierce',
          });
        } else {
          defHP -= totalPierceDmg;
          events.push({
            type: 'damage_player',
            side: defSide,
            amount: totalPierceDmg,
            source: 'pierce',
          });
          applyExtort(aC, defSide, attackerSide, aLane, events, state);
          if (hasSkill(aC, 'absorb')) {
            const healAmt = Math.floor(totalPierceDmg / 2);
            healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
          }
        }
      }
    }

    // [5] 魂縛: 一掃で破壊した敵カードの数だけ発動（攻撃者自身が生存している場合のみ）
    if (aC.currentPower > 0) {
      let destroyedCount = 0;
      for (let targetLane of targets) {
        const targetCard = defBoard[targetLane];
        if (targetCard && targetCard.currentPower <= 0) destroyedCount++;
      }
      if (destroyedCount > 0) {
        if (hasSkill(aC, 'soul_bind')) {
          const val = getSkillValue(aC, 'soul_bind') || 2;
          const totalGain = val * destroyedCount;
          aC.currentPower += totalGain;
          events.push({
            type: 'power_change',
            side: attackerSide,
            lane: l,
            amount: totalGain,
            source: 'soul_bind',
          });
        }
      }
    }
    // 防御側の魂縛: 反撃で攻撃者（またはその守護）を倒した場合に発動
    if (
      originalTarget &&
      originalTarget.currentPower > 0 &&
      aC_defend.currentPower <= 0
    ) {
      if (hasSkill(originalTarget, 'soul_bind')) {
        const val = getSkillValue(originalTarget, 'soul_bind') || 2;
        originalTarget.currentPower += val;
        events.push({
          type: 'power_change',
          side: defSide,
          lane: l,
          amount: val,
          source: 'soul_bind',
        });
      }
    }
  } else if (dC) {
    let dmgToDef = aP;
    let dmgToAtk = dP;

    // 連撃（ダブルストライク）: 頑丈の半減より先に2倍を適用（3*2/2=3で±0になる）
    if (hasSkill(aC, 'double_strike')) {
      if (dmgToDef > 0)
        events.push({
          type: 'double_strike_proc',
          side: attackerSide,
          lane: l,
        });
      dmgToDef *= 2;
    }
    if (originalTarget && hasSkill(originalTarget, 'double_strike')) {
      if (dmgToAtk > 0)
        events.push({ type: 'double_strike_proc', side: defSide, lane: l });
      dmgToAtk *= 2;
    }

    if (dmgToDef > 0 && hasSkill(dC, 'sturdy')) {
      if (dmgToDef > 0)
        events.push({ type: 'sturdy_block', side: defSide, lane: dLane });
      dmgToDef = Math.floor(dmgToDef / 2);
    }
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'sturdy')) {
      if (dmgToAtk > 0)
        events.push({ type: 'sturdy_block', side: attackerSide, lane: aLane });
      dmgToAtk = Math.floor(dmgToAtk / 2);
    }
    if (dmgToDef > 0) {
      const blockType = getDamageBlockType(dC, dmgToDef, false, state, defSide);
      if (blockType === 'valkyria_guard') {
        events.push({
          type: 'valkyria_guard_block',
          side: defSide,
          lane: dLane,
          amount: dmgToDef,
        });
        dmgToDef = 0;
      } else if (blockType) {
        events.push({
          type: BLOCK_TYPE_EVENT_MAP[blockType] || `${blockType}_block`,
          side: defSide,
          lane: dLane,
        });
        dmgToDef = 0;
      }
    }
    if (dmgToDef > 0 && isCardInvincible(dC)) {
      if (dmgToDef > 0)
        events.push({ type: 'invincible_block', side: defSide, lane: dLane });
      dmgToDef = 0;
    }
    if (dmgToDef > 0 && hasSkill(dC, 'reflect')) {
      // 「反射」スキル：場にいるすべてのカード（null以外）を収集して、ランダムな1枚にダメージを肩代わりさせる
      const candidates = [];
      for (let i = 0; i < 3; i++) {
        if (state.playerBoard[i]) {
          candidates.push({
            card: state.playerBoard[i],
            side: 'blue',
            lane: i,
          });
        }
        if (state.enemyBoard[i]) {
          candidates.push({ card: state.enemyBoard[i], side: 'red', lane: i });
        }
      }

      // ランダムに1枚決定
      if (candidates.length > 0) {
        const randIdx = Math.floor(getSeededRandom() * candidates.length);
        const chosenObj = candidates[randIdx];

        // 自身以外が選ばれた場合は、そのカードにダメージを肩代わりさせる
        if (chosenObj.card !== dC) {
          events.push({ type: 'reflect_block', side: defSide, lane: dLane });
          const chosenCard = chosenObj.card;
          const chosenSide = chosenObj.side;
          const chosenLane = chosenObj.lane;

          let effectiveDmg = dmgToDef;
          if (isCardInvincible(chosenCard)) {
            events.push({
              type: 'invincible_block',
              side: chosenSide,
              lane: chosenLane,
            });
            effectiveDmg = 0;
          }

          if (effectiveDmg > 0) {
            let damageApplied = false;
            if (
              canTakeDamage(chosenCard, effectiveDmg, false, state, chosenSide)
            ) {
              chosenCard.currentPower -= effectiveDmg;
              damageApplied = true;
              events.push({
                type: 'damage_card',
                side: chosenSide,
                lane: chosenLane,
                amount: effectiveDmg,
                source: 'reflect',
              });
            } else {
              events.push({
                type: 'immune_block',
                side: chosenSide,
                lane: chosenLane,
                source: 'reflect',
              });
            }

            // 攻撃側のカードが「即死（deadly）」を持っている場合の即死判定
            if (damageApplied && hasSkill(aC, 'deadly')) {
              if (!hasSkill(chosenCard, 'immune')) {
                chosenCard.currentPower = 0;
                events.push({
                  type: 'deadly',
                  side: chosenSide,
                  lane: chosenLane,
                });
              } else {
                events.push({
                  type: 'immune_block',
                  side: chosenSide,
                  lane: chosenLane,
                  source: 'deadly',
                });
              }
            }
          }
          dmgToDef = 0; // 肩代わりさせたので自身のダメージは0
        }
        // 自身が選ばれた場合は、肩代わり（反射処理）をスキップし、その後の通常フローに任せて自身がダメージを受ける
      } else {
        // 場にカードが存在しない場合は肩代わり不可、通常通りダメージを受ける
      }
    }
    if (
      dmgToAtk > 0 &&
      pushDamageBlockEvent(
        state,
        aC_defend,
        dmgToAtk,
        false,
        attackerSide,
        aLane,
        null,
        events
      )
    ) {
      dmgToAtk = 0;
    }
    if (dmgToAtk > 0 && isCardInvincible(aC_defend)) {
      if (dmgToAtk > 0)
        events.push({
          type: 'invincible_block',
          side: attackerSide,
          lane: aLane,
        });
      dmgToAtk = 0;
    }
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'reflect')) {
      // 「反射」スキル：場にいるすべてのカード（null以外）を収集して、ランダムな1枚にダメージを肩代わりさせる
      const candidates = [];
      for (let i = 0; i < 3; i++) {
        if (state.playerBoard[i]) {
          candidates.push({
            card: state.playerBoard[i],
            side: 'blue',
            lane: i,
          });
        }
        if (state.enemyBoard[i]) {
          candidates.push({ card: state.enemyBoard[i], side: 'red', lane: i });
        }
      }

      // ランダムに1枚決定
      if (candidates.length > 0) {
        const randIdx = Math.floor(getSeededRandom() * candidates.length);
        const chosenObj = candidates[randIdx];

        // 自身以外が選ばれた場合は、そのカードにダメージを肩代わりさせる
        if (chosenObj.card !== aC_defend) {
          events.push({
            type: 'reflect_block',
            side: attackerSide,
            lane: aLane,
          });
          const chosenCard = chosenObj.card;
          const chosenSide = chosenObj.side;
          const chosenLane = chosenObj.lane;

          let effectiveDmg = dmgToAtk;
          if (isCardInvincible(chosenCard)) {
            events.push({
              type: 'invincible_block',
              side: chosenSide,
              lane: chosenLane,
            });
            effectiveDmg = 0;
          }

          if (effectiveDmg > 0) {
            let damageApplied = false;
            if (
              canTakeDamage(chosenCard, effectiveDmg, false, state, chosenSide)
            ) {
              chosenCard.currentPower -= effectiveDmg;
              damageApplied = true;
              events.push({
                type: 'damage_card',
                side: chosenSide,
                lane: chosenLane,
                amount: effectiveDmg,
                source: 'reflect',
              });
            } else {
              events.push({
                type: 'immune_block',
                side: chosenSide,
                lane: chosenLane,
                source: 'reflect',
              });
            }

            // 防御側（反撃元）のカードが「即死（deadly）」を持っている場合の即死判定
            if (
              damageApplied &&
              originalTarget &&
              hasSkill(originalTarget, 'deadly')
            ) {
              if (!hasSkill(chosenCard, 'immune')) {
                chosenCard.currentPower = 0;
                events.push({
                  type: 'deadly',
                  side: chosenSide,
                  lane: chosenLane,
                });
              } else {
                events.push({
                  type: 'immune_block',
                  side: chosenSide,
                  lane: chosenLane,
                  source: 'deadly',
                });
              }
            }
          }
          dmgToAtk = 0; // 肩代わりさせたので自身のダメージは0
        }
        // 自身が選ばれた場合は、肩代わり（反射処理）をスキップし、その後の通常フローに任せて自身がダメージを受ける
      } else {
        // 場にカードが存在しない場合は肩代わり不可、通常通りダメージを受ける
      }
    }

    // 連撃（ダブルストライク）: sturdy判定前に移動済み（ここでは処理しない）

    const isOriginalTargetDefender =
      originalTarget &&
      (hasSkill(originalTarget, 'defender') || originalTarget.stunTurns > 0);
    if (isOriginalTargetDefender) dmgToAtk = 0; // 防御（および待機・拘束）は反撃ダメージを与えない

    if (dmgToDef > 0 && hasSkill(dC, 'possession')) {
      if (dmgToDef > 0) {
        events.push({
          type: 'skill_popup',
          side: defSide,
          lane: dLane,
          skillName: '憑依',
        });
        if (isValkyriaGuardActive(state, defSide)) {
          events.push({
            type: 'valkyria_guard_block',
            side: defSide,
            amount: dmgToDef,
            source: 'possession',
          });
        } else {
          defHP -= dmgToDef;
          events.push({
            type: 'damage_player',
            side: defSide,
            amount: dmgToDef,
            source: 'possession',
            lane: dLane,
          });
          // 憑依により相手リーダーに戦闘ダメージが肩代わりされたため、簒奪（extort）を発動
          applyExtort(aC, defSide, attackerSide, aLane, events, state);
          if (hasSkill(aC, 'absorb')) {
            const healAmt = Math.floor(dmgToDef / 2);
            healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
          }
        }
        dmgToDef = 0;
      }
    }
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'possession')) {
      if (dmgToAtk > 0) {
        events.push({
          type: 'skill_popup',
          side: attackerSide,
          lane: aLane,
          skillName: '憑依',
        });
        damageLeader(
          state,
          attackerSide,
          dmgToAtk,
          'possession',
          events,
          aLane
        );
        // 加護でダメージが無効化された場合、簒奪・吸収は発動しない（最優先ルール）
        if (!isValkyriaGuardActive(state, attackerSide)) {
          // 反撃の戦闘ダメージが憑依により肩代わりされたため、反撃側の簒奪・吸収を発動
          if (originalTarget && hasSkill(originalTarget, 'extort')) {
            applyExtort(
              originalTarget,
              attackerSide,
              defSide,
              l,
              events,
              state
            );
          }
          if (originalTarget && hasSkill(originalTarget, 'absorb')) {
            const healAmt = Math.floor(dmgToAtk / 2);
            defHP = healDefenderLeaderHP(
              state,
              defHP,
              defSide,
              attackerSide === 'blue' ? state.enemyMaxHP : state.playerMaxHP,
              healAmt,
              'absorb',
              events,
              dLane
            );
          }
        }
        dmgToAtk = 0;
      }
    }

    if (dmgToDef > 0) {
      events.push({
        type: 'damage_card',
        side: defSide,
        lane: dLane,
        amount: dmgToDef,
      });
      dC.currentPower -= dmgToDef;
      dC.hasTakenDamage = true;

      if (hasSkill(aC, 'deadly')) {
        if (!hasSkill(dC, 'immune')) {
          dC.currentPower = 0;
          events.push({ type: 'deadly', side: defSide, lane: dLane });
        } else {
          events.push({
            type: 'immune_block',
            side: defSide,
            lane: dLane,
            source: 'deadly',
          });
        }
      }
    }

    if (dmgToAtk > 0) {
      events.push({
        type: 'damage_card',
        side: attackerSide,
        lane: aLane,
        amount: dmgToAtk,
      });
      aC_defend.currentPower -= dmgToAtk;
      aC_defend.hasTakenDamage = true;
      if (originalTarget && hasSkill(originalTarget, 'deadly')) {
        if (!hasSkill(aC_defend, 'immune')) {
          aC_defend.currentPower = 0;
          events.push({ type: 'deadly', side: attackerSide, lane: aLane });
        } else {
          events.push({
            type: 'immune_block',
            side: attackerSide,
            lane: aLane,
            source: 'deadly',
          });
        }
      }
    }

    if (dmgToDef > 0 && hasSkill(aC, 'absorb')) {
      const healAmt = Math.floor(dmgToDef / 2);
      healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
    }
    if (dmgToAtk > 0 && originalTarget && hasSkill(originalTarget, 'absorb')) {
      const healAmt = Math.floor(dmgToAtk / 2);
      defHP = healDefenderLeaderHP(
        state,
        defHP,
        defSide,
        attackerSide === 'blue' ? state.enemyMaxHP : state.playerMaxHP,
        healAmt,
        'absorb',
        events,
        dLane
      );
    }

    if (hasSkill(aC, 'pierce')) {
      let effectiveAP = hasSkill(aC, 'double_strike') ? aP * 2 : aP;
      let pDmg = Math.max(0, effectiveAP - originalTargetPower);
      if (pDmg > 0) {
        if (isValkyriaGuardActive(state, defSide)) {
          events.push({
            type: 'valkyria_guard_block',
            side: defSide,
            amount: pDmg,
            source: 'pierce',
          });
        } else {
          defHP -= pDmg;
          events.push({
            type: 'damage_player',
            side: defSide,
            amount: pDmg,
            source: 'pierce',
          });
          applyExtort(aC, defSide, attackerSide, aLane, events, state);

          if (hasSkill(aC, 'absorb')) {
            const healAmt = Math.floor(pDmg / 2);
            healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
          }
        }
      }
    }

    // 魂縛
    let aD = aC_defend.currentPower <= 0,
      dD = dC.currentPower <= 0;
    if (dD && aC.currentPower > 0) {
      if (hasSkill(aC, 'soul_bind')) {
        const val = getSkillValue(aC, 'soul_bind') || 2;
        aC.currentPower += val;
        events.push({
          type: 'power_change',
          side: attackerSide,
          lane: l,
          amount: val,
          source: 'soul_bind',
        });
      }
    }
    const counterSoulBindCard =
      originalTarget && originalTarget.currentPower > 0 ? originalTarget : null;
    if (aD && counterSoulBindCard) {
      if (hasSkill(counterSoulBindCard, 'soul_bind')) {
        const val = getSkillValue(counterSoulBindCard, 'soul_bind') || 2;
        counterSoulBindCard.currentPower += val;
        events.push({
          type: 'power_change',
          side: defSide,
          lane: l,
          amount: val,
          source: 'soul_bind',
        });
      }
    }
  } else {
    let finalDmg = aP;
    if (isValkyriaGuardActive(state, defSide)) {
      events.push({
        type: 'valkyria_guard_block',
        side: defSide,
        amount: finalDmg,
        source: 'direct_attack',
      });
      finalDmg = 0;
    } else {
      defHP -= finalDmg;
      if (isPhaseBypass) {
        state.phaseBypassDamageTaken =
          (state.phaseBypassDamageTaken || 0) + finalDmg;
      }
      events.push({
        type: 'damage_player',
        side: defSide,
        amount: finalDmg,
        source: 'direct_attack',
        isPhaseBypass,
      });
      applyExtort(aC, defSide, attackerSide, aLane, events, state);
    }

    if (finalDmg > 0 && hasSkill(aC, 'absorb')) {
      const healAmt = Math.floor(finalDmg / 2);
      healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
    }
  }

  if (attackerSide === 'blue') state.enemyHP = defHP;
  else state.playerHP = defHP;

  processDestructionTriggers(state, events);
  return events;
}

/**
 * ターン開始パッシブの適用
 * @returns {Array} events
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
  for (let i = 0; i < 3; i++) {
    const c = b[i];
    if (!c) continue;

    // 神出 (teleport): 空きレーンが1つの時に確定移動をシミュレート
    if (
      hasSkill(c, 'teleport') &&
      (c.stunTurns || 0) === 0 &&
      !teleportMovedIds.has(c.uid || c.id)
    ) {
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
        b[i] = null;
        teleportMovedIds.add(c.uid || c.id);
        events.push({
          type: 'teleport_simulation',
          side,
          from: i,
          to: targetLane,
          source: 'teleport',
        });
      }
    }

    // スキルおよび状態の時系列スロット順（付与順）に順次解決
    const cardSkills = Array.isArray(c.skills) ? [...c.skills] : [];

    for (const sk of cardSkills) {
      if (!sk) continue;
      const skId = typeof sk === 'string' ? sk : sk.id;
      const skVal =
        typeof sk === 'object' && sk.value !== undefined ? sk.value : null;

      if (skId === 'growth') {
        const v = skVal ?? 1;
        c.currentPower += v;
        events.push({
          type: 'power_change',
          side,
          lane: i,
          amount: v,
          source: 'growth',
        });
      } else if (skId === 'corrosion') {
        // 【腐食状態（debuff）のターン開始時処理】
        const pVal = skVal || c.corrosion || 1;
        c.currentPower -= pVal;
        events.push({
          type: 'power_change',
          side,
          lane: i,
          amount: -pVal,
          source: 'corrosion',
        });
      } else if (skId === 'intercept') {
        // 迎撃: ターン開始時に相手の最大パワーカードにダメージ
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
            lane: i,
            skillName: '迎撃',
          });
          const blockType = getDamageBlockType(
            eB[maxL],
            dmg,
            true,
            state,
            oppSide
          );
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
      } else if (skId === 'contract' && !skipContract) {
        let v = skVal || 3;
        damageLeader(state, side, v, 'contract', events);
      } else if (skId === 'samsara') {
        // 輪廻: ターン開始時、お互いの手札を全て捨てる。その後、お互いにカードを3枚引く。
        const myHand = side === 'blue' ? state.playerHand : state.enemyHand;
        const opHand = side === 'blue' ? state.enemyHand : state.playerHand;
        const myDiscard =
          side === 'blue' ? state.playerDiscard : state.enemyDiscard;
        const opDiscard =
          side === 'blue' ? state.enemyDiscard : state.playerDiscard;

        // 1. お互いの手札を全て捨てる（トークンは除外）
        if (myHand) {
          while (myHand.length > 0) {
            const card = myHand.pop();
            if (card && !card.isToken && myDiscard) {
              myDiscard.push(card);
            }
          }
        }
        if (opHand) {
          while (opHand.length > 0) {
            const card = opHand.pop();
            if (card && !card.isToken && opDiscard) {
              opDiscard.push(card);
            }
          }
        }

        // 2. お互いに3枚引く
        /**
         * 【輪廻】指定陣営にカードを1枚ドローさせるシミュレーションヘルパー。
         * 輪廻スキルの「お互いにカードを3枚引く」処理において各陣営ごとに3回呼び出され、合計3枚ドローを実現する。
         * 手札上限（MAX_HAND_SIZE_DURING_TURN）に達している場合はドローをスキップする。
         * デッキが空の場合は墓地をデッキへ戻してシャッフルし、当該陣営のHPを半減する。
         *
         * @param {'blue'|'red'} p - ドローする陣営
         * @returns {void}
         */
        const drawSim = (p) => {
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
        };

        for (let k = 0; k < 3; k++) {
          drawSim('blue');
        }
        for (let k = 0; k < 3; k++) {
          drawSim('red');
        }

        events.push({
          type: 'samsara_trigger',
          side,
          lane: i,
          source: 'samsara',
        });
      } else if (skId === 'awake' || skId === 'awake_legendary') {
        if (isLaneSealed(state, side, i)) {
          // 封印されたレーンでは覚醒は不発（保留）となり、元のカードのまま場に留まる
          continue;
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
          lane: i,
          card: c,
          summonId,
          value: v,
        });
        applyActiveSkillLogic(
          state,
          side,
          i,
          currentAwakeSkillId,
          v,
          events,
          [],
          i
        );
        // カードが新トークンに置換されたため、後続のスキル・状態処理を中断
        break;
      }
    }
  }
  processDestructionTriggers(state, events);

  // 戦乙女の加護: ターン開始時スキル（「契約」等の自傷ダメージ）の解決完了後に自身の加護効果を終了（クリア）
  // ※実戦進行側 (battle.js startTurn) と同一の順序・仕様で揃えています
  clearValkyriaGuard(state, side);

  return events;
}

/**
 * 簒奪スキルの適用 (指定した相手プレイヤーの手札をランダムに虚空に変換)
 */
function applyExtort(aC, oppSide, attackerSide, aLane, events, state) {
  if (!hasSkill(aC, 'extort')) return;

  const val = getSkillValue(aC, 'extort') || 1;
  const oppHand = oppSide === 'blue' ? state.playerHand : state.enemyHand;
  const oppDiscard =
    oppSide === 'blue' ? state.playerDiscard : state.enemyDiscard;

  if (oppHand && oppHand.length > 0) {
    let activated = false;
    const newTokens = [];

    // 【システム解説】
    // 簒奪（extort）スキルは相手の手札から「最大パワー」のカードを優先的に選択して処理します。
    // 手札内の有効なカードをインデックス情報付きで抽出し、
    // パワーの降順（同値の場合は左側＝手札のインデックスが小さい方を優先）でソートします。
    const validTargets = oppHand
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
      // ソート順のカードを手札配列から直接オブジェクト参照で検索して削除（インデックスずれを防止）
      const removeIdx = oppHand.findIndex((c) => c === targetInfo.card);
      if (removeIdx === -1) continue;

      if (!activated) {
        events.push({
          type: 'skill_popup',
          side: attackerSide,
          lane: aLane,
          skillName: '簒奪',
        });
        activated = true;
      }

      const discarded = oppHand.splice(removeIdx, 1)[0];

      if (!discarded) {
        i--;
        continue;
      }

      if (!discarded.isToken) {
        const masterData = CARD_MASTER.find(
          (m) => m.id === (discarded.baseId || discarded.id)
        );
        if (masterData) {
          const restoredCard = JSON.parse(JSON.stringify(masterData));
          restoredCard.uid = discarded.uid;
          restoredCard.owner = oppSide;
          restoredCard.baseId = discarded.baseId || discarded.id;
          if (discarded.isPremium !== undefined)
            restoredCard.isPremium = discarded.isPremium;
          restoredCard.basePower = restoredCard.power;
          restoredCard.currentPower = restoredCard.power;
          oppDiscard.push(restoredCard);
        } else {
          oppDiscard.push({
            ...discarded,
            currentPower: discarded.basePower || discarded.power,
            skills: [],
          });
        }
      }

      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      const voidToken = {
        ...voidTpl,
        id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_extort${i}`,
        uid: `${oppSide}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidext${i}`,
        baseId: 'token_void',
        filter: voidTpl.filter,
        power: voidTpl.power,
        currentPower: voidTpl.power,
        basePower: voidTpl.power,
        voiceCategory: voidTpl.voiceCategory || 'undead',
        isToken: true,
        isMorphToken: true,
      };
      newTokens.push(voidToken);

      events.push({
        type: 'discard',
        side: oppSide,
        card: JSON.parse(JSON.stringify(discarded)),
        source: 'extort',
      });
      events.push({
        type: 'add_hand',
        side: oppSide,
        card: JSON.parse(JSON.stringify(voidToken)),
        source: 'extort',
      });
    }
    newTokens.forEach((t) => oppHand.push(t));
  }
}

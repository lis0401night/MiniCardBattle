// ==========================================
// バトルアクションキュー処理モジュール
// イベント駆動型タスクキューエンジンの中核を担う。
// プレイヤーやAIのアクション（カードプレイ、ターン終了、リーダースキル等）を
// キューイングし、順番に処理する。
// ==========================================

import {
  getIsHost,
  sendOnlineAction,
  saveLastSyncStateToRoom,
} from '../../services/multiplayer.js';
import {
  renderBoard,
  renderHand,
  updateBattleUIHook,
  updateHPBar,
  updateSPOrbs,
} from '../../services/uiBattle.js';
import { GameState } from '../../state/gameState.js';
import {
  AI_THINKING_DURATION,
  PLACE_ANIMATION_DURATION,
} from '../../utils/constants/config.js';
import { checkIsOnlineMode, playSound, sleep } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import { executeEnemyAI } from '../ai.js';
import { activateLeaderSkill } from '../leaderSkills.js';
import { cleanupTutorial } from '../tutorialEngine.js';
import { showAlertModal } from '../../services/uiModals.js';
import { stopOnlineTimer, pauseOnlineTimer } from './onlineTimer.js';
import { checkIsOnlineTimerEnabled } from '../../utils/constants/onlineTimer.js';

// ==========================================
// 循環参照回避のための関数注入レジストリ
// battle.js ファサードから注入される
// ==========================================

/** @type {Function|null} playCard関数への参照 */
let _playCard = null;
/** @type {Function|null} endTurnLogic関数への参照 */
let _endTurnLogic = null;
/** @type {Function|null} checkWinCondition関数への参照 */
let _checkWinCondition = null;
/** @type {Function|null} executeTutorialEnemyTurn関数への参照 */
let _executeTutorialEnemyTurn = null;

/**
 * 循環参照を回避するため、依存関数を外部から注入する。
 * battle.js ファサードの初期化時に呼び出される。
 * @param {object} deps - 依存関数群
 * @param {Function} deps.playCard - カードプレイ関数
 * @param {Function} deps.endTurnLogic - ターン終了ロジック関数
 * @param {Function} deps.checkWinCondition - 勝敗判定関数
 * @param {Function} deps.executeTutorialEnemyTurn - チュートリアル敵ターン実行関数
 */
export function registerQueueDependencies(deps) {
  if (deps.playCard) _playCard = deps.playCard;
  if (deps.endTurnLogic) _endTurnLogic = deps.endTurnLogic;
  if (deps.checkWinCondition) _checkWinCondition = deps.checkWinCondition;
  if (deps.executeTutorialEnemyTurn)
    _executeTutorialEnemyTurn = deps.executeTutorialEnemyTurn;
}

/**
 * 依存関数が注入済みかを検証し取得する。未注入の場合は特定可能なエラーを投げる。
 * @param {Function|null} fn - 検証対象の関数
 * @param {string} name - 依存関数名（エラーメッセージ用）
 * @returns {Function} 注入済みの関数
 */
function requireDependency(fn, name) {
  if (typeof fn !== 'function') {
    throw new Error(
      `[battleQueue] 依存関数 "${name}" が未注入です。battle/index.js の registerQueueDependencies が実行される前に呼び出されました。`
    );
  }
  return fn;
}

// ==========================================
// モジュールスコープ変数
// ==========================================

/** オンライン対戦時の選択結果を受け取るためのPromise resolver */
export let pendingChoiceResolver = null;

/**
 * pendingChoiceResolverを外部から設定するためのセッター。
 * @param {Function|null} resolver - 新しいresolver
 */
export function setPendingChoiceResolver(resolver) {
  pendingChoiceResolver = resolver;
}

/** オンライン対戦時の非同期競合を防ぐためのキューエンジン処理中フラグ */
let isQueueProcessing = false;

/** 直近で処理した最新のアクションキー（Firebase Push ID）。復帰時の差分アクション再生に使用する */
let lastProcessedActionKey = null;

/**
 * キューエンジンが処理中かどうかを返す。
 * @returns {boolean} 処理中ならtrue
 */
export function getIsQueueProcessing() {
  return isQueueProcessing;
}

/**
 * 直近で処理した最新のアクションキーを取得する。
 * @returns {string|null} 最新のアクションキー
 */
export function getLastProcessedActionKey() {
  return lastProcessedActionKey;
}

/**
 * 直近で処理した最新のアクションキーを設定する。
 * @param {string|null} key - アクションキー
 * @returns {void}
 */
export function setLastProcessedActionKey(key) {
  lastProcessedActionKey = key;
}

/**
 * キュー処理中フラグおよび処理済みアクションキーをリセットする。バトル初期化時に呼び出される。
 * @returns {void}
 */
export function resetQueueProcessing() {
  isQueueProcessing = false;
  lastProcessedActionKey = null;
}

// ==========================================
// イベント駆動型タスクキューエンジン (State Machine Core)
// ==========================================

/**
 * バトルアクションをディスパッチする。
 * オンライン対戦時はFirebaseへ送信し、ローカル時はキューに追加して処理する。
 * @param {object} action - アクションオブジェクト { type, owner, ... }
 * @param {boolean} [isRemote=false] - リモートから受信したアクションかどうか
 */
export async function dispatchBattleAction(action, isRemote = false) {
  if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
    if (action.type === 'endTurn') {
      // ターン終了時はターンタイマーを完全停止（退避スタックもクリア）
      stopOnlineTimer(true);
    } else if (action.type === 'playCard' || action.type === 'leaderSkill') {
      // カードプレイやリーダースキル発動時は、配置アニメーション中の時間減算を一時停止。
      // 後続のオンプレイスキルや誘発・命令・選別等の選択が発生した場合、この残余時間から再開される。
      pauseOnlineTimer();
    }
  }

  if (checkIsOnlineMode(GameState.gameMode) && !isRemote) {
    // ローカルのアクションは直接キューに入れず、Firebaseのルームへ送信
    try {
      await sendOnlineAction(action);
    } catch (err) {
      console.error('オンラインアクションの送信に失敗しました:', err);
      showAlertModal('通信に失敗しました。もう一度操作してください。');
    }
    return;
  }

  if (action.type === 'submitChoice') {
    // 自分が送信した選択結果の反響(echo)は完全に無視する（自分のローカルはUIのPromiseで既に勝手に解決されているため）
    if (action.owner === 'blue') return;

    // Firebase仕様で空配列[]が送信されないため、undefinedで来た場合は空文字列とみなす
    const choiceData = action.choiceData !== undefined ? action.choiceData : '';

    if (pendingChoiceResolver) {
      const resolver = pendingChoiceResolver;
      setPendingChoiceResolver(null);
      resolver(choiceData);
    } else {
      if (!GameState.pendingChoices) GameState.pendingChoices = [];
      GameState.pendingChoices.push(choiceData);
    }
    return; // Do not process via queue, evaluate synchronously
  }

  if (action.type === 'retire') {
    // チュートリアルモードの場合、待機中の全Promiseを解決してからリタイア処理
    if (GameState.gameMode === 'tutorial') {
      cleanupTutorial();
    }
    if (action.owner === 'blue') {
      GameState.playerConfig.hp = 0;
      GameState.playerHP = 0;
    } else {
      GameState.enemyConfig.hp = 0;
      GameState.enemyHP = 0;
    }
    playSound(SOUNDS.seDamage);
    if (updateBattleUIHook) updateBattleUIHook();
    requireDependency(_checkWinCondition, 'checkWinCondition')();
    return;
  }

  GameState.actionQueue.push(action);
  if (!isQueueProcessing) {
    await processActionQueue();
  }
}

/**
 * アクションキューを順番に処理するループ。
 * カードプレイ、ターン終了、リーダースキル発動、AI行動、状態同期などを処理する。
 */
export async function processActionQueue() {
  if (isQueueProcessing) return;
  isQueueProcessing = true;
  GameState.isProcessing = true;

  try {
    while (GameState.actionQueue.length > 0) {
      const action = GameState.actionQueue.shift();

      // 受信したアクションにFirebaseキーが付与されていれば最新処理キーとして記録
      if (action._actionKey) {
        lastProcessedActionKey = action._actionKey;
      }

      if (action.type === 'playCard') {
        const played = await requireDependency(_playCard, 'playCard')(
          action.owner,
          action.handIndex,
          action.lane
        );
        if (played) {
          if (requireDependency(_checkWinCondition, 'checkWinCondition')())
            break;
          GameState.selectedCardIndex = null;
          if (window.updateCardDetail) window.updateCardDetail(null);
          await sleep(PLACE_ANIMATION_DURATION);
          await requireDependency(_endTurnLogic, 'endTurnLogic')(action.owner);
        }
        // 【CodeRabbit指摘反映】無効プレイ時（playedがfalse）でも、オンライン対戦での状態ズレを防ぐため、
        // ループ後段の updateBattleUIHook() や syncState 送信をスキップせずに通す
      } else if (action.type === 'endTurn') {
        await requireDependency(_endTurnLogic, 'endTurnLogic')(action.owner);
      } else if (action.type === 'leaderSkill') {
        await activateLeaderSkill(action.owner);
      } else if (action.type === 'enemyTurn') {
        if (GameState.gameMode === 'tutorial') {
          // チュートリアルモード: スクリプト行動を実行
          await sleep(AI_THINKING_DURATION);
          await requireDependency(
            _executeTutorialEnemyTurn,
            'executeTutorialEnemyTurn'
          )();
        } else if (!checkIsOnlineMode(GameState.gameMode)) {
          await sleep(AI_THINKING_DURATION);
          await executeEnemyAI();
        }
      } else if (action.type === 'syncState') {
        applySyncState(action.state);
      }

      if (updateBattleUIHook) updateBattleUIHook(); // React側に再描画を通知

      // ホスト側：syncState以外のアクション処理が終わるごとに現在の正しいステートを送信する
      if (
        checkIsOnlineMode(GameState.gameMode) &&
        getIsHost() &&
        action.type !== 'syncState' &&
        action.type !== 'enemyTurn' &&
        action.type !== 'submitChoice'
      ) {
        // 同期送信の単発失敗でローカルバトル処理を中断させないよう内部保護
        try {
          const syncState = generateSyncState();
          await sendOnlineAction({
            type: 'syncState',
            state: syncState,
          });
          // クラッシュ・アプリ落ち復帰用にDBのルーム直下にも最新盤面スナップショットを保存
          // ターン遷移や盤面更新を伴う主要アクション完了時に非同期で保存
          if (
            action.type === 'endTurn' ||
            action.type === 'playCard' ||
            action.type === 'leaderSkill'
          ) {
            saveLastSyncStateToRoom(syncState, lastProcessedActionKey).catch(
              (e) => console.warn('lastSyncState save failed:', e)
            );
          }
        } catch (syncErr) {
          console.error('状態同期の送信に失敗しました:', syncErr);
        }
      }
    }
  } catch (e) {
    console.error('バトルアクションの処理中にエラーが発生しました:', e);
    GameState.actionQueue = [];
    showAlertModal('バトル処理中にエラーが発生しました。処理を中断します。');
  } finally {
    isQueueProcessing = false;
    GameState.isProcessing = false;
    if (updateBattleUIHook) updateBattleUIHook();
  }
}

/**
 * ホスト側から最新のバトル状態（syncState）を即座に送信する。
 * 切断復帰時や同期修正時に使用する。
 * @returns {Promise<void>}
 */
export async function sendSyncStateNow() {
  if (
    checkIsOnlineMode(GameState.gameMode) &&
    getIsHost() &&
    !GameState.isBattleEnded
  ) {
    try {
      const syncState = generateSyncState();
      await sendOnlineAction({
        type: 'syncState',
        state: syncState,
      });
      // DBルーム直下にも保存
      await saveLastSyncStateToRoom(syncState, lastProcessedActionKey);
    } catch (syncErr) {
      console.error('即時状態同期の送信に失敗しました:', syncErr);
    }
  }
}

/**
 * オンライン対戦のホスト側から送信する同期用ステートを生成する。
 * Firebase RTDB の制約（undefined不可）を完全に満たすため、全プロパティの安全な正規化とフォールバックを実施する。
 * @returns {object} 同期用ステートオブジェクト
 */
export function generateSyncState() {
  const sanitizeCard = (c) => (c ? JSON.parse(JSON.stringify(c)) : null);
  const sanitizeArr = (arr, len = null) => {
    if (!Array.isArray(arr)) {
      return len !== null ? Array(len).fill(null) : [];
    }
    const clean = arr.map(sanitizeCard);
    if (len !== null && clean.length < len) {
      while (clean.length < len) clean.push(null);
    }
    return clean;
  };
  const sanitizeNumericArr = (arr, len = 3) => {
    if (!Array.isArray(arr)) return Array(len).fill(0);
    return Array.from({ length: len }, (_, i) => Number(arr[i] || 0));
  };

  const currentTurnValue =
    GameState.currentTurn === 'enemy' ? 'enemy' : 'player';

  return {
    playerHP: Number(GameState.playerHP ?? GameState.playerConfig?.hp ?? 30),
    enemyHP: Number(GameState.enemyHP ?? GameState.enemyConfig?.hp ?? 30),
    playerMaxHP: Number(
      GameState.playerMaxHP ?? GameState.playerConfig?.hp ?? 30
    ),
    enemyMaxHP: Number(GameState.enemyMaxHP ?? GameState.enemyConfig?.hp ?? 30),
    playerSP: Number(GameState.playerSP ?? 0),
    enemySP: Number(GameState.enemySP ?? 0),
    playerSealedLanes: sanitizeNumericArr(GameState.playerSealedLanes, 3),
    enemySealedLanes: sanitizeNumericArr(GameState.enemySealedLanes, 3),
    extraTurnCount: Number(GameState.extraTurnCount || 0),
    attackSkipCount: Number(GameState.attackSkipCount || 0),
    playerBoard: sanitizeArr(GameState.playerBoard, 3),
    enemyBoard: sanitizeArr(GameState.enemyBoard, 3),
    playerHand: sanitizeArr(GameState.playerHand),
    enemyHand: sanitizeArr(GameState.enemyHand),
    playerDiscard: sanitizeArr(GameState.playerDiscard),
    enemyDiscard: sanitizeArr(GameState.enemyDiscard),
    playerDeck: sanitizeArr(GameState.playerDeck),
    enemyDeck: sanitizeArr(GameState.enemyDeck),
    currentTurn: currentTurnValue,
    turnCount: Number(GameState.turnCount || 1),
    valkyriaGuardBlue: Number(GameState.valkyriaGuardBlue || 0),
    valkyriaGuardRed: Number(GameState.valkyriaGuardRed || 0),
  };
}

/**
 * オンライン対戦時にホストから送信された同期ステートをクライアント側に適用する。
 * ホストから見た敵味方がクライアント側では反転するため、player/enemyを入れ替えて適用する。
 * リジョイン（復帰）時にも呼び出される。
 * @param {object} state - 同期用ステートオブジェクト
 * @param {boolean|null} [forceInvert=null] - 反転フラグ（nullの場合はホスト判定で自動決定）
 */
export function applySyncState(state, forceInvert = null) {
  if (!state) return;

  const shouldInvert = forceInvert !== null ? forceInvert : !getIsHost();

  // 反転が不要（ホスト自身が通常のアクションエコーを受信したなど）かつforceInvertが指定されていない場合は何もしない
  if (!shouldInvert && forceInvert === null && getIsHost()) return;

  if (shouldInvert) {
    // クライアント（受信側）はホストから見て「敵（enemy）」なので、
    // 送られてきた状態の player と enemy を反転させてローカルに適用する。
    GameState.playerHP = Number(state.enemyHP ?? GameState.playerHP ?? 30);
    GameState.enemyHP = Number(state.playerHP ?? GameState.enemyHP ?? 30);
    if (typeof state.enemyMaxHP !== 'undefined') {
      GameState.playerMaxHP = Number(state.enemyMaxHP);
    }
    if (typeof state.playerMaxHP !== 'undefined') {
      GameState.enemyMaxHP = Number(state.playerMaxHP);
    }
    GameState.playerSP = Number(state.enemySP ?? 0);
    GameState.enemySP = Number(state.playerSP ?? 0);
  } else {
    // ホスト復帰時など反転不要の場合
    GameState.playerHP = Number(state.playerHP ?? GameState.playerHP ?? 30);
    GameState.enemyHP = Number(state.enemyHP ?? GameState.enemyHP ?? 30);
    if (typeof state.playerMaxHP !== 'undefined') {
      GameState.playerMaxHP = Number(state.playerMaxHP);
    }
    if (typeof state.enemyMaxHP !== 'undefined') {
      GameState.enemyMaxHP = Number(state.enemyMaxHP);
    }
    GameState.playerSP = Number(state.playerSP ?? 0);
    GameState.enemySP = Number(state.enemySP ?? 0);
  }

  /** owner 系プロパティを破壊的に反転する（コピーは呼び出し元で1回だけ行う） */
  const invertOwnerInPlace = (card) => {
    if (!card) return null;
    if (card.owner === 'blue') card.owner = 'red';
    else if (card.owner === 'red') card.owner = 'blue';

    if (card.puppetOriginalOwner === 'blue') card.puppetOriginalOwner = 'red';
    else if (card.puppetOriginalOwner === 'red')
      card.puppetOriginalOwner = 'blue';

    // Firebase はオブジェクト化して返す場合があるため、配列へ正規化する
    const toArray = (v) =>
      Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];

    if (card.equippedCards) {
      card.equippedCards = toArray(card.equippedCards).map(invertOwnerInPlace);
    }
    if (card.unionMaterials) {
      card.unionMaterials = toArray(card.unionMaterials).map(
        invertOwnerInPlace
      );
    }
    if (card.originalRevertTarget) {
      invertOwnerInPlace(card.originalRevertTarget);
    }
    return card;
  };

  /** 受信データを一度だけディープコピーしてから owner を反転する（クライアント側用） */
  const invertCardOwner = (card) =>
    card ? invertOwnerInPlace(JSON.parse(JSON.stringify(card))) : null;

  /**
   * 受信データをディープコピーのみ行い、owner は反転しない（ホスト復帰用）
   * @param {object|null} card - カードオブジェクト
   * @returns {object|null} ディープコピーされたカード
   */
  const cloneCardOnly = (card) =>
    card ? JSON.parse(JSON.stringify(card)) : null;

  // Firebaseでは配列に自動変換されたり省略されたりオブジェクト化されたりするため、厳密に配列化する
  const restoreArr = (arr, len = null) => {
    let result = [];
    if (!arr) {
      result = len !== null ? Array(len).fill(null) : [];
    } else if (Array.isArray(arr)) {
      result =
        len !== null
          ? Array.from({ length: len }, (_, i) => arr[i] || null)
          : arr;
    } else if (typeof arr === 'object') {
      result =
        len !== null
          ? Array.from({ length: len }, (_, i) => arr[i] || null)
          : Object.values(arr);
    } else {
      result = len !== null ? Array(len).fill(null) : [];
    }
    // shouldInvert 時のみ owner を反転させる。ホスト復帰時はコピーのみ行う。
    return result.map((c) =>
      shouldInvert ? invertCardOwner(c) : cloneCardOnly(c)
    );
  };

  const restoreNumericArr = (arr, len) =>
    Array.from({ length: len }, (_, i) => Number(arr?.[i] ?? 0));

  if (shouldInvert) {
    // クライアント側: ホストから見た player/enemy を反転して適用
    GameState.playerBoard = restoreArr(state.enemyBoard, 3);
    GameState.enemyBoard = restoreArr(state.playerBoard, 3);
    GameState.playerHand = restoreArr(state.enemyHand);
    GameState.enemyHand = restoreArr(state.playerHand);
    GameState.playerDiscard = restoreArr(state.enemyDiscard);
    GameState.enemyDiscard = restoreArr(state.playerDiscard);
    GameState.playerDeck = restoreArr(state.enemyDeck);
    GameState.enemyDeck = restoreArr(state.playerDeck);

    // 封印レーン（敵味方を反転）
    GameState.playerSealedLanes = restoreNumericArr(state.enemySealedLanes, 3);
    GameState.enemySealedLanes = restoreNumericArr(state.playerSealedLanes, 3);

    // ターン表記もホスト主観なので逆転
    if (state.currentTurn === 'player') GameState.currentTurn = 'enemy';
    else if (state.currentTurn === 'enemy') GameState.currentTurn = 'player';
    else GameState.currentTurn = GameState.currentTurn || 'player';

    // 加護フラグ（敵味方反転）
    GameState.valkyriaGuardBlue = state.valkyriaGuardRed || 0;
    GameState.valkyriaGuardRed = state.valkyriaGuardBlue || 0;
  } else {
    // ホスト復帰時: 反転なしでそのまま適用
    GameState.playerBoard = restoreArr(state.playerBoard, 3);
    GameState.enemyBoard = restoreArr(state.enemyBoard, 3);
    GameState.playerHand = restoreArr(state.playerHand);
    GameState.enemyHand = restoreArr(state.enemyHand);
    GameState.playerDiscard = restoreArr(state.playerDiscard);
    GameState.enemyDiscard = restoreArr(state.enemyDiscard);
    GameState.playerDeck = restoreArr(state.playerDeck);
    GameState.enemyDeck = restoreArr(state.enemyDeck);

    // 封印レーン（そのまま適用）
    GameState.playerSealedLanes = restoreNumericArr(state.playerSealedLanes, 3);
    GameState.enemySealedLanes = restoreNumericArr(state.enemySealedLanes, 3);

    // ホスト視点のままなので反転不要
    GameState.currentTurn =
      state.currentTurn || GameState.currentTurn || 'player';

    // 加護フラグ（そのまま適用）
    GameState.valkyriaGuardBlue = state.valkyriaGuardBlue || 0;
    GameState.valkyriaGuardRed = state.valkyriaGuardRed || 0;
  }

  // 戦闘追加・スキップ状態の同期（敵味方共通のため反転不要）
  GameState.extraTurnCount = Number(state.extraTurnCount || 0);
  GameState.attackSkipCount = Number(state.attackSkipCount || 0);
  GameState.turnCount = Number(state.turnCount || GameState.turnCount || 1);

  // 全てのUIを新しいステートに合わせて強制更新
  updateHPBar('blue', GameState.playerHP);
  updateHPBar('red', GameState.enemyHP);
  updateSPOrbs('blue');
  updateSPOrbs('red');
  renderBoard();
  renderHand();
  if (updateBattleUIHook) updateBattleUIHook();
}

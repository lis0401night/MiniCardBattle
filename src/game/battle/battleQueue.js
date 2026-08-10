// ==========================================
// バトルアクションキュー処理モジュール
// イベント駆動型タスクキューエンジンの中核を担う。
// プレイヤーやAIのアクション（カードプレイ、ターン終了、リーダースキル等）を
// キューイングし、順番に処理する。
// ==========================================

import { getIsHost, sendOnlineAction } from '../../services/multiplayer.js';
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
import { playSound, sleep } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import { executeEnemyAI } from '../ai.js';
import { activateLeaderSkill } from '../leaderSkills.js';
import { cleanupTutorial } from '../tutorialEngine.js';
import { showAlertModal } from '../../services/uiModals.js';

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

/**
 * キューエンジンが処理中かどうかを返す。
 * @returns {boolean} 処理中ならtrue
 */
export function getIsQueueProcessing() {
  return isQueueProcessing;
}

/**
 * キュー処理中フラグをリセットする。バトル初期化時に呼び出される。
 */
export function resetQueueProcessing() {
  isQueueProcessing = false;
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
  if (GameState.gameMode === 'online' && !isRemote) {
    // ローカルのアクションは直接キューに入れず、Firebaseのルームへ送信
    await sendOnlineAction(action);
    return;
  }

  if (action.type === 'submitChoice') {
    // 自分が送信した選択結果の反響(echo)は完全に無視する（自分のローカルはUIのPromiseで既に勝手に解決されているため）
    if (action.owner === 'blue') return;

    // Firebase仕様で空配列[]が送信されないため、undefinedで来た場合は空文字列とみなす
    const choiceData = action.choiceData !== undefined ? action.choiceData : '';

    if (pendingChoiceResolver) {
      pendingChoiceResolver(choiceData);
      pendingChoiceResolver = null;
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
        } else if (GameState.gameMode !== 'online') {
          await sleep(AI_THINKING_DURATION);
          await executeEnemyAI();
        }
      } else if (action.type === 'syncState') {
        applySyncState(action.state);
      }

      if (updateBattleUIHook) updateBattleUIHook(); // React側に再描画を通知

      // ホスト側：syncState以外のアクション処理が終わるごとに現在の正しいステートを送信する
      if (
        GameState.gameMode === 'online' &&
        getIsHost() &&
        action.type !== 'syncState' &&
        action.type !== 'enemyTurn' &&
        action.type !== 'submitChoice'
      ) {
        // 同期送信の単発失敗でローカルバトル処理を中断させないよう内部保護
        try {
          await sendOnlineAction({
            type: 'syncState',
            state: generateSyncState(),
          });
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
 * オンライン対戦のホスト側から送信する同期用ステートを生成する。
 * @returns {object} 同期用ステートオブジェクト
 */
function generateSyncState() {
  return {
    playerHP: GameState.playerHP,
    enemyHP: GameState.enemyHP,
    playerSP: GameState.playerSP,
    enemySP: GameState.enemySP,
    playerSealedLanes: JSON.parse(
      JSON.stringify(GameState.playerSealedLanes || [0, 0, 0])
    ),
    enemySealedLanes: JSON.parse(
      JSON.stringify(GameState.enemySealedLanes || [0, 0, 0])
    ),
    extraTurnCount: GameState.extraTurnCount || 0,
    attackSkipCount: GameState.attackSkipCount || 0,
    playerBoard: JSON.parse(JSON.stringify(GameState.playerBoard)),
    enemyBoard: JSON.parse(JSON.stringify(GameState.enemyBoard)),
    playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
    enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
    playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
    enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard)),
    playerDeck: JSON.parse(JSON.stringify(GameState.playerDeck)),
    enemyDeck: JSON.parse(JSON.stringify(GameState.enemyDeck)),
    currentTurn: GameState.currentTurn,
    turnCount: GameState.turnCount,
    valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
    valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
  };
}

/**
 * オンライン対戦時にホストから送信された同期ステートをクライアント側に適用する。
 * ホストから見た敵味方がクライアント側では反転するため、player/enemyを入れ替えて適用する。
 * @param {object} state - 同期用ステートオブジェクト
 */
function applySyncState(state) {
  if (!state) return;

  // ホスト自身がエコーを受信した場合は無視
  if (getIsHost()) return;

  // クライアント（受信側）はホストから見て「敵（enemy）」なので、
  // 送られてきた状態の player と enemy を反転させてローカルに適用しなければならない。
  GameState.playerHP = state.enemyHP || 0;
  GameState.enemyHP = state.playerHP || 0;
  GameState.playerSP = state.enemySP || 0;
  GameState.enemySP = state.playerSP || 0;

  // 受信側（クライアント）では敵味方が反転するため、カードの owner プロパティも再帰的に反転させる
  const invertCardOwner = (card) => {
    if (!card) return null;
    const cloned = JSON.parse(JSON.stringify(card));
    if (cloned.owner === 'blue') cloned.owner = 'red';
    else if (cloned.owner === 'red') cloned.owner = 'blue';

    if (cloned.puppetOriginalOwner === 'blue')
      cloned.puppetOriginalOwner = 'red';
    else if (cloned.puppetOriginalOwner === 'red')
      cloned.puppetOriginalOwner = 'blue';

    // 装備されているカード（equippedCards）も再帰的に反転する
    if (cloned.equippedCards) {
      const eqArr = Array.isArray(cloned.equippedCards)
        ? cloned.equippedCards
        : typeof cloned.equippedCards === 'object'
          ? Object.values(cloned.equippedCards)
          : [];
      cloned.equippedCards = eqArr.map(invertCardOwner);
    }
    if (cloned.unionMaterials) {
      const matArr = Array.isArray(cloned.unionMaterials)
        ? cloned.unionMaterials
        : typeof cloned.unionMaterials === 'object'
          ? Object.values(cloned.unionMaterials)
          : [];
      cloned.unionMaterials = matArr.map(invertCardOwner);
    }
    if (cloned.originalRevertTarget) {
      cloned.originalRevertTarget = invertCardOwner(
        cloned.originalRevertTarget
      );
    }
    return cloned;
  };

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
    // 反転させたうえで適用する
    return result.map((c) => invertCardOwner(c));
  };

  const restoreNumericArr = (arr, len) =>
    Array.from({ length: len }, (_, i) => Number(arr?.[i] ?? 0));

  GameState.playerBoard = restoreArr(state.enemyBoard, 3);
  GameState.enemyBoard = restoreArr(state.playerBoard, 3);
  GameState.playerHand = restoreArr(state.enemyHand);
  GameState.enemyHand = restoreArr(state.playerHand);
  GameState.playerDiscard = restoreArr(state.enemyDiscard);
  GameState.enemyDiscard = restoreArr(state.playerDiscard);
  GameState.playerDeck = restoreArr(state.enemyDeck);
  GameState.enemyDeck = restoreArr(state.playerDeck);

  // 封印レーン（敵味方を反転）と戦闘追加・スキップ状態の同期
  GameState.playerSealedLanes = restoreNumericArr(state.enemySealedLanes, 3);
  GameState.enemySealedLanes = restoreNumericArr(state.playerSealedLanes, 3);
  GameState.extraTurnCount = state.extraTurnCount || 0;
  GameState.attackSkipCount = state.attackSkipCount || 0;

  // ターン表記（player / enemy）もホストから見た主観なので逆転させる
  if (state.currentTurn === 'player') GameState.currentTurn = 'enemy';
  else if (state.currentTurn === 'enemy') GameState.currentTurn = 'player';
  else GameState.currentTurn = state.currentTurn;

  GameState.turnCount = state.turnCount;

  // 戦乙女の加護フラグ（敵味方反転）
  GameState.valkyriaGuardBlue = state.valkyriaGuardRed || 0;
  GameState.valkyriaGuardRed = state.valkyriaGuardBlue || 0;

  // 全てのUIを新しいステートに合わせて強制更新
  updateHPBar('blue', GameState.playerHP);
  updateHPBar('red', GameState.enemyHP);
  updateSPOrbs('blue');
  updateSPOrbs('red');
  renderBoard();
  renderHand();
  if (updateBattleUIHook) updateBattleUIHook();
}

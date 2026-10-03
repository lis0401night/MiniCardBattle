/**
 * Mini Card Battle - Online Battle Disconnect Manager
 *
 * オンライン対戦中の通信切断・電波瞬断・復帰（リコネクト）を統括するマネージャー。
 * 即座の部屋削除を防止し、60秒間の待機オーバーレイの表示、対戦タイマーの一時停止・再開、
 * 復帰時の盤面再同期（syncState）、およびタイムアウト時の切断判定（不戦勝）を処理する。
 */

import { GameState } from '../../state/gameState.js';
import {
  getIsHost,
  multiplayerCallbacks,
  setupBattleDisconnectHandlers,
  restoreLobbyDisconnectHandlers,
  subscribeFirebaseConnection,
  leaveRoom,
} from '../../services/multiplayer.js';
import {
  ONLINE_DISCONNECT_WAIT_SEC,
} from '../../utils/constants/onlineTimer.js';
import {
  pauseOnlineTimer,
  resumeOnlineTimer,
} from './onlineTimer.js';
import { sendSyncStateNow } from './battleQueue.js';
import { endBattle } from './battleResult.js';
import { triggerFinishVisuals } from '../../services/uiBattle.js';
import { showAlertModal } from '../../services/uiModals.js';
import { stopAllBGM, switchScreen } from '../../utils/gameUtils.js';

/**
 * @typedef {Object} DisconnectState
 * @property {boolean} isWaiting - 切断待機中（オーバーレイ表示）かどうか
 * @property {boolean} isOpponentDisconnected - 相手が切断中かどうか
 * @property {boolean} isSelfDisconnected - 自分がオフライン中かどうか
 * @property {number} remainingSeconds - 残り待機時間（秒）
 * @property {boolean} isReconnectedNotice - 復帰通知（「復帰しました」表示）中かどうか
 */

/** @type {DisconnectState} */
let currentDisconnectState = {
  isWaiting: false,
  isOpponentDisconnected: false,
  isSelfDisconnected: false,
  remainingSeconds: ONLINE_DISCONNECT_WAIT_SEC,
  isReconnectedNotice: false,
};

/** @type {number|null} */
let countdownIntervalId = null;

/** @type {number|null} */
let noticeTimeoutId = null;

/** @type {(() => void)|null} */
let unsubscribeFirebaseConn = null;

/** @type {Set<(state: DisconnectState) => void>} */
const subscribers = new Set();

/**
 * 現在の切断待機状態を取得する
 * @returns {DisconnectState}
 */
export function getDisconnectState() {
  return { ...currentDisconnectState };
}

/**
 * 切断待機状態の変更を購読する
 * @param {(state: DisconnectState) => void} callback
 * @returns {() => void} 購読解除関数
 */
export function subscribeDisconnectState(callback) {
  subscribers.add(callback);
  callback(getDisconnectState());
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * 購読者全員に最新の状態を通知する
 */
function notifySubscribers() {
  const snapshot = getDisconnectState();
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (e) {
      console.error('[DisconnectManager] subscriber error:', e);
    }
  });
}

/**
 * 相手プレイヤーの最新情報を取得する
 * @param {Object} roomData
 * @returns {Object|null}
 */
function getOpponentData(roomData) {
  if (!roomData) return null;
  return getIsHost() ? roomData.client : roomData.host;
}

/**
 * 切断カウントダウンを開始する
 */
function startCountdown() {
  if (countdownIntervalId !== null) return;

  // 対戦の思考・選択タイマーを一時停止
  pauseOnlineTimer();

  currentDisconnectState = {
    ...currentDisconnectState,
    isWaiting: true,
    isReconnectedNotice: false,
    remainingSeconds: ONLINE_DISCONNECT_WAIT_SEC,
  };
  notifySubscribers();

  countdownIntervalId = window.setInterval(() => {
    const nextSec = currentDisconnectState.remainingSeconds - 1;

    if (nextSec <= 0) {
      currentDisconnectState = {
        ...currentDisconnectState,
        remainingSeconds: 0,
      };
      notifySubscribers();
      stopCountdown();
      handleDisconnectTimeout();
      return;
    }

    currentDisconnectState = {
      ...currentDisconnectState,
      remainingSeconds: nextSec,
    };
    notifySubscribers();
  }, 1000);
}

/**
 * 切断カウントダウンを停止する
 */
function stopCountdown() {
  if (countdownIntervalId !== null) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

/**
 * 通信復帰時の処理を実行する
 */
function handleReconnected() {
  stopCountdown();

  currentDisconnectState = {
    ...currentDisconnectState,
    isWaiting: true,
    isOpponentDisconnected: false,
    isSelfDisconnected: false,
    isReconnectedNotice: true,
  };
  notifySubscribers();

  // ホストの場合、復帰したクライアントへ最新の完全盤面ステートを即時送信して同期
  if (getIsHost()) {
    sendSyncStateNow().catch((e) =>
      console.warn('[DisconnectManager] sendSyncStateNow failed:', e)
    );
  }

  // 1.5秒間「復帰しました」を表示した後にオーバーレイを解除し、タイマーを再開
  if (noticeTimeoutId) {
    clearTimeout(noticeTimeoutId);
  }
  noticeTimeoutId = window.setTimeout(() => {
    noticeTimeoutId = null;
    currentDisconnectState = {
      isWaiting: false,
      isOpponentDisconnected: false,
      isSelfDisconnected: false,
      remainingSeconds: ONLINE_DISCONNECT_WAIT_SEC,
      isReconnectedNotice: false,
    };
    notifySubscribers();

    // 対戦タイマーを再開
    resumeOnlineTimer();
  }, 1500);
}

/**
 * 60秒切断待機がタイムアウトした時の勝敗・終了判定
 */
function handleDisconnectTimeout() {
  if (GameState.isBattleEnded) return;

  // 自分がオフラインのままタイムアウトした場合
  if (currentDisconnectState.isSelfDisconnected) {
    GameState.isBattleEnded = true;
    cleanupOnlineDisconnectManager();
    stopAllBGM();

    showAlertModal(
      'インターネット通信が回復しなかったため、対戦を終了します。',
      () => {
        leaveRoom().catch(() => {});
        switchScreen('screen-online-lobby');
      }
    );
    return;
  }

  // 相手がオフラインのままタイムアウトした場合（不戦勝）
  if (currentDisconnectState.isOpponentDisconnected) {
    GameState.isBattleEnded = true;
    cleanupOnlineDisconnectManager();
    stopAllBGM();

    // 相手HPを0にして勝利を確定
    GameState.enemyHP = 0;
    if (GameState.enemyConfig) {
      GameState.enemyConfig.hp = 0;
    }
    GameState.lastBattleResult = 'win';

    showAlertModal(
      '対戦相手の通信が切断されたため、あなたの不戦勝となります。',
      () => {
        triggerFinishVisuals();
        setTimeout(() => {
          endBattle();
        }, 1000);
      }
    );
  }
}

/**
 * 内部タイマーや接続監視ハンドラのリソースのみを解放する
 * ※ ロビー用削除予約（restoreLobbyDisconnectHandlers）は呼ばない
 */
function resetDisconnectInternalState() {
  stopCountdown();
  if (noticeTimeoutId) {
    clearTimeout(noticeTimeoutId);
    noticeTimeoutId = null;
  }
  if (unsubscribeFirebaseConn) {
    unsubscribeFirebaseConn();
    unsubscribeFirebaseConn = null;
  }

  // 対戦用のルーム更新ハンドラを解除
  multiplayerCallbacks.onRoomUpdated = null;

  currentDisconnectState = {
    isWaiting: false,
    isOpponentDisconnected: false,
    isSelfDisconnected: false,
    remainingSeconds: ONLINE_DISCONNECT_WAIT_SEC,
    isReconnectedNotice: false,
  };
  notifySubscribers();
}

/**
 * 対戦開始時に切断監視リスナーを初期化する
 */
export function initOnlineDisconnectManager() {
  if (GameState.gameMode !== 'online') return;

  // 以前のリスナー・タイマーの内部リソースのみをクリーンアップ
  // （対戦開始時にロビー用削除ポリシーを誤って再登録しないよう注意）
  resetDisconnectInternalState();

  // 対戦用切断ポリシー（即時削除解除 & isOnline 管理）を確実に適用
  setupBattleDisconnectHandlers().catch((e) =>
    console.warn('[DisconnectManager] setupBattleDisconnectHandlers failed:', e)
  );

  // 1. 自身のFirebase接続状態を監視
  unsubscribeFirebaseConn = subscribeFirebaseConnection((connected) => {
    if (GameState.isBattleEnded) return;

    const isDisconnected = !connected;
    if (currentDisconnectState.isSelfDisconnected === isDisconnected) return;

    currentDisconnectState = {
      ...currentDisconnectState,
      isSelfDisconnected: isDisconnected,
    };

    if (isDisconnected) {
      startCountdown();
    } else if (!currentDisconnectState.isOpponentDisconnected) {
      // 相手もオンラインであれば復帰完了
      handleReconnected();
    } else {
      notifySubscribers();
    }
  });

  // 2. ルーム更新による相手の接続状態を監視
  multiplayerCallbacks.onRoomUpdated = (roomData) => {
    if (!roomData || GameState.isBattleEnded) return;

    const opData = getOpponentData(roomData);
    // opData が存在しないか、明示的に isOnline === false の場合は切断中と判定
    const isOpDisconnected = !opData || opData.isOnline === false;

    if (currentDisconnectState.isOpponentDisconnected === isOpDisconnected) {
      return;
    }

    currentDisconnectState = {
      ...currentDisconnectState,
      isOpponentDisconnected: isOpDisconnected,
    };

    if (isOpDisconnected) {
      startCountdown();
    } else if (!currentDisconnectState.isSelfDisconnected) {
      // 自分もオンラインであれば復帰完了
      handleReconnected();
    } else {
      notifySubscribers();
    }
  };
}

/**
 * 対戦終了時に切断監視リソースを解放し、ロビー待機用切断ポリシーへ復元する
 */
export function cleanupOnlineDisconnectManager() {
  resetDisconnectInternalState();

  // ルームマッチ（再戦ロビーが存在するモード）の場合のみロビー用の切断時ポリシーへ戻す
  // クイックマッチ（1戦完結）の場合は部屋を削除・退室するため復元不要
  if (GameState.onlineSubMode !== 'quick') {
    restoreLobbyDisconnectHandlers().catch((e) =>
      console.warn('[DisconnectManager] restoreLobbyDisconnectHandlers failed:', e)
    );
  }
}

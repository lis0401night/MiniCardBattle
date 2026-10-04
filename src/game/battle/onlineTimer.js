/**
 * Mini Card Battle - Online Battle Timer Manager
 *
 * オンライン対戦における各種操作（マリガン・メインフェイズ・サブ選択）の制限時間カウントダウン、
 * 残り時間5秒の火花警告演出制御、およびタイムアウト時の自動進行・フェイルセーフ処理を統括するモジュール。
 */

import { GameState } from '../../state/gameState.js';
import {
  ONLINE_TIMER_MULLIGAN_SEC,
  ONLINE_TIMER_MAIN_PHASE_SEC,
  ONLINE_TIMER_CHOICE_BONUS_SEC,
  ONLINE_TIMER_WARNING_SEC,
  ONLINE_TIMER_FAILSAFE_MARGIN_MS,
  ONLINE_TIMER_TICK_INTERVAL_MS,
  checkIsOnlineTimerEnabled,
} from '../../utils/constants/onlineTimer.js';

/**
 * @typedef {Object} OnlineTimerState
 * @property {boolean} isActive - タイマー稼働中かどうか
 * @property {'mulligan'|'main'|'choice'|null} type - タイマーの種別
 * @property {'blue'|'red'|null} owner - 操作主（'blue'=自分, 'red'=相手）
 * @property {number} durationMs - 総制限時間（ミリ秒）
 * @property {number} remainingMs - 残り時間（ミリ秒）
 * @property {boolean} isWarning - 警告演出中（残り5秒以下）かどうか
 * @property {number} progress - 警告時の残り割合（1.0 -> 0.0）
 */

/** @type {OnlineTimerState} */
let currentTimerState = {
  isActive: false,
  type: null,
  owner: null,
  durationMs: 0,
  remainingMs: 0,
  isWarning: false,
  progress: 1.0,
};

/**
 * ターンごとの各プレイヤーの残り持ち時間（ミリ秒）。
 * ターン開始時に各プレイヤー 60,000ms に初期化され、
 * メインフェイズの思考時間およびオンプレイ等の各種選択待機で共有される。
 */
let turnRemainingMs = {
  blue: ONLINE_TIMER_MAIN_PHASE_SEC * 1000,
  red: ONLINE_TIMER_MAIN_PHASE_SEC * 1000,
};

/**
 * 相手ターン中の割り込み（誘発・命令・選別など）発生時に、手番側のタイマーを退避するスタック
 * @type {Array<{
 *   type: 'mulligan'|'main'|'choice',
 *   owner: 'blue'|'red',
 *   durationMs: number,
 *   remainingMs: number,
 *   onTimeout: Function|null,
 *   onFailsafeTimeout: Function|null,
 * }>}
 */
let pausedTimerStack = [];

/** @type {number|null} */
let intervalId = null;

/** @type {Set<(state: OnlineTimerState) => void>} */
const subscribers = new Set();

/** @type {boolean} */
let isTimeoutTriggered = false;

/** @type {boolean} */
let isTimerPaused = false;

/** @type {number} */
let pausedRemainingMs = 0;

/** @type {(() => void)|null} */
let currentOnTimeout = null;

/** @type {(() => void)|null} */
let currentOnFailsafeTimeout = null;

/**
 * 現在のオンラインタイマー状態を取得する
 * @returns {OnlineTimerState}
 */
export function getOnlineTimerState() {
  return { ...currentTimerState };
}

/**
 * タイマー状態の変更を購読する
 * @param {(state: OnlineTimerState) => void} callback
 * @returns {() => void} 購読解除関数
 */
export function subscribeOnlineTimer(callback) {
  subscribers.add(callback);
  callback(getOnlineTimerState());
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * 購読者全員に最新のタイマー状態を通知する
 */
function notifySubscribers() {
  const snapshot = getOnlineTimerState();
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (err) {
      console.error('Online timer subscriber error:', err);
    }
  });
}

/**
 * 内部タイマーインターバルを起動・管理する共通ヘルパー関数（DRY原則）。
 *
 * @param {Object} params
 * @param {'mulligan'|'main'|'choice'} params.type - タイマー種別
 * @param {'blue'|'red'} params.owner - 操作対象プレイヤー
 * @param {number} params.durationMs - このフェーズの総制限時間（ミリ秒）
 * @param {number} params.initialRemainingMs - カウントダウン開始時の初期残余時間（ミリ秒）
 * @param {Function|null} [params.onTimeout] - タイムアウトコールバック
 * @param {Function|null} [params.onFailsafeTimeout] - フェイルセーフタイムアウトコールバック
 */
function _runTimerInternal({
  type,
  owner,
  durationMs,
  initialRemainingMs,
  onTimeout = null,
  onFailsafeTimeout = null,
}) {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  const warningThresholdMs = ONLINE_TIMER_WARNING_SEC * 1000;
  const startTimestamp = performance.now();
  isTimeoutTriggered = false;
  isTimerPaused = false;
  pausedRemainingMs = initialRemainingMs;
  currentOnTimeout = onTimeout;
  currentOnFailsafeTimeout = onFailsafeTimeout;

  const isWarning = initialRemainingMs <= warningThresholdMs;
  const progress = isWarning
    ? Math.max(0, Math.min(1.0, initialRemainingMs / warningThresholdMs))
    : 1.0;

  currentTimerState = {
    isActive: true,
    type,
    owner,
    durationMs,
    remainingMs: initialRemainingMs,
    isWarning,
    progress,
  };

  notifySubscribers();

  intervalId = window.setInterval(() => {
    const elapsedMs = performance.now() - startTimestamp;
    const remainingMs = Math.max(0, initialRemainingMs - elapsedMs);

    // ターン全体の持ち時間をリアルタイム同期（マリガン以外）
    if (type !== 'mulligan') {
      turnRemainingMs[owner] = remainingMs;
    }

    const currentWarning = remainingMs <= warningThresholdMs;
    const currentProgress = currentWarning
      ? Math.max(0, Math.min(1.0, remainingMs / warningThresholdMs))
      : 1.0;

    currentTimerState = {
      ...currentTimerState,
      remainingMs,
      isWarning: currentWarning,
      progress: currentProgress,
    };

    notifySubscribers();

    // 1. 自分側のタイムアウト判定（0秒到達）
    if (owner === 'blue' && remainingMs <= 0 && !isTimeoutTriggered) {
      isTimeoutTriggered = true;
      stopOnlineTimer();
      if (typeof onTimeout === 'function') {
        try {
          onTimeout();
        } catch (e) {
          console.error('[OnlineTimer] onTimeout error:', e);
        }
      }
      return;
    }

    // 2. 相手番（red）のフェイルセーフ判定（制限時間＋通信猶予時間を超過しても無応答）
    const failsafeTimeoutLimitMs =
      initialRemainingMs + ONLINE_TIMER_FAILSAFE_MARGIN_MS;
    if (
      owner === 'red' &&
      elapsedMs >= failsafeTimeoutLimitMs &&
      !isTimeoutTriggered
    ) {
      isTimeoutTriggered = true;
      stopOnlineTimer();
      if (typeof onFailsafeTimeout === 'function') {
        try {
          onFailsafeTimeout();
        } catch (e) {
          console.error('[OnlineTimer] onFailsafeTimeout error:', e);
        }
      }
    }
  }, ONLINE_TIMER_TICK_INTERVAL_MS);
}

/**
 * 現在アクティブなタイマーを一時停止し、退避スタックへプッシュする。
 * 相手ターン中の割り込み（誘発・命令・選別など）発生時に、手番側のタイマーを安全に退避するために使用される。
 */
function _saveAndPauseActiveTimerToStack() {
  if (!currentTimerState.isActive) return;

  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  // 手番プレイヤーの最終残り時間を確実に記録
  if (currentTimerState.owner) {
    turnRemainingMs[currentTimerState.owner] = currentTimerState.remainingMs;
  }

  pausedTimerStack.push({
    type: currentTimerState.type,
    owner: currentTimerState.owner,
    durationMs: currentTimerState.durationMs,
    remainingMs: currentTimerState.remainingMs,
    onTimeout: currentOnTimeout,
    onFailsafeTimeout: currentOnFailsafeTimeout,
  });

  currentOnTimeout = null;
  currentOnFailsafeTimeout = null;
}

/**
 * オンライン対戦タイマーを開始する。
 * ターン制持ち時間モデル（1ターン合計60秒）に基づき、メインフェイズの思考時間と
 * カード配置後のサブ選択（オンプレイ、誘発、命令、選別等）で同じ持ち時間を共有する。
 *
 * @param {Object} options
 * @param {'mulligan'|'main'|'choice'} options.type - タイマー種別
 * @param {number} [options.durationSec] - 制限時間（秒）。フォールバック用
 * @param {'blue'|'red'} [options.owner='blue'] - 操作対象プレイヤー
 * @param {() => void} [options.onTimeout] - タイムアウト時（自分側の時間切れ）の実行処理
 * @param {() => void} [options.onFailsafeTimeout] - フェイルセーフタイムアウト時（相手側の応答途絶）の実行処理
 */
export function startOnlineTimer({
  type,
  durationSec = ONLINE_TIMER_MAIN_PHASE_SEC,
  owner = 'blue',
  onTimeout,
  onFailsafeTimeout,
}) {
  // 有効化対象モード（オンライン・プラクティス）以外ではタイマーを動作させない
  if (!checkIsOnlineTimerEnabled(GameState.gameMode)) {
    return;
  }

  // 1. マリガン選択タイマー（手札引き直し: 30秒単独）
  if (type === 'mulligan') {
    stopOnlineTimer(true);
    const mulliganDurationMs = ONLINE_TIMER_MULLIGAN_SEC * 1000;
    turnRemainingMs.blue = mulliganDurationMs;
    turnRemainingMs.red = mulliganDurationMs;
    _runTimerInternal({
      type: 'mulligan',
      owner,
      durationMs: mulliganDurationMs,
      initialRemainingMs: mulliganDurationMs,
      onTimeout,
      onFailsafeTimeout,
    });
    return;
  }

  // 2. メインフェイズタイマー（新ターン開始時）
  if (type === 'main') {
    // 新ターン開始のため、退避スタックを完全クリアし、両者のターン持ち時間を60秒にリセット
    stopOnlineTimer(true);
    const turnDurationMs = ONLINE_TIMER_MAIN_PHASE_SEC * 1000;
    turnRemainingMs.blue = turnDurationMs;
    turnRemainingMs.red = turnDurationMs;
    _runTimerInternal({
      type: 'main',
      owner,
      durationMs: turnDurationMs,
      initialRemainingMs: turnDurationMs,
      onTimeout,
      onFailsafeTimeout,
    });
    return;
  }

  // 3. サブ選択タイマー（オンプレイ、誘発、命令、選別等: type === 'choice'）
  // 直前のアクティブタイマーがメインフェイズタイマーであるか、または操作主（owner）が直前のアクティブタイマーと異なる場合
  if (
    currentTimerState.isActive &&
    (currentTimerState.type === 'main' || currentTimerState.owner !== owner)
  ) {
    // 現在の手番タイマー（または割り込みされた相手側タイマー）を一時停止し、スタックへ退避
    _saveAndPauseActiveTimerToStack();
  } else if (intervalId !== null) {
    // 同一プレイヤーの連続更新など
    clearInterval(intervalId);
    intervalId = null;
  }

  // 今回の操作主（owner）のターン残余持ち時間を取得し、選択発生ボーナス（+5秒）を加算
  // ただしターン全体の総持ち時間上限（60秒）は超えないよう制御する
  const maxTurnMs = ONLINE_TIMER_MAIN_PHASE_SEC * 1000;
  const bonusMs = ONLINE_TIMER_CHOICE_BONUS_SEC * 1000;
  const baseRemaining = Math.max(
    0,
    turnRemainingMs[owner] !== undefined
      ? turnRemainingMs[owner]
      : durationSec * 1000
  );
  const remaining = Math.min(maxTurnMs, baseRemaining + bonusMs);
  turnRemainingMs[owner] = remaining;

  // すでにターン持ち時間を使い切っている場合（0秒以下）は即座にタイムアウト処理を実行
  if (remaining <= 0) {
    if (owner === 'blue' && typeof onTimeout === 'function') {
      try {
        onTimeout();
      } catch (e) {
        console.error('[OnlineTimer] instant onTimeout error:', e);
      }
    } else if (owner === 'red' && typeof onFailsafeTimeout === 'function') {
      try {
        onFailsafeTimeout();
      } catch (e) {
        console.error('[OnlineTimer] instant onFailsafeTimeout error:', e);
      }
    }
    return;
  }

  _runTimerInternal({
    type: 'choice',
    owner,
    durationMs: remaining,
    initialRemainingMs: remaining,
    onTimeout,
    onFailsafeTimeout,
  });
}

/**
 * 稼働中のオンライン対戦タイマーを一時停止する（カード配置アニメーション中、切断待機時など）。
 */
export function pauseOnlineTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (currentTimerState.isActive) {
    isTimerPaused = true;
    pausedRemainingMs = currentTimerState.remainingMs;
    if (currentTimerState.owner) {
      turnRemainingMs[currentTimerState.owner] = currentTimerState.remainingMs;
    }
  }
}

/**
 * 一時停止していたオンライン対戦タイマーを残余時間から再開する。
 */
export function resumeOnlineTimer() {
  if (!isTimerPaused || !currentTimerState.isActive) return;
  isTimerPaused = false;

  _runTimerInternal({
    type: currentTimerState.type,
    owner: currentTimerState.owner,
    durationMs: currentTimerState.durationMs,
    initialRemainingMs: pausedRemainingMs,
    onTimeout: currentOnTimeout,
    onFailsafeTimeout: currentOnFailsafeTimeout,
  });
}

/**
 * オンライン対戦タイマーが一時停止中かどうかを取得する。
 * @returns {boolean} 一時停止中ならtrue
 */
export function isOnlineTimerPaused() {
  return isTimerPaused;
}

/**
 * 稼働中のオンライン対戦タイマーを停止する。
 * 退避スタックに割り込まれた直前のタイマー（例: 相手ターン中に割り込みされた相手側の手番タイマー）が存在する場合、
 * 自動的にそのタイマーを退避時の残余時間から再開する。
 *
 * @param {boolean} [clearStack=false] - 退避スタックも含めて完全消去するかどうか（新ターン開始時・対戦終了時など）
 */
export function stopOnlineTimer(clearStack = false) {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  // 現在のタイマーの最終残り時間を turnRemainingMs に確定記録
  if (currentTimerState.isActive && currentTimerState.owner) {
    turnRemainingMs[currentTimerState.owner] = currentTimerState.remainingMs;
  }

  isTimerPaused = false;
  pausedRemainingMs = 0;
  currentOnTimeout = null;
  currentOnFailsafeTimeout = null;

  if (clearStack) {
    pausedTimerStack = [];
  }

  // 退避スタックにタイマーが残っている場合、直前のタイマー（例: 相手の手番タイマー）を自動復元・再開
  if (!clearStack && pausedTimerStack.length > 0) {
    const resumed = pausedTimerStack.pop();
    _runTimerInternal({
      type: resumed.type,
      owner: resumed.owner,
      durationMs: resumed.durationMs,
      initialRemainingMs: resumed.remainingMs,
      onTimeout: resumed.onTimeout,
      onFailsafeTimeout: resumed.onFailsafeTimeout,
    });
    return;
  }

  // スタックが空の場合は完全に非アクティブ化してUI通知
  if (currentTimerState.isActive) {
    currentTimerState = {
      isActive: false,
      type: null,
      owner: null,
      durationMs: 0,
      remainingMs: 0,
      isWarning: false,
      progress: 1.0,
    };
    notifySubscribers();
  }
}

/**
 * 指定プレイヤーの現在のターン残り持ち時間（ミリ秒）を取得する。
 * @param {'blue'|'red'} [owner='blue'] - 対象プレイヤー
 * @returns {number} 残り時間（ミリ秒）
 */
export function getTurnRemainingMs(owner = 'blue') {
  return turnRemainingMs[owner] ?? 0;
}

/**
 * 対戦終了時等にタイマーリソース・退避スタックを完全解放する。
 */
export function cleanupOnlineTimer() {
  stopOnlineTimer(true);
  pausedTimerStack = [];
  turnRemainingMs.blue = ONLINE_TIMER_MAIN_PHASE_SEC * 1000;
  turnRemainingMs.red = ONLINE_TIMER_MAIN_PHASE_SEC * 1000;
  // Note: subscribers はコンポーネント側の useEffect クリーンアップで個別に解除されるため、
  // ここで subscribers.clear() するとマウント中の SparkTimerLine 等の購読まで消滅してしまうためクリアしない
}

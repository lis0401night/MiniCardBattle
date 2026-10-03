/**
 * Mini Card Battle - Online Timer Constants
 *
 * オンライン対戦における制限時間およびカウントダウン演出に関する定数定義。
 */

/** マリガン選択の制限時間（秒） */
export const ONLINE_TIMER_MULLIGAN_SEC = 30;


/** メインフェイズ（ターン手番）の制限時間（秒）。1ターンの総持ち時間でもある */
export const ONLINE_TIMER_MAIN_PHASE_SEC = 60;

/** 選択（サブ選択・割り込み）発生時に加算されるボーナス時間（秒） */
export const ONLINE_TIMER_CHOICE_BONUS_SEC = 5;

/** 火花ラインのカウントダウン警告演出を開始する残り秒数（秒） */
export const ONLINE_TIMER_WARNING_SEC = 5;

/** 相手端末の切断・放置を判定するための通信猶予時間（ミリ秒） */
export const ONLINE_TIMER_FAILSAFE_MARGIN_MS = 4000;

/** タイマー更新のティック間隔（ミリ秒） */
export const ONLINE_TIMER_TICK_INTERVAL_MS = 100;

/** オンライン対戦時の切断復帰待機時間（秒） */
export const ONLINE_DISCONNECT_WAIT_SEC = 60;

/**
 * 指定されたゲームモードで時間制限タイマーを有効化するかどうかを判定する（ホワイトリスト方式）
 * オンライン対戦（online）および挙動確認用のプラクティス（practice）で有効。
 * @param {string} gameMode - 対象のゲームモード
 * @returns {boolean} 有効化対象ならtrue
 */
export function checkIsOnlineTimerEnabled(gameMode) {
  return (
    gameMode === 'online' ||
    gameMode === 'online_quick' ||
    gameMode === 'online_quick_cpu' ||
    gameMode === 'practice'
  );
}

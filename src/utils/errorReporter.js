/**
 * エラーレポーター
 *
 * クライアントで発生したエラーをサーバーの api/log_error.php へ送信する共通ユーティリティ。
 * レートリミットと重複抑制により、サーバーへの過負荷を防止する。
 */

import { GAME_VERSION } from './constants/config.js';

// --- 定数 ---
/** 1セッション内の最大送信件数 */
const MAX_REPORTS_PER_SESSION = 10;
/** 同一メッセージの再送抑制期間（ミリ秒） */
const DEDUP_INTERVAL_MS = 5 * 60 * 1000;
/** API送信タイムアウト（ミリ秒） */
const SEND_TIMEOUT_MS = 3000;
/** APIエンドポイント */
const ERROR_LOG_ENDPOINT = 'api/log_error.php';

// --- 内部状態 ---
/** 今のセッションで送信した件数 */
let reportCount = 0;
/** 重複抑制用: メッセージ → 最終送信時刻 */
const recentMessages = new Map();

/**
 * 現在の画面IDを取得する。
 * React側の switchScreen で管理されている画面名を取得する。
 * @returns {string} 画面ID（例: 'screen-battle'）
 */
function getCurrentScreen() {
  // App.jsxの画面管理から現在の画面を取得
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen && activeScreen.id) return activeScreen.id;
  return 'unknown';
}

/**
 * プレイヤーのUUIDを取得する（LocalStorageから直接読み取り）。
 * gameUtils.jsのインポート循環を避けるため、直接読み取る。
 * @returns {string} UUID
 */
function getUUID() {
  try {
    return localStorage.getItem('mini_card_battle_uuid') || '';
  } catch {
    return '';
  }
}

/**
 * エラーをサーバーに送信する。
 *
 * @param {string} type - エラー種別 ('react_boundary' | 'unhandled_error' | 'unhandled_rejection')
 * @param {string} message - エラーメッセージ
 * @param {string} [stack=''] - スタックトレース
 * @param {Object} [extra={}] - 追加情報（screen等を上書きしたい場合）
 */
export function reportError(type, message, stack = '', extra = {}) {
  try {
    // レートリミットチェック
    if (reportCount >= MAX_REPORTS_PER_SESSION) return;

    // 重複抑制: 同一メッセージを短期間に何度も送信しない
    const msgKey = `${type}:${message}`;
    const lastSent = recentMessages.get(msgKey);
    const now = Date.now();
    if (lastSent && now - lastSent < DEDUP_INTERVAL_MS) return;

    // 送信カウント・重複記録を更新
    reportCount++;
    recentMessages.set(msgKey, now);

    // 古い重複記録をクリーンアップ（メモリリーク防止）
    if (recentMessages.size > 50) {
      for (const [key, time] of recentMessages) {
        if (now - time > DEDUP_INTERVAL_MS) recentMessages.delete(key);
      }
    }

    const payload = {
      type,
      message: String(message).substring(0, 2000),
      stack: String(stack || '').substring(0, 3000),
      uuid: getUUID(),
      screen: extra.screen || getCurrentScreen(),
      gameVersion: GAME_VERSION || '',
      userAgent: navigator.userAgent || '',
    };

    // fire-and-forget: 送信失敗してもゲームに影響を与えない
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    fetch(ERROR_LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true, // 画面遷移やアンマウント後も送信を完了させる
      signal: controller.signal,
    })
      .then(() => clearTimeout(timeoutId))
      .catch(() => clearTimeout(timeoutId));
  } catch {
    // エラーレポーター自体のエラーは完全に無視する（二次障害防止）
  }
}

/**
 * index.html のインラインスクリプトから呼び出すための軽量送信関数。
 * モジュール読み込み完了後に window に公開される。
 */
export function installGlobalErrorReporter() {
  window.__reportError = reportError;
}

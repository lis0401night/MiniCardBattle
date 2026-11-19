import { stopAllBGM } from '../utils/gameUtils.js';
import { COMMON_POINTS_KEY } from '../utils/constants/config.js';

// ==========================================
// UI Modal Logic Bridge (Confirm, Alert, Error)
// Routes calls from legacy JS into GlobalModals.jsx
// ==========================================

export let showConfirmModalHook = null;
/**
 * 確認ダイアログ表示フックを登録する（GlobalModals.jsx から登録される）
 * @param {Function|null} h - 確認ダイアログを表示する関数
 * @returns {void}
 */
export function setShowConfirmModalHook(h) {
  showConfirmModalHook = h;
}
/**
 * 確認（またはアラート）ダイアログを表示する
 * @param {string} message - ダイアログ本文メッセージ
 * @param {Function} [onConfirm] - 確定ボタン押下時のコールバック
 * @param {Function|null} [onCancel=null] - キャンセルボタン押下時のコールバック
 * @param {boolean} [isAlert=false] - アラートモード（単一ボタン表示）とするか
 * @param {Object} [options={}] - 表示オプション
 * @param {string} [options.title] - カスタム見出し文字列（省略時は「確認」または「お知らせ」）
 * @param {string} [options.confirmLabel] - 確定ボタンのラベル文字列（省略時は「OK」または「閉じる」）
 * @param {boolean} [options.isDanger=false] - 破壊的・危険操作向けの赤色警告スタイルを適用するか
 * @returns {void}
 */
export function showConfirmModal(
  message,
  onConfirm,
  onCancel = null,
  isAlert = false,
  options = {}
) {
  // 【デバッグ用】更新またはアップデート関連の確認の際、現在の localStorage データを全送信する
  if (
    message &&
    (message.includes('更新') ||
      message.includes('アップデート') ||
      message.includes('バージョン') ||
      message.includes('新'))
  ) {
    try {
      const backup = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('mini_card_battle_')) {
          backup[k] = localStorage.getItem(k);
        }
      }
      fetch('api/log_error.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pwa_update_debug_localStorage',
          message:
            'User confirmed PWA update (React modal). Current localStorage snapshot.',
          stack: JSON.stringify(backup),
          uuid: localStorage.getItem('mini_card_battle_uuid') || '',
          screen: 'pwa-update-react',
          userAgent: navigator.userAgent || '',
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {
      console.warn('Failed to send debug backup:', e);
    }
  }

  if (showConfirmModalHook)
    return showConfirmModalHook(message, onConfirm, onCancel, isAlert, options);
  console.warn('GlobalModals not mounted: using window.confirm/alert fallback');
  if (isAlert) {
    window.alert(message);
    if (onConfirm) onConfirm();
  } else {
    const result = window.confirm(message);
    if (result) {
      if (onConfirm) onConfirm();
    } else {
      if (onCancel) onCancel();
    }
  }
}

export let closeConfirmModalHook = null;
/**
 * 確認ダイアログを閉じるフックを登録する（GlobalModals.jsx から登録される）
 * @param {Function|null} h - 確認ダイアログを閉じる関数
 * @returns {void}
 */
export function setCloseConfirmModalHook(h) {
  closeConfirmModalHook = h;
}
/**
 * 表示中の確認ダイアログをコールバックを呼ばずに閉じる。
 * オンライン対戦の制限時間切れで、呼び出し側が既定の回答で処理を進める場合に使用する。
 * @returns {void}
 */
export function closeConfirmModal() {
  if (closeConfirmModalHook) closeConfirmModalHook();
}

/**
 * GlobalModals 未マウント時の window.alert フォールバック共通処理
 * window.alert はメインスレッドを同期ブロックするため、事前にBGMを停止する
 * @param {string} message - アラート表示するメッセージ
 * @returns {void}
 */
function alertFallback(message) {
  console.warn('GlobalModals not mounted: using window.alert fallback');
  if (typeof stopAllBGM === 'function') stopAllBGM();
  window.alert(message);
}

export let showAlertModalHook = null;
export function setShowAlertModalHook(h) {
  showAlertModalHook = h;
}
export function showAlertModal(message, onClose = null) {
  if (showAlertModalHook) return showAlertModalHook(message, onClose);
  alertFallback(message);
  if (onClose) onClose();
}

export let showErrorModalHook = null;
export function setShowErrorModalHook(h) {
  showErrorModalHook = h;
}
/**
 * エラー表示モーダルを呼び出す（フック未登録時はwindow.alertでフォールバック）
 * @param {string} message - 表示するエラーメッセージ
 * @returns {void}
 */
export function showErrorModal(message) {
  if (showErrorModalHook) return showErrorModalHook(message);
  alertFallback(message);
}

export let showPointAcquisitionModalHook = null;
export function setShowPointAcquisitionModalHook(h) {
  showPointAcquisitionModalHook = h;
}
export function showPointAcquisitionModal(data) {
  if (showPointAcquisitionModalHook) return showPointAcquisitionModalHook(data);
  console.warn(
    'GlobalModals not mounted: showPointAcquisitionModal fallback missing'
  );
}

/**
 * 共通ポイント獲得ダイアログを表示する
 *
 * @param {number} points - 獲得した共通ポイント数
 * @param {Object} [options={}] - ダイアログ表示オプション
 * @param {string} [options.title='共通ポイント獲得！'] - ダイアログタイトル
 * @param {string} [options.message] - 説明文
 * @param {number} [options.totalPoints] - 現在の所持ポイント数
 * @param {Function} [options.onClose] - ダイアログ終了時コールバック
 * @returns {void}
 */
export function showCommonPointsAcquisitionModal(points, options = {}) {
  const curPoints =
    options.totalPoints !== undefined
      ? options.totalPoints
      : parseInt(localStorage.getItem(COMMON_POINTS_KEY), 10) || 0;

  showPointAcquisitionModal({
    title: options.title || '共通ポイント獲得！',
    message:
      options.message ||
      `共通ポイントを ${points} Pt 獲得しました！\n共通交換所で様々なアイテムと交換できます。`,
    points: points,
    totalPoints: curPoints,
    totalLabel: '現在の所持',
    iconEmoji: '💎',
    color: '#38bdf8',
    darkColor: '#0284c7',
    onClose: options.onClose,
  });
}

/**
 * バトルパス進行中設定および未同期レート同期結果ダイアログを表示する
 *
 * 未反映のクイックマッチレートから同期されたポイントがある場合（syncedPoints > 0）は
 * 同期ポイント数を強調したダイアログを表示し、0 Pt の場合は進行中設定の説明ダイアログを表示する。
 *
 * @param {string} passName - 設定したバトルパス表示名（例: 'バトルパス S1'）
 * @param {number} syncedPoints - 今回レートから同期されたポイント数
 * @param {number} currentPassPoints - 同期後の当該バトルパスの現在ポイント数
 * @param {Function|null} [onClose=null] - ダイアログ閉鎖時コールバック
 * @returns {void}
 */
export function showBattlePassSyncModal(
  passName,
  syncedPoints,
  currentPassPoints,
  onClose = null
) {
  if (syncedPoints > 0) {
    showPointAcquisitionModal({
      title: 'バトルパス レート同期！',
      message: `【${passName}】を進行中に設定しました。\nクイックマッチレートから ${syncedPoints} Pt が同期されました！`,
      points: syncedPoints,
      totalPoints: currentPassPoints,
      totalLabel: `${passName} 現在のポイント`,
      iconEmoji: '🎟️',
      color: '#f59e0b',
      darkColor: '#d97706',
      onClose,
    });
  } else {
    showAlertModal(
      `【${passName}】を進行中に設定しました！\n今後のクイックマッチ勝利ポイントがこのバトルパスに同期・加算されます。`,
      onClose
    );
  }
}

export let showProfileModalHook = null;
export function setShowProfileModalHook(h) {
  showProfileModalHook = h;
}
export function showProfileModal() {
  if (showProfileModalHook) return showProfileModalHook();
  console.warn('GlobalModals not mounted: showProfileModal fallback missing');
}

import { stopAllBGM } from '../utils/gameUtils.js';

// ==========================================
// UI Modal Logic Bridge (Confirm, Alert, Error)
// Routes calls from legacy JS into GlobalModals.jsx
// ==========================================

export let showConfirmModalHook = null;
export function setShowConfirmModalHook(h) {
  showConfirmModalHook = h;
}
export function showConfirmModal(
  message,
  onConfirm,
  onCancel = null,
  isAlert = false
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
    return showConfirmModalHook(message, onConfirm, onCancel, isAlert);
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

export let showAlertModalHook = null;
export function setShowAlertModalHook(h) {
  showAlertModalHook = h;
}
export function showAlertModal(message, onClose = null) {
  if (showAlertModalHook) return showAlertModalHook(message, onClose);
  console.warn('GlobalModals not mounted: using window.alert fallback');
  window.alert(message);
  if (onClose) onClose();
}

export let showErrorModalHook = null;
export function setShowErrorModalHook(h) {
  showErrorModalHook = h;
}
export function showErrorModal(message) {
  if (showErrorModalHook) return showErrorModalHook(message);
  console.warn('GlobalModals not mounted: using window.alert fallback');
  window.alert(message);
  if (typeof stopAllBGM === 'function') stopAllBGM();
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

export let showProfileModalHook = null;
export function setShowProfileModalHook(h) {
  showProfileModalHook = h;
}
export function showProfileModal() {
  if (showProfileModalHook) return showProfileModalHook();
  console.warn('GlobalModals not mounted: showProfileModal fallback missing');
}

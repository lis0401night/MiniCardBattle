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
  if (showConfirmModalHook)
    return showConfirmModalHook(message, onConfirm, onCancel, isAlert);
  console.warn('GlobalModals not mounted: showConfirmModal fallback missing');
}

export let showAlertModalHook = null;
export function setShowAlertModalHook(h) {
  showAlertModalHook = h;
}
export function showAlertModal(message, onClose = null) {
  if (showAlertModalHook) return showAlertModalHook(message, onClose);
  console.warn('GlobalModals not mounted: showAlertModal fallback missing');
}

export let showErrorModalHook = null;
export function setShowErrorModalHook(h) {
  showErrorModalHook = h;
}
export function showErrorModal(message) {
  if (showErrorModalHook) return showErrorModalHook(message);
  console.warn('GlobalModals not mounted: showErrorModal fallback missing');
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

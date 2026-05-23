/**
 * Mini Card Battle - Playmat UI Logic Bridge
 * Routes calls from legacy JS into GlobalModals.jsx
 */

export function showPlaymatModal() {
  if (typeof window.showPlaymatSelectionModalState === 'function') {
    window.showPlaymatSelectionModalState();
  } else {
    console.warn('GlobalModals not mounted: showPlaymatModal fallback missing');
  }
}

export function closePlaymatModal() {
  if (typeof window.closePlaymatSelectionModalState === 'function') {
    window.closePlaymatSelectionModalState();
  }
}
window.closePlaymatModal = closePlaymatModal;

export function renderPlaymatList() {
  // Legacy DOM logic removed. Handled by React state now.
}

export function selectPlaymat(id) {
  // Handled directly inside React component GlobalModals.jsx
  console.warn('selectPlaymat called from legacy code');
}

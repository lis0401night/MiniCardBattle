// ==========================================
// UI Modal Logic (Confirm, Alert, SkillConfirm)
// ==========================================

function showConfirmModal(message, onConfirm, onCancel = null, isAlert = false) {
    let modal = document.getElementById('modal-confirm');
    if (!modal) return;

    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    titleEl.textContent = isAlert ? "お知らせ" : "確認";
    msgEl.textContent = message;
    cancelBtn.style.display = isAlert ? "none" : "block";
    okBtn.textContent = isAlert ? "閉じる" : "OK";

    playSound(SOUNDS.seClick);
    modal.style.display = 'flex';

    const box = modal.querySelector('.skill-modal-box');
    if (box) {
        box.classList.remove('modal-pop-animation');
        void box.offsetWidth;
        box.classList.add('modal-pop-animation');
    }

    okBtn.onclick = () => {
        playSound(SOUNDS.seClick);
        modal.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        playSound(SOUNDS.seClick);
        modal.style.display = 'none';
        if (onCancel) onCancel();
    };
}

function showAlertModal(message, onClose = null) {
    showConfirmModal(message, onClose, null, true);
}

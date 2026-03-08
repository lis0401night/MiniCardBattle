// ==========================================
// ユーティリティ関数
// ==========================================

function createDamagePopup(targetEl, text, color = '#ef4444') {
    if (!targetEl) return;
    const popup = document.createElement('div');
    popup.className = 'damage-popup'; popup.innerText = text; popup.style.color = color;
    const rect = targetEl.getBoundingClientRect();
    popup.style.left = `${rect.left + rect.width / 2 - 10}px`; popup.style.top = `${rect.top}px`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1000);
}

function getDialogue(speakerConfig, targetConfig, type) {
    const dict = speakerConfig.dialogue[type];
    if (targetConfig && dict[targetConfig.id]) return dict[targetConfig.id];
    return dict.default;
}

function playSound(audio) { if (audio) { audio.currentTime = 0; audio.play().catch(() => { }); } }
function stopSound(audio) { if (audio && audio.pause) { audio.pause(); audio.currentTime = 0; } }
const sleep = ms => new Promise(res => setTimeout(res, ms));

// 画面遷移
function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

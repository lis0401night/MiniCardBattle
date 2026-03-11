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

function playSound(audio) { if (audio) { audio.currentTime = 0; audio.volume = gameVolume; audio.play().catch(() => { }); } }
function stopSound(audio) { if (audio && audio.pause) { audio.pause(); audio.currentTime = 0; } }
function stopAllBGM() {
    Object.keys(SOUNDS).forEach(key => {
        if (key.startsWith('bgm')) {
            stopSound(SOUNDS[key]);
        }
    });
}
const sleep = ms => new Promise(res => setTimeout(res, ms));

// 画面遷移
function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// 判定補助: 特定のスキルを所持しているか
function hasSkill(c, skillId) {
    if (!c) return false;
    // 拘束（スタン）状態は「防御（攻撃不可）」として扱う
    if (skillId === 'defender' && c.stunTurns > 0) return true;
    if (c.skill === skillId) return true;
    if (Array.isArray(c.skills)) {
        return c.skills.some(s => s.id === skillId);
    }
    return false;
}

// 判定補助: スキルの数値を取得
function getSkillValue(c, skillId) {
    if (!c) return 0;
    if (c.skill === skillId) return c.skillValue || 0;
    if (Array.isArray(c.skills)) {
        const s = c.skills.find(s => s.id === skillId);
        return s ? s.value || 0 : 0;
    }
    return 0;
}

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
    if (!speakerConfig.dialogue) return "...";
    const dict = speakerConfig.dialogue[type];
    if (!dict) return "...";

    // 以前のバージョンなど、辞書ではなく直接文字列が格納されている場合への対応
    if (typeof dict === 'string') return dict;

    // 通常のオブジェクト形式
    if (targetConfig && dict[targetConfig.id]) return dict[targetConfig.id];
    return dict.default || "...";
}

async function playSound(audioOrKey) {
    if (!audioOrKey) return;

    // 初回再生時に音声をアンロック（モバイル Safari 対策）
    if (typeof unlockAudio === 'function' && !isAudioUnlocked) {
        unlockAudio();
    }

    const baseVol = (typeof gameVolume !== 'undefined') ? gameVolume : 0.3;

    // 1. Web Audio (SE) の処理
    const seKey = (typeof audioOrKey === 'string') ? audioOrKey : null;
    if (seKey && audioCtx && seBuffers[seKey]) {
        const buffer = seBuffers[seKey];
        const source = audioCtx.createBufferSource();
        const gainNode = audioCtx.createGain();
        source.buffer = buffer;
        gainNode.gain.value = baseVol;
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        source.start(0);
        return;
    }

    // 2. HTML5 Audio (BGM または Web Audio失敗時のフォールバック)
    const audio = (typeof audioOrKey === 'string') ? SOUNDS[audioOrKey] : audioOrKey;
    if (audio instanceof Audio) {
        try {
            audio.volume = baseVol;
            // BGM (ループ音) の処理
            if (audio.loop || (audio.src && audio.src.includes('bgm'))) {
                audio.currentTime = 0;
                const p = audio.play();
                if (p !== undefined) p.catch(() => { });
            } else {
                // SEとしてAudio要素を鳴らす場合（予備ロジック）
                if (audio.paused || audio.ended) {
                    audio.currentTime = 0;
                    const p = audio.play();
                    if (p !== undefined) p.catch(() => { });
                } else {
                    const clone = audio.cloneNode();
                    clone.volume = baseVol;
                    const p = clone.play();
                    if (p !== undefined) p.catch(() => { });
                }
            }
        } catch (e) {
            console.warn("HTML5 Audio playback failed:", e);
        }
    }
}
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
let isTransitioning = false;
function switchScreen(id) {
    if (isTransitioning) return; // 遷移中は入力を無視
    isTransitioning = true;

    // モバイル等でのボタン選択状態（Sticky Focus）を解除
    if (document.activeElement && document.activeElement.tagName !== 'BODY') {
        document.activeElement.blur();
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    // 300ms間は次の入力を受け付けない（ゴーストクリック対策）
    setTimeout(() => {
        isTransitioning = false;
    }, 150);
}

// ゴーストクリック（pointerdown後の遅延clickイベント）をグローバルで無効化
window.addEventListener('click', (e) => {
    if (isTransitioning) {
        e.preventDefault();
        e.stopPropagation();
    }
}, true); // キャプチャフェーズで阻止

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

const VALID_PREMIUM_GIFS = ['assassin', 'cyberdragon', 'dragon', 'empress', 'oldgod', 'wolf'];

// カードの画像URLを取得（プレミアム設定を考慮）
function getCardImgUrl(card) {
    if (!card) return 'assets/card_none_backup.jpg';
    
    let lookupId = card.baseId;
    if (!lookupId) {
        const cardId = card.id || '';
        const baseIdExtracted = cardId.split('_').pop();
        lookupId = (CARD_MASTER.find(m => m.id === baseIdExtracted) || CARD_MASTER.find(m => m.id === cardId))?.id || baseIdExtracted;
    }

    // isPremiumフラグが明示的に設定されている場合はそれを優先
    if (card.isPremium === true && VALID_PREMIUM_GIFS.includes(lookupId)) {
        return `assets/card_${lookupId}_premium.gif`;
    } else if (card.isPremium === false) {
        return card.imgUrl || `assets/card_${lookupId}.jpg`;
    }

    // フラグがない場合は従来のグローバル設定を参照
    if (premiumCards.includes(lookupId) && VALID_PREMIUM_GIFS.includes(lookupId)) {
        return `assets/card_${lookupId}_premium.gif`;
    }
    return card.imgUrl || `assets/card_${lookupId}.jpg`;
}

// プレミアムカード設定の切り替え
function togglePremiumCard(cardId) {
    const index = premiumCards.indexOf(cardId);
    if (index === -1) {
        premiumCards.push(cardId);
    } else {
        premiumCards.splice(index, 1);
    }
    localStorage.setItem('mini_card_battle_premium_cards', JSON.stringify(premiumCards));
}

// プレイヤーの一意なIDを取得または生成
function getOrCreateUUID() {
    let uuid = localStorage.getItem('mini_card_battle_uuid');
    if (!uuid) {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            uuid = crypto.randomUUID();
        } else {
            // 代替の簡易UUID生成
            uuid = 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function (c) {
                const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        localStorage.setItem('mini_card_battle_uuid', uuid);
    }
    return uuid;
}

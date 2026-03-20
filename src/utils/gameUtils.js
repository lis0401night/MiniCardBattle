import { CARD_MASTER } from './constants/cards.js';
import { audioCtx, seBuffers, SOUNDS, isAudioUnlocked, unlockAudio } from './sounds.js';
import { GameState } from '../hooks/gameState.js';
import { SKILLS, ACTIVE_SKILLS } from './constants/skills.js';

// ==========================================
// ユーティリティ関数
// ==========================================

export let addDamagePopupHook = null;
export function setAddDamagePopupHook(h) { addDamagePopupHook = h; }

export function createDamagePopup(targetEl, text, color = '#ef4444') {
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - 10;
    const y = rect.top;

    if (addDamagePopupHook) {
        addDamagePopupHook(x, y, text, color);
        return;
    }

    // React非マウント時のフォールバック
    const popup = document.createElement('div');
    popup.className = 'damage-popup'; popup.innerText = text; popup.style.color = color;
    popup.style.left = `${x}px`; popup.style.top = `${y}px`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1000);
}

export function getDialogue(speakerConfig, targetConfig, type) {
    if (!speakerConfig.dialogue) return "...";
    const dict = speakerConfig.dialogue[type];
    if (!dict) return "...";

    // 以前のバージョンなど、辞書ではなく直接文字列が格納されている場合への対応
    if (typeof dict === 'string') return dict;

    // 通常のオブジェクト形式
    if (targetConfig && dict[targetConfig.id]) return dict[targetConfig.id];
    return dict.default || "...";
}

export async function playSound(audioOrKey) {
    if (!audioOrKey) return;

    // 初回再生時に音声をアンロック（モバイル Safari 対策）
    if (typeof unlockAudio === 'function' && !isAudioUnlocked) {
        unlockAudio();
    }

    const baseVol = (typeof GameState.gameVolume !== 'undefined') ? GameState.gameVolume : 0.3;

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
export function stopSound(audio) { if (audio && audio.pause) { audio.pause(); audio.currentTime = 0; } }
export function stopAllBGM() {
    Object.keys(SOUNDS).forEach(key => {
        if (key.startsWith('bgm')) {
            stopSound(SOUNDS[key]);
        }
    });
}
export const sleep = ms => new Promise(res => setTimeout(res, ms));

// 画面遷移
export let isTransitioning = false;
let switchScreenHook = null;
export function setSwitchScreenHook(hook) { switchScreenHook = hook; }

export function switchScreen(id) {
    if (switchScreenHook) {
        switchScreenHook(id);
        return;
    }
    executeSwitchScreen(id);
}

export function executeSwitchScreen(id) {
    if (isTransitioning) return; // 遷移中は入力を無視
    isTransitioning = true;

    // モバイル等でのボタン選択状態（Sticky Focus）を解除
    if (document.activeElement && document.activeElement.tagName !== 'BODY') {
        document.activeElement.blur();
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(id);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }

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
export function hasSkill(c, skillId) {
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
export function getSkillValue(c, skillId) {
    if (!c) return 0;
    if (c.skill === skillId) return c.skillValue || 0;
    if (Array.isArray(c.skills)) {
        const s = c.skills.find(s => s.id === skillId);
        return s ? s.value || 0 : 0;
    }
    return 0;
}

export const VALID_PREMIUM_GIFS = ['assassin', 'cleric', 'clone', 'cyberdragon', 'dinosaur', 'diviner', 'dragon', 'empress', 'golem', 'oldgod', 'sniper', 'wolf'];

// カードの画像URLを取得（プレミアム設定を考慮）// IDからの自動解決
export function getCardImgUrl(card) {
    if (!card) return 'assets/cards/card_default.jpg';
    if (card.imgUrl) return card.imgUrl; // トークン等で直接焼き付けられたURLがある場合は最優先
    
    // 特定のトークンの例外処理（旧imgUrl設定の復元）
    if (card.id === 'token_soldier') return 'assets/cards/card_soldier.jpg';
    if (card.id === 'token_ignis' || card.baseId === 'token_ignis') return 'assets/characters/char_dragon.png';
    if (card.id === 'token_satan' || card.baseId === 'token_satan') return 'assets/characters/char_satan.png';
    
    let lookupId = card.baseId || card.id;
    // トークン等は '_' 以降（タイムスタンプ等）を除去したベースIDを使用する
    if (lookupId.includes('_') && !lookupId.startsWith('token_') && !lookupId.startsWith('cl_')) {
        lookupId = lookupId.split('_')[0];
    } else if (lookupId.startsWith('token_')) {
        // token_xxx_123 などの場合はベースの token_xxx を使用
        const parts = lookupId.split('_');
        if (parts.length >= 3) lookupId = parts[0] + '_' + parts[1];
    } else if (lookupId.startsWith('cl_')) {
        lookupId = 'token_clone';
    }

    // isPremiumフラグが明示的に設定されている場合はそれを優先
    if (card.isPremium === true && VALID_PREMIUM_GIFS.includes(lookupId)) {
        return `assets/cards/card_${lookupId}_premium.gif`;
    } else if (card.isPremium === false) {
        return `assets/cards/card_${lookupId}.jpg`;
    }

    // フラグがない場合は従来のグローバル設定を参照（ただし敵のカードと明示されている場合は除く）
    if (card.owner !== 'red' && GameState.premiumCards.includes(lookupId) && VALID_PREMIUM_GIFS.includes(lookupId)) {
        return `assets/cards/card_${lookupId}_premium.gif`;
    }
    return `assets/cards/card_${lookupId}.jpg`;
}

// プレミアムカード設定の切り替え
export function togglePremiumCard(cardId) {
    const index = GameState.premiumCards.indexOf(cardId);
    if (index === -1) {
        GameState.premiumCards.push(cardId);
    } else {
        GameState.premiumCards.splice(index, 1);
    }
    localStorage.setItem('mini_card_battle_premium_cards', JSON.stringify(GameState.premiumCards));
}

// プレイヤーの一意なIDを取得または生成
export function getOrCreateUUID() {
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

export function renderSkillTag(card, isBoard = false) {
    if (!card) return '';
    let skillCandidates = [];

    // 1. 表示対象のスキルを全てリストアップ
    const addCandidate = (id, val) => {
        const s = SKILLS[id];
        if (s && id !== 'none' && s.name !== '通常') {
            const showBadge = !isBoard || !card.skillTriggered || !ACTIVE_SKILLS.includes(id);
            if (showBadge) {
                skillCandidates.push({ id, name: s.name, icon: s.icon, value: val || '' });
            }
        }
    };

    if (card.skill) addCandidate(card.skill, card.skillValue);
    if (Array.isArray(card.skills)) {
        card.skills.forEach(sk => addCandidate(sk.id, sk.value));
    }

    // 2. IDと値が一致するものを集計
    let grouped = [];
    skillCandidates.forEach(c => {
        const existing = grouped.find(g => g.id === c.id && g.value === c.value);
        if (existing) {
            existing.count++;
        } else {
            grouped.push({ ...c, count: 1 });
        }
    });

    // 3. バッジの生成
    let badges = [];
    grouped.forEach(g => {
        const countSuffix = g.count > 1 ? ` * ${g.count}` : '';
        badges.push(`<div class="card-skill">${g.icon} ${g.name}${g.value}${countSuffix}</div>`);
    });

    // 拘束（スタン）状態による「防御」バッジ（集約対象外）
    if (card.stunTurns > 0) {
        const def = SKILLS['defender'];
        badges.push(`<div class="card-skill" style="border-color: #ef4444; color: #fca5a5;">${def.icon} 防御${card.stunTurns}</div>`);
    }

    if (badges.length === 0) return '';
    return `<div class="card-skill-container">${badges.join('')}</div>`;
}
window.renderSkillTag = renderSkillTag;

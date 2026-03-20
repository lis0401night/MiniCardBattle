import { ACHIEVEMENT_MASTER, achievementData, claimAchievementReward, saveAchievements, checkCollectionAchievements } from '../utils/constants/achievements.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { PLAYMAT_MASTER } from '../utils/constants/playmats.js';
import { SKILLS } from '../utils/constants/skills.js';
import { playSound, stopAllBGM, isTransitioning, switchScreen, getCardImgUrl, togglePremiumCard, renderSkillTag } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { loadDeck, saveDeck, renderDeckEdit } from './deck.js';
import { GameState } from './gameState.js';
import { incrementRulesClickCount, resetRulesClickCount } from './uiMainCore.js';
import { showAlertModal } from './uiModals.js';

// ==========================================
// UI Gallery Logic (Card List & Previews)
// ==========================================

export function showGallery() {
    playSound(SOUNDS.seClick);
    if (SOUNDS.bgmGallery.paused) {
        stopAllBGM();
        playSound(SOUNDS.bgmGallery);
    }
    switchScreen('screen-gallery-menu');
}

export function showCardList() {
    playSound(SOUNDS.seClick);
    if (typeof loadDeck === 'function') {
        loadDeck();
    }
    renderCardList();
    switchScreen('screen-card-list');
}

export let renderCardListHook = null;
export function setRenderCardListHook(h) { renderCardListHook = h; }
export function renderCardList() {
    if (renderCardListHook) return renderCardListHook();
    executeRenderCardList();
}
export function executeRenderCardList() {
    // Legacy DOM logic removed. Rendered natively in CardListScreen.jsx
}
// --- 実績UI ---

export function showAchievements() {
    if (typeof isTransitioning !== 'undefined' && isTransitioning) return;
    playSound(SOUNDS.seClick);
    
    // 最新の所持カード情報を反映
    checkCollectionAchievements();
    saveAchievements();
    
    renderAchievementsList();
    renderAchievementsStats();
    switchScreen('screen-achievements');
}

export function toggleAchievementSection(sectionId) {
    // Legacy DOM logic removed. Rendered natively in AchievementsScreen.jsx
}

export let renderAchievementsListHook = null;
export function setRenderAchievementsListHook(h) { renderAchievementsListHook = h; }
export function renderAchievementsList() {
    if (renderAchievementsListHook) return renderAchievementsListHook();
    executeRenderAchievementsList();
}
export function executeRenderAchievementsList() {
    // Legacy DOM logic removed. Rendered natively in AchievementsScreen.jsx
}

export function handleClaimAchievement(id) {
    if (typeof isTransitioning !== 'undefined' && isTransitioning) return;
    const result = claimAchievementReward(id);
    if (result && result.success) {
        if (result.rewardType === 'playmat') {
            showPlaymatAcquisitionModal(result.rewardName, result.rewardValue);
        } else if (result.rewardType === 'card') {
            showCardAcquisitionModal(result.rewardValue);
        } else if (result.rewardType === 'premium') {
            showPremiumAcquisitionModal(result.rewardValue);
        }
    }
    renderAchievementsList();
}

let showCardAcquisitionModalHook = null;
export function setShowCardAcquisitionModalHook(hook) { showCardAcquisitionModalHook = hook; }
export function showCardAcquisitionModal(cardId) {
    if (showCardAcquisitionModalHook) return showCardAcquisitionModalHook(cardId);
    executeCardAcquisitionModal(cardId);
}
export function executeCardAcquisitionModal(cardId) {
    // Legacy DOM logic removed. Modals are rendered natively in GlobalModals.jsx via the React hook.
}

let showPremiumAcquisitionModalHook = null;
export function setShowPremiumAcquisitionModalHook(hook) { showPremiumAcquisitionModalHook = hook; }
export function showPremiumAcquisitionModal(cardId) {
    if (showPremiumAcquisitionModalHook) return showPremiumAcquisitionModalHook(cardId);
    executePremiumAcquisitionModal(cardId);
}
export function executePremiumAcquisitionModal(cardId) {
    // Legacy DOM logic removed. Modals are rendered natively in GlobalModals.jsx via the React hook.
}

let showPlaymatAcquisitionModalHook = null;
export function setShowPlaymatAcquisitionModalHook(hook) { showPlaymatAcquisitionModalHook = hook; }
export function showPlaymatAcquisitionModal(name, id) {
    if (showPlaymatAcquisitionModalHook) return showPlaymatAcquisitionModalHook(name, id);
}

export function executePlaymatAcquisitionModal(name, id) {
    // Legacy DOM logic removed. Modals are rendered natively in GlobalModals.jsx via the React hook.
}

export let renderAchievementsStatsHook = null;
export function setRenderAchievementsStatsHook(h) { renderAchievementsStatsHook = h; }
export function renderAchievementsStats() {
    if (renderAchievementsStatsHook) return renderAchievementsStatsHook();
    executeRenderAchievementsStats();
}
export function executeRenderAchievementsStats() {
    // Legacy DOM logic removed. Rendered natively in AchievementsScreen.jsx.
}

export function debugUnlockCards() {
    const count = incrementRulesClickCount();
    if (count >= 10) {
        resetRulesClickCount();
        CARD_MASTER.forEach(card => {
            if (!card.isToken) {
                GameState.playerInventory[card.id] = 4;
            }
        });

        // プレミアムカード(empress, assassin, cyberdragon, dragon, oldgod, wolf)の解放
        const premiumTargets = ['empress', 'assassin', 'cyberdragon', 'dragon', 'oldgod', 'wolf'];
        premiumTargets.forEach(id => {
            if (!GameState.unlockedPremiumCards.includes(id)) {
                GameState.unlockedPremiumCards.push(id);
            }
        });

        saveDeck();
        playSound(SOUNDS.seSkill);
        showAlertModal("デバッグモード：全カードを4枚所持状態にしました！");
    }
}

export let achievementsClickCount = 0;
export function debugUnlockAchievements() {
    achievementsClickCount++;
    if (achievementsClickCount >= 10) {
        achievementsClickCount = 0;
        ACHIEVEMENT_MASTER.forEach(ach => {
            const data = achievementData.achievements[ach.id] || { progress: 0, isUnlocked: false };
            data.isUnlocked = true;
            if (ach.type === 'story_clear' || ach.type === 'story_clear_hard') {
                data.progress = 1;
            } else {
                data.progress = ach.targetValue || 100;
            }
            achievementData.achievements[ach.id] = data;
        });
        saveAchievements();
        renderAchievementsList();
        playSound(SOUNDS.seSkill);
        showAlertModal("デバッグモード：すべての実績を解除しました！");
    }
}

export function setupLongPress(element, cardData) {
    let startX = 0;
    let startY = 0;

    const start = (e) => {
        if (e.type === 'touchstart') {
            e.stopPropagation();
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }

        clearTimeout(GameState.longPressTimer);
        GameState.longPressTimer = setTimeout(() => {
            openCardPreview(cardData);
        }, 500);
    };

    const move = (e) => {
        if (!GameState.longPressTimer) return;
        let currentX = 0;
        let currentY = 0;
        if (e.type === 'touchmove') {
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
        } else {
            currentX = e.clientX;
            currentY = e.clientY;
        }
        const deltaX = Math.abs(currentX - startX);
        const deltaY = Math.abs(currentY - startY);
        if (deltaX > 10 || deltaY > 10) {
            cancel();
        }
    };

    const cancel = () => {
        clearTimeout(GameState.longPressTimer);
        GameState.longPressTimer = null;
    };

    element.addEventListener('mousedown', start);
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('mousemove', move);
    element.addEventListener('touchmove', move, { passive: true });
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
    element.addEventListener('touchend', cancel);
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openCardPreview(cardData);
        return false;
    });
}

export function populateCardPreview(prefix, card) {
    if (!card) return;
    const container = document.getElementById(`${prefix}-card-container`);
    const nameEl = document.getElementById(`${prefix}-card-name`);
    const flavorEl = document.getElementById(`${prefix}-card-flavor`);
    const skillsList = document.getElementById(`${prefix}-skills-list`);

    if (container) {
        container.innerHTML = '';
        const cardImgUrl = getCardImgUrl(card);
        const cardClone = document.createElement('div');
        const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
        cardClone.className = `card blue${rarityClass}`;
        cardClone.style.width = "180px";
        cardClone.style.height = "240px";
        cardClone.innerHTML = `
            <div class="card-bg" style="background-image: url('${cardImgUrl}'); filter: ${card.filter || 'none'};"></div>
            <div class="card-power">${card.currentPower || card.power}</div>
        `;
        // スキルバッジの描画（BaseUI.js の renderSkillTag を再利用）
        if (typeof renderSkillTag === 'function') {
            const skillTagHtml = renderSkillTag(card, false);
            if (skillTagHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = skillTagHtml;
                if (tempDiv.firstChild) {
                    const badges = tempDiv.firstChild;
                    cardClone.appendChild(badges);
                }
            }
        }
        container.appendChild(cardClone);
    }

    if (nameEl) {
        nameEl.innerText = card.name;
        const rarityColors = { 1: '#cd7f32', 2: '#e2e8f0', 3: '#facc15', 4: '#fde047' };
        nameEl.style.color = rarityColors[card.rarity] || '#fff';
    }

    if (skillsList) {
        skillsList.innerHTML = '';
        let skillCandidates = [];

        // 1. 基本スキル
        if (card.skill && card.skill !== 'none' && card.skill !== undefined) {
            skillCandidates.push({ id: card.skill, value: card.skillValue });
        }
        // 2. 複数スキル配列
        if (Array.isArray(card.skills)) {
            card.skills.forEach(sk => {
                skillCandidates.push({ id: sk.id, value: sk.value });
            });
        }

        if (skillCandidates.length > 0) {
            skillCandidates.forEach(sk => {
                const s = SKILLS[sk.id];
                if (s) {
                    const item = document.createElement('div');
                    item.className = 'preview-skill-item';
                    const val = (sk.value === null || sk.value === undefined) ? '' : sk.value;
                    const desc = typeof s.desc === 'function' ? s.desc(sk.value) : s.desc;

                    if (sk.id === 'choice' && Array.isArray(card.choices)) {
                        let subDetailsHtml = '';
                        card.choices.forEach(cho => {
                            const cs = SKILLS[cho.id];
                            if (cs) {
                                const cVal = (cho.value === null || cho.value === undefined) ? '' : cho.value;
                                const cDesc = typeof cs.desc === 'function' ? cs.desc(cho.value) : cs.desc;
                                subDetailsHtml += `
                                    <div style="margin-left: 10px; border-left: 2px solid #475569; padding-left: 10px; margin-top: 8px; margin-bottom: 8px;">
                                        <div class="preview-skill-badge" style="background: rgba(148, 163, 184, 0.2); border-color: #94a3b8; color: #94a3b8; font-size: 0.75rem;">${cs.icon} ${cs.name}${cVal}</div>
                                        <p class="preview-skill-desc" style="font-size: 0.8rem; color: #94a3b8; margin: 4px 0 0 0;">${cDesc}</p>
                                    </div>
                                `;
                            }
                        });

                        item.innerHTML = `
                            <details class="choice-accordion" style="width: 100%;">
                                <summary style="list-style: none; cursor: pointer; outline: none; width: 100%;">
                                    <div class="preview-skill-badge" style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 110px; position: relative; margin: 0 auto;">
                                        <span>${s.icon} ${s.name}${val}</span>
                                        <span class="accordion-icon" style="font-size: 0.8rem; transition: transform 0.2s; position: absolute; right: 8px;">▼</span>
                                    </div>
                                    <p class="preview-skill-desc" style="margin-top: 6px; margin-bottom: 8px; color: #f8fafc; text-align: center;">${desc}</p>
                                </summary>
                                <div class="accordion-content" style="margin-top: 5px;">
                                    ${subDetailsHtml}
                                </div>
                            </details>
                        `;
                    } else {
                        item.innerHTML = `
                            <div class="preview-skill-badge">${s.icon} ${s.name}${val}</div>
                            <p class="preview-skill-desc">${desc}</p>
                        `;
                    }
                    skillsList.appendChild(item);
                }
            });
        } else {
            skillsList.innerHTML = '<p class="preview-skill-desc">能力なし</p>';
        }
    }

    if (flavorEl) {
        if (card.flavor) {
            flavorEl.innerText = card.flavor;
            flavorEl.style.display = 'block';
        } else {
            flavorEl.innerText = '';
            flavorEl.style.display = 'none';
        }
    }

    // プレミアム切替ボタンの表示制御
    const premiumToggleBtn = document.getElementById(`${prefix}-premium-toggle`);
    if (premiumToggleBtn) {
        if (card.owner !== 'red' && GameState.unlockedPremiumCards.includes(card.id)) {
            premiumToggleBtn.style.display = 'block';
            premiumToggleBtn.innerText = GameState.premiumCards.includes(card.id) ? '✨ プレミアムON' : '✨ プレミアムOFF';
            premiumToggleBtn.style.background = GameState.premiumCards.includes(card.id) ? 'linear-gradient(45deg, #d946ef, #9333ea)' : '#475569';
            premiumToggleBtn.onclick = (e) => {
                e.stopPropagation();
                playSound(SOUNDS.seClick);
                togglePremiumCard(card.id);
                populateCardPreview(prefix, card);
                if (typeof renderCardList === 'function' && document.getElementById('screen-card-list') && document.getElementById('screen-card-list').classList.contains('active')) {
                    renderCardList();
                }
                if (typeof renderDeckEdit === 'function' && document.getElementById('screen-deck-edit') && document.getElementById('screen-deck-edit').classList.contains('active')) {
                    renderDeckEdit();
                }
            };
        } else {
            premiumToggleBtn.style.display = 'none';
        }
    }
}

export let openCardPreviewHook = null;
export function setOpenCardPreviewHook(h) { openCardPreviewHook = h; }
export function openCardPreview(card) {
    if (openCardPreviewHook) return openCardPreviewHook(card);
    executeOpenCardPreview(card);
}
export function executeOpenCardPreview(card) {
    const modal = document.getElementById('card-preview-modal');
    if (!modal) {
        console.error("Card preview modal not found!");
        return;
    }
    populateCardPreview('preview', card);
    modal.style.display = 'flex';
    playSound(SOUNDS.seClick);
}

export let closeCardPreviewHook = null;
export function setCloseCardPreviewHook(h) { closeCardPreviewHook = h; }
export function closeCardPreview() {
    if (closeCardPreviewHook) return closeCardPreviewHook();
    executeCloseCardPreview();
}
export function executeCloseCardPreview() {
    const modal = document.getElementById('card-preview-modal');
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
        playSound(SOUNDS.seClick);
    }
}

import {
  ACHIEVEMENT_MASTER,
  achievementData,
  claimAchievementReward,
  saveAchievements,
  checkCollectionAchievements,
} from '../utils/constants/achievements.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  playSound,
  isTransitioning,
  switchScreen,
} from '../utils/gameUtils.js';
import { SOUNDS, AUDIO_INSTANCES } from '../utils/sounds.js';
import { loadDeck, saveDeck } from './deck.js';
import { GameState } from './gameState.js';
import {
  incrementRulesClickCount,
  resetRulesClickCount,
} from './uiMainCore.js';
import { showAlertModal } from './uiModals.js';

// ==========================================
// UI Gallery Logic (Card List & Previews)
// ==========================================

export function showGallery() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmGallery);
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
export function setRenderCardListHook(h) {
  renderCardListHook = h;
}
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
export function setRenderAchievementsListHook(h) {
  renderAchievementsListHook = h;
}
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
    } else if (result.rewardType === 'skin') {
      if (typeof showAlertModal === 'function') {
        showAlertModal(
          `スキン「${result.rewardName}」を獲得しました！\nデッキ編成画面で着せ替えが可能です。`
        );
      }
    }
  }
  renderAchievementsList();
}

let showCardAcquisitionModalHook = null;
export function setShowCardAcquisitionModalHook(hook) {
  showCardAcquisitionModalHook = hook;
}
export function showCardAcquisitionModal(cardId, onClose) {
  if (showCardAcquisitionModalHook)
    return showCardAcquisitionModalHook(cardId, onClose);
  executeCardAcquisitionModal(cardId);
}
export function executeCardAcquisitionModal(cardId) {
  // Legacy DOM logic removed. Modals are rendered natively in GlobalModals.jsx via the React hook.
}

let showPremiumAcquisitionModalHook = null;
export function setShowPremiumAcquisitionModalHook(hook) {
  showPremiumAcquisitionModalHook = hook;
}
export function showPremiumAcquisitionModal(cardId) {
  if (showPremiumAcquisitionModalHook)
    return showPremiumAcquisitionModalHook(cardId);
  executePremiumAcquisitionModal(cardId);
}
export function executePremiumAcquisitionModal(cardId) {
  // Legacy DOM logic removed. Modals are rendered natively in GlobalModals.jsx via the React hook.
}

let showPlaymatAcquisitionModalHook = null;
export function setShowPlaymatAcquisitionModalHook(hook) {
  showPlaymatAcquisitionModalHook = hook;
}
export function showPlaymatAcquisitionModal(name, id) {
  if (showPlaymatAcquisitionModalHook)
    return showPlaymatAcquisitionModalHook(name, id);
}

let showSkinAcquisitionModalHook = null;
export function setShowSkinAcquisitionModalHook(hook) {
  showSkinAcquisitionModalHook = hook;
}
export function showSkinAcquisitionModal(name, id) {
  if (showSkinAcquisitionModalHook)
    return showSkinAcquisitionModalHook(name, id);
}

export function executePlaymatAcquisitionModal(name, id) {
  // Legacy DOM logic removed. Modals are rendered natively in GlobalModals.jsx via the React hook.
}

export let renderAchievementsStatsHook = null;
export function setRenderAchievementsStatsHook(h) {
  renderAchievementsStatsHook = h;
}
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
    CARD_MASTER.forEach((card) => {
      if (!card.isToken) {
        GameState.playerInventory[card.id] = 4;
      }
    });

    // プレミアムカード(empress, assassin, cyberdragon, dragon, oldgod, wolf)の解放
    const premiumTargets = [
      'empress',
      'assassin',
      'cyberdragon',
      'dragon',
      'oldgod',
      'wolf',
    ];
    premiumTargets.forEach((id) => {
      if (!GameState.unlockedPremiumCards.includes(id)) {
        GameState.unlockedPremiumCards.push(id);
      }
    });

    saveDeck();
    playSound(SOUNDS.seSkill);
    showAlertModal('デバッグモード：全カードを4枚所持状態にしました！');
  }
}

export let achievementsClickCount = 0;
export function debugUnlockAchievements() {
  achievementsClickCount++;
  if (achievementsClickCount >= 10) {
    achievementsClickCount = 0;
    ACHIEVEMENT_MASTER.forEach((ach) => {
      const data = achievementData.achievements[ach.id] || {
        progress: 0,
        isUnlocked: false,
      };
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
    showAlertModal('デバッグモード：すべての実績を解除しました！');
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
  // Legacy DOM logic removed. Rendered natively in GlobalModals.jsx via the React hook.
}

export let openCardPreviewHook = null;
export function setOpenCardPreviewHook(h) {
  openCardPreviewHook = h;
}
export function openCardPreview(card) {
  if (openCardPreviewHook) return openCardPreviewHook(card);
  executeOpenCardPreview(card);
}
// プレビューをどこからでも呼べるようグローバルに登録
window.openCardPreview = openCardPreview;
export function executeOpenCardPreview(card) {
  // Legacy DOM logic removed. Rendered natively in GlobalModals.jsx via the React hook.
}

export let closeCardPreviewHook = null;
export function setCloseCardPreviewHook(h) {
  closeCardPreviewHook = h;
}
export function closeCardPreview() {
  if (closeCardPreviewHook) return closeCardPreviewHook();
  executeCloseCardPreview();
}
export function executeCloseCardPreview() {
  // Legacy DOM logic removed. Rendered natively in GlobalModals.jsx via the React hook.
}

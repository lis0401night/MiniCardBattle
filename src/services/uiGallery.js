import {
  ACHIEVEMENT_MASTER,
  achievementData,
  claimAchievementReward,
  saveAchievements,
  checkCollectionAchievements,
} from '../utils/constants/achievements.js';
import { MAX_CARD_COPIES } from '../utils/constants/config.js';
import { CARD_MASTER, PREMIUM_CARD_IDS } from '../utils/constants/cards.js';
import {
  playSound,
  isTransitioning,
  switchScreen,
} from '../utils/gameUtils.js';
import { SOUNDS, AUDIO_INSTANCES } from '../utils/sounds.js';
import { loadDeck, saveDeck } from './deck.js';
import { GameState } from '../state/gameState.js';
import {
  incrementRulesClickCount,
  resetRulesClickCount,
} from './uiMainCore.js';
import { showAlertModal } from './uiModals.js';

const DEBUG_CLICK_THRESHOLD = import.meta.env.DEV ? 10 : Infinity;

// ==========================================
// UI Gallery Logic (Card List & Previews)
// ==========================================

export function showGallery() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmGallery);
  switchScreen('screen-gallery-menu');
}

/**
 * ギャラリーメニュー画面に戻る（サブ画面からの戻り用）
 */
export function showGalleryMenu() {
  playSound(SOUNDS.seClick);
  switchScreen('screen-gallery-menu');
}

/**
 * 用語集画面を表示する
 */
export function showGlossary() {
  playSound(SOUNDS.seClick);
  switchScreen('screen-glossary');
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

export function toggleAchievementSection() {
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
export function executeCardAcquisitionModal() {
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
export function executePremiumAcquisitionModal() {
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

let showIconAcquisitionModalHook = null;
export function setShowIconAcquisitionModalHook(hook) {
  showIconAcquisitionModalHook = hook;
}
export function showIconAcquisitionModal(name, id) {
  if (showIconAcquisitionModalHook)
    return showIconAcquisitionModalHook(name, id);
}

let showCharacterAcquisitionModalHook = null;
export function setShowCharacterAcquisitionModalHook(hook) {
  showCharacterAcquisitionModalHook = hook;
}
export function showCharacterAcquisitionModal(name, id) {
  if (showCharacterAcquisitionModalHook)
    return showCharacterAcquisitionModalHook(name, id);
}

let showStageAcquisitionModalHook = null;
export function setShowStageAcquisitionModalHook(hook) {
  showStageAcquisitionModalHook = hook;
}
export function showStageAcquisitionModal(name, id) {
  if (showStageAcquisitionModalHook)
    return showStageAcquisitionModalHook(name, id);
}

export function executePlaymatAcquisitionModal() {
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
  if (count >= DEBUG_CLICK_THRESHOLD) {
    resetRulesClickCount();
    CARD_MASTER.forEach((card) => {
      if (!card.isToken) {
        GameState.playerInventory[card.id] = MAX_CARD_COPIES;
      }
    });

    // プレミアムカードの解放 (DRY原則を適用し、PREMIUM_CARD_IDS定数を使用)
    PREMIUM_CARD_IDS.forEach((id) => {
      if (!GameState.unlockedPremiumCards.includes(id)) {
        GameState.unlockedPremiumCards.push(id);
      }
    });

    saveDeck();
    playSound(SOUNDS.seSkill);
    showAlertModal(
      `デバッグモード：全カードを${MAX_CARD_COPIES}枚所持状態にしました！`
    );
  }
}

export let achievementsClickCount = 0;
/**
 * デバッグ用：実績およびすべてのキャラクター（ボス・解放制キャラ）を全解放する
 */
export function debugUnlockAchievements() {
  achievementsClickCount++;
  if (achievementsClickCount >= DEBUG_CLICK_THRESHOLD) {
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

    if (achievementData && achievementData.stats) {
      achievementData.stats.voidDefeated = 1;
      achievementData.stats.succubusDefeated = 1;
      achievementData.stats.warlockDefeated = 1;
      achievementData.stats.storyClears =
        achievementData.stats.storyClears || {};
      achievementData.stats.storyClears['knight'] = 1;
    }

    try {
      const allUnlockableCharIds = ['automata', 'valkyria'];
      localStorage.setItem(
        'mini_card_battle_unlocked_characters',
        JSON.stringify(allUnlockableCharIds)
      );
      if (typeof GameState !== 'undefined' && GameState) {
        GameState.unlockedCharacters = [...allUnlockableCharIds];
      }
    } catch (e) {
      console.error(
        'デバッグモード：キャラクター解放中にエラーが発生しました',
        e
      );
    }

    saveAchievements();
    renderAchievementsList();
    playSound(SOUNDS.seSkill);
    showAlertModal(
      'デバッグモード：すべての実績とキャラクターを解除しました！'
    );
  }
}

export function setupLongPress(element, cardData) {
  let startX = 0;
  let startY = 0;
  let localTimer = null; // ローカル変数でタイマーを管理し干渉を防ぐ

  const start = (e) => {
    if (e.type === 'touchstart') {
      e.stopPropagation();
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else {
      startX = e.clientX;
      startY = e.clientY;
    }

    clearTimeout(localTimer);
    localTimer = setTimeout(() => {
      openCardPreview(cardData);
    }, 500);
  };

  const move = (e) => {
    if (!localTimer) return;
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
    clearTimeout(localTimer);
    localTimer = null;
  };

  element.addEventListener('mousedown', start);
  element.addEventListener('touchstart', start, { passive: true });
  element.addEventListener('mousemove', move);
  element.addEventListener('touchmove', move, { passive: true });
  element.addEventListener('mouseup', cancel);
  element.addEventListener('mouseleave', cancel);
  element.addEventListener('touchend', cancel);

  const contextHandler = (e) => {
    e.preventDefault();
    openCardPreview(cardData);
    return false;
  };
  element.addEventListener('contextmenu', contextHandler);

  // アンマウント時・再バインド時用のクリーンアップ関数を返す
  return () => {
    clearTimeout(localTimer);
    element.removeEventListener('mousedown', start);
    element.removeEventListener('touchstart', start);
    element.removeEventListener('mousemove', move);
    element.removeEventListener('touchmove', move);
    element.removeEventListener('mouseup', cancel);
    element.removeEventListener('mouseleave', cancel);
    element.removeEventListener('touchend', cancel);
    element.removeEventListener('contextmenu', contextHandler);
  };
}

export function populateCardPreview() {
  // Legacy DOM logic removed. Rendered natively in GlobalModals.jsx via the React hook.
}

export let openCardPreviewHook = null;
export function setOpenCardPreviewHook(h) {
  openCardPreviewHook = h;
}
export function openCardPreview(card, styleProps = {}) {
  if (openCardPreviewHook) return openCardPreviewHook(card, styleProps);
  executeOpenCardPreview(card);
}
// プレビューをどこからでも呼べるようグローバルに登録
window.openCardPreview = openCardPreview;
export function executeOpenCardPreview() {
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

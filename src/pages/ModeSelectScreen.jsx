import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { showGallery } from '../services/uiGallery.js';
import {
  showBeginnerGuide,
  showOptions,
  showSoloMenu,
  showDeckEditMenu,
  showEventMenu,
  showOnlineMenu,
} from '../services/uiMainCore.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import NewsBanner from '../components/common/NewsBanner.jsx';
import { hasUnclaimedAchievements } from '../utils/constants/achievements.js';

export default function ModeSelectScreen() {
  const images = UI_IMAGES || {};

  return (
    <div id="screen-mode-select" className="screen active">
      <button
        className="btn-circle btn-gear"
        onClick={() => {
          playSound?.(SOUNDS?.seClick);
          showOptions?.();
        }}
      >
        ⚙
      </button>

      <NewsBanner />

      <div className="menu-btn-grid">
        <MenuImageButton
          label="遊び方"
          image={images.MENU_RULES}
          onClick={() => showBeginnerGuide?.()}
        />

        <MenuImageButton
          label="デッキ編成"
          image={images.MENU_DECK}
          onClick={() => showDeckEditMenu?.()}
        />

        <MenuImageButton
          label="ソロモード"
          image={images.MENU_SOLO || images.MENU_STORY}
          onClick={() => showSoloMenu?.()}
        />

        <MenuImageButton
          label="イベント"
          image={images.MENU_EVENT}
          onClick={() => showEventMenu?.()}
        />

        <MenuImageButton
          label="オンライン"
          image={images.MENU_ONLINE}
          onClick={() => showOnlineMenu?.()}
        />

        <MenuImageButton
          label="ギャラリー"
          image={images.MENU_GALLERY}
          onClick={() => showGallery?.()}
          notificationBadge={hasUnclaimedAchievements()}
        />
      </div>
    </div>
  );
}

import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import { showAchievements, showCardList } from '../services/uiGallery.js';
import { goToModeSelect } from '../services/uiMainCore.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { hasUnclaimedAchievements } from '../utils/constants/achievements.js';

export default function GalleryMenuScreen() {
  const images = UI_IMAGES || {};
  const hasUnclaimed = hasUnclaimedAchievements();

  return (
    <ScreenLayout
      id="screen-gallery-menu"
      title="ギャラリー"
      titleColor="#facc15"
      onBackClick={() => goToModeSelect?.()}
      backHasBorder={true}
    >
      <div className="menu-btn-grid">
        <MenuImageButton
          label="カード一覧"
          image={images.GALLERY_CARD_LIST}
          onClick={() => showCardList?.()}
        />
        <MenuImageButton
          label="実績"
          image={images.GALLERY_ACHIEVEMENTS}
          onClick={() => showAchievements?.()}
          notificationBadge={hasUnclaimed}
        />
      </div>
    </ScreenLayout>
  );
}

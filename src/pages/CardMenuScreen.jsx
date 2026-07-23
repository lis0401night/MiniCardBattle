import MenuImageButton from '../components/common/MenuImageButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { showCardList } from '../services/uiGallery.js';
import { goToModeSelect, showDeckEditMenu } from '../services/uiMainCore.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';

export default function CardMenuScreen() {
  const images = UI_IMAGES || {};

  return (
    <ScreenLayout
      id="screen-card-menu"
      title="カード"
      titleColor="#facc15"
      backgroundImage="background_select.webp"
      onBackClick={() => goToModeSelect?.()}
      backHasBorder={true}
    >
      <div className="menu-btn-grid">
        <MenuImageButton
          label="デッキ編成"
          style={{ backgroundColor: '#1e40af' }}
          onClick={() => showDeckEditMenu?.()}
        />
        <MenuImageButton
          label="カード一覧"
          image={images.GALLERY_CARD_LIST}
          onClick={() => showCardList?.()}
        />
      </div>
    </ScreenLayout>
  );
}

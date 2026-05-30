import MenuImageButton from '../components/common/MenuImageButton.jsx';
import BackButton from '../components/BackButton.jsx';
import { showCardList } from '../services/uiGallery.js';
import { goToModeSelect, showDeckEditMenu } from '../services/uiMainCore.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';

export default function CardMenuScreen() {
  const images = UI_IMAGES || {};

  return (
    <div id="screen-card-menu" className="screen active">
      <h2 style={{ color: '#facc15', margin: '20px 0', textAlign: 'center' }}>
        カード
      </h2>
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
      <div
        style={{
          padding: '15px 0 20px 0',
          borderTop: '1px solid #334155',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
        }}
      >
        <BackButton onClick={() => goToModeSelect?.()} style={{ margin: 0 }} />
      </div>
    </div>
  );
}

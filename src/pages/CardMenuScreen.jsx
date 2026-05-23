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
        <div className="menu-img-btn" onClick={() => showDeckEditMenu?.()}>
          <div
            className="menu-img-bg"
            style={{ backgroundColor: '#1e40af' }}
          ></div>
          <div className="menu-btn-label">デッキ編成</div>
        </div>
        <div className="menu-img-btn" onClick={() => showCardList?.()}>
          <div
            className="menu-img-bg"
            style={{
              backgroundImage: `url('${images.GALLERY_CARD_LIST || ''}')`,
            }}
          ></div>
          <div className="menu-btn-label">カード一覧</div>
        </div>
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

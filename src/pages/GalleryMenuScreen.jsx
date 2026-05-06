
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { showCardList, showAchievements } from '../hooks/uiGallery.js';
import { goToModeSelect } from '../hooks/uiMainCore.js';

export default function GalleryMenuScreen() {
  const images = UI_IMAGES || {};

  return (
    <div id="screen-gallery-menu" className="screen active">
      <h2 style={{ color: '#facc15', marginBottom: '40px' }}>ギャラリー</h2>
      <div className="menu-btn-grid">
        <div className="menu-img-btn" onClick={() => showCardList?.()}>
          <div
            className="menu-img-bg"
            style={{
              backgroundImage: `url('${images.GALLERY_CARD_LIST || ''}')`,
            }}
          ></div>
          <div className="menu-btn-label">カード一覧</div>
        </div>
        <div className="menu-img-btn" onClick={() => showAchievements?.()}>
          <div
            className="menu-img-bg"
            style={{
              backgroundImage: `url('${images.GALLERY_ACHIEVEMENTS || ''}')`,
            }}
          ></div>
          <div className="menu-btn-label">実績</div>
        </div>
      </div>
      <div
        style={{
          marginTop: '20px',
          borderTop: '1px solid #334155',
          paddingTop: '20px',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <button
          className="btn"
          style={{ background: '#475569' }}
          onClick={() => goToModeSelect?.()}
        >
          戻る
        </button>
      </div>
    </div>
  );
}

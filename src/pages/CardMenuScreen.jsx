
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { showCardList } from '../hooks/uiGallery.js';
import { showDeckEditMenu, goToModeSelect } from '../hooks/uiMainCore.js';

export default function CardMenuScreen() {
  const images = UI_IMAGES || {};

  return (
    <div id="screen-card-menu" className="screen active">
      <h2 style={{ color: '#facc15', marginBottom: '40px' }}>カード</h2>
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
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            goToModeSelect?.();
          }}
        >
          戻る
        </button>
      </div>
    </div>
  );
}

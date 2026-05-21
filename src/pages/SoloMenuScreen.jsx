import { useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { goToModeSelect, startGameMode } from '../hooks/uiMainCore.js';
import { showConfirmModal } from '../hooks/uiModals.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';

export default function SoloMenuScreen() {
  const images = UI_IMAGES || {};
  const [clickCount, setClickCount] = useState(0);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 10) {
      showConfirmModal('キャンペーンモードを開始しますか？', () => {
        startGameMode?.('campaign');
      });
      setClickCount(0);
    }
  };

  return (
    <div
      id="screen-solo-menu"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_select.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        onClick={handleTitleClick}
        style={{
          color: '#facc15',
          margin: '20px 0',
          cursor: 'pointer',
          userSelect: 'none',
          textAlign: 'center',
        }}
      >
        ソロモード
      </h2>
      <div className="menu-btn-grid">
        <div className="menu-img-btn" onClick={() => startGameMode?.('story')}>
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_STORY || ''}')` }}
          ></div>
          <div className="menu-btn-label">ストーリー</div>
        </div>
        <div className="menu-img-btn" onClick={() => startGameMode?.('free')}>
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_FREE || ''}')` }}
          ></div>
          <div className="menu-btn-label">フリーバトル</div>
        </div>
        <div
          className="menu-img-btn"
          onClick={() => startGameMode?.('practice')}
        >
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_PRACTICE || ''}')` }}
          ></div>
          <div className="menu-btn-label">プラクティス</div>
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

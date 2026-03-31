import React from 'react';

import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { startGameMode, goToModeSelect } from '../hooks/uiMainCore.js';

export default function SoloMenuScreen() {
  const images = UI_IMAGES || {};

  return (
    <div id="screen-solo-menu" className="screen active" style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_select.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
    }}>
      <h2 style={{ color: '#facc15', marginBottom: '40px' }}>ソロモード</h2>
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
      </div>
      <div
        style={{
          marginTop: '20px',
          borderTop: '1px solid #334155',
          paddingTop: '20px',
          width: '100%',
          display: 'flex',
          justifyContent: 'center'
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

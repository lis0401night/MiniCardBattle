import React from 'react';

import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { showGallery } from '../hooks/uiGallery.js';
import { showRules, showOptions, startGameMode, showEventMenu } from '../hooks/uiMainCore.js';

export default function ModeSelectScreen() {
  const images = UI_IMAGES || {};

  return (
    <div id="screen-mode-select" className="screen active">
      <button className="btn-circle btn-gear" onClick={() => showOptions?.()}>
        ⚙
      </button>
      <div className="menu-btn-grid">
        <div className="menu-img-btn" onClick={() => showRules?.()}>
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_RULES || ''}')` }}
          ></div>
          <div className="menu-btn-label">遊び方</div>
        </div>
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
        <div className="menu-img-btn" onClick={() => showEventMenu?.()}>
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_EVENT || ''}')` }}
          ></div>
          <div className="menu-btn-label">イベント</div>
        </div>
        <div className="menu-img-btn" onClick={() => startGameMode?.('battle_dungeon')}>
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_DUNGEON || ''}')`, backgroundColor: '#475569' }}
          ></div>
          <div className="menu-btn-label">試練の宮殿</div>
        </div>
        <div
          className="menu-img-btn"
          onClick={() => showGallery?.()}
        >
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_GALLERY || ''}')` }}
          ></div>
          <div className="menu-btn-label">ギャラリー</div>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

import { showEventMenu, showHighDifficultyRules, handleSatanBattle } from '../hooks/uiMainCore.js';

export default function HighDifficultyScreen() {
  return (
    <div id="screen-high-difficulty" className="screen active">
      <h2 style={{ color: '#facc15', marginBottom: '20px' }}>高難易度</h2>
      <button
        className="btn btn-yellow"
        style={{ width: '250px', marginBottom: '20px' }}
        onClick={() => showHighDifficultyRules?.()}
      >
        ルール
      </button>

      <div className="banner-container">
        <button className="btn-banner legendary" onClick={() => handleSatanBattle?.()}>
          <img src="assets/icons/icon_satan.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#ef4444' }}>
            復活の魔王 サタン
          </span>
        </button>
      </div>

      <button
        className="btn"
        style={{ marginTop: '30px', background: '#475569' }}
        onClick={() => showEventMenu?.()}
      >
        戻る
      </button>
    </div>
  );
}

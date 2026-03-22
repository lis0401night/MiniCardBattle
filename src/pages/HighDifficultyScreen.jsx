import React from 'react';

import { showEventMenu, showHighDifficultyRules, handleSatanBattle } from '../hooks/uiMainCore.js';

export default function HighDifficultyScreen() {
  return (
    <div 
      id="screen-high-difficulty" 
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_satan.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <h2 style={{ color: '#ef4444', marginBottom: '20px', textShadow: '0 0 15px rgba(239, 68, 68, 0.6)' }}>高難易度</h2>
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

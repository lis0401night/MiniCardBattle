import React from 'react';

import { handleSatanBattle, handleAndroidHighBattle, handleDragonHighBattle, handleKnightHighBattle, handleCthulhuHighBattle, handleElfHighBattle, handleClericHighBattle, handleDevilhunterHighBattle } from '../hooks/uiMainCore.js';

import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function HighDifficultyScreen() {
  return (
    <div
      id="screen-high-difficulty"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <h2 style={{ color: '#ef4444', marginBottom: '15px', textShadow: '0 0 15px rgba(239, 68, 68, 0.6)', flexShrink: 0 }}>高難易度</h2>

      <div
        className="deck-edit-container"
        style={{
          justifyContent: 'flex-start',
          paddingTop: '10px',
          gap: '10px',
          overflowY: 'auto'
        }}
      >
        <button className="btn-banner legendary" style={{ flexShrink: 0 }} onClick={() => handleSatanBattle?.()}>
          <img src="assets/icons/icon_satan.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#ef4444' }}>
            復活の魔王 サタン
          </span>
        </button>

        <button className="btn-banner legendary" style={{ flexShrink: 0 }} onClick={() => handleAndroidHighBattle?.()}>
          <img src="assets/icons/icon_android_high.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#38bdf8' }}>
            フルアーマー アイギス
          </span>
        </button>

        <button className="btn-banner legendary" style={{ flexShrink: 0 }} onClick={() => handleDragonHighBattle?.()}>
          <img src="assets/icons/icon_dragon_high.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#fb7185' }}>
            熱砂の客人 イグニス
          </span>
        </button>

        <button className="btn-banner legendary" style={{ flexShrink: 0 }} onClick={() => handleKnightHighBattle?.()}>
          <img src="assets/icons/icon_knight_high.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#facc15' }}>
            暗黒騎士 セレスティア
          </span>
        </button>

        <button className="btn-banner legendary" style={{ flexShrink: 0 }} onClick={() => handleCthulhuHighBattle?.()}>
          <img src="assets/icons/icon_cthulhu_high.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#c084fc' }}>
            魔界の征服者 ナイア
          </span>
        </button>

        <button className="btn-banner legendary" style={{ flexShrink: 0 }} onClick={() => handleElfHighBattle?.()}>
          <img src="assets/icons/icon_elf_high.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#4ade80' }}>
            リナ&amp;ヴォイテク
          </span>
        </button>

        <button className="btn-banner legendary" style={{ flexShrink: 0 }} onClick={() => handleClericHighBattle?.()}>
          <img src="assets/icons/icon_cleric_high.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#94a3b8' }}>
            断罪の執行者 エリシア
          </span>
        </button>

        <button className="btn-banner legendary" style={{ flexShrink: 0 }} onClick={() => handleDevilhunterHighBattle?.()}>
          <img src="assets/icons/icon_devilhunter_high.png" className="banner-icon" alt="" />
          <span className="banner-text" style={{ color: '#64748b' }}>
            ゴーストライダー マリア
          </span>
        </button>

      </div>

      <button
        className="btn"
        style={{ marginTop: '30px', background: '#475569', flexShrink: 0 }}
        onClick={() => {
          playSound?.(SOUNDS?.seClick);
          if (window.switchScreen) window.switchScreen('screen-high-difficulty-menu');
        }}
      >
        戻る
      </button>
    </div>
  );
}

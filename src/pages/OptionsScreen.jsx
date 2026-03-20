import React, { useState, useEffect } from 'react';

import { switchScreen } from '../utils/gameUtils.js';
import { GameState } from '../hooks/gameState.js';
import { updateVolume, resetGameData, showSyncDataModal, reloadGame, handleOptionsTitleClick } from '../hooks/uiMainCore.js';

export default function OptionsScreen() {
  const [volume, setVolume] = useState(0.5);

  useEffect(() => {
    const syncVolume = () => {
      if (typeof GameState.gameVolume !== 'undefined') {
        setVolume(GameState.gameVolume);
      }
    };
    
    syncVolume(); // 初回マウント時同期
    window.addEventListener('optionsOpened', syncVolume); // オプションが開かれる度に再同期
    return () => window.removeEventListener('optionsOpened', syncVolume);
  }, []);

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (typeof updateVolume === 'function') {
      updateVolume(val);
    }
  };

  return (
    <div id="screen-options" className="screen active">
      <h2
        style={{ color: '#facc15', marginBottom: '30px' }}
        onClick={() => handleOptionsTitleClick?.()}
      >
        オプション
      </h2>

      <div
        style={{
          width: '280px',
          background: 'rgba(0,0,0,0.4)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #334155',
          marginBottom: '30px'
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '10px', color: '#cbd5e1', fontSize: '0.9rem' }}>
            音量調整
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>🔈</span>
            <input
              type="range"
              id="volume-slider"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              onPointerUp={handleVolumeChange}
              onTouchEnd={handleVolumeChange}
              style={{ flexGrow: 1, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '1.2rem' }}>🔊</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #334155', paddingTop: '20px' }}>
          <label style={{ display: 'block', marginBottom: '10px', color: '#cbd5e1', fontSize: '0.9rem' }}>
            データ管理
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              className="btn"
              style={{ background: '#475569', width: '100%', marginTop: '0', fontSize: '0.9rem' }}
              onClick={() => showSyncDataModal?.()}
            >
              データ連携
            </button>
            <button
              className="btn"
              style={{ background: '#7f1d1d', width: '100%', marginTop: '0', fontSize: '0.9rem' }}
              onClick={() => resetGameData?.()}
            >
              データ削除
            </button>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '8px', textAlign: 'center' }}>
            ※デッキと所持カードが初期化されます
          </p>
        </div>

        <div style={{ borderTop: '1px solid #334155', paddingTop: '20px', marginTop: '20px' }}>
          <label style={{ display: 'block', marginBottom: '10px', color: '#cbd5e1', fontSize: '0.9rem' }}>
            更新
          </label>
          <button
            className="btn"
            style={{ background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)', width: '100%', marginTop: '0', fontSize: '0.9rem' }}
            onClick={() => reloadGame?.()}
          >
            更新してタイトルへ
          </button>
        </div>
      </div>

      <button
        className="btn"
        style={{ background: '#475569' }}
        onClick={() => switchScreen('screen-mode-select')}
      >
        戻る
      </button>
    </div>
  );
}

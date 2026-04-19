import React from 'react';

import { playSound, stopAllBGM, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS, AUDIO_INSTANCES } from '../utils/sounds.js';
import { showHighDifficultyRules, showEventMenu } from '../hooks/uiMainCore.js';

export default function HighDifficultyMenuScreen() {
  const handleChallengeClick = () => {
    playSound(SOUNDS.seClick);
    if (window.switchScreen) window.switchScreen('screen-high-difficulty');
  };

  return (
    <div 
      id="screen-high-difficulty-menu" 
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <h2 style={{ color: '#ef4444', marginBottom: '30px', textShadow: '0 0 15px rgba(239, 68, 68, 0.6)' }}>高難易度</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '250px' }}>
        <button 
          className="btn btn-yellow" 
          onClick={() => showHighDifficultyRules?.()}
        >
          ルール
        </button>
        <button 
          className="btn" 
          style={{ background: 'linear-gradient(45deg, #ef4444, #b91c1c)' }} 
          onClick={handleChallengeClick}
        >
          挑戦
        </button>
      </div>

      <button 
        className="btn" 
        style={{ marginTop: '40px', background: '#475569' }} 
        onClick={() => showEventMenu?.()}
      >
        戻る
      </button>
    </div>
  );
}

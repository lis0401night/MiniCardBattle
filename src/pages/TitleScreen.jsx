import React, { useState } from 'react';

import { goToModeSelect } from '../hooks/uiMainCore.js';
import { unlockAudio } from '../utils/sounds.js';

export default function TitleScreen() {
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = () => {
    if (isStarting) return;
    setIsStarting(true);
    
    try {
      if (typeof unlockAudio === 'function') {
        unlockAudio().catch(e => console.warn(e));
      }
      if (typeof goToModeSelect === 'function') {
        goToModeSelect();
      }
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div id="screen-title" className="screen active" onClick={handleStart}>
      <img
        src="assets/ui/title_img.jpg"
        alt="Key Visual"
        className="title-visual"
        onError={(e) => {
          e.target.style.display = 'none';
          if (e.target.nextElementSibling) {
            e.target.nextElementSibling.style.display = 'block';
          }
        }}
      />
      <h1 className="game-title" style={{ display: 'none' }}>
        LANE<br />DEFENDERS
      </h1>
      <div className="start-text">TAP TO START</div>
    </div>
  );
}

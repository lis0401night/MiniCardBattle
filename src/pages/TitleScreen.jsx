import { useEffect, useState } from 'react';

import { goToModeSelect } from '../services/uiMainCore.js';
import { preloadAllGameResources } from '../utils/resourceLoader.js';
import { unlockAudio } from '../utils/sounds.js';

export default function TitleScreen() {
  const [isStarting, setIsStarting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let unmounted = false;
    preloadAllGameResources((prog) => {
      if (!unmounted) setProgress(prog);
    }).then(() => {
      if (!unmounted) setIsLoading(false);
    });
    return () => {
      unmounted = true;
    };
  }, []);

  const handleStart = () => {
    if (isLoading || isStarting) return;
    setIsStarting(true);

    try {
      if (typeof unlockAudio === 'function') {
        unlockAudio().catch((e) => console.warn(e));
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
        LANE
        <br />
        DEFENDERS
      </h1>

      {isLoading ? (
        <div
          className="start-text"
          style={{ fontSize: '1rem', color: '#ccc', animation: 'none' }}
        >
          Now Loading... {progress}%
          <div
            style={{
              width: '200px',
              height: '4px',
              background: '#334155',
              marginTop: '10px',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: '#38bdf8',
                transition: 'width 0.2s',
              }}
            ></div>
          </div>
        </div>
      ) : (
        <div className="start-text">TAP TO START</div>
      )}
    </div>
  );
}

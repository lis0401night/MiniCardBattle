import BackButton from '../components/BackButton.jsx';
import { selectHighDifficultyTarget } from '../services/uiMainCore.js';
import {
  CHARACTERS,
  BOSS_CHARACTER_IDS,
} from '../utils/constants/characters.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { getScreenBackgroundStyle } from '../utils/constants/config.js';

export default function HighDifficultyScreen() {
  // サタンを先頭に表示するため、satanを優先ソート
  const highEventChars = Object.values(CHARACTERS)
    .filter((c) => c.event_high)
    .sort((a, b) => (a.id === 'satan' ? -1 : b.id === 'satan' ? 1 : 0));

  return (
    <div
      id="screen-high-difficulty"
      className="screen active"
      style={getScreenBackgroundStyle(
        'assets/backgrounds/background_highdifficulty.png'
      )}
    >
      <h2
        style={{
          color: '#ef4444',
          margin: '20px 0',
          textShadow: '0 0 15px rgba(239, 68, 68, 0.6)',
          flexShrink: 0,
          textAlign: 'center',
        }}
      >
        高難易度
      </h2>

      <div
        className="deck-edit-container"
        style={{
          justifyContent: 'flex-start',
          paddingTop: '10px',
          gap: '10px',
          overflowY: 'auto',
        }}
      >
        {highEventChars.map((char) => {
          const eventConf = char.event_high;
          return (
            <button
              key={eventConf.id}
              className="btn-banner legendary"
              style={{ flexShrink: 0 }}
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                selectHighDifficultyTarget?.(char.id);
              }}
            >
              <div className="banner-icon-wrapper">
                <img
                  src={`assets/icons/icon_${eventConf.id}.png`}
                  onError={(e) => {
                    e.target.src = char.icon;
                  }}
                  className="banner-icon"
                  alt=""
                />
                <img
                  src={`assets/icons/iconframe_${BOSS_CHARACTER_IDS.includes(char.id) ? 'red' : 'gold'}.png`}
                  className="banner-icon-frame"
                  alt="frame"
                />
              </div>
              <span
                className="banner-text"
                style={{ color: char.color || '#fff' }}
              >
                {eventConf.name}
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          padding: '15px 0 20px 0',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
        }}
      >
        <BackButton to="screen-high-difficulty-menu" style={{ margin: 0 }} />
      </div>
    </div>
  );
}

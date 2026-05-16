import BackButton from '../components/BackButton.jsx';
import { selectHighDifficultyTarget } from '../hooks/uiMainCore.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function HighDifficultyScreen() {
  // サタンを先頭に表示するため、satanを優先ソート
  const highEventChars = Object.values(CHARACTERS)
    .filter((c) => c.event_high)
    .sort((a, b) => (a.id === 'satan' ? -1 : b.id === 'satan' ? 1 : 0));

  return (
    <div
      id="screen-high-difficulty"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#ef4444',
          marginBottom: '15px',
          textShadow: '0 0 15px rgba(239, 68, 68, 0.6)',
          flexShrink: 0,
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
              <img
                src={`assets/icons/icon_${eventConf.id}.png`}
                onError={(e) => { e.target.src = char.icon; }}
                className="banner-icon"
                alt=""
              />
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

      <BackButton
        to="screen-high-difficulty-menu"
        style={{ marginTop: '30px', flexShrink: 0 }}
      />
    </div>
  );
}

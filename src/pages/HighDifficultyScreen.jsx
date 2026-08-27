import BackButton from '../components/BackButton.jsx';
import EventIcon from '../components/common/EventIcon.jsx';
import { selectHighDifficultyTarget } from '../services/uiMainCore.js';
import {
  CHARACTERS,
  BOSS_CHARACTER_IDS,
} from '../utils/constants/characters.js';
import {
  loadHighDifficultyClearedData,
  playSound,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  appendVersionQuery,
  getScreenBackgroundStyle,
} from '../utils/constants/config.js';

/**
 * 高難易度イベントのキャラクター選択画面コンポーネント。
 * 各ボスの選択と獲得可能ポイント（初回10Pt / 2回目以降2Pt）を表示する。
 *
 * @returns {JSX.Element} 高難易度選択画面
 */
export default function HighDifficultyScreen() {
  const clearedData = loadHighDifficultyClearedData();

  // サタンを先頭に表示するため、satanを優先ソート
  const highEventChars = Object.values(CHARACTERS)
    .filter((c) => c.event_high)
    .sort((a, b) => (a.id === 'satan' ? -1 : b.id === 'satan' ? 1 : 0));

  return (
    <div
      id="screen-high-difficulty"
      className="screen active"
      style={getScreenBackgroundStyle(
        'assets/backgrounds/background_highdifficulty.webp'
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
          height: 'auto',
          minHeight: '492px',
        }}
      >
        {highEventChars.map((char) => {
          const eventConf = char.event_high;
          const iconSrc =
            eventConf.id === 'satan_high'
              ? char.icon
              : `assets/icons/icon_${eventConf.id}.webp`;

          const isCleared = !!clearedData[char.id];
          const winPoints = isCleared ? 2 : 10;

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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="banner-icon-wrapper">
                    <EventIcon
                      src={iconSrc}
                      fallbackSrc={char.icon}
                      className="banner-icon"
                      alt=""
                    />
                    <img
                      src={appendVersionQuery(
                        `assets/icons/iconframe_${BOSS_CHARACTER_IDS.includes(char.id) ? 'red' : 'gold'}.webp`
                      )}
                      className="banner-icon-frame"
                      decoding="async"
                      loading="lazy"
                      alt="frame"
                    />
                  </div>
                  <span
                    className="banner-text"
                    style={{ color: char.color || '#fff' }}
                  >
                    {eventConf.name}
                  </span>
                </div>
                <div
                  style={{
                    color: '#10b981',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    marginRight: '5px',
                  }}
                >
                  Win +{winPoints}
                </div>
              </div>
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

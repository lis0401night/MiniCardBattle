import BackButton from '../components/BackButton.jsx';
import EventIcon from '../components/common/EventIcon.jsx';
import { selectFortuneTarget } from '../services/uiMainCore.js';
import {
  CHARACTERS,
  BOSS_CHARACTER_IDS,
} from '../utils/constants/characters.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  appendVersionQuery,
  getScreenBackgroundStyle,
} from '../utils/constants/config.js';

/** 運命の邂逅イベントの表示順定義 */
const FORTUNE_DISPLAY_ORDER = ['automata', 'valkyria'];

/**
 * キャラクターの運命の邂逅表示順ランクを取得する
 * @param {string} id - キャラクターID
 * @returns {number} 順序インデックス（未定義の場合は末尾配置用の大きな数値）
 */
const getFortuneRank = (id) => {
  const idx = FORTUNE_DISPLAY_ORDER.indexOf(id);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
};

/**
 * 運命の邂逅キャラクター選択画面コンポーネント
 * @returns {JSX.Element} 運命の邂逅選択画面
 */
export default function FortuneScreen() {
  const fortuneEventChars = Object.values(CHARACTERS)
    .filter((c) => c.event_fortune)
    .sort((a, b) => getFortuneRank(a.id) - getFortuneRank(b.id));

  return (
    <div
      id="screen-fortune"
      className="screen active"
      style={getScreenBackgroundStyle(
        'assets/backgrounds/background_fortune01.webp'
      )}
    >
      <h2
        style={{
          color: '#f97316',
          margin: '20px 0',
          textShadow: '0 0 15px rgba(249, 115, 22, 0.6)',
          flexShrink: 0,
          textAlign: 'center',
        }}
      >
        運命の邂逅
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
        {fortuneEventChars.map((char) => {
          const eventConf = char.event_fortune;
          return (
            <button
              key={eventConf.id}
              className="btn-banner legendary"
              style={{ flexShrink: 0 }}
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                selectFortuneTarget?.(char.id);
              }}
            >
              <div className="banner-icon-wrapper">
                <EventIcon
                  src={`assets/icons/icon_${eventConf.id}.webp`}
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
        <BackButton to="screen-fortune-menu" style={{ margin: 0 }} />
      </div>
    </div>
  );
}

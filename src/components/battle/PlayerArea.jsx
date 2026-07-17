import { GameState } from '../../state/gameState.js';
import {
  getSkinImage,
  BOSS_CHARACTER_IDS,
} from '../../utils/constants/characters.js';
import {
  MAX_DISCARD_PREVIEW_COUNT,
  DECK_SIZE,
} from '../../utils/constants/config.js';
import DeckIcon from './DeckIcon.jsx';

export default function PlayerArea({
  playerConfig,
  playerHP,
  playerMaxHP,
  deckCount,
  maxDeckCount = DECK_SIZE,
  dropCount,
  spCount,
  maxSpCount,
  onLeaderSkillClick,
  onMissionClick,
}) {
  if (!playerConfig) return null;

  return (
    <div className="hp-area">
      {onMissionClick && (
        <button
          className="btn-circle btn-battle-missions"
          style={{ position: 'absolute', right: '20px', transform: 'translateY(-30px)', zIndex: 100 }}
          onClick={(e) => {
            e.stopPropagation();
            onMissionClick();
          }}
        >
          📋
        </button>
      )}
      <div className="status-container">
        <div
          className="icon-wrapper"
          id="player-icon-wrap"
          onClick={onLeaderSkillClick}
          style={{ cursor: 'pointer' }}
        >
          <div
            className={`char-icon-bg blue ${playerHP <= 0 ? 'dead' : ''}`}
          ></div>
          <div className={`char-icon-container ${playerHP <= 0 ? 'dead' : ''}`}>
            <img
              id="player-icon"
              className="char-icon"
              src={
                getSkinImage(
                  playerConfig,
                  GameState.playerSkins?.[playerConfig.id],
                  'icon'
                ) ||
                playerConfig.icon ||
                playerConfig.image
              }
              alt="player icon"
            />
          </div>
          {/* 敵対勢力（魔族）のリーダーは赤フレーム、それ以外は金フレームを使用 */}
          <img
            src={`assets/icons/iconframe_${BOSS_CHARACTER_IDS.includes(playerConfig.id) ? 'red' : 'gold'}.webp`}
            className="icon-frame"
            alt="frame"
          />
          <div id="player-sp-orbs" className="sp-orbs">
            {Array.from({ length: maxSpCount }).map((_, i) => (
              <div
                key={`sp-${i}`}
                className={`orb ${i < spCount ? 'filled' : ''}`}
              ></div>
            ))}
          </div>
        </div>
        <div id="player-speech" className="speech-bubble">
          痛い！
        </div>
        <div className="player-status">
          <div
            className="status-name"
            id="player-name"
            style={{ color: 'var(--color-blue)' }}
          >
            {playerConfig.name}
          </div>
          <div className="hp-bar-bg">
            <div
              className="hp-bar-fill blue"
              id="player-hp-fill"
              style={{
                width: `${playerMaxHP > 0 ? Math.max(0, playerHP / playerMaxHP) * 100 : 0}%`,
              }}
            ></div>
            <div className="hp-text" id="player-hp-text">
              {playerHP} / {playerMaxHP}
            </div>
          </div>
          <div
            id="deck-info"
            className="deck-info"
            style={{
              fontSize: '1rem',
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
            }}
          >
            <DeckIcon count={deckCount} max={maxDeckCount} />
            <span
              style={{
                display: 'inline-block',
                minWidth: '150px',
                textAlign: 'left',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              山札：{deckCount} / 墓地：{dropCount}
            </span>
            <button
              className="action-btn"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={(e) => {
                e.stopPropagation();
                window.showDiscardSelectionModalReact?.(
                  GameState.playerDiscard,
                  MAX_DISCARD_PREVIEW_COUNT,
                  null,
                  true
                );
              }}
            >
              確認
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

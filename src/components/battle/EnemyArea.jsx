import { GameState } from '../../hooks/gameState.js';
import { getSkinImage } from '../../utils/constants/characters.js';

export default function EnemyArea({
  enemyConfig,
  enemyHP,
  enemyMaxHP,
  deckCount,
  dropCount,
}) {
  if (!enemyConfig) return null;

  return (
    <div className="hp-area">
      <div className="status-container">
        <div className="icon-wrapper" id="enemy-icon-wrap">
          <img
            id="enemy-icon"
            className="char-icon red"
            src={
              getSkinImage(
                enemyConfig,
                GameState.enemySkins?.[enemyConfig.id],
                'icon'
              ) ||
              enemyConfig.icon ||
              enemyConfig.image
            }
            alt="enemy icon"
          />
          {enemyConfig?.leaderSkill?.cost &&
            enemyConfig.leaderSkill.cost > 0 && (
              <div id="enemy-sp-orbs" className="sp-orbs">
                {Array.from({ length: enemyConfig.leaderSkill.cost }).map(
                  (_, i) => (
                    <div
                      key={`enemy-sp-${i}`}
                      className={`orb ${i < (GameState.enemySP || 0) ? 'filled' : ''}`}
                    ></div>
                  )
                )}
              </div>
            )}
        </div>
        <div id="enemy-speech" className="speech-bubble">
          くっ…！
        </div>
        <div className="player-status">
          <div
            className="status-name"
            id="enemy-name"
            style={{ color: 'var(--color-red)' }}
          >
            {enemyConfig.name}
          </div>
          <div className="hp-bar-bg">
            <div
              className="hp-bar-fill red"
              id="enemy-hp-fill"
              style={{ width: `${Math.max(0, enemyHP / enemyMaxHP) * 100}%` }}
            ></div>
            <div className="hp-text" id="enemy-hp-text">
              {enemyHP} / {enemyMaxHP}
            </div>
          </div>
          <div
            id="enemy-deck-info"
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
            <span>
              山札: {deckCount} / 墓地: {dropCount}
            </span>
            <button
              className="action-btn"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={(e) => {
                e.stopPropagation();
                window.showDiscardSelectionModalReact?.(
                  GameState.enemyDiscard,
                  999,
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

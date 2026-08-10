import { GameState } from '../../state/gameState.js';
import {
  getSkinImage,
  BOSS_CHARACTER_IDS,
} from '../../utils/constants/characters.js';
import {
  MAX_DISCARD_PREVIEW_COUNT,
  DECK_SIZE,
} from '../../utils/constants/config.js';
import {
  checkIsTutorialMode,
  checkIsStoryMode,
  checkIsFreeMode,
} from '../../utils/gameUtils.js';
import DeckIcon from './DeckIcon.jsx';

/**
 * 対戦相手（敵）のステータス表示エリアコンポーネント
 * HP、アイコン、デッキ残数、墓地枚数を表示する
 *
 * @param {Object} props
 * @param {Object} props.enemyConfig 敵キャラクター設定データ
 * @param {number} props.enemyHP 現在のHP
 * @param {number} props.enemyMaxHP 最大HP
 * @param {number} props.deckCount 山札の残り枚数
 * @param {number} [props.maxDeckCount] デッキの最大枚数
 * @param {number} props.dropCount 墓地の枚数
 * @returns {JSX.Element|null}
 */
export default function EnemyArea({
  enemyConfig,
  enemyHP,
  enemyMaxHP,
  deckCount,
  maxDeckCount = DECK_SIZE,
  dropCount,
}) {
  if (!enemyConfig) return null;

  // チュートリアル・ストーリー・フリーモードでは敵スキンを適用しないためデフォルトアイコンを使用
  const skipEnemySkin =
    checkIsTutorialMode() || checkIsStoryMode() || checkIsFreeMode();
  const enemySkinId = skipEnemySkin
    ? 'default'
    : GameState.enemySkins?.[enemyConfig.id];

  return (
    <div className="hp-area">
      <div className="status-container">
        <div className="icon-wrapper" id="enemy-icon-wrap">
          <div
            className={`char-icon-bg red ${enemyHP <= 0 ? 'dead' : ''}`}
          ></div>
          <div
            className={`char-icon-container ${enemyConfig.isShadow ? 'shadow-icon' : ''} ${enemyHP <= 0 ? 'dead' : ''}`}
          >
            <img
              id="enemy-icon"
              className="char-icon"
              src={
                getSkinImage(enemyConfig, enemySkinId, 'icon') ||
                enemyConfig.icon ||
                enemyConfig.image
              }
              alt="enemy icon"
            />
          </div>
          <img
            src={`assets/icons/iconframe_${BOSS_CHARACTER_IDS.includes(enemyConfig.id) ? 'red' : 'gold'}.webp`}
            className="icon-frame"
            alt="frame"
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
              style={{
                width: `${enemyMaxHP > 0 ? Math.max(0, enemyHP / enemyMaxHP) * 100 : 0}%`,
              }}
            ></div>
            <div className="hp-text" id="enemy-hp-text">
              {enemyHP} / {enemyMaxHP}
            </div>
          </div>
          <div
            id="enemy-deck-info"
            className="deck-info"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '6px',
              minWidth: 0,
            }}
          >
            <DeckIcon count={deckCount} max={maxDeckCount} />
            <span
              style={{
                display: 'inline-block',
                fontVariantNumeric: 'tabular-nums',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              山札：{deckCount} / 墓地：{dropCount}
            </span>
            <button
              className="action-btn"
              style={{
                padding: '3px 8px',
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              onClick={(e) => {
                e.stopPropagation();
                window.showDiscardSelectionModalReact?.(
                  GameState.enemyDiscard,
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

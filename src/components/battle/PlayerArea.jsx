import { GameState } from '../../state/gameState.js';
import {
  getSkinImage,
  BOSS_CHARACTER_IDS,
} from '../../utils/constants/characters.js';
import {
  MAX_DISCARD_PREVIEW_COUNT,
  DECK_SIZE,
} from '../../utils/constants/config.js';
import { checkIsTutorialMode } from '../../utils/gameUtils.js';
import DeckIcon from './DeckIcon.jsx';

/**
 * プレイヤー（自分）のステータス表示エリアコンポーネント
 * HP、SP、アイコン、デッキ残数、墓地枚数を表示する
 *
 * @param {Object} props
 * @param {Object} props.playerConfig プレイヤーキャラクター設定データ
 * @param {number} props.playerHP 現在のHP
 * @param {number} props.playerMaxHP 最大HP
 * @param {number} props.deckCount 山札の残り枚数
 * @param {number} [props.maxDeckCount] デッキの最大枚数
 * @param {number} props.dropCount 墓地の枚数
 * @param {number} props.spCount 現在のSP量
 * @param {number} props.maxSpCount 最大SP量
 * @param {Function} props.onLeaderSkillClick リーダースキル発動ボタンのクリックハンドラ
 * @returns {JSX.Element|null}
 */
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
}) {
  if (!playerConfig) return null;

  // チュートリアル時は常にデフォルトスキンのアイコンを使用する
  const playerSkinId = checkIsTutorialMode()
    ? 'default'
    : GameState.playerSkins?.[playerConfig.id];

  return (
    <div className="hp-area">
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
                getSkinImage(playerConfig, playerSkinId, 'icon') ||
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

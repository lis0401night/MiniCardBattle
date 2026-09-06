import { GameState } from '../../state/gameState.js';
import {
  getSkinImage,
  getIconFramePath,
} from '../../utils/constants/characters.js';
import {
  MAX_DISCARD_PREVIEW_COUNT,
  DECK_SIZE,
} from '../../utils/constants/config.js';
import {
  checkIsTutorialMode,
  checkIsStoryMode,
  checkIsFreeMode,
  playSound,
} from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import { useEasterEgg } from '../../hooks/useEasterEgg.js';
import { checkWinCondition } from '../../game/battle/index.js';
import {
  updateBattleUIHook,
  showSpeechBubble,
} from '../../services/uiBattle.js';
import DeckIcon from './DeckIcon.jsx';

/** デバッグ用即時勝利発動に必要な敵アイコンクリック数 */
const DEBUG_WIN_CLICK_THRESHOLD = import.meta.env.DEV ? 10 : Infinity;

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
  /**
   * ローカル開発環境専用：敵アイコン10回クリックで即座に敵HPを0にして勝利判定を起動する
   */
  const triggerDebugWin = useEasterEgg(() => {
    if (!import.meta.env.DEV) return;
    if (GameState.isBattleEnded || GameState.enemyHP <= 0) return;

    // 敵HPを0にし、プレイヤー生存を保証
    GameState.enemyHP = 0;
    GameState.playerHP = Math.max(GameState.playerHP, 1);

    playSound(SOUNDS.seHeavyDamage);
    showSpeechBubble('red', 99);

    if (typeof updateBattleUIHook === 'function') {
      updateBattleUIHook();
    } else if (typeof window !== 'undefined' && window.updateBattleUIHook) {
      window.updateBattleUIHook();
    }

    checkWinCondition();
  }, DEBUG_WIN_CLICK_THRESHOLD);

  /**
   * 敵アイコンクリック時のイベントハンドラ
   * @param {React.MouseEvent} e クリックイベント
   */
  const handleEnemyIconClick = (e) => {
    e.stopPropagation();
    if (import.meta.env.DEV && !GameState.isBattleEnded) {
      playSound(SOUNDS.seClick);
      triggerDebugWin();
    }
  };

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
        <div
          className="icon-wrapper"
          id="enemy-icon-wrap"
          onClick={handleEnemyIconClick}
          style={{ cursor: import.meta.env.DEV ? 'pointer' : 'default' }}
        >
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
            src={getIconFramePath(enemyConfig.id)}
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

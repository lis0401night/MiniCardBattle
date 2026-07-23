import { useEffect, useReducer } from 'react';
import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import { getScreenBackgroundStyle, MAX_CARD_COPIES } from '../utils/constants/config.js';
import {
  confirmDifficulty,
  goBackFromDifficulty,
  openEnemyDeckPreview,
} from '../services/uiMainCore.js';
import MenuButton from '../components/common/MenuButton.jsx';
import {
  playSound,
  switchScreen,
  getEventEnemyCharId,
  checkIsFortuneMode,
  checkIsHighDiffMode,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { CHAR_FORTUNE_HANDICAPS } from '../utils/constants/fortuneHandicaps.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';

// 難易度レベル定数
const DIFFICULTY = {
  BEGINNER: 1, // 初級
  INTERMEDIATE: 2, // 中級
  ADVANCED: 3, // 上級
};

function CompleteBadge() {
  return (
    <span
      style={{
        position: 'absolute',
        bottom: '-5px',
        left: '-5px',
        background: '#1e293b',
        color: '#facc15',
        fontSize: '0.65rem',
        fontWeight: 'bold',
        padding: '1px 6px',
        borderRadius: '4px',
        border: '1.5px solid #facc15',
        boxShadow:
          '0 2px 5px rgba(0, 0, 0, 0.6), 0 0 8px rgba(250, 204, 21, 0.4)',
        zIndex: 10,
        pointerEvents: 'none',
        textShadow: '1px 1px 2px #000',
        letterSpacing: '0.5px',
        lineHeight: '1.2',
        whiteSpace: 'nowrap',
      }}
    >
      COMPLETE!
    </span>
  );
}

export default function DifficultySelectScreen() {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  const isFreeMode =
    typeof GameState !== 'undefined' && GameState.gameMode === 'free';

  // 高難易度イベントモードかどうかの判定
  const isHighDiffMode =
    typeof GameState !== 'undefined' && checkIsHighDiffMode(GameState.gameMode);

  // 運命の邂逅イベントモードかどうかの判定
  const isFortuneMode =
    typeof GameState !== 'undefined' && checkIsFortuneMode(GameState.gameMode);

  const enemyCharId = isFortuneMode
    ? getEventEnemyCharId(GameState.gameMode) || null
    : null;

  const hasFortuneHandicaps =
    enemyCharId &&
    CHAR_FORTUNE_HANDICAPS[enemyCharId] &&
    CHAR_FORTUNE_HANDICAPS[enemyCharId].length > 0;

  useEffect(() => {
    const originalInit = window.initDifficultySelectScreenReact;
    window.initDifficultySelectScreenReact = () => {
      // 【CodeRabbit指摘反映】画面切り替え時やGameState.gameModeの変化を検知した際に、強制的に再描画して表示を同期する
      forceUpdate();
    };

    return () => {
      window.initDifficultySelectScreenReact = originalInit;
    };
  }, []);

  const handleSelect = (level) => {
    confirmDifficulty?.(level);
  };

  // デッキの所持コンプリートチェック（プレイヤーがデッキの全カードを4枚以上持っているか）
  const checkIsDeckComplete = (deckCardIds) => {
    if (!deckCardIds || !Array.isArray(deckCardIds) || deckCardIds.length === 0)
      return false;
    const inv = GameState.playerInventory || {};
    return deckCardIds.every((cardId) => (inv[cardId] || 0) >= MAX_CARD_COPIES);
  };

  // フリーバトル用コンプリート判定
  const enemyId = GameState.enemyConfig?.id;
  const isBeginnerComplete =
    isFreeMode &&
    enemyId &&
    ENEMY_DECKS[enemyId]?.easy &&
    checkIsDeckComplete(ENEMY_DECKS[enemyId].easy);

  const isIntermediateComplete =
    isFreeMode &&
    enemyId &&
    ENEMY_DECKS[enemyId]?.normal &&
    checkIsDeckComplete(ENEMY_DECKS[enemyId].normal);

  const isAdvancedComplete =
    isFreeMode &&
    enemyId &&
    ENEMY_DECKS[enemyId]?.hard &&
    checkIsDeckComplete(ENEMY_DECKS[enemyId].hard);

  // 高難易度イベント用コンプリート判定
  const highEnemyCharId = isHighDiffMode
    ? getEventEnemyCharId(GameState.gameMode)
    : null;
  const isHighComplete =
    isHighDiffMode &&
    highEnemyCharId &&
    ENEMY_DECKS[`${highEnemyCharId}_high`] &&
    checkIsDeckComplete(ENEMY_DECKS[`${highEnemyCharId}_high`]);

  // 高難易度イベント、運命の邂逅および通常難易度選択用の背景スタイル
  const highDiffBgStyle = getScreenBackgroundStyle(
    isFortuneMode
      ? 'assets/backgrounds/background_fortune01.webp'
      : isHighDiffMode
        ? 'assets/backgrounds/background_highdifficulty.webp'
        : 'assets/backgrounds/background_select.webp'
  );

  return (
    <div
      id="screen-difficulty"
      className="screen active"
      style={highDiffBgStyle}
    >
      <h2
        style={{
          fontWeight: 900,
          margin: '20px 0',
          textAlign: 'center',
          ...(isHighDiffMode
            ? {
                color: '#ef4444',
                textShadow: '0 0 15px rgba(239, 68, 68, 0.6)',
              }
            : isFortuneMode
              ? {
                  color: '#f97316',
                  textShadow: '0 0 15px rgba(249, 115, 22, 0.6)',
                }
              : {}),
        }}
      >
        難易度
      </h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '100%',
          alignItems: 'center',
        }}
      >
        {/* 高難易度（超級）または運命の邂逅（特級）は難易度を1つだけ表示 */}
        {isHighDiffMode || isFortuneMode ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '15px',
            }}
          >
            {hasFortuneHandicaps &&
              [
                {
                  label: '特級目標',
                  variant: 'red',
                  screen: 'screen-fortune-handicap',
                },
                {
                  label: '達成状況',
                  variant: 'yellow',
                  screen: 'screen-fortune-achievement',
                },
              ].map((row) => (
                <div
                  key={row.screen}
                  className="difficulty-button-row"
                  style={{ margin: 0 }}
                >
                  <MenuButton
                    label={row.label}
                    variant={row.variant}
                    onClick={() => {
                      playSound(SOUNDS?.seClick);
                      switchScreen(row.screen);
                    }}
                  />
                  <button
                    className="btn-check-deck"
                    style={{ display: 'flex', visibility: 'hidden' }}
                  >
                    🔍
                  </button>
                </div>
              ))}
            <div className="difficulty-button-row" style={{ margin: 0 }}>
              <MenuButton
                label={isFortuneMode ? '特級' : '超級'}
                variant={isFortuneMode ? 'orange' : 'purple'}
                onClick={() => handleSelect(DIFFICULTY.ADVANCED)}
              >
                {isHighComplete && <CompleteBadge />}
              </MenuButton>
              <button
                className="btn-check-deck"
                style={{ display: 'flex' }}
                onClick={() =>
                  openEnemyDeckPreview?.(isFortuneMode ? 'fortune' : 'high')
                }
                title="デッキ確認"
              >
                🔍
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="difficulty-button-row">
              <MenuButton
                label="初級"
                variant="emerald"
                onClick={() => handleSelect(DIFFICULTY.BEGINNER)}
              >
                {isBeginnerComplete && <CompleteBadge />}
              </MenuButton>
              {isFreeMode && (
                <button
                  className="btn-check-deck"
                  style={{ display: 'flex' }}
                  onClick={() => openEnemyDeckPreview?.(DIFFICULTY.BEGINNER)}
                  title="デッキ確認"
                >
                  🔍
                </button>
              )}
            </div>
            <div className="difficulty-button-row">
              <MenuButton
                label="中級"
                variant="yellow"
                onClick={() => handleSelect(DIFFICULTY.INTERMEDIATE)}
              >
                {isIntermediateComplete && <CompleteBadge />}
              </MenuButton>
              {isFreeMode && (
                <button
                  className="btn-check-deck"
                  style={{ display: 'flex' }}
                  onClick={() =>
                    openEnemyDeckPreview?.(DIFFICULTY.INTERMEDIATE)
                  }
                  title="デッキ確認"
                >
                  🔍
                </button>
              )}
            </div>
            <div className="difficulty-button-row">
              <MenuButton
                label="上級"
                variant="red"
                onClick={() => handleSelect(DIFFICULTY.ADVANCED)}
              >
                {isAdvancedComplete && <CompleteBadge />}
              </MenuButton>
              {isFreeMode && (
                <button
                  className="btn-check-deck"
                  style={{ display: 'flex' }}
                  onClick={() => openEnemyDeckPreview?.(DIFFICULTY.ADVANCED)}
                  title="デッキ確認"
                >
                  🔍
                </button>
              )}
            </div>
          </>
        )}
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
        <BackButton
          onClick={() => goBackFromDifficulty?.()}
          style={{ margin: 0 }}
        />
      </div>
    </div>
  );
}

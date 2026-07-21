import { useEffect, useReducer } from 'react';
import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import { getScreenBackgroundStyle } from '../utils/constants/config.js';
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

// 難易度レベル定数
const DIFFICULTY = {
  BEGINNER: 1, // 初級
  INTERMEDIATE: 2, // 中級
  ADVANCED: 3, // 上級
};

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
              />
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
              />
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
              />
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
              />
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

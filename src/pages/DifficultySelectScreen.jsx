import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import {
  confirmDifficulty,
  goBackFromDifficulty,
  openEnemyDeckPreview,
} from '../services/uiMainCore.js';

// 難易度レベル定数
const DIFFICULTY = {
  BEGINNER: 1, // 初級
  INTERMEDIATE: 2, // 中級
  ADVANCED: 3, // 上級
};

export default function DifficultySelectScreen() {
  const [renderVersion, setRenderVersion] = useState(0);

  const isFreeMode =
    typeof GameState !== 'undefined' && GameState.gameMode === 'free';

  // 高難易度イベントモードかどうかの判定
  const isHighDiffMode =
    typeof GameState !== 'undefined' &&
    GameState.gameMode?.startsWith('event_') &&
    GameState.gameMode?.endsWith('_high');

  useEffect(() => {
    const originalInit = window.initDifficultySelectScreenReact;
    window.initDifficultySelectScreenReact = () => {
      // 【CodeRabbit指摘反映】画面切り替え時やGameState.gameModeの変化を検知した際に、強制的に再描画して表示を同期する
      setRenderVersion((v) => v + 1);
    };

    return () => {
      window.initDifficultySelectScreenReact = originalInit;
    };
  }, []);

  const handleSelect = (level) => {
    confirmDifficulty?.(level);
  };

  // 高難易度イベント用の背景スタイル
  const highDiffBgStyle = isHighDiffMode
    ? {
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {};

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
        {/* 高難易度イベントモードでは「超級」のみ表示 */}
        {isHighDiffMode ? (
          <div className="difficulty-button-row">
            <button
              className="btn"
              style={{ background: '#9333ea' }}
              onClick={() => handleSelect(DIFFICULTY.ADVANCED)}
            >
              超級
            </button>
            <button
              className="btn-check-deck"
              style={{ display: 'flex' }}
              onClick={() => openEnemyDeckPreview?.('high')}
              title="デッキ確認"
            >
              🔍
            </button>
          </div>
        ) : (
          <>
            <div className="difficulty-button-row">
              <button
                className="btn"
                style={{ background: '#22c55e' }}
                onClick={() => handleSelect(DIFFICULTY.BEGINNER)}
              >
                初級
              </button>
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
              <button
                className="btn"
                style={{ background: '#eab308' }}
                onClick={() => handleSelect(DIFFICULTY.INTERMEDIATE)}
              >
                中級
              </button>
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
              <button
                className="btn"
                style={{ background: '#ef4444' }}
                onClick={() => handleSelect(DIFFICULTY.ADVANCED)}
              >
                上級
              </button>
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

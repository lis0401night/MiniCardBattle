import React from 'react';

import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import {
  confirmDifficulty,
  goBackFromDifficulty,
  openEnemyDeckPreview,
} from '../services/uiMainCore.js';

export default function DifficultySelectScreen() {
  const [isFreeMode, setIsFreeMode] = React.useState(() =>
    typeof GameState !== 'undefined' ? GameState.gameMode === 'free' : false
  );

  // 高難易度イベントモードかどうかの判定
  const [isHighDiffMode, setIsHighDiffMode] = React.useState(
    () =>
      typeof GameState !== 'undefined' &&
      GameState.gameMode?.startsWith('event_') &&
      GameState.gameMode?.endsWith('_high')
  );

  React.useEffect(() => {
    const updateMode = () => {
      setIsFreeMode(GameState.gameMode === 'free');
      setIsHighDiffMode(
        GameState.gameMode?.startsWith('event_') &&
          GameState.gameMode?.endsWith('_high')
      );
    };
    // 画面遷移などで変更された際に強制検知させる（簡易ポーリングまたはイベント等の代替）
    const interval = setInterval(updateMode, 500);
    return () => clearInterval(interval);
  }, []);

  const handleSelect = (level) => {
    if (confirmDifficulty) {
      confirmDifficulty(level);
    }
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
              onClick={() => handleSelect(3)}
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
                onClick={() => handleSelect(1)}
              >
                初級
              </button>
              {isFreeMode && (
                <button
                  className="btn-check-deck"
                  style={{ display: 'flex' }}
                  onClick={() => openEnemyDeckPreview?.(1)}
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
                onClick={() => handleSelect(2)}
              >
                中級
              </button>
              {isFreeMode && (
                <button
                  className="btn-check-deck"
                  style={{ display: 'flex' }}
                  onClick={() => openEnemyDeckPreview?.(2)}
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
                onClick={() => handleSelect(3)}
              >
                上級
              </button>
              {isFreeMode && (
                <button
                  className="btn-check-deck"
                  style={{ display: 'flex' }}
                  onClick={() => openEnemyDeckPreview?.(3)}
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

import React from 'react';

import { switchScreen } from '../utils/gameUtils.js';
import {
  goBackFromDifficulty,
  confirmDifficulty,
  openEnemyDeckPreview,
} from '../hooks/uiMainCore.js';

export default function DifficultySelectScreen() {
  const [isFreeMode, setIsFreeMode] = React.useState(false);

  React.useEffect(() => {
    const updateMode = () => setIsFreeMode(GameState.gameMode === 'free');
    updateMode();
    // 画面遷移などで変更された際に強制検知させる（簡易ポーリングまたはイベント等の代替）
    const interval = setInterval(updateMode, 500);
    return () => clearInterval(interval);
  }, []);

  const handleSelect = (level) => {
    if (confirmDifficulty) {
      confirmDifficulty(level);
    }
  };

  return (
    <div id="screen-difficulty" className="screen active">
      <h2 style={{ fontWeight: 900 }}>難易度</h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '100%',
          alignItems: 'center',
        }}
      >
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
      </div>
      <button
        className="btn"
        style={{ marginTop: '30px', background: '#475569' }}
        onClick={() => {
          if (goBackFromDifficulty) goBackFromDifficulty();
          else switchScreen?.('screen-select');
        }}
      >
        戻る
      </button>
    </div>
  );
}

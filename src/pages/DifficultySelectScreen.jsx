import { useEffect, useReducer, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import { getScreenBackgroundStyle } from '../utils/constants/config.js';
import {
  confirmDifficulty,
  goBackFromDifficulty,
  openEnemyDeckPreview,
} from '../services/uiMainCore.js';
import MenuButton from '../components/common/MenuButton.jsx';
import MissionListModal from '../components/battle/MissionListModal.jsx';
import { SOUNDS } from '../utils/sounds.js';
import { playSound } from '../utils/gameUtils.js';

// 難易度レベル定数
const DIFFICULTY = {
  BEGINNER: 1, // 初級
  INTERMEDIATE: 2, // 中級
  ADVANCED: 3, // 上級
};

export default function DifficultySelectScreen() {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const [showMissions, setShowMissions] = useState(false);

  const isFreeMode =
    typeof GameState !== 'undefined' && GameState.gameMode === 'free';

  // 高難易度イベントモードかどうかの判定
  const isHighDiffMode =
    typeof GameState !== 'undefined' &&
    GameState.gameMode?.startsWith('event_') &&
    GameState.gameMode?.endsWith('_high');

  // チャレンジミッションはストーリー・フリー対戦でのみ機能する
  const showMissionButton =
    typeof GameState !== 'undefined' &&
    (GameState.gameMode === 'story' || GameState.gameMode === 'free');

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

  const renderMissionButton = () =>
    showMissionButton && (
      <button
        className="btn-check-deck"
        style={{ display: 'flex', left: 'calc(50% - 148px)' }}
        onClick={(e) => {
          e.stopPropagation();
          playSound(SOUNDS.seClick);
          setShowMissions(true);
        }}
        title="ミッション確認"
      >
        📋
      </button>
    );

  // 高難易度イベントおよび通常難易度選択用の背景スタイル
  const highDiffBgStyle = getScreenBackgroundStyle(
    isHighDiffMode
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
            <MenuButton
              label="超級"
              variant="purple"
              onClick={() => handleSelect(DIFFICULTY.ADVANCED)}
            />
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
              {renderMissionButton()}
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
              {renderMissionButton()}
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
              {renderMissionButton()}
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

      {showMissions && <MissionListModal onClose={() => setShowMissions(false)} />}
    </div>
  );
}

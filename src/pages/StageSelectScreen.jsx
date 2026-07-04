import { useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import { confirmStageSelect, goBackFromStage } from '../services/uiMainCore.js';
import { STAGES } from '../utils/constants/stages.js';
import { appendVersionQuery } from '../utils/constants/config.js';

export default function StageSelectScreen() {
  const [stages] = useState(() => {
    const stagesObj = STAGES || {};
    return Object.keys(stagesObj).map((id) => ({
      id,
      ...stagesObj[id],
    }));
  });

  const handleSelect = (stageId) => {
    if (confirmStageSelect) {
      confirmStageSelect(stageId);
    }
  };

  const getBackgroundImage = () => {
    // 新規デッキ作成中はgameModeが'create_deck'になるため、元のモードを参照する
    const mode =
      GameState.gameMode === 'create_deck'
        ? GameState.prevGameModeForCreate || 'free_deck_edit'
        : GameState.gameMode;

    if (mode === 'tournament') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_tournament01.png')}')`;
    } else if (mode === 'defense_register' || mode === 'defense_attack') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_defense.png')}')`;
    } else if (mode === 'battle_dungeon') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_challenge.png')}')`;
    } else if (mode === 'online_deck_edit') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_online.png')}')`;
    } else if (mode?.startsWith('event_') && mode?.endsWith('_high')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_highdifficulty.png')}')`;
    } else if (mode && mode.startsWith('story')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_story01.png')}')`;
    }
    return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_select.png')}')`;
  };

  return (
    <div
      id="screen-stage-select"
      className="screen active"
      style={{
        backgroundImage: getBackgroundImage(),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2>ステージ選択</h2>

      <div className="select-scroll-area">
        <div className="char-grid" id="stage-grid">
          {/* ランダムステージの特別表示 */}
          <div
            className="char-card"
            style={{ backgroundColor: '#000000', backgroundImage: 'none' }}
            onClick={() => handleSelect('random')}
          >
            <div
              style={{
                position: 'absolute',
                width: '150%',
                height: '150%',
                top: '-25%',
                left: '-25%',
                background:
                  'radial-gradient(circle, rgba(255,255,255,0.4) 10%, rgba(255,255,255,0) 60%)',
                filter: 'blur(10px)',
                pointerEvents: 'none',
              }}
            ></div>
            <div className="char-name" style={{ color: '#ffffff', zIndex: 2 }}>
              ランダム
            </div>
          </div>

          {/* 各ステージの表示 */}
          {stages.map((stage) => {
            if (stage.id === 'random') return null;
            return (
              <div
                key={stage.id}
                className="char-card"
                style={{
                  backgroundImage: `url('${appendVersionQuery(`assets/backgrounds/background_${stage.id}.png`)}')`,
                }}
                onClick={() => handleSelect(stage.id)}
              >
                <div
                  className="char-name"
                  style={{ color: '#ffffff', zIndex: 2 }}
                >
                  {stage.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BackButton
        onClick={() => goBackFromStage?.()}
        style={{ marginTop: '20px' }}
      />
    </div>
  );
}

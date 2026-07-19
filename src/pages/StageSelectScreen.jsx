import { useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import { confirmStageSelect, goBackFromStage } from '../services/uiMainCore.js';
import { STAGES } from '../utils/constants/stages.js';
import { appendVersionQuery } from '../utils/constants/config.js';

export default function StageSelectScreen() {
  const [stages] = useState(() => {
    const stagesObj = STAGES || {};
    let unlockedStages = [];
    try {
      const unlockedStagesRaw = localStorage.getItem(
        'mini_card_battle_unlocked_stages'
      );
      const parsed = unlockedStagesRaw ? JSON.parse(unlockedStagesRaw) : [];
      unlockedStages = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to parse unlocked stages:', e);
      unlockedStages = [];
    }

    return Object.keys(stagesObj)
      .filter((id) => {
        if (id === 'automata' && !unlockedStages.includes('automata')) {
          return false;
        }
        return true;
      })
      .map((id) => ({
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
    // 新規デッキ作成時はgameModeが'create_deck'になるため、前回のモードを参照する
    const mode =
      GameState.gameMode === 'create_deck'
        ? GameState.prevGameModeForCreate || 'free_deck_edit'
        : GameState.gameMode;

    const MODE_BACKGROUND_FILES = {
      tournament: 'assets/backgrounds/background_tournament01.webp',
      defense_register: 'assets/backgrounds/background_defense.webp',
      defense_attack: 'assets/backgrounds/background_defense.webp',
      battle_dungeon: 'assets/backgrounds/background_challenge.webp',
      online_deck_edit: 'assets/backgrounds/background_online.webp',
    };

    let bgFile = MODE_BACKGROUND_FILES[mode];
    if (!bgFile) {
      if (mode?.startsWith('event_') && mode?.endsWith('_high')) {
        bgFile = 'assets/backgrounds/background_highdifficulty.webp';
      } else if (mode?.startsWith('event_') && mode?.endsWith('_fortune')) {
        bgFile = 'assets/backgrounds/background_fortune01.webp';
      } else if (mode && mode.startsWith('story')) {
        bgFile = 'assets/backgrounds/background_story01.webp';
      } else {
        bgFile = 'assets/backgrounds/background_select.webp';
      }
    }
    return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery(bgFile)}')`;
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
                  backgroundImage: `url('${appendVersionQuery(`assets/backgrounds/background_${stage.id}.webp`)}')`,
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

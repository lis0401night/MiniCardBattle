import React, { useState, useEffect } from 'react';

import { STAGES } from '../utils/constants/stages.js';
import { switchScreen } from '../utils/gameUtils.js';
import { goBackFromStage, confirmStageSelect } from '../hooks/uiMainCore.js';

export default function StageSelectScreen() {
  const [stages, setStages] = useState([]);

  useEffect(() => {
    const stagesObj = STAGES || {};
    // stageId=plain がデフォルト
    const stageList = Object.keys(stagesObj).map(id => ({
      id,
      ...stagesObj[id]
    }));
    setStages(stageList);
  }, []);

  const handleSelect = (stageId) => {
    if (confirmStageSelect) {
      confirmStageSelect(stageId);
    }
  };

  // 開発者の要件：ストーリー中の各種画面の背景を background_story01.png にする
  const getBackgroundImage = () => {
    if (GameState.gameMode && GameState.gameMode.startsWith('story')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_story01.png')`;
    }
    return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_select.png')`;
  };

  return (
    <div id="screen-stage-select" className="screen active" style={{ backgroundImage: getBackgroundImage(), backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <h2>ステージ選択</h2>
      
      <div className="select-scroll-area">
        <div className="char-grid" id="stage-grid">
          {/* ランダムステージの特別表示 */}
          <div 
            className="char-card" 
            style={{ backgroundColor: '#000000', backgroundImage: 'none' }}
            onClick={() => handleSelect('random')}
          >
            <div style={{ position: 'absolute', width: '150%', height: '150%', top: '-25%', left: '-25%', background: 'radial-gradient(circle, rgba(255,255,255,0.4) 10%, rgba(255,255,255,0) 60%)', filter: 'blur(10px)', pointerEvents: 'none' }}></div>
            <div className="char-name" style={{ color: '#ffffff', zIndex: 2 }}>ランダム</div>
          </div>

          {/* 各ステージの表示 */}
          {stages.map(stage => {
            if (stage.id === 'random') return null;
            return (
              <div 
                key={stage.id}
                className="char-card"
                style={{ backgroundImage: `url('assets/backgrounds/background_${stage.id}.png')` }}
                onClick={() => handleSelect(stage.id)}
              >
                <div className="char-name" style={{ color: '#ffffff', zIndex: 2 }}>{stage.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className="btn"
        style={{ marginTop: '20px', background: '#475569' }}
        onClick={() => {
            if (goBackFromStage) goBackFromStage();
            else switchScreen?.('screen-difficulty');
        }}
      >
        戻る
      </button>
    </div>
  );
}

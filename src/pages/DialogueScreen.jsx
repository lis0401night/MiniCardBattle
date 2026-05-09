import { useEffect, useState } from 'react';

import { showNextDialogue } from '../hooks/uiDialogue.js';
import { GameState } from '../hooks/gameState.js';

export default function DialogueScreen() {
  const [dialogueData, setDialogueData] = useState(
    () => window.currentDialogueData || {}
  );

  useEffect(() => {
    // マウント時に最新データを確実に取得
    setDialogueData({ ...window.currentDialogueData });

    // uiDialogue.jsからReactの状態を更新するための内部関数を定義
    window._reactUpdateDialogueUI = (newData) => {
      setDialogueData((prev) => ({ ...prev, ...newData }));
    };

    return () => {
      window._reactUpdateDialogueUI = null;
    };
  }, []);

  const handleBoxClick = () => {
    if (d.choices) return;
    if (showNextDialogue) {
      showNextDialogue();
    }
  };

  const d = dialogueData;

  let bgName = 'background_select.png';
  if (GameState.gameMode === 'tournament') {
    if (GameState.appState === 'pre_dialogue') {
      bgName = 'background_tournament01.png';
    } else {
      bgName = 'background_tournament02.png';
    }
  } else if (
    GameState.gameMode === 'battle_dungeon' ||
    GameState.gameMode === 'dungeon'
  ) {
    bgName = 'background_challenge.png';
  } else if (GameState.gameMode === 'event_satan') {
    bgName = 'background_satan.png';
  } else if (GameState.gameMode === 'defense_attack') {
    bgName = 'background_defense.png';
  } else if (GameState.gameMode && GameState.gameMode.startsWith('story')) {
    bgName = 'background_story01.png';
  }

  return (
    <div
      id="screen-dialogue"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/${bgName}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* 暗転レイヤー */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'black',
          opacity: d.isFading ? 1 : 0,
          transition: 'opacity 0.4s ease',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      />

      {d.choices && d.choices.length > 0 && (
        <div
          className="dialogue-choices-container"
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            width: '90%',
            maxWidth: '500px',
            zIndex: 100,
          }}
        >
          {d.choices.map((choice, idx) => (
            <button
              key={idx}
              className="action-btn"
              style={{
                padding: '16px',
                fontSize: '1.2rem',
                whiteSpace: 'normal',
                height: 'auto',
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                border: '2px solid #cbd5e1',
                textAlign: 'center',
                borderRadius: '8px',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (window.handleDialogueChoice)
                  window.handleDialogueChoice(idx);
              }}
            >
              {choice.text}
            </button>
          ))}
        </div>
      )}

      <div
        className={`portrait-container ${d.centerMode || GameState.gameMode === 'campaign' ? 'center' : ''}`}
      >
        <img
          id="portrait-left"
          className={`char-portrait ${d.leftActive ? 'active' : ''}`}
          src={d.leftImage || undefined}
          alt="Player"
          style={{
            visibility: d.leftImage ? 'visible' : 'hidden',
            display: GameState.gameMode === 'campaign' ? 'none' : 'block',
          }}
        />
        <img
          id="portrait-right"
          className={`char-portrait ${d.rightActive ? 'active' : ''}`}
          src={d.rightImage || undefined}
          alt="Enemy"
          style={{
            filter: d.rightFilter || 'none',
            display:
              d.centerMode && GameState.gameMode !== 'campaign'
                ? 'none'
                : d.rightDisplay || 'block',
            visibility: d.rightImage ? 'visible' : 'hidden',
          }}
        />
      </div>
      <div
        className="dialogue-box"
        onClick={handleBoxClick}
        style={{ borderColor: d.boxBorderColor || '#475569' }}
      >
        <div id="speaker-name" style={{ color: d.nameColor || '#fff' }}>
          {d.speakerName || ''}
        </div>
        <div id="dialogue-text">{d.dialogueText || ''}</div>
      </div>
    </div>
  );
}

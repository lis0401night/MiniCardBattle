import { useEffect, useState } from 'react';

import { showNextDialogue } from '../services/uiDialogue.js';
import { GameState } from '../state/gameState.js';

export default function DialogueScreen() {
  const [dialogueData, setDialogueData] = useState(
    () => window.currentDialogueData || {}
  );

  const d = dialogueData;
  const isSatanCastleStill = d.stillEffect === 'satan_castle';
  const stillStep = d.stillStep !== undefined ? d.stillStep : 0;

  const [backviewSrc, setBackviewSrc] = useState('');

  useEffect(() => {
    if (isSatanCastleStill) {
      const charId = GameState.playerConfig?.id || 'knight';
      setBackviewSrc(`assets/still/backview_${charId}.png`);
    }
  }, [isSatanCastleStill, GameState.playerConfig?.id]);

  const handleBackviewError = () => {
    if (backviewSrc && backviewSrc !== 'assets/still/backview_knight.png') {
      setBackviewSrc('assets/still/backview_knight.png');
    }
  };

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
  } else if (GameState.gameMode === 'event_satan_high') {
    bgName = 'background_satan.png';
    // 高難易度モード（通常・イベント）用の背景
  } else if (
    GameState.gameMode === 'high_difficulty' ||
    (GameState.gameMode &&
      GameState.gameMode.startsWith('event_') &&
      GameState.gameMode.endsWith('_high'))
  ) {
    bgName = 'background_highdifficulty.png';
  } else if (GameState.gameMode === 'defense_attack') {
    bgName = 'background_defense.png';
  } else if (GameState.gameMode && GameState.gameMode.startsWith('story')) {
    // 魔王城到着後（第6戦の勝利後、すなわち第7戦ゼノン以降）は background_story02.png を使用
    if (GameState.battleCount >= 7) {
      bgName = 'background_story02.png';
    } else {
      bgName = 'background_story01.png';
    }
  }

  return (
    <div
      id="screen-dialogue"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/${bgName}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 魔王城スチル演出用レイヤー */}
      {isSatanCastleStill && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url('assets/still/still_satancastle.png')`,
            backgroundSize: '150% auto',
            backgroundPosition: `center ${stillStep === 0 ? '100%' : '0%'}`,
            transition:
              'background-position 7.6s cubic-bezier(0.25, 0.8, 0.25, 1)',
            zIndex: 1,
          }}
        />
      )}

      {/* プレイヤーの後ろ姿（パララックス効果） */}
      {isSatanCastleStill && backviewSrc && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '5%',
            height: '60vh',
            zIndex: 2,
            pointerEvents: 'none',
            transform: `translateX(-50%) translateY(${
              stillStep === 0 ? '0px' : '260px'
            }) scale(${stillStep === 0 ? '1.1' : '0.9'})`,
            opacity: 1.0,
            transition: 'transform 7.6s cubic-bezier(0.25, 0.8, 0.25, 1)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <img
            src={backviewSrc}
            alt="Player Backview"
            onError={handleBackviewError}
            style={{
              height: '100%',
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 15px 15px rgba(0,0,0,0.6))',
            }}
          />
        </div>
      )}

      {/* 画面上部の黒シャドウ（スクロールに合わせて晴れる） */}
      {isSatanCastleStill && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '40%',
            background:
              'linear-gradient(to bottom, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0))',
            zIndex: 3,
            pointerEvents: 'none',
            opacity: stillStep === 0 ? 1 : 0,
            transition: 'opacity 7.6s cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        />
      )}
      {/* 暗闇から目を覚ますシネマティックフェードインのための黒幕オーバーレイ */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          opacity: d.blackScreen ? 1 : 0,
          transition: 'opacity 1.5s cubic-bezier(0.25, 1, 0.5, 1)',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      />

      {/* 暗転レイヤー (話者切り替え時のフェード用) */}
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
        style={{
          display: isSatanCastleStill ? 'none' : 'flex',
          opacity: d.blackScreen ? 0 : 1,
          transition: 'opacity 1.5s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: d.blackScreen ? 'none' : 'auto',
          zIndex: 5,
        }}
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
            filter:
              d.rightFilter && d.rightFilter !== 'none'
                ? d.rightFilter
                : undefined,
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
        style={{
          borderColor: d.boxBorderColor || '#475569',
          zIndex: 20,
          opacity: d.hideBox ? 0 : 1,
          pointerEvents: d.hideBox ? 'none' : 'auto',
          transition: 'opacity 0.5s ease',
        }}
      >
        <div id="speaker-name" style={{ color: d.nameColor || '#fff' }}>
          {d.speakerName || ''}
        </div>
        <div id="dialogue-text">{d.dialogueText || ''}</div>
      </div>
    </div>
  );
}

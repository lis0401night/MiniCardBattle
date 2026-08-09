import { useEffect, useState } from 'react';

import { showNextDialogue, skipStoryDialogue } from '../services/uiDialogue.js';
import { GameState } from '../state/gameState.js';
import { appendVersionQuery } from '../utils/constants/config.js';
import { STAGES } from '../utils/constants/stages.js';
import { checkIsFortuneMode, checkIsHighDiffMode } from '../utils/gameUtils.js';

/**
 * ダイアログ（会話）画面コンポーネント
 * ストーリーや各イベント、試練の宮殿等の会話演出を表示する。
 * @returns {JSX.Element} 会話画面コンポーネント
 */
export default function DialogueScreen() {
  const [dialogueData, setDialogueData] = useState(
    () => window.currentDialogueData || {}
  );

  const d = dialogueData;
  const isSatanCastleStill = d.stillEffect === 'satan_castle';
  const stillStep = d.stillStep !== undefined ? d.stillStep : 0;

  const isStoryMode = GameState.gameMode === 'story';
  const isStillShowing = !!(isSatanCastleStill || d.stillEffect || d.hideBox);
  const isValidState =
    GameState.appState === 'story_intro' ||
    GameState.appState === 'dungeon_intro_dialogue' ||
    GameState.appState === 'dungeon_talk_dialogue' ||
    (GameState.appState === 'pre_dialogue' &&
      !GameState.isSimplifiedDialogue) ||
    (GameState.appState === 'post_dialogue' &&
      GameState.lastBattleResult === 'win');
  const isAfterSatanDefeated =
    GameState.battleCount >= 10 &&
    GameState.appState === 'post_dialogue' &&
    GameState.lastBattleResult === 'win';
  const showSkipButton =
    isStoryMode && !isStillShowing && isValidState && !isAfterSatanDefeated;

  const [backviewSrc, setBackviewSrc] = useState('');

  useEffect(() => {
    if (isSatanCastleStill) {
      const charId = GameState.playerConfig?.id || 'knight';
      setBackviewSrc(`assets/still/backview_${charId}.webp`);
    }
  }, [isSatanCastleStill]);

  const handleBackviewError = () => {
    if (backviewSrc && backviewSrc !== 'assets/still/backview_knight.webp') {
      setBackviewSrc('assets/still/backview_knight.webp');
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

  let bgName = 'background_select.webp';
  if (GameState.gameMode === 'tournament') {
    if (GameState.appState === 'pre_dialogue') {
      bgName = 'background_tournament01.webp';
    } else {
      bgName = 'background_tournament02.webp';
    }
  } else if (
    GameState.gameMode === 'battle_dungeon' ||
    GameState.gameMode === 'dungeon'
  ) {
    if (GameState.appState === 'dungeon_intro_dialogue') {
      bgName = 'background_challenge02.webp';
    } else {
      bgName = 'background_challenge.webp';
    }
  } else if (GameState.gameMode === 'event_satan_high') {
    bgName = 'background_satan.webp';
    // 高難易度モード（通常・イベント）用の背景
  } else if (
    GameState.gameMode === 'high_difficulty' ||
    checkIsHighDiffMode(GameState.gameMode)
  ) {
    bgName = 'background_highdifficulty.webp';
  } else if (checkIsFortuneMode(GameState.gameMode)) {
    // 運命の邂逅イベント：対戦相手固有のステージ背景を優先参照する。
    // 背景画像はCSS背景のためonErrorで救済できない。STAGESに定義済みのIDのみ採用する。
    const candidateId =
      GameState.selectedStageId ||
      GameState.enemyConfig?.stageId ||
      GameState.enemyConfig?.id;
    const stageId =
      candidateId && STAGES?.[candidateId] ? candidateId : 'fortune01';
    bgName = `background_${stageId}.webp`;
  } else if (GameState.gameMode === 'defense_attack') {
    bgName = 'background_defense.webp';
  } else if (GameState.gameMode && GameState.gameMode.startsWith('story')) {
    // 魔王城到着後（第6戦の勝利後、すなわち第7戦ゼノン以降）は background_story02.webp を使用
    if (GameState.battleCount >= 7) {
      bgName = 'background_story02.webp';
    } else {
      bgName = 'background_story01.webp';
    }
  }

  return (
    <div
      id="screen-dialogue"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery(`assets/backgrounds/${bgName}`)}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ストーリー会話スキップボタン */}
      {showSkipButton && (
        <div
          id="dialogue-skip-button"
          onClick={(e) => {
            e.stopPropagation();
            skipStoryDialogue();
          }}
          style={{
            position: 'absolute',
            top: '24px',
            right: '24px',
            color: '#ffffff',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 1000,
            animation: 'blink 1.5s infinite',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          SKIP►
        </div>
      )}

      {/* 魔王城スチル演出用レイヤー */}
      {isSatanCastleStill && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url('assets/still/still_satancastle.webp')`,
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
            height: '60dvh',
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
            alt="プレイヤーの後ろ姿"
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
        className={`portrait-container ${d.centerMode ? 'center' : ''}`}
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
          alt=""
          style={{
            display: d.leftImage ? 'block' : 'none',
            visibility: d.leftImage ? 'visible' : 'hidden',
          }}
        />
        <img
          id="portrait-right"
          className={`char-portrait ${d.rightActive ? 'active' : ''}`}
          src={d.rightImage || undefined}
          alt=""
          style={{
            filter:
              d.rightFilter && d.rightFilter !== 'none'
                ? d.rightFilter
                : undefined,
            display:
              d.centerMode || !d.rightImage || d.rightDisplay === 'none'
                ? 'none'
                : 'block',
            visibility:
              d.rightImage && d.rightDisplay !== 'none' ? 'visible' : 'hidden',
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

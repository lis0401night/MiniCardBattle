import { useEffect } from 'react';

import { initBattleDungeon } from '../hooks/battleDungeon.js';
import { GameState } from '../hooks/gameState.js';
import { showDungeonRules, showEventMenu } from '../hooks/uiMainCore.js';
import { showAlertModal } from '../hooks/uiModals.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function DungeonMenuScreen() {
  useEffect(() => {
    GameState.gameMode = 'battle_dungeon_menu';
  }, []);

  const handleExchangeClick = () => {
    playSound(SOUNDS.seClick);
    if (window.switchScreen) window.switchScreen('screen-challenge-exchange');
  };

  const handleUnlockClick = () => {
    playSound(SOUNDS.seClick);
    if (window.switchScreen) window.switchScreen('screen-challenge-unlock');
  };

  const handleChallengeClick = () => {
    playSound(SOUNDS.seClick);
    GameState.gameMode = 'battle_dungeon';
    initBattleDungeon();
  };

  return (
    <div
      id="screen-dungeon-menu"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_challenge.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#c084fc',
          marginBottom: '30px',
          textShadow: '0 0 15px rgba(192, 132, 252, 0.6)',
        }}
      >
        試練の宮殿
      </h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '250px',
        }}
      >
        <button
          className="btn btn-yellow"
          onClick={() =>
            showDungeonRules
              ? showDungeonRules()
              : showAlertModal('ルールは準備中です')
          }
        >
          ルール
        </button>
        <button
          className="btn"
          style={{ background: 'linear-gradient(45deg, #a855f7, #7e22ce)' }}
          onClick={handleChallengeClick}
        >
          挑戦
        </button>

        <button
          className="btn"
          style={{ background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)' }}
          onClick={() => {
            playSound(SOUNDS.seClick);
            if (window.switchScreen)
              window.switchScreen('screen-challenge-unlock');
          }}
        >
          開放
        </button>

        <button
          className="btn"
          style={{ background: 'linear-gradient(45deg, #f97316, #ea580c)' }}
          onClick={handleExchangeClick}
        >
          交換所
        </button>
      </div>
      <button
        className="btn"
        style={{ marginTop: '40px', background: '#475569' }}
        onClick={() => {
          showEventMenu?.();
        }}
      >
        戻る
      </button>
    </div>
  );
}

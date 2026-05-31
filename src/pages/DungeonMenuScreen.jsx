import { useEffect } from 'react';

import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import { initBattleDungeon } from '../game/battleDungeon.js';
import { GameState } from '../state/gameState.js';
import { showDungeonRules, showEventMenu } from '../services/uiMainCore.js';
import { showAlertModal } from '../services/uiModals.js';
import { switchScreen } from '../utils/gameUtils.js';

export default function DungeonMenuScreen() {
  useEffect(() => {
    GameState.gameMode = 'battle_dungeon_menu';
  }, []);

  const handleExchangeClick = () => {
    switchScreen('screen-challenge-exchange');
  };

  const handleUnlockClick = () => {
    switchScreen('screen-challenge-unlock');
  };

  const handleChallengeClick = () => {
    GameState.gameMode = 'battle_dungeon';
    initBattleDungeon();
  };

  return (
    <ScreenLayout
      id="screen-dungeon-menu"
      backgroundImage="background_challenge.png"
      title="試練の宮殿"
      titleColor="#c084fc"
      titleGlow={true}
      onBackClick={() => showEventMenu?.()}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '250px',
        }}
      >
        <MenuButton
          label="ルール"
          variant="yellow"
          onClick={() =>
            showDungeonRules
              ? showDungeonRules()
              : showAlertModal('ルールは準備中です')
          }
        />
        <MenuButton
          label="挑戦"
          variant="purple"
          onClick={handleChallengeClick}
        />
        <MenuButton label="開放" variant="blue" onClick={handleUnlockClick} />
        <MenuButton
          label="交換所"
          variant="orange"
          onClick={handleExchangeClick}
        />
      </div>
    </ScreenLayout>
  );
}

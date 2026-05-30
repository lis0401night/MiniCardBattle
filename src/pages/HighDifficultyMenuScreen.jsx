import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import {
  showEventMenu,
  showHighDifficultyRules,
} from '../services/uiMainCore.js';
import { switchScreen } from '../utils/gameUtils.js';

export default function HighDifficultyMenuScreen() {
  const handleChallengeClick = () => {
    if (typeof switchScreen === 'function') {
      switchScreen('screen-high-difficulty');
    }
  };

  return (
    <ScreenLayout
      id="screen-high-difficulty-menu"
      backgroundImage="background_highdifficulty.png"
      title="高難易度"
      titleColor="#ef4444"
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
          onClick={() => showHighDifficultyRules?.()}
        />
        <MenuButton label="挑戦" variant="red" onClick={handleChallengeClick} />
      </div>
    </ScreenLayout>
  );
}

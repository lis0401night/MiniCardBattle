import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import {
  showEventMenu,
  showHighDifficultyRules,
  showHighDifficultyRanking,
  showHighDifficultyExchange,
} from '../services/uiMainCore.js';
import { switchScreen } from '../utils/gameUtils.js';

/**
 * 高難易度イベントのトップメニュー画面コンポーネント。
 * ルール確認、ランキング、バトル挑戦、交換所への遷移を提供する。
 *
 * @returns {JSX.Element} 高難易度メニュー画面
 */
export default function HighDifficultyMenuScreen() {
  const handleChallengeClick = () => {
    switchScreen?.('screen-high-difficulty');
  };

  return (
    <ScreenLayout
      id="screen-high-difficulty-menu"
      backgroundImage="background_highdifficulty.webp"
      title="高難易度"
      titleColor="#ef4444"
      titleGlow={true}
      onBackClick={() => showEventMenu?.()}
    >
      <div className="menu-button-container">
        <MenuButton
          label="ルール"
          variant="yellow"
          onClick={() => showHighDifficultyRules?.()}
        />
        <MenuButton
          label="ランキング"
          variant="blue"
          onClick={() => showHighDifficultyRanking?.()}
        />
        <MenuButton label="挑戦" variant="red" onClick={handleChallengeClick} />
        <MenuButton
          label="交換所"
          variant="orange"
          onClick={() => showHighDifficultyExchange?.()}
        />
      </div>
    </ScreenLayout>
  );
}

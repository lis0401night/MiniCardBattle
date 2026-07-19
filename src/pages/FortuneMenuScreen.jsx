import MenuButton from '../components/common/MenuButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { switchScreen } from '../utils/gameUtils.js';
import {
  showEventMenu,
  showFortune,
  showFortuneExchange,
  showFortuneRules,
} from '../services/uiMainCore.js';

export default function FortuneMenuScreen() {
  return (
    <ScreenLayout
      id="screen-fortune-menu"
      backgroundImage="background_fortune01.webp"
      title="運命の邂逅"
      titleColor="#f97316"
      titleGlow={true}
      onBackClick={() => showEventMenu?.()}
    >
      <div className="menu-button-container">
        <MenuButton
          label="ルール"
          variant="yellow"
          onClick={() => showFortuneRules?.()}
        />
        <MenuButton
          label="ランキング"
          variant="blue"
          onClick={() => switchScreen?.('screen-fortune-ranking')}
        />
        <MenuButton
          label="挑戦"
          variant="red"
          onClick={() => showFortune?.()}
        />
        <MenuButton
          label="交換所"
          variant="orange"
          onClick={() => showFortuneExchange?.()}
        />
      </div>
    </ScreenLayout>
  );
}

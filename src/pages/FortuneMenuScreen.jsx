import MenuButton from '../components/common/MenuButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { showEventMenu, showFortune } from '../services/uiMainCore.js';

export default function FortuneMenuScreen() {
  return (
    <ScreenLayout
      id="screen-fortune-menu"
      backgroundImage=""
      title="運命の邂逅"
      titleColor="#f97316"
      titleGlow={true}
      onBackClick={() => showEventMenu?.()}
    >
      <div className="menu-button-container">
        <MenuButton
          label="ルール"
          variant="yellow"
          onClick={() => {
            // TODO: ルール画面の実装
          }}
        />
        <MenuButton
          label="ランキング"
          variant="blue"
          onClick={() => {
            // TODO: ランキング画面の実装
          }}
        />
        <MenuButton
          label="挑戦"
          variant="red"
          onClick={() => showFortune?.()}
        />
        <MenuButton
          label="交換所"
          variant="orange"
          onClick={() => {
            // TODO: 交換所画面の実装
          }}
        />
      </div>
    </ScreenLayout>
  );
}

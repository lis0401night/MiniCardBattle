import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import { goToModeSelect, startGameMode } from '../services/uiMainCore.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';

/**
 * ソロモードメニュー画面
 */
export default function SoloMenuScreen() {
  const images = UI_IMAGES || {};

  return (
    <ScreenLayout
      id="screen-solo-menu"
      backgroundImage="background_select.webp"
      title="ソロモード"
      titleColor="#facc15"
      onBackClick={() => goToModeSelect?.()}
      backHasBorder={true}
    >
      <div className="menu-btn-grid">
        <MenuImageButton
          label="ストーリー"
          image={images.MENU_STORY}
          onClick={() => startGameMode?.('story')}
          badgeText="勝利でカードGET"
        />
        <MenuImageButton
          label="フリーバトル"
          image={images.MENU_FREE}
          onClick={() => startGameMode?.('free')}
          badgeText="勝利でカードGET"
        />
        <MenuImageButton
          label="プラクティス"
          image={images.MENU_PRACTICE}
          onClick={() => startGameMode?.('practice')}
        />
      </div>
    </ScreenLayout>
  );
}

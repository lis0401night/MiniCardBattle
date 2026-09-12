import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import {
  goToModeSelect,
  showRules,
  showTutorialSelect,
  startGameMode,
} from '../services/uiMainCore.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';

/**
 * ソロモードメニュー画面
 * ルール、チュートリアル、ストーリー、フリーバトル、プラクティスへの遷移を提供する。
 * @returns {import('react').ReactElement} ソロモードメニュー画面
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
        {/* ルールボタン */}
        <MenuImageButton
          label="ルール"
          image={images.GUIDE_RULES}
          onClick={() => showRules?.()}
        />

        {/* チュートリアルボタン */}
        <MenuImageButton
          label="チュートリアル"
          image={images.GUIDE_TUTORIAL}
          onClick={() => showTutorialSelect?.()}
        />

        {/* ストーリーボタン */}
        <MenuImageButton
          label="ストーリー"
          image={images.MENU_STORY}
          onClick={() => startGameMode?.('story')}
          badgeText="勝利でカードGET"
        />

        {/* フリーバトルボタン */}
        <MenuImageButton
          label="フリーバトル"
          image={images.MENU_FREE}
          onClick={() => startGameMode?.('free')}
          badgeText="勝利でカードGET"
        />

        {/* プラクティスボタン */}
        <MenuImageButton
          label="プラクティス"
          image={images.MENU_PRACTICE}
          onClick={() => startGameMode?.('practice')}
        />
      </div>
    </ScreenLayout>
  );
}

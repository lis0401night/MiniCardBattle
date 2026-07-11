import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import {
  goToModeSelect,
  showRules,
  showTutorialSelect,
} from '../services/uiMainCore.js';

/**
 * 「遊び方」画面
 * モード選択から遷移し、「ルール」「チュートリアル」のサブメニューを表示する
 * 各種画像パスは UI_IMAGES 定数を参照して共通化を徹底。
 */
export default function BeginnerGuideScreen() {
  const images = UI_IMAGES || {};

  return (
    <ScreenLayout
      id="screen-beginner-guide"
      backgroundImage="background_select.webp"
      title="遊び方"
      titleColor="#facc15"
      onBackClick={() => goToModeSelect?.()}
      backHasBorder={true}
    >
      <div className="menu-btn-grid">
        {/* 遊び方ボタン */}
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
      </div>
    </ScreenLayout>
  );
}

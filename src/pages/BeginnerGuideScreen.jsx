import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { goToModeSelect } from '../services/uiMainCore.js';

/**
 * 「遊び方」画面
 * モード選択画面から遷移する。
 * ※「ルール」「チュートリアル」ボタンはソロモードへ移動したため、現在はメニュー準備中。
 * @returns {import('react').ReactElement} 遊び方画面
 */
export default function BeginnerGuideScreen() {
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
        {/* ルール・チュートリアルボタンはソロモードメニューへ移動済み */}
      </div>
    </ScreenLayout>
  );
}

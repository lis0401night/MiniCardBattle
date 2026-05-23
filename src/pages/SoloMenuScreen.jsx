import { useState } from 'react';

import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import { goToModeSelect, startGameMode } from '../hooks/uiMainCore.js';
import { showConfirmModal } from '../hooks/uiModals.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';

export default function SoloMenuScreen() {
  const images = UI_IMAGES || {};
  const [clickCount, setClickCount] = useState(0);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 10) {
      showConfirmModal('キャンペーンモードを開始しますか？', () => {
        startGameMode?.('campaign');
      });
      setClickCount(0);
    }
  };

  return (
    <ScreenLayout
      id="screen-solo-menu"
      backgroundImage="background_select.png"
      title="ソロモード"
      titleColor="#facc15"
      onTitleClick={handleTitleClick}
      onBackClick={() => goToModeSelect?.()}
      backHasBorder={true}
    >
      <div className="menu-btn-grid">
        <MenuImageButton
          label="ストーリー"
          image={images.MENU_STORY}
          onClick={() => startGameMode?.('story')}
        />
        <MenuImageButton
          label="フリーバトル"
          image={images.MENU_FREE}
          onClick={() => startGameMode?.('free')}
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

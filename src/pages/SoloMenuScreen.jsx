import { useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { goToModeSelect, startGameMode } from '../services/uiMainCore.js';
import { showConfirmModal } from '../services/uiModals.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { GameState } from '../state/gameState.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { setupDialogueScreen } from '../services/uiDialogue.js';
import { getDialogue, playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * ソロモードメニュー画面
 * useEasterEggカスタムフックにより、イースターエッグ（キャンペーンモード起動）の処理を共通化。
 */
export default function SoloMenuScreen() {
  const images = UI_IMAGES || {};

  const handleTitleClick = useEasterEgg(() => {
    showConfirmModal('キャンペーンモードを開始しますか？', () => {
      startGameMode?.('campaign');
    });
  });

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

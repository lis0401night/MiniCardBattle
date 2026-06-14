import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { goToModeSelect, startGameMode } from '../services/uiMainCore.js';
import { showConfirmModal } from '../services/uiModals.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import MatchingScreen from '../components/battle/MatchingScreen.jsx';
import React, { useState } from 'react';
import { CHARACTERS } from '../utils/constants/characters.js';

/**
 * ソロモードメニュー画面
 * useEasterEggカスタムフックにより、イースターエッグ（キャンペーンモード起動）の処理を共通化。
 */
export default function SoloMenuScreen() {
  const images = UI_IMAGES || {};
  const [showMatchingTest, setShowMatchingTest] = useState(false);
  const [testEnemyId, setTestEnemyId] = useState('android');
  const [testEnemySkinId, setTestEnemySkinId] = useState('default');
  
  const selectedEnemy = CHARACTERS[testEnemyId];
  const availableSkins = selectedEnemy?.skins ? Object.keys(selectedEnemy.skins) : ['default'];

  const handleTitleClick = useEasterEgg(() => {
    showConfirmModal('キャンペーンモードを開始しますか？', () => {
      startGameMode?.('campaign');
    });
  });

  return (
    <>
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

      
    </>
  );
}


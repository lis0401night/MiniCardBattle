import { useEffect, useState } from 'react';
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { showGallery } from '../services/uiGallery.js';
import {
  showBeginnerGuide,
  showOptions,
  showSoloMenu,
  showDeckEditMenu,
  showEventMenu,
  showOnlineMenu,
  showProfileSettings,
} from '../services/uiMainCore.js';
import { listenToLobbyRooms } from '../services/multiplayer.js';
import { getOrCreateUUID, playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import NewsBanner from '../components/common/NewsBanner.jsx';
import { getScreenBackgroundStyle } from '../utils/constants/config.js';
import { hasUnclaimedAchievements } from '../utils/constants/achievements.js';
import { isProfileDefault } from '../state/gameState.js';

/**
 * モード選択（メインメニュー）画面コンポーネント
 * 各ゲームモードへの遷移および各種設定・ギャラリー・通知バッジを表示する。
 * @returns {import('react').ReactElement} モード選択画面
 */
export default function ModeSelectScreen() {
  const images = UI_IMAGES || {};
  const [hasWaitingPublicRooms, setHasWaitingPublicRooms] = useState(false);

  useEffect(() => {
    const myId = getOrCreateUUID();
    const unsubscribe = listenToLobbyRooms((rooms) => {
      const availableOtherRooms = rooms.filter((r) => r.host?.id !== myId);
      setHasWaitingPublicRooms(availableOtherRooms.length > 0);
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  return (
    <div
      id="screen-mode-select"
      className="screen active"
      style={getScreenBackgroundStyle(
        'assets/backgrounds/background_select.webp'
      )}
    >
      <div className="top-right-actions">
        <button
          className="btn-circle btn-profile-menu"
          aria-label="プロフィール設定"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showProfileSettings?.();
          }}
        >
          👤
          {isProfileDefault() && (
            <div
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '14px',
                height: '14px',
                background: '#ef4444',
                border: '2px solid white',
                borderRadius: '50%',
                zIndex: 10,
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
              }}
            />
          )}
        </button>

        <button
          className="btn-circle btn-gear"
          aria-label="オプション"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showOptions?.();
          }}
        >
          ⚙
        </button>
      </div>

      <NewsBanner />

      <div className="menu-btn-grid">
        <MenuImageButton
          label="遊び方"
          image={images.MENU_RULES}
          onClick={() => showBeginnerGuide?.()}
        />

        <MenuImageButton
          label="デッキ編成"
          image={images.MENU_DECK}
          onClick={() => showDeckEditMenu?.()}
        />

        <MenuImageButton
          label="ソロモード"
          image={images.MENU_SOLO || images.MENU_STORY}
          onClick={() => showSoloMenu?.()}
        />

        <MenuImageButton
          label="イベント"
          image={images.MENU_EVENT}
          onClick={() => showEventMenu?.()}
        />

        <MenuImageButton
          label="オンライン"
          image={images.MENU_ONLINE}
          onClick={() => showOnlineMenu?.()}
          notificationBadge={hasWaitingPublicRooms}
        />

        <MenuImageButton
          label="ギャラリー"
          image={images.MENU_GALLERY}
          onClick={() => showGallery?.()}
          notificationBadge={hasUnclaimedAchievements()}
        />
      </div>
    </div>
  );
}

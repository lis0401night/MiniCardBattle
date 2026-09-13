import { useEffect, useState } from 'react';
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { showGallery } from '../services/uiGallery.js';
import {
  showCommonExchange,
  showOptions,
  showSoloMenu,
  showDeckEditMenu,
  showEventMenu,
  showOnlineMenu,
  showProfileSettings,
} from '../services/uiMainCore.js';
import { checkHasPublicWaitingRooms } from '../services/multiplayer.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import NewsBanner from '../components/common/NewsBanner.jsx';
import { getScreenBackgroundStyle } from '../utils/constants/config.js';
import { hasUnclaimedAchievements } from '../utils/constants/achievements.js';
import { isProfileDefault } from '../state/gameState.js';
import { hasClaimableDailyMissions } from '../services/dailyMissions.js';
import DailyMissionsModal from '../components/common/DailyMissionsModal.jsx';
import NotificationBadge from '../components/common/NotificationBadge.jsx';

/**
 * モード選択（メインメニュー）画面コンポーネント
 * 各ゲームモードへの遷移および各種設定・ギャラリー・通知バッジを表示する。
 * @returns {import('react').ReactElement} モード選択画面
 */
export default function ModeSelectScreen() {
  const images = UI_IMAGES || {};
  const [hasWaitingPublicRooms, setHasWaitingPublicRooms] = useState(false);
  const [showDailyMissions, setShowDailyMissions] = useState(false);
  const [hasClaimableMissions, setHasClaimableMissions] = useState(() =>
    hasClaimableDailyMissions()
  );

  useEffect(() => {
    let isMounted = true;

    // 画面復帰時および初回マウント時に各種通知状態を最新化する
    const refreshNotifications = () => {
      if (!isMounted) return;
      setHasClaimableMissions(hasClaimableDailyMissions());
      checkHasPublicWaitingRooms()
        .then((hasRooms) => {
          if (isMounted) {
            setHasWaitingPublicRooms(hasRooms);
          }
        })
        .catch((e) => {
          // 公開待機ルームの取得失敗時は通知バッジ非表示で縮退させる
          console.warn('公開待機ルームの取得に失敗しました:', e);
        });
    };

    // 初回実行（公開待機ルーム取得）
    checkHasPublicWaitingRooms()
      .then((hasRooms) => {
        if (isMounted) {
          setHasWaitingPublicRooms(hasRooms);
        }
      })
      .catch((e) => {
        console.warn('公開待機ルームの取得に失敗しました:', e);
      });

    // 画面DOMはアンマウントされずclass切り替えで制御されるため、
    // activeクラス付与（バトルや別画面からの復帰時）を検知して通知バッジを再評価する
    const screen = document.getElementById('screen-mode-select');
    let observer = null;
    if (screen) {
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.attributeName === 'class' &&
            screen.classList.contains('active')
          ) {
            refreshNotifications();
          }
        });
      });
      observer.observe(screen, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    return () => {
      isMounted = false;
      observer?.disconnect();
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
          className="btn-circle btn-daily-missions"
          aria-label="デイリーミッション"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            setShowDailyMissions(true);
          }}
        >
          📋
          {hasClaimableMissions && <NotificationBadge />}
        </button>

        <button
          className="btn-circle btn-profile-menu"
          aria-label="プロフィール設定"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showProfileSettings?.();
          }}
        >
          👤
          {isProfileDefault() && <NotificationBadge />}
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
          label="交換所"
          image={images.MENU_SHOP}
          onClick={() => showCommonExchange?.()}
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

      {showDailyMissions && (
        <DailyMissionsModal
          onClose={() => {
            setShowDailyMissions(false);
            setHasClaimableMissions(hasClaimableDailyMissions());
          }}
          onClaimSuccess={() => {
            setHasClaimableMissions(hasClaimableDailyMissions());
          }}
        />
      )}
    </div>
  );
}

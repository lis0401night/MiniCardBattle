import { useEffect, useState } from 'react';
import MenuImageButton from '../components/common/MenuImageButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { checkHasPublicWaitingRooms } from '../services/multiplayer.js';
import {
  goToModeSelect,
  showBattlePassMenu,
  showOnlineQuickMatch,
  showOnlineRoomMatch,
} from '../services/uiMainCore.js';

/**
 * オンライン対戦メニュー画面コンポーネント
 * 「クイックマッチ」「ルームマッチ」および「バトルパス」のモード選択メニューを提供する。
 * @returns {import('react').ReactElement} オンラインメニュー画面
 */
export default function OnlineMenuScreen() {
  const [hasWaitingPublicRooms, setHasWaitingPublicRooms] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // 公開待機ルームの存在有無をチェックして通知バッジを更新
    const refreshWaitingRooms = () => {
      checkHasPublicWaitingRooms()
        .then((hasRooms) => {
          if (isMounted) {
            setHasWaitingPublicRooms(hasRooms);
          }
        })
        .catch((e) => {
          console.warn('公開待機ルームの取得に失敗しました:', e);
        });
    };

    refreshWaitingRooms();

    // 画面アクティブ切り替え検知（別画面からの復帰時に通知を再評価）
    const screen = document.getElementById('screen-online-menu');
    let observer = null;
    if (screen) {
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.attributeName === 'class' &&
            screen.classList.contains('active')
          ) {
            refreshWaitingRooms();
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

  /**
   * クイックマッチボタンクリック時のハンドラ
   * クイックマッチ画面（ルール・ランキング・挑戦）へ遷移する
   * @returns {void}
   */
  const handleQuickMatchClick = () => {
    showOnlineQuickMatch?.();
  };

  /**
   * ルームマッチボタンクリック時のハンドラ
   * ルームマッチ画面（ルーム作成・検索・ルール）へ遷移する
   * @returns {void}
   */
  const handleRoomMatchClick = () => {
    showOnlineRoomMatch?.();
  };

  /**
   * バトルパスボタンクリック時のハンドラ
   * 解放済みバトルパス一覧画面へ遷移する
   * @returns {void}
   */
  const handleBattlePassClick = () => {
    showBattlePassMenu?.();
  };

  return (
    <ScreenLayout
      id="screen-online-menu"
      title="オンライン"
      titleColor="#38bdf8"
      titleGlow={true}
      backgroundImage="background_online.webp"
      onBackClick={() => goToModeSelect?.()}
      showBackButton={true}
      backHasBorder={true}
    >
      <div className="menu-btn-grid">
        {/* クイックマッチボタン */}
        <MenuImageButton
          label="クイックマッチ"
          style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          }}
          onClick={handleQuickMatchClick}
        />

        {/* ルームマッチボタン（従来のオンラインメニューへの遷移） */}
        <MenuImageButton
          label="ルームマッチ"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
          }}
          onClick={handleRoomMatchClick}
          notificationBadge={hasWaitingPublicRooms}
        />

        {/* バトルパスボタン */}
        <MenuImageButton
          label="バトルパス"
          style={{
            background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
          }}
          onClick={handleBattlePassClick}
        />
      </div>
    </ScreenLayout>
  );
}

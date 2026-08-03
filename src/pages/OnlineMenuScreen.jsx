import { useEffect, useRef, useState } from 'react';
import MenuButton from '../components/common/MenuButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import RoomTypeSelectModal from '../components/online/RoomTypeSelectModal.jsx';
import { createRoom } from '../services/multiplayer.js';
import {
  goToModeSelect,
  showOnlineLobby,
  showOnlineRules,
  showOnlineSearch,
} from '../services/uiMainCore.js';
import { showAlertModal } from '../services/uiModals.js';
import { resolvePlayerName } from '../utils/gameUtils.js';

/**
 * オンライン対戦メニュー画面
 * 共通コンポーネント ScreenLayout, MenuButton, RoomTypeSelectModal を用いて構成。
 */
export default function OnlineMenuScreen() {
  const [isMatching, setIsMatching] = useState(false);
  const [showRoomTypeModal, setShowRoomTypeModal] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * ルーム作成ボタンクリック時のハンドラ
   * 公開・非公開選択モーダルを表示する
   * @returns {void}
   */
  const handleCreateRoomClick = () => {
    setShowRoomTypeModal(true);
  };

  /**
   * 選択された公開設定でルームを作成する
   * @param {boolean} isPublic - 公開ルームにするかどうか
   * @returns {void}
   */
  const executeCreateRoom = (isPublic) => {
    setShowRoomTypeModal(false);
    const name = resolvePlayerName();

    setIsMatching(true);
    createRoom(name, { isPublic })
      .then(() => {
        if (isMountedRef.current) {
          setIsMatching(false);
          showOnlineLobby?.();
        }
      })
      .catch((e) => {
        console.error(e);
        if (isMountedRef.current) {
          setIsMatching(false);
        }
        const msg = e?.message || '';
        if (
          e?.code === 'PERMISSION_DENIED' ||
          msg.includes('Permission denied')
        ) {
          showAlertModal?.(
            '【通信エラー】サーバーの接続上限（または無料枠）に達しているため、現在オンライン機能が利用できません。'
          );
        } else {
          showAlertModal?.('ルーム作成に失敗しました。');
        }
      });
  };

  return (
    <ScreenLayout
      id="screen-online-menu"
      title="オンライン対戦"
      titleColor="#38bdf8"
      titleGlow={true}
      backgroundImage="background_online.webp"
      // マッチング中は戻るボタンを無効化（クリックしても何もしない）にする
      onBackClick={isMatching ? undefined : () => goToModeSelect?.()}
      showBackButton={true}
      backHasBorder={false}
    >
      {isMatching ? (
        <div style={{ textAlign: 'center', margin: '40px 0' }}>
          <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
          <h3 style={{ color: '#fff' }}>ルームを作成しています...</h3>
        </div>
      ) : (
        <div className="menu-button-container">
          <MenuButton
            label="ルール"
            variant="yellow"
            onClick={() => showOnlineRules?.()}
          />
          <MenuButton
            label="ルーム作成"
            style={{ background: 'linear-gradient(45deg, #0284c7, #0369a1)' }}
            onClick={handleCreateRoomClick}
          />
          <MenuButton
            label="ルーム検索"
            variant="blue"
            onClick={() => showOnlineSearch?.()}
          />
        </div>
      )}

      {/* ルーム公開 / 非公開 選択モーダル */}
      <RoomTypeSelectModal
        isOpen={showRoomTypeModal}
        onSelectPublic={() => executeCreateRoom(true)}
        onSelectPrivate={() => executeCreateRoom(false)}
        onCancel={() => setShowRoomTypeModal(false)}
      />
    </ScreenLayout>
  );
}

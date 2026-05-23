import { useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import { createRoom } from '../hooks/multiplayer.js';
import {
  closePlayerNameModal,
  goToModeSelect,
  showOnlineLobby,
  showOnlineRules,
  showOnlineSearch,
} from '../hooks/uiMainCore.js';
import { showAlertModal } from '../hooks/uiModals.js';

/**
 * オンライン対戦メニュー画面
 * 共通コンポーネント ScreenLayout と MenuButton を用いてリファクタリングを完了。
 */
export default function OnlineMenuScreen() {
  const [isMatching, setIsMatching] = useState(false);

  const handleCreateRoomClick = () => {
    // クリック音は MenuButton 側で自動再生されるため、多重再生を防ぐためここでは明示的に呼び出さない
    if (window.showPlayerNameModalState) {
      window.showPlayerNameModalState(async (name) => {
        if (!name.trim()) {
          showAlertModal?.('プレイヤー名を入力してください！');
          return;
        }
        closePlayerNameModal?.();
        localStorage.setItem('mini_card_battle_player_name', name);
        setIsMatching(true);
        try {
          await createRoom(name);
          setIsMatching(false);
          showOnlineLobby?.();
        } catch (e) {
          console.error(e);
          setIsMatching(false);
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
        }
      });
    }
  };

  return (
    <ScreenLayout
      id="screen-online-menu"
      title="オンライン対戦"
      titleColor="#38bdf8"
      titleGlow={true}
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            width: '250px',
          }}
        >
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
    </ScreenLayout>
  );
}

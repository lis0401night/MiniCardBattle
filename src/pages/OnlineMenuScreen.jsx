import { useEffect, useRef, useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
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
 * 共通コンポーネント ScreenLayout と MenuButton を用いてリファクタリングを完了。
 */
export default function OnlineMenuScreen() {
  const [isMatching, setIsMatching] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleCreateRoomClick = () => {
    // クリック音は MenuButton 側で自動再生されるため、多重再生を防ぐためここでは明示的に呼び出さない
    const name = resolvePlayerName();

    setIsMatching(true);
    createRoom(name)
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            width: '250px',
            marginBottom: '20px',
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

import { useEffect, useRef, useState } from 'react';
import MenuButton from '../components/common/MenuButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { createRoom } from '../services/multiplayer.js';
import {
  goToModeSelect,
  showOnlineLobby,
  showOnlineRules,
  showOnlineSearch,
} from '../services/uiMainCore.js';
import { showAlertModal } from '../services/uiModals.js';
import { playSound, resolvePlayerName } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * オンライン対戦メニュー画面
 * 共通コンポーネント ScreenLayout と MenuButton を用いてリファクタリングを完了。
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

      {/* 公開 / 非公開 選択ダイアログモーダル */}
      {showRoomTypeModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              border: '2px solid #38bdf8',
              borderRadius: '16px',
              padding: '24px 28px',
              width: '90%',
              maxWidth: '360px',
              textAlign: 'center',
              boxShadow: '0 0 25px rgba(56, 189, 248, 0.3)',
            }}
          >
            <h3
              style={{
                color: '#38bdf8',
                margin: '0 0 12px 0',
                fontSize: '1.25rem',
              }}
            >
              ルーム公開設定
            </h3>
            <p
              style={{
                color: '#94a3b8',
                fontSize: '0.9rem',
                marginBottom: '20px',
                lineHeight: 1.5,
              }}
            >
              作成するルーム種別を選択してください。
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                width: '100%',
                alignItems: 'center',
              }}
            >
              <MenuButton
                label="公開ルーム作成"
                variant="blue"
                style={{ width: '100%', maxWidth: '260px', margin: 0 }}
                onClick={() => executeCreateRoom(true)}
              />
              <MenuButton
                label="非公開ルーム作成"
                variant="yellow"
                style={{ width: '100%', maxWidth: '260px', margin: 0 }}
                onClick={() => executeCreateRoom(false)}
              />
              <button
                type="button"
                className="btn"
                style={{
                  width: '100%',
                  maxWidth: '260px',
                  margin: 0,
                  padding: '12px 20px',
                  background: '#475569',
                  color: '#e2e8f0',
                  border: '1px solid #64748b',
                  borderRadius: '10px',
                  fontWeight: 900,
                  fontSize: '1.1rem',
                  letterSpacing: '1.5px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setShowRoomTypeModal(false);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </ScreenLayout>
  );
}

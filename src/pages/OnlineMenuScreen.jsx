import { useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import { createRoom } from '../hooks/multiplayer.js';
import {
  closePlayerNameModal,
  goToModeSelect,
  showOnlineLobby,
  showOnlineRules,
  showOnlineSearch,
} from '../hooks/uiMainCore.js';
import { showAlertModal } from '../hooks/uiModals.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function OnlineMenuScreen() {
  const [isMatching, setIsMatching] = useState(false);

  // マウント時BGM処理はuiMainCore.js側で管理するため削除

  const handleCreateRoomClick = () => {
    playSound?.(SOUNDS.seClick);
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
    <div id="screen-online-menu" className="screen active">
      <h2
        style={{
          color: '#38bdf8',
          margin: '20px 0',
          textShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
          textAlign: 'center',
        }}
      >
        オンライン対戦
      </h2>

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
          <button
            className="btn btn-yellow"
            onClick={() => showOnlineRules?.()}
          >
            ルール
          </button>
          <button
            className="btn"
            style={{ background: 'linear-gradient(45deg, #0284c7, #0369a1)' }}
            onClick={handleCreateRoomClick}
          >
            ルーム作成
          </button>
          <button
            className="btn"
            style={{ background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)' }}
            onClick={() => showOnlineSearch?.()}
          >
            ルーム検索
          </button>
        </div>
      )}

      <div
        style={{
          padding: '15px 0 20px 0',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
        }}
      >
        <BackButton
          onClick={() => goToModeSelect?.()}
          style={{ margin: 0 }}
          disabled={isMatching}
        />
      </div>
    </div>
  );
}

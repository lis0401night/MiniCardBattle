import React, { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import {
  forceDeleteAllRooms,
  joinRoom,
  listenToLobbyRooms,
} from '../services/multiplayer.js';
import {
  closePlayerNameModal,
  showOnlineLobby,
  showOnlineMenu,
} from '../services/uiMainCore.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { getOrCreateUUID, playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

const DEBUG_MODE_CLICK_THRESHOLD = 10;

export default function OnlineRoomSearchScreen() {
  const [rooms, setRooms] = useState([]);
  const [isJoining, setIsJoining] = useState(false);

  const debugClickCountRef = React.useRef(0);
  const debugTimeout = React.useRef(null);

  useEffect(() => {
    const unsubscribe = listenToLobbyRooms((availableRooms) => {
      const myId = getOrCreateUUID();
      setRooms(availableRooms.filter((r) => r.host?.id !== myId));
    });
    return () => {
      unsubscribe();
      if (debugTimeout.current) {
        clearTimeout(debugTimeout.current);
      }
    };
  }, []);

  const handleTitleClick = () => {
    const next = debugClickCountRef.current + 1;
    debugClickCountRef.current = next;
    if (debugTimeout.current) clearTimeout(debugTimeout.current);
    debugTimeout.current = setTimeout(() => {
      debugClickCountRef.current = 0;
    }, 1000);

    if (next >= DEBUG_MODE_CLICK_THRESHOLD) {
      if (debugTimeout.current) clearTimeout(debugTimeout.current);
      debugClickCountRef.current = 0;
      playSound?.(SOUNDS.seClick);
      showConfirmModal?.(
        '【デバッグ機能】\n現在のすべてのオンラインルームデータを強制的に削除（解散）します。よろしいですか？',
        async () => {
          try {
            await forceDeleteAllRooms();
            showAlertModal?.('全ルームデータを削除しました。');
          } catch (e) {
            showAlertModal?.('削除に失敗しました: ' + e.message);
          }
        }
      );
    }
  };

  const handleJoinClick = (roomId) => {
    playSound?.(SOUNDS.seClick);
    if (window.showPlayerNameModalState) {
      window.showPlayerNameModalState(async (name) => {
        if (!name.trim()) {
          showAlertModal?.('プレイヤー名を入力してください！');
          return;
        }
        closePlayerNameModal?.();
        localStorage.setItem('mini_card_battle_player_name', name);
        setIsJoining(true);
        try {
          await joinRoom(roomId, name);
          setIsJoining(false);
          showOnlineLobby?.();
        } catch (e) {
          console.error(e);
          setIsJoining(false);
          const msg = e?.message || '';
          if (
            e?.code === 'PERMISSION_DENIED' ||
            msg.includes('Permission denied')
          ) {
            showAlertModal?.(
              '【通信エラー】サーバーの接続上限（または無料枠）に達しているため、現在オンライン機能が利用できません。'
            );
          } else {
            showAlertModal?.(
              'ルームへの入室に失敗しました（既に満員か解散された可能性があります）。'
            );
          }
        }
      });
    }
  };

  return (
    <div
      id="screen-online-search"
      className="screen active"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <h2
        onClick={handleTitleClick}
        style={{
          color: '#38bdf8',
          margin: '20px 0',
          textAlign: 'center',
          textShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        ルーム検索
      </h2>

      <div
        style={{
          padding: '0 20px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <h3
          style={{
            color: '#94a3b8',
            fontSize: '1rem',
            borderBottom: '1px solid #334155',
            paddingBottom: '10px',
            marginBottom: '15px',
          }}
        >
          募集中のルーム
        </h3>

        {isJoining ? (
          <div style={{ textAlign: 'center', margin: '40px 0' }}>
            <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
            <h3 style={{ color: '#fff' }}>ルームに入室しています...</h3>
          </div>
        ) : rooms.length === 0 ? (
          <div
            style={{ color: '#64748b', textAlign: 'center', padding: '20px 0' }}
          >
            現在募集中のルームはありません。
          </div>
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            {rooms.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '5px',
                  flexWrap: 'wrap',
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: '15px',
                  borderRadius: '8px',
                  border: '1px solid #475569',
                }}
              >
                <div>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold' }}>
                    {r.host?.name || '不明'} のルーム
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    className="btn"
                    style={{
                      margin: 0,
                      padding: '5px 10px',
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                      width: 'auto',
                      background: '#10b981',
                    }}
                    onClick={() => handleJoinClick(r.id)}
                  >
                    入室
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '20px', textAlign: 'center' }}>
        <BackButton onClick={() => showOnlineMenu?.()} disabled={isJoining} />
      </div>
    </div>
  );
}

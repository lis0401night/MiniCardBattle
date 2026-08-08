import { useEffect, useState, useRef } from 'react';
import BackButton from '../components/BackButton.jsx';
import {
  forceDeleteAllRooms,
  joinRoom,
  joinRoomByCode,
  listenToLobbyRooms,
} from '../services/multiplayer.js';
import { showOnlineLobby, showOnlineMenu } from '../services/uiMainCore.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import {
  getOrCreateUUID,
  playSound,
  resolvePlayerName,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { getScreenBackgroundStyle } from '../utils/constants/config.js';

const DEBUG_MODE_CLICK_THRESHOLD = import.meta.env.DEV ? 10 : Infinity;

/**
 * オンラインルーム検索画面コンポーネント
 * 公開ルーム一覧の表示および6桁ルームID指定による直接入室機能を提供する。
 * @returns {import('react').ReactElement} オンラインルーム検索画面
 */
export default function OnlineRoomSearchScreen() {
  const [rooms, setRooms] = useState([]);
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const isMountedRef = useRef(true);
  const joinRequestRef = useRef(false);

  const debugClickCountRef = useRef(0);
  const debugTimeout = useRef(null);

  useEffect(() => {
    const unsubscribe = listenToLobbyRooms((availableRooms) => {
      const myId = getOrCreateUUID();
      setRooms(availableRooms.filter((r) => r.host?.id !== myId));
    });
    return () => {
      isMountedRef.current = false;
      unsubscribe();
      if (debugTimeout.current) {
        clearTimeout(debugTimeout.current);
      }
    };
  }, []);

  /**
   * タイトル連続クリック時のデバッグ操作（全ルーム削除）
   * @returns {void}
   */
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

  /**
   * 公開一覧からのルーム入室ハンドラ
   * @param {string} roomId - 対象のルームID
   * @returns {void}
   */
  const handleJoinClick = (roomId) => {
    if (joinRequestRef.current || isJoining) return;
    joinRequestRef.current = true;

    playSound?.(SOUNDS.seClick);
    const name = resolvePlayerName();

    setIsJoining(true);
    joinRoom(roomId, name)
      .then(() => {
        if (isMountedRef.current) {
          setIsJoining(false);
          showOnlineLobby?.();
        }
      })
      .catch((e) => {
        console.error(e);
        if (!isMountedRef.current) return;
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
      })
      .finally(() => {
        joinRequestRef.current = false;
      });
  };

  /**
   * 6桁ルームID指定での直入室ハンドラ
   * @returns {void}
   */
  const handleJoinByCode = () => {
    if (joinRequestRef.current || isJoining) return;

    if (!inputRoomCode.trim()) {
      showConfirmModal?.('ルームIDを入力してください。', null, null, true);
      return;
    }

    joinRequestRef.current = true;
    playSound?.(SOUNDS.seClick);
    const name = resolvePlayerName();

    setIsJoining(true);
    joinRoomByCode(inputRoomCode, name)
      .then(() => {
        if (isMountedRef.current) {
          setIsJoining(false);
          showOnlineLobby?.();
        }
      })
      .catch((e) => {
        console.error('joinRoomByCode error:', e);
        if (!isMountedRef.current) return;
        setIsJoining(false);
        const msg =
          e?.message ||
          '指定されたIDのルームが見つからないか、既に対戦中・解散されています。';
        if (
          e?.code === 'PERMISSION_DENIED' ||
          msg.includes('Permission denied')
        ) {
          showConfirmModal?.(
            '【通信エラー】サーバーの接続上限（または無料枠）に達しているため、現在オンライン機能が利用できません。',
            null,
            null,
            true
          );
        } else {
          showConfirmModal?.(msg, null, null, true);
        }
      })
      .finally(() => {
        joinRequestRef.current = false;
      });
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
        ...getScreenBackgroundStyle(
          'assets/backgrounds/background_online.webp'
        ),
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
        {/* ルームID指定による直接入室領域 */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div
            style={{
              color: '#fde047',
              fontWeight: 'bold',
              fontSize: '0.9rem',

              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🔑 ルームIDを指定して入室
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="6桁のルームIDを入力"
              value={inputRoomCode}
              onChange={(e) => setInputRoomCode(e.target.value)}
              disabled={isJoining}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #475569',
                background: 'rgba(30, 41, 59, 0.9)',
                color: '#fff',
                fontSize: '0.95rem',
                outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoinByCode();
              }}
            />
            <button
              className="btn"
              style={{
                margin: 0,
                padding: '8px 16px',
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
                background: 'linear-gradient(45deg, #0284c7, #0369a1)',
                color: '#fff',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
              onClick={handleJoinByCode}
              disabled={isJoining}
            >
              入室
            </button>
          </div>
        </div>

        <h3
          style={{
            color: '#94a3b8',
            fontSize: '1rem',
            borderBottom: '1px solid #334155',
            paddingBottom: '10px',
            marginBottom: '15px',
          }}
        >
          募集中の公開ルーム
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

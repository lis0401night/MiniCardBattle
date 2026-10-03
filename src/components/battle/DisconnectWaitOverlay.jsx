/**
 * Mini Card Battle - Disconnect Wait Overlay Component
 *
 * オンライン対戦中に通信切断（相手または自身）が発生した際、
 * 操作をブロックして60秒間のカウントダウン待機および復帰通知を表示するオーバーレイコンポーネント。
 */

import { useState, useEffect } from 'react';
import {
  subscribeDisconnectState,
  getDisconnectState,
} from '../../game/battle/onlineDisconnectManager.js';
import { ONLINE_DISCONNECT_WAIT_SEC } from '../../utils/constants/onlineTimer.js';

export default function DisconnectWaitOverlay() {
  const [state, setState] = useState(getDisconnectState);

  useEffect(() => {
    return subscribeDisconnectState((nextState) => {
      setState(nextState);
    });
  }, []);

  if (!state.isWaiting) {
    return null;
  }

  const {
    isSelfDisconnected,
    remainingSeconds,
    isReconnectedNotice,
  } = state;

  const progressPercent = Math.max(
    0,
    Math.min(100, (remainingSeconds / ONLINE_DISCONNECT_WAIT_SEC) * 100)
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '420px',
          background: 'linear-gradient(180deg, #1e2230 0%, #11141c 100%)',
          border: isReconnectedNotice
            ? '2px solid #48bb78'
            : '2px solid #e53e3e',
          borderRadius: '16px',
          padding: '24px 20px',
          boxShadow: isReconnectedNotice
            ? '0 0 30px rgba(72, 187, 120, 0.4)'
            : '0 0 30px rgba(229, 62, 62, 0.4)',
          textAlign: 'center',
          color: '#fff',
          animation: 'disconnectFadeIn 0.3s ease-out',
        }}
      >
        {isReconnectedNotice ? (
          <>
            <div
              style={{
                fontSize: '48px',
                marginBottom: '12px',
                animation: 'disconnectPulse 1s infinite alternate',
              }}
            >
              ✅
            </div>
            <h3
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#68d391',
                margin: '0 0 10px 0',
              }}
            >
              通信再接続完了
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: '#cbd5e0',
                margin: '0 0 8px 0',
                lineHeight: 1.5,
              }}
            >
              通信が復旧しました。
              <br />
              対戦をまもなく再開します…
            </p>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: '44px',
                marginBottom: '12px',
                animation: 'disconnectPulse 1.2s infinite alternate',
              }}
            >
              {isSelfDisconnected ? '📡' : '⚠️'}
            </div>
            <h3
              style={{
                fontSize: '19px',
                fontWeight: 'bold',
                color: '#fc8181',
                margin: '0 0 12px 0',
              }}
            >
              {isSelfDisconnected
                ? 'インターネット通信再接続中'
                : '対戦相手の通信切断を待機中'}
            </h3>
            <p
              style={{
                fontSize: '13px',
                color: '#cbd5e0',
                margin: '0 0 20px 0',
                lineHeight: 1.6,
                whiteSpace: 'pre-line',
              }}
            >
              {isSelfDisconnected
                ? 'インターネット接続が一時的に途切れました。\n自動再接続を試みています…'
                : '対戦相手との通信が一時的に途切れました。\n相手の復帰を待機しています。'}
            </p>

            {/* カウントダウン表示 */}
            <div
              style={{
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  color: remainingSeconds <= 10 ? '#ff4d4d' : '#fbd38d',
                  textShadow: '0 0 10px rgba(0,0,0,0.5)',
                }}
              >
                残り {remainingSeconds} 秒
              </div>

              {/* プログレスバー */}
              <div
                style={{
                  width: '80%',
                  height: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    backgroundColor:
                      remainingSeconds <= 10 ? '#e53e3e' : '#dd6b20',
                    transition: 'width 1s linear',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                fontSize: '12px',
                color: '#a0aec0',
                marginTop: '12px',
              }}
            >
              ※60秒以内に復帰しなかった場合は対戦終了となります。
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes disconnectFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes disconnectPulse {
          from {
            transform: scale(1);
          }
          to {
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Mini Card Battle - Spark Timer Line Component
 *
 * オンライン対戦において、制限時間の残り5秒以下になった際に画面中央へ出現し、
 * 左右から中央に向かって火花を散らしながらバチバチと縮小していくカウントダウン演出コンポーネント。
 */

import { useEffect, useState, useRef } from 'react';
import { subscribeOnlineTimer } from '../../game/battle/onlineTimer.js';
import { subscribeDisconnectState } from '../../game/battle/onlineDisconnectManager.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * オンライン対戦タイマーの警告火花演出コンポーネント
 * 制限時間残り5秒以下（isWarning）かつプレイヤー自身のターン時に画面中央に出現し、
 * 左右から火花を散らしながら収束していくアニメーションおよび警告チクタク音を再生する。
 * 切断待機中（isDisconnectWaiting）は演出を自動で抑制する。
 *
 * @returns {import('react').ReactElement|null} 警告演出中は火花ライン要素、それ以外は null
 */
export default function SparkTimerLine() {
  const [timerState, setTimerState] = useState({
    isActive: false,
    owner: null,
    isWarning: false,
    remainingMs: 0,
    progress: 1.0,
  });
  const [isDisconnectWaiting, setIsDisconnectWaiting] = useState(false);
  const isDisconnectWaitingRef = useRef(false);

  const lastSecondRef = useRef(null);

  useEffect(() => {
    const unsubDisconnect = subscribeDisconnectState((dState) => {
      isDisconnectWaitingRef.current = dState.isWaiting;
      setIsDisconnectWaiting(dState.isWaiting);
    });

    const unsubTimer = subscribeOnlineTimer((state) => {
      setTimerState(state);

      // 自分自身の操作タイマー（owner === 'blue'）のみ警告チクタク音を再生（切断待機中を除く）
      if (
        state.isActive &&
        state.owner === 'blue' &&
        state.isWarning &&
        state.remainingMs > 0 &&
        !isDisconnectWaitingRef.current
      ) {
        const sec = Math.ceil(state.remainingMs / 1000);
        if (lastSecondRef.current !== sec) {
          lastSecondRef.current = sec;
          try {
            if (SOUNDS?.seClock) {
              playSound(SOUNDS.seClock);
            }
          } catch {
            // 音声再生失敗時は無視
          }
        }
      } else {
        lastSecondRef.current = null;
      }
    });

    return () => {
      unsubDisconnect();
      unsubTimer();
    };
  }, []);

  // 自分のタイマー（owner === 'blue'）かつ警告演出中、かつ切断待機中でない場合のみ火花ラインを表示
  if (
    !timerState.isActive ||
    timerState.owner !== 'blue' ||
    !timerState.isWarning ||
    isDisconnectWaiting
  ) {
    return null;
  }

  const secondsLeft = Math.max(1, Math.ceil(timerState.remainingMs / 1000));
  const progressPercent = Math.max(0, Math.min(100, timerState.progress * 100));

  return (
    <div className="spark-timer-root" aria-hidden="true">
      <style>{`
        .spark-timer-root {
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          max-width: 480px;
          height: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          pointer-events: none;
          z-index: 99990;
        }

        .spark-timer-line {
          position: relative;
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(
            90deg,
            #ff3b00 0%,
            #ff8800 20%,
            #ffe600 45%,
            #ffffff 50%,
            #ffe600 55%,
            #ff8800 80%,
            #ff3b00 100%
          );
          box-shadow:
            0 0 10px #ff4500,
            0 0 20px #ff8c00,
            0 0 35px #ffe600,
            0 0 50px rgba(255, 255, 255, 0.8);
          transition: width 0.1s linear;
          animation: sparkJitter 0.08s infinite alternate;
        }

        @keyframes sparkJitter {
          0% {
            filter: brightness(1) drop-shadow(0 0 4px #ff3b00);
            height: 4px;
          }
          100% {
            filter: brightness(1.3) drop-shadow(0 0 8px #ffe600);
            height: 5px;
          }
        }

        .spark-point {
          position: absolute;
          top: 50%;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow:
            0 0 8px #ffffff,
            0 0 16px #ffea00,
            0 0 24px #ff3b00,
            0 0 36px #ff0000;
          transform: translateY(-50%);
          animation: sparkBurst 0.12s infinite alternate;
        }

        .spark-point.spark-left {
          left: -7px;
        }

        .spark-point.spark-right {
          right: -7px;
        }

        @keyframes sparkBurst {
          0% {
            transform: translateY(-50%) scale(0.85);
            opacity: 0.9;
          }
          100% {
            transform: translateY(-50%) scale(1.35);
            opacity: 1;
          }
        }

        .spark-timer-badge {
          position: absolute;
          top: -24px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px 8px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(251, 191, 36, 0.6);
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
          animation: badgePulse 0.5s infinite alternate ease-in-out;
        }

        .spark-number {
          font-size: 1.1rem;
          font-weight: 900;
          color: #fef08a;
          text-shadow:
            0 0 6px #f59e0b,
            0 0 12px #ef4444;
          line-height: 1;
        }

        @keyframes badgePulse {
          0% {
            transform: scale(0.95);
          }
          100% {
            transform: scale(1.05);
          }
        }
      `}</style>

      {/* 左右から中央に向かって縮小するバチバチ火花ライン */}
      <div
        className="spark-timer-line"
        style={{
          width: `${progressPercent}%`,
        }}
      >
        <div className="spark-point spark-left" />
        <div className="spark-point spark-right" />
      </div>

      {/* 残り秒数バッジ */}
      <div className="spark-timer-badge">
        <span className="spark-number">{secondsLeft}</span>
      </div>
    </div>
  );
}

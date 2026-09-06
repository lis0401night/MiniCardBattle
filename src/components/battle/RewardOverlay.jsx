import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDeck } from '../../services/deck.js';
import { setupDialogueScreen } from '../../services/uiDialogue.js';
import {
  cleanupBattleState,
  resolveHighDifficultyRewards,
} from '../../game/battle/index.js';
import { GameState } from '../../state/gameState.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import { checkIsHighDiffMode, playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

import CardPreviewContent from '../common/CardPreviewContent.jsx';

export default function RewardOverlay() {
  const [isVisible, setIsVisible] = useState(false);
  const [card, setCard] = useState(null);
  const [phase, setPhase] = useState('pack'); // 'pack' | 'animating' | 'reveal'
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [rewardQueue, setRewardQueue] = useState([]);
  const timersRef = useRef([]);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const setupReward = useCallback(
    (rewardCardId) => {
      // 新しい報酬を表示する前に既存のタイマーをすべてクリア
      clearAllTimers();

      let rewardCardTemplate = CARD_MASTER.find((m) => m.id === rewardCardId);
      if (!rewardCardTemplate) {
        // カードデータが見つからない場合、スケルトンをフォールバックとして使用
        rewardCardTemplate =
          CARD_MASTER.find((m) => m.id === 'skeleton') || CARD_MASTER[0];
      }
      if (rewardCardTemplate) {
        setCard({ ...rewardCardTemplate, owner: 'blue' });

        // 報酬を即座に付与（アニメーションのタイミングに依存しない）
        GameState.playerInventory[rewardCardId] =
          (GameState.playerInventory[rewardCardId] || 0) + 1;
        saveDeck();

        setPhase('pack');
        setIsFadingOut(false);
        setIsVisible(true);
      }
    },
    [clearAllTimers]
  );

  useEffect(() => {
    window.showCardRewardReact = (rewardCardIds) => {
      const ids = Array.isArray(rewardCardIds)
        ? rewardCardIds
        : [rewardCardIds];
      if (ids.length === 0) return;
      setRewardQueue(ids);
      setupReward(ids[0]);
    };

    window.closeRewardScreenReact = () => {
      clearAllTimers();
      setIsVisible(false);
    };

    return () => {
      delete window.showCardRewardReact;
      delete window.closeRewardScreenReact;
      clearAllTimers();
    };
  }, [setupReward, clearAllTimers]);

  if (!isVisible || !card) return null;

  const handlePackClick = () => {
    if (phase !== 'pack') return;
    playSound(SOUNDS.seClick);
    setPhase('animating');

    // カードがシュッと飛び出すタイミングでめくるSEを再生 (タップ音と重なりすぎないよう150ms遅延)
    const timer1 = setTimeout(() => {
      playSound(SOUNDS.seTurnover);
    }, 150);
    timersRef.current.push(timer1);

    // 0.8秒後にカード表示フェーズへ移行
    const timer2 = setTimeout(() => {
      setPhase('reveal');
      // 表示される瞬間はインパクトのある音を鳴らす
      playSound(SOUNDS.seSkill || SOUNDS.seClick);
    }, 800);
    timersRef.current.push(timer2);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    playSound(SOUNDS.seClick);

    // デモモードの場合、ダイアログを挟まずにソロメニューへ戻る
    if (GameState.gameMode === 'reward_demo') {
      GameState.gameMode = null;
      setIsFadingOut(true);

      // 先に裏の画面を切り替え
      if (typeof window.switchScreen === 'function') {
        window.switchScreen('screen-solo-menu');
      }

      clearAllTimers();

      // フェードアウト時間300ms待ってから消去
      const timer3 = setTimeout(() => {
        setIsVisible(false);
        setIsFadingOut(false);
      }, 300);
      timersRef.current.push(timer3);
      return;
    }

    if (rewardQueue.length > 1) {
      const nextQueue = rewardQueue.slice(1);
      setRewardQueue(nextQueue);
      setupReward(nextQueue[0]);
      return;
    }

    // 報酬確認が終わったら
    clearAllTimers();
    setIsVisible(false);

    // 高難易度イベント（超級）の場合、カード獲得確認後にポイント獲得モーダルへ遷移
    if (checkIsHighDiffMode(GameState.gameMode)) {
      if (typeof resolveHighDifficultyRewards === 'function') {
        resolveHighDifficultyRewards();
        return;
      }
    }

    cleanupBattleState();
    setupDialogueScreen();
  };

  const renderSkillTagReact = (c) => {
    if (!window.renderSkillTag) return null;
    return (
      <div
        dangerouslySetInnerHTML={{ __html: window.renderSkillTag(c, false) }}
      ></div>
    );
  };

  // 対戦相手の画像を取得(フォールバック付き)
  const enemyId = GameState.enemyConfig?.id || 'android';
  const enemyImg = appendVersionQuery(
    GameState.enemyConfig?.image || `assets/characters/char_${enemyId}.webp`
  );

  // 難易度に応じた発光色を判定
  const getGlowColorClass = () => {
    if (checkIsHighDiffMode(GameState.gameMode)) return 'glow-rainbow';

    const level = GameState.aiLevel || 1;
    if (level === 1) return 'glow-green';
    if (level === 2) return 'glow-yellow';
    if (level >= 3) return 'glow-red';
    return 'glow-green';
  };

  return (
    <div
      className={`screen active reward-overlay-container ${isFadingOut ? 'fade-out' : ''}`}
      style={{
        zIndex: 2000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <style>{`
        /* 閉じる際のフェードアウト */
        @keyframes reward-fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .reward-overlay-container.fade-out {
          animation: reward-fade-out 0.3s forwards;
          pointer-events: none;
        }

        /* カード飛び出しアニメーション */
        @keyframes card-shoot-up {
          0% {
            transform: translate(-50%, 0) scale(0.95);
            opacity: 0;
          }
          20% {
            transform: translate(-50%, -10px) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -460px) scale(0.9);
            opacity: 0;
          }
        }

        /* パック開封時の瞬間シェイク（一回だけ） */
        @keyframes pack-pop-shake {
          0% { transform: scale(1); }
          15% { transform: scale(1.04) rotate(-3deg); }
          30% { transform: scale(1.04) rotate(3deg); }
          45% { transform: scale(1.02) rotate(-1.5deg); }
          60% { transform: scale(1.01) rotate(1.5deg); }
          75% { transform: scale(1.005) rotate(-0.5deg); }
          100% { transform: scale(1) rotate(0deg); }
        }

        /* 入手カードのフリップイン表示 */
        @keyframes card-flip-in {
          0% {
            transform: scale(0.5) rotateY(90deg);
            opacity: 0;
          }
          100% {
            transform: scale(1) rotateY(0deg);
            opacity: 1;
          }
        }

        .reward-pack-wrapper {
          position: relative;
          width: 280px;
          height: 380px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pack-container {
          position: relative;
          width: 280px;
          height: 380px;
          cursor: pointer;
          user-select: none;
          transition: transform 0.2s ease;
          z-index: 10;
        }
        .pack-container:hover {
          transform: scale(1.03);
        }
        .pack-container.shaking {
          animation: pack-pop-shake 0.55s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }

        /* 難易度によるパック背後の発光 */
        .pack-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 85%;
          height: 85%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          filter: blur(40px);
          z-index: -1;
          pointer-events: none;
        }
        .glow-green { background: #22c55e; animation: pulse-glow 2s infinite; }
        .glow-yellow { background: #eab308; animation: pulse-glow 2s infinite; }
        .glow-red { background: #ef4444; animation: pulse-glow 1.5s infinite; }
        .glow-rainbow {
          background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
          width: 120%;
          height: 120%;
          filter: blur(50px);
          animation: rainbow-spin 3s linear infinite;
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.9); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
        }
        
        @keyframes rainbow-spin {
          0% { transform: translate(-50%, -50%) rotate(0deg) scale(0.9); opacity: 0.8; }
          50% { transform: translate(-50%, -50%) rotate(180deg) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(360deg) scale(0.9); opacity: 0.8; }
        }

        .pack-image {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 10px 25px rgba(0,0,0,0.6));
        }

        /* 光沢と陰影をブレンドするレイヤー */
        .pack-image.specular {
          mix-blend-mode: overlay; /* 色のメリハリを出すためoverlayに戻しつつ */
          opacity: 0.55; /* 不透明度を下げて白飛びを防止 */
          z-index: 12;
          pointer-events: none;
        }

        /* パックテキスト画像（最前面レイヤー） */
        .pack-text-image {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          z-index: 13;
          pointer-events: none;
        }

        .enemy-portrait-frame {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 11;
          
          /* パック形状での切り抜き (はみ出し防止) */
          mask-image: url('${appendVersionQuery('assets/ui/packimg01.png')}');
          mask-size: contain;
          mask-repeat: no-repeat;
          mask-position: center;
          -webkit-mask-image: url('${appendVersionQuery('assets/ui/packimg01.png')}');
          -webkit-mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          -webkit-mask-position: center;
          
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .enemy-portrait-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          /* 発色が強すぎないように彩度とコントラストを微調整 */
          filter: contrast(1.08) saturate(1.15) brightness(0.98);
          mix-blend-mode: multiply;
          opacity: 1; /* 透けすぎによる色褪せを防ぐため1に */
        }

        .tap-prompt {
          position: absolute;
          bottom: -40px;
          /* transformがアニメーション(pulse)で上書きされるのを防ぐため、margin: autoで中央揃え */
          left: 0;
          right: 0;
          margin: auto;
          width: max-content;
          text-align: center;
          
          color: #ffffff;
          font-weight: bold;
          font-size: 1.1rem;
          text-shadow: 0 2px 8px rgba(0,0,0,0.9);
          white-space: nowrap;
          animation: pulse 1.5s infinite;
          z-index: 15;
          pointer-events: none;
        }

        .shooting-card {
          position: absolute;
          bottom: 45px; /* パックの背後に収まるよう初期位置を調整 */
          left: 50%;
          width: 210px; /* パックサイズに合わせて大きく */
          height: 290px; /* パックサイズに合わせて大きく */
          background: linear-gradient(135deg, #1e3a8a, #0f172a);
          border: 3px solid #38bdf8;
          border-radius: 10px;
          box-shadow: 0 0 20px rgba(56, 189, 248, 0.7);
          animation: card-shoot-up 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          z-index: 1; /* パックの後ろ側に配置 */
          pointer-events: none;
        }

        .reveal-wrapper {
          animation: card-flip-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          display: flex;
          max-height: 95dvh; /* 画面内に収めてスクロール領域を有効化 */
        }

        .stacked-pack {
          position: absolute;
          top: -15px;
          right: -25px;
          width: 280px;
          height: 380px;
          transform: scale(0.95);
          z-index: 0;
          filter: brightness(0.85);
          pointer-events: none;
        }
      `}</style>

      {phase !== 'reveal' ? (
        <div className="reward-pack-wrapper">
          {/* 背後の待機パック（残り枚数分だけ奥へ重ねて表示。多すぎると見づらいので最大3枚まで） */}
          {Array.from({ length: Math.min(rewardQueue.length - 1, 3) })
            .map((_, i) => i)
            .reverse()
            .map((i) => (
              <div
                key={i}
                className="stacked-pack"
                style={{
                  top: `${-15 - i * 12}px`,
                  right: `${-25 - i * 12}px`,
                  filter: `brightness(${Math.max(0.55, 0.85 - i * 0.12)})`,
                }}
              >
                <img
                  className="pack-image"
                  src={appendVersionQuery('assets/ui/packimg01.png')}
                  alt="Booster Pack"
                />
                <div className="enemy-portrait-frame">
                  <img
                    className="enemy-portrait-img"
                    src={enemyImg}
                    alt="Enemy Key Visual"
                  />
                </div>
                <img
                  className="pack-image specular"
                  src={appendVersionQuery('assets/ui/packimg01.png')}
                  alt="Booster Pack Specular"
                />
                <img
                  className="pack-text-image"
                  src={appendVersionQuery('assets/ui/packtextimg01.png')}
                  alt="Pack Text"
                />
              </div>
            ))}

          {/* 飛び出すカード(パックの後ろに描画) */}
          {phase === 'animating' && <div className="shooting-card" />}

          {/* パック本体 */}
          <div
            className={`pack-container ${phase === 'animating' ? 'shaking' : ''}`}
            onClick={handlePackClick}
          >
            {/* 0. 難易度ごとの後光（発光）エフェクト */}
            <div className={`pack-glow ${getGlowColorClass()}`} />

            {/* 1. パック画像（底） */}
            <img
              className="pack-image"
              src={appendVersionQuery('assets/ui/packimg01.png')}
              alt="Booster Pack"
            />
            {/* 2. キャラクター画像（中・乗算ブレンド） */}
            <div className="enemy-portrait-frame">
              <img
                className="enemy-portrait-img"
                src={enemyImg}
                alt="Enemy Key Visual"
              />
            </div>
            {/* 3. パック画像（天・オーバーレイでハイライトを強調） */}
            <img
              className="pack-image specular"
              src={appendVersionQuery('assets/ui/packimg01.png')}
              alt="Booster Pack Specular"
            />
            {/* 4. パックのテキスト画像（最前面） */}
            <img
              className="pack-text-image"
              src={appendVersionQuery('assets/ui/packtextimg01.png')}
              alt="Pack Text"
            />

            {phase === 'pack' && (
              <div className="tap-prompt">タップしてパックを開封！</div>
            )}
          </div>
        </div>
      ) : (
        <div className="reveal-wrapper">
          <CardPreviewContent
            card={card}
            isRevealed={true}
            renderSkillTagReact={renderSkillTagReact}
            customActionSlot={
              <button
                className="btn"
                style={{
                  marginTop: '15px',
                  width: '100%',
                  flexShrink: 0,
                  background: 'linear-gradient(45deg, #22c55e, #16a34a)',
                }}
                onClick={handleNext}
              >
                次へ
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

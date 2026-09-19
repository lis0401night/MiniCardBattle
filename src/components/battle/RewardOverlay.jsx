import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDeck } from '../../services/deck.js';
import { setupDialogueScreen } from '../../services/uiDialogue.js';
import {
  cleanupBattleState,
  resolveHighDifficultyRewards,
} from '../../game/battle/index.js';
import { GameState } from '../../state/gameState.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import {
  appendVersionQuery,
  DIFFICULTY,
} from '../../utils/constants/config.js';
import { checkIsHighDiffMode, playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import {
  AUTO_REVEAL_DELAY_MS,
  FADE_OUT_DURATION_MS,
  MANUAL_REVEAL_DELAY_MS,
  TURNOVER_SE_DELAY_MS,
} from '../../utils/constants/packs.js';

import CardPreviewContent from '../common/CardPreviewContent.jsx';

/**
 * バトル勝利時のカード報酬演出および開封演出を表示するオーバーレイコンポーネント。
 *
 * パックの開封演出、カード獲得情報のインベントリ保存、難易度別発光エフェクトの表示、
 * 連続報酬（複数枚ドロップ時）のキュー処理および高難易度ポイント獲得モーダルへの橋渡しを担います。
 *
 * @return {JSX.Element|null} 報酬表示中のオーバーレイUI、非表示時はnull
 */
export default function RewardOverlay() {
  const [isVisible, setIsVisible] = useState(false);
  const [card, setCard] = useState(null);
  const [phase, setPhase] = useState('pack'); // 'pack' | 'animating' | 'reveal'
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [rewardQueue, setRewardQueue] = useState([]);
  const timersRef = useRef([]);

  /**
   * 登録済みの全タイマーを安全にクリアして配列をリセットします。
   * 画面のアンマウントやフェーズ切り替え時の多重実行・メモリリークを防止します。
   */
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  /**
   * パック開封アニメーションシーケンスを開始します。
   * カード飛び出し音の再生後、指定された遅延時間でカード公開フェーズへ移行します。
   *
   * @param {number} revealDelayMs - カード公開フェーズへ移行するまでの待機時間(ms)
   */
  const startOpeningAnimation = useCallback((revealDelayMs) => {
    setPhase('animating');
    const timer1 = setTimeout(() => {
      playSound(SOUNDS.seTurnover);
    }, TURNOVER_SE_DELAY_MS);
    timersRef.current.push(timer1);

    const timer2 = setTimeout(() => {
      setPhase('reveal');
      playSound(SOUNDS.seSkill || SOUNDS.seClick);
    }, revealDelayMs);
    timersRef.current.push(timer2);
  }, []);

  /**
   * 獲得したカード報酬をセットアップし、インベントリ保存と画面表示の準備を行います。
   *
   * @param {string} rewardCardId - 付与する報酬カードのマスターID
   * @param {boolean} [autoAnimate=false] - 2枚目以降など、パックタップを省略して自動開封演出を開始するかどうか
   */
  const setupReward = useCallback(
    (rewardCardId, autoAnimate = false) => {
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

        setIsFadingOut(false);
        setIsVisible(true);

        if (autoAnimate) {
          // パックのタップは最初の一回のみ。2枚目以降は自動で開封アニメーションへ進行
          startOpeningAnimation(AUTO_REVEAL_DELAY_MS);
        } else {
          setPhase('pack');
        }
      }
    },
    [clearAllTimers, startOpeningAnimation]
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

  /**
   * パックをクリック（タップ）した際の手動開封ハンドラ
   */
  const handlePackClick = () => {
    if (phase !== 'pack') return;
    playSound(SOUNDS.seClick);
    startOpeningAnimation(MANUAL_REVEAL_DELAY_MS);
  };

  /**
   * 報酬受取完了または次の報酬表示への進行ハンドラ。
   * 未確認の報酬キューがある場合は次の報酬を表示し、すべて完了した場合は各ゲームモードに応じた画面遷移を実行します。
   *
   * @param {React.MouseEvent} e - クリックイベントオブジェクト
   */
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

      // フェードアウト時間待機後に消去
      const timer3 = setTimeout(() => {
        setIsVisible(false);
        setIsFadingOut(false);
      }, FADE_OUT_DURATION_MS);
      timersRef.current.push(timer3);
      return;
    }

    if (rewardQueue.length > 1) {
      const nextQueue = rewardQueue.slice(1);
      setRewardQueue(nextQueue);
      setupReward(nextQueue[0], true);
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

  /**
   * カードのスキルタグHTMLを描画するためのReactヘルパー。
   *
   * @param {Object} c - 対象カードオブジェクト
   * @return {JSX.Element|null} スキルタグ要素、または描画関数未定義時はnull
   */
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

  /**
   * 報酬パックの発光CSSクラスを返します。
   * 高難易度イベントでは虹色（glow-rainbow）を返します。
   * 通常モードでは対戦難易度（またはストーリー難易度）に対応する発光色を返します。
   * - 初級 (DIFFICULTY.EASY): 緑色 (glow-green)
   * - 中級 (DIFFICULTY.NORMAL): 黄色 (glow-yellow)
   * - 上級以上 (DIFFICULTY.HARD): 赤色 (glow-red)
   *
   * @return {string} 発光用のCSSクラス名
   */
  const getGlowColorClass = () => {
    // 1. 高難易度イベント（超級イベント等）は最優先で虹色発光クラスを適用
    if (checkIsHighDiffMode(GameState.gameMode)) return 'glow-rainbow';

    // 2. 対戦難易度またはストーリー難易度から発光色を決定（未設定時は初級）
    const diff =
      GameState.difficulty || GameState.storyDifficulty || DIFFICULTY.EASY;
    if (diff === DIFFICULTY.EASY) return 'glow-green';
    if (diff === DIFFICULTY.NORMAL) return 'glow-yellow';
    if (diff >= DIFFICULTY.HARD) return 'glow-red';
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

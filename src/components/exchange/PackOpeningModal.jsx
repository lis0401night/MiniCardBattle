/**
 * パック開封演出モーダルコンポーネント
 *
 * 交換所等でのパック交換時に表示されるパック画面。
 * 画面中央に立体的なパックを表示し、プレイヤーがタップすることで開封アニメーション
 * （シェイク・カード飛び出し・めくりSE）が発生し、フリップイン演出とともに
 * 排出されたカードの詳細プレビューを表示します。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import {
  AUTO_REVEAL_DELAY_MS,
  DEFAULT_PACK_COVER_CARD_ID,
  FADE_OUT_DURATION_MS,
  MANUAL_REVEAL_DELAY_MS,
  resolvePackLogoUrl,
  TURNOVER_SE_DELAY_MS,
} from '../../utils/constants/packs.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import CardPreviewContent from '../common/CardPreviewContent.jsx';

/**
 * パック開封演出モーダル。
 * 単一または複数のパック開封に対応し、複数パック時は待機パックのスタック表示および
 * 連続開封（次へ）遷移を提供します。
 *
 * @param {Object} props
 * @param {string} [props.cardId] - 排出されたカードのID（単一パック用）
 * @param {Array<string>} [props.cardIds] - 排出されたカードIDの配列（複数パック用）
 * @param {string} [props.coverCardId=DEFAULT_PACK_COVER_CARD_ID] - パック表紙として合成するカードのID
 * @param {string} [props.logoUrl] - パック表面に重ねるタイトルロゴ画像のURL（省略時はpackvol01.pngを自動解決）
 * @param {Function} props.onClose - モーダル終了（OK押下時）のコールバック関数
 * @returns {JSX.Element|null} パック開封モーダル要素
 */
export default function PackOpeningModal({
  cardId,
  cardIds = [],
  coverCardId = DEFAULT_PACK_COVER_CARD_ID,
  logoUrl,
  onClose,
}) {
  // 初期開封キュー（配列指定を優先、単一IDも後方互換サポート）
  const initialQueue =
    Array.isArray(cardIds) && cardIds.length > 0
      ? cardIds
      : cardId
        ? [cardId]
        : [DEFAULT_PACK_COVER_CARD_ID];

  const [queue, setQueue] = useState(initialQueue);
  // フェーズ管理: 'pack'（パック待機） -> 'animating'（開封演出中） -> 'reveal'（カード公開）
  const [phase, setPhase] = useState('pack');
  const [isFadingOut, setIsFadingOut] = useState(false);
  const timersRef = useRef([]);

  // 現在開封中のカードIDおよびカードデータ
  const currentCardId = queue[0];
  const card =
    CARD_MASTER.find((m) => m.id === currentCardId) ||
    CARD_MASTER.find((m) => m.id === DEFAULT_PACK_COVER_CARD_ID) ||
    CARD_MASTER[0];

  /**
   * 登録されたすべてのタイマーをクリアするユーティリティ関数
   */
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  /**
   * パック開封アニメーションシーケンスを開始します。
   * めくり効果音の再生後、指定された遅延時間でカード公開フェーズへ移行します。
   *
   * @param {number} revealDelayMs - カード公開フェーズへ移行するまでの待機時間(ms)
   */
  const startOpeningAnimation = useCallback((revealDelayMs) => {
    setPhase('animating');

    const timer1 = setTimeout(() => {
      playSound(SOUNDS?.seTurnover);
    }, TURNOVER_SE_DELAY_MS);
    timersRef.current.push(timer1);

    const timer2 = setTimeout(() => {
      setPhase('reveal');
      playSound(SOUNDS?.seSkill || SOUNDS?.seClick);
    }, revealDelayMs);
    timersRef.current.push(timer2);
  }, []);

  /**
   * パッククリック/タップ時の開封アニメーション開始ハンドラ
   */
  const handlePackClick = useCallback(() => {
    if (phase !== 'pack') return;

    playSound(SOUNDS?.seClick);
    startOpeningAnimation(MANUAL_REVEAL_DELAY_MS);
  }, [phase, startOpeningAnimation]);

  /**
   * カードプレビュー確認後の閉じる処理ハンドラ
   */
  const handleClose = useCallback(() => {
    playSound(SOUNDS?.seClick);
    setIsFadingOut(true);
    clearAllTimers();

    // フェードアウト演出時間待機後にクローズコールバックを呼び出し
    const timer = setTimeout(() => {
      if (typeof onClose === 'function') {
        onClose();
      }
    }, FADE_OUT_DURATION_MS);
    timersRef.current.push(timer);
  }, [clearAllTimers, onClose]);

  /**
   * 次のパックへ進むハンドラ（複数パック開封時）
   * パックのタップは最初の1回のみとし、2枚目以降は「次へ」押下で自動的に
   * 開封アニメーション（飛び出し・SE）を経てスムーズにカード公開へ進行します。
   */
  const handleNext = useCallback(() => {
    if (queue.length > 1) {
      playSound(SOUNDS?.seClick);
      clearAllTimers();
      setQueue((prev) => prev.slice(1));

      // パックのタップは最初の1回のみ。2枚目以降は自動で開封アニメーションへ移行
      startOpeningAnimation(AUTO_REVEAL_DELAY_MS);
    } else {
      handleClose();
    }
  }, [queue, handleClose, clearAllTimers, startOpeningAnimation]);

  /**
   * スキルタグ描画ヘルパー関数
   *
   * @param {Object} c - 対象カードオブジェクト
   * @returns {JSX.Element|null} スキルタグHTML要素
   */
  const renderSkillTagReact = useCallback((c) => {
    if (!window.renderSkillTag) return null;
    return (
      <div
        dangerouslySetInnerHTML={{ __html: window.renderSkillTag(c, false) }}
      />
    );
  }, []);

  if (!card) return null;

  // 表紙カード画像URL
  const coverImgUrl = appendVersionQuery(
    `assets/cards/card_${coverCardId}.webp`
  );
  // パックタイトルロゴ画像URL
  const resolvedLogoUrl = resolvePackLogoUrl(logoUrl);

  return (
    <div
      className={`screen active pack-opening-modal-container ${
        isFadingOut ? 'fade-out' : ''
      }`}
      style={{
        zIndex: 5000,
        background: 'rgba(0,0,0,0.88)',
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
        /* 閉じる際のフェードアウトアニメーション */
        @keyframes pack-modal-fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .pack-opening-modal-container.fade-out {
          animation: pack-modal-fade-out 0.3s forwards;
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

        .stacked-pack {
          position: absolute;
          top: -15px;
          right: -25px;
          /* 交換所の商品一覧画面（1 : 1.5 カード縦横比）とパック・ロゴの見た目比率を完全一致 */
          width: 260px;
          height: 390px;
          transform: scale(0.95);
          z-index: 0;
          filter: brightness(0.85);
          pointer-events: none;
        }

        .pack-wrapper {
          position: relative;
          /* 交換所の商品一覧画面（1 : 1.5 カード縦横比）とパック・ロゴの見た目比率を完全一致 */
          width: 260px;
          height: 390px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pack-container {
          position: relative;
          /* 交換所の商品一覧画面（1 : 1.5 カード縦横比）とパック・ロゴの見た目比率を完全一致 */
          width: 260px;
          height: 390px;
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

        /* パック背後の発光 */
        .pack-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 95%;
          height: 95%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          filter: blur(40px);
          z-index: -1;
          pointer-events: none;
          background: #eab308;
          animation: pulse-glow 2s infinite;
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.9); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
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
          mix-blend-mode: overlay;
          opacity: 0.55;
          z-index: 12;
          pointer-events: none;
        }

        /* パックテキスト画像 */
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

        /* パックタイトルロゴ画像（最前面レイヤー） */
        .pack-logo-image {
          position: absolute;
          top: 40%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 86%;
          max-height: 40%;
          object-fit: contain;
          z-index: 14;
          pointer-events: none;
          filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.6));
        }

        .cover-portrait-frame {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 11;
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

        .cover-portrait-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: contrast(1.08) saturate(1.15) brightness(0.98);
          mix-blend-mode: multiply;
          opacity: 1;
        }

        .tap-prompt {
          position: absolute;
          bottom: -40px;
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
          bottom: 45px;
          left: 50%;
          width: 210px;
          height: 290px;
          background: linear-gradient(135deg, #1e3a8a, #0f172a);
          border: 3px solid #38bdf8;
          border-radius: 10px;
          box-shadow: 0 0 20px rgba(56, 189, 248, 0.7);
          animation: card-shoot-up 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          z-index: 1;
          pointer-events: none;
        }

        .reveal-wrapper {
          animation: card-flip-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          display: flex;
          max-height: 95dvh;
        }
      `}</style>

      {phase !== 'reveal' ? (
        <div className="pack-wrapper">
          {/* 背後の待機パック（残り枚数分だけ奥へ重ねて表示。多すぎると見づらいので最大3枚まで） */}
          {Array.from({ length: Math.min(queue.length - 1, 3) })
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
                <div className="cover-portrait-frame">
                  <img
                    className="cover-portrait-img"
                    src={coverImgUrl}
                    alt="Pack Cover"
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
                {/* 5. パックタイトルロゴ */}
                {resolvedLogoUrl && (
                  <img
                    className="pack-logo-image"
                    src={resolvedLogoUrl}
                    alt="Pack Logo"
                  />
                )}
              </div>
            ))}

          {/* 飛び出すカード (パックの後ろに描画) */}
          {phase === 'animating' && <div className="shooting-card" />}

          {/* パック本体 */}
          <div
            className={`pack-container ${
              phase === 'animating' ? 'shaking' : ''
            }`}
            onClick={handlePackClick}
          >
            {/* パック後光エフェクト */}
            <div className="pack-glow" />

            {/* 1. パック画像（底） */}
            <img
              className="pack-image"
              src={appendVersionQuery('assets/ui/packimg01.png')}
              alt="Booster Pack"
            />

            {/* 2. 表紙カード画像（中・乗算ブレンド） */}
            <div className="cover-portrait-frame">
              <img
                className="cover-portrait-img"
                src={coverImgUrl}
                alt="Pack Cover"
              />
            </div>

            {/* 3. パック画像（天・光沢オーバーレイ） */}
            <img
              className="pack-image specular"
              src={appendVersionQuery('assets/ui/packimg01.png')}
              alt="Booster Pack Specular"
            />

            {/* 4. パックのテキスト画像 */}
            <img
              className="pack-text-image"
              src={appendVersionQuery('assets/ui/packtextimg01.png')}
              alt="Pack Text"
            />

            {/* 5. パックタイトルロゴ（最前面） */}
            {resolvedLogoUrl && (
              <img
                className="pack-logo-image"
                src={resolvedLogoUrl}
                alt="Pack Logo"
              />
            )}

            {phase === 'pack' && (
              <div className="tap-prompt">タップしてパックを開封！</div>
            )}
          </div>
        </div>
      ) : (
        <div className="reveal-wrapper">
          <CardPreviewContent
            card={{ ...card, owner: 'blue' }}
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
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  padding: '10px 0',
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

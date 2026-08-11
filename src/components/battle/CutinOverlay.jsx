import { useEffect, useRef, useState } from 'react';
import { GameState } from '../../state/gameState.js';
import { getSkinImage } from '../../utils/constants/characters.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import {
  checkIsTutorialMode,
  checkIsStoryMode,
  checkIsFreeMode,
} from '../../utils/gameUtils.js';

/** カットイン表示時間（ミリ秒） */
const CUTIN_DISPLAY_DURATION = 2500;

/**
 * リーダースキル発動時のキャラクターカットインアニメーションを表示するコンポーネント
 * 画像の読み込み完了 (onLoad) を検知してからタイマー（2.5秒）とCSSアニメーション演出を開始することで、
 * ネットワーク遅延によるカットイン時間短縮・CSSキーフレームの途切れ・位置ズレを完全に防止します。
 *
 * @returns {JSX.Element|null} カットインオーバーレイ要素
 */
export default function CutinOverlay() {
  const [cutinData, setCutinData] = useState(null);
  const [isImageReady, setIsImageReady] = useState(false);
  const timeoutRef = useRef(null);
  const currentRequestIdRef = useRef(0);

  useEffect(() => {
    /**
     * リーダースキル発動時のカットイン演出を起動するReactブリッジ関数
     *
     * @param {Object} config - リーダーのキャラ設定オブジェクト
     * @param {boolean} isBlue - 自陣（青チーム）かどうか
     */
    window.showCutinReact = (config, isBlue) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsImageReady(false);
      const requestId = currentRequestIdRef.current + 1;
      currentRequestIdRef.current = requestId;
      setCutinData({ config, isBlue, requestId });
    };

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      delete window.showCutinReact;
    };
  }, []);

  /**
   * カットイン画像の読み込み完了時に呼び出されるハンドラー
   * 画像ロード完了後に 2.5 秒タイマーを開始し、演出を可視化（マウント）する。
   *
   * @param {number} loadRequestId - ロードされたカットインのリクエストID
   */
  const handleImageLoad = (loadRequestId) => {
    // 最新のカットイン要求でない場合はスキップ（連続発動時の競合防止）
    if (loadRequestId !== currentRequestIdRef.current) return;

    setIsImageReady(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (loadRequestId === currentRequestIdRef.current) {
        setCutinData(null);
        setIsImageReady(false);
      }
    }, CUTIN_DISPLAY_DURATION);
  };

  if (!cutinData) return null;

  const { config, isBlue, requestId } = cutinData;
  const textColor = isBlue ? '#fff' : '#ff0000';
  const textShadow = isBlue
    ? '0 0 20px #38bdf8, 3px 3px 0 #000'
    : '0 0 20px #000, 3px 3px 0 #fff';
  const bgGradient = isBlue
    ? 'linear-gradient(90deg, transparent, #38bdf8, transparent)'
    : 'linear-gradient(90deg, transparent, #ef4444, transparent)';

  // モード判定を考慮してプレイヤーまたは敵のスキン適用後立ち絵画像を取得
  const skinId = isBlue
    ? checkIsTutorialMode()
      ? 'default'
      : GameState.playerSkins?.[config.id]
    : checkIsTutorialMode() || checkIsStoryMode() || checkIsFreeMode()
      ? 'default'
      : GameState.enemySkins?.[config.id];

  const rawImgSrc = getSkinImage(config, skinId, 'image');
  const charImgSrc = appendVersionQuery(rawImgSrc);
  const filterGlow = isBlue
    ? 'drop-shadow(0 0 20px #38bdf8)'
    : 'drop-shadow(0 0 20px #ef4444)';

  return (
    <>
      {/* ロード未完了時は隠しimgタグでプリロードを行い、onLoad完了を検知する */}
      {!isImageReady && (
        <img
          src={charImgSrc}
          alt=""
          style={{ display: 'none' }}
          onLoad={() => handleImageLoad(requestId)}
        />
      )}

      {/* ロード完了後にアニメーション演出コンテナを可視化（マウント）する */}
      {isImageReady && (
        <div key={requestId} id="screen-cutin" style={{ display: 'flex' }}>
          <div
            id="cutin-bg"
            className="cutin-bg"
            style={{ background: bgGradient }}
          ></div>
          <img
            key={`cutin-img-${requestId}`}
            id="cutin-char-img"
            src={charImgSrc}
            className="cutin-char"
            alt="Cutin Character"
            style={{ filter: filterGlow }}
          />
          <div
            id="cutin-text"
            className="cutin-text-img"
            style={{
              color: textColor,
              textShadow: textShadow,
            }}
          >
            {config.leaderSkill?.name ?? 'スキル'}!!
          </div>
        </div>
      )}
    </>
  );
}

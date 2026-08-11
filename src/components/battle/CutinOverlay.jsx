import { useEffect, useState } from 'react';
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
 * CSS（style.css）の演出は一切変更せず、画像読み込み完了（onLoad）を検知してから可視化することで、
 * ネットワーク遅延によるカットイン画像サイズ確定前の位置ズレ・ガタつきを防止する。
 *
 * @returns {JSX.Element|null} カットインオーバーレイ要素
 */
export default function CutinOverlay() {
  const [cutinData, setCutinData] = useState(null);
  const [isImageReady, setIsImageReady] = useState(false);

  useEffect(() => {
    let timeoutId = null;

    /**
     * リーダースキル発動時のカットイン演出を起動するReactブリッジ関数
     *
     * @param {Object} config - リーダーのキャラ設定オブジェクト
     * @param {boolean} isBlue - 自陣（青チーム）かどうか
     */
    window.showCutinReact = (config, isBlue) => {
      if (timeoutId) clearTimeout(timeoutId);
      setIsImageReady(false);
      setCutinData({ config, isBlue, timestamp: Date.now() });

      // 指定時間経過後にカットイン表示を非表示化
      timeoutId = setTimeout(() => {
        setCutinData(null);
        setIsImageReady(false);
      }, CUTIN_DISPLAY_DURATION);
    };

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      delete window.showCutinReact;
    };
  }, []);

  if (!cutinData) return null;

  const { config, isBlue, timestamp } = cutinData;
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
    <div
      key={timestamp}
      id="screen-cutin"
      style={{
        display: 'flex',
        visibility: isImageReady ? 'visible' : 'hidden',
      }}
    >
      <div
        id="cutin-bg"
        className="cutin-bg"
        style={{ background: bgGradient }}
      ></div>
      <img
        key={`cutin-img-${timestamp}`}
        id="cutin-char-img"
        src={charImgSrc}
        className="cutin-char"
        alt="Cutin Character"
        onLoad={() => setIsImageReady(true)}
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
  );
}

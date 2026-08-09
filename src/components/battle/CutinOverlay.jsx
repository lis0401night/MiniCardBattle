import { useEffect, useState } from 'react';
import { GameState } from '../../state/gameState.js';
import { getSkinImage } from '../../utils/constants/characters.js';

/** カットイン表示時間（ミリ秒） */
const CUTIN_DISPLAY_DURATION = 2500;

/**
 * リーダースキル発動時のキャラクターカットインアニメーションを表示するコンポーネント
 *
 * @returns {JSX.Element|null} カットインオーバーレイ要素
 */
export default function CutinOverlay() {
  const [cutinData, setCutinData] = useState(null);

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
      setCutinData({ config, isBlue });

      // 指定時間経過後にカットイン表示を非表示化
      timeoutId = setTimeout(() => {
        setCutinData(null);
      }, CUTIN_DISPLAY_DURATION);
    };

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      delete window.showCutinReact;
    };
  }, []);

  if (!cutinData) return null;

  const { config, isBlue } = cutinData;
  const textColor = isBlue ? '#fff' : '#ff0000';
  const textShadow = isBlue
    ? '0 0 20px #38bdf8, 3px 3px 0 #000'
    : '0 0 20px #000, 3px 3px 0 #fff';
  const bgGradient = isBlue
    ? 'linear-gradient(90deg, transparent, #38bdf8, transparent)'
    : 'linear-gradient(90deg, transparent, #ef4444, transparent)';

  // プレイヤーまたは敵のスキン適用後立ち絵画像を取得
  const charImgSrc = isBlue
    ? getSkinImage(config, GameState.playerSkins[config.id], 'image')
    : getSkinImage(config, GameState.enemySkins?.[config.id], 'image');

  return (
    <div id="screen-cutin" style={{ display: 'flex' }}>
      <div
        id="cutin-bg"
        className="cutin-bg"
        style={{ background: bgGradient }}
      ></div>
      <img
        id="cutin-char-img"
        src={charImgSrc}
        className="cutin-char"
        alt="Cutin Character"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          animation: 'slideIn 2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards',
        }}
      />
      <div
        id="cutin-text"
        className="cutin-text-img"
        style={{
          color: textColor,
          textShadow: textShadow,
          animation: 'textPop 2s ease forwards',
        }}
      >
        {config.leaderSkill?.name ?? 'スキル'}!!
      </div>
    </div>
  );
}

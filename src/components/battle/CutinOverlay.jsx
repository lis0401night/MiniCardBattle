import { useEffect, useState } from 'react';
import { GameState } from '../../state/gameState.js';
import { getSkinImage } from '../../utils/constants/characters.js';

// カットイン表示時間（ミリ秒）
const CUTIN_DISPLAY_DURATION = 2500;

export default function CutinOverlay() {
  const [cutinData, setCutinData] = useState(null);

  useEffect(() => {
    let timeoutId = null;

    window.showCutinReact = (config, isBlue) => {
      if (timeoutId) clearTimeout(timeoutId);
      setCutinData({ config, isBlue });

      // 2.5s後にカットイン表示を消す
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

  return (
    <div id="screen-cutin" style={{ display: 'flex' }}>
      <div
        id="cutin-bg"
        className="cutin-bg"
        style={{ background: bgGradient }}
      ></div>
      <img
        id="cutin-char-img"
        src={
          isBlue
            ? getSkinImage(config, GameState.playerSkins[config.id], 'image')
            : getSkinImage(config, GameState.enemySkins?.[config.id], 'image')
        }
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

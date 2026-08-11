import { useEffect, useState } from 'react';
import { VFX_DATA } from '../../utils/constants/vfx.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import { playSound, sleep } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * 3x10などのスプライトシートを再生するサブコンポーネント
 */
function SpriteAnimation({
  src,
  columns,
  rows,
  frameCount,
  duration,
  onComplete,
}) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const frameTime = duration / frameCount;

  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame >= frameCount) {
        clearInterval(interval);
        if (onComplete) onComplete();
      } else {
        setCurrentFrame(frame);
      }
    }, frameTime);

    return () => clearInterval(interval);
  }, [frameCount, duration, onComplete, frameTime]);

  const col = currentFrame % columns;
  const row = Math.floor(currentFrame / columns);

  const posX = columns > 1 ? (col / (columns - 1)) * 100 : 0;
  const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;

  return (
    <div
      className="vfx-sprite-container"
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  );
}

/**
 * フィールド全体の特殊演出（VFX）を管理するコンポーネント
 */
export default function VfxOverlay() {
  const [activeEffects, setActiveEffects] = useState([]);

  useEffect(() => {
    window.triggerVfx = async (type, side, targetLane = null) => {
      const data = VFX_DATA[type];
      if (!data) {
        console.warn(`VFX data not found for type: ${type}`);
        return;
      }

      const id = `${Date.now()}-${Math.random()}`;

      // 動的な座標計算
      let dynamicPos = null;
      const containerEl =
        document.getElementById('app-container') || document.body;

      if (data.position === 'hp') {
        try {
          const isTargetEnemy =
            (side === 'blue' && data.targetSide === 'enemy') ||
            (side !== 'blue' && data.targetSide === 'self');
          const targetId = isTargetEnemy ? 'enemy-hp-fill' : 'player-hp-fill';
          const targetEl = document.getElementById(targetId);

          if (targetEl && containerEl) {
            const barEl = targetEl.closest('.hp-bar-bg') || targetEl;
            const rect = barEl.getBoundingClientRect();
            const contRect = containerEl.getBoundingClientRect();

            if (rect.width > 0 && contRect.width > 0) {
              dynamicPos = {
                left: 50, // 左右はセンター
                top:
                  ((rect.top + rect.height / 2 - contRect.top) /
                    contRect.height) *
                  100,
              };
            }
          }
        } catch (e) {
          console.error('Failed to calculate HP-based VFX position:', e);
        }
      } else if (data.position === 'lane' || data.position === 'fill') {
        const calcLane = data.position === 'fill' ? 1 : targetLane;
        if (calcLane !== null) {
          try {
            const isTargetEnemy =
              (side === 'blue' && data.targetSide === 'enemy') ||
              (side !== 'blue' && data.targetSide === 'self');
            const rowId = isTargetEnemy ? 'enemy-lanes' : 'player-lanes';
            const rowEl = document.getElementById(rowId);
            if (rowEl) {
              const cellEl = rowEl.querySelector(`[data-lane="${calcLane}"]`);
              if (cellEl && containerEl) {
                const rect = cellEl.getBoundingClientRect();
                const contRect = containerEl.getBoundingClientRect();

                if (rect.width > 0 && contRect.width > 0) {
                  dynamicPos = {
                    left:
                      ((rect.left + rect.width / 2 - contRect.left) /
                        contRect.width) *
                      100,
                    top:
                      ((rect.top + rect.height / 2 - contRect.top) /
                        contRect.height) *
                      100,
                  };
                }
              }
            }
          } catch (e) {
            console.error('Failed to calculate lane-based VFX position:', e);
          }
        }
      }

      const newEffect = { id, type, side, data, targetLane, dynamicPos };
      setActiveEffects((prev) => [...prev, newEffect]);

      // 効果音の自動再生
      if (data.se && SOUNDS[data.se]) {
        playSound(SOUNDS[data.se]);
      }

      // 特殊な追加ロジック（揺れなど）
      if (data.shake) {
        setTimeout(() => {
          document.body.classList.add('vfx-shake');
          setTimeout(() => document.body.classList.remove('vfx-shake'), 800);
        }, 300);
      }

      // 演出時間を待機して終了
      await sleep(data.duration || 1000);
      setActiveEffects((prev) => prev.filter((e) => e.id !== id));
    };

    return () => {
      window.triggerVfx = null;
    };
  }, []);

  if (activeEffects.length === 0) return null;

  return (
    <>
      {activeEffects.map((effect) => (
        <VfxItem key={effect.id} effect={effect} />
      ))}
    </>
  );
}

/**
 * 個別のVFX描画要素
 */
function VfxItem({ effect }) {
  const { type, side, data, targetLane, dynamicPos } = effect;

  const getBaseTop = () => {
    const base = dynamicPos
      ? dynamicPos.top
      : (() => {
          const isSelf = data.targetSide === 'self';
          if (side === 'blue') {
            return isSelf ? 65 : 35;
          } else {
            return isSelf ? 35 : 65;
          }
        })();

    // 敵が使用して上下反転（scale -1）される場合は、offsetYの方向も反転させる
    const isFlipped = side !== 'blue' && data.flipOnEnemy;
    const finalOffsetY = isFlipped ? -(data.offsetY || 0) : data.offsetY || 0;
    return base + finalOffsetY;
  };

  const getBaseLeft = () => {
    if (dynamicPos) return dynamicPos.left;
    if (data.position === 'lane' && targetLane !== null) {
      const laneX = [18, 50, 82];
      return laneX[targetLane];
    }
    return 50;
  };

  const finalTop = getBaseTop();
  const finalLeft = getBaseLeft();
  const positionClass =
    data.position === 'fill' && dynamicPos
      ? 'fill-dynamic'
      : data.position || '';

  return (
    <div
      className={`vfx-overlay ${type} ${side} ${positionClass}`}
      style={{
        '--vfx-top': `${finalTop}%`,
        '--vfx-left': `${finalLeft}%`,
        mixBlendMode: data.blendMode || 'normal',
      }}
    >
      <div
        className="vfx-position-wrapper"
        style={{
          position: 'absolute',
          top: 'var(--vfx-top)',
          left: 'var(--vfx-left)',
          width:
            data.position === 'lane' || (data.position === 'fill' && dynamicPos)
              ? '33.3%'
              : '100%',
          transform: `translate(-50%, -50%) scale(${side !== 'blue' && data.flipOnEnemy ? -1 : 1})`,
          pointerEvents: 'none',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {data.type === 'css' && data.className === 'beam-container' && (
          <div className="beam-container">
            <div className="beam-core"></div>
            <div className="beam-flare"></div>
            <div className="beam-particles"></div>
          </div>
        )}

        {data.type === 'sprite' && (
          <div
            style={{
              transform: `scale(${data.scale || 1.0})`,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <SpriteAnimation
              src={appendVersionQuery(data.src)}
              columns={data.columns}
              rows={data.rows}
              frameCount={data.frameCount}
              duration={data.duration}
            />
          </div>
        )}

        {data.type === 'custom_joker' && (
          <div
            style={{
              position: 'absolute',
              width: '120px',
              height: '120px',
              pointerEvents: 'none',
            }}
          >
            {/* 背後のぼかしエフェクト */}
            <img
              src={appendVersionQuery('assets/ui/ui_joker.png')}
              className="vfx-joker-blur"
              alt=""
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
            {/* 手前のメインシンボル */}
            <img
              src={appendVersionQuery('assets/ui/ui_joker.png')}
              className="vfx-joker-main"
              alt="Joker"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

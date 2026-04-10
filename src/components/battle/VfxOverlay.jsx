import React, { useState, useEffect } from 'react';
import { playSound, sleep } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import { VFX_DATA } from '../../utils/constants/vfx.js';

/**
 * 3x10などのスプライトシートを再生するサブコンポーネント
 */
function SpriteAnimation({ src, columns, rows, frameCount, duration, onComplete }) {
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
                backgroundPosition: `${posX}% ${posY}%`
            }}
        />
    );
}

/**
 * フィールド全体の特殊演出（VFX）を管理するコンポーネント
 */
export default function VfxOverlay() {
    const [activeEffect, setActiveEffect] = useState(null);

    useEffect(() => {
        window.triggerVfx = async (type, side) => {
            const data = VFX_DATA[type];
            if (!data) {
                console.warn(`VFX data not found for type: ${type}`);
                return;
            }

            setActiveEffect({ type, side, data });

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

            // 演出時間を待機
            await sleep(data.duration || 1000);
            setActiveEffect(null);
        };

        return () => {
            window.triggerVfx = null;
        };
    }, []);

    if (!activeEffect) return null;

    const { type, side, data } = activeEffect;

    // 位置計算（targetSideと発動者(side)から、実際のターゲット陣地を決定）
    const getBaseTop = () => {
        const isSelf = data.targetSide === 'self';
        
        if (side === 'blue') {
            // プレイヤーが発動したとき
            return isSelf ? 65 : 35; // 自陣なら下(65)、敵陣なら上(35)
        } else {
            // 敵が発動したとき
            return isSelf ? 35 : 65; // 自陣なら上(35)、敵陣なら下(65)
        }
    };
    const finalTop = getBaseTop() + (data.offsetY || 0);

    return (
        <div className={`vfx-overlay ${type} ${side} ${data.position || ''}`} style={{ '--vfx-top': `${finalTop}%` }}>
            <div className="vfx-position-wrapper" style={{ position: 'absolute', top: 'var(--vfx-top)', left: 0, width: '100%', transform: 'translateY(-50%)' }}>
                {data.type === 'css' && data.className === 'beam-container' && (
                    <div className="beam-container">
                        <div className="beam-core"></div>
                        <div className="beam-flare"></div>
                        <div className="beam-particles"></div>
                    </div>
                )}

                {data.type === 'sprite' && (
                    <div style={{ transform: `scale(${data.scale || 1.0})`, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <SpriteAnimation 
                            src={data.src}
                            columns={data.columns}
                            rows={data.rows}
                            frameCount={data.frameCount}
                            duration={data.duration}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

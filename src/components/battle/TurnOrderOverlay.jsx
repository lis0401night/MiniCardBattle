import React, { useState, useEffect } from 'react';
import { GameState } from '../../hooks/gameState.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playSound, sleep } from '../../utils/gameUtils.js';

export default function TurnOrderOverlay({ startAnim, onComplete }) {
    const [isVisible, setIsVisible] = useState(false);
    const [phase, setPhase] = useState('idle'); // 'idle' | 'shuffling' | 'result'
    const [playerFirst, setPlayerFirst] = useState(true);

    useEffect(() => {
        let mounted = true;

        const runAnimation = async () => {
            if (!mounted) return;
            setIsVisible(true);
            setPhase('idle');

            // 擬似的な遅延でDOM構築を待つ
            await sleep(50);
            
            playSound(SOUNDS.seSkill);
            setPhase('shuffling');

            await sleep(1500);

            if (!mounted) return;

            // 結果の決定
            const isFirst = Math.random() < 0.5;
            GameState.firstPlayer = isFirst ? 'blue' : 'red';
            setPlayerFirst(isFirst);

            setPhase('result');
            playSound(SOUNDS.seLegend);

            await sleep(500); // 移動アニメーションの時間

            await sleep(2000); // 結果表示維持

            if (!mounted) return;
            setPhase('fadeout');

            await sleep(800); // フェードアウトの時間

            if (!mounted) return;
            setIsVisible(false);
            setPhase('idle');
            
            if (onComplete) {
                onComplete(GameState.firstPlayer);
            }
        };

        if (startAnim) {
            runAnimation();
        }

        return () => {
            mounted = false;
        };
    }, [startAnim, onComplete]);

    if (!isVisible) return null;

    let card1Transform = '';
    let card2Transform = '';
    let bottomLabelOpacity = 0;
    let topLabelOpacity = 0;
    let bottomLabelTransform = 'translate(-50%, -50%)';
    let topLabelTransform = 'translate(-50%, -50%)';

    if (phase === 'result') {
        bottomLabelOpacity = 1;
        topLabelOpacity = 1;

        if (playerFirst) {
            // プレイヤー先攻: card1(blue)が下、card2(red)が上
            card1Transform = 'translateY(140px) scale(1.1)';
            card2Transform = 'translateY(-140px) scale(0.9)';
            bottomLabelTransform = 'translate(-50%, calc(-50% + 230px))';
            topLabelTransform = 'translate(-50%, calc(-50% - 230px))';
        } else {
            // 敵先攻
            card1Transform = 'translateY(-140px) scale(0.9)';
            card2Transform = 'translateY(140px) scale(1.1)';
            bottomLabelTransform = 'translate(-50%, calc(-50% + 230px))';
            topLabelTransform = 'translate(-50%, calc(-50% - 230px))';
        }
    }

    return (
        <div id="screen-turn-order" className={isVisible ? "active" : ""} style={{ 
            background: 'rgba(0,0,0,0.9)', zIndex: 3000, overflow: 'hidden',
            margin: 0, padding: 0, boxSizing: 'border-box',
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            display: isVisible ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            opacity: phase === 'fadeout' ? 0 : 1, transition: 'opacity 0.8s ease-in-out',
            pointerEvents: phase === 'fadeout' ? 'none' : 'auto'
        }}>
            <div id="turn-order-container" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, padding: 0 }}>
                <div id="to-card-1"
                    className={`turn-order-card ${phase === 'shuffling' ? 'anim-shuffle-left' : ''}`}
                    style={{ 
                        zIndex: phase === 'result' && playerFirst ? 3 : 2, 
                        transform: card1Transform
                    }}
                ></div>
                
                <div id="to-card-2" 
                    className={`turn-order-card ${phase === 'shuffling' ? 'anim-shuffle-right' : ''}`}
                    style={{ 
                        zIndex: phase === 'result' && !playerFirst ? 3 : 1, 
                        transform: card2Transform
                    }}
                ></div>
            </div>
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { GameState } from '../hooks/gameState.js';
import { executeContinue, executeGameOver } from '../hooks/uiDialogue.js';

export default function ContinueScreen() {
    const [count, setCount] = useState(9);
    const [continueImg, setContinueImg] = useState('');

    useEffect(() => {
        // コンティニュー画面を開いた時の初期設定
        setCount(9);
        if (GameState.enemyConfig && GameState.enemyConfig.character) {
            setContinueImg(GameState.enemyConfig.character.image);
        }

        // カウントダウン
        const timer = setInterval(() => {
            setCount(prev => {
                if (prev <= 0) {
                    clearInterval(timer);
                    executeGameOver();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    return (
        <div id="screen-continue" className="screen active" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h1 style={{ color: '#ef4444', fontSize: '3rem', textShadow: '0 0 10px #ef4444', marginBottom: 0 }}>CONTINUE?</h1>
            <div className="continue-img-container" style={{ position: 'relative', margin: '20px 0' }}>
                <img id="continue-img" className="continue-img" src={continueImg} alt="Continue" style={{ width: '200px', height: 'auto', borderRadius: '12px', border: '2px solid #334155' }} />
                <div id="continue-count" style={{ position: 'absolute', bottom: '10px', right: '10px', fontSize: '4rem', fontWeight: 'bold', color: '#fff', textShadow: '0 0 15px #ef4444, 2px 2px 0 #000' }}>
                    {count}
                </div>
            </div>
            <div id="continue-buttons" style={{ display: 'flex', gap: '20px' }}>
                <button className="btn" onClick={() => executeContinue()} style={{ background: 'linear-gradient(45deg, #22c55e, #16a34a)', padding: '15px 40px', fontSize: '1.5rem' }}>YES</button>
                <button className="btn" onClick={() => executeGameOver()} style={{ background: 'linear-gradient(45deg, #64748b, #475569)', padding: '15px 40px', fontSize: '1.5rem' }}>NO</button>
            </div>
        </div>
    );
}

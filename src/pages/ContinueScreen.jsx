import React, { useState, useEffect } from 'react';
import { GameState } from '../hooks/gameState.js';
import { executeContinue, executeGameOver } from '../hooks/uiDialogue.js';

export default function ContinueScreen() {
    const [count, setCount] = useState(9);
    const [continueImg, setContinueImg] = useState('');
    const [isRevived, setIsRevived] = useState(false);
    const [countText, setCountText] = useState('9');

    useEffect(() => {
        setCount(9);
        setCountText('9');
        setIsRevived(false);
        if (GameState.playerConfig && GameState.playerConfig.imageLose) {
            setContinueImg(GameState.playerConfig.imageLose);
        } else if (GameState.enemyConfig && GameState.enemyConfig.character) {
            setContinueImg(GameState.enemyConfig.character.image);
        }

        const timer = setInterval(() => {
            setCount(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (count >= 0 && !isRevived) {
            setCountText(count.toString());
        }
        if (count <= 0 && !isRevived) {
            handleGameOver();
        }
    }, [count, isRevived]);

    const handleContinue = () => {
        if (isRevived) return;
        setIsRevived(true);
        setCountText('YES!');
        if (GameState.playerConfig && GameState.playerConfig.image) {
            setContinueImg(GameState.playerConfig.image);
        }
        executeContinue();
    };

    const handleGameOver = () => {
        if (isRevived) return;
        setIsRevived(true);
        executeGameOver();
    };

    return (
        <div id="screen-continue" className="screen active" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h1 style={{ color: '#ef4444', fontSize: '3rem', textShadow: '0 0 10px #ef4444', marginBottom: 0 }}>CONTINUE?</h1>
            <div className="continue-img-container" style={{ position: 'relative', margin: '20px 0' }}>
                <img id="continue-img" className={`continue-img ${isRevived ? 'revive' : ''}`} src={continueImg || undefined} alt="Continue" style={{ width: '200px', height: 'auto', borderRadius: '12px', border: '2px solid #334155' }} />
                <div id="continue-count" style={{ position: 'absolute', bottom: '10px', right: '10px', fontSize: '4rem', fontWeight: 'bold', color: '#fff', textShadow: '0 0 15px #ef4444, 2px 2px 0 #000' }}>
                    {countText}
                </div>
            </div>
            <div id="continue-buttons" style={{ display: 'flex', gap: '20px', visibility: isRevived ? 'hidden' : 'visible' }}>
                <button className="btn" onClick={handleContinue} style={{ background: 'linear-gradient(45deg, #22c55e, #16a34a)', padding: '15px 40px', fontSize: '1.5rem' }}>YES</button>
                <button className="btn" onClick={handleGameOver} style={{ background: 'linear-gradient(45deg, #64748b, #475569)', padding: '15px 40px', fontSize: '1.5rem' }}>NO</button>
            </div>
        </div>
    );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { GameState } from '../state/gameState.js';
import { executeContinue, executeGameOver } from '../services/uiDialogue.js';
import { appendVersionQuery } from '../utils/constants/config.js';

export default function ContinueScreen() {
  const [count, setCount] = useState(9);
  const [continueImg, setContinueImg] = useState('');
  const [isRevived, setIsRevived] = useState(false);
  const [countText, setCountText] = useState('9');
  const timerRef = useRef(null);

  useEffect(() => {
    setCount(9);
    setCountText('9');
    setIsRevived(false);
    if (
      GameState.playerConfig &&
      (GameState.playerConfig.imageLose || GameState.playerConfig.image)
    ) {
      setContinueImg(
        GameState.playerConfig.imageLose || GameState.playerConfig.image
      );
    } else if (GameState.enemyConfig && GameState.enemyConfig.character) {
      setContinueImg(GameState.enemyConfig.character.image);
    }

    // 毎秒デクリメントするタイマーの作成
    timerRef.current = setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 復活(YES選択)またはゲームオーバー決定時に即座にタイマーを停止する
  useEffect(() => {
    if (isRevived && timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [isRevived]);

  const handleGameOver = useCallback(() => {
    if (isRevived) return;
    setIsRevived(true);
    executeGameOver();
  }, [isRevived]);

  const handleContinue = useCallback(() => {
    if (isRevived) return;
    setIsRevived(true);
    setCountText('YES!');
    if (GameState.playerConfig && GameState.playerConfig.image) {
      setContinueImg(GameState.playerConfig.image);
    }
    executeContinue();
  }, [isRevived]);

  useEffect(() => {
    if (count >= 0 && !isRevived) {
      setCountText(count.toString());
    }
    if (count <= 0 && !isRevived) {
      handleGameOver();
    }
  }, [count, isRevived, handleGameOver]);

  return (
    <div
      id="screen-continue"
      className="screen active"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_select.webp')}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h1
        style={{
          color: '#ef4444',
          fontSize: '3rem',
          textShadow: '0 0 10px #ef4444',
          marginBottom: 0,
        }}
      >
        CONTINUE?
      </h1>
      <div
        className="continue-img-container"
        style={{ position: 'relative', margin: '20px 0' }}
      >
        <img
          id="continue-img"
          className={`continue-img ${isRevived ? 'revive' : ''}`}
          src={continueImg || undefined}
          alt="Continue"
          style={{
            width: '200px',
            height: 'auto',
            borderRadius: '12px',
            border: '2px solid #334155',
          }}
        />
        <div
          id="continue-count"
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            fontSize: '4rem',
            fontWeight: 'bold',
            color: '#fff',
            textShadow: '0 0 15px #ef4444, 2px 2px 0 #000',
          }}
        >
          {countText}
        </div>
      </div>
      <div
        id="continue-buttons"
        style={{
          display: 'flex',
          gap: '20px',
          visibility: isRevived ? 'hidden' : 'visible',
        }}
      >
        <button
          className="btn"
          onClick={handleContinue}
          style={{
            background: 'linear-gradient(45deg, #22c55e, #16a34a)',
            padding: '15px 40px',
            fontSize: '1.5rem',
          }}
        >
          YES
        </button>
        <button
          className="btn"
          onClick={handleGameOver}
          style={{
            background: 'linear-gradient(45deg, #64748b, #475569)',
            padding: '15px 40px',
            fontSize: '1.5rem',
          }}
        >
          NO
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { GameState } from '../hooks/gameState.js';
import { SOUNDS } from '../utils/sounds.js';
import { playSound } from '../utils/gameUtils.js';

export default function EndingScreen() {
  const [opacity, setOpacity] = useState(0);
  const [step, setStep] = useState('illust'); // 'illust' or 'result'

  useEffect(() => {
    // マウント後にフェードイン
    const timer = setTimeout(() => {
      setOpacity(1);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleClickIllust = () => {
    if (step !== 'illust') return;
    playSound(SOUNDS.seClick);
    setOpacity(0);

    setTimeout(() => {
      setStep('result');
      setOpacity(1);
    }, 2000);
  };

  if (step === 'result') {
    return (
      <div
        id="screen-result"
        className="screen active"
        style={{
          backgroundColor: 'rgba(0,0,0,0.85)',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(2rem, 8vw, 4rem)',
            color: '#facc15',
            transition: 'opacity 2s',
            opacity: opacity,
            textAlign: 'center',
          }}
        >
          GAME CLEAR!
        </h1>
        <p
          style={{
            fontSize: 'clamp(1rem, 4vw, 1.2rem)',
            marginTop: '20px',
            color: '#fff',
            transition: 'opacity 2s',
            opacity: opacity,
            textAlign: 'center',
            padding: '0 20px',
          }}
        >
          すべてのライバルを撃破し、エンディングを迎えました！
        </p>
        <button
          className="btn"
          onClick={() => {
            if (window.reloadGame) window.reloadGame();
            else window.location.reload();
          }}
          style={{
            marginTop: '40px',
            transition: 'opacity 2s',
            opacity: opacity,
          }}
        >
          タイトルへ
        </button>
      </div>
    );
  }

  return (
    <div
      id="screen-ending-illust"
      className="screen active"
      style={{ backgroundColor: '#000', padding: 0 }}
      onClick={handleClickIllust}
    >
      <img
        id="ending-illust-img"
        src={GameState.playerConfig?.imageEnding || ''}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: opacity,
          transition: 'opacity 2s',
        }}
        alt="Ending"
      />
      <div
        id="ending-text"
        style={{
          position: 'absolute',
          bottom: '10%',
          fontSize: 'clamp(1.5rem, 8vw, 3rem)',
          fontWeight: 'bold',
          color: '#fff',
          textShadow: '0 0 20px #facc15, 2px 2px 0 #000',
          fontStyle: 'italic',
          opacity: opacity,
          transition: 'opacity 2s',
          textAlign: 'center',
          width: '100%',
          wordWrap: 'break-word',
        }}
      >
        CONGRATULATIONS!
      </div>
    </div>
  );
}

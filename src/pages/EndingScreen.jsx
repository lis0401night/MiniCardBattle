import { useEffect, useState } from 'react';
import { GameState } from '../state/gameState.js';
import { playSound, stopAllBGM, switchScreen } from '../utils/gameUtils.js';
import { AUDIO_INSTANCES, SOUNDS } from '../utils/sounds.js';
import { STORY_ROMANTIC_TALKS } from '../utils/constants/storyDialogues.js';

export default function EndingScreen() {
  const [opacity, setOpacity] = useState(0);
  const [textOpacity, setTextOpacity] = useState(1);
  const [step, setStep] = useState('illust'); // 'illust' or 'result'
  const [textIndex, setTextIndex] = useState(0);

  const charId = GameState.playerConfig?.id || 'android';
  const romanticTalks = STORY_ROMANTIC_TALKS[charId] || [
    "あなたと共に歩むこの未来を、私は心から信じています。",
    "これからもずっと、私の隣にいてくださいね。"
  ];

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

    if (textIndex < romanticTalks.length - 1) {
      // 次のセリフへフェード切り替え
      setTextOpacity(0);
      setTimeout(() => {
        setTextIndex((prev) => prev + 1);
        setTextOpacity(1);
      }, 500);
    } else {
      // すべてのロマンチックな台詞を読み終えたら、GAME CLEARへフェード遷移
      setOpacity(0);
      setTimeout(() => {
        setStep('result');
        setOpacity(1);
      }, 2000);
    }
  };

  if (step === 'result') {
    return (
      <div
        id="screen-result"
        className="screen active"
        style={{
          backgroundColor: 'rgba(0,0,0,0.92)',
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
            letterSpacing: '0.1em',
            textShadow: '0 0 20px rgba(250, 204, 21, 0.4)',
          }}
        >
          GAME CLEAR!
        </h1>
        <p
          style={{
            fontSize: 'clamp(1rem, 4vw, 1.2rem)',
            marginTop: '20px',
            color: '#cbd5e1',
            transition: 'opacity 2s',
            opacity: opacity,
            textAlign: 'center',
            padding: '0 20px',
          }}
        >
          すべての試練を乗り越え、魔王サタンを討ち果たしました！
        </p>
        <button
          className="btn"
          onClick={() => {
            playSound(SOUNDS.seClick);
            stopAllBGM();
            playSound(AUDIO_INSTANCES.bgmTitle);
            GameState.appState = 'title';
            switchScreen('screen-mode-select');
          }}
          style={{
            marginTop: '40px',
            transition: 'opacity 2s',
            opacity: opacity,
            padding: '12px 40px',
            fontSize: '1.1rem',
            borderColor: '#facc15',
            color: '#facc15',
          }}
        >
          タイトルへ戻る
        </button>
      </div>
    );
  }

  return (
    <div
      id="screen-ending-illust"
      className="screen active"
      style={{
        backgroundColor: '#000',
        padding: 0,
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer',
      }}
      onClick={handleClickIllust}
    >
      {/* 画面いっぱいのエンディングイラスト */}
      <img
        id="ending-illust-img"
        src={GameState.playerConfig?.imageEnding || ''}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: opacity,
          transition: 'opacity 2.5s ease-in-out',
        }}
        alt="Ending Illustration"
      />

      {/* グラデーションオーバーレイ（イラストと文字の視認性担保） */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '40%',
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%)',
          pointerEvents: 'none',
          opacity: opacity,
          transition: 'opacity 2s',
        }}
      />

      {/* ロマンチックな台詞の字幕ボックス */}
      <div
        style={{
          position: 'absolute',
          bottom: '12%',
          left: '5%',
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            border: `1.5px solid ${GameState.playerConfig?.color || '#facc15'}`,
            borderRadius: '12px',
            padding: '20px 30px',
            width: '100%',
            maxWidth: '800px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5), inset 0 0 15px rgba(255,255,255,0.05)',
            opacity: textOpacity * opacity,
            transition: 'opacity 0.5s ease-in-out',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* キャラクター名 */}
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 'bold',
              color: GameState.playerConfig?.color || '#facc15',
              marginBottom: '10px',
              textAlign: 'left',
              letterSpacing: '0.05em',
            }}
          >
            {GameState.playerConfig?.name}
          </div>
          
          {/* 台詞本文 */}
          <p
            style={{
              fontSize: 'clamp(1rem, 3.5vw, 1.25rem)',
              lineHeight: '1.6',
              color: '#f8fafc',
              margin: 0,
              textAlign: 'left',
              wordBreak: 'break-all',
            }}
          >
            {romanticTalks[textIndex]}
          </p>
        </div>

        {/* タップ促しテキスト */}
        <div
          style={{
            color: '#94a3b8',
            fontSize: '0.85rem',
            marginTop: '15px',
            animation: 'pulse 1.5s infinite',
            opacity: opacity,
            letterSpacing: '0.1em',
          }}
        >
          ▼ タップして次へ
        </div>
      </div>
    </div>
  );
}

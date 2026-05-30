import { useEffect, useState, useRef } from 'react';
import { GameState } from '../state/gameState.js';
import { playSound, stopAllBGM, switchScreen } from '../utils/gameUtils.js';
import { AUDIO_INSTANCES, SOUNDS } from '../utils/sounds.js';
import { STORY_ROMANTIC_TALKS } from '../utils/constants/storyDialogues.js';

export default function EndingScreen() {
  const [opacity, setOpacity] = useState(0);
  const [textOpacity, setTextOpacity] = useState(1);
  const [step, setStep] = useState('illust'); // 'illust', 'gallery', or 'result'
  const [textIndex, setTextIndex] = useState(0);

  const textTimerRef = useRef(null);
  const resultTimerRef = useRef(null);

  const charId = GameState.playerConfig?.id || 'android';
  const romanticTalks = STORY_ROMANTIC_TALKS[charId] || [
    'あなたと共に歩むこの未来を、私は心から信じています。',
    'これからもずっと、私の隣にいてくださいね。',
  ];

  useEffect(() => {
    // マウント後にフェードイン
    const timer = setTimeout(() => {
      setOpacity(1);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // アンマウント時に残存タイマーをクリーンアップ
    return () => {
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    };
  }, []);

  const handleClickIllust = () => {
    if (step !== 'illust' && step !== 'gallery') return;
    playSound(SOUNDS.seClick);

    if (step === 'illust') {
      if (textIndex < romanticTalks.length - 1) {
        if (textTimerRef.current) clearTimeout(textTimerRef.current);
        // 次のセリフへフェード切り替え
        setTextOpacity(0);
        textTimerRef.current = setTimeout(() => {
          setTextIndex((prev) => prev + 1);
          setTextOpacity(1);
        }, 500);
      } else {
        // すべてのロマンチックな台詞を読み終えたら、まず字幕ボックスをフェードアウトさせてイラスト単体鑑賞モード (gallery) へ
        setTextOpacity(0);
        textTimerRef.current = setTimeout(() => {
          setStep('gallery');
        }, 500);
      }
    } else if (step === 'gallery') {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      // イラスト鑑賞モードから、GAME CLEAR リザルト画面へフェード遷移
      setOpacity(0);
      resultTimerRef.current = setTimeout(() => {
        setStep('result');
        setOpacity(1);
      }, 1000);
    }
  };

  return (
    <div
      id="screen-ending"
      className="screen active"
      style={{
        backgroundColor: '#000',
        padding: 0,
        overflow: 'hidden',
        position: 'relative',
        cursor: step !== 'result' ? 'pointer' : 'default',
        width: '100%',
        height: '100%',
      }}
      onClick={step !== 'result' ? handleClickIllust : undefined}
    >
      {/* 画面いっぱいのエンディングイラスト (すべてのステップで背景として残り続ける！) */}
      <img
        id="ending-illust-img"
        src={GameState.playerConfig?.imageEnding || ''}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: step === 'result' ? 0.35 : opacity, // リザルト画面ではイラストを35%の薄暗い明るさにして文字の視認性を担保
          transition: 'opacity 2.5s ease-in-out',
        }}
        alt="Ending Illustration"
      />

      {/* グラデーションオーバーレイ（イラストと文字の視認性担保、リザルトでも適用） */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: step === 'result' ? '100%' : '40%',
          background: step === 'result'
            ? 'rgba(0, 0, 0, 0.65)' // リザルト画面では全体を黒フィルターで覆う
            : 'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%)',
          pointerEvents: 'none',
          opacity: opacity,
          transition: 'opacity 2s, height 1.5s',
        }}
      />

      {/* セリフ表示モード (step === 'illust') */}
      {step === 'illust' && (
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
              {typeof romanticTalks[textIndex] === 'object'
                ? romanticTalks[textIndex].text
                : romanticTalks[textIndex]}
            </p>
          </div>
        </div>
      )}

      {/* リザルト表示モード (step === 'result') */}
      {step === 'result' && (
        <div
          id="screen-result-content"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(2.5rem, 10vw, 4.5rem)',
              color: '#facc15',
              transition: 'opacity 2s',
              opacity: opacity,
              textAlign: 'center',
              letterSpacing: '0.15em',
              textShadow: '0 0 25px rgba(250, 204, 21, 0.6), 0 0 50px rgba(250, 204, 21, 0.3)',
              margin: 0,
            }}
          >
            GAME CLEAR!
          </h1>
          <p
            style={{
              fontSize: 'clamp(1.1rem, 4.5vw, 1.35rem)',
              marginTop: '25px',
              color: '#f1f5f9',
              transition: 'opacity 2s',
              opacity: opacity,
              textAlign: 'center',
              padding: '0 20px',
              letterSpacing: '0.05em',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
            }}
          >
            すべての試練を乗り越え、魔王サタンを討ち果たしました！
          </p>
          <button
            className="btn"
            onClick={(e) => {
              e.stopPropagation();
              playSound(SOUNDS.seClick);
              stopAllBGM();
              playSound(AUDIO_INSTANCES.bgmTitle);
              GameState.appState = 'title';
              switchScreen('screen-mode-select');
            }}
            style={{
              marginTop: '45px',
              transition: 'opacity 2s',
              opacity: opacity,
              padding: '14px 45px',
              fontSize: '1.15rem',
              borderColor: '#facc15',
              color: '#facc15',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              boxShadow: '0 4px 15px rgba(250, 204, 21, 0.2)',
            }}
          >
            タイトルへ戻る
          </button>
        </div>
      )}
    </div>
  );
}

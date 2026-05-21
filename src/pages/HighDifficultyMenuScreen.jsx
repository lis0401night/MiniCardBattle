import BackButton from '../components/BackButton.jsx';
import { showEventMenu, showHighDifficultyRules } from '../hooks/uiMainCore.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function HighDifficultyMenuScreen() {
  const handleChallengeClick = () => {
    playSound(SOUNDS.seClick);
    if (window.switchScreen) window.switchScreen('screen-high-difficulty');
  };

  return (
    <div
      id="screen-high-difficulty-menu"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#ef4444',
          margin: '20px 0',
          textShadow: '0 0 15px rgba(239, 68, 68, 0.6)',
          textAlign: 'center',
        }}
      >
        高難易度
      </h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '250px',
        }}
      >
        <button
          className="btn btn-yellow"
          onClick={() => showHighDifficultyRules?.()}
        >
          ルール
        </button>
        <button
          className="btn"
          style={{ background: 'linear-gradient(45deg, #ef4444, #b91c1c)' }}
          onClick={handleChallengeClick}
        >
          挑戦
        </button>
      </div>

      <div
        style={{
          padding: '15px 0 20px 0',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
        }}
      >
        <BackButton
          onClick={() => showEventMenu?.()}
          style={{ margin: 0 }}
        />
      </div>
    </div>
  );
}

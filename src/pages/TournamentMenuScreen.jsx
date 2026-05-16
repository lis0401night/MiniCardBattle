import BackButton from '../components/BackButton.jsx';
import { showEventMenu, startGameMode } from '../hooks/uiMainCore.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function TournamentMenuScreen() {
  return (
    <div
      id="screen-tournament-menu"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.6), rgba(15, 23, 42, 0.8)), url('assets/backgrounds/background_tournament01.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#60a5fa',
          marginBottom: '30px',
          textShadow: '0 0 15px rgba(59, 130, 246, 0.6)',
        }}
      >
        夢幻の闘技祭
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
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            switchScreen?.('screen-tournament-rules');
          }}
        >
          ルール
        </button>

        <button
          className="btn"
          style={{ background: 'linear-gradient(45deg, #2563eb, #1e40af)' }}
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            startGameMode?.('tournament');
          }}
        >
          挑戦
        </button>

        <button
          className="btn"
          style={{ background: 'linear-gradient(45deg, #f97316, #ea580c)' }}
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            switchScreen?.('screen-tournament-exchange');
          }}
        >
          交換所
        </button>
      </div>

      <BackButton
        onClick={() => showEventMenu?.()}
        style={{ marginTop: '40px' }}
      />
    </div>
  );
}

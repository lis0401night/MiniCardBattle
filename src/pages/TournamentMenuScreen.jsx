import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import { showEventMenu, startGameMode } from '../services/uiMainCore.js';
import { switchScreen } from '../utils/gameUtils.js';

export default function TournamentMenuScreen() {
  return (
    <ScreenLayout
      id="screen-tournament-menu"
      backgroundImage="background_tournament01.webp"
      title="夢幻の闘技祭"
      titleColor="#60a5fa"
      titleGlow={true}
      onBackClick={() => showEventMenu?.()}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '250px',
          marginBottom: '20px',
        }}
      >
        <MenuButton
          label="ルール"
          variant="yellow"
          onClick={() => switchScreen?.('screen-tournament-rules')}
        />
        <MenuButton
          label="ランキング"
          variant="red"
          style={{ color: '#ffffff' }}
          onClick={() => switchScreen?.('screen-tournament-ranking')}
        />
        <MenuButton
          label="挑戦"
          variant="blue"
          onClick={() => startGameMode?.('tournament')}
        />
        <MenuButton
          label="交換所"
          variant="orange"
          onClick={() => switchScreen?.('screen-tournament-exchange')}
        />
      </div>
    </ScreenLayout>
  );
}

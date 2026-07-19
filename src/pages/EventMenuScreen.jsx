import MenuImageButton from '../components/common/MenuImageButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import {
  showDefenseMenu,
  showFortuneMenu,
  startGameMode,
  startHighDifficulty,
} from '../services/uiMainCore.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { AUDIO_INSTANCES } from '../utils/sounds.js';

export default function EventMenuScreen() {
  const images = UI_IMAGES || {};

  return (
    <ScreenLayout
      id="screen-event-menu"
      title="イベント"
      titleColor="#facc15"
      backgroundImage="background_select.webp"
      backTo="screen-mode-select"
      backHasBorder={true}
    >
      <div className="menu-btn-grid">
        <MenuImageButton
          label="高難易度"
          image={images.EVENT_HIGH_DIFF}
          onClick={() => startHighDifficulty?.()}
          badgeText="勝利でカードGET"
        />
        <MenuImageButton
          label="防衛戦"
          image={images.EVENT_DEFENSE}
          onClick={() => showDefenseMenu?.()}
        />
        <MenuImageButton
          label="試練の宮殿"
          image={images.MENU_DUNGEON}
          onClick={() => startGameMode?.('battle_dungeon')}
        />
        <MenuImageButton
          label="夢幻の闘技祭"
          image={images.EVENT_TOURNAMENT}
          onClick={() => {
            playSound?.(AUDIO_INSTANCES?.bgmTournament1);
            switchScreen?.('screen-tournament-menu');
          }}
        />
        <MenuImageButton
          label="運命の邂逅"
          image={images.EVENT_FORTUNE}
          onClick={() => showFortuneMenu?.()}
          badgeText="勝利でカードGET"
        />
      </div>
    </ScreenLayout>
  );
}

import {
  showDefenseMenu,
  startGameMode,
  startHighDifficulty,
} from '../hooks/uiMainCore.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { AUDIO_INSTANCES, SOUNDS } from '../utils/sounds.js';

export default function EventMenuScreen() {
  const images = UI_IMAGES || {};

  return (
    <div id="screen-event-menu" className="screen active">
      <h2 style={{ color: '#facc15', marginBottom: '40px' }}>イベント</h2>
      <div className="menu-btn-grid">
        <div className="menu-img-btn" onClick={() => startHighDifficulty?.()}>
          <div
            className="menu-img-bg"
            style={{
              backgroundImage: `url('${images.EVENT_HIGH_DIFF || ''}')`,
            }}
          ></div>
          <div className="menu-btn-label">高難易度</div>
        </div>
        <div className="menu-img-btn" onClick={() => showDefenseMenu?.()}>
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.EVENT_DEFENSE || ''}')` }}
          ></div>
          <div className="menu-btn-label">防衛戦</div>
        </div>
        <div
          className="menu-img-btn"
          onClick={() => startGameMode?.('battle_dungeon')}
        >
          <div
            className="menu-img-bg"
            style={{
              backgroundImage: `url('${images.MENU_DUNGEON || ''}')`,
              backgroundColor: '#475569',
            }}
          ></div>
          <div className="menu-btn-label">試練の宮殿</div>
        </div>
        <div
          className="menu-img-btn"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            playSound?.(AUDIO_INSTANCES?.bgmTournament1);
            switchScreen?.('screen-tournament-menu');
          }}
        >
          <div
            className="menu-img-bg"
            style={{
              backgroundImage: `url('${images.EVENT_TOURNAMENT || ''}')`,
              backgroundColor: '#2563eb', // 画像がない場合のフォールバック
            }}
          ></div>
          <div className="menu-btn-label">夢幻の闘技祭</div>
        </div>
      </div>
      <div
        style={{
          marginTop: '20px',
          borderTop: '1px solid #334155',
          paddingTop: '20px',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <button
          className="btn"
          style={{ background: '#475569' }}
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            switchScreen?.('screen-mode-select');
          }}
        >
          戻る
        </button>
      </div>
    </div>
  );
}

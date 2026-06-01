import { UI_IMAGES } from '../utils/constants/uiImages.js';
import { showGallery } from '../services/uiGallery.js';
import {
  showBeginnerGuide,
  showOptions,
  showSoloMenu,
  showDeckEditMenu,
  showEventMenu,
  showOnlineMenu,
} from '../services/uiMainCore.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function ModeSelectScreen() {
  const images = UI_IMAGES || {};

  return (
    <div id="screen-mode-select" className="screen active">
      <button
        className="btn-circle btn-gear"
        onClick={() => {
          playSound?.(SOUNDS?.seClick);
          showOptions?.();
        }}
      >
        ⚙
      </button>

      <div className="menu-btn-grid">
        <div
          className="menu-img-btn"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showBeginnerGuide?.();
          }}
        >
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_RULES || ''}')` }}
          ></div>
          <div className="menu-btn-label">遊び方</div>
        </div>

        <div
          className="menu-img-btn"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showDeckEditMenu?.();
          }}
        >
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_DECK || ''}')` }}
          ></div>
          <div className="menu-btn-label">デッキ編成</div>
        </div>

        <div
          className="menu-img-btn"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showSoloMenu?.();
          }}
        >
          <div
            className="menu-img-bg"
            style={{
              backgroundImage: `url('${images.MENU_SOLO || images.MENU_STORY || ''}')`,
            }}
          ></div>
          <div className="menu-btn-label">ソロモード</div>
        </div>

        <div
          className="menu-img-btn"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showEventMenu?.();
          }}
        >
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_EVENT || ''}')` }}
          ></div>
          <div className="menu-btn-label">イベント</div>
        </div>

        <div
          className="menu-img-btn"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showOnlineMenu?.();
          }}
        >
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_ONLINE || ''}')` }}
          ></div>
          <div className="menu-btn-label">オンライン</div>
        </div>

        <div
          className="menu-img-btn"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            showGallery?.();
          }}
        >
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('${images.MENU_GALLERY || ''}')` }}
          ></div>
          <div className="menu-btn-label">ギャラリー</div>
        </div>
      </div>
    </div>
  );
}

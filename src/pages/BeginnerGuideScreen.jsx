import BackButton from '../components/BackButton.jsx';
import { goToModeSelect, showRules, showTutorialSelect } from '../hooks/uiMainCore.js';
import { UI_IMAGES } from '../utils/constants/uiImages.js';

/**
 * 「遊び方」画面
 * モード選択から遷移し、「ルール」「チュートリアル」のサブメニューを表示する
 * レイアウトはソロモード等と統一（menu-btn-grid + menu-img-btn）
 */
export default function BeginnerGuideScreen() {
  const images = UI_IMAGES || {};


  return (
    <div
      id="screen-beginner-guide"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_select.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2 style={{ color: '#facc15', marginBottom: '40px' }}>遊び方</h2>
      <div className="menu-btn-grid">
        {/* 遊び方ボタン */}
        <div className="menu-img-btn" onClick={() => showRules?.()}>
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('assets/ui/ui_Instructionsbutton01.png')` }}
          ></div>
          <div className="menu-btn-label">ルール</div>
        </div>

        {/* チュートリアルボタン */}
        <div className="menu-img-btn" onClick={() => showTutorialSelect?.()}>
          <div
            className="menu-img-bg"
            style={{ backgroundImage: `url('assets/ui/ui_tutorialbutton01.png')` }}
          ></div>
          <div className="menu-btn-label">チュートリアル</div>
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
        <BackButton onClick={() => goToModeSelect?.()} />
      </div>
    </div>
  );
}

import BackButton from '../components/BackButton.jsx';
import { startTutorial } from '../hooks/tutorialEngine.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * チュートリアル選択画面
 * 基本ルール＋各リーダーキャラクターごとのチュートリアル項目を表示する
 * レイアウトは高難易度画面と統一（btn-banner形式のリスト）
 */

// サタン・キャンペーン用を除外した、チュートリアル対象キャラクターIDの順序
const TUTORIAL_CHAR_ORDER = [
  'android',
  'dragon',
  'knight',
  'cthulhu',
  'elf',
  'cleric',
  'devilhunter',
  'witch',
  'oni',
  'priest',
];

export default function TutorialSelectScreen() {
  // チュートリアル項目クリック
  const handleTutorialClick = (tutorialId) => {
    playSound(SOUNDS?.seClick);
    startTutorial(tutorialId);
  };

  return (
    <div
      id="screen-tutorial-select"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_select.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#facc15',
          marginBottom: '15px',
          flexShrink: 0,
        }}
      >
        チュートリアル
      </h2>

      <div
        className="deck-edit-container"
        style={{
          justifyContent: 'flex-start',
          paddingTop: '10px',
          gap: '10px',
          overflowY: 'auto',
        }}
      >
        {/* 基本ルール */}
        <button
          className="btn-banner"
          style={{ flexShrink: 0 }}
          onClick={() => handleTutorialClick('basic_rules')}
        >
          <img
            src="assets/icons/icon_light.png"
            className="banner-icon"
            alt=""
          />
          <span className="banner-text" style={{ color: '#facc15' }}>
            基本ルール
          </span>
        </button>

        {/* 各リーダーキャラクターのチュートリアル */}
        {TUTORIAL_CHAR_ORDER.map((charId) => {
          const char = CHARACTERS[charId];
          if (!char) return null;

          // キャラ名から二つ名を除いた短い名前を取得（スペース区切りの最後の部分）
          const shortName = char.name.split(' ').pop();

          return (
            <button
              key={charId}
              className="btn-banner"
              style={{ flexShrink: 0 }}
              onClick={() => handleTutorialClick(`leader_${charId}`)}
            >
              <img src={char.icon} className="banner-icon" alt="" />
              <span
                className="banner-text"
                style={{ color: char.color || '#fff' }}
              >
                リーダー：{shortName}
              </span>
            </button>
          );
        })}
      </div>

      <BackButton
        to="screen-beginner-guide"
        style={{ marginTop: '30px', flexShrink: 0 }}
      />
    </div>
  );
}

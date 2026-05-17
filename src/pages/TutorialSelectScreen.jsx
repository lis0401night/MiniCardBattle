import BackButton from '../components/BackButton.jsx';
import { startTutorial } from '../hooks/tutorialEngine.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * チュートリアル選択画面
 * 基本ルール＋各リーダーキャラクターごとのチュートリアル項目を表示する
 * レイアウトは試練の宮殿（リーダー選択画面）と統一
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
        display: 'flex',
        flexDirection: 'column',
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
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          paddingTop: '10px',
          paddingBottom: '20px',
          gap: '15px',
          overflowY: 'auto',
          alignItems: 'center',
          flex: 1,
          width: '100%',
        }}
      >
        {/* 基本ルール */}
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <button
            className="btn-banner"
            style={{
              width: '100%',
              margin: 0,
              borderColor: 'var(--border-color, #334155)',
              borderWidth: '2px',
            }}
            onClick={() => handleTutorialClick('basic_rules')}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                height: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '2px solid #334155',
                    marginRight: '15px',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src="assets/icons/icon_light.png"
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '50%',
                    }}
                  />
                </div>
                <span
                  className="banner-text"
                  style={{
                    color: '#facc15',
                    textShadow: '0px 0px 4px rgba(0,0,0,0.8)',
                  }}
                >
                  基本ルール
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* 各リーダーキャラクターのチュートリアル */}
        {TUTORIAL_CHAR_ORDER.map((charId) => {
          const char = CHARACTERS[charId];
          if (!char) return null;

          // キャラ名から二つ名を除いた短い名前を取得（スペース区切りの最後の部分）
          const shortName = char.name.split(' ').pop();

          return (
            <div key={charId} style={{ width: '100%', maxWidth: '400px' }}>
              <button
                className="btn-banner"
                style={{
                  width: '100%',
                  margin: 0,
                  borderColor: 'var(--border-color, #334155)',
                  borderWidth: '2px',
                }}
                onClick={() => handleTutorialClick(`leader_${charId}`)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: '2px solid #334155',
                        marginRight: '15px',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={char.icon}
                        alt={char.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '50%',
                        }}
                      />
                    </div>
                    <span
                      className="banner-text"
                      style={{
                        color: char.color || '#fff',
                        textShadow: '0px 0px 4px rgba(0,0,0,0.8)',
                      }}
                    >
                      {shortName}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <BackButton
        to="screen-beginner-guide"
        style={{ marginTop: '20px', flexShrink: 0 }}
      />
    </div>
  );
}

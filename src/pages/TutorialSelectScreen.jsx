import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import {
  loadTutorialProgress,
  saveTutorialProgress,
  startTutorial,
} from '../game/tutorialEngine.js';
import { loadDeck, saveDeck } from '../services/deck.js';
import { showCardAcquisitionModal } from '../services/uiGallery.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
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

// 各リーダーチュートリアルクリア時の報酬対象シルバーレア伝説カードIDのマッピング
const TUTORIAL_REWARDS = {
  leader_android: 'gladiator', // 違法リングの闘士
  leader_dragon: 'drake', // 熱砂地帯のドレイク
  leader_knight: 'lion', // 王家のライオン
  leader_cthulhu: 'ghostship', // ファントムポートの幽霊船
  leader_elf: 'ranger', // ルーン辿りのレインジャー
  leader_cleric: 'monk', // 夜明けの番人
  leader_devilhunter: 'undeadking', // 亡国のデス・ロード
  leader_witch: 'wizard', // アカデミーの大魔導士
  leader_oni: 'nurikabe', // 見下ろす巨顔
  leader_priest: 'sentinel', // 黄金の歩哨
};

const DEBUG_MODE_CLICK_THRESHOLD = 10;

export default function TutorialSelectScreen() {
  const [clickCount, setClickCount] = useState(0);
  const [tutorialProgress, setTutorialProgress] = useState({
    basic_rules: { isCleared: false, isRewarded: false },
    leader_android: { isCleared: false, isRewarded: false },
    leader_dragon: { isCleared: false, isRewarded: false },
    leader_knight: { isCleared: false, isRewarded: false },
    leader_cthulhu: { isCleared: false, isRewarded: false },
    leader_elf: { isCleared: false, isRewarded: false },
    leader_cleric: { isCleared: false, isRewarded: false },
    leader_devilhunter: { isCleared: false, isRewarded: false },
    leader_witch: { isCleared: false, isRewarded: false },
    leader_oni: { isCleared: false, isRewarded: false },
    leader_priest: { isCleared: false, isRewarded: false },
  });

  useEffect(() => {
    // プレイヤーのインベントリを安全にロード
    if (typeof loadDeck === 'function') {
      loadDeck();
    }

    // チュートリアルの進捗をロードして state に反映
    const savedProgress = loadTutorialProgress() || {};
    setTutorialProgress((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((key) => {
        if (savedProgress[key]) {
          updated[key] = {
            isCleared: !!savedProgress[key].isCleared,
            isRewarded: !!savedProgress[key].isRewarded,
          };
        }
      });
      return updated;
    });
  }, []);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= DEBUG_MODE_CLICK_THRESHOLD) {
      setClickCount(0);

      if (typeof showConfirmModal === 'function') {
        showConfirmModal(
          'デバッグモードを起動してすべてのチュートリアルをクリアにしますか？',
          () => {
            setTutorialProgress((prev) => {
              const updated = { ...prev };
              Object.keys(updated).forEach((key) => {
                updated[key] = {
                  ...updated[key],
                  isCleared: true,
                };
              });

              // LocalStorageへ保存
              saveTutorialProgress(updated);
              return updated;
            });

            if (SOUNDS?.seSkill) playSound(SOUNDS.seSkill);
            if (typeof showAlertModal === 'function') {
              showAlertModal(
                'デバッグモード：すべてのチュートリアルをクリアにしました！'
              );
            }
          }
        );
      }
    }
  };

  const handleClaimReward = (id) => {
    if (SOUNDS?.seClick) playSound(SOUNDS.seClick);

    // 基本ルールは報酬なし
    if (id === 'basic_rules') return;

    const cardId = TUTORIAL_REWARDS[id];
    if (!cardId) return;

    // 1. プレイヤーインベントリにカードを付与
    if (!GameState.playerInventory) {
      GameState.playerInventory = {};
    }
    GameState.playerInventory[cardId] =
      (GameState.playerInventory[cardId] || 0) + 1;

    // 2. インベントリを永続化保存
    if (typeof saveDeck === 'function') {
      try {
        saveDeck();
      } catch (error) {
        console.error('デッキ保存に失敗しました:', error);
        // ロールバック処理によりデータ整合性を維持
        if (
          GameState.playerInventory &&
          GameState.playerInventory[cardId] > 0
        ) {
          GameState.playerInventory[cardId]--;
          if (GameState.playerInventory[cardId] <= 0) {
            delete GameState.playerInventory[cardId];
          }
        }
        if (typeof showAlertModal === 'function') {
          showAlertModal('保存に失敗しました。再試行してください。');
        }
        return;
      }
    }

    // 3. 実績モーダルと同様の獲得演出を表示
    if (typeof showCardAcquisitionModal === 'function') {
      showCardAcquisitionModal(cardId);
    }

    // 4. 進捗を更新して保存
    setTutorialProgress((prev) => {
      const nextProgress = {
        ...prev,
        [id]: {
          ...prev[id],
          isRewarded: true,
        },
      };

      // LocalStorageへ保存
      saveTutorialProgress(nextProgress);
      return nextProgress;
    });
  };

  // チュートリアル項目クリック
  const handleTutorialClick = (tutorialId) => {
    if (SOUNDS?.seClick) playSound(SOUNDS.seClick);
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
          margin: '20px 0',
          cursor: 'pointer',
          userSelect: 'none',
          flexShrink: 0,
        }}
        onClick={handleTitleClick}
      >
        チュートリアル
      </h2>

      <div className="card-list-container" style={{ flex: 1, minHeight: 0 }}>
        <div
          id="tutorial-list-container"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: '100%',
          }}
        >
          {(() => {
            const progress = tutorialProgress.basic_rules;
            const isCleared = progress.isCleared;
            const bgColor = isCleared
              ? 'rgba(16, 185, 129, 0.2)'
              : 'rgba(0, 0, 0, 0.5)';
            const borderColor = isCleared ? '#10b981' : '#475569';

            return (
              <div
                style={{
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '8px',
                  padding: '10px',
                  textAlign: 'left',
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  position: 'relative',
                  cursor: 'default',
                  boxShadow: 'none',
                }}
              >
                <button
                  className="btn-banner"
                  style={{
                    width: '100%',
                    height: '55px',
                    margin: 0,
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTutorialClick('basic_rules');
                  }}
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
                          width: '44px',
                          height: '44px',
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

                {/* プログレスバー */}
                <div
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    borderRadius: '4px',
                    height: '10px',
                    overflow: 'hidden',
                    border: '1px solid #334155',
                  }}
                >
                  <div
                    style={{
                      width: `${progress.isCleared ? 100 : 0}%`,
                      height: '100%',
                      background: progress.isCleared ? '#10b981' : '#3b82f6',
                      transition: 'width 0.3s ease',
                    }}
                  ></div>
                </div>

                {/* 進捗表示（基本ルールは報酬なし） */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '2px',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {progress.isCleared ? '1 / 1' : '0 / 0'}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 各リーダーキャラクターのチュートリアル */}
          {TUTORIAL_CHAR_ORDER.map((charId) => {
            const char = CHARACTERS[charId];
            if (!char) return null;

            const tutorialId = `leader_${charId}`;
            const progress = tutorialProgress[tutorialId] || {
              isCleared: false,
              isRewarded: false,
            };
            const isCleared = progress.isCleared;
            const isClaimable = isCleared && !progress.isRewarded;
            const bgColor = isCleared
              ? 'rgba(16, 185, 129, 0.2)'
              : 'rgba(0, 0, 0, 0.5)';
            const borderColor = isCleared ? '#10b981' : '#475569';

            // キャラ名から二つ名を除いた短い名前を取得（スペース区切りの最後の部分）
            const shortName = char.name.split(' ').pop();
            const displayName = `リーダー：${shortName}`;

            return (
              <div
                key={charId}
                onClick={() => isClaimable && handleClaimReward(tutorialId)}
                style={{
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '8px',
                  padding: '10px',
                  textAlign: 'left',
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  position: 'relative',
                  cursor: isClaimable ? 'pointer' : 'default',
                  boxShadow: isClaimable ? '0 0 15px #facc15' : 'none',
                  borderColor: isClaimable ? '#facc15' : borderColor,
                }}
              >
                <button
                  className="btn-banner"
                  style={{
                    width: '100%',
                    height: '55px',
                    margin: 0,
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTutorialClick(tutorialId);
                  }}
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
                          width: '44px',
                          height: '44px',
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
                        {displayName}
                      </span>
                    </div>
                  </div>
                </button>

                {/* プログレスバー */}
                <div
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    borderRadius: '4px',
                    height: '10px',
                    overflow: 'hidden',
                    border: '1px solid #334155',
                  }}
                >
                  <div
                    style={{
                      width: `${progress.isCleared ? 100 : 0}%`,
                      height: '100%',
                      background: progress.isCleared ? '#10b981' : '#3b82f6',
                      transition: 'width 0.3s ease',
                    }}
                  ></div>
                </div>

                {/* 進捗と報酬受け取り */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '2px',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {progress.isCleared ? '1 / 1' : '0 / 0'}
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: '#facc15' }}>
                      報酬: カード
                    </span>
                    {progress.isRewarded ? (
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                        (取得済)
                      </span>
                    ) : (
                      <button
                        className="btn"
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.7rem',
                          minHeight: '20px',
                          margin: 0,
                          background: progress.isCleared ? '' : '#475569',
                          opacity: progress.isCleared ? '1' : '0.6',
                          cursor: progress.isCleared
                            ? 'pointer'
                            : 'not-allowed',
                        }}
                        disabled={!progress.isCleared}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (progress.isCleared) {
                            handleClaimReward(tutorialId);
                          }
                        }}
                      >
                        受け取る
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
        <BackButton to="screen-beginner-guide" />
      </div>
    </div>
  );
}

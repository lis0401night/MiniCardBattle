import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import { resumeCampaignProgress } from '../game/campaign';
import { clearStoryProgress, resumeStoryProgress } from '../game/story';
import { goBackFromSelect } from '../services/uiMainCore';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState';
import { CHARACTERS } from '../utils/constants/characters';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

const getRarityColor = (rarity) => {
  switch (rarity) {
    case 1:
      return '#b45309'; // Bronze
    case 2:
      return '#94a3b8'; // Silver
    case 3:
      return '#facc15'; // Gold
    case 4:
      return '#c084fc'; // Legend (Purple)
    default:
      return '#475569';
  }
};

export default function StoryResumeScreen() {
  const [pConf, setPConf] = useState(null);
  const [battleCount, setBattleCount] = useState(1);

  const isCampaign = GameState.gameMode === 'campaign';

  useEffect(() => {
    try {
      const saveKey = isCampaign
        ? 'mini_card_battle_campaign_save'
        : 'mini_card_battle_story_save';
      const savedStoryStr = localStorage.getItem(saveKey);
      if (savedStoryStr) {
        const savedData = JSON.parse(savedStoryStr);
        if (isCampaign) {
          setPConf(CHARACTERS['campaign_player']);
          setBattleCount(savedData.currentNode || 1);
        } else {
          const charId = savedData.pendingCharId;
          const char = CHARACTERS[charId];
          if (char) {
            setPConf(char);
          }
          if (savedData.battleCount) {
            setBattleCount(savedData.battleCount);
          }
        }
      }
    } catch (e) {
      console.error('Save parse error:', e);
    }
  }, [isCampaign]);

  const handleResume = () => {
    playSound?.(SOUNDS?.seClick);
    if (isCampaign) {
      const savedStr = localStorage.getItem('mini_card_battle_campaign_save');
      if (savedStr) {
        resumeCampaignProgress(JSON.parse(savedStr));
      }
      return;
    }

    const savedStoryStr = localStorage.getItem('mini_card_battle_story_save');
    if (savedStoryStr) {
      try {
        const savedData = JSON.parse(savedStoryStr);
        resumeStoryProgress(savedData);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleRetire = () => {
    showConfirmModal?.(
      '中断データを消去して、最初からやり直します。よろしいですか？',
      () => {
        playSound?.(SOUNDS?.seClick);
        clearStoryProgress();
        goBackFromSelect(); // Returns to solo menu, or previous context
      }
    );
  };

  const handleCheckDeck = () => {
    playSound?.(SOUNDS?.seClick);
    if (window.showEnemyDeckModal) {
      let deck = null;
      if (isCampaign) {
        const savedStr = localStorage.getItem('mini_card_battle_campaign_save');
        if (savedStr) {
          try {
            const data = JSON.parse(savedStr);
            deck = { cards: data.campaignDeck || [] };
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        const savedStr = localStorage.getItem(
          'mini_card_battle_story_deck_obj'
        );
        if (savedStr) {
          try {
            deck = JSON.parse(savedStr);
          } catch (e) {
            console.error(e);
          }
        }
      }

      if (deck && deck.cards && deck.cards.length > 0) {
        window.showEnemyDeckModal(deck.cards, 'デッキ確認');
      } else {
        showAlertModal?.('デッキ情報のプレビューは再開後に可能です。');
      }
    }
  };

  return (
    <div
      id="screen-story-resume"
      className="screen active"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_story01.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: '#fff',
      }}
    >
      <h2
        style={{
          color: '#facc15',
          margin: '20px 0',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {isCampaign ? 'キャンペーン 再開' : 'ストーリー 再開'}
      </h2>

      <div
        className="dungeon-content"
        style={{
          flex: 1,
          width: '100%',
          overflowY: 'auto',
          boxSizing: 'border-box',
          padding: '10px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ textAlign: 'center', color: '#fff', padding: '20px' }}>
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #334155',
              marginBottom: '30px',
            }}
          >
            <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
              進行状況:{' '}
              <span style={{ color: '#facc15', fontWeight: 'bold' }}>
                {isCampaign
                  ? `チャプター${String(battleCount).replace('_pre', '').replace('_post', '')}`
                  : `第 ${battleCount} 戦`}
              </span>
            </div>

            {pConf && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.9rem',
                    color: '#cbd5e1',
                    marginBottom: '8px',
                    fontWeight: 'bold',
                  }}
                >
                  現在のリーダー
                </div>
                <div
                  className={pConf.rarity === 4 ? 'rarity-4-border' : ''}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '15px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    padding: '10px 20px',
                    borderRadius: '12px',
                    border: `2px solid ${getRarityColor(pConf.rarity)}`,
                    minWidth: '250px',
                  }}
                >
                  <div
                    className={pConf.rarity === 4 ? 'rarity-4-border' : ''}
                    style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: `2px solid ${getRarityColor(pConf.rarity)}`,
                    }}
                  >
                    <img
                      src={pConf.icon || pConf.image}
                      alt={pConf.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%',
                      }}
                    />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div
                      className={pConf.rarity === 4 ? 'rarity-4-text' : ''}
                      style={{
                        fontWeight: 'bold',
                        color: getRarityColor(pConf.rarity),
                        fontSize: '1.1rem',
                      }}
                    >
                      {pConf.name}
                    </div>
                  </div>
                </div>

                {/* デッキ確認ボタン */}
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'center',
                    marginTop: '15px',
                  }}
                >
                  <button
                    className="btn"
                    style={{
                      fontSize: '0.8rem',
                      padding: '10px 12px',
                      width: 'auto',
                      margin: 0,
                      background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
                    }}
                    onClick={handleCheckDeck}
                  >
                    デッキ確認
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
              alignItems: 'center',
            }}
          >
            <button
              className="btn"
              style={{
                width: '220px',
                background: 'linear-gradient(45deg, #10b981, #059669)',
                padding: '12px',
              }}
              onClick={handleResume}
            >
              再開する
            </button>
            {!isCampaign && (
              <button
                className="btn"
                style={{ width: '220px', background: '#334155', color: '#fff' }}
                onClick={handleRetire}
              >
                リタイア
              </button>
            )}
          </div>
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
        <BackButton onClick={() => goBackFromSelect()} />
      </div>
    </div>
  );
}

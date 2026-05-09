import { useMemo } from 'react';
import { GameState } from '../hooks/gameState.js';
import {
  clearTournamentSave,
  loadTournamentProgress,
} from '../hooks/tournament.js';
import { showAlertModal, showConfirmModal } from '../hooks/uiModals.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
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
      return '#c084fc'; // Legend
    default:
      return '#475569';
  }
};

export default function TournamentResumeScreen() {
  const saveData = useMemo(() => {
    const json = localStorage.getItem('mini_card_battle_tournament_save');
    if (json) {
      try {
        return JSON.parse(json);
      } catch (e) {
        console.error(e);
      }
    }
    return null;
  }, []);

  const tState = saveData?.tournament;
  const pConf = saveData?.playerConfig || {
    name: 'Player',
    rarity: 4,
    icon: CHARACTERS.android.icon,
  };
  const currentRound = tState?.round || 1;

  const handleResume = () => {
    playSound(SOUNDS.seClick);
    loadTournamentProgress();
  };

  const handleRestart = () => {
    showConfirmModal(
      '中断データを消去して、最初からやり直します。よろしいですか？\n（勝利数に応じた大会ポイントは獲得できます）',
      () => {
        playSound(SOUNDS.seClick);
        let winCount = Math.max(0, currentRound - 1);
        const pointsMap = [0, 1, 3, 6, 10];
        let points = pointsMap[winCount] || 0;
        clearTournamentSave();

        if (points > 0) {
          let currentPts =
            parseInt(
              localStorage.getItem('mini_card_battle_tournament_points')
            ) || 0;
          let totalPts =
            parseInt(
              localStorage.getItem('mini_card_battle_tournament_total_points')
            ) || 0;
          currentPts += points;
          totalPts += points;
          localStorage.setItem(
            'mini_card_battle_tournament_points',
            currentPts
          );
          localStorage.setItem(
            'mini_card_battle_tournament_total_points',
            totalPts
          );

          showAlertModal?.(
            `リタイアしました。\n${winCount}勝の報酬として、\n大会ポイントを ${points} Pt 獲得！`,
            () => {
              switchScreen('screen-tournament-menu');
            }
          );
        } else {
          switchScreen('screen-tournament-menu');
        }
      }
    );
  };

  const handleBack = () => {
    playSound(SOUNDS.seClick);
    switchScreen('screen-tournament-menu');
  };

  const handleCheckDeck = () => {
    playSound(SOUNDS.seClick);
    if (saveData && saveData.playerConfig) {
      GameState.playerConfig = saveData.playerConfig;
    }
    if (window.showEnemyDeckModal) {
      const savedStr = localStorage.getItem(
        'mini_card_battle_tournament_deck_obj'
      );
      let deck = null;
      if (savedStr) {
        try {
          deck = JSON.parse(savedStr);
        } catch (e) {
          console.error(e);
        }
      }
      if (!deck) {
        deck = GameState.decks?.[GameState.currentDeckIndex] || null;
      }
      if (deck && deck.cards) {
        window.showEnemyDeckModal(deck.cards, 'デッキ確認');
      } else {
        alert('デッキ情報のプレビューは再開後に可能です。');
      }
    }
  };

  if (!saveData) {
    return (
      <div
        id="screen-tournament-resume"
        className="screen active"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: '#fff' }}>セーブデータがありません</p>
        <button className="btn" onClick={handleBack}>
          戻る
        </button>
      </div>
    );
  }

  return (
    <div
      id="screen-tournament-resume"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_tournament01.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '40px',
      }}
    >
      <h2
        style={{
          color: '#60a5fa',
          marginBottom: '30px',
          textShadow: '0 0 15px rgba(59, 130, 246, 0.6)',
        }}
      >
        夢幻の闘技祭 再開
      </h2>

      <div
        style={{
          background: 'rgba(30, 41, 59, 0.8)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #334155',
          marginBottom: '30px',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
          進行状況:{' '}
          <span style={{ color: '#facc15', fontWeight: 'bold' }}>
            {tState?.playerLost ? '敗北済み' : `第 ${currentRound} 回戦`}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '20px',
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
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
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
        <button
          className="btn"
          style={{ width: '220px', background: '#334155', color: '#fff' }}
          onClick={handleRestart}
        >
          リタイア
        </button>
      </div>

      <button
        className="btn"
        style={{ marginTop: '40px', background: '#475569' }}
        onClick={handleBack}
      >
        戻る
      </button>
    </div>
  );
}

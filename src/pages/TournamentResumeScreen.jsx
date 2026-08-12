import { useMemo } from 'react';
import BackButton from '../components/BackButton.jsx';
import {
  clearTournamentSave,
  loadTournamentProgress,
} from '../game/tournament.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import {
  CHARACTERS,
  getIconFramePath,
  getSkinImage,
} from '../utils/constants/characters.js';
import {
  DEFAULT_PLAYER_NAME,
  appendVersionQuery,
} from '../utils/constants/config.js';
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
  const pConf = useMemo(() => {
    const rawConf = saveData?.playerConfig || {
      name: DEFAULT_PLAYER_NAME,
      rarity: 4,
      icon: CHARACTERS.android.icon,
    };
    // rawConf.id が 'player' (トーナメント用識別子) の場合は charId や leaderId を優先参照する
    const charId =
      (rawConf.id !== 'player' && CHARACTERS[rawConf.id] ? rawConf.id : null) ||
      rawConf.charId ||
      rawConf.leaderId ||
      'android';
    const charObj = CHARACTERS[charId] || CHARACTERS.android;

    // トーナメントモードでは常に学園スキン（school）を使用する
    let iconSrc =
      getSkinImage(charObj, 'school', 'icon') ||
      getSkinImage(charObj, 'school', 'image') ||
      rawConf.icon ||
      rawConf.image ||
      charObj.icon ||
      charObj.image;

    if (iconSrc) {
      iconSrc = iconSrc.replace(/\.(png|jpg|jpeg|gif)$/i, '.webp');
    }

    // セーブデータの属性消失を防ぎつつ、正しいマスタ情報（leaderSkill等）を上書き展開
    return {
      ...rawConf,
      ...charObj,
      name: rawConf.name || charObj.name,
      charId,
      icon: iconSrc,
      image: iconSrc,
      leaderSkill: charObj.leaderSkill || rawConf.leaderSkill || null,
    };
  }, [saveData]);
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
        let points = pointsMap[Math.min(winCount, pointsMap.length - 1)] || 0;
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
        showAlertModal('デッキ情報のプレビューは再開後に可能です。');
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
        <button
          className="btn"
          onClick={() => switchScreen('screen-tournament-menu')}
        >
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
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_tournament01.webp')}')`,
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
            {/* 他モードと統一されたアイコンフレーム付きリーダー表示 */}
            <div className="banner-icon-wrapper" style={{ margin: 0 }}>
              <img
                src={pConf.icon || pConf.image}
                className="banner-icon"
                alt={pConf.name}
              />
              <img
                src={getIconFramePath(pConf.charId || pConf.id || 'android')}
                className="banner-icon-frame"
                alt="frame"
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

          {/* リーダースキル詳細情報表示枠 */}
          {pConf.leaderSkill && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.9)',
                borderRadius: '10px',
                border: '1px solid #3b82f6',
                textAlign: 'left',
                width: '100%',
                maxWidth: '300px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  color: '#60a5fa',
                  marginBottom: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>👑 {pConf.leaderSkill.name}</span>
                {pConf.leaderSkill.cost > 0 && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#facc15',
                      marginLeft: '8px',
                    }}
                  >
                    (SP: {pConf.leaderSkill.cost})
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#cbd5e1',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {pConf.leaderSkill.desc}
              </div>
            </div>
          )}
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

      <BackButton to="screen-tournament-menu" style={{ marginTop: '40px' }} />
    </div>
  );
}

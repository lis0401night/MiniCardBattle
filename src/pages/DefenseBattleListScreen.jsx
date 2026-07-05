import { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { startAttackBattle } from '../services/uiMainCore.js';
import {
  CHARACTERS,
  getPlayerIconPath,
  getIconFramePath,
  getPlayerColor,
} from '../utils/constants/characters.js';
import { getOrCreateUUID, selectDefenseTargets } from '../utils/gameUtils.js';
import { appendVersionQuery } from '../utils/constants/config.js';

export default function DefenseBattleListScreen() {
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error', 'empty'

  useEffect(() => {
    const fetchPlayers = async () => {
      setStatus('loading');
      try {
        const response = await fetch('api/get_player_decks.php');
        const result = await response.json();

        if (result.success) {
          const myUuid = getOrCreateUUID ? getOrCreateUUID() : null;
          let activePlayers = result.players;

          // 自分のポイントを取得
          const myTotalPoints =
            parseInt(
              localStorage.getItem('mini_card_battle_defense_total_points'),
              10
            ) || 0;

          if (activePlayers.length === 0) {
            setStatus('empty');
            return;
          }

          // ランキングソート
          activePlayers.sort(
            (a, b) =>
              (b.total_points || b.points || 0) -
              (a.total_points || a.points || 0)
          );

          // 各プレイヤーに対する計算を追加
          activePlayers = activePlayers.map((p, index) => {
            const pTotalPoints = p.total_points || p.points || 0;
            let winPoints = 1;
            if (pTotalPoints > myTotalPoints) {
              if (pTotalPoints >= myTotalPoints * 2 && myTotalPoints > 0) {
                winPoints = 5;
              } else {
                winPoints = 3;
              }
            }
            return {
              ...p,
              rankIndex: index,
              calculatedWinPoints: winPoints,
              displayTotalPoints: pTotalPoints,
              isMe: p.uuid === myUuid,
            };
          });

          // 自分以外のプレイヤーのみを抽出
          const otherPlayers = activePlayers.filter((p) => !p.isMe);
          const selectedPlayers = selectDefenseTargets(
            otherPlayers,
            myTotalPoints
          );

          if (selectedPlayers.length === 0) {
            setStatus('empty');
          } else {
            setPlayers(selectedPlayers);
            setStatus('success');
          }
        } else {
          throw new Error(result.error);
        }
      } catch (err) {
        console.error('Failed to fetch player list:', err);
        setStatus('error');
      }
    };

    fetchPlayers();
  }, []);

  const handlePlayerSelect = (p) => {
    if (startAttackBattle) {
      // 既存のグローバルロジックを呼び出す
      startAttackBattle({
        ...p,
        calculatedWinPoints: p.calculatedWinPoints,
      });
    }
  };

  return (
    <div
      id="screen-defense-battle-list"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_defense.png')}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#10b981',
          margin: '20px 0 5px 0',
          fontSize: '1.2rem',
          textAlign: 'center',
        }}
      >
        防衛戦（攻撃側）
      </h2>
      <div
        style={{
          fontSize: '0.9rem',
          marginBottom: '15px',
          color: '#cbd5e1',
          textAlign: 'center',
        }}
      >
        挑む相手を選択してください
      </div>

      <div
        className="deck-edit-container"
        id="defense-player-list"
        style={{
          justifyContent: 'flex-start',
          overflowY: 'auto',
          width: '100%',
          maxWidth: '480px',
          height: '492px',
          flex: 'none',
        }}
      >
        {status === 'loading' && (
          <div
            style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}
          >
            読み込み中...
          </div>
        )}
        {status === 'error' && (
          <div
            style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}
          >
            読み込みに失敗しました
          </div>
        )}
        {status === 'empty' && (
          <div
            style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}
          >
            対戦相手がいません
          </div>
        )}

        {status === 'success' &&
          players.map((p) => {
            const char =
              (CHARACTERS && CHARACTERS[p.character]) || CHARACTERS?.android;
            if (!char) return null;

            return (
              <button
                key={p.uuid}
                className="btn-banner"
                style={{
                  flexShrink: 0,
                  ...(p.isMe ? { cursor: 'default', opacity: 0.9 } : {}),
                }}
                onClick={() => {
                  if (!p.isMe) {
                    handlePlayerSelect(p);
                  }
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="banner-icon-wrapper">
                      <img
                        src={getPlayerIconPath(p)}
                        className="banner-icon"
                        alt=""
                      />
                      <img
                        src={getIconFramePath(char.id)}
                        className="banner-icon-frame"
                        alt="frame"
                      />
                    </div>
                    <span
                      className="banner-text"
                      style={{
                        color: getPlayerColor(p),
                        marginRight: '10px',
                      }}
                    >
                      {p.name}
                    </span>
                    <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                      (Pt: {p.displayTotalPoints})
                    </span>
                  </div>
                  {p.isMe ? (
                    <div
                      style={{
                        color: 'var(--color-blue)',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        textShadow: '0 0 10px rgba(56, 189, 248, 0.8)',
                      }}
                    >
                      YOU
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#10b981',
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                      }}
                    >
                      Win +{p.calculatedWinPoints}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
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
        <BackButton to="screen-defense-menu" style={{ margin: 0 }} />
      </div>
    </div>
  );
}

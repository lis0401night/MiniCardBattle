import { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { startAttackBattle } from '../services/uiMainCore.js';
import {
  CHARACTERS,
  getPlayerIconPath,
  getIconFramePath,
  getPlayerColor,
} from '../utils/constants/characters.js';
import {
  getOrCreateUUID,
  selectDefenseTargets,
  resolveWinTier,
} from '../utils/gameUtils.js';
import {
  appendVersionQuery,
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
} from '../utils/constants/config.js';
import { fetchPlayerDecks } from '../utils/apiUtils.js';

export default function DefenseBattleListScreen() {
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error', 'empty'

  useEffect(() => {
    const fetchPlayers = async () => {
      setStatus('loading');
      try {
        const result = await fetchPlayerDecks();

        if (result.success) {
          const myUuid = getOrCreateUUID ? getOrCreateUUID() : null;
          let activePlayers = result.players;

          // 自分のポイントを取得（total_pointsが無い場合はpointsにフォールバックして整合）
          const myCurrentPoints =
            parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0;
          const myTotalPointsVal =
            parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) ||
            myCurrentPoints;

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
            const winPoints = resolveWinTier(pTotalPoints, myTotalPointsVal);
            return {
              ...p,
              rankIndex: index,
              calculatedWinPoints: winPoints,
              displayTotalPoints: pTotalPoints,
              isMe: p.uuid === myUuid,
            };
          });

          // 自分以外、かつ「防衛デッキが正しく登録されている」プレイヤーのみを抽出
          const otherPlayers = activePlayers.filter(
            (p) => !p.isMe && p.has_defense_deck === true
          );
          const selectedPlayers = selectDefenseTargets(
            otherPlayers,
            myTotalPointsVal
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
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_defense.webp')}')`,
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
          minHeight: '492px',
          maxHeight: '492px',
          height: 'auto',
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
                }}
                onClick={() => {
                  handlePlayerSelect(p);
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
                  <div
                    style={{
                      color: '#10b981',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                    }}
                  >
                    Win +{p.calculatedWinPoints}
                  </div>
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

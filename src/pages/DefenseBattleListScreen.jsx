import { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { startAttackBattle } from '../services/uiMainCore.js';
import {
  CHARACTERS,
  getPlayerIconPath,
  getIconFramePath,
  getPlayerColor,
} from '../utils/constants/characters.js';
import { getOrCreateUUID } from '../utils/gameUtils.js';

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

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

          let selectedPlayers = [];
          const cachedUuidsRaw = localStorage.getItem(
            'mini_card_battle_defense_targets'
          );

          if (cachedUuidsRaw) {
            try {
              const cachedUuids = JSON.parse(cachedUuidsRaw);
              if (Array.isArray(cachedUuids) && cachedUuids.length > 0) {
                selectedPlayers = cachedUuids
                  .map((uuid) => otherPlayers.find((p) => p.uuid === uuid))
                  .filter(Boolean);
              }
            } catch (e) {
              console.error('Failed to parse cached defense targets:', e);
            }
          }

          // 部分的欠落時の補填処理
          if (
            selectedPlayers.length > 0 &&
            selectedPlayers.length < 5 &&
            selectedPlayers.length < otherPlayers.length
          ) {
            const chosenUuids = new Set(selectedPlayers.map((p) => p.uuid));
            const remaining = otherPlayers.filter(
              (p) => !chosenUuids.has(p.uuid)
            );
            const shufRemaining = shuffleArray(remaining);
            const needed = 5 - selectedPlayers.length;
            for (let i = 0; i < Math.min(needed, shufRemaining.length); i++) {
              selectedPlayers.push(shufRemaining[i]);
            }
            // キャッシュを更新
            const uuids = selectedPlayers.map((p) => p.uuid);
            localStorage.setItem(
              'mini_card_battle_defense_targets',
              JSON.stringify(uuids)
            );
          }

          // キャッシュがない場合は新規に選出
          if (selectedPlayers.length === 0) {
            // グループ分け
            // ① 自分より2倍以上（5ポイント獲得可能）
            const group5 = otherPlayers.filter(
              (p) =>
                p.displayTotalPoints >= myTotalPoints * 2 && myTotalPoints > 0
            );
            // ② 自分より上（3ポイント獲得可能）
            const group3 = otherPlayers.filter(
              (p) =>
                p.displayTotalPoints > myTotalPoints &&
                !(
                  p.displayTotalPoints >= myTotalPoints * 2 && myTotalPoints > 0
                )
            );
            // ③ 自分より下・同等（1ポイント獲得可能）
            const group1 = otherPlayers.filter(
              (p) => p.displayTotalPoints <= myTotalPoints
            );

            const shuf5 = shuffleArray(group5);
            const shuf3 = shuffleArray(group3);
            const shuf1 = shuffleArray(group1);

            const picked = [];
            const chosenUuids = new Set();

            // 1. 自分より2倍以上 × 1名
            if (shuf5.length > 0) {
              const p = shuf5[0];
              picked.push(p);
              chosenUuids.add(p.uuid);
            }

            // 2. 自分より上 × 2名
            for (let i = 0; i < Math.min(2, shuf3.length); i++) {
              const p = shuf3[i];
              picked.push(p);
              chosenUuids.add(p.uuid);
            }

            // 3. 自分より下・同等 × 2名
            for (let i = 0; i < Math.min(2, shuf1.length); i++) {
              const p = shuf1[i];
              picked.push(p);
              chosenUuids.add(p.uuid);
            }

            // 5名に満たない場合、残りのプールから補填する
            if (picked.length < 5 && otherPlayers.length > picked.length) {
              const remaining = otherPlayers.filter(
                (p) => !chosenUuids.has(p.uuid)
              );
              const shufRemaining = shuffleArray(remaining);
              const needed = 5 - picked.length;
              for (let i = 0; i < Math.min(needed, shufRemaining.length); i++) {
                picked.push(shufRemaining[i]);
              }
            }

            selectedPlayers = picked;

            // キャッシュに保存
            const uuids = selectedPlayers.map((p) => p.uuid);
            localStorage.setItem(
              'mini_card_battle_defense_targets',
              JSON.stringify(uuids)
            );
          }

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
    <div id="screen-defense-battle-list" className="screen active">
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
          paddingTop: '10px',
          gap: '10px',
          overflowY: 'auto',
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
                        src={getPlayerIconPath(p, char)}
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
                        color: getPlayerColor(p, char),
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

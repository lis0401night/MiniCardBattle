import React, { useState, useEffect } from 'react';

import { CHARACTERS } from '../utils/constants/characters.js';
import { playSound, switchScreen, getOrCreateUUID } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { startAttackBattle } from '../hooks/uiMainCore.js';

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
          let activePlayers = result.players.filter(p => p.uuid !== myUuid);

          if (activePlayers.length === 0) {
            setStatus('empty');
            return;
          }

          // 自分のポイントを取得
          const myTotalPoints = parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) || 0;

          // ランキングソート
          activePlayers.sort((a, b) => (b.total_points || b.points || 0) - (a.total_points || a.points || 0));

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
              displayTotalPoints: pTotalPoints
            };
          });

          setPlayers(activePlayers);
          setStatus('success');
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
         calculatedWinPoints: p.calculatedWinPoints
      });
    }
  };

  return (
    <div id="screen-defense-battle-list" className="screen active">
        <h2 style={{ color: '#10b981', marginBottom: '5px', fontSize: '1.2rem' }}>防衛戦（攻撃側）</h2>
        <div style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}>挑む相手を選択してください</div>
        
        <div className="deck-edit-container" style={{ justifyContent: 'flex-start', paddingTop: '10px' }}>
            <div id="defense-player-list" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '400px', padding: '5px' }}>
                {status === 'loading' && <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>読み込み中...</div>}
                {status === 'error' && <div style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}>読み込みに失敗しました</div>}
                {status === 'empty' && <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>対戦相手がいません</div>}
                
                {status === 'success' && players.map((p) => {
                  const char = (CHARACTERS && CHARACTERS[p.character]) || (CHARACTERS?.android);
                  if (!char) return null;

                  let borderColor = '#cd7f32'; 
                  let extraClass = '';
                  if (p.rankIndex === 0) {
                      extraClass = 'legendary';
                      borderColor = 'transparent'; 
                  } else if (p.rankIndex === 1) {
                      borderColor = '#facc15'; 
                  } else if (p.rankIndex === 2) {
                      borderColor = '#e2e8f0'; 
                  }

                  return (
                    <button
                      key={p.uuid}
                      className={`btn-banner ${extraClass}`}
                      style={{ borderColor }}
                      onClick={() => handlePlayerSelect(p)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                              <img src={char.icon} className="banner-icon" alt="" />
                              <span className="banner-text" style={{ color: char.color, marginRight: '10px' }}>{p.name}</span>
                              <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>(Pt: {p.displayTotalPoints})</span>
                          </div>
                          <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.9rem' }}>Win +{p.calculatedWinPoints}</div>
                      </div>
                    </button>
                  );
                })}
            </div>
        </div>

      <button
        className="btn"
        style={{ marginTop: '30px', background: '#475569' }}
        onClick={() => {
          playSound?.(SOUNDS?.seClick);
          switchScreen?.('screen-defense-menu');
        }}
      >
        戻る
      </button>
    </div>
  );
}

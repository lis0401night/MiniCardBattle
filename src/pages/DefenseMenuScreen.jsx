import React, { useState, useEffect } from 'react';

import { playSound, stopAllBGM, getOrCreateUUID } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { showEventMenu, showDefenseMenu, showDefenseBattleList, showDefenseRules, startDefenseRegistration, showExchangeScreen } from '../hooks/uiMainCore.js';
import { showAlertModal } from '../hooks/uiModals.js';

export default function DefenseMenuScreen() {
  const [hasRegistered, setHasRegistered] = useState(false);

  useEffect(() => {
    // 既存の showDefenseMenu() にあったBGM再生ロジック
    if (SOUNDS?.bgmDefense?.paused) {
      stopAllBGM?.();
      playSound?.(SOUNDS.bgmDefense);
    }
    
    // 登録状態の確認
    const isReg = localStorage.getItem('mini_card_battle_deck_defense') !== null;
    setHasRegistered(isReg);

    if (isReg) {
      // APIからデータを取得してポイントなどを更新するロジック（そのまま移植）
      const fetchPoints = async () => {
        try {
          const response = await fetch(`api/get_player_decks.php?t=${Date.now()}`);
          const result = await response.json();
          if (result.success && getOrCreateUUID) {
            const myUuid = getOrCreateUUID();
            const myData = result.players.find(p => p.uuid === myUuid);
            if (myData) {
              const wins = myData.defense_wins || 0;
              const pts = myData.points || 0;
              const totalPts = myData.total_points || pts;

              const localPts = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
              const localTotalPts = parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) || 0;

              // サーバーの値が0でローカルに値がある場合は、サーバーの初期化ミスと判断して上書きを避ける
              const finalPts = (pts === 0 && localPts > 0) ? localPts : pts;
              const finalTotalPts = (totalPts === 0 && localTotalPts > 0) ? localTotalPts : totalPts;

              const lastWins = parseInt(localStorage.getItem('mini_card_battle_defense_wins')) || 0;
              const newWinsCount = wins - lastWins;

              if (newWinsCount > 0 && showAlertModal) {
                  showAlertModal(
                      `防衛に ${newWinsCount} 回新しく成功しました！\\n現在の防衛戦ポイント: ${finalPts} Pt`,
                      () => { }
                  );
              }
              localStorage.setItem('mini_card_battle_defense_points', finalPts);
              localStorage.setItem('mini_card_battle_defense_total_points', finalTotalPts);
              localStorage.setItem('mini_card_battle_defense_wins', wins);
            }
          }
        } catch (e) {
          console.error(e);
        }
      };
      
      fetchPoints();
    }
  }, []);

  return (
    <div id="screen-defense-menu" className="screen active">
      <h2 style={{ color: '#10b981', marginBottom: '30px' }}>防衛戦</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '250px' }}>
        <button className="btn btn-yellow" onClick={() => showDefenseRules?.()}>ルール</button>
        <button 
          className="btn" 
          style={{ background: 'linear-gradient(45deg, #10b981, #059669)' }} 
          onClick={() => startDefenseRegistration?.()}
        >
          防衛デッキ登録
        </button>
        
        {hasRegistered ? (
            <button 
              id="btn-start-attack" 
              className="btn" 
              style={{ background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)' }} 
              onClick={() => showDefenseBattleList?.()}
            >
              攻撃開始
            </button>
        ) : (
            <div 
              id="btn-start-attack-disabled" 
              className="btn" 
              style={{ background: '#475569', opacity: 0.5, cursor: 'not-allowed' }}
            >
              攻撃開始（未登録）
            </div>
        )}

        <button 
          className="btn" 
          style={{ background: 'linear-gradient(45deg, #f97316, #ea580c)', marginTop: '10px' }} 
          onClick={() => showExchangeScreen?.()}
        >
          交換所
        </button>
      </div>
      <button 
        className="btn" 
        style={{ marginTop: '40px', background: '#475569' }} 
        onClick={() => showEventMenu?.()}
      >
        戻る
      </button>
    </div>
  );
}

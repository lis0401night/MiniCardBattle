import { useEffect, useState } from 'react';

import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import {
  showDefenseBattleList,
  showDefenseRules,
  showEventMenu,
  showExchangeScreen,
  startDefenseRegistration,
} from '../services/uiMainCore.js';
import { showPointAcquisitionModal } from '../services/uiModals.js';
import { getOrCreateUUID } from '../utils/gameUtils.js';

export default function DefenseMenuScreen() {
  // 初期値でLocalStorageの登録状態を判定（useEffect内での同期的setState回避）
  const [hasRegistered] = useState(
    () => localStorage.getItem('mini_card_battle_deck_defense') !== null
  );

  useEffect(() => {
    const isReg = hasRegistered;

    if (isReg) {
      // APIからデータを取得してポイントなどを更新するロジック（そのまま移植）
      const fetchPoints = async () => {
        try {
          const response = await fetch(
            `api/get_player_decks.php?t=${Date.now()}`
          );
          const result = await response.json();
          if (result.success && getOrCreateUUID) {
            const myUuid = getOrCreateUUID();
            const myData = result.players.find((p) => p.uuid === myUuid);
            if (myData) {
              const wins = myData.defense_wins || 0;
              const pts = myData.points || 0;
              const totalPts = myData.total_points || pts;

              const localPts = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
              const localTotalPts = parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) || 0;
              const lastWins = parseInt(localStorage.getItem('mini_card_battle_defense_wins')) || 0;

              // サーバーの値が0でローカルに値がある場合は、サーバーの初期化ミスと判断して上書きを避ける
              const finalPts = pts === 0 && localPts > 0 ? localPts : pts;
              const finalTotalPts =
                totalPts === 0 && localTotalPts > 0 ? localTotalPts : totalPts;
              const newWinsCount = wins - lastWins;
              const newPoints = finalPts - localPts; // 今回増えたポイント

              if (newWinsCount > 0 && showPointAcquisitionModal) {
                showPointAcquisitionModal({
                  title: '防衛成功！',
                  message: `防衛に ${newWinsCount}回 新しく成功しました！\n防衛ポイントを ${newPoints > 0 ? newPoints : 0} Pt 獲得しました！`,
                  points: newPoints > 0 ? newPoints : 0,
                  totalPoints: finalPts,
                  color: '#10b981', // エメラルドグリーン系
                  darkColor: '#059669',
                  onClose: () => {},
                });
              }
              localStorage.setItem('mini_card_battle_defense_points', finalPts);
              localStorage.setItem(
                'mini_card_battle_defense_total_points',
                finalTotalPts
              );
              localStorage.setItem('mini_card_battle_defense_wins', wins);

              // サーバーが未初期化(0)でローカルにデータがある場合は、サーバーにアップロードしてマスタを正す
              if (pts === 0 && localPts > 0) {
                fetch('api/update_points.php', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    uuid: myUuid,
                    points: finalPts,
                    total_points: finalTotalPts,
                  }),
                }).catch((error) => {
                  console.error('防衛ポイントのサーバー更新に失敗しました:', error);
                });
              }
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
    <ScreenLayout
      id="screen-defense-menu"
      title="防衛戦"
      titleColor="#10b981"
      onBackClick={() => showEventMenu?.()}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '250px',
        }}
      >
        <MenuButton
          label="ルール"
          variant="yellow"
          onClick={() => showDefenseRules?.()}
        />
        <MenuButton
          label="防衛デッキ登録"
          variant="emerald"
          onClick={() => startDefenseRegistration?.()}
        />
        <MenuButton
          label={hasRegistered ? '攻撃開始' : '攻撃開始（未登録）'}
          variant="blue"
          onClick={() => showDefenseBattleList?.()}
          disabled={!hasRegistered}
        />
        <MenuButton
          label="交換所"
          variant="orange"
          onClick={() => showExchangeScreen?.()}
        />
      </div>
    </ScreenLayout>
  );
}

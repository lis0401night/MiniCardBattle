import { useEffect, useState } from 'react';

import MenuButton from '../components/common/MenuButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import {
  showDefenseBattleList,
  showDefenseRanking,
  showDefenseRules,
  showEventMenu,
  showExchangeScreen,
  startDefenseRegistration,
} from '../services/uiMainCore.js';
import { showPointAcquisitionModal } from '../services/uiModals.js';
import { fetchPlayerDecks, syncModePoints } from '../utils/apiUtils.js';
import {
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
  DEFENSE_WINS_KEY,
} from '../utils/constants/config.js';
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
          const result = await fetchPlayerDecks();
          if (result.success && getOrCreateUUID) {
            const myUuid = getOrCreateUUID();
            const myData = result.players.find((p) => p.uuid === myUuid);
            if (myData) {
              const wins = myData.defense_wins || 0;
              const pts = myData.points || 0;
              const totalPts = myData.total_points || pts;

              const localPts =
                parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0;
              const localTotalPts =
                parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) ||
                0;
              const lastWins =
                parseInt(localStorage.getItem(DEFENSE_WINS_KEY), 10) || 0;

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

              localStorage.setItem(DEFENSE_POINTS_KEY, finalPts);
              localStorage.setItem(DEFENSE_TOTAL_POINTS_KEY, finalTotalPts);
              localStorage.setItem(DEFENSE_WINS_KEY, wins);

              // 共通同期ユーティリティを使用 (防衛結果の同期)
              await syncModePoints('defense', {
                ...myData,
                points: finalPts,
                total_points: finalTotalPts,
                defense_wins: wins,
              });
            }
          }
        } catch (e) {
          console.error(e);
        }
      };

      fetchPoints();
    }
  }, [hasRegistered]);

  return (
    <ScreenLayout
      id="screen-defense-menu"
      title="防衛戦"
      titleColor="#10b981"
      backgroundImage="background_defense.webp"
      onBackClick={() => showEventMenu?.()}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '250px',
          marginBottom: '20px',
        }}
      >
        <MenuButton
          label="ルール"
          variant="yellow"
          onClick={() => showDefenseRules?.()}
        />
        <MenuButton
          label="ランキング"
          variant="blue"
          onClick={() => showDefenseRanking?.()}
        />
        <MenuButton
          label="防衛デッキ登録"
          variant="emerald"
          onClick={() => startDefenseRegistration?.()}
        />
        <MenuButton
          label={hasRegistered ? '攻撃開始' : '攻撃開始（未登録）'}
          variant="red"
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

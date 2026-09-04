import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import ExchangeItemCard from '../components/common/ExchangeItemCard.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { useExchangeScreen } from '../hooks/useExchangeScreen.js';
import { useGridVirtualizer } from '../hooks/useGridVirtualizer.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import {
  TOURNAMENT_EXCHANGE_LINEUP,
  TOURNAMENT_POINTS_KEY,
  TOURNAMENT_TOTAL_POINTS_KEY,
} from '../utils/constants/config.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * 夢幻の闘技祭（トーナメントモード）専用のアイテム交換所画面コンポーネント。
 * @param {Object} props
 * @param {Function} props.switchScreen - 画面遷移コールバック
 * @returns {JSX.Element} トーナメント交換所画面
 */
export default function TournamentExchangeScreen({ switchScreen }) {
  const {
    points: tournamentPoints,
    setPoints: setTournamentPoints,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    inventory,
    handleExchange,
  } = useExchangeScreen({
    pointsKey: 'tournament',
    pointsLocalKey: TOURNAMENT_POINTS_KEY,
    pointsTotalLocalKey: TOURNAMENT_TOTAL_POINTS_KEY,
    apiEndpoint: 'update_tournament_points.php',
    lineup: TOURNAMENT_EXCHANGE_LINEUP,
  });

  const handleBack = () => {
    playSound(SOUNDS?.seClick);
    if (typeof switchScreen === 'function') {
      switchScreen('screen-tournament-menu');
    }
  };

  // タイトルを10回クリックで大会ポイントを100Pt獲得するイースターエッグ
  const handleTitleClick = useEasterEgg(() => {
    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動して大会ポイントを100Pt獲得しますか？',
        () => {
          playSound(SOUNDS?.seSkill);
          const currentPts =
            parseInt(localStorage.getItem(TOURNAMENT_POINTS_KEY), 10) || 0;
          const totalPts =
            parseInt(localStorage.getItem(TOURNAMENT_TOTAL_POINTS_KEY), 10) ||
            0;
          const newPts = currentPts + 100;
          const newTotalPts = totalPts + 100;

          localStorage.setItem(TOURNAMENT_POINTS_KEY, newPts);
          localStorage.setItem(TOURNAMENT_TOTAL_POINTS_KEY, newTotalPts);
          setTournamentPoints({ current: newPts, total: newTotalPts });

          // 共通API同期ユーティリティを介してサーバーと同期
          savePointsToServer(
            'update_tournament_points.php',
            newPts,
            newTotalPts
          );

          if (showAlertModal) {
            showAlertModal('【デバッグ】大会ポイントを100Pt獲得しました！');
          }
        }
      );
    }
  });

  // 仮想化グリッドフックの利用
  const { listContainerRef, rowVirtualizer, itemRows, gridCols, gridGap } =
    useGridVirtualizer({
      items: TOURNAMENT_EXCHANGE_LINEUP || [],
    });

  return (
    <CompactScreenLayout
      id="screen-tournament-exchange"
      backgroundImage="background_tournament01.webp"
      title="交換所"
      titleColor="#60a5fa"
      titleGlow={true}
      onTitleClick={handleTitleClick}
      onBackClick={handleBack}
      backTo="screen-tournament-menu"
    >
      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {tournamentPoints.current} / 総ポイント:{' '}
        {tournamentPoints.total}
      </div>

      <div
        ref={listContainerRef}
        className="card-list-container"
        style={{
          flex: 1,
          minHeight: 0,
          maxHeight: '500px',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = itemRows[virtualRow.index] || [];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="card-list-grid-3col"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  gap: `${gridGap}px`,
                }}
              >
                {row.map((item) => (
                  <ExchangeItemCard
                    key={`${item.type}_${item.id}`}
                    item={item}
                    currentPoints={tournamentPoints.current}
                    inventory={inventory}
                    unlockedSkins={unlockedSkins}
                    unlockedPlaymats={unlockedPlaymats}
                    unlockedIcons={unlockedIcons}
                    onExchange={handleExchange}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </CompactScreenLayout>
  );
}

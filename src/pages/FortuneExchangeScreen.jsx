import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import ExchangeItemCard from '../components/common/ExchangeItemCard.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { useExchangeScreen } from '../hooks/useExchangeScreen.js';
import { useGridVirtualizer } from '../hooks/useGridVirtualizer.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import {
  FORTUNE_EXCHANGE_LINEUP,
  FORTUNE_POINTS_KEY,
  FORTUNE_TOTAL_POINTS_KEY,
} from '../utils/constants/config.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * 運命の邂逅（Fortuneモード）専用のアイテム交換所画面コンポーネント。
 * @returns {JSX.Element} 運命交換所画面
 */
export default function FortuneExchangeScreen() {
  const {
    points: fortunePoints,
    setPoints: setFortunePoints,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    inventory,
    handleExchange,
  } = useExchangeScreen({
    pointsKey: 'fortune',
    pointsLocalKey: FORTUNE_POINTS_KEY,
    pointsTotalLocalKey: FORTUNE_TOTAL_POINTS_KEY,
    apiEndpoint: 'update_fortune_points.php',
  });

  // タイトルを10回クリックで運命の邂逅ポイントを100Pt獲得するイースターエッグ
  const handleTitleClick = useEasterEgg(() => {
    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動して運命の邂逅ポイントを100Pt獲得しますか？',
        () => {
          playSound(SOUNDS?.seSkill);
          const currentPts =
            parseInt(localStorage.getItem(FORTUNE_POINTS_KEY), 10) || 0;
          const totalPts =
            parseInt(localStorage.getItem(FORTUNE_TOTAL_POINTS_KEY), 10) || 0;
          const newPts = currentPts + 100;
          const newTotalPts = totalPts + 100;

          localStorage.setItem(FORTUNE_POINTS_KEY, newPts);
          localStorage.setItem(FORTUNE_TOTAL_POINTS_KEY, newTotalPts);
          setFortunePoints({ current: newPts, total: newTotalPts });

          // 共通APIユーティリティを介してサーバーと同期
          savePointsToServer('update_fortune_points.php', newPts, newTotalPts);

          if (showAlertModal) {
            showAlertModal(
              '【デバッグ】運命の邂逅ポイントを100Pt獲得しました！'
            );
          }
        }
      );
    }
  });

  // 仮想化グリッドフックの利用
  const { listContainerRef, rowVirtualizer, itemRows, gridCols, gridGap } =
    useGridVirtualizer({
      items: FORTUNE_EXCHANGE_LINEUP || [],
    });

  return (
    <CompactScreenLayout
      id="screen-fortune-exchange"
      backgroundImage="background_fortune01.webp"
      title="交換所"
      titleColor="#f97316"
      titleGlow={true}
      onTitleClick={handleTitleClick}
      backTo="screen-fortune-menu"
    >
      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {fortunePoints.current} / 総ポイント:{' '}
        {fortunePoints.total}
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
                    currentPoints={fortunePoints.current}
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

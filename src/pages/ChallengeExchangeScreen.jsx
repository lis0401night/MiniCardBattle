import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import ExchangeItemCard from '../components/common/ExchangeItemCard.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { useExchangeScreen } from '../hooks/useExchangeScreen.js';
import { useGridVirtualizer } from '../hooks/useGridVirtualizer.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import {
  CHALLENGE_POINTS_KEY,
  CHALLENGE_TOTAL_POINTS_KEY,
} from '../utils/constants/config.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * 試練の宮殿（ダンジョンモード）専用のアイテム交換所画面コンポーネント。
 * @returns {JSX.Element} 試練交換所画面
 */
export default function ChallengeExchangeScreen() {
  const {
    points: challengePoints,
    setPoints: setChallengePoints,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    inventory,
    lineup,
    handleExchange,
  } = useExchangeScreen({
    pointsKey: 'challenge',
    pointsLocalKey: CHALLENGE_POINTS_KEY,
    pointsTotalLocalKey: CHALLENGE_TOTAL_POINTS_KEY,
    apiEndpoint: 'update_challenge_points.php',
  });

  // タイトルを10回クリックで試練ポイントを100Pt獲得するイースターエッグ
  const handleTitleClick = useEasterEgg(() => {
    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動して試練ポイントを100Pt獲得しますか？',
        () => {
          playSound(SOUNDS?.seSkill);
          const currentPts =
            parseInt(localStorage.getItem(CHALLENGE_POINTS_KEY), 10) || 0;
          const totalPts =
            parseInt(localStorage.getItem(CHALLENGE_TOTAL_POINTS_KEY), 10) || 0;
          const newPts = currentPts + 100;
          const newTotalPts = totalPts + 100;

          localStorage.setItem(CHALLENGE_POINTS_KEY, newPts);
          localStorage.setItem(CHALLENGE_TOTAL_POINTS_KEY, newTotalPts);
          setChallengePoints({ current: newPts, total: newTotalPts });

          // 共通APIユーティリティを介してサーバーと同期
          savePointsToServer(
            'update_challenge_points.php',
            newPts,
            newTotalPts
          );

          if (showAlertModal) {
            showAlertModal('【デバッグ】試練ポイントを100Pt獲得しました！');
          }
        }
      );
    }
  });

  // 仮想化グリッドフックの利用
  const { listContainerRef, rowVirtualizer, itemRows, gridCols, gridGap } =
    useGridVirtualizer({
      items: lineup || [],
    });

  return (
    <CompactScreenLayout
      id="screen-challenge-exchange"
      backgroundImage="background_challenge.webp"
      title="交換所"
      titleColor="#c084fc"
      titleGlow={true}
      onTitleClick={handleTitleClick}
      backTo="screen-dungeon-menu"
    >
      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {challengePoints.current} / 総ポイント:{' '}
        {challengePoints.total}
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
                    currentPoints={challengePoints.current}
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

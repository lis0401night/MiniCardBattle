import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import ExchangeItemCard from '../components/common/ExchangeItemCard.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { useExchangeScreen } from '../hooks/useExchangeScreen.js';
import { useGridVirtualizer } from '../hooks/useGridVirtualizer.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import {
  HIGH_DIFFICULTY_POINTS_KEY,
  HIGH_DIFFICULTY_TOTAL_POINTS_KEY,
} from '../utils/constants/config.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * 高難易度イベント専用のアイテム交換所画面コンポーネント。
 * 各カードに対応した限定プレイマット、限定アイコンおよび限定カードの交換機能を提供する。
 *
 * @param {Object} props
 * @param {Function} [props.switchScreen] - 画面遷移コールバック
 * @returns {JSX.Element} 高難易度交換所画面
 */
export default function HighDifficultyExchangeScreen({ switchScreen }) {
  const {
    points: highDifficultyPoints,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    inventory,
    lineup,
    handleExchange,
    grantDebugPoints,
  } = useExchangeScreen({
    pointsKey: 'high_difficulty',
    pointsLocalKey: HIGH_DIFFICULTY_POINTS_KEY,
    pointsTotalLocalKey: HIGH_DIFFICULTY_TOTAL_POINTS_KEY,
    apiEndpoint: 'update_high_difficulty_points.php',
  });

  /**
   * 戻るボタン押下時のハンドラ
   */
  const handleBack = () => {
    playSound(SOUNDS?.seClick);
    if (typeof switchScreen === 'function') {
      switchScreen('screen-high-difficulty-menu');
    }
  };

  // タイトルを10回クリックで高難易度ポイントを100Pt獲得するイースターエッグ（デバッグ用）
  const handleTitleClick = useEasterEgg(() => {
    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動して高難易度ポイントを100Pt獲得しますか？',
        () => {
          playSound(SOUNDS?.seSkill);
          grantDebugPoints(100);
          if (showAlertModal) {
            showAlertModal('【デバッグ】高難易度ポイントを100Pt獲得しました！');
          }
        }
      );
    }
  });

  // 仮想化グリッドフックの利用（大量アイテム表示時のパフォーマンスを最適化）
  const { listContainerRef, rowVirtualizer, itemRows, gridCols, gridGap } =
    useGridVirtualizer({
      items: lineup || [],
    });

  return (
    <CompactScreenLayout
      id="screen-high-difficulty-exchange"
      backgroundImage="background_highdifficulty.webp"
      title="交換所"
      titleColor="#ef4444"
      titleGlow={true}
      onTitleClick={handleTitleClick}
      onBackClick={handleBack}
      backTo="screen-high-difficulty-menu"
    >
      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {highDifficultyPoints.current} / 総ポイント:{' '}
        {highDifficultyPoints.total}
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
                    currentPoints={highDifficultyPoints.current}
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

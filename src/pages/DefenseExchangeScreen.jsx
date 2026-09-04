import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { useExchangeScreen } from '../hooks/useExchangeScreen.js';
import { useGridVirtualizer } from '../hooks/useGridVirtualizer.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
} from '../utils/constants/config.js';
import {
  getCardImgUrl,
  isTransitioning,
  playSound,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function DefenseExchangeScreen() {
  const {
    points,
    setPoints,
    inventory,
    unlockedPremium = [],
    lineup,
    handleExchange,
  } = useExchangeScreen({
    pointsKey: 'defense',
    pointsLocalKey: DEFENSE_POINTS_KEY,
    pointsTotalLocalKey: DEFENSE_TOTAL_POINTS_KEY,
    apiEndpoint: 'update_points.php',
  });

  // タイトルを10回クリックで防衛ポイントを100Pt獲得するイースターエッグ
  const handleTitleClick = useEasterEgg(() => {
    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動して防衛ポイントを100Pt獲得しますか？',
        () => {
          playSound?.(SOUNDS?.seSkill);
          let cPts =
            parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0;
          let tPts =
            parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) || 0;
          cPts += 100;
          tPts += 100;
          localStorage.setItem(DEFENSE_POINTS_KEY, String(cPts));
          localStorage.setItem(DEFENSE_TOTAL_POINTS_KEY, String(tPts));
          setPoints({ current: cPts, total: tPts });

          // 共通API同期ユーティリティを介してサーバーと同期
          savePointsToServer('update_points.php', cPts, tPts);

          if (showAlertModal) {
            showAlertModal('【デバッグ】防衛ポイントを100Pt獲得しました！');
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
      id="screen-exchange"
      backgroundImage="background_defense.webp"
      title="交換所"
      titleColor="#10b981"
      titleGlow={true}
      onTitleClick={handleTitleClick}
      backTo="screen-defense-menu"
    >
      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {points.current} / 総ポイント: {points.total}
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
                {row.map((itemInfo, localIdx) => {
                  const index = virtualRow.index * 3 + localIdx;
                  const cardMaster = CARD_MASTER || [];
                  const itemObj =
                    cardMaster.find((c) => c.id === itemInfo.id) ||
                    cardMaster[0] ||
                    {};

                  let canExchange = true;
                  let isMaxed = false;
                  let ownedCount = 0;

                  if (itemInfo.type === 'premium') {
                    if (unlockedPremium.includes(itemInfo.id)) {
                      canExchange = false;
                      isMaxed = true;
                    }
                  } else if (itemInfo.type === 'card') {
                    ownedCount = inventory[itemInfo.id] || 0;
                    if (ownedCount >= 4) {
                      canExchange = false;
                      isMaxed = true;
                    }
                  }

                  if (points.current < itemInfo.cost) {
                    canExchange = false;
                  }

                  const opacity = canExchange ? '1.0' : isMaxed ? '0.3' : '0.6';
                  const rarityClass = itemObj.rarity
                    ? ` rarity-${itemObj.rarity}`
                    : '';

                  let imgUrl = getCardImgUrl
                    ? getCardImgUrl(
                        itemInfo.type === 'premium'
                          ? { ...itemObj, isPremium: true }
                          : itemObj,
                        true
                      )
                    : '';

                  let originalImgUrl = getCardImgUrl
                    ? getCardImgUrl(
                        itemInfo.type === 'premium'
                          ? { ...itemObj, isPremium: true }
                          : itemObj,
                        false
                      )
                    : '';

                  return (
                    <div
                      key={index}
                      className="deck-card-item"
                      style={{
                        opacity,
                        cursor: canExchange ? 'pointer' : 'not-allowed',
                      }}
                      onClick={() => {
                        playSound(SOUNDS?.seClick);
                        if (
                          !isTransitioning &&
                          window.showExchangeDetailModal
                        ) {
                          window.showExchangeDetailModal({
                            id: itemInfo.id,
                            type: itemInfo.type,
                            cost: itemInfo.cost,
                            itemObj: itemObj,
                            titleColor: '#10b981',
                            canExchange: canExchange,
                            isMaxed: isMaxed,
                            titleName: itemObj.name,
                            displayType:
                              itemInfo.type === 'premium'
                                ? 'プレミアム特典'
                                : 'カード',
                            displayFlavor: itemObj.flavor,
                            imgUrl: originalImgUrl,
                            onConfirm: () => {
                              handleExchange({
                                ...itemInfo,
                                isMaxed,
                                canExchange,
                                imgUrl: originalImgUrl,
                              });
                              window.closeExchangeDetailModal?.();
                            },
                          });
                        }
                      }}
                    >
                      <div className={`card blue${rarityClass}`}>
                        {imgUrl && (
                          <img
                            className="card-bg"
                            src={imgUrl}
                            alt={itemObj.name}
                            loading="lazy"
                            decoding="async"
                            style={{
                              objectFit: 'cover',
                              objectPosition: 'top center',
                              width: '100%',
                              height: '100%',
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              pointerEvents: 'none',
                            }}
                          />
                        )}

                        {itemInfo.type === 'card' && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              background: 'rgba(0,0,0,0.85)',
                              color: '#facc15',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              fontWeight: 'bold',
                              fontSize: '0.75rem',
                              zIndex: 6,
                              border: '1px solid #facc15',
                            }}
                          >
                            {ownedCount}/4
                          </div>
                        )}

                        <div
                          className="card-power"
                          style={{
                            fontSize: '1.4rem',
                            bottom: 0,
                            right: '4px',
                          }}
                        >
                          {itemObj.power}
                        </div>

                        {window.renderSkillTag && (
                          <div
                            dangerouslySetInnerHTML={{
                              __html: window.renderSkillTag(itemObj),
                            }}
                          ></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </CompactScreenLayout>
  );
}

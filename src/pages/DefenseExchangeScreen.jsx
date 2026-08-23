import { useEffect, useState } from 'react';
import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { useGridVirtualizer } from '../hooks/useGridVirtualizer.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import { GameState } from '../state/gameState.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import {
  showCardAcquisitionModal,
  showPremiumAcquisitionModal,
} from '../services/uiGallery.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
  EXCHANGE_LINEUP,
} from '../utils/constants/config.js';
import {
  getCardImgUrl,
  isTransitioning,
  playSound,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function DefenseExchangeScreen() {
  const [points, setPoints] = useState(() => ({
    current: parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0,
    total: parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) || 0,
  }));
  const [exchangeItems, setExchangeItems] = useState(
    () => EXCHANGE_LINEUP || []
  );
  const [inventory, setInventory] = useState(
    () => GameState.playerInventory || {}
  );
  const [unlockedPremium, setUnlockedPremium] = useState(
    () => GameState.unlockedPremiumCards || []
  );
  const [pointsUpdated, setPointsUpdated] = useState(false);

  const updateExchange = () => {
    const currentPts =
      parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0;
    const totalPts =
      parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) || 0;
    setPoints({ current: currentPts, total: totalPts });

    setInventory(GameState.playerInventory || {});
    setUnlockedPremium(GameState.unlockedPremiumCards || []);
    setExchangeItems(EXCHANGE_LINEUP || []);
  };

  useEffect(() => {
    updateExchange();
  }, [pointsUpdated]);

  const handleExchange = async (item) => {
    // 最終ガード: 所持上限・アンロック済みのチェック
    const isPremium = item.type === 'premium';
    let isAlreadyUnlocked = false;

    if (isPremium) {
      isAlreadyUnlocked = unlockedPremium.includes(item.id);
    } else {
      isAlreadyUnlocked = (inventory[item.id] || 0) >= 4;
    }

    if (isAlreadyUnlocked) {
      showAlertModal(
        '既に最大数所持しているか、アンロック済みのアイテムです。'
      );
      return;
    }

    // 最終ガード: ポイント残高チェック
    if (points.current < item.cost) {
      showAlertModal('防衛ポイントが不足しています。');
      return;
    }

    playSound(SOUNDS?.seCardPlace);

    const newPts = points.current - item.cost;

    // 【CodeRabbit指摘反映・データ整合性保護】サーバーへの同期完了（成功）を待ってからローカルのポイント減算・アイテム付与を確定させる
    try {
      await savePointsToServer('update_points.php', newPts, points.total);
    } catch (e) {
      console.error('Failed to sync points to server:', e);
      showAlertModal(
        'ポイントの同期に失敗しました。通信環境を確認して再試行してください。'
      );
      return;
    }

    localStorage.setItem(DEFENSE_POINTS_KEY, newPts);
    setPoints((prev) => ({ ...prev, current: newPts }));

    if (item.type === 'premium') {
      const newUnlocked = [...unlockedPremium, item.id];
      localStorage.setItem(
        'mini_card_battle_unlocked_premium',
        JSON.stringify(newUnlocked)
      );
      Object.assign(GameState, { unlockedPremiumCards: newUnlocked });
      setUnlockedPremium(newUnlocked);
      showPremiumAcquisitionModal(item.id);
    } else {
      const currentCount = inventory[item.id] || 0;
      const newInventory = { ...inventory, [item.id]: currentCount + 1 };
      setInventory(newInventory);
      Object.assign(GameState, { playerInventory: newInventory });
      localStorage.setItem(
        'mini_card_battle_inventory',
        JSON.stringify(newInventory)
      );
      showCardAcquisitionModal(item.id);
    }

    setPointsUpdated((prev) => !prev);
  };

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
          localStorage.setItem(DEFENSE_POINTS_KEY, cPts);
          localStorage.setItem(DEFENSE_TOTAL_POINTS_KEY, tPts);
          setPoints({ current: cPts, total: tPts });

          // 共通API同期ユーティリティを介してサーバーと同期
          savePointsToServer('update_points.php', cPts, tPts);

          if (showAlertModal) {
            showAlertModal(
              '【デバッグ】防衛ポイントを100Pt獲得しました！',
              () => updateExchange()
            );
          } else {
            updateExchange();
          }
        }
      );
    }
  });

  // 仮想化グリッドフックの利用
  const { listContainerRef, rowVirtualizer, itemRows, gridCols, gridGap } =
    useGridVirtualizer({
      items: exchangeItems || [],
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
                              borderRadius: 'inherit',
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

import { useEffect, useState } from 'react';

import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import GridDensityIcon from '../components/common/GridDensityIcon.jsx';
import CardFilterModal from '../components/common/CardFilterModal.jsx';
import CardSortModal from '../components/common/CardSortModal.jsx';
import { useCardFilterSort } from '../hooks/useCardFilterSort.js';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { loadDeck, saveDeck } from '../services/deck.js';
import {
  openCardPreview,
  setRenderCardListHook,
} from '../services/uiGallery.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { CARD_MASTER, PREMIUM_CARD_IDS } from '../utils/constants/cards.js';
import {
  GALLERY_GRID_DENSITY_KEY,
  MAX_CARD_COPIES,
} from '../utils/constants/config.js';
import {
  getCardImgUrl,
  hasActiveFilters,
  isTransitioning,
  playSound,
  togglePremiumCard,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * カード一覧画面
 * useEasterEggカスタムフックによりデバッグモード起動処理をスマートに共通化。
 * useCardFilterSort/CardFilterModal/CardSortModalによりフィルター・ソート処理を共通化。
 */
export default function CardListScreen() {
  const [masterCards, setMasterCards] = useState([]);
  const [ownedKindCount, setOwnedKindCount] = useState(0);
  const [inventory, setInventory] = useState({});
  const [unlockedPremium, setUnlockedPremium] = useState([]);
  const [activePremium, setActivePremium] = useState([]);

  const {
    gridDensity,
    cycleGridDensity,
    gridCols,
    gridGap,
    filterModalVisible,
    openFilterModal,
    setFilterModalVisible,
    sortModalVisible,
    openSortModal,
    setSortModalVisible,
    filters,
    tempFilters,
    setTempFilters,
    toggleTempFilter,
    toggleTempSkillFilter,
    applyFilters,
    resetFilters,
    tempSortKey,
    setTempSortKey,
    tempSortOrder,
    setTempSortOrder,
    applySort,
    resetSort,
    sortedMasterCards,
  } = useCardFilterSort({
    masterCards,
    inventory,
    densityStorageKey: GALLERY_GRID_DENSITY_KEY,
    defaultOwnership: 'include_unowned',
  });

  // タイトルを10回クリックでデバッグ全解放モードを起動するイースターエッグ
  const handleTitleClick = useEasterEgg(() => {
    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動して全カード・全スキンを解放しますか？',
        () => {
          if (CARD_MASTER && GameState.playerInventory) {
            CARD_MASTER.forEach((card) => {
              if (!card.isToken) {
                GameState.playerInventory[card.id] = MAX_CARD_COPIES;
              }
            });
          }

          if (GameState.unlockedPremiumCards) {
            PREMIUM_CARD_IDS.forEach((id) => {
              if (!GameState.unlockedPremiumCards.includes(id)) {
                GameState.unlockedPremiumCards.push(id);
              }
            });
          }

          if (typeof saveDeck === 'function') saveDeck();
          if (typeof playSound === 'function' && SOUNDS)
            playSound(SOUNDS.seSkill);
          if (typeof showAlertModal === 'function')
            showAlertModal(
              `デバッグモード：全カードを${MAX_CARD_COPIES}枚所持状態にしました！`
            );
          updateList();
        }
      );
    }
  });

  const updateList = () => {
    // 常にグローバルなプレミアム設定を優先ロードする（デッキ固有設定に汚染されないため）
    const globalPremiumSrc = localStorage.getItem(
      'mini_card_battle_premium_cards'
    );
    if (globalPremiumSrc) {
      try {
        GameState.premiumCards = JSON.parse(globalPremiumSrc);
      } catch (e) {
        console.error('プレミアムカード設定のパースに失敗しました:', e);
      }
    } else {
      GameState.premiumCards = [];
    }

    const _masterCards = (CARD_MASTER || []).filter((c) => !c.isToken);
    setMasterCards(_masterCards);

    const _inventory = GameState.playerInventory || {};
    setInventory(_inventory);

    setUnlockedPremium(GameState.unlockedPremiumCards || []);
    setActivePremium(GameState.premiumCards || []);

    let count = 0;
    _masterCards.forEach((template) => {
      const ownedCount = _inventory[template.id] || 0;
      if (ownedCount > 0) count++;
    });
    setOwnedKindCount(count);
  };

  useEffect(() => {
    if (typeof loadDeck === 'function') {
      loadDeck();
    }
    updateList();

    // 既存のグローバル関数をフックして、プレミアム切り替えなどの際にReactを再描画させる
    setRenderCardListHook(updateList);

    return () => {
      setRenderCardListHook(null);
    };
  }, []);

  const handleTogglePremium = (e, templateId) => {
    e.stopPropagation();
    if (isTransitioning) return;
    playSound?.(SOUNDS?.seClick);
    togglePremiumCard?.(templateId, true); // カード一覧からは常にグローバル保存
    updateList();
  };

  const isFiltered = hasActiveFilters(filters, 'include_unowned');

  return (
    <CompactScreenLayout
      title={`カード一覧 (${ownedKindCount}/${masterCards.length}種)`}
      onTitleClick={handleTitleClick}
      titleStyle={{ cursor: 'pointer', userSelect: 'none' }}
      backTarget="screen-card-menu"
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn icon-btn"
            style={{
              padding: '6px 10px',
              fontSize: '1.2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={cycleGridDensity}
            title="表示密度切替"
          >
            <GridDensityIcon level={gridDensity} />
          </button>
          <button
            className="btn filter-btn"
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              position: 'relative',
              background: isFiltered ? '#facc15' : undefined,
              color: isFiltered ? '#0f172a' : undefined,
              fontWeight: isFiltered ? 'bold' : undefined,
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              openFilterModal();
            }}
          >
            🔍 絞り込み
            {isFiltered && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ef4444',
                }}
              />
            )}
          </button>

          <button
            className="btn filter-btn"
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              position: 'relative',
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              openSortModal();
            }}
          >
            ⇅ ソート
          </button>
        </div>
      }
    >
      <div
        className="card-list-scroll-area"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 15px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: `${gridGap}px`,
            justifyItems: 'center',
          }}
        >
          {sortedMasterCards.map((template) => {
            const ownedCount = inventory[template.id] || 0;
            const isUnlocked = unlockedPremium.includes(template.id);
            const isPremiumActive = activePremium.includes(template.id);
            const rarityClass = template.rarity
              ? ` rarity-${template.rarity}`
              : '';

            return (
              <div
                key={template.id}
                className="deck-card-item"
                style={{
                  width: '100%',
                  aspectRatio: '2/3',
                  maxWidth: '180px',
                  position: 'relative',
                  filter: ownedCount === 0 ? 'grayscale(100%)' : 'none',
                  opacity: ownedCount === 0 ? 0.4 : 1,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  openCardPreview(template.id);
                }}
              >
                <div
                  className={`card blue${rarityClass}${isPremiumActive ? ' is-premium' : ''}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                  }}
                >
                  <img
                    className="card-bg"
                    src={getCardImgUrl({
                      id: template.id,
                      isPremium: isPremiumActive,
                    })}
                    alt={template.name}
                    style={{
                      objectFit: 'cover',
                      width: '100%',
                      height: '100%',
                    }}
                  />
                  {/* 所持枚数バッジ */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      background: 'rgba(0,0,0,0.75)',
                      color: '#fff',
                      borderRadius: '12px',
                      padding: '2px 6px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      zIndex: 2,
                    }}
                  >
                    ×{ownedCount}
                  </div>

                  {/* プレミアム切り替えボタン (解放済みの場合のみ表示) */}
                  {isUnlocked && (
                    <button
                      className="btn"
                      style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        background: isPremiumActive
                          ? 'linear-gradient(135deg, #facc15, #f59e0b)'
                          : 'rgba(0,0,0,0.6)',
                        color: isPremiumActive ? '#0f172a' : '#facc15',
                        border: '1px solid #facc15',
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        padding: '2px 4px',
                        zIndex: 3,
                      }}
                      onClick={(e) => handleTogglePremium(e, template.id)}
                    >
                      {isPremiumActive ? '✨ プレミアム' : '通常'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {sortedMasterCards.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#94a3b8',
              marginTop: '40px',
              fontSize: '0.95rem',
            }}
          >
            条件に一致するカードが見つかりませんでした。
          </div>
        )}
      </div>

      {/* フィルターモーダル */}
      <CardFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        tempFilters={tempFilters}
        setTempFilters={setTempFilters}
        toggleTempFilter={toggleTempFilter}
        toggleTempSkillFilter={toggleTempSkillFilter}
        onApply={applyFilters}
        onReset={resetFilters}
        defaultOwnership="include_unowned"
      />

      {/* ソートモーダル */}
      <CardSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        tempSortKey={tempSortKey}
        setTempSortKey={setTempSortKey}
        tempSortOrder={tempSortOrder}
        setTempSortOrder={setTempSortOrder}
        onApply={applySort}
        onReset={resetSort}
      />
    </CompactScreenLayout>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

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
 * カード一覧画面の所持フィルター既定値（フック・判定・モーダルで共有）
 */
const DEFAULT_OWNERSHIP = 'include_unowned';

/**
 * カード一覧画面（ギャラリー）
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
    isDefaultSort,
    tempSortMode,
    setTempSortMode,
    applySort,
    resetSort,
    sortedMasterCards,
  } = useCardFilterSort({
    masterCards,
    inventory,
    densityStorageKey: GALLERY_GRID_DENSITY_KEY,
    defaultOwnership: DEFAULT_OWNERSHIP,
  });

  // --- 仮想スクロール設定 ---
  const listContainerRef = useRef(null);

  // カードを列数（gridCols）ごとにグループ化して行配列を生成
  const cardRows = useMemo(() => {
    const rows = [];
    const safeCols = Math.max(1, gridCols);
    for (let i = 0; i < sortedMasterCards.length; i += safeCols) {
      rows.push(sortedMasterCards.slice(i, i + safeCols));
    }
    return rows;
  }, [sortedMasterCards, gridCols]);

  // @tanstack/react-virtual による行単位仮想化
  const rowVirtualizer = useVirtualizer({
    count: cardRows.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 140, // 初期推定行高さ（実測値で自動更新される）
    gap: gridGap,
    overscan: 2,
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

  return (
    <CompactScreenLayout
      id="screen-card-list"
      title="カード一覧"
      titleColor="#facc15"
      backgroundImage="background_gallery.webp"
      onTitleClick={handleTitleClick}
      backTo="screen-gallery-menu"
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: '10px',
          width: '95%',
          maxWidth: '440px',
          boxSizing: 'border-box',
        }}
      >
        <div
          id="card-list-count"
          style={{
            fontSize: '0.9rem',
            color: '#cbd5e1',
            margin: 0,
            textAlign: 'center',
          }}
        >
          カード種類: {ownedKindCount} / {masterCards.length}
        </div>
        <button
          className="btn"
          title="カード表示サイズを変更"
          onClick={cycleGridDensity}
          style={{
            position: 'absolute',
            left: '4px',
            padding: '4px 8px',
            margin: 0,
            fontSize: '0.9rem',
            background: '#334155',
            border: '1px solid #475569',
            color: '#facc15',
          }}
        >
          <GridDensityIcon level={gridDensity} />
        </button>
        <button
          className="btn"
          style={{
            position: 'absolute',
            right: '44px',
            padding: '4px 8px',
            margin: 0,
            fontSize: '0.9rem',
            background: hasActiveFilters(filters, DEFAULT_OWNERSHIP)
              ? 'rgba(250, 204, 21, 0.3)'
              : '#334155',
            border: hasActiveFilters(filters, DEFAULT_OWNERSHIP)
              ? '1px solid #facc15'
              : '1px solid #475569',
            color: '#facc15',
          }}
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            openFilterModal();
          }}
        >
          🔍
        </button>
        <button
          className="btn"
          style={{
            position: 'absolute',
            right: '4px',
            padding: '4px 8px',
            margin: 0,
            fontSize: '0.9rem',
            background: !isDefaultSort ? 'rgba(250, 204, 21, 0.3)' : '#334155',
            border: !isDefaultSort ? '1px solid #facc15' : '1px solid #475569',
            color: '#facc15',
          }}
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            openSortModal();
          }}
        >
          ↕️
        </button>
      </div>

      <div
        ref={listContainerRef}
        className="card-list-container"
        style={{
          flex: 1,
          minHeight: 0,
          maxHeight: '560px',
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
            const row = cardRows[virtualRow.index] || [];
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
                {row.map((template) => {
                  const ownedCount = inventory[template.id] || 0;
                  const isOwned = ownedCount > 0;
                  const opacity = isOwned ? '1' : '0.4';
                  const rarityClass = template.rarity
                    ? ` rarity-${template.rarity}`
                    : '';
                  const imgUrl = getCardImgUrl
                    ? getCardImgUrl(template, true)
                    : '';
                  const filter = template.filter || 'none';

                  const hasPremiumUnlocked = unlockedPremium.includes(
                    template.id
                  );
                  const isPremiumActive = activePremium.includes(template.id);

                  return (
                    <div
                      key={template.id}
                      className="deck-card-item gallery-card-wrapper"
                      onClick={() => {
                        if (!isTransitioning) {
                          openCardPreview?.(template, { fromCardList: true });
                        }
                      }}
                    >
                      <div
                        className={`card blue${rarityClass}`}
                        style={{ opacity }}
                      >
                        {imgUrl && (
                          <img
                            className="card-bg"
                            src={imgUrl}
                            alt={template.name}
                            loading="lazy"
                            decoding="async"
                            style={{
                              filter,
                              objectFit: 'cover',
                              width: '100%',
                              height: '100%',
                            }}
                          />
                        )}

                        {hasPremiumUnlocked && (
                          <div
                            className="premium-toggle-icon"
                            onClick={(e) => handleTogglePremium(e, template.id)}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              left: '4px',
                              background: 'rgba(0,0,0,0.85)',
                              color: isPremiumActive ? '#d946ef' : '#94a3b8',
                              padding: '2px 6px',
                              borderRadius: '10px',
                              fontSize: '0.8rem',
                              zIndex: 7,
                              border: `1px solid ${isPremiumActive ? '#d946ef' : '#475569'}`,
                              cursor: 'pointer',
                            }}
                          >
                            ✨
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
                          {template.power}
                        </div>

                        {window.renderSkillTag && (
                          <div
                            dangerouslySetInnerHTML={{
                              __html: window.renderSkillTag(template),
                            }}
                          ></div>
                        )}

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
                          x{ownedCount}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {masterCards.length > 0 && sortedMasterCards.length === 0 && (
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
        defaultOwnership={DEFAULT_OWNERSHIP}
      />

      {/* ソートモーダル */}
      <CardSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        tempSortMode={tempSortMode}
        setTempSortMode={setTempSortMode}
        onApply={applySort}
        onReset={resetSort}
      />
    </CompactScreenLayout>
  );
}

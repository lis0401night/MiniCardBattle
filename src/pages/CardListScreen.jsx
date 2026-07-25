import { useEffect, useMemo, useRef, useState } from 'react';

import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import GridDensityIcon from '../components/common/GridDensityIcon.jsx';
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
  GRID_DENSITY_COLS,
  GRID_DENSITY_GAPS,
  MAX_CARD_COPIES,
} from '../utils/constants/config.js';
import { SKILLS, SKILL_CATEGORIES } from '../utils/constants/skills.js';
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
 */
export default function CardListScreen() {
  const [masterCards, setMasterCards] = useState([]);
  const [ownedKindCount, setOwnedKindCount] = useState(0);
  const [inventory, setInventory] = useState({});
  const [unlockedPremium, setUnlockedPremium] = useState([]);
  const [activePremium, setActivePremium] = useState([]);

  // フィルター用状態定義
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [sortMode, setSortMode] = useState('rarity_asc');
  const [tempSortMode, setTempSortMode] = useState('rarity_asc');
  const modalContentRef = useRef(null);
  const skillAccordionRef = useRef(null);
  const [filters, setFilters] = useState({
    ownership: 'include_unowned',
    rarity: [],
    power: [],
    skills: [],
    excludeSkills: [],
    name: '',
  });
  const [tempFilters, setTempFilters] = useState({
    ownership: 'include_unowned',
    rarity: [],
    power: [],
    skills: [],
    excludeSkills: [],
    name: '',
  });
  const [isSkillAccordionOpen, setIsSkillAccordionOpen] = useState(false);

  const [gridDensity, setGridDensity] = useState(() => {
    const saved = parseInt(localStorage.getItem(GALLERY_GRID_DENSITY_KEY), 10);
    return Number.isInteger(saved) &&
      saved >= 0 &&
      saved < GRID_DENSITY_COLS.length
      ? saved
      : 0;
  });

  const cycleGridDensity = () => {
    playSound?.(SOUNDS?.seClick);
    setGridDensity((prev) => {
      const next = (prev + 1) % GRID_DENSITY_COLS.length;
      localStorage.setItem(GALLERY_GRID_DENSITY_KEY, String(next));
      return next;
    });
  };

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

  const toggleTempFilter = (type, val) => {
    playSound?.(SOUNDS?.seClick);
    setTempFilters((prev) => {
      const arr = prev[type];
      return {
        ...prev,
        [type]: arr.includes(val)
          ? arr.filter((x) => x !== val)
          : [...arr, val],
      };
    });
  };

  const toggleTempSkillFilter = (sk) => {
    playSound?.(SOUNDS?.seClick);
    setTempFilters((prev) => {
      const isIncluded = (prev.skills || []).includes(sk);
      const isExcluded = (prev.excludeSkills || []).includes(sk);

      let nextSkills = [...(prev.skills || [])];
      let nextExclude = [...(prev.excludeSkills || [])];

      if (!isIncluded && !isExcluded) {
        // 未選択 -> 指定（含む）
        nextSkills.push(sk);
      } else if (isIncluded) {
        // 指定 -> 除外
        nextSkills = nextSkills.filter((x) => x !== sk);
        nextExclude.push(sk);
      } else {
        // 除外 -> 未選択
        nextExclude = nextExclude.filter((x) => x !== sk);
      }

      return {
        ...prev,
        skills: nextSkills,
        excludeSkills: nextExclude,
      };
    });
  };

  // フィルター選択肢の抽出
  const allCardsForFilters = masterCards;

  const availableRarities = Array.from(
    new Set(
      allCardsForFilters.map((c) => c.rarity).filter((x) => x !== undefined)
    )
  ).sort();
  const availablePowers = Array.from(
    new Set(
      allCardsForFilters.map((c) => c.power).filter((x) => x !== undefined)
    )
  ).sort((a, b) => a - b);
  const availableSkills = Array.from(
    new Set(
      allCardsForFilters.flatMap((c) => {
        let s = [];
        if (Array.isArray(c.skills)) c.skills.forEach((sk) => s.push(sk.id));
        if (Array.isArray(c.choices)) c.choices.forEach((ch) => s.push(ch.id));
        if (Array.isArray(c.choices2))
          c.choices2.forEach((ch) => s.push(ch.id));
        return s;
      })
    )
  )
    .filter(Boolean)
    .sort();

  // フィルター適用後のカードリスト
  const filteredMasterCards = masterCards.filter((c) => {
    const ownership = filters.ownership || 'include_unowned';
    const ownedCount = inventory[c.id] || 0;

    if (ownership === 'owned_only' && ownedCount <= 0) return false;
    if (ownership === 'three_or_less' && ownedCount > MAX_CARD_COPIES - 1)
      return false;

    if (
      filters.name &&
      !c.name.toLowerCase().includes(filters.name.toLowerCase())
    )
      return false;
    if (filters.rarity.length > 0 && !filters.rarity.includes(c.rarity))
      return false;
    if (filters.power.length > 0 && !filters.power.includes(c.power))
      return false;

    let cardSkills = [];
    if (Array.isArray(c.skills))
      c.skills.forEach((sk) => cardSkills.push(sk.id));
    if (Array.isArray(c.choices))
      c.choices.forEach((ch) => cardSkills.push(ch.id));
    if (Array.isArray(c.choices2))
      c.choices2.forEach((ch) => cardSkills.push(ch.id));

    if (filters.skills && filters.skills.length > 0) {
      if (!filters.skills.some((sk) => cardSkills.includes(sk))) return false;
    }

    if (filters.excludeSkills && filters.excludeSkills.length > 0) {
      if (filters.excludeSkills.some((sk) => cardSkills.includes(sk)))
        return false;
    }

    return true;
  });

  // CARD_MASTERのID→定義順インデックスを一度だけ構築し、ソートの安定化に使う
  const cardOrderMap = useMemo(() => {
    const map = new Map();
    (CARD_MASTER || []).forEach((c, i) => map.set(c.id, i));
    return map;
  }, []);

  // カードのソート処理
  const sortedMasterCards = useMemo(
    () =>
      [...filteredMasterCards].sort((a, b) => {
        const rarityA = a.rarity ?? 0;
        const rarityB = b.rarity ?? 0;
        const powerA = a.power ?? 0;
        const powerB = b.power ?? 0;

        if (sortMode === 'rarity_asc') {
          if (rarityA !== rarityB) return rarityA - rarityB;
        } else if (sortMode === 'rarity_desc') {
          if (rarityA !== rarityB) return rarityB - rarityA;
        } else if (sortMode === 'power_asc') {
          if (powerA !== powerB) return powerA - powerB;
          if (rarityA !== rarityB) return rarityA - rarityB;
        } else if (sortMode === 'power_desc') {
          if (powerA !== powerB) return powerB - powerA;
          if (rarityA !== rarityB) return rarityA - rarityB;
        }
        // 同レアリティ・同パワーの場合、CARD_MASTERの元のID定義順で一貫性を保つ
        const idxA = cardOrderMap.get(a.id) ?? 999;
        const idxB = cardOrderMap.get(b.id) ?? 999;
        return idxA - idxB;
      }),
    [filteredMasterCards, sortMode, cardOrderMap]
  );

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
            right: '44px', // ソートボタン追加に伴い少し左に移動
            padding: '4px 8px',
            margin: 0,
            fontSize: '0.9rem',
            background: hasActiveFilters(filters, 'include_unowned')
              ? 'rgba(250, 204, 21, 0.3)'
              : '#334155',
            border: hasActiveFilters(filters, 'include_unowned')
              ? '1px solid #facc15'
              : '1px solid #475569',
            color: '#facc15',
          }}
          onClick={() => {
            setTempFilters({ ...filters });
            setIsFilterModalOpen(true);
            playSound?.(SOUNDS?.seClick);
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
            background:
              sortMode !== 'rarity_asc' ? 'rgba(250, 204, 21, 0.3)' : '#334155',
            border:
              sortMode !== 'rarity_asc'
                ? '1px solid #facc15'
                : '1px solid #475569',
            color: '#facc15',
          }}
          onClick={() => {
            setTempSortMode(sortMode);
            setIsSortModalOpen(true);
            playSound?.(SOUNDS?.seClick);
          }}
        >
          ↕️
        </button>
      </div>

      <div
        className="card-list-container"
        style={{ flex: 1, minHeight: 0, maxHeight: '560px' }}
      >
        <div
          id="gallery-card-grid"
          className="card-list-grid-3col"
          style={{
            gridTemplateColumns: `repeat(${GRID_DENSITY_COLS[gridDensity]}, 1fr)`,
            gap: `${GRID_DENSITY_GAPS[gridDensity]}px`,
          }}
        >
          {sortedMasterCards.map((template) => {
            const ownedCount = inventory[template.id] || 0;
            const isOwned = ownedCount > 0;
            const opacity = isOwned ? '1' : '0.4';
            const rarityClass = template.rarity
              ? ` rarity-${template.rarity}`
              : '';
            const imgUrl = getCardImgUrl ? getCardImgUrl(template, true) : '';
            const filter = template.filter || 'none';

            const hasPremiumUnlocked = unlockedPremium.includes(template.id);
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
                <div className={`card blue${rarityClass}`} style={{ opacity }}>
                  {imgUrl && (
                    <img
                      className="card-bg"
                      src={imgUrl}
                      alt={template.name}
                      loading="lazy"
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
                    style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}
                  >
                    {template.power}
                  </div>

                  {/* 既存のスキルバッジ描画ロジックをdangerouslySetInnerHTMLで流用 */}
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
                    {ownedCount}/4
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* フィルターダイアログ */}
      {isFilterModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '2px solid #facc15',
              borderRadius: '12px',
              padding: '15px 20px',
              width: '90%',
              maxWidth: '400px',
              height: '82dvh',
              maxHeight: '82dvh',
              boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 固定タイトル */}
            <h3
              style={{
                margin: '0 0 10px 0',
                color: '#facc15',
                textAlign: 'center',
                fontSize: '1.2rem',
                flexShrink: 0,
              }}
            >
              フィルター
            </h3>

            {/* スクロールエリア */}
            <div
              ref={modalContentRef}
              style={{
                position: 'relative',
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                paddingRight: '4px',
                marginBottom: '10px',
              }}
            >
              {/* カード名 */}
              <div>
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                    marginBottom: '8px',
                  }}
                >
                  カード名
                </div>
                <input
                  type="text"
                  value={tempFilters.name || ''}
                  onChange={(e) =>
                    setTempFilters({ ...tempFilters, name: e.target.value })
                  }
                  placeholder="カード名で検索..."
                  style={{
                    background: '#334155',
                    color: '#fff',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.9rem',
                    width: '100%',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* 所持 */}
              <div>
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                    marginBottom: '8px',
                  }}
                >
                  所持
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {[
                    { id: 'owned_only', label: '所持のみ' },
                    { id: 'include_unowned', label: '未所持含む' },
                    {
                      id: 'three_or_less',
                      label: `${MAX_CARD_COPIES - 1}枚以下のみ`,
                    },
                  ].map((opt) => (
                    <div
                      key={opt.id}
                      onClick={() => {
                        playSound?.(SOUNDS?.seClick);
                        setTempFilters({ ...tempFilters, ownership: opt.id });
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border:
                          (tempFilters.ownership || 'include_unowned') ===
                          opt.id
                            ? '2px solid #facc15'
                            : '2px solid #475569',
                        background:
                          (tempFilters.ownership || 'include_unowned') ===
                          opt.id
                            ? 'rgba(250, 204, 21, 0.2)'
                            : '#334155',
                        color:
                          (tempFilters.ownership || 'include_unowned') ===
                          opt.id
                            ? '#facc15'
                            : '#94a3b8',
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontSize: '0.85rem',
                      }}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* レアリティ */}
              <div>
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                    marginBottom: '8px',
                  }}
                >
                  レアリティ
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {availableRarities.map((r) => (
                    <div
                      key={`r-${r}`}
                      onClick={() => toggleTempFilter('rarity', r)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: tempFilters.rarity.includes(r)
                          ? '2px solid #facc15'
                          : '2px solid #475569',
                        background: tempFilters.rarity.includes(r)
                          ? 'rgba(250, 204, 21, 0.2)'
                          : '#334155',
                        color: tempFilters.rarity.includes(r)
                          ? '#facc15'
                          : '#94a3b8',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      ★{r}
                    </div>
                  ))}
                </div>
              </div>

              {/* パワー */}
              <div>
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                    marginBottom: '8px',
                  }}
                >
                  パワー
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {availablePowers.map((p) => (
                    <div
                      key={`p-${p}`}
                      onClick={() => toggleTempFilter('power', p)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: tempFilters.power.includes(p)
                          ? '2px solid #facc15'
                          : '2px solid #475569',
                        background: tempFilters.power.includes(p)
                          ? 'rgba(250, 204, 21, 0.2)'
                          : '#334155',
                        color: tempFilters.power.includes(p)
                          ? '#facc15'
                          : '#94a3b8',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      P{p}
                    </div>
                  ))}
                </div>
              </div>

              {/* 能力 */}
              <div ref={skillAccordionRef}>
                <div
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    const nextState = !isSkillAccordionOpen;
                    setIsSkillAccordionOpen(nextState);
                    if (nextState) {
                      setTimeout(() => {
                        if (
                          modalContentRef.current &&
                          skillAccordionRef.current
                        ) {
                          modalContentRef.current.scrollTo({
                            top: skillAccordionRef.current.offsetTop,
                            behavior: 'smooth',
                          });
                        }
                      }, 50);
                    }
                  }}
                  style={{
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px',
                    backgroundColor: '#334155',
                    borderRadius: '6px',
                    border:
                      (tempFilters.skills && tempFilters.skills.length > 0) ||
                      (tempFilters.excludeSkills &&
                        tempFilters.excludeSkills.length > 0)
                        ? '1px solid #facc15'
                        : '1px solid transparent',
                  }}
                >
                  <span
                    style={{
                      color:
                        (tempFilters.skills && tempFilters.skills.length > 0) ||
                        (tempFilters.excludeSkills &&
                          tempFilters.excludeSkills.length > 0)
                          ? '#facc15'
                          : '#94a3b8',
                    }}
                  >
                    能力 ※2回クリックで除外
                  </span>
                  <span>{isSkillAccordionOpen ? '▲' : '▼'}</span>
                </div>
                {isSkillAccordionOpen && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      padding: '8px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '8px',
                    }}
                  >
                    {SKILL_CATEGORIES.map((category) => {
                      const activeGroups = category.groups
                        .map((group) => ({
                          ...group,
                          validSkills: group.skills.filter((sk) =>
                            availableSkills.includes(sk)
                          ),
                        }))
                        .filter((g) => g.validSkills.length > 0);

                      if (activeGroups.length === 0) return null;

                      return (
                        <div
                          key={category.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              color: '#facc15',
                              borderBottom: '1px solid rgba(250, 204, 21, 0.2)',
                              paddingBottom: '2px',
                              marginBottom: '4px',
                            }}
                          >
                            {category.name}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              paddingLeft: '4px',
                            }}
                          >
                            {activeGroups.map((group, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                  background: 'rgba(255,255,255,0.02)',
                                  padding: '6px',
                                  borderRadius: '6px',
                                  border: '1px solid rgba(255,255,255,0.05)',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#94a3b8',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {group.name}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '6px',
                                  }}
                                >
                                  {group.validSkills.map((sk) => {
                                    const skillDef = SKILLS[sk] || {
                                      name: sk,
                                      icon: '',
                                    };
                                    const isSelected = (
                                      tempFilters.skills || []
                                    ).includes(sk);
                                    const isExcluded = (
                                      tempFilters.excludeSkills || []
                                    ).includes(sk);
                                    return (
                                      <div
                                        key={sk}
                                        onClick={() =>
                                          toggleTempSkillFilter(sk)
                                        }
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: '4px',
                                          border: isSelected
                                            ? '1px solid #facc15'
                                            : isExcluded
                                              ? '1px solid #ef4444'
                                              : '1px solid #475569',
                                          background: isSelected
                                            ? 'rgba(250, 204, 21, 0.2)'
                                            : isExcluded
                                              ? 'rgba(239, 68, 68, 0.2)'
                                              : '#334155',
                                          color: isSelected
                                            ? '#facc15'
                                            : isExcluded
                                              ? '#ef4444'
                                              : '#cbd5e1',
                                          textDecoration: isExcluded
                                            ? 'line-through'
                                            : 'none',
                                          cursor: 'pointer',
                                          fontSize: '0.8rem',
                                          userSelect: 'none',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          transition: 'all 0.15s ease',
                                        }}
                                      >
                                        <span>{skillDef.icon}</span>
                                        <span>{skillDef.name}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 固定フッターボタン */}
            <div
              style={{
                display: 'flex',
                gap: '15px',
                justifyContent: 'center',
                flexShrink: 0,
                paddingTop: '5px',
              }}
            >
              <button
                className="btn"
                style={{
                  background: '#7f1d1d',
                  margin: 0,
                  padding: '8px',
                  flex: 1,
                  minWidth: '80px',
                  fontSize: '1rem',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setTempFilters({
                    ownership: 'include_unowned',
                    rarity: [],
                    power: [],
                    skills: [],
                    excludeSkills: [],
                    name: '',
                  });
                }}
              >
                リセット
              </button>
              <button
                className="btn"
                style={{
                  background: '#64748b',
                  margin: 0,
                  padding: '8px',
                  flex: 1,
                  minWidth: '80px',
                  fontSize: '1rem',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setIsFilterModalOpen(false);
                }}
              >
                閉じる
              </button>
              <button
                className="btn"
                style={{
                  background: '#10b981',
                  margin: 0,
                  padding: '8px',
                  flex: 1,
                  minWidth: '80px',
                  fontSize: '1rem',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setFilters({ ...tempFilters });
                  setIsFilterModalOpen(false);
                }}
              >
                適用
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ソートダイアログ */}
      {isSortModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onClick={() => setIsSortModalOpen(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '2px solid #facc15',
              borderRadius: '12px',
              padding: '20px',
              width: '85%',
              maxWidth: '320px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                margin: 0,
                color: '#facc15',
                textAlign: 'center',
                fontSize: '1.1rem',
                marginBottom: '5px',
              }}
            >
              並び替え（ソート）
            </h3>

            {[
              { id: 'rarity_asc', label: 'レアリティ昇順' },
              { id: 'rarity_desc', label: 'レアリティ降順' },
              { id: 'power_asc', label: 'パワー昇順' },
              { id: 'power_desc', label: 'パワー降順' },
            ].map((opt) => {
              const isSelected = tempSortMode === opt.id;
              return (
                <button
                  key={opt.id}
                  className="btn"
                  style={{
                    padding: '10px 14px',
                    fontSize: '0.9rem',
                    textAlign: 'left',
                    background: isSelected
                      ? 'rgba(250, 204, 21, 0.2)'
                      : '#334155',
                    border: isSelected
                      ? '1.5px solid #facc15'
                      : '1px solid #475569',
                    color: isSelected ? '#facc15' : '#cbd5e1',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    setTempSortMode(opt.id);
                  }}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                marginTop: '10px',
              }}
            >
              <button
                className="btn"
                style={{
                  background: '#7f1d1d',
                  margin: 0,
                  padding: '8px',
                  flex: 1,
                  minWidth: '70px',
                  fontSize: '0.95rem',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setTempSortMode('rarity_asc');
                }}
              >
                リセット
              </button>
              <button
                className="btn"
                style={{
                  background: '#64748b',
                  margin: 0,
                  padding: '8px',
                  flex: 1,
                  minWidth: '70px',
                  fontSize: '0.95rem',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setIsSortModalOpen(false);
                }}
              >
                閉じる
              </button>
              <button
                className="btn"
                style={{
                  background: '#10b981',
                  margin: 0,
                  padding: '8px',
                  flex: 1,
                  minWidth: '70px',
                  fontSize: '0.95rem',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setSortMode(tempSortMode);
                  setIsSortModalOpen(false);
                }}
              >
                適用
              </button>
            </div>
          </div>
        </div>
      )}
    </CompactScreenLayout>
  );
}

import { useEffect, useState } from 'react';

import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { loadDeck, saveDeck } from '../services/deck.js';
import { GameState } from '../state/gameState.js';
import {
  openCardPreview,
  setRenderCardListHook,
} from '../services/uiGallery.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { CARD_MASTER, PREMIUM_CARD_IDS } from '../utils/constants/cards.js';
import { SKILLS, SKILL_CATEGORIES } from '../utils/constants/skills.js';
import { MAX_CARD_COPIES } from '../utils/constants/config.js';
import {
  getCardImgUrl,
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
  const [filters, setFilters] = useState({
    rarity: [],
    power: [],
    skills: [],
    name: '',
  });
  const [tempFilters, setTempFilters] = useState({
    rarity: [],
    power: [],
    skills: [],
    name: '',
  });
  const [isSkillAccordionOpen, setIsSkillAccordionOpen] = useState(false);

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
    if (
      filters.name &&
      !c.name.toLowerCase().includes(filters.name.toLowerCase())
    )
      return false;
    if (filters.rarity.length > 0 && !filters.rarity.includes(c.rarity))
      return false;
    if (filters.power.length > 0 && !filters.power.includes(c.power))
      return false;
    if (filters.skills.length > 0) {
      let cardSkills = [];
      if (Array.isArray(c.skills))
        c.skills.forEach((sk) => cardSkills.push(sk.id));
      if (Array.isArray(c.choices))
        c.choices.forEach((ch) => cardSkills.push(ch.id));
      if (Array.isArray(c.choices2))
        c.choices2.forEach((ch) => cardSkills.push(ch.id));
      if (!filters.skills.some((sk) => cardSkills.includes(sk))) return false;
    }
    return true;
  });

  return (
    <CompactScreenLayout
      id="screen-card-list"
      title="カード一覧"
      titleColor="#facc15"
      backgroundImage="background_gallery.png"
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
          style={{
            position: 'absolute',
            right: '4px', // 枠の右端（内側）に綺麗にアライン
            padding: '4px 8px',
            margin: 0,
            fontSize: '0.9rem',
            background:
              filters.rarity.length > 0 ||
              filters.power.length > 0 ||
              filters.skills.length > 0 ||
              !!filters.name
                ? 'rgba(250, 204, 21, 0.3)'
                : '#334155',
            border:
              filters.rarity.length > 0 ||
              filters.power.length > 0 ||
              filters.skills.length > 0 ||
              !!filters.name
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
      </div>

      <div className="card-list-container">
        <div id="gallery-card-grid" className="card-list-grid-3col">
          {filteredMasterCards.map((template) => {
            const ownedCount = inventory[template.id] || 0;
            const isOwned = ownedCount > 0;
            const opacity = isOwned ? '1' : '0.4';
            const rarityClass = template.rarity
              ? ` rarity-${template.rarity}`
              : '';
            const imgUrl = getCardImgUrl ? getCardImgUrl(template) : '';
            const filter = template.filter || 'none';

            const hasPremiumUnlocked = unlockedPremium.includes(template.id);
            const isPremiumActive = activePremium.includes(template.id);

            return (
              <div
                key={template.id}
                className="deck-card-item gallery-card-wrapper"
                onClick={() => {
                  if (!isTransitioning) openCardPreview?.(template);
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
              padding: '20px',
              width: '90%',
              maxWidth: '400px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                margin: 0,
                color: '#facc15',
                textAlign: 'center',
                fontSize: '1.2rem',
              }}
            >
              フィルター
            </h3>

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
            <div>
              <div
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setIsSkillAccordionOpen(!isSkillAccordionOpen);
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
                    tempFilters.skills.length > 0
                      ? '1px solid #facc15'
                      : '1px solid transparent',
                }}
              >
                <span
                  style={{
                    color:
                      tempFilters.skills.length > 0 ? '#facc15' : '#94a3b8',
                  }}
                >
                  能力
                </span>
                <span>{isSkillAccordionOpen ? '▲' : '▼'}</span>
              </div>
              {isSkillAccordionOpen && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    maxHeight: '260px',
                    overflowY: 'auto',
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
                                  const isSelected =
                                    tempFilters.skills.includes(sk);
                                  return (
                                    <div
                                      key={sk}
                                      onClick={() =>
                                        toggleTempFilter('skills', sk)
                                      }
                                      style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        border: isSelected
                                          ? '1px solid #facc15'
                                          : '1px solid #475569',
                                        background: isSelected
                                          ? 'rgba(250, 204, 21, 0.2)'
                                          : '#334155',
                                        color: isSelected
                                          ? '#facc15'
                                          : '#cbd5e1',
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

            <div
              style={{
                display: 'flex',
                gap: '15px',
                justifyContent: 'center',
                marginTop: '10px',
              }}
            >
              <button
                className="action-btn"
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
                    rarity: [],
                    power: [],
                    skills: [],
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
    </CompactScreenLayout>
  );
}

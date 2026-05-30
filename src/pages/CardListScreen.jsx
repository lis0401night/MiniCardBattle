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
            showAlertModal(`デバッグモード：全カードを${MAX_CARD_COPIES}枚所持状態にしました！`);
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
      onTitleClick={handleTitleClick}
      backTo="screen-gallery-menu"
    >
      <div
        id="card-list-count"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        カード種類: {ownedKindCount} / {masterCards.length}
      </div>

      <div className="card-list-container">
        <div id="gallery-card-grid" className="card-list-grid-3col">
          {masterCards.map((template) => {
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
                  <div
                    className="card-bg"
                    style={{ backgroundImage: `url('${imgUrl}')`, filter }}
                  ></div>

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
    </CompactScreenLayout>
  );
}

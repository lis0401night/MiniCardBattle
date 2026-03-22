import React, { useState, useEffect } from 'react';

import { CARD_MASTER } from '../utils/constants/cards.js';
import { playSound, isTransitioning, switchScreen, getCardImgUrl, togglePremiumCard } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { loadDeck, saveDeck } from '../hooks/deck.js';
import { GameState } from '../hooks/gameState.js';
import { setRenderCardListHook, openCardPreview } from '../hooks/uiGallery.js';
import { showAlertModal } from '../hooks/uiModals.js';

export default function CardListScreen() {
  const [masterCards, setMasterCards] = useState([]);
  const [ownedKindCount, setOwnedKindCount] = useState(0);
  const [inventory, setInventory] = useState({});
  const [unlockedPremium, setUnlockedPremium] = useState([]);
  const [activePremium, setActivePremium] = useState([]);
  const [clickCount, setClickCount] = useState(0);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 10) {
      setClickCount(0);
      
      if (CARD_MASTER && GameState.playerInventory) {
        CARD_MASTER.forEach(card => {
          if (!card.isToken) {
            GameState.playerInventory[card.id] = 4;
          }
        });
      }

      const premiumTargets = ['empress', 'assassin', 'cyberdragon', 'dragon', 'oldgod', 'wolf'];
      if (GameState.unlockedPremiumCards) {
        premiumTargets.forEach(id => {
          if (!GameState.unlockedPremiumCards.includes(id)) {
            GameState.unlockedPremiumCards.push(id);
          }
        });
      }

      if (typeof saveDeck === 'function') saveDeck();
      if (typeof playSound === 'function' && SOUNDS) playSound(SOUNDS.seSkill);
      if (typeof showAlertModal === 'function') showAlertModal("デバッグモード：全カードを4枚所持状態にしました！");
      updateList();
    }
  };

  const updateList = () => {
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
  }, []);

  const handleTogglePremium = (e, templateId) => {
    e.stopPropagation();
    if (isTransitioning) return;
    playSound?.(SOUNDS?.seClick);
    togglePremiumCard?.(templateId);
    updateList();
  };

  return (
    <div id="screen-card-list" className="screen active" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', overflowY: 'auto' }}>
      <h2 onClick={handleTitleClick} style={{ color: '#facc15', marginBottom: '5px', fontSize: '1.2rem', cursor: 'pointer', userSelect: 'none' }}>カード一覧</h2>
      <div id="card-list-count" style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}>
        カード枚数: {ownedKindCount} / {masterCards.length}
      </div>

      <div className="card-list-container">
        <div id="gallery-card-grid" className="card-list-grid-3col">
          {masterCards.map((template) => {
            const ownedCount = inventory[template.id] || 0;
            const isOwned = ownedCount > 0;
            const opacity = isOwned ? '1' : '0.4';
            const rarityClass = template.rarity ? ` rarity-${template.rarity}` : '';
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
                  <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')`, filter }}></div>
                  
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
                        cursor: 'pointer'
                      }}
                    >
                      ✨
                    </div>
                  )}

                  <div className="card-power" style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}>
                    {template.power}
                  </div>

                  {/* 既存のスキルバッジ描画ロジックをdangerouslySetInnerHTMLで流用 */}
                  {window.renderSkillTag && (
                    <div dangerouslySetInnerHTML={{ __html: window.renderSkillTag(template) }}></div>
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
                      border: '1px solid #facc15'
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

      <button
        className="btn"
        style={{ marginTop: '15px', background: '#475569' }}
        onClick={() => switchScreen?.('screen-gallery-menu')}
      >
        戻る
      </button>
    </div>
  );
}

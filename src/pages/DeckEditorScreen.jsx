import React, { useState, useEffect } from 'react';

import { CARD_MASTER } from '../utils/constants/cards.js';
import { DECK_SIZE } from '../utils/constants/config.js';
import { playSound, getCardImgUrl, togglePremiumCard } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { prepareBattle } from '../hooks/battle.js';
import { getInitialDeck, loadDeck, saveDeck, setRenderDeckEditHook, clearDeck, resetDeck } from '../hooks/deck.js';
import { GameState } from '../hooks/gameState.js';
import { openCardPreview } from '../hooks/uiGallery.js';
import { goBackFromDeckEdit } from '../hooks/uiMainCore.js';
import { showConfirmModal, showAlertModal } from '../hooks/uiModals.js';
import { showPlaymatModal } from '../hooks/uiPlaymat.js';

export default function DeckEditorScreen() {
  const [deckSelection, setDeckSelection] = useState([]);
  const [inventory, setInventory] = useState({});
  const [masterCards, setMasterCards] = useState([]);
  const [localPremiumCards, setPremiumCards] = useState([]);
  const [unlockedPremium, setUnlockedPremium] = useState([]);
  const [isDefenseConfig, setIsDefenseConfig] = useState(false);

  const updateDeckEditor = () => {
    setDeckSelection([...(GameState.playerDeckSelection || [])]);

    if (GameState.gameMode === 'battle_dungeon') {
      const dInv = {};
      (GameState.dungeonCards || []).forEach(id => { dInv[id] = (dInv[id] || 0) + 1; });
      setInventory(dInv);
      const validIds = Object.keys(dInv);
      setMasterCards((CARD_MASTER || []).filter(c => validIds.includes(c.id)));
    } else {
      setInventory(GameState.playerInventory || {});
      setMasterCards((CARD_MASTER || []).filter(c => !c.isToken));
    }

    setIsDefenseConfig(GameState.gameMode === 'defense_register');
  };

  useEffect(() => {
    if (typeof loadDeck === 'function') {
      loadDeck();
    }
    updateDeckEditor();
    // 既存の再描画関数をフック
    setRenderDeckEditHook(updateDeckEditor);
  }, []);

  // 変更をグローバルに反映する
  const syncToGlobal = (newSelection) => {
    GameState.playerDeckSelection = newSelection;
    setDeckSelection(newSelection);
  };

  const addCard = (template) => {
    if (deckSelection.length >= DECK_SIZE) return;
    const inDeckCount = deckSelection.filter(c => c.id === template.id).length;
    const ownedCount = inventory[template.id] || 0;

    // 所持数限界、またはルールとして4枚上限（UIメッセージは別途だがロジックとしては防ぐ）
    if (inDeckCount >= ownedCount || inDeckCount >= 4) {
      if (inDeckCount >= 4 && showAlertModal) {
        showAlertModal('デッキに同じカードは4枚まで入れられます。');
      }
      return;
    }

    playSound?.(SOUNDS?.seClick);
    syncToGlobal([...deckSelection, { ...template }]);
  };

  const removeCard = (cardId) => {
    const index = deckSelection.findIndex(c => c.id === cardId);
    if (index !== -1) {
      const newSelection = [...deckSelection];
      newSelection.splice(index, 1);
      playSound?.(SOUNDS?.seClick);
      syncToGlobal(newSelection);
    }
  };

  // --- 長押しプレビュー用ロジック ---
  const holdTimerRef = React.useRef(null);
  const hasLongPressedRef = React.useRef(false);

  const handlePointerDown = (card) => {
    // 左クリックのみ長押しの開始とする
    hasLongPressedRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      hasLongPressedRef.current = true;
      playSound?.(SOUNDS?.seClick);
      openCardPreview?.(card);
      holdTimerRef.current = null;
    }, 500);
  };

  const cancelLongPress = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleClick = (card, clickAction) => {
    if (hasLongPressedRef.current) return;
    clickAction(card);
  };
  // ---------------------------------

  const handleFinish = () => {
    if (deckSelection.length !== DECK_SIZE) {
      playSound?.(SOUNDS?.seClick);
      showAlertModal?.(`デッキを${DECK_SIZE}枚にしてください！`);
      return;
    }

    playSound?.(SOUNDS?.seClick);
    // グローバルなsaveDeckを呼び出し
    if (typeof saveDeck === 'function') {
      saveDeck();
    }

    if (isDefenseConfig) {
      if (window.showPlayerNameModalState) {
        window.showPlayerNameModalState();
      } else {
        const modal = document.getElementById('modal-player-name');
        if (modal) {
          modal.style.display = 'flex';
          const nameInput = document.getElementById('input-player-name');
          if (nameInput) {
            const savedName = localStorage.getItem('mini_card_battle_player_name');
            if (savedName) nameInput.value = savedName;
          }
        }
      }
    } else {
      GameState.appState = 'battle';
      if (typeof prepareBattle === 'function') {
        prepareBattle();
      }
    }
  };

  const clearDeck = () => {
    playSound?.(SOUNDS?.seClick);
    showConfirmModal?.("デッキのカードをすべて削除しますか？", () => {
      syncToGlobal([]);
    });
  };

  const resetDeck = () => {
    playSound?.(SOUNDS?.seClick);
    showConfirmModal?.("デッキを初期状態に戻しますか？", () => {
      if (GameState.gameMode === 'battle_dungeon') {
        const initial = (GameState.dungeonCards || []).slice(0, 20).map(id => ({ ...CARD_MASTER.find(c => c.id === id) })).filter(Boolean);
        syncToGlobal(initial);
      } else {
        const initial = getInitialDeck ? getInitialDeck(GameState.playerConfig?.id) : [];
        syncToGlobal([...initial]);
      }
    });
  };

  const handleTogglePremium = (e, cardId) => {
    e.stopPropagation();
    playSound?.(SOUNDS?.seClick);
    togglePremiumCard?.(cardId);
    updateDeckEditor();
  };

  // デッキ内のカードをIDでグループ化してカウント
  const groupedDeck = {};
  deckSelection.forEach(card => {
    if (!groupedDeck[card.id]) groupedDeck[card.id] = { card, count: 0 };
    groupedDeck[card.id].count++;
  });

  return (
    <div id="screen-deck-edit" className="screen active">
      <h2 style={{ color: '#facc15', marginBottom: '20px' }}>
        {isDefenseConfig ? '防衛デッキ構築' : 'デッキ構築'}
      </h2>
      <div id="deck-count-display" style={{ fontSize: '1rem', marginBottom: '15px', color: '#cbd5e1' }}>
        カード枚数: {deckSelection.length} / {DECK_SIZE}
      </div>

      <button
        className="btn-circle btn-accessory"
        style={{ position: 'absolute', top: '15px', right: '15px', width: '45px', height: '45px', fontSize: '1.5rem', background: '#334155', border: '2px solid #475569', borderRadius: '50%', cursor: 'pointer', zIndex: 10 }}
        onClick={() => showPlaymatModal?.()}
      >
        🖼️
      </button>

      <div className="deck-edit-container">
        {/* 現在のデッキ */}
        <div className="deck-section">
          <div className="deck-section-title">現在のデッキ（タップで削除）</div>
          <div id="deck-current-list" className="deck-list-horizontal">
            {Object.keys(groupedDeck).map((id) => {
              const { card, count } = groupedDeck[id];
              const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
              const imgUrl = getCardImgUrl ? getCardImgUrl(card) : '';
              const isPremUnlocked = unlockedPremium.includes(card.id);
              const isPremActive = GameState.premiumCards.includes(card.id);

              return (
                <div key={card.id} className="deck-card-item"
                  onPointerDown={(e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; handlePointerDown(card); }}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => handleClick(id, removeCard)}>
                  <div className={`card blue${rarityClass}`} style={{ width: '80px', height: '120px', position: 'relative', display: 'block' }}>
                    <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')`, filter: card.filter || 'none' }}></div>

                    {isPremUnlocked && (
                      <div
                        className="premium-toggle-icon"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => handleTogglePremium(e, card.id)}
                        style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.85)', color: isPremActive ? '#d946ef' : '#94a3b8', padding: '2px 6px', borderRadius: '10px', fontSize: '0.8rem', zIndex: 7, border: `1px solid ${isPremActive ? '#d946ef' : '#475569'}`, cursor: 'pointer' }}
                      >
                        ✨
                      </div>
                    )}

                    <div className="card-power" style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}>{card.power}</div>

                    {window.renderSkillTag && <div dangerouslySetInnerHTML={{ __html: window.renderSkillTag(card) }}></div>}

                    <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.85)', color: '#facc15', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.75rem', zIndex: 6, border: '1px solid #facc15' }}>
                      x{count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 所持カードマスターリスト */}
        <div className="deck-section">
          <div className="deck-section-title">所持カード（タップで追加）</div>
          <div id="deck-master-list" className="deck-list-horizontal">
            {masterCards.map(template => {
              const ownedCount = inventory[template.id] || 0;
              if (ownedCount === 0) return null; // 未所持は表示しない、もしくは表示するならグレーアウト（オリジナル仕様に合わせる）

              const inDeckCount = deckSelection.filter(c => c.id === template.id).length;
              const remaining = ownedCount - inDeckCount;
              const canAdd = remaining > 0 && inDeckCount < 4;

              const opacity = !canAdd ? '0.4' : '1';
              const rarityClass = template.rarity ? ` rarity-${template.rarity}` : '';
              const imgUrl = getCardImgUrl ? getCardImgUrl(template) : '';
              const isPremUnlocked = unlockedPremium.includes(template.id);
              const isPremActive = GameState.premiumCards.includes(template.id);

              return (
                <div key={template.id} className="deck-card-item"
                  onPointerDown={(e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; handlePointerDown(template); }}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => handleClick(template, addCard)}>
                  <div className={`card blue${rarityClass}`} style={{ width: '80px', height: '120px', position: 'relative', display: 'block', opacity }}>
                    <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')`, filter: template.filter || 'none' }}></div>

                    {isPremUnlocked && (
                      <div
                        className="premium-toggle-icon"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => handleTogglePremium(e, template.id)}
                        style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.85)', color: isPremActive ? '#d946ef' : '#94a3b8', padding: '2px 6px', borderRadius: '10px', fontSize: '0.8rem', zIndex: 7, border: `1px solid ${isPremActive ? '#d946ef' : '#475569'}`, cursor: 'pointer' }}
                      >
                        ✨
                      </div>
                    )}

                    <div className="card-power" style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}>{template.power}</div>

                    {window.renderSkillTag && <div dangerouslySetInnerHTML={{ __html: window.renderSkillTag(template) }}></div>}

                    <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.85)', color: canAdd ? '#facc15' : '#ef4444', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.75rem', zIndex: 6, border: `1px solid ${canAdd ? '#facc15' : '#ef4444'}` }}>
                      {inDeckCount}/{ownedCount}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="deck-controls">
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '10px' }}>
            <button className="action-btn" style={{ background: '#1e40af', fontSize: '0.75rem', padding: '5px 10px' }} onClick={resetDeck}>初期デッキに戻す</button>
            <button className="action-btn" style={{ background: '#7f1d1d', fontSize: '0.75rem', padding: '5px 10px' }} onClick={clearDeck}>全削除</button>
          </div>
        </div>

        <button
          id="btn-finish-deck"
          className="btn"
          style={{ marginTop: '10px', width: '100%', opacity: deckSelection.length === DECK_SIZE ? 1 : 0.5 }}
          onClick={handleFinish}
        >
          {isDefenseConfig ? '編成完了' : 'バトル開始！'}
        </button>
      </div>

      <button className="btn" style={{ background: '#475569', marginTop: '20px' }} onClick={() => goBackFromDeckEdit?.()}>
        戻る
      </button>
    </div>
  );
}

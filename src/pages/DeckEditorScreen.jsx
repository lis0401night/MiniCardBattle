import React, { useState, useEffect } from 'react';

import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { DECK_SIZE } from '../utils/constants/config.js';
import { playSound, getCardImgUrl, togglePremiumCard } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { prepareBattle } from '../hooks/battle.js';
import { getInitialDeck, loadDeck, saveDeck, setRenderDeckEditHook, clearDeck, resetDeck } from '../hooks/deck.js';
import { GameState } from '../hooks/gameState.js';
import { openCardPreview } from '../hooks/uiGallery.js';
import { goBackFromDeckEdit, showOnlineLobby } from '../hooks/uiMainCore.js';
import { showConfirmModal, showAlertModal } from '../hooks/uiModals.js';
import { showPlaymatModal } from '../hooks/uiPlaymat.js';

export default function DeckEditorScreen() {
  const [deckSelection, setDeckSelection] = useState([]);
  const [inventory, setInventory] = useState({});
  const [masterCards, setMasterCards] = useState([]);
  const [localPremiumCards, setPremiumCards] = useState([]);
  const [unlockedPremium, setUnlockedPremium] = useState([]);
  const [isDefenseConfig, setIsDefenseConfig] = useState(false);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [tempDeckName, setTempDeckName] = useState("");

  const deck = GameState.decks?.[GameState.currentDeckIndex] || {};
  const leaderId = deck.leaderId || GameState.playerConfig?.id || 'android';

  const updateDeckEditor = () => {
    setDeckSelection([...(GameState.playerDeckSelection || [])]);
    
    const currentDeck = GameState.decks?.[GameState.currentDeckIndex] || {};
    setDeckName(currentDeck.name || `デッキ${(GameState.currentDeckIndex || 0) + 1}`);

    setUnlockedPremium(GameState.unlockedPremiumCards || []);

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

    if (isDefenseConfig || GameState.gameMode === 'online_deck_edit') {
      GameState.appState = 'select_stage';
      if (typeof window.initStageSelectScreen === 'function') window.initStageSelectScreen();
      if (typeof window.switchScreen === 'function') window.switchScreen('screen-stage-select');
    } else if (GameState.gameMode === 'create_deck' || GameState.gameMode === 'free_deck_edit') {
        if (typeof goBackFromDeckEdit === 'function') goBackFromDeckEdit();
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
    togglePremiumCard?.(cardId, false);
    updateDeckEditor();
  };

  const handleSaveDeckName = () => {
    setIsEditingName(false);
    setDeckName(tempDeckName);
    if (GameState.decks && GameState.decks[GameState.currentDeckIndex]) {
        GameState.decks[GameState.currentDeckIndex].name = tempDeckName;
        if (typeof saveDeck === 'function') saveDeck();
    }
  };

  // デッキ内のカードをIDでグループ化してカウント
  const groupedDeck = {};
  deckSelection.forEach(card => {
    if (!groupedDeck[card.id]) groupedDeck[card.id] = { card, count: 0 };
    groupedDeck[card.id].count++;
  });

  const getBackgroundImage = () => {
    if (GameState.gameMode === 'event_satan') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`;
    } else if (GameState.gameMode === 'defense_register' || GameState.gameMode === 'defense_attack') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_defense.png')`;
    } else if (GameState.gameMode === 'battle_dungeon') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_challenge.png')`;
    } else if (GameState.gameMode && GameState.gameMode.startsWith('story')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_story01.png')`;
    }
    return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_select.png')`;
  };

  return (
    <div id="screen-deck-edit" className="screen active" style={{
        backgroundImage: getBackgroundImage(),
        backgroundSize: 'cover',
        backgroundPosition: 'center'
    }}>
      {/* 上部ヘッダー（タイトルとデッキ名）と右上のアイコン群 */}
      <div style={{ position: 'relative', width: '100%', padding: '15px 15px 5px', boxSizing: 'border-box', minHeight: '60px' }}>
          
          {/* 中央揃えのタイトル・デッキ名 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 40px' }}>
              {(isDefenseConfig || GameState.gameMode === 'battle_dungeon') ? (
                  <h2 style={{ color: '#facc15', margin: 0, fontSize: '1.3rem', textAlign: 'center' }}>
                    {isDefenseConfig ? '防衛デッキ構築' : 'デッキ構築'}
                  </h2>
              ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%' }}>
                          <h2 
                              onClick={() => { playSound?.(SOUNDS?.seClick); setTempDeckName(deckName); setIsEditingName(true); }} 
                              style={{ color: '#facc15', margin: 0, fontSize: '1.3rem', textShadow: '1px 1px 2px #000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', textAlign: 'center' }}
                              title="クリックして名前を編集"
                          >
                              {deckName}
                          </h2>
                      </div>
                  </div>
              )}
          </div>
          
          {/* デッキ名変更モーダル */}
          {isEditingName && (
             <div style={{
                 position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                 backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 9999,
                 display: 'flex', justifyContent: 'center', alignItems: 'center'
             }} onClick={() => setIsEditingName(false)}>
                 <div style={{
                     background: '#1e293b', border: '2px solid #facc15', borderRadius: '12px',
                     padding: '20px', width: '80%', maxWidth: '350px',
                     boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
                     display: 'flex', flexDirection: 'column', gap: '15px'
                 }} onClick={e => e.stopPropagation()}>
                     <h3 style={{ margin: 0, color: '#facc15', textAlign: 'center', fontSize: '1.2rem' }}>デッキ名の変更</h3>
                     <input 
                         type="text" 
                         value={tempDeckName}
                         onChange={(e) => setTempDeckName(e.target.value)}
                         onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDeckName(); }}
                         autoFocus
                         maxLength="12"
                         style={{ 
                             background: '#334155', color: '#fff', border: '1px solid #475569', 
                             borderRadius: '8px', padding: '10px', fontSize: '1.2rem', 
                             width: '100%', boxSizing: 'border-box', textAlign: 'center' 
                         }}
                     />
                     <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px' }}>
                         <button className="btn" style={{ background: '#64748b', margin: 0, padding: '8px', flex: 1, minWidth: '100px', whiteSpace: 'nowrap', fontSize: '1rem' }} onClick={() => setIsEditingName(false)}>キャンセル</button>
                         <button className="btn" style={{ background: '#3b82f6', margin: 0, padding: '8px', flex: 1, minWidth: '100px', whiteSpace: 'nowrap', fontSize: '1rem' }} onClick={handleSaveDeckName}>決定</button>
                     </div>
                 </div>
             </div>
          )}

          {/* 画面右上のアイコン群 (リーダーアイコン + プレイマット) */}
          <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px', zIndex: 10 }}>
            {/* リーダーアイコン（スキン変更） */}
            {leaderId && leaderId !== 'player' && leaderId !== 'unknown' && leaderId !== 'npc' && (
                <div style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => { 
                    playSound?.(SOUNDS?.seClick);
                    if (window.showCharDetailModal) {
                        const charObj = CHARACTERS[leaderId];
                        if (charObj) window.showCharDetailModal({ ...charObj, hideDecideButton: true, targetDeckIndex: GameState.currentDeckIndex });
                    }
                }}>
                    <img 
                        src={getSkinImage && CHARACTERS[leaderId] ? getSkinImage(CHARACTERS[leaderId], deck?.playerSkins?.[leaderId] || 'default', 'icon') : ''} 
                        alt="Leader" 
                        style={{ width: '38px', height: '38px', borderRadius: '50%', border: '2px solid #facc15', objectFit: 'cover' }}
                    />
                </div>
            )}

            {/* プレイマット設定ボタン */}
            <button
              className="btn-circle btn-accessory"
              style={{ width: '38px', height: '38px', fontSize: '1.2rem', background: '#334155', border: '2px solid #475569', borderRadius: '50%', cursor: 'pointer', margin: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => { if (typeof showPlaymatModal === 'function') showPlaymatModal(); }}
            >
              🖼️
            </button>
          </div>
      </div>


      <div className="deck-edit-container">
        {/* 現在のデッキ */}
        <div className="deck-section">
          <div className="deck-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '10px' }}>
              <span>現在のデッキ（タップで削除）</span>
              <span style={{ color: deckSelection.length < DECK_SIZE ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{deckSelection.length} / {DECK_SIZE}</span>
          </div>
          <div id="deck-current-list" className="deck-list-horizontal">
            {Object.keys(groupedDeck).map((id) => {
              const { card, count } = groupedDeck[id];
              const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
              const imgUrl = getCardImgUrl ? getCardImgUrl(card) : '';
              const isPremUnlocked = unlockedPremium.includes(card.id);
              const isPremActive = GameState.premiumCards.includes(card.id);

              return (
                <div key={card.id} className="deck-card-item"
                  style={{ width: '100px', height: '150px', flexShrink: 0 }}
                  onPointerDown={(e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; handlePointerDown(card); }}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => handleClick(id, removeCard)}>
                  <div className={`card blue${rarityClass}`} style={{ width: '100px', height: '150px', position: 'relative', display: 'block', overflow: 'hidden', padding: 0 }}>
                    <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')`, filter: card.filter || 'none', backgroundSize: 'cover', backgroundPosition: 'center', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, borderRadius: 'inherit' }}></div>

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
                  style={{ width: '100px', height: '150px', flexShrink: 0 }}
                  onPointerDown={(e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; handlePointerDown(template); }}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => handleClick(template, addCard)}>
                  <div className={`card blue${rarityClass}`} style={{ width: '100px', height: '150px', position: 'relative', display: 'block', opacity, overflow: 'hidden', padding: 0 }}>
                    <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')`, filter: template.filter || 'none', backgroundSize: 'cover', backgroundPosition: 'center', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, borderRadius: 'inherit' }}></div>

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

        <button
          id="btn-finish-deck"
          className="btn"
          style={{ marginTop: '10px', width: '100%', opacity: deckSelection.length === DECK_SIZE ? 1 : 0.5 }}
          onClick={handleFinish}
        >
          {isDefenseConfig || GameState.gameMode === 'create_deck' || GameState.gameMode === 'free_deck_edit' || GameState.gameMode === 'online_deck_edit' ? '編成完了' : 'バトル開始！'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', marginBottom: '20px', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
          {/* 左下：全削除ボタン */}
          <button className="action-btn" style={{ background: '#7f1d1d', fontSize: '0.8rem', padding: '8px 15px', margin: 0, flexShrink: 0 }} onClick={clearDeck}>
            全削除
          </button>

          {/* 中央：戻るボタン */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <button 
               className="btn" 
               style={{ background: '#475569', margin: 0 }} 
               onClick={() => {
                 playSound?.(SOUNDS?.seClick);
                 if (typeof loadDeck === 'function') loadDeck(); // 一時編集データをリセット
                 if (typeof goBackFromDeckEdit === 'function') goBackFromDeckEdit();
               }}
            >
              戻る
            </button>
          </div>
          
          {/* スペーサー：右側のバランス取り */}
          <div style={{ width: '60px', flexShrink: 0 }}></div>
      </div>
    </div>
  );
}

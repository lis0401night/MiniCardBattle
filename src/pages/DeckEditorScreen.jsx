import React, { useState, useEffect } from 'react';

import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { DECK_SIZE } from '../utils/constants/config.js';
import { SKILLS } from '../utils/constants/skills.js';
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
  const [renderVersion, setRenderVersion] = useState(0);

  const [isEditingName, setIsEditingName] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [tempDeckName, setTempDeckName] = useState("");

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState({ rarity: [], power: [], skills: [] });
  const [tempFilters, setTempFilters] = useState({ rarity: [], power: [], skills: [] });
  const [isSkillAccordionOpen, setIsSkillAccordionOpen] = useState(false);

  const deck = GameState.decks?.[GameState.currentDeckIndex] || {};
  const leaderId = deck.leaderId || GameState.playerConfig?.id || 'android';

  const updateDeckEditor = () => {
    setRenderVersion(v => v + 1);
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
      if (typeof goBackFromDeckEdit === 'function') goBackFromDeckEdit(false);
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

  const toggleTempFilter = (type, val) => {
    playSound?.(SOUNDS?.seClick);
    setTempFilters(prev => {
      const arr = prev[type];
      return { ...prev, [type]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
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

  const availableRarities = Array.from(new Set(masterCards.map(c => c.rarity).filter(x => x !== undefined))).sort();
  const availablePowers = Array.from(new Set(masterCards.map(c => c.power).filter(x => x !== undefined))).sort((a, b) => a - b);
  const availableSkills = Array.from(new Set(masterCards.flatMap(c => {
    let s = [];
    if (c.skill && c.skill !== 'none') s.push(c.skill);
    if (c.skills) c.skills.forEach(sk => s.push(sk.id));
    if (c.choices) c.choices.forEach(ch => s.push(ch.id));
    if (c.choices2) c.choices2.forEach(ch => s.push(ch.id));
    return s;
  }))).filter(Boolean).sort();

  const filteredMasterCards = masterCards.filter(c => {
    if (filters.rarity.length > 0 && !filters.rarity.includes(c.rarity)) return false;
    if (filters.power.length > 0 && !filters.power.includes(c.power)) return false;
    if (filters.skills.length > 0) {
      let cardSkills = [];
      if (c.skill && c.skill !== 'none') cardSkills.push(c.skill);
      if (c.skills) c.skills.forEach(sk => cardSkills.push(sk.id));
      if (c.choices) c.choices.forEach(ch => cardSkills.push(ch.id));
      if (c.choices2) c.choices2.forEach(ch => cardSkills.push(ch.id));
      if (!filters.skills.some(sk => cardSkills.includes(sk))) return false;
    }
    return true;
  });

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
          <div className="deck-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '10px' }}>
            <span>所持カード（タップで追加）</span>
            <button className="btn" style={{ padding: '4px 8px', margin: 0, fontSize: '0.9rem', background: Object.values(filters).some(arr => arr.length > 0) ? 'rgba(250, 204, 21, 0.3)' : '#334155', border: Object.values(filters).some(arr => arr.length > 0) ? '1px solid #facc15' : '1px solid #475569', color: '#facc15' }} onClick={() => { setTempFilters({ ...filters }); setIsFilterModalOpen(true); playSound?.(SOUNDS?.seClick); }}>
              🔍
            </button>
          </div>
          <div id="deck-master-list" className="deck-list-horizontal">
            {filteredMasterCards.map(template => {
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
              if (typeof goBackFromDeckEdit === 'function') goBackFromDeckEdit(true);
            }}
          >
            戻る
          </button>
        </div>

        {/* スペーサー：右側のバランス取り */}
        <div style={{ width: '60px', flexShrink: 0 }}></div>
      </div>

      {/* フィルターダイアログ */}
      {isFilterModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 9999,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }} onClick={() => setIsFilterModalOpen(false)}>
          <div style={{
            background: '#1e293b', border: '2px solid #facc15', borderRadius: '12px',
            padding: '20px', width: '90%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
            display: 'flex', flexDirection: 'column', gap: '15px'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, color: '#facc15', textAlign: 'center', fontSize: '1.2rem' }}>フィルター</h3>

            {/* レアリティ */}
            <div>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '8px' }}>レアリティ</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {availableRarities.map(r => (
                  <div key={`r-${r}`} onClick={() => toggleTempFilter('rarity', r)} style={{
                    padding: '6px 12px', borderRadius: '20px', border: tempFilters.rarity.includes(r) ? '2px solid #facc15' : '2px solid #475569',
                    background: tempFilters.rarity.includes(r) ? 'rgba(250, 204, 21, 0.2)' : '#334155',
                    color: tempFilters.rarity.includes(r) ? '#facc15' : '#94a3b8', cursor: 'pointer', userSelect: 'none'
                  }}>★{r}</div>
                ))}
              </div>
            </div>

            {/* パワー */}
            <div>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '8px' }}>パワー</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {availablePowers.map(p => (
                  <div key={`p-${p}`} onClick={() => toggleTempFilter('power', p)} style={{
                    padding: '6px 12px', borderRadius: '20px', border: tempFilters.power.includes(p) ? '2px solid #facc15' : '2px solid #475569',
                    background: tempFilters.power.includes(p) ? 'rgba(250, 204, 21, 0.2)' : '#334155',
                    color: tempFilters.power.includes(p) ? '#facc15' : '#94a3b8', cursor: 'pointer', userSelect: 'none'
                  }}>P{p}</div>
                ))}
              </div>
            </div>

            {/* 能力 */}
            <div>
              <div onClick={() => { playSound?.(SOUNDS?.seClick); setIsSkillAccordionOpen(!isSkillAccordionOpen); }} style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', padding: '6px', backgroundColor: '#334155', borderRadius: '6px', border: tempFilters.skills.length > 0 ? '1px solid #facc15' : '1px solid transparent' }}>
                <span style={{ color: tempFilters.skills.length > 0 ? '#facc15' : '#94a3b8' }}>能力</span>
                <span>{isSkillAccordionOpen ? '▲' : '▼'}</span>
              </div>
              {isSkillAccordionOpen && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '180px', overflowY: 'auto', padding: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  {availableSkills.map(sk => {
                    const skillDef = SKILLS[sk] || { name: sk, icon: '' };
                    return (
                      <div key={sk} onClick={() => toggleTempFilter('skills', sk)} style={{
                        padding: '4px 8px', borderRadius: '4px', border: tempFilters.skills.includes(sk) ? '1px solid #facc15' : '1px solid #475569',
                        background: tempFilters.skills.includes(sk) ? 'rgba(250, 204, 21, 0.2)' : '#334155',
                        color: tempFilters.skills.includes(sk) ? '#facc15' : '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px'
                      }}>
                        <span>{skillDef.icon}</span>
                        <span>{skillDef.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px' }}>
              <button className="action-btn" style={{ background: '#7f1d1d', margin: 0, padding: '8px', flex: 1, minWidth: '80px', fontSize: '1rem', whiteSpace: 'nowrap' }} onClick={() => { playSound?.(SOUNDS?.seClick); setTempFilters({ rarity: [], power: [], skills: [] }); }}>リセット</button>
              <button className="btn" style={{ background: '#64748b', margin: 0, padding: '8px', flex: 1, minWidth: '80px', fontSize: '1rem', whiteSpace: 'nowrap' }} onClick={() => { playSound?.(SOUNDS?.seClick); setIsFilterModalOpen(false); }}>閉じる</button>
              <button className="btn" style={{ background: '#10b981', margin: 0, padding: '8px', flex: 1, minWidth: '80px', fontSize: '1rem', whiteSpace: 'nowrap' }} onClick={() => { playSound?.(SOUNDS?.seClick); setFilters({ ...tempFilters }); setIsFilterModalOpen(false); }}>適用</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

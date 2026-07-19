import React, { useEffect, useState, useMemo, useCallback } from 'react';

import { prepareBattle } from '../game/battle.js';
import { loadDeck, saveDeck, setRenderDeckEditHook } from '../services/deck.js';
import { openCardPreview } from '../services/uiGallery.js';
import { goBackFromDeckEdit } from '../services/uiMainCore.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { showPlaymatModal } from '../services/uiPlaymat.js';
import { GameState } from '../state/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { CHAR_FORTUNE_HANDICAPS } from '../utils/constants/fortuneHandicaps.js';
import {
  DECK_SIZE,
  MAX_CARD_COPIES,
  appendVersionQuery,
} from '../utils/constants/config.js';
import { SKILLS, SKILL_CATEGORIES } from '../utils/constants/skills.js';
import {
  getCardImgUrl,
  playSound,
  stopAllBGM,
  togglePremiumCard,
  getEventEnemyCharId,
  checkIsFortuneMode,
} from '../utils/gameUtils.js';
import { AUDIO_INSTANCES, SOUNDS } from '../utils/sounds.js';
import MenuButton from '../components/common/MenuButton.jsx';
import MissionListModal from '../components/battle/MissionListModal.jsx';

export default function DeckEditorScreen({ switchScreen }) {
  // 初期状態の計算ヘルパー（遅延初期化とupdateDeckEditorの両方で使用）
  const computeInventory = () => {
    if (GameState.gameMode === 'battle_dungeon') {
      const dInv = {};
      (GameState.dungeonCards || []).forEach((id) => {
        dInv[id] = (dInv[id] || 0) + 1;
      });
      return dInv;
    }
    return GameState.playerInventory || {};
  };

  const computeMasterCards = (inv) => {
    if (GameState.gameMode === 'battle_dungeon') {
      const validIds = Object.keys(inv);
      return (CARD_MASTER || []).filter((c) => validIds.includes(c.id));
    }
    return (CARD_MASTER || []).filter((c) => !c.isToken);
  };

  const computeDeckName = () => {
    const currentDeck = GameState.decks?.[GameState.currentDeckIndex] || {};
    return currentDeck.name || `デッキ${(GameState.currentDeckIndex || 0) + 1}`;
  };

  const [deckSelection, setDeckSelection] = useState(() => [
    ...(GameState.playerDeckSelection || []),
  ]);
  const [inventory, setInventory] = useState(computeInventory);
  const [masterCards, setMasterCards] = useState(() =>
    computeMasterCards(computeInventory())
  );
  const [unlockedPremium, setUnlockedPremium] = useState(
    () => GameState.unlockedPremiumCards || []
  );
  const [isDefenseConfig, setIsDefenseConfig] = useState(
    () => GameState.gameMode === 'defense_register'
  );
  const [showMissions, setShowMissions] = useState(false);

  // バトルボーナスはストーリー・フリー対戦でのみ機能する
  const showMissionButton =
    !!GameState.enemyConfig &&
    (GameState.gameMode === 'story' || GameState.gameMode === 'free');
  const [, setRenderVersion] = useState(0);

  const [isEditingName, setIsEditingName] = useState(false);
  const [deckName, setDeckName] = useState(computeDeckName);
  const [tempDeckName, setTempDeckName] = useState('');

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

  const deck = GameState.decks?.[GameState.currentDeckIndex] || {};
  // battle_dungeon中はデッキ自体にleaderIdが保存されないため、
  // プレイヤーの現在の設定（playerConfig）からリーダーを取得する
  const leaderId =
    GameState.gameMode === 'battle_dungeon'
      ? GameState.playerConfig?.id || 'android'
      : deck.leaderId || GameState.playerConfig?.id || 'android';

  // グローバルからの再描画用コールバック（外部からsetRenderDeckEditHook経由で呼ばれる）
  const updateDeckEditor = React.useCallback(() => {
    setRenderVersion((v) => v + 1);
    setDeckSelection([...(GameState.playerDeckSelection || [])]);

    const currentDeck = GameState.decks?.[GameState.currentDeckIndex] || {};
    setDeckName(
      currentDeck.name || `デッキ${(GameState.currentDeckIndex || 0) + 1}`
    );

    setUnlockedPremium(GameState.unlockedPremiumCards || []);

    if (GameState.gameMode === 'battle_dungeon') {
      const dInv = {};
      (GameState.dungeonCards || []).forEach((id) => {
        dInv[id] = (dInv[id] || 0) + 1;
      });
      setInventory(dInv);
      const validIds = Object.keys(dInv);
      setMasterCards(
        (CARD_MASTER || []).filter((c) => validIds.includes(c.id))
      );
    } else {
      setInventory(GameState.playerInventory || {});
      setMasterCards((CARD_MASTER || []).filter((c) => !c.isToken));
    }

    setIsDefenseConfig(GameState.gameMode === 'defense_register');
  }, []);

  useEffect(() => {
    if (typeof loadDeck === 'function') {
      loadDeck();
    }
    // 既存の再描画関数をフック
    setRenderDeckEditHook(updateDeckEditor);
  }, [updateDeckEditor]);

  // 変更をグローバルに反映する
  const syncToGlobal = (newSelection) => {
    Object.assign(GameState, { playerDeckSelection: newSelection });
    setDeckSelection(newSelection);
  };

  const isFortuneMode = checkIsFortuneMode(GameState.gameMode);

  const activeBannedSkillIds = useMemo(() => {
    if (!isFortuneMode || !GameState.fortuneHandicaps) return [];

    const enemyCharId = getEventEnemyCharId(GameState.gameMode);
    const handicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];

    return handicapsList
      .filter((h) => h.type === 'ban_skill' && GameState.fortuneHandicaps[h.id])
      .map((rule) => rule.skillId);
  }, [isFortuneMode]);

  const isCardBannedByFortune = useCallback(
    (template) => {
      if (activeBannedSkillIds.length === 0) return false;

      const hasSkillLocal = (c, skillId) => {
        const inSkills = (c.skills || []).some((s) => s.id === skillId);
        if (inSkills) return true;
        const inChoices = (c.choices || []).some((s) => s.id === skillId);
        if (inChoices) return true;
        const inChoices2 = (c.choices2 || []).some((s) => s.id === skillId);
        if (inChoices2) return true;
        return false;
      };

      return activeBannedSkillIds.some((skillId) =>
        hasSkillLocal(template, skillId)
      );
    },
    [activeBannedSkillIds]
  );

  const addCard = (template) => {
    if (isCardBannedByFortune(template)) {
      if (showAlertModal) {
        showAlertModal('特級目標で使用禁止のカードは追加できません。');
      }
      return;
    }
    if (deckSelection.length >= DECK_SIZE) return;
    const inDeckCount = deckSelection.filter(
      (c) => c.id === template.id
    ).length;
    const ownedCount = inventory[template.id] || 0;

    // 所持数限界、またはルールとして最大編成枚数上限（UIメッセージは別途だがロジックとしては防ぐ）
    if (inDeckCount >= ownedCount || inDeckCount >= MAX_CARD_COPIES) {
      if (inDeckCount >= MAX_CARD_COPIES && showAlertModal) {
        showAlertModal(
          `デッキに同じカードは${MAX_CARD_COPIES}枚まで入れられます。`
        );
      }
      return;
    }

    playSound?.(SOUNDS?.seClick);
    syncToGlobal([...deckSelection, { ...template }]);
  };

  const removeCard = (cardId) => {
    const index = deckSelection.findIndex((c) => c.id === cardId);
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

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

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
      showAlertModal?.(`デッキを${DECK_SIZE}枚にしてください！`);
      return;
    }

    const hasBannedCard = deckSelection.some((c) => isCardBannedByFortune(c));
    if (hasBannedCard) {
      showAlertModal?.('特級目標で使用禁止のカードがデッキに含まれています！');
      return;
    }

    // グローバルなsaveDeckを呼び出し
    if (typeof saveDeck === 'function') {
      saveDeck();
    }

    if (isDefenseConfig || GameState.gameMode === 'online_deck_edit') {
      GameState.appState = 'select_stage';
      if (typeof window.initStageSelectScreen === 'function')
        window.initStageSelectScreen();
      if (typeof switchScreen === 'function')
        switchScreen('screen-stage-select');
    } else if (
      GameState.gameMode === 'create_deck' ||
      GameState.gameMode === 'free_deck_edit' ||
      GameState.gameMode === 'tournament'
    ) {
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
    showConfirmModal?.('デッキのカードをすべて削除しますか？', () => {
      syncToGlobal([]);
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

  // デッキ内のカードをIDでグループ化してカウント
  const groupedDeck = {};
  deckSelection.forEach((card) => {
    if (!groupedDeck[card.id]) groupedDeck[card.id] = { card, count: 0 };
    groupedDeck[card.id].count++;
  });

  const getBackgroundImage = () => {
    // 新規デッキ作成中はgameModeが'create_deck'になるため、元のモードを参照する
    const mode =
      GameState.gameMode === 'create_deck'
        ? GameState.prevGameModeForCreate || 'free_deck_edit'
        : GameState.gameMode;

    if (mode === 'tournament') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_tournament01.webp')}')`;
    } else if (mode?.startsWith('event_') && mode?.endsWith('_high')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_highdifficulty.webp')}')`;
    } else if (mode?.startsWith('event_') && mode?.endsWith('_fortune')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_fortune01.webp')}')`;
    } else if (mode === 'defense_register' || mode === 'defense_attack') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_defense.webp')}')`;
    } else if (mode === 'battle_dungeon') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_challenge.webp')}')`;
    } else if (mode === 'online_deck_edit') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_online.webp')}')`;
    } else if (mode && mode.startsWith('story')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_story01.webp')}')`;
    }
    return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_select.webp')}')`;
  };

  // idベースで重複排除を行う
  const allCardsForFilters = [];
  const seenIds = new Set();
  [...masterCards, ...(deckSelection || [])].forEach((c) => {
    if (c && c.id && !seenIds.has(c.id)) {
      seenIds.add(c.id);
      allCardsForFilters.push(c);
    }
  });

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
    <div
      id="screen-deck-edit"
      className="screen active"
      style={{
        backgroundImage: getBackgroundImage(),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* 上部ヘッダー（タイトルとデッキ名）と右上のアイコン群 */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          padding: '15px 15px 5px',
          boxSizing: 'border-box',
          minHeight: '60px',
        }}
      >
        {/* 中央揃えのタイトル・デッキ名 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 40px',
          }}
        >
          {isDefenseConfig || GameState.gameMode === 'battle_dungeon' ? (
            <h2
              style={{
                color: '#facc15',
                margin: 0,
                fontSize: '1.3rem',
                textAlign: 'center',
              }}
            >
              {isDefenseConfig ? '防衛デッキ構築' : 'デッキ構築'}
            </h2>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  maxWidth: '100%',
                }}
              >
                <h2
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    setTempDeckName(deckName);
                    setIsEditingName(true);
                  }}
                  style={{
                    color: '#facc15',
                    margin: 0,
                    fontSize: '1.3rem',
                    textShadow: '1px 1px 2px #000',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
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
            onClick={() => setIsEditingName(false)}
          >
            <div
              style={{
                background: '#1e293b',
                border: '2px solid #facc15',
                borderRadius: '12px',
                padding: '20px',
                width: '80%',
                maxWidth: '350px',
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
                デッキ名の変更
              </h3>
              <input
                type="text"
                value={tempDeckName}
                onChange={(e) => setTempDeckName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveDeckName();
                }}
                autoFocus
                maxLength="12"
                style={{
                  background: '#334155',
                  color: '#fff',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '1.2rem',
                  width: '100%',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: '15px',
                  justifyContent: 'center',
                  marginTop: '10px',
                }}
              >
                <button
                  className="btn"
                  style={{
                    background: '#64748b',
                    margin: 0,
                    padding: '8px',
                    flex: 1,
                    minWidth: '100px',
                    whiteSpace: 'nowrap',
                    fontSize: '1rem',
                  }}
                  onClick={() => setIsEditingName(false)}
                >
                  キャンセル
                </button>
                <button
                  className="btn"
                  style={{
                    background: '#3b82f6',
                    margin: 0,
                    padding: '8px',
                    flex: 1,
                    minWidth: '100px',
                    whiteSpace: 'nowrap',
                    fontSize: '1rem',
                  }}
                  onClick={handleSaveDeckName}
                >
                  決定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 画面右上のアイコン群 (リーダーアイコン + プレイマット) */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            display: 'flex',
            gap: '6px',
            zIndex: 10,
          }}
        >
          {/* リーダーアイコン（スキン変更） */}
          {leaderId &&
            leaderId !== 'player' &&
            leaderId !== 'unknown' &&
            leaderId !== 'npc' &&
            CHARACTERS[leaderId] && (
              <div
                className="banner-icon-wrapper"
                style={{
                  width: '38px',
                  height: '38px',
                  marginRight: 0 /* DeckEditorでは右マージン不要のため0にリセット */,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  if (window.showCharDetailModal) {
                    const charObj = CHARACTERS[leaderId];
                    if (charObj)
                      window.showCharDetailModal({
                        ...charObj,
                        hideDecideButton: true,
                        targetDeckIndex: GameState.currentDeckIndex,
                      });
                  }
                }}
              >
                <img
                  src={
                    (getSkinImage && CHARACTERS[leaderId]
                      ? getSkinImage(
                          CHARACTERS[leaderId],
                          deck?.playerSkins?.[leaderId] || 'default',
                          'icon'
                        )
                      : undefined) || undefined
                  }
                  className="banner-icon"
                  alt="Leader"
                />
                <img
                  src={`assets/icons/iconframe_${['satan', 'void', 'succubus', 'warlock'].includes(leaderId) ? 'red' : 'gold'}.webp`}
                  className="banner-icon-frame"
                  alt="frame"
                />
              </div>
            )}

          {/* プレイマット設定ボタン */}
          <button
            className="btn-circle btn-accessory"
            style={{
              width: '38px',
              height: '38px',
              fontSize: '1.2rem',
              background: '#334155',
              border: '2px solid #475569',
              borderRadius: '50%',
              cursor: 'pointer',
              margin: 0,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => {
              if (typeof showPlaymatModal === 'function') showPlaymatModal();
            }}
          >
            🖼️
          </button>
        </div>
      </div>

      <div className="deck-edit-container">
        {/* 現在のデッキ */}
        <div className="deck-section">
          <div
            className="deck-section-title"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingRight: '10px',
            }}
          >
            <span>現在のデッキ（タップで削除）</span>
            <span
              style={{
                color: deckSelection.length < DECK_SIZE ? '#ef4444' : '#10b981',
                fontWeight: 'bold',
              }}
            >
              {deckSelection.length} / {DECK_SIZE}
            </span>
          </div>
          <div id="deck-current-list" className="deck-list-horizontal">
            {Object.keys(groupedDeck).map((id) => {
              const { card, count } = groupedDeck[id];
              const isBanned = isCardBannedByFortune(card);
              const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
              const imgUrl = getCardImgUrl ? getCardImgUrl(card, true) : '';
              const isPremUnlocked = unlockedPremium.includes(card.id);
              const isPremActive = (GameState.premiumCards || []).includes(
                card.id
              );

              return (
                <div
                  key={card.id}
                  className="deck-card-item"
                  style={{ width: '100px', height: '150px', flexShrink: 0 }}
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    handlePointerDown(card);
                  }}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => handleClick(id, removeCard)}
                >
                  <div
                    className={`card blue${rarityClass}`}
                    style={{
                      width: '100px',
                      height: '150px',
                      position: 'relative',
                      display: 'block',
                      overflow: 'hidden',
                      padding: 0,
                      opacity: isBanned ? '0.4' : '1',
                      border: isBanned ? '3px solid #ef4444' : undefined,
                      boxShadow: isBanned ? '0 0 10px #ef4444' : undefined,
                    }}
                  >
                    {isBanned && <BannedOverlay />}
                    <div
                      className="card-bg"
                      style={{
                        backgroundImage: `url('${imgUrl}')`,
                        filter: card.filter || 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        borderRadius: 'inherit',
                      }}
                    ></div>

                    {isPremUnlocked && (
                      <div
                        className="premium-toggle-icon"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => handleTogglePremium(e, card.id)}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          left: '4px',
                          background: 'rgba(0,0,0,0.85)',
                          color: isPremActive ? '#d946ef' : '#94a3b8',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          fontSize: '0.8rem',
                          zIndex: 7,
                          border: `1px solid ${isPremActive ? '#d946ef' : '#475569'}`,
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
                      {card.power}
                    </div>

                    {window.renderSkillTag && (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: window.renderSkillTag(card),
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
          <div
            className="deck-section-title"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingRight: '10px',
            }}
          >
            <span>所持カード（タップで追加）</span>
            <button
              className="btn"
              style={{
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
          <div id="deck-master-list" className="deck-list-horizontal">
            {filteredMasterCards.map((template) => {
              const ownedCount = inventory[template.id] || 0;
              if (ownedCount === 0) return null; // 未所持は表示しない、もしくは表示するならグレーアウト（オリジナル仕様に合わせる）

              const inDeckCount = deckSelection.filter(
                (c) => c.id === template.id
              ).length;
              const remaining = ownedCount - inDeckCount;
              const canAdd = remaining > 0 && inDeckCount < MAX_CARD_COPIES;

              const isBanned = isCardBannedByFortune(template);
              const opacity = !canAdd || isBanned ? '0.4' : '1';
              const rarityClass = template.rarity
                ? ` rarity-${template.rarity}`
                : '';
              const imgUrl = getCardImgUrl ? getCardImgUrl(template, true) : '';
              const isPremUnlocked = unlockedPremium.includes(template.id);
              const isPremActive = (GameState.premiumCards || []).includes(
                template.id
              );

              return (
                <div
                  key={template.id}
                  className="deck-card-item"
                  style={{ width: '100px', height: '150px', flexShrink: 0 }}
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    handlePointerDown(template);
                  }}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => handleClick(template, addCard)}
                >
                  <div
                    className={`card blue${rarityClass}`}
                    style={{
                      width: '100px',
                      height: '150px',
                      position: 'relative',
                      display: 'block',
                      opacity,
                      overflow: 'hidden',
                      padding: 0,
                      border: isBanned ? '3px solid #ef4444' : undefined,
                      boxShadow: isBanned ? '0 0 10px #ef4444' : undefined,
                    }}
                  >
                    {isBanned && <BannedOverlay />}
                    <div
                      className="card-bg"
                      style={{
                        backgroundImage: `url('${imgUrl}')`,
                        filter: template.filter || 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        borderRadius: 'inherit',
                      }}
                    ></div>

                    {isPremUnlocked && (
                      <div
                        className="premium-toggle-icon"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => handleTogglePremium(e, template.id)}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          left: '4px',
                          background: 'rgba(0,0,0,0.85)',
                          color: isPremActive ? '#d946ef' : '#94a3b8',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          fontSize: '0.8rem',
                          zIndex: 7,
                          border: `1px solid ${isPremActive ? '#d946ef' : '#475569'}`,
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
                        color: canAdd ? '#facc15' : '#ef4444',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        fontSize: '0.75rem',
                        zIndex: 6,
                        border: `1px solid ${canAdd ? '#facc15' : '#ef4444'}`,
                      }}
                    >
                      {inDeckCount}/{ownedCount}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <MenuButton
          id="btn-finish-deck"
          variant="blue"
          disabled={
            deckSelection.length !== DECK_SIZE ||
            deckSelection.some((c) => isCardBannedByFortune(c))
          }
          style={{
            marginTop: '10px',
            width: '100%',
            opacity:
              deckSelection.length === DECK_SIZE &&
              !deckSelection.some((c) => isCardBannedByFortune(c))
                ? 1
                : 0.5,
          }}
          onClick={handleFinish}
          label={
            isDefenseConfig ||
            GameState.gameMode === 'create_deck' ||
            GameState.gameMode === 'free_deck_edit' ||
            GameState.gameMode === 'online_deck_edit' ||
            GameState.gameMode === 'tournament'
              ? '編成完了'
              : 'バトル開始！'
          }
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          marginTop: '20px',
          marginBottom: '20px',
          padding: '0 10px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* 左下：全削除ボタン */}
        <div style={{ justifySelf: 'start' }}>
          <button
            className="btn"
            style={{
              background: '#7f1d1d',
              margin: 0,
              whiteSpace: 'nowrap',
              padding: '8px 15px',
              fontSize: '0.8rem',
              width: 'auto',
              flexShrink: 0,
            }}
            onClick={clearDeck}
          >
            全削除
          </button>
        </div>

        {/* 中央：戻るボタン */}
        <button
          className="btn"
          style={{
            background: '#475569',
            margin: 0,
            whiteSpace: 'nowrap',
            padding: '10px 20px',
            fontSize: '1rem',
            width: 'auto',
            minWidth: '120px',
          }}
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            if (GameState.gameMode === 'story') {
              showConfirmModal?.(
                '一旦中断してメインメニューに戻りますか？\n（進捗は自動的に保存されています）',
                () => {
                  playSound?.(SOUNDS?.seClick);
                  if (typeof stopAllBGM === 'function') stopAllBGM();
                  if (AUDIO_INSTANCES?.bgmTitle)
                    playSound(AUDIO_INSTANCES.bgmTitle);
                  if (typeof switchScreen === 'function')
                    switchScreen('screen-solo-menu');
                }
              );
            } else {
              if (typeof loadDeck === 'function') loadDeck(); // 一時編集データをリセット
              if (typeof goBackFromDeckEdit === 'function')
                goBackFromDeckEdit(true);
            }
          }}
        >
          {GameState.gameMode === 'story' ? '一時中断' : '戻る'}
        </button>

        {/* 右下：ボーナス確認ボタン（全削除ボタンと対になる配置） */}
        <div style={{ justifySelf: 'end' }}>
          {showMissionButton && (
            <button
              className="btn"
              style={{
                background: '#0f3443',
                margin: 0,
                whiteSpace: 'nowrap',
                padding: '8px 15px',
                fontSize: '0.8rem',
                width: 'auto',
                flexShrink: 0,
              }}
              onClick={(e) => {
                e.stopPropagation();
                playSound(SOUNDS.seClick);
                setShowMissions(true);
              }}
            >
              ボーナス
            </button>
          )}
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

      {showMissions && (
        <MissionListModal onClose={() => setShowMissions(false)} />
      )}
    </div>
  );
}

function BannedOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.6)',
        color: '#ef4444',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        zIndex: 10,
        textShadow: '0 0 5px #000',
      }}
    >
      使用不可
    </div>
  );
}

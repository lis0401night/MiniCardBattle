import React, { useEffect, useMemo, useRef, useState } from 'react';

import MissionListModal from '../components/battle/MissionListModal.jsx';
import GridDensityIcon from '../components/common/GridDensityIcon.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import { prepareBattle } from '../game/battle/index.js';
import { loadDeck, saveDeck, setRenderDeckEditHook } from '../services/deck.js';
import { openCardPreview } from '../services/uiGallery.js';
import { goBackFromDeckEdit } from '../services/uiMainCore.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { showPlaymatModal } from '../services/uiPlaymat.js';
import { GameState } from '../state/gameState.js';
import CardFilterModal from '../components/common/CardFilterModal.jsx';
import CardSortModal from '../components/common/CardSortModal.jsx';
import { useCardFilterSort } from '../hooks/useCardFilterSort.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import {
  DECK_EDIT_GRID_DENSITY_KEY,
  DECK_SIZE,
  MAX_CARD_COPIES,
  appendVersionQuery,
} from '../utils/constants/config.js';
import { CHAR_FORTUNE_HANDICAPS } from '../utils/constants/fortuneHandicaps.js';
import {
  checkIsFortuneMode,
  checkIsHighDiffMode,
  checkShowMissionButton,
  hasActiveFilters,
  getCardImgUrl,
  getEventEnemyCharId,
  playSound,
  togglePremiumCard,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

// 所持カードエリア（可変シート）の高さ範囲。最大まで引き上げてもデッキエリアが少し覗ける値にする
const SHEET_MIN_PERCENT = 20;
const SHEET_MAX_PERCENT = 88;
const SHEET_DEFAULT_PERCENT = 50;

/**
 * デッキ編集画面の所持フィルター既定値
 */
const DEFAULT_OWNERSHIP = 'owned_only';

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

  // バトルボーナスは対象のモードでのみ機能する
  const showMissionButton = checkShowMissionButton();
  const [, setRenderVersion] = useState(0);

  const [isEditingName, setIsEditingName] = useState(false);
  const [deckName, setDeckName] = useState(computeDeckName);
  const [tempDeckName, setTempDeckName] = useState('');

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
    densityStorageKey: DECK_EDIT_GRID_DENSITY_KEY,
    defaultOwnership: DEFAULT_OWNERSHIP,
  });

  // --- 所持カードエリア（可変シート）のドラッグ操作 ---
  const stackContainerRef = useRef(null);
  const sheetElRef = useRef(null);
  const sheetDragRef = useRef(null);
  const [sheetPercent, setSheetPercent] = useState(SHEET_DEFAULT_PERCENT);

  // ドラッグ中に毎回setState（=カード一覧全体の再描画）を挟むと
  // カード枚数が多い時にかくつくため、ドラッグ中はReactを介さず
  // rAFで1フレームにつき最大1回、シート要素のstyleへ直接反映する。
  // Reactのstateへは、ドラッグ終了時に一度だけ反映して同期する。
  const sheetRafIdRef = useRef(null);
  const pendingSheetPercentRef = useRef(null);

  useEffect(() => {
    return () => {
      if (sheetRafIdRef.current != null) {
        cancelAnimationFrame(sheetRafIdRef.current);
      }
    };
  }, []);

  const handleSheetDragStart = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const containerEl = stackContainerRef.current;
    if (!containerEl) return;
    sheetDragRef.current = {
      startY: e.clientY,
      startPercent: sheetPercent,
      containerHeight: containerEl.getBoundingClientRect().height,
    };
    pendingSheetPercentRef.current = sheetPercent;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleSheetDragMove = (e) => {
    const drag = sheetDragRef.current;
    if (!drag || !drag.containerHeight) return;
    const deltaY = e.clientY - drag.startY;
    const deltaPercent = (deltaY / drag.containerHeight) * 100;
    const next = Math.min(
      SHEET_MAX_PERCENT,
      Math.max(SHEET_MIN_PERCENT, drag.startPercent - deltaPercent)
    );
    pendingSheetPercentRef.current = next;
    if (sheetRafIdRef.current == null) {
      sheetRafIdRef.current = requestAnimationFrame(() => {
        sheetRafIdRef.current = null;
        if (sheetElRef.current && pendingSheetPercentRef.current != null) {
          sheetElRef.current.style.setProperty(
            '--sheet-height',
            `${pendingSheetPercentRef.current}%`
          );
        }
      });
    }
  };

  const handleSheetDragEnd = (e) => {
    sheetDragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    // ドラッグ中は直接DOMを書き換えていたので、終えたタイミングで
    // 一度だけReactのstateに反映して以降の再描画と同期させる
    if (pendingSheetPercentRef.current != null) {
      setSheetPercent(pendingSheetPercentRef.current);
    }
  };

  // 所持カードシートが最大まで隠す分だけデッキリストの下に余白を作り、
  // 最下段のカードも一番上までスクロールして見られるようにする。
  // シートの「現在の」高さではなく「最大」高さで固定することで、
  // ドラッグ操作中に余白サイズ（＝スクロール可能範囲）が変化してしまい
  // ブラウザがスクロール位置を自動調整してしまう問題を避ける。
  const [stackHeightPx, setStackHeightPx] = useState(0);

  useEffect(() => {
    const el = stackContainerRef.current;
    if (!el) return undefined;
    const updateHeight = () =>
      setStackHeightPx(el.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sheetMaxHeightPx = (stackHeightPx * SHEET_MAX_PERCENT) / 100;

  // デッキリスト自身の表示領域サイズを計測し、カード1行分の高さを概算する。
  // 余白は「シートを最大まで開いても隠れない量」と「最下段カードの上端が
  // ビューポート上端を超えて見切れない量」の小さい方に制限する。
  const deckListContainerRef = useRef(null);
  const [deckListSize, setDeckListSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = deckListContainerRef.current;
    if (!el) return undefined;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setDeckListSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const deckListCols = gridCols;
  const deckListGap = gridGap;
  const deckListInnerWidth = Math.max(0, deckListSize.width - 10); // 左右padding 5pxずつ分
  const deckCardWidthPx =
    deckListCols > 0
      ? Math.max(
          0,
          (deckListInnerWidth - deckListGap * (deckListCols - 1)) / deckListCols
        )
      : 0;
  const deckRowHeightPx = deckCardWidthPx * 1.5 + deckListGap; // .card は padding-bottom:150%で縦横比固定

  const deckListExtraPaddingMax = Math.max(
    0,
    deckListSize.height - deckRowHeightPx - 10 // リスト上部のpadding 10px分も差し引く
  );
  const deckListExtraPaddingPx = Math.min(
    sheetMaxHeightPx,
    deckListExtraPaddingMax
  );

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

  const effectiveMode =
    GameState.gameMode === 'create_deck'
      ? GameState.prevGameModeForCreate || 'free_deck_edit'
      : GameState.gameMode;

  const isFortuneMode = checkIsFortuneMode(effectiveMode);

  // 特級目標（fortuneハンディキャップ）で有効な禁止スキルID一覧を毎回算出する
  const activeBannedSkillIds = (() => {
    if (!isFortuneMode || !GameState.fortuneHandicaps) return [];

    const enemyCharId = getEventEnemyCharId(effectiveMode);
    const handicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];

    return handicapsList
      .filter((h) => h.type === 'ban_skill' && GameState.fortuneHandicaps[h.id])
      .flatMap((rule) => rule.skillIds || [rule.skillId]);
  })();

  // カードが特級目標（fortuneハンディキャップ）によって禁止されているか判定する
  const isCardBannedByFortune = (template) => {
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
  };

  const addCard = (template) => {
    const ownedCount = inventory[template.id] || 0;

    // 未所持、または特級目標で禁止されているカードは全て無反応
    if (ownedCount === 0 || isCardBannedByFortune(template)) {
      return;
    }

    const inDeckCount = deckSelection.filter(
      (c) => c.id === template.id
    ).length;

    // 所持数限界、またはルールとして最大編成枚数上限を超えている場合は全て無反応
    if (inDeckCount >= ownedCount || inDeckCount >= MAX_CARD_COPIES) {
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

  const hasBannedCard = deckSelection.some((c) => isCardBannedByFortune(c));

  const handleFinish = () => {
    if (deckSelection.length !== DECK_SIZE) {
      showAlertModal?.(`デッキを${DECK_SIZE}枚にしてください！`);
      return;
    }

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

  // デッキ内のカードをIDでグループ化し、常にCARD_MASTERの定義ID順で整列
  // （シートのドラッグ操作など、deckSelectionと無関係な再レンダリングでは
  //   再計算しないようuseMemoで固定する）
  const rawGroupedDeck = useMemo(() => {
    const grouped = {};
    deckSelection.forEach((card) => {
      if (!grouped[card.id]) grouped[card.id] = { card, count: 0 };
      grouped[card.id].count++;
    });
    return grouped;
  }, [deckSelection]);

  // CARD_MASTERのID→定義順インデックス。ソートの安定化用に一度だけ構築する
  const cardOrderMap = useMemo(() => {
    const map = new Map();
    (CARD_MASTER || []).forEach((c, i) => map.set(c.id, i));
    return map;
  }, []);

  const sortedDeckKeys = useMemo(
    () =>
      Object.keys(rawGroupedDeck).sort((a, b) => {
        const idxA = cardOrderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
        const idxB = cardOrderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
        return idxA - idxB;
      }),
    [rawGroupedDeck, cardOrderMap]
  );

  const getBackgroundImage = () => {
    const mode = effectiveMode;

    if (mode === 'tournament') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_tournament01.webp')}')`;
    } else if (checkIsHighDiffMode(mode)) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_highdifficulty.webp')}')`;
    } else if (checkIsFortuneMode(mode)) {
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
  // （フィルター・ソート系の計算は所持カードが多いと重くなるため、
  //   関係する依存値が変わった時だけ再計算されるようuseMemoで囲う）

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
                    // リーダー変更を許可しないモード一覧
                    // battle_dungeon: 試練の宮殿ではリーダーはダンジョン進行中固定
                    // tournament: トーナメント進行中はリーダー固定
                    // story: ストーリー進行中はリーダー固定（変更するとデッキが使用不可になる）
                    const LEADER_CHANGE_BLOCKED_MODES = [
                      'battle_dungeon',
                      'tournament',
                      'story',
                    ];
                    const canChangeLeader =
                      !LEADER_CHANGE_BLOCKED_MODES.includes(GameState.gameMode);
                    if (charObj)
                      window.showCharDetailModal({
                        ...charObj,
                        hideDecideButton: true,
                        targetDeckIndex: GameState.currentDeckIndex,
                        allowLeaderChange: canChangeLeader,
                      });
                  }
                }}
              >
                <img
                  src={
                    (getSkinImage && CHARACTERS[leaderId]
                      ? getSkinImage(
                          CHARACTERS[leaderId],
                          deck?.playerSkins?.[leaderId] ||
                            GameState.playerSkins?.[leaderId] ||
                            'default',
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
        <div
          ref={stackContainerRef}
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* デッキ（背景レイヤー：常に全面表示） */}
          <div
            className="deck-section"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              // z-indexを明示して独自の重なり文脈を作る。
              // これがないと内部のカードがホバー時にz-index:10へ上がった際、
              // 所持カードシート（z-index:5）より上に突き抜けてしまう。
              zIndex: 1,
            }}
          >
            <div
              className="deck-section-title"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingRight: '10px',
              }}
            >
              <span>デッキ（タップで削除）</span>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span
                  style={{
                    color:
                      deckSelection.length !== DECK_SIZE
                        ? '#ef4444'
                        : '#10b981',
                    fontWeight: 'bold',
                  }}
                >
                  {deckSelection.length} / {DECK_SIZE}
                </span>
                <button
                  className="btn"
                  title="カード表示サイズを変更"
                  onClick={cycleGridDensity}
                  style={{
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
                  title="デッキを全て削除"
                  onClick={clearDeck}
                  style={{
                    padding: '4px 8px',
                    margin: 0,
                    fontSize: '0.9rem',
                    background: '#7f1d1d',
                    border: '1px solid #ef4444',
                    color: '#facc15',
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
            <div
              ref={deckListContainerRef}
              id="deck-current-list-container"
              className="card-list-container"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                padding: '10px 5px',
                paddingBottom: `${10 + deckListExtraPaddingPx}px`,
              }}
            >
              <div
                id="deck-current-grid"
                className="card-list-grid-3col"
                style={{
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  gap: `${gridGap}px`,
                }}
              >
                {sortedDeckKeys.map((id) => {
                  const { card, count } = rawGroupedDeck[id];
                  const isBanned = isCardBannedByFortune(card);
                  const rarityClass = card.rarity
                    ? ` rarity-${card.rarity}`
                    : '';
                  const imgUrl = getCardImgUrl ? getCardImgUrl(card, true) : '';
                  const isPremUnlocked = unlockedPremium.includes(card.id);
                  const isPremActive = (GameState.premiumCards || []).includes(
                    card.id
                  );

                  return (
                    <div
                      key={card.id}
                      className="deck-card-item gallery-card-wrapper"
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
                          style={{
                            fontSize: '1.4rem',
                            bottom: 0,
                            right: '4px',
                          }}
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
          </div>

          {/* 所持カード（可変シート：ヘッダーをドラッグして高さ変更） */}
          <div
            ref={sheetElRef}
            style={{
              position: 'absolute',
              // デッキエリアと同じ幅に揃える（広げると境界に段差ができるため）
              left: 0,
              right: 0,
              bottom: 0,
              height: `var(--sheet-height, ${SHEET_DEFAULT_PERCENT}%)`,
              '--sheet-height': `${sheetPercent}%`,
              borderRadius: '12px 12px 0 0',
              // box-shadowは内側のoverflow:hiddenと同じ要素に置くと
              // 影自体が枠でぶつ切りに見えるため、外側の枠なし要素に持たせる
              boxShadow: '0 -8px 20px rgba(0, 0, 0, 0.5)',
              zIndex: 5,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#0f172a',
                border: '1px solid #334155',
                borderBottom: 'none',
                borderRadius: '12px 12px 0 0',
              }}
            >
              <div
                onPointerDown={handleSheetDragStart}
                onPointerMove={handleSheetDragMove}
                onPointerUp={handleSheetDragEnd}
                onPointerCancel={handleSheetDragEnd}
                style={{
                  cursor: 'grab',
                  touchAction: 'none',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '4px',
                    background: '#64748b',
                    borderRadius: '2px',
                    margin: '8px auto 2px',
                  }}
                />
                <div
                  className="deck-section-title"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingLeft: '10px',
                    paddingRight: '10px',
                    paddingTop: '4px',
                    paddingBottom: '10px',
                  }}
                >
                  <span>所持カード（タップで追加）</span>
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      className="btn icon-btn"
                      title="表示密度切替"
                      style={{
                        padding: '4px 8px',
                        margin: 0,
                        fontSize: '0.9rem',
                        background: '#334155',
                        border: '1px solid #475569',
                        color: '#facc15',
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={cycleGridDensity}
                    >
                      <GridDensityIcon level={gridDensity} />
                    </button>
                    <button
                      className="btn"
                      style={{
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
                      onPointerDown={(e) => e.stopPropagation()}
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
                        padding: '4px 8px',
                        margin: 0,
                        fontSize: '0.9rem',
                        background: !isDefaultSort
                          ? 'rgba(250, 204, 21, 0.3)'
                          : '#334155',
                        border: !isDefaultSort
                          ? '1px solid #facc15'
                          : '1px solid #475569',
                        color: '#facc15',
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        playSound?.(SOUNDS?.seClick);
                        openSortModal();
                      }}
                    >
                      ↕️
                    </button>
                  </div>
                </div>
              </div>
              <div
                id="deck-master-list-container"
                className="card-list-container"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  padding: '10px 5px',
                }}
              >
                <div
                  id="deck-inventory-grid"
                  className="card-list-grid-3col"
                  style={{
                    gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                    gap: `${gridGap}px`,
                  }}
                >
                  {sortedMasterCards.map((template) => {
                    const ownedCount = inventory[template.id] || 0;
                    const isOwned = ownedCount > 0;

                    const inDeckCount = deckSelection.filter(
                      (c) => c.id === template.id
                    ).length;
                    const remaining = ownedCount - inDeckCount;
                    const canAdd =
                      isOwned && remaining > 0 && inDeckCount < MAX_CARD_COPIES;

                    const isBanned = isCardBannedByFortune(template);
                    const opacity =
                      !isOwned || !canAdd || isBanned ? '0.4' : '1';
                    const rarityClass = template.rarity
                      ? ` rarity-${template.rarity}`
                      : '';
                    const imgUrl = getCardImgUrl
                      ? getCardImgUrl(template, true)
                      : '';
                    const isPremUnlocked = unlockedPremium.includes(
                      template.id
                    );
                    const isPremActive = (
                      GameState.premiumCards || []
                    ).includes(template.id);

                    return (
                      <div
                        key={template.id}
                        className="deck-card-item gallery-card-wrapper"
                        onPointerDown={(e) => {
                          if (e.pointerType === 'mouse' && e.button !== 0)
                            return;
                          handlePointerDown(template);
                        }}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onPointerCancel={cancelLongPress}
                        onClick={() => {
                          if (!isOwned) return;
                          handleClick(template, addCard);
                        }}
                      >
                        <div
                          className={`card blue${rarityClass}`}
                          style={{
                            position: 'relative',
                            display: 'block',
                            opacity,
                            overflow: 'hidden',
                            padding: 0,
                            border: isBanned ? '3px solid #ef4444' : undefined,
                            boxShadow: isBanned
                              ? '0 0 10px #ef4444'
                              : undefined,
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
                            }}
                          ></div>

                          {isPremUnlocked && (
                            <div
                              className="premium-toggle-icon"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) =>
                                handleTogglePremium(e, template.id)
                              }
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
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '10px',
          alignItems: 'center',
          marginTop: '20px',
          marginBottom: '20px',
          padding: '0 10px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* 左：戻るボタン */}
        <div style={{ justifySelf: 'start' }}>
          <button
            className="btn"
            style={{
              background: '#475569',
              margin: 0,
              whiteSpace: 'nowrap',
              padding: '8px 12px',
              fontSize: '0.9rem',
              width: 'auto',
              minWidth: '90px',
              textAlign: 'center',
              flexShrink: 0,
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              if (typeof loadDeck === 'function') loadDeck(); // 一時編集データをリセット
              if (typeof goBackFromDeckEdit === 'function')
                goBackFromDeckEdit(true);
            }}
          >
            戻る
          </button>
        </div>

        {/* 中央：編成完了ボタン */}
        <MenuButton
          id="btn-finish-deck"
          variant="blue"
          disabled={deckSelection.length !== DECK_SIZE || hasBannedCard}
          style={{
            margin: 0,
            width: 'auto',
            minWidth: '140px',
            padding: '10px 24px',
            whiteSpace: 'nowrap',
            opacity:
              deckSelection.length === DECK_SIZE && !hasBannedCard ? 1 : 0.5,
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

        {/* 右：ボーナス確認ボタン */}
        <div style={{ justifySelf: 'end' }}>
          {showMissionButton && (
            <button
              className="btn"
              style={{
                background: '#0f3443',
                margin: 0,
                whiteSpace: 'nowrap',
                padding: '8px 12px',
                fontSize: '0.9rem',
                width: 'auto',
                minWidth: '90px',
                textAlign: 'center',
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

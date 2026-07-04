import React, { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { loadDeck } from '../services/deck.js';
import { GameState } from '../state/gameState.js';
import { confirmCharSelect, goBackFromSelect } from '../services/uiMainCore.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import {
  CHARACTERS,
  getSkinImage,
  getIconFramePath,
} from '../utils/constants/characters.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { MAX_DECK_SLOTS } from '../utils/constants/config.js';

export default function DeckListScreen({ switchScreen }) {
  const [, setRenderVersion] = useState(0);
  const [currentPage, setCurrentPage] = useState(GameState.deckListPage || 0);

  const getBackgroundImage = () => {
    // 新規デッキ作成中はgameModeが'create_deck'になるため、元のモードを参照する
    const mode =
      GameState.gameMode === 'create_deck'
        ? GameState.prevGameModeForCreate || 'free_deck_edit'
        : GameState.gameMode;

    if (mode === 'tournament') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_tournament01.png')`;
    } else if (mode === 'defense_register' || mode === 'defense_attack') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_defense.png')`;
    } else if (mode === 'battle_dungeon') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_challenge.png')`;
    } else if (mode === 'online_deck_edit') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_online.png')`;
    } else if (mode?.startsWith('event_') && mode?.endsWith('_high')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`;
    }
    return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_select.png')`;
  };

  // ページ位置のグローバル保存
  useEffect(() => {
    GameState.deckListPage = currentPage;
  }, [currentPage]);

  // DnD State
  const [dragIndex, setDragIndex] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [hoverIndex, setHoverIndex] = useState(null);
  const [isHoveringTrash, setIsHoveringTrash] = useState(false);

  // Refs
  const pointerStartX = React.useRef(0);
  const pointerStartY = React.useRef(0);
  const isSwipingRef = React.useRef(false);

  const longPressTimer = React.useRef(null);
  const isDraggingRef = React.useRef(false);
  const dragOffset = React.useRef({ x: 0, y: 0 });
  const autoScrollTimer = React.useRef(null);
  const draggedDeckRef = React.useRef(null); // dragIndexの同期用

  const decks = GameState.decks || [];
  const items = [...decks];
  if (decks.length < MAX_DECK_SLOTS) {
    items.push('create');
  }

  const itemsPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages - 1);

  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  const pages = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push(items.slice(i * itemsPerPage, (i + 1) * itemsPerPage));
  }

  useEffect(() => {
    // [ゲームモードとアプリステートの亡霊をリセット]
    // 新規作成やキャラ選択を途中でキャンセルして戻ってきた際、
    // これらのフラグが残り続けると、次の「戻る」が今の画面へ無限ループするのを防ぐため。
    if (GameState.gameMode === 'create_deck') {
      GameState.gameMode = GameState.prevGameModeForCreate || 'free_deck_edit';
      GameState.appState = GameState.prevAppStateForCreate || 'free_deck_edit';
    }

    window.forceUpdateDeckList = () => setRenderVersion((v) => v + 1);

    // デッキ一覧画面では常に通常デッキ（mini_card_battle_decks）のみを表示する。
    // loadDeck() はgameModeに応じてGameState.decksを特殊モード用に差し替える可能性があるため、
    // ここでは直接LocalStorageから通常デッキを読み込み、GameState.decksにセットする。
    try {
      const decksSaved = localStorage.getItem('mini_card_battle_decks');
      GameState.decks = decksSaved ? JSON.parse(decksSaved) : [];
    } catch {
      GameState.decks = [];
    }
    if (
      GameState.currentDeckIndex >= GameState.decks.length ||
      GameState.currentDeckIndex < 0
    ) {
      GameState.currentDeckIndex = 0;
    }
    setRenderVersion((v) => v + 1);

    return () => {
      window.forceUpdateDeckList = null;
    };
  }, []);

  const handleSelectDeck = (index) => {
    playSound?.(SOUNDS?.seClick);

    if (GameState.appState === 'select_enemy_deck') {
      GameState.pendingCharId = GameState.decks[index].leaderId;
      GameState.practiceEnemyDeckIndex = index;
      confirmCharSelect?.();
      return;
    }

    GameState.currentDeckIndex = index;
    loadDeck();

    if (GameState.appState === 'select_deck') {
      if (GameState.gameMode === 'practice') {
        GameState.practicePlayerDeckIndex = index;
      }
      GameState.pendingCharId = GameState.decks[index].leaderId;
      if (GameState.gameMode === 'tournament' && !GameState.tournament) {
        GameState.appState = 'tournament_init_deck_edit';
        switchScreen?.('screen-deck-edit');
      } else {
        confirmCharSelect?.();
      }
    } else {
      switchScreen?.('screen-deck-edit');
    }
  };

  const handleDeleteDeck = (index) => {
    playSound?.(SOUNDS?.seClick);
    if (GameState.decks.length <= 1) {
      showAlertModal?.('最後のデッキは削除できません。');
      return;
    }
    showConfirmModal?.(
      'このデッキを削除しますか？\n（この操作は取り消せません）',
      () => {
        GameState.decks.splice(index, 1);
        if (
          GameState.currentDeckIndex >= index &&
          GameState.currentDeckIndex > 0
        ) {
          GameState.currentDeckIndex--;
        }
        localStorage.setItem(
          'mini_card_battle_decks',
          JSON.stringify(GameState.decks)
        );
        setRenderVersion((v) => v + 1);
      }
    );
  };

  const handleCreateNew = () => {
    playSound?.(SOUNDS?.seClick);
    if (decks.length >= MAX_DECK_SLOTS) return;

    GameState.prevGameModeForCreate = GameState.gameMode;
    GameState.prevAppStateForCreate = GameState.appState;

    if (typeof switchScreen === 'function') {
      GameState.gameMode = 'create_deck';
      GameState.appState = 'create_deck_select_char';
      // 新規作成時はプレイヤースキンをリセットし、デフォルト状態で選べるようにする
      GameState.playerSkins = {};
      if (typeof window.initSelectScreenReact === 'function')
        window.initSelectScreenReact();
      switchScreen('screen-select');
    }
  };

  const handleBack = () => {
    goBackFromSelect?.();
  };

  // --- Events ---
  const handleGlobalPointerDown = (e) => {
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
    pointerStartX.current = clientX || 0;
    pointerStartY.current = clientY || 0;
    isSwipingRef.current = false;
  };

  const handleBannerPointerDown = (e, index, itemType) => {
    if (itemType === 'create') return;

    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);

    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top };

    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    longPressTimer.current = setTimeout(() => {
      if (!isSwipingRef.current) {
        isDraggingRef.current = true;
        draggedDeckRef.current = index;
        setDragIndex(index);
        setDragPos({
          x: clientX - dragOffset.current.x,
          y: clientY - dragOffset.current.y,
        });
        if (window.navigator.vibrate) window.navigator.vibrate(50);
      }
    }, 400); // 400ms長押し
  };

  const handleGlobalPointerMove = (e) => {
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
    if (clientX === undefined || clientY === undefined) return;

    const diffX = Math.abs(pointerStartX.current - clientX);
    const diffY = Math.abs(pointerStartY.current - clientY);
    if (diffX > 10 || diffY > 10) {
      isSwipingRef.current = true;
      if (!isDraggingRef.current && longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }

    if (isDraggingRef.current) {
      // Drag rendering
      setDragPos({
        x: clientX - dragOffset.current.x,
        y: clientY - dragOffset.current.y,
      });

      // Trash check
      const trashEl = document.getElementById('trash-can-zone');
      if (trashEl) {
        const rect = trashEl.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          setIsHoveringTrash(true);
        } else {
          setIsHoveringTrash(false);
        }
      }

      // Hover check
      const elem = document.elementFromPoint(clientX, clientY);
      const dropZone = elem?.closest('.deck-drop-zone');
      if (dropZone) {
        const idx = parseInt(dropZone.getAttribute('data-idx'), 10);
        if (!isNaN(idx) && idx !== draggedDeckRef.current) {
          setHoverIndex(idx);
        } else {
          setHoverIndex(null);
        }
      } else {
        setHoverIndex(null);
      }

      // Auto pagination
      if (clientX < 60) {
        if (!autoScrollTimer.current && currentPage > 0) {
          autoScrollTimer.current = setTimeout(() => {
            setCurrentPage((p) => p - 1);
            playSound?.(SOUNDS?.seClick);
            autoScrollTimer.current = null;
          }, 500);
        }
      } else if (clientX > window.innerWidth - 60) {
        if (!autoScrollTimer.current && currentPage < totalPages - 1) {
          autoScrollTimer.current = setTimeout(() => {
            setCurrentPage((p) => p + 1);
            playSound?.(SOUNDS?.seClick);
            autoScrollTimer.current = null;
          }, 500);
        }
      } else {
        if (autoScrollTimer.current) {
          clearTimeout(autoScrollTimer.current);
          autoScrollTimer.current = null;
        }
      }
    }
  };

  const handleGlobalPointerUp = (e) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (autoScrollTimer.current) {
      clearTimeout(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }

    const endX =
      e.clientX ?? (e.changedTouches && e.changedTouches[0]?.clientX);

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      const currentDragIdx = draggedDeckRef.current;
      draggedDeckRef.current = null;

      if (isHoveringTrash) {
        handleDeleteDeck(currentDragIdx);
      } else if (hoverIndex !== null && currentDragIdx !== null) {
        // Insert movement
        playSound?.(SOUNDS?.seClick);
        const newDecks = [...GameState.decks];
        const [movedDeck] = newDecks.splice(currentDragIdx, 1);
        newDecks.splice(hoverIndex, 0, movedDeck);

        if (GameState.currentDeckIndex === currentDragIdx) {
          GameState.currentDeckIndex = hoverIndex;
        } else if (
          currentDragIdx < GameState.currentDeckIndex &&
          hoverIndex >= GameState.currentDeckIndex
        ) {
          GameState.currentDeckIndex--;
        } else if (
          currentDragIdx > GameState.currentDeckIndex &&
          hoverIndex <= GameState.currentDeckIndex
        ) {
          GameState.currentDeckIndex++;
        }

        GameState.decks = newDecks;
        localStorage.setItem(
          'mini_card_battle_decks',
          JSON.stringify(GameState.decks)
        );
        setRenderVersion((v) => v + 1);
      }

      setDragIndex(null);
      setHoverIndex(null);
      setIsHoveringTrash(false);

      setTimeout(() => {
        isSwipingRef.current = false;
      }, 50);
      return;
    }

    if (endX === undefined) return;
    const diffX = pointerStartX.current - endX;
    if (diffX > 50 && currentPage < totalPages - 1) {
      playSound?.(SOUNDS?.seClick);
      setCurrentPage((p) => p + 1);
      pointerStartX.current = endX; // 連続発火防止
    } else if (diffX < -50 && currentPage > 0) {
      playSound?.(SOUNDS?.seClick);
      setCurrentPage((p) => p - 1);
      pointerStartX.current = endX; // 連続発火防止
    }

    setTimeout(() => {
      isSwipingRef.current = false;
    }, 50);
  };

  return (
    <div
      id="screen-deck-list"
      className="screen active"
      style={{
        backgroundImage: getBackgroundImage(),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        touchAction: 'none', // DnD操作のためにブラウザデフォルトスクロールを切る
      }}
      onPointerDown={handleGlobalPointerDown}
      onPointerMove={handleGlobalPointerMove}
      onPointerUp={handleGlobalPointerUp}
      onPointerCancel={handleGlobalPointerUp}
    >
      <h2 style={{ color: '#facc15', marginBottom: '15px' }}>
        {GameState.appState === 'select_enemy_deck'
          ? '相手のデッキ'
          : 'デッキ一覧'}
      </h2>

      <div
        style={{
          position: 'relative',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* 左矢印 */}
        {totalPages > 1 && safePage > 0 && (
          <div
            style={{
              position: 'absolute',
              left: '-5px',
              zIndex: 10,
              fontSize: '3rem',
              fontWeight: 'bold',
              color: '#facc15',
              cursor: 'pointer',
              opacity: 0.5,
              transform: 'scaleX(0.5)',
              textShadow: '0 0 5px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              playSound?.(SOUNDS?.seClick);
              setCurrentPage((p) => p - 1);
            }}
          >
            ❮
          </div>
        )}

        <div
          id="player-deck-list"
          style={{
            flex: 'none',
            height: '490px',
            width: '100%',
            overflow: 'hidden',
            padding: 0,
            position: 'relative',
            background: 'transparent',
            border: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: `${totalPages * 100}%`,
              height: '100%',
              transform: `translateX(-${(safePage * 100) / totalPages}%)`,
              transition:
                dragIndex !== null
                  ? 'none'
                  : 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            {pages.map((pageItems, pageIndex) => (
              <div
                key={`page-${pageIndex}`}
                style={{
                  width: `${100 / totalPages}%`,
                  flex: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  padding: '10px 15px',
                  gap: '15px',
                }}
              >
                {pageItems.map((item, localIdx) => {
                  const idx = pageIndex * itemsPerPage + localIdx;

                  if (item === 'create') {
                    return (
                      <button
                        key="create-new"
                        className="btn-banner"
                        style={{
                          flexShrink: 0,
                          borderColor: '#facc15',
                          borderStyle: 'dashed',
                          background: 'rgba(250, 204, 21, 0.1)',
                          justifyContent: 'center',
                        }}
                        onClick={() => {
                          if (!isSwipingRef.current && !isDraggingRef.current)
                            handleCreateNew();
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            color: '#facc15',
                            fontWeight: 'bold',
                          }}
                        >
                          <span style={{ fontSize: '2.5rem' }}>+</span>
                        </div>
                      </button>
                    );
                  }

                  const deck = item;
                  const char = CHARACTERS[deck.leaderId] || CHARACTERS.android;
                  const isDraggingThis = dragIndex === idx;
                  const isHoveringThis = hoverIndex === idx;

                  return (
                    <div
                      key={deck.id || `deck-${idx}`}
                      className="deck-drop-zone"
                      data-idx={idx}
                      style={{
                        position: 'relative',
                        width: '100%',
                        borderRadius: '8px',
                        flexShrink: 0,
                        opacity: isDraggingThis ? 0.3 : 1,
                        transform: isHoveringThis ? 'scale(1.02)' : 'none',
                        transition: 'transform 0.2s',
                        boxShadow: isHoveringThis
                          ? `0 0 15px ${char.color}`
                          : 'none',
                      }}
                      onPointerDown={(e) =>
                        handleBannerPointerDown(e, idx, 'deck')
                      }
                      onTouchStart={(e) =>
                        handleBannerPointerDown(e, idx, 'deck')
                      }
                    >
                      <button
                        className={`btn-banner no-transition`}
                        style={{
                          margin: 0,
                          borderColor: char.color,
                          width: '100%',
                          pointerEvents: dragIndex !== null ? 'none' : 'auto',
                        }}
                        onClick={(e) => {
                          // DnD中はクリック発火させない
                          if (isSwipingRef.current || isDraggingRef.current) {
                            e.preventDefault();
                            return;
                          }
                          handleSelectDeck(idx);
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            width: '100%',
                            paddingLeft: '10px',
                          }}
                        >
                          <div
                            style={{ display: 'flex', alignItems: 'center' }}
                          >
                            <div className="banner-icon-wrapper">
                              <img
                                src={
                                  getSkinImage
                                    ? getSkinImage(
                                        char,
                                        deck.playerSkins?.[char.id],
                                        'icon'
                                      )
                                    : char.icon
                                }
                                className="banner-icon"
                                alt=""
                                draggable="false"
                                style={{
                                  cursor: 'pointer',
                                  zIndex: 2,
                                }}
                                onClick={(e) => {
                                  if (
                                    isSwipingRef.current ||
                                    isDraggingRef.current
                                  )
                                    return;
                                  e.stopPropagation();
                                  playSound?.(SOUNDS?.seClick);
                                  if (window.showCharDetailModal) {
                                    window.showCharDetailModal({
                                      ...char,
                                      hideDecideButton: true,
                                      targetDeckIndex: idx,
                                    });
                                  }
                                }}
                              />
                              <img
                                src={getIconFramePath(char.id)}
                                className="banner-icon-frame"
                                alt="frame"
                              />
                            </div>
                            <span
                              className="banner-text"
                              style={{ color: char.color }}
                            >
                              {deck.name || `デッキ${idx + 1}`}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}

                {Array.from({ length: itemsPerPage - pageItems.length }).map(
                  (_, i) => (
                    <div
                      key={`dummy-${pageIndex}-${i}`}
                      style={{
                        height: '80px',
                        width: '100%',
                        flexShrink: 0,
                        visibility: 'hidden',
                      }}
                    ></div>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 右矢印 */}
        {totalPages > 1 && safePage < totalPages - 1 && (
          <div
            style={{
              position: 'absolute',
              right: '-5px',
              zIndex: 10,
              fontSize: '3rem',
              fontWeight: 'bold',
              color: '#facc15',
              cursor: 'pointer',
              opacity: 0.5,
              transform: 'scaleX(0.5)',
              textShadow: '0 0 5px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              playSound?.(SOUNDS?.seClick);
              setCurrentPage((p) => p + 1);
            }}
          >
            ❯
          </div>
        )}
      </div>

      {/* 下部ボタンとゴミ箱エリア */}
      <div
        style={{
          position: 'relative',
          marginTop: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          minHeight: '50px',
          padding: '0 15px',
          boxSizing: 'border-box',
        }}
      >
        <BackButton onClick={handleBack} style={{ margin: 0 }} />

        {/* ゴミ箱 (DnD削除ゾーン / 常時表示) */}
        <div
          id="trash-can-zone"
          style={{
            position: 'absolute',
            right: '15px',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            background: isHoveringTrash ? '#ef4444' : '#334155',
            border: `2px solid ${isHoveringTrash ? '#fff' : '#475569'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.8rem',
            boxShadow: isHoveringTrash
              ? '0 0 20px #ef4444'
              : '0 5px 10px rgba(0,0,0,0.5)',
            cursor: dragIndex !== null ? 'default' : 'pointer',
            transform: isHoveringTrash ? 'scale(1.2)' : 'scale(1)',
            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
          onClick={() => {
            if (dragIndex === null) {
              playSound?.(SOUNDS?.seClick);
              showAlertModal?.(
                'デッキを長押ししてドラッグし、\nここに重ねると削除できます。'
              );
            }
          }}
        >
          🗑️
        </div>
      </div>

      {/* ドラッグ中のゴーストバナー */}
      {dragIndex !== null &&
        (() => {
          const deck = decks[dragIndex];
          if (!deck) return null;
          const char = CHARACTERS[deck.leaderId] || CHARACTERS.android;
          return (
            <div
              style={{
                position: 'fixed',
                left: dragPos.x,
                top: dragPos.y,
                width: '320px', // バナーのサイズ感に合わせる
                height: '80px',
                background: 'rgba(30, 41, 59, 0.95)',
                border: `2px solid ${char.color}`,
                borderRadius: '12px',
                pointerEvents: 'none', // これ大事（下の要素を拾うため）
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                padding: '0 15px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
                transform: 'scale(1.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div className="banner-icon-wrapper">
                  <img
                    src={
                      getSkinImage
                        ? getSkinImage(
                            char,
                            deck.playerSkins?.[char.id],
                            'icon'
                          )
                        : char.icon
                    }
                    className="banner-icon"
                    alt=""
                  />
                  <img
                    src={getIconFramePath(char.id)}
                    className="banner-icon-frame"
                    alt="frame"
                  />
                </div>
                <span
                  className="banner-text"
                  style={{
                    color: char.color,
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                  }}
                >
                  {deck.name || `デッキ${dragIndex + 1}`}
                </span>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

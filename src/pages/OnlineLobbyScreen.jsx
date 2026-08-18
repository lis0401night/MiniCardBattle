import { useEffect, useRef, useState } from 'react';
import { prepareBattle } from '../game/battle/index.js';
import {
  cachedRoomData,
  getCurrentRoomCode,
  getCurrentRoomId,
  getIsHost,
  leaveRoom,
  listenToRoom,
  multiplayerCallbacks,
  sendChatMessage,
  setRoomStatusToBattle,
  updatePlayerReady,
  updateRoomHeartbeat,
} from '../services/multiplayer.js';
import { showOnlineMenu } from '../services/uiMainCore.js';
import { showAlertModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  CHARACTERS,
  getSkinImage,
  getPlayerIconPath,
  getIconFramePath,
} from '../utils/constants/characters.js';
import { playSound, switchScreen, stopAllBGM } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  getScreenBackgroundStyle,
  PROFILE_NAME_KEY,
  DEFAULT_PLAYER_NAME,
  ROOM_HEARTBEAT_INTERVAL_MS,
  ONLINE_BATTLE_START_DELAY_MS,
} from '../utils/constants/config.js';

async function safeLeaveRoom(errorMessage) {
  try {
    await leaveRoom();
  } catch (e) {
    console.error(errorMessage, e);
  }
}

export default function OnlineLobbyScreen() {
  const [roomData, setRoomData] = useState(cachedRoomData || null);
  const [localReadyConfig, setLocalReadyConfig] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const battleStartTimeoutRef = useRef(null);
  const latestRoomDataRef = useRef(null);

  // Initial config extraction
  useEffect(() => {
    window.reloadOnlineLobbyConfig = () => {
      const storedName =
        localStorage.getItem(PROFILE_NAME_KEY) || DEFAULT_PLAYER_NAME;

      let selIndex = GameState.currentDeckIndex || 0;
      const decksSrc = localStorage.getItem('mini_card_battle_decks');
      let decks = [];
      if (decksSrc) {
        try {
          decks = JSON.parse(decksSrc);
        } catch (e) {
          console.warn('デッキデータのパースに失敗しました:', e);
        }
      }

      let selStage = 'plain';
      const settingsJson = localStorage.getItem(
        'mini_card_battle_online_last_settings'
      );
      if (settingsJson) {
        try {
          const parsed = JSON.parse(settingsJson);
          if (parsed.stage) selStage = parsed.stage;

          if (parsed.deckId && decks.length > 0) {
            const foundIndex = decks.findIndex((d) => d.id === parsed.deckId);
            if (foundIndex !== -1) {
              selIndex = foundIndex;
              GameState.currentDeckIndex = selIndex;
            }
          }
        } catch (e) {
          console.warn('オンライン設定のパースに失敗しました:', e);
        }
      }

      const activeDeck = decks[selIndex] || decks[0] || null;

      if (activeDeck) {
        const selLeaderId = activeDeck.leaderId || 'android';
        const chara = CHARACTERS[selLeaderId] || CHARACTERS.android;

        const deckCards = (activeDeck.cards || [])
          .map((cardId) => {
            // 古いセーブデータ互換性（カードがオブジェクトになっている場合等）
            const actualId = typeof cardId === 'object' ? cardId.id : cardId;
            const isPremium = activeDeck.premiumCards
              ? activeDeck.premiumCards.includes(actualId)
              : false;
            const template = CARD_MASTER.find((c) => c.id === actualId);
            return template ? { ...template, isPremium } : null;
          })
          .filter(Boolean);

        const selSkin = activeDeck.playerSkins
          ? activeDeck.playerSkins[selLeaderId]
          : null;

        setLocalReadyConfig({
          name: storedName,
          leaderConfig: chara,
          deck: deckCards,
          playmat: activeDeck.playmatId || null,
          skin: selSkin || null,
          stage: selStage,
          icon: GameState.userProfile?.icon || 'player',
        });
      } else {
        setLocalReadyConfig({
          name: storedName,
          leaderConfig: CHARACTERS.android,
          deck: [],
          playmat: null,
          skin: null,
          stage: selStage,
          icon: GameState.userProfile?.icon || 'player',
        });
      }
    };

    window.reloadOnlineLobbyConfig();

    /**
     * 対戦を開始し、ゲーム状態のセットアップと画面遷移を行う共通ヘルパー関数
     * @param {Object} data - 最新のルームデータ
     */
    const executeStartBattle = (data) => {
      if (
        !data ||
        !data.host?.leaderConfig?.leaderConfig ||
        !data.client?.leaderConfig?.leaderConfig
      ) {
        // 設定が揃っていない場合もタイマー参照を解除し、以降の再開始をブロックしない
        battleStartTimeoutRef.current = null;
        return;
      }
      const isHost = getIsHost();
      const meData = isHost ? data.host : data.client;
      const opData = isHost ? data.client : data.host;

      const bSeed = data.battleSeed;
      if (typeof bSeed !== 'number') {
        console.error(
          '[executeStartBattle] battleSeed が未確定です。対戦開始を中止します。',
          { roomId: getCurrentRoomId() }
        );
        showAlertModal(
          '対戦の同期情報を取得できませんでした。もう一度お試しください。'
        );
        battleStartTimeoutRef.current = null;
        return;
      }
      GameState.battleSeed = bSeed; // 最新のシードをGameStateに記録
      const hostStage = data.host.leaderConfig?.stage || 'plain';
      const clientStage = data.client.leaderConfig?.stage || 'plain';
      GameState.selectedStageId = bSeed % 2 === 0 ? hostStage : clientStage;

      GameState.playerConfig = {
        ...meData.leaderConfig.leaderConfig,
        deck: meData.leaderConfig.deck,
      };
      GameState.enemyConfig = {
        ...opData.leaderConfig.leaderConfig,
        deck: opData.leaderConfig.deck,
      };

      GameState.playerConfig.playmat = meData.leaderConfig.playmat || null;
      GameState.enemyConfig.playmat = opData.leaderConfig.playmat || null;
      GameState.selectedPlaymatId = meData.leaderConfig.playmat || null;

      // 前モードのスキン設定をクリアし、設定の漏洩を防ぐ
      GameState.playerSkins = {};
      GameState.enemySkins = {};

      GameState.playerSkins[GameState.playerConfig.id] =
        meData.leaderConfig.skin || 'default';
      GameState.enemySkins[GameState.enemyConfig.id] =
        opData.leaderConfig.skin || 'default';

      GameState.playerConfig.image = getSkinImage(
        GameState.playerConfig,
        meData.leaderConfig.skin || 'default',
        'image'
      );
      GameState.playerConfig.imageLose = getSkinImage(
        GameState.playerConfig,
        meData.leaderConfig.skin || 'default',
        'imageLose'
      );
      GameState.playerConfig.icon = meData.leaderConfig.icon
        ? getPlayerIconPath({ icon: meData.leaderConfig.icon })
        : getSkinImage(
            GameState.playerConfig,
            meData.leaderConfig.skin || 'default',
            'icon'
          );
      GameState.playerConfig.iconDamage = meData.leaderConfig.icon
        ? getPlayerIconPath({ icon: meData.leaderConfig.icon })
        : getSkinImage(
            GameState.playerConfig,
            meData.leaderConfig.skin || 'default',
            'iconDamage'
          ) || GameState.playerConfig.icon;

      GameState.enemyConfig.image = getSkinImage(
        GameState.enemyConfig,
        opData.leaderConfig.skin || 'default',
        'image'
      );
      GameState.enemyConfig.imageLose = getSkinImage(
        GameState.enemyConfig,
        opData.leaderConfig.skin || 'default',
        'imageLose'
      );
      GameState.enemyConfig.icon = opData.leaderConfig.icon
        ? getPlayerIconPath({ icon: opData.leaderConfig.icon })
        : getSkinImage(
            GameState.enemyConfig,
            opData.leaderConfig.skin || 'default',
            'icon'
          );
      GameState.enemyConfig.iconDamage = opData.leaderConfig.icon
        ? getPlayerIconPath({ icon: opData.leaderConfig.icon })
        : getSkinImage(
            GameState.enemyConfig,
            opData.leaderConfig.skin || 'default',
            'iconDamage'
          ) || GameState.enemyConfig.icon;

      // 対戦中の切断時コールバックをセット（クリーンアップを確実に行う）
      multiplayerCallbacks.onRoomClosed = async () => {
        GameState.isBattleEnded = true;
        if (typeof window.setSlowMotionReact === 'function') {
          window.setSlowMotionReact(false);
        }
        if (typeof stopAllBGM === 'function') stopAllBGM();
        await safeLeaveRoom('ルーム解散時の退室処理に失敗しました:');
        showAlertModal('ルームが解散されました。', () => {
          showOnlineMenu?.();
        });
      };

      GameState.gameMode = 'online';
      GameState.appState = 'battle';

      window.dispatchEvent(new Event('startOnlineBattle'));
      prepareBattle();
      battleStartTimeoutRef.current = null;
    };

    multiplayerCallbacks.onRoomUpdated = (data) => {
      setRoomData(data);

      // 1. DB上の status が 'battle' に変更されている場合（追いつき自動同期）
      // 相手またはホスト側で対戦が開始された場合、ローカルタイマーを待たずに即座に対戦画面へ遷移する
      // ※ battleStartedAt は setRoomStatusToBattle で書き込まれ、resetRoomStatusToWaiting でクリアされる
      // ※ isReady はトランザクションで消費済み（false化）のため判定に使わない
      if (
        data &&
        data.status === 'battle' &&
        data.battleStartedAt
      ) {
        if (GameState.appState !== 'battle') {
          // すでに開始タイマーが動作している場合は、そちらの演出待ちを尊重する
          if (!battleStartTimeoutRef.current) {
            executeStartBattle(data);
          }
        }
        return;
      }

      // 2. すでに対戦中（appState === 'battle'）の場合は二重対戦開始を防止ためスキップ
      if (GameState.appState === 'battle') {
        if (battleStartTimeoutRef.current) {
          clearTimeout(battleStartTimeoutRef.current);
          battleStartTimeoutRef.current = null;
        }
        return;
      }

      // 3-a. 開始条件が崩れた場合（相手のReady解除・退室）は開始タイマーを解除する
      // ただし、status が 'battle' の場合は setRoomStatusToBattle により isReady が
      // 消費済み（false化）であるため、タイマーを解除してはならない
      if (
        battleStartTimeoutRef.current &&
        !(data && data.host?.isReady && data.client?.isReady) &&
        data?.status !== 'battle'
      ) {
        clearTimeout(battleStartTimeoutRef.current);
        battleStartTimeoutRef.current = null;
      }

      // 3. 両方がReadyかつまだ対戦中ではない場合にバトル開始タイマーをセット
      if (data && data.host?.isReady && data.client?.isReady) {
        // タイマー実行時に参照する最新ルームデータを更新する
        latestRoomDataRef.current = data;

        // すでにタイマーが起動中の場合は clearTimeout でリセットせず既存タイマーを継続（キャンセル事故防止）
        if (battleStartTimeoutRef.current) {
          return;
        }

        // ホスト側はDB上のstatusを 'battle' に更新
        if (getIsHost()) {
          setRoomStatusToBattle().catch((e) =>
            console.warn('setRoomStatusToBattle failed:', e)
          );
        }

        battleStartTimeoutRef.current = setTimeout(() => {
          // タイマー実行時に再度対戦中チェック（二重呼び出し防止）
          if (GameState.appState === 'battle') {
            battleStartTimeoutRef.current = null;
            return;
          }
          executeStartBattle(latestRoomDataRef.current);
        }, ONLINE_BATTLE_START_DELAY_MS);
      }
    };

    multiplayerCallbacks.onRoomClosed = async () => {
      setRoomData(null);
      await safeLeaveRoom('ルーム解散時の退室処理に失敗しました:');
      showAlertModal('ルームが解散されました。', () => {
        showOnlineMenu?.();
      });
    };

    // コンポーネント再マウント時（対戦終了後等）にリスナーを再起動し、確実に最新の状態とコールバックを同期させる
    const roomId = getCurrentRoomId();
    if (roomId) {
      listenToRoom(roomId);
    }

    // ホストとしてロビーで待機中の間、一定周期ごとに生存信号（ハートビート）を送信するタイマー
    const sendHeartbeat = () => {
      const activeRoomId = getCurrentRoomId();
      if (getIsHost() && activeRoomId && GameState.appState !== 'battle') {
        updateRoomHeartbeat(activeRoomId);
      }
    };
    // マウント直後に1回送信し、初回送信までの空白時間を作らない
    sendHeartbeat();
    const heartbeatInterval = setInterval(
      sendHeartbeat,
      ROOM_HEARTBEAT_INTERVAL_MS
    );

    return () => {
      clearInterval(heartbeatInterval);
      // ロビー画面から離脱した場合（対戦開始時を除く）はコールバックを解除
      // 対戦開始時は対戦用のコールバック（切断検知等）を維持するため、バトル状態でない場合のみ null にする
      if (GameState.appState !== 'battle') {
        multiplayerCallbacks.onRoomUpdated = null;
        multiplayerCallbacks.onRoomClosed = null;
      }
      if (battleStartTimeoutRef.current) {
        clearTimeout(battleStartTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [roomData?.chat]);

  const handleLeaveRoom = async () => {
    playSound(SOUNDS.seClick);
    await safeLeaveRoom('退室に失敗しました:');
    setRoomData(null);
    showOnlineMenu?.();
  };

  const handleDeckEdit = () => {
    playSound(SOUNDS.seClick);
    GameState.gameMode = 'online_deck_edit';
    GameState.appState = 'select_deck';
    switchScreen('screen-deck-list');
  };

  const handleSetReady = async () => {
    if (
      !localReadyConfig ||
      !localReadyConfig.deck ||
      localReadyConfig.deck.length < 20
    ) {
      showAlertModal(
        'デッキが未編成です。「編成」ボタンからキャラクターを選び、デッキを準備してください。'
      );
      return;
    }
    playSound(SOUNDS.seClick);
    try {
      await updatePlayerReady(localReadyConfig, true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelReady = async () => {
    playSound(SOUNDS.seClick);
    try {
      await updatePlayerReady(localReadyConfig, false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    try {
      const storedName =
        localStorage.getItem(PROFILE_NAME_KEY) || DEFAULT_PLAYER_NAME;
      await sendChatMessage(chatInput, storedName);
      setChatInput('');
    } catch (err) {
      console.error(err);
    }
  };

  const host = roomData?.host;
  const client = roomData?.client;
  const isHost = getIsHost();
  const myData = isHost ? host : client;
  const opData = isHost ? client : host;

  const chats = roomData?.chat
    ? Object.values(roomData.chat).sort((a, b) => a.timestamp - b.timestamp)
    : [];

  const myIconId = myData?.leaderConfig?.icon || myData?.icon;
  const myIcon = myIconId
    ? getPlayerIconPath({ icon: myIconId })
    : myData?.leaderConfig?.leaderConfig
      ? getSkinImage(
          myData.leaderConfig.leaderConfig,
          myData.leaderConfig.skin,
          'icon'
        )
      : getPlayerIconPath({});

  const opIconId = opData?.leaderConfig?.icon || opData?.icon;
  const opIcon = opIconId
    ? getPlayerIconPath({ icon: opIconId })
    : opData?.leaderConfig?.leaderConfig
      ? getSkinImage(
          opData.leaderConfig.leaderConfig,
          opData.leaderConfig.skin,
          'icon'
        )
      : getPlayerIconPath({});
  const myName = localStorage.getItem(PROFILE_NAME_KEY) || '自分';

  return (
    <div
      id="screen-online-lobby"
      className="screen active"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        padding: '20px',
        boxSizing: 'border-box',
        ...getScreenBackgroundStyle(
          'assets/backgrounds/background_online.webp'
        ),
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '15px', flexShrink: 0 }}>
        <h2
          style={{
            color: '#38bdf8',
            margin: '0 0 6px 0',
            textAlign: 'center',
            textShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
          }}
        >
          ルーム待機中
        </h2>
        {/* ルームIDと公開状態の表示 */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '0.85rem',
            color: '#e2e8f0',
          }}
        >
          <span>
            ルームID:{' '}
            <strong style={{ color: '#fde047', letterSpacing: '1px' }}>
              {roomData?.roomCode ||
                getCurrentRoomCode() ||
                getCurrentRoomId() ||
                '取得中...'}
            </strong>
          </span>
          {/* 公開状態はサーバー同期後にのみ表示し、未確定時の誤表示を防ぐ */}
          {typeof roomData?.isPublic === 'boolean' && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '10px',
                background: roomData.isPublic
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(239, 68, 68, 0.2)',
                color: roomData.isPublic ? '#6ee7b7' : '#fca5a5',
                border: roomData.isPublic
                  ? '1px solid rgba(16, 185, 129, 0.4)'
                  : '1px solid rgba(239, 68, 68, 0.4)',
              }}
            >
              {roomData.isPublic ? '🌐 公開' : '🔒 非公開'}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '100%',
        }}
      >
        {/* 自分 */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.8)',
            padding: '15px',
            borderRadius: '12px',
            border: '1px solid #38bdf8',
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            width: '100%',
            boxSizing: 'border-box',
            alignSelf: 'stretch',
          }}
        >
          <div
            className="banner-icon-wrapper"
            style={{ width: '48px', height: '48px', margin: 0 }}
          >
            <img
              src={myIcon || getPlayerIconPath({ icon: 'player' })}
              className="banner-icon"
              alt={myName}
            />
            <img
              src={getIconFramePath(
                myData?.leaderConfig?.leaderConfig?.id || 'android'
              )}
              className="banner-icon-frame"
              alt="frame"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                color: '#38bdf8',
                fontSize: '0.9rem',
                marginBottom: '5px',
              }}
            >
              {myName}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '5px',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  color: myData?.isReady ? '#10b981' : '#facc15',
                  fontWeight: 'bold',
                }}
              >
                {myData?.isReady ? '準備完了！' : '準備中...'}
              </div>
              <div>
                {myData?.isReady ? (
                  <button
                    className="btn"
                    style={{
                      margin: 0,
                      padding: '5px 10px',
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                      background: '#64748b',
                      flexShrink: 0,
                    }}
                    onClick={handleCancelReady}
                  >
                    準備解除
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    <button
                      className="btn"
                      style={{
                        margin: 0,
                        padding: '5px 10px',
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                        background: '#3b82f6',
                        width: 'auto',
                      }}
                      onClick={handleDeckEdit}
                    >
                      編成
                    </button>
                    <button
                      className="btn"
                      style={{
                        margin: 0,
                        padding: '5px 10px',
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                        background: '#10b981',
                        width: 'auto',
                      }}
                      onClick={handleSetReady}
                    >
                      準備完了
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 相手 */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.8)',
            padding: '15px',
            borderRadius: '12px',
            border: '1px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            width: '100%',
            boxSizing: 'border-box',
            alignSelf: 'stretch',
          }}
        >
          <div
            className="banner-icon-wrapper"
            style={{ width: '48px', height: '48px', margin: 0 }}
          >
            <img
              src={opIcon || getPlayerIconPath({ icon: 'player' })}
              className="banner-icon"
              alt={opData?.name || 'Opponent'}
            />
            <img
              src={getIconFramePath(
                opData?.leaderConfig?.leaderConfig?.id || 'android'
              )}
              className="banner-icon-frame"
              alt="frame"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                color: '#ef4444',
                fontSize: '0.9rem',
                marginBottom: '5px',
              }}
            >
              {opData ? `${opData.name}` : ''}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
              }}
            >
              {!opData ? (
                <div style={{ color: '#94a3b8' }}>
                  対戦相手を待っています...
                </div>
              ) : (
                <div
                  style={{
                    color: opData.isReady ? '#10b981' : '#facc15',
                    fontWeight: 'bold',
                  }}
                >
                  {opData.isReady ? '準備完了！' : '準備中...'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* チャット */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.8)',
            padding: '15px',
            borderRadius: '12px',
            border: '1px solid #475569',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            boxSizing: 'border-box',
            alignSelf: 'stretch',
            minHeight: 0,
          }}
        >
          <div
            style={{
              color: '#cbd5e1',
              fontSize: '0.9rem',
              marginBottom: '5px',
            }}
          >
            チャット
          </div>
          <div
            style={{
              flex: 1,
              minHeight: '120px',
              overflowY: 'auto',
              background: '#0f172a',
              padding: '10px',
              borderRadius: '8px',
              marginBottom: '10px',
              fontSize: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ marginTop: 'auto' }}>
              {chats.map((msg, i) => (
                <div
                  key={i}
                  style={{ marginBottom: '5px', wordBreak: 'break-all' }}
                >
                  <span
                    style={{
                      color: msg.sender === myName ? '#38bdf8' : '#ef4444',
                      fontWeight: 'bold',
                    }}
                  >
                    {msg.sender}:
                  </span>
                  <span style={{ color: '#fff', marginLeft: '5px' }}>
                    {msg.text}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
          <form
            onSubmit={handleSendChat}
            style={{ display: 'flex', gap: '10px' }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              style={{
                flex: 1,
                background: '#1e293b',
                color: '#fff',
                border: '1px solid #475569',
                borderRadius: '4px',
                padding: '8px',
              }}
              placeholder="メッセージ..."
              maxLength="50"
            />
            <button
              type="submit"
              className="btn"
              style={{
                margin: 0,
                padding: '5px 15px',
                width: 'auto',
                background: '#3b82f6',
              }}
            >
              送信
            </button>
          </form>
        </div>
      </div>

      <div style={{ marginTop: '15px', textAlign: 'center', flexShrink: 0 }}>
        <button
          className="btn"
          style={{ margin: '0', background: '#ef4444' }}
          onClick={handleLeaveRoom}
        >
          退出・解散する
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import MenuButton from '../components/common/MenuButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { prepareBattle } from '../game/battle/index.js';
import {
  cancelQuickMatch,
  getIsHost,
  multiplayerCallbacks,
  safeLeaveRoom,
  startQuickMatch,
  startSessionHeartbeat,
  stopSessionHeartbeat,
  QUICK_MATCH_REF,
} from '../services/multiplayer.js';
import { showOnlineQuickMatch } from '../services/uiMainCore.js';
import { showAlertModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { resolveValidIconId } from '../utils/constants/avatars.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  CHARACTERS,
  getPlayerIconPath,
  getSkinImage,
} from '../utils/constants/characters.js';
import {
  AI_LEVEL,
  DIFFICULTY,
  PROFILE_ICON_KEY,
} from '../utils/constants/config.js';
import { getRandomQuickCpuConfig } from '../utils/constants/enemy_decks/quick_cpu/index.js';
import {
  getOrCreateUUID,
  playSound,
  resolvePlayerName,
  stopAllBGM,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/** マッチングタイムアウト時間（ミリ秒: 60秒） */
const MATCHING_TIMEOUT_MS = 60000;

/**
 * デッキ配列を完全なカードオブジェクト配列に正規化する内部ヘルパー
 * @param {Array} rawDeck - カードオブジェクトまたはID文字列の配列
 * @returns {Array<Object>} 正規化されたカードオブジェクト配列
 */
const normalizeDeckCards = (rawDeck) => {
  if (!Array.isArray(rawDeck)) return [];
  const currentActiveDeck = GameState.decks?.[GameState.currentDeckIndex];
  return rawDeck
    .map((c) => {
      if (!c) return null;
      const actualId =
        typeof c === 'string'
          ? c
          : typeof c?.baseId === 'string' && c.baseId.length > 0
            ? c.baseId
            : typeof c?.id === 'string' && c.id.length > 0
              ? c.id
              : null;
      if (!actualId) return null;
      const template = CARD_MASTER.find((m) => m.id === actualId);
      if (!template) return null;
      const isPremium =
        typeof c === 'object' && typeof c.isPremium === 'boolean'
          ? c.isPremium
          : currentActiveDeck?.premiumCards
            ? currentActiveDeck.premiumCards.includes(actualId)
            : (GameState.premiumCards || []).includes(actualId);
      const isShine =
        typeof c === 'object' && typeof c.isShine === 'boolean'
          ? c.isShine
          : currentActiveDeck?.shineCards
            ? currentActiveDeck.shineCards.includes(actualId)
            : (GameState.shineCards || []).includes(actualId);
      return {
        ...template,
        ...(typeof c === 'object' ? c : {}),
        isPremium,
        isShine,
      };
    })
    .filter(Boolean);
};

/**
 * クイックマッチ待機画面コンポーネント
 * 「対戦相手を待っています」のロード待機、相手との自動マッチング成立検知、バトル移行、キャンセル処理を提供する。
 * 1分間マッチングしなかった場合は自動的に専用CPU対戦へ移行する。
 * @returns {import('react').ReactElement} クイックマッチ待機画面
 */
export default function OnlineQuickMatchingScreen() {
  const [isMatchFound, setIsMatchFound] = useState(false);
  const [matchTitle, setMatchTitle] = useState('対戦相手が見つかりました！');
  const [countdown, setCountdown] = useState(60);
  const isMountedRef = useRef(true);
  const countdownIntervalRef = useRef(null);
  const timeoutTimerRef = useRef(null);
  const cancelTimeoutRef = useRef(null);
  const hasMatchedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const isMatchingStartedRef = useRef(false);
  const activeMatchPromiseRef = useRef(null);

  /**
   * マッチング成立時に呼ばれ、GameState に対戦相手および自身の情報をセットして対戦を開始する
   * @param {Object} roomData - Firebase 上のルームデータ
   */
  const handleMatchSuccess = (roomData) => {
    if (!isMountedRef.current || hasMatchedRef.current) return;
    hasMatchedRef.current = true;
    setMatchTitle('対戦相手が見つかりました！');
    setIsMatchFound(true);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    stopSessionHeartbeat();

    try {
      // UUID または getIsHost() を使用して自身と相手を厳密に判別（同キャラ使用時の誤判定・反転を根絶）
      const myUuid = getOrCreateUUID();
      const isHostPlayer = getIsHost() || roomData.host?.id === myUuid;
      const meData = isHostPlayer ? roomData.host : roomData.client;
      const opData = isHostPlayer ? roomData.client : roomData.host;

      if (!meData?.leaderConfig || !opData?.leaderConfig) {
        console.error('クイックマッチデータが不完全です:', roomData);
        showAlertModal('マッチングデータの同期に失敗しました。', () => {
          showOnlineQuickMatch?.();
        });
        return;
      }

      // 共通の対戦シードを同期
      const bSeed = roomData.battleSeed || Date.now();
      GameState.battleSeed = bSeed;

      // 一意な対戦IDの決定（FirebaseルームID、またはシードと両者UUIDから一意に決定）
      const matchId =
        roomData.roomId ||
        roomData.id ||
        `quick_${bSeed}_${meData.id || myUuid}_${opData.id || 'op'}`;

      GameState.quickMatchInfo = {
        matchId,
        isPvP: true,
        myUuid,
        myName: meData.name || resolvePlayerName(),
        myRating:
          meData.leaderConfig?.rating ??
          (parseInt(
            localStorage.getItem('mini_card_battle_quick_rating'),
            10
          ) ||
            0),
        opponentUuid: opData.id || '',
        opponentName: opData.name || '対戦相手',
        opponentRating: opData.leaderConfig?.rating ?? 0,
      };

      // プレイヤー・対戦相手の情報をGameStateに反映
      GameState.playerConfig = {
        ...meData.leaderConfig.leaderConfig,
        deck: normalizeDeckCards(meData.leaderConfig.deck),
      };
      GameState.enemyConfig = {
        ...opData.leaderConfig.leaderConfig,
        deck: normalizeDeckCards(opData.leaderConfig.deck),
      };

      GameState.playerConfig.playmat = meData.leaderConfig.playmat || null;
      GameState.enemyConfig.playmat = opData.leaderConfig.playmat || null;
      GameState.selectedPlaymatId = meData.leaderConfig.playmat || null;

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

      // ステージの決定: battleSeed が偶数ならホスト、奇数ならゲストのステージを採用
      const hostStage = roomData.host?.leaderConfig?.stage || 'plain';
      const clientStage = roomData.client?.leaderConfig?.stage || 'plain';
      GameState.selectedStageId =
        Number(bSeed) % 2 === 0 ? hostStage : clientStage;

      // 対戦中の切断時コールバックをセット
      multiplayerCallbacks.onRoomClosed = async () => {
        GameState.isBattleEnded = true;
        GameState.onlineSubMode = null;
        if (typeof window.setSlowMotionReact === 'function') {
          window.setSlowMotionReact(false);
        }
        if (typeof stopAllBGM === 'function') stopAllBGM();
        await safeLeaveRoom('ルーム解散時の退室処理に失敗しました:');
        showAlertModal('対戦相手との接続が切断されました。', () => {
          showOnlineQuickMatch?.();
        });
      };

      // オンラインサブモードをクイックマッチに記録し、対戦中は完全なオンライン対戦（'online'）として実行
      GameState.onlineSubMode = 'quick';
      GameState.gameMode = 'online';
      GameState.appState = 'battle';

      window.dispatchEvent(new Event('startOnlineBattle'));
      prepareBattle();
    } catch (err) {
      console.error('クイックマッチ対戦開始エラー:', err);
      showAlertModal('対戦開始処理中にエラーが発生しました。', () => {
        showOnlineQuickMatch?.();
      });
    }
  };

  /**
   * マッチング待機タイムアウト（60秒経過）時に呼ばれ、
   * Firebaseの待機登録を解除した上で専用CPU対戦へ自動移行する。
   * @returns {Promise<void>}
   */
  const handleTimeoutTransitionToCpu = async () => {
    if (!isMountedRef.current || hasMatchedRef.current) return;
    hasMatchedRef.current = true;
    setMatchTitle('対戦相手が見つかりました！');
    setIsMatchFound(true);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    stopSessionHeartbeat();

    try {
      // 1. Firebase 上の自身のクイックマッチ待機登録を安全にキャンセル・削除
      await cancelQuickMatch().catch((err) => {
        console.warn(
          'タイムアウト時のクイックマッチ待機解除に失敗しました:',
          err
        );
      });

      // 2. プレイヤー自身のデッキ設定を正規化・取得
      const rawDeckCards =
        GameState.playerDeckSelection ||
        GameState.deckSelection ||
        GameState.playerConfig?.deck ||
        GameState.decks?.[GameState.currentDeckIndex]?.cards ||
        [];
      const activeDeckCards = normalizeDeckCards(rawDeckCards);

      GameState.playerConfig = {
        ...GameState.playerConfig,
        deck: activeDeckCards,
      };
      GameState.playerDeckSelection = activeDeckCards;

      // 3. 対戦相手となる専用CPU設定をランダムに抽選（自身のキャラクターと被らないように選定）
      const playerCharId = GameState.playerConfig?.id;
      const cpuConfig = getRandomQuickCpuConfig(playerCharId);
      const enemyCharTemplate =
        CHARACTERS[cpuConfig.characterId] || CHARACTERS.android;

      GameState.enemyConfig = {
        ...enemyCharTemplate,
        deck: normalizeDeckCards(cpuConfig.deck),
      };

      // 4. 難易度およびAIレベルの設定（ハード設定）
      GameState.difficulty = DIFFICULTY.HARD;
      GameState.aiLevel = AI_LEVEL.HARD;

      // 5. スキン・プレイマット・ステージ情報の設定
      GameState.playerSkins = GameState.playerSkins || {};
      GameState.enemySkins = GameState.enemySkins || {};
      GameState.playerSkins[GameState.playerConfig.id] =
        GameState.playerSkins[GameState.playerConfig.id] || 'default';
      GameState.enemySkins[GameState.enemyConfig.id] =
        cpuConfig.skin || 'default';

      GameState.playerConfig.playmat = GameState.selectedPlaymatId || null;
      GameState.enemyConfig.playmat = cpuConfig.playmat || null;

      // ステージの決定: 50% の確率でプレイヤー選択ステージ、またはCPU対応ステージ
      const playerStage = GameState.selectedStageId || 'plain';
      const cpuStage = cpuConfig.stage || 'plain';
      GameState.selectedStageId = Math.random() < 0.5 ? playerStage : cpuStage;

      // 画像パス・アイコンの設定
      GameState.playerConfig.image = getSkinImage(
        GameState.playerConfig,
        GameState.playerSkins[GameState.playerConfig.id],
        'image'
      );
      GameState.playerConfig.imageLose = getSkinImage(
        GameState.playerConfig,
        GameState.playerSkins[GameState.playerConfig.id],
        'imageLose'
      );
      GameState.playerConfig.icon =
        GameState.playerConfig.icon ||
        getSkinImage(
          GameState.playerConfig,
          GameState.playerSkins[GameState.playerConfig.id],
          'icon'
        );
      GameState.playerConfig.iconDamage =
        GameState.playerConfig.iconDamage ||
        getSkinImage(
          GameState.playerConfig,
          GameState.playerSkins[GameState.playerConfig.id],
          'iconDamage'
        ) ||
        GameState.playerConfig.icon;

      GameState.enemyConfig.image = getSkinImage(
        GameState.enemyConfig,
        cpuConfig.skin || 'default',
        'image'
      );
      GameState.enemyConfig.imageLose = getSkinImage(
        GameState.enemyConfig,
        cpuConfig.skin || 'default',
        'imageLose'
      );
      GameState.enemyConfig.icon = getSkinImage(
        GameState.enemyConfig,
        cpuConfig.skin || 'default',
        'icon'
      );
      GameState.enemyConfig.iconDamage =
        getSkinImage(
          GameState.enemyConfig,
          cpuConfig.skin || 'default',
          'iconDamage'
        ) || GameState.enemyConfig.icon;

      // 6. 対戦シードの設定
      GameState.battleSeed = Date.now();

      // 7. 切断ハンドラを解除（CPU対戦のため）
      multiplayerCallbacks.onRoomClosed = null;

      // 8. ゲームモード設定（オンライン専用CPU対戦モード）
      GameState.onlineSubMode = 'quick';
      GameState.gameMode = 'online_quick_cpu';
      GameState.appState = 'battle';

      // 演出のため少しだけ待機（1秒）してからバトルへ移行
      setTimeout(() => {
        if (!isMountedRef.current) return;
        prepareBattle();
      }, 1000);
    } catch (err) {
      console.error('クイックマッチCPU戦移行エラー:', err);
      showAlertModal('対戦の準備中にエラーが発生しました。', () => {
        showOnlineQuickMatch?.();
      });
    }
  };

  const handleMatchSuccessRef = useRef(null);
  handleMatchSuccessRef.current = handleMatchSuccess;
  const handleTimeoutTransitionToCpuRef = useRef(null);
  handleTimeoutTransitionToCpuRef.current = handleTimeoutTransitionToCpu;
  const handleCancelRef = useRef(null);

  /**
   * マッチング処理を開始する
   */
  const beginMatching = useCallback(() => {
    if (isMatchingStartedRef.current) return;
    isMatchingStartedRef.current = true;
    hasMatchedRef.current = false;
    stopSessionHeartbeat();

    const playerName = resolvePlayerName();
    const rawDeckCards =
      GameState.playerDeckSelection ||
      GameState.deckSelection ||
      GameState.playerConfig?.deck ||
      GameState.decks?.[GameState.currentDeckIndex]?.cards ||
      [];

    const activeDeckCards = normalizeDeckCards(rawDeckCards);

    const myLeaderConfig = {
      leaderConfig: { ...GameState.playerConfig },
      deck: activeDeckCards,
      skin: GameState.playerSkins?.[GameState.playerConfig?.id] || 'default',
      icon: resolveValidIconId(localStorage.getItem(PROFILE_ICON_KEY)),
      playmat: GameState.selectedPlaymatId || null,
      stage: GameState.selectedStageId || 'plain',
      rating:
        parseInt(localStorage.getItem('mini_card_battle_quick_rating'), 10) ||
        0,
    };

    const matchPromise = startQuickMatch(
      playerName,
      myLeaderConfig,
      (matchedRoomData) => {
        // キャンセル済み・アンマウント済みであれば、マッチング成立を破棄して即座に退室
        if (isCancelledRef.current || !isMountedRef.current) {
          safeLeaveRoom('キャンセル後のマッチング破棄').catch(() => {});
          return;
        }
        stopSessionHeartbeat();
        handleMatchSuccessRef.current?.(matchedRoomData);
      },
      (roomId) => {
        // キャンセル済み・アンマウント済みであれば、作成直後の待機エントリを即座に破棄して終了（孤児エントリ・ゾンビハートビート防止）
        if (isCancelledRef.current || !isMountedRef.current) {
          cancelQuickMatch().catch(() => {});
          return;
        }

        // 待機開始時: 統一ハートビート管理によりホスト生存信号の送信を開始
        if (roomId) {
          startSessionHeartbeat(roomId, QUICK_MATCH_REF);
        }

        // 待機開始時: タイムアウトタイマーを設定（1分経過でCPU戦に自動移行）
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = setTimeout(() => {
          if (
            !hasMatchedRef.current &&
            isMountedRef.current &&
            !isCancelledRef.current
          ) {
            handleTimeoutTransitionToCpuRef.current?.();
          }
        }, MATCHING_TIMEOUT_MS);
      }
    );

    activeMatchPromiseRef.current = matchPromise;

    matchPromise.catch((err) => {
      console.error('startQuickMatch error:', err);
      stopSessionHeartbeat();
      if (isMountedRef.current) {
        showAlertModal('マッチングサーバーへの接続に失敗しました。', () => {
          showOnlineQuickMatch?.();
        });
      }
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    // StrictMode による直前のアンマウント予約（デバウンスキャンセル）があれば即座に解除
    if (cancelTimeoutRef.current) {
      clearTimeout(cancelTimeoutRef.current);
      cancelTimeoutRef.current = null;
    }

    // 60秒カウントダウンタイマーの開始（毎秒デクリメント）
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(60);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    beginMatching();

    return () => {
      isMountedRef.current = false;
      stopSessionHeartbeat();
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
      // 対戦開始に至らなかった場合のアンマウントキャンセル
      // React.StrictMode での即時アンマウント/再マウントで部屋が一瞬で削除されてしまうのを防止するため、
      // 300ms の猶予を設け、再マウントされず画面を完全に離脱した場合のみキャンセルを実行する
      if (!hasMatchedRef.current || isCancelledRef.current) {
        cancelTimeoutRef.current = setTimeout(() => {
          if (!hasMatchedRef.current || isCancelledRef.current) {
            cancelQuickMatch().catch(() => {});
            if (activeMatchPromiseRef.current) {
              activeMatchPromiseRef.current
                .then(() => {
                  cancelQuickMatch().catch(() => {});
                })
                .catch(() => {});
            }
          }
        }, 300);
      }
    };
  }, [beginMatching]);

  /**
   * キャンセルボタンクリック時のハンドラ。
   * 待機キャンセル、ハートビート停止、および進行中の非同期待機登録完了後の追従破棄を行う。
   * @returns {Promise<void>}
   */
  const handleCancel = async () => {
    playSound?.(SOUNDS?.seClick);
    isCancelledRef.current = true;
    hasMatchedRef.current = true;
    if (cancelTimeoutRef.current) {
      clearTimeout(cancelTimeoutRef.current);
      cancelTimeoutRef.current = null;
    }
    stopSessionHeartbeat();
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    await cancelQuickMatch();
    // 待機登録処理が非同期進行中で未完了の場合、完了後に確実に再度破棄する（孤児エントリ防止）
    activeMatchPromiseRef.current
      ?.then(() => cancelQuickMatch())
      .catch(() => {});
    showOnlineQuickMatch?.();
  };
  handleCancelRef.current = handleCancel;

  return (
    <ScreenLayout
      id="screen-online-quick-matching"
      title="クイックマッチ"
      titleColor="#38bdf8"
      titleGlow={true}
      backgroundImage="background_online.webp"
      showBackButton={false}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '350px',
          gap: '24px',
          textAlign: 'center',
          padding: '20px',
        }}
      >
        {!isMatchFound ? (
          <>
            <div
              className="spinner"
              style={{ width: '50px', height: '50px' }}
            ></div>
            <div>
              <h3
                style={{
                  color: '#fff',
                  fontSize: '1.3rem',
                  margin: '0 0 8px 0',
                }}
              >
                対戦相手を待っています
              </h3>
              <p
                style={{
                  color: '#38bdf8',
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  margin: 0,
                }}
              >
                {countdown}秒
              </p>
            </div>
            <div style={{ marginTop: '20px' }}>
              <MenuButton
                label="キャンセル"
                variant="yellow"
                onClick={handleCancel}
                style={{ minWidth: '160px' }}
              />
            </div>
          </>
        ) : (
          <div>
            <div
              className="spinner"
              style={{ width: '50px', height: '50px', margin: '0 auto 16px' }}
            ></div>
            <h3 style={{ color: '#38bdf8', fontSize: '1.4rem', margin: 0 }}>
              {matchTitle}
            </h3>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}

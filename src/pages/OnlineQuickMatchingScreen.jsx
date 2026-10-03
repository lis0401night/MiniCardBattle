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
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { resolveValidIconId } from '../utils/constants/avatars.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  getPlayerIconPath,
  getSkinImage,
} from '../utils/constants/characters.js';
import { PROFILE_ICON_KEY } from '../utils/constants/config.js';
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
 * クイックマッチ待機画面コンポーネント
 * 「対戦相手を探しています」のロード待機、相手との自動マッチング成立検知、バトル移行、キャンセル処理を提供する。
 * @returns {import('react').ReactElement} クイックマッチ待機画面
 */
export default function OnlineQuickMatchingScreen() {
  const [isMatchFound, setIsMatchFound] = useState(false);
  const isMountedRef = useRef(true);
  const timeoutTimerRef = useRef(null);
  const cancelTimeoutRef = useRef(null);
  const hasMatchedRef = useRef(false);
  const isMatchingStartedRef = useRef(false);
  const activeMatchPromiseRef = useRef(null);

  /**
   * マッチング成立時に呼ばれ、GameState に対戦相手および自身の情報をセットして対戦を開始する
   * @param {Object} roomData - Firebase 上のルームデータ
   */
  const handleMatchSuccess = (roomData) => {
    if (!isMountedRef.current || hasMatchedRef.current) return;
    hasMatchedRef.current = true;
    setIsMatchFound(true);

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

      /**
       * デッキ配列を完全なカードオブジェクト配列に正規化する内部ヘルパー
       * @param {Array} rawDeck - カードオブジェクトまたはID文字列の配列
       * @returns {Array<Object>} 正規化されたカードオブジェクト配列
       */
      const normalizeDeckCards = (rawDeck) => {
        if (!Array.isArray(rawDeck)) return [];
        return rawDeck
          .map((c) => {
            if (!c) return null;
            if (typeof c === 'object' && c.name && c.power !== undefined) {
              return { ...c };
            }
            const actualId = typeof c === 'object' ? c.id : c;
            const template = CARD_MASTER.find((m) => m.id === actualId);
            return template ? { ...template } : null;
          })
          .filter(Boolean);
      };

      // 共通の対戦シードを同期
      const bSeed = roomData.battleSeed || Date.now();
      GameState.battleSeed = bSeed;

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
      GameState.selectedStageId = Number(bSeed) % 2 === 0 ? hostStage : clientStage;

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

  const handleMatchSuccessRef = useRef(null);
  handleMatchSuccessRef.current = handleMatchSuccess;
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

    const activeDeckCards = rawDeckCards
      .map((c) => {
        if (!c) return null;
        if (typeof c === 'object' && c.name && c.power !== undefined) {
          return { ...c };
        }
        const actualId = typeof c === 'object' ? c.id : c;
        const template = CARD_MASTER.find((m) => m.id === actualId);
        return template ? { ...template } : null;
      })
      .filter(Boolean);

    const myLeaderConfig = {
      leaderConfig: { ...GameState.playerConfig },
      deck: activeDeckCards,
      skin: GameState.playerSkins?.[GameState.playerConfig?.id] || 'default',
      icon: resolveValidIconId(localStorage.getItem(PROFILE_ICON_KEY)),
      playmat: GameState.selectedPlaymatId || null,
      stage: GameState.selectedStageId || 'plain',
    };

    const matchPromise = startQuickMatch(
      playerName,
      myLeaderConfig,
      (matchedRoomData) => {
        stopSessionHeartbeat();
        handleMatchSuccessRef.current?.(matchedRoomData);
      },
      (roomId) => {
        // 待機開始時: 統一ハートビート管理によりホスト生存信号の送信を開始
        if (roomId) {
          startSessionHeartbeat(roomId, QUICK_MATCH_REF);
        }

        // 待機開始時: タイムアウトタイマーを設定
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = setTimeout(() => {
          if (!hasMatchedRef.current && isMountedRef.current) {
            showConfirmModal(
              '対戦相手が見つかりませんでした。\n検索を続行しますか？',
              () => {
                isMatchingStartedRef.current = false;
                beginMatching();
              },
              () => {
                handleCancelRef.current?.();
              }
            );
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

    beginMatching();

    return () => {
      isMountedRef.current = false;
      stopSessionHeartbeat();
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
      // 対戦開始に至らなかった場合のアンマウントキャンセル
      // React.StrictMode での即時アンマウント/再マウントで部屋が一瞬で削除されてしまうのを防止するため、
      // 300ms の猶予を設け、再マウントされず画面を完全に離脱した場合のみキャンセルを実行する
      if (!hasMatchedRef.current) {
        cancelTimeoutRef.current = setTimeout(() => {
          if (!hasMatchedRef.current) {
            cancelQuickMatch().catch(() => {});
            if (activeMatchPromiseRef.current) {
              activeMatchPromiseRef.current
                .then(() => {
                  if (!hasMatchedRef.current) {
                    cancelQuickMatch().catch(() => {});
                  }
                })
                .catch(() => {});
            }
          }
        }, 300);
      }
    };
  }, [beginMatching]);

  /**
   * キャンセルボタンクリック時のハンドラ
   */
  const handleCancel = async () => {
    playSound?.(SOUNDS?.seClick);
    hasMatchedRef.current = true;
    if (cancelTimeoutRef.current) {
      clearTimeout(cancelTimeoutRef.current);
      cancelTimeoutRef.current = null;
    }
    stopSessionHeartbeat();
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    await cancelQuickMatch();
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
            <div className="spinner" style={{ width: '50px', height: '50px' }}></div>
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.3rem', margin: '0 0 8px 0' }}>
                対戦相手を探しています...
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
                他のプレイヤーが編成を完了するのを待機しています
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
            <div className="spinner" style={{ width: '50px', height: '50px', margin: '0 auto 16px' }}></div>
            <h3 style={{ color: '#38bdf8', fontSize: '1.4rem' }}>
              対戦相手が見つかりました！
            </h3>
            <p style={{ color: '#e2e8f0' }}>対戦準備中...</p>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}

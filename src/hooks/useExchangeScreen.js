import { useEffect, useMemo, useRef, useState } from 'react';
import { saveDeck } from '../services/deck.js';
import { showAlertModal } from '../services/uiModals.js';
import {
  showCardAcquisitionModal,
  showSkinAcquisitionModal,
  showPlaymatAcquisitionModal,
  showIconAcquisitionModal,
  showPremiumAcquisitionModal,
} from '../services/uiGallery.js';
import { GameState } from '../state/gameState.js';
import {
  savePointsToServer,
  fetchPlayerDecks,
  reconcilePointsWithPurchases,
  calculateFortuneTotalPointsFromCleared,
} from '../utils/apiUtils.js';
import { setOwnedPlaymats } from '../utils/constants/playmats.js';
import {
  getOrCreateUUID,
  playSound,
  safeParseArray,
  safeParseObject,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  CHALLENGE_POINTS_KEY,
  CHALLENGE_TOTAL_POINTS_KEY,
  TOURNAMENT_POINTS_KEY,
  TOURNAMENT_TOTAL_POINTS_KEY,
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
  FORTUNE_POINTS_KEY,
  FORTUNE_TOTAL_POINTS_KEY,
  HIGH_DIFFICULTY_POINTS_KEY,
  HIGH_DIFFICULTY_TOTAL_POINTS_KEY,
  MAX_CARD_COPIES,
  EXCHANGE_LINEUPS_BY_MODE,
} from '../utils/constants/config.js';

const KEY_MAPPING = {
  challenge: {
    points: CHALLENGE_POINTS_KEY,
    total: CHALLENGE_TOTAL_POINTS_KEY,
  },
  tournament: {
    points: TOURNAMENT_POINTS_KEY,
    total: TOURNAMENT_TOTAL_POINTS_KEY,
  },
  defense: {
    points: DEFENSE_POINTS_KEY,
    total: DEFENSE_TOTAL_POINTS_KEY,
  },
  fortune: {
    points: FORTUNE_POINTS_KEY,
    total: FORTUNE_TOTAL_POINTS_KEY,
  },
  high_difficulty: {
    points: HIGH_DIFFICULTY_POINTS_KEY,
    total: HIGH_DIFFICULTY_TOTAL_POINTS_KEY,
  },
};

/**
 * 交換所画面共通のカスタムフック。
 * ポイントの読み込み、自己修復、サーバー同期、安全なアイテム交換トランザクションを提供します。
 *
 * @param {Object} options
 * @param {string} options.pointsKey - モード識別キー ('fortune' | 'challenge' | 'tournament' | 'defense' | 'high_difficulty')
 * @param {string} [options.pointsLocalKey] - LocalStorage上の所持ポイントキー
 * @param {string} [options.pointsTotalLocalKey] - LocalStorage上の累計ポイントキー
 * @param {string} options.apiEndpoint - サーバー同期先APIファイル名（例: 'update_fortune_points.php'）
 * @param {Array<Object>} [options.lineup] - 交換所アイテム配列（省略時は EXCHANGE_LINEUPS_BY_MODE より解決）
 * @returns {Object} 交換所ステートおよびハンドラ関数群
 */
export function useExchangeScreen({
  pointsKey,
  pointsLocalKey: customPointsLocalKey,
  pointsTotalLocalKey: customTotalLocalKey,
  apiEndpoint,
  lineup: customLineup,
}) {
  const pointsLocalKey =
    customPointsLocalKey ||
    KEY_MAPPING[pointsKey]?.points ||
    `mini_card_battle_${pointsKey}_points`;
  const pointsTotalLocalKey =
    customTotalLocalKey ||
    KEY_MAPPING[pointsKey]?.total ||
    `mini_card_battle_${pointsKey}_total_points`;
  const responsePointsField =
    pointsKey === 'defense' ? 'points' : `${pointsKey}_points`;
  const responseTotalPointsField =
    pointsKey === 'defense' ? 'total_points' : `${pointsKey}_total_points`;

  const resolvedLineup = useMemo(
    () => customLineup || EXCHANGE_LINEUPS_BY_MODE[pointsKey] || [],
    [customLineup, pointsKey]
  );

  const [points, setPoints] = useState(() => {
    const rawCur = parseInt(localStorage.getItem(pointsLocalKey), 10) || 0;
    const rawTot = parseInt(localStorage.getItem(pointsTotalLocalKey), 10) || 0;
    const initialRecon = reconcilePointsWithPurchases(
      rawCur,
      rawTot,
      resolvedLineup
    );
    return {
      current: initialRecon.current,
      total: initialRecon.total,
    };
  });

  const [unlockedSkins, setUnlockedSkins] = useState(() =>
    safeParseArray('mini_card_battle_unlocked_skins')
  );
  const [unlockedPlaymats, setUnlockedPlaymats] = useState(() =>
    safeParseArray('mini_card_battle_owned_playmats')
  );
  const [unlockedIcons, setUnlockedIcons] = useState(() =>
    safeParseArray('mini_card_battle_unlocked_icons')
  );
  const [unlockedPremium, setUnlockedPremium] = useState(() =>
    safeParseArray('mini_card_battle_unlocked_premium')
  );
  const [inventory, setInventory] = useState(
    () =>
      GameState.playerInventory ||
      safeParseObject('mini_card_battle_inventory') ||
      {}
  );
  const [pointsUpdated, setPointsUpdated] = useState(false);
  const isExchangingRef = useRef(false);

  const ownershipRef = useRef(null);
  ownershipRef.current = {
    inventory: GameState.playerInventory || inventory,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    unlockedPremiumCards: unlockedPremium,
  };

  useEffect(() => {
    let cancelled = false;
    let currentPts = parseInt(localStorage.getItem(pointsLocalKey), 10) || 0;
    let totalPts = parseInt(localStorage.getItem(pointsTotalLocalKey), 10) || 0;

    // 運命の邂逅（Fortune）の場合、クリア済み特級目標から理論上の最低累計ポイントを下限保証
    if (pointsKey === 'fortune') {
      const minFortuneTotal = calculateFortuneTotalPointsFromCleared();
      totalPts = Math.max(totalPts, minFortuneTotal);
    }

    const fetchPoints = async () => {
      try {
        const result = await fetchPlayerDecks();
        if (cancelled) return;
        if (result.success && getOrCreateUUID) {
          const myUuid = getOrCreateUUID();
          const myData = result.players?.find((p) => p.uuid === myUuid);
          if (myData) {
            const serverPts = myData[responsePointsField] || 0;
            const serverTotalPts =
              myData[responseTotalPointsField] || serverPts || 0;

            const mergedTotal = Math.max(totalPts, serverTotalPts);
            const mergedCurrent = Math.max(currentPts, serverPts);

            // 交換済みアイテムと総ポイントによる整合性修復を実行
            const recon = reconcilePointsWithPurchases(
              mergedCurrent,
              mergedTotal,
              resolvedLineup,
              ownershipRef.current
            );

            if (cancelled) return;

            const finalPts = recon.current;
            const finalTotalPts = recon.total;

            setPoints({ current: finalPts, total: finalTotalPts });
            localStorage.setItem(pointsLocalKey, String(finalPts));
            localStorage.setItem(pointsTotalLocalKey, String(finalTotalPts));

            // ローカル・サーバー間の齟齬、または修復が発生した場合はサーバーに最新値を同期
            if (
              currentPts !== finalPts ||
              totalPts !== finalTotalPts ||
              serverPts !== finalPts ||
              serverTotalPts !== finalTotalPts ||
              recon.reconciled
            ) {
              savePointsToServer(apiEndpoint, finalPts, finalTotalPts);
            }
          } else {
            // サーバーにプレイヤーデータがない場合でも自己修復を実施
            const recon = reconcilePointsWithPurchases(
              currentPts,
              totalPts,
              resolvedLineup,
              ownershipRef.current
            );
            if (cancelled) return;
            if (recon.reconciled) {
              setPoints({ current: recon.current, total: recon.total });
              localStorage.setItem(pointsLocalKey, String(recon.current));
              localStorage.setItem(pointsTotalLocalKey, String(recon.total));
              savePointsToServer(apiEndpoint, recon.current, recon.total);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('ポイント取得・同期中にエラーが発生しました:', err);
        }
      }
    };
    fetchPoints();

    return () => {
      cancelled = true;
    };
  }, [
    pointsUpdated,
    apiEndpoint,
    pointsKey,
    pointsLocalKey,
    pointsTotalLocalKey,
    responsePointsField,
    responseTotalPointsField,
    resolvedLineup,
  ]);

  /**
   * アイテム交換処理。
   * サーバー同期の成功を待ってからローカルストレージ・インベントリをアトミックに確定します。
   *
   * @param {Object} item - 交換対象アイテム
   */
  const handleExchange = async (item) => {
    if (isExchangingRef.current) return;
    const isCard = item.type === 'card';
    const isPlaymat = item.type === 'playmat';
    const isIcon = item.type === 'icon';
    const isPremium = item.type === 'premium';
    let isAlreadyUnlocked = false;

    if (isCard) {
      isAlreadyUnlocked = (inventory[item.id] || 0) >= MAX_CARD_COPIES;
    } else if (isPlaymat) {
      isAlreadyUnlocked = unlockedPlaymats.includes(item.id);
    } else if (isIcon) {
      isAlreadyUnlocked = unlockedIcons.includes(item.id);
    } else if (isPremium) {
      isAlreadyUnlocked = unlockedPremium.includes(item.id);
    } else {
      isAlreadyUnlocked = unlockedSkins.includes(item.id);
    }

    if (isAlreadyUnlocked) {
      showAlertModal('既に最大数持っているか、アンロック済みのアイテムです。');
      return;
    }

    if (!Number.isFinite(item.cost) || item.cost < 0) {
      showAlertModal('交換情報が不正です。');
      return;
    }
    if (points.current < item.cost) {
      showAlertModal('ポイントが不足しています。');
      return;
    }

    isExchangingRef.current = true;

    try {
      playSound(SOUNDS?.seCardPlace);
      const newPts = points.current - item.cost;

      // 【重要】サーバーへの同期完了（成功）を厳格に確認してからローカルのポイント減算・アイテム付与を確定
      const saveSuccess = await savePointsToServer(
        apiEndpoint,
        newPts,
        points.total
      );

      if (!saveSuccess) {
        showAlertModal(
          'ポイントの同期に失敗しました。通信環境を確認して再度お試しください。'
        );
        return;
      }

      // サーバー同期成功時のみローカルデータをアトミックに更新
      localStorage.setItem(pointsLocalKey, String(newPts));
      setPoints((prev) => ({ ...prev, current: newPts }));

      if (item.type === 'card') {
        const currentCount = inventory[item.id] || 0;
        const newInventory = { ...inventory, [item.id]: currentCount + 1 };
        setInventory(newInventory);
        Object.assign(GameState, { playerInventory: newInventory });
        localStorage.setItem(
          'mini_card_battle_inventory',
          JSON.stringify(newInventory)
        );
        if (typeof saveDeck === 'function') saveDeck();
        showCardAcquisitionModal(item.id);
      } else if (item.type === 'playmat') {
        const newUnlocked = [...unlockedPlaymats, item.id];
        localStorage.setItem(
          'mini_card_battle_owned_playmats',
          JSON.stringify(newUnlocked)
        );
        Object.assign(GameState, { ownedPlaymats: newUnlocked });
        setOwnedPlaymats(newUnlocked);
        setUnlockedPlaymats(newUnlocked);
        showPlaymatAcquisitionModal(item.name, item.id);
      } else if (item.type === 'icon') {
        const newUnlocked = [...unlockedIcons, item.id];
        localStorage.setItem(
          'mini_card_battle_unlocked_icons',
          JSON.stringify(newUnlocked)
        );
        Object.assign(GameState, { unlockedIcons: newUnlocked });
        setUnlockedIcons(newUnlocked);
        showIconAcquisitionModal(item.name, item.id);
      } else if (item.type === 'premium') {
        const newUnlocked = [...unlockedPremium, item.id];
        localStorage.setItem(
          'mini_card_battle_unlocked_premium',
          JSON.stringify(newUnlocked)
        );
        Object.assign(GameState, { unlockedPremiumCards: newUnlocked });
        setUnlockedPremium(newUnlocked);
        showPremiumAcquisitionModal(item.id);
      } else {
        const newUnlocked = [...unlockedSkins, item.id];
        localStorage.setItem(
          'mini_card_battle_unlocked_skins',
          JSON.stringify(newUnlocked)
        );
        Object.assign(GameState, { unlockedSkins: newUnlocked });
        setUnlockedSkins(newUnlocked);
        showSkinAcquisitionModal(item.name, item.id);
      }

      setPointsUpdated((prev) => !prev);
    } catch (e) {
      console.error('交換処理中に例外が発生しました:', e);
      showAlertModal(
        '交換処理中にエラーが発生しました。通信環境を確認して再度お試しください。'
      );
    } finally {
      isExchangingRef.current = false;
    }
  };

  return {
    points,
    setPoints,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    unlockedPremium,
    inventory,
    lineup: resolvedLineup,
    handleExchange,
    pointsUpdated,
    setPointsUpdated,
  };
}

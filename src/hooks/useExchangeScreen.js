import { useEffect, useRef, useState } from 'react';
import { saveDeck } from '../services/deck.js';
import { showAlertModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { savePointsToServer, fetchPlayerDecks } from '../utils/apiUtils.js';
import { setOwnedPlaymats } from '../utils/constants/playmats.js';
import { getOrCreateUUID, playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

const readStringArrayFromStorage = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function useExchangeScreen({
  pointsKey, // 'challenge'（試練の宮殿）または 'tournament'（闘技祭）
  apiEndpoint, // 'update_challenge_points.php' または 'update_tournament_points.php' などのAPIエンドポイント
}) {
  const pointsLocalKey = `mini_card_battle_${pointsKey}_points`;
  const pointsTotalLocalKey = `mini_card_battle_${pointsKey}_total_points`;
  const responsePointsField = `${pointsKey}_points`;
  const responseTotalPointsField = `${pointsKey}_total_points`;

  const [points, setPoints] = useState(() => ({
    current: parseInt(localStorage.getItem(pointsLocalKey), 10) || 0,
    total: parseInt(localStorage.getItem(pointsTotalLocalKey), 10) || 0,
  }));

  const [unlockedSkins, setUnlockedSkins] = useState(() =>
    readStringArrayFromStorage('mini_card_battle_unlocked_skins')
  );
  const [unlockedPlaymats, setUnlockedPlaymats] = useState(() =>
    readStringArrayFromStorage('mini_card_battle_owned_playmats')
  );
  const [unlockedIcons, setUnlockedIcons] = useState(() =>
    readStringArrayFromStorage('mini_card_battle_unlocked_icons')
  );
  const [inventory, setInventory] = useState(
    () => GameState.playerInventory || {}
  );
  const [pointsUpdated, setPointsUpdated] = useState(false);
  const isExchangingRef = useRef(false);

  useEffect(() => {
    const currentPts = parseInt(localStorage.getItem(pointsLocalKey), 10) || 0;
    const totalPts =
      parseInt(localStorage.getItem(pointsTotalLocalKey), 10) || 0;

    const fetchPoints = async () => {
      try {
        const result = await fetchPlayerDecks();
        if (result.success && getOrCreateUUID) {
          const myUuid = getOrCreateUUID();
          const myData = result.players.find((p) => p.uuid === myUuid);
          if (myData) {
            const pts = myData[responsePointsField] || 0;
            const tPts = myData[responseTotalPointsField] || pts || 0;

            let finalPts = pts;
            if (currentPts > pts || (pts === 0 && currentPts > 0)) {
              finalPts = currentPts;
            }

            let finalTotalPts = tPts;
            if (totalPts > tPts || (tPts === 0 && totalPts > 0)) {
              finalTotalPts = totalPts;
            }

            if (finalPts > 0 || currentPts === 0) {
              setPoints({ current: finalPts, total: finalTotalPts });
              localStorage.setItem(pointsLocalKey, finalPts);
              localStorage.setItem(pointsTotalLocalKey, finalTotalPts);

              // ローカルのデータがサーバーより新しく進んでいる場合、サーバーへ同期してマスタを更新します
              if (
                currentPts > pts ||
                totalPts > tPts ||
                (pts === 0 && currentPts > 0)
              ) {
                savePointsToServer(apiEndpoint, finalPts, finalTotalPts);
              }
            }
          }
        }
      } catch {
        // 例外は無視する
      }
    };
    fetchPoints();
  }, [
    pointsUpdated,
    apiEndpoint,
    pointsLocalKey,
    pointsTotalLocalKey,
    responsePointsField,
    responseTotalPointsField,
  ]);

  const handleExchange = async (item) => {
    if (isExchangingRef.current) return;
    const isCard = item.type === 'card';
    const isPlaymat = item.type === 'playmat';
    const isIcon = item.type === 'icon';
    let isAlreadyUnlocked = false;

    if (isCard) {
      isAlreadyUnlocked = (inventory[item.id] || 0) >= 4;
    } else if (isPlaymat) {
      isAlreadyUnlocked = unlockedPlaymats.includes(item.id);
    } else if (isIcon) {
      isAlreadyUnlocked = unlockedIcons.includes(item.id);
    } else {
      isAlreadyUnlocked = unlockedSkins.includes(item.id);
    }

    if (isAlreadyUnlocked) {
      showAlertModal('既に最大数持っているか、アンロック済みのアイテムです。');
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

      await savePointsToServer(apiEndpoint, newPts, points.total);

      localStorage.setItem(pointsLocalKey, newPts);
      setPoints((prev) => ({ ...prev, current: newPts }));

      if (item.type === 'card') {
        const currentCount = inventory[item.id] || 0;
        const newInventory = { ...inventory, [item.id]: currentCount + 1 };
        setInventory(newInventory);
        Object.assign(GameState, { playerInventory: newInventory });
        if (typeof saveDeck === 'function') saveDeck();
        showAlertModal(`「${item.displayName || item.id}」を手に入れました！`);
      } else if (item.type === 'playmat') {
        const newUnlocked = [...unlockedPlaymats, item.id];
        localStorage.setItem(
          'mini_card_battle_owned_playmats',
          JSON.stringify(newUnlocked)
        );
        setOwnedPlaymats(newUnlocked);
        setUnlockedPlaymats(newUnlocked);
        showAlertModal(
          `「${item.name}」を手に入れました！\nデッキ編成画面でプレイマットを変更できます。`
        );
      } else if (item.type === 'icon') {
        const newUnlocked = [...unlockedIcons, item.id];
        localStorage.setItem(
          'mini_card_battle_unlocked_icons',
          JSON.stringify(newUnlocked)
        );
        Object.assign(GameState, { unlockedIcons: newUnlocked });
        setUnlockedIcons(newUnlocked);
        showAlertModal(
          `「${item.name}」を手に入れました！\nプロフィール設定画面でアイコンを変更できます。`
        );
      } else {
        const newUnlocked = [...unlockedSkins, item.id];
        localStorage.setItem(
          'mini_card_battle_unlocked_skins',
          JSON.stringify(newUnlocked)
        );
        Object.assign(GameState, { unlockedSkins: newUnlocked });
        setUnlockedSkins(newUnlocked);
        showAlertModal(
          `「${item.name}」を手に入れました！\nキャラクター選択画面でスキンを変更できます。`
        );
      }

      setPointsUpdated((prev) => !prev);
    } catch (e) {
      console.error('Failed to sync points to server:', e);
      showAlertModal(
        'ポイントの同期に失敗しました。通信環境を確認して再度お試しください。'
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
    inventory,
    handleExchange,
    pointsUpdated,
    setPointsUpdated,
  };
}

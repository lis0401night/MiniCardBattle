import {
  getOrCreateUUID,
  loadHighDifficultyClearedData,
  resolvePlayerName,
  safeParseArray,
  safeParseObject,
} from './gameUtils.js';
import { resolveValidIconId } from './constants/avatars.js';
import { GameState } from '../state/gameState.js';
import {
  loadFortuneClearedData,
  calculateHandicapPointsFromMap,
} from './constants/fortuneRewards.js';
import {
  CHALLENGE_POINTS_KEY,
  CHALLENGE_TOTAL_POINTS_KEY,
  TOURNAMENT_POINTS_KEY,
  TOURNAMENT_TOTAL_POINTS_KEY,
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
  DEFENSE_WINS_KEY,
  FORTUNE_POINTS_KEY,
  FORTUNE_TOTAL_POINTS_KEY,
  HIGH_DIFFICULTY_POINTS_KEY,
  HIGH_DIFFICULTY_TOTAL_POINTS_KEY,
  HIGH_DIFFICULTY_CLEARED_KEY,
  DUNGEON_MAX_STREAK_KEY,
  LAST_HEARTBEAT_KEY,
  PROFILE_ICON_KEY,
  EXCHANGE_LINEUPS_BY_MODE,
  INVENTORY_KEY,
  UNLOCKED_SKINS_KEY,
  OWNED_PLAYMATS_KEY,
  UNLOCKED_ICONS_KEY,
  UNLOCKED_PREMIUM_KEY,
} from './constants/config.js';

/** API通信のデフォルトタイムアウト時間 (ms) */
const API_TIMEOUT_MS = 3000;

/** ハートビート送信のタイムアウト時間 (ms) */
const HEARTBEAT_TIMEOUT_MS = 5000;

/** 防衛戦結果送信のタイムアウト時間 (ms) */
const DEFENSE_RECORD_TIMEOUT_MS = 4000;

/**
 * タイムアウト付きでfetchおよびレスポンス消費を実行する共通ヘルパー。
 * レスポンスボディの読み込み完了までAbortSignalのタイムアウト監視を持続し、ヘッダー受信後のハングを防ぎます。
 *
 * @param {string} url - リクエスト先URL
 * @param {RequestInit} options - fetchオプション
 * @param {number} [timeoutMs=API_TIMEOUT_MS] - タイムアウト時間（ミリ秒）
 * @param {Function} [consumeResponse=(res) => res] - レスポンス消費関数（例: async (res) => res.json()）
 * @returns {Promise<any>} fetchおよびレスポンス消費の結果
 */
async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = API_TIMEOUT_MS,
  consumeResponse = (response) => response
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return await consumeResponse(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * プレイヤーのポイント情報をサーバーへ同期・送信します。
 * 各種交換所（挑戦、防衛、夢幻など）の共通API同期処理を共通化。
 *
 * @param {string} endpoint - APIエンドポイントファイル名（例: 'update_challenge_points.php'）
 * @param {number} points - 現在の所持ポイント
 * @param {number} totalPoints - 累計獲得ポイント
 */
export function savePointsToServer(
  endpoint,
  points,
  totalPoints,
  extraBody = {}
) {
  try {
    const uuid = getOrCreateUUID?.();
    if (!uuid) return Promise.resolve(false);

    const playerName = resolvePlayerName();

    return fetchWithTimeout(
      `api/${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuid: uuid,
          name: playerName,
          points: points,
          total_points: totalPoints,
          ...extraBody,
        }),
        keepalive: true,
      },
      API_TIMEOUT_MS,
      async (res) => {
        if (!res.ok) {
          console.error(
            `サーバーへのポイント同期（${endpoint}）に失敗しました。ステータス: ${res.status}`
          );
          return null;
        }
        return await res.json().catch(() => null);
      }
    )
      .then((result) => {
        if (!result || !result.success) {
          console.error(
            `サーバーへのポイント同期（${endpoint}）をサーバーが拒否または失敗しました:`,
            result?.error || 'Unknown error'
          );
          return false;
        }
        console.log(`サーバーへのポイント同期（${endpoint}）に成功しました。`);
        return true;
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          console.error(
            `サーバーへのポイント同期（${endpoint}）がタイムアウトしました。`
          );
        } else {
          console.error(
            `サーバーへのポイント同期（${endpoint}）で通信エラーが発生しました:`,
            err
          );
        }
        return false;
      });
  } catch (e) {
    console.error('サーバーへのポイント同期処理で例外が発生しました:', e);
    return Promise.resolve(false);
  }
}

/**
 * 全プレイヤーのデッキ・プロフィールデータをサーバーから取得します（キャッシュ対策パラメータ付き）。
 * @returns {Promise<Object>} APIレスポンスオブジェクト
 */
export async function fetchPlayerDecks() {
  return await fetchWithTimeout(
    `api/get_player_decks.php?t=${Date.now()}`,
    {},
    API_TIMEOUT_MS,
    async (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to fetch player decks. Status: ${response.status}`
        );
      }
      return await response.json();
    }
  );
}

/**
 * サーバー応答からAutomata版の運命の邂逅・最大累計コストを解決する
 * 新フィールドが無い旧データの場合は旧フィールドへフォールバックする
 * @param {Object} serverPlayerData - サーバーのプレイヤーデータ
 * @returns {number} 最大累計コスト
 */
export function resolveFortuneMaxCostAutomata(serverPlayerData) {
  if (!serverPlayerData) return 0;
  return (
    serverPlayerData.fortune_max_total_cost_automata ??
    serverPlayerData.fortune_max_total_cost ??
    0
  );
}

/**
 * サーバーから取得した高難易度クリアデータを安全にパースする
 * @param {string|Object|null|undefined} raw - サーバーのクリアデータ
 * @returns {Record<string, boolean>} クリア状況マップ
 */
export function parseHighDifficultyClearedData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

/**
 * ローカルとサーバーの高難易度クリア状況マップをORマージする
 * @param {Record<string, boolean>} local - ローカルのクリアマップ
 * @param {Record<string, boolean>} server - サーバーのクリアマップ
 * @returns {Record<string, boolean>} マージ後のクリアマップ
 */
export function mergeHighDifficultyClearedData(local, server) {
  return { ...(server || {}), ...(local || {}) };
}

/**
 * ローカル側にサーバー未送信の高難易度クリア済みボスが存在するか判定する
 * @param {Record<string, boolean>} local - ローカルのクリアマップ
 * @param {Record<string, boolean>} server - サーバーのクリアマップ
 * @returns {boolean} 未送信データが存在するかどうか
 */
export function hasUnsyncedHighDifficultyClear(local, server) {
  for (const [charId, cleared] of Object.entries(local || {})) {
    if (cleared && !server?.[charId]) {
      return true;
    }
  }
  return false;
}

/**
 * 現在の LocalStorage および GameState から最新の所持情報（インベントリ、スキン、プレイマット、アイコン、プレミアムカード）を取得・統合します。
 *
 * @returns {{
 *   inventory: Record<string, number>,
 *   unlockedSkins: Array<string>,
 *   unlockedPlaymats: Array<string>,
 *   unlockedIcons: Array<string>,
 *   unlockedPremiumCards: Array<string>
 * }} 最新の所持情報オブジェクト
 */
export function getLatestOwnership() {
  const inventory = {
    ...(safeParseObject(INVENTORY_KEY) || {}),
    ...(GameState.playerInventory &&
    typeof GameState.playerInventory === 'object'
      ? GameState.playerInventory
      : {}),
  };

  const unlockedSkins = [
    ...new Set([
      ...safeParseArray(UNLOCKED_SKINS_KEY),
      ...(Array.isArray(GameState.unlockedSkins)
        ? GameState.unlockedSkins
        : []),
    ]),
  ];

  const unlockedPlaymats = [
    ...new Set([
      ...safeParseArray(OWNED_PLAYMATS_KEY),
      ...(Array.isArray(GameState.ownedPlaymats)
        ? GameState.ownedPlaymats
        : []),
    ]),
  ];

  const unlockedIcons = [
    ...new Set([
      ...safeParseArray(UNLOCKED_ICONS_KEY),
      ...(Array.isArray(GameState.unlockedIcons)
        ? GameState.unlockedIcons
        : []),
    ]),
  ];

  const unlockedPremiumCards = [
    ...new Set([
      ...safeParseArray(UNLOCKED_PREMIUM_KEY),
      ...(Array.isArray(GameState.unlockedPremiumCards)
        ? GameState.unlockedPremiumCards
        : []),
    ]),
  ];

  return {
    inventory,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    unlockedPremiumCards,
  };
}

/**
 * 交換所ラインナップとプレイヤーの所持情報から、消費された累計ポイントを算出します。
 *
 * @param {Array<Object>} lineup - 交換所アイテム定義配列
 * @param {Object|null} [ownership=null] - 所持状況オブジェクト（指定がない場合はgetLatestOwnershipから取得）
 * @returns {number} 消費された累計ポイント
 */
export function calculateSpentPoints(lineup, ownership = null) {
  if (!Array.isArray(lineup) || lineup.length === 0) return 0;

  const toObject = (value, fallbackValue) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : fallbackValue || {};
  const toArray = (value, fallbackValue) =>
    Array.isArray(value) ? value : fallbackValue || [];

  const fallback = ownership ? null : getLatestOwnership();

  const inventory = toObject(
    ownership?.inventory,
    fallback?.inventory ?? getLatestOwnership().inventory
  );
  const unlockedSkins = toArray(
    ownership?.unlockedSkins,
    fallback?.unlockedSkins ?? getLatestOwnership().unlockedSkins
  );
  const unlockedPlaymats = toArray(
    ownership?.unlockedPlaymats,
    fallback?.unlockedPlaymats ?? getLatestOwnership().unlockedPlaymats
  );
  const unlockedIcons = toArray(
    ownership?.unlockedIcons,
    fallback?.unlockedIcons ?? getLatestOwnership().unlockedIcons
  );
  const unlockedPremium = toArray(
    ownership?.unlockedPremiumCards ?? ownership?.unlockedPremium,
    fallback?.unlockedPremiumCards ?? getLatestOwnership().unlockedPremiumCards
  );

  let spent = 0;
  for (const item of lineup) {
    if (!item || !Number.isFinite(item.cost) || item.cost <= 0) continue;

    if (item.type === 'card') {
      const count = inventory[item.id] || 0;
      spent += count * item.cost;
    } else if (item.type === 'skin') {
      if (unlockedSkins.includes(item.id)) {
        spent += item.cost;
      }
    } else if (item.type === 'playmat') {
      if (unlockedPlaymats.includes(item.id)) {
        spent += item.cost;
      }
    } else if (item.type === 'icon') {
      if (unlockedIcons.includes(item.id)) {
        spent += item.cost;
      }
    } else if (item.type === 'premium') {
      if (unlockedPremium.includes(item.id)) {
        spent += item.cost;
      }
    }
  }

  return spent;
}

/**
 * 運命の邂逅（Fortuneモード）の特級目標クリアデータから累計獲得ポイントの理論値を算出します。
 * @param {Object|null} [clearedAutomata=null] - マキナのクリアデータ
 * @param {Object|null} [clearedValkyria=null] - アンジェのクリアデータ
 * @returns {number} 特級目標達成による累計獲得ポイント
 */
export function calculateFortuneTotalPointsFromCleared(
  clearedAutomata = null,
  clearedValkyria = null
) {
  const autoData = clearedAutomata || loadFortuneClearedData('automata');
  const valkData = clearedValkyria || loadFortuneClearedData('valkyria');

  let totalEarned = 0;
  totalEarned += calculateHandicapPointsFromMap(autoData?.clearedHandicaps);
  totalEarned += calculateHandicapPointsFromMap(valkData?.clearedHandicaps);

  return totalEarned;
}

/**
 * 累計ポイントと交換済みアイテム消費ポイントから、所持ポイントの期待値（失われたポイントの復元）を検証・修復します。
 *
 * @param {number} currentPoints - 現在の所持ポイント
 * @param {number} totalPoints - 累計獲得ポイント
 * @param {Array<Object>} lineup - 当該交換所のラインナップ
 * @param {Object|null} [ownership=null] - 所持状況オブジェクト
 * @returns {{ current: number, total: number, spent: number, reconciled: boolean }} 修復後のポイント情報
 */
export function reconcilePointsWithPurchases(
  currentPoints,
  totalPoints,
  lineup,
  ownership = null
) {
  const cPts = Math.max(0, parseInt(currentPoints, 10) || 0);
  const tPts = Math.max(0, parseInt(totalPoints, 10) || 0);
  const spent = calculateSpentPoints(lineup, ownership);

  let finalCurrent = cPts;
  let finalTotal = tPts;
  let reconciled = false;

  // 1. 所持ポイントが期待値より少ない場合（ポイント消失状態）
  // ※防御策: spent が 0 の場合、所持データが未ロード/未検出である可能性があり、
  // cPts < tPts であることのみを理由に全額返還（finalCurrent = tPts）するとポイント増殖バグを招くため、
  // spent > 0（実際にアイテム所持・消費が確認できた場合）にのみ期待値修復を実行する。
  if (spent > 0) {
    const expectedCurrent = Math.max(0, tPts - spent);
    if (cPts < expectedCurrent) {
      finalCurrent = expectedCurrent;
      reconciled = true;
    }
  }

  // 2. 所持ポイント＋消費ポイントが累計ポイントを超えている場合（累計ポイント記録漏れ等）
  // 累計ポイントを上方修正する
  if (finalCurrent + spent > finalTotal) {
    finalTotal = finalCurrent + spent;
    reconciled = true;
  }

  return {
    current: finalCurrent,
    total: finalTotal,
    spent,
    reconciled,
  };
}

/**
 * 特定のゲームモードのポイント情報をローカルとサーバーで同期・復旧します。
 * 交換済みアイテムと総ポイントに基づくポイント自己修復も自動実行します。
 *
 * @param {string} mode - 'challenge', 'tournament', 'defense', 'fortune', 'high_difficulty' のいずれか
 * @param {Object} serverPlayerData - サーバーから取得した当該UUIDのプレイヤーデータオブジェクト(未指定の場合はスキップ)
 * @returns {Promise<Object|null>} 同期後の { points, totalPoints, ...extraData } または同期不要なら null
 */
export async function syncModePoints(mode, serverPlayerData = null) {
  if (!mode) return null;

  try {
    let localPts = 0;
    let localTotal = 0;
    let pointsKey = '';
    let pointsTotalKey = '';
    let endpoint = '';
    let extraData = {};
    let sPts = 0;
    let sTotal = 0;

    const lineup = EXCHANGE_LINEUPS_BY_MODE[mode] || [];

    if (mode === 'challenge') {
      pointsKey = CHALLENGE_POINTS_KEY;
      pointsTotalKey = CHALLENGE_TOTAL_POINTS_KEY;
      localPts = parseInt(localStorage.getItem(CHALLENGE_POINTS_KEY), 10) || 0;
      localTotal =
        parseInt(localStorage.getItem(CHALLENGE_TOTAL_POINTS_KEY), 10) || 0;
      const maxStreak =
        parseInt(localStorage.getItem(DUNGEON_MAX_STREAK_KEY), 10) || 0;

      endpoint = 'update_challenge_points.php';
      extraData = { max_streak: maxStreak };

      if (serverPlayerData) {
        sPts = serverPlayerData.challenge_points || 0;
        sTotal = serverPlayerData.challenge_total_points || 0;
      }
    } else if (mode === 'tournament') {
      pointsKey = TOURNAMENT_POINTS_KEY;
      pointsTotalKey = TOURNAMENT_TOTAL_POINTS_KEY;
      localPts = parseInt(localStorage.getItem(TOURNAMENT_POINTS_KEY), 10) || 0;
      localTotal =
        parseInt(localStorage.getItem(TOURNAMENT_TOTAL_POINTS_KEY), 10) || 0;

      endpoint = 'update_tournament_points.php';

      if (serverPlayerData) {
        sPts = serverPlayerData.tournament_points || 0;
        sTotal = serverPlayerData.tournament_total_points || 0;
      }
    } else if (mode === 'defense') {
      pointsKey = DEFENSE_POINTS_KEY;
      pointsTotalKey = DEFENSE_TOTAL_POINTS_KEY;
      localPts = parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0;
      localTotal =
        parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) || 0;
      const wins = parseInt(localStorage.getItem(DEFENSE_WINS_KEY), 10) || 0;

      endpoint = 'update_points.php';
      extraData = { defense_wins: wins };

      if (serverPlayerData) {
        sPts = serverPlayerData.points || 0;
        sTotal = serverPlayerData.total_points || 0;
      }
    } else if (mode === 'fortune') {
      pointsKey = FORTUNE_POINTS_KEY;
      pointsTotalKey = FORTUNE_TOTAL_POINTS_KEY;
      localPts = parseInt(localStorage.getItem(FORTUNE_POINTS_KEY), 10) || 0;
      localTotal =
        parseInt(localStorage.getItem(FORTUNE_TOTAL_POINTS_KEY), 10) || 0;
      const clearedAutomata = loadFortuneClearedData('automata');
      const clearedValkyria = loadFortuneClearedData('valkyria');

      // クリア済み特級目標から理論上の最低累計ポイントを算出し、ローカルの累計ポイントの下限を保証
      const minFortuneTotal = calculateFortuneTotalPointsFromCleared(
        clearedAutomata,
        clearedValkyria
      );
      localTotal = Math.max(localTotal, minFortuneTotal);

      const maxGrade = Math.max(
        clearedAutomata.maxGradeLevel || 0,
        clearedValkyria.maxGradeLevel || 0,
        0
      );

      endpoint = 'update_fortune_points.php';
      extraData = {
        fortune_max_grade: maxGrade,
        fortune_max_total_cost_automata: clearedAutomata.maxTotalCost || 0,
        fortune_max_total_cost_valkyria: clearedValkyria.maxTotalCost || 0,
      };

      if (serverPlayerData) {
        sPts = serverPlayerData.fortune_points || 0;
        sTotal = serverPlayerData.fortune_total_points || 0;
      }
    } else if (mode === 'high_difficulty') {
      pointsKey = HIGH_DIFFICULTY_POINTS_KEY;
      pointsTotalKey = HIGH_DIFFICULTY_TOTAL_POINTS_KEY;
      localPts =
        parseInt(localStorage.getItem(HIGH_DIFFICULTY_POINTS_KEY), 10) || 0;
      localTotal =
        parseInt(localStorage.getItem(HIGH_DIFFICULTY_TOTAL_POINTS_KEY), 10) ||
        0;
      const localCleared = loadHighDifficultyClearedData();
      const serverCleared = serverPlayerData
        ? parseHighDifficultyClearedData(
            serverPlayerData.high_difficulty_cleared
          )
        : {};
      const mergedCleared = mergeHighDifficultyClearedData(
        localCleared,
        serverCleared
      );

      // サーバー側にローカル未反映のクリア済みボスがあればローカルのLocalStorageに復元・保存
      if (
        serverPlayerData &&
        Object.keys(mergedCleared).length > Object.keys(localCleared).length
      ) {
        try {
          localStorage.setItem(
            HIGH_DIFFICULTY_CLEARED_KEY,
            JSON.stringify(mergedCleared)
          );
        } catch (e) {
          console.error('高難易度クリア状態の復元保存に失敗しました:', e);
        }
      }

      endpoint = 'update_high_difficulty_points.php';
      extraData = {
        high_difficulty_cleared: JSON.stringify(mergedCleared),
      };

      if (serverPlayerData) {
        sPts = serverPlayerData.high_difficulty_points || 0;
        sTotal = serverPlayerData.high_difficulty_total_points || 0;
      }
    } else {
      return null;
    }

    // サーバーデータが存在する場合
    if (serverPlayerData) {
      const serverAutomataMaxCost =
        resolveFortuneMaxCostAutomata(serverPlayerData);
      const serverValkyriaMaxCost =
        serverPlayerData.fortune_max_total_cost_valkyria ?? 0;

      // Fortuneモードにおいて、ローカル側の進行情報（最大グレードや最大累計コスト）がサーバーを上回っているか判定
      const shouldSyncFortuneProgress =
        mode === 'fortune' &&
        ((extraData.fortune_max_grade || 0) >
          (serverPlayerData.fortune_max_grade || 0) ||
          (extraData.fortune_max_total_cost_automata || 0) >
            serverAutomataMaxCost ||
          (extraData.fortune_max_total_cost_valkyria || 0) >
            serverValkyriaMaxCost);

      // High Difficultyモードにおいて、ローカルにサーバー未送信のクリア済みボスが存在するか判定
      const localCleared = loadHighDifficultyClearedData();
      const serverCleared = parseHighDifficultyClearedData(
        serverPlayerData.high_difficulty_cleared
      );
      const shouldSyncHighDifficultyProgress =
        mode === 'high_difficulty' &&
        hasUnsyncedHighDifficultyClear(localCleared, serverCleared);

      // ローカルとサーバーの値をマージした上で、交換済みアイテムと総ポイントの整合性修復を実行
      const mergedTotal = Math.max(localTotal, sTotal);
      const mergedCurrent = Math.max(localPts, sPts);
      const recon = reconcilePointsWithPurchases(
        mergedCurrent,
        mergedTotal,
        lineup
      );
      const finalPts = recon.current;
      const finalTotal = recon.total;

      // ローカルストレージに修復・マージ後の値を保存
      if (pointsKey) {
        localStorage.setItem(pointsKey, String(finalPts));
      }
      if (pointsTotalKey) {
        localStorage.setItem(pointsTotalKey, String(finalTotal));
      }

      const mergedAutomataMaxCost = Math.max(
        extraData.fortune_max_total_cost_automata || 0,
        serverAutomataMaxCost || 0
      );
      const mergedValkyriaMaxCost = Math.max(
        extraData.fortune_max_total_cost_valkyria || 0,
        serverValkyriaMaxCost || 0
      );

      const syncExtraData =
        mode === 'fortune'
          ? {
              ...extraData,
              fortune_max_grade: Math.max(
                extraData.fortune_max_grade || 0,
                serverPlayerData.fortune_max_grade || 0
              ),
              fortune_max_total_cost_automata: mergedAutomataMaxCost,
              fortune_max_total_cost_valkyria: mergedValkyriaMaxCost,
              fortune_max_total_cost: Math.max(
                extraData.fortune_max_total_cost || 0,
                serverPlayerData.fortune_max_total_cost || 0,
                mergedAutomataMaxCost,
                mergedValkyriaMaxCost
              ),
            }
          : extraData;

      // サーバー側の値と不一致、または修復・進行情報更新がある場合はサーバーへ同期
      if (
        finalTotal !== sTotal ||
        finalPts !== sPts ||
        recon.reconciled ||
        shouldSyncFortuneProgress ||
        shouldSyncHighDifficultyProgress
      ) {
        const saved = await savePointsToServer(
          endpoint,
          finalPts,
          finalTotal,
          syncExtraData
        );
        if (!saved) return null;
        return { points: finalPts, totalPoints: finalTotal, ...syncExtraData };
      }
    } else {
      // サーバーデータがない場合（新規プレイヤーまたはオフライン時）
      const recon = reconcilePointsWithPurchases(localPts, localTotal, lineup);
      const finalPts = recon.current;
      const finalTotal = recon.total;

      if (pointsKey) {
        localStorage.setItem(pointsKey, String(finalPts));
      }
      if (pointsTotalKey) {
        localStorage.setItem(pointsTotalKey, String(finalTotal));
      }

      const hasFortuneProgress =
        mode === 'fortune' &&
        (extraData.fortune_max_grade > 0 ||
          extraData.fortune_max_total_cost_automata > 0 ||
          extraData.fortune_max_total_cost_valkyria > 0);

      const hasHighDiffProgress =
        mode === 'high_difficulty' &&
        Object.keys(loadHighDifficultyClearedData()).length > 0;

      if (finalTotal > 0 || hasFortuneProgress || hasHighDiffProgress) {
        const saved = await savePointsToServer(
          endpoint,
          finalPts,
          finalTotal,
          extraData
        );
        if (!saved) return null;
        return { points: finalPts, totalPoints: finalTotal, ...extraData };
      }
    }
  } catch (e) {
    console.error(`Failed to sync points for mode ${mode}:`, e);
  }
  return null;
}

/**
 * プロフィール（名前・アイコンなど）をサーバーと同期します。
 *
 * @param {string} uuid - プレイヤーのUUID
 * @param {string} name - プレイヤー名
 * @param {string} icon - アイコンID
 * @param {string} character - 選択キャラクターID (オプション)
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function syncUserProfile(
  uuid,
  name,
  icon,
  character,
  favoriteCard
) {
  if (!uuid) return false;

  try {
    // undefinedの場合のみ既存値にフォールバック（nullは解除を意味する）
    const favCardToSync =
      favoriteCard !== undefined
        ? favoriteCard
        : GameState.userProfile?.favoriteCard || null;

    const result = await fetchWithTimeout(
      'api/update_profile.php',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuid,
          name,
          icon: resolveValidIconId(icon),
          character,
          favoriteCard: favCardToSync,
        }),
      },
      API_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          console.error(`Profile sync failed. Status: ${response.status}`);
          return null;
        }
        return await response.json();
      }
    );

    if (!result) return false;
    if (result.success) {
      console.log('Profile successfully synced to server.');
      return true;
    } else {
      console.warn('Server failed to sync profile:', result.error);
      return false;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Profile sync timed out.');
    } else {
      console.warn(
        'Failed to sync profile to server, saved locally only:',
        err
      );
    }
    return false;
  }
}

/**
 * 防衛戦の対戦結果を防衛対象者(targetUuid)のサーバー防衛履歴へ送信します。
 *
 * @param {string} targetUuid - 防衛者のUUID
 * @param {Object} data - { attackerName, attackerCharacter, attackerSkin, attackerTotalPoints, attackerDeck, defenderCharacter, defenderSkin, defenderDeck, result }
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function recordDefenseBattleToServer(targetUuid, data) {
  if (!targetUuid) return false;

  try {
    const resData = await fetchWithTimeout(
      'api/record_defense_battle.php',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_uuid: targetUuid,
          attacker_uuid: data.attackerUuid || getOrCreateUUID(),
          attacker_name: data.attackerName,
          attacker_character: data.attackerCharacter,
          attacker_skin: data.attackerSkin || 'default',
          attacker_total_points: data.attackerTotalPoints,
          attacker_deck: data.attackerDeck,
          defender_character: data.defenderCharacter,
          defender_skin: data.defenderSkin || 'default',
          defender_deck: data.defenderDeck,
          result: data.result,
        }),
        keepalive: true,
      },
      DEFENSE_RECORD_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          console.error(
            `Record defense battle failed. Status: ${response.status}`
          );
          return null;
        }
        return await response.json();
      }
    );

    return !!resData?.success;
  } catch (err) {
    console.error('Failed to record defense battle to server:', err);
    return false;
  }
}

/**
 * アプリ起動時のハートビートをサーバに送信します。
 * プレイヤーの存在・プロフィール・所持カード・プレミアム解放・全登録デッキをサーバに登録・同期し、
 * 最終アクセス日時（タイムスタンプ）を更新します。
 *
 * @returns {Promise<boolean>} 送信成功したかどうか
 */
export async function sendHeartbeat() {
  try {
    const uuid = getOrCreateUUID();
    if (!uuid) return false;

    // プロフィール情報をLocalStorageから取得（不正値はデフォルトにフォールバック）
    const name = resolvePlayerName();
    const icon = resolveValidIconId(localStorage.getItem(PROFILE_ICON_KEY));

    // 所持カード（インベントリ）をLocalStorage/GameStateから取得
    let inventory = {};
    try {
      const invSaved = localStorage.getItem(INVENTORY_KEY);
      if (invSaved) {
        inventory = JSON.parse(invSaved);
      } else if (GameState.playerInventory) {
        inventory = GameState.playerInventory;
      }
    } catch {
      inventory = GameState.playerInventory || {};
    }

    // 解放済みプレミアムカードをLocalStorage/GameStateから取得
    let unlockedPremiumCards = [];
    try {
      const premSaved = localStorage.getItem(UNLOCKED_PREMIUM_KEY);
      if (premSaved) {
        unlockedPremiumCards = JSON.parse(premSaved);
      } else if (GameState.unlockedPremiumCards) {
        unlockedPremiumCards = GameState.unlockedPremiumCards;
      }
    } catch {
      unlockedPremiumCards = GameState.unlockedPremiumCards || [];
    }

    // 全登録デッキ一覧をLocalStorage/GameStateから取得
    let registeredDecks = [];
    try {
      const decksSaved = localStorage.getItem('mini_card_battle_decks');
      if (decksSaved) {
        registeredDecks = JSON.parse(decksSaved);
      } else if (Array.isArray(GameState.decks) && GameState.decks.length > 0) {
        registeredDecks = GameState.decks;
      }
    } catch {
      registeredDecks = Array.isArray(GameState.decks) ? GameState.decks : [];
    }

    const result = await fetchWithTimeout(
      'api/heartbeat.php',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuid,
          name,
          icon,
          inventory,
          unlocked_premium_cards: unlockedPremiumCards,
          registered_decks: registeredDecks,
        }),
        keepalive: true,
      },
      HEARTBEAT_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          console.error(
            `ハートビート送信に失敗しました。ステータス: ${response.status}`
          );
          return null;
        }
        return await response.json();
      }
    );

    if (!result) return false;
    if (result.success) {
      // 送信成功時にタイムスタンプを記録
      localStorage.setItem(LAST_HEARTBEAT_KEY, String(Date.now()));
      console.log(
        `ハートビート送信成功${result.isNewPlayer ? '（新規プレイヤー登録）' : ''}`
      );
      return true;
    }
    return false;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('ハートビート送信がタイムアウトしました。');
    } else {
      console.error('ハートビート送信で通信エラーが発生しました:', err);
    }
    return false;
  }
}

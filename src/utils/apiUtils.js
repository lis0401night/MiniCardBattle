import { getOrCreateUUID, resolvePlayerName } from './gameUtils.js';
import { resolveValidIconId } from './constants/avatars.js';
import { GameState } from '../state/gameState.js';
import { loadFortuneClearedData } from './constants/fortuneRewards.js';
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
  DUNGEON_MAX_STREAK_KEY,
  LAST_HEARTBEAT_KEY,
  PROFILE_ICON_KEY,
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
 * 特定のゲームモードのポイント情報をローカルとサーバーで同期・復旧します。
 *
 * @param {string} mode - 'challenge', 'tournament', 'defense', 'fortune' のいずれか
 * @param {Object} serverPlayerData - サーバーから取得した当該UUIDのプレイヤーデータオブジェクト(未指定の場合はスキップ)
 * @returns {Promise<Object|null>} 同期後の { points, totalPoints, ...extraData } または同期不要なら null
 */
export async function syncModePoints(mode, serverPlayerData = null) {
  if (!mode) return null;

  try {
    let localPts = 0;
    let localTotal = 0;
    let endpoint = '';
    let extraData = {};
    let sPts = 0;
    let sTotal = 0;

    if (mode === 'challenge') {
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
      localPts = parseInt(localStorage.getItem(TOURNAMENT_POINTS_KEY), 10) || 0;
      localTotal =
        parseInt(localStorage.getItem(TOURNAMENT_TOTAL_POINTS_KEY), 10) || 0;

      endpoint = 'update_tournament_points.php';

      if (serverPlayerData) {
        sPts = serverPlayerData.tournament_points || 0;
        sTotal = serverPlayerData.tournament_total_points || 0;
      }
    } else if (mode === 'defense') {
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
      localPts = parseInt(localStorage.getItem(FORTUNE_POINTS_KEY), 10) || 0;
      localTotal =
        parseInt(localStorage.getItem(FORTUNE_TOTAL_POINTS_KEY), 10) || 0;
      const clearedAutomata = loadFortuneClearedData('automata');
      const clearedValkyria = loadFortuneClearedData('valkyria');
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
    } else {
      return null;
    }

    // サーバーデータが存在する場合、ローカルが進んでいればサーバーを同期して更新
    if (serverPlayerData) {
      const serverAutomataMaxCost =
        resolveFortuneMaxCostAutomata(serverPlayerData);

      // Fortuneモードにおいて、ポイント以外の進行情報（最大グレードや最大累計コスト）がサーバーより更新されているか判定
      const shouldSyncFortuneProgress =
        mode === 'fortune' &&
        (extraData.fortune_max_grade >
          (serverPlayerData.fortune_max_grade || 0) ||
          extraData.fortune_max_total_cost_automata > serverAutomataMaxCost ||
          extraData.fortune_max_total_cost_valkyria >
            (serverPlayerData.fortune_max_total_cost_valkyria || 0));

      if (localTotal > sTotal || localPts > sPts || shouldSyncFortuneProgress) {
        // ポイントおよび進行情報は必ずサーバー値との最大値を送信し、他端末で稼いだ記録の巻き戻しを防ぐ
        const sendPts = Math.max(localPts, sPts);
        const sendTotal = Math.max(localTotal, sTotal);
        const syncExtraData =
          mode === 'fortune'
            ? {
                ...extraData,
                fortune_max_grade: Math.max(
                  extraData.fortune_max_grade || 0,
                  serverPlayerData.fortune_max_grade || 0
                ),
                fortune_max_total_cost_automata: Math.max(
                  extraData.fortune_max_total_cost_automata || 0,
                  serverAutomataMaxCost || 0
                ),
                fortune_max_total_cost_valkyria: Math.max(
                  extraData.fortune_max_total_cost_valkyria || 0,
                  serverPlayerData.fortune_max_total_cost_valkyria || 0
                ),
              }
            : extraData;

        const saved = await savePointsToServer(
          endpoint,
          sendPts,
          sendTotal,
          syncExtraData
        );
        if (!saved) return null;
        return { points: sendPts, totalPoints: sendTotal, ...syncExtraData };
      }
    } else {
      // サーバーデータがない場合（新規プレイヤーかつ初回同期）、ローカルに蓄積されたスコアまたは進行データがあればサーバーに新規構築する
      const hasFortuneProgress =
        mode === 'fortune' &&
        (extraData.fortune_max_grade > 0 ||
          extraData.fortune_max_total_cost_automata > 0 ||
          extraData.fortune_max_total_cost_valkyria > 0);

      if (localTotal > 0 || hasFortuneProgress) {
        const saved = await savePointsToServer(
          endpoint,
          localPts,
          localTotal,
          extraData
        );
        if (!saved) return null;
        return { points: localPts, totalPoints: localTotal, ...extraData };
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
      const invSaved = localStorage.getItem('mini_card_battle_inventory');
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
      const premSaved = localStorage.getItem(
        'mini_card_battle_unlocked_premium'
      );
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

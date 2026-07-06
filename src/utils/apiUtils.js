import { getOrCreateUUID, resolvePlayerName } from './gameUtils.js';
import {
  CHALLENGE_POINTS_KEY,
  CHALLENGE_TOTAL_POINTS_KEY,
  TOURNAMENT_POINTS_KEY,
  TOURNAMENT_TOTAL_POINTS_KEY,
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
  DEFENSE_WINS_KEY,
  DUNGEON_MAX_STREAK_KEY,
} from './constants/config.js';

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    return fetch(`api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid: uuid,
        name: playerName,
        points: points,
        total_points: totalPoints,
        ...extraBody,
      }),
      keepalive: true, // 画面遷移やアンマウント後も通信を裏で維持する
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.error(
            `サーバーへのポイント同期（${endpoint}）に失敗しました。ステータス: ${res.status}`
          );
          return false;
        } else {
          console.log(
            `サーバーへのポイント同期（${endpoint}）に成功しました。`
          );
          return true;
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
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
  const response = await fetch(`api/get_player_decks.php?t=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch player decks. Status: ${response.status}`);
  }
  return response.json();
}

/**
 * 特定のゲームモードのポイント情報をローカルとサーバーで同期・復旧します。
 *
 * @param {string} mode - 'challenge', 'tournament', 'defense' のいずれか
 * @param {Object} serverPlayerData - サーバーから取得した当該UUIDのプレイヤーデータオブジェクト(未指定の場合はスキップ)
 * @returns {Promise<Object|null>} 同期後の { points, totalPoints } または同期不要なら null
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
    } else {
      return null;
    }

    // サーバーデータが存在する場合、ローカルが進んでいればサーバーを同期して更新
    if (serverPlayerData) {
      if (localTotal > sTotal || localPts > sPts) {
        await savePointsToServer(endpoint, localPts, localTotal, extraData);
        return { points: localPts, totalPoints: localTotal };
      }
    } else {
      // サーバーデータがない場合（新規プレイヤーかつ初回同期）、ローカルに蓄積されたスコアがあればサーバーに新規構築する
      if (localTotal > 0) {
        await savePointsToServer(endpoint, localPts, localTotal, extraData);
        return { points: localPts, totalPoints: localTotal };
      }
    }
  } catch (e) {
    console.error(`Failed to sync points for mode ${mode}:`, e);
  }
  return null;
}

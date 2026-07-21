import { getOrCreateUUID, resolvePlayerName } from './gameUtils.js';
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`api/get_player_decks.php?t=${Date.now()}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch player decks. Status: ${response.status}`
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
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
    } else if (mode === 'fortune') {
      localPts = parseInt(localStorage.getItem(FORTUNE_POINTS_KEY), 10) || 0;
      localTotal =
        parseInt(localStorage.getItem(FORTUNE_TOTAL_POINTS_KEY), 10) || 0;
      const clearedData = loadFortuneClearedData('automata');
      const maxGrade = Math.max(clearedData.maxGradeLevel, 0);

      endpoint = 'update_fortune_points.php';
      extraData = { fortune_max_grade: maxGrade };

      if (serverPlayerData) {
        sPts = serverPlayerData.fortune_points || 0;
        sTotal = serverPlayerData.fortune_total_points || 0;
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
  character = null,
  favoriteCard = null
) {
  if (!uuid) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const favCardToSync =
      favoriteCard || GameState.userProfile?.favoriteCard || null;

    const response = await fetch('api/update_profile.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid,
        name,
        icon,
        character,
        favoriteCard: favCardToSync,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Profile sync failed. Status: ${response.status}`);
      return false;
    }
    const result = await response.json();
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 防衛戦の対戦結果を防衛対象者(targetUuid)のサーバー防衛履歴へ送信します。
 *
 * @param {string} targetUuid - 防衛者のUUID
 * @param {Object} data - { attackerName, attackerCharacter, attackerSkin, attackerTotalPoints, attackerDeck, result }
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function recordDefenseBattleToServer(targetUuid, data) {
  if (!targetUuid) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch('api/record_defense_battle.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_uuid: targetUuid,
        attacker_name: data.attackerName,
        attacker_character: data.attackerCharacter,
        attacker_skin: data.attackerSkin || 'default',
        attacker_total_points: data.attackerTotalPoints,
        attacker_deck: data.attackerDeck,
        result: data.result,
      }),
      keepalive: true,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Record defense battle failed. Status: ${response.status}`);
      return false;
    }
    const resData = await response.json();
    return !!resData.success;
  } catch (err) {
    console.error('Failed to record defense battle to server:', err);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

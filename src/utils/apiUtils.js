import { getOrCreateUUID } from './gameUtils.js';
import { PROFILE_NAME_KEY } from './constants/config.js';

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

    const playerName = localStorage.getItem(PROFILE_NAME_KEY) || 'Player';

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

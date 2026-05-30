import { getOrCreateUUID } from './gameUtils.js';

/**
 * プレイヤーのポイント情報をサーバーへ同期・送信します。
 * 各種交換所（挑戦、防衛、夢幻など）の共通API同期処理を共通化。
 *
 * @param {string} endpoint - APIエンドポイントファイル名（例: 'update_challenge_points.php'）
 * @param {number} points - 現在の所持ポイント
 * @param {number} totalPoints - 累計獲得ポイント
 */
export function savePointsToServer(endpoint, points, totalPoints) {
  try {
    const uuid = getOrCreateUUID?.();
    if (!uuid) return;

    const playerName =
      localStorage.getItem('mini_card_battle_player_name') || 'Player';
    fetch(`api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid: uuid,
        name: playerName,
        points: points,
        total_points: totalPoints,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          console.error(`サーバーへのポイント同期（${endpoint}）に失敗しました。ステータス: ${res.status}`);
        } else {
          console.log(`サーバーへのポイント同期（${endpoint}）に成功しました。`);
        }
      })
      .catch((err) => {
        console.error(`サーバーへのポイント同期（${endpoint}）で通信エラーが発生しました:`, err);
      });
  } catch (e) {
    console.error('サーバーへのポイント同期処理で例外が発生しました:', e);
  }
}


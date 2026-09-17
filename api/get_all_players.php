<?php
/**
 * Mini Card Battle - Get All Players API
 * 
 * サーバーに登録されている全プレイヤーの完全なデータを取得します。
 * デッキ情報を含む全データを返します（playerdata.html用）。
 * 
 * @method GET
 * @return json 全プレイヤーのフルデータを含む配列
 */

require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

$players = loadAllPlayers(true);

// 全体対戦ログ (api/decks/recent_battles.json) の読み込み
$recentLogFile = __DIR__ . '/decks/recent_battles.json';
$recentBattles = [];
if (file_exists($recentLogFile)) {
    // 書き込み中の不完全なJSONを読まないよう共有ロック(LOCK_SH)を取得する
    $rfp = @fopen($recentLogFile, 'r');
    if ($rfp) {
        if (flock($rfp, LOCK_SH)) {
            $rfSize = filesize($recentLogFile);
            $recentContent = $rfSize > 0 ? stream_get_contents($rfp) : '';
            flock($rfp, LOCK_UN);
            if ($recentContent !== false && $recentContent !== '') {
                $decoded = json_decode($recentContent, true);
                $recentBattles = is_array($decoded) ? $decoded : [];
            }
        }
        fclose($rfp);
    }
}

echo json_encode([
    'success' => true,
    'players' => $players,
    'recent_battles' => array_slice($recentBattles, 0, 2000),
]);

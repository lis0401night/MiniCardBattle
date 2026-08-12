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

header('Content-Type: application/json');

$dir = __DIR__ . '/decks/players';
$players = [];

if (is_dir($dir)) {
    $files = glob("{$dir}/*.js");
    foreach ($files as $file) {
        $content = file_get_contents($file);
        // JSファイルからPlayerDataを抽出するための同期パース
        // 形式: PLAYER_DECKS['uuid'] = { ... };
        if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
            $uuid = $matches[1];
            $data = json_decode($matches[2], true);
            if ($data) {
                // デッキが正しく登録されているかのフラグ
                $data['has_defense_deck'] = (isset($data['deck']) && is_array($data['deck']) && count($data['deck']) === 20);
                $players[] = $data;
            }
        }
    }
}

// タイムスタンプの降順（新しい順）でソート
usort($players, function($a, $b) {
    return strcmp($b['timestamp'] ?? '', $a['timestamp'] ?? '');
});

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

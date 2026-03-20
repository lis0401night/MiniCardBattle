<?php
/**
 * Mini Card Battle - Get Player Decks API
 * Returns list of registered player decks.
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
        if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
            $uuid = $matches[1];
            $data = json_decode($matches[2], true);
            if ($data) {
                // デッキの中身は一覧表示には不要なので除外して軽量化
                unset($data['deck']);
                $players[] = $data;
            }
        }
    }
}

// タイムスタンプの降順（新しい順）でソート
usort($players, function($a, $b) {
    return strcmp($b['timestamp'] ?? '', $a['timestamp'] ?? '');
});

echo json_encode(['success' => true, 'players' => $players]);

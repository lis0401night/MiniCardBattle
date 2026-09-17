<?php
/**
 * Mini Card Battle - Get Player Decks API
 * 
 * サーバーに登録されている全プレイヤーのデッキ・ポイント情報を取得します。
 * 
 * @method GET|POST
 * @return json 全プレイヤーのデータを含む配列
 */

require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

$dir = getPlayersDirectory();
$players = [];
$processedUuids = [];

if (is_dir($dir)) {
    // 1. 高速な JSON 形式のファイルを直接デコード（正規表現なし）
    $jsonFiles = glob("{$dir}/*.json");
    if ($jsonFiles) {
        foreach ($jsonFiles as $file) {
            $content = @file_get_contents($file);
            if ($content !== false && $content !== '') {
                $data = json_decode($content, true);
                if (is_array($data) && !empty($data['uuid'])) {
                    $processedUuids[$data['uuid']] = true;
                    // 防衛デッキが正しく登録されている（20枚）かどうかを判定するフラグを付与
                    $data['has_defense_deck'] = (isset($data['deck']) && is_array($data['deck']) && count($data['deck']) === 20);
                    // デッキの中身は一覧表示には不要なので除外して軽量化
                    unset($data['deck']);
                    $players[] = $data;
                }
            }
        }
    }

    // 2. 移行過渡期用：未移行の旧 JS ファイルが存在すればフォールバック読込
    $jsFiles = glob("{$dir}/*.js");
    if ($jsFiles) {
        foreach ($jsFiles as $file) {
            $content = @file_get_contents($file);
            if ($content !== false && $content !== '') {
                if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
                    $uuid = $matches[1];
                    if (!isset($processedUuids[$uuid])) {
                        $data = json_decode($matches[2], true);
                        if (is_array($data)) {
                            $processedUuids[$uuid] = true;
                            $data['has_defense_deck'] = (isset($data['deck']) && is_array($data['deck']) && count($data['deck']) === 20);
                            unset($data['deck']);
                            $players[] = $data;
                        }
                    }
                }
            }
        }
    }
}

// タイムスタンプの降順（新しい順）でソート
usort($players, function($a, $b) {
    return strcmp($b['timestamp'] ?? '', $a['timestamp'] ?? '');
});

echo json_encode(['success' => true, 'players' => $players, 'totalPlayerCount' => count($players)]);


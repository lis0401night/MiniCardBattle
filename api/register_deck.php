<?php
/**
 * Mini Card Battle - Deck Registration API
 * Saves player deck data as a JS file.
 */

header('Content-Type: application/json');

// POSTリクエストのみ許可
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

// JSONデータを取得
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['uuid']) || !isset($data['name']) || !isset($data['character']) || !isset($data['deck'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$stage = isset($data['stage']) ? preg_replace('/[^a-z0-9_]/', '', $data['stage']) : 'plain';

// パラメータのバリデーション・サニタイズ
$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$name = htmlspecialchars($data['name'], ENT_QUOTES, 'UTF-8');
$character = preg_replace('/[^a-z0-9_]/', '', $data['character']);
$deck = $data['deck'];

if (strlen($uuid) < 10 || count($deck) !== 20) {
    echo json_encode(['success' => false, 'error' => 'Invalid data format']);
    exit;
}

// 保存ディレクトリの確認
$dir = __DIR__ . '/decks/players';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

// JSファイルの内容を生成
// PLAYER_DECKS グローバルオブジェクトにデータを追加する形式
$player_data = [
    'uuid' => $uuid,
    'name' => $name,
    'character' => $character,
    'stage' => $stage,
    'deck' => $deck,
    'timestamp' => $timestamp
];
$data_json = json_encode($player_data);

$js_content = <<<EOT
if (typeof PLAYER_DECKS === 'undefined') { var PLAYER_DECKS = {}; }
PLAYER_DECKS['{$uuid}'] = {$data_json};
EOT;

// ファイル保存
$filename = "{$dir}/{$uuid}.js";
if (file_put_contents($filename, $js_content)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save deck file']);
}

<?php
/**
 * Mini Card Battle - Profile Update API
 * Updates player name and icon inside the registered deck JS file.
 */

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['uuid']) || !isset($data['name']) || !isset($data['icon'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$name = htmlspecialchars($data['name'], ENT_QUOTES, 'UTF-8');
$icon = preg_replace('/[^a-z0-9_]/', '', $data['icon']);
$timestamp = time();

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid UUID']);
    exit;
}

$dir = __DIR__ . '/decks/players';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$filename = "{$dir}/{$uuid}.js";
$player_data = [];

// 既存のデータを読み込んで引き継ぐ
if (file_exists($filename)) {
    $content = file_get_contents($filename);
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
        $existing = json_decode($matches[2], true);
        if ($existing) {
            $player_data = $existing;
        }
    }
}

// プロフィール情報を更新
$player_data['uuid'] = $uuid;
$player_data['name'] = $name;
$player_data['icon'] = $icon;
$player_data['timestamp'] = $timestamp;

$data_json = json_encode($player_data);
$js_content = <<<EOT
if (typeof PLAYER_DECKS === 'undefined') { var PLAYER_DECKS = {}; }
PLAYER_DECKS['{$uuid}'] = {$data_json};
EOT;

if (file_put_contents($filename, $js_content)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save profile']);
}

<?php
/**
 * Mini Card Battle - Heartbeat API
 * 
 * プレイヤーの存在登録・最終アクセス日時更新を行う軽量エンドポイント。
 */

header('Content-Type: application/json');
require_once __DIR__ . '/helpers.php';

// POSTリクエストのみ許可
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

// JSONデータを取得
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['uuid'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

// パラメータのバリデーション・サニタイズ
$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$name = isset($data['name']) ? sanitizePlayerDisplayName($data['name']) : '挑戦者';
$icon = isset($data['icon']) ? preg_replace('/[^a-z0-9_]/', '', $data['icon']) : 'player';

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid data format']);
    exit;
}

$dir = __DIR__ . '/decks/players';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$filename = "{$dir}/{$uuid}.js";

$fp = fopen($filename, 'c+');
if (!$fp) {
    echo json_encode(['success' => false, 'error' => 'Failed to open deck file']);
    exit;
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Failed to lock deck file']);
    exit;
}

clearstatcache(true, $filename);
$fileSize = filesize($filename);
$content = $fileSize > 0 ? fread($fp, $fileSize) : '';

$player_data = [];
$isNewPlayer = true;

if ($fileSize > 0) {
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
        $existing_data = json_decode($matches[2], true);
        if ($existing_data) {
            $player_data = $existing_data;
            $isNewPlayer = false;
        }
    }
}

$timestamp = time();

if (empty($player_data)) {
    $player_data = createDefaultPlayerData($uuid, $name);
    $player_data['icon'] = $icon;
    $player_data['lastAccessAt'] = $timestamp;
} else {
    // 既存データの更新
    $player_data['lastAccessAt'] = $timestamp;
    if (isset($data['name'])) {
        $player_data['name'] = $name;
    }
    if (isset($data['icon'])) {
        $player_data['icon'] = $icon;
    }
}

$data_json = json_encode($player_data);
$js_content = <<<EOT
if (typeof PLAYER_DECKS === 'undefined') { var PLAYER_DECKS = {}; }
PLAYER_DECKS['{$uuid}'] = {$data_json};
EOT;

ftruncate($fp, 0);
rewind($fp);

$writeSuccess = fwrite($fp, $js_content);
fflush($fp);

flock($fp, LOCK_UN);
fclose($fp);

if ($writeSuccess === strlen($js_content)) {
    echo json_encode(['success' => true, 'isNewPlayer' => $isNewPlayer]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save deck file completely']);
}

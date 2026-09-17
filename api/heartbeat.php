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
$name = isset($data['name']) ? sanitizePlayerDisplayName($data['name']) : 'プレイヤー';
$icon = isset($data['icon']) ? preg_replace('/[^a-z0-9_]/', '', $data['icon']) : 'player';

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid data format']);
    exit;
}

$dir = getPlayersDirectory();
$lock = acquirePlayerLock($uuid, $dir);
if (!$lock) {
    echo json_encode(['success' => false, 'error' => 'Failed to acquire player lock']);
    exit;
}

$fileExists = playerDataFileExists($uuid, $dir);

$player_data = loadPlayerData($uuid, $dir);
$isNewPlayer = !$fileExists;

// 既存ファイルが存在するのにパースできなかった場合はデータ破損として安全に中断
if ($fileExists && $player_data === null) {
    releasePlayerLock($lock);
    echo json_encode(['success' => false, 'error' => 'Existing player data is corrupted']);
    exit;
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

// インベントリ・プレミアム解放・登録デッキの更新を一元適用
applyPlayerCollectionUpdates($player_data, $data);

$saved = savePlayerData($uuid, $player_data, $dir);
releasePlayerLock($lock);

if ($saved) {
    echo json_encode(['success' => true, 'isNewPlayer' => $isNewPlayer]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save player data completely']);
}


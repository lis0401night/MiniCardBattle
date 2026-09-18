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

$timestamp = time();

$updateResult = modifyPlayerDataWithLock($uuid, function (array &$player_data, array $playerResult) use ($name, $icon, $timestamp, $data) {
    $player_data['lastAccessAt'] = $timestamp;

    if ($playerResult['status'] === 'new') {
        $player_data['icon'] = $icon;
    } else {
        if (isset($data['name'])) {
            $player_data['name'] = $name;
        }
        if (isset($data['icon'])) {
            $player_data['icon'] = $icon;
        }
    }

    // インベントリ・プレミアム解放・登録デッキの更新を一元適用
    applyPlayerCollectionUpdates($player_data, $data);
}, $name);

if ($updateResult['success']) {
    $isNewPlayer = ($updateResult['status'] === 'new');
    echo json_encode(['success' => true, 'isNewPlayer' => $isNewPlayer]);
} else {
    echo json_encode(['success' => false, 'error' => $updateResult['error']]);
}


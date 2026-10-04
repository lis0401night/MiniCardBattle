<?php
/**
 * Mini Card Battle - Update Quick Rating API
 * 
 * プレイヤーのクイックマッチレート（quick_rating）を更新・保存します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $quick_rating 新しいクイックマッチレート
 * @param string|null $name プレイヤー名（オプション）
 * @return json 処理結果および更新後のレート情報
 */

header('Content-Type: application/json');
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['uuid'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$rating = isset($data['quick_rating']) 
    ? intval($data['quick_rating']) 
    : (isset($data['points']) ? intval($data['points']) : 0);

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

$defaultName = sanitizePlayerDisplayName($data['name'] ?? null);

$updateResult = modifyPlayerDataWithLock($uuid, function (array &$playerData) use ($rating) {
    $playerData['quick_rating'] = max(0, $rating);
    $playerData['lastAccessAt'] = time();
    return true;
}, $defaultName);

if ($updateResult) {
    echo json_encode([
        'success' => true,
        'quick_rating' => max(0, $rating),
    ]);
} else {
    echo json_encode([
        'success' => false,
        'error' => 'Failed to save quick rating',
    ]);
}

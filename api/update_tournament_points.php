<?php
/**
 * Mini Card Battle - Update Tournament Points API
 * 
 * プレイヤーのトーナメントモードのポイントを更新・保存します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $points 現在の所持ポイント (オプション)
 * @param int $total_points 累計ポイント (オプション)
 * @return json 処理結果および更新後のポイント情報
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
$points = isset($data['points']) ? intval($data['points']) : 0;
$total_points = isset($data['total_points']) ? intval($data['total_points']) : 0;

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

$defaultName = sanitizePlayerDisplayName($data['name'] ?? null);

$updateResult = modifyPlayerDataWithLock($uuid, function (array &$playerData) use ($points, $total_points, $data) {
    $playerData['tournament_points'] = $points;
    $playerData['tournament_total_points'] = $total_points;

    $converted_points = isset($data['tournament_converted_points'])
        ? intval($data['tournament_converted_points'])
        : (isset($data['converted_points']) ? intval($data['converted_points']) : null);
    if ($converted_points !== null && $converted_points >= 0) {
        $currentConv = isset($playerData['tournament_converted_points']) ? intval($playerData['tournament_converted_points']) : 0;
        $playerData['tournament_converted_points'] = max($currentConv, $converted_points);
    }

    $playerData['timestamp'] = time();
}, $defaultName);

if ($updateResult['success']) {
    $playerData = $updateResult['data'];
    echo json_encode([
        'success' => true,
        'tournament_points' => $playerData['tournament_points'],
        'tournament_total_points' => $playerData['tournament_total_points'],
        'tournament_converted_points' => $playerData['tournament_converted_points'] ?? 0
    ]);
    exit;
} else {
    echo json_encode(['success' => false, 'error' => $updateResult['error']]);
    exit;
}

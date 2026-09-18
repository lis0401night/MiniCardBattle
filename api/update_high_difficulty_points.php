<?php
/**
 * Mini Card Battle - Update High Difficulty Points API
 * 
 * プレイヤーの高難易度イベントのポイントおよびクリア状況を更新・保存します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $points 現在の所持ポイント (オプション)
 * @param int $total_points 累計ポイント (オプション)
 * @param string $high_difficulty_cleared 達成済みクリア状況のJSON文字列 (オプション)
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
$high_difficulty_cleared = isset($data['high_difficulty_cleared']) ? $data['high_difficulty_cleared'] : '{}';

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

// high_difficulty_clearedがJSON文字列として妥当かチェック
$clearedDecoded = json_decode($high_difficulty_cleared, true);
if ($clearedDecoded === null && $high_difficulty_cleared !== '{}') {
    $high_difficulty_cleared = '{}';
}

$defaultName = sanitizePlayerDisplayName($data['name'] ?? null);

$updateResult = modifyPlayerDataWithLock($uuid, function (array &$playerData) use ($points, $total_points, $high_difficulty_cleared, $clearedDecoded, $data) {
    $playerData['high_difficulty_points'] = $points;
    $playerData['high_difficulty_total_points'] = $total_points;

    // クリア状況のマージ（既存クリア情報の消失を防ぐ）
    if ($high_difficulty_cleared !== '{}' && is_array($clearedDecoded)) {
        $existingCleared = [];
        if (isset($playerData['high_difficulty_cleared']) && is_string($playerData['high_difficulty_cleared'])) {
            $parsed = json_decode($playerData['high_difficulty_cleared'], true);
            if (is_array($parsed)) {
                $existingCleared = $parsed;
            }
        }
        $mergedCleared = array_merge($existingCleared, $clearedDecoded);
        $playerData['high_difficulty_cleared'] = json_encode($mergedCleared);
    }

    $converted_points = isset($data['high_difficulty_converted_points'])
        ? intval($data['high_difficulty_converted_points'])
        : (isset($data['converted_points']) ? intval($data['converted_points']) : null);
    if ($converted_points !== null && $converted_points >= 0) {
        $currentConv = isset($playerData['high_difficulty_converted_points']) ? intval($playerData['high_difficulty_converted_points']) : 0;
        $playerData['high_difficulty_converted_points'] = max($currentConv, $converted_points);
    }

    $playerData['timestamp'] = time();
}, $defaultName);

if ($updateResult['success']) {
    $savedData = $updateResult['data'];
    echo json_encode([
        'success' => true,
        'high_difficulty_points' => $savedData['high_difficulty_points'],
        'high_difficulty_total_points' => $savedData['high_difficulty_total_points'],
        'high_difficulty_cleared' => $savedData['high_difficulty_cleared'] ?? '{}',
        'high_difficulty_converted_points' => $savedData['high_difficulty_converted_points'] ?? 0
    ]);
    exit;
} else {
    echo json_encode(['success' => false, 'error' => $updateResult['error']]);
    exit;
}

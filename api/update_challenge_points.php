<?php
/**
 * Mini Card Battle - Update Challenge Points API
 * 
 * プレイヤーのチャレンジモード（試練の宮殿）の進行状況とポイントを更新・保存します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $challenge_points 現在の所持チャレンジポイント (オプション)
 * @param int $challenge_total_points 累計チャレンジポイント (オプション)
 * @param int $challenge_max_streak 最高到達階 (オプション)
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
$max_streak = isset($data['max_streak']) ? intval($data['max_streak']) : 0;

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

$dir = getPlayersDirectory();
$lock = acquirePlayerLock($uuid, $dir);
if (!$lock) {
    echo json_encode(['success' => false, 'error' => 'Failed to acquire player lock']);
    exit;
}

$fileExists = playerDataFileExists($uuid, $dir);
$playerData = loadPlayerData($uuid, $dir);

// 既存ファイルが存在するのにパースできなかった場合はデータ破損として安全に中断（既定値での上書き防止）
if ($fileExists && $playerData === null) {
    releasePlayerLock($lock);
    echo json_encode(['success' => false, 'error' => 'Failed to parse player data or file is corrupted']);
    exit;
}

if (!$playerData) {
    $playerName = isset($data['name']) ? $data['name'] : 'プレイヤー';
    $playerData = createDefaultPlayerData($uuid, $playerName);
}

if ($playerData) {
    $playerData['challenge_points'] = $points;
    $playerData['challenge_total_points'] = $total_points;
    if ($max_streak > 0 || !isset($playerData['challenge_max_streak']) || $max_streak > $playerData['challenge_max_streak']) {
        $playerData['challenge_max_streak'] = $max_streak;
    }

    $converted_points = isset($data['challenge_converted_points'])
        ? intval($data['challenge_converted_points'])
        : (isset($data['converted_points']) ? intval($data['converted_points']) : null);
    if ($converted_points !== null && $converted_points >= 0) {
        $currentConv = isset($playerData['challenge_converted_points']) ? intval($playerData['challenge_converted_points']) : 0;
        $playerData['challenge_converted_points'] = max($currentConv, $converted_points);
    }

    $playerData['timestamp'] = time();

    $saved = savePlayerData($uuid, $playerData, $dir);
    releasePlayerLock($lock);

    if ($saved) {
        echo json_encode([
            'success' => true,
            'challenge_points' => $playerData['challenge_points'],
            'challenge_total_points' => $playerData['challenge_total_points'],
            'challenge_max_streak' => $playerData['challenge_max_streak'] ?? 0,
            'challenge_converted_points' => $playerData['challenge_converted_points'] ?? 0
        ]);
        exit;
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save updated file completely']);
        exit;
    }
} else {
    releasePlayerLock($lock);
    echo json_encode(['success' => false, 'error' => 'Failed to load or initialize player data']);
    exit;
}

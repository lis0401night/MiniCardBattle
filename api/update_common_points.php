<?php
/**
 * Mini Card Battle - Update Common Points API
 * 
 * プレイヤーの共通ポイント（common_points）および累計共通ポイント（common_total_points）を更新・保存します。
 * `increment`フラグがtrueの場合、現在の値に加算します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $points 現在の所持共通ポイント
 * @param int $total_points 累計共通ポイント (オプション)
 * @param bool $increment trueなら加算、falseなら上書き (オプション)
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

if (!$data || !isset($data['uuid']) || !array_key_exists('points', $data) || !is_numeric($data['points'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$points = isset($data['points']) ? intval($data['points']) : 0;
$total_points = isset($data['total_points']) ? intval($data['total_points']) : 0;
$increment = isset($data['increment']) ? (bool)$data['increment'] : false;

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

$dir = getPlayersDirectory();
$playerData = loadPlayerData($uuid, $dir);

if (!$playerData) {
    $playerName = isset($data['name']) ? $data['name'] : 'プレイヤー';
    $playerData = createDefaultPlayerData($uuid, $playerName);
}

if ($playerData) {
    $currentPoints = isset($playerData['common_points']) ? intval($playerData['common_points']) : 0;
    $currentTotal = isset($playerData['common_total_points']) ? intval($playerData['common_total_points']) : 0;

    if ($increment) {
        $playerData['common_points'] = max(0, $currentPoints + $points);
        if ($total_points > 0) {
            $playerData['common_total_points'] = max(0, $currentTotal + $total_points);
        } else {
            if ($points > 0) {
                $playerData['common_total_points'] = max(0, $currentTotal + $points);
            }
        }
    } else {
        $playerData['common_points'] = max(0, $points);
        if ($total_points > 0) {
            $playerData['common_total_points'] = max(0, $total_points);
        } else {
            if (!isset($playerData['common_total_points']) || $playerData['common_total_points'] < $playerData['common_points']) {
                $playerData['common_total_points'] = $playerData['common_points'];
            }
        }
    }

    $playerData['timestamp'] = time();

    $saved = savePlayerData($uuid, $playerData, $dir);

    if ($saved) {
        echo json_encode([
            'success' => true,
            'common_points' => $playerData['common_points'],
            'common_total_points' => $playerData['common_total_points']
        ]);
        exit;
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save updated file completely']);
        exit;
    }
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to load or initialize player data']);
    exit;
}

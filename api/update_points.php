<?php
/**
 * Mini Card Battle - Update Points API
 * 
 * プレイヤーの防衛戦ポイントおよび防衛勝利数を更新・保存します。
 * `increment`フラグがtrueの場合、現在の値に加算します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $points 現在の所持防衛ポイント
 * @param int $total_points 累計防衛ポイント (オプション)
 * @param bool $increment trueなら加算、falseなら上書き (オプション)
 * @param int $defense_wins 防衛勝利数。increment=trueなら加算し、falseなら指定値で上書き (オプション)
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

if (!$data || !isset($data['uuid']) || !isset($data['points'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$points = isset($data['points']) ? intval($data['points']) : 0;
$total_points = isset($data['total_points']) ? intval($data['total_points']) : 0;
$increment = isset($data['increment']) ? (bool)$data['increment'] : false;
$defense_wins = isset($data['defense_wins']) ? intval($data['defense_wins']) : 0;

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

// 防衛勝利数は累計回数（非負整数）のため、負数や不正な形式の入力を拒否
if (array_key_exists('defense_wins', $data) &&
    filter_var(
        $data['defense_wins'],
        FILTER_VALIDATE_INT,
        ['options' => ['min_range' => 0]]
    ) === false) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid defense_wins format']);
    exit;
}

$dir = getPlayersDirectory();
$playerData = loadPlayerData($uuid, $dir);

if (!$playerData) {
    $playerName = isset($data['name']) ? $data['name'] : 'プレイヤー';
    $playerData = createDefaultPlayerData($uuid, $playerName);
}

if ($playerData) {
    $currentPoints = isset($playerData['points']) ? intval($playerData['points']) : 0;
    $currentTotal = isset($playerData['total_points']) ? intval($playerData['total_points']) : 0;

    if ($increment) {
        $playerData['points'] = max(0, $currentPoints + $points);
        if ($total_points > 0) {
            $playerData['total_points'] = max(0, $currentTotal + $total_points);
        } else {
            if ($points > 0) {
                $playerData['total_points'] = max(0, $currentTotal + $points);
            }
        }
    } else {
        $playerData['points'] = max(0, $points);
        if ($total_points > 0) {
            $playerData['total_points'] = max(0, $total_points);
        } else {
            if (!isset($playerData['total_points']) || $playerData['total_points'] < $playerData['points']) {
                $playerData['total_points'] = $playerData['points'];
            }
        }
    }

    if (array_key_exists('defense_wins', $data)) {
        if ($increment) {
            // バトル敗北による相手プレイヤーへの防衛勝利数加算（increment: true）
            $playerData['defense_wins'] = ($playerData['defense_wins'] ?? 0) + $defense_wins;
        } else {
            // 通常のクライアント同期時は上書き
            $playerData['defense_wins'] = $defense_wins;
        }
    }

    $converted_points = isset($data['defense_converted_points'])
        ? intval($data['defense_converted_points'])
        : (isset($data['converted_points']) ? intval($data['converted_points']) : null);
    if ($converted_points !== null && $converted_points >= 0) {
        $currentConv = isset($playerData['defense_converted_points']) ? intval($playerData['defense_converted_points']) : 0;
        $playerData['defense_converted_points'] = max($currentConv, $converted_points);
    }

    $playerData['timestamp'] = time();

    $saved = savePlayerData($uuid, $playerData, $dir);

    if ($saved) {
        echo json_encode([
            'success' => true,
            'points' => $playerData['points'],
            'total_points' => $playerData['total_points'] ?? $playerData['points'] ?? 0,
            'defense_wins' => $playerData['defense_wins'] ?? 0,
            'defense_converted_points' => $playerData['defense_converted_points'] ?? 0
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

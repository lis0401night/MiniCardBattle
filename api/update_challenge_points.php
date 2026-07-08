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
 * @param int $challenge_max_streak 最高到達階層 (オプション)
 * @return json 処理結果および更新後のポイント情報
 */

header('Content-Type: application/json');

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

$dir = __DIR__ . '/decks/players';
$filename = "{$dir}/{$uuid}.js";

if (!file_exists($filename)) {
    $playerName = isset($data['name']) ? $data['name'] : 'プレイヤー';
    $playerData = [
        'uuid' => $uuid,
        'name' => $playerName,
        'icon' => 'android',
        'character' => 'oni',
        'skin' => 'default',
        'playmat' => null,
        'stage' => 'oni',
        'deck' => [],
        'challenge_points' => 0,
        'challenge_total_points' => 0,
        'challenge_max_streak' => 0,
        'tournament_points' => 0,
        'tournament_total_points' => 0,
        'points' => 0,
        'total_points' => 0,
        'defense_wins' => 0
    ];
} else {
    $content = file_get_contents($filename);
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
        $playerData = json_decode($matches[2], true);
    } else {
        $playerData = null;
    }
}

if ($playerData) {
    $playerData['challenge_points'] = $points;
    $playerData['challenge_total_points'] = $total_points;
    if ($max_streak > 0 || !isset($playerData['challenge_max_streak']) || $max_streak > $playerData['challenge_max_streak']) {
        $playerData['challenge_max_streak'] = $max_streak;
    }
    $playerData['timestamp'] = time();

    $data_json = json_encode($playerData);
    $js_content = <<<EOT
if (typeof PLAYER_DECKS === 'undefined') { var PLAYER_DECKS = {}; }
PLAYER_DECKS['{$uuid}'] = {$data_json};
EOT;
    
    if (file_put_contents($filename, $js_content)) {
        echo json_encode([
            'success' => true,
            'challenge_points' => $playerData['challenge_points'],
            'challenge_total_points' => $playerData['challenge_total_points'],
            'challenge_max_streak' => $playerData['challenge_max_streak'] ?? 0
        ]);
        exit;
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save updated file']);
        exit;
    }
}

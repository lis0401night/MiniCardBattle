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

$dir = __DIR__ . '/decks/players';
$filename = "{$dir}/{$uuid}.js";

$fp = fopen($filename, 'c+');
if (!$fp) {
    echo json_encode(['success' => false, 'error' => 'Failed to open player file']);
    exit;
}

flock($fp, LOCK_EX);

clearstatcache(true, $filename);
$fileSize = filesize($filename);
$content = $fileSize > 0 ? fread($fp, $fileSize) : '';

$playerData = null;

if ($fileSize === 0) {
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
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
        $playerData = json_decode($matches[2], true);
    }
}

if ($playerData) {
    $playerData['tournament_points'] = $points;
    $playerData['tournament_total_points'] = $total_points;
    $playerData['timestamp'] = time();

    $data_json = json_encode($playerData);
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

    if ($writeSuccess !== false) {
        echo json_encode([
            'success' => true,
            'tournament_points' => $playerData['tournament_points'],
            'tournament_total_points' => $playerData['tournament_total_points']
        ]);
        exit;
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save updated file']);
        exit;
    }
} else {
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Failed to parse player data or file is corrupted']);
    exit;
}

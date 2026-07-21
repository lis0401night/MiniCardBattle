<?php
/**
 * Mini Card Battle - Update High Difficulty Points API
 * 
 * プレイヤーの高難易度モードのポイントを更新・保存します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $high_difficulty_points 現在の所持ポイント (オプション)
 * @param int $high_difficulty_total_points 累計ポイント (オプション)
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

if (!file_exists($filename)) {
    echo json_encode(['success' => false, 'error' => 'Player deck not found. Register a deck first.']);
    exit;
}

$content = file_get_contents($filename);

if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
    $playerData = json_decode($matches[2], true);
    if ($playerData) {
        $playerData['high_difficulty_points'] = $points;
        $playerData['high_difficulty_total_points'] = $total_points;
        $playerData['timestamp'] = time();

        $data_json = json_encode($playerData);
        $js_content = <<<EOT
if (typeof PLAYER_DECKS === 'undefined') { var PLAYER_DECKS = {}; }
PLAYER_DECKS['{$uuid}'] = {$data_json};
EOT;
        
        if (file_put_contents($filename, $js_content)) {
            echo json_encode([
                'success' => true,
                'high_difficulty_points' => $playerData['high_difficulty_points'],
                'high_difficulty_total_points' => $playerData['high_difficulty_total_points']
            ]);
            exit;
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to save updated file']);
            exit;
        }
    }
}
echo json_encode(['success' => false, 'error' => 'Failed to parse existing deck data']);

<?php
/**
 * Mini Card Battle - Update Tournament Points API
 * Updates a player's tournament points in the master data.
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
    echo json_encode(['success' => false, 'error' => 'Player deck not found. Register a deck first.']);
    exit;
}

$content = file_get_contents($filename);

if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
    $playerData = json_decode($matches[2], true);
    if ($playerData) {
        $playerData['tournament_points'] = $points;
        $playerData['tournament_total_points'] = $total_points;
        if ($max_streak > 0 || !isset($playerData['tournament_max_streak']) || $max_streak > $playerData['tournament_max_streak']) {
            $playerData['tournament_max_streak'] = $max_streak;
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
                'tournament_points' => $playerData['tournament_points'],
                'tournament_total_points' => $playerData['tournament_total_points'],
                'tournament_max_streak' => $playerData['tournament_max_streak'] ?? 0
            ]);
            exit;
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to save updated file']);
            exit;
        }
    }
}
echo json_encode(['success' => false, 'error' => 'Failed to parse existing deck data']);

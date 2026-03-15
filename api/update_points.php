<?php
/**
 * Mini Card Battle - Update Points API
 * Updates a player's defense points.
 */

header('Content-Type: application/json');

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
$increment = isset($data['increment']) ? (bool)$data['increment'] : false;
$defense_wins = isset($data['defense_wins']) ? intval($data['defense_wins']) : 0;

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

$dir = __DIR__ . '/decks/players';
$filename = "{$dir}/{$uuid}.js";

if (!file_exists($filename)) {
    // If the file doesn't exist, we can't update it
    echo json_encode(['success' => false, 'error' => 'Player deck not found. Register a deck first.']);
    exit;
}

$content = file_get_contents($filename);

if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
    $playerData = json_decode($matches[2], true);
    if ($playerData) {
        if ($increment) {
            $playerData['points'] = ($playerData['points'] ?? 0) + $points;
        } else {
            $playerData['points'] = $points;
        }

        if ($defense_wins > 0) {
            $playerData['defense_wins'] = ($playerData['defense_wins'] ?? 0) + $defense_wins;
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
                'points' => $playerData['points'],
                'defense_wins' => $playerData['defense_wins'] ?? 0
            ]);
            exit;
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to save updated file']);
            exit;
        }
    }
}
echo json_encode(['success' => false, 'error' => 'Failed to parse existing deck data']);

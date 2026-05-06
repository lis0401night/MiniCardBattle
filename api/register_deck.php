<?php
/**
 * Mini Card Battle - Deck Registration API
 * Saves player deck data as a JS file.
 */

header('Content-Type: application/json');

// POSTリクエストのみ許可
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

// JSONデータを取得
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['uuid']) || !isset($data['name']) || !isset($data['character']) || !isset($data['deck'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$initial_points = isset($data['points']) ? intval($data['points']) : 0;
$initial_total_points = isset($data['total_points']) ? intval($data['total_points']) : $initial_points;

$stage = isset($data['stage']) ? preg_replace('/[^a-z0-9_]/', '', $data['stage']) : 'plain';
$timestamp = time();

// パラメータのバリデーション・サニタイズ
$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$name = htmlspecialchars($data['name'], ENT_QUOTES, 'UTF-8');
$character = preg_replace('/[^a-z0-9_]/', '', $data['character']);
$deck = $data['deck'];
$skin = isset($data['skin']) ? preg_replace('/[^a-z0-9_]/', '', $data['skin']) : 'default';
$playmat = isset($data['playmat']) ? preg_replace('/[^a-z0-9_]/', '', $data['playmat']) : null;

// スキン情報全体の取得とサニタイズ（トークン画像の正しい表示に必要）
$skins = [];
if (isset($data['skins']) && is_array($data['skins'])) {
    foreach ($data['skins'] as $key => $val) {
        $safeKey = preg_replace('/[^a-z0-9_]/', '', $key);
        $safeVal = preg_replace('/[^a-z0-9_]/', '', $val);
        if ($safeKey && $safeVal) {
            $skins[$safeKey] = $safeVal;
        }
    }
}

if (strlen($uuid) < 10 || count($deck) !== 20) {
    echo json_encode(['success' => false, 'error' => 'Invalid data format']);
    exit;
}

// 保存ディレクトリの確認
$dir = __DIR__ . '/decks/players';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

// 既存のデータを引き継ぐ（あれば）
$existing_points = $initial_points;
$existing_total_points = $initial_total_points;
$existing_defense_wins = 0;
$existing_challenge_points = 0;
$existing_challenge_total_points = 0;
$existing_challenge_max_streak = 0;
$filename = "{$dir}/{$uuid}.js";
if (file_exists($filename)) {
    $content = file_get_contents($filename);
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
        $existing_data = json_decode($matches[2], true);
        if ($existing_data) {
            $existing_points = isset($existing_data['points']) ? intval($existing_data['points']) : $initial_points;
            $existing_total_points = isset($existing_data['total_points']) ? intval($existing_data['total_points']) : (isset($existing_data['points']) ? intval($existing_data['points']) : $initial_total_points);
            $existing_defense_wins = $existing_data['defense_wins'] ?? 0;
            $existing_challenge_points = $existing_data['challenge_points'] ?? 0;
            $existing_challenge_total_points = $existing_data['challenge_total_points'] ?? 0;
            $existing_challenge_max_streak = $existing_data['challenge_max_streak'] ?? 0;
        }
    }
}

// JSファイルの内容を生成
// PLAYER_DECKS グローバルオブジェクトにデータを追加する形式
$player_data = [
    'uuid' => $uuid,
    'name' => $name,
    'character' => $character,
    'skin' => $skin,
    'playmat' => $playmat,
    'stage' => $stage,
    'deck' => $deck,
    'skins' => $skins,
    'points' => $existing_points,
    'total_points' => $existing_total_points,
    'defense_wins' => $existing_defense_wins,
    'challenge_points' => $existing_challenge_points,
    'challenge_total_points' => $existing_challenge_total_points,
    'challenge_max_streak' => $existing_challenge_max_streak,
    'timestamp' => $timestamp
];
$data_json = json_encode($player_data);

$js_content = <<<EOT
if (typeof PLAYER_DECKS === 'undefined') { var PLAYER_DECKS = {}; }
PLAYER_DECKS['{$uuid}'] = {$data_json};
EOT;

// ファイル保存
$filename = "{$dir}/{$uuid}.js";
if (file_put_contents($filename, $js_content)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save deck file']);
}

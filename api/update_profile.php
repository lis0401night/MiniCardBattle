<?php
/**
 * Mini Card Battle - Profile Update API
 * 
 * プレイヤーの名前とアイコン画像を更新します。
 * デッキやポイントなどの他のデータは維持されます。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param string $name 新しいプレイヤー名
 * @param string $icon 新しいアイコン画像ID
 * @return json 処理結果(success: true/false)
 */

header('Content-Type: application/json');
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['uuid']) || !isset($data['name']) || !isset($data['icon'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$name = htmlspecialchars($data['name'], ENT_QUOTES, 'UTF-8');
$icon = preg_replace('/[^a-z0-9_]/', '', $data['icon']);
$timestamp = time();

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid UUID']);
    exit;
}

$dir = __DIR__ . '/decks/players';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$filename = "{$dir}/{$uuid}.js";

$fp = fopen($filename, 'c+');
if (!$fp) {
    echo json_encode(['success' => false, 'error' => 'Failed to open player file']);
    exit;
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Failed to lock player file']);
    exit;
}

clearstatcache(true, $filename);
$fileSize = filesize($filename);
$content = $fileSize > 0 ? fread($fp, $fileSize) : '';

$player_data = [];
$parseFailed = false;

// 既存のデータを読み込んで引き継ぐ
if ($fileSize > 0) {
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
        $existing = json_decode($matches[2], true);
        if ($existing) {
            $player_data = $existing;
        } else {
            $player_data = [];
        }
    } else {
        $player_data = [];
    }
}

if (empty($player_data)) {
    $player_data = createDefaultPlayerData($uuid, $name);
}

// プロフィール情報を更新
$player_data['uuid'] = $uuid;
$player_data['name'] = $name;
$player_data['icon'] = $icon;
$player_data['timestamp'] = $timestamp;

$data_json = json_encode($player_data);
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

if ($writeSuccess === strlen($js_content)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save profile completely']);
}

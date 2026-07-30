<?php
/**
 * Mini Card Battle - Deck Registration API
 * 
 * プレイヤーの防衛デッキおよび基本情報をJSファイルとしてサーバーに保存します。
 * 既存データがある場合は、各ゲームモードのポイント実績を引き継いで上書きします。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param string $name プレイヤー名
 * @param string $character 使用キャラクターID
 * @param array $deck デッキのカード配列
 * @param string $stage 防衛ステージ (オプション)
 * @param string $skin 使用スキン (オプション)
 * @param array $skins 所持スキン一覧 (オプション)
 * @param string $icon アイコン画像 (オプション)
 * @param string $playmat 使用プレイマット (オプション)
 * @return json 処理結果(success: true/false)
 */

header('Content-Type: application/json');
require_once __DIR__ . '/helpers.php';

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
$icon = isset($data['icon']) ? preg_replace('/[^a-z0-9_]/', '', $data['icon']) : 'player';

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

$filename = "{$dir}/{$uuid}.js";

$fp = fopen($filename, 'c+');
if (!$fp) {
    echo json_encode(['success' => false, 'error' => 'Failed to open deck file']);
    exit;
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Failed to lock deck file']);
    exit;
}

clearstatcache(true, $filename);
$fileSize = filesize($filename);
$content = $fileSize > 0 ? fread($fp, $fileSize) : '';

$player_data = [];

if ($fileSize > 0) {
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
        $existing_data = json_decode($matches[2], true);
        if ($existing_data) {
            $player_data = $existing_data;
        } else {
            // データ破損時は空配列として扱い、上書き保存による復旧を許可する
            $player_data = [];
        }
    } else {
        // フォーマット異常時も同様に上書き保存による復旧を許可する
        $player_data = [];
    }
}

if (empty($player_data)) {
    $player_data = createDefaultPlayerData($uuid, $name, $initial_points, $initial_total_points);
}

$player_data['name'] = $name;
$player_data['icon'] = $icon;
$player_data['character'] = $character;
$player_data['skin'] = $skin;
$player_data['playmat'] = $playmat;
$player_data['stage'] = $stage;
$player_data['deck'] = $deck;
$player_data['skins'] = $skins;
$player_data['timestamp'] = $timestamp;
$player_data['registered'] = true;
$player_data['lastAccessAt'] = $timestamp;

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
    echo json_encode(['success' => false, 'error' => 'Failed to save deck file completely']);
}

<?php
/**
 * Mini Card Battle - Record Defense Battle API
 * 
 * 防衛戦において、攻撃側がバトルを終えた際に対象の防衛者(target_uuid)の防衛履歴を更新・保存します。
 * 防衛履歴は最大5件まで保持されます。
 * 
 * @method POST
 * @param string $target_uuid 防衛者のUUID
 * @param string $attacker_name 攻撃者の名前
 * @param string $attacker_character 攻撃者のキャラクターID
 * @param int $attacker_total_points 攻撃者の累計ポイント
 * @param array $attacker_deck 攻撃者が使用したデッキ (カードIDの配列)
 * @param string $result 攻撃者視点のバトル結果 ('win' or 'lose')
 * @return json 処理結果
 */

header('Content-Type: application/json');
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['target_uuid']) || !isset($data['result'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$target_uuid = preg_replace('/[^a-z0-9-]/', '', $data['target_uuid']);
if (strlen($target_uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid target uuid format']);
    exit;
}

$attacker_name = isset($data['attacker_name']) ? htmlspecialchars($data['attacker_name'], ENT_QUOTES, 'UTF-8') : '挑戦者';
$attacker_character = isset($data['attacker_character']) ? preg_replace('/[^a-z0-9_]/', '', $data['attacker_character']) : 'android';
$attacker_skin = isset($data['attacker_skin']) ? preg_replace('/[^a-z0-9_]/', '', $data['attacker_skin']) : 'default';
$attacker_total_points = isset($data['attacker_total_points']) ? intval($data['attacker_total_points']) : 0;
$attacker_deck = (isset($data['attacker_deck']) && is_array($data['attacker_deck'])) ? $data['attacker_deck'] : [];
$result = $data['result']; // 'win' (攻撃成功) or 'lose' (攻撃失敗)

// 防衛側視点での勝敗結果 ('win': 防衛成功, 'lose': 防衛失敗)
$defense_result = ($result === 'win') ? 'lose' : 'win';

$dir = __DIR__ . '/decks/players';
$filename = "{$dir}/{$target_uuid}.js";

if (!file_exists($filename)) {
    echo json_encode(['success' => false, 'error' => 'Target player file not found']);
    exit;
}

$fp = fopen($filename, 'c+');
if (!$fp) {
    echo json_encode(['success' => false, 'error' => 'Failed to open target player file']);
    exit;
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Failed to lock target player file']);
    exit;
}

clearstatcache(true, $filename);
$fileSize = filesize($filename);
$content = $fileSize > 0 ? fread($fp, $fileSize) : '';

$playerData = null;
if ($fileSize > 0 && preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
    $playerData = json_decode($matches[2], true);
}

if ($playerData) {
    $history = isset($playerData['defense_history']) && is_array($playerData['defense_history']) 
        ? $playerData['defense_history'] 
        : [];

    $newRecord = [
        'result' => $defense_result,
        'attackerName' => $attacker_name,
        'attackerCharacter' => $attacker_character,
        'attackerSkin' => $attacker_skin,
        'attackerTotalPoints' => $attacker_total_points,
        'attackerDeck' => $attacker_deck,
        'timestamp' => time(),
    ];

    // 先頭に追加し、最大5件に制限
    array_unshift($history, $newRecord);
    $history = array_slice($history, 0, 5);

    $playerData['defense_history'] = $history;
    $playerData['timestamp'] = time();

    $data_json = json_encode($playerData);
    $js_content = <<<EOT
if (typeof PLAYER_DECKS === 'undefined') { var PLAYER_DECKS = {}; }
PLAYER_DECKS['{$target_uuid}'] = {$data_json};
EOT;

    ftruncate($fp, 0);
    rewind($fp);

    $writeSuccess = fwrite($fp, $js_content);
    fflush($fp);

    flock($fp, LOCK_UN);
    fclose($fp);

    if ($writeSuccess === strlen($js_content)) {
        echo json_encode(['success' => true, 'history' => $history]);
        exit;
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save updated file completely']);
        exit;
    }
} else {
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Failed to parse target player data']);
    exit;
}

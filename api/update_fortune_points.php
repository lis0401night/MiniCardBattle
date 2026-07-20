<?php
/**
 * Mini Card Battle - Update Fortune Points API
 * 
 * プレイヤーの運命の邂逅イベントのポイントと達成情報を更新・保存します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $points 現在の所持ポイント
 * @param int $total_points 累計獲得ポイント
 * @param int $fortune_max_grade 最大達成レベル (オプション)
 * @param string $fortune_cleared 達成済み特級目標のJSON文字列 (オプション)
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

if (!$data || !isset($data['uuid'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$points = isset($data['points']) ? intval($data['points']) : 0;
$total_points = isset($data['total_points']) ? intval($data['total_points']) : 0;
$fortune_max_grade = isset($data['fortune_max_grade']) ? intval($data['fortune_max_grade']) : -1;
$fortune_cleared = isset($data['fortune_cleared']) ? $data['fortune_cleared'] : '{}';
$fortune_max_total_cost = isset($data['fortune_max_total_cost']) ? intval($data['fortune_max_total_cost']) : 0;

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

// fortune_clearedがJSON文字列として妥当かチェック
$clearedDecoded = json_decode($fortune_cleared, true);
if ($clearedDecoded === null && $fortune_cleared !== '{}') {
    $fortune_cleared = '{}';
}

$dir = __DIR__ . '/decks/players';
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

$playerData = null;

if ($fileSize === 0) {
    $playerName = isset($data['name']) ? $data['name'] : 'プレイヤー';
    $playerData = createDefaultPlayerData($uuid, $playerName);
} else {
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
        $playerData = json_decode($matches[2], true);
    }
}

if ($playerData) {
    $playerData['fortune_points'] = $points;
    $playerData['fortune_total_points'] = $total_points;

    // 最大等級は常に最大値を保持する
    $existingMaxGrade = isset($playerData['fortune_max_grade']) ? intval($playerData['fortune_max_grade']) : -1;
    if ($fortune_max_grade > $existingMaxGrade) {
        $playerData['fortune_max_grade'] = $fortune_max_grade;
    }

    // 達成済み情報はマージする（一度達成した目標は消えないように論理和でマージ）
    $existingCleared = isset($playerData['fortune_cleared']) ? json_decode($playerData['fortune_cleared'], true) : [];
    if (!is_array($existingCleared)) $existingCleared = [];
    $newCleared = is_array($clearedDecoded) ? $clearedDecoded : [];
    $mergedCleared = $existingCleared;
    foreach ($newCleared as $key => $val) {
        $mergedCleared[$key] = ($mergedCleared[$key] ?? false) || (bool)$val;
    }
    $playerData['fortune_cleared'] = json_encode($mergedCleared);

    // 一度に有効化した合計目標値の最大値を保持する（サーバー既存値より大きい場合のみ更新）
    $existingMaxTotalCost = isset($playerData['fortune_max_total_cost']) ? intval($playerData['fortune_max_total_cost']) : 0;
    if ($fortune_max_total_cost > $existingMaxTotalCost) {
        $playerData['fortune_max_total_cost'] = $fortune_max_total_cost;
    }

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

    if ($writeSuccess === strlen($js_content)) {
        echo json_encode([
            'success' => true,
            'fortune_points' => $playerData['fortune_points'],
            'fortune_total_points' => $playerData['fortune_total_points'],
            'fortune_max_grade' => $playerData['fortune_max_grade'] ?? -1,
        ]);
        exit;
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save updated file completely']);
        exit;
    }
} else {
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Failed to parse player data or file is corrupted']);
    exit;
}

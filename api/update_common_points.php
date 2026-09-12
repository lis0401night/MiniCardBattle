<?php
/**
 * Mini Card Battle - Update Common Points API
 * 
 * プレイヤーの共通ポイント（common_points）および累計共通ポイント（common_total_points）を更新・保存します。
 * `increment`フラグがtrueの場合、現在の値に加算します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $points 現在の所持共通ポイント
 * @param int $total_points 累計共通ポイント (オプション)
 * @param bool $increment trueなら加算、falseなら上書き (オプション)
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
$increment = isset($data['increment']) ? (bool)$data['increment'] : false;

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
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

$playerData = null;

if ($fileSize === 0) {
    $playerName = isset($data['name']) ? $data['name'] : 'プレイヤー';
    $playerData = createDefaultPlayerData($uuid, $playerName);
} else {
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
        $playerData = json_decode($matches[2], true);
    }
}

if ($playerData) {
    $currentPoints = isset($playerData['common_points']) ? intval($playerData['common_points']) : 0;
    $currentTotal = isset($playerData['common_total_points']) ? intval($playerData['common_total_points']) : 0;

    if ($increment) {
        $playerData['common_points'] = max(0, $currentPoints + $points);
        if ($total_points > 0) {
            $playerData['common_total_points'] = max(0, $currentTotal + $total_points);
        } else {
            if ($points > 0) {
                $playerData['common_total_points'] = max(0, $currentTotal + $points);
            }
        }
    } else {
        $playerData['common_points'] = max(0, $points);
        if ($total_points > 0) {
            $playerData['common_total_points'] = max(0, $total_points);
        } else {
            if (!isset($playerData['common_total_points']) || $playerData['common_total_points'] < $playerData['common_points']) {
                $playerData['common_total_points'] = $playerData['common_points'];
            }
        }
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
            'common_points' => $playerData['common_points'],
            'common_total_points' => $playerData['common_total_points']
        ]);
        exit;
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save updated file completely']);
        exit;
    }
} else {
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Player not found']);
    exit;
}

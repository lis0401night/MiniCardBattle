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
 * @param string $result 攻撃者視点のバトル結果 ('win' / 'lose' / 'draw')
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

$attacker_uuid = isset($data['attacker_uuid']) ? preg_replace('/[^a-z0-9-]/', '', (string) $data['attacker_uuid']) : '';

// プレイヤー名のサニタイズ（共通関数を使用）
// ※ DB/JSON 保存時は二重エスケープ・文字化けを防ぐため htmlspecialchars は適用せず生データで保持し、
//    フロントエンド描画側（React JSX や playerdata.html の escapeHtml/textContent）で安全にレンダリングします。
$attacker_name = sanitizePlayerDisplayName($data['attacker_name'] ?? null);
$attacker_character = isset($data['attacker_character']) ? preg_replace('/[^a-z0-9_]/', '', $data['attacker_character']) : 'android';
$attacker_skin = isset($data['attacker_skin']) ? preg_replace('/[^a-z0-9_]/', '', $data['attacker_skin']) : 'default';
$attacker_deck = sanitizeDeckList($data['attacker_deck'] ?? null);
$attacker_total_points = isset($data['attacker_total_points']) && is_numeric($data['attacker_total_points'])
    ? max(0, (int) $data['attacker_total_points'])
    : 0;

// 防衛側キャラクター・スキン・デッキのサニタイズ（リクエスト優先）
$defender_character = isset($data['defender_character']) ? preg_replace('/[^a-z0-9_]/', '', $data['defender_character']) : '';
$defender_skin = isset($data['defender_skin']) ? preg_replace('/[^a-z0-9_]/', '', $data['defender_skin']) : '';
$defender_deck = sanitizeDeckList($data['defender_deck'] ?? null);
$result = $data['result']; // 'win' (攻撃成功) / 'lose' (攻撃失敗) / 'draw' (引き分け)
if (!in_array($result, ['win', 'lose', 'draw'], true)) {
    echo json_encode(['success' => false, 'error' => 'Invalid result value']);
    exit;
}

// 防衛側視点での勝敗結果 ('win': 防衛成功, 'lose': 防衛失敗, 'draw': 引き分け)
$defense_result = $result === 'win' ? 'lose' : ($result === 'lose' ? 'win' : 'draw');

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
$content = $fileSize > 0 ? stream_get_contents($fp) : '';

$playerData = null;
if ($fileSize > 0 && preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
    $playerData = json_decode($matches[2], true);
}

if ($playerData) {
    // 防衛側情報のフォールバック解決（リクエストにない場合はターゲットプレイヤーデータから補完）
    if ($defender_character === '') {
        $defender_character = preg_replace('/[^a-z0-9_]/', '', (string)($playerData['character'] ?? 'android'));
    }
    if ($defender_character === '') {
        $defender_character = 'android';
    }
    if ($defender_skin === '') {
        $defender_skin = preg_replace('/[^a-z0-9_]/', '', (string)($playerData['skin'] ?? 'default'));
    }
    if ($defender_skin === '') {
        $defender_skin = 'default';
    }
    if (empty($defender_deck)) {
        $defender_deck = sanitizeDeckList($playerData['deck'] ?? null);
    }

    $history = isset($playerData['defense_history']) && is_array($playerData['defense_history']) 
        ? $playerData['defense_history'] 
        : [];

    $newRecord = [
        'result' => $defense_result,
        'attackerUuid' => $attacker_uuid,
        'attackerName' => $attacker_name,
        'attackerCharacter' => $attacker_character,
        'attackerSkin' => $attacker_skin,
        'attackerTotalPoints' => $attacker_total_points,
        'attackerDeck' => $attacker_deck,
        'defenderCharacter' => $defender_character,
        'defenderSkin' => $defender_skin,
        'defenderDeck' => $defender_deck,
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

    if ($writeSuccess !== strlen($js_content)) {
        echo json_encode(['success' => false, 'error' => 'Failed to save updated file completely']);
        exit;
    }

    // 【全体対戦ログ集約】直近対戦ログ (api/decks/recent_battles.json) に追記・一元化
    $recentLogFile = __DIR__ . '/decks/recent_battles.json';
    $rfp = @fopen($recentLogFile, 'c+');
    if ($rfp && flock($rfp, LOCK_EX)) {
        clearstatcache(true, $recentLogFile);
        $rfSize = filesize($recentLogFile);
        $rfContent = $rfSize > 0 ? stream_get_contents($rfp) : '';
        $recentBattles = $rfSize > 0 ? json_decode($rfContent, true) : [];
        if (!is_array($recentBattles)) {
            $recentBattles = [];
        }
        $logRecord = $newRecord;
        $logRecord['targetUuid'] = $target_uuid;
        $logRecord['targetName'] = $playerData['name'] ?? '防衛プレイヤー';
        $logRecord['targetCharacter'] = $defender_character;
        $logRecord['targetSkin'] = $defender_skin;

        array_unshift($recentBattles, $logRecord);
        // 最大2000件に制限
        $recentBattles = array_slice($recentBattles, 0, 2000);

        $recentJson = json_encode($recentBattles, JSON_UNESCAPED_UNICODE);
        if ($recentJson === false) {
            error_log('recent_battles.json のエンコードに失敗しました: ' . json_last_error_msg());
        } else {
            ftruncate($rfp, 0);
            rewind($rfp);
            $recentWritten = fwrite($rfp, $recentJson);
            fflush($rfp);
            if ($recentWritten !== strlen($recentJson)) {
                error_log('recent_battles.json の書き込みが不完全です。');
            }
        }
        flock($rfp, LOCK_UN);
        fclose($rfp);
    } else if ($rfp) {
        fclose($rfp);
    }

    echo json_encode(['success' => true, 'history' => $history]);
    exit;
} else {
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(['success' => false, 'error' => 'Failed to parse target player data']);
    exit;
}

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
$fortune_max_total_cost_automata = isset($data['fortune_max_total_cost_automata']) ? intval($data['fortune_max_total_cost_automata']) : 0;
$fortune_max_total_cost_valkyria = isset($data['fortune_max_total_cost_valkyria']) ? intval($data['fortune_max_total_cost_valkyria']) : 0;
$character = isset($data['character']) ? preg_replace('/[^a-z0-9_]/', '', (string)$data['character']) : '';


if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid uuid format']);
    exit;
}

// fortune_clearedがJSON文字列として妥当かチェック
$clearedDecoded = json_decode($fortune_cleared, true);
if ($clearedDecoded === null && $fortune_cleared !== '{}') {
    $fortune_cleared = '{}';
}

$defaultName = sanitizePlayerDisplayName($data['name'] ?? null);

$updateResult = modifyPlayerDataWithLock($uuid, function (array &$playerData) use (
    $points,
    $total_points,
    $fortune_max_grade,
    $clearedDecoded,
    $fortune_max_total_cost_automata,
    $fortune_max_total_cost_valkyria,
    $fortune_max_total_cost,
    $character
) {
    $playerData['fortune_points'] = $points;
    $playerData['fortune_total_points'] = $total_points;

    // 最大等級は常に最大値を保持する
    $existingMaxGrade = isset($playerData['fortune_max_grade']) ? intval($playerData['fortune_max_grade']) : -1;
    if ($fortune_max_grade > $existingMaxGrade) {
        $playerData['fortune_max_grade'] = $fortune_max_grade;
    }

    // 達成済み情報のマージ（キャラクター別構造: {"automata": {...}, "valkyria": {...}} を完全サポート）
    $existingCleared = isset($playerData['fortune_cleared']) ? json_decode($playerData['fortune_cleared'], true) : [];
    if (!is_array($existingCleared)) $existingCleared = [];

    // 既存データからマキナ・アンジェの各データを抽出（フラット旧形式の場合はそれぞれの初期値として扱う）
    $mergedAutomata = [];
    $mergedValkyria = [];
    if (isset($existingCleared['automata']) || isset($existingCleared['valkyria'])) {
        $mergedAutomata = is_array($existingCleared['automata'] ?? null) ? $existingCleared['automata'] : [];
        $mergedValkyria = is_array($existingCleared['valkyria'] ?? null) ? $existingCleared['valkyria'] : [];
    } else {
        // 旧形式（フラット）の場合、マキナ達成上限があるならマキナに、アンジェ達成上限があるならアンジェに割り振る
        $mergedAutomata = $existingCleared;
        $mergedValkyria = $existingCleared;
    }

    $newCleared = is_array($clearedDecoded) ? $clearedDecoded : [];
    if (isset($newCleared['automata']) || isset($newCleared['valkyria'])) {
        if (isset($newCleared['automata']) && is_array($newCleared['automata'])) {
            foreach ($newCleared['automata'] as $k => $v) {
                $mergedAutomata[$k] = ($mergedAutomata[$k] ?? false) || (bool)$v;
            }
        }
        if (isset($newCleared['valkyria']) && is_array($newCleared['valkyria'])) {
            foreach ($newCleared['valkyria'] as $k => $v) {
                $mergedValkyria[$k] = ($mergedValkyria[$k] ?? false) || (bool)$v;
            }
        }
    } else {
        // 新リクエストがフラット形式の場合は両方にマージ（互換性）
        foreach ($newCleared as $k => $v) {
            $mergedAutomata[$k] = ($mergedAutomata[$k] ?? false) || (bool)$v;
            $mergedValkyria[$k] = ($mergedValkyria[$k] ?? false) || (bool)$v;
        }
    }

    $playerData['fortune_cleared'] = json_encode([
        'automata' => $mergedAutomata,
        'valkyria' => $mergedValkyria
    ]);

    // キャラクター別目標コスト（個別レコードを保持）
    if (!isset($playerData['fortune_max_total_cost_automata'])) {
        $playerData['fortune_max_total_cost_automata'] = 0;
    }
    if (!isset($playerData['fortune_max_total_cost_valkyria'])) {
        $playerData['fortune_max_total_cost_valkyria'] = 0;
    }

    // クライアントから明示的に送信されたキャラクター別コストは常に最大値マージ（実績消失防止）
    $playerData['fortune_max_total_cost_automata'] = max(
        intval($playerData['fortune_max_total_cost_automata']),
        $fortune_max_total_cost_automata
    );
    $playerData['fortune_max_total_cost_valkyria'] = max(
        intval($playerData['fortune_max_total_cost_valkyria']),
        $fortune_max_total_cost_valkyria
    );

    // 今回のプレイ結果（fortune_max_total_cost）をプレイ対象キャラクターへ反映（ホワイトリスト判定）
    if ($character === 'valkyria') {
        $playerData['fortune_max_total_cost_valkyria'] = max(
            intval($playerData['fortune_max_total_cost_valkyria']),
            $fortune_max_total_cost
        );
    } elseif ($character === 'automata') {
        $playerData['fortune_max_total_cost_automata'] = max(
            intval($playerData['fortune_max_total_cost_automata']),
            $fortune_max_total_cost
        );
    }

    // 総合合計目標値（キャラクター別記録および今回の結果のうち最大値を保持）
    $autoCost = intval($playerData['fortune_max_total_cost_automata']);
    $valkCost = intval($playerData['fortune_max_total_cost_valkyria']);
    $playerData['fortune_max_total_cost'] = max($fortune_max_total_cost, $autoCost, $valkCost);

    $playerData['timestamp'] = time();
}, $defaultName);

if ($updateResult['success']) {
    $playerData = $updateResult['data'];
    echo json_encode([
        'success' => true,
        'fortune_points' => $playerData['fortune_points'],
        'fortune_total_points' => $playerData['fortune_total_points'],
        'fortune_max_grade' => $playerData['fortune_max_grade'] ?? -1,
        'fortune_max_total_cost_automata' => $playerData['fortune_max_total_cost_automata'] ?? 0,
        'fortune_max_total_cost_valkyria' => $playerData['fortune_max_total_cost_valkyria'] ?? 0,
    ]);
    exit;
} else {
    echo json_encode(['success' => false, 'error' => $updateResult['error']]);
    exit;
}

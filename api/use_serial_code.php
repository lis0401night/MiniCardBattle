<?php
/**
 * Mini Card Battle - Use Serial Code API
 * 
 * シリアルコードを検証し、プレイヤーがそのコードを使用したことをサーバーに記録します。
 * すでに使用済みの場合はエラーを返します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param string $code 入力されたシリアルコード
 * @return json 処理結果(success: true/false) およびエラーメッセージ
 */

header('Content-Type: application/json');
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['uuid']) || !isset($data['code'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$code = trim(strtoupper($data['code']));

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid UUID']);
    exit;
}

if ($code === '') {
    echo json_encode(['success' => false, 'error' => 'invalid_format']);
    exit;
}

// 定数ファイル（serials.json）からシリアルコード一覧をロード（ロック取得前に検証して不要な排他ロックを防止）
$json_path = __DIR__ . '/serials.json';
if (!file_exists($json_path)) {
    echo json_encode(['success' => false, 'error' => 'config_missing']);
    exit;
}

$serials_config = json_decode(file_get_contents($json_path), true);
if (!$serials_config) {
    echo json_encode(['success' => false, 'error' => 'config_corrupt']);
    exit;
}

// コードの検証
if (!isset($serials_config[$code])) {
    echo json_encode(['success' => false, 'error' => 'invalid_code']);
    exit;
}

$reward = $serials_config[$code];
$allowedRewardTypes = ['premium', 'playmat', 'skin', 'icon', 'card'];
if (
    !is_array($reward) ||
    !isset($reward['rewardType'], $reward['rewardValue']) ||
    !is_string($reward['rewardType']) ||
    !is_string($reward['rewardValue']) ||
    $reward['rewardValue'] === '' ||
    !in_array($reward['rewardType'], $allowedRewardTypes, true)
) {
    echo json_encode(['success' => false, 'error' => 'config_corrupt']);
    exit;
}
$rewardType = $reward['rewardType'];
$rewardValue = $reward['rewardValue'];
$rewardName = $reward['rewardName'] ?? '';
$isRecovered = false;

// プレイヤーデータの更新（共通ヘルパー modifyPlayerDataWithLock を使用して直列化・排他制御）
$updateResult = modifyPlayerDataWithLock($uuid, function (array &$player_data, array $playerResult) use (
    $code,
    $rewardType,
    $rewardValue,
    &$isRecovered
) {
    // used_serials が存在しなければ初期化
    if (!isset($player_data['used_serials']) || !is_array($player_data['used_serials'])) {
        $player_data['used_serials'] = [];
    }

    // すでに使用済みかチェック（巻き戻しバグ救済のための自己修復ロジック）
    // 既存使用済みの場合は保存を中断して成功（recovered: true）として返却
    if (in_array($code, $player_data['used_serials'], true)) {
        $isRecovered = true;
        return false; // 余計なディスクI/Oをスキップして中断
    }

    if ($rewardType === 'premium') {
        if (!isset($player_data['unlocked_premium_cards']) || !is_array($player_data['unlocked_premium_cards'])) {
            $player_data['unlocked_premium_cards'] = [];
        }
        if (!in_array($rewardValue, $player_data['unlocked_premium_cards'], true)) {
            $player_data['unlocked_premium_cards'][] = $rewardValue;
        }
    } else if ($rewardType === 'playmat') {
        if (!isset($player_data['owned_playmats']) || !is_array($player_data['owned_playmats'])) {
            $player_data['owned_playmats'] = [];
        }
        if (!in_array($rewardValue, $player_data['owned_playmats'], true)) {
            $player_data['owned_playmats'][] = $rewardValue;
        }
    } else if ($rewardType === 'skin') {
        if (!isset($player_data['unlocked_skins']) || !is_array($player_data['unlocked_skins'])) {
            $player_data['unlocked_skins'] = [];
        }
        if (!in_array($rewardValue, $player_data['unlocked_skins'], true)) {
            $player_data['unlocked_skins'][] = $rewardValue;
        }
    } else if ($rewardType === 'icon') {
        if (!isset($player_data['unlocked_icons']) || !is_array($player_data['unlocked_icons'])) {
            $player_data['unlocked_icons'] = [];
        }
        if (!in_array($rewardValue, $player_data['unlocked_icons'], true)) {
            $player_data['unlocked_icons'][] = $rewardValue;
        }
    } else if ($rewardType === 'card') {
        if (!isset($player_data['inventory']) || !is_array($player_data['inventory'])) {
            $player_data['inventory'] = [];
        }
        $player_data['inventory'][$rewardValue] = min(99, ($player_data['inventory'][$rewardValue] ?? 0) + 1);
    }

    // 使用済みシリアルコードを追加
    $player_data['used_serials'][] = $code;
    $player_data['timestamp'] = time();

    return true;
}, 'プレイヤー');

// すでに使用済みだった場合の巻き戻し救済レスポンス
if ($isRecovered) {
    echo json_encode([
        'success' => true,
        'reward' => $rewardValue,
        'rewardType' => $rewardType,
        'rewardName' => $rewardName,
        'recovered' => true
    ]);
    exit;
}

if (!$updateResult['success']) {
    $rawError = $updateResult['error'] ?? '';
    $errorCode = 'failed_to_save';

    if ($rawError === 'Failed to acquire player lock') {
        $errorCode = 'failed_to_acquire_lock';
    } else if ($rawError === 'Failed to parse player data or file is corrupted') {
        $errorCode = 'player_data_corrupt';
    } else if ($rawError === 'Invalid uuid format') {
        $errorCode = 'Invalid UUID';
    }

    echo json_encode(['success' => false, 'error' => $errorCode]);
    exit;
}

echo json_encode([
    'success' => true,
    'reward' => $rewardValue,
    'rewardType' => $rewardType,
    'rewardName' => $rewardName
]);
exit;


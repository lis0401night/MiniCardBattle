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

// パラメータのバリデーション・サニタイズ
$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$character = preg_replace('/[^a-z0-9_]/', '', $data['character']);
$deck = sanitizeDeckList($data['deck'] ?? null);
$timestamp = time();

if (strlen($uuid) < 10 || count($deck) !== 20 || $character === '') {
    echo json_encode(['success' => false, 'error' => 'Invalid data format']);
    exit;
}

// プレイヤー表示名のサニタイズ
$hasName = array_key_exists('name', $data) && $data['name'] !== null;
$name = $hasName ? sanitizePlayerDisplayName($data['name']) : 'プレイヤー';

// 各オプション項目の有無とサニタイズ判定（明示的に送信された場合のみ上書き更新する）
$hasStage = array_key_exists('stage', $data) && $data['stage'] !== null;
$stage = $hasStage ? preg_replace('/[^a-z0-9_]/', '', (string)$data['stage']) : null;

$hasSkin = array_key_exists('skin', $data) && $data['skin'] !== null;
$skin = $hasSkin ? preg_replace('/[^a-z0-9_]/', '', (string)$data['skin']) : null;

// プレイマットのサニタイズ判定
// プレイマットは未設定（なし）状態が存在するため、null が正規の初期値および解除値となる。
// 空文字列やサニタイズ後に空となった不正文字列は null に正規化してクリア操作として扱う。
$hasPlaymat = array_key_exists('playmat', $data);
$playmat = null;
if ($hasPlaymat && $data['playmat'] !== null) {
    $cleanedPlaymat = preg_replace('/[^a-z0-9_]/', '', (string)$data['playmat']);
    $playmat = $cleanedPlaymat !== '' ? $cleanedPlaymat : null;
}

$hasIcon = array_key_exists('icon', $data) && $data['icon'] !== null;
$icon = $hasIcon ? preg_replace('/[^a-z0-9_]/', '', (string)$data['icon']) : null;

// スキン情報全体の取得とサニタイズ（トークン画像の正しい表示に必要）
$hasSkins = array_key_exists('skins', $data) && is_array($data['skins']);
$skins = [];
if ($hasSkins) {
    foreach ($data['skins'] as $key => $val) {
        $safeKey = preg_replace('/[^a-z0-9_]/', '', $key);
        $safeVal = preg_replace('/[^a-z0-9_]/', '', $val);
        if ($safeKey && $safeVal) {
            $skins[$safeKey] = $safeVal;
        }
    }
}

$initial_points = isset($data['points']) ? intval($data['points']) : 0;
$initial_total_points = isset($data['total_points']) ? intval($data['total_points']) : $initial_points;

$updateResult = modifyPlayerDataWithLock($uuid, function (array &$player_data, array $playerResult) use (
    $name,
    $hasName,
    $character,
    $deck,
    $hasStage,
    $stage,
    $hasSkin,
    $skin,
    $hasPlaymat,
    $playmat,
    $hasIcon,
    $icon,
    $hasSkins,
    $skins,
    $timestamp,
    $initial_points,
    $initial_total_points
) {
    // 新規プレイヤーの場合は初期ポイントおよびデフォルト値を設定
    if ($playerResult['status'] === 'new') {
        $player_data['points'] = $initial_points;
        $player_data['total_points'] = $initial_total_points;
        $player_data['stage'] = ($hasStage && $stage !== '') ? $stage : 'plain';
        $player_data['skin'] = ($hasSkin && $skin !== '') ? $skin : 'default';
        $player_data['icon'] = ($hasIcon && $icon !== '') ? $icon : 'player';
        // プレイマットは未指定時または解除時は null が正規値（空文字は事前に null へ正規化済み）
        $player_data['playmat'] = $hasPlaymat ? $playmat : null;
        $player_data['skins'] = $skins;
    } else {
        // 既存プレイヤーの場合は、明示的に送信されたオプション項目のみを上書き更新し、未送信項目は既存値を維持する
        if ($hasStage && $stage !== '') {
            $player_data['stage'] = $stage;
        }
        if ($hasSkin && $skin !== '') {
            $player_data['skin'] = $skin;
        }
        if ($hasIcon && $icon !== '') {
            $player_data['icon'] = $icon;
        }
        if ($hasPlaymat) {
            // null は意図的なプレイマット解除操作として正常に反映（空文字は事前に null へ正規化済み）
            $player_data['playmat'] = $playmat;
        }
        if ($hasSkins) {
            $player_data['skins'] = $skins;
        }
    }

    // 必須項目・基幹情報の更新
    if ($hasName && $name !== '') {
        $player_data['name'] = $name;
    }
    $player_data['character'] = $character;
    $player_data['deck'] = $deck;
    $player_data['timestamp'] = $timestamp;
    $player_data['lastAccessAt'] = $timestamp;
}, $name);

if ($updateResult['success']) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => $updateResult['error']]);
}

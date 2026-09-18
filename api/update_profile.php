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
$name = sanitizePlayerDisplayName($data['name'] ?? null);
$icon = preg_replace('/[^a-z0-9_]/', '', $data['icon']);
$timestamp = time();

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid UUID']);
    exit;
}

$updateResult = modifyPlayerDataWithLock($uuid, function (array &$player_data) use ($uuid, $name, $icon, $timestamp, $data) {
    // プロフィール情報を更新
    $player_data['uuid'] = $uuid;
    $player_data['name'] = $name;
    $player_data['icon'] = $icon;
    if (array_key_exists('favoriteCard', $data)) {
        $cleaned_card_id = (is_array($data['favoriteCard']) && isset($data['favoriteCard']['cardId']))
            ? preg_replace('/[^a-zA-Z0-9_]/', '', (string) $data['favoriteCard']['cardId'])
            : '';
        if ($cleaned_card_id !== '') {
            // cardIdのみサニタイズし、isPremiumはbool型で保持
            $player_data['favorite_card'] = [
                'cardId' => $cleaned_card_id,
                'isPremium' => !empty($data['favoriteCard']['isPremium']),
            ];
        } else {
            // nullや空のcardIdが送られた場合はお気に入り解除
            $player_data['favorite_card'] = null;
        }
    }
    $player_data['timestamp'] = $timestamp;
}, $name);

if ($updateResult['success']) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => $updateResult['error']]);
}

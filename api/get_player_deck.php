<?php
/**
 * Mini Card Battle - Get Single Player Deck API
 * 
 * 指定されたUUIDのプレイヤーデータ（デッキおよび設定情報）を取得します。
 * helpers.php の loadPlayerData を使用し、高速な .json 形式を優先取得し、
 * 未移行の場合は旧 .js 形式から安全にパースして返却します（デュアルリード）。
 * 
 * @method GET
 * @param string $uuid 取得対象プレイヤーのUUID
 * @return json プレイヤーデータレスポンス
 */

require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

$uuid = isset($_GET['uuid']) ? (string)$_GET['uuid'] : '';
$cleanUuid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $uuid);

if ($cleanUuid === '') {
    echo json_encode(['success' => false, 'error' => 'Missing or invalid uuid']);
    exit;
}

$dir = getPlayersDirectory();
$playerData = loadPlayerData($cleanUuid, $dir);

if ($playerData && is_array($playerData)) {
    // 防衛戦の対戦・演出に必要な公開項目のみをホワイトリストで抽出（不要なインベントリやシリアル履歴等の情報露出を防止）
    $publicKeys = [
        'uuid',
        'name',
        'icon',
        'character',
        'skin',
        'skins',
        'playmat',
        'stage',
        'deck',
        'points',
        'total_points',
        'defense_wins',
        'timestamp',
    ];
    $publicPlayer = array_intersect_key($playerData, array_flip($publicKeys));

    echo json_encode([
        'success' => true,
        'player' => $publicPlayer,
    ]);
} else {
    echo json_encode([
        'success' => false,
        'error' => 'Player not found or data corrupted',
    ]);
}

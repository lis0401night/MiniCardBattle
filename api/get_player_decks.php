<?php
/**
 * Mini Card Battle - Get Player Decks API
 * 
 * サーバーに登録されている全プレイヤーのデッキ・ポイント情報を取得します。
 * 
 * @method GET|POST
 * @return json 全プレイヤーのデータを含む配列
 */

require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

$players = loadAllPlayers(false);

echo json_encode([
    'success' => true,
    'players' => $players,
    'totalPlayerCount' => count($players),
]);


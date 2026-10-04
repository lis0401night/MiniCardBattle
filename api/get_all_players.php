<?php
/**
 * Mini Card Battle - Get All Players API
 * 
 * サーバーに登録されている全プレイヤーの完全なデータを取得します。
 * デッキ情報を含む全データを返します（playerdata.html用）。
 * 
 * @method GET
 * @return json 全プレイヤーのフルデータを含む配列
 */

require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

$players = loadAllPlayers(true);

// 全体対戦ログ (api/decks/recent_battles.json) の読み込み（共有ロック付き）
$recentBattles = loadRecentBattles();

// クイックマッチ対戦ログ (api/decks/recent_quick_battles.json) の読み込み（共有ロック付き）
$recentQuickBattles = loadRecentQuickBattles();

echo json_encode([
    'success' => true,
    'players' => $players,
    'recent_battles' => $recentBattles,
    'recent_quick_battles' => $recentQuickBattles,
]);

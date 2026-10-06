<?php
/**
 * Mini Card Battle - Get Quick Battles API
 * 
 * サーバーに記録されているクイックマッチの対戦履歴（recent_quick_battles.json）を取得します。
 * クイックマッチの時間帯別マッチング傾向グラフや分析画面等で使用されます。
 * 
 * @method GET
 * @return json クイックマッチ対戦履歴リスト
 */

require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

// クイックマッチ対戦ログ (api/decks/recent_quick_battles.json) の読み込み（共有ロック付き）
$recentQuickBattles = loadRecentQuickBattles();

echo json_encode([
    'success' => true,
    'recent_quick_battles' => $recentQuickBattles,
]);

<?php
/**
 * Mini Card Battle - Record Quick Battle API
 * 
 * クイックマッチの対人戦（PvP）において、対戦終了時に勝者プレイヤーから
 * 対戦結果（勝者・敗者のプレイヤー情報、デッキ、勝敗）を受け取り、
 * 全体クイックマッチ対戦履歴（recent_quick_battles.json）に安全に記録します。
 * 
 * 【二重記録防止の徹底】
 * クライアント側で勝者のみが送信する設計に加え、
 * サーバー側でも対戦固有の match_id が既に保存済みであれば重複追記を無視（スキップ）します。
 * 
 * @method POST
 * @param string $match_id 対戦固有識別子
 * @param string $winner_uuid 勝者のUUID
 * @param string $winner_name 勝者の名前
 * @param string $winner_character 勝者のキャラクターID
 * @param string $winner_skin 勝者のスキンID
 * @param int $winner_rating 勝者のレート
 * @param array $winner_deck 勝者の使用デッキ
 * @param string $loser_uuid 敗者のUUID
 * @param string $loser_name 敗者の名前
 * @param string $loser_character 敗者のキャラクターID
 * @param string $loser_skin 敗者のスキンID
 * @param int $loser_rating 敗者のレート
 * @param array $loser_deck 敗者の使用デッキ
 * @param int|null $turns 経過ターン数
 * @param string $result 勝敗結果 ('win' / 'draw')
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

if (!$data || !is_array($data)) {
    echo json_encode(['success' => false, 'error' => 'Missing or invalid request payload']);
    exit;
}

// 必須パラメータ: match_id
$match_id = isset($data['match_id']) ? preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$data['match_id']) : '';
if ($match_id === '') {
    echo json_encode(['success' => false, 'error' => 'Missing or invalid match_id']);
    exit;
}

// 勝者（送信者）情報
$winner_uuid = isset($data['winner_uuid']) ? preg_replace('/[^a-z0-9\-]/', '', (string)$data['winner_uuid']) : '';
$winner_name = sanitizePlayerDisplayName($data['winner_name'] ?? null);
$winner_character = isset($data['winner_character']) ? preg_replace('/[^a-z0-9_]/', '', (string)$data['winner_character']) : 'android';
$winner_skin = isset($data['winner_skin']) ? preg_replace('/[^a-z0-9_]/', '', (string)$data['winner_skin']) : 'default';
$winner_rating = isset($data['winner_rating']) && is_numeric($data['winner_rating']) ? max(0, (int)$data['winner_rating']) : 0;
$winner_deck = sanitizeDeckList($data['winner_deck'] ?? null);

// 敗者（対戦相手）情報
$loser_uuid = isset($data['loser_uuid']) ? preg_replace('/[^a-z0-9\-]/', '', (string)$data['loser_uuid']) : '';
$loser_name = sanitizePlayerDisplayName($data['loser_name'] ?? null);
$loser_character = isset($data['loser_character']) ? preg_replace('/[^a-z0-9_]/', '', (string)$data['loser_character']) : 'android';
$loser_skin = isset($data['loser_skin']) ? preg_replace('/[^a-z0-9_]/', '', (string)$data['loser_skin']) : 'default';
$loser_rating = isset($data['loser_rating']) && is_numeric($data['loser_rating']) ? max(0, (int)$data['loser_rating']) : 0;
$loser_deck = sanitizeDeckList($data['loser_deck'] ?? null);

// 対戦結果・進行データ
$result = isset($data['result']) && in_array($data['result'], ['win', 'draw'], true) ? $data['result'] : 'win';
$turns = isset($data['turns']) && is_numeric($data['turns']) ? max(1, (int)$data['turns']) : null;
$timestamp = isset($data['timestamp']) && is_numeric($data['timestamp']) ? (int)$data['timestamp'] : time();

$record = [
    'match_id' => $match_id,
    'timestamp' => $timestamp,
    'result' => $result,
    'turns' => $turns,
    'winnerUuid' => $winner_uuid,
    'winnerName' => $winner_name,
    'winnerCharacter' => $winner_character,
    'winnerSkin' => $winner_skin,
    'winnerRating' => $winner_rating,
    'winnerDeck' => $winner_deck,
    'loserUuid' => $loser_uuid,
    'loserName' => $loser_name,
    'loserCharacter' => $loser_character,
    'loserSkin' => $loser_skin,
    'loserRating' => $loser_rating,
    'loserDeck' => $loser_deck,
];

// 全体クイックマッチ対戦履歴に安全に追記（重複 match_id は自動スキップ）
$success = appendRecentQuickBattle($record);

echo json_encode([
    'success' => $success,
    'match_id' => $match_id,
]);

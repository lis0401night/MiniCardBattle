<?php
/**
 * Mini Card Battle - API Helper Functions
 * 
 * TODO: 【重要技術的負債】データ保存処理のアトミック化について
 * 現在、各API（heartbeat, register_deck, update_points等）で行われている 
 * `ftruncate($fp, 0)` -> `fwrite()` のフローは、書き込み処理中にサーバーエラーや
 * 容量不足が起きるとセーブデータが0バイトになって消滅する脆弱性があります。
 * 将来的には、ここ（helpers.php）に一時ファイルへの書き込みとリネーム上書き（OSの
 * アトミック操作）を行う共通関数（例: `atomicFileSave`）を作成し、
 * すべての保存処理を置き換えるリファクタリングを検討してください。
 */

/**
 * プレイヤーのデフォルトデータ構造を生成します。
 * スキーマの統一を図るための共通関数です。
 * 
 * @param string $uuid プレイヤーのUUID
 * @param string $name プレイヤー名
 * @param int $points 初期防衛ポイント
 * @param int|null $total_points 初期累計防衛ポイント
 * @return array デフォルトデータ構造
 */
function createDefaultPlayerData($uuid, $name = 'プレイヤー', $points = 0, $total_points = null) {
    return [
        'uuid' => $uuid,
        'name' => $name,
        'icon' => 'player',
        'character' => null,
        'skin' => 'default',
        'playmat' => null,
        'stage' => null,
        'deck' => [],
        'points' => $points,
        'total_points' => $total_points !== null ? $total_points : $points,
        'defense_wins' => 0,
        'challenge_points' => 0,
        'challenge_total_points' => 0,
        'challenge_max_streak' => 0,
        'tournament_points' => 0,
        'tournament_total_points' => 0,
        'high_difficulty_points' => 0,
        'high_difficulty_total_points' => 0,
        'fortune_points' => 0,
        'fortune_total_points' => 0,
        'fortune_max_grade' => -1,
        'fortune_max_total_cost' => 0,
        'fortune_cleared' => '{}',
        'inventory' => [],
        'unlocked_premium_cards' => [],
        'registered_decks' => [],
        'lastAccessAt' => time()
    ];
}

/**
 * プレイヤー表示名をサニタイズ（制御文字除去・長さを切り詰め・空文字時のデフォルト代入）します。
 * 
 * ※ DB/JSON 保存時は二重エスケープ・文字化けを防ぐため htmlspecialchars は行わず生文字列で保持し、
 *    画面描画（React JSX / escapeHtml）側で安全にサニタイズ・レンダリングする設計としています。
 * 
 * @param string|null $name 対象の名前文字列
 * @param string $default デフォルト表示名（デフォルト: '挑戦者'）
 * @param int $maxLength 最大文字数（デフォルト: 12）
 * @return string サニタイズ済み文字列
 */
function sanitizePlayerDisplayName(?string $name, string $default = '挑戦者', int $maxLength = 12): string {
    $cleaned = mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', '', (string) $name), 0, $maxLength);
    return $cleaned === '' ? $default : $cleaned;
}

/**
 * 所持カード（インベントリ）データをサニタイズします。
 * キーを安全なカードIDに正規化し、枚数を正の整数（1〜99）に制限します。
 * 
 * @param mixed $inventory 入力インベントリデータ
 * @return array サニタイズ済みインベントリマップ
 */
function sanitizeInventory($inventory): array {
    if (!is_array($inventory)) {
        return [];
    }
    $sanitized = [];
    foreach ($inventory as $cardId => $count) {
        $safeCardId = preg_replace('/[^a-z0-9_]/', '', (string) $cardId);
        $intCount = intval($count);
        if ($safeCardId !== '' && $intCount > 0) {
            $sanitized[$safeCardId] = min($intCount, 99);
        }
    }
    return $sanitized;
}

/**
 * 解放済みプレミアムカード配列をサニタイズします。
 * 安全なカードIDのみを抽出し、重複を排除します。
 * 
 * @param mixed $unlockedPremium 入力プレミアムカード配列
 * @return array サニタイズ済みプレミアムカードID配列
 */
function sanitizeUnlockedPremiumCards($unlockedPremium): array {
    if (!is_array($unlockedPremium)) {
        return [];
    }
    $sanitized = [];
    foreach ($unlockedPremium as $cardId) {
        $safeCardId = preg_replace('/[^a-z0-9_]/', '', (string) $cardId);
        if ($safeCardId !== '') {
            $sanitized[] = $safeCardId;
        }
    }
    return array_values(array_unique($sanitized));
}

/**
 * プレイヤーの全登録デッキデータをサニタイズします。
 * 最大30スロットまでのデッキ配列を検証し、各デッキのリーダーIDやカードリストを正規化します。
 * 
 * @param mixed $decks 入力デッキ配列
 * @return array サニタイズ済みデッキ配列
 */
function sanitizeRegisteredDecks($decks): array {
    if (!is_array($decks)) {
        return [];
    }
    $sanitized = [];
    $maxDecks = 30;
    $count = 0;

    foreach ($decks as $deck) {
        if (!is_array($deck) || $count >= $maxDecks) {
            continue;
        }
        $name = isset($deck['name'])
            ? mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', '', (string) $deck['name']), 0, 20)
            : 'デッキ';
        if ($name === '') {
            $name = 'デッキ';
        }
        $leaderId = isset($deck['leaderId'])
            ? preg_replace('/[^a-z0-9_]/', '', (string) $deck['leaderId'])
            : 'android';
        if ($leaderId === '') {
            $leaderId = 'android';
        }

        $cards = [];
        if (isset($deck['cards']) && is_array($deck['cards'])) {
            foreach ($deck['cards'] as $cardEntry) {
                if (count($cards) >= 20) break;
                if (is_array($cardEntry)) {
                    $cId = preg_replace('/[^a-z0-9_]/', '', (string) ($cardEntry['id'] ?? ''));
                    $isPrem = !empty($cardEntry['isPremium']);
                    if ($cId !== '') {
                        $cards[] = $isPrem ? ['id' => $cId, 'isPremium' => true] : $cId;
                    }
                } else {
                    $cId = preg_replace('/[^a-z0-9_]/', '', (string) $cardEntry);
                    if ($cId !== '') {
                        $cards[] = $cId;
                    }
                }
            }
        }

        $sanitizedDeck = [
            'name' => $name,
            'leaderId' => $leaderId,
            'cards' => $cards,
        ];
        if (isset($deck['stage'])) {
            $sanitizedDeck['stage'] = preg_replace('/[^a-z0-9_]/', '', (string) $deck['stage']);
        }
        if (isset($deck['playmatId'])) {
            $sanitizedDeck['playmatId'] = preg_replace('/[^a-z0-9_]/', '', (string) $deck['playmatId']);
        }

        $sanitized[] = $sanitizedDeck;
        $count++;
    }
    return $sanitized;
}


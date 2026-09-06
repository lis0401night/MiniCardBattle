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
        'high_difficulty_cleared' => '{}',
        'fortune_points' => 0,
        'fortune_total_points' => 0,
        'fortune_max_grade' => -1,
        'fortune_max_total_cost' => 0,
        'fortune_cleared' => '{}',
        'inventory' => [],
        'unlocked_premium_cards' => [],
        'unlocked_icons' => [],
        'unlocked_skins' => [],
        'owned_playmats' => [],
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
 * カードマスタ順序マップ（[cardId => index]）を取得・キャッシュします。
 * card_order.json（CARD_MASTERから自動生成されるカードID一覧）を読み込み、
 * カードIDをキー、定義順インデックスを値とする連想配列を返します。
 * 
 * @return array<string, int> カードIDマップ
 */
function getCardOrderMap(): array {
    static $cardOrderMap = null;
    if ($cardOrderMap === null) {
        $cardOrderMap = [];
        $orderFile = __DIR__ . '/card_order.json';
        if (file_exists($orderFile)) {
            $orderList = json_decode(file_get_contents($orderFile), true);
            if (is_array($orderList)) {
                $cardOrderMap = array_flip($orderList);
            }
        }
    }
    return $cardOrderMap;
}

/**
 * 所持カード（インベントリ）データをサニタイズします。
 * キーを安全なカードIDに正規化し、カードマスタに存在するカードのみ枚数を正の整数（1〜99）に制限して保持します。
 * 
 * @param mixed $inventory 入力インベントリデータ
 * @return array サニタイズ済みインベントリマップ
 */
function sanitizeInventory($inventory): array {
    if (!is_array($inventory)) {
        return [];
    }
    $cardOrderMap = getCardOrderMap();
    $sanitized = [];
    foreach ($inventory as $cardId => $count) {
        $safeCardId = preg_replace('/[^a-zA-Z0-9_]/', '', (string) $cardId);
        $intCount = intval($count);
        if ($safeCardId !== '' && isset($cardOrderMap[$safeCardId]) && $intCount > 0) {
            $sanitized[$safeCardId] = min($intCount, 99);
        }
    }
    return $sanitized;
}

/**
 * 解放済みプレミアムカード配列をサニタイズします。
 * カードマスタに存在する安全なカードIDのみを抽出し、重複を排除します。
 * 
 * @param mixed $unlockedPremium 入力プレミアムカード配列
 * @return array サニタイズ済みプレミアムカードID配列
 */
function sanitizeUnlockedPremiumCards($unlockedPremium): array {
    if (!is_array($unlockedPremium)) {
        return [];
    }
    $cardOrderMap = getCardOrderMap();
    $sanitized = [];
    foreach ($unlockedPremium as $cardId) {
        $safeCardId = preg_replace('/[^a-zA-Z0-9_]/', '', (string) $cardId);
        if ($safeCardId !== '' && isset($cardOrderMap[$safeCardId])) {
            $sanitized[] = $safeCardId;
        }
    }
    $unique = array_values(array_unique($sanitized));
    usort($unique, function($a, $b) use ($cardOrderMap) {
        $idxA = $cardOrderMap[$a] ?? PHP_INT_MAX;
        $idxB = $cardOrderMap[$b] ?? PHP_INT_MAX;
        if ($idxA !== $idxB) {
            return $idxA <=> $idxB;
        }
        return strcmp($a, $b);
    });
    return $unique;
}

/** デッキ配列の最大保存枚数 */
const MAX_RECORDED_DECK_SIZE = 20;

/**
 * カード配列（カードID文字列 または {id, isPremium} オブジェクト）を CARD_MASTER の定義順（ID順）にソート（正規化）します。
 * 
 * @param array $cards カード配列
 * @return array ソート済みカード配列
 */
function sortDeckCardsByMasterOrder(array $cards): array {
    $cardOrderMap = getCardOrderMap();

    usort($cards, function($a, $b) use ($cardOrderMap) {
        $idA = is_scalar($a) ? (string)$a : ($a['id'] ?? '');
        $idB = is_scalar($b) ? (string)$b : ($b['id'] ?? '');
        $idxA = $cardOrderMap[$idA] ?? PHP_INT_MAX;
        $idxB = $cardOrderMap[$idB] ?? PHP_INT_MAX;
        if ($idxA !== $idxB) {
            return $idxA <=> $idxB;
        }
        $premA = is_array($a) && !empty($a['isPremium']) ? 1 : 0;
        $premB = is_array($b) && !empty($b['isPremium']) ? 1 : 0;
        return $premA <=> $premB;
    });

    return $cards;
}

/**
 * デッキ配列（カードID文字列 または {id, isPremium} オブジェクト）をサニタイズし、定義順（ID順）にソートします。
 * 最大枚数（MAX_RECORDED_DECK_SIZE枚）まで安全な文字（[a-zA-Z0-9_]）かつカードマスタに存在するIDのみを抽出・保持します。
 * 
 * @param mixed $rawDeck リクエストまたは保存データ由来のデッキ配列
 * @return array サニタイズおよびソート済みデッキ配列
 */
function sanitizeDeckList($rawDeck): array {
    $result = [];
    if (!is_array($rawDeck)) {
        return $result;
    }
    $cardOrderMap = getCardOrderMap();

    foreach ($rawDeck as $item) {
        if (count($result) >= MAX_RECORDED_DECK_SIZE) {
            break;
        }
        if (is_scalar($item)) {
            $cleaned_id = preg_replace('/[^a-zA-Z0-9_]/', '', (string) $item);
            if ($cleaned_id !== '' && isset($cardOrderMap[$cleaned_id])) {
                $result[] = $cleaned_id;
            }
        } else if (is_array($item) && isset($item['id']) && is_scalar($item['id'])) {
            $cleaned_id = preg_replace('/[^a-zA-Z0-9_]/', '', (string) $item['id']);
            if ($cleaned_id !== '' && isset($cardOrderMap[$cleaned_id])) {
                $isPrem = !empty($item['isPremium']);
                $result[] = $isPrem ? ['id' => $cleaned_id, 'isPremium' => true] : $cleaned_id;
            }
        }
    }
    return sortDeckCardsByMasterOrder($result);
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

        // カード配列の正規化は共通関数へ一元化（上限は MAX_RECORDED_DECK_SIZE）
        $cards = sanitizeDeckList($deck['cards'] ?? null);

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

/**
 * 解放済みアイコンID配列をサニタイズします。
 * 安全な文字（[a-zA-Z0-9_]）のみを抽出し、重複を排除します。
 * 
 * @param mixed $unlockedIcons 入力アイコンID配列
 * @return array サニタイズ済みアイコンID配列
 */
function sanitizeUnlockedIcons($unlockedIcons): array {
    if (!is_array($unlockedIcons)) {
        return [];
    }
    $sanitized = [];
    foreach ($unlockedIcons as $iconId) {
        $safeIconId = preg_replace('/[^a-zA-Z0-9_]/', '', (string) $iconId);
        if ($safeIconId !== '') {
            $sanitized[] = $safeIconId;
        }
    }
    $unique = array_values(array_unique($sanitized));
    sort($unique, SORT_STRING);
    return $unique;
}

/**
 * 解放済みスキンID配列をサニタイズします。
 * 安全な文字（[a-zA-Z0-9_]）のみを抽出し、重複を排除してソートします。
 * 
 * @param mixed $unlockedSkins 入力スキンID配列
 * @return array サニタイズ済みスキンID配列
 */
function sanitizeUnlockedSkins($unlockedSkins): array {
    if (!is_array($unlockedSkins)) {
        return [];
    }
    $sanitized = [];
    foreach ($unlockedSkins as $skinId) {
        $safeSkinId = preg_replace('/[^a-zA-Z0-9_]/', '', (string) $skinId);
        if ($safeSkinId !== '') {
            $sanitized[] = $safeSkinId;
        }
    }
    $unique = array_values(array_unique($sanitized));
    sort($unique, SORT_STRING);
    return $unique;
}

/**
 * 所持プレイマットID配列をサニタイズします。
 * 安全な文字（[a-zA-Z0-9_]）のみを抽出し、重複を排除してソートします。
 * 
 * @param mixed $ownedPlaymats 入力プレイマットID配列
 * @return array サニタイズ済みプレイマットID配列
 */
function sanitizeOwnedPlaymats($ownedPlaymats): array {
    if (!is_array($ownedPlaymats)) {
        return [];
    }
    $sanitized = [];
    foreach ($ownedPlaymats as $pmId) {
        $safePmId = preg_replace('/[^a-zA-Z0-9_]/', '', (string) $pmId);
        if ($safePmId !== '') {
            $sanitized[] = $safePmId;
        }
    }
    $unique = array_values(array_unique($sanitized));
    sort($unique, SORT_STRING);
    return $unique;
}

/**
 * プレイヤーデータに対して、リクエストから渡されたインベントリ、プレミアム解放カード、解放済みアイコン、解放済みスキン、所持プレイマット、登録デッキの更新を適用します。
 * キャメルケース・スネークケースの別名キー解決を一元化します。
 * 
 * @param array &$player_data 更新対象のプレイヤーデータ配列（参照渡し）
 * @param array $data リクエスト本文データ
 */
function applyPlayerCollectionUpdates(array &$player_data, array $data): void {
    if (isset($data['inventory'])) {
        $player_data['inventory'] = sanitizeInventory($data['inventory']);
    }
    $rawUnlockedPremium = $data['unlocked_premium_cards'] ?? $data['unlockedPremiumCards'] ?? null;
    if ($rawUnlockedPremium !== null) {
        $player_data['unlocked_premium_cards'] = sanitizeUnlockedPremiumCards($rawUnlockedPremium);
    }
    $rawUnlockedIcons = $data['unlocked_icons'] ?? $data['unlockedIcons'] ?? null;
    if ($rawUnlockedIcons !== null) {
        $player_data['unlocked_icons'] = sanitizeUnlockedIcons($rawUnlockedIcons);
    }
    $rawUnlockedSkins = $data['unlocked_skins'] ?? $data['unlockedSkins'] ?? null;
    if ($rawUnlockedSkins !== null) {
        $player_data['unlocked_skins'] = sanitizeUnlockedSkins($rawUnlockedSkins);
    }
    $rawOwnedPlaymats = $data['owned_playmats'] ?? $data['ownedPlaymats'] ?? null;
    if ($rawOwnedPlaymats !== null) {
        $player_data['owned_playmats'] = sanitizeOwnedPlaymats($rawOwnedPlaymats);
    }
    $rawDecks = $data['registered_decks'] ?? $data['decks'] ?? null;
    if ($rawDecks !== null) {
        $player_data['registered_decks'] = sanitizeRegisteredDecks($rawDecks);
    }
}



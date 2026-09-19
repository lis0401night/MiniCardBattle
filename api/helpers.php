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
        'defense_converted_points' => 0,
        'challenge_points' => 0,
        'challenge_total_points' => 0,
        'challenge_max_streak' => 0,
        'challenge_converted_points' => 0,
        'tournament_points' => 0,
        'tournament_total_points' => 0,
        'tournament_converted_points' => 0,
        'high_difficulty_points' => 0,
        'high_difficulty_total_points' => 0,
        'high_difficulty_cleared' => '{}',
        'high_difficulty_converted_points' => 0,
        'fortune_points' => 0,
        'fortune_total_points' => 0,
        'fortune_max_grade' => -1,
        'fortune_max_total_cost' => 0,
        'fortune_cleared' => '{}',
        'common_points' => 0,
        'common_total_points' => 0,
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
 * 文字列以外の型（配列・オブジェクト等）が渡された場合も TypeError を起こさずにデフォルト値へフォールバックします。
 * 
 * ※ DB/JSON 保存時は二重エスケープ・文字化けを防ぐため htmlspecialchars は行わず生文字列で保持し、
 *    画面描画（React JSX / escapeHtml）側で安全にサニタイズ・レンダリングする設計としています。
 * 
 * @param mixed $name 対象の名前（文字列、数値、またはnull等）
 * @param string $default デフォルト表示名（デフォルト: 'プレイヤー'）
 * @param int $maxLength 最大文字数（デフォルト: 12）
 * @return string サニタイズ済み文字列
 */
function sanitizePlayerDisplayName($name = null, string $default = 'プレイヤー', int $maxLength = 12): string {
    if (!is_string($name) && !is_numeric($name)) {
        return $default;
    }
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

/** 登録デッキの最大保存スロット数（クライアント側 config.js の MAX_DECK_SLOTS と同期すること） */
const MAX_REGISTERED_DECKS = 50;

/**
 * プレイヤーの全登録デッキデータをサニタイズします。
 * 最大スロット数（MAX_REGISTERED_DECKS）までのデッキ配列を検証し、各デッキのリーダーIDやカードリストを正規化します。
 * 
 * @param mixed $decks 入力デッキ配列
 * @return array サニタイズ済みデッキ配列
 */
function sanitizeRegisteredDecks($decks): array {
    if (!is_array($decks)) {
        return [];
    }
    $sanitized = [];
    $maxDecks = MAX_REGISTERED_DECKS;
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

/**
 * プレイヤーデータの保存ディレクトリパスを取得し、未存在の場合は自動作成します。
 * 
 * @return string プレイヤーディレクトリの絶対パス
 */
function getPlayersDirectory(): string {
    $dir = __DIR__ . '/decks/players';
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    return $dir;
}

/**
 * プレイヤーデータファイル（.json）が存在するかどうかを判定します。
 * 
 * 読み込み失敗時（loadPlayerData が null を返した際）に、既存のセーブデータを
 * createDefaultPlayerData で誤って初期化・上書き保存してしまう事故を恒久的に防ぐために使用します。
 * 
 * @param string $uuid プレイヤーのUUID
 * @param string|null $dir 保存ディレクトリ（省略時はgetPlayersDirectory()を使用）
 * @return bool ファイルが存在する場合はtrue、存在しない（新規プレイヤー）ならfalse
 */
function playerDataFileExists(string $uuid, ?string $dir = null): bool {
    $cleanUuid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $uuid);
    if ($cleanUuid === '') {
        return false;
    }
    $targetDir = $dir ?? getPlayersDirectory();
    return file_exists("{$targetDir}/{$cleanUuid}.json");
}

/**
 * プレイヤーデータを読み込みます（純粋 JSON 形式）。
 * 高速な JSON 形式（{$uuid}.json）を直接デコードして返却します。
 * 
 * @param string $uuid プレイヤーのUUID
 * @param string|null $dir 保存ディレクトリ（省略時はgetPlayersDirectory()を使用）
 * @return array|null プレイヤーデータ配列、未登録または破損時はnull
 */
function loadPlayerData(string $uuid, ?string $dir = null): ?array {
    $cleanUuid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $uuid);
    if ($cleanUuid === '') {
        return null;
    }
    $targetDir = $dir ?? getPlayersDirectory();

    $jsonPath = "{$targetDir}/{$cleanUuid}.json";
    if (file_exists($jsonPath)) {
        $content = @file_get_contents($jsonPath);
        if ($content !== false && $content !== '') {
            $data = json_decode($content, true);
            if (is_array($data)) {
                return $data;
            }
        }
    }

    return null;
}

/**
 * 更新用にプレイヤーデータを読み込み、データ状態を明示して返します。
 *
 * 単なる null ではなく、ファイルが存在しない正常な「新規プレイヤー（status: 'new'）」と、
 * ファイルが存在するのに構文エラー等で読めない異常な「データ破損（status: 'corrupted'）」を明確に判別します。
 * これにより、各更新APIが破損データを createDefaultPlayerData で誤って初期値上書き・消失させてしまう事故を
 * ヘルパーレベルで一元的に防止します。
 *
 * @param string $uuid プレイヤーのUUID
 * @param string|null $dir 保存ディレクトリ（省略時はgetPlayersDirectory()を使用）
 * @return array{status: 'loaded'|'new'|'corrupted', data: array|null} 読み込み結果配列
 */
function loadPlayerDataForUpdate(string $uuid, ?string $dir = null): array {
    $targetDir = $dir ?? getPlayersDirectory();
    $exists = playerDataFileExists($uuid, $targetDir);
    $data = loadPlayerData($uuid, $targetDir);

    if ($data !== null) {
        return ['status' => 'loaded', 'data' => $data];
    }

    // 既存ファイルがあるのに読めない場合は破損。既定値での上書きを禁止する
    return $exists ? ['status' => 'corrupted', 'data' => null]
                   : ['status' => 'new', 'data' => null];
}

/**
 * プレイヤーデータを永続化します（純粋 JSON 形式）。
 * 高速な JSON 形式（{$uuid}.json）をアトミック保存します。
 * 
 * @param string $uuid プレイヤーのUUID
 * @param array $playerData 保存するプレイヤーデータ配列
 * @param string|null $dir 保存ディレクトリ（省略時はgetPlayersDirectory()を使用）
 * @return bool 保存に成功したかどうか
 */
function savePlayerData(string $uuid, array $playerData, ?string $dir = null): bool {
    $cleanUuid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $uuid);
    if ($cleanUuid === '' || empty($playerData)) {
        return false;
    }
    $targetDir = $dir ?? getPlayersDirectory();
    $jsonPath = "{$targetDir}/{$cleanUuid}.json";
    $jsonString = json_encode($playerData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($jsonString === false) {
        return false;
    }

    $saved = false;

    // JSON 形式のアトミック保存試行（一時ファイル -> リネーム上書き）
    $tmpPath = "{$targetDir}/{$cleanUuid}.tmp." . uniqid('', true);
    $bytesWritten = @file_put_contents($tmpPath, $jsonString, LOCK_EX);

    if ($bytesWritten !== false && $bytesWritten === strlen($jsonString)) {
        // Windows環境でのrename失敗対策を含むアトミック更新
        if (@rename($tmpPath, $jsonPath)) {
            $saved = true;
        } else {
            // リネームに失敗した場合は直接上書きフォールバック
            @unlink($tmpPath);
            $fp = @fopen($jsonPath, 'c+');
            if ($fp) {
                if (flock($fp, LOCK_EX)) {
                    ftruncate($fp, 0);
                    rewind($fp);
                    $w = fwrite($fp, $jsonString);
                    fflush($fp);
                    flock($fp, LOCK_UN);
                    $saved = ($w === strlen($jsonString));
                }
                fclose($fp);
            }
        }
    } else {
        @unlink($tmpPath);
    }

    return $saved;
}

/**
 * 指定プレイヤーの更新用排他ロックを取得します。
 * read-modify-write（読み込み・更新・保存）のトランザクション全体を直列化し、
 * 並行リクエストによるロストアップデート（ポイント・インベントリ等の消失）を防止します。
 * 
 * @param string $uuid プレイヤーのUUID
 * @param string|null $dir 保存ディレクトリ（省略時はgetPlayersDirectory()を使用）
 * @return resource|null ロック済みファイルハンドル、失敗時はnull
 */
function acquirePlayerLock(string $uuid, ?string $dir = null) {
    $cleanUuid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $uuid);
    if ($cleanUuid === '') {
        return null;
    }
    $targetDir = $dir ?? getPlayersDirectory();
    $lockFile = "{$targetDir}/{$cleanUuid}.lock";
    $fp = @fopen($lockFile, 'c');
    if (!$fp) {
        return null;
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return null;
    }
    return $fp;
}

/**
 * プレイヤー更新用ロックを解放します。
 * 
 * @param resource|null $fp acquirePlayerLock() が返したファイルハンドル
 * @return void
 */
function releasePlayerLock($fp): void {
    if ($fp && is_resource($fp)) {
        @flock($fp, LOCK_UN);
        @fclose($fp);
    }
}

/**
 * プレイヤーデータの読み込み・更新・保存（read-modify-write）を排他ロック下で安全に実行します。
 * 
 * 排他ロック取得、データ破損（corrupted）の検知、未存在時の createDefaultPlayerData 生成、
 * コールバックによる更新の適用、アトミック保存、および try...finally による確実なロック解放を一元的に管理します。
 * 
 * @param string $uuid プレイヤーのUUID
 * @param callable $mutator 更新処理を行うコールバック関数
 *                          シグネチャ: function(array &$playerData, array $playerResult): mixed
 *                          - $playerData: 更新対象のプレイヤーデータ（参照渡し）
 *                          - $playerResult: loadPlayerDataForUpdate の結果（status 等）
 *                          戻り値として明示的に false を返した場合は保存を中断（ロールバック）します。
 * @param string $defaultName 未存在時のデフォルトプレイヤー名（省略時は 'プレイヤー'）
 * @param string|null $dir 保存ディレクトリ（省略時は getPlayersDirectory()）
 * @return array{success: bool, error?: string, data?: array, result?: mixed, status?: string} 処理結果
 */
function modifyPlayerDataWithLock(
    string $uuid,
    callable $mutator,
    string $defaultName = 'プレイヤー',
    ?string $dir = null
): array {
    $cleanUuid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $uuid);
    if ($cleanUuid === '' || strlen($cleanUuid) < 10) {
        return ['success' => false, 'error' => 'Invalid uuid format'];
    }

    $targetDir = $dir ?? getPlayersDirectory();
    $lock = acquirePlayerLock($cleanUuid, $targetDir);
    if (!$lock) {
        return ['success' => false, 'error' => 'Failed to acquire player lock'];
    }

    try {
        $playerResult = loadPlayerDataForUpdate($cleanUuid, $targetDir);

        // 既存ファイルが存在するのにパースできなかった場合はデータ破損として安全に中断（既定値での上書き防止）
        if ($playerResult['status'] === 'corrupted') {
            return ['success' => false, 'error' => 'Failed to parse player data or file is corrupted'];
        }

        $playerData = $playerResult['data'];
        if (empty($playerData)) {
            $playerData = createDefaultPlayerData($cleanUuid, $defaultName);
        }

        // コールバック関数を実行してデータを更新
        $customResult = $mutator($playerData, $playerResult);
        if ($customResult === false) {
            return ['success' => false, 'error' => 'Mutation aborted'];
        }

        $saved = savePlayerData($cleanUuid, $playerData, $targetDir);
        if (!$saved) {
            return ['success' => false, 'error' => 'Failed to save updated file completely'];
        }

        return [
            'success' => true,
            'data' => $playerData,
            'result' => $customResult,
            'status' => $playerResult['status'],
        ];
    } finally {
        releasePlayerLock($lock);
    }
}

/** 防衛デッキとして必要なカード枚数 */
const DEFENSE_DECK_SIZE = 20;

/** 全体対戦ログで保持する最大件数 */
const MAX_RECENT_BATTLES = 2000;

/**
 * 登録済み全プレイヤーのデータを読み込みます（純粋 JSON 形式）。
 * 
 * JSONファイルを走査し、最新のプレイヤーデータ配列のリストを返します。
 * UUID がデータ内に欠落している場合はファイル名から自動補完し、一覧からの脱落を防止します。
 * 
 * @param bool $includeDeck デッキ配列（deck）を含めるかどうか（falseの場合は一覧軽量化のため除外）
 * @param string|null $dir 保存ディレクトリ（省略時はgetPlayersDirectory()を使用）
 * @return array<array> プレイヤーデータ配列のリスト（タイムスタンプ降順）
 */
function loadAllPlayers(bool $includeDeck, ?string $dir = null): array {
    $targetDir = $dir ?? getPlayersDirectory();
    $players = [];
    $processedUuids = [];

    if (!is_dir($targetDir)) {
        return $players;
    }

    // 高速な JSON 形式のファイルを直接デコード（正規表現なし）
    $jsonFiles = glob("{$targetDir}/*.json");
    if ($jsonFiles) {
        foreach ($jsonFiles as $file) {
            $content = @file_get_contents($file);
            if ($content !== false && $content !== '') {
                $data = json_decode($content, true);
                if (is_array($data) && !empty($data)) {
                    $fileUuid = basename($file, '.json');
                    // uuid が欠落している旧データはファイル名から安全に補完
                    if (empty($data['uuid'])) {
                        $data['uuid'] = $fileUuid;
                    }
                    // 重複ファイル読み込みの防止
                    if (isset($processedUuids[$fileUuid]) || (!empty($data['uuid']) && isset($processedUuids[$data['uuid']]))) {
                        continue;
                    }
                    $processedUuids[$fileUuid] = true;
                    if (!empty($data['uuid'])) {
                        $processedUuids[$data['uuid']] = true;
                    }
                    // 防衛デッキが正しく登録されている（規定枚数）かどうかを判定するフラグを付与
                    $data['has_defense_deck'] = (isset($data['deck']) && is_array($data['deck']) && count($data['deck']) === DEFENSE_DECK_SIZE);
                    if (!$includeDeck) {
                        unset($data['deck']);
                    }
                    $players[] = $data;
                }
            }
        }
    }

    // タイムスタンプの降順（新しい順）でソート
    usort($players, function($a, $b) {
        return strcmp($b['timestamp'] ?? '', $a['timestamp'] ?? '');
    });

    return $players;
}

/**
 * 全体対戦ログファイル（recent_battles.json）の絶対パスを取得します。
 *
 * @param string|null $dir 保存ディレクトリ（省略時は api/decks を使用）
 * @return string ファイルパス
 */
function getRecentBattlesFilePath(?string $dir = null): string {
    $baseDir = $dir ?? (__DIR__ . '/decks');
    return "{$baseDir}/recent_battles.json";
}

/**
 * 全体対戦ログ（recent_battles.json）を安全に読み込みます。
 * 専用ロックファイル（recent_battles.json.lock）に対する共有ロック（LOCK_SH）により、
 * 書き込み処理との競合や不完全データの読み取りを防止します。
 *
 * @param string|null $dir 保存ディレクトリ（省略時は api/decks を使用）
 * @param int $limit 取得上限件数（デフォルト: MAX_RECENT_BATTLES）
 * @return array<array> 直近対戦ログ配列（新しい順）
 */
function loadRecentBattles(?string $dir = null, int $limit = MAX_RECENT_BATTLES): array {
    $filePath = getRecentBattlesFilePath($dir);
    $lockPath = $filePath . '.lock';

    if (!file_exists($filePath)) {
        return [];
    }

    $lockFp = @fopen($lockPath, 'c');
    $content = false;
    if ($lockFp) {
        if (flock($lockFp, LOCK_SH)) {
            $content = @file_get_contents($filePath);
            flock($lockFp, LOCK_UN);
        }
        fclose($lockFp);
    } else {
        $content = @file_get_contents($filePath);
    }

    if ($content === false || $content === '') {
        return [];
    }

    $decoded = json_decode($content, true);
    if (!is_array($decoded)) {
        return [];
    }

    return array_slice($decoded, 0, $limit);
}

/**
 * 全体対戦ログ（recent_battles.json）に新しい対戦記録を安全に追記（先頭追加）します。
 *
 * 専用ロックファイルによる排他ロック（LOCK_EX）と、
 * 一時ファイルへの完全書き込み＋アトミック置換（rename）により、
 * プロセス中断や容量不足時でも既存ログが0バイトや破損状態に陥ることを完全に防止します。
 *
 * @param array $record 追加する対戦記録
 * @param string|null $dir 保存ディレクトリ（省略時は api/decks を使用）
 * @param int $limit 保持上限件数（デフォルト: MAX_RECENT_BATTLES）
 * @return bool 保存に成功したかどうか
 */
function appendRecentBattle(array $record, ?string $dir = null, int $limit = MAX_RECENT_BATTLES): bool {
    $filePath = getRecentBattlesFilePath($dir);
    $lockPath = $filePath . '.lock';

    $lockFp = @fopen($lockPath, 'c');
    if (!$lockFp || !flock($lockFp, LOCK_EX)) {
        if ($lockFp) {
            fclose($lockFp);
        }
        error_log('recent_battles.json のロック取得に失敗しました。');
        return false;
    }

    clearstatcache(true, $filePath);
    $content = is_file($filePath) ? (string) @file_get_contents($filePath) : '';
    $recentBattles = $content !== '' ? json_decode($content, true) : [];
    if (!is_array($recentBattles)) {
        $recentBattles = [];
    }

    array_unshift($recentBattles, $record);
    if (count($recentBattles) > $limit) {
        $recentBattles = array_slice($recentBattles, 0, $limit);
    }

    $jsonString = json_encode($recentBattles, JSON_UNESCAPED_UNICODE);
    if ($jsonString === false) {
        error_log('recent_battles.json のエンコードに失敗しました: ' . json_last_error_msg());
        flock($lockFp, LOCK_UN);
        fclose($lockFp);
        return false;
    }

    // 一時ファイルへ完全に書き込んでからアトミック置換（rename）
    $tmpPath = $filePath . '.tmp.' . uniqid('', true);
    $written = @file_put_contents($tmpPath, $jsonString, LOCK_EX);

    $success = false;
    if ($written !== false && $written === strlen($jsonString)) {
        if (@rename($tmpPath, $filePath)) {
            $success = true;
        } else {
            @unlink($tmpPath);
            error_log('recent_battles.json のリネーム置換に失敗しました。');
        }
    } else {
        @unlink($tmpPath);
        error_log('recent_battles.json の一時ファイル書き込みが不完全です。');
    }

    flock($lockFp, LOCK_UN);
    fclose($lockFp);

    return $success;
}



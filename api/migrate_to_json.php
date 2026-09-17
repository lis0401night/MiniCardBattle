<?php
/**
 * Mini Card Battle - Player Data Migration Tool (.js -> .json)
 * 
 * サーバー上の既存プレイヤーデータ（api/decks/players/*.js）を一括走査し、
 * 純粋な JSON 形式（*.json）へ安全に変換・移行します。
 * 
 * @method GET|POST
 * @return json 変換結果サマリー
 */

require_once __DIR__ . '/helpers.php';

// CLI実行以外の場合は JSON ヘッダーを送信し、アクセス認証を検証
$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    header('Content-Type: application/json');

    // 1. 環境変数による管理者トークン検証
    $envToken = getenv('MCB_MIGRATION_TOKEN');
    if ($envToken !== false && $envToken !== '') {
        $requestToken = $_GET['token'] ?? ($_POST['token'] ?? '');
        if (!hash_equals((string)$envToken, (string)$requestToken)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Forbidden: Invalid migration token']);
            exit;
        }
    } else {
        // 2. トークン環境変数未設定時の誤実行防止チェック（?confirm=1 を要求）
        $confirm = $_GET['confirm'] ?? ($_POST['confirm'] ?? '');
        if ($confirm !== '1') {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Confirmation required. To execute migration, append ?confirm=1 to the URL.',
            ]);
            exit;
        }
    }
}

$dir = getPlayersDirectory();

if (!is_dir($dir)) {
    echo json_encode(['success' => false, 'error' => 'Players directory not found']);
    exit;
}

$jsFiles = glob("{$dir}/*.js");
if (!$jsFiles) {
    echo json_encode([
        'success' => true,
        'message' => 'No .js files found. All player data is already migrated to .json.',
        'total' => 0,
        'converted' => 0,
        'skipped' => 0,
        'failed' => 0,
    ]);
    exit;
}

$total = count($jsFiles);
$converted = 0;
$skipped = 0;
$failed = 0;
$errors = [];

foreach ($jsFiles as $file) {
    $filename = basename($file);
    $uuid = preg_replace('/\.js$/', '', $filename);
    $cleanUuid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $uuid);

    if ($cleanUuid === '') {
        $skipped++;
        continue;
    }

    $jsonPath = "{$dir}/{$cleanUuid}.json";

    // 既に .json が存在し、かつ有効なデータ構造としてデコードできる場合は旧 .js を削除してスキップ
    if (file_exists($jsonPath) && filesize($jsonPath) > 0) {
        $existingContent = @file_get_contents($jsonPath);
        $existingData = json_decode((string)$existingContent, true);
        if (is_array($existingData) && !empty($existingData['uuid'])) {
            @unlink($file);
            $skipped++;
            continue;
        }
    }

    // loadPlayerData を使用して旧 .js から安全にパース（DRY原則）
    $data = loadPlayerData($cleanUuid, $dir);

    if (is_array($data) && !empty($data)) {
        // savePlayerData のアトミック保存（一時ファイル+リネーム）を使用し、.js の再生成は抑止（$writeLegacyJs = false）
        $saved = savePlayerData($cleanUuid, $data, $dir, false);
        if ($saved) {
            // .json 保存成功を100%確認した後にのみ旧 .js を削除
            @unlink($file);
            $converted++;
        } else {
            $failed++;
            $errors[] = "Failed to save json atomically for: {$cleanUuid}";
        }
    } else {
        $failed++;
        $errors[] = "Failed to parse legacy player data for: {$filename}";
    }
}

$response = [
    'success' => true,
    'message' => "Migration finished. {$converted} converted, {$skipped} skipped, {$failed} failed.",
    'total' => $total,
    'converted' => $converted,
    'skipped' => $skipped,
    'failed' => $failed,
    'errors' => $errors,
];

if ($isCli) {
    echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
} else {
    echo json_encode($response);
}

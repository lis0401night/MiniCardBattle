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

header('Content-Type: application/json');

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

    // 既に正常な .json が存在する場合は、旧 .js を削除してスキップ
    if (file_exists($jsonPath) && filesize($jsonPath) > 0) {
        @unlink($file);
        $skipped++;
        continue;
    }

    $content = @file_get_contents($file);
    if ($content === false || $content === '') {
        $failed++;
        $errors[] = "Failed to read file: {$filename}";
        continue;
    }

    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*});/s', $content, $matches)) {
        $data = json_decode($matches[2], true);
        if (is_array($data)) {
            $jsonString = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($jsonString !== false && @file_put_contents($jsonPath, $jsonString, LOCK_EX)) {
                // .json 保存成功後、旧 .js ファイルを完全に削除
                @unlink($file);
                $converted++;
            } else {
                $failed++;
                $errors[] = "Failed to save json for: {$cleanUuid}";
            }
        } else {
            $failed++;
            $errors[] = "JSON decode failed for: {$filename}";
        }
    } else {
        $failed++;
        $errors[] = "Pattern match failed for: {$filename}";
    }
}

echo json_encode([
    'success' => true,
    'message' => "Migration finished. {$converted} converted, {$skipped} skipped, {$failed} failed.",
    'total' => $total,
    'converted' => $converted,
    'skipped' => $skipped,
    'failed' => $failed,
    'errors' => $errors,
]);

<?php
/**
 * Mini Card Battle - Error Log API
 *
 * クライアントで発生したエラーをサーバーに記録します。
 * ログはプロジェクトルートの logs/errors/ ディレクトリに日別ファイルで保存されます。
 *
 * @method POST
 * @param string $type エラー種別 (react_boundary / unhandled_error / unhandled_rejection)
 * @param string $message エラーメッセージ
 * @param string $stack スタックトレース (オプション)
 * @param string $uuid プレイヤーUUID (オプション)
 * @param string $screen 現在の画面 (オプション)
 * @param string $gameVersion ゲームバージョン (オプション)
 * @return json 処理結果
 */

header('Content-Type: application/json');

// POSTメソッドのみ受付
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['type']) || !isset($data['message'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

// ログ保存ディレクトリ（プロジェクトルート直下の logs/errors/）
$logDir = __DIR__ . '/../logs/errors';

// ディレクトリが存在しなければ再帰的に作成
if (!file_exists($logDir)) {
    if (!mkdir($logDir, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Failed to create log directory']);
        exit;
    }
}

// .htaccess でWebアクセスを遮断（初回のみ作成）
$htaccessPath = __DIR__ . '/../logs/.htaccess';
if (!file_exists($htaccessPath)) {
    file_put_contents($htaccessPath, "Deny from all\n");
}

// 日別ログファイル
$logFile = $logDir . '/' . date('Y-m-d') . '.log';

// ファイルサイズ上限チェック（10MB）
$maxFileSize = 10 * 1024 * 1024;
if (file_exists($logFile) && filesize($logFile) >= $maxFileSize) {
    echo json_encode(['success' => true, 'note' => 'Log file size limit reached']);
    exit;
}

// 入力サニタイズ（制御文字と改行を除去してJSON Lines形式を維持）
$sanitize = function ($str, $maxLen = 2000) {
    if (!is_string($str)) return '';
    $str = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $str);
    // 改行は \n に変換（JSON内で安全に保持）
    $str = str_replace(["\r\n", "\r"], "\n", $str);
    if (mb_strlen($str) > $maxLen) {
        $str = mb_substr($str, 0, $maxLen) . '...(truncated)';
    }
    return $str;
};

// ログエントリを構築
$logEntry = [
    'timestamp' => date('c'),
    'type'      => $sanitize($data['type'], 50),
    'message'   => $sanitize($data['message']),
    'stack'     => $sanitize($data['stack'] ?? '', 3000),
    'uuid'      => preg_replace('/[^a-z0-9\-]/', '', $data['uuid'] ?? ''),
    'screen'    => $sanitize($data['screen'] ?? '', 100),
    'version'   => $sanitize($data['gameVersion'] ?? '', 20),
    'userAgent' => $sanitize($data['userAgent'] ?? '', 300),
];

// JSON Lines形式で追記（1行1エラー）
$line = json_encode($logEntry, JSON_UNESCAPED_UNICODE) . "\n";

if (file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX) !== false) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to write log']);
}

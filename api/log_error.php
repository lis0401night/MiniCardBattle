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

// Origin/Refererチェック（外部サイトからの不正送信を防止）
$allowedHost = $_SERVER['HTTP_HOST'] ?? '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$referer = $_SERVER['HTTP_REFERER'] ?? '';
if ($origin && parse_url($origin, PHP_URL_HOST) !== $allowedHost) {
    echo json_encode(['success' => false, 'error' => 'Invalid origin']);
    exit;
}
if (!$origin && $referer && parse_url($referer, PHP_URL_HOST) !== $allowedHost) {
    echo json_encode(['success' => false, 'error' => 'Invalid referer']);
    exit;
}

// リクエストサイズ上限チェック（200KB）
$maxRequestBytes = 200 * 1024;
if (isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > $maxRequestBytes) {
    echo json_encode(['success' => false, 'error' => 'Payload too large']);
    exit;
}

$input = file_get_contents('php://input', false, null, 0, $maxRequestBytes);
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
    // Apache 2.4系（mod_authz_core）と2.2系（mod_access）の両方に対応
    $htaccessContent = "<IfModule mod_authz_core.c>\n"
        . "    Require all denied\n"
        . "</IfModule>\n"
        . "<IfModule !mod_authz_core.c>\n"
        . "    Order Deny,Allow\n"
        . "    Deny from all\n"
        . "</IfModule>\n";
    file_put_contents($htaccessPath, $htaccessContent);
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
    'uuid'      => substr(preg_replace('/[^a-z0-9\-]/', '', $data['uuid'] ?? ''), 0, 64),
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

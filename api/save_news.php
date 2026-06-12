<?php
header('Content-Type: application/json; charset=utf-8');

// POSTリクエストのみ受け付ける
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request method.']);
    exit;
}

// JSONデータを受け取る
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!isset($data['news']) || !is_array($data['news'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid data format.']);
    exit;
}

$file = __DIR__ . '/news.json';

// ファイルに保存
$result = file_put_contents($file, json_encode($data['news'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

if ($result !== false) {
    echo json_encode(['success' => true, 'message' => 'News saved successfully.']);
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to save news.']);
}

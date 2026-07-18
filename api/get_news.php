<?php
/**
 * Mini Card Battle - Get News API
 * 
 * サーバーに保存されているお知らせ(news.json)のリストを取得します。
 * 
 * @method GET|POST
 * @return json ニュースの配列、またはデフォルトのダミーニュース
 */
header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/news.json';

// デフォルトのダミーニュース
$defaultNews = [
    [
        'id' => 1,
        'title' => 'Ver 1.1.0 アップデート！新カード追加',
        'date' => date('Y/m/d'),
        'content' => '新しいカードパックが追加されました！強力なカードを手に入れてデッキを強化しましょう。',
        'color1' => '#3b82f6',
        'color2' => '#1d4ed8',
        'icon' => '✨',
        'imageUrl' => '',
        'shortcut' => 'screen-card-list',
        'isActive' => true
    ],
    [
        'id' => 2,
        'title' => '週末限定イベント「夢幻の闘技祭」開催中！',
        'date' => date('Y/m/d'),
        'content' => '週末限定の特別なイベントが開催中です。限定報酬をゲットしよう！',
        'color1' => '#ef4444',
        'color2' => '#b91c1c',
        'icon' => '🔥',
        'imageUrl' => '',
        'shortcut' => 'screen-event-menu',
        'isActive' => true
    ],
    [
        'id' => 3,
        'title' => '初心者応援キャンペーン実施中！',
        'date' => date('Y/m/d'),
        'content' => '初心者向けの豪華ログインボーナスや、特別なボーナスが追加されました。',
        'color1' => '#10b981',
        'color2' => '#047857',
        'icon' => '🎁',
        'imageUrl' => '',
        'shortcut' => '',
        'isActive' => true
    ]
];

if (file_exists($file)) {
    $content = file_get_contents($file);
    $data = json_decode($content, true);
    if ($data) {
        // isActiveがtrueのものだけ返す（管理画面用ではなく、ユーザー表示用のため）
        // 管理画面からは ?all=1 等でアクセスさせる手もあるが、まずは全て返してフロントでフィルタしてもOK。
        // ここでは全件返します。
        echo json_encode(['success' => true, 'news' => $data]);
        exit;
    }
}

// ファイルがない場合はデフォルトニュースを返す
echo json_encode(['success' => true, 'news' => $defaultNews]);

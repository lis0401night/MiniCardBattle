<?php
/**
 * Mini Card Battle - Use Serial Code API
 * Validates and saves used serial codes to player data on the server.
 */

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Invalid request method']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['uuid']) || !isset($data['code'])) {
    echo json_encode(['success' => false, 'error' => 'Missing required data']);
    exit;
}

$uuid = preg_replace('/[^a-z0-9-]/', '', $data['uuid']);
$code = trim(strtoupper($data['code']));

if (strlen($uuid) < 10) {
    echo json_encode(['success' => false, 'error' => 'Invalid UUID']);
    exit;
}


$dir = __DIR__ . '/decks/players';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$filename = "{$dir}/{$uuid}.js";
$player_data = [];

// 既存のデータを読み込んで引き継ぐ
if (file_exists($filename)) {
    $content = file_get_contents($filename);
    if (preg_match('/PLAYER_DECKS\[\'(.*?)\'\] = ({.*?});/s', $content, $matches)) {
        $existing = json_decode($matches[2], true);
        if ($existing) {
            $player_data = $existing;
        }
    }
}

// used_serials が存在しなければ初期化
if (!isset($player_data['used_serials']) || !is_array($player_data['used_serials'])) {
    $player_data['used_serials'] = [];
}

// 新規プレイヤーファイル作成時のために基本プロパティを保証する
if (!isset($player_data['uuid'])) {
    $player_data['uuid'] = $uuid;
}
if (!isset($player_data['name'])) {
    $player_data['name'] = 'Player';
}
if (!isset($player_data['icon'])) {
    $player_data['icon'] = 'player';
}

// すでに使用済みかチェック
if (in_array($code, $player_data['used_serials'])) {
    echo json_encode(['success' => false, 'error' => 'already_used']);
    exit;
}

// 定数ファイル（serials.json）からシリアルコード一覧をロード
$json_path = dirname(__DIR__) . '/src/utils/constants/serials.json';
if (!file_exists($json_path)) {
    echo json_encode(['success' => false, 'error' => 'config_missing']);
    exit;
}

$serials_config = json_decode(file_get_contents($json_path), true);
if (!$serials_config) {
    echo json_encode(['success' => false, 'error' => 'config_corrupt']);
    exit;
}

// コードの検証
if (isset($serials_config[$code])) {
    $reward = $serials_config[$code];
    $rewardType = $reward['rewardType'];
    $rewardValue = $reward['rewardValue'];

    if ($rewardType === 'premium') {
        if (!isset($player_data['unlocked_premium_cards']) || !is_array($player_data['unlocked_premium_cards'])) {
            $player_data['unlocked_premium_cards'] = [];
        }
        if (!in_array($rewardValue, $player_data['unlocked_premium_cards'])) {
            $player_data['unlocked_premium_cards'][] = $rewardValue;
        }
    } else if ($rewardType === 'playmat') {
        if (!isset($player_data['owned_playmats']) || !is_array($player_data['owned_playmats'])) {
            $player_data['owned_playmats'] = [];
        }
        if (!in_array($rewardValue, $player_data['owned_playmats'])) {
            $player_data['owned_playmats'][] = $rewardValue;
        }
    } else if ($rewardType === 'skin') {
        if (!isset($player_data['unlocked_skins']) || !is_array($player_data['unlocked_skins'])) {
            $player_data['unlocked_skins'] = [];
        }
        if (!in_array($rewardValue, $player_data['unlocked_skins'])) {
            $player_data['unlocked_skins'][] = $rewardValue;
        }
    } else if ($rewardType === 'icon') {
        if (!isset($player_data['unlocked_icons']) || !is_array($player_data['unlocked_icons'])) {
            $player_data['unlocked_icons'] = [];
        }
        if (!in_array($rewardValue, $player_data['unlocked_icons'])) {
            $player_data['unlocked_icons'][] = $rewardValue;
        }
    } else if ($rewardType === 'card') {
        if (!isset($player_data['player_inventory']) || !is_array($player_data['player_inventory'])) {
            $player_data['player_inventory'] = [];
        }
        $player_data['player_inventory'][$rewardValue] = ($player_data['player_inventory'][$rewardValue] ?? 0) + 1;
    }

    // 使用済みシリアルコードを追加
    $player_data['used_serials'][] = $code;
    $player_data['timestamp'] = time();

    // ファイル書き込み
    $data_json = json_encode($player_data);
    $js_content = <<<EOT
if (typeof PLAYER_DECKS === 'undefined') { var PLAYER_DECKS = {}; }
PLAYER_DECKS['{$uuid}'] = {$data_json};
EOT;

    if (file_put_contents($filename, $js_content)) {
        echo json_encode([
            'success' => true,
            'reward' => $rewardValue,
            'rewardType' => $rewardType,
            'rewardName' => $reward['rewardName'] ?? ''
        ]);
    } else {
        echo json_encode(['success' => false, 'error' => 'failed_to_save']);
    }
} else {
    echo json_encode(['success' => false, 'error' => 'invalid_code']);
}


<?php
/**
 * Mini Card Battle - API Helper Functions
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
        'icon' => 'android',
        'character' => 'oni',
        'skin' => 'default',
        'playmat' => null,
        'stage' => 'oni',
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
        'fortune_cleared' => '{}'
    ];
}

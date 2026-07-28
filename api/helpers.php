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
        'fortune_max_total_cost' => 0,
        'fortune_cleared' => '{}'
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


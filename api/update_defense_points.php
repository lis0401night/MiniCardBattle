<?php
/**
 * Mini Card Battle - Update Defense Points API
 * 
 * 防衛戦のポイントおよび防衛勝利数を更新・保存するAPIエンドポイント。
 * 実処理を行う update_points.php へ処理をエイリアス（委譲）します。
 * 
 * @method POST
 * @param string $uuid プレイヤーのUUID
 * @param int $points 現在の所持防衛ポイント
 * @param int $total_points 累計防衛ポイント (オプション)
 * @param bool $increment trueなら加算、falseなら上書き (オプション)
 * @param int $defense_wins 防衛勝利数。increment=trueなら加算し、falseなら指定値で上書き (オプション)
 * @return json 処理結果および更新後のポイント情報
 */

require_once __DIR__ . '/update_points.php';
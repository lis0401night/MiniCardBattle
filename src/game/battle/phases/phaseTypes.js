/**
 * @file phaseTypes.js
 * @description バトルのメインフェイズおよびターン内のサブフェイズを定義する定数モジュール。
 * 各フェイズの状態管理、UI制御、および将来的なPhaseRunnerによるデータ駆動型制御に使用される。
 */

/**
 * @enum {string}
 * @description バトル全体のメインフェイズ。
 */
export const BATTLE_PHASE = Object.freeze({
  /** バトル初期化フェイズ */
  INIT: 'INIT',
  /** マリガン（引き直し）フェイズ */
  MULLIGAN: 'MULLIGAN',
  /** ターン進行中フェイズ */
  BATTLE: 'BATTLE',
  /** プレイヤーのメインアクション（カード手札使用・レーン選択）待機フェイズ */
  MAIN_ACTION: 'MAIN_ACTION',
});

/**
 * @enum {string}
 * @description 1ターン内の細分化されたサブフェイズ。
 * startTurnの各ステップを明示的に追跡・制御するために使用される。
 */
export const TURN_SUB_PHASE = Object.freeze({
  /** スタン（拘束）・攻撃不能状態のターンカウント減算処理 */
  STATUS_COUNTDOWN: 'STATUS_COUNTDOWN',
  /** ターン開始時スキル（「契約」の自傷等）の発動処理 */
  TURN_START_SKILLS: 'TURN_START_SKILLS',
  /** 戦乙女の加護効果の自動クリア処理 */
  VALKYRIA_CLEAR: 'VALKYRIA_CLEAR',
  /** 移動スキルの自動移動処理 */
  MOVE_SKILLS: 'MOVE_SKILLS',
  /** ターン開始に伴う自然SP増加処理 */
  SP_INCREMENT: 'SP_INCREMENT',
  /** 戦闘フェーズ（全レーンの自動攻撃・相討ち・直接攻撃）の実行処理 */
  COMBAT: 'COMBAT',
  /** カードドロー処理 */
  DRAW: 'DRAW',
  /** ターン開始処理完了後のメイン操作または敵行動への遷移処理 */
  TRANSITION: 'TRANSITION',
});

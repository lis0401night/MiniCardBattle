/**
 * @file thinkingState.js
 * @description CPU戦およびオンライン対人戦における「相手思考中（「思考中・・・」UI）」状態を
 * 一元管理する共通モジュール。
 *
 * - CPU戦: 参照カウント方式でメイン思考・強制スキル・スキル選択ディレイの入れ子を安全に管理する。
 * - オンライン対人戦: 相手メインフェイズ入力待ちおよび `waitRemoteChoice` の選択待機状態を統合判定する。
 */

import { updateBattleUIHook } from '../../services/uiBattle.js';
import { GameState } from '../../state/gameState.js';
import { AI_THINKING_DURATION } from '../../utils/constants/config.js';
import { checkIsOnlineMode, sleep } from '../../utils/gameUtils.js';
import { BATTLE_PHASE } from './phases/phaseTypes.js';

/** AI思考中フラグのネスト（入れ子）を安全に扱うための参照カウンタ */
let aiThinkingDepth = 0;

/** 対戦リセット前後を識別し、古い待機による次戦カウンタ誤減算を防ぐための世代番号 */
let thinkingGeneration = 0;

/**
 * バトル画面UIへ状態変更を安全に通知する。
 * UIフック未登録や例外発生時でもバトル進行ロジックを中断させない。
 *
 * @returns {void}
 */
function notifyBattleUI() {
  try {
    if (updateBattleUIHook) updateBattleUIHook();
  } catch (uiError) {
    console.error('バトルUIの更新に失敗しました:', uiError);
  }
}

/**
 * CPU（AI）の思考中区間を開始し、`GameState.isAIThinking` を true に設定する。
 * 参照カウントを加算するため、メイン思考中に強制発動スキル等の思考ディレイが
 * ネストして終了しても外側の思考中表示が途中で消えることを防ぐ。
 *
 * @returns {number} この思考区間が属するリセット世代番号（`endAIThinking` へ渡すことで旧世代の誤減算を防止）
 */
export function beginAIThinking() {
  aiThinkingDepth += 1;
  if (!GameState.isAIThinking) {
    GameState.isAIThinking = true;
    notifyBattleUI();
  }
  return thinkingGeneration;
}

/**
 * CPU（AI）の思考中区間を終了する。
 * すべてのネスト区間が終了して参照カウントが 0 になった時点で `GameState.isAIThinking` を false に戻す。
 * 世代番号が指定された場合は、現在の世代と一致するときのみ減算を行う。
 *
 * @param {number|null} [generation=null] - `beginAIThinking` が返したリセット世代番号
 * @returns {void}
 */
export function endAIThinking(generation = null) {
  if (generation !== null && generation !== thinkingGeneration) {
    return;
  }
  aiThinkingDepth = Math.max(0, aiThinkingDepth - 1);
  const nextThinking = aiThinkingDepth > 0;
  if (GameState.isAIThinking !== nextThinking) {
    GameState.isAIThinking = nextThinking;
    notifyBattleUI();
  }
}

/**
 * CPU（AI）の思考ウェイト（ディレイ）を実行する共通ヘルパー。
 * CPU戦（非オンライン対人モード）では待機中のみ `isAIThinking` を有効化し、
 * 例外発生時も `finally` で確実に解除する。
 * オンライン対人モードで呼び出された場合は、既に相手の選択受信後であるため
 * 「思考中・・・」を再点灯させず既存テンポの待機のみ行う。
 *
 * @param {number} [durationMs=AI_THINKING_DURATION] - 待機時間（ミリ秒）
 * @returns {Promise<void>} 待機完了時に解決する Promise
 */
export async function waitAIThinkingDelay(durationMs = AI_THINKING_DURATION) {
  if (checkIsOnlineMode(GameState.gameMode)) {
    await sleep(durationMs);
    return;
  }

  const generation = beginAIThinking();
  try {
    await sleep(durationMs);
  } finally {
    endAIThinking(generation);
  }
}

/**
 * オンライン対人戦における相手プレイヤーの選択待機状態（`waitRemoteChoice` 待機中）を更新する。
 * 状態が変化した場合のみバトルUIへ再描画を通知する。
 *
 * @param {boolean} isWaiting - 相手の選択結果を待機中なら true、解決・解除時は false
 * @returns {void}
 */
export function setWaitingOpponentChoice(isWaiting) {
  const nextValue = Boolean(isWaiting);
  if (GameState.isWaitingOpponentChoice !== nextValue) {
    GameState.isWaitingOpponentChoice = nextValue;
    notifyBattleUI();
  }
}

/**
 * 対戦開始前・終了時に相手思考中関連の内部カウンタとフラグをすべて初期化する。
 * 前戦の異常終了やリセットによるフラグ残留を防止する。
 *
 * @returns {void}
 */
export function resetThinkingState() {
  thinkingGeneration += 1;
  aiThinkingDepth = 0;
  GameState.isAIThinking = false;
  GameState.isWaitingOpponentChoice = false;
}

/**
 * バトル画面のターンステータス欄に「思考中・・・」を表示すべきかどうかを判定する。
 * マリガン中・初期化中・勝敗確定後は常に false を返す。
 *
 * - オンライン対人戦（`checkIsOnlineMode`）:
 *   1. 相手メインフェイズ入力待ち（`MAIN_ACTION` かつ相手ターンかつ未処理中・キュー空）
 *   2. 相手のスキル選択・対象選択・手札破棄・誘発等の待機中（`isWaitingOpponentChoice`）
 * - CPU戦（非オンライン）:
 *   1. メイン行動シミュレーション中、またはスキル選択・誘発ディレイ中（`isAIThinking`）
 *
 * @param {Object} [state=GameState] - 判定対象のゲーム状態オブジェクト
 * @returns {boolean} 「思考中・・・」を表示すべき状態なら true
 */
export function checkIsOpponentThinking(state = GameState) {
  if (!state) return false;
  if (state.isBattleEnded || state.lastBattleResult) return false;
  if (
    state.battlePhase === BATTLE_PHASE.INIT ||
    state.battlePhase === BATTLE_PHASE.MULLIGAN
  ) {
    return false;
  }

  if (checkIsOnlineMode(state.gameMode)) {
    if (state.isWaitingOpponentChoice) {
      return true;
    }
    const isQueueEmpty =
      !Array.isArray(state.actionQueue) || state.actionQueue.length === 0;
    return (
      state.battlePhase === BATTLE_PHASE.MAIN_ACTION &&
      state.currentTurn === 'enemy' &&
      !state.isProcessing &&
      isQueueEmpty
    );
  }

  return Boolean(state.isAIThinking);
}

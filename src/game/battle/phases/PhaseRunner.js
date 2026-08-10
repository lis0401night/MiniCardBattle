/**
 * @file PhaseRunner.js
 * @description フェイズ配列を受け取り、各フェイズを宣言的に順番実行するデータ駆動型フェイズランナーエンジン。
 * フェイズ間のスキップ条件評価、GameState.turnSubPhaseの自動更新、および勝敗確定時の安全な中断処理を管理する。
 */

import { GameState } from '../../../state/gameState.js';

/**
 * @typedef {object} PhaseDefinition
 * @property {string} id - サブフェイズの識別子 (TURN_SUB_PHASE の値等)
 * @property {(context: object) => Promise<any>|any} execute - フェイズの実行処理関数
 * @property {(context: object) => boolean} [shouldSkip] - フェイズのスキップ条件評価関数（trueを返すとスキップ）
 */

/**
 * 定義されたフェイズ配列を順番に非同期実行する。
 * @param {Array<PhaseDefinition>} phases - 実行対象のフェイズ定義配列
 * @param {object} context - フェイズ間で共有されるコンテキストオブジェクト (owner 等)
 * @returns {Promise<void>}
 */
export async function runPhases(phases, context = {}) {
  if (!Array.isArray(phases)) return;

  for (const phase of phases) {
    // 途中でバトルが終了（勝敗確定）した場合は以降のフェイズ実行を即座に中断する
    if (GameState.isBattleEnded) {
      break;
    }

    // スキップ条件が定義されており、それが true を返した場合は該当フェイズをスキップする
    if (typeof phase.shouldSkip === 'function' && phase.shouldSkip(context)) {
      continue;
    }

    // 現在実行中のサブフェイズを GameState に記録（UI表示や状態追跡用）
    if (phase.id) {
      GameState.turnSubPhase = phase.id;
    }

    // フェイズの主要処理を実行する
    if (typeof phase.execute === 'function') {
      await phase.execute(context);
    }
  }
}

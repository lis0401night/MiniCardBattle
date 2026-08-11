/**
 * @file PhaseRunner.js
 * @description フェイズ配列を受け取り、各フェイズを宣言的に順番実行するデータ駆動型フェイズランナーエンジン。
 * フェイズ間のスキップ条件評価、GameState.turnSubPhaseの自動更新、および勝敗確定時の安全な中断処理を管理する。
 */

import { GameState } from '../../../state/gameState.js';

/**
 * @typedef {object} PhaseDefinition
 * @property {string} id - サブフェイズの識別子 (TURN_SUB_PHASE の値等)
 * @property {(context: object) => Promise<boolean|void>|boolean|void} execute
 *   - フェイズの実行処理関数。true を返すと以降のフェイズ実行を中断する。
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

  /** 実行中に発生した最初の例外（全フェイズ完了後に呼び出し元へ伝える） */
  let firstError = null;

  for (const phase of phases) {
    // 途中でバトルが終了（勝敗確定）した場合は以降のフェイズ実行を即座に中断する
    if (GameState.isBattleEnded) {
      break;
    }

    try {
      // スキップ条件が定義されており、それが true を返した場合は該当フェイズをスキップする
      if (typeof phase.shouldSkip === 'function' && phase.shouldSkip(context)) {
        continue;
      }

      // 現在実行中のサブフェイズを GameState に記録（UI表示や状態追跡用）
      if (phase.id) {
        GameState.turnSubPhase = phase.id;
      }

      // フェイズの主要処理を実行する
      if (typeof phase.execute !== 'function') {
        console.warn(
          `[PhaseRunner] フェイズ "${phase.id}" に execute が定義されていません。`
        );
        continue;
      }

      const shouldAbort = await phase.execute(context);
      // フェイズが true を返した場合、以降のフェイズを実行しない（勝敗確定時等）
      if (shouldAbort === true) {
        break;
      }
    } catch (err) {
      // 個別フェイズの失敗で以降のフェイズ（特に TRANSITION）が実行されないと、
      // battlePhase が更新されずプレイヤーが操作不能になるため、後続フェイズへの継続を優先する。
      console.error(
        `[PhaseRunner] フェイズ "${phase.id}" の実行中にエラーが発生しました:`,
        err
      );
      if (!firstError) {
        firstError = err;
      }
    }
  }

  if (firstError) {
    throw firstError;
  }
}

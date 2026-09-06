// ==========================================
// src/game/battle/index.js — ファサード（Re-export Hub）
//
// 元の src/game/battle.js (5,296行) を責務単位で6つのサブモジュールに分割し、
// このファイルは全サブモジュールからの re-export のみを行うファサードとして機能する。
// 外部からは本ファイル (`from './game/battle/index.js'`) 経由でのみ import すること。
// ==========================================

import { CARD_MASTER } from '../../utils/constants/cards.js';
import { registerDiscardCard } from '../eventRenderer.js';
import { registerQueueDependencies } from './battleQueue.js';
import { playCard, discardCard } from './battleCombat.js';
import { endTurnLogic } from './battleTurn.js';
import { checkWinCondition } from './battleResult.js';
import { executeTutorialEnemyTurn } from './battleInit.js';

// ==========================================
// サブモジュールからの re-export
// ==========================================

// --- battleQueue.js: アクションキュー処理 ---
export {
  dispatchBattleAction,
  processActionQueue,
  pendingChoiceResolver,
  setPendingChoiceResolver,
  getIsQueueProcessing,
  resetQueueProcessing,
  registerQueueDependencies,
} from './battleQueue.js';

// --- battleInit.js: バトル準備・初期化・マリガン ---
export {
  prepareBattle,
  initBattleState,
  determineTurnOrder,
  startMulliganPhase,
} from './battleInit.js';

// --- battleSelection.js: プレイヤー入力待機 ---
export {
  waitPlayerLaneSelection,
  canEquipCard,
  confirmOverwrittenLane,
  waitPlayerEnemyLaneSelection,
  waitPlayerAlliedLaneSelection,
  waitPlayerHandSelection,
  waitPlayerDiscardSelection,
  waitPlayerDualDiscardSelection,
  waitSkillChoice,
} from './battleSelection.js';

// --- battleCombat.js: カードプレイ・戦闘・墓地処理 ---
export {
  discardCard,
  triggerSplitSkill,
  cleanupDestroyedCards,
  triggerExplodeSkill,
  consumeAIAction,
  drawCard,
  playCard,
  hasActiveSkill,
  resolveOnPlaySkill,
  executeSingleCombat,
  executeCombatPhase,
  createUnionCard,
  applyEquipment,
  triggerRetaliateSkill,
} from './battleCombat.js';

// --- battleTurn.js: ターン進行制御 ---
export {
  startTurn,
  endPlayerTurn,
  endTurnLogic,
  triggerStartTurnSkills,
  handleMoveSkills,
} from './battleTurn.js';

// --- battleResult.js: 勝敗判定・報酬・画面遷移 ---
export {
  checkWinCondition,
  cleanupBattleState,
  executeSkillFromConfirm,
  endBattle,
  returnToTitle,
  resolveHighDifficultyRewards,
} from './battleResult.js';

// ==========================================
// デバッグ用グローバル公開
// ==========================================
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.CARD_MASTER = CARD_MASTER;
}

// ==========================================
// 循環参照解決のための関数注入
// ==========================================

let isWired = false;

/**
 * バトルモジュール間の循環参照を関数注入で解決する。
 * battleQueue.js は playCard 等を、eventRenderer.js は discardCard を直接 import できないため、
 * 本関数がファサードとして注入を行う。複数回呼び出しても安全（冪等）。
 */
export function initBattleModule() {
  if (isWired) return;
  isWired = true;

  registerQueueDependencies({
    playCard,
    endTurnLogic,
    checkWinCondition,
    executeTutorialEnemyTurn,
  });
  registerDiscardCard(discardCard);
}

// モジュール読み込み時にも安全に初期化を実行する
initBattleModule();

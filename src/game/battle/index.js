// ==========================================
// battle.js — ファサード（Re-export Hub）
//
// 元の battle.js (5,296行) を責務単位で6つのサブモジュールに分割し、
// このファイルは全サブモジュールからの re-export のみを行うファサードとして機能する。
// 既存の外部 import (`from './battle.js'`) は一切変更不要。
// ==========================================

import { CARD_MASTER } from '../../utils/constants/cards.js';
import { registerDiscardCard } from '../eventRenderer.js';

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
  executeSkillFromConfirm,
  endBattle,
  returnToTitle,
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
import { registerQueueDependencies } from './battleQueue.js';
import { playCard } from './battleCombat.js';
import { endTurnLogic } from './battleTurn.js';
import { checkWinCondition } from './battleResult.js';
import { executeTutorialEnemyTurn } from './battleInit.js';

// battleQueue.js は playCard, endTurnLogic, checkWinCondition, executeTutorialEnemyTurn を
// 循環参照の関係で直接importできないため、ファサード初期化時に関数注入で解決する
registerQueueDependencies({
  playCard,
  endTurnLogic,
  checkWinCondition,
  executeTutorialEnemyTurn,
});

// ==========================================
// eventRenderer.js への discardCard 関数注入（循環参照回避）
// ==========================================
import { discardCard } from './battleCombat.js';
registerDiscardCard(discardCard);

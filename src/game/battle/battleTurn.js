// ==========================================
// バトルターン進行制御モジュール
// ターン開始処理（スタン減算・スキル発動・移動・SP加算・戦闘）、
// ターン終了処理（手札上限チェック・封印カウントダウン・ターン交替）を管理する。
// ==========================================

import {
  renderBoard,
  renderHand,
  updateBattleUIHook,
  updateCardDetail,
  updateHPBar,
  updateSPOrbs,
} from '../../services/uiBattle.js';
import { GameState } from '../../state/gameState.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import {
  PLACE_ANIMATION_DURATION,
} from '../../utils/constants/config.js';
import {
  createDamagePopup,
  getSeededRandom,
  hasSkill,
  mergeCardSkills,
  consumeArmSelf,
  playSound,
  sleep,
} from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playCardVoice } from '../../utils/constants/voices.js';
import { clearValkyriaGuard } from '../engine.js';
import { evaluateAIMoves } from '../ai_normal.js';
import { showConfirmModal } from '../../services/uiModals.js';
import { triggerStartTurnPassive } from '../skillLogic.js';
import { checkWinCondition } from './battleResult.js';
import {
  executeCombatPhase,
  discardCard,
  cleanupDestroyedCards,
  drawCard,
} from './battleCombat.js';
import {
  waitPlayerLaneSelection,
  waitPlayerHandSelection,
  confirmOverwrittenLane,
  canEquipCard,
} from './battleSelection.js';
import { dispatchBattleAction, getIsQueueProcessing } from './battleQueue.js';


/**
 * ターン開始時における移動関連スキル（神出・移動・起動消滅等）の移動処理を非同期で解決する。
 * @param {string} owner - ターンを開始するプレイヤー ('blue' | 'red')
 */
export async function handleMoveSkills(owner) {
  const currentBoard =
    owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const curSealed =
    owner === 'blue'
      ? GameState.playerSealedLanes || [0, 0, 0]
      : GameState.enemySealedLanes || [0, 0, 0];

  // 1. 神出 (teleport) スキルの自動解決
  const teleportMovedIds = new Set();
  for (let i = 0; i < 3; i++) {
    const c = currentBoard[i];
    if (
      c &&
      typeof hasSkill === 'function' &&
      hasSkill(c, 'teleport') &&
      (c.stunTurns || 0) === 0 &&
      !hasSkill(c, 'defender') &&
      !teleportMovedIds.has(c.uid || c.id)
    ) {
      const emptyLanes = [];
      for (let j = 0; j < 3; j++) {
        if (currentBoard[j] === null && curSealed[j] === 0) {
          emptyLanes.push(j);
        }
      }

      if (emptyLanes.length > 0) {
        const randomIndex = Math.floor(getSeededRandom() * emptyLanes.length);
        const targetLane = emptyLanes[randomIndex];

        // 演出（元の位置でポップアップ表示）
        const originalEl = document.querySelector(
          `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`
        );
        if (originalEl) {
          createDamagePopup(originalEl, '神出', '#facc15');
          await sleep(250);
        }
        playSound(SOUNDS.sePlace);

        // 移動実行
        currentBoard[targetLane] = c;
        currentBoard[i] = null;
        teleportMovedIds.add(c.uid || c.id);

        await sleep(PLACE_ANIMATION_DURATION);
        renderBoard();
      }
    }
  }

  // 2. 移動 (move) スキルの解決
  if (owner !== 'blue' && GameState.gameMode !== 'online') {
    const b = GameState.enemyBoard;
    // AIの移動判断
    const bestMoves = evaluateAIMoves(GameState);
    if (bestMoves) {
      for (let move of bestMoves) {
        // 演出（元の位置でポップアップ表示）
        const fromEl = document.querySelector(
          `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${move.from}"] .card`
        );
        if (fromEl) {
          createDamagePopup(fromEl, '移動', '#facc15');
          await sleep(250);
        }

        const existingCard = b[move.to];
        if (existingCard && hasSkill(existingCard, 'startup')) {
          // 起動消滅の特別処理
          existingCard.skills = existingCard.skills.filter(
            (s) => s.id !== 'startup' && s.id !== 'defender'
          );

          // 移動しようとしたカードを墓地に送る
          const movingCard = b[move.from];
          await discardCard(owner, movingCard, move.from, false);

          const targetEl = document.querySelector(
            `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${move.to}"] .card`
          );
          if (targetEl) {
            createDamagePopup(targetEl, '起動', '#38bdf8');
          }

          b[move.from] = null;
        } else {
          if (existingCard) {
            // 移動先にすでにカードがある場合は墓地に送る
            await discardCard(owner, existingCard, move.to, false);
          }
          b[move.to] = b[move.from];
          b[move.from] = null;
        }
        playSound(SOUNDS.seClick);
        await sleep(PLACE_ANIMATION_DURATION);
        renderBoard();
      }
    }
    return;
  }

  const b = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const movedIds = new Set();
  for (let i = 0; i < 3; i++) {
    const c = b[i];
    if (
      c &&
      typeof hasSkill === 'function' &&
      hasSkill(c, 'move') &&
      (c.stunTurns || 0) === 0 &&
      !movedIds.has(c.uid || c.id)
    ) {
      const possibleLanes = [];
      if (i > 0 && curSealed[i - 1] === 0) possibleLanes.push(i - 1);
      if (i < 2 && curSealed[i + 1] === 0) possibleLanes.push(i + 1);
      if (possibleLanes.length === 0) continue;

      let successMove = false;
      while (!successMove) {
        if (owner === 'blue') {
          GameState.placementMessage = `移動するレーンを選んでください`;
          if (updateBattleUIHook) updateBattleUIHook();
        }

        const targetIdx = await waitPlayerLaneSelection(
          1,
          owner,
          c,
          false,
          possibleLanes,
          false,
          true,
          '移動終了'
        );

        if (owner === 'blue') {
          GameState.placementMessage = null;
        }
        if (!targetIdx || targetIdx.length === 0) {
          // 移動選択自体をキャンセルした場合は移動を終了
          break;
        }
        const target = targetIdx[0];
        if (target !== i) {
          // 根本的リファクタリング：移動先レーンに既存カードがある場合の上書き確認
          const proceed = await confirmOverwrittenLane(owner, c, target, false);
          if (!proceed) {
            await sleep(200);
            continue; // キャンセルされた場合はレーン選択からやり直す
          }

          // 演出（元の位置でポップアップ表示）
          const fromEl = document.querySelector(
            `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`
          );
          if (fromEl) {
            createDamagePopup(fromEl, '移動', '#facc15');
            await sleep(250);
          }

          let didUnion = false;
          let didEquip = false;
          const existingCard = b[target];

          if (existingCard) {
            // 1. 合体（Union）の判定と処理
            const unionSkill =
              c.skills && c.skills.find((s) => s.id === 'union');
            if (
              unionSkill &&
              (existingCard.baseId === unionSkill.targetId ||
                existingCard.id === unionSkill.targetId)
            ) {
              const combineId = unionSkill.summonId;
              const masterData = CARD_MASTER.find((m) => m.id === combineId);
              if (masterData) {
                let unionCard = JSON.parse(JSON.stringify(masterData));
                unionCard.uid = `union_${existingCard.uid}_${c.uid}`;
                unionCard.owner = owner;
                unionCard.baseId = unionCard.id;
                unionCard.basePower = unionCard.power;
                unionCard.currentPower = unionCard.power;
                unionCard.unionMaterials = [existingCard, c];

                b[target] = unionCard;
                b[i] = null;
                movedIds.add(unionCard.uid);

                playSound(SOUNDS.sePlace);
                playCardVoice(unionCard, 'play');
                renderBoard();
                await sleep(PLACE_ANIMATION_DURATION);

                await cleanupDestroyedCards();

                await sleep(100);
                renderBoard();
                didUnion = true;
              }
            }

            // 2. 装備（Equip / Arm Self）の判定と処理（共通ヘルパーcanEquipCardで憑依・反射等の制限を考慮して判定）
            if (!didUnion && canEquipCard(c, existingCard)) {
              // 装備によるパワー加算
              existingCard.power = (existingCard.power || 0) + (c.power || 0);
              existingCard.basePower =
                (existingCard.basePower || 0) + (c.power || 0);
              existingCard.currentPower =
                (existingCard.currentPower || 0) + (c.power || 0);

              // スキルの統合
              existingCard.skills = existingCard.skills || [];

              const equipSkills = [];
              if (c.skills) {
                c.skills.forEach((s) => {
                  if (s.id !== 'equip') equipSkills.push(s);
                });
              }
              if (equipSkills.length > 0) {
                mergeCardSkills(existingCard, equipSkills);
              }

              // 装備カードリストに追加
              existingCard.equippedCards = existingCard.equippedCards || [];
              existingCard.equippedCards.push(c);

              // 武装（arm_self）の消費処理
              consumeArmSelf(existingCard, c);

              b[i] = null;
              movedIds.add(existingCard.uid || existingCard.id);

              playSound(SOUNDS.sePlace);
              renderBoard();
              await sleep(PLACE_ANIMATION_DURATION);

              await cleanupDestroyedCards();

              await sleep(100);
              renderBoard();
              didEquip = true;
            }
          }

          // 3. 通常の破棄配置の処理
          if (!didUnion && !didEquip) {
            if (b[target] && hasSkill(b[target], 'startup')) {
              // 起動消滅の特別処理
              const existingCard = b[target];
              existingCard.skills = existingCard.skills.filter(
                (s) => s.id !== 'startup' && s.id !== 'defender'
              );

              // 移動しようとしたカードを墓地に送る
              await discardCard(owner, c, i, false);

              const targetEl = document.querySelector(
                `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${target}"] .card`
              );
              if (targetEl) {
                createDamagePopup(targetEl, '起動', '#38bdf8');
              }

              b[i] = null;
              playSound(SOUNDS.sePlace);
              renderBoard();
              await sleep(PLACE_ANIMATION_DURATION);
            } else {
              if (b[target]) {
                if (!(await discardCard(owner, b[target], target, false)))
                  b[target] = null;
              }
              movedIds.add(c.uid || c.id);
              b[target] = c;
              b[i] = null;
              playSound(SOUNDS.sePlace);
              renderBoard();
              await sleep(PLACE_ANIMATION_DURATION);
            }
          }
          successMove = true;
        } else {
          // 同じレーンをクリックした場合は何もせず移動終了
          successMove = true;
        }
      }
    }
  }
}


import { TURN_SUB_PHASE } from './phases/phaseTypes.js';

/**
 * ターン開始時におけるユニットの状態異常（スタン・攻撃不能）カウントを減算する。
 * @param {string} owner - プレイヤー種別 ('blue' | 'red')
 */
function decrementStatusCounters(owner) {
  GameState.turnSubPhase = TURN_SUB_PHASE.STATUS_COUNTDOWN;
  const myBoard =
    owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  myBoard.forEach((c) => {
    if (c && c.stunTurns > 0) {
      c.stunTurns--;
    }
    if (c && c.cantAttackTurns > 0) {
      c.cantAttackTurns--;
    }
  });
}

/**
 * チュートリアルモードにおける一時停止処理を行う。
 * UIにメッセージを表示し、プレイヤーの進行操作（Resume通知）を待機する。
 * @param {string} owner - ターン所有者 ('blue' | 'red')
 * @param {'beforeEnemyTurn' | 'beforeCombat'} pausePoint - 一時停止ポイントの識別子
 */
async function tutorialPauseIfNeeded(owner, pausePoint) {
  if (!GameState.tutorial) return;

  if (
    pausePoint === 'beforeEnemyTurn' &&
    owner === 'red' &&
    GameState.tutorial.pauseBeforeEnemyTurn
  ) {
    GameState.tutorial.pauseBeforeEnemyTurn = false;
    GameState.isProcessing = false;
    if (updateBattleUIHook) updateBattleUIHook();
    await new Promise((resolve) => {
      GameState.tutorial.enemyTurnResumeResolver = resolve;
    });
    GameState.isProcessing = true;
  } else if (
    pausePoint === 'beforeCombat' &&
    owner === 'blue' &&
    GameState.tutorial.pauseBeforeCombat
  ) {
    GameState.tutorial.pauseBeforeCombat = false;
    GameState.isProcessing = false;
    if (updateBattleUIHook) updateBattleUIHook();
    await new Promise((resolve) => {
      GameState.tutorial.combatResumeResolver = resolve;
    });
    GameState.isProcessing = true;
  }
}

/**
 * ターン開始時にプレイヤー/敵のSPを1加算する。
 * （※先攻の1ターン目や追加ターン・攻撃スキップ時は加算されない）
 * @param {string} owner - プレイヤー種別 ('blue' | 'red')
 */
function incrementSP(owner) {
  GameState.turnSubPhase = TURN_SUB_PHASE.SP_INCREMENT;
  const c = owner === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
  if (GameState.turnCount > 1 && GameState.attackSkipCount === 0) {
    if (c.leaderSkill && c.leaderSkill.cost) {
      if (owner === 'blue')
        GameState.playerSP = Math.min(
          c.leaderSkill.cost,
          GameState.playerSP + 1
        );
      else
        GameState.enemySP = Math.min(c.leaderSkill.cost, GameState.enemySP + 1);
    }
    updateSPOrbs(owner);
  }
}

/**
 * 戦闘フェーズ（攻撃スキップ判定および各レーン攻撃実行）を行う。
 * @param {string} owner - ターン所有者 ('blue' | 'red')
 * @returns {Promise<boolean>} 戦闘実行中に勝敗が決した場合は true
 */
async function executeCombatIfPossible(owner) {
  GameState.turnSubPhase = TURN_SUB_PHASE.COMBAT;

  let skipAttack = false;
  if (GameState.attackSkipCount > 0) {
    skipAttack = true;
    GameState.attackSkipCount--;
  }

  if (!skipAttack) {
    const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    if (board.some((x) => x !== null)) {
      await executeCombatPhase(owner);
      if (checkWinCondition()) return true;
    }
  }

  // 【デバッグ】プレイヤー攻撃終了後の盤面状態をログ出力
  if (owner === 'blue') {
    const dumpBoard = (b) =>
      b
        .map((c) =>
          c
            ? `${c.name}(${c.currentPower !== undefined ? c.currentPower : c.power})`
            : 'EMPTY'
        )
        .join(' | ');
    console.log(
      `[Player Turn End] Board: [Player] ${dumpBoard(GameState.playerBoard)} vs [AI] ${dumpBoard(GameState.enemyBoard)}`
    );
  }

  return false;
}

/**
 * ターン開始処理の終了後にカードをドローし、適切な次の操作フェイズ（MAIN_ACTIONまたはAI行動 dispatch）へ遷移する。
 * @param {string} owner - ターン所有者 ('blue' | 'red')
 */
function transitionAfterTurnStart(owner) {
  GameState.turnSubPhase = TURN_SUB_PHASE.DRAW;
  drawCard(owner);

  GameState.turnSubPhase = TURN_SUB_PHASE.TRANSITION;
  if (owner === 'blue') {
    GameState.selectedCardIndex = null;
    updateCardDetail(null);
    renderHand();
    renderBoard();
    if (!getIsQueueProcessing()) {
      GameState.isProcessing = false;
    }
    GameState.battlePhase = 'MAIN_ACTION';
  } else {
    renderBoard(); // 重要: 敵ターン開始前の状態（戦闘結果等）を画面に反映
    if (!getIsQueueProcessing()) {
      GameState.isProcessing = false;
    }
    dispatchBattleAction({ type: 'enemyTurn' });
  }
}

import { runPhases } from './phases/PhaseRunner.js';

/**
 * ターン開始シーケンスを構成するサブフェイズ定義配列。
 * PhaseRunner エンジンによりデータ駆動で順次実行される。
 * @type {Array<import('./phases/PhaseRunner.js').PhaseDefinition>}
 */
const TURN_PHASES = [
  {
    id: TURN_SUB_PHASE.STATUS_COUNTDOWN,
    execute: (ctx) => decrementStatusCounters(ctx.owner),
  },
  {
    id: 'TUTORIAL_PAUSE_BEFORE_ENEMY_TURN',
    execute: (ctx) => tutorialPauseIfNeeded(ctx.owner, 'beforeEnemyTurn'),
    shouldSkip: (ctx) => ctx.owner !== 'red',
  },
  {
    id: 'INCREMENT_TURN_COUNT',
    execute: () => {
      GameState.turnCount++;
    },
  },
  {
    id: TURN_SUB_PHASE.TURN_START_SKILLS,
    execute: (ctx) => triggerStartTurnSkills(ctx.owner),
  },
  {
    id: TURN_SUB_PHASE.VALKYRIA_CLEAR,
    execute: (ctx) => clearValkyriaGuard(GameState, ctx.owner),
  },
  {
    id: TURN_SUB_PHASE.MOVE_SKILLS,
    execute: (ctx) => handleMoveSkills(ctx.owner),
  },
  {
    id: TURN_SUB_PHASE.SP_INCREMENT,
    execute: (ctx) => incrementSP(ctx.owner),
  },
  {
    id: 'TUTORIAL_PAUSE_BEFORE_COMBAT',
    execute: (ctx) => tutorialPauseIfNeeded(ctx.owner, 'beforeCombat'),
    shouldSkip: (ctx) => ctx.owner !== 'blue',
  },
  {
    id: TURN_SUB_PHASE.COMBAT,
    execute: (ctx) => executeCombatIfPossible(ctx.owner),
  },
  {
    id: TURN_SUB_PHASE.TRANSITION,
    execute: (ctx) => transitionAfterTurnStart(ctx.owner),
  },
];

/**
 * ターン開始シーケンスを実行するメインエントリー関数。
 * PhaseRunner を使用し、TURN_PHASES 配列に定義された各サブフェイズをデータ駆動で順番に実行する。
 * @param {string} owner - ターンを開始するプレイヤー ('blue' | 'red')
 */
export async function startTurn(owner) {
  if (GameState.isBattleEnded) return;
  GameState.isProcessing = true;

  GameState.currentTurn = owner === 'blue' ? 'player' : 'enemy';
  if (updateBattleUIHook) updateBattleUIHook();
  renderBoard(); // スタン状態の見た目更新のため描画
  await sleep(50); // Reactの再描画(DOM更新)を確実に行わせるための待機時間

  // データ駆動フェイズランナーにより TURN_PHASES シーケンスを順次実行
  await runPhases(TURN_PHASES, { owner });
}



/**
 * プレイヤーが手動でターン終了ボタンを押下した際の処理。
 * 確認モーダルを表示し、承認された場合はターン終了アクションをディスパッチする。
 */
export async function endPlayerTurn() {
  if (GameState.isProcessing) return;
  // 確認モーダルを表示
  const confirmed = await new Promise((resolve) => {
    showConfirmModal(
      'ターンを終了しますか？\nまだカードを使用できます。',
      () => resolve(true),
      () => resolve(false)
    );
  });
  if (!confirmed) return;
  document
    .querySelectorAll('.cell')
    .forEach((c) => c.classList.remove('highlight'));
  GameState.selectedCardIndex = null;
  updateCardDetail(null);
  renderHand();
  renderBoard();
  // processActionQueue内でロックするため、ここは解除しておく（または最初からセットしない）
  if (!getIsQueueProcessing()) {
    GameState.isProcessing = false;
  }
  dispatchBattleAction({ type: 'endTurn', owner: 'blue' });
}

/**
 * ターン終了のロジック（封印レーンの減算、手札上限オーバー時の超過カード捨て選択、追加ターン判定、次ターン開始）を実行する。
 * @param {string} o - ターンを終了するプレイヤー ('blue' | 'red')
 */
export async function endTurnLogic(o) {
  if (!GameState.isBattleEnded) {
    if (o === 'blue') {
      if (GameState.playerSealedLanes)
        GameState.playerSealedLanes = GameState.playerSealedLanes.map((v) =>
          Math.max(0, v - 1)
        );
    } else {
      if (GameState.enemySealedLanes)
        GameState.enemySealedLanes = GameState.enemySealedLanes.map((v) =>
          Math.max(0, v - 1)
        );
    }

    const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
    if (hand.length > 3) {
      const discardCount = hand.length - 3;
      GameState.placementMessage = null;
      if (updateBattleUIHook) updateBattleUIHook();

      if (o === 'blue') {
        const indices = await waitPlayerHandSelection(
          discardCount,
          'blue',
          true,
          '手札が上限を超えています。捨てるカードを選択してください。'
        );
        const sortedIndices = [...indices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          const dropped = GameState.playerHand.splice(idx, 1)[0];
          await discardCard('blue', dropped, undefined, false);
        }
      } else {
        if (GameState.gameMode === 'online') {
          const indices = await waitPlayerHandSelection(
            discardCount,
            'red',
            true
          );
          const sortedIndices = [...indices].sort((a, b) => b - a);
          for (const idx of sortedIndices) {
            const dropped = GameState.enemyHand.splice(idx, 1)[0];
            await discardCard('red', dropped, undefined, false);
          }
        } else {
          let candidates = GameState.enemyHand.map((c, i) => ({
            idx: i,
            power: c.power || 0,
          }));
          candidates.sort((a, b) => b.power - a.power);
          const sortedIndices = candidates
            .slice(0, discardCount)
            .map((c) => c.idx)
            .sort((a, b) => b - a);
          for (const idx of sortedIndices) {
            const dropped = GameState.enemyHand.splice(idx, 1)[0];
            await discardCard('red', dropped, undefined, false);
          }
        }
      }

      GameState.placementMessage = null;
      renderHand();
    }

    renderBoard();
    let nextOwner = o === 'blue' ? 'red' : 'blue';
    if (GameState.extraTurnCount > 0) {
      GameState.extraTurnCount--;
      nextOwner = o;
    }
    await startTurn(nextOwner);
  }
}


/**
 * 盤面上のカードが保持するターン開始時パッシブスキル（「契約」の自傷ダメージ等）を全レーンで評価・発動する。
 * @param {string} owner - ターンを開始するプレイヤー ('blue' | 'red')
 */
export async function triggerStartTurnSkills(owner) {
  let triggered = false;

  for (let i = 0; i < 3; i++) {
    const tr = await triggerStartTurnPassive(owner, i);
    if (tr) {
      triggered = true;
      if (checkWinCondition()) return;
      updateHPBar();
      await sleep(300);
    }
  }
  if (triggered) {
    renderBoard();
    await sleep(200);
  }
}


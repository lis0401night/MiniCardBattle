import { GameState } from '../state/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  AI_THINKING_DURATION,
  PLACE_ANIMATION_DURATION,
} from '../utils/constants/config.js';
import { shuffleArray, sleep } from '../utils/gameUtils.js';
import { getEasyDecision } from './ai_easy.js';
import { getNormalDecision, getNormalTokenLanes } from './ai_normal.js';
import { discardCard, endTurnLogic, playCard } from './battle.js';
import { isGraveKeeperActive } from './engine.js';
import { activateLeaderSkill } from './leaderSkills.js';

import { updateBattleUIHook } from '../services/uiBattle.js';

// AI状態をバトルUIへ通知し、UIフックの例外でAI処理を中断しない。
const notifyBattleUI = () => {
  try {
    if (updateBattleUIHook) updateBattleUIHook();
  } catch (uiError) {
    console.error('バトルUIの更新に失敗しました:', uiError);
  }
};

/**
 * ミニカードバトル - 敵AIロジック（シミュレーション・オーバーホール版）
 */

/**
 * 通常の敵AIの思考ルーチン（手札からの配置）
 */
export async function executeEnemyAI() {
  if (GameState.appState !== 'battle' || GameState.isBattleEnded) return;

  GameState.isProcessing = true;
  GameState.isAIThinking = true; // 「思考中・・・」UI表示開始
  notifyBattleUI();
  try {
    await sleep(AI_THINKING_DURATION);

    const dmp = (b) =>
      b
        .map((c) => (c ? `${c.name}(${c.currentPower ?? c.power})` : 'EMPTY'))
        .join(' | ');
    console.log(
      `[AI RAW DATA] Board: [Player] ${dmp(GameState.playerBoard)} vs [AI] ${dmp(GameState.enemyBoard)}`
    );

    // --- リーダースキルの活用 ---
    const skill = GameState.enemyConfig.leaderSkill;
    let canUseSkill = skill && GameState.enemySP >= skill.cost;
    // マリア（悪魔狩り）の場合、墓地に復活対象がいなければ空撃ちしない
    if (canUseSkill && skill.action === 'devilhunter_resurrect') {
      canUseSkill = GameState.enemyDiscard.some((c) => !c.isToken);
      if (isGraveKeeperActive(GameState)) canUseSkill = false;
    }
    // オーバードライブの場合、自分か相手の墓地にカードがある場合のみ使用
    if (canUseSkill && skill.action === 'overdrive') {
      const myHasCards = GameState.enemyDiscard.some((c) => !c.isToken);
      const oppHasCards = GameState.playerDiscard.some((c) => !c.isToken);
      canUseSkill = myHasCards || oppHasCards;
      if (isGraveKeeperActive(GameState)) canUseSkill = false;
    }

    // ダンジョン用召喚スキルで、生贄（takeover）の場合、自分の場にカードが1枚もなければ空撃ちしない
    if (
      canUseSkill &&
      skill.action === 'dungeon_summon_leader' &&
      GameState.enemyConfig.leaderCardId
    ) {
      const lc = CARD_MASTER.find(
        (c) => c.id === GameState.enemyConfig.leaderCardId
      );
      if (lc && lc.skills && lc.skills.some((s) => s.id === 'takeover')) {
        if (!GameState.enemyBoard.some((c) => c !== null)) {
          canUseSkill = false;
        }
      }
    }

    // 【強制使用スキル】エリシア・ナイア・クロエはシミュレーション前に必ず発動し、
    // スキル使用後の手札・盤面でカード選択をシミュレーションする
    let shouldForceSkill = false;
    if (canUseSkill) {
      if (
        [
          'god_flame',
          'condemnation', // エリシア（通常・高難易度）：ダメージ+回復
          'abyss_ritual',
          'otherworld_gate', // ナイア（通常・高難易度）：手札入替系
          'void_purge', // ゼノン：お互いの手札を捨てて虚空を加える
          'time_stop',
          'world_reconstruct', // クロエ（通常・高難易度）：追加ターン系
        ].includes(skill.action)
      ) {
        shouldForceSkill = true;
      }
      // 初級難易度の場合、空撃ち以外は100%使用
      else if (
        typeof GameState.aiLevel !== 'undefined' &&
        GameState.aiLevel === 1
      ) {
        if (
          skill.action === 'annihilation' ||
          skill.action === 'targeted_destruction' ||
          skill.action === 'ragnarok'
        ) {
          // 相手の場にカードがある場合のみ使用（空撃ち防止）
          if (GameState.playerBoard.some((c) => c !== null)) {
            shouldForceSkill = true;
          }
        } else if (
          skill.action === 'tomb_guard' ||
          skill.action === 'death_judgment'
        ) {
          // 相手の場にカードがあるか、デッキにカードがある場合に使用
          if (
            GameState.playerBoard.some((c) => c !== null) ||
            GameState.playerDeck.length > 0
          ) {
            shouldForceSkill = true;
          }
        } else {
          shouldForceSkill = true;
        }
      }
    }

    if (shouldForceSkill) {
      // 強制使用時はデフォルトの評価（空きレーン前方優先）
      await activateLeaderSkill('red');
      if (GameState.isBattleEnded) return;
      await sleep(AI_THINKING_DURATION);
    }

    // 思考ルーチン: 難易度に応じた意思決定
    if (
      GameState.enemyHand.length > 0 ||
      GameState.enemyBoard.some((c) => c !== null)
    ) {
      let decision;

      if (typeof GameState.aiLevel !== 'undefined' && GameState.aiLevel === 1) {
        // 初級難易度 (ai_easy.js)
        GameState.aiDecision = getEasyDecision();
      } else {
        // 中級以上 (ai_normal.js)
        GameState.aiDecision = getNormalDecision();
      }
      GameState.isAIThinking = false; // シミュレーション計算完了、「思考中」UI表示終了
      notifyBattleUI();
      decision = GameState.aiDecision;

      // 選んだ手が「スキル使用」を伴う場合、実行する（必ず先出し）
      if (decision.useSkill) {
        // 【リーダーカードスキルのアクションキュー事前登録】
        // buildSkillBranchで生成された全スキルアクションを一括でactionQueueに登録する
        if (skill.action === 'dungeon_summon_leader') {
          if (!GameState.aiDecision.actionQueue) {
            GameState.aiDecision.actionQueue = [];
          }
          if (
            decision.leaderCardSkillActions &&
            decision.leaderCardSkillActions.length > 0
          ) {
            GameState.aiDecision.actionQueue.unshift(
              ...decision.leaderCardSkillActions
            );
          }
        }
        // シミュレーションで決定した tokenLanes, leaderSkillTargetIdx を渡す
        await activateLeaderSkill(
          'red',
          decision.tokenLanes,
          decision.leaderSkillTargetIdx,
          decision.leaderSkillTargetUid
        );
        if (GameState.isBattleEnded) return;
        await sleep(AI_THINKING_DURATION);
      }

      // カードを出す
      if (decision.index !== -1 && decision.lane !== -1) {
        // AIの意思決定オブジェクトを確実に保持し、多段階スキルがアクションキューを辿れるようにする
        GameState.aiDecision = decision;

        if (
          decision.isOverwrite &&
          GameState.enemyBoard[decision.lane] !== null
        ) {
          const oldCard = GameState.enemyBoard[decision.lane];
          // 強いカードを置くために既存のカードを破棄
          await discardCard('red', oldCard, decision.lane, false);
        }
        await playCard('red', decision.index, decision.lane);
        await sleep(PLACE_ANIMATION_DURATION);
      } else {
        if (!decision.useSkill) console.log('[AI] Pass turn.');
      }
    }
  } catch (e) {
    console.error('AI Error:', e);
  } finally {
    GameState.isAIThinking = false; // 例外発生時もフラグを確実にリセット
    notifyBattleUI();
    if (!GameState.isBattleEnded) {
      try {
        // 【CodeRabbit指摘反映】競合防止のため、非同期のターン終了処理（endTurnLogic）が完全に完了した後に処理中フラグを解除する
        await endTurnLogic('red');
      } finally {
        GameState.isProcessing = false;
      }
    }
  }
}

/**
 * トークン配置レーンの選択（難易度別ディスパッチャ）
 */
export function evaluateBestLanesForToken(
  allLanes,
  owner,
  tokenCard,
  count,
  canCancel = false,
  checkConstraints = true
) {
  if (owner === 'blue') return shuffleArray([...allLanes]).slice(0, count);

  if (typeof GameState.aiLevel !== 'undefined' && GameState.aiLevel === 1) {
    const emptyLanes = allLanes.filter((l) => GameState.enemyBoard[l] === null);
    if (emptyLanes.length >= count) {
      return shuffleArray(emptyLanes).slice(0, count);
    } else {
      // 空きレーンをすべて使い、残りを埋まっているレーンからランダムに選ぶ
      const occupiedLanes = allLanes.filter(
        (l) => GameState.enemyBoard[l] !== null
      );
      return [
        ...shuffleArray(emptyLanes),
        ...shuffleArray(occupiedLanes),
      ].slice(0, count);
    }
  } else {
    return getNormalTokenLanes(
      allLanes,
      owner,
      tokenCard,
      count,
      canCancel,
      checkConstraints
    );
  }
}

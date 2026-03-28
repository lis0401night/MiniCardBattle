import { sleep } from '../utils/gameUtils.js';
import { getEasyDecision } from './ai_easy.js';
import { getNormalDecision, getNormalTokenLanes } from './ai_normal.js';
import { discardCard, endTurnLogic, playCard } from './battle.js';
import { GameState } from './gameState.js';
import { activateLeaderSkill } from './leaderSkills.js';
import { CARD_MASTER } from '../utils/constants/cards.js';

/**
 * ミニカードバトル - 敵AIロジック（シミュレーション・オーバーホール版）
 */

/**
 * 通常の敵AIの思考ルーチン（手札からの配置）
 */
export async function executeEnemyAI() {
    if (GameState.appState !== 'battle' || GameState.isBattleEnded) return;

    GameState.isProcessing = true;
    try {
        await sleep(800);

        // --- リーダースキルの活用 ---
        const skill = GameState.enemyConfig.leaderSkill;
        let canUseSkill = skill && GameState.enemySP >= skill.cost;
        // マリア（悪魔狩り）の場合、墓地に復活対象がいなければ空撃ちしない
        if (canUseSkill && skill.action === 'devilhunter_resurrect') {
            canUseSkill = GameState.enemyDiscard.some(c => (c.power || 0) <= 10 && !c.isToken);
        }
        
        // ダンジョン用召喚スキルで、生贄（takeover）の場合、自分の場にカードが1枚もなければ空撃ちしない
        if (canUseSkill && skill.action === 'dungeon_summon_leader' && GameState.enemyConfig.leaderCardId) {
            const lc = CARD_MASTER.find(c => c.id === GameState.enemyConfig.leaderCardId);
            if (lc && (lc.skill === 'takeover' || (lc.skills && lc.skills.some(s => s.id === 'takeover')))) {
                if (!GameState.enemyBoard.some(c => c !== null)) {
                    canUseSkill = false;
                }
            }
        }

        // リーダースキルの先行使用（強制使用）
        let shouldForceSkill = false;
        if (canUseSkill) {
            // ナイア、エリシア、クロエは難易度によらず優先使用（デッキ圧縮、回復、ターンスキップ）
            if (skill.action === 'abyss_ritual' || skill.action === 'dark_ritual' || skill.action === 'time_stop') {
                shouldForceSkill = true;
            }
            // 初級難易度の場合、アイギス・リナの「空撃ち」を除き100%使用
            else if (typeof GameState.aiLevel !== 'undefined' && GameState.aiLevel === 1) {
                if (skill.action === 'hero' || skill.action === 'targeted_destruction') {
                    // 相手の場にカードがある場合のみ使用（空撃ち防止）
                    if (GameState.playerBoard.some(c => c !== null)) {
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
            await sleep(500);
        }

        // 思考ルーチン: 難易度に応じた意思決定
        if (GameState.enemyHand.length > 0 || GameState.enemyBoard.some(c => c !== null)) {
            let decision;

            if (typeof GameState.aiLevel !== 'undefined' && GameState.aiLevel === 1) {
                // 初級難易度 (ai_easy.js)
                GameState.aiDecision = getEasyDecision();
            } else {
                // 中級以上 (ai_normal.js)
                GameState.aiDecision = getNormalDecision();
            }
            decision = GameState.aiDecision;

            // 選んだ手が「スキル使用」を伴う場合、実行する（必ず先出し）
            if (decision.useSkill) {
                // シミュレーションで決定した tokenLanes を渡す
                await activateLeaderSkill('red', decision.tokenLanes);
                if (GameState.isBattleEnded) return;
                await sleep(500);
            }

            // カードを出す
            if (decision.index !== -1 && decision.lane !== -1) {
                if (decision.isOverwrite && GameState.enemyBoard[decision.lane] !== null) {
                    const oldCard = GameState.enemyBoard[decision.lane];
                    // 強いカードを置くために既存のカードを破棄（上書きなので破壊効果は発動しない）
                    await discardCard('red', oldCard, decision.lane, false);
                }
                await playCard('red', decision.index, decision.lane);
                await sleep(600);
            } else {
                if (!decision.useSkill) console.log("AI decided to PASS.");
            }
        }
    } catch (e) {
        console.error("AI Error:", e);
    } finally {
        if (!GameState.isBattleEnded) {
            GameState.isProcessing = false;
            endTurnLogic('red');
        }
    }
}

/**
 * トークン配置レーンの選択（難易度別ディスパッチャ）
 */
export function evaluateBestLanesForToken(allLanes, owner, tokenCard, count, isLeaderSkill = false) {
    if (owner === 'blue') return [...allLanes].sort(() => Math.random() - 0.5).slice(0, count);

    if (typeof GameState.aiLevel !== 'undefined' && GameState.aiLevel === 1) {
        // 初級: ランダム
        return [...allLanes].sort(() => Math.random() - 0.5).slice(0, count);
    } else {
        // 中級以上: シミュレーション (ai_normal.js)
        return getNormalTokenLanes(allLanes, owner, tokenCard, count, isLeaderSkill);
    }
}


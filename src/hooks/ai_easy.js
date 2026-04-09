import { hasSkill, getSeededRandom } from '../utils/gameUtils.js';
import { simulateMove } from './ai_normal.js';
import { GameState } from './gameState.js';

/**
 * ミニカードバトル - 敵AIロジック（初級・ランダム版）
 */

/**
 * 初級難易度の意思決定
 * @returns {Object} { index, lane, isOverwrite, useSkill }
 */
export function getEasyDecision() {
    // 全ての合法な移動パターンをリストアップ
    const allCandidates = [];
    const handIndices = [...Array(GameState.enemyHand.length).keys(), -1]; // 手札インデックス + パス

    for (let idx of handIndices) {
        const card = idx === -1 ? null : GameState.enemyHand[idx];
        const possibleLanes = [];

        if (idx === -1) {
            possibleLanes.push(-1);
        } else {
            const emptyLanes = [0, 1, 2].filter(l => GameState.enemyBoard[l] === null);
            const occupiedLanes = [0, 1, 2].filter(l => GameState.enemyBoard[l] !== null);

            let validSpaces = [];
            if (hasSkill(card, 'legendary')) {
                validSpaces = [1];
            } else if (hasSkill(card, 'takeover')) {
                validSpaces = [...occupiedLanes];
            } else {
                // 1ターン目の制限 (先攻RED)
                if (GameState.turnCount === 1 && GameState.firstPlayer === 'red') {
                    validSpaces = [1];
                } else {
                    // 空きを優先するが、空きがなければ上書きも候補
                    if (emptyLanes.length > 0) {
                        validSpaces = [...emptyLanes];
                    } else {
                        validSpaces = [0, 1, 2];
                    }
                }
            }

            if (hasSkill(card, 'challenge')) {
                validSpaces = validSpaces.filter(idx => GameState.playerBoard[idx] !== null);
            }

            validSpaces.forEach(l => possibleLanes.push(l));
        }

        for (let lane of possibleLanes) {
            // シミュレーション実行
            const sim = simulateMove(idx, lane, GameState.enemyHand, GameState.enemyBoard, GameState.playerBoard, GameState.enemyHP, false, GameState.enemySP);
            allCandidates.push({
                index: idx,
                lane: lane,
                isOverwrite: lane !== -1 && GameState.enemyBoard[lane] !== null,
                useSkill: false,
                enemyHP: sim.enemyHP,
                playerHP: sim.playerHP
            });
        }
    }

    // --- 戦略的フィルタリング ---

    // 1. 速攻のリーサル (相手のHPを0にできるなら、それを選択)
    const lethalMoves = allCandidates.filter(c => c.playerHP <= 0);
    if (lethalMoves.length > 0) {
        console.log("Easy AI: Lethal detected!");
        return lethalMoves[Math.floor(getSeededRandom() * lethalMoves.length)];
    }

    // 2. 自滅回避 (自分のHPが0になる移動を除外)
    // ただし、全ての移動が自滅なら仕方ないのでそのまま
    let safeCandidates = allCandidates.filter(c => c.enemyHP > 0);
    if (safeCandidates.length === 0) safeCandidates = allCandidates;

    // 3. リーサル回避 (パスをすると自分が死ぬ場合、生き残れる移動を優先)
    const passMove = safeCandidates.find(c => c.index === -1);
    if (passMove && passMove.enemyHP <= 0) {
        const survivalMoves = safeCandidates.filter(c => c.enemyHP > 0);
        if (survivalMoves.length > 0) {
            console.log("Easy AI: Survival move prioritized!");
            return survivalMoves[Math.floor(getSeededRandom() * survivalMoves.length)];
        }
    }

    // 4. 通常のランダム決定（安全な候補から選択）
    // パス以外の有効な行動（手札を出す）が存在するなら、必ずそれを選択する（手札があるのにパスはしない）
    const playMoves = safeCandidates.filter(c => c.index !== -1);
    if (playMoves.length > 0) {
        return playMoves[Math.floor(getSeededRandom() * playMoves.length)];
    }

    // もし手札がない等でパス以外の手段がなければ、仕方なくパスする
    return safeCandidates[Math.floor(getSeededRandom() * safeCandidates.length)];
}

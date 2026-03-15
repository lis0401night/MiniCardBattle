/**
 * ミニカードバトル - 敵AIロジック（シミュレーション・オーバーホール版）
 */

/**
 * 通常の敵AIの思考ルーチン（手札からの配置）
 */
async function executeEnemyAI() {
    if (appState !== 'battle' || isBattleEnded) return;

    isProcessing = true;
    try {
        await sleep(800);

        // --- リーダースキルの活用 ---
        const skill = enemyConfig.leaderSkill;
        const canUseSkill = skill && enemySP >= skill.cost;

        // リーダースキルの先行使用（強制使用）
        let shouldForceSkill = false;
        if (canUseSkill) {
            // ナイア、エリシアは難易度によらず優先使用（デッキ圧縮・回復）
            if (enemyConfig.id === 'cthulhu' || enemyConfig.id === 'cleric') {
                shouldForceSkill = true;
            }
            // イージー難易度の場合、アイギス・リナの「空撃ち」を除き100%使用
            else if (typeof aiLevel !== 'undefined' && aiLevel === 1) {
                if (enemyConfig.id === 'android' || enemyConfig.id === 'elf') {
                    // 相手の場にカードがある場合のみ使用（空撃ち防止）
                    if (playerBoard.some(c => c !== null)) {
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
            if (isBattleEnded) return;
            await sleep(500);
        }

        // 思考ルーチン: 難易度に応じた意思決定
        if (enemyHand.length > 0 || enemyBoard.some(c => c !== null)) {
            let decision;

            if (typeof aiLevel !== 'undefined' && aiLevel === 1) {
                // イージー難易度 (ai_easy.js)
                aiDecision = getEasyDecision();
            } else {
                // ノーマル以上 (ai_normal.js)
                aiDecision = getNormalDecision();
            }
            decision = aiDecision;

            // 選んだ手が「スキル使用」を伴う場合、実行する（必ず先出し）
            if (decision.useSkill) {
                // シミュレーションで決定した tokenLanes を渡す
                await activateLeaderSkill('red', decision.tokenLanes);
                if (isBattleEnded) return;
                await sleep(500);
            }

            // カードを出す
            if (decision.index !== -1 && decision.lane !== -1) {
                if (decision.isOverwrite) {
                    const oldCard = enemyBoard[decision.lane];
                    await discardCard('red', oldCard, decision.lane);
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
        if (!isBattleEnded) {
            isProcessing = false;
            endTurnLogic('red');
        }
    }
}

/**
 * トークン配置レーンの選択（難易度別ディスパッチャ）
 */
function evaluateBestLanesForToken(allLanes, owner, tokenCard, count, isLeaderSkill = false) {
    if (owner === 'blue') return [...allLanes].sort(() => Math.random() - 0.5).slice(0, count);

    if (typeof aiLevel !== 'undefined' && aiLevel === 1) {
        // イージー: ランダム
        return [...allLanes].sort(() => Math.random() - 0.5).slice(0, count);
    } else {
        // ノーマル以上: シミュレーション (ai_normal.js)
        return getNormalTokenLanes(allLanes, owner, tokenCard, count, isLeaderSkill);
    }
}


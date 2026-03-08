// ==========================================
// 敵AIの思考ルーチンロジック
// ==========================================

async function executeEnemyAI() {
    if (isBattleEnded) return;

    // リーダースキルの使用判定（共通ロジック）
    // 無駄撃ちを防ぐ（例: プレイヤー側の盤面が空のときは全体除去を撃たない）
    if (enemyConfig.leaderSkill.cost && enemySP >= enemyConfig.leaderSkill.cost) {
        let shouldUseSkill = true;
        const action = enemyConfig.leaderSkill.action;

        // 殲滅光線（全体ダメージ）の場合、プレイヤーの場にカードが1枚も無ければ使わない
        if (action === 'annihilation') {
            const hasPlayerCards = Object.values(playerBoard).some(c => c !== null);
            if (!hasPlayerCards) shouldUseSkill = false;
        }

        if (shouldUseSkill && Math.random() < 0.7) {
            await activateLeaderSkill('red');
            if (checkWinCondition()) return;
        }
    }

    // 難易度別のプレイ判断ルーチン
    let targetLane = -1;
    let handIndex = -1;

    if (aiLevel === 1) {
        // EASY: 完全にランダム（空きレーンにランダムな手札）
        const emptyLanes = enemyBoard.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
        if (emptyLanes.length > 0 && enemyHand.length > 0) {
            targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
            handIndex = Math.floor(Math.random() * enemyHand.length);
        }
    } else {
        // NORMAL / HARD
        const emptyLanes = enemyBoard.map((c, i) => c === null ? i : -1).filter(i => i !== -1);

        if (emptyLanes.length > 0 && enemyHand.length > 0) {
            // ① 【共通】リーサル判定（速攻）
            // 相手のHPを0にできる「速攻」カードがあれば最優先で空きレーンに出す
            if (aiLevel >= 2) {
                for (let i = 0; i < enemyHand.length; i++) {
                    const card = enemyHand[i];
                    if (hasSkill(card, 'quick')) {
                        for (let l of emptyLanes) {
                            if (playerHP - card.currentPower <= 0) {
                                await playCard('red', i, l);
                                if (checkWinCondition()) return;
                                await sleep(500);
                                endTurnLogic('red');
                                return;
                            }
                        }
                    }
                }
            }

            if (emptyLanes.length > 0 && enemyHand.length > 0) {
                // ② 【共通】次ターンの致命傷（自分への直接攻撃）を防ぐレーンを探す
                let lethalLane = -1;
                let maxIncomingDamage = 0;

                for (let i = 0; i < 3; i++) {
                    if (enemyBoard[i] === null && playerBoard[i] !== null) {
                        const pCard = playerBoard[i];
                        if (hasSkill(pCard, 'defender')) continue;

                        const dmg = pCard.currentPower;
                        if (enemyHP - dmg <= 0 && dmg > maxIncomingDamage) {
                            maxIncomingDamage = dmg;
                            lethalLane = i;
                        }
                    }
                }

                // ③ 戦略的プレイ（HARDとNORMALで分岐）
                if (aiLevel >= 3) {
                    // HARD専用：シミュレーションによる最適化
                    let bestCardIndex = 0;
                    let bestLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                    let bestScore = -9999;

                    const lanesToEvaluate = (lethalLane !== -1) ? [lethalLane] : emptyLanes;

                    for (let l of lanesToEvaluate) {
                        const targetEnemyCard = playerBoard[l];

                        for (let i = 0; i < enemyHand.length; i++) {
                            const card = enemyHand[i];

                            // 【制限】速攻カードを防御（身代わり）に使うのは、相手を倒せる場合のみ
                            if (hasSkill(card, 'quick') && targetEnemyCard) {
                                const willKill = card.currentPower >= targetEnemyCard.currentPower || hasSkill(card, 'deadly');
                                if (!willKill) continue;
                            }

                            let simPower = card.currentPower;
                            let pDmg = [0, 0, 0];

                            // スキルシミュレーション
                            if (hasSkill(card, 'lone_wolf')) {
                                let emptyCount = 0;
                                for (let j = 0; j < 3; j++) {
                                    if (j !== l && enemyBoard[j] === null) emptyCount++;
                                }
                                simPower += emptyCount * (getSkillValue(card, 'lone_wolf') || 3);
                            } else if (hasSkill(card, 'snipe')) {
                                let maxL = -1; let maxP = -1;
                                for (let j = 0; j < 3; j++) {
                                    if (playerBoard[j] && playerBoard[j].currentPower > maxP) {
                                        maxP = playerBoard[j].currentPower; maxL = j;
                                    }
                                }
                                if (maxL !== -1) pDmg[maxL] += (getSkillValue(card, 'snipe') || 4);
                            } else if (hasSkill(card, 'spread')) {
                                const val = getSkillValue(card, 'spread') || 2;
                                for (let j = 0; j < 3; j++) {
                                    if (playerBoard[j]) pDmg[j] += val;
                                }
                            }

                            // 【スコア計算】
                            let score = 0;

                            if (targetEnemyCard) {
                                const remainingOpponentPower = targetEnemyCard.currentPower - pDmg[l];
                                if (remainingOpponentPower <= 0) {
                                    score += 2000 + simPower;
                                } else {
                                    const isWin = simPower >= remainingOpponentPower || hasSkill(card, 'deadly');
                                    if (isWin) {
                                        score += 1000 + (remainingOpponentPower * 50) + simPower;
                                        if (simPower === remainingOpponentPower && !hasSkill(card, 'deadly')) score -= 100;
                                    } else {
                                        score += 500 + (remainingOpponentPower * 40) - (simPower * 10);
                                    }
                                }
                            } else {
                                score += 200 + simPower;
                            }

                            // 正面以外のレーン（スキルダメージ）の評価
                            for (let j = 0; j < 3; j++) {
                                if (j !== l && playerBoard[j] && pDmg[j] > 0) {
                                    const remaining = playerBoard[j].currentPower - pDmg[j];
                                    if (remaining <= 0) {
                                        // 複数撃破ボーナス（HARDはここを高く評価）
                                        score += 800;
                                    } else {
                                        score += 100;
                                    }
                                }
                            }

                            if (score > bestScore) {
                                bestScore = score;
                                bestCardIndex = i;
                                bestLane = l;
                            }
                        }
                    }

                    targetLane = bestLane;
                    handIndex = bestCardIndex;

                } else {
                    // NORMAL：簡易的な判断
                    if (lethalLane !== -1) {
                        targetLane = lethalLane;
                    } else {
                        let maxThreat = -1;
                        for (let i = 0; i < 3; i++) {
                            if (enemyBoard[i] === null && playerBoard[i] !== null && playerBoard[i].currentPower > maxThreat && !hasSkill(playerBoard[i], 'defender')) {
                                maxThreat = playerBoard[i].currentPower;
                                targetLane = i;
                            }
                        }
                        if (targetLane === -1) {
                            targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                        }
                    }

                    // 手札選び（NORMALでも速攻の無駄使いを避ける）
                    let bestIdx = -1;
                    for (let i = 0; i < enemyHand.length; i++) {
                        const c = enemyHand[i];
                        if (hasSkill(c, 'quick') && playerBoard[targetLane]) {
                            // 相手を倒せない防御に速攻は使わない
                            if (c.currentPower < playerBoard[targetLane].currentPower && !hasSkill(c, 'deadly')) continue;
                        }
                        bestIdx = i; // 候補が見つかればそれを使う
                        break;
                    }
                    handIndex = (bestIdx !== -1) ? bestIdx : Math.floor(Math.random() * enemyHand.length);
                }
            }
        }
    }

    // カードをプレイする
    if (targetLane !== -1 && handIndex !== -1 && enemyHand.length > 0) {
        await playCard('red', handIndex, targetLane);
        if (checkWinCondition()) return;
        await sleep(500);
    }

    endTurnLogic('red');
}

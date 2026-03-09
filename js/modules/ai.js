/**
 * Mini Card Battle - Enemy AI Logic
 */

async function executeEnemyAI() {
    if (appState !== 'battle' || isProcessing || isBattleEnded) return;

    isProcessing = true;
    try {
        await sleep(800);

        // --- リーダースキルの積極的活用ロジック ---
        const skill = enemyConfig.leaderSkill;
        const canUseSkill = skill && enemySP >= skill.cost;

        if (canUseSkill) {
            let shouldActivate = false;
            const skillAction = skill.action;

            if (skillAction === 'annihilation') {
                const playerCardCount = playerBoard.filter(c => c !== null).length;
                const hasStrongEnemy = playerBoard.some(c => c && c.currentPower >= 5);
                if (playerCardCount >= 2 || hasStrongEnemy) shouldActivate = true;
            } else if (skillAction === 'dragon_summon' || skillAction === 'satan_avatar') {
                if (enemyBoard.some(c => c === null)) shouldActivate = true;
            } else if (skillAction === 'holy_march') {
                if (enemyBoard.filter(c => c !== null).length >= 1) shouldActivate = true;
            } else if (skillAction === 'abyss_ritual') {
                if (enemyHand.length <= 3 || enemyHand.some(c => c.power <= 3)) shouldActivate = true;
            } else if (skillAction === 'targeted_destruction') {
                if (playerBoard.some(c => c !== null)) shouldActivate = true;
            } else if (skillAction === 'dark_ritual') {
                if (enemyHP <= enemyMaxHP - 3 || playerHP > 5) shouldActivate = true;
            }

            if (shouldActivate && Math.random() < 0.9) {
                await activateLeaderSkill('red');
                if (isBattleEnded) return;
            }
        }

        const emptyLanes = [];
        const allLanes = [0, 1, 2];
        for (let i = 0; i < 3; i++) {
            if (enemyBoard[i] === null) emptyLanes.push(i);
        }

        if (enemyHand.length > 0) {
            // リーサル（敗北）回避の優先判定
            let lethalLane = -1;
            let maxIncomingDamage = 0;
            let virtualHP = enemyHP;

            for (let i = 0; i < 3; i++) {
                const pCard = playerBoard[i];
                if (pCard) {
                    let directDmg = 0;
                    if (!enemyBoard[i]) {
                        directDmg = pCard.currentPower;
                    } else {
                        const myCard = enemyBoard[i];
                        let effectiveEnemyDamage = pCard.currentPower;
                        if (hasSkill(myCard, 'sturdy')) effectiveEnemyDamage = Math.floor(effectiveEnemyDamage / 2);
                        if (effectiveEnemyDamage > myCard.currentPower && !hasSkill(myCard, 'deadly')) {
                            directDmg = effectiveEnemyDamage - myCard.currentPower;
                        }
                    }

                    if (directDmg > 0 && virtualHP - directDmg <= 0 && directDmg > maxIncomingDamage) {
                        maxIncomingDamage = directDmg;
                        lethalLane = i;
                    }
                }
            }

            if (lethalLane !== -1 && canUseSkill) {
                const skillAction = skill.action;
                if (['dark_ritual', 'annihilation', 'targeted_destruction'].includes(skillAction)) {
                    await activateLeaderSkill('red');
                    if (isBattleEnded) return;
                }
            }

            let bestCardIndex = -1;
            let bestLane = -1;
            let bestScore = -999999;
            let bestIsOverwrite = false;

            const lanesToEvaluate = (lethalLane !== -1) ? [lethalLane] : (emptyLanes.length > 0 ? emptyLanes : allLanes);

            for (let l of lanesToEvaluate) {
                const isOverwrite = enemyBoard[l] !== null;

                for (let i = 0; i < enemyHand.length; i++) {
                    const card = enemyHand[i];

                    if (hasSkill(card, 'legendary') && l !== 1) continue;

                    const targetEnemyCard = playerBoard[l];
                    if (hasSkill(card, 'quick') && targetEnemyCard && hasSkill(targetEnemyCard, 'invincible') && lethalLane === -1) {
                        continue;
                    }

                    let score = 0;
                    let simPower = card.currentPower;
                    let pDmg = [0, 0, 0];

                    if (hasSkill(card, 'lone_wolf')) {
                        const emptyCount = enemyBoard.filter((c, j) => j !== l && c === null).length;
                        simPower += emptyCount * (getSkillValue(card, 'lone_wolf') || 3);
                    }
                    if (hasSkill(card, 'hero')) {
                        const filledCount = enemyBoard.filter((c, j) => (j !== l && c !== null) || j === l).length;
                        simPower += filledCount * (getSkillValue(card, 'hero') || 3);
                    }
                    if (hasSkill(card, 'support')) {
                        const val = getSkillValue(card, 'support') || 2;
                        [l - 1, l + 1].forEach(j => {
                            if (j >= 0 && j < 3 && enemyBoard[j]) {
                                const ally = enemyBoard[j];
                                const opponent = playerBoard[j];
                                score += 500;
                                if (opponent) {
                                    const currentWin = ally.currentPower >= opponent.currentPower;
                                    const afterBuffWin = (ally.currentPower + val) >= opponent.currentPower;
                                    if (!currentWin && afterBuffWin) score += 2000;
                                }
                            }
                        });
                    }

                    if (hasSkill(card, 'snipe')) {
                        let maxL = -1, maxP = -1;
                        for (let j = 0; j < 3; j++) {
                            if (playerBoard[j] && playerBoard[j].currentPower > maxP) {
                                maxP = playerBoard[j].currentPower; maxL = j;
                            }
                        }
                        if (maxL !== -1 && !hasSkill(playerBoard[maxL], 'invincible')) {
                            let dmg = (getSkillValue(card, 'snipe') || 4);
                            if (hasSkill(playerBoard[maxL], 'sturdy')) dmg = Math.floor(dmg / 2);
                            pDmg[maxL] += dmg;
                        }
                    }
                    if (hasSkill(card, 'spread')) {
                        const val = getSkillValue(card, 'spread') || 2;
                        let spreadHitCount = 0;
                        [l - 1, l, l + 1].forEach(j => {
                            if (j >= 0 && j < 3 && playerBoard[j] && !hasSkill(playerBoard[j], 'invincible')) {
                                let dmg = val;
                                if (hasSkill(playerBoard[j], 'sturdy')) dmg = Math.floor(dmg / 2);
                                pDmg[j] += dmg;
                                spreadHitCount++;
                                if (playerBoard[j].currentPower <= dmg) score += 1500;
                            }
                        });
                        if (spreadHitCount >= 2) score += 1000 * spreadHitCount;
                    }

                    if (hasSkill(card, 'sacrifice')) {
                        const cost = getSkillValue(card, 'sacrifice') || 0;
                        if (enemyHP - cost <= 0) score = -9999999;
                    }

                    if (targetEnemyCard) {
                        const pInv = hasSkill(targetEnemyCard, 'invincible');
                        const pSturdy = hasSkill(targetEnemyCard, 'sturdy');
                        const pLethalGrowth = hasSkill(targetEnemyCard, 'growth') && (targetEnemyCard.currentPower + getSkillValue(targetEnemyCard, 'growth') <= 0);

                        if (pInv) {
                            score += 500 + simPower;
                        } else if (pLethalGrowth) {
                            score += 300 + simPower;
                        } else {
                            let effectiveDmg = simPower;
                            if (pSturdy) effectiveDmg = Math.floor(effectiveDmg / 2);
                            const remainingP = targetEnemyCard.currentPower - pDmg[l];
                            if (remainingP <= 0) {
                                score += 2000 + simPower;
                            } else {
                                const pPowerAfterSkill = remainingP;
                                const isWin = effectiveDmg >= pPowerAfterSkill || hasSkill(card, 'deadly');
                                if (isWin) score += 1000 + (pPowerAfterSkill * 60) + (simPower * 10);
                                else score += 400 + (pPowerAfterSkill * 30) - (simPower * 5);
                            }
                            if (pSturdy && simPower === 1) score -= 200;
                        }
                    } else {
                        score += 1500 + (simPower * 20);
                        if (l > 0 && enemyBoard[l - 1]) score += 200;
                        if (l < 2 && enemyBoard[l + 1]) score += 200;
                    }

                    if (targetEnemyCard && targetEnemyCard.currentPower >= 4) score += 5000;

                    if (isOverwrite) {
                        score -= 6000;
                        if (enemyBoard[l].currentPower >= 5) score -= 3000;
                    }

                    if (score > bestScore) {
                        bestScore = score; bestCardIndex = i; bestLane = l; bestIsOverwrite = isOverwrite;
                    }
                }
            }

            if (bestCardIndex !== -1 && bestLane !== -1) {
                if (bestIsOverwrite) {
                    const oldCard = enemyBoard[bestLane];
                    discardCard('red', oldCard, bestLane);
                }
                await playCard('red', bestCardIndex, bestLane);
            }
        }
    } finally {
        if (!isBattleEnded) {
            isProcessing = false;
            endTurnLogic('red');
        }
    }
}

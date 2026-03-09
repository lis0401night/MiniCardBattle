/**
 * Mini Card Battle - Enemy AI Logic
 */

async function executeEnemyAI() {
    if (appState !== 'battle' || isProcessing || isBattleEnded) return;

    // --- リーダースキルの積極的活用ロジック (追加) ---
    const skill = enemyConfig.leaderSkill;
    const canUseSkill = enemySP >= skill.cost;

    if (canUseSkill) {
        let shouldActivate = false;
        const skillAction = skill.action;

        // 状況に応じた発動判定 (独自ロジック)
        if (skillAction === 'annihilation') {
            // 敵が2体以上、または強力な敵がいる場合
            const playerCardCount = playerBoard.filter(c => c !== null).length;
            const hasStrongEnemy = playerBoard.some(c => c && c.currentPower >= 5);
            if (playerCardCount >= 2 || hasStrongEnemy) shouldActivate = true;
        } else if (skillAction === 'dragon_summon' || skillAction === 'satan_avatar') {
            // 盤面に空きがあるなら積極的に出す
            if (enemyBoard.some(c => c === null)) shouldActivate = true;
        } else if (skillAction === 'holy_march') {
            // 味方が2体以上いる、または空きがある
            if (enemyBoard.filter(c => c !== null).length >= 1) shouldActivate = true;
        } else if (skillAction === 'abyss_ritual') {
            // 手札が少ない、またはパワーが低いカードがある
            if (enemyHand.length <= 3 || enemyHand.some(c => c.power <= 3)) shouldActivate = true;
        } else if (skillAction === 'targeted_destruction') {
            // 相手にカードがあるなら使う
            if (playerBoard.some(c => c !== null)) shouldActivate = true;
        } else if (skillAction === 'dark_ritual') {
            // HPが減っている、または相手にダメージを与えたい
            if (enemyHP <= enemyMaxHP - 3 || playerHP > 5) shouldActivate = true;
        }

        // 基本的な発動確率 (高い確率で使うように調整)
        if (shouldActivate && Math.random() < 0.9) {
            await activateLeaderSkill('red');
            if (checkWinCondition()) return;
        }
    }
    // ----------------------------------------------

    isProcessing = true;
    await sleep(800);

    const emptyLanes = [];
    const allLanes = [0, 1, 2];
    for (let i = 0; i < 3; i++) {
        if (enemyBoard[i] === null) emptyLanes.push(i);
    }

    if (enemyHand.length > 0) {
        // ① 現状の被ダメージ予測
        let currentTotalIncoming = 0;
        for (let i = 0; i < 3; i++) {
            const pCard = playerBoard[i];
            const eCard = enemyBoard[i];
            if (pCard) {
                if (!eCard) {
                    currentTotalIncoming += pCard.currentPower;
                } else {
                    // 貫通ダメージの計算
                    let effectiveEnemyDamage = pCard.currentPower;
                    if (hasSkill(eCard, 'sturdy')) effectiveEnemyDamage = Math.floor(effectiveEnemyDamage / 2);
                    if (effectiveEnemyDamage > eCard.currentPower && !hasSkill(eCard, 'deadly')) {
                        currentTotalIncoming += (effectiveEnemyDamage - eCard.currentPower);
                    }
                }
            }
        }

        // ② リーサル（敗北）回避の優先判定
        let lethalLane = -1;
        let maxIncomingDamage = 0;
        let virtualHP = enemyHP;

        // ②-A 次の相手のターン開始時の盤面をシミュレート（成長スキル等）
        for (let i = 0; i < 3; i++) {
            const pCard = playerBoard[i];
            if (pCard) {
                let directDmg = 0;
                if (!enemyBoard[i]) {
                    directDmg = pCard.currentPower;
                } else {
                    const myCard = enemyBoard[i];
                    // 頑丈によるダメージ軽減
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

        // ②-B リーダースキルによる緊急回避
        if (lethalLane !== -1 && canUseSkill) {
            let emergencyUsed = false;
            const skillAction = skill.action;
            if (skillAction === 'dark_ritual') {
                await activateLeaderSkill('red');
                emergencyUsed = true;
            } else if (skillAction === 'annihilation' || skillAction === 'targeted_destruction') {
                await activateLeaderSkill('red');
                emergencyUsed = true;
            }

            if (emergencyUsed) {
                if (checkWinCondition()) return;
                currentEnemyHP = enemyHP;
            }
        }

        // ③ シミュレーションによる最適配置の選択
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
                // 無敵の相手に速攻を出すのは、防御（身代わり）目的以外では無駄
                if (hasSkill(card, 'quick') && targetEnemyCard && hasSkill(targetEnemyCard, 'invincible') && lethalLane === -1) {
                    continue;
                }

                // スコア計算の初期化
                let score = 0;
                let simPower = card.currentPower;
                let pDmg = [0, 0, 0];

                // スキル効果の事前計算
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
                            score += 500; // バフを付与できることへの基本点

                            if (opponent) {
                                const currentWin = ally.currentPower >= opponent.currentPower;
                                const afterBuffWin = (ally.currentPower + val) >= opponent.currentPower;
                                // バフによって戦況が好転（負け/分け → 勝ち）する場合に大幅加点
                                if (!currentWin && afterBuffWin) {
                                    score += 2000;
                                }
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

                            // スキルダメージだけで敵を倒せる場合はボーナス付与
                            if (playerBoard[j].currentPower <= dmg) {
                                score += 1500;
                            }
                        }
                    });
                    // 複数ヒット時のコンボボーナス
                    if (spreadHitCount >= 2) score += 1000 * spreadHitCount;
                }

                // 「対価」による自滅防止ロジック
                if (hasSkill(card, 'sacrifice')) {
                    const cost = getSkillValue(card, 'sacrifice') || 0;
                    if (enemyHP - cost <= 0) {
                        score = -999999; // 敗北につながる手は絶対に選ばない
                    }
                }

                // 戦闘シミュレーション
                if (targetEnemyCard) {
                    const pInv = hasSkill(targetEnemyCard, 'invincible');
                    const pSturdy = hasSkill(targetEnemyCard, 'sturdy');
                    const pLethalGrowth = hasSkill(targetEnemyCard, 'growth') && (targetEnemyCard.currentPower + getSkillValue(targetEnemyCard, 'growth') <= 0);

                    if (pInv) {
                        score += 500 + simPower; // 倒せないがブロックは評価
                    } else if (pLethalGrowth) {
                        score += 300 + simPower; // 自壊する相手への攻撃は低評価
                    } else {
                        let effectiveDmg = simPower;
                        if (pSturdy) effectiveDmg = Math.floor(effectiveDmg / 2);

                        const remainingP = targetEnemyCard.currentPower - pDmg[l];
                        if (remainingP <= 0) {
                            score += 2000 + simPower; // スキルで既に倒せる
                        } else {
                            const pPowerAfterSkill = remainingP;
                            const isWin = effectiveDmg >= pPowerAfterSkill || hasSkill(card, 'deadly');
                            if (isWin) {
                                score += 1000 + (pPowerAfterSkill * 60) + (simPower * 10);
                            } else {
                                score += 400 + (pPowerAfterSkill * 30) - (simPower * 5);
                            }
                        }
                        // 頑丈な相手にパワー1で挑むなどの無駄を減らす
                        if (pSturdy && simPower === 1) score -= 200;
                    }
                } else {
                    // 空きレーンへの配置
                    score += 1500 + (simPower * 20);
                    // 隣接レーンへの影響（味方がいる場合）
                    if (l > 0 && enemyBoard[l - 1]) score += 200;
                    if (l < 2 && enemyBoard[l + 1]) score += 200;
                }

                // 大ダメージ被弾回避ボーナス (4以上の被弾を防ぐなら強力な加点)
                if (targetEnemyCard && targetEnemyCard.currentPower >= 4) {
                    score += 5000;
                }

                // 上書きペナルティ（基本的には空きを優先）
                if (isOverwrite) {
                    score -= 5000;
                    if (enemyBoard[l].currentPower >= 5) score -= 2000; // 強い味方の上書きは避ける
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestCardIndex = i;
                    bestLane = l;
                    bestIsOverwrite = isOverwrite;
                }
            }
        }

        // 最善の手が存在すれば実行
        if (bestCardIndex !== -1 && bestLane !== -1) {
            const card = enemyHand.splice(bestCardIndex, 1)[0];
            if (bestIsOverwrite) {
                const oldCard = enemyBoard[bestLane];
                discardCard('red', oldCard, bestLane);
            }
            await playCard('red', bestLane, card);
        }
    }

    if (!isBattleEnded) {
        isProcessing = false;
        endTurn();
    }
}

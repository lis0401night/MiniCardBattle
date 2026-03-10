/**
 * Mini Card Battle - Enemy AI Logic
 */

/**
 * 通常の敵AIの思考ルーチン（手札からの配置）
 * 1ターンに基本1枚のみ配置するルールを遵守
 */
async function executeEnemyAI() {
    if (appState !== 'battle' || isBattleEnded) return;

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
                // 盤面に空きがある（召喚）か、既に1枚以上いてバフの恩恵がある場合
                if (enemyBoard.some(c => c === null) || enemyBoard.filter(c => c !== null).length >= 1) shouldActivate = true;
            } else if (skillAction === 'abyss_ritual') {
                // 手札が2枚以上あればバフ効率が良い
                if (enemyHand.length >= 2) shouldActivate = true;
            } else if (skillAction === 'targeted_destruction') {
                if (playerBoard.some(c => c !== null)) shouldActivate = true;
            } else if (skillAction === 'dark_ritual') {
                if (enemyHP <= enemyMaxHP - 3 || playerHP > 5) shouldActivate = true;
            }

            // 条件を満たしていれば、ほぼ確実に発動
            if (shouldActivate && Math.random() < 0.98) {
                await activateLeaderSkill('red');
                if (isBattleEnded) return;
                await sleep(500);
            }
        }

        // 思考ルーチン: 1枚だけ最適なカードを選ぶ
        if (enemyHand.length > 0) {
            const decision = getBestMove(enemyHand, enemyBoard, playerBoard);

            if (decision.bestCardIndex !== -1 && decision.bestLane !== -1 && (decision.bestScore > 500 || decision.totalDamageBefore >= 4)) {
                if (decision.bestIsOverwrite) {
                    const oldCard = enemyBoard[decision.bestLane];
                    discardCard('red', oldCard, decision.bestLane);
                }
                await playCard('red', decision.bestCardIndex, decision.bestLane);
                await sleep(600);
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
 * トークンや分身などの追加配置用の最適レーン評価
 */
function evaluateBestLanesForToken(allLanes, owner, tokenCard, count, isLeaderSkill = false) {
    if (owner === 'blue') {
        const shuffled = [...allLanes].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    const results = [];
    let tempBoard = [...enemyBoard];

    for (let k = 0; k < count; k++) {
        let bestScore = -999999;
        let bestLane = -1;

        // 手札からの配置と同様、空きレーンがあればそこを優先、無ければ全レーンを対象にする
        const lanesToEvaluate = allLanes.filter(l => !results.includes(l));

        for (let l of lanesToEvaluate) {
            let score = calculateScoreForPlacement(tokenCard, l, tempBoard, playerBoard, -1, isLeaderSkill);

            // 動的な上書きペナルティ: 失うカードのパワー + 機会コスト(2000)
            if (tempBoard[l] !== null) {
                const myCP = tempBoard[l].currentPower !== undefined ? tempBoard[l].currentPower : (tempBoard[l].power || 0);
                score -= (myCP * 100 + 2000);
            }

            if (score > bestScore) {
                bestScore = score;
                bestLane = l;
            }
        }

        if (bestLane !== -1) {
            results.push(bestLane);
            tempBoard[bestLane] = tokenCard;
        }
    }
    return results;
}

/**
 * 特定の配置におけるボード全体の被ダメージを計算する
 */
function calculateTotalIncomingDamage(myBoard, opBoard, extraHits = [0, 0, 0]) {
    let total = 0;
    for (let i = 0; i < 3; i++) {
        const pCard = opBoard[i];
        if (!pCard) continue;

        let dmg = 0;
        const myCard = myBoard[i];
        if (!myCard) {
            dmg = pCard.currentPower || pCard.power || 0;
        } else {
            let effAtk = pCard.currentPower || pCard.power || 0;
            const myCP = myCard.currentPower !== undefined ? myCard.currentPower : (myCard.power || 0);
            if (hasSkill(myCard, 'sturdy')) effAtk = Math.floor(effAtk / 2);
            if (effAtk > myCP && !hasSkill(myCard, 'deadly')) {
                dmg = effAtk - myCP;
            }
        }
        // スキル（狙撃・拡散）によるダメージ加算を考慮
        let finalDmg = Math.max(0, dmg - extraHits[i]);
        total += finalDmg;
    }
    return total;
}

/**
 * 盤面状況に基づきスコアを計算する共通関数
 */
function calculateScoreForPlacement(card, l, myBoard, opBoard, lethalLane = -1, isLeaderSkill = false) {
    if (hasSkill(card, 'legendary') && l !== 1) return -1000000;

    let score = 0;

    // 手札に伝説(Rarity 3)がある場合、リーダースキルの召喚時は中央を空ける（予約）
    if (l === 1 && !hasSkill(card, 'legendary') && isLeaderSkill) {
        if (enemyHand.some(c => hasSkill(c, 'legendary') || (c.rarity === 3))) {
            score -= 20000;
        }
    }

    const targetEnemyCard = opBoard[l];
    if (hasSkill(card, 'quick') && targetEnemyCard && hasSkill(targetEnemyCard, 'invincible') && lethalLane === -1) return -500000;

    let simPower = card.currentPower !== undefined ? card.currentPower : (card.power || 0);
    let pDmgToEnemy = [0, 0, 0]; // 自分が相手に与えるスキルダメージ

    // スキル効果の計算
    if (hasSkill(card, 'lone_wolf')) {
        const emptyCount = myBoard.filter((c, j) => j !== l && c === null).length;
        simPower += emptyCount * (getSkillValue(card, 'lone_wolf') || 3);
    }
    if (hasSkill(card, 'hero')) {
        const filledCount = myBoard.filter((c, j) => (j !== l && c !== null) || j === l).length;
        simPower += filledCount * (getSkillValue(card, 'hero') || 3);
    }
    if (hasSkill(card, 'support')) {
        const val = getSkillValue(card, 'support') || 2;
        [l - 1, l + 1].forEach(j => {
            if (j >= 0 && j < 3 && myBoard[j]) {
                const ally = myBoard[j]; const opponent = opBoard[j];
                const allyCP = ally.currentPower !== undefined ? ally.currentPower : (ally.power || 0);
                const opCP = (opponent && opponent.currentPower !== undefined) ? opponent.currentPower : (opponent ? opponent.power : 0);
                score += (val * 500); // 基礎加点
                if (opponent) {
                    if (allyCP < opCP && (allyCP + val) >= opCP) score += 3000; // 逆転勝利ボーナス
                } else {
                    score += 500; // 敵がいないレーンの味方強化（リーサル短縮）
                }
            }
        });
    }
    if (hasSkill(card, 'berserk')) {
        const val = getSkillValue(card, 'berserk') || 2;
        [l - 1, l + 1].forEach(j => {
            if (j >= 0 && j < 3 && myBoard[j]) {
                const ally = myBoard[j];
                const allyCP = ally.currentPower !== undefined ? ally.currentPower : (ally.power || 0);
                score -= Math.min(allyCP, val) * 1000; // 味方へのダメージは大きな減点
                if (allyCP <= val) score -= 2000; // 破壊してしまう場合はさらに減点
            }
        });
    }
    if (hasSkill(card, 'copy')) {
        const adj = l === 1 ? [0, 2] : [1];
        let total = 0;
        for (let j of adj) {
            if (myBoard[j]) {
                total += (myBoard[j].currentPower !== undefined ? myBoard[j].currentPower : (myBoard[j].power || 0));
            }
        }
        simPower += total;
        score += total * 20;
    }
    if (hasSkill(card, 'charge')) {
        const val = getSkillValue(card, 'charge') || 2;
        score += val * 1000; // SP増加の価値
    }
    if (hasSkill(card, 'heal')) {
        const val = getSkillValue(card, 'heal') || 3;
        const missingHP = (typeof MAX_HP !== 'undefined' ? MAX_HP : 20) - enemyHP;
        score += Math.min(val, missingHP) * 800; // 回復量の価値
    }
    if (hasSkill(card, 'snipe')) {
        let maxL = -1, maxP = -1;
        for (let j = 0; j < 3; j++) {
            if (opBoard[j]) {
                const opCP = opBoard[j].currentPower !== undefined ? opBoard[j].currentPower : (opBoard[j].power || 0);
                if (opCP > maxP) { maxP = opCP; maxL = j; }
            }
        }
        if (maxL !== -1 && !hasSkill(opBoard[maxL], 'invincible')) {
            let dmg = getSkillValue(card, 'snipe') || 4;
            if (hasSkill(opBoard[maxL], 'sturdy')) dmg = Math.floor(dmg / 2);
            pDmgToEnemy[maxL] += dmg;
        }
    }
    if (hasSkill(card, 'spread')) {
        const val = getSkillValue(card, 'spread') || 2;
        let hitCount = 0;
        [l - 1, l, l + 1].forEach(j => {
            if (j >= 0 && j < 3 && opBoard[j] && !hasSkill(opBoard[j], 'invincible')) {
                let dmg = val; if (hasSkill(opBoard[j], 'sturdy')) dmg = Math.floor(dmg / 2);
                pDmgToEnemy[j] += dmg; hitCount++;
                const opCP = opBoard[j].currentPower !== undefined ? opBoard[j].currentPower : (opBoard[j].power || 0);
                if (opCP <= dmg) score += 1500;
            }
        });
        if (hitCount >= 2) score += 1000 * hitCount;
    }
    if (hasSkill(card, 'sacrifice')) {
        const cost = getSkillValue(card, 'sacrifice') || 0;
        if (enemyHP - cost <= 0) score = -9999999;
    }

    // 仮想盤面での被ダメージ計算
    const virtualBoard = [...myBoard];
    virtualBoard[l] = { ...card, currentPower: simPower };
    // スキルで敵を倒せた場合の盤面更新
    const virtualOpBoard = opBoard.map((c, i) => {
        if (!c) return null;
        const cCP = c.currentPower !== undefined ? c.currentPower : (c.power || 0);
        if (cCP <= pDmgToEnemy[i]) return null;
        return { ...c, currentPower: cCP - pDmgToEnemy[i] };
    });

    const totalDmgBefore = calculateTotalIncomingDamage(myBoard, opBoard);
    const totalDmgAfter = calculateTotalIncomingDamage(virtualBoard, virtualOpBoard);

    // 4以上の合計ダメージを回避できた場合、または軽減できた場合にボーナス
    if (totalDmgBefore >= 4 && totalDmgAfter < 4) {
        score += 8000;
    } else if (totalDmgAfter < totalDmgBefore) {
        score += (totalDmgBefore - totalDmgAfter) * 1000;
    }

    // 対面戦闘評価
    if (targetEnemyCard) {
        const pInv = hasSkill(targetEnemyCard, 'invincible');
        const pSturdy = hasSkill(targetEnemyCard, 'sturdy');
        const targetCP = targetEnemyCard.currentPower !== undefined ? targetEnemyCard.currentPower : (targetEnemyCard.power || 0);
        const pLethalGr = hasSkill(targetEnemyCard, 'growth') && (targetCP + getSkillValue(targetEnemyCard, 'growth') <= 0);
        if (pInv) score += 500 + simPower;
        else if (pLethalGr) score += 300 + simPower;
        else {
            let effDmg = simPower; if (pSturdy) effDmg = Math.floor(effDmg / 2);
            const remP = (virtualOpBoard[l] ? virtualOpBoard[l].currentPower : 0);
            if (remP <= 0) score += 2000 + simPower;
            else {
                const isWin = effDmg >= remP || hasSkill(card, 'deadly');
                if (isWin) score += 1000 + (remP * 60) + (simPower * 10);
                else score += 400 + (remP * 30) - (simPower * 5);
            }
        }
    } else {
        score += 1500 + (simPower * 20);
    }

    return score;
}

/**
 * 最善の1手を算出する
 */
function getBestMove(hand, myBoard, opBoard) {
    let bestCardIndex = -1, bestLane = -1, bestScore = -999999, bestIsOverwrite = false;

    const totalDamageBefore = calculateTotalIncomingDamage(myBoard, opBoard);

    // リーサル回避判定
    let lethalLane = -1;
    for (let i = 0; i < 3; i++) {
        const pCard = opBoard[i];
        if (pCard) {
            let dmg = 0;
            const pCP = pCard.currentPower !== undefined ? pCard.currentPower : (pCard.power || 0);
            if (!myBoard[i]) dmg = pCP;
            else {
                let eff = pCP;
                const myCP = myBoard[i].currentPower !== undefined ? myBoard[i].currentPower : (myBoard[i].power || 0);
                if (hasSkill(myBoard[i], 'sturdy')) eff = Math.floor(eff / 2);
                if (eff > myCP && !hasSkill(myBoard[i], 'deadly')) dmg = eff - myCP;
            }
            if (dmg > 0 && enemyHP - dmg <= 0) { lethalLane = i; break; }
        }
    }

    const allLanes = [0, 1, 2];
    // リーサル回避が必要な場合は該当レーンのみ、そうでなければ全レーンを評価
    const lanesToEvaluate = (lethalLane !== -1) ? [lethalLane] : allLanes;

    for (let l of lanesToEvaluate) {
        const isOverwrite = myBoard[l] !== null;
        for (let i = 0; i < hand.length; i++) {
            let score = calculateScoreForPlacement(hand[i], l, myBoard, opBoard, lethalLane);

            // 動的な上書きペナルティ: 失うカードのパワー + 機会コスト(2000)
            if (isOverwrite) {
                const myCP = myBoard[l].currentPower !== undefined ? myBoard[l].currentPower : (myBoard[l].power || 0);
                score -= (myCP * 100 + 2000);
            }
            if (score > bestScore) {
                bestScore = score; bestCardIndex = i; bestLane = l; bestIsOverwrite = isOverwrite;
            }
        }
    }

    return { bestCardIndex, bestLane, bestScore, bestIsOverwrite, lethalLane, totalDamageBefore };
}

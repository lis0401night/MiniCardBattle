/**
 * ミニカードバトル - 敵AIロジック（ノーマル・シミュレーション版）
 */

/**
 * ノーマル以上の意思決定
 * @returns {Object} { index, lane, isOverwrite, useSkill }
 */
function getNormalDecision() {
    return getBestSimulatedMove(enemyHand, enemyBoard, playerBoard, enemyHP, enemySP);
}

/**
 * 全パターンのシミュレーションを行い、最善手を返す
 */
function getBestSimulatedMove(hand, myBoard, opBoard, myHP, mySP) {
    let candidates = [];
    const skill = enemyConfig.leaderSkill;
    const canUseSkill = skill && mySP >= skill.cost && (enemyConfig.id !== 'cthulhu' && enemyConfig.id !== 'cleric');

    const testMoves = (useSkill) => {
        // 1. 各カードを各レーンに置くパターン
        for (let i = 0; i < hand.length; i++) {
            for (let l = 0; l < 3; l++) {
                const card = hand[i];
                if (hasSkill(card, 'legendary') && l !== 1) continue;
                if (hasSkill(card, 'takeover') && myBoard[l] === null) continue;

                const isOverwrite = myBoard[l] !== null;
                let score = simulateAndEvaluate(i, l, hand, myBoard, opBoard, myHP, useSkill, mySP);
                if (isNaN(score)) score = -2000000;
                if (isOverwrite) score -= 0.1;

                candidates.push({ index: i, lane: l, isOverwrite, useSkill, score });
            }
        }
        // 2. 「パス」という選択肢
        let passScore = simulateAndEvaluate(-1, -1, hand, myBoard, opBoard, myHP, useSkill, mySP);
        if (isNaN(passScore)) passScore = -2000000;
        candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill, score: passScore + 0.1 });
    };

    testMoves(false); // スキルを使わないパターン
    if (canUseSkill) testMoves(true); // スキルを使うパターン

    candidates.sort((a, b) => b.score - a.score);
    console.log("AI Candidates (top 3):", candidates.slice(0, 3));
    return candidates[0];
}

/**
 * 仮想盤面でのシミュレーションと評価
 */
function simulateAndEvaluate(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill = false, currentMySP) {
    const simState = simulateMove(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill, currentMySP);
    return evaluateSimulatedState(simState.enemyBoard, simState.playerBoard, simState.enemyHP, simState.enemySP);
}

/**
 * 仮想位置でのシミュレーション実行（状態を返す）
 */
function simulateMove(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill = false, currentMySP) {
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    let simState = {
        playerBoard: currentOpBoard.map(cloneCard),
        enemyBoard: currentMyBoard.map(cloneCard),
        playerHP: playerHP,
        enemyHP: currentMyHP,
        playerSP: playerSP,
        enemySP: currentMySP || 0
    };

    if (useSkill && enemyConfig.leaderSkill) {
        simState.enemySP -= enemyConfig.leaderSkill.cost;
        applyLeaderSkillLogic(simState, 'red', enemyConfig.leaderSkill.action);
    }

    if (handIdx !== -1) {
        const playedCard = cloneCard(hand[handIdx]);
        playedCard.currentPower = playedCard.power;
        simState.enemyBoard[laneIdx] = playedCard;

        let skills = [];
        if (playedCard.skill && playedCard.skill !== 'none') skills.push({ id: playedCard.skill, value: playedCard.skillValue });
        if (Array.isArray(playedCard.skills)) skills = skills.concat(playedCard.skills);

        skills.forEach(sk => {
            applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value);
        });
    }

    applyPassiveSkillLogic(simState, 'blue');
    applyPassiveSkillLogic(simState, 'red');
    calculateCombatPhase(simState, 'blue');
    return simState;
}

/**
 * シミュレーション結果の盤面評価を行う
 */
function evaluateSimulatedState(myBoard, opBoard, myHP, mySP = 0) {
    if (myHP <= 0) return -1000000;

    let score = myHP * 5000;
    score += mySP * 400;

    for (let i = 0; i < 3; i++) {
        if (myBoard[i]) {
            const p = myBoard[i].currentPower;
            score += 2500;
            score += p * 350;
            if (hasSkill(myBoard[i], 'legendary')) score += 3000;
        }
        if (opBoard[i]) {
            const ep = opBoard[i].currentPower;
            score -= 1500;
            score -= ep * 250;
        } else {
            score += 1000;
        }
    }
    return score;
}

/**
 * トークン配置用の評価
 */
function getNormalTokenLanes(allLanes, owner, tokenCard, count, isLeaderSkill = false) {
    const results = [];
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    let currentBoard = enemyBoard.map(cloneCard);

    for (let k = 0; k < count; k++) {
        let bestScore = -Infinity;
        let bestLane = -1;
        const available = allLanes.filter(l => !results.includes(l));

        for (let l of available) {
            const score = simulateAndEvaluateToken(tokenCard, l, currentBoard, playerBoard, enemyHP, enemySP);
            if (!isNaN(score) && score > bestScore) {
                bestScore = score;
                bestLane = l;
            }
        }
        if (bestLane !== -1) {
            results.push(bestLane);
            const t = cloneCard(tokenCard);
            t.currentPower = t.power;
            currentBoard[bestLane] = t;
        }
    }
    return results;
}

function simulateAndEvaluateToken(token, l, board, opBoard, hp, sp) {
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    let simState = {
        playerBoard: opBoard.map(cloneCard),
        enemyBoard: board.map(cloneCard),
        playerHP: playerHP,
        enemyHP: hp,
        playerSP: playerSP,
        enemySP: sp || 0
    };

    const playedToken = cloneCard(token);
    playedToken.currentPower = playedToken.power;
    simState.enemyBoard[l] = playedToken;

    let skills = [];
    if (playedToken.skill && playedToken.skill !== 'none') skills.push({ id: playedToken.skill, value: playedToken.skillValue });
    if (Array.isArray(playedToken.skills)) skills = skills.concat(playedToken.skills);

    skills.forEach(sk => {
        applyActiveSkillLogic(simState, 'red', l, sk.id, sk.value);
    });

    calculateCombatPhase(simState, 'blue');
    return evaluateSimulatedState(simState.enemyBoard, simState.playerBoard, simState.enemyHP, simState.enemySP);
}

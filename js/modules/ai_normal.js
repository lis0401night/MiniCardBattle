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

    // トークン配置の組合せを生成するヘルパー
    const getCombinations = (arr, k) => {
        if (k === 0) return [[]];
        if (arr.length < k) return [];
        let results = [];
        for (let i = 0; i <= arr.length - k; i++) {
            let sub = getCombinations(arr.slice(i + 1), k - 1);
            for (let s of sub) results.push([arr[i], ...s]);
        }
        return results;
    };

    const testMoves = (useSkill) => {
        let tokenLanePatterns = [null]; // スキルを使わない、またはトークン召喚でない場合

        if (useSkill) {
            const action = skill.action;
            if (action === 'holy_march') {
                const emptyLanes = [0, 1, 2].filter(l => myBoard[l] === null);
                tokenLanePatterns = getCombinations(emptyLanes, Math.min(emptyLanes.length, 2));
            } else if (action === 'satan_avatar' || action === 'dragon_summon') {
                const emptyLanes = [0, 1, 2].filter(l => myBoard[l] === null);
                tokenLanePatterns = getCombinations(emptyLanes, Math.min(emptyLanes.length, 1));
            }
        }

        const orders = useSkill ? ['before', 'after'] : ['before'];

        for (let tokenLanes of tokenLanePatterns) {
            for (let order of orders) {
                // 1. 各カードを各レーンに置くパターン
                for (let i = 0; i < hand.length; i++) {
                    for (let l = 0; l < 3; l++) {
                        const card = hand[i];
                        if (hasSkill(card, 'legendary') && l !== 1) continue;
                        if (hasSkill(card, 'takeover') && myBoard[l] === null) continue;

                        // 「スキル先出し」かつ、その場所にトークンが置かれる場合は上書き不可
                        if (useSkill && order === 'before' && tokenLanes && tokenLanes.includes(l)) continue;

                        const isOverwrite = myBoard[l] !== null;
                        let score = simulateAndEvaluate(i, l, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order);
                        if (isNaN(score)) score = -2000000;
                        if (isOverwrite) score -= 0.1;

                        candidates.push({ index: i, lane: l, isOverwrite, useSkill, tokenLanes, skillOrder: order, score });
                    }
                }
                // 2. 「パス」という選択肢
                let passScore = simulateAndEvaluate(-1, -1, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order);
                if (isNaN(passScore)) passScore = -2000000;
                candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill, tokenLanes, skillOrder: order, score: passScore + 0.1 });
            }
        }
    };

    testMoves(false); // スキルを使わないパターン
    if (canUseSkill) testMoves(true); // スキルを使うパターン

    candidates.sort((a, b) => b.score - a.score);
    // スコアが同じならトークンが多い方を少しだけ優先（盤面アドバンテージ）
    candidates.sort((a, b) => {
        if (Math.abs(b.score - a.score) < 0.01) {
            const laneA = a.tokenLanes ? a.tokenLanes.length : 0;
            const laneB = b.tokenLanes ? b.tokenLanes.length : 0;
            return laneB - laneA;
        }
        return b.score - a.score;
    });

    console.log("AI Candidates (top 3):", candidates.slice(0, 3));
    return candidates[0];
}

/**
 * 仮想盤面でのシミュレーションと評価
 */
function simulateAndEvaluate(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill = false, currentMySP, tokenLanes = null) {
    const simState = simulateMove(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill, currentMySP, tokenLanes);
    return evaluateSimulatedState(simState.enemyBoard, simState.playerBoard, simState.enemyHP, simState.enemySP);
}

/**
 * 仮想位置でのシミュレーション実行（状態を返す）
 * 順序は常に リーダースキル -> カード配置
 */
function simulateMove(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill = false, currentMySP, tokenLanes = null) {
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    let simState = {
        playerBoard: currentOpBoard.map(cloneCard),
        enemyBoard: currentMyBoard.map(cloneCard),
        playerHP: playerHP,
        enemyHP: currentMyHP,
        playerSP: playerSP,
        enemySP: currentMySP || 0
    };

    // 1. スキル使用 (常に先出し)
    if (useSkill && enemyConfig.leaderSkill) {
        simState.enemySP -= enemyConfig.leaderSkill.cost;
        applyLeaderSkillLogic(simState, 'red', enemyConfig.leaderSkill.action, tokenLanes);
    }

    // 2. カードをプレイ (1の後の盤面に対して行われるため、召喚時効果がトークンを参照できる)
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

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
                if (enemyBoard.some(c => c === null) || enemyBoard.filter(c => c !== null).length >= 1) shouldActivate = true;
            } else if (skillAction === 'abyss_ritual') {
                if (enemyHand.length >= 2) shouldActivate = true;
            } else if (skillAction === 'targeted_destruction') {
                if (playerBoard.some(c => c !== null)) shouldActivate = true;
            } else if (skillAction === 'dark_ritual') {
                if (enemyHP <= enemyMaxHP - 3 || playerHP > 5) shouldActivate = true;
            }

            if (shouldActivate && Math.random() < 0.98) {
                await activateLeaderSkill('red');
                if (isBattleEnded) return;
                await sleep(500);
            }
        }

        // 思考ルーチン: シミュレーションに基づき最適な手を選ぶ
        if (enemyHand.length > 0 || enemyBoard.some(c => c !== null)) {
            let bestCardIndex = -1;
            let bestLane = -1;
            let bestIsOverwrite = false;

            if (typeof aiLevel !== 'undefined' && aiLevel === 1) {
                // イージー難易度: ランダム配置（既存ロジック維持）
                bestCardIndex = Math.floor(Math.random() * (enemyHand.length + 1)) - 1; // -1はパス
                if (bestCardIndex !== -1) {
                    const emptyLanes = [0, 1, 2].filter(l => enemyBoard[l] === null);
                    if (emptyLanes.length > 0) {
                        bestLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                        bestIsOverwrite = false;
                    } else {
                        bestLane = Math.floor(Math.random() * 3);
                        bestIsOverwrite = true;
                    }
                }
            } else {
                // ノーマル以上: 全パターンシミュレーション
                const decision = getBestSimulatedMove(enemyHand, enemyBoard, playerBoard, enemyHP);
                bestCardIndex = decision.index;
                bestLane = decision.lane;
                bestIsOverwrite = decision.isOverwrite;
            }

            if (bestCardIndex !== -1 && bestLane !== -1) {
                if (bestIsOverwrite) {
                    const oldCard = enemyBoard[bestLane];
                    discardCard('red', oldCard, bestLane);
                }
                await playCard('red', bestCardIndex, bestLane);
                await sleep(600);
            } else {
                // パスを選択した場合
                console.log("AI decided to PASS.");
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
 * 全パターンのシミュレーションを行い、最善手（インデックス、レーン）を返す
 */
function getBestSimulatedMove(hand, myBoard, opBoard, myHP) {
    let candidates = [];

    // 1. 各カードを各レーンに置くパターン
    for (let i = 0; i < hand.length; i++) {
        for (let l = 0; l < 3; l++) {
            const card = hand[i];
            // 伝説(Legendary)の配置制限チェック
            if (hasSkill(card, 'legendary') && l !== 1) continue;
            // 生贄(Takeover)の配置制限チェック: すでにカードがあるレーンのみ配置可能
            if (hasSkill(card, 'takeover') && myBoard[l] === null) continue;

            const isOverwrite = myBoard[l] !== null;
            const score = simulateAndEvaluate(i, l, hand, myBoard, opBoard, myHP);
            candidates.push({ index: i, lane: l, isOverwrite, score });
        }
    }

    // 2. 「何もしない（パス）」という選択肢
    const passScore = simulateAndEvaluate(-1, -1, hand, myBoard, opBoard, myHP);
    candidates.push({ index: -1, lane: -1, isOverwrite: false, score: passScore });

    // スコア順にソート（安定させるためにシャッフル含めるのも手だが、まずは最大値優先）
    candidates.sort((a, b) => b.score - a.score);

    // デバッグ用ログ
    console.log("AI Candidates (top 3):", candidates.slice(0, 3));

    return candidates[0];
}

/**
 * 仮想盤面でのシミュレーションと評価
 */
function simulateAndEvaluate(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP) {
    // 盤面と状態を深くコピー（JSON.parse/stringifyは重いのでシンプルに）
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    let simState = {
        playerBoard: currentOpBoard.map(cloneCard),
        enemyBoard: currentMyBoard.map(cloneCard),
        playerHP: playerHP, // グローバルから取得
        enemyHP: currentMyHP,
        playerSP: playerSP,
        enemySP: enemySP
    };

    // 1. カードプレイの適用
    if (handIdx !== -1) {
        const playedCard = cloneCard(hand[handIdx]);
        playedCard.currentPower = playedCard.power;
        simState.enemyBoard[laneIdx] = playedCard;

        // 配置時スキル(OnPlay)の適用
        let skills = [];
        if (playedCard.skill && playedCard.skill !== 'none') skills.push({ id: playedCard.skill, value: playedCard.skillValue });
        if (Array.isArray(playedCard.skills)) skills = skills.concat(playedCard.skills);

        skills.forEach(sk => {
            applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value);
        });
    }

    // 2. プレイヤー側のターン開始 & 戦闘予測
    // パッシブ効果の適用
    applyPassiveSkillLogic(simState, 'blue');
    applyPassiveSkillLogic(simState, 'red');

    // 戦闘フェーズのシミュレーション（プレイヤーが攻撃側）
    calculateCombatPhase(simState, 'blue');

    // 4. 最終状態の評価
    return evaluateSimulatedState(simState.enemyBoard, simState.playerBoard, simState.enemyHP);
}

/**
 * シミュレーション結果の盤面評価を行う
 */
function evaluateSimulatedState(myBoard, opBoard, myHP) {
    if (myHP <= 0) return -1000000;

    let score = myHP * 5000;

    for (let i = 0; i < 3; i++) {
        if (myBoard[i]) {
            const p = myBoard[i].currentPower;
            score += 2000;
            score += p * 200;
            if (hasSkill(myBoard[i], 'legendary')) score += 5000;
        }
        if (opBoard[i]) {
            const ep = opBoard[i].currentPower;
            score -= 1000;
            score -= ep * 150;
        } else {
            score += 800;
        }
    }
    return score;
}

/**
 * トークン配置用の評価（シミュレーションを流用）
 */
function evaluateBestLanesForToken(allLanes, owner, tokenCard, count, isLeaderSkill = false) {
    if (owner === 'blue') return [...allLanes].sort(() => Math.random() - 0.5).slice(0, count);

    const results = [];
    let currentBoard = [...enemyBoard];

    for (let k = 0; k < count; k++) {
        let bestScore = -Infinity;
        let bestLane = -1;
        const available = allLanes.filter(l => !results.includes(l));

        for (let l of available) {
            const score = simulateAndEvaluateToken(tokenCard, l, currentBoard, playerBoard, enemyHP);
            if (score > bestScore) {
                bestScore = score;
                bestLane = l;
            }
        }
        if (bestLane !== -1) {
            results.push(bestLane);
            currentBoard[bestLane] = tokenCard;
        }
    }
    return results;
}

function simulateAndEvaluateToken(token, l, board, opBoard, hp) {
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    let simState = {
        playerBoard: opBoard.map(cloneCard),
        enemyBoard: board.map(cloneCard),
        playerHP: playerHP,
        enemyHP: hp,
        playerSP: playerSP,
        enemySP: enemySP
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
    return evaluateSimulatedState(simState.enemyBoard, simState.playerBoard, simState.enemyHP);
}


// 既存の判定補助関数などはそのまま利用可能（hasSkill, getSkillValue 等）


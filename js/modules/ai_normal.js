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
                        let simState = simulateMove(i, l, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order);
                        
                        candidates.push({ index: i, lane: l, isOverwrite, useSkill, tokenLanes, skillOrder: order, simState });
                    }
                }
                // 2. 「パス」という選択肢
                let passSimState = simulateMove(-1, -1, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order);
                candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill, tokenLanes, skillOrder: order, simState: passSimState });
            }
        }
    };

    testMoves(false); // スキルを使わないパターン
    if (canUseSkill) testMoves(true); // スキルを使うパターン

    const startHP = myHP;

    candidates.sort((a, b) => {
        const stateA = a.simState;
        const stateB = b.simState;

        // 1. ティア判定 (敗北 > 大ダメージ > 安全)
        const getTier = (state) => {
            if (state.enemyHP <= 0) return 3; // 敗北
            if (state.enemyHP <= startHP - 4) return 2; // 大ダメージ (4以上減少)
            return 1; // 安全 (3以下減少)
        };

        const tierA = getTier(stateA);
        const tierB = getTier(stateB);

        if (tierA !== tierB) return tierA - tierB; // ティアが低い（1に近い）方を優先

        // 2. 勝利判定 (相手HP 0以下は最優先、ティア1内なら勝利を狙う)
        if (stateA.playerHP <= 0 && stateB.playerHP > 0) return -1;
        if (stateB.playerHP <= 0 && stateA.playerHP > 0) return 1;

        // 3. 盤面アドバンテージ (自分のパワー合計 - 相手のパワー合計)
        const getAdvantage = (state) => {
            let myPower = 0;
            let opPower = 0;
            for (let i = 0; i < 3; i++) {
                if (state.enemyBoard[i]) myPower += state.enemyBoard[i].currentPower;
                if (state.playerBoard[i]) opPower += state.playerBoard[i].currentPower;
            }
            return myPower - opPower;
        };

        const advA = getAdvantage(stateA);
        const advB = getAdvantage(stateB);
        if (advA !== advB) return advB - advA;

        // 4. カード枚数
        const getCount = (board) => board.filter(c => c !== null).length;
        const countA = getCount(stateA.enemyBoard);
        const countB = getCount(stateB.enemyBoard);
        if (countA !== countB) return countB - countA;

        return 0;
    });

    console.log("AI Candidates (top 3):", candidates.slice(0, 3).map(c => ({
        index: c.index,
        lane: c.lane,
        hp: c.simState.enemyHP,
        tier: (c.simState.enemyHP <= 0 ? 3 : (c.simState.enemyHP <= startHP - 4 ? 2 : 1))
    })));
    return candidates[0];
}

// 以下の関数は getBestSimulatedMove に統合されました

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

    // AIのターンは「自分の攻撃」が終わった後に回ってくるため、
    // ここから先のイベントは「次のプレイヤー（青）のターン開始」と「プレイヤーの攻撃」である。

    // 3. 次のプレイヤー（青）のターン開始処理（契約ダメージや成長）
    applyPassiveSkillLogic(simState, 'blue'); 
    
    // 自分の攻撃（red）は既に行われているのでここでは計算しない。
    // ただし、AIが出したばかりのカードによる「次のターン以降の脅威」は盤面評価でカバーされる。
    
    // 4. プレイヤーの攻撃
    calculateCombatPhase(simState, 'blue');

    // シミュレーション用のクリーンアップ（Drop増加等は不要なので直接nullにする）
    [simState.playerBoard, simState.enemyBoard].forEach(b => {
        for (let i = 0; i < 3; i++) if (b[i] && b[i].currentPower <= 0) b[i] = null;
    });

    return simState;
}

// 以下の関数は getBestSimulatedMove に統合されました

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
            const simState = simulateAndEvaluateToken(tokenCard, l, currentBoard, playerBoard, enemyHP, enemySP);
            
            // トークン配置は簡易的に「相手HPをどれだけ削れるか」または「盤面パワー」でソート
            let score = (simState.enemyHP > 0 ? 10000 : -10000);
            score -= simState.playerHP * 100;
            for(let i=0; i<3; i++) {
                if(simState.enemyBoard[i]) score += simState.enemyBoard[i].currentPower * 10;
                if(simState.playerBoard[i]) score -= simState.playerBoard[i].currentPower * 10;
            }

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

    // AIのターンは攻撃後なので、次はプレイヤーのターン開始処理と攻撃
    applyPassiveSkillLogic(simState, 'blue');
    calculateCombatPhase(simState, 'blue');

    return simState;
}

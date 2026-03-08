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
            // ① 【共通】次ターンの致命傷（自分への直接攻撃）を防ぐレーンを探す
            let lethalLane = -1;
            let maxIncomingDamage = 0;

            for (let i = 0; i < 3; i++) {
                // 自分のレーンが空き、かつ相手のレーンにカードがある場合
                if (enemyBoard[i] === null && playerBoard[i] !== null) {
                    const pCard = playerBoard[i];
                    // 防衛カードは攻撃しないので除外
                    if (pCard.skill === 'defender') continue;

                    const dmg = pCard.currentPower;
                    // その攻撃で死ぬ、または最も痛い攻撃を防ぐ
                    if (enemyHP - dmg <= 0 && dmg > maxIncomingDamage) {
                        maxIncomingDamage = dmg;
                        lethalLane = i;
                    }
                }
            }

            // ② 致命傷を防げるならそのレーンを、そうでないなら他の戦略的レーンを選ぶ
            if (aiLevel >= 3) {
                // HARD専用：全空きレーンと一手札の組み合わせをシミュレーションする
                let bestCardIndex = 0;
                let bestLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                let bestScore = -9999;

                // 致命傷レーンがある場合は守るレーンを固定
                const lanesToEvaluate = (lethalLane !== -1) ? [lethalLane] : emptyLanes;

                for (let l of lanesToEvaluate) {
                    const targetEnemyCard = playerBoard[l];

                    for (let i = 0; i < enemyHand.length; i++) {
                        const card = enemyHand[i];

                        // 【シミュレーション】
                        let simPower = card.currentPower;
                        let pDmg = [0, 0, 0];

                        if (card.skill === 'lone_wolf') {
                            let emptyCount = 0;
                            for (let j = 0; j < 3; j++) {
                                if (j !== l && enemyBoard[j] === null) {
                                    emptyCount++;
                                }
                            }
                            simPower += emptyCount * 3;
                        } else if (card.skill === 'snipe') {
                            let maxL = -1;
                            let maxP = -1;
                            for (let j = 0; j < 3; j++) {
                                if (playerBoard[j] && playerBoard[j].currentPower > maxP) {
                                    maxP = playerBoard[j].currentPower;
                                    maxL = j;
                                }
                            }
                            if (maxL !== -1) pDmg[maxL] += 4;
                        } else if (card.skill === 'spread') {
                            for (let j = 0; j < 3; j++) {
                                if (playerBoard[j]) pDmg[j] += 2;
                            }
                        }

                        // 【スコア計算】
                        let score = 0;

                        if (targetEnemyCard) {
                            const remainingOpponentPower = targetEnemyCard.currentPower - pDmg[l];

                            if (remainingOpponentPower <= 0) {
                                // スキルだけで正面の敵を倒せる場合は大加点
                                score += 1000 + simPower;
                            } else {
                                // 戦闘が発生する場合
                                const isWin = simPower >= remainingOpponentPower || card.skill === 'deadly';
                                if (isWin) {
                                    score += 500 + simPower; // 勝てるなら高いほど良い
                                    if (simPower === remainingOpponentPower && card.skill !== 'deadly') {
                                        score -= 100; // 相打ちはスコアを下げる
                                    }
                                } else {
                                    // 勝てない場合（無駄死に）は非常に低く評価する
                                    score += simPower - 1000;
                                }
                            }
                        } else {
                            // 正面に敵がいない（安全な空きレーン）場合は実質パワーが高いほど良い
                            // ただし勝てるブロック(500+)よりは低く、無駄死に(-1000)よりは高くする
                            score += 200 + simPower;
                        }

                        // 正面以外のレーンに対するスキルダメージの評価加点
                        for (let j = 0; j < 3; j++) {
                            if (j !== l && playerBoard[j] && pDmg[j] > 0) {
                                if (playerBoard[j].currentPower - pDmg[j] <= 0) {
                                    score += 200; // 他レーンを破壊できたら大きな加点
                                } else {
                                    score += 50;  // 削るだけでも加点
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
                // NORMAL
                if (lethalLane !== -1) {
                    targetLane = lethalLane;
                } else {
                    let maxThreat = -1;
                    for (let i = 0; i < 3; i++) {
                        if (enemyBoard[i] === null && playerBoard[i] !== null && playerBoard[i].currentPower > maxThreat && playerBoard[i].skill !== 'defender') {
                            maxThreat = playerBoard[i].currentPower;
                            targetLane = i;
                        }
                    }
                    if (targetLane === -1) {
                        targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                    }
                }
                // 手札のカード選びは考慮しない（ランダム）
                handIndex = Math.floor(Math.random() * enemyHand.length);
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

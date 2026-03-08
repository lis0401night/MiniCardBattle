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
            if (lethalLane !== -1) {
                targetLane = lethalLane;
            } else {
                // 最も攻撃力が高い相手の正面をブロックする
                let maxThreat = -1;
                for (let i = 0; i < 3; i++) {
                    if (enemyBoard[i] === null && playerBoard[i] !== null && playerBoard[i].currentPower > maxThreat && playerBoard[i].skill !== 'defender') {
                        maxThreat = playerBoard[i].currentPower;
                        targetLane = i;
                    }
                }
                // ブロック対象が無い場合はランダム
                if (targetLane === -1) {
                    targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                }
            }

            // ③ 【HARD専用】手札から最適なカードを選ぶ
            if (aiLevel >= 3) {
                const targetEnemyCard = playerBoard[targetLane];
                let bestCardIndex = 0;

                if (targetEnemyCard) {
                    // 正面に敵がいる場合、それに「勝てる」カード（または相打ち）を優先
                    const reqPower = targetEnemyCard.currentPower;
                    let foundWinCard = false;

                    for (let i = 0; i < enemyHand.length; i++) {
                        const card = enemyHand[i];
                        // 相手以上のパワーがあるか、または必殺（deadly）持ちなら優先
                        if (card.currentPower >= reqPower || card.skill === 'deadly') {
                            if (!foundWinCard || card.currentPower > enemyHand[bestCardIndex].currentPower) {
                                bestCardIndex = i;
                                foundWinCard = true;
                            }
                        }
                    }
                    // 勝てるカードが無ければ、一番パワーが高いカードを出して被害を抑える
                    if (!foundWinCard) {
                        for (let i = 1; i < enemyHand.length; i++) {
                            if (enemyHand[i].power > enemyHand[bestCardIndex].power) {
                                bestCardIndex = i;
                            }
                        }
                    }
                } else {
                    // 正面に敵がいない場合、単純に一番パワーが高いカードを出す
                    for (let i = 1; i < enemyHand.length; i++) {
                        if (enemyHand[i].power > enemyHand[bestCardIndex].power) {
                            bestCardIndex = i;
                        }
                    }
                }
                handIndex = bestCardIndex;
            } else {
                // NORMAL: 手札のカード選びは考慮しない（ランダム）
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

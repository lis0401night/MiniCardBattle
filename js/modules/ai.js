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
    let overwriteMode = false; // 上書きモードフラグ

    if (aiLevel === 1) {
        // EASY: 完全にランダム（空きレーンにランダムな手札）
        const emptyLanes = enemyBoard.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
        if (emptyLanes.length > 0 && enemyHand.length > 0) {
            handIndex = Math.floor(Math.random() * enemyHand.length);
            const card = enemyHand[handIndex];
            if (hasSkill(card, 'legendary')) {
                // 伝説カードなら中央（1）に置く。中央が空いてなければ別のカードを探す
                if (emptyLanes.includes(1)) {
                    targetLane = 1;
                } else {
                    // 中央が空いてないので別の（非伝説）カードを探す
                    const nonLegendaryIndices = enemyHand.map((c, i) => !hasSkill(c, 'legendary') ? i : -1).filter(i => i !== -1);
                    if (nonLegendaryIndices.length > 0) {
                        handIndex = nonLegendaryIndices[Math.floor(Math.random() * nonLegendaryIndices.length)];
                        targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                    } else {
                        // 全て伝説カードで中央が空いてない場合は何もしない
                        handIndex = -1;
                    }
                }
            } else {
                targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
            }
        } else if (emptyLanes.length === 0 && enemyHand.length > 0) {
            // ボード満杯時：手札の最強カードが盤面の最弱カードより強ければ上書き
            let weakestLane = -1, weakestPower = Infinity;
            let strongestHand = -1, strongestPower = -1;
            for (let i = 0; i < 3; i++) {
                if (enemyBoard[i] && enemyBoard[i].currentPower < weakestPower) {
                    weakestPower = enemyBoard[i].currentPower; weakestLane = i;
                }
            }
            for (let i = 0; i < enemyHand.length; i++) {
                if (enemyHand[i].currentPower > strongestPower) {
                    strongestPower = enemyHand[i].currentPower; strongestHand = i;
                }
            }
            if (weakestLane !== -1 && strongestHand !== -1 && strongestPower > weakestPower) {
                // 伝説カードの場合は中央レーンのみ上書き可能
                const card = enemyHand[strongestHand];
                if (hasSkill(card, 'legendary')) {
                    if (weakestLane === 1) {
                        targetLane = weakestLane; handIndex = strongestHand; overwriteMode = true;
                    }
                } else {
                    targetLane = weakestLane; handIndex = strongestHand; overwriteMode = true;
                }
            }
        }
    } else {
        // NORMAL / HARD
        const emptyLanes = enemyBoard.map((c, i) => c === null ? i : -1).filter(i => i !== -1);

        if ((emptyLanes.length > 0 || enemyBoard.every(x => x !== null)) && enemyHand.length > 0) {
            // ① 【共通】リーサル判定（速攻）
            // 相手のHPを0にできる「速攻」カードがあれば最優先で空きレーンに出す
            if (aiLevel >= 2) {
                const availableLanes = emptyLanes.length > 0 ? emptyLanes : [0, 1, 2];
                for (let i = 0; i < enemyHand.length; i++) {
                    const card = enemyHand[i];
                    if (hasSkill(card, 'quick')) {
                        for (let l of availableLanes) {
                            // 伝説カード制限
                            if (hasSkill(card, 'legendary') && l !== 1) continue;
                            if (playerBoard[l] === null && playerHP - card.currentPower <= 0) {
                                if (enemyBoard[l] !== null) {
                                    enemyBoard[l] = null; // 上書き
                                    renderBoard();
                                }
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

            // 評価対象レーン：空きレーンに加え、ボード満杯時は全レーンを考慮
            const allLanes = [0, 1, 2];

            // ② 【共通】次ターンの致命傷（自分への直接攻撃）を防ぐレーンを探す
            // 空きレーンだけでなく、戦闘で負けるレーンも致命傷の候補
            let lethalLane = -1;
            let maxIncomingDamage = 0;

            for (let i = 0; i < 3; i++) {
                if (playerBoard[i] !== null) {
                    const pCard = playerBoard[i];
                    if (hasSkill(pCard, 'defender')) continue;

                    let directDmg = 0;
                    if (enemyBoard[i] === null) {
                        // 空きレーン：相手カードが直接ダメージ
                        directDmg = pCard.currentPower;
                    } else {
                        // 自分のカードがいるレーン：戦闘で負ける場合、残りパワーが直接ダメージ
                        const myCard = enemyBoard[i];
                        if (pCard.currentPower > myCard.currentPower && !hasSkill(myCard, 'deadly')) {
                            directDmg = pCard.currentPower - myCard.currentPower;
                        }
                    }

                    if (directDmg > 0 && enemyHP - directDmg <= 0 && directDmg > maxIncomingDamage) {
                        maxIncomingDamage = directDmg;
                        lethalLane = i;
                    }
                }
            }

            // ③ 戦略的プレイ（HARDとNORMALで分岐）
            if (aiLevel >= 3) {
                // HARD専用：シミュレーションによる最適化
                let bestCardIndex = 0;
                let bestLane = emptyLanes.length > 0 ? emptyLanes[Math.floor(Math.random() * emptyLanes.length)] : -1;
                let bestScore = -9999;
                let bestIsOverwrite = false;

                // 致命傷防御が必要な場合はそのレーンを最優先
                const lanesToEvaluate = (lethalLane !== -1) ? [lethalLane] :
                    (emptyLanes.length > 0 ? emptyLanes : allLanes);

                for (let l of lanesToEvaluate) {
                    const targetEnemyCard = playerBoard[l];
                    const isOverwrite = enemyBoard[l] !== null;

                    for (let i = 0; i < enemyHand.length; i++) {
                        const card = enemyHand[i];

                        // 【制限】伝説カードは中央のみ
                        if (hasSkill(card, 'legendary') && l !== 1) continue;

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
                        }
                        if (hasSkill(card, 'snipe')) {
                            let maxL = -1; let maxP = -1;
                            for (let j = 0; j < 3; j++) {
                                if (playerBoard[j] && playerBoard[j].currentPower > maxP) {
                                    maxP = playerBoard[j].currentPower; maxL = j;
                                }
                            }
                            if (maxL !== -1 && !hasSkill(playerBoard[maxL], 'invincible')) pDmg[maxL] += (getSkillValue(card, 'snipe') || 4);
                        }
                        if (hasSkill(card, 'spread')) {
                            const val = getSkillValue(card, 'spread') || 2;
                            // 正面とその隣接レーンのみ
                            const targets = [l, l - 1, l + 1].filter(j => j >= 0 && j < 3);
                            for (let j of targets) {
                                if (playerBoard[j] && !hasSkill(playerBoard[j], 'invincible')) pDmg[j] += val;
                            }
                        }
                        // 英雄スキル：自身を含む埋まっているレーン数 × value をパワーに加算
                        if (hasSkill(card, 'hero')) {
                            let filledCount = 1; // 自身のレーンを含む
                            for (let j = 0; j < 3; j++) {
                                if (j !== l && enemyBoard[j] !== null) filledCount++;
                            }
                            simPower += filledCount * (getSkillValue(card, 'hero') || 3);
                        }
                        // 援護スキル：隣接する味方カードへのバフをスコアに加算
                        if (hasSkill(card, 'support')) {
                            const supportVal = getSkillValue(card, 'support') || 2;
                            let supportBonus = 0;
                            if (l > 0 && enemyBoard[l - 1] !== null) supportBonus += supportVal;
                            if (l < 2 && enemyBoard[l + 1] !== null) supportBonus += supportVal;
                            simPower += supportBonus; // 味方バフもスコアに反映
                        }

                        // 【スコア計算】
                        let score = 0;

                        if (targetEnemyCard) {
                            if (hasSkill(targetEnemyCard, 'invincible')) {
                                score += 500 + simPower; // 無敵の相手は破壊できない
                            } else {
                                const remainingOpponentPower = targetEnemyCard.currentPower - pDmg[l];
                                if (remainingOpponentPower <= 0) {
                                    score += 2000 + simPower;
                                } else {
                                    const isWin = simPower >= remainingOpponentPower || hasSkill(card, 'deadly');
                                    const selfInv = hasSkill(card, 'stealth') || hasSkill(card, 'invincible');
                                    // 無敵または絶対勝ち
                                    if (isWin || selfInv) {
                                        score += 1000 + (remainingOpponentPower * 50) + simPower;
                                        if (simPower === remainingOpponentPower && !hasSkill(card, 'deadly')) score -= 100;
                                    } else {
                                        score += 500 + (remainingOpponentPower * 40) - (simPower * 10);
                                    }
                                }
                            }
                        } else {
                            score += 200 + simPower;
                        }

                        // 致命傷防御ボーナス
                        if (l === lethalLane && lethalLane !== -1) {
                            score += 3000;
                        }

                        // 正面以外のレーン（スキルダメージ）の評価
                        for (let j = 0; j < 3; j++) {
                            if (j !== l && playerBoard[j] && pDmg[j] > 0) {
                                const remaining = playerBoard[j].currentPower - pDmg[j];
                                if (remaining <= 0) {
                                    score += 800;
                                } else {
                                    score += 100;
                                }
                            }
                        }

                        // 上書きの場合：失う盤面戦力を差し引く
                        if (isOverwrite) {
                            const lostPower = enemyBoard[l].currentPower;
                            score -= lostPower * 80; // パワーを失うペナルティ
                            // 手札カードのパワーが既存カードより低ければ大きなペナルティ
                            if (simPower <= lostPower) {
                                score -= 500;
                            }
                        }

                        if (score > bestScore) {
                            bestScore = score;
                            bestCardIndex = i;
                            bestLane = l;
                            bestIsOverwrite = isOverwrite;
                        }
                    }
                }

                // 上書きはスコアが正の場合（メリットが上回る場合）のみ実行
                if (bestIsOverwrite && bestScore <= 0) {
                    targetLane = -1; handIndex = -1;
                } else {
                    targetLane = bestLane;
                    handIndex = bestCardIndex;
                    overwriteMode = bestIsOverwrite;
                }

            } else {
                // NORMAL：簡易的な判断
                if (emptyLanes.length > 0) {
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
                } else {
                    // ボード満杯時：最弱の自カードと最強の手札を比較
                    let weakestLane = -1, weakestPower = Infinity;
                    let strongestHand = -1, strongestPower = -1;
                    for (let i = 0; i < 3; i++) {
                        if (enemyBoard[i] && enemyBoard[i].currentPower < weakestPower) {
                            weakestPower = enemyBoard[i].currentPower; weakestLane = i;
                        }
                    }
                    for (let i = 0; i < enemyHand.length; i++) {
                        if (enemyHand[i].currentPower > strongestPower) {
                            strongestPower = enemyHand[i].currentPower; strongestHand = i;
                        }
                    }
                    if (weakestLane !== -1 && strongestHand !== -1 && strongestPower > weakestPower + 1) {
                        targetLane = weakestLane; handIndex = strongestHand; overwriteMode = true;
                    }
                }

                // 手札選び（NORMALでも速攻の無駄使いを避ける）
                if (handIndex === -1 && targetLane !== -1) {
                    let bestIdx = -1;
                    for (let i = 0; i < enemyHand.length; i++) {
                        const c = enemyHand[i];
                        if (hasSkill(c, 'quick') && playerBoard[targetLane]) {
                            if (c.currentPower < playerBoard[targetLane].currentPower && !hasSkill(c, 'deadly')) continue;
                        }
                        // 伝説カードの配置制限
                        if (hasSkill(c, 'legendary') && targetLane !== 1) continue;
                        bestIdx = i;
                        break;
                    }
                    handIndex = (bestIdx !== -1) ? bestIdx : Math.floor(Math.random() * enemyHand.length);
                }
            }
        }
    }

    // カードをプレイする
    if (targetLane !== -1 && handIndex !== -1 && enemyHand.length > 0) {
        // 上書きモードの場合、既存カードを破棄
        if (overwriteMode && enemyBoard[targetLane] !== null) {
            enemyBoard[targetLane] = null;
            renderBoard();
        }
        await playCard('red', handIndex, targetLane);
        if (checkWinCondition()) return;
        await sleep(500);
    }

    endTurnLogic('red');
}

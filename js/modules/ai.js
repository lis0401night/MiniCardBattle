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
        // NORMAL (2) / HARD (3): シミュレーションベースの意思決定
        const emptyLanes = enemyBoard.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
        const allLanes = [0, 1, 2];

        // ① リーサル判定（速攻）: 相手のHPを0にできる「速攻」があれば最優先
        const quickLethalLanes = emptyLanes.length > 0 ? emptyLanes : allLanes;
        for (let i = 0; i < enemyHand.length; i++) {
            const card = enemyHand[i];
            if (hasSkill(card, 'quick')) {
                for (let l of quickLethalLanes) {
                    if (hasSkill(card, 'legendary') && l !== 1) continue;
                    // 正面にカードがない場合のみリーサル判定
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

        // ② 次ターンの致命傷（敗北）を回避できるか判定
        let lethalLane = -1;
        let maxIncomingDamage = 0;
        let currentEnemyHP = enemyHP;

        // リーダースキルによる回復や除去の可能性を考慮
        const canHeal = enemyConfig.leaderSkill.action === 'dark_ritual' && enemySP >= (enemyConfig.leaderSkill.cost || 3);
        const virtualHP = canHeal ? currentEnemyHP + 3 : currentEnemyHP;

        for (let i = 0; i < 3; i++) {
            if (playerBoard[i] !== null) {
                const pCard = playerBoard[i];
                if (hasSkill(pCard, 'defender')) continue;

                // 次のターン開始時に負の成長で自壊するカードは脅威から除外
                if (hasSkill(pCard, 'growth')) {
                    const gVal = getSkillValue(pCard, 'growth');
                    if (gVal < 0 && pCard.currentPower + gVal <= 0) continue;
                }

                let directDmg = 0;
                if (enemyBoard[i] === null) {
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

        // ③ シミュレーションによる最適配置の選択
        let bestCardIndex = -1;
        let bestLane = -1;
        let bestScore = -99999;
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
                    let supportBonus = 0;
                    if (l > 0 && enemyBoard[l - 1]) supportBonus += val;
                    if (l < 2 && enemyBoard[l + 1]) supportBonus += val;
                    simPower += supportBonus; // 味方へのバフも自身の価値に加算
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
                    [l - 1, l, l + 1].forEach(j => {
                        if (j >= 0 && j < 3 && playerBoard[j] && !hasSkill(playerBoard[j], 'invincible')) {
                            let dmg = val;
                            if (hasSkill(playerBoard[j], 'sturdy')) dmg = Math.floor(dmg / 2);
                            pDmg[j] += dmg;
                        }
                    });
                }

                // スコア評価
                let score = 0;

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
                    score += 300 + simPower;
                }

                // スキルによる他レーンへの貢献
                for (let j = 0; j < 3; j++) {
                    if (j !== l && playerBoard[j] && pDmg[j] > 0) {
                        if (playerBoard[j].currentPower - pDmg[j] <= 0) score += 1000;
                        else score += pDmg[j] * 50;
                    }
                }

                // 防御・生存評価
                if (l === lethalLane) score += 10000;

                // 自壊リスク（負の成長）
                if (hasSkill(card, 'growth')) {
                    const val = getSkillValue(card, 'growth');
                    if (val < 0 && card.currentPower + val <= 0) score -= 1500;
                }

                // 上書きペナルティ
                if (isOverwrite) {
                    const lostCard = enemyBoard[l];
                    score -= lostCard.currentPower * 100;
                    if (simPower <= lostCard.currentPower) score -= 1000;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestCardIndex = i;
                    bestLane = l;
                    bestIsOverwrite = isOverwrite;
                }
            }
        }

        if (bestCardIndex !== -1 && (bestScore > 0 || lethalLane !== -1)) {
            targetLane = bestLane;
            handIndex = bestCardIndex;
            overwriteMode = bestIsOverwrite;
        }
    }

    // カードをプレイする
    if (targetLane !== -1 && handIndex !== -1 && enemyHand.length > 0) {
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

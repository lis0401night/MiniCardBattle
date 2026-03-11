/**
 * ミニカードバトル - 敵AIロジック（イージー・ランダム版）
 */

/**
 * イージー難易度の意思決定
 * @returns {Object} { index, lane, isOverwrite, useSkill }
 */
function getEasyDecision() {
    // 全ての合法な移動パターンをリストアップ
    const allCandidates = [];
    const handIndices = [...Array(enemyHand.length).keys(), -1]; // 手札インデックス + パス

    for (let idx of handIndices) {
        const card = idx === -1 ? null : enemyHand[idx];
        const possibleLanes = [];

        if (idx === -1) {
            possibleLanes.push(-1);
        } else {
            const emptyLanes = [0, 1, 2].filter(l => enemyBoard[l] === null);
            const occupiedLanes = [0, 1, 2].filter(l => enemyBoard[l] !== null);

            if (hasSkill(card, 'legendary')) {
                possibleLanes.push(1);
            } else if (hasSkill(card, 'takeover')) {
                occupiedLanes.forEach(l => possibleLanes.push(l));
            } else {
                // 空きを優先するが、空きがなければ上書きも候補
                if (emptyLanes.length > 0) {
                    emptyLanes.forEach(l => possibleLanes.push(l));
                } else {
                    [0, 1, 2].forEach(l => possibleLanes.push(l));
                }
            }
        }

        for (let lane of possibleLanes) {
            // シミュレーション実行
            const sim = simulateMove(idx, lane, enemyHand, enemyBoard, playerBoard, enemyHP, false, enemySP);
            allCandidates.push({
                index: idx,
                lane: lane,
                isOverwrite: lane !== -1 && enemyBoard[lane] !== null,
                useSkill: false,
                enemyHP: sim.enemyHP,
                playerHP: sim.playerHP
            });
        }
    }

    // --- 戦略的フィルタリング ---

    // 1. 速攻のリーサル (相手のHPを0にできるなら、それを選択)
    const lethalMoves = allCandidates.filter(c => c.playerHP <= 0);
    if (lethalMoves.length > 0) {
        console.log("Easy AI: Lethal detected!");
        return lethalMoves[Math.floor(Math.random() * lethalMoves.length)];
    }

    // 2. 自滅回避 (自分のHPが0になる移動を除外)
    // ただし、全ての移動が自滅なら仕方ないのでそのまま
    let safeCandidates = allCandidates.filter(c => c.enemyHP > 0);
    if (safeCandidates.length === 0) safeCandidates = allCandidates;

    // 3. リーサル回避 (パスをすると自分が死ぬ場合、生き残れる移動を優先)
    const passMove = safeCandidates.find(c => c.index === -1);
    if (passMove && passMove.enemyHP <= 0) {
        const survivalMoves = safeCandidates.filter(c => c.enemyHP > 0);
        if (survivalMoves.length > 0) {
            console.log("Easy AI: Survival move prioritized!");
            return survivalMoves[Math.floor(Math.random() * survivalMoves.length)];
        }
    }

    // 4. 通常のランダム決定（安全な候補から選択）
    // パスばかりにならないよう、カードが出せるなら少し優先度を上げる（ランダム重み付け）
    const playMoves = safeCandidates.filter(c => c.index !== -1);
    if (playMoves.length > 0 && Math.random() < 0.8) {
        return playMoves[Math.floor(Math.random() * playMoves.length)];
    }

    return safeCandidates[Math.floor(Math.random() * safeCandidates.length)];
}

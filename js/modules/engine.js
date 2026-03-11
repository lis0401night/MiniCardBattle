/**
 * Mini Card Battle - Core Game Engine
 * DOMや演出に依存しない、純粋な状態更新ロジック
 */

/**
 * 配置時スキルの効果を適用する (純粋関数)
 * @param {Object} state { b, eB, pHP, eHP, pSP, eSP, ... }
 * @param {string} owner 'blue' or 'red'
 * @param {number} l lane index
 * @param {string} sid skillId
 * @param {number} val skillValue
 */
function applyActiveSkillLogic(state, owner, l, sid, val) {
    const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
    const eB = owner === 'blue' ? state.enemyBoard : state.playerBoard;
    const c = b[l];
    if (!c) return;

    switch (sid) {
        case 'support':
            const sAdj = l === 1 ? [0, 2] : [1];
            sAdj.forEach(j => { if (b[j]) b[j].currentPower += (val || 2); });
            break;
        case 'hero':
            const occ = b.filter(x => x !== null).length;
            c.currentPower += occ * (val || 3);
            break;
        case 'lone_wolf':
            const empty = b.filter(x => x === null).length;
            c.currentPower += empty * (val || 3);
            break;
        case 'copy':
            const cAdj = l === 1 ? [0, 2] : [1];
            let total = 0; cAdj.forEach(j => { if (b[j]) total += (b[j].currentPower || b[j].power); });
            c.currentPower += total;
            break;
        case 'spread':
            const spVal = val || 2;
            [l - 1, l, l + 1].forEach(j => {
                if (j >= 0 && j < 3 && eB[j]) {
                    let d = spVal; if (hasSkill(eB[j], 'sturdy')) d = Math.floor(d / 2);
                    eB[j].currentPower -= d;
                    if (eB[j].currentPower <= 0) eB[j] = null;
                }
            });
            break;
        case 'snipe':
            const snVal = val || 4;
            let maxL = -1, maxP = -1;
            for (let j = 0; j < 3; j++) {
                if (eB[j]) {
                    const p = eB[j].currentPower;
                    if (p > maxP) { maxP = p; maxL = j; }
                }
            }
            if (maxL !== -1) {
                let d = snVal; if (hasSkill(eB[maxL], 'sturdy')) d = Math.floor(d / 2);
                eB[maxL].currentPower -= d;
                if (eB[maxL].currentPower <= 0) eB[maxL] = null;
            }
            break;
        case 'berserk':
            const bVal = val || 2;
            const bAdj = l === 1 ? [0, 2] : [1];
            bAdj.forEach(j => {
                if (b[j]) {
                    b[j].currentPower -= bVal;
                    if (b[j].currentPower <= 0) b[j] = null;
                }
            });
            break;
        case 'heal':
            if (owner === 'blue') state.playerHP = Math.min(20, state.playerHP + (val || 3));
            else state.enemyHP = Math.min(20, state.enemyHP + (val || 3));
            break;
        case 'sacrifice':
            if (owner === 'blue') state.playerHP -= (val || 3);
            else state.enemyHP -= (val || 3);
            break;
        case 'charge':
            if (owner === 'blue') state.playerSP += (val || 2);
            else state.enemySP += (val || 2);
            break;
        case 'stealth':
        case 'invincible':
            if (!Array.isArray(c.skills)) c.skills = [{ id: 'invincible', value: val || 1 }];
            else c.skills.push({ id: 'invincible', value: val || 1 });
            break;
    }
}

/**
 * 戦闘フェーズの計算 (純粋関数)
 * @param {Object} state
 * @param {string} attackerSide 'blue' or 'red'
 */
function calculateCombatPhase(state, attackerSide) {
    const atkBoard = attackerSide === 'blue' ? state.playerBoard : state.enemyBoard;
    const defBoard = attackerSide === 'blue' ? state.enemyBoard : state.playerBoard;
    let defHP = attackerSide === 'blue' ? state.enemyHP : state.playerHP;

    for (let l = 0; l < 3; l++) {
        const aC = atkBoard[l];
        if (!aC || hasSkill(aC, 'defender')) continue;

        let dLane = l;
        // 守護チェック
        let dg = (l === 1) ? (hasSkill(defBoard[0], 'guardian') ? 0 : (hasSkill(defBoard[2], 'guardian') ? 2 : null)) : (l === 0 ? (hasSkill(defBoard[1], 'guardian') ? 1 : null) : (hasSkill(defBoard[1], 'guardian') ? 1 : null));
        if (dg !== null) dLane = dg;

        const dC = defBoard[dLane];
        let aP = aC.currentPower;

        if (dC) {
            let dP = dC.currentPower;
            let dmgToDef = aP;
            let dmgToAtk = dP;

            if (hasSkill(dC, 'sturdy')) dmgToDef = Math.floor(dmgToDef / 2);
            if (hasSkill(aC, 'sturdy')) dmgToAtk = Math.floor(dmgToAtk / 2);
            if (hasSkill(dC, 'invincible')) dmgToDef = 0;
            if (hasSkill(aC, 'invincible')) dmgToAtk = 0;

            dC.currentPower -= dmgToDef;
            aC.currentPower -= dmgToAtk;

            if (dmgToDef > 0 && hasSkill(aC, 'deadly')) dC.currentPower = 0;
            if (dmgToAtk > 0 && hasSkill(dC, 'deadly')) aC.currentPower = 0;

            if (dC.currentPower <= 0) {
                defBoard[dLane] = null;
                if (hasSkill(aC, 'pierce')) defHP -= Math.max(0, aC.currentPower);
            }
            if (aC.currentPower <= 0) atkBoard[l] = null;
        } else {
            defHP -= aP;
        }
    }

    if (attackerSide === 'blue') state.enemyHP = defHP;
    else state.playerHP = defHP;
}

/**
 * ターン開始パッシブの適用
 */
function applyPassiveSkillLogic(state, side) {
    const b = side === 'blue' ? state.playerBoard : state.enemyBoard;
    for (let i = 0; i < 3; i++) {
        const c = b[i];
        if (!c) continue;
        if (hasSkill(c, 'growth')) {
            const v = getSkillValue(c, 'growth') || 1;
            c.currentPower += v;
            if (c.currentPower <= 0) b[i] = null;
        }
    }
}

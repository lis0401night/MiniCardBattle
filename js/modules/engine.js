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
        case 'morph':
            const eH = owner === 'blue' ? state.enemyHand : state.playerHand;
            if (eH && eH.length > 0) {
                const count = val || 1;
                for (let k = 0; k < count; k++) {
                    if (eH.length === 0) break;
                    let maxIdx = -1;
                    let maxP = -1;
                    for (let i = 0; i < eH.length; i++) {
                        if (eH[i].power > maxP) {
                            maxP = eH[i].power;
                            maxIdx = i;
                        }
                    }
                    if (maxIdx !== -1) {
                        // 捨てて虚空を加える
                        const discarded = eH.splice(maxIdx, 1)[0];
                        const eD = owner === 'blue' ? state.enemyDiscard : state.playerDiscard;
                        if (eD) eD.push(discarded);

                        const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
                        // 虚空トークンの追加
                        const voidToken = {
                            ...voidTpl,
                            id: `token_void_${Date.now()}_${k}`,
                            owner: owner === 'blue' ? 'red' : 'blue',
                            currentPower: voidTpl.power,
                            basePower: voidTpl.power,
                        };
                        eH.push(voidToken);
                    }
                }
            }
            break;
        case 'spread':
            const spVal = val || 2;
            [l - 1, l, l + 1].forEach(j => {
                if (j >= 0 && j < 3 && eB[j]) {
                    let d = spVal;
                    eB[j].currentPower -= d;
                }
            });
            break;
        case 'snipe':
            const snVal = val || 4;
            let maxL = -1, maxP = -1;
            for (let j = 0; j < 3; j++) {
                if (eB[j]) {
                    const p = eB[j].currentPower;
                    // 同値の場合は左（jが小さい方）を優先するため、> を使用
                    if (p > maxP) { maxP = p; maxL = j; }
                }
            }
            if (maxL !== -1) {
                let d = snVal;
                eB[maxL].currentPower -= d;
            }
            break;
        case 'berserk':
            const bVal = val || 2;
            const bAdj = l === 1 ? [0, 2] : [1];
            bAdj.forEach(j => {
                if (b[j]) {
                    b[j].currentPower -= bVal;
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
            if (owner === 'blue') state.playerSP = Math.max(0, state.playerSP + (val || 2));
            else state.enemySP = Math.max(0, state.enemySP + (val || 2));
            break;
        case 'quick':
            applySingleCombat(state, owner, l);
            break;
        case 'clone':
            const cloneCount = val || 1;
            const tC = {
                id: 'token_clone',
                name: '分身',
                isToken: true,
                rarity: c.rarity || 1
            };
            // スキルの引き継ぎ（分身以外）
            let inheritedSkills = [];
            if (c.skill && c.skill !== 'clone') inheritedSkills.push({ id: c.skill, value: c.skillValue });
            if (Array.isArray(c.skills)) {
                inheritedSkills = inheritedSkills.concat(c.skills.filter(sk => sk.id !== 'clone'));
            }

            for (let i = 0; i < cloneCount; i++) {
                const emptyLanes = [0, 1, 2].filter(j => b[j] === null);
                if (emptyLanes.length > 0) {
                    const targetLane = emptyLanes[0]; // シミュレーション上は前方優先
                    b[targetLane] = {
                        ...tC,
                        id: `cl_sim_${Date.now()}_${i}`,
                        owner,
                        power: c.power,
                        currentPower: c.currentPower,
                        skills: inheritedSkills
                    };
                }
            }
            break;
        case 'stealth':
        case 'invincible':
            if (!Array.isArray(c.skills)) c.skills = [{ id: 'invincible', value: val || 1 }];
            else c.skills.push({ id: 'invincible', value: val || 1 });
            break;
    }
}

/**
 * リーダースキルの効果を適用する (純粋関数)
 */
function applyLeaderSkillLogic(state, owner, action, tokenLanes = null) {
    const isBlue = owner === 'blue';
    const board = isBlue ? state.playerBoard : state.enemyBoard;
    const eBoard = isBlue ? state.enemyBoard : state.playerBoard;

    if (action === 'annihilation') {
        for (let i = 0; i < 3; i++) {
            if (eBoard[i]) {
                eBoard[i].currentPower -= 4;
            }
        }
    } else if (action === 'satan_avatar' || action === 'dragon_summon') {
        const power = action === 'satan_avatar' ? 10 : 7;
        let l = -1;
        if (tokenLanes && tokenLanes.length > 0) {
            l = tokenLanes[0];
        } else {
            const emptyLanes = [0, 1, 2].filter(i => board[i] === null);
            if (emptyLanes.length > 0) l = emptyLanes[0];
        }

        if (l !== -1) {
            board[l] = { id: `tk_${Date.now()}`, owner, power, currentPower: power };
        }
    } else if (action === 'holy_march') {
        // 騎士召喚（最大2体）
        let count = 0;
        if (tokenLanes && tokenLanes.length > 0) {
            for (let l of tokenLanes) {
                if (board[l] === null) {
                    board[l] = { id: `tk_k_${Date.now()}_${l}`, owner, power: 2, currentPower: 2 };
                    count++;
                }
            }
        } else {
            for (let i = 0; i < 3 && count < 2; i++) {
                if (board[i] === null) {
                    board[i] = { id: `tk_k_${Date.now()}_${i}`, owner, power: 2, currentPower: 2 };
                    count++;
                }
            }
        }
        // 全体バフ+2
        for (let i = 0; i < 3; i++) {
            if (board[i]) {
                board[i].currentPower += 2;
                board[i].power += 2;
            }
        }
    } else if (action === 'dark_ritual') {
        const d = 2;
        if (isBlue) {
            state.enemyHP -= d;
            state.playerHP = Math.min(20, state.playerHP + d);
        } else {
            state.playerHP -= d;
            state.enemyHP = Math.min(20, state.enemyHP + d);
        }
    } else if (action === 'targeted_destruction') {
        let maxL = -1, maxP = -1;
        for (let i = 0; i < 3; i++) {
            if (eBoard[i]) {
                const p = eBoard[i].currentPower;
                // 同値の場合は左（iが小さい方）を優先
                if (p > maxP) {
                    maxP = p;
                    maxL = i;
                }
            }
        }
        if (maxL !== -1) eBoard[maxL].currentPower = 0;
    }
}

/**
 * 戦闘フェーズの計算 (純粋関数)
 * @param {Object} state
 * @param {string} attackerSide 'blue' or 'red'
 */
function calculateCombatPhase(state, attackerSide) {
    for (let l = 0; l < 3; l++) {
        applySingleCombat(state, attackerSide, l);
    }
}

/**
 * 指定した1レーンのみの戦闘計算（Quick等のシミュレーション用）
 */
function applySingleCombat(state, attackerSide, l) {
    const atkBoard = attackerSide === 'blue' ? state.playerBoard : state.enemyBoard;
    const defBoard = attackerSide === 'blue' ? state.enemyBoard : state.playerBoard;
    let defHP = attackerSide === 'blue' ? state.enemyHP : state.playerHP;

    const aC = atkBoard[l];
    if (!aC || hasSkill(aC, 'defender')) return;

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

        // 連撃（ダブルストライク）: 与えるダメージ2倍
        if (hasSkill(aC, 'double_strike')) dmgToDef *= 2;
        if (hasSkill(dC, 'double_strike')) dmgToAtk *= 2;

        dC.currentPower -= dmgToDef;
        aC.currentPower -= dmgToAtk;

        if (dmgToDef > 0 && hasSkill(aC, 'deadly')) dC.currentPower = 0;
        if (dmgToAtk > 0 && hasSkill(dC, 'deadly')) aC.currentPower = 0;

        if (dC.currentPower <= 0) {
            if (hasSkill(aC, 'pierce')) {
                let pDmg = Math.max(0, aC.currentPower);
                if (hasSkill(aC, 'double_strike')) pDmg *= 2;
                defHP -= pDmg;
            }
        }
    } else {
        let finalDmg = aP;
        if (hasSkill(aC, 'double_strike')) finalDmg *= 2;
        defHP -= finalDmg;
    }

    if (attackerSide === 'blue') state.enemyHP = defHP;
    else state.playerHP = defHP;
}

/**
 * ターン開始パッシブの適用
 */
function applyPassiveSkillLogic(state, side, skipContract = false) {
    // シミュレーション用のクリーンアップ
    let anyDestroyed = true;
    while (anyDestroyed) {
        anyDestroyed = false;
        [state.playerBoard, state.enemyBoard].forEach((b, bIdx) => {
            // const currentSide = bIdx === 0 ? 'blue' : 'red'; // Not used, but kept for context if needed
            for (let i = 0; i < 3; i++) {
                if (b[i] && b[i].currentPower <= 0) {
                    const deadCard = b[i];
                    b[i] = null;
                    anyDestroyed = true;
                    // 誘爆チェック
                    if (hasSkill(deadCard, 'explode')) {
                        const val = getSkillValue(deadCard, 'explode') || 3;
                        const adj = i === 1 ? [0, 2] : [1];
                        adj.forEach(j => {
                            if (b[j]) b[j].currentPower -= val;
                        });
                    }
                }
            }
        });
    }

    const b = side === 'blue' ? state.playerBoard : state.enemyBoard;
    for (let i = 0; i < 3; i++) {
        const c = b[i];
        if (!c) continue;
        if (hasSkill(c, 'growth')) {
            const v = getSkillValue(c, 'growth') || 1;
            c.currentPower += v;
        }
        if (hasSkill(c, 'contract') && !skipContract) {
            const v = getSkillValue(c, 'contract') || 3;
            if (side === 'blue') state.playerHP -= v;
            else state.enemyHP -= v;
        }
    }
}

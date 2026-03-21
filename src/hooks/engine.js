import { CARD_MASTER } from '../utils/constants/cards.js';
import { hasSkill, getSkillValue } from '../utils/gameUtils.js';

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
 * @param {Array} events - オプションのイベントログ配列
 * @returns {Array} 発生したイベントログ
 */
export function applyActiveSkillLogic(state, owner, l, sid, val, events = []) {
    const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
    const eB = owner === 'blue' ? state.enemyBoard : state.playerBoard;
    const oppOwner = owner === 'blue' ? 'red' : 'blue';
    const c = b[l];
    if (!c) return events;

    switch (sid) {
        case 'choice':
            // 選択スキル自体は純粋ロジックでは解決できない（上位のシミュレーション層で展開済みのため）
            break;
        case 'support':
            const sAdj = l === 1 ? [0, 2] : [1];
            sAdj.forEach(j => {
                if (b[j]) {
                    const adjVal = val || 2;
                    b[j].currentPower += adjVal;
                    events.push({ type: 'power_change', side: owner, lane: j, amount: adjVal, source: 'support' });
                }
            });
            break;
        case 'hero':
            const occ = b.filter(x => x !== null).length;
            const hVal = occ * (val || 3);
            if (hVal > 0) {
                c.currentPower += hVal;
                events.push({ type: 'power_change', side: owner, lane: l, amount: hVal, source: 'hero' });
            }
            break;
        case 'lone_wolf':
            const empty = b.filter(x => x === null).length;
            const wVal = empty * (val || 3);
            if (wVal > 0) {
                c.currentPower += wVal;
                events.push({ type: 'power_change', side: owner, lane: l, amount: wVal, source: 'lone_wolf' });
            }
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
                        events.push({ type: 'discard', side: oppOwner, card: JSON.parse(JSON.stringify(discarded)) });

                        const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
                        // 虚空トークンの追加
                        const voidToken = {
                            ...voidTpl,
                            id: `token_void_${Date.now()}_${k}`,
                            filter: voidTpl.filter,
                            power: voidTpl.power,
                            currentPower: voidTpl.power,
                            basePower: voidTpl.power,
                            skill: voidTpl.skill || 'none',
                            voiceCategory: voidTpl.voiceCategory || 'undead'
                        };
                        eH.push(voidToken);
                        events.push({ type: 'add_hand', side: oppOwner, card: voidToken, source: 'morph' });
                    }
                }
            }
            break;
        case 'spread':
            const spVal = val || 2;
            [l - 1, l, l + 1].forEach(j => {
                if (j >= 0 && j < 3 && eB[j]) {
                    if (!hasSkill(eB[j], 'invincible')) {
                        let d = spVal;
                        eB[j].currentPower -= d;
                        events.push({ type: 'damage_card', side: oppOwner, lane: j, amount: d, source: 'spread' });
                    }
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
                if (!hasSkill(eB[maxL], 'invincible')) {
                    let d = snVal;
                    eB[maxL].currentPower -= d;
                    events.push({ type: 'damage_card', side: oppOwner, lane: maxL, amount: d, source: 'snipe' });
                }
            }
            break;
        case 'berserk':
            const bVal = val || 2;
            const bAdj = l === 1 ? [0, 2] : [1];
            bAdj.forEach(j => {
                if (b[j]) {
                    if (!hasSkill(b[j], 'invincible')) {
                        b[j].currentPower -= bVal;
                        events.push({ type: 'damage_card', side: owner, lane: j, amount: bVal, source: 'berserk' });
                    }
                }
            });
            break;
        case 'heal':
            const hAmt = val || 3;
            if (owner === 'blue') state.playerHP = Math.min(20, state.playerHP + hAmt);
            else state.enemyHP = Math.min(20, state.enemyHP + hAmt);
            events.push({ type: 'heal_player', side: owner, amount: hAmt });
            break;
        case 'sacrifice':
            const sacAmt = val || 3;
            if (owner === 'blue') state.playerHP -= sacAmt;
            else state.enemyHP -= sacAmt;
            events.push({ type: 'damage_player', side: owner, amount: sacAmt, source: 'sacrifice' });
            break;
        case 'charge':
            const chgAmt = val || 2;
            if (owner === 'blue') state.playerSP = Math.max(0, state.playerSP + chgAmt);
            else state.enemySP = Math.max(0, state.enemySP + chgAmt);
            events.push({ type: 'charge_sp', side: owner, amount: chgAmt });
            break;
        case 'quick':
            applySingleCombat(state, owner, l, events);
            break;
        case 'clone':
            const cloneCount = val || 1;
            const tC = {
                id: 'token_clone',
                name: '分身',
                isToken: true,
                rarity: c.rarity || 1,
                voiceCategory: c.voiceCategory || 'sword'
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
                    const newToken = {
                        ...tC,
                        id: `cl_sim_${Date.now()}_${i}`,
                        owner,
                        isPremium: c.isPremium,
                        imgUrl: c.imgUrl, // シミュ内では元の情報を保持していればOK (UI表示は後で行われる)
                        rarity: c.rarity || 1,
                        basePower: c.power,
                        skills: JSON.parse(JSON.stringify(inheritedSkills)),
                        voiceCategory: c.voiceCategory || 'sword'
                    };
                    b[targetLane] = newToken;
                    events.push({ type: 'summon_token', side: owner, lane: targetLane, card: newToken, source: 'clone' });
                }
            }
            break;
        case 'resurrect':
            const maxPow = val || 1;
            const discard = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
            const validCards = discard.filter(card => (card.power || 0) <= maxPow && !card.isToken);
            if (validCards.length > 0) {
                const sorted = [...validCards].sort((a, b) => b.power - a.power);
                const selectedCard = sorted[0];
                const emptyLanes = [0, 1, 2].filter(j => b[j] === null);
                if (emptyLanes.length > 0) {
                    const targetLane = emptyLanes[0]; // シミュレーション上は前方優先
                    const resurrectedCard = { ...selectedCard, id: `res_sim_${Date.now()}` };
                    resurrectedCard.currentPower = resurrectedCard.power;
                    resurrectedCard.skillTriggered = true; // 召喚効果は連鎖しない想定
                    resurrectedCard.stunTurns = 0;
                    b[targetLane] = resurrectedCard;

                    const eD = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
                    const removeIdx = eD.findIndex(x => x.id === selectedCard.id);
                    if (removeIdx !== -1) eD.splice(removeIdx, 1);

                    events.push({ type: 'summon_card', side: owner, lane: targetLane, card: resurrectedCard, source: 'resurrect' });
                }
            }
            break;
        case 'stealth':
        case 'invincible':
            if (!Array.isArray(c.skills)) c.skills = [{ id: 'invincible', value: val || 1 }];
            else c.skills.push({ id: 'invincible', value: val || 1 });
            events.push({ type: 'add_skill', side: owner, lane: l, skillId: 'invincible', value: val || 1 });
            break;
    }

    let destroyed = [];
    for (let i = 0; i < 3; i++) {
        if (state.playerBoard[i] && state.playerBoard[i].currentPower <= 0) {
            destroyed.push({ side: 'blue', lane: i, card: state.playerBoard[i] });
            state.playerBoard[i] = null;
        }
        if (state.enemyBoard[i] && state.enemyBoard[i].currentPower <= 0) {
            destroyed.push({ side: 'red', lane: i, card: state.enemyBoard[i] });
            state.enemyBoard[i] = null;
        }
    }
    if (destroyed.length > 0) events.push({ type: 'destroy_cards', targets: destroyed });

    return events;
}

/**
 * リーダースキルの効果を適用する (純粋関数)
 * @returns {Array} events
 */
export function applyLeaderSkillLogic(state, owner, action, tokenLanes = null, events = []) {
    const isBlue = owner === 'blue';
    const board = isBlue ? state.playerBoard : state.enemyBoard;
    const eBoard = isBlue ? state.enemyBoard : state.playerBoard;
    const oppOwner = isBlue ? 'red' : 'blue';

    if (action === 'annihilation') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
        for (let i = 0; i < 3; i++) {
            if (eBoard[i]) {
                eBoard[i].currentPower -= 4;
                events.push({ type: 'damage_card', side: oppOwner, lane: i, amount: 4, source: 'annihilation' });
            }
        }
    } else if (action === 'devilhunter_resurrect') {
        const discard = isBlue ? state.playerDiscard : state.enemyDiscard;
        const validCards = discard.filter(card => (card.power || 0) <= 10 && !card.isToken);
        if (validCards.length > 0) {
            const sorted = [...validCards].sort((a, b) => b.power - a.power);
            const selectedCard = sorted[0];
            let l = -1;
            if (tokenLanes && tokenLanes.length > 0) {
                l = tokenLanes[0];
            } else {
                const emptyLanes = [0, 1, 2].filter(i => board[i] === null);
                if (emptyLanes.length > 0) l = emptyLanes[0];
            }
            if (l !== -1) {
                events.push({ type: 'leader_skill', skill: action, side: owner });
                const resurrectedCard = { ...selectedCard, id: `res_sim_${Date.now()}` };
                resurrectedCard.currentPower = resurrectedCard.power;
                resurrectedCard.skillTriggered = true;
                resurrectedCard.stunTurns = 0;
                board[l] = resurrectedCard;

                const removeIdx = discard.findIndex(x => x.id === selectedCard.id);
                if (removeIdx !== -1) discard.splice(removeIdx, 1);

                events.push({ type: 'summon_card', side: owner, lane: l, card: resurrectedCard, source: 'devilhunter_resurrect' });
            }
        }
    } else if (action === 'satan_avatar' || action === 'dragon_summon' || action === 'dungeon_summon_leader') {
        let power = 5;
        if (action === 'satan_avatar') power = 10;
        else if (action === 'dragon_summon') power = 7;
        else if (action === 'dungeon_summon_leader') power = 6; // 一般的なリーダーを想定した強めの仮パワー設定

        let l = -1;
        if (tokenLanes && tokenLanes.length > 0) {
            l = tokenLanes[0];
        } else {
            const emptyLanes = [0, 1, 2].filter(i => board[i] === null);
            if (emptyLanes.length > 0) l = emptyLanes[0];
        }

        if (l !== -1) {
            events.push({ type: 'leader_skill', skill: action, side: owner });
            const tM = CARD_MASTER.find(m => m.id === (action === 'satan_avatar' ? 'token_satan' : 'token_ignis'));
            const newToken = { id: `tk_${Date.now()}`, owner, ...tM, currentPower: power, rarity: tM.rarity || 1 };
            if (action === 'satan_avatar') newToken.imgUrl = 'assets/cards/card_token_satan.jpg';
            else newToken.imgUrl = 'assets/cards/card_token_dragon.jpg';

            board[l] = newToken;
            events.push({ type: 'summon_token', side: owner, lane: l, card: newToken, source: action });
        }
    } else if (action === 'holy_march') {
        // 騎士召喚（最大2体）
        events.push({ type: 'leader_skill', skill: action, side: owner });
        let count = 0;
        const addKnight = (lane) => {
            const tK = CARD_MASTER.find(m => m.id === 'token_knight');
            const tk = { id: `tk_k_${Date.now()}_${lane}`, owner, ...tK, currentPower: tK.power, rarity: tK.rarity || 1, imgUrl: 'assets/cards/card_token_knight.jpg' };
            board[lane] = tk;
            events.push({ type: 'summon_token', side: owner, lane, card: tk, source: 'holy_march' });
            count++;
        };

        if (tokenLanes && tokenLanes.length > 0) {
            for (let l of tokenLanes) {
                if (board[l] === null) addKnight(l);
            }
        } else {
            for (let i = 0; i < 3 && count < 2; i++) {
                if (board[i] === null) addKnight(i);
            }
        }
        // 全体バフ+2
        for (let i = 0; i < 3; i++) {
            if (board[i]) {
                board[i].currentPower += 2;
                board[i].power += 2;
                events.push({ type: 'power_change', side: owner, lane: i, amount: 2, source: 'holy_march' });
            }
        }
    } else if (action === 'dark_ritual') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
        const d = 2;
        if (isBlue) {
            state.enemyHP -= d;
            state.playerHP = Math.min(20, state.playerHP + d);
        } else {
            state.playerHP -= d;
            state.enemyHP = Math.min(20, state.enemyHP + d);
        }
        events.push({ type: 'damage_player', side: oppOwner, amount: d, source: 'dark_ritual' });
        events.push({ type: 'heal_player', side: owner, amount: d, source: 'dark_ritual' });
    } else if (action === 'targeted_destruction') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
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
        if (maxL !== -1) {
            eBoard[maxL].currentPower = 0;
            events.push({ type: 'deadly', side: oppOwner, lane: maxL, source: 'targeted_destruction' });
        }
    }

    let destroyed = [];
    for (let i = 0; i < 3; i++) {
        if (state.playerBoard[i] && state.playerBoard[i].currentPower <= 0) {
            destroyed.push({ side: 'blue', lane: i, card: state.playerBoard[i] });
            state.playerBoard[i] = null;
        }
        if (state.enemyBoard[i] && state.enemyBoard[i].currentPower <= 0) {
            destroyed.push({ side: 'red', lane: i, card: state.enemyBoard[i] });
            state.enemyBoard[i] = null;
        }
    }
    if (destroyed.length > 0) events.push({ type: 'destroy_cards', targets: destroyed });

    return events;
}

/**
 * 戦闘フェーズの計算 (純粋関数)
 * @param {Object} state
 * @param {string} attackerSide 'blue' or 'red'
 * @param {Array} events - オプションのイベントログ配列
 * @returns {Array} 発生したイベントログ
 */
export function calculateCombatPhase(state, attackerSide, events = []) {
    for (let l = 0; l < 3; l++) {
        applySingleCombat(state, attackerSide, l, events);
    }
    return events;
}

/**
 * 指定した1レーンのみの戦闘計算（Quick等のシミュレーション用）
 * @returns {Array} events
 */
export function applySingleCombat(state, attackerSide, l, events = []) {
    const atkBoard = attackerSide === 'blue' ? state.playerBoard : state.enemyBoard;
    const defBoard = attackerSide === 'blue' ? state.enemyBoard : state.playerBoard;
    let defHP = attackerSide === 'blue' ? state.enemyHP : state.playerHP;
    const defSide = attackerSide === 'blue' ? 'red' : 'blue';

    const aC = atkBoard[l];
    if (!aC || hasSkill(aC, 'defender')) return events;

    let dLane = l;
    // 守護チェック
    let dg = (l === 1) ? (hasSkill(defBoard[0], 'guardian') ? 0 : (hasSkill(defBoard[2], 'guardian') ? 2 : null)) : (l === 0 ? (hasSkill(defBoard[1], 'guardian') ? 1 : null) : (hasSkill(defBoard[1], 'guardian') ? 1 : null));
    if (dg !== null) dLane = dg;

    const dC = defBoard[dLane];
    let aP = aC.currentPower;

    events.push({ type: 'attack', attackerSide, lane: l, targetLane: dLane });

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

        const originalTarget = defBoard[l];
        const isOriginalTargetDefender = originalTarget && hasSkill(originalTarget, 'defender');

        if (dmgToDef > 0) events.push({ type: 'damage_card', side: defSide, lane: dLane, amount: dmgToDef });
        if (!isOriginalTargetDefender && dmgToAtk > 0) events.push({ type: 'damage_card', side: attackerSide, lane: l, amount: dmgToAtk });

        dC.currentPower -= dmgToDef;
        if (!isOriginalTargetDefender) aC.currentPower -= dmgToAtk;

        if (dmgToDef > 0 && hasSkill(aC, 'deadly')) {
            dC.currentPower = 0;
            events.push({ type: 'deadly', side: defSide, lane: dLane });
        }
        if (dmgToAtk > 0 && hasSkill(dC, 'deadly')) {
            aC.currentPower = 0;
            events.push({ type: 'deadly', side: attackerSide, lane: l });
        }

        if (dC.currentPower <= 0) {
            if (hasSkill(aC, 'pierce')) {
                let pDmg = Math.max(0, aC.currentPower);
                if (hasSkill(aC, 'double_strike')) pDmg *= 2;
                defHP -= pDmg;
                if (pDmg > 0) events.push({ type: 'damage_player', side: defSide, amount: pDmg, source: 'pierce' });
            }
        }

        // 魂縛
        let aD = aC.currentPower <= 0, dD = dC.currentPower <= 0;
        if (dD && !aD && hasSkill(aC, 'soul_bind')) {
            const val = getSkillValue(aC, 'soul_bind') || 2;
            aC.currentPower += val;
            events.push({ type: 'power_change', side: attackerSide, lane: l, amount: val, source: 'soul_bind' });
        }
        if (aD && !dD && hasSkill(dC, 'soul_bind')) {
            const val = getSkillValue(dC, 'soul_bind') || 2;
            dC.currentPower += val;
            events.push({ type: 'power_change', side: defSide, lane: dLane, amount: val, source: 'soul_bind' });
        }
    } else {
        let finalDmg = aP;
        if (hasSkill(aC, 'double_strike')) finalDmg *= 2;
        defHP -= finalDmg;
        events.push({ type: 'damage_player', side: defSide, amount: finalDmg, source: 'direct_attack' });
    }

    if (attackerSide === 'blue') state.enemyHP = defHP;
    else state.playerHP = defHP;

    let anyDestroyed = true;
    while (anyDestroyed) {
        anyDestroyed = false;
        let destroyedThisLoop = [];
        [state.playerBoard, state.enemyBoard].forEach((b, bIdx) => {
            const boardSide = bIdx === 0 ? 'blue' : 'red';
            const oppSide = bIdx === 0 ? 'red' : 'blue';
            for (let i = 0; i < 3; i++) {
                if (b[i] && b[i].currentPower <= 0) {
                    const deadCard = b[i];
                    destroyedThisLoop.push({ side: boardSide, lane: i, card: deadCard });
                    b[i] = null;
                    anyDestroyed = true;

                    if (hasSkill(deadCard, 'explode')) {
                        const dmg = getSkillValue(deadCard, 'explode') || 2;
                        [i - 1, i + 1].forEach(adj => {
                            if (adj >= 0 && adj < 3) {
                                if (state.playerBoard[adj] && !hasSkill(state.playerBoard[adj], 'invincible')) {
                                    state.playerBoard[adj].currentPower -= dmg;
                                    events.push({ type: 'damage_card', side: 'blue', lane: adj, amount: dmg, source: 'explode' });
                                }
                                if (state.enemyBoard[adj] && !hasSkill(state.enemyBoard[adj], 'invincible')) {
                                    state.enemyBoard[adj].currentPower -= dmg;
                                    events.push({ type: 'damage_card', side: 'red', lane: adj, amount: dmg, source: 'explode' });
                                }
                            }
                        });
                    }
                }
            }
        });

        if (destroyedThisLoop.length > 0) {
            events.push({ type: 'destroy_cards', targets: destroyedThisLoop });
        }
    }

    return events;
}

/**
 * ターン開始パッシブの適用
 * @returns {Array} events
 */
export function applyPassiveSkillLogic(state, side, skipContract = false, events = []) {
    // シミュレーション用のクリーンアップと誘爆の処理
    let anyDestroyed = true;
    while (anyDestroyed) {
        anyDestroyed = false;
        let destroyedThisLoop = [];
        [state.playerBoard, state.enemyBoard].forEach((b, bIdx) => {
            const boardSide = bIdx === 0 ? 'blue' : 'red';
            const oppSide = bIdx === 0 ? 'red' : 'blue';
            for (let i = 0; i < 3; i++) {
                if (b[i] && b[i].currentPower <= 0) {
                    const deadCard = b[i];
                    destroyedThisLoop.push({ side: boardSide, lane: i, card: deadCard });
                    b[i] = null;
                    anyDestroyed = true;
                    // 誘爆チェック
                    if (hasSkill(deadCard, 'explode')) {
                        const val = getSkillValue(deadCard, 'explode') || 3;
                        const adj = i === 1 ? [0, 2] : [1];
                        adj.forEach(j => {
                            if (b[j] && !hasSkill(b[j], 'invincible')) {
                                b[j].currentPower -= val;
                                events.push({ type: 'damage_card', side: boardSide, lane: j, amount: val, source: 'explode' });
                            }
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
            events.push({ type: 'power_change', side, lane: i, amount: v, source: 'growth' });
        }
        if (hasSkill(c, 'contract') && !skipContract) {
            const v = getSkillValue(c, 'contract') || 3;
            if (side === 'blue') state.playerHP -= v;
            else state.enemyHP -= v;
            events.push({ type: 'damage_player', side, amount: v, source: 'contract' });
        }
    }

    return events;
}

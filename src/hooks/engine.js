import { CARD_MASTER } from '../utils/constants/cards.js';
import { getSeededRandom } from '../utils/gameUtils.js';
import { hasSkill, getSkillValue, unmergeCardSkills } from '../utils/gameUtils.js';

/**
 * Mini Card Battle - Core Game Engine
 * DOMや演出に依存しない、純粋な状態更新ロジック
 */

/**
 * 破壊されたカードのクリーンアップと、破壊時スキルの処理を行う共通関数
 */
export function processDestructionTriggers(state, events) {
    let anyDestroyedAtAll = false;
    let anyDestroyed = true;
    while (anyDestroyed) {
        anyDestroyed = false;
        let destroyedThisLoop = [];
        let tokensToSummonThisLoop = [];
        const targets = [
            { board: state.playerBoard, side: 'blue', oppSide: 'red' },
            { board: state.enemyBoard, side: 'red', oppSide: 'blue' }
        ];

        targets.forEach(({ board, side, oppSide }) => {
            for (let i = 0; i < 3; i++) {
                if (board[i] && board[i].currentPower <= 0) {
                    const deadCard = board[i];
                    destroyedThisLoop.push({ side, lane: i, card: deadCard });
                    board[i] = null;
                    anyDestroyed = true;
                    anyDestroyedAtAll = true;

                    // 分裂(split)
                    if (hasSkill(deadCard, 'split')) {
                        const tokenMap = { 'bird': 'token_ent', 'octopus': 'legs', 'phoenix': 'token_phoenix' };
                        let baseId = deadCard.baseId || deadCard.id;
                        if (baseId && baseId.includes('_') && !baseId.startsWith('token_')) {
                            const master = CARD_MASTER.find(c => c.name === deadCard.name);
                            if (master) baseId = master.id;
                        }
                        const tokenId = tokenMap[baseId] || 'legs';
                        const tL = CARD_MASTER.find(m => m.id === tokenId) || { name: 'トークン', power: 1 };
                        const val = getSkillValue(deadCard, 'split') || tL.power || 2;
                        
                        tokensToSummonThisLoop.push({
                            side,
                            lane: i,
                            card: {
                                id: `sp_${Math.floor(getSeededRandom() * 1000000000)}_${i}_${getSeededRandom().toString(36).substr(2, 5)}`,
                                owner: side,
                                ...tL,
                                imgUrl: `assets/cards/card_${tokenId}.jpg`,
                                power: val,
                                currentPower: val,
                                basePower: val,
                                rarity: tL.rarity || 1
                            }
                        });
                    }

                    // 誘爆(explode)
                    if (hasSkill(deadCard, 'explode')) {
                        const dmg = getSkillValue(deadCard, 'explode') || 3;
                        [i - 1, i + 1].forEach(adj => {
                            if (adj >= 0 && adj < 3 && board[adj]) {
                                if (!hasSkill(board[adj], 'immune')) {
                                    board[adj].currentPower -= dmg;
                                    events.push({ type: 'damage_card', side, lane: adj, amount: dmg, source: 'explode' });
                                } else {
                                    events.push({ type: 'immune_block', side, lane: adj, source: 'explode' });
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
        tokensToSummonThisLoop.forEach(t => {
            const tgtBoard = t.side === 'blue' ? state.playerBoard : state.enemyBoard;
            if (!tgtBoard[t.lane]) {
                tgtBoard[t.lane] = t.card;
                events.push({ type: 'summon_token', side: t.side, lane: t.lane, card: JSON.parse(JSON.stringify(t.card)), source: 'split' });
            }
        });
    }
    return anyDestroyedAtAll;
}

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
export function applyActiveSkillLogic(state, owner, l, sid, val, events = [], simulatedTokenLanes = null) {
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
        case 'replicate': {
            let maxOtherPower = 0;
            b.forEach((x, idx) => {
                if (idx !== l && x !== null) {
                    if (x.currentPower > maxOtherPower) maxOtherPower = x.currentPower;
                }
            });
            if (maxOtherPower > 0) {
                c.currentPower += maxOtherPower;
                events.push({ type: 'power_change', side: owner, lane: l, amount: maxOtherPower, source: 'replicate' });
            }
            break;
        }
        case 'hero':
            const occ = b.filter((x, idx) => x !== null && idx !== l).length;
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
        case 'invade': {
            const discard = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
            const uniqueTypes = new Set((discard || []).map(card => card.baseId || card.id)).size;
            const powerDiff = uniqueTypes;
            if (powerDiff !== 0) {
                c.currentPower += powerDiff;
                events.push({ type: 'power_change', side: owner, lane: l, amount: powerDiff, source: 'invade' });
            }
            break;
        }
        case 'morph':
            const eHandRef = owner === 'blue' ? state.enemyHand : state.playerHand;
            if (eHandRef && eHandRef.length > 0) {
                const count = Number(val) || 1;
                
                // 対象となるカードを抽出し、パワーの降順（同値なら左＝インデックス小が優先）でソート
                const validTargets = eHandRef
                    .map((card, idx) => ({ card, idx }))
                    .sort((a, b) => {
                        const pA = a.card.currentPower ?? a.card.power ?? 0;
                        const pB = b.card.currentPower ?? b.card.power ?? 0;
                        if (pB !== pA) return pB - pA;
                        return a.idx - b.idx; // インデックスが小さい方を優先
                    });

                const actualCount = Math.min(count, validTargets.length);
                const newTokens = [];
                console.log(`[DEBUG] morph executed. val(skillValue): ${val}, count: ${count}, validTargets length: ${validTargets.length}, actualCount: ${actualCount}`);

                for (let i = 0; i < actualCount; i++) {
                    const targetInfo = validTargets[i];
                    // eHandRef から対象カードを探して削除
                    // （※途中で削除するとインデックスがずれるため、一意なプロパティで検索するか、あるいは直接オブジェクト参照で削除する）
                    const removeIdx = eHandRef.findIndex(c => c === targetInfo.card);
                    if (removeIdx !== -1) {
                        const discarded = eHandRef.splice(removeIdx, 1)[0];
                        const eD = owner === 'blue' ? state.enemyDiscard : state.playerDiscard;
                        if (eD && !discarded.isToken) {
                            const masterData = CARD_MASTER.find(m => m.id === (discarded.baseId || discarded.id));
                            if (masterData) {
                                const restoredCard = JSON.parse(JSON.stringify(masterData));
                                restoredCard.uid = discarded.uid;
                                restoredCard.owner = oppOwner;
                                restoredCard.baseId = discarded.baseId || discarded.id;
                                if (discarded.isPremium !== undefined) restoredCard.isPremium = discarded.isPremium;
                                restoredCard.basePower = restoredCard.power;
                                restoredCard.currentPower = restoredCard.power;
                                eD.push(restoredCard);
                            } else {
                                eD.push({ ...discarded, currentPower: discarded.basePower || discarded.power, skills: [] });
                            }
                        }
                        events.push({ type: 'discard', side: oppOwner, card: JSON.parse(JSON.stringify(discarded)) });

                        const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
                        const voidToken = {
                            ...voidTpl,
                            id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_vp${i}`,
                            uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidvp${i}`,
                            filter: voidTpl.filter,
                            power: voidTpl.power,
                            currentPower: voidTpl.power,
                            basePower: voidTpl.power,
                            skill: voidTpl.skill || 'none',
                            voiceCategory: voidTpl.voiceCategory || 'undead',
                            isToken: true,
                            isMorphToken: true
                        };
                        newTokens.push(voidToken);
                        events.push({ type: 'add_hand', side: oppOwner, card: voidToken, source: 'morph' });
                    }
                }
                newTokens.forEach(t => eHandRef.push(t));
            }
            break;
        case 'toxic':
            if (eB[l]) {
                const toxVal = val || 1;
                eB[l].skills = eB[l].skills || [];
                if (eB[l].skill === 'growth') {
                    eB[l].skillValue = (eB[l].skillValue || 0) - toxVal;
                } else {
                    const exist = eB[l].skills.find(s => s.id === 'growth');
                    if (exist) {
                        exist.value = (exist.value || 0) - toxVal;
                    } else {
                        eB[l].skills.push({ id: 'growth', value: -toxVal });
                    }
                }
                events.push({ type: 'add_skill', side: oppOwner, lane: l, skillId: 'growth', skillValue: -toxVal, source: 'toxic' });
            }
            break;
        case 'spread':
            const spVal = val || 2;
            [l - 1, l, l + 1].forEach(j => {
                if (j >= 0 && j < 3 && eB[j]) {
                    if (!hasSkill(eB[j], 'immune')) {
                        let d = spVal;
                        eB[j].currentPower -= d;
                        events.push({ type: 'damage_card', side: oppOwner, lane: j, amount: d, source: 'spread' });
                    } else {
                        events.push({ type: 'immune_block', side: oppOwner, lane: j, source: 'spread' });
                    }
                }
            });
            break;
        case 'bind':
            if (eB[l]) eB[l].stunTurns = (val || 1) + 1;
            break;
        case 'freeze':
            [l - 1, l, l + 1].forEach(j => {
                if (j >= 0 && j < 3 && eB[j]) {
                    eB[j].stunTurns = (val || 1) + 1;
                }
            });
            break;
        case 'loss':
            const lossDeck = owner === 'blue' ? state.playerDeck : state.enemyDeck;
            const lossDiscard = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
            const lossCount = val || 1;
            for (let i = 0; i < lossCount; i++) {
                if (lossDeck.length > 0) lossDiscard.push(lossDeck.pop());
            }
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
                if (!hasSkill(eB[maxL], 'immune')) {
                    let d = snVal;
                    eB[maxL].currentPower -= d;
                    events.push({ type: 'damage_card', side: oppOwner, lane: maxL, amount: d, source: 'snipe' });
                } else {
                    events.push({ type: 'immune_block', side: oppOwner, lane: maxL, source: 'snipe' });
                }
            }
            break;
        case 'dispel':
            const dpVal = val || 1;
            const dispelTargetsEngine = [];
            
            if (simulatedTokenLanes) {
                for (let i = 0; i < Math.min(dpVal, simulatedTokenLanes.length); i++) {
                    const lIdx = simulatedTokenLanes[i];
                    if (lIdx !== null && eB[lIdx]) {
                        const tgtCard = eB[lIdx];
                        const isEquipHost = tgtCard.equippedCards && tgtCard.equippedCards.length > 0;
                        const isEquipItself = hasSkill(tgtCard, 'equip');
                        if (isEquipHost || isEquipItself) {
                            dispelTargetsEngine.push({ lane: lIdx, targetCard: tgtCard, isHost: isEquipHost, isSelf: isEquipItself });
                        }
                    }
                }
                simulatedTokenLanes.splice(0, dpVal); // 消費
            } else {
                for (let j = 0; j < 3; j++) {
                    if (eB[j]) {
                        const isEquipHost = eB[j].equippedCards && eB[j].equippedCards.length > 0;
                        const isEquipItself = hasSkill(eB[j], 'equip');
                        if (isEquipHost || isEquipItself) {
                            let eqScore = isEquipItself ? 50 : 0;
                            if (isEquipHost) eqScore += eB[j].equippedCards.reduce((sum, eq) => sum + (eq.power || 0), 0);
                            dispelTargetsEngine.push({ lane: j, score: eqScore, targetCard: eB[j], isHost: isEquipHost, isSelf: isEquipItself });
                        }
                    }
                }
                dispelTargetsEngine.sort((a, b) => b.score - a.score || a.lane - b.lane);
                if (dispelTargetsEngine.length > dpVal) dispelTargetsEngine.length = dpVal;
            }

            for (let i = 0; i < dispelTargetsEngine.length; i++) {
                const maxL = dispelTargetsEngine[i].lane;
                const tgt = dispelTargetsEngine[i].targetCard;
                
                if (dispelTargetsEngine[i].isHost) {
                    let totalLoss = tgt.equippedCards.reduce((sum, eq) => sum + (eq.power || 0), 0);
                    for (const eqC of tgt.equippedCards) {
                        const equipSkills = [];
                        if (eqC.skill && eqC.skill !== 'none' && eqC.skill !== 'equip') {
                            equipSkills.push({ id: eqC.skill, value: eqC.skillValue });
                        }
                        if (eqC.skills) {
                            eqC.skills.forEach(s => {
                                if (s.id !== 'equip') equipSkills.push(s);
                            });
                        }
                        unmergeCardSkills(tgt, equipSkills);
                    }
                    tgt.power -= totalLoss;
                    tgt.currentPower -= totalLoss;
                    tgt.basePower -= totalLoss;
                    tgt.equippedCards = [];
                    events.push({ type: 'dispel_equip', side: oppOwner, lane: maxL, amount: totalLoss, source: 'dispel' });
                }
                
                if (dispelTargetsEngine[i].isSelf) {
                    tgt.currentPower = 0;
                }
                
                if (tgt.currentPower <= 0) {
                    events.push({ type: 'destroy_card', side: oppOwner, lane: maxL, source: 'dispel_kill' });
                    eB[maxL] = null;
                }
            }
            break;
        case 'berserk':
            const bVal = val || 2;
            const bAdj = l === 1 ? [0, 2] : [1];
            bAdj.forEach(j => {
                if (b[j]) {
                    if (!hasSkill(b[j], 'immune')) {
                        b[j].currentPower -= bVal;
                        events.push({ type: 'damage_card', side: owner, lane: j, amount: bVal, source: 'berserk' });
                    } else {
                        events.push({ type: 'immune_block', side: owner, lane: j, source: 'berserk' });
                    }
                }
            });
            break;
        case 'heal':
            const hAmt = val || 3;
            if (owner === 'blue') state.playerHP = Math.min(state.playerMaxHP, state.playerHP + hAmt);
            else state.enemyHP = Math.min(state.enemyMaxHP, state.enemyHP + hAmt);
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
            const pMaxSP = state.playerConfig?.leaderSkill?.cost || 5;
            const eMaxSP = state.enemyConfig?.leaderSkill?.cost || 5;
            if (owner === 'blue') state.playerSP = Math.min(pMaxSP, Math.max(0, state.playerSP + chgAmt));
            else state.enemySP = Math.min(eMaxSP, Math.max(0, state.enemySP + chgAmt));
            events.push({ type: 'charge_sp', side: owner, amount: chgAmt });
            break;
        case 'quick':
            applySingleCombat(state, owner, l, events);
            break;
        case 'bless':
            const blessHand = owner === 'blue' ? state.playerHand : state.enemyHand;
            if (blessHand && blessHand.length > 0) {
                const blessVal = val || 1;
                let bestCard = null;
                for (let hc of blessHand) {
                    if (!hc.isToken && (!bestCard || (hc.power || 0) > (bestCard.power || 0))) {
                        bestCard = hc;
                    }
                }
                if (!bestCard) bestCard = blessHand[0];
                bestCard.power = (bestCard.power || 0) + blessVal;
                bestCard.currentPower = (bestCard.currentPower || 0) + blessVal;
                bestCard.basePower = (bestCard.basePower || 0) + blessVal;
            }
            break;
        case 'convert':
            const convertHand = owner === 'blue' ? state.playerHand : state.enemyHand;
            const convertCount = val || 1;
            const actualConvertCount = Math.min(convertCount, convertHand ? convertHand.length : 0);
            for (let i = 0; i < actualConvertCount; i++) {
                convertHand.pop(); // simply pop from hand
                const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
                const newToken = {
                    ...voidTpl,
                    isToken: true,
                    power: 1, basePower: 1, currentPower: 1
                };
                convertHand.push(newToken);
            }
            break;
        case 'summon':
            const summonTargetPower = val || 1;
            let tNameEngine = 'ドローン';
            let tIdEngine = 'token_drone';
            const engineCId = c.baseId || c.id;
            if (engineCId === 'admiral') {
                tIdEngine = 'token_knight';
                tNameEngine = '騎士';
            } else if (summonTargetPower >= 5) {
                tNameEngine = 'ゴーレム';
                tIdEngine = 'token_golem';
            }
            const baseTC = CARD_MASTER.find(m => m.id === tIdEngine);
            const sTC = {
                id: tIdEngine,
                name: tNameEngine,
                isToken: true,
                rarity: 1,
                voiceCategory: baseTC ? baseTC.voiceCategory : (summonTargetPower >= 5 ? 'monster' : 'machine_new')
            };
            for (let i = 0; i < 1; i++) {
                let targetLane = -1;
                if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
                    targetLane = simulatedTokenLanes.shift();
                } else if (Array.isArray(simulatedTokenLanes)) {
                    targetLane = -1;
                } else {
                    const sealedLanes = owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;
                    const emptyLanes = [0, 1, 2].filter(j => b[j] === null && (!sealedLanes || sealedLanes[j] === 0));
                    if (emptyLanes.length > 0) {
                        targetLane = emptyLanes[0];
                    } else {
                        const validOccupiedLanes = [0, 1, 2].filter(j => !sealedLanes || sealedLanes[j] === 0);
                        if (validOccupiedLanes.length > 0) targetLane = validOccupiedLanes[0];
                    }
                }

                if (targetLane !== -1) {
                    const newToken = {
                        ...sTC,
                        id: `sm_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                        owner,
                        isPremium: c.isPremium,
                        imgUrl: '', // resolved in UI
                        power: summonTargetPower,
                        basePower: summonTargetPower,
                        currentPower: summonTargetPower,
                        skills: []
                    };
                    if (b[targetLane] !== null) {
                        const simDiscard = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
                        simDiscard.push(b[targetLane]);
                    }
                    b[targetLane] = newToken;
                    events.push({ type: 'summon_token', side: owner, lane: targetLane, card: JSON.parse(JSON.stringify(newToken)), source: 'summon' });
                }
            }
            break;
        case 'wall_create':
            const wallPower = val || 10;
            const wTC = CARD_MASTER.find(m => m.id === 'token_wall') || { name: 'トークン', power: 1 };
            for (let i = 0; i < 1; i++) {
                let targetLane = -1;
                if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
                    targetLane = simulatedTokenLanes.shift();
                } else if (Array.isArray(simulatedTokenLanes)) {
                    targetLane = -1;
                } else {
                    const sealedLanes = owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;
                    const emptyLanes = [0, 1, 2].filter(j => b[j] === null && (!sealedLanes || sealedLanes[j] === 0));
                    if (emptyLanes.length > 0) {
                        targetLane = emptyLanes[0];
                    } else {
                        const validOccupiedLanes = [0, 1, 2].filter(j => !sealedLanes || sealedLanes[j] === 0);
                        if (validOccupiedLanes.length > 0) targetLane = validOccupiedLanes[0];
                    }
                }

                if (targetLane !== -1) {
                    if (b[targetLane] !== null) {
                        const simDiscard = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
                        simDiscard.push(b[targetLane]);
                    }
                    const newToken = {
                        ...wTC,
                        id: `WC_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                        uid: `${owner}_WC_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                        owner,
                        isPremium: c.isPremium,
                        imgUrl: '',
                        power: wallPower,
                        basePower: wallPower,
                        currentPower: wallPower,
                        baseId: 'token_wall',
                        skills: [],
                        isToken: true
                    };
                    b[targetLane] = newToken;
                    events.push({ type: 'summon_token', side: owner, lane: targetLane, card: JSON.parse(JSON.stringify(newToken)), source: 'wall_create' });
                }
            }
            break;
        case 'resurrect':
            // 復活 (AIシミュレーション用): 墓地から一番パワーの高いカードを召喚する
            const simDiscard = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
            if (simDiscard.length === 0) break;
            
            // パワーが高い順にソートして一番強いのを取得し、シミュ内で墓地から取り除く
            const sortedDiscard = [...simDiscard].sort((a, b) => b.power - a.power);
            const simResCard = sortedDiscard[0];

            let targetLaneRes = -1;
            if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
                targetLaneRes = simulatedTokenLanes.shift();
            } else if (Array.isArray(simulatedTokenLanes)) {
                targetLaneRes = -1;
            } else {
                const sealedLanes = owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;
                const emptyLanesRes = [0, 1, 2].filter(j => b[j] === null && (!sealedLanes || sealedLanes[j] === 0));
                if (emptyLanesRes.length > 0) {
                    targetLaneRes = emptyLanesRes[0];
                } else {
                    const validOccupiedLanes = [0, 1, 2].filter(j => !sealedLanes || sealedLanes[j] === 0);
                    if (validOccupiedLanes.length > 0) targetLaneRes = validOccupiedLanes[0];
                }
            }

            if (targetLaneRes !== -1) {
                const existingCard = b[targetLaneRes];
                const unionSkill = simResCard.skills && simResCard.skills.find(s => s.id === 'union');
                const isUnion = unionSkill && existingCard && (existingCard.baseId === unionSkill.targetId || existingCard.id === unionSkill.targetId);

                if (isUnion) {
                    const masterData = CARD_MASTER.find(c => c.id === unionSkill.summonId) || CARD_MASTER.find(c => c.id === 'android');
                    let unionCard = JSON.parse(JSON.stringify(masterData));
                    unionCard.uid = `rs_sim_un_${Math.floor(getSeededRandom() * 1000000000)}`;
                    unionCard.owner = owner;
                    unionCard.baseId = unionCard.id;
                    unionCard.basePower = unionCard.power;
                    unionCard.currentPower = unionCard.power;
                    unionCard.skills = []; // 蘇生からの合体のためスキル効果は不発
                    unionCard.stunTurns = 0;
                    b[targetLaneRes] = unionCard;
                    events.push({ type: 'summon_token', side: owner, lane: targetLaneRes, card: JSON.parse(JSON.stringify(unionCard)), source: 'union' });
                } else {
                    if (existingCard) simDiscard.push(existingCard);
                    const newResToken = {
                        ...simResCard,
                        id: `rs_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
                        owner,
                        currentPower: simResCard.power,
                        skills: [] // 蘇生時は通常のOnPlayスキルは発動しない
                    };
                    b[targetLaneRes] = newResToken;
                    events.push({ type: 'summon_token', side: owner, lane: targetLaneRes, card: JSON.parse(JSON.stringify(newResToken)), source: 'resurrect' });
                }
                
                const resIdx = simDiscard.indexOf(simResCard);
                if (resIdx !== -1) simDiscard.splice(resIdx, 1);
            }
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
                let targetLane = -1;
                if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
                    targetLane = simulatedTokenLanes.shift();
                } else if (Array.isArray(simulatedTokenLanes)) {
                    targetLane = -1;
                } else {
                    const sealedLanes = owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;
                    const emptyLanes = [0, 1, 2].filter(j => b[j] === null && (!sealedLanes || sealedLanes[j] === 0));
                    if (emptyLanes.length > 0) {
                        targetLane = emptyLanes[0];
                    } else {
                        const validOccupiedLanes = [0, 1, 2].filter(j => !sealedLanes || sealedLanes[j] === 0);
                        if (validOccupiedLanes.length > 0) targetLane = validOccupiedLanes[0];
                    }
                }

                if (targetLane !== -1) {
                    const existingCard = b[targetLane];
                    const inheritedUnionSkill = inheritedSkills.find(sk => sk.id === 'union');
                    const isUnion = inheritedUnionSkill && existingCard && (existingCard.baseId === inheritedUnionSkill.targetId || existingCard.id === inheritedUnionSkill.targetId);

                    if (isUnion) {
                        const masterData = CARD_MASTER.find(md => md.id === inheritedUnionSkill.summonId) || CARD_MASTER.find(md => md.id === 'android');
                        let unionCard = JSON.parse(JSON.stringify(masterData));
                        unionCard.uid = `cl_sim_un_${Math.floor(getSeededRandom() * 1000000000)}_${i}`;
                        unionCard.owner = owner;
                        unionCard.baseId = unionCard.id;
                        unionCard.basePower = unionCard.power;
                        unionCard.currentPower = unionCard.power;
                        unionCard.skills = []; // 配置からのため不発
                        unionCard.stunTurns = 0;
                        b[targetLane] = unionCard;
                        events.push({ type: 'summon_token', side: owner, lane: targetLane, card: JSON.parse(JSON.stringify(unionCard)), source: 'union' });
                    } else {
                        if (existingCard) {
                            const simDiscard = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
                            simDiscard.push(existingCard);
                        }
                        const newToken = {
                            ...tC,
                            id: `cl_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                            owner,
                            isPremium: c.isPremium,
                            imgUrl: c.imgUrl, // シミュ内では元の情報を保持していればOK (UI表示は後で行われる)
                            rarity: c.rarity || 1,
                            power: c.power || 1,
                            basePower: c.basePower || c.power || 1,
                            currentPower: c.currentPower !== undefined ? c.currentPower : (c.power || 1),
                            skills: JSON.parse(JSON.stringify(inheritedSkills)),
                            voiceCategory: c.voiceCategory || 'sword'
                        };
                        b[targetLane] = newToken;
                        events.push({ type: 'summon_token', side: owner, lane: targetLane, card: JSON.parse(JSON.stringify(newToken)), source: 'clone' });
                    }
                }
            }
            break;
        case 'petrify':
            if (eB[l]) {
                const targetOriginal = JSON.parse(JSON.stringify(eB[l]));
                const statueTpl = CARD_MASTER.find(m => m.id === 'token_statue') || { name: '石像', power: 5, rarity: 1 };
                const statueToken = {
                    ...statueTpl,
                    id: `statue_${Math.floor(getSeededRandom() * 1000000000)}`,
                    baseId: 'token_statue',
                    uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_statue`,
                    owner: oppOwner,
                    power: statueTpl.power,
                    basePower: statueTpl.basePower || statueTpl.power,
                    currentPower: statueTpl.power,
                    isToken: true,
                    skills: JSON.parse(JSON.stringify(statueTpl.skills || [])),
                    voiceCategory: statueTpl.voiceCategory || 'stone',
                    originalRevertTarget: targetOriginal // 石像破壊時に墓地へ行く元カード
                };

                if (targetOriginal.equippedCards && targetOriginal.equippedCards.length > 0) {
                    statueToken.equippedCards = JSON.parse(JSON.stringify(targetOriginal.equippedCards));
                }
                if (targetOriginal.unionMaterials && targetOriginal.unionMaterials.length > 0) {
                    statueToken.unionMaterials = JSON.parse(JSON.stringify(targetOriginal.unionMaterials));
                }
                
                // 既存のカードを消すわけではなく変身扱いとするため、破壊イベントは積まない（あるいは変身イベントを積む）
                eB[l] = statueToken;
                events.push({ type: 'petrify', side: oppOwner, lane: l, card: JSON.parse(JSON.stringify(statueToken)), source: 'petrify' });
            }
            break;
        case 'reinforce':
            // AIシミュレーション用: 手札の枚数が十分ある前提で最大数捨てるとしてトークンを手札に加える
            const h = owner === 'blue' ? state.playerHand : state.enemyHand;
            const actualReinforceCount = Math.min(val || 1, h.length);

            for (let i = 0; i < actualReinforceCount; i++) {
                if (h.length > 0) h.shift(); // 先頭から捨てるモック
            }

            const rTC = {
                id: 'token_reinforce',
                name: c.name,
                isToken: true,
                rarity: c.rarity || 1,
                power: c.currentPower !== undefined ? c.currentPower : (c.power || 1),
                basePower: c.basePower || c.power || 1,
                currentPower: c.currentPower !== undefined ? c.currentPower : (c.power || 1),
                voiceCategory: c.voiceCategory || 'lizard'
            };

            for (let i = 0; i < actualReinforceCount; i++) {
                h.push({ 
                    ...rTC, 
                    id: `rf_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`, 
                    owner,
                    imgUrl: c.imgUrl,
                    isPremium: c.isPremium
                });
            }
            break;
        case 'call':
            // 号令は純粋ロジックでの完全なシミュレーションが不可能なため（ユーザー選択や期待値ベース評価を行うため）
            // engine.jsでは盤面に干渉しない（ai_normal等で独自に+3として期待値評価する）
            break;
        case 'resurrect':
            const maxPow = val || 1;
            const discard = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
            const validCards = discard.filter(card => (card.power || 0) <= maxPow && !card.isToken);
            if (validCards.length > 0) {
                const sorted = [...validCards].sort((a, b) => b.power - a.power);
                const selectedCard = sorted[0];
                
                let targetLane = -1;
                if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
                    targetLane = simulatedTokenLanes[0];
                } else {
                    const emptyLanes = [0, 1, 2].filter(j => b[j] === null);
                    if (emptyLanes.length > 0) targetLane = emptyLanes[0];
                }

                if (targetLane !== -1 && b[targetLane] === null) {
                    const resurrectedCard = { 
                        ...selectedCard, 
                        id: `res_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
                        baseId: selectedCard.baseId || selectedCard.id
                    };
                    resurrectedCard.currentPower = resurrectedCard.power;
                    resurrectedCard.skillTriggered = true; // 召喚効果は連鎖しない想定
                    resurrectedCard.stunTurns = 0;
                    b[targetLane] = resurrectedCard;

                    const eD = owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
                    const removeIdx = eD.findIndex(x => x.id === selectedCard.id);
                    if (removeIdx !== -1) eD.splice(removeIdx, 1);

                    events.push({ type: 'summon_card', side: owner, lane: targetLane, card: JSON.parse(JSON.stringify(resurrectedCard)), source: 'resurrect' });
                }
            }
            break;
        case 'stealth':
        case 'invincible':
            if (!Array.isArray(c.skills)) c.skills = [{ id: 'invincible', value: val || 1 }];
            else c.skills.push({ id: 'invincible', value: val || 1 });
            events.push({ type: 'add_skill', side: owner, lane: l, skillId: 'invincible', value: val || 1, source: sid });
            break;
    }

    processDestructionTriggers(state, events);
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

    if (action === 'seal_lanes') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
        let targets = (tokenLanes && Array.isArray(tokenLanes)) ? [...tokenLanes] : [];
        if (targets.length === 0) {
            const sealedLanes = isBlue ? state.enemySealedLanes : state.playerSealedLanes;
            const priority = [1, 0, 2]; // 中央 > 左 > 右
            for (let l of priority) {
                if (!sealedLanes || sealedLanes[l] === 0) {
                    targets.push(l);
                    if (targets.length >= 2) break;
                }
            }
        }
        
        for (const lane of targets) {
            // Apply Seal
            if (isBlue) {
                if (state.enemySealedLanes) state.enemySealedLanes[lane] = 1;
            } else {
                if (state.playerSealedLanes) state.playerSealedLanes[lane] = 1;
            }
            
            // Damage card if exists
            if (eBoard[lane] !== null) {
                if (!hasSkill(eBoard[lane], 'immune')) {
                    eBoard[lane].currentPower -= 4;
                    events.push({ type: 'damage_card', side: oppOwner, lane: lane, amount: 4, source: 'seal_lanes' });
                } else {
                    events.push({ type: 'immune_block', side: oppOwner, lane: lane, source: 'seal_lanes' });
                }
            }
        }
    } else if (action === 'annihilation') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
        for (let i = 0; i < 3; i++) {
            if (eBoard[i]) {
                if (!hasSkill(eBoard[i], 'immune')) {
                    eBoard[i].currentPower -= 4;
                    events.push({ type: 'damage_card', side: oppOwner, lane: i, amount: 4, source: 'annihilation' });
                } else {
                    events.push({ type: 'immune_block', side: oppOwner, lane: i, source: 'annihilation' });
                }
            }
        }

    } else if (action === 'android_high_volley') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
        // 敵の場のすべてのカードに4ダメージ
        for (let i = 0; i < 3; i++) {
            if (eBoard[i]) {
                if (!hasSkill(eBoard[i], 'immune')) {
                    eBoard[i].currentPower -= 4;
                    events.push({ type: 'damage_card', side: oppOwner, lane: i, amount: 4, source: 'android_high_volley' });
                } else {
                    events.push({ type: 'immune_block', side: oppOwner, lane: i, source: 'android_high_volley' });
                }
            }
        }
        // 敵リーダーに2ダメージ
        if (isBlue) {
            state.enemyHP -= 2;
            if (state.enemyHP < 0) state.enemyHP = 0;
        } else {
            state.playerHP -= 2;
            if (state.playerHP < 0) state.playerHP = 0;
        }
        events.push({ type: 'damage_player', side: oppOwner, amount: 2, source: 'android_high_volley' });

    } else if (action === 'targeted_destruction') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
        let targetLane = -1;
        if (tokenLanes && tokenLanes.length > 0) {
            targetLane = tokenLanes[0];
        } else {
            const occupiedLanes = [0, 1, 2].filter(i => eBoard[i] !== null && !hasSkill(eBoard[i], 'immune'));
            if (occupiedLanes.length > 0) targetLane = occupiedLanes[0];
        }

        if (targetLane !== -1 && eBoard[targetLane] !== null) {
            if (!hasSkill(eBoard[targetLane], 'immune')) {
                events.push({ type: 'destroy_cards', targets: [{ side: oppOwner, lane: targetLane, card: eBoard[targetLane] }] });
                eBoard[targetLane] = null;
            } else {
                events.push({ type: 'immune_block', side: oppOwner, lane: targetLane, source: 'targeted_destruction' });
            }
        }
    } else if (action === 'devilhunter_resurrect') {
        const discard = isBlue ? state.playerDiscard : state.enemyDiscard;
        const validCards = discard.filter(card => !card.isToken);
        if (validCards.length > 0) {
            const sorted = [...validCards].sort((a, b) => b.power - a.power);
            const selectedCard = sorted[0];
            let l = -1;
            if (tokenLanes && tokenLanes.length > 0) {
                l = tokenLanes[0];
            } else {
                const sealedLanes = isBlue ? state.playerSealedLanes : state.enemySealedLanes;
                const emptyLanes = [0, 1, 2].filter(i => board[i] === null && (!sealedLanes || sealedLanes[i] === 0));
                if (emptyLanes.length > 0) l = emptyLanes[0];
            }
            if (l !== -1) {
                events.push({ type: 'leader_skill', skill: action, side: owner });
                const existingCard = board[l];
                const unionSkill = selectedCard.skills && selectedCard.skills.find(s => s.id === 'union');
                const isUnion = unionSkill && existingCard && (existingCard.baseId === unionSkill.targetId || existingCard.id === unionSkill.targetId);

                if (isUnion) {
                    const masterData = CARD_MASTER.find(c => c.id === unionSkill.summonId) || CARD_MASTER.find(c => c.id === 'android');
                    let unionCard = JSON.parse(JSON.stringify(masterData));
                    unionCard.uid = `ls_un_sim_${Math.floor(getSeededRandom() * 1000000000)}`;
                    unionCard.owner = owner;
                    unionCard.baseId = unionCard.id;
                    unionCard.basePower = unionCard.power;
                    unionCard.currentPower = unionCard.power;
                    unionCard.skillTriggered = true; // 配置からの合体のため召喚時効果は不発
                    unionCard.stunTurns = 0;
                    board[l] = unionCard;
                    events.push({ type: 'summon_card', side: owner, lane: l, card: JSON.parse(JSON.stringify(unionCard)), source: 'union' });
                } else {
                    if (existingCard) discard.push(existingCard);
                    const resurrectedCard = { ...selectedCard, id: `res_sim_${Math.floor(getSeededRandom() * 1000000000)}` };
                    resurrectedCard.currentPower = resurrectedCard.power;
                    resurrectedCard.skillTriggered = true;
                    resurrectedCard.stunTurns = 0;
                    board[l] = resurrectedCard;
                    events.push({ type: 'summon_card', side: owner, lane: l, card: JSON.parse(JSON.stringify(resurrectedCard)), source: 'devilhunter_resurrect' });
                }

                const removeIdx = discard.findIndex(x => x.id === selectedCard.id);
                if (removeIdx !== -1) discard.splice(removeIdx, 1);
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
            const sealedLanes = isBlue ? state.playerSealedLanes : state.enemySealedLanes;
            const emptyLanes = [0, 1, 2].filter(i => board[i] === null && (!sealedLanes || sealedLanes[i] === 0));
            if (emptyLanes.length > 0) l = emptyLanes[0];
        }

        if (l !== -1) {
            events.push({ type: 'leader_skill', skill: action, side: owner });
            const tM = CARD_MASTER.find(m => m.id === (action === 'satan_avatar' ? 'token_satan' : 'token_ignis'));
            const newToken = { id: `tk_${Math.floor(getSeededRandom() * 1000000000)}`, owner, ...tM, currentPower: power, rarity: tM.rarity || 1 };
            if (action === 'satan_avatar') newToken.imgUrl = 'assets/cards/card_token_satan.jpg';
            else newToken.imgUrl = 'assets/cards/card_token_dragon.jpg';

            if (board[l] !== null) {
                events.push({ type: 'destroy_cards', targets: [{ side: owner, lane: l, card: board[l] }] });
                board[l] = null;
            }

            board[l] = newToken;
            events.push({ type: 'summon_token', side: owner, lane: l, card: JSON.parse(JSON.stringify(newToken)), source: action });
        }
    } else if (action === 'holy_march') {
        // 騎士召喚（最大2体）
        events.push({ type: 'leader_skill', skill: action, side: owner });
        let count = 0;
        const addKnight = (lane) => {
            const tK = CARD_MASTER.find(m => m.id === 'token_knight');
            const tk = { id: `tk_k_${Math.floor(getSeededRandom() * 1000000000)}_${lane}`, owner, ...tK, currentPower: tK.power, rarity: tK.rarity || 1, imgUrl: 'assets/cards/card_token_knight.jpg' };
            board[lane] = tk;
            // 後続のループで tk自身が +2 されるため、イベントに積むcardは追加時点のものをディープコピーしておく
            events.push({ type: 'summon_token', side: owner, lane, card: JSON.parse(JSON.stringify(tk)), source: 'holy_march' });
            count++;
        };

        if (tokenLanes !== null) {
            for (let l of tokenLanes) {
                if (board[l] !== null) {
                    events.push({ type: 'destroy_cards', targets: [{ side: owner, lane: l, card: board[l] }] });
                    board[l] = null;
                }
                addKnight(l);
            }
        } else {
            const sealedLanes = isBlue ? state.playerSealedLanes : state.enemySealedLanes;
            for (let i = 0; i < 3 && count < 2; i++) {
                if (board[i] === null && (!sealedLanes || sealedLanes[i] === 0)) addKnight(i);
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
        const d = 3;
        if (isBlue) {
            state.enemyHP -= d;
            state.playerHP = Math.min(state.playerMaxHP, state.playerHP + d);
        } else {
            state.playerHP -= d;
            state.enemyHP = Math.min(state.enemyMaxHP, state.enemyHP + d);
        }
        events.push({ type: 'damage_player', side: oppOwner, amount: d, source: 'dark_ritual' });
        events.push({ type: 'heal_player', side: owner, amount: d, source: 'dark_ritual' });
    } else if (action === 'targeted_destruction') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
        let targetLane = (tokenLanes && tokenLanes.length > 0) ? tokenLanes[0] : -1;
        // フォールバック（未指定の場合）
        if (targetLane === -1) {
            let maxP = -1;
            for (let i = 0; i < 3; i++) {
                if (eBoard[i] && eBoard[i].currentPower > maxP) {
                    maxP = eBoard[i].currentPower;
                    targetLane = i;
                }
            }
        }
        if (targetLane !== -1 && eBoard[targetLane]) {
            if (!hasSkill(eBoard[targetLane], 'immune')) {
                eBoard[targetLane].currentPower = 0;
                events.push({ type: 'deadly', side: oppOwner, lane: targetLane, source: 'targeted_destruction' });
            } else {
                events.push({ type: 'immune_block', side: oppOwner, lane: targetLane, source: 'targeted_destruction' });
            }
        }
    } else if (action === 'time_stop') {
        events.push({ type: 'leader_skill', skill: action, side: owner });
        state.extraTurnCount = (state.extraTurnCount || 0) + 2;
        state.attackSkipCount = (state.attackSkipCount || 0) + 2;
    }

    processDestructionTriggers(state, events);
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
        if (state.playerHP <= 0 || state.enemyHP <= 0) break;
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
    if (!aC || hasSkill(aC, 'defender') || aC.stunTurns > 0) return events;

    const aHasPhase = hasSkill(aC, 'phase');

    let dLane = l;
    if (defBoard[l]) {
        // 守護側も位相が一致しないとかばうことができないが、防御を持っていればブロック可能
        const checkGuardian = (c) => c && hasSkill(c, 'guardian') && (hasSkill(c, 'phase') === aHasPhase || hasSkill(c, 'defender') || c.stunTurns > 0);
        let dg = (l === 1) ? (checkGuardian(defBoard[0]) ? 0 : (checkGuardian(defBoard[2]) ? 2 : null)) : (l === 0 ? (checkGuardian(defBoard[1]) ? 1 : null) : (checkGuardian(defBoard[1]) ? 1 : null));
        if (dg !== null) dLane = dg;
    }

    let aLane = l;
    if (atkBoard[l]) {
        let ag = (l === 1) ? (hasSkill(atkBoard[0], 'guardian') ? 0 : (hasSkill(atkBoard[2], 'guardian') ? 2 : null)) : (l === 0 ? (hasSkill(atkBoard[1], 'guardian') ? 1 : null) : (hasSkill(atkBoard[1], 'guardian') ? 1 : null));
        if (ag !== null) aLane = ag;
    }

    let dC = defBoard[dLane];
    if (dC && hasSkill(dC, 'phase') !== aHasPhase) {
        if (!hasSkill(dC, 'defender') && !(dC.stunTurns > 0)) {
            dC = null; // 位相が合わないため完全すり抜け（直接攻撃扱い）
        }
    }
    const originalTarget = (defBoard[l] && (hasSkill(defBoard[l], 'phase') === aHasPhase || hasSkill(defBoard[l], 'defender') || defBoard[l].stunTurns > 0)) ? defBoard[l] : null;
    let aP = Number(aC.currentPower ?? aC.power ?? 0) || 0;
    
    // 反撃ダメージを受けるカード（攻撃者自身、またはその隣の守護）
    const aC_defend = atkBoard[aLane];

    events.push({ type: 'attack', attackerSide, lane: l, targetLane: dLane });

    if (hasSkill(aC, 'brutal')) {
        const brutalDmg = getSkillValue(aC, 'brutal') || 1;
        [l - 1, l + 1].forEach(tj => {
            if (tj >= 0 && tj <= 2 && atkBoard[tj]) {
                atkBoard[tj].currentPower -= brutalDmg;
                events.push({ type: 'damage_card', side: attackerSide, lane: tj, amount: brutalDmg, source: 'brutal' });
            }
        });
    }

    if (dC) {
        let dP = originalTarget ? (Number(originalTarget.currentPower ?? originalTarget.power ?? 0) || 0) : 0;
        let dmgToDef = aP;
        let dmgToAtk = dP;

        if (hasSkill(dC, 'sturdy')) {
            if (dmgToDef > 0) events.push({ type: 'sturdy_block', side: defSide, lane: dLane });
            dmgToDef = Math.floor(dmgToDef / 2);
        }
        if (hasSkill(aC_defend, 'sturdy')) {
            if (dmgToAtk > 0) events.push({ type: 'sturdy_block', side: attackerSide, lane: aLane });
            dmgToAtk = Math.floor(dmgToAtk / 2);
        }
        if (hasSkill(dC, 'invincible')) {
            if (dmgToDef > 0) events.push({ type: 'invincible_block', side: defSide, lane: dLane });
            dmgToDef = 0;
        }
        if (hasSkill(aC_defend, 'invincible')) {
            if (dmgToAtk > 0) events.push({ type: 'invincible_block', side: attackerSide, lane: aLane });
            dmgToAtk = 0;
        }

        // 連撃（ダブルストライク）: 与えるダメージ2倍
        if (hasSkill(aC, 'double_strike')) {
            if (dmgToDef > 0) events.push({ type: 'double_strike_proc', side: attackerSide, lane: l });
            dmgToDef *= 2;
        }
        if (originalTarget && hasSkill(originalTarget, 'double_strike')) {
            if (dmgToAtk > 0) events.push({ type: 'double_strike_proc', side: defSide, lane: l });
            dmgToAtk *= 2;
        }

        const isOriginalTargetDefender = originalTarget && hasSkill(originalTarget, 'defender');
        if (isOriginalTargetDefender) dmgToAtk = 0; // 防御は反撃ダメージを与えない

        if (dmgToDef > 0) events.push({ type: 'damage_card', side: defSide, lane: dLane, amount: dmgToDef });
        if (dmgToAtk > 0) events.push({ type: 'damage_card', side: attackerSide, lane: aLane, amount: dmgToAtk });

        dC.currentPower -= dmgToDef;
        aC_defend.currentPower -= dmgToAtk;

        if (dmgToDef > 0 && hasSkill(aC, 'deadly')) {
            if (!hasSkill(dC, 'immune')) {
                dC.currentPower = 0;
                events.push({ type: 'deadly', side: defSide, lane: dLane });
            } else {
                events.push({ type: 'immune_block', side: defSide, lane: dLane, source: 'deadly' });
            }
        }
        if (dmgToAtk > 0 && originalTarget && hasSkill(originalTarget, 'deadly')) {
            if (!hasSkill(aC_defend, 'immune')) {
                aC_defend.currentPower = 0;
                events.push({ type: 'deadly', side: attackerSide, lane: aLane });
            } else {
                events.push({ type: 'immune_block', side: attackerSide, lane: aLane, source: 'deadly' });
            }
        }

        if (dmgToDef > 0 && hasSkill(aC, 'absorb')) {
            const healAmt = Math.floor(dmgToDef / 2);
            if (healAmt > 0) {
                if (attackerSide === 'blue') state.playerHP = Math.min(state.playerMaxHP || 20, state.playerHP + healAmt);
                else state.enemyHP = Math.min(state.enemyMaxHP || 20, state.enemyHP + healAmt);
                events.push({ type: 'heal_player', side: attackerSide, amount: healAmt, source: 'absorb', lane: aLane });
            }
        }
        if (dmgToAtk > 0 && originalTarget && hasSkill(originalTarget, 'absorb')) {
            const healAmt = Math.floor(dmgToAtk / 2);
            if (healAmt > 0) {
                if (defSide === 'blue') state.playerHP = Math.min(state.playerMaxHP || 20, state.playerHP + healAmt);
                else state.enemyHP = Math.min(state.enemyMaxHP || 20, state.enemyHP + healAmt);
                events.push({ type: 'heal_player', side: defSide, amount: healAmt, source: 'absorb', lane: dLane });
            }
        }

        if (hasSkill(aC, 'pierce')) {
            let pDmg = Math.max(0, aP - dP);
            if (pDmg > 0) {
                defHP -= pDmg;
                events.push({ type: 'damage_player', side: defSide, amount: pDmg, source: 'pierce' });
                applyExtort(aC, defSide, attackerSide, aLane, events, state);
                
                if (hasSkill(aC, 'absorb')) {
                    const healAmt = Math.floor(pDmg / 2);
                    if (healAmt > 0) {
                        if (attackerSide === 'blue') state.playerHP = Math.min(state.playerMaxHP || 20, state.playerHP + healAmt);
                        else state.enemyHP = Math.min(state.enemyMaxHP || 20, state.enemyHP + healAmt);
                        events.push({ type: 'heal_player', side: attackerSide, amount: healAmt, source: 'absorb', lane: aLane });
                    }
                }
            }
        }

        // 魂縛
        let aD = aC_defend.currentPower <= 0, dD = dC.currentPower <= 0;
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
        defHP -= finalDmg;
        events.push({ type: 'damage_player', side: defSide, amount: finalDmg, source: 'direct_attack' });
        applyExtort(aC, defSide, attackerSide, aLane, events, state);
        
        if (finalDmg > 0 && hasSkill(aC, 'absorb')) {
            const healAmt = Math.floor(finalDmg / 2);
            if (healAmt > 0) {
                if (attackerSide === 'blue') state.playerHP = Math.min(state.playerMaxHP || 20, state.playerHP + healAmt);
                else state.enemyHP = Math.min(state.enemyMaxHP || 20, state.enemyHP + healAmt);
                events.push({ type: 'heal_player', side: attackerSide, amount: healAmt, source: 'absorb', lane: aLane });
            }
        }
    }

    if (attackerSide === 'blue') state.enemyHP = defHP;
    else state.playerHP = defHP;

    processDestructionTriggers(state, events);
    return events;
}

/**
 * ターン開始パッシブの適用
 * @returns {Array} events
 */
export function applyPassiveSkillLogic(state, side, skipContract = false, events = []) {
    // シミュレーション用のクリーンアップと誘爆の処理
    processDestructionTriggers(state, events);

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
            let v = getSkillValue(c, 'contract') || 3;
            if (side === 'blue') state.playerHP -= v;
            else state.enemyHP -= v;
            events.push({ type: 'damage_player', side, amount: v, source: 'contract' });
        }
    }

    return events;
}

/**
 * 簒奪スキルの適用 (指定した相手プレイヤーの手札をランダムに虚空に変換)
 */
function applyExtort(aC, oppSide, attackerSide, aLane, events, state) {
    if (!hasSkill(aC, 'extort')) return;

    const val = getSkillValue(aC, 'extort') || 1;
    const oppHand = oppSide === 'blue' ? state.playerHand : state.enemyHand;
    const oppDiscard = oppSide === 'blue' ? state.playerDiscard : state.enemyDiscard;

    if (oppHand && oppHand.length > 0) {
        let activated = false;
        const newTokens = [];
        for (let i = 0; i < val; i++) {
            if (oppHand.length === 0) break;
            
            if (!activated) {
                events.push({ type: 'skill_popup', side: attackerSide, lane: aLane, skillName: '簒奪' });
                activated = true;
            }

            const randIndex = Math.floor(getSeededRandom() * oppHand.length);
            const discarded = oppHand.splice(randIndex, 1)[0];
            if (!discarded.isToken) {
                const masterData = CARD_MASTER.find(m => m.id === (discarded.baseId || discarded.id));
                if (masterData) {
                    const restoredCard = JSON.parse(JSON.stringify(masterData));
                    restoredCard.uid = discarded.uid;
                    restoredCard.owner = oppSide;
                    restoredCard.baseId = discarded.baseId || discarded.id;
                    if (discarded.isPremium !== undefined) restoredCard.isPremium = discarded.isPremium;
                    restoredCard.basePower = restoredCard.power;
                    restoredCard.currentPower = restoredCard.power;
                    oppDiscard.push(restoredCard);
                } else {
                    oppDiscard.push({ ...discarded, currentPower: discarded.basePower || discarded.power, skills: [] });
                }
            }

            const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
            const voidToken = {
                ...voidTpl,
                id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_extort${i}`,
                uid: `${oppSide}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidext${i}`,
                filter: voidTpl.filter,
                power: voidTpl.power,
                currentPower: voidTpl.power,
                basePower: voidTpl.power,
                skill: voidTpl.skill || 'none',
                voiceCategory: voidTpl.voiceCategory || 'undead',
                isToken: true,
                isMorphToken: true
            };
            newTokens.push(voidToken);

            events.push({ type: 'discard', side: oppSide, card: JSON.parse(JSON.stringify(discarded)), source: 'extort' });
            events.push({ type: 'add_hand', side: oppSide, card: JSON.parse(JSON.stringify(voidToken)), source: 'extort' });
        }
        newTokens.forEach(t => oppHand.push(t));
    }
}

import { hasSkill, getSeededRandom, mergeCardSkills } from '../utils/gameUtils.js';
import { applyActiveSkillLogic, applyLeaderSkillLogic, calculateCombatPhase, applyPassiveSkillLogic } from './engine.js';
import { GameState } from './gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';

export function getBestSimulatedMove() {
    const hand = GameState.enemyHand;
    const discard = GameState.enemyDiscard;
    let myBoard = GameState.enemyBoard;
    let opBoard = GameState.playerBoard;

    let myHP = GameState.enemyHP;
    let opHP = GameState.playerHP;
    let mySP = GameState.enemySP || 0;
    const mySealedLanes = GameState.enemySealedLanes || [0, 0, 0];

    const canUseSkill = GameState.enemyConfig.leaderSkill && 
        mySP >= GameState.enemyConfig.leaderSkill.cost &&
        !GameState.enemyConfig.leaderSkillUsableTurns?.includes(GameState.turnCount) &&
        !GameState.enemyConfig.leaderSkillUsed;
    const skill = GameState.enemyConfig.leaderSkill;

    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;

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

    let hasSkillObj = (c, sid) => c.skill === sid || (c.skills && c.skills.some(s=>s.id===sid));

    function buildCardPlayTree(card, sourceIdx, sourceType, originalHand, originalDiscard, usedHand, usedDiscard, depth, forcedLane = undefined) {
        if (depth >= 2) return [[]];

        let availableLanes = [0, 1, 2].filter(l => mySealedLanes[l] === 0);
        if (GameState.turnCount === 1 && GameState.firstPlayer === 'red') availableLanes = availableLanes.filter(l => l === 1);
        
        if (forcedLane !== undefined) {
            if (mySealedLanes[forcedLane] === 1) return [[]];
            availableLanes = [forcedLane];
        }

        if (availableLanes.length === 0) return [[]];

        let choiceCombinations = [undefined];
        let choice2Combinations = [undefined];
        if (hasSkillObj(card, 'choice')) {
            if (Array.isArray(card.choices)) {
                let cc = 1;
                if (card.skill === 'choice') cc = card.skillValue || 1;
                else if (card.skills) { const c = card.skills.find(s=>s.id==='choice'); if(c) cc = c.value||1; }
                const idxs = card.choices.map((_,i)=>i);
                choiceCombinations = getCombinations(idxs, Math.min(idxs.length, cc));
            }
            if (Array.isArray(card.choices2)) {
                let cc2 = 1;
                const c2 = card.skills ? card.skills.find(s=>s.id==='choice'&&s.choiceGroup===2):null;
                if (c2) cc2 = c2.value||1;
                const idxs2 = card.choices2.map((_,i)=>i);
                choice2Combinations = getCombinations(idxs2, Math.min(idxs2.length, cc2));
            }
        }

        let tokenLanePatterns = [null];
        let tokenTargetCount = 0;
        if (hasSkillObj(card, 'crush') || hasSkillObj(card, 'dispel') || hasSkillObj(card, 'snipe') || hasSkillObj(card, 'artillery') || hasSkillObj(card, 'seal')) tokenTargetCount = card.skillValue || 1;
        if (hasSkillObj(card, 'salvage') || hasSkillObj(card, 'resurrect') || hasSkillObj(card, 'summon')) tokenTargetCount = 1;
        
        let tc = 0;
        if (hasSkillObj(card, 'clone') || hasSkillObj(card, 'summon')) tc = card.skillValue || 1;
        if (hasSkillObj(card, 'call') || hasSkillObj(card, 'metamorph')) tc = 1;

        if (tc > 0) {
            let possibleLanes = [0,1,2].filter(l => mySealedLanes[l] === 0);
            let combs = [[]];
            for(let k=1; k<=Math.min(possibleLanes.length, tc); k++) combs.push(...getCombinations(possibleLanes, k));
            tokenLanePatterns = combs;
        } else if (tokenTargetCount > 0) {
            let occupied = opBoard.map((c,i)=> c ? i : -1).filter(i => i !== -1);
            let combs = [[]];
            for(let k=1; k<=Math.min(occupied.length, tokenTargetCount); k++) combs.push(...getCombinations(occupied, k));
            tokenLanePatterns = combs;
        }

        let branches = [];
        for (let lane of availableLanes) {
            for (let c1 of choiceCombinations) {
                for (let c2 of choice2Combinations) {
                    for (let tLanes of tokenLanePatterns) {
                        let node = {
                            type: sourceType,
                            targetIdx: sourceIdx,
                            laneIdx: lane,
                            choices: c1 !== undefined ? [...c1] : undefined,
                            choices2: c2 !== undefined ? [...c2] : undefined,
                            cardTokenLanes: tLanes && tLanes.length > 0 ? [...tLanes] : undefined
                        };
                        
                        if (depth < 2 && hasSkillObj(card, 'invite')) {
                            let addedInvite = false;
                            for (let i = 0; i < originalHand.length; i++) {
                                if (usedHand.includes(i)) continue;
                                let childQueues = buildCardPlayTree(originalHand[i], i, 'invite', originalHand, originalDiscard, [...usedHand, i], usedDiscard, depth + 1, lane);
                                for (let cq of childQueues) {
                                    if(cq.length === 0) branches.push([node]); else branches.push([node, ...cq]);
                                    addedInvite = true;
                                }
                            }
                            if (!addedInvite) branches.push([node]);
                        } else if (depth < 2 && hasSkillObj(card, 'resurrect')) {
                            let maxPow = card.skillValue || 1;
                            let addedRes = false;
                            for (let i = 0; i < originalDiscard.length; i++) {
                                if (usedDiscard.includes(i)) continue;
                                if ((originalDiscard[i].power||0) > maxPow || originalDiscard[i].isToken) continue;
                                let childQueues = buildCardPlayTree(originalDiscard[i], i, 'resurrect', originalHand, originalDiscard, usedHand, [...usedDiscard, i], depth + 1);
                                for (let cq of childQueues) {
                                    if(cq.length === 0) branches.push([node]); else branches.push([node, ...cq]);
                                    addedRes = true;
                                }
                            }
                            if (!addedRes) branches.push([node]);
                        } else {
                            branches.push([node]);
                        }
                    }
                }
            }
        }
        
        if (branches.length === 0) return [[]];
        return branches;
    }

    function processActionSequence(actionQueue, isLeaderSkillPlay = false, leaderSkillActionStr = null, leaderSkillTokenLanes = null, skillOrderTiming = 'before') {
        let simState = {
            playerBoard: opBoard.map(cloneCard),
            enemyBoard: myBoard.map(cloneCard),
            playerHP: opHP,
            enemyHP: myHP,
            playerMaxHP: GameState.playerMaxHP,
            enemyMaxHP: GameState.enemyMaxHP,
            playerSP: GameState.playerSP,
            enemySP: mySP,
            playerHand: GameState.playerHand.map(cloneCard),
            enemyHand: hand.map(cloneCard),
            playerDiscard: GameState.playerDiscard.map(cloneCard),
            enemyDiscard: discard.map(cloneCard),
            playerDeck: GameState.playerDeck.map(cloneCard),
            enemyDeck: GameState.enemyDeck.map(cloneCard),
            extraTurnCount: GameState.extraTurnCount,
            attackSkipCount: GameState.attackSkipCount
        };

        if (isLeaderSkillPlay && skillOrderTiming === 'before' && leaderSkillActionStr) {
            simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
            applyLeaderSkillLogic(simState, 'red', leaderSkillActionStr, leaderSkillTokenLanes);
        }

        for (let action of actionQueue) {
            if (action.type === 'pass') continue;

            const tIdx = action.targetIdx;
            const lIdx = action.laneIdx;
            let playedCard = null;

            if (mySealedLanes[lIdx] === 1) return null;

            let checkConstraints = false;
            
            if (action.type === 'play' || action.type === 'invite') {
                playedCard = cloneCard(simState.enemyHand[tIdx]);
                checkConstraints = true;
                if (simState.enemyHand[tIdx]) simState.enemyHand[tIdx] = null;
            } else if (action.type === 'resurrect') {
                playedCard = cloneCard(simState.enemyDiscard[tIdx]);
                checkConstraints = false;
                if (simState.enemyDiscard[tIdx]) simState.enemyDiscard[tIdx] = null;
            }

            if (!playedCard) return null;

            if (checkConstraints) {
                if (hasSkillObj(playedCard, 'challenge') && simState.playerBoard[lIdx] === null) return null;
                if (hasSkillObj(playedCard, 'takeover') && simState.enemyBoard[lIdx] === null) return null;
                if (hasSkillObj(playedCard, 'apex') && !(simState.enemyBoard[lIdx] && hasSkillObj(simState.enemyBoard[lIdx], 'legendary'))) return null;
                if (hasSkillObj(playedCard, 'legendary') && lIdx !== 1) return null;
                
            }

            if (hasSkillObj(playedCard, 'equip') && simState.enemyBoard[lIdx]) {
                const targetCard = simState.enemyBoard[lIdx];
                targetCard.basePower = (targetCard.basePower || 0) + (playedCard.power || 0);
                targetCard.currentPower = (targetCard.currentPower || 0) + (playedCard.power || 0);
                let addedSkills = [];
                if (playedCard.skill && playedCard.skill !== 'none' && playedCard.skill !== 'equip') addedSkills.push({ id: playedCard.skill, value: playedCard.skillValue });
                if (playedCard.skills) playedCard.skills.forEach(s => { if (s.id !== 'equip') addedSkills.push({ id: s.id, value: s.value }); });
                mergeCardSkills(targetCard, addedSkills);
                let cLanesForEquip = action.cardTokenLanes ? [...action.cardTokenLanes] : null;
                addedSkills.forEach(sk => applyActiveSkillLogic(simState, 'red', lIdx, sk.id, sk.value, [], cLanesForEquip));
            } else {
                let activeCardForSkills = playedCard;
                const unionSkill = playedCard.skills && playedCard.skills.find(s => s.id === 'union');
                if (unionSkill && simState.enemyBoard[lIdx] && (simState.enemyBoard[lIdx].baseId === unionSkill.targetId || simState.enemyBoard[lIdx].id === unionSkill.targetId)) {
                    const masterData = CARD_MASTER.find(c => c.id === unionSkill.summonId) || CARD_MASTER.find(c => c.id === 'android');
                    let unionCard = JSON.parse(JSON.stringify(masterData));
                    unionCard.uid = 'sim_union_' + Math.floor(Math.random() * 1000000);
                    unionCard.owner = 'red';
                    unionCard.baseId = unionCard.id;
                    unionCard.basePower = unionCard.power;
                    unionCard.currentPower = unionCard.power;
                    unionCard.stunTurns = 0;
                    simState.enemyBoard[lIdx] = unionCard;
                    activeCardForSkills = unionCard;
                } else {
                    if (playedCard.currentPower === undefined || Number.isNaN(playedCard.currentPower) || (playedCard.currentPower <= 0 && (playedCard.power || 0) > 0)) {
                        playedCard.currentPower = playedCard.power || 0;
                        playedCard.basePower = playedCard.power || 0;
                    }
                    simState.enemyBoard[lIdx] = playedCard;
                }

                let skills = [];
                if (activeCardForSkills.skill && activeCardForSkills.skill !== 'none') {
                    if (activeCardForSkills.skill === 'choice' && action.choices && activeCardForSkills.choices) {
                        action.choices.forEach(idx => { if (activeCardForSkills.choices[idx]) skills.push({ id: activeCardForSkills.choices[idx].id, value: activeCardForSkills.choices[idx].value }); });
                    } else {
                        skills.push({ id: activeCardForSkills.skill, value: activeCardForSkills.skillValue });
                    }
                }
                if (Array.isArray(activeCardForSkills.skills)) {
                    activeCardForSkills.skills.forEach(sk => {
                        if (sk.id === 'choice') {
                            if (sk.choiceGroup === 2 && action.choices2 && activeCardForSkills.choices2) {
                                action.choices2.forEach(idx => { if (activeCardForSkills.choices2[idx]) skills.push({ id: activeCardForSkills.choices2[idx].id, value: activeCardForSkills.choices2[idx].value }); });
                            } else if (action.choices && activeCardForSkills.choices) {
                                action.choices.forEach(idx => { if (activeCardForSkills.choices[idx]) skills.push({ id: activeCardForSkills.choices[idx].id, value: activeCardForSkills.choices[idx].value }); });
                            }
                        } else {
                            skills.push(sk);
                        }
                    });
                }

                let cLanesForPass = action.cardTokenLanes ? [...action.cardTokenLanes] : null;
                skills.forEach(sk => {
                     applyActiveSkillLogic(simState, 'red', lIdx, sk.id, sk.value, [], cLanesForPass);
                });

                if (simState.enemyBoard[lIdx] && simState.enemyBoard[lIdx].currentPower <= 0) {
                    simState.enemyBoard[lIdx] = null;
                }
            }
        }

        if (isLeaderSkillPlay && skillOrderTiming === 'after' && leaderSkillActionStr) {
            simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
            applyLeaderSkillLogic(simState, 'red', leaderSkillActionStr, leaderSkillTokenLanes);
        }

        const hpBeforeCombat = simState.enemyHP;

        if (!(simState.extraTurnCount > 0)) {
            applyPassiveSkillLogic(simState, 'blue');
            simState.playerBoard.forEach(c => { if (c && c.stunTurns > 0) c.stunTurns--; });
            calculateCombatPhase(simState, 'blue');
            simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);
        } else {
            simState.extraTurnCount--;
            simState.combatDamageTaken = 0;
        }

        return simState;
    }

    let candidates = [];
    let passSimState = processActionSequence([{ type: 'pass' }]);
    if (passSimState) candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill: false, simState: passSimState });

    for (let i = 0; i < hand.length; i++) {
        let card = hand[i];
        let queues = buildCardPlayTree(card, i, 'play', hand, discard, [i], [], 0);
        
        for (let actionQ of queues) {
            if (actionQ.length === 0) continue;
            let simState = processActionSequence(actionQ);
            if (simState) {
                let firstAction = actionQ[0];
                let fChcs = [firstAction.choices, firstAction.choices2].filter(x => x !== undefined);
                let followUp = actionQ.slice(1).map(act => {
                    let adjusted = { ...act };
                    if ((adjusted.type === 'invite' || adjusted.type === 'play') && firstAction.type === 'play') {
                        if (adjusted.targetIdx > firstAction.targetIdx) adjusted.targetIdx -= 1;
                    }
                    return adjusted;
                });
                
                candidates.push({
                    index: firstAction.targetIdx,
                    lane: firstAction.laneIdx,
                    useSkill: false,
                    choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
                    cardTokenLanes: firstAction.cardTokenLanes,
                    actionQueue: followUp.length > 0 ? followUp : undefined,
                    simState: simState
                });
            }
        }
    }

    if (canUseSkill) {
        let tokenLanePatterns = [null];
        const action = skill.action;
        if (action === 'holy_march' || action === 'evil_march') {
            const avail = [0, 1, 2].filter(l => mySealedLanes[l] === 0);
            let combs = [];
            for (let l of avail) combs.push([l]);
            if (avail.length >= 2) combs.push(...getCombinations(avail, 2));
            tokenLanePatterns = combs.length > 0 ? combs : [null];
        } else if (['satan_avatar', 'dragon_summon', 'dragon_high_ritual', 'devilhunter_resurrect', 'dungeon_summon_leader'].includes(action)) {
            tokenLanePatterns = [[0], [1], [2]].filter(pattern => mySealedLanes[pattern[0]] === 0);
            if (action === 'dungeon_summon_leader' && GameState.enemyConfig && GameState.enemyConfig.leaderCardId) {
                const lc = CARD_MASTER.find(c => c.id === GameState.enemyConfig.leaderCardId);
                if (lc && hasSkillObj(lc, 'legendary')) tokenLanePatterns = [[1]].filter(pattern => mySealedLanes[pattern[0]] === 0);
                if (lc && hasSkillObj(lc, 'takeover')) tokenLanePatterns = tokenLanePatterns.filter(pattern => myBoard[pattern[0]] !== null);
                if (lc && hasSkillObj(lc, 'challenge')) tokenLanePatterns = tokenLanePatterns.filter(pattern => opBoard[pattern[0]] !== null);
            }
            if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
        } else if (action === 'targeted_destruction') {
            tokenLanePatterns = [0, 1, 2].filter(l => opBoard[l] !== null && !hasSkillObj(opBoard[l], 'immune')).map(l => [l]);
            if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
        } else if (action === 'elf_polarbear_combo') {
            const enemyOcc = [0, 1, 2].filter(l => opBoard[l] !== null && !hasSkillObj(opBoard[l], 'immune'));
            const myAvail = [0, 1, 2].filter(l => mySealedLanes[l] === 0);
            let combs = [];
            if (enemyOcc.length > 0 && myAvail.length > 0) {
                for (let e of enemyOcc) for (let m of myAvail) combs.push([e, m]);
                tokenLanePatterns = combs;
            } else tokenLanePatterns = [null];
        }

        const skillTimings = action === 'dungeon_summon_leader' || action === 'elf_polarbear_combo' ? ['before'] : ['before', 'after'];
        for (let i = 0; i < hand.length; i++) {
            let card = hand[i];
            for (let order of skillTimings) {
                for (let tokenLanes of tokenLanePatterns) {
                    let qs = buildCardPlayTree(card, i, 'play', hand, discard, [i], [], 0);
                    for (let actionQ of qs) {
                        if (actionQ.length === 0) continue;
                        let simState = processActionSequence(actionQ, true, action, tokenLanes, order);
                        if (simState) {
                            let fA = actionQ[0];
                            let fChcs = [fA.choices, fA.choices2].filter(x => x !== undefined);
                            candidates.push({
                                index: i, lane: fA.laneIdx, isOverwrite: myBoard[fA.laneIdx] !== null,
                                useSkill: true, tokenLanes, skillOrder: order,
                                choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
                                cardTokenLanes: fA.cardTokenLanes,
                                actionQueue: actionQ.slice(1).length > 0 ? actionQ.slice(1).map(act => {
                                    let adjusted = { ...act };
                                    if ((adjusted.type === 'invite' || adjusted.type === 'play') && fA.type === 'play') {
                                        if (adjusted.targetIdx > fA.targetIdx) adjusted.targetIdx -= 1;
                                    }
                                    return adjusted;
                                }) : undefined,
                                simState
                            });
                        }
                    }
                }
            }
        }
        for (let tokenLanes of tokenLanePatterns) {
            let simState = processActionSequence([{type: 'pass'}], true, action, tokenLanes, 'before');
            if (simState) candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill: true, tokenLanes, skillOrder: 'before', simState });
        }
    }

    const getAdvantage = (state, lane) => {
        let myPower = 0; let opPower = 0;
        for (let i = 0; i < 3; i++) {
            if (state.enemyBoard[i]) myPower += (Number(state.enemyBoard[i].currentPower) || Number(state.enemyBoard[i].power) || 0);
            if (state.playerBoard[i]) opPower += (Number(state.playerBoard[i].currentPower) || Number(state.playerBoard[i].power) || 0);
        }
        return myPower - opPower;
    };
    const getCountDiff = (state) => state.enemyBoard.filter(c => c).length - state.playerBoard.filter(c => c).length;
    const getSkillScore = (state) => {
        let score = 0;
        state.enemyBoard.forEach(c => { if(c) { if(c.skill==='draw')score+=1; if(c.skill==='heal')score+=2; if(c.skill==='invite')score+=2; }});
        return score;
    };

    candidates.forEach(c => {
        c.advDiff = getAdvantage(c.simState, c.lane);
        c.countDiff = getCountDiff(c.simState);
        c.skillScore = getSkillScore(c.simState);
        
        let pri = 0;
        if (c.lane === 0) pri = 3;
        else if (c.lane === 2) pri = 2;
        else if (c.lane === 1) pri = 1;
        c.lanePriority = pri;
    });

    let aliveCandidates = candidates.filter(c => c.simState.enemyHP > 0);
    if (aliveCandidates.length === 0) aliveCandidates = candidates;

    let finalCandidates = [];
    const winCandidates = aliveCandidates.filter(c => c.simState.playerHP <= 0);
    if (winCandidates.length > 0) finalCandidates = winCandidates;
    else {
        const safeCandidates = aliveCandidates.filter(c => c.simState.combatDamageTaken < 4);
        if (safeCandidates.length > 0) finalCandidates = safeCandidates;
        else {
            let minDmg = Math.min(...aliveCandidates.map(c => c.simState.combatDamageTaken));
            finalCandidates = aliveCandidates.filter(c => c.simState.combatDamageTaken === minDmg);
        }
    }

    finalCandidates.sort((a, b) => {
        if (a.advDiff !== b.advDiff) return b.advDiff - a.advDiff;
        if (a.countDiff !== b.countDiff) return b.countDiff - a.countDiff;
        if (a.simState.combatDamageTaken !== b.simState.combatDamageTaken) return a.simState.combatDamageTaken - b.simState.combatDamageTaken;
        if (a.skillScore !== b.skillScore) return b.skillScore - a.skillScore;
        if (a.lanePriority !== b.lanePriority) return b.lanePriority - a.lanePriority;
        return 0;
    });

    const topCandidate = finalCandidates[0];
    const topAdv = topCandidate.advDiff;
    const topCount = topCandidate.countDiff;
    const topDmg = topCandidate.simState.combatDamageTaken;
    const topSkill = topCandidate.skillScore;
    const topLanePri = topCandidate.lanePriority;
    const topQueueLen = topCandidate.actionQueue ? topCandidate.actionQueue.length : 0;
    
    const bestGroup = finalCandidates.filter(c => c.advDiff === topAdv && c.countDiff === topCount && c.simState.combatDamageTaken === topDmg && c.skillScore === topSkill && c.lanePriority === topLanePri && (c.actionQueue ? c.actionQueue.length : 0) === topQueueLen);

    const finalDecision = bestGroup[Math.floor(Math.random() * bestGroup.length)];

    console.log("AI Best Group Size:", bestGroup.length, "Best Adv:", topAdv, "Best Count Diff:", topCount, "Best Dmg:", topDmg, "Best LanePri:", topLanePri);
    GameState.aiDecision = finalDecision;
    return finalDecision;
}

export function evaluateAdhocTokenLanes(tokenCard, checkConstraints = true) {
    const sealedLanes = GameState.enemySealedLanes || [0, 0, 0];
    const allLanes = [0, 1, 2].filter(l => sealedLanes[l] === 0);
    const results = [];
    const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };
    const sortedLanes = [...allLanes].sort((a, b) => lanePriorityOrder[a] - lanePriorityOrder[b]);

    for (let l of sortedLanes) {
        if (GameState.enemyBoard[l] === null) results.push(l);
    }
    if (results.length === 0) for (let l of sortedLanes) results.push(l);
    return results;
}

export function getNormalTokenLanes(allLanes, owner, tokenCard, count, isLeaderSkill = false, canCancel = false, checkConstraints = true) {
    if (owner === 'red' && typeof GameState.aiDecision !== 'undefined' && GameState.aiDecision) {
        if (!isLeaderSkill && GameState.aiDecision.cardTokenLanes) {
            const decidedLanes = GameState.aiDecision.cardTokenLanes;
            delete GameState.aiDecision.cardTokenLanes;
            return decidedLanes.slice(0, count);
        } else if (isLeaderSkill && GameState.aiDecision.tokenLanes) {
            const decidedLanes = GameState.aiDecision.tokenLanes;
            delete GameState.aiDecision.tokenLanes;
            return decidedLanes.slice(0, count);
        }
    }
    if (canCancel && owner === 'red') return evaluateAdhocTokenLanes(tokenCard, checkConstraints);
    const results = [];
    const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };
    const sortedLanes = [...allLanes].sort((a, b) => lanePriorityOrder[a] - lanePriorityOrder[b]);
    for (let l of sortedLanes) {
        if (GameState.enemyBoard[l] === null && results.length < count) results.push(l);
    }
    if (results.length < count) {
        for (let l of sortedLanes) {
            if (!results.includes(l) && results.length < count) results.push(l);
        }
    }
    return results;
}

export function evaluateAIMoves(currentState) {
    const b = currentState.enemyBoard;
    const moveCards = [];
    for (let i = 0; i < 3; i++) {
        if (b[i] && hasSkill(b[i], 'move') && (b[i].stunTurns || 0) === 0) moveCards.push({ card: b[i], lane: i });
    }
    if (moveCards.length === 0) return null;
    let bestScore = -Infinity;
    let bestMoves = [];
    const generateMovePermutations = (boardMap, depth, currentMoves) => {
        if (depth === moveCards.length) {
            const simState = {
                playerBoard: currentState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                enemyBoard: boardMap.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                playerHP: currentState.playerHP, enemyHP: currentState.enemyHP,
                playerHand: [], enemyHand: [], playerDiscard: [], enemyDiscard: [], playerDeck: [], enemyDeck: [], extraTurnCount: 0, attackSkipCount: 0
            };
            calculateCombatPhase(simState, 'red');
            let score = (currentState.playerHP - simState.playerHP) * 5 + simState.enemyHP * 2;
            let myPow = 0; let opPow = 0;
            simState.enemyBoard.forEach(c => { if (c) myPow += (c.currentPower || 0); });
            simState.playerBoard.forEach(c => { if (c) opPow += (c.currentPower || 0); });
            score += myPow - opPow;
            const currentAllyCount = currentState.enemyBoard.filter(c => c !== null).length;
            const newAllyCount = boardMap.filter(c => c !== null).length;
            if (currentAllyCount > newAllyCount) score -= (currentAllyCount - newAllyCount) * 10;
            score -= currentMoves.length * 0.1;
            if (score > bestScore) { bestScore = score; bestMoves = currentMoves; }
            return;
        }
        const mCard = moveCards[depth];
        const mySealedLanes = GameState.enemySealedLanes || [0, 0, 0];
        const currentPos = boardMap.findIndex(c => c && c.id === mCard.card.id);
        if (currentPos === -1 || currentPos !== mCard.lane) {
            generateMovePermutations(boardMap, depth + 1, currentMoves); return;
        }
        const validTargets = [mCard.lane];
        if (mCard.lane > 0 && mySealedLanes[mCard.lane - 1] === 0) validTargets.push(mCard.lane - 1);
        if (mCard.lane < 2 && mySealedLanes[mCard.lane + 1] === 0) validTargets.push(mCard.lane + 1);
        for (let target of validTargets) {
            const nextBoard = [...boardMap];
            if (target !== mCard.lane) { nextBoard[target] = nextBoard[mCard.lane]; nextBoard[mCard.lane] = null; }
            const nextMoves = [...currentMoves];
            if (target !== mCard.lane) nextMoves.push({ from: mCard.lane, to: target });
            generateMovePermutations(nextBoard, depth + 1, nextMoves);
        }
    };
    generateMovePermutations([...b], 0, []);
    return bestMoves.length > 0 ? bestMoves : null;
}

export const getNormalDecision = getBestSimulatedMove;

export function simulateMove(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill = false, currentMySP, tokenLanes = null, skillOrder = 'before', choiceIndex = undefined, cardTokenLanes = null, checkConstraints = true, choiceIndex2 = undefined, actionQueue = undefined) {
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    let simState = {
        playerBoard: currentOpBoard.map(cloneCard),
        enemyBoard: currentMyBoard.map(cloneCard),
        playerHP: GameState.playerHP,
        enemyHP: currentMyHP,
        playerMaxHP: GameState.playerMaxHP,
        enemyMaxHP: GameState.enemyMaxHP,
        playerSP: GameState.playerSP,
        enemySP: currentMySP || 0,
        playerHand: GameState.playerHand.map(cloneCard),
        enemyHand: hand.map(cloneCard),
        playerDiscard: GameState.playerDiscard.map(cloneCard),
        enemyDiscard: GameState.enemyDiscard.map(cloneCard),
        playerDeck: GameState.playerDeck.map(cloneCard),
        enemyDeck: GameState.enemyDeck.map(cloneCard),
        extraTurnCount: GameState.extraTurnCount,
        attackSkipCount: GameState.attackSkipCount
    };

    if (useSkill && GameState.enemyConfig.leaderSkill) {
        simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
        applyLeaderSkillLogic(simState, 'red', GameState.enemyConfig.leaderSkill.action, tokenLanes);
    }
    
    if (handIdx !== -1) {
        const playedCard = cloneCard(simState.enemyHand[handIdx]);
        
        let cLanesForPass = cardTokenLanes ? [...cardTokenLanes] : null;

        if (checkConstraints && playedCard) {
            if (hasSkillObj(playedCard, 'challenge') && simState.playerBoard[laneIdx] === null) return null;
            if (hasSkillObj(playedCard, 'takeover') && simState.enemyBoard[laneIdx] === null) return null;
            if (hasSkillObj(playedCard, 'apex') && !(simState.enemyBoard[laneIdx] && hasSkillObj(simState.enemyBoard[laneIdx], 'legendary'))) return null;
            if (hasSkillObj(playedCard, 'legendary') && laneIdx !== 1) return null;
            if (!hasSkillObj(playedCard, 'takeover') && !hasSkillObj(playedCard, 'equip') && !hasSkillObj(playedCard, 'apex') && simState.enemyBoard[laneIdx] !== null) {
                if (!(playedCard.skills && playedCard.skills.find(s=>s.id==='union') && (simState.enemyBoard[laneIdx].baseId === playedCard.skills.find(s=>s.id==='union').targetId || simState.enemyBoard[laneIdx].id === playedCard.skills.find(s=>s.id==='union').targetId))) {
                    return null;
                }
            }
        }

        if (playedCard) {
            if (hasSkillObj(playedCard, 'equip') && simState.enemyBoard[laneIdx]) {
                const targetCard = simState.enemyBoard[laneIdx];
                targetCard.basePower = (targetCard.basePower||0) + (playedCard.power||0);
                targetCard.currentPower = (targetCard.currentPower||0) + (playedCard.power||0);
                let addedSkills = [];
                if (playedCard.skill && playedCard.skill!=='none' && playedCard.skill!=='equip') addedSkills.push({id:playedCard.skill, value:playedCard.skillValue});
                if (playedCard.skills) playedCard.skills.forEach(s=>{if(s.id!=='equip') addedSkills.push({id:s.id,value:s.value});});
                mergeCardSkills(targetCard, addedSkills);
                addedSkills.forEach(sk => applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value, [], cLanesForPass));
            } else {
                let activeCard = playedCard;
                const unionSkill = playedCard.skills && playedCard.skills.find(s=>s.id==='union');
                if (unionSkill && simState.enemyBoard[laneIdx] && (simState.enemyBoard[laneIdx].baseId === unionSkill.targetId || simState.enemyBoard[laneIdx].id === unionSkill.targetId)) {
                    const masterData = CARD_MASTER.find(c=>c.id===unionSkill.summonId) || CARD_MASTER.find(c=>c.id==='android');
                    let uc = JSON.parse(JSON.stringify(masterData));
                    uc.owner='red'; uc.baseId=uc.id; uc.currentPower=uc.power; uc.basePower=uc.power; uc.stunTurns=0;
                    simState.enemyBoard[laneIdx] = uc;
                    activeCard = uc;
                } else {
                    if (playedCard.currentPower===undefined || Number.isNaN(playedCard.currentPower)) {
                        playedCard.currentPower=playedCard.power||0; playedCard.basePower=playedCard.power||0;
                    }
                    simState.enemyBoard[laneIdx] = playedCard;
                }
                let skills = [];
                if (activeCard.skill && activeCard.skill !== 'none') {
                    if (activeCard.skill === 'choice' && choiceIndex !== undefined && activeCard.choices) {
                        let idxs = Array.isArray(choiceIndex) ? choiceIndex : [choiceIndex];
                        idxs.forEach(idx => { if(activeCard.choices[idx]) skills.push({id:activeCard.choices[idx].id, value:activeCard.choices[idx].value}); });
                    } else skills.push({id:activeCard.skill, value:activeCard.skillValue});
                }
                if (Array.isArray(activeCard.skills)) {
                    activeCard.skills.forEach(sk => {
                        if (sk.id === 'choice') {
                            let cIdx = sk.choiceGroup === 2 ? choiceIndex2 : choiceIndex;
                            let cArr = sk.choiceGroup === 2 ? activeCard.choices2 : activeCard.choices;
                            if (cIdx !== undefined && cArr) {
                                let idxs = Array.isArray(cIdx) ? cIdx : [cIdx];
                                idxs.forEach(i => { if(cArr[i]) skills.push({id:cArr[i].id, value:cArr[i].value}); });
                            }
                        } else skills.push(sk);
                    });
                }
                skills.forEach(sk => applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value, [], cLanesForPass));
                if (simState.enemyBoard[laneIdx] && simState.enemyBoard[laneIdx].currentPower <= 0) simState.enemyBoard[laneIdx] = null;
            }
        }
    }

    const hpBeforeCombat = simState.enemyHP;
    if (!(simState.extraTurnCount > 0)) {
        applyPassiveSkillLogic(simState, 'blue');
        simState.playerBoard.forEach(c => { if(c && c.stunTurns>0) c.stunTurns--; });
        calculateCombatPhase(simState, 'blue');
        simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);
    } else {
        simState.extraTurnCount--;
        simState.combatDamageTaken = 0;
    }
    return simState;
}

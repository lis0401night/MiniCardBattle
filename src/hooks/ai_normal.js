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


    function buildCardPlayTree(card, sourceIdx, sourceType, originalHand, originalDiscard, usedHand, usedDiscard, depth, forcedLane = undefined) {
        if (depth >= 2) return [[]];

        let availableLanes = [0, 1, 2].filter(l => mySealedLanes[l] === 0);
        if (GameState.turnCount === 1 && GameState.firstPlayer === 'red' && depth === 0) availableLanes = availableLanes.filter(l => l === 1);

        if (forcedLane !== undefined) {
            if (mySealedLanes[forcedLane] === 1) return [[]];
            availableLanes = [forcedLane];
        } else if (depth > 0) {
            availableLanes.push(-1);
        }

        if (availableLanes.length === 0) return [[]];

        let choiceCombinations = [undefined];
        let choice2Combinations = [undefined];
        if (hasSkill(card, 'choice')) {
            if (Array.isArray(card.choices)) {
                let cc = 1;
                if (card.skill === 'choice') cc = card.skillValue || 1;
                else if (card.skills) { const c = card.skills.find(s => s.id === 'choice'); if (c) cc = c.value || 1; }
                const idxs = card.choices.map((_, i) => i);
                choiceCombinations = getCombinations(idxs, Math.min(idxs.length, cc));
            }
            if (Array.isArray(card.choices2)) {
                let cc2 = 1;
                const c2 = card.skills ? card.skills.find(s => s.id === 'choice' && s.choiceGroup === 2) : null;
                if (c2) cc2 = c2.value || 1;
                const idxs2 = card.choices2.map((_, i) => i);
                choice2Combinations = getCombinations(idxs2, Math.min(idxs2.length, cc2));
            }
        }

        // --- ループの外での静的な事前計算を削除し、内部で動的に計算するように変更 ---

        let branches = [];
        for (let lane of availableLanes) {
            for (let c1 of choiceCombinations) {
                for (let c2 of choice2Combinations) {
                    // --- 動的な配置/ターゲットパターンの生成 ---
                    let tc = 0;
                    let tokenTargetCount = 0;

                    // 基本性能からの集計
                    if (hasSkill(card, 'crush') || hasSkill(card, 'dispel') || hasSkill(card, 'snipe') || hasSkill(card, 'artillery') || hasSkill(card, 'seal')) tokenTargetCount += (card.skillValue || 1);
                    if (hasSkill(card, 'salvage') || hasSkill(card, 'resurrect')) tokenTargetCount += 1;
                    if (hasSkill(card, 'summon')) tc += (card.skillValue || 1);
                    if (hasSkill(card, 'clone')) tc += (card.skillValue || 1);
                    if (hasSkill(card, 'call') || hasSkill(card, 'metamorph')) tc += 1;

                    // 選択されたスキル（c1, c2）からの合算
                    const countInChoices = (arr, group) => {
                        if (!group) return;
                        arr.forEach(idx => {
                            const sk = group[idx];
                            if (!sk) return;
                            if (['crush', 'dispel', 'snipe', 'artillery', 'seal'].includes(sk.id)) tokenTargetCount += (sk.value || 1);
                            if (['salvage', 'resurrect'].includes(sk.id)) tokenTargetCount += 1;
                            if (sk.id === 'summon' || sk.id === 'clone') tc += (sk.value || 1);
                            if (sk.id === 'call' || sk.id === 'metamorph') tc += 1;
                        });
                    };
                    countInChoices(c1, card.choices);
                    countInChoices(c2, card.choices2);

                    let tokenLanePatterns = [null];
                    if (tc > 0) {
                        let possibleLanes = [0, 1, 2].filter(l => mySealedLanes[l] === 0);
                        let combs = []; // 配置は0件不可（最低限tc分、あるいは全埋め）
                        for (let k = Math.min(possibleLanes.length, tc); k <= Math.min(possibleLanes.length, tc); k++) {
                            combs.push(...getCombinations(possibleLanes, k));
                        }
                        if (combs.length > 0) tokenLanePatterns = combs;
                    } else if (tokenTargetCount > 0) {
                        let occupied = opBoard.map((c, i) => c ? i : -1).filter(i => i !== -1);
                        let combs = [];
                        for (let k = 1; k <= Math.min(occupied.length, tokenTargetCount); k++) {
                            combs.push(...getCombinations(occupied, k));
                        }
                        if (combs.length > 0) tokenLanePatterns = combs;
                    }

                    for (let tLanes of tokenLanePatterns) {
                        let node = {
                            type: sourceType,
                            targetIdx: sourceIdx,
                            laneIdx: lane,
                            choices: c1 !== undefined ? [...c1] : undefined,
                            choices2: c2 !== undefined ? [...c2] : undefined,
                            cardTokenLanes: tLanes && tLanes.length > 0 ? [...tLanes] : undefined
                        };

                        // 発動するスキル群を特定（トップレベル + 選択されたchoice）
                        let effectiveSkills = [];
                        if (hasSkill(card, 'invite')) effectiveSkills.push({ id: 'invite', value: card.skillValue || 1 });
                        if (hasSkill(card, 'resurrect')) effectiveSkills.push({ id: 'resurrect', value: card.skillValue || 1 });
                        if (card.skills) {
                            card.skills.forEach(s => {
                                if (s.id === 'invite' || s.id === 'resurrect') effectiveSkills.push(s);
                            });
                        }
                        if (c1) c1.forEach(idx => { if (card.choices && card.choices[idx]) effectiveSkills.push(card.choices[idx]); });
                        if (c2) c2.forEach(idx => { if (card.choices2 && card.choices2[idx]) effectiveSkills.push(card.choices2[idx]); });

                        // ターゲット選択を伴うスキルを抽出（複数ある場合は最初の1つを優先）
                        let targetSkill = effectiveSkills.find(s => s.id === 'invite' || s.id === 'resurrect');

                        if (depth < 2 && targetSkill) {
                            // ... (以下既存の再帰処理 ...
                            if (targetSkill.id === 'invite') {
                                let addedInvite = false;
                                for (let i = 0; i < originalHand.length; i++) {
                                    if (usedHand.includes(i)) continue;
                                    let childHandCard = originalHand[i];
                                    let childQueues = buildCardPlayTree(childHandCard, i, 'invite', originalHand, originalDiscard, [...usedHand, i], usedDiscard, depth + 1, lane);
                                    for (let cq of childQueues) {
                                        if (cq.length === 0) branches.push([node]); else branches.push([node, ...cq]);
                                        addedInvite = true;
                                    }
                                }
                                if (!addedInvite) branches.push([node]);
                            } else if (targetSkill.id === 'resurrect') {
                                let maxPow = targetSkill.value || 1;
                                let addedRes = false;
                                for (let i = 0; i < originalDiscard.length; i++) {
                                    if (usedDiscard.includes(i)) continue;
                                    let resCard = originalDiscard[i];
                                    if ((resCard.power || 0) > maxPow || resCard.isToken) continue;
                                    let childQueues = buildCardPlayTree(resCard, i, 'resurrect', originalHand, originalDiscard, usedHand, [...usedDiscard, i], depth + 1);
                                    for (let cq of childQueues) {
                                        if (cq.length === 0) branches.push([node]); else branches.push([node, ...cq]);
                                        addedRes = true;
                                    }
                                }
                                if (!addedRes) branches.push([node]);
                            }
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
            enemyDeck: [], // 思考フェーズでは未来のドロー（号令等含む）を予知させない
            extraTurnCount: GameState.extraTurnCount,
            attackSkipCount: GameState.attackSkipCount
        };

        if (isLeaderSkillPlay && skillOrderTiming === 'before' && leaderSkillActionStr) {
            simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
            applyLeaderSkillLogic(simState, 'red', leaderSkillActionStr, leaderSkillTokenLanes);
            if (simState._actionQueue && simState._actionQueue.length > 0) {
                actionQueue.unshift(...simState._actionQueue);
                delete simState._actionQueue;
            }
        }

        for (let action of actionQueue) {
            if (action.type === 'pass') continue;

            const tIdx = action.targetIdx;
            const lIdx = action.laneIdx;
            let playedCard = null;

            if (mySealedLanes[lIdx] === 1) return null;

            let checkConstraints = false;
            let triggerSkills = true;

            if (action.type === 'play' || action.type === 'invite') {
                playedCard = cloneCard(simState.enemyHand[tIdx]);
                checkConstraints = true;
                if (simState.enemyHand[tIdx]) simState.enemyHand[tIdx] = null;
            } else if (action.type === 'resurrect') {
                playedCard = cloneCard(simState.enemyDiscard[tIdx]);
                checkConstraints = false;
                triggerSkills = false;
                if (playedCard) playedCard.skillTriggered = true;
                if (simState.enemyDiscard[tIdx]) simState.enemyDiscard[tIdx] = null;
            }

            if (!playedCard) return null;

            if (checkConstraints) {
                if (hasSkill(playedCard, 'challenge') && simState.playerBoard[lIdx] === null) return null;
                if (hasSkill(playedCard, 'takeover') && simState.enemyBoard[lIdx] === null) return null;
                if (hasSkill(playedCard, 'legendary') && lIdx !== 1) return null;
                if (hasSkill(playedCard, 'apex') && !(simState.enemyBoard[lIdx] && hasSkill(simState.enemyBoard[lIdx], 'legendary'))) return null;

            }

            if (hasSkill(playedCard, 'equip') && simState.enemyBoard[lIdx]) {
                const targetCard = simState.enemyBoard[lIdx];
                targetCard.basePower = (targetCard.basePower || 0) + (playedCard.power || 0);
                targetCard.currentPower = (targetCard.currentPower || 0) + (playedCard.power || 0);
                let addedSkills = [];
                if (playedCard.skill && playedCard.skill !== 'none' && playedCard.skill !== 'equip') addedSkills.push({ id: playedCard.skill, value: playedCard.skillValue });
                if (playedCard.skills) playedCard.skills.forEach(s => { if (s.id !== 'equip') addedSkills.push({ id: s.id, value: s.value }); });
                mergeCardSkills(targetCard, addedSkills);
                let cLanesForEquip = action.cardTokenLanes ? [...action.cardTokenLanes] : null;
                applyActiveSkillLogic(simState, 'red', lIdx, 'equip', 0, [], cLanesForEquip); // 装備によるバフと付随スキルのシミュレート
                if (simState._actionQueue && simState._actionQueue.length > 0) {
                    actionQueue.push(...simState._actionQueue);
                    delete simState._actionQueue;
                }
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
                if (triggerSkills && !activeCardForSkills.skillTriggered) {
                    skills.forEach(sk => {
                        applyActiveSkillLogic(simState, 'red', lIdx, sk.id, sk.value, [], cLanesForPass);
                    });
                    if (simState._actionQueue && simState._actionQueue.length > 0) {
                        actionQueue.push(...simState._actionQueue);
                        delete simState._actionQueue;
                    }
                }

                if (simState.enemyBoard[lIdx] && simState.enemyBoard[lIdx].currentPower <= 0) {
                    simState.enemyBoard[lIdx] = null;
                }
            }
        }

        if (isLeaderSkillPlay && skillOrderTiming === 'after' && leaderSkillActionStr) {
            simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
            applyLeaderSkillLogic(simState, 'red', leaderSkillActionStr, leaderSkillTokenLanes);
            if (simState._actionQueue && simState._actionQueue.length > 0) {
                actionQueue.push(...simState._actionQueue);
                delete simState._actionQueue;
            }
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
                if (lc && hasSkill(lc, 'legendary')) tokenLanePatterns = [[1]].filter(pattern => mySealedLanes[pattern[0]] === 0);
                if (lc && hasSkill(lc, 'takeover')) tokenLanePatterns = tokenLanePatterns.filter(pattern => myBoard[pattern[0]] !== null);
                if (lc && hasSkill(lc, 'challenge')) tokenLanePatterns = tokenLanePatterns.filter(pattern => opBoard[pattern[0]] !== null);
            }
            if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
        } else if (action === 'targeted_destruction') {
            tokenLanePatterns = [0, 1, 2].filter(l => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune')).map(l => [l]);
            if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
        } else if (action === 'elf_polarbear_combo') {
            const enemyOcc = [0, 1, 2].filter(l => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune'));
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
            let simState = processActionSequence([{ type: 'pass' }], true, action, tokenLanes, 'before');
            if (simState) candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill: true, tokenLanes, skillOrder: 'before', simState });
        }
    }

    candidates.forEach(c => {
        c.score = evaluateSimState(c.simState);
        // レーン優先順位を加味 (左 0=3点, 右 2=2点, 中央 1=1点)
        let pri = 0;
        if (c.lane === 0) pri = 3;
        else if (c.lane === 2) pri = 2;
        else if (c.lane === 1) pri = 1;
        c.lanePriority = pri;
        // スコアに僅かな優先度ボーナスを乗せ、同点時に「左→右→中央」を選びやすくする
        c.score += (pri * 0.01);
    });

    // スコア順、次いでアクションの長さ順でソート
    candidates.sort((a, b) => {
        if (Math.abs(a.score - b.score) > 0.001) return b.score - a.score;
        const aLen = a.actionQueue ? a.actionQueue.length : 0;
        const bLen = b.actionQueue ? b.actionQueue.length : 0;
        return bLen - aLen;
    });

    const bestScore = candidates[0].score;
    const bestGroup = candidates.filter(c => Math.abs(c.score - bestScore) < 0.001);

    const finalDecision = bestGroup[Math.floor(Math.random() * bestGroup.length)];

    console.log("AI Best Group Size:", bestGroup.length, "Best Score:", bestScore, "Lane:", finalDecision.lane);
    GameState.aiDecision = finalDecision;
    return finalDecision;
}

/**
 * 盤面の状態を評価し、スコアを返す (AI用)
 */
/**
 * 【AI思考の核】盤面の状態をティア（生存階層）とスコアで厳密に評価する
 * 
 * 優先順位（上にあるほど絶対的）:
 * 1. 生存ティア (Tier 1:安全 > Tier 2:危険 > Tier 3:敗北)
 * 2. 勝利判定 (相手HPを0以下にできるなら最優先)
 * 3. 盤面パワー合計差 (自分の生存パワー総和 - 相手の生存パワー総和)
 * 4. ユーティリティ価値 (ドローや回復スキルの期待値)
 * 5. タイブレーク (生存枚数、およびレーン優先順位)
 * 
 * ※重要: 「代償(sacrifice)」スキルによる自傷ダメージは、ティア判定（4ダメージ以上の警戒）からは除外する。
 * これは代償が「戦略的なコスト」であり、敵の攻撃による「戦術的な脅威」とは別物であるため。
 */
export function evaluateSimState(state) {
    let myPower = 0; 
    let opPower = 0;
    let utilityScore = 0;

    // 1. 盤面のパワー合計とスキルの期待値を算出
    for (let i = 0; i < 3; i++) {
        if (state.enemyBoard[i]) {
            const c = state.enemyBoard[i];
            // 戦闘後の生存パワーを加算（currentPowerが0なら死体なので加算しない）
            myPower += (c.currentPower !== undefined ? Number(c.currentPower) : (Number(c.power) || 0));
            
            // ユーティリティスキルの加点（手札やHPの維持を補助的に評価）
            if (!c.skillTriggered) {
                if (c.skill === 'draw') utilityScore += 10;
                if (c.skill === 'heal') utilityScore += 15;
                if (Array.isArray(c.skills)) {
                    c.skills.forEach(sk => {
                        if (sk.id === 'draw') utilityScore += 10;
                        if (sk.id === 'heal') utilityScore += 15;
                    });
                }
            }
        }
        if (state.playerBoard[i]) {
            const opC = state.playerBoard[i];
            opPower += (opC.currentPower !== undefined ? Number(opC.currentPower) : (Number(opC.power) || 0));
        }
    }

    // 2. ティア（生存階層）の判定
    // 自分のHPが0以下なら最悪の「Tier 3」
    let tier = 1;
    if (state.enemyHP <= 0) {
        tier = 3;
    } 
    // 相手からの「戦闘ダメージ」が4以上なら警戒すべき「Tier 2」
    // ここで state.combatDamageTaken を参照することで、代償ダメージを含まない純粋な脅威を判定する
    else if ((state.combatDamageTaken || 0) >= 4) {
        tier = 2;
    }

    // 3. 最終スコアの組み立て
    // ティアが最優先、その中でパワー差、スキル価値、枚数差を考慮する
    // ティアごとに大きなベース値（10000点刻み）を持たせることで上位ルールを死守する
    let score = (3 - tier) * 10000;

    // 勝利判定：ティア内での最優先（1000点の特大ボーナス）
    if (state.playerHP <= 0) score += 5000;

    // パワー合計差（メイン評価軸）
    score += (myPower - opPower) * 10;

    // スキル価値
    score += utilityScore;

    // 生存枚数（タイブレーク用：1枚につき5点）
    const myCount = state.enemyBoard.filter(c => c && (c.currentPower === undefined || c.currentPower > 0)).length;
    const opCount = state.playerBoard.filter(c => c && (c.currentPower === undefined || c.currentPower > 0)).length;
    score += (myCount - opCount) * 5;

    return score;
}

export function evaluateAdhocTokenLanes(tokenCard, checkConstraints = true) {
    const sealedLanes = GameState.enemySealedLanes || [0, 0, 0];
    const allLanes = [0, 1, 2].filter(l => sealedLanes[l] === 0);
    // 配置可能なレーンを抽出
    let validLanes = allLanes.filter(l => {
        if (checkConstraints && tokenCard) {
            if (hasSkill(tokenCard, 'legendary') && l !== 1) return false;
            if (hasSkill(tokenCard, 'takeover') && GameState.enemyBoard[l] === null) return false;
            if (hasSkill(tokenCard, 'challenge') && GameState.playerBoard[l] === null) return false;
            if (hasSkill(tokenCard, 'apex') && !(GameState.enemyBoard[l] && hasSkill(GameState.enemyBoard[l], 'legendary'))) return false;
        }
        return true;
    });

    const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 }; // 左(1) > 右(2) > 中央(3) の優先順

    if (validLanes.length === 0) return [];

    // シミュレーション評価
    // 1. tokenCardがある場合: そのレーンにカードを置いた後の盤面を評価
    // 2. tokenCardがない場合: そのレーンの相手カードを「削除」した後の盤面を評価（破壊スキル用）
    const scores = validLanes.map(l => {
        const simState = {
            playerBoard: GameState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            enemyBoard: GameState.enemyBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            playerHP: GameState.playerHP,
            enemyHP: GameState.enemyHP,
            playerMaxHP: GameState.playerMaxHP,
            enemyMaxHP: GameState.enemyMaxHP,
            playerSP: GameState.playerSP,
            enemySP: GameState.enemySP || 0,
            playerHand: GameState.playerHand.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            enemyHand: GameState.enemyHand.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            playerDiscard: GameState.playerDiscard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            enemyDiscard: GameState.enemyDiscard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            playerDeck: GameState.playerDeck.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            enemyDeck: GameState.enemyDeck.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            extraTurnCount: GameState.extraTurnCount,
            attackSkipCount: GameState.attackSkipCount
        };

        if (tokenCard) {
            // 配置シミュレーション
            const played = JSON.parse(JSON.stringify(tokenCard));
            simState.enemyBoard[l] = played;

            // リナのスキル（ヴォイテク配置）の場合、破壊効果も同時にシミュレートしてトータルのアドバンテージを評価させる
            if (tokenCard.id === 'token_polarbear') {
                let maxOppP = -1;
                let targetL = -1;
                for (let i = 0; i < 3; i++) {
                    if (simState.playerBoard[i] && simState.playerBoard[i].currentPower > maxOppP) {
                        maxOppP = simState.playerBoard[i].currentPower;
                        targetL = i;
                    }
                }
                if (targetL !== -1) {
                    simState.playerBoard[targetL].currentPower = 0;
                }
            }

            let skills = [];
            if (played.skill && played.skill !== 'none') skills.push({ id: played.skill, value: played.skillValue });
            if (Array.isArray(played.skills)) skills = skills.concat(played.skills);
            skills.forEach(sk => applyActiveSkillLogic(simState, 'red', l, sk.id, sk.value));
        } else {
            // 破壊シミュレーション (ターゲット対象を破壊したと仮定)
            if (simState.playerBoard[l]) {
                simState.playerBoard[l].currentPower = 0;
            }
        }

        const hpBeforeCombat = simState.enemyHP;
        applyPassiveSkillLogic(simState, 'blue');
        calculateCombatPhase(simState, 'blue'); 
        simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);
        
        let score = evaluateSimState(simState);
        // タイブレーク：左 > 右 > 中央
        score += (0.1 / lanePriorityOrder[l]);

        return { lane: l, score };
    });

    // 最高スコアのレーンを抽出
    scores.sort((a, b) => b.score - a.score);
    const topScore = scores[0].score;
    return scores.filter(s => Math.abs(s.score - topScore) < 0.001).map(s => s.lane);
}

export function getNormalTokenLanes(allLanes, owner, tokenCard, count, isLeaderSkill = false, canCancel = false, checkConstraints = true) {
    if (owner === 'red') {
        // 常に最新の盤面状況と判明したカード情報に基づき、アドホックにシミュレーションして決定する
        const results = evaluateAdhocTokenLanes(tokenCard, checkConstraints);
        if (results.length > 0) return results.slice(0, count);
    }

    // プレイヤー用または最終フォールバック
    const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };
    const sortedLanes = [...allLanes].sort((a, b) => lanePriorityOrder[a] - lanePriorityOrder[b]);
    const results = [];
    for (let l of sortedLanes) {
        if (checkConstraints && tokenCard) {
            if (hasSkill(tokenCard, 'legendary') && l !== 1) continue;
            if (hasSkill(tokenCard, 'takeover') && GameState.enemyBoard[l] === null) continue;
            if (hasSkill(tokenCard, 'challenge') && GameState.playerBoard[l] === null) continue;
            if (hasSkill(tokenCard, 'apex') && !(GameState.enemyBoard[l] && hasSkill(GameState.enemyBoard[l], 'legendary'))) continue;
        }
        if (GameState.enemyBoard[l] === null && results.length < count) results.push(l);
    }
    if (results.length < count) {
        for (let l of sortedLanes) {
            if (checkConstraints && tokenCard) {
                if (hasSkill(tokenCard, 'legendary') && l !== 1) continue;
                if (hasSkill(tokenCard, 'takeover') && GameState.enemyBoard[l] === null) continue;
                if (hasSkill(tokenCard, 'challenge') && GameState.playerBoard[l] === null) continue;
                if (hasSkill(tokenCard, 'apex') && !(GameState.enemyBoard[l] && hasSkill(GameState.enemyBoard[l], 'legendary'))) continue;
            }
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

        if (laneIdx !== -1) {
            if (checkConstraints && playedCard) {
                if (hasSkill(playedCard, 'challenge') && simState.playerBoard[laneIdx] === null) return null;
                if (hasSkill(playedCard, 'takeover') && simState.enemyBoard[laneIdx] === null) return null;
                if (hasSkill(playedCard, 'legendary') && laneIdx !== 1) return null;
                if (hasSkill(playedCard, 'apex') && !(simState.enemyBoard[laneIdx] && hasSkill(simState.enemyBoard[laneIdx], 'legendary'))) return null;
                if (!hasSkill(playedCard, 'takeover') && !hasSkill(playedCard, 'equip') && !hasSkill(playedCard, 'apex') && simState.enemyBoard[laneIdx] !== null) {
                    if (!(playedCard.skills && playedCard.skills.find(s => s.id === 'union') && (simState.enemyBoard[laneIdx].baseId === playedCard.skills.find(s => s.id === 'union').targetId || simState.enemyBoard[laneIdx].id === playedCard.skills.find(s => s.id === 'union').targetId))) {
                        return null;
                    }
                }
            }

            if (playedCard) {
                if (hasSkill(playedCard, 'equip') && simState.enemyBoard[laneIdx]) {
                    const targetCard = simState.enemyBoard[laneIdx];
                    targetCard.basePower = (targetCard.basePower || 0) + (playedCard.power || 0);
                    targetCard.currentPower = (targetCard.currentPower || 0) + (playedCard.power || 0);
                    let addedSkills = [];
                    if (playedCard.skill && playedCard.skill !== 'none' && playedCard.skill !== 'equip') addedSkills.push({ id: playedCard.skill, value: playedCard.skillValue });
                    if (playedCard.skills) playedCard.skills.forEach(s => { if (s.id !== 'equip') addedSkills.push({ id: s.id, value: s.value }); });
                    mergeCardSkills(targetCard, addedSkills);
                    addedSkills.forEach(sk => applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value, [], cLanesForPass));
                } else {
                    let activeCard = playedCard;
                    const unionSkill = playedCard.skills && playedCard.skills.find(s => s.id === 'union');
                    if (unionSkill && simState.enemyBoard[laneIdx] && (simState.enemyBoard[laneIdx].baseId === unionSkill.targetId || simState.enemyBoard[laneIdx].id === unionSkill.targetId)) {
                        const masterData = CARD_MASTER.find(c => c.id === unionSkill.summonId) || CARD_MASTER.find(c => c.id === 'android');
                        let uc = JSON.parse(JSON.stringify(masterData));
                        uc.owner = 'red'; uc.baseId = uc.id; uc.currentPower = uc.power; uc.basePower = uc.power; uc.stunTurns = 0;
                        simState.enemyBoard[laneIdx] = uc;
                        activeCard = uc;
                    } else {
                        if (playedCard.currentPower === undefined || Number.isNaN(playedCard.currentPower)) {
                            playedCard.currentPower = playedCard.power || 0; playedCard.basePower = playedCard.power || 0;
                        }
                        simState.enemyBoard[laneIdx] = playedCard;
                    }
                    let skills = [];
                    if (activeCard.skill && activeCard.skill !== 'none') {
                        if (activeCard.skill === 'choice' && choiceIndex !== undefined && activeCard.choices) {
                            let idxs = Array.isArray(choiceIndex) ? choiceIndex : [choiceIndex];
                            idxs.forEach(idx => { if (activeCard.choices[idx]) skills.push({ id: activeCard.choices[idx].id, value: activeCard.choices[idx].value }); });
                        } else skills.push({ id: activeCard.skill, value: activeCard.skillValue });
                    }
                    if (Array.isArray(activeCard.skills)) {
                        activeCard.skills.forEach(sk => {
                            if (sk.id === 'choice') {
                                let cIdx = sk.choiceGroup === 2 ? choiceIndex2 : choiceIndex;
                                let cArr = sk.choiceGroup === 2 ? activeCard.choices2 : activeCard.choices;
                                if (cIdx !== undefined && cArr) {
                                    let idxs = Array.isArray(cIdx) ? cIdx : [cIdx];
                                    idxs.forEach(i => { if (cArr[i]) skills.push({ id: cArr[i].id, value: cArr[i].value }); });
                                }
                            } else skills.push(sk);
                        });
                    }
                    if (!activeCard.skillTriggered) {
                        skills.forEach(sk => applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value, [], cLanesForPass));
                    }
                    if (simState.enemyBoard[laneIdx] && simState.enemyBoard[laneIdx].currentPower <= 0) simState.enemyBoard[laneIdx] = null;
                }
            }
        }
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

import { hasSkill, getSeededRandom, mergeCardSkills } from '../utils/gameUtils.js';
import { applyActiveSkillLogic, applyLeaderSkillLogic, calculateCombatPhase, applyPassiveSkillLogic } from './engine.js';
import { GameState } from './gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';

/**
 * ミニカードバトル - 敵AIロジック（中級・シミュレーション版）
 */

/**
 * 中級以上の意思決定
 * @returns {Object} { index, lane, isOverwrite, useSkill }
 */
export function getNormalDecision() {
    return getBestSimulatedMove(GameState.enemyHand, GameState.enemyBoard, GameState.playerBoard, GameState.enemyHP, GameState.enemySP);
}

/**
 * 全パターンのシミュレーションを行い、最善手を返す
 */
export function getBestSimulatedMove(hand, myBoard, opBoard, myHP, mySP) {
    let candidates = [];
    const skill = GameState.enemyConfig.leaderSkill;
    let canUseSkill = skill && mySP >= skill.cost && (skill.action !== 'abyss_ritual' && skill.action !== 'dark_ritual' && skill.action !== 'time_stop');
    // マリア（悪魔狩り）の場合、墓地に復活対象がいなければ空撃ちしない
    if (canUseSkill && skill.action === 'devilhunter_resurrect') {
        const discard = GameState.enemyDiscard || [];
        canUseSkill = discard.some(c => (c.power || 0) <= 10 && !c.isToken);
    }

    // ダンジョン用召喚スキルで、生贄（takeover）の場合、自分の場にカードが1枚もなければ空撃ちしない
    if (canUseSkill && skill.action === 'dungeon_summon_leader' && GameState.enemyConfig.leaderCardId) {
        const lc = CARD_MASTER.find(c => c.id === GameState.enemyConfig.leaderCardId);
        if (lc && (lc.skill === 'takeover' || (lc.skills && lc.skills.some(s => s.id === 'takeover')))) {
            if (!myBoard.some(c => c !== null)) {
                canUseSkill = false;
            }
        }
    }

    // 対象破壊（targeted_destruction）の場合、相手の場に破壊可能（immuneでない）カードが存在しなければ空撃ちしない
    if (canUseSkill && skill.action === 'targeted_destruction') {
        if (!opBoard.some(c => c !== null && !hasSkill(c, 'immune'))) {
            canUseSkill = false;
        }
    }

    // トークン配置の組合せを生成するヘルパー
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

    const mySealedLanes = GameState.enemySealedLanes || [0, 0, 0];

    const testMoves = (useSkill) => {
        let tokenLanePatterns = [null]; // スキルを使わない、またはトークン召喚でない場合

        if (useSkill) {
            const action = skill.action;
            if (action === 'holy_march') {
                const emptyLanes = [0, 1, 2].filter(l => myBoard[l] === null && mySealedLanes[l] === 0);
                tokenLanePatterns = getCombinations(emptyLanes, Math.min(emptyLanes.length, 2));
            } else if (action === 'satan_avatar' || action === 'dragon_summon' || action === 'dragon_high_ritual' || action === 'devilhunter_resurrect' || action === 'dungeon_summon_leader') {
                // 上書きも考慮するため全レーンをシミュレーション対象とする
                tokenLanePatterns = [[0], [1], [2]].filter(pattern => mySealedLanes[pattern[0]] === 0);

                // dungeon_summon_leaderの場合はカード自体の制約（伝説・生贄）を適用して候補を絞る
                if (action === 'dungeon_summon_leader' && GameState.enemyConfig && GameState.enemyConfig.leaderCardId) {
                    const lc = CARD_MASTER.find(c => c.id === GameState.enemyConfig.leaderCardId);
                    if (lc) {
                        if (hasSkill(lc, 'legendary')) {
                            // 伝説は中央レーン（[1]）のみ
                            tokenLanePatterns = [[1]].filter(pattern => mySealedLanes[pattern[0]] === 0);
                        }
                        if (hasSkill(lc, 'takeover')) {
                            // 生贄はすでにカードが存在するレーンのみ（上書き専用）
                            tokenLanePatterns = tokenLanePatterns.filter(pattern => myBoard[pattern[0]] !== null);
                        }
                        if (hasSkill(lc, 'challenge')) {
                            tokenLanePatterns = tokenLanePatterns.filter(pattern => opBoard[pattern[0]] !== null);
                        }
                    }
                }

                if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
            } else if (action === 'targeted_destruction') {
                // 星墜ちの矢 / リナのスキル等: 相手の場のカードが存在し、immuneでないレーンを破壊対象としてシミュレーションする
                tokenLanePatterns = [0, 1, 2].filter(l => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune')).map(l => [l]);
                // もし候補がなくても前のチェックで弾かれるはずだが、念の為
                if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
            } else if (action === 'seal_lanes') {
                const validTargetLanes = [0, 1, 2];
                let combinations = [null];
                // 1つのレーンしか選ばないパターンを除外（必ず最大まで選ばせる）
                const combs = getCombinations(validTargetLanes, 2);
                for (let c of combs) combinations.push(c);
                tokenLanePatterns = combinations;
            }
        }

        const orders = ['before']; // スキルはルール上必ずカード配置の前に発動するため、'after'パターンは違反として廃止

        for (let tokenLanes of tokenLanePatterns) {
            for (let order of orders) {
                // 1. 各カードを各レーンに置くパターン
                for (let i = 0; i < hand.length; i++) {
                    for (let l = 0; l < 3; l++) {
                        if (mySealedLanes[l] > 0) continue;
                        const card = hand[i];
                        if (hasSkill(card, 'legendary') && l !== 1) continue;
                        if (hasSkill(card, 'takeover') && myBoard[l] === null) continue;
                        if (hasSkill(card, 'challenge') && opBoard[l] === null) continue;
                        // 頂点（apex）: 自分の場の同レーンに伝説カードがいることが必要
                        if (hasSkill(card, 'apex') && !(myBoard[l] && hasSkill(myBoard[l], 'legendary'))) continue;
                        // 装備カードも空きレーンに召喚可能なので除外しない

                        // 1ターン目の制限 (先攻RED)
                        if (GameState.turnCount === 1 && GameState.firstPlayer === 'red' && l !== 1) continue;

                        // 「スキル先出し」かつ、その場所にトークンが置かれる場合は上書き不可
                        if (useSkill && order === 'before' && tokenLanes && tokenLanes.includes(l)) continue;

                        const isOverwrite = myBoard[l] !== null;
                        if (isOverwrite) {
                            let canOverwrite = false;
                            if (hasSkill(card, 'takeover')) canOverwrite = true;
                            if (hasSkill(card, 'equip')) canOverwrite = true;
                            const unionSkill = card.skills && card.skills.find(s => s.id === 'union');
                            if (unionSkill && (myBoard[l].baseId === unionSkill.targetId || myBoard[l].id === unionSkill.targetId)) {
                                canOverwrite = true;
                            }
                            if (!canOverwrite) continue;
                        }

                        // 追加: 空きレーンのパターン抽出
                        let tempBoard = [...myBoard];
                        if (useSkill && order === 'before' && tokenLanes) {
                            tokenLanes.forEach(tl => tempBoard[tl] = 'token');
                        }
                        tempBoard[l] = 'card';

                        // 利用可能なトークン配置レーン（自分自身への上書きも自壊として含めた全レーン）
                        const availableLanesForToken = [0, 1, 2].filter(lane => mySealedLanes[lane] === 0);

                        let cardTokenLanePatterns = [null];
                        const cardHasSkill = (sk) => hasSkill(card, sk) || (Array.isArray(card.choices) && card.choices.some(s => s.id === sk));

                        let totalTokenCount = 0;
                        let enemyTargetCount = 0;
                        const countTokenSkills = (id, val) => {
                            if (id === 'summon' || id === 'resurrect' || id === 'wall_create') totalTokenCount += 1;
                            if (id === 'clone') totalTokenCount += (val || 1);
                            if (id === 'dispel') enemyTargetCount += (val || 1);
                        };

                        if (card.skill && card.skill !== 'none') countTokenSkills(card.skill, card.skillValue);
                        if (Array.isArray(card.skills)) {
                            card.skills.forEach(s => countTokenSkills(s.id, s.value));
                        }

                        if (totalTokenCount > 0) {
                            const maxCount = Math.min(availableLanesForToken.length, totalTokenCount);
                            let tokenCombinations = [[]]; // キャンセルパターン (0枚)
                            for(let k = 1; k <= maxCount; k++) {
                                tokenCombinations.push(...getCombinations(availableLanesForToken, k));
                            }
                            cardTokenLanePatterns = tokenCombinations;
                        } else if (enemyTargetCount > 0) {
                            const enemyOccupied = opBoard.map((c, idx) => c ? idx : -1).filter(idx => idx !== -1);
                            let enemyCombinations = [[]]; // キャンセルパターン
                            for(let k = 1; k <= Math.min(enemyTargetCount, enemyOccupied.length); k++) {
                                enemyCombinations.push(...getCombinations(enemyOccupied, k));
                            }
                            cardTokenLanePatterns = enemyCombinations;
                        }

                        for (let cardTokenLanes of cardTokenLanePatterns) {
                            // 「選択」スキルの場合は、それぞれの選択肢でシミュレーションを行う
                            if (hasSkill(card, 'choice') && Array.isArray(card.choices)) {
                                let choiceCount = 1;
                                if (card.skill === 'choice') choiceCount = card.skillValue || 1;
                                else if (card.skills) {
                                    const csk = card.skills.find(s => s.id === 'choice');
                                    if (csk) choiceCount = csk.value || 1;
                                }
                                const choiceIndices = card.choices.map((_, idx) => idx);
                                const choiceCombinations = getCombinations(choiceIndices, Math.min(choiceIndices.length, choiceCount));

                                for (let cIdxArr of choiceCombinations) {
                                    let simState = simulateMove(i, l, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order, cIdxArr, cardTokenLanes);
                                    if (simState) candidates.push({ index: i, lane: l, isOverwrite, useSkill, tokenLanes, skillOrder: order, choiceIndex: cIdxArr, cardTokenLanes, simState });
                                }
                            } else {
                                let simState = simulateMove(i, l, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order, undefined, cardTokenLanes);
                                if (simState) candidates.push({ index: i, lane: l, isOverwrite, useSkill, tokenLanes, skillOrder: order, cardTokenLanes, simState });
                            }
                        }
                    }
                }
                // 2. 「パス」という選択肢
                let passSimState = simulateMove(-1, -1, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order);
                if (passSimState) candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill, tokenLanes, skillOrder: order, simState: passSimState });
            }
        }
    };

    testMoves(false); // スキルを使わないパターン
    if (canUseSkill) testMoves(true); // スキルを使うパターン

    const startHP = myHP;

    const getAdvantage = (state, candidate) => {
        let myPower = 0; let opPower = 0;
        for (let i = 0; i < 3; i++) {
            if (state.enemyBoard[i]) myPower += (Number(state.enemyBoard[i].currentPower) || Number(state.enemyBoard[i].power) || 0);
            if (state.playerBoard[i]) opPower += (Number(state.playerBoard[i].currentPower) || Number(state.playerBoard[i].power) || 0);
        }
        
        // 号令（call）は期待値としてパワー+3として評価
        if (candidate && candidate.index !== -1) {
            const playedCard = hand[candidate.index];
            if (playedCard && (playedCard.skill === 'call' || (playedCard.skills && playedCard.skills.some(s => s.id === 'call')))) {
                myPower += 3;
            }
        }
        
        return myPower - opPower;
    };

    const getCountDiff = (state) => {
        const myCount = state.enemyBoard.filter(c => c !== null).length;
        const opCount = state.playerBoard.filter(c => c !== null).length;
        return myCount - opCount;
    };

    // ① シミュレーションを行って全通り出す (candidates はすでにある)

    // ② 負ける手は除外（条件1）
    let aliveCandidates = candidates.filter(c => c.simState.enemyHP > 0);
    // ⑧ それもない（どこに何を出しても負ける）ならランダムのために全復活
    if (aliveCandidates.length === 0) aliveCandidates = candidates;

    let finalCandidates = [];

    // ★追加（暗黙の条件）: 相手を倒せる手（勝利）があれば最優先
    const winCandidates = aliveCandidates.filter(c => c.simState.playerHP <= 0);
    if (winCandidates.length > 0) {
        finalCandidates = winCandidates;
    } else {
        // ③ 相手の攻撃によるダメージが4以上になる手は除外（自傷ダメージは除外条件に含めない）
        const safeCandidates = aliveCandidates.filter(c => c.simState.combatDamageTaken < 4);

        if (safeCandidates.length > 0) {
            // ④～⑥の条件が存在する（4ダメージ未満の手がある）
            finalCandidates = safeCandidates;
        } else {
            // ⑦ ④～⑥の条件が存在しない（絶対に4ダメージ以上受ける）なら除外した③の中で（つまり aliveCandidates の中で）
            // 修正：一番被ダメージが少ないグループを抽出
            let minDmg = Math.min(...aliveCandidates.map(c => c.simState.combatDamageTaken));
            finalCandidates = aliveCandidates.filter(c => c.simState.combatDamageTaken === minDmg);
        }
    }

    // ④ 自分のパワー - プレイヤーのパワーが最も大きくなる手を選ぶ（基本条件）
    // ⑥ ⑤も同列なら、相手の攻撃による被ダメージが最も少ない手を選ぶ（追加条件）
    // ⑦ ⑥も同列なら、特定のスキル（回復＞入替）の優先度が高い手を選ぶ（追加条件）
    // ⑧ ⑦も同列ならその中からランダム（基本条件）
    // これらをソートで実現し、最も優秀な同列グループの中から1つをランダムに選ぶ

    // ソートしやすいように基本条件スコアを一次算出
    finalCandidates.forEach(c => {
        c.advDiff = getAdvantage(c.simState, c);
        c.countDiff = getCountDiff(c.simState);

        let skillScore = 0;
        if (c.index !== -1 && c.choiceIndex !== undefined) {
            const card = hand[c.index];
            if (card && card.choices) {
                const indices = Array.isArray(c.choiceIndex) ? c.choiceIndex : [c.choiceIndex];
                for (let idx of indices) {
                    const skillId = card.choices[idx]?.id;
                    if (skillId === 'heal') {
                        // 自身の体力が満タンでない場合のみ回復を評価する
                        if (startHP < GameState.enemyMaxHP) {
                            skillScore += 2;
                        }
                    }
                    else if (skillId === 'draw') skillScore += 1;
                }
            }
        }
        c.skillScore = skillScore;
        c.lanePriority = c.lane === 0 ? 3 : (c.lane === 2 ? 2 : (c.lane === 1 ? 1 : 0));
    });

    // ④、⑤、⑥、⑦、⑧の順でソート
    finalCandidates.sort((a, b) => {
        if (a.advDiff !== b.advDiff) return b.advDiff - a.advDiff; // ④ 降順
        if (a.countDiff !== b.countDiff) return b.countDiff - a.countDiff; // ⑤ 降順
        if (a.simState.combatDamageTaken !== b.simState.combatDamageTaken) return a.simState.combatDamageTaken - b.simState.combatDamageTaken; // ⑥ 昇順（ダメージが少ない方が良い）
        if (a.skillScore !== b.skillScore) return b.skillScore - a.skillScore; // ⑦ スキル優先度（回復＞入替＞その他） 降順
        if (a.lanePriority !== b.lanePriority) return b.lanePriority - a.lanePriority; // ⑧ レーン優先度（左 > 右 > 中央）降順
        return 0; // ⑨ 同列
    });

    const topCandidate = finalCandidates[0];
    const topAdv = topCandidate.advDiff;
    const topCount = topCandidate.countDiff;
    const topDmg = topCandidate.simState.combatDamageTaken;
    const topSkill = topCandidate.skillScore;
    const topLanePri = topCandidate.lanePriority;

    // ④～⑧が完全に同等の最善手グループを抽出
    const bestGroup = finalCandidates.filter(c => c.advDiff === topAdv && c.countDiff === topCount && c.simState.combatDamageTaken === topDmg && c.skillScore === topSkill && c.lanePriority === topLanePri);

    // ⑨ ⑧も同列（同じレーンかつ同等のカードを出す場合など）ならその中からランダム
    const finalDecision = bestGroup[Math.floor(getSeededRandom() * bestGroup.length)];

    console.log("AI Best Group Size:", bestGroup.length, "Best Adv:", topAdv, "Best Count Diff:", topCount, "Best Dmg:", topDmg, "Best SkillScore:", topSkill, "Best LanePri:", topLanePri);
    return finalDecision;
}

// 以下の関数は getBestSimulatedMove に統合されました

/**
 * 仮想位置でのシミュレーション実行（状態を返す）
 * 順序は常に リーダースキル -> カード配置
 */
export function simulateMove(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill = false, currentMySP, tokenLanes = null, skillOrder = 'before', choiceIndex = undefined, cardTokenLanes = null, checkConstraints = true) {
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

    // 1. スキル使用 (常に先出し)
    if (useSkill && GameState.enemyConfig.leaderSkill) {
        simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
        applyLeaderSkillLogic(simState, 'red', GameState.enemyConfig.leaderSkill.action, tokenLanes);
    }

    // 2. カードをプレイ
    if (handIdx !== -1) {
        const playedCard = cloneCard(simState.enemyHand[handIdx]);
        
        // リーダースキル等によって事前の見積もりと盤面状況が変わっている場合の最終制約チェック
        if (checkConstraints && hasSkill(playedCard, 'challenge') && simState.playerBoard[laneIdx] === null) {
            return null; // ルール違反となるためシミュレーション自体を破棄させる
        }
        if (checkConstraints && hasSkill(playedCard, 'takeover') && simState.enemyBoard[laneIdx] === null) {
            return null;
        }
        // 頂点（apex）: 自分の場の同レーンに伝説カードがいることが必要
        if (checkConstraints && hasSkill(playedCard, 'apex') && !(simState.enemyBoard[laneIdx] && hasSkill(simState.enemyBoard[laneIdx], 'legendary'))) {
            return null;
        }
        
        if (hasSkill(playedCard, 'equip') && simState.enemyBoard[laneIdx]) {
            // 装備：既存のカードに追加効果とパワーを付与し、装備カードは消費される。
            const targetCard = simState.enemyBoard[laneIdx];
            targetCard.basePower = (targetCard.basePower || 0) + (playedCard.power || 0);
            targetCard.currentPower = (targetCard.currentPower || 0) + (playedCard.power || 0);

            let addedSkills = [];
            if (playedCard.skill && playedCard.skill !== 'none' && playedCard.skill !== 'equip') {
                addedSkills.push({ id: playedCard.skill, value: playedCard.skillValue });
            }
            if (playedCard.skills) {
                playedCard.skills.forEach(s => {
                    if (s.id !== 'equip') addedSkills.push({ id: s.id, value: s.value });
                });
            }

            mergeCardSkills(targetCard, addedSkills);

            let cLanesForEquip = cardTokenLanes ? [...cardTokenLanes] : null;
            addedSkills.forEach(sk => {
                applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value, [], cLanesForEquip);
            });
        } else {
            let activeCardForSkills = playedCard;
            const unionSkill = playedCard.skills && playedCard.skills.find(s => s.id === 'union');
            if (unionSkill && simState.enemyBoard[laneIdx] && (simState.enemyBoard[laneIdx].baseId === unionSkill.targetId || simState.enemyBoard[laneIdx].id === unionSkill.targetId)) {
                // 合体処理 (手札からのプレイなので「召喚」扱いとなり、召喚時効果は発動する)
                const masterData = CARD_MASTER.find(c => c.id === unionSkill.summonId) || CARD_MASTER.find(c => c.id === 'android');
                let unionCard = JSON.parse(JSON.stringify(masterData));
                unionCard.uid = `sim_union_${Math.floor(Math.random() * 1000000)}`;
                unionCard.owner = 'red';
                unionCard.baseId = unionCard.id;
                unionCard.basePower = unionCard.power;
                unionCard.currentPower = unionCard.power;
                unionCard.stunTurns = 0;
                simState.enemyBoard[laneIdx] = unionCard;
                activeCardForSkills = unionCard;
            } else {
                // 通常のプレイ処理 (takeover や 空きレーンへの召喚)
                if (playedCard.currentPower === undefined || Number.isNaN(playedCard.currentPower) || (playedCard.currentPower <= 0 && (playedCard.power || 0) > 0)) {
                    playedCard.currentPower = playedCard.power || 0;
                    playedCard.basePower = playedCard.power || 0;
                }
                simState.enemyBoard[laneIdx] = playedCard;
            }

            let skills = [];
            if (activeCardForSkills.skill && activeCardForSkills.skill !== 'none') {
                if (activeCardForSkills.skill === 'choice' && choiceIndex !== undefined && activeCardForSkills.choices) {
                    const indices = Array.isArray(choiceIndex) ? choiceIndex : [choiceIndex];
                    indices.forEach(idx => {
                        if (activeCardForSkills.choices[idx]) {
                            const chr = activeCardForSkills.choices[idx];
                            skills.push({ id: chr.id, value: chr.value });
                        }
                    });
                } else {
                    skills.push({ id: activeCardForSkills.skill, value: activeCardForSkills.skillValue });
                }
            }
            if (Array.isArray(activeCardForSkills.skills)) {
                activeCardForSkills.skills.forEach(sk => {
                    if (sk.id === 'choice' && choiceIndex !== undefined && activeCardForSkills.choices) {
                        const indices = Array.isArray(choiceIndex) ? choiceIndex : [choiceIndex];
                        indices.forEach(idx => {
                            if (activeCardForSkills.choices[idx]) {
                                const chr = activeCardForSkills.choices[idx];
                                skills.push({ id: chr.id, value: chr.value });
                            }
                        });
                    } else {
                        skills.push(sk);
                    }
                });
            }

            let cLanesForPass2 = cardTokenLanes ? [...cardTokenLanes] : null;
            skills.forEach(sk => {
                applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value, [], cLanesForPass2);
            });

            if (simState.enemyBoard[laneIdx] && simState.enemyBoard[laneIdx].currentPower <= 0) {
                simState.enemyBoard[laneIdx] = null;
            }
        }
    }

    // AIのターンは「自分の攻撃」が終わった後に回ってくるため、
    // ここから先のイベントは「次のプレイヤー（青）のターン開始」と「プレイヤーの攻撃」である。

    const hpBeforeCombat = simState.enemyHP;

    if (!(simState.extraTurnCount > 0)) {
        // 3. 次のプレイヤー（青）のターン開始処理（成長・契約ダメージ・スタン解除）
        applyPassiveSkillLogic(simState, 'blue');
        simState.playerBoard.forEach(c => {
            if (c && c.stunTurns > 0) {
                c.stunTurns--;
            }
        });

        // 自分の攻撃（red）は既に行われているのでここでは計算しない。
        // ただし、AIが出したばかりのカードによる「次のターン以降の脅威」は盤面評価でカバーされる。

        // 4. プレイヤーの攻撃
        calculateCombatPhase(simState, 'blue');

        // 相手の攻撃による純粋なダメージを記録（条件2の評価用）
        simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);
    } else {
        simState.extraTurnCount--;
        simState.combatDamageTaken = 0;
    }

    return simState;
}

// 以下の関数は getBestSimulatedMove に統合されました

export function evaluateAdhocTokenLanes(tokenCard, checkConstraints = true) {
    const sealedLanes = GameState.enemySealedLanes || [0, 0, 0];
    const allLanes = [0, 1, 2].filter(l => sealedLanes[l] === 0);
    const candidates = [];

    // 1. キャンセルした場合のシミュレーション（手札からプレイしない扱い = simulateMoveの-1）
    let simCancel = simulateMove(-1, -1, [], GameState.enemyBoard, GameState.playerBoard, GameState.enemyHP, false, GameState.enemySP);
    candidates.push({ lane: [], simState: simCancel });

    // 2. 選択スキルの抽出（もしあれば全ての選択肢をシミュレーションして最もスコアが高いのを選ぶ）
    let choiceIndices = [];
    if (tokenCard.skill === 'choice' || (tokenCard.skills && tokenCard.skills.some(s => s.id === 'choice'))) {
        let chkOpt = tokenCard.choices || [];
        if (!chkOpt || chkOpt.length === 0) chkOpt = tokenCard.choices2 || [];
        for (let i = 0; i < chkOpt.length; i++) {
            choiceIndices.push(i);
        }
    }

    // 3. 各レーンに配置した場合のシミュレーション
    for (let l of allLanes) {
        if (checkConstraints && hasSkill(tokenCard, 'legendary') && l !== 1) continue;
        // 頂点（apex）: 自分の場の同レーンに伝説カードがいることが必要
        if (checkConstraints && hasSkill(tokenCard, 'apex') && !(GameState.enemyBoard[l] && hasSkill(GameState.enemyBoard[l], 'legendary'))) continue;

        if (choiceIndices.length > 0) {
            for (let cIdx of choiceIndices) {
                let simState = simulateMove(0, l, [tokenCard], GameState.enemyBoard, GameState.playerBoard, GameState.enemyHP, false, GameState.enemySP, null, 'before', [cIdx], null, checkConstraints);
                if (simState) candidates.push({ lane: [l], simState });
            }
        } else {
            let simState = simulateMove(0, l, [tokenCard], GameState.enemyBoard, GameState.playerBoard, GameState.enemyHP, false, GameState.enemySP, null, 'before', undefined, null, checkConstraints);
            if (simState) candidates.push({ lane: [l], simState });
        }
    }

    const getAdvantage = (state, candidateLane) => {
        let adv = 0;
        for (let i = 0; i < 3; i++) {
            if (state.enemyBoard[i]) adv += (Number(state.enemyBoard[i].currentPower) || Number(state.enemyBoard[i].power) || 0);
            if (state.playerBoard[i]) adv -= (Number(state.playerBoard[i].currentPower) || Number(state.playerBoard[i].power) || 0);
        }
        // adhocで出たカード自体が号令(call)を持つ場合の期待値調整
        if (candidateLane !== undefined && candidateLane.length > 0) {
            if (tokenCard.skill === 'call' || (tokenCard.skills && tokenCard.skills.some(s => s.id === 'call'))) {
                adv += 3;
            }
        }
        return adv;
    };

    const getCountDiff = (state) => state.enemyBoard.filter(c => c).length - state.playerBoard.filter(c => c).length;

    candidates.forEach(c => {
        c.advDiff = getAdvantage(c.simState, c.lane);
        c.countDiff = getCountDiff(c.simState);
    });

    let aliveCandidates = candidates.filter(c => c.simState.enemyHP > 0);
    if (aliveCandidates.length === 0) aliveCandidates = candidates;

    let finalCandidates = [];
    const winCandidates = aliveCandidates.filter(c => c.simState.playerHP <= 0);
    if (winCandidates.length > 0) {
        finalCandidates = winCandidates;
    } else {
        const safeCandidates = aliveCandidates.filter(c => c.simState.combatDamageTaken < 4);
        if (safeCandidates.length > 0) {
            finalCandidates = safeCandidates;
        } else {
            let minDmg = Math.min(...aliveCandidates.map(c => c.simState.combatDamageTaken));
            finalCandidates = aliveCandidates.filter(c => c.simState.combatDamageTaken === minDmg);
        }
    }

    finalCandidates.sort((a, b) => {
        if (a.advDiff !== b.advDiff) return b.advDiff - a.advDiff;
        if (a.countDiff !== b.countDiff) return b.countDiff - a.countDiff;
        if (a.simState.combatDamageTaken !== b.simState.combatDamageTaken) return a.simState.combatDamageTaken - b.simState.combatDamageTaken;
        return 0;
    });

    return finalCandidates[0].lane;
}



/**
 * トークン配置用の評価
 */
export function getNormalTokenLanes(allLanes, owner, tokenCard, count, isLeaderSkill = false, canCancel = false, checkConstraints = true) {
    // 意思決定時にすでに最適な配置先（cardTokenLanes / tokenLanes）が計算されていれば、再評価（点数方式）をせずにそのまま使う！
    // ※キャンセルが最適な場合（[]）や、盤面の空きが足りず指定数未満の配列が返ってきた場合も、シミュレーションの結論として尊重する
    if (owner === 'red' && typeof GameState.aiDecision !== 'undefined' && GameState.aiDecision) {
        if (!isLeaderSkill && GameState.aiDecision.cardTokenLanes) {
            const decidedLanes = GameState.aiDecision.cardTokenLanes;
            delete GameState.aiDecision.cardTokenLanes; // 使い切ったら消去
            return decidedLanes.slice(0, count);
        } else if (isLeaderSkill && GameState.aiDecision.tokenLanes) {
            const decidedLanes = GameState.aiDecision.tokenLanes;
            delete GameState.aiDecision.tokenLanes; // 使い切ったら消去
            return decidedLanes.slice(0, count);
        }
    }

    if (canCancel && owner === 'red') {
        const adhocLanes = evaluateAdhocTokenLanes(tokenCard, checkConstraints);
        return adhocLanes;
    }

    // 中級以上のAIがシミュレーション結果を持たずに呼ばれた場合（不測の事態）の最低限のフォールバック
    // （ランダムなどの思考介入は行わず、手前の空いているレーン順に機械的に詰める）
    const results = [];

    // 優先順位（左 > 右 > 中央）に従って allLanes をソート
    const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };
    const sortedLanes = [...allLanes].sort((a, b) => lanePriorityOrder[a] - lanePriorityOrder[b]);

    // 1. 空きレーンを優先
    for (let l of sortedLanes) {
        if (GameState.enemyBoard[l] === null && results.length < count) {
            results.push(l);
        }
    }

    // 2. 空きが足りなければ上書き可能なレーンで妥協
    if (results.length < count) {
        for (let l of sortedLanes) {
            if (!results.includes(l) && results.length < count) {
                results.push(l);
            }
        }
    }

    return results;
}

/**
 * AIの「移動(move)」専用シミュレーション
 * 全移動パターンのうち、直後の戦闘で最も有利になる手順を返す
 */
export function evaluateAIMoves(currentState) {
    const b = currentState.enemyBoard;
    const moveCards = [];
    for (let i = 0; i < 3; i++) {
        if (b[i] && hasSkill(b[i], 'move') && (b[i].stunTurns || 0) === 0) {
            moveCards.push({ card: b[i], lane: i });
        }
    }

    if (moveCards.length === 0) return null;

    let bestScore = -Infinity;
    let bestMoves = [];

    // 移動後の盤面を再帰的に生成
    const generateMovePermutations = (boardMap, depth, currentMoves) => {
        if (depth === moveCards.length) {
            evaluateBoard(boardMap, currentMoves);
            return;
        }

        const mCard = moveCards[depth];
        const mySealedLanes = GameState.enemySealedLanes || [0, 0, 0];
        // 既に上書きされていたり、位置が変わっている場合はこのカード自身による移動はスキップ
        const currentPos = boardMap.findIndex(c => c && c.id === mCard.card.id);
        if (currentPos === -1 || currentPos !== mCard.lane) {
            generateMovePermutations(boardMap, depth + 1, currentMoves);
            return;
        }

        const validTargets = [mCard.lane];
        if (mCard.lane > 0 && mySealedLanes[mCard.lane - 1] === 0) validTargets.push(mCard.lane - 1);
        if (mCard.lane < 2 && mySealedLanes[mCard.lane + 1] === 0) validTargets.push(mCard.lane + 1);

        for (let target of validTargets) {
            const nextBoard = [...boardMap];
            if (target !== mCard.lane) {
                nextBoard[target] = nextBoard[mCard.lane];
                nextBoard[mCard.lane] = null;
            }
            const nextMoves = [...currentMoves];
            if (target !== mCard.lane) {
                nextMoves.push({ from: mCard.lane, to: target });
            }
            generateMovePermutations(nextBoard, depth + 1, nextMoves);
        }
    };

    const evaluateBoard = (boardMap, moves) => {
        const simState = {
            playerBoard: currentState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            enemyBoard: boardMap.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
            playerHP: currentState.playerHP,
            enemyHP: currentState.enemyHP,
            playerHand: [], enemyHand: [], playerDiscard: [], enemyDiscard: []
        };

        // Red(enemy) の攻撃フェーズとしてシミュレーション
        calculateCombatPhase(simState, 'red');

        // スコア評価
        let score = 0;
        score += (currentState.playerHP - simState.playerHP) * 5; // 的のHPを削ることを重視
        score += simState.enemyHP * 2;

        let myPow = 0;
        let opPow = 0;
        simState.enemyBoard.forEach(c => { if(c) myPow += (c.currentPower || 0); });
        simState.playerBoard.forEach(c => { if(c) opPow += (c.currentPower || 0); });

        score += myPow;
        score -= opPow;

        // 味方を上書きする場合はマイナス評価 (味方カードの減少数)
        const currentAllyCount = currentState.enemyBoard.filter(c => c !== null).length;
        const newAllyCount = boardMap.filter(c => c !== null).length;
        if (currentAllyCount > newAllyCount) score -= (currentAllyCount - newAllyCount) * 10;

        // 無意味な移動を避けるため、移動回数が多いほどわずかにペナルティ
        score -= moves.length * 0.1;

        if (score > bestScore) {
            bestScore = score;
            bestMoves = moves;
        }
    };

    generateMovePermutations([...b], 0, []);

    return bestMoves.length > 0 ? bestMoves : null;
}

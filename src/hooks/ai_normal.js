import { hasSkill } from '../utils/gameUtils.js';
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
    let canUseSkill = skill && mySP >= skill.cost && (GameState.enemyConfig.id !== 'cthulhu' && GameState.enemyConfig.id !== 'cleric');
    // マリア（悪魔狩り）の場合、墓地に復活対象がいなければ空撃ちしない
    if (canUseSkill && GameState.enemyConfig.id === 'devilhunter') {
        const discard = GameState.enemyDiscard || [];
        canUseSkill = discard.some(c => (c.power || 0) <= 10 && !c.isToken);
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

    const testMoves = (useSkill) => {
        let tokenLanePatterns = [null]; // スキルを使わない、またはトークン召喚でない場合

        if (useSkill) {
            const action = skill.action;
            if (action === 'holy_march') {
                const emptyLanes = [0, 1, 2].filter(l => myBoard[l] === null);
                tokenLanePatterns = getCombinations(emptyLanes, Math.min(emptyLanes.length, 2));
            } else if (action === 'satan_avatar' || action === 'dragon_summon' || action === 'devilhunter_resurrect' || action === 'dungeon_summon_leader') {
                // 上書きも考慮するため全レーンをシミュレーション対象とする
                tokenLanePatterns = [[0], [1], [2]];
                
                // dungeon_summon_leaderの場合はカード自体の制約（伝説・生贄）を適用して候補を絞る
                if (action === 'dungeon_summon_leader' && GameState.enemyConfig && GameState.enemyConfig.leaderCardId) {
                    const lc = CARD_MASTER.find(c => c.id === GameState.enemyConfig.leaderCardId);
                    if (lc) {
                        if (hasSkill(lc, 'legendary')) {
                            // 伝説は中央レーン（[1]）のみ
                            tokenLanePatterns = [[1]];
                        }
                        if (hasSkill(lc, 'takeover')) {
                            // 生贄はすでにカードが存在するレーンのみ（上書き専用）
                            tokenLanePatterns = tokenLanePatterns.filter(pattern => myBoard[pattern[0]] !== null);
                        }
                    }
                }
                
                if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
            } else if (action === 'targeted_destruction') {
                // 星墜ちの矢: 相手の場のカードが存在するレーンを破壊対象としてシミュレーションする
                tokenLanePatterns = [0, 1, 2].filter(l => opBoard[l] !== null).map(l => [l]);
                if (tokenLanePatterns.length === 0) tokenLanePatterns = [null]; // 空撃ちしかできない場合
            }
        }

        const orders = ['before']; // スキルはルール上必ずカード配置の前に発動するため、'after'パターンは違反として廃止

        for (let tokenLanes of tokenLanePatterns) {
            for (let order of orders) {
                // 1. 各カードを各レーンに置くパターン
                for (let i = 0; i < hand.length; i++) {
                    for (let l = 0; l < 3; l++) {
                        const card = hand[i];
                        if (hasSkill(card, 'legendary') && l !== 1) continue;
                        if (hasSkill(card, 'takeover') && myBoard[l] === null) continue;

                        // 1ターン目の制限 (先攻RED)
                        if (GameState.turnCount === 1 && GameState.firstPlayer === 'red' && l !== 1) continue;

                        // 「スキル先出し」かつ、その場所にトークンが置かれる場合は上書き不可
                        if (useSkill && order === 'before' && tokenLanes && tokenLanes.includes(l)) continue;

                        const isOverwrite = myBoard[l] !== null;

                        // 追加: アキレーンのパターン抽出
                        let tempBoard = [...myBoard];
                        if (useSkill && order === 'before' && tokenLanes) {
                             tokenLanes.forEach(tl => tempBoard[tl] = 'token');
                        }
                        tempBoard[l] = 'card';
                        
                        const emptyLanesAfterPlay = [0, 1, 2].filter(idx => tempBoard[idx] === null);

                        let cardTokenLanePatterns = [null];
                        if (emptyLanesAfterPlay.length > 0) {
                            if (hasSkill(card, 'resurrect') || hasSkill(card, 'summon')) {
                                cardTokenLanePatterns = emptyLanesAfterPlay.map(idx => [idx]);
                            } else if (hasSkill(card, 'clone')) {
                                let cloneCount = 1;
                                if (card.skill === 'clone') cloneCount = card.skillValue || 1;
                                else if (card.skills) {
                                    const csk = card.skills.find(s => s.id === 'clone');
                                    if (csk) cloneCount = csk.value || 1;
                                }
                                cardTokenLanePatterns = getCombinations(emptyLanesAfterPlay, Math.min(emptyLanesAfterPlay.length, cloneCount));
                            }
                        }

                        for (let cardTokenLanes of cardTokenLanePatterns) {
                            // 「選択」スキルの場合は、それぞれの選択肢でシミュレーションを行う
                            if (hasSkill(card, 'choice') && Array.isArray(card.choices)) {
                                for (let cIdx = 0; cIdx < card.choices.length; cIdx++) {
                                    let simState = simulateMove(i, l, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order, cIdx, cardTokenLanes);
                                    candidates.push({ index: i, lane: l, isOverwrite, useSkill, tokenLanes, skillOrder: order, choiceIndex: cIdx, cardTokenLanes, simState });
                                }
                            } else {
                                let simState = simulateMove(i, l, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order, undefined, cardTokenLanes);
                                candidates.push({ index: i, lane: l, isOverwrite, useSkill, tokenLanes, skillOrder: order, cardTokenLanes, simState });
                            }
                        }
                    }
                }
                // 2. 「パス」という選択肢
                let passSimState = simulateMove(-1, -1, hand, myBoard, opBoard, myHP, useSkill, mySP, tokenLanes, order);
                candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill, tokenLanes, skillOrder: order, simState: passSimState });
            }
        }
    };

    testMoves(false); // スキルを使わないパターン
    if (canUseSkill) testMoves(true); // スキルを使うパターン

    const startHP = myHP;

    const getAdvantage = (state) => {
        let myPower = 0; let opPower = 0;
        for (let i = 0; i < 3; i++) {
            if (state.enemyBoard[i]) myPower += (Number(state.enemyBoard[i].currentPower) || Number(state.enemyBoard[i].power) || 0);
            if (state.playerBoard[i]) opPower += (Number(state.playerBoard[i].currentPower) || Number(state.playerBoard[i].power) || 0);
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
    // ⑤ ④が同列なら自分とプレイヤーの残るカード枚数の差を決める（基本条件）
    // ⑥ ⑤も同列ならその中からランダム（基本条件）
    // これらをソートで実現し、最も優秀な同列グループの中から1つをランダムに選ぶ
    
    // ソートしやすいように基本条件スコアを一次算出
    finalCandidates.forEach(c => {
        c.advDiff = getAdvantage(c.simState);
        c.countDiff = getCountDiff(c.simState);
    });

    // ④と⑤の順で降順ソート
    finalCandidates.sort((a, b) => {
        if (a.advDiff !== b.advDiff) return b.advDiff - a.advDiff;
        if (a.countDiff !== b.countDiff) return b.countDiff - a.countDiff;
        return 0;
    });

    const topCandidate = finalCandidates[0];
    const topAdv = topCandidate.advDiff;
    const topCount = topCandidate.countDiff;

    // ④と⑤が完全に同等の最善手グループを抽出
    const bestGroup = finalCandidates.filter(c => c.advDiff === topAdv && c.countDiff === topCount);

    // ⑥ ⑤も同列ならその中からランダム
    const finalDecision = bestGroup[Math.floor(Math.random() * bestGroup.length)];

    console.log("AI Best Group Size:", bestGroup.length, "Best Adv:", topAdv, "Best Count Diff:", topCount);
    return finalDecision;
}

// 以下の関数は getBestSimulatedMove に統合されました

/**
 * 仮想位置でのシミュレーション実行（状態を返す）
 * 順序は常に リーダースキル -> カード配置
 */
export function simulateMove(handIdx, laneIdx, hand, currentMyBoard, currentOpBoard, currentMyHP, useSkill = false, currentMySP, tokenLanes = null, skillOrder = 'before', choiceIndex = undefined, cardTokenLanes = null) {
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    let simState = {
        playerBoard: currentOpBoard.map(cloneCard),
        enemyBoard: currentMyBoard.map(cloneCard),
        playerHP: GameState.playerHP,
        enemyHP: currentMyHP,
        playerSP: GameState.playerSP,
        enemySP: currentMySP || 0,
        playerHand: GameState.playerHand.map(cloneCard), // Morph等で必要
        enemyHand: hand.map(cloneCard),
        playerDiscard: GameState.playerDiscard.map(cloneCard),
        enemyDiscard: GameState.enemyDiscard.map(cloneCard)
    };

    // 1. スキル使用 (常に先出し)
    if (useSkill && GameState.enemyConfig.leaderSkill) {
        simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
        applyLeaderSkillLogic(simState, 'red', GameState.enemyConfig.leaderSkill.action, tokenLanes);
    }

    // 2. カードをプレイ
    if (handIdx !== -1) {
        const playedCard = cloneCard(hand[handIdx]);
        playedCard.currentPower = playedCard.power;
        simState.enemyBoard[laneIdx] = playedCard;

        let skills = [];
        if (playedCard.skill && playedCard.skill !== 'none') {
            // 選択スキルの場合、choiceIndexがあればその内容を、なければそのまま追加
            if (playedCard.skill === 'choice' && choiceIndex !== undefined && playedCard.choices && playedCard.choices[choiceIndex]) {
                const chr = playedCard.choices[choiceIndex];
                skills.push({ id: chr.id, value: chr.value });
            } else {
                skills.push({ id: playedCard.skill, value: playedCard.skillValue });
            }
        }
        if (Array.isArray(playedCard.skills)) {
            // skills配列内にも選択スキルがある場合（通常はない想定だが念のため）
            playedCard.skills.forEach(sk => {
                if (sk.id === 'choice' && choiceIndex !== undefined && playedCard.choices && playedCard.choices[choiceIndex]) {
                    const chr = playedCard.choices[choiceIndex];
                    skills.push({ id: chr.id, value: chr.value });
                } else {
                    skills.push(sk);
                }
            });
        }

        skills.forEach(sk => {
            applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value, [], cardTokenLanes);
        });
    }

    // AIのターンは「自分の攻撃」が終わった後に回ってくるため、
    // ここから先のイベントは「次のプレイヤー（青）のターン開始」と「プレイヤーの攻撃」である。

    // 3. 次のプレイヤー（青）のターン開始処理（契約ダメージや成長）
    applyPassiveSkillLogic(simState, 'blue');

    // 自分の攻撃（red）は既に行われているのでここでは計算しない。
    // ただし、AIが出したばかりのカードによる「次のターン以降の脅威」は盤面評価でカバーされる。

    const hpBeforeCombat = simState.enemyHP;

    // 4. プレイヤーの攻撃
    calculateCombatPhase(simState, 'blue');

    // 相手の攻撃による純粋なダメージを記録（条件2の評価用）
    simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);

    return simState;
}

// 以下の関数は getBestSimulatedMove に統合されました

/**
 * トークン配置用の評価
 */
export function getNormalTokenLanes(allLanes, owner, tokenCard, count, isLeaderSkill = false) {
    // 意思決定時にすでに最適な配置先（cardTokenLanes / tokenLanes）が計算されていれば、再評価（点数方式）をせずにそのまま使う！
    if (owner === 'red' && typeof GameState.aiDecision !== 'undefined' && GameState.aiDecision) {
        if (!isLeaderSkill && GameState.aiDecision.cardTokenLanes && GameState.aiDecision.cardTokenLanes.length > 0) {
            const decidedLanes = GameState.aiDecision.cardTokenLanes;
            delete GameState.aiDecision.cardTokenLanes; // 使い切ったら消去
            return decidedLanes.slice(0, count); // count分を返す
        } else if (isLeaderSkill && GameState.aiDecision.tokenLanes && GameState.aiDecision.tokenLanes.length > 0) {
            const decidedLanes = GameState.aiDecision.tokenLanes;
            delete GameState.aiDecision.tokenLanes; // 使い切ったら消去
            return decidedLanes.slice(0, count);
        }
    }

    // 中級以上のAIがシミュレーション結果を持たずに呼ばれた場合（不測の事態）の最低限のフォールバック
    // （ランダムなどの思考介入は行わず、手前の空いているレーン順に機械的に詰める）
    const results = [];
    
    // 1. 空きレーンを優先
    for (let l of allLanes) {
        if (GameState.enemyBoard[l] === null && results.length < count) {
            results.push(l);
        }
    }
    
    // 2. 空きが足りなければ上書き可能な若いレーンで妥協
    if (results.length < count) {
        for (let l of allLanes) {
            if (!results.includes(l) && results.length < count) {
                results.push(l);
            }
        }
    }
    
    return results;
}

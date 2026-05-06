import { hasSkill, getSeededRandom, mergeCardSkills } from '../utils/gameUtils.js';
import { applyActiveSkillLogic, applyLeaderSkillLogic, calculateCombatPhase, applyPassiveSkillLogic, isGraveKeeperActive } from './engine.js';
import { GameState } from './gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { AI_SKILL_UTILITY } from '../utils/constants/aiSkillValues.js';

/**
 * 【号令（call）・変身（metamorph）のAIシミュレーション仕様】
 * 
 * ■ 号令（call）:
 *   デッキトップのカードを場に出すスキルだが、シミュレーション時点ではデッキ内容が不明なため、
 *   「callの値（skillValue）分のパワーを、号令を持つカード自身に仮加算」して評価する。
 *   例: パワー3 + 号令3 → パワー6として戦闘シミュレーションに投入。
 *   
 *   実際に号令が発動する際（skillLogic.js）には、デッキトップの実カードが判明するため、
 *   evaluateAdhocTokenLanes() でシミュレーションベースの最適レーン選択を行う。
 *   この時点では号令元カードは「本来のパワー」で盤面に存在している（GameStateから読むため）。
 *   また、号令によるカード配置はリーダースキルの発動タイミングが過ぎているため、
 *   リーダースキルは使用しないシミュレーションとなる。
 * 
 * ■ 変身（metamorph）:
 *   全カードからランダムに1枚に変身するスキルだが、結果が不明なため、
 *   METAMORPH_ESTIMATED_POWER（定数）のパワーとして仮評価する。
 * 
 * ■ 号令で呼ばれたカードが号令や変身を持つ場合:
 *   evaluateAdhocTokenLanes() 内でもスキル実行ループに同じ仮評価ロジックを適用しているため、
 *   号令で出されたカードがさらに号令や変身を持っていても、同じルールで正しく評価される。
 */
const METAMORPH_ESTIMATED_POWER = 5;

/**
 * 【AI設計の絶対原則 - グローバルルール】
 * ノーマル以上のAIは、実行可能な全ての選択肢（手札、配置レーン、スキルによる対象選択、分岐）を
 * 網羅的に検証しなければならない。
 * 
 * 1. 召喚位置の全レーン検証。
 * 2. 復活・回収対象の全カード検証。
 * 3. スキル選択（引抜・復活・回収等）の全組み合わせ検証。
 * 
 * 計算コストの削減のためにシミュレーションの質を落とすことは、このAIにおいて許容されない。
 */

export function getBestSimulatedMove() {
    const cloneCard = c => c ? JSON.parse(JSON.stringify(c)) : null;
    const hand = GameState.enemyHand.map(cloneCard);
    const discard = GameState.enemyDiscard.map(cloneCard);
    let myBoard = GameState.enemyBoard.map(cloneCard);
    let opBoard = GameState.playerBoard.map(cloneCard);

    let myHP = GameState.enemyHP;
    let opHP = GameState.playerHP;
    let mySP = GameState.enemySP || 0;
    const mySealedLanes = GameState.enemySealedLanes || [0, 0, 0];

    const canUseSkill = GameState.enemyConfig.leaderSkill &&
        mySP >= GameState.enemyConfig.leaderSkill.cost &&
        !GameState.enemyConfig.leaderSkillUsableTurns?.includes(GameState.turnCount) &&
        !GameState.enemyConfig.leaderSkillUsed;
    const skill = GameState.enemyConfig.leaderSkill;



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

        if (forcedLane !== undefined) {
            if (mySealedLanes[forcedLane] === 1) return [[]];
            availableLanes = [forcedLane];
        } else if (depth > 0) {
            availableLanes.push(-1);
        }

        // 【召喚制約の事前フィルタリング】
        // processActionSequence にも同等のチェックがあるが、ここで弾くことで
        // ・リーダースキルで相手カードが消えた後の「挑戦」違反ノードの生成を防ぐ
        // ・無効な候補によるシミュレーション負荷を削減する
        // 注意: depth > 0 で push(-1) された「スキップレーン（-1）」は制約対象外とする
        if (sourceType === 'play' || sourceType === 'invite' || sourceType === 'chant') {
            // 1ターン目の「召喚」アクションは中央のみ（親・子カード共通）
            if (GameState.turnCount === 1 && GameState.firstPlayer === 'red') {
                availableLanes = availableLanes.filter(l => l === -1 || l === 1);
            }

            // 挑戦: 正面に相手カードがあるレーンのみ
            if (hasSkill(card, 'challenge')) {
                availableLanes = availableLanes.filter(l => l === -1 || opBoard[l] !== null);
            }
            // 伝説: 中央（レーン1）のみ
            if (hasSkill(card, 'legendary')) {
                availableLanes = availableLanes.filter(l => l === -1 || l === 1);
            }
            // 生贄・頂点: invite時は親カードが同レーンに配置済みだがmyBoardには未反映のため、
            // プリフィルタをスキップしprocessActionSequenceの正確なsimStateチェックに委ねる
            if (sourceType !== 'invite' && sourceType !== 'chant') {
                // 生贄: 既にカードが置かれているレーンのみ
                if (hasSkill(card, 'takeover')) {
                    availableLanes = availableLanes.filter(l => l === -1 || myBoard[l] !== null);
                }
                // 頂点: 自分の場に「伝説」を持つカードがいるレーンのみ
                if (hasSkill(card, 'apex')) {
                    availableLanes = availableLanes.filter(l => l === -1 || (myBoard[l] && hasSkill(myBoard[l], 'legendary')));
                }
            }
        }

        // 制約フィルタ後に有効なレーンが0になった場合は空を返す（スキップレーン-1のみなら branches は[[]]扱い）
        if (availableLanes.filter(l => l !== -1).length === 0 && !availableLanes.includes(-1)) return [[]];

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
                    const gatherCounts = (c) => {
                        const skillsToGather = [];
                        if (c.skill && c.skill !== 'none') skillsToGather.push({ id: c.skill, value: c.skillValue ?? 1 });
                        if (Array.isArray(c.skills)) c.skills.forEach(s => skillsToGather.push(s));
                        
                        skillsToGather.forEach(sk => {
                            if (['crush', 'dispel', 'snipe', 'artillery', 'seal', 'destroy'].includes(sk.id)) tokenTargetCount += (sk.value || 1);
                            
                            // 【重要仕様】スキルの値(value)の解釈：
                            // ※ clone, summon は buildSkillBranch 内の token_placement で個別管理するため tc には含めない
                            if (sk.id === 'resurrect') {
                                // 復活: 値(value) = トークンのパワー / 個数は常に「1体」
                                tc += 1;
                            }
                        });
                    };
                    gatherCounts(card);

                    // 選択されたスキル（c1, c2）からの合算
                    const countInChoices = (arr, group) => {
                        if (!group) return;
                        arr.forEach(idx => {
                            const sk = group[idx];
                            if (!sk) return;
                            if (['crush', 'dispel', 'snipe', 'artillery', 'seal', 'destroy'].includes(sk.id)) tokenTargetCount += (sk.value || 1);
                            // ※ clone, summon は buildSkillBranch 内の token_placement で個別管理するため tc には含めない
                            // ※ call, metamorph は実行時の動的判断（アドホック）や自身への適用となるため、事前のレーン確保は不要
                            if (sk.id === 'resurrect') tc += 1;
                        });
                    };
                    countInChoices(c1, card.choices);
                    countInChoices(c2, card.choices2);

                    let tokenLanePatterns = [null];
                    if (tc > 0) {
                        // 召喚先候補から、今カードを置こうとしている「lane」自身を除外する
                        let possibleLanes = [0, 1, 2].filter(l => mySealedLanes[l] === 0 && l !== lane);
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
                            targetUid: card.uid || card.id,
                            laneIdx: lane,
                            choices: c1 !== undefined ? [...c1] : undefined,
                            choices2: c2 !== undefined ? [...c2] : undefined,
                            cardTokenLanes: tLanes && tLanes.length > 0 ? [...tLanes] : undefined
                        };

                        // 発動するスキル群を特定（召喚系アクションの場合のみ）
                        let effectiveSkills = [];
                        let targetSkill = null;
                        
                        const isSummonAction = ['play', 'call', 'invite', 'chant'].includes(sourceType);
                        if (isSummonAction) {
                            // ※ awake（覚醒）はパッシブスキル（所有者のターン開始時発動）のため、ここには含めない
                            if (['invite', 'chant', 'resurrect', 'convert', 'draw', 'reinforce', 'clone', 'summon', 'wall_create', 'split', 'puppet', 'leap'].includes(card.skill)) {
                                effectiveSkills.push({ id: card.skill, value: card.skillValue ?? 1 });
                            }
                            if (Array.isArray(card.skills)) {
                                card.skills.forEach(s => {
                                    // ※ awake（覚醒）はパッシブスキルのため除外
                                    if (['invite', 'chant', 'resurrect', 'convert', 'draw', 'reinforce', 'clone', 'summon', 'wall_create', 'split', 'puppet', 'choice', 'leap'].includes(s.id)) effectiveSkills.push(s);
                                });
                            }
                            if (c1) c1.forEach(idx => { if (card.choices && card.choices[idx]) effectiveSkills.push(card.choices[idx]); });
                            if (c2) c2.forEach(idx => { if (card.choices2 && card.choices2[idx]) effectiveSkills.push(card.choices2[idx]); });

                            // ターゲット選択を伴うスキルを抽出
                            targetSkill = effectiveSkills.find(s => ['invite', 'chant', 'resurrect', 'convert', 'draw', 'reinforce', 'clone', 'summon', 'wall_create', 'split', 'puppet'].includes(s.id));
                        }

                        const buildSkillBranch = (currentSkills, currentUsedHand, currentUsedDiscard, currentDepth, currentDiscardedFromHand = []) => {
                            if (currentSkills.length === 0 || currentDepth >= 4) return [[]];

                            let sk = currentSkills[0];
                            let remainingSkills = currentSkills.slice(1);
                            let results = [];

                            // 【共通】配置系スキル以外は常に「このスキルをキャンセル/スキップする」選択肢を考慮する
                            const isPlacementSkill = ['clone', 'summon', 'wall_create', 'split', 'puppet', 'resurrect'].includes(sk.id);
                            if (!isPlacementSkill) {
                                results.push(...buildSkillBranch(remainingSkills, currentUsedHand, currentUsedDiscard, currentDepth, currentDiscardedFromHand));
                            }

                            if (sk.id === 'invite') {
                                for (let i = 0; i < originalHand.length; i++) {
                                    if (currentUsedHand.includes(i)) continue;
                                    let childCard = originalHand[i];
                                    // 【招来】同じレーンに召喚する仕様のため、forcedLane = lane（親カードのレーン）を渡す
                                    let children = buildCardPlayTree(childCard, i, 'invite', originalHand, originalDiscard, [...currentUsedHand, i], currentUsedDiscard, currentDepth + 1, lane);
                                    for (let cNode of children) {
                                        let nextBranches = buildSkillBranch(remainingSkills, [...currentUsedHand, i], currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                                        for (let nb of nextBranches) {
                                            results.push([...cNode, ...nb]);
                                        }
                                    }
                                }
                            } else if (sk.id === 'chant') {
                                // 【詠唱】招来と違い全レーンが配置候補（forcedLaneなし）
                                const maxP = sk.value ?? 3;
                                for (let i = 0; i < originalHand.length; i++) {
                                    if (currentUsedHand.includes(i)) continue;
                                    let childCard = originalHand[i];
                                    // パワー制限チェック
                                    if ((childCard.power || 0) > maxP) continue;
                                    // 【詠唱】全レーンが候補のためforcedLaneは渡さない
                                    let children = buildCardPlayTree(childCard, i, 'chant', originalHand, originalDiscard, [...currentUsedHand, i], currentUsedDiscard, currentDepth + 1);
                                    for (let cNode of children) {
                                        let nextBranches = buildSkillBranch(remainingSkills, [...currentUsedHand, i], currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                                        for (let nb of nextBranches) {
                                            results.push([...cNode, ...nb]);
                                        }
                                    }
                                }
                            } else if (sk.id === 'forge') {
                                for (let i = 0; i < originalHand.length; i++) {
                                    if (currentUsedHand.includes(i)) continue;
                                    let childCard = originalHand[i];
                                    
                                    const isEquip = hasSkill(childCard, 'equip');
                                    let validLanes = [];
                                    for (let j = 0; j < 3; j++) {
                                        if (myBoard[j] !== null) { 
                                            if (isEquip || hasSkill(myBoard[j], 'arm_self')) {
                                                validLanes.push(j);
                                            }
                                        }
                                    }
                                    
                                    for (let vLane of validLanes) {
                                        let children = buildCardPlayTree(childCard, i, 'forge', originalHand, originalDiscard, [...currentUsedHand, i], currentUsedDiscard, currentDepth + 1, vLane);
                                        for (let cNode of children) {
                                            let nextBranches = buildSkillBranch(remainingSkills, [...currentUsedHand, i], currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                                            for (let nb of nextBranches) {
                                                results.push([...cNode, ...nb]);
                                            }
                                        }
                                    }
                                }
                                
                                // スキップのブランチも作る
                                let nextBranches = buildSkillBranch(remainingSkills, currentUsedHand, currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                                for (let nb of nextBranches) {
                                    results.push([{ type: 'forge', targetIdx: -1, laneIdx: -1 }, ...nb]);
                                }
                            } else if (sk.id === 'leap') {
                                // 【跳躍】スキップせずに使用する分岐（追加ターン付与）
                                // leapノードをアクションキューに追加
                                let leapBranch = buildSkillBranch(remainingSkills, currentUsedHand, currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                                for (let nb of leapBranch) {
                                    results.push([{ type: 'leap' }, ...nb]);
                                }
                            } else if (sk.id === 'resurrect') {
                                const maxP = sk.value || 1;
                                const candidates = [...originalDiscard, ...currentDiscardedFromHand];

                                for (let i = 0; i < candidates.length; i++) {
                                    if (currentUsedDiscard.includes(i)) continue;
                                    let resCard = candidates[i];
                                    
                                    const master = CARD_MASTER.find(m => m.id === resCard.id || m.id === resCard.baseId);
                                    const baseP = master ? master.power : (resCard.power || 0);
                                    if (baseP > maxP || resCard.isToken) continue;

                                    for (let j = 0; j < 3; j++) {
                                        if (mySealedLanes[j] === 1) continue;
                                        // targetUid: discardCard はマスターデータで再構成するため baseId（マスターID）を優先使用する。
                                        // ランタイムID（"red_xxx_7" 等）は discardCard 後に失われるため使用不可。
                                        let resNode = { type: 'resurrect', targetIdx: i, targetUid: resCard.baseId || resCard.id, laneIdx: j, maxP: maxP };
                                        let nextBranches = buildSkillBranch(remainingSkills, currentUsedHand, [...currentUsedDiscard, i], currentDepth, currentDiscardedFromHand);
                                        for (let nb of nextBranches) {
                                            results.push([resNode, ...nb]);
                                        }
                                    }
                                }
                                
                                // 復活の明示的なキャンセル分岐
                                let cancelNode = { type: 'resurrect', targetIdx: -1, laneIdx: -1 };
                                let cancelBranches = buildSkillBranch(remainingSkills, currentUsedHand, currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                                for (let nb of cancelBranches) {
                                    results.push([cancelNode, ...nb]);
                                }
                            } else if (sk.id === 'convert' || sk.id === 'draw' || sk.id === 'reinforce') {
                                const count = sk.value || 1;
                                let handIndices = [];
                                for (let i = 0; i < originalHand.length; i++) {
                                    if (!currentUsedHand.includes(i)) handIndices.push(i);
                                }

                                if (handIndices.length > 0) {
                                    const actualCount = Math.min(count, handIndices.length);
                                    let combinations = getCombinations(handIndices, actualCount);
                                    for (let combo of combinations) {
                                        let discardNodes = combo.map(idx => ({ type: 'discard', targetIdx: idx }));
                                        let newlyDiscarded = combo.map(idx => originalHand[idx]);
                                        let nextBranches = buildSkillBranch(remainingSkills, [...currentUsedHand, ...combo], currentUsedDiscard, currentDepth, [...currentDiscardedFromHand, ...newlyDiscarded]);
                                        for (let nb of nextBranches) {
                                            results.push([...discardNodes, ...nb]);
                                        }
                                    }
                                }
                            // ※ awake（覚醒）はパッシブスキル（所有者のターン開始時に発動）のため、
                            //   召喚時のtoken_placementとしては扱わない。シミュレーション上は元のパワーのまま評価される。
                            } else if (['clone', 'summon', 'wall_create', 'split', 'puppet'].includes(sk.id)) {
                                const count = sk.id === 'clone' ? (sk.value || 1) : 1;
                                // レーン選択の全組み合わせを生成するヘルパー
                                const generateLaneCombos = (remainingCount) => {
                                    if (remainingCount <= 0) return [[]];
                                    let combos = [];
                                    let subCombos = generateLaneCombos(remainingCount - 1);
                                    for (let j = 0; j < 3; j++) {
                                        if (mySealedLanes[j] === 1) continue;
                                        for (let sc of subCombos) {
                                            combos.push([j, ...sc]);
                                        }
                                    }
                                    return combos;
                                };

                                let allCombos = [[]]; // 配置しない（空配列）という明示的な意思
                                // 部分的な配置キャンセル（1体だけ置くなど）をシミュレーションするため、1〜count までの全パターンを生成
                                for (let c = 1; c <= count; c++) {
                                    allCombos.push(...generateLaneCombos(c));
                                }
                                for (let combo of allCombos) {
                                    let tokenNode = { type: 'token_placement', skillId: sk.id, skillValue: sk.value, summonId: sk.summonId, lanes: combo };
                                    let nextBranches = buildSkillBranch(remainingSkills, currentUsedHand, currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                                    for (let nb of nextBranches) {
                                        results.push([tokenNode, ...nb]);
                                    }
                                }
                            } else if (sk.id === 'choice') {
                                const cc = sk.value || 1;
                                const cArr = sk.choiceGroup === 2 ? card.choices2 : card.choices;
                                if (cArr) {
                                    const idxs = cArr.map((_, i) => i);
                                    let combinations = getCombinations(idxs, Math.min(idxs.length, cc));
                                    for (let combo of combinations) {
                                        // 選択したスキルをスキルリストの先頭に追加して再帰（連鎖をシミュレート）
                                        const chosenSkills = combo.map(idx => cArr[idx]);
                                        let nextSkills = [...chosenSkills, ...remainingSkills];
                                        let choiceNode = { type: 'choice', choices: combo, choiceGroup: sk.choiceGroup };
                                        let nextBranches = buildSkillBranch(nextSkills, currentUsedHand, currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                                        for (let nb of nextBranches) {
                                            results.push([choiceNode, ...nb]);
                                        }
                                    }
                                }
                            } else {
                                return buildSkillBranch(remainingSkills, currentUsedHand, currentUsedDiscard, currentDepth, currentDiscardedFromHand);
                            }
                            return results;
                        };

                        if (depth < 2 && effectiveSkills.length > 0) {
                            let skillChains = buildSkillBranch(effectiveSkills, usedHand, usedDiscard, depth);
                            for (let chain of skillChains) {
                                branches.push([node, ...chain]);
                            }
                        } else {
                            branches.push([node]);
                        }
                    }
                }
            }
        }

        if (branches.length === 0) return [[]];
        // 空のアクション配列（何も起きないブランチ）を除去し、重複を避ける
        return branches.filter(b => b.length > 0);
    }

    function processActionSequence(actionQueue, isLeaderSkillPlay = false, leaderSkillActionStr = null, leaderSkillTokenLanes = null, skillOrderTiming = 'before', leaderSkillTargetIdx = null) {
        let simState = {
            playerBoard: opBoard.map(cloneCard),
            enemyBoard: myBoard.map(cloneCard),
            playerDiscard: GameState.playerDiscard ? GameState.playerDiscard.map(cloneCard) : [],
            enemyDiscard: discard ? discard.map(cloneCard) : [],
            playerSealedLanes: [...(GameState.playerSealedLanes || [0, 0, 0])],
            enemySealedLanes: [...(GameState.enemySealedLanes || [0, 0, 0])],
            playerHP: opHP,
            enemyHP: myHP,
            playerMaxHP: GameState.playerMaxHP || 25,
            enemyMaxHP: GameState.enemyMaxHP || 25,
            playerSP: GameState.playerSP || 0,
            enemySP: mySP || 0,
            playerHand: GameState.playerHand ? GameState.playerHand.map(cloneCard) : [],
            enemyHand: hand ? hand.map(cloneCard) : [],
            playerDeck: GameState.playerDeck ? GameState.playerDeck.map(cloneCard) : [],
            enemyDeck: [],
            extraTurnCount: GameState.extraTurnCount || 0,
            attackSkipCount: GameState.attackSkipCount || 0,
            combatDamageTaken: 0,
            lastCardPlayed: null,
            lastPlayedLane: -1,
            _actionQueue: []
        };

        [simState.playerBoard, simState.enemyBoard].forEach(b => {
            b.forEach(c => {
                if (c) {
                    if (c.currentPower === undefined || c.currentPower === null) {
                        c.currentPower = c.power || 0;
                    }
                    c.isSkillResolving = false; // シミュレート空間ではアニメーション待ちの保護フラグを無効化
                }
            });
        });

        if (isLeaderSkillPlay && skillOrderTiming === 'before' && leaderSkillActionStr) {
            simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
            applyLeaderSkillLogic(simState, 'red', leaderSkillActionStr, leaderSkillTokenLanes, [], leaderSkillTargetIdx);
            if (simState._actionQueue && simState._actionQueue.length > 0) {
                actionQueue.unshift(...simState._actionQueue);
                delete simState._actionQueue;
            }
            // リーダースキル適用後、パワー0以下のカードを破壊済みとしてnullにする
            // （targeted_destruction等はcurrentPowerを0にするだけなので、制約チェックが正しく機能するよう反映）
            for (let i = 0; i < 3; i++) {
                if (simState.playerBoard[i] && simState.playerBoard[i].currentPower <= 0) simState.playerBoard[i] = null;
                if (simState.enemyBoard[i] && simState.enemyBoard[i].currentPower <= 0) simState.enemyBoard[i] = null;
            }
        }

        for (let action of actionQueue) {
            if (action.type === 'pass') continue;

            if (action.type === 'discard') {
                if (simState.enemyHand[action.targetIdx]) {
                    simState.enemyDiscard.push(simState.enemyHand[action.targetIdx]);
                    simState.enemyHand[action.targetIdx] = null;
                }
                continue;
            }

            const tIdx = action.targetIdx;
            const lIdx = action.laneIdx;
            let playedCard = null;

            if (mySealedLanes[lIdx] === 1) return null;

            let checkConstraints = false;
            let triggerSkills = true;


            if (action.type === 'play' || action.type === 'invite' || action.type === 'chant' || action.type === 'forge') {
                // laneIdx=-1 は「このスキルをスキップ」のセンチネル値（chant/invite/forge用）
                // 実行時と同様に手札を消費せずスキップする
                if (lIdx === -1 && (action.type === 'invite' || action.type === 'chant' || action.type === 'forge')) {
                    continue;
                }
                playedCard = cloneCard(simState.enemyHand[tIdx]);
                if (action.type === 'forge') {
                    const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
                    simState.enemyHand.push(cloneCard(voidTpl));
                }
                checkConstraints = true;
                if (simState.enemyHand[tIdx]) simState.enemyHand[tIdx] = null;
                simState.lastPlayedLane = lIdx;
            } else if (action.type === 'token_placement') {
                const sourceL = simState.lastPlayedLane !== -1 ? simState.lastPlayedLane : 0;
                const sourceCard = simState.enemyBoard[sourceL];
                // パワー0カードが破壊済みの場合、applyActiveSkillLogic は c=null で即リターンするため
                // summonId が分かっているなら直接トークンを生成する
                if (!sourceCard && ['summon', 'wall_create', 'clone', 'split'].includes(action.skillId)) {
                    const tokenPower = action.skillValue || 1;
                    let tokenId = action.summonId;
                    if (!tokenId) {
                        if (action.skillId === 'wall_create') {
                            tokenId = 'token_wall';
                        } else {
                            tokenId = tokenPower >= 5 ? 'token_golem' : 'token_drone';
                        }
                    }
                    const baseMaster = CARD_MASTER.find(m => m.id === tokenId);
                    const lanes = [...(action.lanes || [])];
                    for (const tLane of lanes) {
                        const sealedLanes = simState.enemySealedLanes || [0, 0, 0];
                        if (sealedLanes[tLane] === 1) continue;
                        const newToken = {
                            id: `sm_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
                            baseId: tokenId,
                            name: baseMaster?.name || 'トークン',
                            isToken: true,
                            rarity: 1,
                            owner: 'red',
                            imgUrl: `assets/cards/card_${tokenId}.jpg`,
                            power: tokenPower,
                            basePower: tokenPower,
                            currentPower: tokenPower,
                            voiceCategory: baseMaster?.voiceCategory || 'monster',
                            skills: []
                        };
                        if (simState.enemyBoard[tLane] !== null) {
                            // シミュレーション内の簡易処理: 既存カードを墓地に移動
                            simState.enemyDiscard.push(simState.enemyBoard[tLane]);
                            simState.enemyBoard[tLane] = null;
                        }
                        simState.enemyBoard[tLane] = newToken;
                    }
                } else {
                    // 【重要】action.lanes のコピーを渡す。applyActiveSkillLogic 内部で shift() により
                    // 配列が消費されるため、元配列をそのまま渡すと actionQueue に空配列が残り、
                    // 実行時の skillLogic.js でレーン指定が取得できなくなる。
                    applyActiveSkillLogic(simState, 'red', sourceL, action.skillId, action.skillValue || 0, [], [...(action.lanes || [])], undefined);
                }
                continue;
            } else if (action.type === 'resurrect') {
                if (isGraveKeeperActive(simState)) return null;
                if (lIdx === -1) continue; // 明示的キャンセル
                // 【重要】UID優先照合: リーダースキルのspliceでインデックスがずれる問題を回避
                let resIdx = -1;
                if (action.targetUid) {
                    resIdx = simState.enemyDiscard.findIndex(c => c && (c.baseId === action.targetUid || c.id === action.targetUid));
                }
                if (resIdx === -1 && action.targetIdx !== undefined) {
                    resIdx = action.targetIdx;
                }
                if (resIdx === -1 || !simState.enemyDiscard[resIdx]) return null;
                playedCard = cloneCard(simState.enemyDiscard[resIdx]);
                simState.lastPlayedLane = lIdx;
                if (playedCard && action.maxP !== undefined) {
                    const master = CARD_MASTER.find(m => m.id === playedCard.id || m.id === playedCard.baseId);
                    const baseP = master ? master.power : (playedCard.power || 0);
                    if (baseP > action.maxP) return null; // 制限オーバーは不正として棄却
                }
                checkConstraints = false;
                triggerSkills = false;
                if (playedCard) playedCard.skillTriggered = true;
                simState.enemyDiscard[resIdx] = null;
            } else if (action.type === 'salvage') {
                if (isGraveKeeperActive(simState)) return null;
                let resIdx = -1;
                if (action.targetUid) resIdx = simState.enemyDiscard.findIndex(c => c && (c.baseId === action.targetUid || c.id === action.targetUid));
                if (resIdx === -1 && action.targetIdx !== undefined) resIdx = action.targetIdx;
                if (resIdx === -1 || !simState.enemyDiscard[resIdx]) return null;
                
                let salvagedCard = cloneCard(simState.enemyDiscard[resIdx]);
                simState.enemyDiscard[resIdx] = null;
                simState.enemyHand.push(salvagedCard);
                continue; // 盤面には出さない
            } else if (action.type === 'devilhunter_resurrect' || action.type === 'targeted_destruction' || action.type === 'tomb_guard' || action.type === 'elf_polarbear_combo') {
                // すでにapplyLeaderSkillLogicによって、盤面への配置や合体・装備処理は「完了」している。
                // したがって、アクションループの残りの処理（盤面の上書きやスキルの再発動）は行わず、
                // 次のアクションのシミュレートへ移るためにcontinueする。
                continue;
            } else if (action.type === 'leap') {
                // 【跳躍】追加ターンを1回付与（SP増加なし・攻撃なし）
                simState.extraTurnCount = (simState.extraTurnCount || 0) + 1;
                simState.attackSkipCount = (simState.attackSkipCount || 0) + 1;
                continue;
            }

            if (!playedCard) return null;

            if (checkConstraints) {
                if (hasSkill(playedCard, 'challenge') && simState.playerBoard[lIdx] === null) return null;
                if (hasSkill(playedCard, 'takeover') && simState.enemyBoard[lIdx] === null) return null;
                if (hasSkill(playedCard, 'legendary') && lIdx !== 1) return null;
                if (hasSkill(playedCard, 'apex') && !(simState.enemyBoard[lIdx] && hasSkill(simState.enemyBoard[lIdx], 'legendary'))) return null;

            }

            let skillWasHandledByEquip = false;
            if ((hasSkill(playedCard, 'equip') || hasSkill(simState.enemyBoard[lIdx], 'arm_self')) && simState.enemyBoard[lIdx]) {
                skillWasHandledByEquip = true;
                const targetCard = simState.enemyBoard[lIdx];
                targetCard.basePower = (targetCard.basePower || 0) + (playedCard.power || 0);
                targetCard.currentPower = (targetCard.currentPower || 0) + (playedCard.power || 0);
                let addedSkills = [];
                if (playedCard.skill && playedCard.skill !== 'none' && playedCard.skill !== 'equip') addedSkills.push({ id: playedCard.skill, value: playedCard.skillValue });
                if (playedCard.skills) playedCard.skills.forEach(s => { if (s.id !== 'equip') addedSkills.push({ id: s.id, value: s.value }); });
                mergeCardSkills(targetCard, addedSkills);
                let cLanesForEquip = action.cardTokenLanes ? [...action.cardTokenLanes] : null;
                applyActiveSkillLogic(simState, 'red', lIdx, 'equip', 0, [], cLanesForEquip, lIdx); // 装備によるバフと付随スキルのシミュレート
                if (simState._actionQueue && simState._actionQueue.length > 0) {
                    actionQueue.push(...simState._actionQueue);
                    delete simState._actionQueue;
                }
            } 

            if (!skillWasHandledByEquip) {
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
                let modifiedSkillsForCard = [];
                if (activeCardForSkills.skill && activeCardForSkills.skill !== 'none') {
                    if (activeCardForSkills.skill === 'choice' && action.choices && activeCardForSkills.choices) {
                        action.choices.forEach(idx => { 
                            if (activeCardForSkills.choices[idx]) {
                                let sk = { id: activeCardForSkills.choices[idx].id, value: activeCardForSkills.choices[idx].value };
                                skills.push(sk); 
                                modifiedSkillsForCard.push(sk);
                            }
                        });
                        activeCardForSkills.skill = 'none';
                    } else {
                        skills.push({ id: activeCardForSkills.skill, value: activeCardForSkills.skillValue });
                    }
                }
                
                let newSkillsArr = [];
                if (Array.isArray(activeCardForSkills.skills)) {
                    activeCardForSkills.skills.forEach(sk => {
                        if (sk.id === 'choice') {
                            if (sk.choiceGroup === 2 && action.choices2 && activeCardForSkills.choices2) {
                                action.choices2.forEach(idx => { 
                                    if (activeCardForSkills.choices2[idx]) {
                                        let chosenSk = { id: activeCardForSkills.choices2[idx].id, value: activeCardForSkills.choices2[idx].value };
                                        skills.push(chosenSk); 
                                        newSkillsArr.push(chosenSk);
                                    }
                                });
                            } else if (action.choices && activeCardForSkills.choices) {
                                action.choices.forEach(idx => { 
                                    if (activeCardForSkills.choices[idx]) {
                                        let chosenSk = { id: activeCardForSkills.choices[idx].id, value: activeCardForSkills.choices[idx].value };
                                        skills.push(chosenSk); 
                                        newSkillsArr.push(chosenSk);
                                    }
                                });
                            }
                        } else {
                            skills.push(sk);
                            newSkillsArr.push(sk);
                        }
                    });
                    activeCardForSkills.skills = [...newSkillsArr, ...modifiedSkillsForCard];
                } else if (modifiedSkillsForCard.length > 0) {
                    activeCardForSkills.skills = [...modifiedSkillsForCard];
                }

                let cLanesForPass = action.cardTokenLanes ? [...action.cardTokenLanes] : null;
                if (triggerSkills && !activeCardForSkills.skillTriggered) {
                    skills.forEach(sk => {
                        // 【重要】アクションキューで個別に処理されるターゲット選択系スキルはここでは実行しない。
                        // そうしないと、召喚したレーンの自分自身を上書きしてしまう（墓荒らし3 + デスロード2 = 5 等）バグが起きる。
                        // resurrect/salvage は専用ノードとして actionQueue に積まれるため、ここで呼ぶと discard が二重消費される。
                        // puppet と summon は token_placement として actionQueue に積まれているため2重実行を防ぐ。
                        if (sk.id === 'call') {
                            // 【号令の仮評価】
                            // デッキトップの内容はシミュレーション時点では不明。
                            // そのため、号令の値（callの skillValue）分のパワーを、号令を持つカード自身に仮加算する。
                            // 例: パワー3の「魔琴の奏者」が号令3を持つ → パワー6として戦闘結果をシミュレート。
                            // ※ この仮パワーは事前評価用であり、実際の号令発動時（skillLogic.js）には
                            //   デッキトップの実カードが判明するため、evaluateAdhocTokenLanes() で
                            //   改めてシミュレーションベースの最適レーン選択が行われる。
                            //   その際、号令元カードは GameState から読まれるので「本来のパワー」で盤面に存在する。
                            const callBonus = sk.value || 3;
                            const boardCard = simState.enemyBoard[lIdx];
                            if (boardCard) {
                                boardCard.currentPower = (boardCard.currentPower || 0) + callBonus;
                                boardCard.basePower = (boardCard.basePower || 0) + callBonus;
                            }
                        } else if (sk.id === 'metamorph') {
                            // 【変身の仮評価】
                            // 変身先はランダムで不明なため、固定の仮パワー（METAMORPH_ESTIMATED_POWER）で評価する。
                            // 変身元カードのパワー（通常0）を仮パワーで上書きして戦闘結果をシミュレートする。
                            const boardCard = simState.enemyBoard[lIdx];
                            if (boardCard) {
                                boardCard.currentPower = METAMORPH_ESTIMATED_POWER;
                                boardCard.basePower = METAMORPH_ESTIMATED_POWER;
                            }
                        } else if (sk.id === 'leap') {
                            // 【跳躍】追加ターンを1回付与（敵の攻撃フェーズをスキップ）
                            simState.extraTurnCount = (simState.extraTurnCount || 0) + 1;
                            simState.attackSkipCount = (simState.attackSkipCount || 0) + 1;
                        } else if (!['invite', 'chant', 'convert', 'draw', 'salvage', 'reinforce', 'puppet', 'summon', 'resurrect', 'awake', 'clone', 'wall_create'].includes(sk.id)) {
                           applyActiveSkillLogic(simState, 'red', lIdx, sk.id, sk.value, [], action.cardTokenLanes ? [...action.cardTokenLanes] : null, undefined);
                        }
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
                    if ((adjusted.type === 'invite' || adjusted.type === 'chant' || adjusted.type === 'play' || adjusted.type === 'discard') && firstAction.type === 'play') {
                        // targetUidがあればuid照合で確実に特定できるが、processActionSequence用にtargetIdxも調整
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
            combs.push([]); // 0体パターン（騎士を出さずバフのみ）
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
        } else if (action === 'overdrive') {
            // overdrive は自分の墓地・相手の墓地から1枚ずつ2回配置するため
            // [自分墓地の配置先, 相手墓地の配置先] の2要素ペアを生成する
            const avail = [0, 1, 2].filter(l => mySealedLanes[l] === 0);
            let pairs = [];
            for (let l1 of avail) {
                for (let l2 of avail) {
                    if (l1 !== l2) pairs.push([l1, l2]); // 異なるレーンのペア（上書き防止）
                }
            }
            // 空きレーンが1つしかない場合は同一レーンも許可（上書きは仕様）
            if (pairs.length === 0 && avail.length > 0) {
                pairs = avail.map(l => [l, l]);
            }
            tokenLanePatterns = pairs.length > 0 ? pairs : [null];
        } else if (action === 'targeted_destruction' || action === 'tomb_guard') {
            tokenLanePatterns = [0, 1, 2].filter(l => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune')).map(l => [l]);
            if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
        } else if (action === 'seal_lanes') {
            const avail = [0, 1, 2].filter(l => !GameState.playerSealedLanes || GameState.playerSealedLanes[l] === 0);
            let combs = [];
            for (let l of avail) combs.push([l]);
            if (avail.length >= 2) combs.push(...getCombinations(avail, 2));
            tokenLanePatterns = combs.length > 0 ? combs : [null];
        } else if (action === 'night_parade') {
            const availEnemy = [0, 1, 2].filter(l => !GameState.playerSealedLanes || GameState.playerSealedLanes[l] === 0);
            let enemyPatterns = [[]];
            for (let l of availEnemy) enemyPatterns.push([l]);
            if (availEnemy.length >= 2) enemyPatterns.push(...getCombinations(availEnemy, 2));

            const availAllied = [0, 1, 2].filter(l => mySealedLanes[l] === 0);
            let alliedPatterns = [[]];
            for (let l1 of availAllied) {
                alliedPatterns.push([l1]);
                for (let l2 of availAllied) {
                    if (l1 <= l2) alliedPatterns.push([l1, l2]);
                }
            }

            let combs = [];
            for (let e of enemyPatterns) {
                for (let a of alliedPatterns) {
                    combs.push({ enemy: e, allied: a });
                }
            }
            tokenLanePatterns = combs.length > 0 ? combs : [null];
        } else if (action === 'elf_polarbear_combo') {
            const enemyOcc = [0, 1, 2].filter(l => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune'));
            const myAvail = [0, 1, 2].filter(l => mySealedLanes[l] === 0);
            let combs = [];
            if (enemyOcc.length > 0 && myAvail.length > 0) {
                for (let e of enemyOcc) for (let m of myAvail) combs.push([e, m]);
                tokenLanePatterns = combs;
            } else tokenLanePatterns = [null];
        }

        for (let i = 0; i < hand.length; i++) {
            let card = hand[i];
            for (let tokenLanes of tokenLanePatterns) {
                let qs = buildCardPlayTree(card, i, 'play', hand, discard, [i], [], 0);
                for (let actionQ of qs) {
                    if (actionQ.length === 0) continue;
                    const fA = actionQ[0];
                    
                    // 配置レーンが重複している場合は避ける（他に空きがある場合）
                    let overlapLanes = [];
                    if (Array.isArray(tokenLanes)) overlapLanes = tokenLanes;
                    else if (tokenLanes && tokenLanes.allied) overlapLanes = tokenLanes.allied;

                    const isOverlap = overlapLanes && overlapLanes.length > 0 && overlapLanes.includes(fA.laneIdx);
                    if (isOverlap) {
                        // リーダースキル(before)でトークン配置後の盤面で空きレーンを判定する
                        const currentEmpty = myBoard.filter(l => l === null).length;
                        const tokensFillingEmpty = overlapLanes.filter(l => myBoard[l] === null).length;
                        const effectiveEmptyCount = currentEmpty - tokensFillingEmpty;
                        // 重複しているが他に空きがあるなら、わざわざトークンを上書きする必要はないのでスキップ
                        if (effectiveEmptyCount >= 1) continue;
                    }

                    if (action === 'devilhunter_resurrect' || action === 'overdrive') {
                        for (let dIdx = 0; dIdx < discard.length; dIdx++) {
                            if (discard[dIdx].isToken) continue;
                            let simState = processActionSequence(actionQ, true, action, tokenLanes, 'before', dIdx);
                            if (simState) {
                                let fChcs = [fA.choices, fA.choices2].filter(x => x !== undefined);
                                const resTargetCard = discard[dIdx];
                                candidates.push({
                                    index: i, lane: fA.laneIdx, isOverwrite: myBoard[fA.laneIdx] !== null,
                                    useSkill: true, tokenLanes, skillOrder: 'before',
                                    leaderSkillTargetIdx: dIdx,
                                    leaderSkillTargetUid: resTargetCard.baseId || resTargetCard.id,
                                    choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
                                    cardTokenLanes: fA.cardTokenLanes,
                                    actionQueue: actionQ.slice(1).length > 0 ? actionQ.slice(1).map(act => {
                                        let adjusted = { ...act };
                                        if ((adjusted.type === 'invite' || adjusted.type === 'chant' || adjusted.type === 'play' || adjusted.type === 'discard') && fA.type === 'play') {
                                            if (adjusted.targetIdx > fA.targetIdx) adjusted.targetIdx -= 1;
                                        }
                                        return adjusted;
                                    }) : undefined,
                                    simState
                                });
                            }
                        }
                    } else {
                        // その他（聖戦・邪戦・サタン・龍神等）
                        let simState = processActionSequence(actionQ, true, action, tokenLanes, 'before');
                        if (simState) {
                            let fChcs = [fA.choices, fA.choices2].filter(x => x !== undefined);
                            candidates.push({
                                index: i, lane: fA.laneIdx, isOverwrite: myBoard[fA.laneIdx] !== null,
                                useSkill: true, tokenLanes, skillOrder: 'before',
                                choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
                                cardTokenLanes: fA.cardTokenLanes,
                                actionQueue: actionQ.slice(1).length > 0 ? actionQ.slice(1).map(act => {
                                    let adjusted = { ...act };
                                    if ((adjusted.type === 'invite' || adjusted.type === 'chant' || adjusted.type === 'play' || adjusted.type === 'discard') && fA.type === 'play') {
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
            if (action === 'devilhunter_resurrect' || action === 'overdrive') {
                for (let dIdx = 0; dIdx < discard.length; dIdx++) {
                    if (discard[dIdx].isToken) continue;
                    let simState = processActionSequence([{ type: 'pass' }], true, action, tokenLanes, 'before', dIdx);
                    if (simState) {
                        const resTargetCard = discard[dIdx];
                        candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill: true, tokenLanes, skillOrder: 'before', leaderSkillTargetIdx: dIdx, leaderSkillTargetUid: resTargetCard.baseId || resTargetCard.id, simState });
                    }
                }
            } else {
                let simState = processActionSequence([{ type: 'pass' }], true, action, tokenLanes, 'before');
                if (simState) candidates.push({ index: -1, lane: -1, isOverwrite: false, useSkill: true, tokenLanes, skillOrder: 'before', simState });
            }
        }
    }

    // simStateがnullの候補を安全に除外（processActionSequenceが想定外にnullを返した場合の防御）
    candidates = candidates.filter(c => c.simState !== null && c.simState !== undefined);

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

    // スコア順、次いでリーダースキル不使用優先、最後にアクションの短さ順でソート（不要なスキル消費を避ける）
    candidates.sort((a, b) => {
        if (Math.abs(a.score - b.score) > 0.001) return b.score - a.score;
        if (a.useSkill !== b.useSkill) return a.useSkill ? 1 : -1;
        const aLen = a.actionQueue ? a.actionQueue.length : 0;
        const bLen = b.actionQueue ? b.actionQueue.length : 0;
        return aLen - bLen;
    });

    if (candidates.length === 0) return { index: -1, lane: -1, useSkill: false };



    const bestScore = candidates[0].score;
    let bestGroup = candidates.filter(c => Math.abs(c.score - bestScore) < 0.001);

    // 同スコア候補の中で、リーダースキルを使用しない選択肢があればそれを優先する
    const hasNoSkill = bestGroup.some(c => !c.useSkill);
    if (hasNoSkill) {
        bestGroup = bestGroup.filter(c => !c.useSkill);
    }

    // 同スコア候補の中で最短のアクション数のものだけを残す（不要なスキル消費を避ける）
    const minActionLen = Math.min(...bestGroup.map(c => c.actionQueue ? c.actionQueue.length : 0));
    const finalGroup = bestGroup.filter(c => (c.actionQueue ? c.actionQueue.length : 0) === minActionLen);

    const finalDecision = finalGroup[Math.floor(Math.random() * finalGroup.length)];

    const cardName = finalDecision.index !== -1 ? hand[finalDecision.index].name : "PASS";
    
    // 現在のパワー計算
    const initialMyP = myBoard.reduce((sum, c) => sum + (c ? Math.max(0, c.currentPower ?? 0) : 0), 0);
    const initialOpP = opBoard.reduce((sum, c) => sum + (c ? Math.max(0, c.currentPower ?? 0) : 0), 0);
    const initialDiff = initialMyP - initialOpP;

    // シミュレート後のパワー計算
    const finalMyP = finalDecision.simState.enemyBoard.reduce((sum, c) => sum + (c ? Math.max(0, c.currentPower ?? 0) : 0), 0);
    const finalOpP = finalDecision.simState.playerBoard.reduce((sum, c) => sum + (c ? Math.max(0, c.currentPower ?? 0) : 0), 0);
    const finalDiff = finalMyP - finalOpP;
    const diffGain = finalDiff - initialDiff;

    let resInfo = "";
    if (finalDecision.useSkill && (skill.action === 'devilhunter_resurrect' || skill.action === 'overdrive') && finalDecision.leaderSkillTargetIdx !== undefined) {
        const resCard = finalDecision.leaderSkillTargetUid
            ? discard.find(c => c && (c.baseId === finalDecision.leaderSkillTargetUid || c.id === finalDecision.leaderSkillTargetUid))
            : discard[finalDecision.leaderSkillTargetIdx];
        if (resCard) resInfo = ` (Resurrect: ${resCard.name})`;
    }

    // ダメージ計算
    const hpDmg = Math.max(0, GameState.enemyHP - finalDecision.simState.enemyHP);
    let summonedP = (finalDecision.index !== -1) ? (hand[finalDecision.index].currentPower || hand[finalDecision.index].power || 0) : 0;
    if (finalDecision.useSkill && (skill.action === 'devilhunter_resurrect' || skill.action === 'overdrive') && finalDecision.leaderSkillTargetIdx !== undefined) {
        const resCard = discard[finalDecision.leaderSkillTargetIdx];
        if (resCard) summonedP += (resCard.power || 0);
    }
    const boardDmg = Math.max(0, (initialMyP + summonedP) - finalMyP);

    console.log(`[AI Decision] ${cardName} -> Lane: ${finalDecision.lane}${resInfo} (Skill: ${finalDecision.useSkill ? "YES" : "NO"})`);
    console.log(`[AI Reasoning] Power Diff: ${initialDiff} -> ${finalDiff} (Gain: ${diffGain > 0 ? "+" : ""}${diffGain})`);
    console.log(`[AI Stats] Final Board: My ${finalMyP} vs Op ${finalOpP} (Damage: HP -${hpDmg}, Card -${boardDmg}), Candidates: ${bestGroup.length}`);
    
    // 詳細な盤面ログ出力（battle.jsの[Player Turn End]と同じ [Player] ... vs [AI] ... 形式）
    const dumpB = (b) => b.map((c, i) => c ? `${c.name}(${c.currentPower !== undefined ? c.currentPower : c.power})` : "EMPTY").join(" | ");
    console.log(`[AI DEBUG] Before: [Player] ${dumpB(opBoard)} vs [AI] ${dumpB(myBoard)}`);
    console.log(`[AI DEBUG] After:  [Player] ${dumpB(finalDecision.simState.playerBoard)} vs [AI] ${dumpB(finalDecision.simState.enemyBoard)}`);

    GameState.aiDecision = finalDecision;
    return finalDecision;
}

/**
 * 【AI思考の核】盤面の状態をティア（生存階層）とスコアで厳密に評価する
 * 
 * 優先順位（上にあるほど絶対的）:
 * 1. 生存ティア (Tier 1:安全 > Tier 2:危険 > Tier 3:敗北)
 * 2. 勝利判定 (相手HPを0以下にできるなら最優先)
 * 2.5. 追加ターンボーナス (次ターンにカードを追加で出せる + 敵の攻撃を受けない)
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

    // 1. 各種数値の集計
    for (let i = 0; i < 3; i++) {
        if (state.enemyBoard[i]) {
            const c = state.enemyBoard[i];
            myPower += Number(c.currentPower ?? c.power ?? 0);
            
            // 4. ユーティリティ価値の算出（AI_SKILL_UTILITYテーブル参照）
            // skillTriggered = true の場合、アクティブスキルは発動済みなので
            // パッシブスキルのみ評価する
            const addUtility = (skillId) => {
                if (AI_SKILL_UTILITY[skillId]) utilityScore += AI_SKILL_UTILITY[skillId];
            };
            if (c.skill && c.skill !== 'none') {
                // アクティブスキル（draw, heal等）は未発動時のみ加算
                if (!c.skillTriggered || !['draw', 'heal', 'bless', 'morph', 'shuffle'].includes(c.skill)) {
                    addUtility(c.skill);
                }
            }
            if (Array.isArray(c.skills)) {
                c.skills.forEach(sk => {
                    if (!c.skillTriggered || !['draw', 'heal', 'bless', 'morph', 'shuffle'].includes(sk.id)) {
                        addUtility(sk.id);
                    }
                });
            }
        }
        if (state.playerBoard[i]) {
            const opC = state.playerBoard[i];
            opPower += Number(opC.currentPower ?? opC.power ?? 0);
        }
    }

    // 2. 生存ティアの判定 (Tier 1:安全 > Tier 2:危険 > Tier 3:敗北)
    let tier = 1;
    if (state.enemyHP <= 0) {
        tier = 3;
    } else if ((state.combatDamageTaken || 0) >= 4) {
        tier = 2;
    }

    // 3. 【AI思考の核】に基づいた絶対優先順位スコアの構築
    // スロットごとに桁を分けることで、下位の項目が上位を逆転できないようにする
    
    // スロット1: 生存ティア (Tier1=2, Tier2=1, Tier3=0)
    let s1 = (3 - tier) * 100000000;
    
    // スロット2: 勝利判定 (1か0)
    let s2 = (state.playerHP <= 0 ? 1 : 0) * 10000000;

    // スロット2.5: 追加ターンボーナス
    // 追加ターンは「次ターンにカードを追加で出せる + 敵の攻撃を受けない」ため非常に強力。
    // 戦闘フェーズスキップの恩恵はsimStateのcombatDamageTakenに既に反映されているが、
    // 「次ターンにカードを1枚追加で出せる」アドバンテージは評価されていないため加算する。
    const extraTurnBonus = (state.extraTurnCount || 0) > 0 ? 1 : 0;
    let s25 = extraTurnBonus * 1000000;
    
    // スロット3: 盤面パワー合計差 (自分の生存パワー総和 - 相手の生存パワー総和)
    // -150〜150の範囲を想定し+200して正の値にする
    let s3 = (myPower - opPower + 200) * 1000;
    
    // スロット4: ユーティリティ価値
    let s4 = utilityScore * 10;
    
    // スロット5: タイブレーク (生存枚数)
    // 自分の枚数が少ないほど高評価（装備一点集中・生贄の高打点を評価）
    // 相手の枚数が少ないほど高評価（盤面制圧を評価）
    const myCount = state.enemyBoard.filter(c => c && (c.currentPower !== undefined ? c.currentPower > 0 : (c.power || 0) > 0)).length;
    const opCount = state.playerBoard.filter(c => c && (c.currentPower !== undefined ? c.currentPower > 0 : (c.power || 0) > 0)).length;
    let s5 = (8 - myCount - opCount);

    // スロット6: 封印ボーナス (空のレーンを封印した際の優先度：中央 > 左 > 右)
    // パワー差等で同点になった場合のタイブレークとして微小なスコアを加算
    let s6 = 0;
    if (state.playerSealedLanes) {
        if (state.playerSealedLanes[1] === 1) s6 += 0.03; // 中央
        if (state.playerSealedLanes[0] === 1) s6 += 0.02; // 左
        if (state.playerSealedLanes[2] === 1) s6 += 0.01; // 右
    }

    return s1 + s2 + s25 + s3 + s4 + s5 + s6;
}

export function evaluateAdhocTokenLanes(tokenCard, checkConstraints = true, canCancel = false) {
    const sealedLanes = GameState.enemySealedLanes || [0, 0, 0];
    const allLanes = [0, 1, 2].filter(l => sealedLanes[l] === 0);
    // 配置可能なレーンを抽出
    let validLanes = allLanes.filter(l => {
        if (checkConstraints) {
            // 1ターン目の「召喚」は中央のみ
            if (GameState.turnCount === 1 && GameState.firstPlayer === 'red' && l !== 1) return false;
        }
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

    /**
     * 【号令で出されたカードのレーン選択シミュレーション】
     * この関数（evaluateAdhocTokenLanes）は、号令などで実際にカードを出す瞬間に呼ばれる。
     * simState は GameState から直接ディープコピーされるため:
     * - 号令元カード（例: 魔琴の奏者）は「本来のパワー」で盤面上に存在する
     * - processActionSequence で仮加算されたパワーは影響しない（あちらはシミュレーション空間のみ）
     * - リーダースキルの実行はこの関数内では行わない（号令時点ではタイミングが過ぎているため）
     * 
     * 号令で出されたカードが更に号令や変身を持っていた場合も、
     * 下記のスキル実行ループ内で同じ仮評価ルール（callの値分加算 / metamorphは固定パワー）が適用される。
     */
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

            // 配置したカードのスキルをシミュレーション上で実行する
            // ※ 号令で出されたカードが号令や変身を持つ場合も、同じ仮評価ルールが適用される
            let skills = [];
            if (played.skill && played.skill !== 'none') skills.push({ id: played.skill, value: played.skillValue });
            if (Array.isArray(played.skills)) skills = skills.concat(played.skills);
            skills.forEach(sk => {
                if (sk.id === 'call') {
                    // 【号令の仮評価】号令で出されたカードがさらに号令を持つ場合も、値分のパワーを仮加算
                    const callBonus = sk.value || 3;
                    const boardCard = simState.enemyBoard[l];
                    if (boardCard) {
                        boardCard.currentPower = (boardCard.currentPower || 0) + callBonus;
                        boardCard.basePower = (boardCard.basePower || 0) + callBonus;
                    }
                } else if (sk.id === 'metamorph') {
                    // 【変身の仮評価】号令で出されたカードが変身を持つ場合も、固定パワーで仮評価
                    const boardCard = simState.enemyBoard[l];
                    if (boardCard) {
                        boardCard.currentPower = METAMORPH_ESTIMATED_POWER;
                        boardCard.basePower = METAMORPH_ESTIMATED_POWER;
                    }
                } else {
                    applyActiveSkillLogic(simState, 'red', l, sk.id, sk.value);
                }
            });
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

    if (canCancel) {
        // キャンセル（配置しない）場合のシミュレーション評価
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
        const hpBeforeCombat = simState.enemyHP;
        applyPassiveSkillLogic(simState, 'blue');
        calculateCombatPhase(simState, 'blue'); 
        simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);
        let score = evaluateSimState(simState);
        // キャンセルを優先するための微小ボーナス
        scores.push({ lane: -1, score: score + 0.05 });
    }

    // 最高スコアのレーンを抽出
    scores.sort((a, b) => b.score - a.score);
    if (scores.length === 0) return [];
    
    if (scores[0].lane === -1) {
        console.log(`[AI Token] Cancelled placement (Score: ${scores[0].score.toFixed(1)})`);
        return null;
    }

    const topScore = scores[0].score;
    const bestLanes = scores.filter(s => Math.abs(s.score - topScore) < 0.001).map(s => s.lane);

    // 号令等のトークン配置シミュレーション結果ログ（[Player] ... vs [AI] ... 形式で統一）
    const bestEntry = scores[0];
    const dumpB = (b) => b.map(c => c ? `${c.name}(${c.currentPower !== undefined ? c.currentPower : c.power})` : 'EMPTY').join(' | ');
    console.log(`[AI Token] ${tokenCard ? tokenCard.name : 'destroy'} -> Lane: ${bestEntry.lane} (Score: ${bestEntry.score.toFixed(1)})`);
    console.log(`[AI Token] Before: [Player] ${dumpB(GameState.playerBoard)} vs [AI] ${dumpB(GameState.enemyBoard)}`);

    return bestLanes;
}

export function getNormalTokenLanes(allLanes, owner, tokenCard, count, isLeaderSkill = false, canCancel = false, checkConstraints = true) {
    if (owner === 'red') {
        // 常に最新の盤面状況と判明したカード情報に基づき、アドホックにシミュレーションして決定する
        const results = evaluateAdhocTokenLanes(tokenCard, checkConstraints, canCancel);
        if (results === null) return []; // キャンセル判定
        if (results.length > 0) return results.slice(0, count);
    }

    // プレイヤー用または最終フォールバック
    const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };
    const sortedLanes = [...allLanes].sort((a, b) => lanePriorityOrder[a] - lanePriorityOrder[b]);
    const results = [];
    for (let l of sortedLanes) {
        if (checkConstraints) {
            if (GameState.turnCount === 1 && GameState.firstPlayer === 'red' && l !== 1) continue;
        }
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
                if (!hasSkill(playedCard, 'takeover') && !hasSkill(playedCard, 'equip') && !hasSkill(playedCard, 'apex') && simState.enemyBoard[laneIdx] !== null && !hasSkill(simState.enemyBoard[laneIdx], 'arm_self')) {
                    if (!(playedCard.skills && playedCard.skills.find(s => s.id === 'union') && (simState.enemyBoard[laneIdx].baseId === playedCard.skills.find(s => s.id === 'union').targetId || simState.enemyBoard[laneIdx].id === playedCard.skills.find(s => s.id === 'union').targetId))) {
                        return null;
                    }
                }
            }

            if (playedCard) {
                if ((hasSkill(playedCard, 'equip') || hasSkill(simState.enemyBoard[laneIdx], 'arm_self')) && simState.enemyBoard[laneIdx]) {
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

                    // 選択されたスキルでカードのスキルを上書きし、パッシブスキルの評価に反映させる
                    activeCard.skills = [...skills];
                    activeCard.skill = 'none';

                    if (!activeCard.skillTriggered) {
                        skills.forEach(sk => {
                            if (sk.id === 'call') {
                                // 【号令の仮評価（simulateMove版）】
                                // processActionSequence と同じロジック: callの値分のパワーを仮加算
                                const callBonus = sk.value || 3;
                                const boardCard = simState.enemyBoard[laneIdx];
                                if (boardCard) {
                                    boardCard.currentPower = (boardCard.currentPower || 0) + callBonus;
                                    boardCard.basePower = (boardCard.basePower || 0) + callBonus;
                                }
                            } else if (sk.id === 'metamorph') {
                                // 【変身の仮評価（simulateMove版）】
                                // processActionSequence と同じロジック: 固定パワーで仮評価
                                const boardCard = simState.enemyBoard[laneIdx];
                                if (boardCard) {
                                    boardCard.currentPower = METAMORPH_ESTIMATED_POWER;
                                    boardCard.basePower = METAMORPH_ESTIMATED_POWER;
                                }
                            } else {
                                applyActiveSkillLogic(simState, 'red', laneIdx, sk.id, sk.value, [], cLanesForPass);
                            }
                        });
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

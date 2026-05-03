import { GameState } from '../hooks/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { createDamagePopup, playSound, sleep, getCardImgUrl, shuffleArray, hasSkill, getSkillValue, getSeededRandom, mergeCardSkills, unmergeCardSkills, getOrCreateUUID, triggerGraveKeeperEffect } from '../utils/gameUtils.js';
import { SOUNDS, playSkillSound } from '../utils/sounds.js';
import { updateHPBar, updateSPOrbs, checkWinCondition, waitPlayerLaneSelection, waitPlayerEnemyLaneSelection, waitPlayerAlliedLaneSelection, waitPlayerHandSelection, waitPlayerDiscardSelection, waitPlayerDualDiscardSelection, waitSkillChoice, discardCard, updateDeckDisplay, cleanupDestroyedCards, drawCard, hasActiveSkill, resolveOnPlaySkill, executeSingleCombat, playCard, consumeAIAction, showSpeechBubble } from './battle.js';
import { applyActiveSkillLogic, applyPassiveSkillLogic } from './engine.js';
import { renderHand, renderBoard, updateCardPowerOnly, playSummonAnimation } from './uiBattle.js';
import { playEvents } from './eventRenderer.js';
import { PASSIVE_SKILLS, ACTIVE_SKILLS } from '../utils/constants/skills.js';
import { getIsHost } from './multiplayer.js';
import { playCardVoice } from '../utils/constants/voices.js';

/**
 * Mini Card Battle - Skill Implementation Logic
 * 分割されたスキル実行ロジック
 */

export async function resolveActiveSkillEffect(o, l, c, skillId, skillValue, skObj = null) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    const dS = o === 'blue' ? 'enemy' : 'player';

    // 演出用のポップアップと音（一括した基本演出）
    if (['support', 'hero', 'lone_wolf', 'morph', 'spread', 'snipe', 'berserk', 'heal', 'charge', 'sacrifice', 'quick', 'choice', 'artillery', 'standby', 'resurrect', 'summon', 'salvage', 'dispel', 'seal', 'crush', 'adversity', 'double_power', 'invite', 'decay', 'puppet', 'leap', 'chant'].includes(skillId)) {
        playSkillSound(skillId);
        const labels = { 'support': '援護', 'hero': '英雄', 'lone_wolf': '単騎', 'morph': '変化', 'spread': '拡散', 'snipe': '狙撃', 'berserk': '狂乱', 'heal': '回復', 'charge': '充填', 'sacrifice': '代償', 'quick': '速攻', 'choice': '選択', 'artillery': '砲撃', 'standby': '待機', 'resurrect': '復活', 'summon': '召喚', 'salvage': '回収', 'dispel': '解除', 'seal': '結界', 'crush': '粉砕', 'adversity': '逆境', 'double_power': '倍化', 'invite': '招来', 'decay': '減衰', 'puppet': '傀儡', 'leap': '跳躍', 'chant': '詠唱' };
        if (cEl) createDamagePopup(cEl, labels[skillId] || 'スキル', '#facc15');
        await sleep(200); // Popupを見せる間
    }

    // --- ロジックの実行 (Engineの呼び出し) ---
    const currentState = {
        playerBoard: GameState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
        enemyBoard: GameState.enemyBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
        playerHP: GameState.playerHP, enemyHP: GameState.enemyHP,
        playerSP: GameState.playerSP, enemySP: GameState.enemySP,
        playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
        enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
        playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
        enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard)),
        playerConfig: GameState.playerConfig,
        enemyConfig: GameState.enemyConfig
    };

    // 特殊な選択が必要なスキルは個別に扱う (draw, clone, quick, choice, metamorph等)
    if (skillId === 'invite' || skillId === 'chant') {
        let selectedIdx = -1;
        let selectedLane = -1;
        const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
        const b = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

        // 【詠唱】パワー制限値（招来は制限なし）
        const maxPower = skillId === 'chant' ? (skillValue ?? 3) : Infinity;
        // 【招来】同じレーンのみ、【詠唱】全レーン候補
        const isInvite = skillId === 'invite';

        // パワー制限チェック
        const meetsMaxPower = (card) => {
            if (maxPower === Infinity) return true;
            return (card.power || 0) <= maxPower;
        };

        if (o === 'red' && GameState.gameMode !== 'online' && GameState.gameMode !== 'pvp') {
            // 【AIの場合】actionQueueからアクションを消費
            let actionIdx = -1;
            if (GameState.aiDecision && GameState.aiDecision.actionQueue) {
                actionIdx = GameState.aiDecision.actionQueue.findIndex(a => a.type === skillId);
            }
            console.log(`[AI Chant/Invite] skillId=${skillId}, hasQueue=${!!GameState.aiDecision?.actionQueue}, queueLen=${GameState.aiDecision?.actionQueue?.length ?? 0}, foundAt=${actionIdx}`);
            if (actionIdx !== -1) {
                const action = GameState.aiDecision.actionQueue[actionIdx];
                selectedLane = isInvite ? l : (action.laneIdx ?? l);

                // uid優先で手札からカードを検索（インデックスズレを防止）
                if (action.targetUid) {
                    selectedIdx = h.findIndex(card => card && (card.uid === action.targetUid || card.id === action.targetUid));
                }
                // uidで見つからない場合はインデックスにフォールバック
                if (selectedIdx === -1 && action.targetIdx !== undefined && action.targetIdx < h.length) {
                    selectedIdx = action.targetIdx;
                }
                console.log(`[AI Chant/Invite] targetUid=${action.targetUid}, targetIdx=${action.targetIdx}, resolved=${selectedIdx}, lane=${selectedLane}, hand=[${h.map((c,i) => `${i}:${c?.name}(uid:${c?.uid})`).join(', ')}]`);

                // 実行時のパワー制限チェック（シミュレーション時と手札が変わっている可能性がある）
                if (selectedIdx >= 0 && selectedIdx < h.length && !meetsMaxPower(h[selectedIdx])) {
                    console.log(`[AI Chant/Invite] Power check failed: ${h[selectedIdx].name}(P:${h[selectedIdx].power}) > maxPower(${maxPower}). Skipping.`);
                    selectedIdx = -1;
                }

                GameState.aiDecision.actionQueue.splice(actionIdx, 1);
                GameState.aiDecision.cardTokenLanes = action.cardTokenLanes ? [...action.cardTokenLanes] : undefined;

                if (action.choices !== undefined || action.choices2 !== undefined) {
                    if (!GameState.aiDecision.choiceIndexQueue) GameState.aiDecision.choiceIndexQueue = [];
                    if (action.choices !== undefined) GameState.aiDecision.choiceIndexQueue.push(action.choices);
                    if (action.choices2 !== undefined) GameState.aiDecision.choiceIndexQueue.push(action.choices2);
                }
            } else {
                selectedIdx = -1;
                console.log(`[AI Chant/Invite] No action found. queue=`, JSON.stringify(GameState.aiDecision?.actionQueue));
            }
        } else {
            // 【プレイヤーの場合】
            // 1) パワー制限を満たすカードが手札にあるか確認
            const hasPlayableCard = h.some(card => meetsMaxPower(card));
            if (hasPlayableCard) {
                let success = false;
                while (!success) {
                    // 手札からカードを選択
                    const promptMsg = skillId === 'chant'
                        ? `パワー${maxPower}以下のカードを1枚まで選んでください`
                        : '召喚するカードを1枚まで選んでください';
                    let arr = await waitPlayerHandSelection(1, o, false, promptMsg);
                    if (!arr || arr.length === 0) {
                        break; // キャンセル
                    }
                    const sIdx = arr[0];
                    const pickedCard = h[sIdx];

                    // パワー制限チェック
                    if (!meetsMaxPower(pickedCard)) {
                        if (typeof window.showAlertModal === 'function') {
                            window.showAlertModal(`パワー${maxPower}以下のカードのみ召喚できます。`);
                        }
                        await sleep(500);
                        continue;
                    }

                    // 2) レーン選択（ハイライト表示付き）
                    //    招来: 同じレーンのみ候補 / 詠唱: 全レーン候補
                    const restrictLanes = isInvite ? [l] : null;
                    const lanes = await waitPlayerLaneSelection(
                        1, o, pickedCard,
                        false,           // isLeaderSkill
                        restrictLanes,   // tokenLanes（招来: 同じレーンのみ）
                        true,            // checkConstraints（制約チェック有効）
                        true,            // canCancel（キャンセル可能）
                        'キャンセル'
                    );

                    if (lanes && lanes.length > 0) {
                        selectedIdx = sIdx;
                        selectedLane = lanes[0];
                        success = true;
                    } else {
                        // レーン選択キャンセル → 手札選択からやり直し
                        continue;
                    }
                }
            }
        }

        if (selectedIdx !== -1 && selectedLane !== -1) {
            // 虚空トークンを手札に追加（playCardの前に追加し、召喚時スキル発動前に手札にある状態にする）
            const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
            const voidToken = {
                ...voidTpl,
                id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_${skillId}`,
                uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_void${skillId}`,
                filter: voidTpl.filter,
                power: voidTpl.power,
                currentPower: voidTpl.power,
                basePower: voidTpl.power,
                skill: voidTpl.skill || 'none',
                voiceCategory: voidTpl.voiceCategory || 'stone',
                isToken: true,
                isMorphToken: true
            };
            const currentHand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
            currentHand.push(voidToken);
            renderHand();
            await sleep(300);

            await playCard(o, selectedIdx, selectedLane);
        }
        return;
    }

    // 【跳躍】追加ターンを1回付与（SPなし・攻撃なし）
    if (skillId === 'leap') {
        GameState.extraTurnCount = (GameState.extraTurnCount || 0) + 1;
        GameState.attackSkipCount = (GameState.attackSkipCount || 0) + 1;
        return;
    }

    if (skillId === 'metamorph') {
        // 全マスタカード（トークン含む）からランダムに1枚選択
        const randomMaster = CARD_MASTER[Math.floor(getSeededRandom() * CARD_MASTER.length)];

        // 演出
        playSkillSound(skillId);
        if (cEl) {
            createDamagePopup(cEl, '変相', '#facc15');
            cEl.classList.add('anim-shake');
            await sleep(300);
        }

        // 元のIDを保持（破壊時に戻る用）
        if (!c.originalCardId) c.originalCardId = 'baldanders';

        // 性能の上書き
        c.name = randomMaster.name;
        c.power = randomMaster.power;
        c.currentPower = randomMaster.power;
        c.basePower = randomMaster.power;
        c.skill = randomMaster.skill || 'none';
        c.skillValue = randomMaster.skillValue || 0;
        c.skills = randomMaster.skills ? JSON.parse(JSON.stringify(randomMaster.skills)) : [];
        c.choices = randomMaster.choices ? JSON.parse(JSON.stringify(randomMaster.choices)) : [];
        c.choices2 = randomMaster.choices2 ? JSON.parse(JSON.stringify(randomMaster.choices2)) : null;
        c.rarity = randomMaster.rarity;

        // イラストの決定（トークン等の特殊なマッピングを考慮）
        let imgUrl = randomMaster.imgUrl;
        if (!imgUrl) {
            if (randomMaster.id === 'token_knight') imgUrl = 'assets/cards/card_token_knight.jpg';
            else if (randomMaster.id === 'token_ignis') {
                // オーナーがイグニス（dragon）をリーダーとして使用している場合のみスキン画像を参照する
                // イグニス以外のリーダー使用時はスキン情報が存在しないため、デフォルト画像にフォールバック
                const isPlayingAsDragon = o === 'blue'
                    ? GameState.playerConfig?.id === 'dragon'
                    : GameState.enemyConfig?.id === 'dragon';
                if (isPlayingAsDragon) {
                    const dragonConfig = CHARACTERS['dragon'];
                    const skinId = o === 'blue'
                        ? (GameState.playerSkins?.['dragon'] || 'default')
                        : (GameState.enemySkins?.['dragon'] || 'default');
                    imgUrl = getSkinImage(dragonConfig, skinId, 'image') || 'assets/characters/char_dragon.png';
                } else {
                    imgUrl = 'assets/characters/char_dragon.png';
                }
            }
            else if (randomMaster.id === 'token_satan') imgUrl = 'assets/characters/char_satan.png';
            else imgUrl = `assets/cards/card_${randomMaster.id}.jpg`;
        }
        c.imgUrl = imgUrl;

        c.flavor = randomMaster.flavor;
        c.voiceCategory = randomMaster.voiceCategory;

        // 見た目の更新
        renderBoard();
        await sleep(500);

        // 変身後のカードが召喚時スキルを持っていれば発動
        if (hasActiveSkill(c)) {
            await resolveOnPlaySkill(o, l, c);
        }
        await cleanupDestroyedCards(c);
        return;
    }

    if (skillId === 'choice' || skillId === 'force') {
        const baseChoices = (skObj && skObj._sourceChoices) ? skObj._sourceChoices : c.choices;
        const baseChoices2 = (skObj && skObj._sourceChoices2) ? skObj._sourceChoices2 : c.choices2;
        const choices = (skObj && skObj.choiceGroup === 2) ? baseChoices2 : baseChoices;
        
        let choiceArray;
        if (skillId === 'force') {
            const oppOwner = o === 'blue' ? 'red' : 'blue';
            choiceArray = await waitSkillChoice(choices, oppOwner, c, skillValue, true);
        } else {
            choiceArray = await waitSkillChoice(choices, o, c, skillValue, false);
        }
        if (choiceArray) {
            const arr = Array.isArray(choiceArray) ? choiceArray : [choiceArray];
            for (const choice of arr) {
                // もしパッシブスキル（機能が場に留まるスキル）を選んだ場合はカード自身に永続付与する
                if (PASSIVE_SKILLS.includes(choice.id)) {
                    if (!Array.isArray(c.skills)) c.skills = [];
                    c.skills.push({ id: choice.id, value: choice.value });
                    renderBoard(); // UI反映
                }
                // 選択されたスキルを順に実行
                await resolveActiveSkillEffect(o, l, c, choice.id, choice.value, choice);
            }
        }
        return;
    }

    if (skillId === 'draw') {
        const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
        const count = skillValue || 1;
        playSkillSound(skillId); createDamagePopup(cEl, '入替', '#facc15');
        const selectedIndices = await waitPlayerHandSelection(count, o);
        if (selectedIndices.length > 0) {
            selectedIndices.sort((a, b) => b - a);
            for (let i of selectedIndices) {
                const discarded = h.splice(i, 1)[0];
                await discardCard(o, discarded);
            }
            for (let i = 0; i < selectedIndices.length; i++) drawCard(o);
        } else if (h.length === 0) {
            drawCard(o);
        }
        await sleep(500);
    } else if (skillId === 'shuffle') {
        playSkillSound(skillId); createDamagePopup(cEl, '攪乱', '#facc15');

        // オンライン対戦時、乱数シードの消費順序をホスト・ゲスト間で一致させるため、ホスト側の盤面から処理する順序に固定
        let processOrder = ['blue', 'red'];
        if (GameState.gameMode === 'online') {
            processOrder = getIsHost() ? ['blue', 'red'] : ['red', 'blue'];
        }

        // オンライン対戦時、乱数シードの消費順序や効果の発動順序をホスト・ゲスト間で完全に一致させるため、ホストから順に処理
        for (const p of processOrder) {
            const h = p === 'blue' ? GameState.playerHand : GameState.enemyHand;
            const hCards = [...h]; // 手札のコピーを保持
            h.length = 0; // 手札の配列を先に空にする

            // 順番に1枚ずつ正規に捨てる（バフ・変相のリセットとトークンの自動消滅処理を適用するため）
            for (let i = 0; i < hCards.length; i++) {
                await discardCard(p, hCards[i], undefined, false);
            }
        }

        processOrder.forEach(p => {
            const g = p === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
            const d = p === 'blue' ? GameState.playerDeck : GameState.enemyDeck;

            // 墓地に送られた（リセット済みの）カードをデッキに全て戻す
            while (g.length > 0) {
                d.push(g.pop());
            }
        });

        // 捨てた状態で一度待機する
        updateDeckDisplay('blue');
        updateDeckDisplay('red');
        renderHand();
        await sleep(1200);

        processOrder.forEach(p => {
            const h = p === 'blue' ? GameState.playerHand : GameState.enemyHand;
            const d = p === 'blue' ? GameState.playerDeck : GameState.enemyDeck;

            // デッキを再シャッフル
            shuffleArray(d);

            // 互いに3枚引く
            for (let i = 0; i < 3; i++) {
                if (d.length > 0) {
                    const card = d.shift();
                    // 新しいUIDを割り当てる（同じカードが手元に戻ってきた時のKey重複エラーを防ぐため）
                    card.uid = `${p}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
                    h.push(card);
                }
            }
        });

        updateDeckDisplay('blue');
        updateDeckDisplay('red');
        renderHand();
        await sleep(600);
    } else if (skillId === 'summon') {
        // 【重要仕様】「召喚 X」において X (pValue) はトークンのパワーを指す。
        // 個数は常に 1体 であるため、レーン選択数には 1 を指定する。
        const pValue = skillValue || 1;

        // 特定のスキルオブジェクト(skObj)があればそのsummonIdを優先、なければカード定義から、それもなければデフォルト
        let tId = skObj?.summonId || c.summonId || 'token_drone';
        let tName = 'ドローン';

        if (tId === 'token_drone' || !tId) {
            const cId = c.baseId || c.id;
            if (cId === 'admiral') {
                tId = 'token_knight';
                tName = '騎士';
            } else if (pValue >= 5) {
                tName = 'ゴーレム';
                tId = 'token_golem';
            }
        }

        const baseTC = CARD_MASTER.find(m => m.id === tId);
        if (baseTC) tName = baseTC.name;

        const tC = baseTC || {
            id: tId, name: tName, power: pValue, skill: 'none', isToken: true, rarity: 1, voiceCategory: pValue >= 5 ? 'monster' : 'machine_new'
        };

        const simulatedToken = {
            ...tC,
            power: pValue,
            currentPower: pValue,
            basePower: pValue,
            skills: []
        };
        // AIの場合：actionQueueのtoken_placementからsummon用のレーン指定を取り出す（cloneと同パターン）
        let summonPredefinedLanes = null;
        let aiSummonCancelled = false;
        if (o === 'red' && GameState.gameMode !== 'online' && GameState.gameMode !== 'pvp') {
            if (GameState.aiDecision && GameState.aiDecision.actionQueue) {
                const tpIdx = GameState.aiDecision.actionQueue.findIndex(a => a.type === 'token_placement' && a.skillId === 'summon');
                if (tpIdx !== -1) {
                    const tpAction = GameState.aiDecision.actionQueue.splice(tpIdx, 1)[0];
                    if (Array.isArray(tpAction.lanes) && tpAction.lanes.length > 0) {
                        summonPredefinedLanes = [...tpAction.lanes];
                    }
                } else {
                    // actionQueueにsummonがない場合 → キャンセル扱い
                    aiSummonCancelled = true;
                }
            }
        }

        if (!aiSummonCancelled) {
            // 個数(count)には 1 を指定（召喚はパワー指定スキルのため）
            const selectedLanes = await waitPlayerLaneSelection(1, o, simulatedToken, false, summonPredefinedLanes, false, true);
            if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける

            let events = [];
            for (let i = 0; i < selectedLanes.length; i++) {
                const targetLane = selectedLanes[i];
                const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                const newToken = {
                    id: `sm_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                    baseId: tId,
                    owner: o,
                    ...tC,
                    isToken: true,
                    name: tName,
                    isPremium: (c.isPremium !== undefined) ? c.isPremium : GameState.premiumCards.includes(c.baseId || c.id),
                    imgUrl: typeof getCardImgUrl === 'function' && tC.imgUrl === undefined ? getCardImgUrl(tC) : (tC.imgUrl || `assets/cards/card_${tId}.jpg`),
                    filter: c.filter,
                    power: pValue,
                    currentPower: pValue,
                    rarity: 1,
                    basePower: pValue,
                    voiceCategory: tC.voiceCategory || (pValue >= 5 ? 'monster' : 'machine_new'),
                    skills: []
                };
                const existingCard = board[targetLane];
                if (existingCard && (hasSkill(newToken, 'equip') || hasSkill(existingCard, 'arm_self')) && !hasSkill(existingCard, 'possession') && !hasSkill(newToken, 'possession') && !hasSkill(existingCard, 'reflect') && !hasSkill(newToken, 'reflect')) {
                    existingCard.power = (existingCard.power || 0) + (newToken.power || 0);
                    existingCard.basePower = (existingCard.basePower || 0) + (newToken.power || 0);
                    
                    const equipSkills = [];
                    if (newToken.skill && newToken.skill !== 'none' && newToken.skill !== 'equip') equipSkills.push({ id: newToken.skill, value: newToken.skillValue });
                    if (newToken.skills) newToken.skills.forEach(s => { if (s.id !== 'equip') equipSkills.push(s); });
                    mergeCardSkills(existingCard, equipSkills);
                    
                    existingCard.equippedCards = existingCard.equippedCards || [];
                    existingCard.equippedCards.push(newToken);
                    events.push({ type: 'power_change', side: o, lane: targetLane, amount: newToken.power, source: 'equip' });
                } else {
                    if (board[targetLane]) {
                        if (!(await discardCard(o, board[targetLane], targetLane, false))) board[targetLane] = null;
                    }
                    board[targetLane] = newToken;
                    events.push({ type: 'summon_token', side: o, lane: targetLane, card: newToken, source: 'summon' });
                }
            }
            await playEvents(events);
            // 配置演出が完了したので保護フラグを解除
            for (const ev of events) {
                if (ev.card) ev.card.isSkillResolving = false;
            }
            await cleanupDestroyedCards(c);
        }

    } else if (skillId === 'clone') {
        // UI選択部分はbattle/Rendererでは隠蔽しきれないためここに残す
        const count = skillValue || 1;
        const tC = CARD_MASTER.find(m => m.id === 'token_clone');

        // スキルの引き継ぎ（分身以外）
        let inheritedSkills = [];
        if (c.skill && c.skill !== 'clone') {
            const inherited = { id: c.skill, value: c.skillValue };
            if (c.summonId) inherited.summonId = c.summonId;
            if (c.targetId) inherited.targetId = c.targetId;
            inheritedSkills.push(inherited);
        }
        if (Array.isArray(c.skills)) {
            inheritedSkills = inheritedSkills.concat(c.skills.filter(sk => sk.id !== 'clone'));
        }

        const simulatedToken = {
            ...tC,
            power: c.power,
            currentPower: c.currentPower,
            skills: inheritedSkills
        };
        // AIの場合：actionQueueのtoken_placementからclone用のレーン指定を取り出す
        let clonePredefinedLanes = null;
        if (o === 'red' && GameState.aiDecision && GameState.aiDecision.actionQueue) {
            const tpIdx = GameState.aiDecision.actionQueue.findIndex(a => a.type === 'token_placement' && a.skillId === 'clone');
            if (tpIdx !== -1) {
                const tpAction = GameState.aiDecision.actionQueue.splice(tpIdx, 1)[0];
                if (Array.isArray(tpAction.lanes) && tpAction.lanes.length > 0) {
                    clonePredefinedLanes = [...tpAction.lanes];
                }
            }
        }
        const selectedLanes = await waitPlayerLaneSelection(count, o, simulatedToken, false, clonePredefinedLanes, false, true);
        if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける

        let events = [];
        for (let i = 0; i < selectedLanes.length; i++) {
            const targetLane = selectedLanes[i];
            const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
            const newToken = {
                id: `cl_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                owner: o,
                baseId: c.baseId || c.id,
                ...tC,
                isToken: true,
                name: '分身',
                isPremium: (c.isPremium !== undefined) ? c.isPremium : GameState.premiumCards.includes(c.baseId || c.id),
                imgUrl: getCardImgUrl(c), // 本体の画像URLを確定させて焼き付ける
                filter: c.filter,
                power: c.power || 0,
                currentPower: c.currentPower !== undefined ? c.currentPower : (c.power || 0),
                rarity: c.rarity || 1,
                basePower: c.basePower !== undefined ? c.basePower : (c.power || 0),
                voiceCategory: c.voiceCategory,
                skills: JSON.parse(JSON.stringify(inheritedSkills)) // スキルを引き継ぐ
            };
            const existingCard = board[targetLane];
            if (existingCard && (hasSkill(newToken, 'equip') || hasSkill(existingCard, 'arm_self')) && !hasSkill(existingCard, 'possession') && !hasSkill(newToken, 'possession') && !hasSkill(existingCard, 'reflect') && !hasSkill(newToken, 'reflect')) {
                existingCard.power = (existingCard.power || 0) + (newToken.power || 0);
                existingCard.basePower = (existingCard.basePower || 0) + (newToken.power || 0);
                
                const equipSkills = [];
                if (newToken.skill && newToken.skill !== 'none' && newToken.skill !== 'equip') equipSkills.push({ id: newToken.skill, value: newToken.skillValue });
                if (newToken.skills) newToken.skills.forEach(s => { if (s.id !== 'equip') equipSkills.push(s); });
                mergeCardSkills(existingCard, equipSkills);
                
                existingCard.equippedCards = existingCard.equippedCards || [];
                existingCard.equippedCards.push(newToken);
                events.push({ type: 'power_change', side: o, lane: targetLane, amount: newToken.power, source: 'equip' });
            } else {
                if (board[targetLane]) {
                    if (!(await discardCard(o, board[targetLane], targetLane, false))) board[targetLane] = null;
                }
                board[targetLane] = newToken;
                events.push({ type: 'summon_token', side: o, lane: targetLane, card: newToken, source: 'clone' });
            }
        }
        await playEvents(events);
        // 配置演出が完了したので保護フラグを解除
        for (const ev of events) {
            if (ev.card) ev.card.isSkillResolving = false;
        }
        await cleanupDestroyedCards(c);

    } else if (skillId === 'fate') {
        const roll = Math.floor(getSeededRandom() * 6) + 1;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '運命', '#facc15');
        await sleep(500);

        if (roll <= 5) {
            let dmg = roll;
            if (o === 'blue') {
                GameState.enemyHP -= dmg;
                createDamagePopup(document.getElementById('enemy-hp-fill'), `-${dmg}`, '#ef4444');
                const eh = document.getElementById('playmat-enemy');
                if (eh) eh.classList.add('anim-shake');
                showSpeechBubble('red');
                await triggerExtortInAction(c, o);
            } else {
                GameState.playerHP -= dmg;
                createDamagePopup(document.getElementById('player-hp-fill'), `-${dmg}`, '#ef4444');
                document.body.classList.add('anim-shake');
                setTimeout(() => document.body.classList.remove('anim-shake'), 400);
                showSpeechBubble('blue');
                await triggerExtortInAction(c, o);
            }
        } else {
            let dmg = 6;
            if (o === 'blue') {
                GameState.playerHP -= dmg;
                createDamagePopup(document.getElementById('player-hp-fill'), `-${dmg}`, '#ef4444');
                document.body.classList.add('anim-shake');
                setTimeout(() => document.body.classList.remove('anim-shake'), 400);
                showSpeechBubble('blue');
            } else {
                GameState.enemyHP -= dmg;
                createDamagePopup(document.getElementById('enemy-hp-fill'), `-${dmg}`, '#ef4444');
                const eh = document.getElementById('playmat-enemy');
                if (eh) eh.classList.add('anim-shake');
                showSpeechBubble('red');
            }
        }
        updateHPBar();
        checkWinCondition();
        await sleep(400);

    } else if (skillId === 'quick') {
        await sleep(400); await executeSingleCombat(o, l);
    } else if (skillId === 'toxic') {
        playSound(SOUNDS.seSkillToxic); createDamagePopup(cEl, '有毒', '#10b981');
        const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
        if (eB[l]) {
            const toxVal = skillValue || 1;
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

            const tgtSide = o === 'blue' ? 'enemy' : 'player';
            const tEl = document.querySelector(`#${tgtSide}-lanes .cell[data-lane="${l}"] .card`);
            if (tEl) {
                tEl.classList.add('anim-shake');
                createDamagePopup(tEl, `成長-${toxVal}`, '#10b981');
                if (window.updateCardVisualsReact) window.updateCardVisualsReact(l, tgtSide);
                else {
                    const ubHook = window.updateBattleUIHook;
                    if (ubHook) ubHook();
                }
            }
            await sleep(500);
            if (tEl) tEl.classList.remove('anim-shake');
        } else {
            await sleep(500);
        }
    } else if (skillId === 'dispel') {
        playSound(SOUNDS.seSkillBind); // Wait, dispel sound doesn't exist, we use generic or bind sound. 
        const tgtSide = o === 'blue' ? 'red' : 'blue';
        const eB = tgtSide === 'red' ? GameState.enemyBoard : GameState.playerBoard;
        const eD = tgtSide === 'red' ? GameState.enemyDiscard : GameState.playerDiscard;
        const tCount = skillValue || 1;

        let tLanes = await waitPlayerEnemyLaneSelection(tCount, o, true, `相手のカードを${tCount}枚選んでください`);
        if (tLanes && tLanes.length > 0) {
            for (let targetLane of tLanes) {
                const targetCard = eB[targetLane];
                if (!targetCard) continue;

                const hasEquipSkill = hasSkill(targetCard, 'equip');
                const hasEquippedItems = targetCard.equippedCards && targetCard.equippedCards.length > 0;

                if (hasEquipSkill || hasEquippedItems) {
                    let totalPowerLoss = 0;

                    if (hasEquippedItems) {
                        // 装備カードを全て破壊（墓地に送る）
                        for (const eqCard of targetCard.equippedCards) {
                            totalPowerLoss += eqCard.power;

                            const equipSkills = [];
                            if (eqCard.skill && eqCard.skill !== 'none' && eqCard.skill !== 'equip') {
                                equipSkills.push({ id: eqCard.skill, value: eqCard.skillValue });
                            }
                            if (eqCard.skills) {
                                eqCard.skills.forEach(s => {
                                    if (s.id !== 'equip') equipSkills.push(s);
                                });
                            }
                            unmergeCardSkills(targetCard, equipSkills);

                            eD.push(eqCard); // 相手の墓地へ
                        }
                    }

                    // アニメーションと表示更新
                    const tgtEl = document.querySelector(`#${tgtSide === 'red' ? 'enemy' : 'player'}-lanes .cell[data-lane="${targetLane}"] .card`);
                    if (tgtEl) {
                        tgtEl.classList.add('anim-shake');
                        createDamagePopup(tgtEl, hasEquipSkill ? '破壊' : `-${totalPowerLoss} 解除`, '#ef4444');
                    }

                    if (hasEquippedItems) {
                        targetCard.power -= totalPowerLoss;
                        targetCard.currentPower -= totalPowerLoss;
                        targetCard.basePower -= totalPowerLoss;
                        targetCard.equippedCards = [];
                    }

                    if (hasEquipSkill) {
                        targetCard.currentPower = 0; // 装備スキルを持つカード本体を即死させる
                    }

                    if (targetCard.currentPower <= 0) {
                        // パワーが0以下になった場合や即死処理が入った場合は破壊
                        if (tgtEl) {
                            tgtEl.classList.add('anim-shake');
                            tgtEl.classList.add('anim-card-destroy');
                        }
                        if (targetCard.voiceCategory) {
                            playCardVoice(targetCard.voiceCategory, 'death');
                        }
                        playSound(SOUNDS.seDestroy);
                        await sleep(400); // 破壊演出待ち
                        if (!(await discardCard(tgtSide, targetCard, targetLane, true))) eB[targetLane] = null;
                    }
                } else {
                    const tgtEl = document.querySelector(`#${tgtSide === 'red' ? 'enemy' : 'player'}-lanes .cell[data-lane="${targetLane}"] .card`);
                    if (tgtEl) {
                        createDamagePopup(tgtEl, 'NO TARGET', '#94a3b8');
                    }
                }
            }
            renderBoard();
        }
        await sleep(500);
        if (tLanes && tLanes.length > 0) {
            for (let targetLane of tLanes) {
                const tgtEl = document.querySelector(`#${tgtSide === 'red' ? 'enemy' : 'player'}-lanes .cell[data-lane="${targetLane}"] .card`);
                if (tgtEl) tgtEl.classList.remove('anim-shake');
            }
        }
    } else if (skillId === 'crush') {
        const tgtSide = o === 'blue' ? 'red' : 'blue';
        const eB = tgtSide === 'red' ? GameState.enemyBoard : GameState.playerBoard;
        const eD = tgtSide === 'red' ? GameState.enemyDiscard : GameState.playerDiscard;
        const tCount = skillValue || 1;

        let tLanes = await waitPlayerEnemyLaneSelection(tCount, o, true, `相手のカードを${tCount}枚選んでください`);
        if (tLanes && tLanes.length > 0) {
            for (let targetLane of tLanes) {
                const targetCard = eB[targetLane];
                if (!targetCard) continue;

                // 防御を持っているかチェック
                const hasDefender = hasSkill(targetCard, 'defender') || targetCard.stunTurns > 0;
                const tgtEl = document.querySelector(`#${tgtSide === 'red' ? 'enemy' : 'player'}-lanes .cell[data-lane="${targetLane}"] .card`);

                if (hasDefender) {
                    if (tgtEl) {
                        tgtEl.classList.add('anim-shake');
                        tgtEl.classList.add('anim-card-destroy');
                        createDamagePopup(tgtEl, '破壊', '#ef4444');
                    }
                    if (targetCard.voiceCategory) {
                        playCardVoice(targetCard.voiceCategory, 'death');
                    }
                    playSound(SOUNDS.seDestroy);
                    
                    await sleep(400); // 破壊演出待ち
                    if (!(await discardCard(tgtSide, targetCard, targetLane, true))) eB[targetLane] = null;
                } else {
                    if (tgtEl) {
                        createDamagePopup(tgtEl, 'NO TARGET', '#94a3b8');
                    }
                }
            }
            renderBoard();
        }
        await sleep(500);
        if (tLanes && tLanes.length > 0) {
            for (let targetLane of tLanes) {
                const tgtEl = document.querySelector(`#${tgtSide === 'red' ? 'enemy' : 'player'}-lanes .cell[data-lane="${targetLane}"] .card`);
                if (tgtEl) tgtEl.classList.remove('anim-shake');
            }
        }
    } else if (skillId === 'adversity') {
        const opB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
        const occ = opB.filter(x => x !== null).length;
        const advVal = occ * (skillValue || 1);
        if (advVal !== 0) {
            c.power = (c.power || 0) + advVal;
            c.basePower = (c.basePower || 0) + advVal;
            c.currentPower = (c.currentPower || 0) + advVal;
            if (cEl) {
                createDamagePopup(cEl, `+${advVal}`, '#10b981');
                if (window.updateCardVisualsReact) window.updateCardVisualsReact(l, o);
                else if (window.updateBattleUIHook) window.updateBattleUIHook();
            }
            renderBoard();
            await sleep(400);
        }
    } else if (skillId === 'bind') {
        playSound(SOUNDS.seSkillBind); createDamagePopup(cEl, '拘束', '#facc15');
        const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
        if (eB[l]) {
            // 【仕様通り】+1 はターン終了時の stunTurns-- を見越した補正。
            // val=1 で「このターンは動けない」→ターン終了時に1減って stunTurns=1 → 次ターン防御 → 終了時に0、で計1ターン拘束。
            const turns = (skillValue || 1) + 1;
            eB[l].stunTurns = turns;
            const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${l}"] .card`);
            if (tEl) {
                tEl.classList.add('anim-shake');
                createDamagePopup(tEl, '拘束', '#94a3b8');
            }
            await sleep(500);
            if (tEl) tEl.classList.remove('anim-shake');
        } else {
            await sleep(500);
        }
    } else if (skillId === 'seal') {
        const targetSide = o === 'blue' ? 'enemy' : 'player';
        const targetSealedLanes = o === 'blue' ? GameState.enemySealedLanes : GameState.playerSealedLanes;

        if (targetSealedLanes) {
            const turns = skillValue || 1;
            targetSealedLanes[l] = turns;

            const tEl = document.querySelector(`#${targetSide}-lanes .cell[data-lane="${l}"]`);
            if (tEl) {
                tEl.classList.add('anim-shake');
                createDamagePopup(tEl, '封印', '#94a3b8');
            }
            if (window.updateBattleUIHook) window.updateBattleUIHook();
            await sleep(500);
            if (tEl) tEl.classList.remove('anim-shake');
        } else {
            await sleep(500);
        }
    } else if (skillId === 'freeze') {
        playSound(SOUNDS.seSkillFreeze); createDamagePopup(cEl, '凍結', '#93c5fd');
        const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
        let targets = [];
        for (let idx of [l - 1, l, l + 1]) {
            if (idx >= 0 && idx <= 2 && eB[idx]) targets.push(idx);
        }

        if (targets.length > 0) {
            // 【仕様通り】+1 はターン終了時の stunTurns-- を見越した補正（bindと同じロジック）。
            const turns = (skillValue || 1) + 1;
            for (const tL of targets) {
                eB[tL].stunTurns = turns;
                const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${tL}"] .card`);
                if (tEl) {
                    tEl.classList.remove('anim-shake');
                    void tEl.offsetWidth; // Force reflow to ensure animation restarts
                    tEl.classList.add('anim-shake');
                    createDamagePopup(tEl, '凍結', '#94a3b8');
                }
            }
            if (window.updateBattleUIHook) window.updateBattleUIHook(); // 反映させる
            await sleep(500);
            for (const tL of targets) {
                const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${tL}"] .card`);
                if (tEl) tEl.classList.remove('anim-shake');
            }
        } else {
            await sleep(500);
        }
    } else if (skillId === 'artillery') {
        let dmg = skillValue || 1;
        await sleep(300);
        if (o === 'blue') {
            GameState.enemyHP -= dmg;
            createDamagePopup(document.getElementById('enemy-hp-fill'), `-${dmg}`, '#ef4444');
            const eh = document.getElementById('playmat-enemy');
            if (eh) eh.classList.add('anim-shake');
            showSpeechBubble('red');
        } else {
            GameState.playerHP -= dmg;
            createDamagePopup(document.getElementById('player-hp-fill'), `-${dmg}`, '#ef4444');
            document.body.classList.add('anim-shake');
            setTimeout(() => document.body.classList.remove('anim-shake'), 400);
            showSpeechBubble('blue');
        }
        playSound(SOUNDS.seDamage);
        await triggerExtortInAction(c, o);
        updateHPBar();
        checkWinCondition();
        await sleep(400);
    } else if (skillId === 'loss') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '喪失', '#991b1b');
        const d = o === 'blue' ? GameState.playerDeck : GameState.enemyDeck;
        const g = o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
        const count = skillValue || 1;
        let lostCount = 0;
        for (let i = 0; i < count; i++) {
            if (d.length > 0) {
                g.push(d.pop()); // 上から墓地へ送るためpop
                lostCount++;
            }
        }
        if (lostCount > 0) {
            updateDeckDisplay(o);
        }
        await sleep(500);
    } else if (skillId === 'burial') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '埋葬', '#8b5cf6');
        const d = o === 'blue' ? GameState.enemyDeck : GameState.playerDeck;
        const g = o === 'blue' ? GameState.enemyDiscard : GameState.playerDiscard;
        const targetSide = o === 'blue' ? 'red' : 'blue';
        const count = skillValue || 1;
        let lostCount = 0;
        for (let i = 0; i < count; i++) {
            if (d.length > 0) {
                g.push(d.pop()); // 上から墓地へ送るためpop
                lostCount++;
            }
        }
        if (lostCount > 0) {
            updateDeckDisplay(targetSide);
        }
        await sleep(500);
    } else if (skillId === 'recurse') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '再帰', '#10b981');
        if (await triggerGraveKeeperEffect()) return;
        const maxChoices = skillValue || 1;
        const selectedCards = await waitPlayerDualDiscardSelection(
            GameState.playerDiscard,
            GameState.enemyDiscard,
            maxChoices,
            o,
            'デッキに戻すカードを選択',
            `お互いの墓地から合計${maxChoices}枚まで選びます。`
        );
        
        if (selectedCards && selectedCards.length > 0) {
            let blueCount = 0;
            let redCount = 0;
            selectedCards.forEach(card => {
                const isBlue = card.fromTab === 'blue';
                const sourceDiscard = isBlue ? GameState.playerDiscard : GameState.enemyDiscard;
                const targetDeck = isBlue ? GameState.playerDeck : GameState.enemyDeck;
                
                const idx = sourceDiscard.findIndex(c => (c.uid && c.uid === card.uid) || (!c.uid && c.id === card.id));
                if (idx >= 0) {
                    const removed = sourceDiscard.splice(idx, 1)[0];
                    targetDeck.push(removed);
                    if (isBlue) blueCount++;
                    else redCount++;
                }
            });
            
            if (blueCount > 0) {
                shuffleArray(GameState.playerDeck);
                updateDeckDisplay('blue');
            }
            if (redCount > 0) {
                shuffleArray(GameState.enemyDeck);
                updateDeckDisplay('red');
            }
            await sleep(500);
        }
    } else if (skillId === 'bless') {
        const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
        let targetIndices = await waitPlayerHandSelection(1, o, false, '手札のカードを1枚選んでください');
        if (targetIndices && targetIndices.length > 0) {
            const idx = targetIndices[0];
            const card = hand[idx];
            card.power = (card.power || 0) + (skillValue || 1);
            card.basePower = (card.basePower || 0) + (skillValue || 1);
            card.currentPower = (card.currentPower || 0) + (skillValue || 1);
            playSound(SOUNDS.seSkill);
            renderHand();
            await sleep(300);
        }
    } else if (skillId === 'wall_create') {
        const wallPower = skillValue || 10;
        const wTC = CARD_MASTER.find(m => m.id === 'token_wall') || { name: 'トークン', power: 1 };
        const sTC = {
            ...wTC,
            id: `WC_${Math.floor(getSeededRandom() * 1000000000)}`,
            uid: `${o}_WC_${Math.floor(getSeededRandom() * 1000000000)}`,
            isToken: true,
            rarity: 1,
            power: wallPower,
            basePower: wallPower,
            currentPower: wallPower,
            baseId: 'token_wall',
            skills: []
        };
        // AI の場合：actionQueue の token_placement(wall_create) からレーン指定を取り出す（clone と同パターン）
        let wallPredefinedLanes = null;
        let aiWallCancelled = false;
        if (o === 'red' && GameState.gameMode !== 'online' && GameState.gameMode !== 'pvp') {
            if (GameState.aiDecision && GameState.aiDecision.actionQueue) {
                const tpIdx = GameState.aiDecision.actionQueue.findIndex(a => a.type === 'token_placement' && a.skillId === 'wall_create');
                if (tpIdx !== -1) {
                    const tpAction = GameState.aiDecision.actionQueue.splice(tpIdx, 1)[0];
                    if (Array.isArray(tpAction.lanes) && tpAction.lanes.length > 0) {
                        wallPredefinedLanes = [...tpAction.lanes];
                    }
                } else {
                    // actionQueueにwall_createがない場合 → キャンセル扱い
                    aiWallCancelled = true;
                }
            }
        }
        if (!aiWallCancelled) {
            const tLanes = await waitPlayerLaneSelection(1, o, sTC, false, wallPredefinedLanes, false, true);
            if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける
            if (tLanes && tLanes.length > 0) {
                const targetLane = tLanes[0];
                const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                const existingCard = board[targetLane];
                if (existingCard && (hasSkill(sTC, 'equip') || hasSkill(existingCard, 'arm_self')) && !hasSkill(existingCard, 'possession') && !hasSkill(sTC, 'possession') && !hasSkill(existingCard, 'reflect') && !hasSkill(sTC, 'reflect')) {
                    existingCard.power = (existingCard.power || 0) + (sTC.power || 0);
                    existingCard.basePower = (existingCard.basePower || 0) + (sTC.power || 0);
                    existingCard.currentPower = (existingCard.currentPower || 0) + (sTC.power || 0);
                    
                    const equipSkills = [];
                    if (sTC.skill && sTC.skill !== 'none' && sTC.skill !== 'equip') equipSkills.push({ id: sTC.skill, value: sTC.skillValue });
                    if (sTC.skills) sTC.skills.forEach(s => { if (s.id !== 'equip') equipSkills.push(s); });
                    mergeCardSkills(existingCard, equipSkills);
                    
                    existingCard.equippedCards = existingCard.equippedCards || [];
                    existingCard.equippedCards.push(sTC);
                    // wall_create では events.push していないため、ここでは直接表示を更新する
                    if (window.updateCardVisualsReact) window.updateCardVisualsReact(targetLane, o);
                } else {
                    if (board[targetLane]) {
                        if (!(await discardCard(o, board[targetLane], targetLane, false))) board[targetLane] = null;
                    }
                    board[targetLane] = sTC;
                }

                // 出現時スキルを持つ場合は即座に保護フラグを立てる
                if (hasActiveSkill(sTC)) {
                    sTC.isSkillResolving = true;
                }

                playSound(SOUNDS.sePlace);
                renderBoard();

                await sleep(400);
                sTC.isSkillResolving = false; // 演出が終わったので保護フラグを解除
                await cleanupDestroyedCards(c);
            }
        }
    } else if (skillId === 'standby') {
        // 【仕様】自分のカードに適用するため、+1 補正は不要。
        // bind/freeze は相手カードに適用し、「発動したターンも防御状態にする」ため +1 しているが、
        // standby は自分が召喚したこのターンから待機するため、val そのままで正しい挙動になる。
        const turns = (skillValue || 1);
        c.stunTurns = turns;
        if (cEl) {
            createDamagePopup(cEl, '待機', '#94a3b8');
        }
        renderBoard();
        await sleep(400);
    } else if (skillId === 'decay') {
        // パワーを半分にする
        const currentP = c.currentPower !== undefined ? c.currentPower : (c.power || 1);
        const halfP = Math.floor(currentP / 2);
        
        c.power = halfP;
        c.currentPower = halfP;
        c.basePower = halfP;

        if (cEl) {
            createDamagePopup(cEl, '減衰', '#94a3b8');
        }
        renderBoard();
        await sleep(400);
    } else if (skillId === 'resurrect') {
        if (await triggerGraveKeeperEffect()) return;
        const maxPow = skillValue || 1;
        const discard = o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
        const validCards = discard.filter(card => (card.power || 0) <= maxPow && !card.isToken);
        let tokenLanes = null;

        if (validCards.length > 0) {
            let selectedCard = null;
            if (o === 'red' && GameState.gameMode !== 'online' && GameState.gameMode !== 'pvp') {
                const aiAction = consumeAIAction('resurrect');
                if (aiAction) {
                    // targetUid が存在する場合はUID優先で照合（validCardsとのインデックスずれを防ぐ）
                    if (aiAction.targetUid) {
                        selectedCard = validCards.find(c => c.uid === aiAction.targetUid || c.id === aiAction.targetUid || c.baseId === aiAction.targetUid) || null;
                    }
                    // フォールバック: targetIdx で直接参照（validCards が discard と一致している場合）
                    if (!selectedCard && aiAction.targetIdx !== undefined) {
                        selectedCard = validCards[aiAction.targetIdx] || discard[aiAction.targetIdx] || null;
                    }
                    if (aiAction.laneIdx !== undefined) tokenLanes = [aiAction.laneIdx];
                }
            } else {
                selectedCard = await waitPlayerDiscardSelection(validCards, maxPow, o, '復活させるカードを選択', `パワー${maxPow}以下のカードを1枚場に出します。`);
            }

            if (selectedCard) {
                // 配置先を選ばせる (召喚ではなく配置扱いのため制約チェックはしない)
                const tLanes = await waitPlayerLaneSelection(1, o, selectedCard, false, tokenLanes, false, true);
                if (tLanes && tLanes.length > 0) {
                    const targetLane = tLanes[0];
                    const dIdx = discard.findIndex(cd => cd.id === selectedCard.id);
                    // 完全一致するオブジェクトを手動で削除
                    const actualIdx = discard.indexOf(selectedCard);
                    if (actualIdx !== -1) discard.splice(actualIdx, 1);
                    updateDeckDisplay(o);

                    const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                    if (board[targetLane] && (hasSkill(selectedCard, 'equip') || hasSkill(board[targetLane], 'arm_self'))) {
                        const targetCard = board[targetLane];
                        // 装備によるパワー加算
                        targetCard.basePower = (targetCard.basePower || 0) + (selectedCard.power || 0);
                        targetCard.currentPower = (targetCard.currentPower || 0) + (selectedCard.power || 0);

                        // スキルの統合
                        if (!targetCard.skills) {
                            targetCard.skills = targetCard.skill && targetCard.skill !== 'none' ? [{ id: targetCard.skill, value: targetCard.skillValue }] : [];
                            targetCard.skill = 'none';
                        }

                        const equipSkills = [];
                        if (selectedCard.skill && selectedCard.skill !== 'none' && selectedCard.skill !== 'equip') {
                            equipSkills.push({ id: selectedCard.skill, value: selectedCard.skillValue });
                        }
                        if (selectedCard.skills) {
                            selectedCard.skills.forEach(s => {
                                if (s.id !== 'equip') equipSkills.push(s);
                            });
                        }
                        mergeCardSkills(targetCard, equipSkills);
                        // ※ユーザー指定に基づき、召喚ではないためアクティブスキルの即発動は行わない

                        // 装備したカードは消費されて対象カードにアタッチされる
                        targetCard.equippedCards = targetCard.equippedCards || [];
                        targetCard.equippedCards.push(selectedCard);
                    } else {
                        const existingCard = board[targetLane];
                        const unionSkill = selectedCard.skills && selectedCard.skills.find(s => s.id === 'union');
                        const isUnion = unionSkill && existingCard && (existingCard.baseId === unionSkill.targetId || existingCard.id === unionSkill.targetId);

                        if (isUnion) {
                            const combineId = unionSkill.summonId;
                            const masterData = CARD_MASTER.find(c => c.id === combineId);
                            let unionCard = JSON.parse(JSON.stringify(masterData));
                            unionCard.uid = getOrCreateUUID(null);
                            unionCard.owner = o;
                            unionCard.baseId = unionCard.id;
                            unionCard.basePower = unionCard.power;
                            unionCard.currentPower = unionCard.power;
                            unionCard.unionMaterials = [existingCard, selectedCard];
                            unionCard.skillTriggered = true; // 配置（復活）からの合体のため召喚時効果は不発
                            unionCard.stunTurns = 0;
                            unionCard.stunAppliedThisTurn = false;
                            board[targetLane] = unionCard;
                        } else {
                            if (existingCard) {
                                if (!(await discardCard(o, board[targetLane], targetLane, false))) board[targetLane] = null;
                            }
                            const newUID = `res_uid_${Math.floor(getSeededRandom() * 1000000000)}`;
                            board[targetLane] = { 
                                ...selectedCard, 
                                id: `res_${Math.floor(getSeededRandom() * 1000000000)}`,
                                uid: newUID
                            };

                            // 出現時スキルを持つ場合は即座に保護フラグを立てる
                            if (hasActiveSkill(board[targetLane])) {
                                board[targetLane].isSkillResolving = true;
                            }

                            board[targetLane].currentPower = board[targetLane].power;

                            board[targetLane].skillTriggered = true; // 召喚効果は発動しない
                            board[targetLane].stunTurns = 0;
                            board[targetLane].stunAppliedThisTurn = false;
                        }
                    }

                    if (board[targetLane]?.voiceCategory) playCardVoice(board[targetLane].voiceCategory, 'play');
                    playSound(SOUNDS.sePlace);
                    renderBoard();
                    await sleep(400);
                    // 配置演出が完了したので保護フラグを解除（復活したカード自身）
                    if (board[targetLane]) board[targetLane].isSkillResolving = false;
                    await cleanupDestroyedCards(c);
                }
            }
        }
        await sleep(300);
    } else if (skillId === 'puppet') {
        if (await triggerGraveKeeperEffect()) return;
        // 【傘儀】相手の墓地からカードを展開し、自分の場に配置する（復活の逆版）
        const maxPow = skillValue || 1;
        const oppOwner = o === 'blue' ? 'red' : 'blue';
        const oppDiscard = o === 'blue' ? GameState.enemyDiscard : GameState.playerDiscard;
        const validCards = oppDiscard.filter(card => (card.power || 0) <= maxPow && !card.isToken);
        let tokenLanes = null;

        if (validCards.length > 0) {
            let selectedCard = null;

            if (o === 'red' && GameState.gameMode !== 'online' && GameState.gameMode !== 'pvp') {
                // AIの場合：actionQueueのtoken_placement(puppet)からレーン指定を取り出す（cloneと同パターン）
                if (GameState.aiDecision && GameState.aiDecision.actionQueue) {
                    const tpIdx = GameState.aiDecision.actionQueue.findIndex(a => a.type === 'token_placement' && a.skillId === 'puppet');
                    if (tpIdx !== -1) {
                        const tpAction = GameState.aiDecision.actionQueue.splice(tpIdx, 1)[0];
                        if (Array.isArray(tpAction.lanes) && tpAction.lanes.length > 0) {
                            tokenLanes = [...tpAction.lanes];
                        }
                    }
                }
                // actionQueueに情報がなくてもフォールバックとして最強カードを選択
                // （シミュレーションと同じロジック：パワー降順ソートの最強カード）
                const sortedPuppet = [...validCards].sort((a, b) => (b.power || 0) - (a.power || 0));
                selectedCard = sortedPuppet[0] || null;
            } else {
                // プレイヤー: 復活と同じ選択モーダルを使用
                selectedCard = await waitPlayerDiscardSelection(
                    validCards, maxPow, o,
                    '傀儡: 配置するカードを選択',
                    `相手の墓地からパワー${maxPow}以下のカードを1枚自分の場に配置します。`
                );
            }

            if (selectedCard) {
                // 配置先レーンを選択（復活と同様、制約チェックなし）
                const tLanes = await waitPlayerLaneSelection(1, o, selectedCard, false, tokenLanes, false, true);
                if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける
                if (tLanes && tLanes.length > 0) {
                    const targetLane = tLanes[0];

                    // 相手の墓地から取り除く
                    const actualIdx = oppDiscard.indexOf(selectedCard);
                    if (actualIdx !== -1) oppDiscard.splice(actualIdx, 1);
                    updateDeckDisplay(oppOwner);

                    const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                    const existingCard = board[targetLane];

                    if (existingCard && (hasSkill(selectedCard, 'equip') || hasSkill(existingCard, 'arm_self'))) {
                        // 【傀儡＋装備】選択カードが装備スキルを持ち、レーンに既存カードがある場合は装備扱いにする（復活と同じロジック）
                        const targetCard = existingCard;

                        targetCard.basePower = (targetCard.basePower || 0) + (selectedCard.power || 0);
                        targetCard.currentPower = (targetCard.currentPower || 0) + (selectedCard.power || 0);

                        if (!targetCard.skills) {
                            targetCard.skills = targetCard.skill && targetCard.skill !== 'none' ? [{ id: targetCard.skill, value: targetCard.skillValue }] : [];
                            targetCard.skill = 'none';
                        }
                        const equipSkills = [];
                        if (selectedCard.skill && selectedCard.skill !== 'none' && selectedCard.skill !== 'equip') {
                            equipSkills.push({ id: selectedCard.skill, value: selectedCard.skillValue });
                        }
                        if (selectedCard.skills) {
                            selectedCard.skills.forEach(s => { if (s.id !== 'equip') equipSkills.push(s); });
                        }
                        mergeCardSkills(targetCard, equipSkills);

                        // 装備カードをアタッチ（元の持ち主フラグも引き継ぐ）
                        targetCard.equippedCards = targetCard.equippedCards || [];
                        selectedCard.puppetOriginalOwner = oppOwner; // 元の持ち主を記録
                        targetCard.equippedCards.push(selectedCard);

                        if (board[targetLane]?.voiceCategory) playCardVoice(board[targetLane].voiceCategory, 'play');
                        playSound(SOUNDS.sePlace);
                        renderBoard();
                        await sleep(400);
                        await cleanupDestroyedCards(c);
                    } else {
                        // 通常配置（装備なし・または既存カードなし）
                        const existingCard2 = board[targetLane];
                        const unionSkill = selectedCard.skills && selectedCard.skills.find(s => s.id === 'union');
                        const isUnion = unionSkill && existingCard2 && (existingCard2.baseId === unionSkill.targetId || existingCard2.id === unionSkill.targetId);

                        if (isUnion) {
                            // 【傀儡＋合体】復活と同じロジックで合体処理を行う（召喚時効果は不発）
                            const combineId = unionSkill.summonId;
                            const masterData = CARD_MASTER.find(cd => cd.id === combineId);
                            let unionCard = JSON.parse(JSON.stringify(masterData));
                            unionCard.uid = getOrCreateUUID(null);
                            unionCard.owner = o;
                            unionCard.baseId = unionCard.id;
                            unionCard.basePower = unionCard.power;
                            unionCard.currentPower = unionCard.power;
                            unionCard.unionMaterials = [existingCard2, selectedCard];
                            unionCard.skillTriggered = true; // 配置（傀儡）からの合体のため召喚時効果は不発
                            unionCard.stunTurns = 0;
                            unionCard.stunAppliedThisTurn = false;
                            board[targetLane] = unionCard;
                        } else {
                            if (existingCard2) {
                                if (!(await discardCard(o, board[targetLane], targetLane, false))) board[targetLane] = null;
                            }
                            const newUID = `puppet_uid_${Math.floor(getSeededRandom() * 1000000000)}`;
                            board[targetLane] = {
                                ...selectedCard,
                                id: `puppet_${Math.floor(getSeededRandom() * 1000000000)}`,
                                uid: newUID,
                                owner: o,
                                // 【傀儡】元の持ち主を記録しておく。破壊・張り替え時に元の墓地へ戻すために使用する
                                puppetOriginalOwner: oppOwner,
                                skillTriggered: true, // 配置扱いのため召喚時スキルは発動しない
                                stunTurns: 0,
                                stunAppliedThisTurn: false,
                            };

                            // 出現時スキルを持つ場合は即座に保護フラグを立てる
                            if (hasActiveSkill(board[targetLane])) {
                                board[targetLane].isSkillResolving = true;
                            }

                            board[targetLane].currentPower = board[targetLane].power; // resurrect と同様に代入後に明示設定
                        }

                        if (board[targetLane]?.voiceCategory) playCardVoice(board[targetLane].voiceCategory, 'play');
                        playSound(SOUNDS.sePlace);
                        renderBoard();
                        await sleep(400);
                        if (board[targetLane]) board[targetLane].isSkillResolving = false;
                        await cleanupDestroyedCards(c);
                    }
                }
            }
        }
        await sleep(300);
    } else if (skillId === 'salvage') {
        if (await triggerGraveKeeperEffect()) return;
        const discard = o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
        const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;

        let discardIndices = await waitPlayerHandSelection(skillValue || 1, o, false, `捨てるカードを${skillValue || 1}枚まで選んでください`);
        if (discardIndices && discardIndices.length > 0) {
            // 後ろから削除するためにインデックスを降順ソート
            const sortedIndices = [...discardIndices].sort((a, b) => b - a);
            for (const idx of sortedIndices) {
                const card = hand.splice(idx, 1)[0];
                await discardCard(o, card, undefined, false);
            }
            updateDeckDisplay(o);
            renderHand();

            for (let i = 0; i < discardIndices.length; i++) {
                const validCards = discard.filter(card => !card.isToken);
                if (validCards.length > 0) {
                    const selectedCard = await waitPlayerDiscardSelection(validCards, 999, o, '回収するカードを選択', '墓地からカードを1枚選び、手札に加えます。', false);

                    if (selectedCard) {
                        const actualIdx = discard.indexOf(selectedCard);
                        if (actualIdx !== -1) discard.splice(actualIdx, 1);

                        // カードのステータスを初期状態にリセット
                        const masterData = CARD_MASTER.find(m => m.id === (selectedCard.baseId || selectedCard.id));
                        const restoredCard = masterData ? JSON.parse(JSON.stringify(masterData)) : { ...selectedCard };
                        restoredCard.baseId = selectedCard.baseId || selectedCard.id; // 画像URLのための保全
                        restoredCard.basePower = restoredCard.power;
                        restoredCard.currentPower = restoredCard.power;

                        hand.push({ ...restoredCard, uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}` });
                        playSound(SOUNDS.seDraw);
                        updateDeckDisplay(o);
                        renderHand();
                    }
                }
            }
        }
        await sleep(400);
    } else if (skillId === 'explore') {
        const deck = o === 'blue' ? GameState.playerDeck : GameState.enemyDeck;
        const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
        const maxPow = skillValue || 3;
        const validCards = deck.filter(card => (card.power || 0) <= maxPow);

        if (validCards.length > 0) {
            const selectedCard = await waitPlayerDiscardSelection(validCards, maxPow, o, '探索するカードを選択', `デッキからパワー${maxPow}以下のカードを1枚選び、手札に加えます。`, true);

            if (selectedCard) {
                // デッキから対象カードを取り除く
                const idx = deck.findIndex(card => card.id === selectedCard.id || card.baseId === selectedCard.baseId);
                if (idx !== -1) deck.splice(idx, 1);

                // カードのステータスを初期状態にリセット
                const masterData = CARD_MASTER.find(m => m.id === (selectedCard.baseId || selectedCard.id));
                const restoredCard = masterData ? JSON.parse(JSON.stringify(masterData)) : { ...selectedCard };
                restoredCard.baseId = selectedCard.baseId || selectedCard.id;
                restoredCard.basePower = restoredCard.power;
                restoredCard.currentPower = restoredCard.power;

                hand.push({ ...restoredCard, uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}` });
                playSound(SOUNDS.seDraw);
                updateDeckDisplay(o);
                renderHand();

                // その後、手札を1枚捨てる
                if (hand.length > 0) {
                    let discardIndices = await waitPlayerHandSelection(1, o, false, '捨てるカードを1枚選んでください');
                    if (discardIndices && discardIndices.length > 0) {
                        const discardIdx = discardIndices[0];
                        const cardToDiscard = hand.splice(discardIdx, 1)[0];
                        await discardCard(o, cardToDiscard, undefined, false);
                        renderHand();
                    }
                }

                // デッキをシャッフルする
                shuffleArray(deck);
                updateDeckDisplay(o);
                await sleep(300);
            }
        }
    } else if (skillId === 'reinforce') {
        const count = skillValue || 1;
        playSkillSound('summon'); // 汎用の音
        if (cEl) createDamagePopup(cEl, '増援', '#facc15');

        const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;

        // AIはランダム、プレイヤーは手動選択のUIを待機
        const selectedHandIndices = await waitPlayerHandSelection(count, o);
        let discardedCount = 0;

        if (selectedHandIndices && selectedHandIndices.length > 0) {
            // 降順ソートして削除のずれを防ぐ
            selectedHandIndices.sort((a, b) => b - a);
            for (let i of selectedHandIndices) {
                const discarded = h.splice(i, 1)[0];
                await discardCard(o, discarded);
                discardedCount++;
            }
        }

        if (discardedCount > 0) {
            const tokenId = `token_${c.baseId || c.id}`;
            let tC = CARD_MASTER.find(m => m.id === tokenId);
            if (!tC) {
                tC = CARD_MASTER.find(m => m.id === 'token_reinforce');
                if (!tC) tC = { id: 'token_reinforce', name: '増援', power: c.currentPower, rarity: c.rarity || 1, isToken: true, voiceCategory: c.voiceCategory, flavor: '呼び声に応え、現れた仲間。' };
            }

            for (let i = 0; i < discardedCount; i++) {
                const newToken = {
                    id: `rf_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                    owner: o,
                    ...tC,
                    isToken: true,
                    isPremium: (c.isPremium !== undefined) ? c.isPremium : GameState.premiumCards.includes(c.baseId || c.id),
                    name: '増援',
                    power: c.currentPower !== undefined ? c.currentPower : (c.power || 0),
                    currentPower: c.currentPower !== undefined ? c.currentPower : (c.power || 0),
                    basePower: c.basePower !== undefined ? c.basePower : (c.power || 0),
                    imgUrl: getCardImgUrl(c),
                    filter: c.filter,
                    rarity: c.rarity || 1,
                    voiceCategory: c.voiceCategory,
                    uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`
                };
                h.push(newToken);
            }
            updateDeckDisplay(o);
            if (o === 'blue') renderHand();
        }
        await sleep(300);
    } else if (skillId === 'convert') {
        const val = skillValue || 1;
        const discardIndices = await waitPlayerHandSelection(val, o, true);
        if (discardIndices && discardIndices.length > 0) {
            const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
            const d = o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
            discardIndices.sort((a, b) => b - a);
            for (let idx of discardIndices) {
                const dropped = h.splice(idx, 1)[0];
                await discardCard(o, dropped);
            }
            const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
            for (let i = 0; i < discardIndices.length; i++) {
                const newToken = {
                    id: `void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                    owner: o,
                    ...voidTpl,
                    isToken: true,
                    power: 1, basePower: 1, currentPower: 1,
                    imgUrl: o === 'blue' ? getCardImgUrl(voidTpl) : '',
                    rarity: 1,
                    uid: `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`
                };
                h.push(newToken);
            }
            updateDeckDisplay(o);
            if (o === 'blue') renderHand();
        }
        await sleep(300);
    } else if (skillId === 'summon') {
        const val = skillValue || 1;
        const tokenId = `token_${c.baseId || c.id}`;
        let tC = CARD_MASTER.find(m => m.id === tokenId);
        if (!tC) {
            tC = { id: `token_${Math.floor(getSeededRandom() * 1000000000)}`, name: '召喚獣', power: val, rarity: 1, isToken: true };
        }

        const simulatedToken = {
            ...tC,
            power: val,
            currentPower: val,
            isToken: true
        };

        const tLanes = await waitPlayerLaneSelection(1, o, simulatedToken, false, null, false);
        if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける
        let events = [];

        if (tLanes && tLanes.length > 0) {
            const targetLane = tLanes[0];
            const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

            const newToken = {
                id: `sm_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
                owner: o,
                ...tC,
                isToken: true,
                power: val,
                currentPower: val,
                basePower: val,
                rarity: c.rarity || 1
            };
            const existingCard = board[targetLane];
            if (existingCard && (hasSkill(newToken, 'equip') || hasSkill(existingCard, 'arm_self')) && !hasSkill(existingCard, 'possession') && !hasSkill(newToken, 'possession') && !hasSkill(existingCard, 'reflect') && !hasSkill(newToken, 'reflect')) {
                existingCard.power = (existingCard.power || 0) + (newToken.power || 0);
                existingCard.basePower = (existingCard.basePower || 0) + (newToken.power || 0);
                
                const equipSkills = [];
                if (newToken.skill && newToken.skill !== 'none' && newToken.skill !== 'equip') equipSkills.push({ id: newToken.skill, value: newToken.skillValue });
                if (newToken.skills) newToken.skills.forEach(s => { if (s.id !== 'equip') equipSkills.push(s); });
                mergeCardSkills(existingCard, equipSkills);
                
                existingCard.equippedCards = existingCard.equippedCards || [];
                existingCard.equippedCards.push(newToken);
                events.push({ type: 'power_change', side: o, lane: targetLane, amount: newToken.power, source: 'equip' });
            } else {
                if (board[targetLane]) {
                    if (!(await discardCard(o, board[targetLane], targetLane, false))) board[targetLane] = null;
                }
                board[targetLane] = newToken;
                // 出現時スキルを持つ場合は即座に保護フラグを立てる
                if (hasActiveSkill(newToken)) {
                    newToken.isSkillResolving = true;
                }
                events.push({ type: 'summon_token', side: o, lane: targetLane, card: newToken, source: 'summon' });
            }
        }

        if (events.length > 0) {
            await playEvents(events);
            await cleanupDestroyedCards(c);
        }
    } else if (skillId === 'call') {
        const d = o === 'blue' ? GameState.playerDeck : GameState.enemyDeck;
        if (d.length > 0) {
            const topCard = d[d.length - 1];
            if (cEl) createDamagePopup(cEl, `号令 (${topCard.name})`, '#facc15');

            if ((topCard.power || 0) <= (skillValue || 3)) {
                // デッキトップを取り出す
                d.pop();
                updateDeckDisplay(o);

                // キャンセル可能なレーン選択
                GameState.placementMessage = `号令: 「${topCard.name}」を召喚するレーンを選んでください`;
                const selectedLanes = await waitPlayerLaneSelection(1, o, topCard, true, null, true, true, '召喚終了');
                GameState.placementMessage = null;

                if (GameState.gameMode !== 'online' && o !== 'blue') await sleep(600); // 敵AIの場合のみ間を空ける

                if (selectedLanes && selectedLanes.length > 0) {
                    const targetLane = selectedLanes[0];
                    const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;

                    // 演出：号令による召喚の場合もアニメーションを再生
                    await playSummonAnimation(topCard, o);

                    if (board[targetLane] && (hasSkill(topCard, 'equip') || hasSkill(board[targetLane], 'arm_self'))) {
                        const targetCard = board[targetLane];

                        targetCard.basePower = (targetCard.basePower || 0) + (topCard.power || 0);
                        targetCard.currentPower = (targetCard.currentPower || 0) + (topCard.power || 0);

                        if (!targetCard.skills) {
                            targetCard.skills = targetCard.skill && targetCard.skill !== 'none' ? [{ id: targetCard.skill, value: targetCard.skillValue }] : [];
                            targetCard.skill = 'none';
                        }
                        const equipSkills = [];
                        if (topCard.skill && topCard.skill !== 'none' && topCard.skill !== 'equip') {
                            equipSkills.push({ id: topCard.skill, value: topCard.skillValue });
                        }
                        if (topCard.skills) {
                            topCard.skills.forEach(s => {
                                if (s.id !== 'equip') equipSkills.push(s);
                            });
                        }
                        mergeCardSkills(targetCard, equipSkills);

                        // デッキから出た号令カードを対象にアタッチする
                        targetCard.equippedCards = targetCard.equippedCards || [];
                        targetCard.equippedCards.push(topCard);

                        let callEvents = [];
                        callEvents.push({ type: 'summon_card', side: o, lane: targetLane, card: targetCard, source: 'equip' });
                        await playEvents(callEvents);

                        // 装備されたカードが持っていたアクティブスキルを即時発動させる
                        for (const sk of equipSkills) {
                            if (ACTIVE_SKILLS.includes(sk.id)) {
                                await sleep(50);
                                await resolveActiveSkillEffect(o, targetLane, targetCard, sk.id, sk.value);
                            }
                        }
                        await cleanupDestroyedCards(c);
                    } else {
                        topCard.uid = `${o}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
                        topCard.owner = o;

                        if (board[targetLane]) { await discardCard(o, board[targetLane], targetLane, false); }
                        board[targetLane] = topCard;

                        // 出現時スキルを持つ場合は即座に保護フラグを立てる
                        if (hasActiveSkill(topCard)) {
                            topCard.isSkillResolving = true;
                        }

                        let callEvents = [];

                        callEvents.push({ type: 'summon_card', side: o, lane: targetLane, card: topCard, source: 'call' });
                        await playEvents(callEvents);

                        if (hasActiveSkill(topCard)) {
                            await resolveOnPlaySkill(o, targetLane, topCard);
                        } else {
                            topCard.isSkillResolving = false;
                        }
                        await cleanupDestroyedCards(c);

                        // 使い捨てスペル等のパワー0以下のカードは、召喚効果解決後に消去する
                        const finalCard = board[targetLane];
                        if (finalCard && finalCard.currentPower <= 0) {
                            const destroyEvents = [{ type: 'destroy_cards', targets: [{ side: o, lane: targetLane, card: finalCard }] }];
                            await playEvents(destroyEvents);
                        }
                    }
                } else {
                    // キャンセルされたのでデッキトップに戻す
                    d.push(topCard);
                    updateDeckDisplay(o);
                }
            } else {
                // 条件を満たさないため失敗
                if (cEl) createDamagePopup(cEl, `不発 (${topCard.name})`, '#94a3b8');
                await sleep(500);
            }
        }
    } else {
        // 標準的なスキルは完全に Engine と Renderer に移譲
        let events = [];
        applyActiveSkillLogic(currentState, o, l, skillId, skillValue || 0, events);

        // エンジンのイベントによって状態と描画が同期される
        if (events.length > 0) {
            await playEvents(events);
            if (skillId === 'sacrifice') checkWinCondition();
        }
    }
}

export async function triggerStartTurnPassive(owner, lane) {
    const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    const side = owner === 'blue' ? 'player' : 'enemy';
    const c = board[lane];
    if (!c) return false;

    // invincible のターン処理等のために一度 Engine の全体処理を呼ぶべきだが、
    // 既存構成が「カードごとに順次再生」のため、一旦ここで個別評価し、
    // Renderer に流し込む。

    let triggered = false;
    let events = [];

    // Engine 内の個別処理を真似て状態更新ログを作成
    let skillsToResolve = [];
    if (c.skill && c.skill !== 'none') skillsToResolve.push({ id: c.skill, value: c.skillValue });
    if (Array.isArray(c.skills)) skillsToResolve = skillsToResolve.concat(c.skills);

    for (const sk of skillsToResolve) {
        if (sk.id === 'growth') {
            const val = sk.value || 1;
            c.power += val; // RendererがcurrentPowerを処理するのでここはpowerのみアップ
            events.push({ type: 'power_change', side: owner, lane, amount: val, source: 'growth' });
            triggered = true;
        }

        if (sk.id === 'invincible') {
            sk.value--;
            if (sk.value <= 0) {
                if (c.skill === 'invincible') c.skill = 'none';
                else if (Array.isArray(c.skills)) {
                    const idx = c.skills.indexOf(sk);
                    if (idx !== -1) c.skills.splice(idx, 1);
                }
                const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${lane}"] .card`);
                if (cEl) {
                    createDamagePopup(cEl, '無敵終了', '#94a3b8');
                    await sleep(150);
                }
            }
            triggered = true;
        }


        if (sk.id === 'contract') {
            const val = sk.value || 3;
            // HP減少はRenderer側で実施されるためここでは行わない
            events.push({ type: 'damage_player', side: owner, amount: val, source: 'contract' });
            triggered = true;
        }

        if (sk.id === 'awake') {
            const val = sk.value || 1;
            // エンジンのロジックを流用してイベントを生成
            const currentState = {
                playerBoard: GameState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                enemyBoard: GameState.enemyBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                playerHP: GameState.playerHP, enemyHP: GameState.enemyHP,
                playerDiscard: GameState.playerDiscard, enemyDiscard: GameState.enemyDiscard,
                playerHand: GameState.playerHand, enemyHand: GameState.enemyHand,
                playerSealedLanes: GameState.playerSealedLanes, enemySealedLanes: GameState.enemySealedLanes
            };
            
            // 演出用のポップアップ
            const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${lane}"] .card`);
            if (cEl) {
                createDamagePopup(cEl, '覚醒', '#facc15');
                playSkillSound('summon');
                await sleep(300);
            }

            let awakeEvents = [];
            applyActiveSkillLogic(currentState, owner, lane, 'awake', val, awakeEvents);
            
            // 盤面の状態を同期
            if (owner === 'blue') {
                GameState.playerBoard = currentState.playerBoard;
            } else {
                GameState.enemyBoard = currentState.enemyBoard;
            }
            
            events.push(...awakeEvents);
            triggered = true;
            break; // カードが置換されたので、他のパッシブ処理を中断
        }
    }

    if (events.length > 0) {
        await playEvents(events);
        // パワーアップ等の結果、HP0以下のカードがあれば破壊（ボイス・揺れ演出を含む）
        await cleanupDestroyedCards();
    }

    return triggered;
}

/**
 * UI側での簒奪（強奪）発動用ヘルパー
 */
async function triggerExtortInAction(c, o) {
    if (!hasSkill(c, 'extort')) return;
    const val = getSkillValue(c, 'extort') || 1;
    const oppSide = o === 'blue' ? 'red' : 'blue';
    const eHandRef = oppSide === 'blue' ? GameState.playerHand : GameState.enemyHand;
    const eD = oppSide === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;

    if (eHandRef && eHandRef.length > 0) {
        let discardedAmount = 0;
        for (let i = 0; i < val; i++) {
            if (eHandRef.length === 0) break;
            const randIndex = Math.floor(getSeededRandom() * eHandRef.length);
            const discarded = eHandRef.splice(randIndex, 1)[0];
            await discardCard(oppSide, discarded, undefined, false);

            const voidTpl = CARD_MASTER.find(m => m.id === 'token_void') || { name: '虚空', power: 1 };
            const voidToken = {
                ...voidTpl,
                id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_extUI${i}`,
                uid: `${oppSide}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidextUI${i}`,
                filter: voidTpl.filter,
                power: voidTpl.power,
                currentPower: voidTpl.power,
                basePower: voidTpl.power,
                skill: voidTpl.skill || 'none',
                voiceCategory: voidTpl.voiceCategory || 'undead',
                isToken: true,
                isMorphToken: true
            };
            eHandRef.push(voidToken);
            discardedAmount++;
        }

        if (discardedAmount > 0) {
            const lane = GameState.playerBoard.indexOf(c) !== -1 ? GameState.playerBoard.indexOf(c) : GameState.enemyBoard.indexOf(c);
            const side = GameState.playerBoard.indexOf(c) !== -1 ? 'player' : 'enemy';
            if (lane !== -1) {
                const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${lane}"] .card`);
                if (cEl) createDamagePopup(cEl, '簒奪', '#facc15');
            }
            playSound(SOUNDS.seSkill);
            renderHand();
            await sleep(300);
        }
    }
}

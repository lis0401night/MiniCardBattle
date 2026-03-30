import { GameState } from '../hooks/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { createDamagePopup, playSound, sleep, getCardImgUrl, shuffleArray, hasSkill, getSkillValue, getSeededRandom } from '../utils/gameUtils.js';
import { SOUNDS, playSkillSound } from '../utils/sounds.js';
import { updateHPBar, updateSPOrbs, checkWinCondition, waitPlayerLaneSelection, waitPlayerAlliedLaneSelection, waitPlayerHandSelection, waitPlayerDiscardSelection, waitSkillChoice, discardCard, updateDeckDisplay, cleanupDestroyedCards, drawCard, hasActiveSkill, resolveOnPlaySkill, executeSingleCombat } from './battle.js';
import { applyActiveSkillLogic, applyPassiveSkillLogic } from './engine.js';
import { renderHand, renderBoard, updateCardPowerOnly } from './uiBattle.js';
import { playEvents } from './eventRenderer.js';
import { PASSIVE_SKILLS } from '../utils/constants/skills.js';
import { getIsHost } from './multiplayer.js';

/**
 * Mini Card Battle - Skill Implementation Logic
 * 分割されたスキル実行ロジック
 */

export async function resolveActiveSkillEffect(o, l, c, skillId, skillValue) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    const dS = o === 'blue' ? 'enemy' : 'player';

    // 演出用のポップアップと音（一括した基本演出）
    if (['support', 'hero', 'lone_wolf', 'morph', 'spread', 'snipe', 'berserk', 'heal', 'charge', 'sacrifice', 'quick', 'choice', 'artillery', 'standby', 'resurrect', 'summon', 'salvage'].includes(skillId)) {
        playSkillSound(skillId);
        const labels = { 'support': '援護', 'hero': '英雄', 'lone_wolf': '単騎', 'morph': '変化', 'spread': '拡散', 'snipe': '狙撃', 'berserk': '狂乱', 'heal': '回復', 'charge': '充填', 'sacrifice': '対価', 'quick': '速攻', 'choice': '選択', 'artillery': '砲撃', 'standby': '待機', 'resurrect': '復活', 'summon': '召喚', 'salvage': '回収' };
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
        c.rarity = randomMaster.rarity;

        // イラストの決定（トークン等の特殊なマッピングを考慮）
        let imgUrl = randomMaster.imgUrl;
        if (!imgUrl) {
            if (randomMaster.id === 'token_knight') imgUrl = 'assets/cards/card_token_knight.jpg';
            else if (randomMaster.id === 'token_ignis') imgUrl = 'assets/characters/char_dragon.png';
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
        return;
    }

    if (skillId === 'choice') {
        const choiceArray = await waitSkillChoice(c.choices, o, c, skillValue);
        if (choiceArray) {
            const arr = Array.isArray(choiceArray) ? choiceArray : [choiceArray];
            for (const choice of arr) {
                // もしパッシブスキル（機能が場に留まるスキル）を選んだ場合はカード自身に永続付与する
                if (PASSIVE_SKILLS.includes(choice.id)) {
                    if (!Array.isArray(c.skills)) c.skills = [];
                    c.skills.push({ id: choice.id, value: choice.value || 0 });
                    renderBoard(); // UI反映
                }
                // 選択されたスキルを順に実行
                await resolveActiveSkillEffect(o, l, c, choice.id, choice.value);
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

            // 互いに4枚引く
            for (let i = 0; i < 4; i++) {
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
        const pValue = skillValue || 1;
        let tName = 'ドローン';
        let tId = 'token_drone';
        if (pValue >= 5) {
            tName = 'ゴーレム';
            tId = 'token_golem';
        }
        
        const tC = CARD_MASTER.find(m => m.id === tId) || {
            id: tId, name: tName, power: pValue, skill: 'none', isToken: true, rarity: 1, voiceCategory: pValue >= 5 ? 'monster' : 'machine_new'
        };

        const simulatedToken = {
            ...tC,
            power: pValue,
            currentPower: pValue,
            basePower: pValue,
            skills: []
        };
        const selectedLanes = await waitPlayerLaneSelection(1, o, simulatedToken, false, null, false);

        let events = [];
        for (let i = 0; i < selectedLanes.length; i++) {
            const targetLane = selectedLanes[i];
            const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
            const newToken = {
                id: `sm_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
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
                voiceCategory: pValue >= 5 ? 'monster' : 'machine_new',
                skills: []
            };
            board[targetLane] = newToken;
            events.push({ type: 'summon_token', side: o, lane: targetLane, card: newToken, source: 'summon' });
        }
        await playEvents(events);

    } else if (skillId === 'clone') {
        // UI選択部分はbattle/Rendererでは隠蔽しきれないためここに残す
        const count = skillValue || 1;
        const tC = CARD_MASTER.find(m => m.id === 'token_clone');

        // スキルの引き継ぎ（分身以外）
        let inheritedSkills = [];
        if (c.skill && c.skill !== 'clone') inheritedSkills.push({ id: c.skill, value: c.skillValue });
        if (Array.isArray(c.skills)) {
            inheritedSkills = inheritedSkills.concat(c.skills.filter(sk => sk.id !== 'clone'));
        }

        const simulatedToken = {
            ...tC,
            power: c.power,
            currentPower: c.currentPower,
            skills: inheritedSkills
        };
        const selectedLanes = await waitPlayerLaneSelection(count, o, simulatedToken, false, null, false);

        let events = [];
        for (let i = 0; i < selectedLanes.length; i++) {
            const targetLane = selectedLanes[i];
            const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
            const newToken = {
                id: `cl_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
                owner: o,
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
            board[targetLane] = newToken;
            events.push({ type: 'summon_token', side: o, lane: targetLane, card: newToken, source: 'clone' });
        }
        await playEvents(events);

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
                await triggerExtortInAction(c, o);
            } else {
                GameState.playerHP -= dmg;
                createDamagePopup(document.getElementById('player-hp-fill'), `-${dmg}`, '#ef4444');
                document.body.classList.add('anim-shake');
                setTimeout(() => document.body.classList.remove('anim-shake'), 400);
                await triggerExtortInAction(c, o);
            }
        } else {
            let dmg = 6;
            if (o === 'blue') {
                GameState.playerHP -= dmg;
                createDamagePopup(document.getElementById('player-hp-fill'), `-${dmg}`, '#ef4444');
                document.body.classList.add('anim-shake');
                setTimeout(() => document.body.classList.remove('anim-shake'), 400);
            } else {
                GameState.enemyHP -= dmg;
                createDamagePopup(document.getElementById('enemy-hp-fill'), `-${dmg}`, '#ef4444');
                const eh = document.getElementById('playmat-enemy');
                if (eh) eh.classList.add('anim-shake');
            }
        }
        updateHPBar();
        checkWinCondition();
        await sleep(400);

    } else if (skillId === 'quick') {
        await sleep(400); await executeSingleCombat(o, l);
    } else if (skillId === 'toxic') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '有毒', '#10b981');
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
    } else if (skillId === 'bind') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '拘束', '#facc15');
        const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
        if (eB[l]) {
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
    } else if (skillId === 'artillery') {
        let dmg = skillValue || 1;
        await sleep(300);
        if (o === 'blue') {
            GameState.enemyHP -= dmg;
            createDamagePopup(document.getElementById('enemy-hp-fill'), `-${dmg}`, '#ef4444');
            const eh = document.getElementById('playmat-enemy');
            if (eh) eh.classList.add('anim-shake');
        } else {
            GameState.playerHP -= dmg;
            createDamagePopup(document.getElementById('player-hp-fill'), `-${dmg}`, '#ef4444');
            document.body.classList.add('anim-shake');
            setTimeout(() => document.body.classList.remove('anim-shake'), 400);
        }
        await triggerExtortInAction(c, o);
        updateHPBar();
        checkWinCondition();
        await sleep(400);
    } else if (skillId === 'standby') {
        const turns = (skillValue || 1);
        c.stunTurns = turns;
        if (cEl) {
            cEl.classList.remove('anim-shake');
            void cEl.offsetWidth; // リフロー
            cEl.classList.add('anim-shake');
        }
        await sleep(500);
        if (cEl) cEl.classList.remove('anim-shake');
    } else if (skillId === 'resurrect') {
        const maxPow = skillValue || 1;
        const discard = o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
        const validCards = discard.filter(card => (card.power || 0) <= maxPow && !card.isToken);

        if (validCards.length > 0) {
            const selectedCard = await waitPlayerDiscardSelection(validCards, maxPow, o, '復活させるカードを選択', `パワー${maxPow}以下のカードを1枚場に出します。`);

            if (selectedCard) {
                // 配置先を選ばせる (制約チェックはしない)
                const tLanes = await waitPlayerLaneSelection(1, o, selectedCard, false, null, false);
                if (tLanes && tLanes.length > 0) {
                    const targetLane = tLanes[0];
                    const dIdx = discard.findIndex(cd => cb => cb.id === selectedCard.id);
                    // 完全一致するオブジェクトを手動で削除
                    const actualIdx = discard.indexOf(selectedCard);
                    if (actualIdx !== -1) discard.splice(actualIdx, 1);
                    updateDeckDisplay(o);

                    const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                    if (board[targetLane]) {
                        if (!(await discardCard(o, board[targetLane], targetLane))) board[targetLane] = null;
                    }
                    board[targetLane] = { ...selectedCard, id: `res_${Math.floor(getSeededRandom() * 1000000000)}` };
                    board[targetLane].currentPower = board[targetLane].power;
                    board[targetLane].skillTriggered = true; // 召喚効果は発動しない
                    board[targetLane].stunTurns = 0;
                    board[targetLane].stunAppliedThisTurn = false;

                    playSound(SOUNDS.sePlace);
                    renderBoard();
                    await sleep(400);
                }
            }
        }
        await sleep(300);
    } else if (skillId === 'salvage') {
        const discard = o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
        const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
        const validCards = discard.filter(card => !card.isToken);

        if (validCards.length > 0) {
            const selectedCard = await waitPlayerDiscardSelection(validCards, 999, o, '回収するカードを選択', '墓地からカードを1枚選び、手札に加えます。');

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
                await sleep(400);
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
            discardIndices.sort((a,b) => b - a);
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
            board[targetLane] = newToken;
            events.push({ type: 'summon_token', side: o, lane: targetLane, card: newToken, source: 'summon' });
        }

        if (events.length > 0) {
            await playEvents(events);
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
    }

    if (events.length > 0) {
        await playEvents(events);
        // パワーアップ等の結果、HP0の場合は除去
        if (c.currentPower <= 0) {
            if (!(await discardCard(owner, c, lane))) board[lane] = null;
            playSound(SOUNDS.seDestroy);
        }
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
            const validIndices = eHandRef.map((card, idx) => ({ card, idx }))
                .filter(t => !(t.card.name === '虚空' && (t.card.power === 1 || t.card.basePower === 1)))
                .map(t => t.idx);
            
            if (validIndices.length === 0) break;

            const randIndex = validIndices[Math.floor(getSeededRandom() * validIndices.length)];
            const discarded = eHandRef.splice(randIndex, 1)[0];
            if (eD) eD.push(discarded);

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

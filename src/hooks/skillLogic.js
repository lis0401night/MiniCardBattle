import { GameState } from '../hooks/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { createDamagePopup, playSound, sleep, getCardImgUrl, shuffleArray } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { updateHPBar, updateSPOrbs, checkWinCondition, waitPlayerLaneSelection, waitPlayerHandSelection, waitSkillChoice, discardCard, updateDeckDisplay, cleanupDestroyedCards, drawCard, hasActiveSkill, resolveOnPlaySkill, executeSingleCombat } from './battle.js';
import { applyActiveSkillLogic, applyPassiveSkillLogic } from './engine.js';
import { renderHand, renderBoard, updateCardPowerOnly } from './uiBattle.js';
import { playEvents } from './eventRenderer.js';

/**
 * Mini Card Battle - Skill Implementation Logic
 * 分割されたスキル実行ロジック
 */

export async function resolveActiveSkillEffect(o, l, c, skillId, skillValue) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    const dS = o === 'blue' ? 'enemy' : 'player';

    // 演出用のポップアップと音（一括した基本演出）
    if (['support', 'hero', 'lone_wolf', 'morph', 'spread', 'snipe', 'berserk', 'heal', 'charge', 'sacrifice', 'quick', 'choice', 'artillery', 'standby', 'resurrect'].includes(skillId)) {
        playSound(SOUNDS.seSkill);
        const labels = { 'support': '援護', 'hero': '英雄', 'lone_wolf': '単騎', 'morph': '変化', 'spread': '拡散', 'snipe': '狙撃', 'berserk': '狂乱', 'heal': '回復', 'charge': '充填', 'sacrifice': '対価', 'quick': '速攻', 'choice': '選択', 'artillery': '砲撃', 'standby': '待機', 'resurrect': '復活' };
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
        enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard))
    };

    // 特殊な選択が必要なスキルは個別に扱う (draw, clone, quick, choice, metamorph等)
    if (skillId === 'metamorph') {
        // 全マスタカード（トークン含む）からランダムに1枚選択
        const randomMaster = CARD_MASTER[Math.floor(Math.random() * CARD_MASTER.length)];
        
        // 演出
        playSound(SOUNDS.seSkill);
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
        const choice = await waitSkillChoice(c.choices, o, c);
        if (choice) {
            // 選択されたスキルを再帰的に実行
            await resolveActiveSkillEffect(o, l, c, choice.id, choice.value);
        }
        return;
    }

    if (skillId === 'draw') {
        const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
        const count = skillValue || 1;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '入替', '#facc15');
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
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '攪乱', '#facc15');
        ['blue', 'red'].forEach(p => {
            const h = p === 'blue' ? GameState.playerHand : GameState.enemyHand;
            const g = p === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
            const d = p === 'blue' ? GameState.playerDeck : GameState.enemyDeck;
            
            // 手札・墓地をデッキに戻す
            while(h.length > 0) d.push(h.pop());
            while(g.length > 0) d.push(g.pop());
        });
        
        // 捨てた状態で一度待機する
        updateDeckDisplay('blue');
        updateDeckDisplay('red');
        renderHand();
        await sleep(1200);

        ['blue', 'red'].forEach(p => {
            const h = p === 'blue' ? GameState.playerHand : GameState.enemyHand;
            const d = p === 'blue' ? GameState.playerDeck : GameState.enemyDeck;

            // デッキを再シャッフル
            shuffleArray(d);
            
            // 互いに4枚引く
            for(let i = 0; i < 4; i++) {
                if (d.length > 0) {
                    const card = d.shift();
                    // 新しいUIDを割り当てる（同じカードが手元に戻ってきた時のKey重複エラーを防ぐため）
                    card.uid = `${p}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    h.push(card);
                }
            }
        });
        
        updateDeckDisplay('blue');
        updateDeckDisplay('red');
        renderHand();
        await sleep(600);
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
        const selectedLanes = await waitPlayerLaneSelection(count, o, simulatedToken, false);
        
        let events = [];
        for (let i = 0; i < selectedLanes.length; i++) {
            const targetLane = selectedLanes[i];
            const board = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
            const newToken = {
                id: `cl_${Date.now()}_${i}`,
                owner: o,
                ...tC,
                isPremium: (c.isPremium !== undefined) ? c.isPremium : GameState.premiumCards.includes(c.baseId || c.id),
                imgUrl: getCardImgUrl(c), // 本体の画像URLを確定させて焼き付ける
                filter: c.filter,
                power: c.power,
                currentPower: c.currentPower,
                rarity: c.rarity || 1,
                basePower: c.power,
                voiceCategory: c.voiceCategory,
                skills: JSON.parse(JSON.stringify(inheritedSkills)) // スキルを引き継ぐ
            };
            board[targetLane] = newToken;
            events.push({ type: 'summon_token', side: o, lane: targetLane, card: newToken, source: 'clone' });
        }
        await playEvents(events);

    } else if (skillId === 'quick') {
        await sleep(400); await executeSingleCombat(o, l);
    } else if (skillId === 'bind') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '拘束', '#facc15');
        const eB = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
        if (eB[l]) {
            eB[l].stunTurns = 2;
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
        const dmg = skillValue || 1;
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
        updateHPBar();
        checkWinCondition();
        await sleep(400);
    } else if (skillId === 'standby') {
        const turns = skillValue || 1;
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
            let selectedCard = null;
            if (o === 'red') {
                const sorted = [...validCards].sort((a, b) => b.power - a.power);
                selectedCard = sorted[0];
            } else {
                if (window.showDiscardSelectionModalReact) {
                    selectedCard = await new Promise(resolve => {
                        window.showDiscardSelectionModalReact(validCards, maxPow, (card) => resolve(card));
                    });
                } else {
                    selectedCard = validCards[0];
                }
            }
            
            if (selectedCard) {
                // 配置先を選ばせる
                const tLanes = await waitPlayerLaneSelection(1, o, selectedCard, false);
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
                    board[targetLane] = { ...selectedCard, id: `res_${Date.now()}` };
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

import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { MAX_HP } from '../utils/constants/config.js';
import { createDamagePopup, playSound, sleep } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { updateHPBar, updateSPOrbs, checkWinCondition, waitPlayerLaneSelection, waitPlayerEnemyLaneSelection, waitPlayerHandSelection, discardCard, cleanupDestroyedCards, drawCard, endTurnLogic } from './battle.js';
import { GameState } from './gameState.js';
import { updateCardDetail, renderHand, renderBoard } from './uiBattle.js';

// ==========================================
// リーダースキルの実行ロジック
// ==========================================

export async function activateLeaderSkill(owner, tokenLanes = null) {
    if (GameState.isBattleEnded) return;
    const isBlue = owner === 'blue';
    if (isBlue && (GameState.isProcessing || GameState.currentTurn !== 'player')) return;

    const sp = isBlue ? GameState.playerSP : GameState.enemySP;
    const config = isBlue ? GameState.playerConfig : GameState.enemyConfig;
    if (!config.leaderSkill.cost || sp < config.leaderSkill.cost) return;

    const prevProc = GameState.isProcessing;
    GameState.isProcessing = true;

    // SP消費
    if (isBlue) GameState.playerSP -= config.leaderSkill.cost;
    else GameState.enemySP -= config.leaderSkill.cost;
    updateSPOrbs(owner);

    // 演出
    playSound(SOUNDS.seLegend); 
    await showLeaderSkillCutin(config, isBlue, owner);

    // スキル効果の実行
    const action = config.leaderSkill.action;
    await executeLeaderSkillAction(owner, action, isBlue, config, tokenLanes);

    if (checkWinCondition()) return;

    // 盤面が一杯かつ手札も無空で、スキルも使えない場合のオートスキップ（プレイヤーのみ）
    // 手札がある場合は上書き配置が可能なため、勝手に終了させない
    if (isBlue && GameState.playerBoard.every(c => c !== null) && GameState.playerHand.length === 0 && (!GameState.playerConfig.leaderSkill.cost || GameState.playerSP < GameState.playerConfig.leaderSkill.cost)) {
        const st = document.getElementById('turn-status');
        st.innerText = "BOARD FULL - AUTO SKIP";
        st.style.color = "#94a3b8";
        GameState.isProcessing = true;
        setTimeout(() => {
            GameState.selectedCardIndex = null;
            updateCardDetail(null);
            renderHand();
            renderBoard();
            endTurnLogic('blue');
        }, 1500);
        return;
    }

    GameState.isProcessing = prevProc;
}

export async function showLeaderSkillCutin(config, isBlue, owner) {
    const cutin = document.getElementById('screen-cutin');
    const cImg = document.getElementById('cutin-char-img');
    const cTxt = document.getElementById('cutin-text');
    const cBg = document.getElementById('cutin-bg');

    if (config.image) {
        cImg.src = config.image;
    } else {
        cImg.removeAttribute('src');
    }
    cTxt.innerHTML = `${config.leaderSkill.name}!!`;

    if (isBlue) {
        cTxt.style.color = "#fff";
        cTxt.style.textShadow = "0 0 20px #38bdf8, 3px 3px 0 #000";
        cBg.style.background = "linear-gradient(90deg, transparent, #38bdf8, transparent)";
    } else {
        cTxt.style.color = "#ff0000";
        cTxt.style.textShadow = "0 0 20px #000, 3px 3px 0 #fff";
        cBg.style.background = "linear-gradient(90deg, transparent, #ef4444, transparent)";
    }

    cutin.style.display = 'flex';
    cImg.style.animation = 'none';
    cTxt.style.animation = 'none';
    cImg.offsetHeight; // リフロー強制
    cImg.style.animation = 'slideIn 2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards';
    cTxt.style.animation = 'textPop 2s ease forwards';

    const bId = owner === 'blue' ? 'player-speech' : 'enemy-speech';
    const b = document.getElementById(bId);
    if (b && config.dialogue.skill) {
        b.innerText = config.dialogue.skill;
        b.classList.add('active');
    }

    await sleep(2500);
    cutin.style.display = 'none';
    if (b) b.classList.remove('active');
}

export async function executeLeaderSkillAction(owner, action, isBlue, config, tokenLanes = null) {
    const board = isBlue ? GameState.playerBoard : GameState.enemyBoard;
    const eBoard = isBlue ? GameState.enemyBoard : GameState.playerBoard;
    const defO = isBlue ? 'red' : 'blue';
    const defS = isBlue ? 'enemy' : 'player';

    if (action === 'annihilation') {
        for (let i = 0; i < 3; i++) {
            if (eBoard[i]) {
                const t = document.querySelector(`#${defS}-lanes .cell[data-lane="${i}"] .card`);
                if (t) { createDamagePopup(t, '-4'); }
                eBoard[i].currentPower -= 4;
            }
        }
        renderBoard();
        playSound(SOUNDS.seDamage);
        await sleep(500);

        for (let i = 0; i < 3; i++) {
            if (eBoard[i] && eBoard[i].currentPower <= 0) {
            }
        }
        await cleanupDestroyedCards();
        renderBoard();
    } else if (action === 'satan_avatar' || action === 'dragon_summon') {
        const tS = CARD_MASTER.find(m => m.id === 'token_satan');
        const tI = CARD_MASTER.find(m => m.id === 'token_ignis');
        const token = action === 'satan_avatar' ? tS : tI;

        const selectedLanes = await waitPlayerLaneSelection(1, owner, token, true, tokenLanes);
        if (selectedLanes.length > 0) {
            const l = selectedLanes[0];
            board[l] = action === 'satan_avatar' ?
                { id: `tk_s_${Date.now()}`, owner, ...tS, imgUrl: CHARACTERS['satan'].image, filter: 'grayscale(1) brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(5)', currentPower: tS.power, rarity: tS.rarity || 1 } :
                { id: `tk_i_${Date.now()}`, owner, ...tI, imgUrl: CHARACTERS['dragon'].image, filter: 'none', currentPower: tI.power, rarity: tI.rarity || 1 };
            playSound(SOUNDS.sePlace);
            renderBoard();
            await sleep(500);
        }
    } else if (action === 'holy_march') {
        const tK = CARD_MASTER.find(m => m.id === 'token_soldier');
        const selectedLanes = await waitPlayerLaneSelection(2, owner, tK, true, tokenLanes);

        for (let l of selectedLanes) {
            board[l] = { id: `tk_k_${Date.now()}_${l}`, owner, ...tK, imgUrl: 'assets/cards/card_soldier.jpg', filter: 'none', currentPower: tK.power, rarity: tK.rarity || 1 };
        }
        if (selectedLanes.length > 0) {
            playSound(SOUNDS.sePlace);
            renderBoard();
            await sleep(400);
        }

        let bf = false;
        for (let i = 0; i < 3; i++) if (board[i]) {
            board[i].currentPower += 2;
            board[i].power += 2;
            const t = document.querySelector(`#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`);
            if (t) createDamagePopup(t, '+2', '#4ade80');
            bf = true;
        }
        if (bf) { renderBoard(); await sleep(500); }
    } else if (action === 'abyss_ritual') {
        const h = isBlue ? GameState.playerHand : GameState.enemyHand;
        let dc = 0;
        if (h.length > 0) {
            if (isBlue) {
                // プレイヤーは手動で0〜2枚選択
                const selectedIndices = await waitPlayerHandSelection(2, owner);
                if (selectedIndices.length > 0) {
                    selectedIndices.sort((a, b) => b - a);
                    for (let i of selectedIndices) {
                        await discardCard(owner, h.splice(i, 1)[0]);
                        dc++;
                    }
                }
            } else {
                // AIは自動でランダムなカードを最大2枚捨てる
                while (dc < 2 && h.length > 0) {
                    let rIdx = Math.floor(Math.random() * h.length);
                    await discardCard(owner, h.splice(rIdx, 1)[0]);
                    dc++;
                }
            }
            for (let i = 0; i < dc; i++) drawCard(owner);
        }
        h.forEach(c => {
            c.power += 1;
            c.currentPower += 1;
        });
        if (isBlue) renderHand();
        playSound(SOUNDS.seSkill);
        await sleep(500);
    } else if (action === 'dark_ritual') {
        const d = 2;
        playSound(SOUNDS.seDamage);
        if (isBlue) {
            GameState.enemyHP -= d;
            GameState.playerHP = Math.min(MAX_HP, GameState.playerHP + d);
            createDamagePopup(document.getElementById('enemy-hp-fill'), `-${d}`);
            createDamagePopup(document.getElementById('player-hp-fill'), `+${d}`, '#4ade80');
        } else {
            GameState.playerHP -= d;
            GameState.enemyHP = Math.min(MAX_HP, GameState.enemyHP + d);
            createDamagePopup(document.getElementById('player-hp-fill'), `-${d}`);
            createDamagePopup(document.getElementById('enemy-hp-fill'), `+${d}`, '#4ade80');
        }
        updateHPBar();
        await sleep(500);
    } else if (action === 'targeted_destruction') {
        const selectedLanes = await waitPlayerEnemyLaneSelection(1, owner);
        if (selectedLanes.length > 0) {
            const l = selectedLanes[0];
            const targetCell = document.querySelector(`#${isBlue ? 'enemy' : 'player'}-lanes .cell[data-lane="${l}"] .card`);
            if (targetCell) {
                createDamagePopup(targetCell, '破壊');
            }
            playSound(SOUNDS.seDamage);
            await sleep(500);
            eBoard[l].currentPower = 0; // 無条件破壊のため、パワーを0に設定してからクリーンアップを呼ぶ
            if (await cleanupDestroyedCards()) {
                // cleanup内で破壊音などは処理済み
            }
            renderBoard();
            await sleep(300);
        }
    } else if (action === 'devilhunter_resurrect') {
        const maxPow = 10;
        const discard = isBlue ? GameState.playerDiscard : GameState.enemyDiscard;
        const validCards = discard.filter(card => (card.power || 0) <= maxPow && !card.isToken);
        
        // 空きレーンを探す
        const emptyLanes = [];
        for (let i = 0; i < 3; i++) {
            if (!board[i]) emptyLanes.push(i);
        }

        if (validCards.length > 0 && emptyLanes.length > 0) {
            let selectedCard = null;
            if (!isBlue) {
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
                let targetLane = null;
                
                if (isBlue) {
                    const tLanes = await waitPlayerLaneSelection(1, 'blue', selectedCard, true);
                    if (tLanes && tLanes.length > 0) {
                        targetLane = tLanes[0];
                    }
                } else {
                    // AIはシミュレーション(ai_normal.js => waitPlayerLaneSelection => tokenLanes)で決めるが、
                    // 万が一引数がなければランダム空きレーンを保証
                    if (tokenLanes && tokenLanes.length > 0) {
                        targetLane = tokenLanes[0];
                    } else {
                        targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
                    }
                }
                
                if (targetLane !== null && targetLane !== undefined) {
                    // 墓地からの削除
                    const actualIdx = discard.indexOf(selectedCard);
                    if (actualIdx !== -1) discard.splice(actualIdx, 1);
                    if (typeof updateDeckDisplay === 'function') updateDeckDisplay(isBlue ? 'blue' : 'red');
                    
                    // 盤面への配置
                    board[targetLane] = { ...selectedCard, id: `res_${Date.now()}` };
                    board[targetLane].currentPower = board[targetLane].power;
                    board[targetLane].skillTriggered = true; // 召喚時効果は不発
                    board[targetLane].stunTurns = 0;
                    board[targetLane].stunAppliedThisTurn = false;
                    
                    if (typeof playSound === 'function') playSound(SOUNDS.sePlace);
                    if (typeof renderBoard === 'function') renderBoard();
                    
                    const cEl = document.querySelector(`#${isBlue ? 'player' : 'enemy'}-lanes .cell[data-lane="${targetLane}"] .card`);
                    if (cEl) {
                        cEl.classList.add('anim-card-play');
                        if (typeof createDamagePopup === 'function') createDamagePopup(cEl, '復活', '#4ade80');
                    }
                    if (typeof sleep === 'function') await sleep(500);
                }
            }
        }
    }
}

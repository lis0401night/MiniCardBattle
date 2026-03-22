import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { MAX_HP } from '../utils/constants/config.js';
import { createDamagePopup, playSound, sleep, getCardImgUrl } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { updateHPBar, updateSPOrbs, checkWinCondition, waitPlayerLaneSelection, waitPlayerEnemyLaneSelection, waitPlayerHandSelection, discardCard, cleanupDestroyedCards, drawCard, endTurnLogic, hasActiveSkill, resolveOnPlaySkill } from './battle.js';
import { GameState } from './gameState.js';
import { updateCardDetail, renderHand, renderBoard } from './uiBattle.js';
import { applyLeaderSkillLogic } from './engine.js';
import { playEvents } from './eventRenderer.js';

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
    if (window.showCutinReact) {
        window.showCutinReact(config, isBlue);
        const bId = owner === 'blue' ? 'player-speech' : 'enemy-speech';
        const b = document.getElementById(bId);
        if (b && config.dialogue.skill) {
            b.innerText = config.dialogue.skill;
            b.classList.add('active');
        }
        await sleep(2500);
        if (b) b.classList.remove('active');
        return;
    }

    const cutin = document.getElementById('screen-cutin');
    const cImg = document.getElementById('cutin-char-img');
    const cTxt = document.getElementById('cutin-text');
    const cBg = document.getElementById('cutin-bg');

    const imgSrc = isBlue ? getSkinImage(config, GameState.playerSkins[config.id], 'image') : config.image;

    if (imgSrc) {
        cImg.src = imgSrc;
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

    let events = [];

    // UIの介入（対象の選択等）が必要なスキルは事前に処理
    if (action === 'satan_avatar' || action === 'dragon_summon') {
        const tS = CARD_MASTER.find(m => m.id === 'token_satan');
        const tI = CARD_MASTER.find(m => m.id === 'token_ignis');
        const token = action === 'satan_avatar' ? tS : tI;
        const selectedLanes = await waitPlayerLaneSelection(1, owner, token, true, tokenLanes, false);
        if (selectedLanes.length === 0) return; // キャンセルされた場合
        tokenLanes = selectedLanes;
    } else if (action === 'dungeon_summon_leader') {
        const config = owner === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
        const b = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
        const tokenCard = CARD_MASTER.find(m => m.id === config.leaderCardId);
        const selectedLanes = await waitPlayerLaneSelection(1, owner, tokenCard, true, tokenLanes, false);
        if (selectedLanes.length === 0) return;
        if (selectedLanes.length > 0) {
            const l = selectedLanes[0];
            const imgUrl = getCardImgUrl(tokenCard) || `assets/cards/card_${tokenCard.id}.jpg`;
            if (b[l]) { await discardCard(owner, b[l], l); }
            b[l] = { id: `dng_tk_${Date.now()}`, owner, ...tokenCard, imgUrl, filter: 'none', currentPower: tokenCard.power, rarity: tokenCard.rarity || 1 };
            b[l].skillTriggered = false; // 召喚時スキルがあれば発動させるため
            
            // Add custom summon event to play correct standard visualizer pipeline
            events.push({ type: 'leader_skill', skill: action, side: owner });
            events.push({ type: 'summon_card', side: owner, lane: l, card: b[l], source: 'dungeon_summon_leader' });
        }
    } else if (action === 'holy_march') {
        const tK = CARD_MASTER.find(m => m.id === 'token_knight');
        const selectedLanes = await waitPlayerLaneSelection(2, owner, tK, true, tokenLanes, false);
        if (selectedLanes.length === 0) return;
        tokenLanes = selectedLanes;
    } else if (action === 'targeted_destruction') {
        if (!tokenLanes || tokenLanes.length === 0) {
            const selectedLanes = await waitPlayerEnemyLaneSelection(1, owner);
            if (selectedLanes.length === 0) return;
            tokenLanes = selectedLanes; // target_destruction においては tokenLanes に破壊対象レーン番号を入れることにする
        }
    } else if (action === 'devilhunter_resurrect') {
        const maxPow = 10;
        const discard = isBlue ? GameState.playerDiscard : GameState.enemyDiscard;
        const validCards = discard.filter(c => (c.power || 0) <= maxPow && !c.isToken);
        const board = isBlue ? GameState.playerBoard : GameState.enemyBoard;

        if (validCards.length > 0) {
            let selectedCard = null;
            if (!isBlue) {
                const sorted = [...validCards].sort((a, b) => b.power - a.power);
                selectedCard = sorted[0];
            } else {
                if (window.showDiscardSelectionModalReact) {
                    selectedCard = await new Promise(resolve => {
                        window.showDiscardSelectionModalReact(validCards, maxPow, (card) => resolve(card), { title: '復活させるカードを選択', desc: `パワー${maxPow}以下のカードを1枚場に出します。` });
                    });
                } else {
                    selectedCard = validCards[0];
                }
            }
            if (!selectedCard) return;

            // 復活させる対象を engine に伝えるために無理くり渡しちゃうか、UI介入でここまで決まったら
            // 配置レーンも決めます。
            const tLanes = await waitPlayerLaneSelection(1, owner, selectedCard, true, null, false);
            if (!tLanes || tLanes.length === 0) return;

            // Engine側へ伝えるための事前準備（引数だけでは足りないので、Engineが拾えるように選択カード情報を付与するか、ここでやってしまうか）
            // この蘇生アクションは UI 依存度が高すぎるため、蘇生処理の解決だけは部分的に残しつつ engineの枠組みに乗せる。
            // 状態への手動反映
            const actualIdx = discard.indexOf(selectedCard);
            if (actualIdx !== -1) discard.splice(actualIdx, 1);

            const targetLane = tLanes[0];
            const resurrectedCard = { 
                ...selectedCard, 
                id: `res_${Date.now()}`,
                baseId: selectedCard.baseId || selectedCard.id
            };
            resurrectedCard.currentPower = resurrectedCard.power;
            resurrectedCard.skillTriggered = true; // 召喚時効果は不発
            resurrectedCard.stunTurns = 0;
            resurrectedCard.stunAppliedThisTurn = false;
            board[targetLane] = resurrectedCard;

            events.push({ type: 'leader_skill', skill: action, side: owner });
            events.push({ type: 'summon_card', side: owner, lane: targetLane, card: resurrectedCard, source: 'devilhunter_resurrect' });
        } else {
            return; // 復活対象や空きがない
        }
    } else if (action === 'abyss_ritual') {
        // engineにabyss_ritualは未実装だったため、ここで同等に処理しeventsにプッシュします。
        const h = isBlue ? GameState.playerHand : GameState.enemyHand;
        let dc = 0;
        if (h.length > 0) {
            if (isBlue) {
                const selectedIndices = await waitPlayerHandSelection(2, owner);
                if (selectedIndices.length === 0) return; // 捨てない等キャンセル時
                if (selectedIndices.length > 0) {
                    selectedIndices.sort((a, b) => b - a);
                    for (let i of selectedIndices) {
                        await discardCard(owner, h.splice(i, 1)[0]);
                        dc++;
                    }
                }
            } else {
                while (dc < 2 && h.length > 0) {
                    let rIdx = Math.floor(Math.random() * h.length);
                    await discardCard(owner, h.splice(rIdx, 1)[0]);
                    dc++;
                }
            }
            for (let i = 0; i < dc; i++) drawCard(owner);
        }

        events.push({ type: 'leader_skill', skill: action, side: owner });
        h.forEach(c => {
            c.power += 1;
            c.currentPower += 1;
        });
        if (isBlue) renderHand();
        playSound(SOUNDS.seSkill);
        await sleep(500);
        return; // Engineに移譲せずここで完了とする（手札操作のUI依存度が強いため）
    }

    // Engineの共通ロジック呼び出し
    // 上のif文でeventsを手動構築したもの (abyss_ritual, devilhunter_resurrect, dungeon_summon_leader) 以外を実行
    if (action !== 'devilhunter_resurrect' && action !== 'abyss_ritual' && action !== 'dungeon_summon_leader') {
        // targeted_destruction のためだけに Engine 側を少し書き換える必要があるので、シミュレートできるように引数 tokenLanes に対象レーンを渡す
        // が、Engineを再書き換えするよりは、直接ここから applyLeaderSkillLogic を呼ぶ
        applyLeaderSkillLogic(currentState, owner, action, tokenLanes, events);
    }

    // イベントログを再生（再生中にGameStateと描画が逐次更新される）
    await playEvents(events);

    // 再描画
    renderBoard();

    // 召喚時スキル（アクティブスキル）を持つカードが今回召喚されていた場合、事後発動する
    const targetBoard = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    for (let i = 0; i < 3; i++) {
        const cd = targetBoard[i];
        if (cd && cd.skillTriggered === false) {
            if (hasActiveSkill(cd)) {
                await resolveOnPlaySkill(owner, i, cd);
            } else {
                cd.skillTriggered = true;
            }
        }
    }
}

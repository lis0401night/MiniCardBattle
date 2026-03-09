// ==========================================
// リーダースキルの実行ロジック
// ==========================================

async function activateLeaderSkill(owner) {
    if (isBattleEnded) return;
    const isBlue = owner === 'blue';
    if (isBlue && (isProcessing || document.getElementById('turn-status').innerText !== "YOUR TURN")) return;

    const sp = isBlue ? playerSP : enemySP;
    const config = isBlue ? playerConfig : enemyConfig;
    if (!config.leaderSkill.cost || sp < config.leaderSkill.cost) return;

    const prevProc = isProcessing;
    isProcessing = true;

    // SP消費
    if (isBlue) playerSP -= config.leaderSkill.cost;
    else enemySP -= config.leaderSkill.cost;
    updateSPOrbs(owner);

    // 演出
    playSound(SOUNDS.seLegend);
    await showLeaderSkillCutin(config, isBlue, owner);

    // スキル効果の実行
    const action = config.leaderSkill.action;
    await executeLeaderSkillAction(owner, action, isBlue, config);

    if (checkWinCondition()) return;

    // 盤面が一杯かつ手札も無空で、スキルも使えない場合のオートスキップ（プレイヤーのみ）
    // 手札がある場合は上書き配置が可能なため、勝手に終了させない
    if (isBlue && playerBoard.every(c => c !== null) && playerHand.length === 0 && (!playerConfig.leaderSkill.cost || playerSP < playerConfig.leaderSkill.cost)) {
        const st = document.getElementById('turn-status');
        st.innerText = "BOARD FULL - AUTO SKIP";
        st.style.color = "#94a3b8";
        isProcessing = true;
        setTimeout(() => {
            selectedCardIndex = null;
            updateCardDetail(null);
            renderHand();
            renderBoard();
            endTurnLogic('blue');
        }, 1500);
        return;
    }

    isProcessing = prevProc;
}

async function showLeaderSkillCutin(config, isBlue, owner) {
    const cutin = document.getElementById('screen-cutin');
    const cImg = document.getElementById('cutin-char-img');
    const cTxt = document.getElementById('cutin-text');
    const cBg = document.getElementById('cutin-bg');

    cImg.src = config.image;
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

async function executeLeaderSkillAction(owner, action, isBlue, config) {
    const board = isBlue ? playerBoard : enemyBoard;
    const eBoard = isBlue ? enemyBoard : playerBoard;
    const defO = isBlue ? 'red' : 'blue';
    const defS = isBlue ? 'enemy' : 'player';

    if (action === 'annihilation') {
        for (let i = 0; i < 3; i++) {
            if (eBoard[i]) {
                const t = document.querySelector(`#${defS}-lanes .cell[data-lane="${i}"] .card`);
                if (t) { t.classList.add('anim-shake'); createDamagePopup(t, '-4'); }
                eBoard[i].currentPower -= 4;
            }
        }
        renderBoard();
        playSound(SOUNDS.seDamage);
        await sleep(500);

        for (let i = 0; i < 3; i++) {
            if (eBoard[i] && eBoard[i].currentPower <= 0) {
                if (!discardCard(defO, eBoard[i], i)) eBoard[i] = null;
                playSound(SOUNDS.seDestroy);
            }
        }
        renderBoard();
    } else if (action === 'satan_avatar' || action === 'dragon_summon') {
        const tS = CARD_MASTER.find(m => m.id === 'token_satan');
        const tI = CARD_MASTER.find(m => m.id === 'token_ignis');
        const token = action === 'satan_avatar' ? tS : tI;

        const selectedLanes = await waitPlayerLaneSelection(1, owner, token, true);
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
        const selectedLanes = await waitPlayerLaneSelection(2, owner, tK, true);

        for (let l of selectedLanes) {
            board[l] = { id: `tk_k_${Date.now()}_${l}`, owner, ...tK, imgUrl: 'assets/card_soldier.jpg', filter: 'none', currentPower: tK.power, rarity: tK.rarity || 1 };
        }
        if (selectedLanes.length > 0) {
            playSound(SOUNDS.sePlace);
            renderBoard();
            await sleep(400);
        }

        let bf = false;
        for (let i = 0; i < 3; i++) if (board[i]) {
            board[i].currentPower += 3;
            board[i].power += 3;
            const t = document.querySelector(`#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`);
            if (t) createDamagePopup(t, '+3', '#4ade80');
            bf = true;
        }
        if (bf) { renderBoard(); await sleep(500); }
    } else if (action === 'abyss_ritual') {
        const h = isBlue ? playerHand : enemyHand;
        if (h.length > 0) {
            let dc = 0;
            while (dc < 2 && h.length > 0) {
                let mp = Math.min(...h.map(c => c.power)), mi = h.findIndex(c => c.power === mp);
                discardCard(owner, h.splice(mi, 1)[0]);
                dc++;
            }
            for (let i = 0; i < dc; i++) drawCard(owner);
        }
        h.forEach(c => {
            c.power += 2;
            c.currentPower += 2;
        });
        if (isBlue) renderHand();
        playSound(SOUNDS.seSkill);
        await sleep(500);
    } else if (action === 'dark_ritual') {
        const d = 3;
        playSound(SOUNDS.seDamage);
        if (isBlue) {
            enemyHP -= d;
            playerHP = Math.min(MAX_HP, playerHP + d);
            createDamagePopup(document.getElementById('enemy-hp-fill'), `-${d}`);
            createDamagePopup(document.getElementById('player-hp-fill'), `+${d}`, '#4ade80');
        } else {
            playerHP -= d;
            enemyHP = Math.min(MAX_HP, enemyHP + d);
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
                targetCell.classList.add('anim-shake');
                createDamagePopup(targetCell, 'DESTORY');
            }
            playSound(SOUNDS.seDamage);
            await sleep(500);
            if (!discardCard(defO, eBoard[l], l)) eBoard[l] = null;
            playSound(SOUNDS.seDestroy);
            renderBoard();
            await sleep(300);
        }
    }
}

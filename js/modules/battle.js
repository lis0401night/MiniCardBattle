// ==========================================
// バトル進行とスキルロジック
// ==========================================

function prepareBattle() {
    switchScreen('screen-loading');
    const sessionId = Date.now();
    playerDeck = generateDeck('blue', playerConfig, sessionId);
    enemyDeck = generateDeck('red', enemyConfig, sessionId);
    const allCards = [...playerDeck, ...enemyDeck];
    let loaded = 0;
    const finishLoading = () => setTimeout(initBattleState, 500);
    const updateProgress = () => {
        loaded++;
        document.getElementById('loading-text').innerText = `Generating Cards... ${Math.floor((loaded / allCards.length) * 100)}%`;
        if (loaded === allCards.length) finishLoading();
    };
    if (allCards.length === 0) finishLoading();
    allCards.forEach(card => {
        const img = new Image();
        img.onload = updateProgress; img.onerror = updateProgress;
        img.src = card.imgUrl;
    });
}

function initBattleState() {
    stopSound(SOUNDS.bgmTitle); stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle);
    if (gameMode === 'story' && enemyConfig.id === 'satan') playSound(SOUNDS.bgmLastBattle);
    else playSound(SOUNDS.bgmBattle);
    playerHP = MAX_HP; enemyHP = MAX_HP; playerSP = 0; enemySP = 0;
    playerHand = []; enemyHand = []; playerDiscard = []; enemyDiscard = [];
    playerBoard = [null, null, null]; enemyBoard = [null, null, null];
    isProcessing = false; selectedCardIndex = null; isBattleEnded = false; updateCardDetail(null);
    document.getElementById('player-icon').src = playerConfig.icon;
    document.getElementById('enemy-icon').src = enemyConfig.icon;
    document.getElementById('player-name').innerText = playerConfig.name;
    document.getElementById('enemy-name').innerText = enemyConfig.name;

    // 敵アイコンのフィルタ処理（シャドウ対応）
    const enemyIconImg = document.getElementById('enemy-icon');
    enemyIconImg.src = enemyConfig.icon;
    if (enemyConfig.isShadow) {
        enemyIconImg.style.filter = 'grayscale(1) brightness(0.6) contrast(1.2)';
    } else {
        enemyIconImg.style.filter = 'none';
    }

    const bs = document.getElementById('screen-battle');
    bs.style.backgroundColor = '#0f172a';
    const stageId = (gameMode === 'story') ? (enemyConfig.stageId || 'android') : (selectedStageId || 'android');
    bs.style.backgroundImage = `url('assets/background_${stageId}.png')`;
    updateHPBar(); updateSPOrbs('blue'); updateSPOrbs('red'); renderBoard();
    for (let i = 0; i < 5; i++) { drawCard('blue'); drawCard('red'); }
    switchScreen('screen-battle'); startTurn('blue');
}

function updateHPBar() {
    document.getElementById('player-hp-fill').style.width = `${Math.max(0, (playerHP / MAX_HP) * 100)}%`;
    document.getElementById('player-hp-text').innerText = `${Math.max(0, playerHP)} / ${MAX_HP}`;
    document.getElementById('enemy-hp-fill').style.width = `${Math.max(0, (enemyHP / MAX_HP) * 100)}%`;
    document.getElementById('enemy-hp-text').innerText = `${Math.max(0, enemyHP)} / ${MAX_HP}`;
}

function updateSPOrbs(owner) {
    const sp = owner === 'blue' ? playerSP : enemySP;
    const config = owner === 'blue' ? playerConfig : enemyConfig;
    const cost = config.leaderSkill.cost;
    const container = document.getElementById(owner === 'blue' ? 'player-sp-orbs' : 'enemy-sp-orbs');
    if (!container || !cost) { if (container) container.style.display = 'none'; return; }
    container.style.display = 'flex'; container.innerHTML = '';
    for (let i = 0; i < cost; i++) {
        const orb = document.createElement('div');
        orb.className = 'orb' + (i < sp ? ' filled' : '');
        container.appendChild(orb);
    }
    if (owner === 'blue') {
        const btn = document.getElementById('btn-leader-skill');
        if (btn) sp >= cost ? btn.classList.add('ready') : btn.classList.remove('ready');
    }
}

function checkWinCondition() {
    if ((playerHP <= 0 || enemyHP <= 0) && !isBattleEnded) {
        isBattleEnded = true;
        triggerFinishVisuals();
        setTimeout(endBattle, 2000);
        return true;
    }
    return false;
}

function triggerFinishVisuals() {
    // 画面全体のスローモーションと揺れ
    document.body.classList.add('slow-motion');
    document.body.classList.add('anim-mega-shake');
    playSound(SOUNDS.seDamage); // 重厚な音（既存のSEを流用）

    setTimeout(() => {
        document.body.classList.remove('anim-mega-shake');
    }, 1000);
}

function showSpeechBubble(target) {
    const config = target === 'blue' ? playerConfig : enemyConfig;
    let phrases = config.dialogue.damage;

    // シャドウ（ドッペルゲンガー）は無言
    if (target === 'red' && enemyConfig.isShadow) {
        phrases = ['・・・・'];
    }

    const bubble = document.getElementById(target === 'blue' ? 'player-speech' : 'enemy-speech');
    if (bubble) {
        bubble.innerText = phrases[Math.floor(Math.random() * phrases.length)];
        bubble.classList.add('active'); setTimeout(() => bubble.classList.remove('active'), 1500);
    }
}

function showSkillConfirm() {
    if (isProcessing || isBattleEnded || document.getElementById('turn-status').innerText !== "YOUR TURN") return;
    playSound(SOUNDS.seClick);
    const s = playerConfig.leaderSkill; if (!s.cost) return;
    document.getElementById('skill-confirm-name').innerText = s.name;
    document.getElementById('skill-confirm-desc').innerText = s.desc;
    const st = document.getElementById('skill-confirm-status');
    const ex = document.getElementById('btn-execute-skill');
    if (playerSP >= s.cost) { st.innerText = "発動可能です！"; st.style.color = "#4ade80"; ex.style.display = "block"; }
    else { st.innerText = `発動まであと ${s.cost - playerSP} SP`; st.style.color = "#f87171"; ex.style.display = "none"; }
    document.getElementById('screen-skill-confirm').style.display = 'flex';
}

function showEnemySkillConfirm() {
    playSound(SOUNDS.seClick);
    const s = enemyConfig.leaderSkill;
    document.getElementById('skill-confirm-name').innerText = s.name;
    document.getElementById('skill-confirm-desc').innerText = s.desc;
    const st = document.getElementById('skill-confirm-status');
    const ex = document.getElementById('btn-execute-skill');
    if (!s.cost) { st.innerText = "パッシブスキル（常に発動）"; st.style.color = "#4ade80"; }
    else {
        const r = Math.max(0, s.cost - enemySP);
        if (r === 0) { st.innerText = "発動可能状態です！注意！"; st.style.color = "#ef4444"; }
        else { st.innerText = `発動まであと ${r} SP`; st.style.color = "#f87171"; }
    }
    ex.style.display = "none"; document.getElementById('screen-skill-confirm').style.display = 'flex';
}

function closeSkillConfirm() { playSound(SOUNDS.seClick); document.getElementById('screen-skill-confirm').style.display = 'none'; }
function executeSkillFromConfirm() { closeSkillConfirm(); activateLeaderSkill('blue'); }

async function activateLeaderSkill(owner) {
    if (isBattleEnded) return;
    const isBlue = owner === 'blue';
    if (isBlue && (isProcessing || document.getElementById('turn-status').innerText !== "YOUR TURN")) return;
    const sp = isBlue ? playerSP : enemySP;
    const config = isBlue ? playerConfig : enemyConfig;
    if (!config.leaderSkill.cost || sp < config.leaderSkill.cost) return;
    const prevProc = isProcessing; isProcessing = true;
    if (isBlue) playerSP -= config.leaderSkill.cost; else enemySP -= config.leaderSkill.cost;
    updateSPOrbs(owner); playSound(SOUNDS.seLegend);
    const cutin = document.getElementById('screen-cutin');
    const cImg = document.getElementById('cutin-char-img');
    const cTxt = document.getElementById('cutin-text');
    const cBg = document.getElementById('cutin-bg');
    cImg.src = config.image; cTxt.innerHTML = `${config.leaderSkill.name}!!`;
    if (isBlue) { cTxt.style.color = "#fff"; cTxt.style.textShadow = "0 0 20px #38bdf8, 3px 3px 0 #000"; cBg.style.background = "linear-gradient(90deg, transparent, #38bdf8, transparent)"; }
    else { cTxt.style.color = "#ff0000"; cTxt.style.textShadow = "0 0 20px #000, 3px 3px 0 #fff"; cBg.style.background = "linear-gradient(90deg, transparent, #ef4444, transparent)"; }
    cutin.style.display = 'flex'; cImg.style.animation = 'none'; cTxt.style.animation = 'none'; cImg.offsetHeight;
    cImg.style.animation = 'slideIn 2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards';
    cTxt.style.animation = 'textPop 2s ease forwards';
    const bId = owner === 'blue' ? 'player-speech' : 'enemy-speech';
    const b = document.getElementById(bId);
    if (b && config.dialogue.skill) { b.innerText = config.dialogue.skill; b.classList.add('active'); }
    await sleep(2500); cutin.style.display = 'none'; if (b) b.classList.remove('active');
    const action = config.leaderSkill.action;
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
        renderBoard(); playSound(SOUNDS.seDamage); await sleep(500);
        for (let i = 0; i < 3; i++) if (eBoard[i] && eBoard[i].currentPower <= 0) { discardCard(defO, eBoard[i]); eBoard[i] = null; playSound(SOUNDS.seDestroy); }
        renderBoard();
    } else if (action === 'satan_avatar' || action === 'dragon_summon') {
        const emp = board.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
        if (emp.length > 0) {
            const l = emp[Math.floor(Math.random() * emp.length)];
            board[l] = action === 'satan_avatar' ? { id: `tk_s_${Date.now()}`, owner, imgUrl: CHARACTERS['satan'].image, filter: 'grayscale(1) brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(5)', power: 10, currentPower: 10, skill: 'token_satan', isToken: true } : { id: `tk_i_${Date.now()}`, owner, imgUrl: CHARACTERS['dragon'].image, filter: 'none', power: 7, currentPower: 7, skill: 'token_ignis', isToken: true };
            playSound(SOUNDS.sePlace); renderBoard(); await sleep(500);
        }
    } else if (action === 'holy_march') {
        let sc = 0;
        for (let i = 0; i < 3; i++) if (board[i] === null && sc < 2) { board[i] = { id: `tk_k_${Date.now()}_${i}`, owner, imgUrl: 'assets/card_knight.png', filter: 'none', power: 1, currentPower: 1, skill: 'token_knight', isToken: true }; sc++; }
        if (sc > 0) { playSound(SOUNDS.sePlace); renderBoard(); await sleep(400); }
        let bf = false;
        for (let i = 0; i < 3; i++) if (board[i]) {
            board[i].currentPower += 3; board[i].power += 3;
            const t = document.querySelector(`#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`);
            if (t) createDamagePopup(t, '+3', '#4ade80'); bf = true;
        }
        if (bf) { renderBoard(); await sleep(500); }
    } else if (action === 'abyss_ritual') {
        const h = isBlue ? playerHand : enemyHand;
        if (h.length > 0) {
            let dc = 0; while (dc < 2 && h.length > 0) { let mp = Math.min(...h.map(c => c.power)), mi = h.findIndex(c => c.power === mp); discardCard(owner, h.splice(mi, 1)[0]); dc++; }
            for (let i = 0; i < dc; i++) drawCard(owner);
        }
        h.forEach(c => { c.power += 2; c.currentPower += 2; }); if (isBlue) renderHand();
        playSound(SOUNDS.seSkill); await sleep(500);
    }
    if (checkWinCondition()) return;
    if (isBlue && playerBoard.every(c => c !== null) && (!playerConfig.leaderSkill.cost || playerSP < playerConfig.leaderSkill.cost)) {
        const st = document.getElementById('turn-status'); st.innerText = "BOARD FULL - AUTO SKIP"; st.style.color = "#94a3b8";
        isProcessing = true; setTimeout(() => { selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard(); endTurnLogic('blue'); }, 1500);
        return;
    }
    isProcessing = prevProc;
}

function discardCard(owner, card) { if (card.isToken) return; if ('basePower' in card) { card.power = card.basePower; } card.currentPower = card.power; (owner === 'blue' ? playerDiscard : enemyDiscard).push(card); }
function drawCard(owner) {
    let d = owner === 'blue' ? playerDeck : enemyDeck, h = owner === 'blue' ? playerHand : enemyHand, ds = owner === 'blue' ? playerDiscard : enemyDiscard;
    if (d.length === 0 && ds.length > 0) {
        d.push(...ds.sort(() => Math.random() - 0.5));
        ds.length = 0;
        playSound(SOUNDS.seSkill);
        createDamagePopup(document.getElementById(owner === 'blue' ? 'player-hp-fill' : 'enemy-hp-fill'), 'RELOAD', '#38bdf8');
        showDeckRefreshEffect(owner);
    }
    if (d.length > 0 && h.length < 5) h.push(d.pop());
    if (owner === 'blue') { document.getElementById('deck-info').innerText = `Deck: ${playerDeck.length} / Drop: ${playerDiscard.length}`; renderHand(); }
}

async function startTurn(owner) {
    if (isBattleEnded) return; isProcessing = true;
    const s = document.getElementById('turn-status'); s.innerText = owner === 'blue' ? "YOUR TURN" : "ENEMY TURN"; s.style.color = owner === 'blue' ? "var(--color-blue)" : "var(--color-red)";
    const c = owner === 'blue' ? playerConfig : enemyConfig;
    if (c.leaderSkill.cost) { if (owner === 'blue') playerSP = Math.min(c.leaderSkill.cost, playerSP + 1); else enemySP = Math.min(c.leaderSkill.cost, enemySP + 1); }
    updateSPOrbs(owner); if ((owner === 'blue' ? playerBoard : enemyBoard).some(x => x !== null)) { await executeCombatPhase(owner); if (checkWinCondition()) return; }
    drawCard(owner);
    if (owner === 'blue') {
        selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard();
        if (playerBoard.every(x => x !== null) && (!playerConfig.leaderSkill.cost || playerSP < playerConfig.leaderSkill.cost)) {
            s.innerText = "BOARD FULL - AUTO SKIP"; s.style.color = "#94a3b8"; await sleep(1500); endTurnLogic('blue');
        } else isProcessing = false;
    } else { await sleep(500); await executeEnemyAI(); }
}

async function endPlayerTurn() {
    if (isProcessing) return; isProcessing = true;
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
    selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard(); endTurnLogic('blue');
}

function endTurnLogic(o) { if (!isBattleEnded) startTurn(o === 'blue' ? 'red' : 'blue'); }



async function playCard(o, hI, l) {
    const h = o === 'blue' ? playerHand : enemyHand, b = o === 'blue' ? playerBoard : enemyBoard;
    b[l] = h.splice(hI, 1)[0]; playSound(SOUNDS.sePlace); renderHand(); renderBoard();
    const c = b[l]; if (c.skill !== 'none' && !['deadly', 'defender', 'soul_bind', 'sturdy'].includes(c.skill)) await resolveOnPlaySkill(o, l, c);
}

async function resolveOnPlaySkill(o, l, c) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    if (!cEl) return;
    const h = o === 'blue' ? playerHand : enemyHand, b = o === 'blue' ? playerBoard : enemyBoard, eB = o === 'blue' ? enemyBoard : playerBoard, dO = o === 'blue' ? 'red' : 'blue', dS = o === 'blue' ? 'enemy' : 'player';
    if (c.skill === 'draw') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'REPLACE', '#facc15');
        if (h.length > 0) { let mp = Math.min(...h.map(x => x.power)), dc = 0; for (let i = h.length - 1; i >= 0; i--) if (h[i].power === mp) { discardCard(o, h.splice(i, 1)[0]); dc++; } for (let i = 0; i < dc; i++) drawCard(o); }
        else drawCard(o);
        await sleep(500);
    } else if (c.skill === 'heal') {
        const val = c.skillValue || 3;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, `+${val} HP`, '#4ade80');
        if (o === 'blue') playerHP = Math.min(MAX_HP, playerHP + val); else enemyHP = Math.min(MAX_HP, enemyHP + val); updateHPBar(); await sleep(500);
    } else if (c.skill === 'snipe') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SNIPE', '#facc15');
        const ts = eB.map((x, i) => x ? i : -1).filter(i => i !== -1);
        if (ts.length > 0) {
            let mL = ts[0]; for (let i of ts) if (eB[i].currentPower > eB[mL].currentPower) mL = i;
            const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${mL}"] .card`);
            const val = c.skillValue || 4;
            if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, `-${val}`, '#ef4444'); }
            playSound(SOUNDS.seDamage); eB[mL].currentPower -= val; renderBoard(); await sleep(500);
            if (eB[mL].currentPower <= 0) { discardCard(dO, eB[mL]); eB[mL] = null; playSound(SOUNDS.seDestroy); renderBoard(); }
        }
    } else if (c.skill === 'spread') {
        const val = c.skillValue || 2;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SPREAD', '#facc15'); let hit = false;
        for (let i = 0; i < 3; i++) if (eB[i]) { const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${i}"] .card`); if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, `-${val}`, '#ef4444'); } eB[i].currentPower -= val; hit = true; }
        if (hit) { renderBoard(); playSound(SOUNDS.seDamage); await sleep(500); for (let i = 0; i < 3; i++) if (eB[i] && eB[i].currentPower <= 0) { discardCard(dO, eB[i]); eB[i] = null; playSound(SOUNDS.seDestroy); } renderBoard(); }
    } else if (c.skill === 'copy') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'COPY', '#facc15');
        let mP = -1; for (let i = 0; i < 3; i++) if (i !== l && b[i] && b[i].currentPower > mP) mP = b[i].currentPower;
        if (mP > 0) { c.power = mP; c.currentPower = mP; createDamagePopup(cEl, `P=${mP}`, '#4ade80'); renderBoard(); } await sleep(500);
    } else if (c.skill === 'support') {
        const val = c.skillValue || 2;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SUPPORT', '#facc15'); let s = false;
        for (let i = 0; i < 3; i++) if (i !== l && b[i]) { b[i].currentPower += val; const tEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`); if (tEl) createDamagePopup(tEl, `+${val}`, '#4ade80'); s = true; }
        if (s) { renderBoard(); await sleep(500); }
    } else if (c.skill === 'clone') {
        const count = c.skillValue || 1;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'CLONE', '#facc15');
        for (let j = 0; j < count; j++) {
            const emp = b.map((x, i) => x === null ? i : -1).filter(i => i !== -1);
            if (emp.length > 0) {
                const tL = emp[Math.floor(Math.random() * emp.length)];
                b[tL] = {
                    id: `cl_${Date.now()}_${j}`,
                    owner: o,
                    imgUrl: c.imgUrl,
                    filter: c.filter,
                    power: c.power,
                    currentPower: c.currentPower,
                    skill: 'none',
                    isToken: true
                };
                renderBoard();
                await sleep(300);
            }
        }
    } else if (c.skill === 'lone_wolf') {
        playSound(SOUNDS.seSkill); const e = b.filter(x => x === null).length;
        const val = c.skillValue || 3;
        if (e * val > 0) { c.power += e * val; c.currentPower += e * val; createDamagePopup(cEl, `+${e * val}`, '#4ade80'); renderBoard(); }
        else createDamagePopup(cEl, `+0`, '#94a3b8'); await sleep(500);
    } else if (c.skill === 'quick') { playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'QUICK', '#facc15'); await sleep(400); await executeSingleCombat(o, l); }
}

async function executeSingleCombat(atk, l) {
    const aB = atk === 'blue' ? playerBoard : enemyBoard, dB = atk === 'blue' ? enemyBoard : playerBoard, aR = atk === 'blue' ? '#player-lanes' : '#enemy-lanes', dR = atk === 'blue' ? '#enemy-lanes' : '#player-lanes', an = atk === 'blue' ? 'anim-attack-up' : 'anim-attack-down';
    const aC = aB[l]; if (!aC || aC.skill === 'defender') return;
    const aE = document.querySelector(`${aR} .cell[data-lane="${l}"] .card`); if (!aE) return;
    aE.classList.add(an); playSound(SOUNDS.seAttack); await sleep(300);
    if (dB[l]) {
        let dDef = aC.currentPower, dAtk = dB[l].currentPower;
        if (dB[l].skill === 'sturdy') dDef = Math.floor(dDef / 2); if (aC.skill === 'sturdy') dAtk = Math.floor(dAtk / 2);
        dB[l].currentPower -= dDef; if (dB[l].skill !== 'defender') aC.currentPower -= dAtk;
        const dE = document.querySelector(`${dR} .cell[data-lane="${l}"] .card`); if (dE) dE.classList.add('anim-shake');
        playSound(SOUNDS.seDamage); createDamagePopup(dE, `-${dDef}`); if (dB[l].skill !== 'defender') createDamagePopup(aE, `-${dAtk}`);
        renderBoard(); await sleep(400);
        if (aC.skill === 'deadly') dB[l].currentPower = 0; if (dB[l].skill === 'deadly') aC.currentPower = 0;
        let aD = aC.currentPower <= 0, dD = dB[l].currentPower <= 0, tr = false;
        if (dD && !aD && aC.skill === 'soul_bind') { const val = aC.skillValue || 2; aC.currentPower += val; aC.power += val; createDamagePopup(aE, `+${val}`, '#4ade80'); tr = true; }
        if (aD && !dD && dB[l].skill === 'soul_bind') { const val = dB[l].skillValue || 2; dB[l].currentPower += val; dB[l].power += val; createDamagePopup(dE, `+${val}`, '#4ade80'); tr = true; }
        if (tr) { playSound(SOUNDS.seSkill); renderBoard(); await sleep(300); }
        if (aD) { discardCard(atk, aC); aB[l] = null; } if (dD) { discardCard(atk === 'blue' ? 'red' : 'blue', dB[l]); dB[l] = null; }
        if (aD || dD) playSound(SOUNDS.seDestroy);
    } else {
        const d = aC.currentPower; playSound(SOUNDS.seDamage); document.body.classList.add('anim-shake');
        if (atk === 'blue') { enemyHP -= d; createDamagePopup(document.getElementById('enemy-hp-fill'), `-${d}`); showSpeechBubble('red'); }
        else { playerHP -= d; createDamagePopup(document.getElementById('player-hp-fill'), `-${d}`); showSpeechBubble('blue'); }
        updateHPBar(); if (checkWinCondition()) return; await sleep(400); document.body.classList.remove('anim-shake');
    }
    if (aE) aE.classList.remove(an); renderBoard();
}

async function executeCombatPhase(atk) {
    const b = atk === 'blue' ? playerBoard : enemyBoard;
    for (let i = 0; i < 3; i++) if (b[i]) {
        await executeSingleCombat(atk, i);
        if (isBattleEnded) break;
        await sleep(200);
    }
}

function endBattle() {
    document.body.classList.remove('slow-motion');
    stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle);
    lastBattleResult = playerHP > 0 ? (enemyHP <= 0 ? 'win' : 'draw') : (enemyHP > 0 ? 'lose' : 'draw');
    const t = document.getElementById('turn-status'); t.innerText = lastBattleResult === 'win' ? "YOU WIN!" : (lastBattleResult === 'lose' ? "YOU LOSE..." : "DRAW");
    t.style.color = lastBattleResult === 'win' ? "#facc15" : "#fff";
    setTimeout(() => {
        playSound(SOUNDS.bgmTitle); appState = 'post_dialogue';
        if (lastBattleResult === 'win') { dialogueQueue = [{ speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'lose') }, { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'win') }]; }
        else dialogueQueue = [{ speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'lose') }, { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'win') }];
        setupDialogueScreen();
    }, 1500);
}

function returnToTitle() {
    showConfirmModal('バトルを諦めてタイトルに戻りますか？', () => {
        stopSound(SOUNDS.bgmBattle);
        stopSound(SOUNDS.bgmLastBattle);
        playSound(SOUNDS.bgmTitle);
        appState = 'title';
        isProcessing = false;
        switchScreen('screen-mode-select');
    });
}

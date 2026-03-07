// ==========================================
// グローバルステート
// ==========================================
let gameMode = 'story'; 
let aiLevel = 1; 
let playerConfig = null;
let enemyConfig = null;
let appState = 'title'; 
let enemyQueue = [];
let battleCount = 1;
let dialogueQueue = [];
let currentDialogueIndex = 0;
let lastBattleResult = '';

let playerHP = MAX_HP, enemyHP = MAX_HP;
let playerSP = 0, enemySP = 0;

let playerDeck = [], enemyDeck = [];
let playerHand = [], enemyHand = [];
let playerDiscard = [], enemyDiscard = [];
let playerBoard = [null, null, null];
let enemyBoard = [null, null, null];

let selectedCardIndex = null; 
let isProcessing = false;
let isBattleEnded = false;
let pendingCharId = null;

// ==========================================
// 画面遷移・初期化
// ==========================================
function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

function goToModeSelect() {
    playSound(SOUNDS.seClick);
    playSound(SOUNDS.bgmTitle);
    switchScreen('screen-mode-select');
}

function showRules() {
    playSound(SOUNDS.seClick);
    switchScreen('screen-rules');
}

function startGameMode(mode) {
    playSound(SOUNDS.seClick);
    gameMode = mode;
    document.getElementById('select-title').innerText = "Select Your Character";
    appState = 'select_player';
    initSelectScreen(false);
    switchScreen('screen-select');
}

function initSelectScreen(includeSatan) {
    const grid = document.getElementById('char-grid');
    grid.innerHTML = '';
    Object.values(CHARACTERS).forEach(char => {
        if (!includeSatan && char.id === 'satan') return;
        const el = document.createElement('div');
        el.className = 'char-card';
        el.style.backgroundImage = `url('${char.image}')`;
        el.innerHTML = `<div class="char-name" style="color:${char.color}">${char.name}</div>`;
        el.onclick = () => showCharDetail(char.id);
        grid.appendChild(el);
    });
}

function showCharDetail(charId) {
    playSound(SOUNDS.seClick);
    pendingCharId = charId;
    const char = CHARACTERS[charId];
    
    document.getElementById('detail-char-img').src = char.image;
    document.getElementById('detail-char-name').innerText = char.name;
    document.getElementById('detail-char-name').style.color = char.color;
    document.getElementById('detail-char-desc').innerText = char.desc;
    
    const lSkill = char.leaderSkill;
    let costText = lSkill.cost ? ` (必要SP: ${lSkill.cost})` : '';
    document.getElementById('detail-leader-name').innerText = lSkill.name + costText;
    document.getElementById('detail-leader-desc').innerText = lSkill.desc;
    
    switchScreen('screen-char-detail');
}

function closeCharDetail() {
    playSound(SOUNDS.seClick);
    pendingCharId = null;
    switchScreen('screen-select');
}

function confirmCharSelect() {
    playSound(SOUNDS.seClick);
    if (appState === 'select_player') {
        playerConfig = CHARACTERS[pendingCharId];
        if (gameMode === 'story') {
            enemyQueue = Object.keys(CHARACTERS).filter(id => id !== pendingCharId && id !== 'satan').sort(() => Math.random() - 0.5);
            enemyQueue.push('satan'); 
            battleCount = 1;
            startNextBattleSequence();
        } else {
            appState = 'select_enemy';
            document.getElementById('select-title').innerText = "Select Enemy";
            initSelectScreen(true); 
            switchScreen('screen-select');
        }
    } else if (appState === 'select_enemy') {
        enemyConfig = CHARACTERS[pendingCharId];
        appState = 'select_difficulty';
        switchScreen('screen-difficulty');
    }
}

function startFreeBattle(level) {
    playSound(SOUNDS.seClick);
    aiLevel = level;
    battleCount = 1;
    appState = 'pre_dialogue';
    dialogueQueue = [
        { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'intro') },
        { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'intro') }
    ];
    setupDialogueScreen();
}

function startNextBattleSequence() {
    if (enemyQueue.length === 0) {
        startEndingSequence();
        return;
    }
    enemyConfig = CHARACTERS[enemyQueue.shift()];
    
    if (gameMode === 'story') {
        aiLevel = Math.min(3, battleCount);
    }

    appState = 'pre_dialogue';
    dialogueQueue = [
        { speaker: 'enemy', text: `第${battleCount}戦の相手は私よ。\n` + getDialogue(enemyConfig, playerConfig, 'intro') },
        { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'intro') }
    ];
    if (enemyConfig.id === 'satan') {
        dialogueQueue[0].text = getDialogue(enemyConfig, playerConfig, 'intro');
    }
    setupDialogueScreen();
}

function startEndingSequence() {
    appState = 'ending_dialogue';
    stopSound(SOUNDS.bgmTitle); stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle);
    playSound(SOUNDS.bgmEnding);
    
    dialogueQueue = playerConfig.dialogue.ending;
    currentDialogueIndex = 0;
    
    document.getElementById('portrait-left').src = playerConfig.image;
    document.getElementById('portrait-left').classList.add('active');
    document.getElementById('portrait-right').style.display = 'none'; 
    switchScreen('screen-dialogue');
    showNextDialogue();
}

function setupDialogueScreen() {
    currentDialogueIndex = 0;
    let pLeftImg = playerConfig.image;
    let pRightImg = enemyConfig.image;

    if (appState === 'post_dialogue') {
        if (lastBattleResult === 'win') pRightImg = enemyConfig.imageLose;
        else if (lastBattleResult === 'lose') pLeftImg = playerConfig.imageLose;
    }

    document.getElementById('portrait-left').src = pLeftImg;
    document.getElementById('portrait-right').src = pRightImg;
    document.getElementById('portrait-right').style.display = 'block';

    switchScreen('screen-dialogue');
    showNextDialogue();
}

function showNextDialogue() {
    if (currentDialogueIndex >= dialogueQueue.length) {
        if (appState === 'pre_dialogue') {
            prepareBattle();
        } else if (appState === 'post_dialogue') {
            if (gameMode === 'free') {
                document.getElementById('result-title').innerText = lastBattleResult === 'win' ? "YOU WIN!" : "YOU LOSE...";
                document.getElementById('result-title').style.color = lastBattleResult === 'win' ? "#facc15" : "#aaa";
                document.getElementById('result-desc').innerText = "フリーモード終了";
                switchScreen('screen-result');
            } else {
                if (lastBattleResult === 'lose') showContinueScreen();
                else startNextBattleSequence(); 
            }
        } else if (appState === 'ending_dialogue') {
            appState = 'ending_illust';
            switchScreen('screen-ending-illust');
            document.getElementById('ending-illust-img').src = playerConfig.imageEnding;
            setTimeout(() => {
                document.getElementById('ending-illust-img').style.opacity = 1;
                document.getElementById('ending-text').style.opacity = 1;
            }, 100);
        }
        return;
    }

    playSound(SOUNDS.seClick);
    const cur = dialogueQueue[currentDialogueIndex];
    const nameEl = document.getElementById('speaker-name');
    const pLeft = document.getElementById('portrait-left'), pRight = document.getElementById('portrait-right');
    const box = document.querySelector('.dialogue-box');

    if (cur.speaker === 'player') {
        nameEl.innerText = playerConfig.name; nameEl.style.color = playerConfig.color;
        pLeft.classList.add('active'); 
        if (appState !== 'ending_dialogue') pRight.classList.remove('active'); 
        box.style.borderColor = playerConfig.color;
    } else {
        nameEl.innerText = enemyConfig.name; nameEl.style.color = enemyConfig.color;
        pRight.classList.add('active'); pLeft.classList.remove('active'); 
        box.style.borderColor = enemyConfig.color;
    }
    document.getElementById('dialogue-text').innerText = cur.text;
    currentDialogueIndex++;
}

function finishEnding() {
    if (appState !== 'ending_illust') return;
    playSound(SOUNDS.seClick);
    document.getElementById('ending-illust-img').style.opacity = 0;
    document.getElementById('ending-text').style.opacity = 0;
    
    setTimeout(() => {
        document.getElementById('portrait-right').style.display = 'block';
        document.getElementById('result-title').innerText = "GAME CLEAR!";
        document.getElementById('result-title').style.color = "#facc15";
        document.getElementById('result-desc').innerText = "すべてのライバルを撃破し、エンディングを迎えました！";
        switchScreen('screen-result');
    }, 2000);
}

// ==========================================
// コンティニュー処理
// ==========================================
let continueTimer = null;
let continueCount = 9;

function showContinueScreen() {
    stopSound(SOUNDS.bgmTitle);
    switchScreen('screen-continue');
    document.getElementById('continue-img').src = playerConfig.imageLose;
    document.getElementById('continue-img').classList.remove('revive');
    document.getElementById('continue-buttons').style.display = 'flex';
    
    continueCount = 9;
    document.getElementById('continue-count').innerText = continueCount;
    
    continueTimer = setInterval(() => {
        continueCount--;
        if (continueCount < 0) {
            clearInterval(continueTimer);
            executeGameOver();
        } else {
            document.getElementById('continue-count').innerText = continueCount;
        }
    }, 1000);
}

function executeContinue() {
    if (continueTimer) clearInterval(continueTimer);
    playSound(SOUNDS.seContinue);
    document.getElementById('continue-count').innerText = "YES!";
    document.getElementById('continue-buttons').style.display = 'none';
    
    const imgEl = document.getElementById('continue-img');
    imgEl.src = playerConfig.image;
    imgEl.classList.add('revive');
    
    setTimeout(() => { prepareBattle(); }, 2000);
}

function executeGameOver() {
    if (continueTimer) clearInterval(continueTimer);
    appState = 'title';
    switchScreen('screen-mode-select');
    playSound(SOUNDS.bgmTitle);
}

// ==========================================
// デッキ・バトルロジック
// ==========================================
function generateDeck(owner, config, sessionId) {
    const cardTemplates = [
        { power: 2, skill: 'deadly' }, { power: 2, skill: 'deadly' },
        { power: 5, skill: 'draw' }, { power: 5, skill: 'draw' },
        { power: 2, skill: 'quick' }, { power: 2, skill: 'quick' },
        { power: 3, skill: 'heal' }, { power: 3, skill: 'heal' },
        { power: 2, skill: 'snipe' }, { power: 2, skill: 'snipe' },
        { power: 2, skill: 'spread' }, { power: 2, skill: 'spread' },
        { power: 1, skill: 'copy' }, { power: 1, skill: 'copy' },
        { power: 3, skill: 'support' }, { power: 3, skill: 'support' },
        { power: 10, skill: 'defender' }, { power: 10, skill: 'defender' },
        { power: 2, skill: 'clone' }, { power: 2, skill: 'clone' }, { power: 2, skill: 'clone' },
        { power: 3, skill: 'lone_wolf' }, { power: 3, skill: 'lone_wolf' }, { power: 3, skill: 'lone_wolf' },
        { power: 4, skill: 'soul_bind' }, { power: 4, skill: 'soul_bind' }, { power: 4, skill: 'soul_bind' },
        { power: 4, skill: 'sturdy' }, { power: 4, skill: 'sturdy' }, { power: 4, skill: 'sturdy' },
        { power: 7, skill: 'none' }
    ];
    
    let deck = cardTemplates.map((t, i) => {
        let p = t.power;
        if (config.id === 'satan') p += 1; 
        const imgUrl = `https://robohash.org/${owner}_${sessionId}_${i}?set=${config.cardType}&size=160x200&bgset=${config.cardBg}`;
        return {
            id: `${owner}_${sessionId}_${i}`, owner: owner,
            imgUrl: imgUrl, filter: config.filter,
            power: p, currentPower: p, skill: t.skill
        };
    });
    return deck.sort(() => Math.random() - 0.5);
}

function prepareBattle() {
    switchScreen('screen-loading');
    const sessionId = Date.now();
    playerDeck = generateDeck('blue', playerConfig, sessionId);
    enemyDeck = generateDeck('red', enemyConfig, sessionId);
    
    const allCards = [...playerDeck, ...enemyDeck];
    let loaded = 0;
    
    const finishLoading = () => {
        setTimeout(initBattleState, 500);
    };

    const updateProgress = () => {
        loaded++;
        document.getElementById('loading-text').innerText = `Generating Cards... ${Math.floor((loaded / allCards.length) * 100)}%`;
        if (loaded === allCards.length) finishLoading();
    };
    
    if(allCards.length === 0) finishLoading();
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

    playerHP = MAX_HP; enemyHP = MAX_HP;
    playerSP = 0; enemySP = 0;
    playerHand = []; enemyHand = [];
    playerDiscard = []; enemyDiscard = [];
    playerBoard = [null, null, null]; enemyBoard = [null, null, null];
    
    isProcessing = false;
    selectedCardIndex = null;
    isBattleEnded = false; 
    updateCardDetail(null);
    
    document.getElementById('player-icon').src = playerConfig.icon;
    document.getElementById('enemy-icon').src = enemyConfig.icon;
    document.getElementById('player-name').innerText = playerConfig.name;
    document.getElementById('enemy-name').innerText = enemyConfig.name;

    const battleScreen = document.getElementById('screen-battle');
    battleScreen.style.backgroundColor = '#0f172a';
    battleScreen.style.backgroundImage = `linear-gradient(rgba(15, 23, 42, 0.6), rgba(15, 23, 42, 0.8)), url('assets/background_${enemyConfig.id}.png')`;
    
    updateHPBar();
    updateSPOrbs('blue'); updateSPOrbs('red');
    renderBoard();
    
    for(let i=0; i<5; i++) { drawCard('blue'); drawCard('red'); }
    
    switchScreen('screen-battle');
    startTurn('blue');
}

function updateHPBar() {
    document.getElementById('player-hp-fill').style.width = `${Math.max(0, (playerHP/MAX_HP)*100)}%`;
    document.getElementById('player-hp-text').innerText = `${Math.max(0, playerHP)} / ${MAX_HP}`;
    document.getElementById('enemy-hp-fill').style.width = `${Math.max(0, (enemyHP/MAX_HP)*100)}%`;
    document.getElementById('enemy-hp-text').innerText = `${Math.max(0, enemyHP)} / ${MAX_HP}`;
}

function updateSPOrbs(owner) {
    const sp = owner === 'blue' ? playerSP : enemySP;
    const config = owner === 'blue' ? playerConfig : enemyConfig;
    const cost = config.leaderSkill.cost;
    const orbsContainerId = owner === 'blue' ? 'player-sp-orbs' : 'enemy-sp-orbs';
    const orbsContainer = document.getElementById(orbsContainerId);
    
    if (!orbsContainer) return;
    if (!cost) { orbsContainer.style.display = 'none'; return; }

    orbsContainer.style.display = 'flex';
    orbsContainer.innerHTML = '';
    for (let i = 0; i < cost; i++) {
        const orb = document.createElement('div');
        orb.className = 'orb';
        if (i < sp) orb.classList.add('filled');
        orbsContainer.appendChild(orb);
    }

    if (owner === 'blue') {
        const skillBtn = document.getElementById('btn-leader-skill');
        if (skillBtn) {
            if (sp >= cost) skillBtn.classList.add('ready');
            else skillBtn.classList.remove('ready');
        }
    }
}

function checkWinCondition() {
    if (playerHP <= 0 || enemyHP <= 0) {
        if (!isBattleEnded) {
            isBattleEnded = true;
            endBattle();
        }
        return true;
    }
    return false;
}

function showSpeechBubble(target) {
    const config = target === 'blue' ? playerConfig : enemyConfig;
    const phrases = config.dialogue.damage;
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    const bubbleId = target === 'blue' ? 'player-speech' : 'enemy-speech';
    const bubble = document.getElementById(bubbleId);
    if (bubble) {
        bubble.innerText = phrase;
        bubble.classList.add('active');
        setTimeout(() => { bubble.classList.remove('active'); }, 1500);
    }
}

function showSkillConfirm() {
    if (isProcessing || isBattleEnded || document.getElementById('turn-status').innerText !== "YOUR TURN") return;
    playSound(SOUNDS.seClick);
    const skill = playerConfig.leaderSkill;
    if (!skill.cost) return; 

    document.getElementById('skill-confirm-name').innerText = skill.name;
    document.getElementById('skill-confirm-desc').innerText = skill.desc;
    const statusEl = document.getElementById('skill-confirm-status');
    const execBtn = document.getElementById('btn-execute-skill');

    if (playerSP >= skill.cost) {
        statusEl.innerText = "発動可能です！"; statusEl.style.color = "#4ade80"; execBtn.style.display = "block";
    } else {
        const remain = skill.cost - playerSP;
        statusEl.innerText = `発動まであと ${remain} SP`; statusEl.style.color = "#f87171"; execBtn.style.display = "none";
    }
    document.getElementById('screen-skill-confirm').style.display = 'flex';
}

function showEnemySkillConfirm() {
    playSound(SOUNDS.seClick);
    const skill = enemyConfig.leaderSkill;
    document.getElementById('skill-confirm-name').innerText = skill.name;
    document.getElementById('skill-confirm-desc').innerText = skill.desc;
    const statusEl = document.getElementById('skill-confirm-status');
    const execBtn = document.getElementById('btn-execute-skill');

    if (!skill.cost) {
        statusEl.innerText = "パッシブスキル（常に発動）"; statusEl.style.color = "#4ade80";
    } else {
        const remain = Math.max(0, skill.cost - enemySP);
        if (remain === 0) { statusEl.innerText = "発動可能状態です！注意！"; statusEl.style.color = "#ef4444"; }
        else { statusEl.innerText = `発動まであと ${remain} SP`; statusEl.style.color = "#f87171"; }
    }
    execBtn.style.display = "none"; 
    document.getElementById('screen-skill-confirm').style.display = 'flex';
}

function closeSkillConfirm() {
    playSound(SOUNDS.seClick);
    document.getElementById('screen-skill-confirm').style.display = 'none';
}

function executeSkillFromConfirm() {
    closeSkillConfirm();
    activateLeaderSkill('blue');
}

async function activateLeaderSkill(owner) {
    if (isBattleEnded) return;
    const isBlue = owner === 'blue';
    if (isBlue && (isProcessing || document.getElementById('turn-status').innerText !== "YOUR TURN")) return;

    const sp = isBlue ? playerSP : enemySP;
    const config = isBlue ? playerConfig : enemyConfig;
    if (!config.leaderSkill.cost || sp < config.leaderSkill.cost) return;

    const previousProcessing = isProcessing;
    isProcessing = true;
    if (isBlue) playerSP -= config.leaderSkill.cost;
    else enemySP -= config.leaderSkill.cost;
    updateSPOrbs(owner);

    playSound(SOUNDS.seLegend);
    const cutin = document.getElementById('screen-cutin');
    const cutinImg = document.getElementById('cutin-char-img');
    const cutinText = document.getElementById('cutin-text');
    const cutinBg = document.getElementById('cutin-bg');
    
    cutinImg.src = config.image;
    cutinText.innerHTML = `${config.leaderSkill.name}!!`;
    
    if (isBlue) {
        cutinText.style.color = "#fff";
        cutinText.style.textShadow = "0 0 20px #38bdf8, 3px 3px 0 #000";
        cutinBg.style.background = "linear-gradient(90deg, transparent, #38bdf8, transparent)";
    } else {
        cutinText.style.color = "#ff0000";
        cutinText.style.textShadow = "0 0 20px #000, 3px 3px 0 #fff";
        cutinBg.style.background = "linear-gradient(90deg, transparent, #ef4444, transparent)";
    }

    cutin.style.display = 'flex';
    cutinImg.style.animation = 'none'; cutinText.style.animation = 'none';
    cutinImg.offsetHeight; 
    cutinImg.style.animation = 'slideIn 2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards';
    cutinText.style.animation = 'textPop 2s ease forwards';
    
    const bubbleId = owner === 'blue' ? 'player-speech' : 'enemy-speech';
    const bubble = document.getElementById(bubbleId);
    if (bubble && config.dialogue.skill) {
        bubble.innerText = config.dialogue.skill;
        bubble.classList.add('active');
    }
    
    await sleep(2500);
    cutin.style.display = 'none';
    if (bubble) bubble.classList.remove('active');

    const action = config.leaderSkill.action;
    const board = isBlue ? playerBoard : enemyBoard;
    const enemyBoardRef = isBlue ? enemyBoard : playerBoard;
    const defOwner = isBlue ? 'red' : 'blue';
    const defOwnerStr = isBlue ? 'enemy' : 'player';

    if (action === 'annihilation') {
        for (let i = 0; i < 3; i++) {
            if (enemyBoardRef[i] !== null) {
                const targetEl = document.querySelector(`#${defOwnerStr}-lanes .cell[data-lane="${i}"] .card`);
                if (targetEl) { targetEl.classList.add('anim-shake'); createDamagePopup(targetEl, '-4'); }
                enemyBoardRef[i].currentPower -= 4;
            }
        }
        renderBoard(); playSound(SOUNDS.seDamage); await sleep(500);
        for (let i = 0; i < 3; i++) if (enemyBoardRef[i] !== null && enemyBoardRef[i].currentPower <= 0) { discardCard(defOwner, enemyBoardRef[i]); enemyBoardRef[i] = null; playSound(SOUNDS.seDestroy); }
        renderBoard();
    } else if (action === 'satan_avatar' || action === 'dragon_summon') {
        const emptyLanes = board.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
        if (emptyLanes.length > 0) {
            const targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
            const isSatan = action === 'satan_avatar';
            board[targetLane] = {
                id: `token_${isSatan?'satan':'ignis'}_${owner}_${Date.now()}`, owner: owner,
                imgUrl: CHARACTERS[isSatan?'satan':'dragon'].image, 
                filter: isSatan ? 'grayscale(1) brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(5)' : 'none',
                power: isSatan ? 10 : 7, currentPower: isSatan ? 10 : 7, 
                skill: isSatan ? 'token_satan' : 'token_ignis', isToken: true
            };
            playSound(SOUNDS.sePlace); renderBoard(); await sleep(500);
        }
    } else if (action === 'holy_march') {
        let summonedCount = 0;
        for(let i=0; i<3; i++) {
            if (board[i] === null && summonedCount < 2) {
                board[i] = {
                    id: `token_knight_${owner}_${Date.now()}_${i}`, owner: owner,
                    imgUrl: 'assets/card_knight.png', filter: 'none',
                    power: 1, currentPower: 1, skill: 'token_knight', isToken: true
                };
                summonedCount++;
            }
        }
        if (summonedCount > 0) { playSound(SOUNDS.sePlace); renderBoard(); await sleep(400); }
        let buffed = false;
        for (let i = 0; i < 3; i++) {
            if (board[i] !== null) {
                board[i].currentPower += 3; board[i].power += 3;
                const targetEl = document.querySelector(`#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`);
                if (targetEl) createDamagePopup(targetEl, '+3', '#4ade80');
                buffed = true;
            }
        }
        if (buffed) { renderBoard(); await sleep(500); }
    } else if (action === 'abyss_ritual') {
        const hand = isBlue ? playerHand : enemyHand;
        if (hand.length > 0) {
            let discardCount = 0;
            while (discardCount < 2 && hand.length > 0) {
                let minPower = Math.min(...hand.map(c => c.power));
                let minIdx = hand.findIndex(c => c.power === minPower);
                discardCard(owner, hand.splice(minIdx, 1)[0]);
                discardCount++;
            }
            for (let i = 0; i < discardCount; i++) drawCard(owner);
        }
        hand.forEach(c => { c.power += 2; c.currentPower += 2; });
        if (isBlue) renderHand();
        playSound(SOUNDS.seSkill); await sleep(500);
    }

    if (checkWinCondition()) return;
    if (isBlue && playerBoard.every(c => c !== null) && (!playerConfig.leaderSkill.cost || playerSP < playerConfig.leaderSkill.cost)) {
        document.getElementById('turn-status').innerText = "BOARD FULL - AUTO SKIP";
        document.getElementById('turn-status').style.color = "#94a3b8";
        isProcessing = true;
        setTimeout(() => {
            selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard(); endTurnLogic('blue');
        }, 1500);
        return; 
    }
    isProcessing = previousProcessing; 
}

function discardCard(owner, card) {
    if (card.isToken) return;
    card.currentPower = card.power; 
    if (owner === 'blue') playerDiscard.push(card);
    else enemyDiscard.push(card);
}

function drawCard(owner) {
    let deck = owner === 'blue' ? playerDeck : enemyDeck;
    const hand = owner === 'blue' ? playerHand : enemyHand;
    let discard = owner === 'blue' ? playerDiscard : enemyDiscard;

    if (deck.length === 0 && discard.length > 0) {
        deck.push(...discard.sort(() => Math.random() - 0.5));
        discard.length = 0; playSound(SOUNDS.seSkill);
        createDamagePopup(document.getElementById(`${owner === 'blue' ? 'player-hp-fill' : 'enemy-hp-fill'}`), 'RELOAD', '#38bdf8');
    }
    if (deck.length > 0 && hand.length < 5) hand.push(deck.pop());
    if (owner === 'blue') {
        document.getElementById('deck-info').innerText = `Deck: ${playerDeck.length} / Drop: ${playerDiscard.length}`;
        renderHand();
    }
}

function updateCardDetail(card) {
    const detailBox = document.getElementById('card-detail-view');
    if (!card) {
        detailBox.innerText = 'カードを選択するとここに能力が表示されます';
        detailBox.style.color = '#94a3b8';
    } else {
        const skillInfo = SKILLS[card.skill];
        let powerStr = `パワー ${card.currentPower}`; 
        if (card.skill === 'none' || card.skill.startsWith('token_')) {
            detailBox.innerHTML = `<strong style="color:#fff">${powerStr}</strong> <span style="margin-left:10px;">${skillInfo.desc}</span>`;
        } else {
            detailBox.innerHTML = `<strong style="color:#fff">${powerStr}</strong> <span style="color:#facc15; margin-left:10px;">${skillInfo.icon} ${skillInfo.name}</span> <br> <span style="color:#fff">${skillInfo.desc}</span>`;
        }
        detailBox.style.color = '#fff';
    }
}

function createCardDOM(card) {
    const div = document.createElement('div');
    div.className = `card ${card.owner}`;
    let skillHtml = '';
    if (card.skill !== 'none' && !card.skill.startsWith('token_')) {
        const s = SKILLS[card.skill];
        skillHtml = `<div class="card-skill">${s.icon} ${s.name}</div>`;
    }
    div.innerHTML = `<div class="card-bg" style="background-image: url('${card.imgUrl}'); filter: ${card.filter};"></div>${skillHtml}<div class="card-power">${card.currentPower}</div>`;
    return div;
}

function renderHand() {
    const handEl = document.getElementById('player-hand');
    handEl.innerHTML = '';
    playerHand.forEach((card, idx) => {
        const div = createCardDOM(card);
        div.className += " hand-card";
        if (idx === selectedCardIndex) div.classList.add('selected');
        div.onclick = () => {
            if (isProcessing) return;
            playSound(SOUNDS.seClick);
            selectedCardIndex = idx; updateCardDetail(playerHand[idx]); renderHand(); renderBoard(); highlightLanes();
        };
        handEl.appendChild(div);
    });
}

function highlightLanes() {
    document.querySelectorAll('#player-lanes .cell').forEach((cell, i) => {
        if (playerBoard[i] === null && selectedCardIndex !== null) cell.classList.add('highlight');
        else cell.classList.remove('highlight');
    });
}

function renderBoard() {
    for(let i=0; i<3; i++) {
        const pCell = document.querySelector(`#player-lanes .cell[data-lane="${i}"]`);
        const eCell = document.querySelector(`#enemy-lanes .cell[data-lane="${i}"]`);
        pCell.innerHTML = ''; pCell.className = 'cell';
        eCell.innerHTML = ''; eCell.className = 'cell';
        if (playerBoard[i]) {
            const cardDOM = createCardDOM(playerBoard[i]);
            cardDOM.onclick = (e) => { e.stopPropagation(); if (isProcessing) return; playSound(SOUNDS.seClick); updateCardDetail(playerBoard[i]); };
            pCell.appendChild(cardDOM);
        }
        if (enemyBoard[i]) {
            const cardDOM = createCardDOM(enemyBoard[i]);
            cardDOM.onclick = (e) => { e.stopPropagation(); playSound(SOUNDS.seClick); updateCardDetail(enemyBoard[i]); };
            eCell.appendChild(cardDOM);
        }
    }
}

async function startTurn(owner) {
    if (isBattleEnded) return;
    isProcessing = true;
    document.getElementById('turn-status').innerText = owner === 'blue' ? "YOUR TURN" : "ENEMY TURN";
    document.getElementById('turn-status').style.color = owner === 'blue' ? "var(--color-blue)" : "var(--color-red)";
    
    const config = owner === 'blue' ? playerConfig : enemyConfig;
    if (config.leaderSkill.cost) {
        if (owner === 'blue') playerSP = Math.min(config.leaderSkill.cost, playerSP + 1);
        else enemySP = Math.min(config.leaderSkill.cost, enemySP + 1);
    }
    updateSPOrbs(owner);

    if ((owner === 'blue' ? playerBoard : enemyBoard).some(c => c !== null)) {
        await executeCombatPhase(owner);
        if (checkWinCondition()) return;
    }

    drawCard(owner);
    if (owner === 'blue') {
        selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard();
        if (playerBoard.every(c => c !== null) && (!playerConfig.leaderSkill.cost || playerSP < playerConfig.leaderSkill.cost)) {
            const statusEl = document.getElementById('turn-status');
            statusEl.innerText = "BOARD FULL - AUTO SKIP"; statusEl.style.color = "#94a3b8";
            await sleep(1500); endTurnLogic('blue');
        } else { isProcessing = false; }
    } else {
        await sleep(500); await executeEnemyAI();
    }
}

async function endPlayerTurn() {
    if (isProcessing) return;
    isProcessing = true;
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
    selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard(); endTurnLogic('blue');
}

function endTurnLogic(owner) {
    if (isBattleEnded) return;
    startTurn(owner === 'blue' ? 'red' : 'blue');
}

async function executeEnemyAI() {
    if (isBattleEnded) return;
    if (enemyConfig.leaderSkill.cost && enemySP >= enemyConfig.leaderSkill.cost && Math.random() < 0.7) {
        await activateLeaderSkill('red');
        if (checkWinCondition()) return;
    }

    let targetLane = -1, maxThreat = -1;
    const emptyLanes = enemyBoard.map((c, i) => c === null ? i : -1).filter(i => i !== -1);

    if (aiLevel === 1) {
        if (emptyLanes.length > 0) targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
    } else {
        for(let i=0; i<3; i++) if (enemyBoard[i] === null && playerBoard[i] !== null && playerBoard[i].currentPower > maxThreat) {
            maxThreat = playerBoard[i].currentPower; targetLane = i;
        }
        if (targetLane === -1 && emptyLanes.length > 0) targetLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
    }
    
    if (targetLane !== -1 && enemyHand.length > 0) {
        let bestIdx = 0;
        if (aiLevel >= 2) for(let i=1; i<enemyHand.length; i++) if(enemyHand[i].power > enemyHand[bestIdx].power) bestIdx = i;
        else bestIdx = Math.floor(Math.random() * enemyHand.length);
        await playCard('red', bestIdx, targetLane);
        if (checkWinCondition()) return;
        await sleep(500);
    }
    endTurnLogic('red');
}

async function playCard(owner, handIndex, lane) {
    const hand = owner === 'blue' ? playerHand : enemyHand;
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    board[lane] = hand.splice(handIndex, 1)[0];
    playSound(SOUNDS.sePlace); renderHand(); renderBoard();
    const card = board[lane];
    if (card.skill !== 'none' && !['deadly', 'defender', 'soul_bind', 'sturdy'].includes(card.skill)) {
        await resolveOnPlaySkill(owner, lane, card);
    }
}

async function resolveOnPlaySkill(owner, lane, card) {
    const cardEl = document.querySelector(`#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${lane}"] .card`);
    if (!cardEl) return;
    const hand = owner === 'blue' ? playerHand : enemyHand, board = owner === 'blue' ? playerBoard : enemyBoard;
    const enemyBoardRef = owner === 'blue' ? enemyBoard : playerBoard, defOwner = owner === 'blue' ? 'red' : 'blue', defOwnerStr = owner === 'blue' ? 'enemy' : 'player';

    if (card.skill === 'draw') {
        playSound(SOUNDS.seSkill); createDamagePopup(cardEl, 'REPLACE', '#facc15');
        if (hand.length > 0) {
            let minPower = Math.min(...hand.map(c => c.power)), discardCount = 0;
            for (let i = hand.length - 1; i >= 0; i--) if (hand[i].power === minPower) { discardCard(owner, hand.splice(i, 1)[0]); discardCount++; }
            for (let i = 0; i < discardCount; i++) drawCard(owner);
        } else drawCard(owner);
        await sleep(500);
    } else if (card.skill === 'heal') {
        playSound(SOUNDS.seSkill); createDamagePopup(cardEl, '+3 HP', '#4ade80');
        if (owner === 'blue') playerHP = Math.min(MAX_HP, playerHP + 3); else enemyHP = Math.min(MAX_HP, enemyHP + 3);
        updateHPBar(); await sleep(500);
    } else if (card.skill === 'snipe') {
        playSound(SOUNDS.seSkill); createDamagePopup(cardEl, 'SNIPE', '#facc15');
        const targets = enemyBoardRef.map((c, i) => c !== null ? i : -1).filter(i => i !== -1);
        if (targets.length > 0) {
            let maxTargetLane = targets.reduce((a, b) => enemyBoardRef[a].currentPower > enemyBoardRef[b].currentPower ? a : b);
            const targetEl = document.querySelector(`#${defOwnerStr}-lanes .cell[data-lane="${maxTargetLane}"] .card`);
            if (targetEl) { targetEl.classList.add('anim-shake'); createDamagePopup(targetEl, '-4', '#ef4444'); }
            playSound(SOUNDS.seDamage); enemyBoardRef[maxTargetLane].currentPower -= 4; renderBoard(); await sleep(500);
            if (enemyBoardRef[maxTargetLane].currentPower <= 0) {
                discardCard(defOwner, enemyBoardRef[maxTargetLane]); enemyBoardRef[maxTargetLane] = null; playSound(SOUNDS.seDestroy); renderBoard();
            }
        }
    } else if (card.skill === 'spread') {
        playSound(SOUNDS.seSkill); createDamagePopup(cardEl, 'SPREAD', '#facc15');
        let hit = false;
        for (let i = 0; i < 3; i++) if (enemyBoardRef[i] !== null) {
            const tEl = document.querySelector(`#${defOwnerStr}-lanes .cell[data-lane="${i}"] .card`);
            if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, '-2', '#ef4444'); }
            enemyBoardRef[i].currentPower -= 2; hit = true;
        }
        if (hit) {
            renderBoard(); playSound(SOUNDS.seDamage); await sleep(500);
            for (let i = 0; i < 3; i++) if (enemyBoardRef[i] !== null && enemyBoardRef[i].currentPower <= 0) { discardCard(defOwner, enemyBoardRef[i]); enemyBoardRef[i] = null; playSound(SOUNDS.seDestroy); }
            renderBoard();
        }
    } else if (card.skill === 'copy') {
        playSound(SOUNDS.seSkill); createDamagePopup(cardEl, 'COPY', '#facc15');
        let maxP = Math.max(...board.map((c, i) => (i!==lane && c) ? c.currentPower : -1));
        if (maxP > 0) { card.power = maxP; card.currentPower = maxP; createDamagePopup(cardEl, `P=${maxP}`, '#4ade80'); renderBoard(); }
        await sleep(500);
    } else if (card.skill === 'support') {
        playSound(SOUNDS.seSkill); createDamagePopup(cardEl, 'SUPPORT', '#facc15');
        let supported = false;
        for (let i = 0; i < 3; i++) if (i !== lane && board[i] !== null) {
            board[i].currentPower += 2; createDamagePopup(document.querySelector(`#${owner==='blue'?'player':'enemy'}-lanes .cell[data-lane="${i}"] .card`), '+2', '#4ade80'); supported = true;
        }
        if(supported) { renderBoard(); await sleep(500); }
    } else if (card.skill === 'clone') {
        playSound(SOUNDS.seSkill); createDamagePopup(cardEl, 'CLONE', '#facc15');
        const emptyLanes = board.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
        if (emptyLanes.length > 0) {
            const tLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)];
            board[tLane] = { id: `clone_${owner}_${Date.now()}`, owner: owner, imgUrl: card.imgUrl, filter: card.filter, power: 2, currentPower: 2, skill: 'token_clone', isToken: true };
            renderBoard();
        }
        await sleep(500);
    } else if (card.skill === 'lone_wolf') {
        playSound(SOUNDS.seSkill); 
        const buff = board.filter(c => c === null).length * 3;
        if (buff > 0) { card.power += buff; card.currentPower += buff; createDamagePopup(cardEl, `+${buff}`, '#4ade80'); renderBoard(); }
        else createDamagePopup(cardEl, `+0`, '#94a3b8');
        await sleep(500);
    } else if (card.skill === 'quick') {
        playSound(SOUNDS.seSkill); createDamagePopup(cardEl, 'QUICK', '#facc15'); await sleep(400); await executeSingleCombat(owner, lane);
    } 
}

async function executeSingleCombat(attacker, lane) {
    const atkBoard = attacker === 'blue' ? playerBoard : enemyBoard, defBoard = attacker === 'blue' ? enemyBoard : playerBoard;
    const atkRowId = attacker === 'blue' ? '#player-lanes' : '#enemy-lanes', defRowId = attacker === 'blue' ? '#enemy-lanes' : '#player-lanes';
    const animClass = attacker === 'blue' ? 'anim-attack-up' : 'anim-attack-down';
    const atkCard = atkBoard[lane];
    if (!atkCard || atkCard.skill === 'defender') return;
    const atkCardEl = document.querySelector(`${atkRowId} .cell[data-lane="${lane}"] .card`);
    if (!atkCardEl) return;

    atkCardEl.classList.add(animClass); playSound(SOUNDS.seAttack); await sleep(300);

    if (defBoard[lane] !== null) {
        let dmgToDef = atkCard.currentPower, dmgToAtk = defBoard[lane].currentPower;
        if (defBoard[lane].skill === 'sturdy') dmgToDef = Math.floor(dmgToDef / 2);
        if (atkCard.skill === 'sturdy') dmgToAtk = Math.floor(dmgToAtk / 2);
        defBoard[lane].currentPower -= dmgToDef;
        if (defBoard[lane].skill !== 'defender') atkCard.currentPower -= dmgToAtk;
        const defCardEl = document.querySelector(`${defRowId} .cell[data-lane="${lane}"] .card`);
        if(defCardEl) defCardEl.classList.add('anim-shake');
        playSound(SOUNDS.seDamage); createDamagePopup(defCardEl, `-${dmgToDef}`);
        if (defBoard[lane].skill !== 'defender') createDamagePopup(atkCardEl, `-${dmgToAtk}`);
        renderBoard(); await sleep(400);
        if (atkCard.skill === 'deadly' && defBoard[lane].skill !== 'defender') defBoard[lane].currentPower = 0;
        if (defBoard[lane].skill === 'deadly') atkCard.currentPower = 0;
        let soulTriggered = false;
        if (defBoard[lane].currentPower <= 0 && atkCard.currentPower > 0 && atkCard.skill === 'soul_bind') { atkCard.currentPower += 2; atkCard.power += 2; createDamagePopup(atkCardEl, '+2', '#4ade80'); soulTriggered = true; }
        if (atkCard.currentPower <= 0 && defBoard[lane].currentPower > 0 && defBoard[lane].skill === 'soul_bind') { defBoard[lane].currentPower += 2; defBoard[lane].power += 2; createDamagePopup(defCardEl, '+2', '#4ade80'); soulTriggered = true; }
        if (soulTriggered) { playSound(SOUNDS.seSkill); renderBoard(); await sleep(300); }
        if (atkCard.currentPower <= 0) { discardCard(attacker, atkBoard[lane]); atkBoard[lane] = null; }
        if (defBoard[lane] && defBoard[lane].currentPower <= 0) { discardCard(attacker==='blue'?'red':'blue', defBoard[lane]); defBoard[lane] = null; }
        if (atkCard === null || (defBoard[lane] === null)) playSound(SOUNDS.seDestroy);
    } else {
        const dmg = atkCard.currentPower;
        playSound(SOUNDS.seDamage); document.body.classList.add('anim-shake');
        if (attacker === 'blue') { enemyHP -= dmg; createDamagePopup(document.getElementById('enemy-hp-fill'), `-${dmg}`); showSpeechBubble('red'); }
        else { playerHP -= dmg; createDamagePopup(document.getElementById('player-hp-fill'), `-${dmg}`); showSpeechBubble('blue'); }
        updateHPBar(); if (checkWinCondition()) return; await sleep(400); document.body.classList.remove('anim-shake');
    }
    if(atkCardEl) atkCardEl.classList.remove(animClass); renderBoard();
}

async function executeCombatPhase(attacker) {
    const atkBoard = attacker === 'blue' ? playerBoard : enemyBoard;
    for (let i = 0; i < 3; i++) if (atkBoard[i] !== null) {
        await executeSingleCombat(attacker, i); if (isBattleEnded) break; await sleep(200);
    }
}

function endBattle() {
    stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle);
    if (playerHP > 0 && enemyHP <= 0) lastBattleResult = 'win';
    else if (playerHP <= 0 && enemyHP > 0) lastBattleResult = 'lose';
    else lastBattleResult = 'draw';
    const status = document.getElementById('turn-status');
    status.innerText = lastBattleResult === 'win' ? "YOU WIN!" : (lastBattleResult === 'lose' ? "YOU LOSE..." : "DRAW");
    status.style.color = lastBattleResult === 'win' ? "#facc15" : "#fff";
    setTimeout(() => {
        playSound(SOUNDS.bgmTitle); appState = 'post_dialogue';
        dialogueQueue = lastBattleResult === 'win' ? [
            { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'lose') },
            { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'win') }
        ] : [
            { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'lose') },
            { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'win') }
        ];
        if (lastBattleResult === 'win') battleCount++;
        setupDialogueScreen();
    }, 1500);
}

function returnToTitle() {
    playSound(SOUNDS.seClick);
    if (confirm('バトルを諦めてタイトルに戻りますか？')) {
        stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle); playSound(SOUNDS.bgmTitle);
        appState = 'title'; isProcessing = false; switchScreen('screen-mode-select');
    }
}

// 最終的な初期化
window.onload = () => {
    // プレイヤーのレーンクリックイベントを登録
    document.querySelectorAll('#player-lanes .cell').forEach(cell => {
        cell.onclick = async () => {
            if (isProcessing || selectedCardIndex === null) return;
            const lane = parseInt(cell.getAttribute('data-lane'));
            if (playerBoard[lane] !== null) return;
            isProcessing = true;
            document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
            await playCard('blue', selectedCardIndex, lane);
            if (checkWinCondition()) return;
            selectedCardIndex = null; updateCardDetail(null); await sleep(500); endTurnLogic('blue');
        };
    });
};

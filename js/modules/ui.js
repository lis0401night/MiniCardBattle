// ==========================================
// UIと画面制御ロジック
// ==========================================

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
            startBattleFlow();
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

// カードのDOMと描画関係（バトル画面UIへの反映）
function updateCardDetail(c) {
    const b = document.getElementById('card-detail-view');
    if (!c) { b.innerText = 'カードを選択するとここに能力が表示されます'; b.style.color = '#94a3b8'; }
    else {
        const s = SKILLS[c.skill]; let p = `パワー ${c.currentPower}`, cl = '#fff';
        if (c.skill === 'none' || c.skill.startsWith('token_')) b.innerHTML = `<strong style="color:${cl}">${p}</strong> <span style="margin-left:10px;">${s.desc}</span>`;
        else b.innerHTML = `<strong style="color:${cl}">${p}</strong> <span style="color:#facc15; margin-left:10px;">${s.icon} ${s.name}</span> <br> <span style="color:${cl}">${s.desc}</span>`;
        b.style.color = cl;
    }
}

function createCardDOM(c) {
    const d = document.createElement('div'); d.className = `card ${c.owner}`;
    let sH = ''; if (c.skill !== 'none' && !c.skill.startsWith('token_')) { const s = SKILLS[c.skill]; sH = `<div class="card-skill">${s.icon} ${s.name}</div>`; }
    d.innerHTML = `<div class="card-bg" style="background-image: url('${c.imgUrl}'); filter: ${c.filter};"></div>${sH}<div class="card-power">${c.currentPower}</div>`;
    return d;
}

function renderHand() {
    const e = document.getElementById('player-hand'); e.innerHTML = '';
    playerHand.forEach((c, i) => {
        const d = createCardDOM(c); d.className += " hand-card" + (i === selectedCardIndex ? " selected" : "");
        d.onclick = () => { if (isProcessing) return; playSound(SOUNDS.seClick); selectedCardIndex = i; updateCardDetail(playerHand[i]); renderHand(); renderBoard(); highlightLanes(); };
        e.appendChild(d);
    });
}

function highlightLanes() { document.querySelectorAll('#player-lanes .cell').forEach((c, i) => playerBoard[i] === null && selectedCardIndex !== null ? c.classList.add('highlight') : c.classList.remove('highlight')); }

function renderBoard() {
    for (let i = 0; i < 3; i++) {
        const p = document.querySelector(`#player-lanes .cell[data-lane="${i}"]`), e = document.querySelector(`#enemy-lanes .cell[data-lane="${i}"]`);
        p.innerHTML = ''; p.className = 'cell'; e.innerHTML = ''; e.className = 'cell';
        if (playerBoard[i]) { const d = createCardDOM(playerBoard[i]); d.onclick = (ev) => { ev.stopPropagation(); if (isProcessing) return; playSound(SOUNDS.seClick); updateCardDetail(playerBoard[i]); }; p.appendChild(d); }
        if (enemyBoard[i]) { const d = createCardDOM(enemyBoard[i]); d.onclick = (ev) => { ev.stopPropagation(); playSound(SOUNDS.seClick); updateCardDetail(enemyBoard[i]); }; e.appendChild(d); }
    }
}

// ===== カード拡大プレビュー関連ロジック =====
function setupLongPress(element, cardData) {
    const start = (e) => {
        if (e.type === 'touchstart') e.stopPropagation();
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            openCardPreview(cardData);
        }, 500); // 500ms長押しで表示
    };

    const cancel = () => {
        clearTimeout(longPressTimer);
    };

    element.addEventListener('mousedown', start);
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
    element.addEventListener('touchend', cancel);
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openCardPreview(cardData);
        return false;
    });
}

function openCardPreview(card) {
    const modal = document.getElementById('card-preview-modal');
    const container = document.getElementById('preview-card-container');
    const nameEl = document.getElementById('preview-card-name');
    const skillLabel = document.getElementById('preview-card-skill-label');
    const descEl = document.getElementById('preview-card-desc');

    container.innerHTML = '';
    // スキル名から画像URLを特定（imgUrlがない場合のフォールバック）
    const cardImgUrl = card.imgUrl || `assets/card_${card.skill || 'none'}.jpg`;
    const cardClone = document.createElement('div');
    cardClone.className = 'card blue';
    cardClone.innerHTML = `
        <div class="card-bg" style="background-image: url('${cardImgUrl}'); filter: ${playerConfig.filter};"></div>
        <div class="card-power">${card.currentPower || card.power}</div>
    `;
    container.appendChild(cardClone);

    nameEl.innerText = card.name;
    const s = SKILLS[card.skill];
    if (s && card.skill !== 'none' && card.skill !== undefined) {
        skillLabel.style.display = 'inline-block';
        skillLabel.innerText = `${s.icon} ${s.name}`;
        descEl.innerText = s.desc;
    } else {
        skillLabel.style.display = 'none';
        descEl.innerText = '特殊能力なし。';
    }

    modal.style.display = 'flex';
    playSound(SOUNDS.seClick);
}

function closeCardPreview() {
    const modal = document.getElementById('card-preview-modal');
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
        playSound(SOUNDS.seClick);
    }
}

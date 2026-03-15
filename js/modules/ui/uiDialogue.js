// ==========================================
// UI Dialogue Logic (Dialogue & Sequences)
// ==========================================

function startNextBattleSequence() {
    if (gameMode !== 'story') return;
    if (battleCount > 7) {
        startEndingSequence();
        return;
    }
    let nextEnemyId = storyQueue[battleCount - 1];
    if (nextEnemyId === 'shadow') {
        enemyConfig = { ...playerConfig };
        enemyConfig.isShadow = true;
        enemyConfig.name = `影の${playerConfig.name}`;
    } else {
        const charId = nextEnemyId || 'android';
        enemyConfig = { ...CHARACTERS[charId] };
        enemyConfig.isShadow = false;
    }
    if (gameMode === 'story') {
        if (storyDifficulty === 1) aiLevel = 1;
        else if (storyDifficulty === 3) aiLevel = 3;
        else aiLevel = Math.min(3, Math.ceil(battleCount / 2.5));
        console.log(`Story Mode Battle: ${battleCount}, aiLevel set to: ${aiLevel} (Chosen: ${storyDifficulty})`);
    }
    appState = 'pre_dialogue';
    let introText = (enemyConfig.preBattleLine || "次は私がお相手よ。") + "\n" + getDialogue(enemyConfig, playerConfig, 'intro');
    if (enemyConfig.isShadow) introText = "・・・・";
    dialogueQueue = [
        { speaker: 'enemy', text: introText },
        { speaker: 'player', text: enemyConfig.isShadow ? (playerConfig.mirrorIntro || "なっ、自分自身だと……！？") : getDialogue(playerConfig, enemyConfig, 'intro') }
    ];
    if (enemyConfig.id === 'satan' && !enemyConfig.isShadow) {
        introText = "……よくぞここまで辿り着いたな。" + getDialogue(enemyConfig, playerConfig, 'intro');
        dialogueQueue[0].text = introText;
    }
    setupDialogueScreen();
}

function startEndingSequence() {
    appState = 'ending_dialogue';
    stopSound(SOUNDS.bgmTitle); stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle); stopSound(SOUNDS.bgmStageAndroid);
    playSound(SOUNDS.bgmEnding);
    dialogueQueue = playerConfig.dialogue.ending;
    currentDialogueIndex = 0;
    document.getElementById('portrait-left').src = playerConfig.image;
    document.getElementById('portrait-left').classList.add('active');
    document.getElementById('portrait-right').style.display = 'none';
    switchScreen('screen-dialogue');
    showNextDialogue(true);
}

function setupDialogueScreen() {
    isProcessing = false;
    currentDialogueIndex = 0;
    let pLeftImg = playerConfig.image;
    let pRightImg = enemyConfig.image;
    const portraitContainer = document.querySelector('.portrait-container');
    if (appState === 'story_intro' || appState === 'inter_battle_story') {
        portraitContainer.classList.add('center');
    } else {
        portraitContainer.classList.remove('center');
    }
    const pLeft = document.getElementById('portrait-left');
    const pRight = document.getElementById('portrait-right');

    // 一時的にアニメーションを無効化してリセット（ちらつき防止）
    pLeft.classList.add('no-transition');
    pRight.classList.add('no-transition');

    pLeft.classList.remove('active');
    pRight.classList.remove('active');

    // わずかな遅延の後にtransitionを戻す（レンダリング確定後）
    requestAnimationFrame(() => {
        pLeft.classList.remove('no-transition');
        pRight.classList.remove('no-transition');
    });
    if (appState === 'post_dialogue') {
        if (lastBattleResult === 'win') pRightImg = enemyConfig.imageLose;
        else if (lastBattleResult === 'lose') pLeftImg = playerConfig.imageLose;
    }
    pRight.src = pRightImg;
    pRight.style.display = 'block';
    if (enemyConfig.isShadow) pRight.style.filter = 'grayscale(1) brightness(0.6) contrast(1.2)';
    else pRight.style.filter = 'none';
    pLeft.src = pLeftImg;
    switchScreen('screen-dialogue');
    showNextDialogue(true);
}

function showNextDialogue(force = false) {
    if (isProcessing && !force) return;
    if (currentDialogueIndex >= dialogueQueue.length) {
        handleProgressionNextStep();
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
    } else if (cur.speaker === 'narrator') {
        nameEl.innerText = "Narrator"; nameEl.style.color = "#94a3b8";
        pLeft.classList.remove('active');
        pRight.classList.remove('active');
        box.style.borderColor = "#475569";
    } else {
        nameEl.innerText = enemyConfig.name; nameEl.style.color = enemyConfig.color;
        pRight.classList.add('active'); pLeft.classList.remove('active');
        box.style.borderColor = enemyConfig.color;
    }
    let text = cur.text;
    if (cur.speaker === 'enemy' && enemyConfig.isShadow) text = "・・・・";
    document.getElementById('dialogue-text').innerText = text;
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
    setTimeout(() => {
        if (gameMode === 'event_satan') {
            setupEventSatanConfrontation();
        } else {
            appState = 'pre_dialogue';
            let introText = (enemyConfig.preBattleLine || "次は私がお相手よ。") + "\n" + getDialogue(enemyConfig, playerConfig, 'intro');
            if (enemyConfig.isShadow) introText = "・・・・";
            dialogueQueue = [
                { speaker: 'enemy', text: introText },
                { speaker: 'player', text: enemyConfig.isShadow ? (playerConfig.mirrorIntro || "なっ、自分自身だと……！？") : getDialogue(playerConfig, enemyConfig, 'intro') }
            ];
            if (enemyConfig.id === 'satan' && !enemyConfig.isShadow) {
                introText = "……よくぞここまで辿り着いたな。" + getDialogue(enemyConfig, playerConfig, 'intro');
                dialogueQueue[0].text = introText;
            }
            setupDialogueScreen();
        }
    }, 2000);
}

function executeGameOver() {
    if (continueTimer) clearInterval(continueTimer);
    appState = 'title';
    stopAllBGM();
    switchScreen('screen-mode-select');
    playSound(SOUNDS.bgmTitle);
}

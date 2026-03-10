// ==========================================
// UIと画面制御ロジック
// ==========================================

// 初期ロード時に音量を復元
(function () {
    // gameVolumeが未定義の場合は初期値をセット
    if (typeof gameVolume === 'undefined') {
        window.gameVolume = 0.5;
    }
    const savedVol = localStorage.getItem('mini_card_battle_volume');
    if (savedVol !== null) {
        window.gameVolume = parseFloat(savedVol);
    }
})();

function goToModeSelect() {
    playSound(SOUNDS.seClick);
    playSound(SOUNDS.bgmTitle);
    switchScreen('screen-mode-select');
}

function showRules() {
    playSound(SOUNDS.seClick);
    rulesClickCount = 0; // 画面を開くたびにリセット
    switchScreen('screen-rules');
}

function showOptions() {
    playSound(SOUNDS.seClick);
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = gameVolume;
    switchScreen('screen-options');
}

function updateVolume(val) {
    gameVolume = parseFloat(val);
    // BGMの音量を即座に反映させる
    if (SOUNDS.bgmTitle) SOUNDS.bgmTitle.volume = gameVolume;
    if (SOUNDS.bgmBattle) SOUNDS.bgmBattle.volume = gameVolume;
    if (SOUNDS.bgmLastBattle) SOUNDS.bgmLastBattle.volume = gameVolume;
    if (SOUNDS.bgmEnding) SOUNDS.bgmEnding.volume = gameVolume;
    localStorage.setItem('mini_card_battle_volume', gameVolume);
}

function resetGameData() {
    playSound(SOUNDS.seClick);
    showConfirmModal(
        "本当に全てのデータを削除しますか？\nデッキと所持カードが初期化されます。(この操作は取り消せません)",
        () => {
            // localStorageの全削除（またはゲームに関連する物のみ）
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('mini_card_battle_')) {
                    localStorage.removeItem(key);
                }
            });
            playSound(SOUNDS.seDestroy);
            showAlertModal("データをリセットしました。タイトルに戻ります。", () => {
                location.reload();
            });
        }
    );
}

let rulesClickCount = 0;
function debugUnlockCards() {
    rulesClickCount++;
    if (rulesClickCount >= 10) {
        rulesClickCount = 0;
        CARD_MASTER.forEach(card => {
            if (!card.isToken) {
                playerInventory[card.id] = 4;
            }
        });
        saveDeck();
        playSound(SOUNDS.seSkill);
        showAlertModal("デバッグモード：全カードを4枚所持状態にしました！");
    }
}

function goBackFromSelect() {
    playSound(SOUNDS.seClick);
    if (appState === 'select_enemy') {
        appState = 'select_player';
        document.getElementById('select-title').innerText = "キャラクター選択";
        initSelectScreen(false);
    } else {
        switchScreen('screen-mode-select');
    }
}

function goBackFromDifficulty() {
    playSound(SOUNDS.seClick);
    appState = 'select_enemy';
    document.getElementById('select-title').innerText = "対戦相手";
    initSelectScreen(true);
    switchScreen('screen-select');
}

function goBackFromStage() {
    playSound(SOUNDS.seClick);
    appState = 'select_difficulty';
    switchScreen('screen-difficulty');
}

function startGameMode(mode) {
    playSound(SOUNDS.seClick);
    gameMode = mode;
    document.getElementById('select-title').innerText = "キャラクター選択";
    appState = 'select_player';
    initSelectScreen(false);
    switchScreen('screen-select');
}

// 演出用ユーティリティ
async function performFadeTransition(action) {
    if (isProcessing) return;
    isProcessing = true;
    try {
        const fade = document.getElementById('fade-overlay');
        const portraitContainer = document.querySelector('.portrait-container');
        const portraits = document.querySelectorAll('.char-portrait');

        if (fade) fade.classList.add('active');

        // 暗転完了まで待機
        await sleep(500);

        // 配置換えの瞬間にコンテナを完全に消去（レンダリングツリーから除外）
        if (portraitContainer) {
            portraitContainer.style.display = 'none';
            portraits.forEach(p => {
                p.style.transition = 'none';
            });
        }

        if (action) action();

        // 描画更新と配置の確定を待機（レイアウト再計算を促す）
        await new Promise(resolve => requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 80);
            });
        }));

        // 配置が完了した状態で再表示
        if (portraitContainer) {
            portraitContainer.style.display = 'flex';
        }

        // 暗転解除開始
        if (fade) fade.classList.remove('active');

        // フェードイン完了後にtransitionを元に戻す
        await sleep(500);
        if (portraits) {
            portraits.forEach(p => {
                p.style.transition = '';
            });
        }
    } finally {
        isProcessing = false;
    }
}

function initSelectScreen(includeSatan) {
    const grid = document.getElementById('char-grid');
    grid.innerHTML = '';
    // 相手選択時のみ「ランダム」を追加
    if (includeSatan) {
        const randomEl = document.createElement('div');
        randomEl.className = 'char-card';
        randomEl.style.backgroundColor = '#000000';
        randomEl.style.backgroundImage = 'none';
        randomEl.innerHTML = `
            <div style="position: absolute; width: 150%; height: 150%; top: -25%; left: -25%; background: radial-gradient(circle, rgba(255,255,255,0.4) 10%, rgba(255,255,255,0) 60%); filter: blur(10px); pointer-events: none;"></div>
            <div class="char-name" style="color:#ffffff; z-index: 2;">ランダム</div>
        `;
        randomEl.onclick = () => {
            playSound(SOUNDS.seClick);
            const selectableIds = Object.keys(CHARACTERS).filter(id => id !== 'satan');
            const randomId = selectableIds[Math.floor(Math.random() * selectableIds.length)];
            enemyConfig = CHARACTERS[randomId];
            appState = 'select_difficulty';
            switchScreen('screen-difficulty');
        };
        grid.appendChild(randomEl);
    }

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

    // 使いやすさ表示
    const easeEl = document.getElementById('detail-char-ease');
    if (char.easeOfUse) {
        const filled = '★'.repeat(char.easeOfUse);
        const empty = '☆'.repeat(3 - char.easeOfUse);
        easeEl.innerText = '使いやすさ: ' + filled + empty;
        easeEl.style.display = 'block';
    } else {
        easeEl.style.display = 'none';
    }

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
        if (gameMode === 'story') {
            initStoryMode(pendingCharId);
        } else {
            playerConfig = CHARACTERS[pendingCharId];
            appState = 'select_enemy';
            document.getElementById('select-title').innerText = "対戦相手";
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
    appState = 'select_stage';
    initStageSelectScreen();
    switchScreen('screen-stage-select');
}

function initStageSelectScreen() {
    const grid = document.getElementById('stage-grid');
    grid.innerHTML = '';

    const stages = [
        { id: 'random', name: 'ランダム' },
        ...Object.values(STAGES)
    ];

    stages.forEach(s => {
        const d = document.createElement('div');
        d.className = 'char-card';
        if (s.id === 'random') {
            d.style.backgroundColor = '#000000';
            d.style.backgroundImage = 'none';
            d.innerHTML = `
                <div style="position: absolute; width: 150%; height: 150%; top: -25%; left: -25%; background: radial-gradient(circle, rgba(255,255,255,0.4) 10%, rgba(255,255,255,0) 60%); filter: blur(10px); pointer-events: none;"></div>
                <div class="char-name" style="color:#ffffff; z-index: 2;">${s.name}</div>
            `;
        } else {
            d.style.backgroundImage = `url('assets/background_${s.id}.png')`;
            d.innerHTML = `<div class="char-name" style="color:#ffffff">${s.name}</div>`;
        }

        d.onclick = () => confirmStageSelect(s.id);
        grid.appendChild(d);
    });
}

function confirmStageSelect(stageId) {
    playSound(SOUNDS.seClick);

    if (stageId === 'random') {
        const bgIds = Object.keys(STAGES);
        selectedStageId = bgIds[Math.floor(Math.random() * bgIds.length)];
    } else {
        selectedStageId = stageId;
    }

    battleCount = 1;
    appState = 'pre_dialogue';
    dialogueQueue = [
        { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'intro') },
        { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'intro') }
    ];
    setupDialogueScreen();
}

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
        aiLevel = Math.min(3, battleCount);
    }

    appState = 'pre_dialogue';

    let introText = (enemyConfig.preBattleLine || "次は私がお相手よ。") + "\n" + getDialogue(enemyConfig, playerConfig, 'intro');

    if (enemyConfig.isShadow) {
        introText = "・・・・";
    }

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
    isProcessing = false; // 会話開始時に必ずフラグをリセット
    currentDialogueIndex = 0;
    let pLeftImg = playerConfig.image;
    let pRightImg = enemyConfig.image;

    // 配置を確定
    const portraitContainer = document.querySelector('.portrait-container');
    if (appState === 'story_intro' || appState === 'inter_battle_story') {
        portraitContainer.classList.add('center');
    } else {
        portraitContainer.classList.remove('center');
    }

    // 各ポートレートの画像ソースと表示状態を準備
    const pLeft = document.getElementById('portrait-left');
    const pRight = document.getElementById('portrait-right');

    // 一旦アクティブ状態を解除
    pLeft.classList.remove('active');
    pRight.classList.remove('active');

    if (appState === 'post_dialogue') {
        if (lastBattleResult === 'win') pRightImg = enemyConfig.imageLose;
        else if (lastBattleResult === 'lose') pLeftImg = playerConfig.imageLose;
    }

    pRight.src = pRightImg;
    pRight.style.display = 'block';

    // シャドウ用のグレー表示
    if (enemyConfig.isShadow) {
        pRight.style.filter = 'grayscale(1) brightness(0.6) contrast(1.2)';
    } else {
        pRight.style.filter = 'none';
    }

    pLeft.src = pLeftImg;

    switchScreen('screen-dialogue');
    showNextDialogue(true);
}

function showNextDialogue(force = false) {
    if (isProcessing && !force) return;
    if (currentDialogueIndex >= dialogueQueue.length) {
        processStoryNextStep();
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
    if (cur.speaker === 'enemy' && enemyConfig.isShadow) {
        text = "・・・・";
    }
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

    setTimeout(() => {
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
    }, 2000);
}

function executeGameOver() {
    if (continueTimer) clearInterval(continueTimer);
    appState = 'title';
    stopAllBGM();
    switchScreen('screen-mode-select');
    playSound(SOUNDS.bgmTitle);
}

function returnToTitle() {
    showConfirmModal(
        "バトルを中断してタイトルに戻りますか？",
        () => {
            stopAllBGM();
            appState = 'title';
            switchScreen('screen-mode-select');
            playSound(SOUNDS.bgmTitle);
        }
    );
}

// カードのDOMと描画関係（バトル画面UIへの反映）
function updateCardDetail(c) {
    const b = document.getElementById('card-detail-view');
    if (!c) {
        if (isDiscardingMode) {
            b.innerHTML = `<div class="skill-info" style="color:#facc15; font-weight:bold;">捨てるカードを${discardMaxCount}枚まで選んでください</div>`;
        } else {
            b.innerHTML = '';
        }
        b.style.color = isDiscardingMode ? '#facc15' : '#94a3b8';
    } else {
        let skillsToShow = [];
        if (c.skill && c.skill !== 'none' && c.skill !== undefined) {
            skillsToShow.push({ id: c.skill, value: c.skillValue });
        }
        if (Array.isArray(c.skills)) {
            skillsToShow = skillsToShow.concat(c.skills);
        }

        // 拘束（スタン）状態も反映
        if (c.stunTurns > 0) {
            skillsToShow.push({ id: 'defender', value: null });
        }

        // レアリティに応じた色
        const rarityColors = { 1: '#cd7f32', 2: '#e2e8f0', 3: '#facc15' };
        const rarColor = rarityColors[c.rarity] || '#fff';

        let html = '<div class="card-detail-content">';
        if (skillsToShow.length > 0) {
            skillsToShow.forEach(sk => {
                const s = SKILLS[sk.id];
                if (s) {
                    const isBind = (sk.id === 'defender' && c.stunTurns > 0);
                    const skillName = isBind ? '拘束' : s.name;
                    const val = isBind ? '' : (sk.value ?? '');
                    const skillEffect = typeof s.desc === 'function' ? s.desc(sk.value) : s.desc;

                    html += `<div class="skill-header">
                        <div class="card-skill-tag" style="background:${isBind ? '#475569' : ''}; border-color:${isBind ? '#ef4444' : ''}; color:${isBind ? '#fca5a5' : ''};">
                            ${s.icon} ${skillName}${val}
                        </div>
                    </div>
                    <div class="skill-desc">${skillEffect}</div>`;
                }
            });
        } else {
            html += `<div class="skill-desc">能力なし</div>`;
        }

        html += '</div>';
        b.innerHTML = html;
        b.style.color = '#fff';
    }
}

function createCardDOM(c, isBoard = false) {
    const rarityClass = c.rarity ? ` rarity-${c.rarity}` : '';
    const d = document.createElement('div'); d.className = `card ${c.owner}${rarityClass}`;
    let sH = renderSkillTag(c, isBoard);

    // シャドウ戦のカードはグレーにする
    let filter = c.filter;
    if (c.owner === 'red' && enemyConfig.isShadow) {
        filter = 'grayscale(1) brightness(0.7) contrast(1.2)';
    }

    // 拘束（スタン）状態のビジュアルフィードバック
    if (c.stunTurns > 0) {
        filter = (filter || '') + ' grayscale(1) brightness(0.5)';
    }

    // 画像のフォールバック
    const imgUrl = c.imgUrl || (c.id && !c.id.includes('_') ? `assets/card_${c.id}.jpg` : 'assets/card_none_backup.jpg');

    d.innerHTML = `
        <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${filter};"></div>
        ${sH}
        <div class="card-power">${c.currentPower}</div>
    `;
    return d;
}

function renderHand() {
    const e = document.getElementById('player-hand'); e.innerHTML = '';
    playerHand.forEach((c, i) => {
        const d = createCardDOM(c, false); d.className += " hand-card" + (i === selectedCardIndex ? " selected" : "");
        d.onclick = () => {
            if (isProcessing && !isDiscardingMode) return;
            playSound(SOUNDS.seClick);
            if (selectedCardIndex === i) {
                selectedCardIndex = null;
                updateCardDetail(null);
            } else {
                selectedCardIndex = i;
                selectedBoardLaneIndex = null;
                selectedBoardSide = null;
                updateCardDetail(playerHand[i]);
            }
            renderHand();
            renderBoard();
            highlightLanes();
        };
        setupLongPress(d, c);
        e.appendChild(d);
    });
}

function highlightLanes() {
    document.querySelectorAll('#player-lanes .cell').forEach((c, i) => {
        if (selectedCardIndex === null) {
            c.classList.remove('highlight');
        } else {
            const card = playerHand[selectedCardIndex];
            if (hasSkill(card, 'legendary')) {
                // 伝説カードなら中央（インデックス1）のみハイライト
                if (i === 1) c.classList.add('highlight');
                else c.classList.remove('highlight');
            } else {
                // 通常カードなら全てハイライト
                c.classList.add('highlight');
            }
        }
    });
}

function renderBoard() {
    for (let i = 0; i < 3; i++) {
        const p = document.querySelector(`#player-lanes .cell[data-lane="${i}"]`), e = document.querySelector(`#enemy-lanes .cell[data-lane="${i}"]`);
        p.innerHTML = ''; p.className = 'cell'; e.innerHTML = ''; e.className = 'cell';

        // プレイヤー側
        if (playerBoard[i]) {
            const d = createCardDOM(playerBoard[i], true);
            if (selectedBoardLaneIndex === i && selectedBoardSide === 'player') d.classList.add('selected');
            d.onclick = (ev) => {
                // 手札カードが選択中(isProcessing)はクリックをセルに伝播させる
                if (selectedCardIndex !== null || (isProcessing && !isDiscardingMode)) return;
                ev.stopPropagation();
                playSound(SOUNDS.seClick);
                if (selectedBoardLaneIndex === i && selectedBoardSide === 'player') {
                    selectedBoardLaneIndex = null;
                    selectedBoardSide = null;
                    updateCardDetail(null);
                } else {
                    selectedBoardLaneIndex = i;
                    selectedBoardSide = 'player';
                    selectedCardIndex = null;
                    updateCardDetail(playerBoard[i]);
                }
                renderBoard();
                renderHand();
            };
            setupLongPress(d, playerBoard[i]);
            p.appendChild(d);
        }

        // 敵側
        if (enemyBoard[i]) {
            const d = createCardDOM(enemyBoard[i], true);
            if (selectedBoardLaneIndex === i && selectedBoardSide === 'enemy') d.classList.add('selected');
            d.onclick = (ev) => {
                if (selectedCardIndex !== null || (isProcessing && !isDiscardingMode)) return;
                ev.stopPropagation();
                playSound(SOUNDS.seClick);
                if (selectedBoardLaneIndex === i && selectedBoardSide === 'enemy') {
                    selectedBoardLaneIndex = null;
                    selectedBoardSide = null;
                    updateCardDetail(null);
                } else {
                    selectedBoardLaneIndex = i;
                    selectedBoardSide = 'enemy';
                    selectedCardIndex = null;
                    updateCardDetail(enemyBoard[i]);
                }
                renderBoard();
                renderHand();
            };
            setupLongPress(d, enemyBoard[i]);
            e.appendChild(d);
        }
    }
}

// ===== カード拡大プレビュー関連ロジック =====
function setupLongPress(element, cardData) {
    let startX = 0;
    let startY = 0;

    const start = (e) => {
        if (e.type === 'touchstart') {
            e.stopPropagation();
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }

        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            openCardPreview(cardData);
        }, 500); // 500ms長押しで表示
    };

    const move = (e) => {
        if (!longPressTimer) return;
        let currentX = 0;
        let currentY = 0;

        if (e.type === 'touchmove') {
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
        } else {
            currentX = e.clientX;
            currentY = e.clientY;
        }

        const deltaX = Math.abs(currentX - startX);
        const deltaY = Math.abs(currentY - startY);

        // 10px以上動いたらスクロールとみなしてキャンセル
        if (deltaX > 10 || deltaY > 10) {
            cancel();
        }
    };

    const cancel = () => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    };

    element.addEventListener('mousedown', start);
    element.addEventListener('touchstart', start, { passive: true });

    element.addEventListener('mousemove', move);
    element.addEventListener('touchmove', move, { passive: true });

    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
    element.addEventListener('touchend', cancel);
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openCardPreview(cardData);
        return false;
    });
}

// プレビュー表示の更新（共通処理）
function populateCardPreview(prefix, card) {
    const container = document.getElementById(`${prefix}-card-container`);
    const nameEl = document.getElementById(`${prefix}-card-name`);
    const skillLabel = document.getElementById(`${prefix}-card-skill-label`);
    const descEl = document.getElementById(`${prefix}-card-desc`);
    const flavorEl = document.getElementById(`${prefix}-card-flavor`);

    if (container) {
        container.innerHTML = '';
        const cardImgUrl = card.imgUrl || `assets/card_${card.id}.jpg`;
        const cardClone = document.createElement('div');
        const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
        cardClone.className = `card blue${rarityClass}`;

        // 拡大表示用にサイズを明示（style.cssの基準に合わせる）
        cardClone.style.width = "180px";
        cardClone.style.height = "240px";

        cardClone.innerHTML = `
            <div class="card-bg" style="background-image: url('${cardImgUrl}'); filter: ${playerConfig.filter};"></div>
            <div class="card-power">${card.currentPower || card.power}</div>
        `;
        container.appendChild(cardClone);
    }

    if (nameEl) {
        nameEl.innerText = card.name;
        const rarityColors = { 1: '#cd7f32', 2: '#e2e8f0', 3: '#facc15' };
        nameEl.style.color = rarityColors[card.rarity] || '#fff';
    }

    const skillsList = document.getElementById(`${prefix}-skills-list`);

    if (skillsList) {
        skillsList.innerHTML = '';
        let skillsToShow = [];
        if (card.skill && card.skill !== 'none' && card.skill !== undefined) {
            skillsToShow.push({ id: card.skill, value: card.skillValue });
        }
        if (Array.isArray(card.skills)) {
            skillsToShow = skillsToShow.concat(card.skills);
        }

        if (skillsToShow.length > 0) {
            skillsToShow.forEach(sk => {
                const s = SKILLS[sk.id];
                if (s) {
                    const item = document.createElement('div');
                    item.className = 'preview-skill-item';
                    const val = sk.value === null || sk.value === undefined ? '' : sk.value;
                    const desc = typeof s.desc === 'function' ? s.desc(sk.value) : s.desc;

                    item.innerHTML = `
                        <div class="preview-skill-badge">${s.icon} ${s.name}${val}</div>
                        <p class="preview-skill-desc">${desc}</p>
                    `;
                    skillsList.appendChild(item);
                }
            });
        } else {
            skillsList.innerHTML = '<p class="preview-skill-desc">能力なし</p>';
        }
    }

    if (flavorEl) {
        if (card.flavor) {
            flavorEl.innerText = card.flavor;
            flavorEl.style.display = 'block';
        } else {
            flavorEl.innerText = '';
            flavorEl.style.display = 'none';
        }
    }
}

function openCardPreview(card) {
    const modal = document.getElementById('card-preview-modal');
    populateCardPreview('preview', card);
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
function showDeckRefreshEffect(owner) {
    const battleScreen = document.getElementById('screen-battle');
    if (!battleScreen) return;

    const effectEl = document.createElement('div');
    effectEl.className = 'deck-refresh-effect';
    effectEl.innerText = 'DECK REFRESH';

    // 配置位置（プレイヤー側か敵側か）
    if (owner === 'blue') {
        effectEl.style.bottom = '25%';
    } else {
        effectEl.style.top = '25%';
    }

    battleScreen.appendChild(effectEl);

    // アニメーション終了後に削除
    setTimeout(() => {
        if (effectEl.parentNode) {
            effectEl.parentNode.removeChild(effectEl);
        }
    }, 1500);
}

// --- カスタムモーダル制御 ---
function showConfirmModal(message, onConfirm, onCancel = null) {
    let modal = document.getElementById('modal-confirm');
    if (!modal) {
        const div = document.createElement('div');
        div.innerHTML = UI_TEMPLATES.confirmModal;
        document.body.appendChild(div.firstElementChild);
        modal = document.getElementById('modal-confirm');
    }

    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    titleEl.textContent = "確認";
    msgEl.textContent = message;
    cancelBtn.style.display = "block";
    okBtn.textContent = "OK";

    playSound(SOUNDS.seClick);
    modal.style.display = 'flex';

    // アニメーションを再発火させるためのハック
    const box = modal.querySelector('.skill-modal-box');
    if (box) {
        box.classList.remove('modal-pop-animation');
        void box.offsetWidth; // reflow
        box.classList.add('modal-pop-animation');
    }

    okBtn.onclick = () => {
        playSound(SOUNDS.seClick);
        modal.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        playSound(SOUNDS.seClick);
        modal.style.display = 'none';
        if (onCancel) onCancel();
    };
}

function showAlertModal(message, onClose = null) {
    let modal = document.getElementById('modal-confirm');
    if (!modal) {
        const div = document.createElement('div');
        div.innerHTML = UI_TEMPLATES.confirmModal;
        document.body.appendChild(div.firstElementChild);
        modal = document.getElementById('modal-confirm');
    }

    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    titleEl.textContent = "お知らせ";
    msgEl.textContent = message;
    cancelBtn.style.display = "none";
    okBtn.textContent = "閉じる";

    playSound(SOUNDS.seClick);
    modal.style.display = 'flex';

    // アニメーションを再発火させるためのハック
    const box = modal.querySelector('.skill-modal-box');
    if (box) {
        box.classList.remove('modal-pop-animation');
        void box.offsetWidth; // reflow
        box.classList.add('modal-pop-animation');
    }

    okBtn.onclick = () => {
        playSound(SOUNDS.seClick);
        modal.style.display = 'none';
        if (onClose) onClose();
    };
}

// --- 報酬システム ---
let pendingRewardCard = null;

function showCardReward(enemyId) {
    let recipe = ENEMY_DECKS[enemyId] || ENEMY_DECKS.android;
    let enemyDeckIds = Array.isArray(recipe) ? recipe : (recipe.normal || []);
    const eligibleIds = [...new Set(enemyDeckIds)].filter(id => {
        const owned = playerInventory[id] || 0;
        return owned < 4;
    });

    if (eligibleIds.length === 0) {
        setupDialogueScreen();
        return;
    }

    const rewardId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
    pendingRewardCard = { ...CARD_MASTER.find(m => m.id === rewardId) };

    // 報酬画面の準備
    populateCardPreview('reward', pendingRewardCard);

    // 公開前の状態にマスク
    const nameEl = document.getElementById('reward-card-name');
    const skillsList = document.getElementById('reward-skills-list');
    const flavorEl = document.getElementById('reward-card-flavor');
    const mask = document.getElementById('reward-mask');
    const nextBtn = document.getElementById('btn-reward-next');

    nameEl.innerText = "???";
    nameEl.style.color = "#fff";
    skillsList.innerHTML = '<p class="preview-skill-desc">クリックしてカードを公開</p>';
    flavorEl.innerText = "";

    mask.style.display = 'flex';
    nextBtn.style.display = 'none';

    document.getElementById('screen-reward').classList.add('active');
}

function revealRewardCard() {
    const mask = document.getElementById('reward-mask');
    if (mask.style.display === 'none') return;

    mask.style.display = 'none';
    playSound(SOUNDS.seClick);

    // 本来の情報を表示
    populateCardPreview('reward', pendingRewardCard);

    document.getElementById('btn-reward-next').style.display = 'block';

    // インベントリの更新
    playerInventory[pendingRewardCard.id] = (playerInventory[pendingRewardCard.id] || 0) + 1;
    saveDeck();
}

function closeRewardScreen() {
    playSound(SOUNDS.seClick);
    document.getElementById('screen-reward').classList.remove('active');
    setupDialogueScreen();
}

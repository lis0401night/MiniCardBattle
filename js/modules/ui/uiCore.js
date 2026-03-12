// ==========================================
// UI Core Logic (Navigation & Global Settings)
// ==========================================

// 初期ロード時に音量を復元
(function () {
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

function showSyncDataModal() {
    playSound(SOUNDS.seClick);
    const modal = document.getElementById('screen-sync-data');
    if (modal) modal.style.display = 'flex';
}

function closeSyncDataModal() {
    playSound(SOUNDS.seClick);
    const modal = document.getElementById('screen-sync-data');
    if (modal) modal.style.display = 'none';
}

function backupDataToXML() {
    playSound(SOUNDS.seClick);
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<GameData>\n';
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mini_card_battle_')) {
            const val = localStorage.getItem(key);
            const escapedVal = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            xml += `  <Entry key="${key}">${escapedVal}</Entry>\n`;
        }
    }
    xml += '</GameData>';

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mini_card_battle_backup_${new Date().toISOString().split('T')[0]}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importDataFromXML() {
    playSound(SOUNDS.seClick);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) {
            document.body.removeChild(input);
            return;
        }

        const reader = new FileReader();
        reader.onload = e => {
            try {
                const content = e.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(content, 'text/xml');
                const entries = xmlDoc.getElementsByTagName('Entry');

                if (entries.length === 0) {
                    showAlertModal("有効なバックアップデータが見つかりませんでした。");
                    return;
                }

                showConfirmModal(
                    "データを上書きしてよろしいですか？\n取り込んだデータで現在の進行状況が上書きされ、自動的にリロードされます。",
                    () => {
                        for (let i = 0; i < entries.length; i++) {
                            const key = entries[i].getAttribute('key');
                            const val = entries[i].textContent;
                            if (key) localStorage.setItem(key, val);
                        }
                        location.reload();
                    }
                );
            } catch (err) {
                console.error("Import error:", err);
                showAlertModal("ファイルのパースに失敗しました。正しいXMLファイルか確認してください。");
            } finally {
                if (document.body.contains(input)) document.body.removeChild(input);
            }
        };
        reader.onerror = () => {
            showAlertModal("ファイルの読み込みに失敗しました。");
            if (document.body.contains(input)) document.body.removeChild(input);
        };
        reader.readAsText(file);
    };

    input.click();
}

function reloadGame() {
    playSound(SOUNDS.seClick);
    const url = new URL(window.location.href);
    url.searchParams.set('reload', Date.now());
    window.location.href = url.toString();
}

let rulesClickCount = 0;
let optionsTitleClickCount = 0;

function handleOptionsTitleClick() {
    optionsTitleClickCount++;
    if (optionsTitleClickCount >= 10) {
        optionsTitleClickCount = 0;
        // 意図的にエラーを発生させる
        const error = new Error("Debug: Intentional error triggered by clicking options title 10 times.");
        window.onerror(error.message, window.location.href, 0, 0, error);
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
    if (gameMode === 'story') {
        appState = 'select_player';
        document.getElementById('select-title').innerText = "キャラクター選択";
        initSelectScreen(false);
        switchScreen('screen-select');
    } else {
        appState = 'select_enemy';
        document.getElementById('select-title').innerText = "対戦相手";
        initSelectScreen(true);
        switchScreen('screen-select');
    }
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

async function performFadeTransition(action) {
    if (isProcessing) return;
    isProcessing = true;
    try {
        const fade = document.getElementById('fade-overlay');
        const portraitContainer = document.querySelector('.portrait-container');
        const portraits = document.querySelectorAll('.char-portrait');

        if (fade) fade.classList.add('active');
        await sleep(500);

        if (portraitContainer) {
            portraitContainer.style.display = 'none';
            portraits.forEach(p => {
                p.style.transition = 'none';
            });
        }

        if (action) action();

        await new Promise(resolve => requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 80);
            });
        }));

        if (portraitContainer) {
            portraitContainer.style.display = 'flex';
        }

        if (fade) fade.classList.remove('active');

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
            appState = 'select_difficulty';
            switchScreen('screen-difficulty');
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

function confirmDifficulty(level) {
    playSound(SOUNDS.seClick);
    aiLevel = level;
    storyDifficulty = level;
    if (gameMode === 'story') {
        initStoryMode(pendingCharId);
    } else {
        appState = 'select_stage';
        initStageSelectScreen();
        switchScreen('screen-stage-select');
    }
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

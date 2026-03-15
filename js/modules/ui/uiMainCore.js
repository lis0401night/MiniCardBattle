/**
 * Mini Card Battle - UI Core (uiMainCore.js)
 * VERSION: 1.2
 */

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

console.log("!!! uiMainCore.js Version 1.2 Loaded !!!");

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
    location.reload();
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
    if (gameMode === 'defense_register') {
        switchScreen('screen-defense-menu');
    } else if (appState === 'select_enemy') {
        appState = 'select_player';
        document.getElementById('select-title').innerText = "キャラクター選択";
        initSelectScreen(false);
        switchScreen('screen-select');
    } else {
        switchScreen('screen-mode-select');
    }
}

function goBackFromDifficulty() {
    playSound(SOUNDS.seClick);
    if (gameMode === 'defense_register') {
        switchScreen('screen-defense-menu');
    } else if (gameMode === 'story') {
        appState = 'select_player';
        document.getElementById('select-title').innerText = "キャラクター選択";
        initSelectScreen(false);
        switchScreen('screen-select');
    } else {
        appState = 'select_enemy';
        document.getElementById('select-title').innerText = "対戦相手";
        initSelectScreen(false);
        switchScreen('screen-select');
    }
}

function goBackFromStage() {
    playSound(SOUNDS.seClick);
    if (gameMode === 'defense_register') {
        appState = 'select_player';
        document.getElementById('select-title').innerText = "防衛キャラクター選択";
        initSelectScreen(false);
        switchScreen('screen-select');
    } else {
        appState = 'select_difficulty';
        switchScreen('screen-difficulty');
    }
}

function goBackFromDeckEdit() {
    playSound(SOUNDS.seClick);
    if (gameMode === 'defense_register') {
        // ステージ選択に戻る
        appState = 'select_stage';
        initStageSelectScreen();
        switchScreen('screen-stage-select');
    } else if (gameMode === 'defense_attack') {
        // キャラクター選択に戻る（攻撃開始フローでは対戦相手選択は固定されているため）
        appState = 'select_player';
        document.getElementById('select-title').innerText = "キャラクター選択";
        initSelectScreen(false);
        switchScreen('screen-select');
    } else if (gameMode === 'story') {
        // 難易度選択に戻る
        appState = 'select_difficulty';
        switchScreen('screen-difficulty');
    } else if (gameMode === 'event_satan') {
        // 高難易度画面に戻る
        switchScreen('screen-high-difficulty');
    } else {
        // フリー対戦など：ステージ選択に戻る
        appState = 'select_stage';
        initStageSelectScreen();
        switchScreen('screen-stage-select');
    }
}

function startGameMode(mode) {
    playSound(SOUNDS.seClick);
    gameMode = mode;
    document.getElementById('select-title').innerText = "キャラクター選択";
    appState = 'select_player';
    initSelectScreen(mode === 'event_satan' ? false : false); // Satan is not selectable in either for now
    switchScreen('screen-select');
}

async function performFadeTransition(action) {
    if (isProcessing) {
        if (typeof debugLog === 'function') debugLog("Fade blocked: isProcessing is true");
        return;
    }
    isProcessing = true;
    const fade = document.getElementById('app-fade-layer') || document.getElementById('fade-overlay');

    try {
        if (typeof debugLog === 'function') debugLog("Fade Start (V2)");
        if (fade) {
            fade.style.display = 'block';
            // Force reflow
            fade.offsetHeight;
            fade.classList.add('active');
        }

        await sleep(650);

        if (action) {
            try {
                if (typeof debugLog === 'function') debugLog("Action Start...");
                await action();
                if (typeof debugLog === 'function') debugLog("Action Complete.");
            } catch (err) {
                console.error("Action Error:", err);
                if (typeof debugLog === 'function') debugLog("ACTION ERROR: " + err.message);
            }
        }

        // Wait for DOM
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));

        if (fade) {
            fade.classList.remove('active');
            // Wait for transition
            await sleep(650);
            fade.style.display = 'none';
        }

        // Nuclear cleanup
        document.querySelectorAll('.fade-overlay').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });

    } catch (e) {
        console.error("Fade failed:", e);
    } finally {
        if (typeof debugLog === 'function') debugLog("Fade End.");
        isProcessing = false;
        // Final safety unlock
        if (fade) {
            fade.classList.remove('active');
            fade.style.display = 'none';
        }
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

function showEventMenu() {
    playSound(SOUNDS.seClick);
    switchScreen('screen-event-menu');
}

function startHighDifficulty() {
    playSound(SOUNDS.seClick);
    performFadeTransition(() => {
        switchScreen('screen-high-difficulty');
    });
}

function showHighDifficultyRules() {
    playSound(SOUNDS.seClick);
    performFadeTransition(() => {
        switchScreen('screen-high-difficulty-rules');
    });
}

function handleSatanBattle() {
    playSound(SOUNDS.seClick);
    // サタン戦開始時、まずはキャラクター選択画面へ
    startGameMode('event_satan');
}

function showDefenseMenu() {
    playSound(SOUNDS.seClick);
    const hasRegistered = localStorage.getItem('mini_card_battle_deck_defense') !== null;
    const startBtn = document.getElementById('btn-start-attack');
    const disabledBtn = document.getElementById('btn-start-attack-disabled');

    if (startBtn && disabledBtn) {
        if (hasRegistered) {
            startBtn.style.display = 'block';
            disabledBtn.style.display = 'none';
        } else {
            startBtn.style.display = 'none';
            disabledBtn.style.display = 'block';
        }
    }
    switchScreen('screen-defense-menu');
}

async function showDefenseBattleList() {
    playSound(SOUNDS.seClick);
    const listContainer = document.getElementById('defense-player-list');
    listContainer.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px;">読み込み中...</div>';
    switchScreen('screen-defense-battle-list');

    try {
        const response = await fetch('api/get_player_decks.php');
        const result = await response.json();

        if (result.success) {
            listContainer.innerHTML = '';
            const myUuid = getOrCreateUUID();
            const players = result.players.filter(p => p.uuid !== myUuid);

            if (players.length === 0) {
                listContainer.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px;">対戦相手がいません</div>';
                return;
            }

            players.forEach(p => {
                const char = CHARACTERS[p.character] || CHARACTERS.android;
                const banner = document.createElement('button');
                banner.className = 'btn-banner';
                banner.style.borderColor = '#cd7f32'; // ブロンズカードと同じ色
                banner.innerHTML = `
                    <img src="${char.icon}" class="banner-icon">
                    <span class="banner-text" style="color: ${char.color};">${p.name}</span>
                `;
                
                banner.onclick = () => startAttackBattle(p);
                listContainer.appendChild(banner);
            });
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error("Failed to fetch player list:", err);
        listContainer.innerHTML = '<div style="color:#ef4444; text-align:center; padding:20px;">読み込みに失敗しました</div>';
    }
}

async function startAttackBattle(enemyPlayerData) {
    playSound(SOUNDS.seClick);

    try {
        // デッキデータをロード（ENEMY_DECKS['player_defense']に登録される）
        await loadPlayerDeck(enemyPlayerData.uuid);
        
        gameMode = 'defense_attack';
        aiLevel = 3; // 防衛戦のAIは常にハード（レベル3）固定

        // 敵の設定を保存
        enemyConfig = { ...CHARACTERS[enemyPlayerData.character] || CHARACTERS.android };
        enemyConfig.playerName = enemyPlayerData.name;
        enemyConfig.uuid = enemyPlayerData.uuid;
        enemyConfig.stageId = enemyPlayerData.stage;
        selectedStageId = enemyPlayerData.stage || 'plain'; // バトル背景として設定

        // 自分のキャラクター選択から開始
        appState = 'select_player';
        document.getElementById('select-title').innerText = "自分のキャラクター選択";
        initSelectScreen(false);
        switchScreen('screen-select');
    } catch (err) {
        console.error("Failed to start attack battle:", err);
        showAlertModal("対戦データの読み込みに失敗しました。");
    }
}

function showDefenseRules() {
    playSound(SOUNDS.seClick);
    switchScreen('screen-defense-rules');
}

function startDefenseRegistration() {
    playSound(SOUNDS.seClick);
    gameMode = 'defense_register';
    appState = 'select_player';
    document.getElementById('select-title').innerText = "防衛キャラクター選択";
    initSelectScreen(false);
    switchScreen('screen-select');
}

function closePlayerNameModal() {
    playSound(SOUNDS.seClick);
    const modal = document.getElementById('modal-player-name');
    if (modal) modal.style.display = 'none';
}

function startDefenseBattle() {
    showDefenseMenu();
}

function confirmCharSelect() {
    playSound(SOUNDS.seClick);
    if (appState === 'select_player') {
        if (gameMode === 'story') {
            appState = 'select_difficulty';
            switchScreen('screen-difficulty');
        } else if (gameMode === 'event_satan') {
            // 高難易度サタン戦専用の導入へ
            initEventSatanMode(pendingCharId);
        } else if (gameMode === 'defense_register') {
            // 防衛登録：次はステージ選択
            playerConfig = CHARACTERS[pendingCharId];
            appState = 'select_stage';
            initStageSelectScreen();
            switchScreen('screen-stage-select');
        } else if (gameMode === 'defense_attack') {
            // 攻撃側：キャラクター選択後は対戦相手選択をスキップして即デッキ編成へ
            playerConfig = CHARACTERS[pendingCharId];
            startBattleFlow();
        } else {
            playerConfig = CHARACTERS[pendingCharId];
            appState = 'select_enemy';
            document.getElementById('select-title').innerText = "対戦相手";
            initSelectScreen(false);
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
    } else if (gameMode === 'defense_attack') {
        // 攻撃側：難易度選択の後はステージを敵の設定からロード（またはランダム）
        selectedStageId = enemyConfig.stageId || 'plain';
        startBattleFlow();
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

    if (gameMode === 'defense_register') {
        // 防衛登録：ステージ選択の次はデッキ編集
        startBattleFlow();
    } else {
        battleCount = 1;
        appState = 'pre_dialogue';
        dialogueQueue = [
            { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'intro') },
            { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'intro') }
        ];
        setupDialogueScreen();
    }
}

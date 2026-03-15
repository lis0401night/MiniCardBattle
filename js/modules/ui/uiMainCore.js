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

    Object.values(CHARACTERS).forEach(char => {
        if (char.id === 'satan') return;
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

async function showDefenseMenu() {
    playSound(SOUNDS.seClick);
    const hasRegistered = localStorage.getItem('mini_card_battle_deck_defense') !== null;
    const startBtn = document.getElementById('btn-start-attack');
    const disabledBtn = document.getElementById('btn-start-attack-disabled');

    // defenseWins表示要素があるか確認し、なければ作成・表示する
    let winsDisplay = document.getElementById('defense-wins-display');
    if (!winsDisplay) {
        winsDisplay = document.createElement('div');
        winsDisplay.id = 'defense-wins-display';
        winsDisplay.style.color = '#facc15';
        winsDisplay.style.fontSize = '1.1rem';
        winsDisplay.style.marginBottom = '20px';
        winsDisplay.style.fontWeight = 'bold';
        winsDisplay.style.textAlign = 'center';

        const title = document.querySelector('#screen-defense-menu h2');
        if (title) {
            title.insertAdjacentElement('afterend', winsDisplay);
        }
    }

    if (hasRegistered) {
        winsDisplay.innerText = 'データ取得中...';
    } else {
        winsDisplay.innerText = '';
    }

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

    if (hasRegistered) {
        try {
            const response = await fetch('api/get_player_decks.php');
            const result = await response.json();
            if (result.success) {
                const myUuid = getOrCreateUUID();
                const myData = result.players.find(p => p.uuid === myUuid);
                if (myData) {
                    const wins = myData.defense_wins || 0;
                    const pts = myData.points || 0;
                    winsDisplay.innerText = `防衛に ${wins} 回成功しました！\n(防衛戦ポイント: ${pts} Pt)`;
                    localStorage.setItem('mini_card_battle_defense_points', pts);
                    localStorage.setItem('mini_card_battle_defense_wins', wins);
                } else {
                    winsDisplay.innerText = '';
                }
            } else {
                winsDisplay.innerText = '';
            }
        } catch (e) {
            console.error(e);
            const localWins = localStorage.getItem('mini_card_battle_defense_wins') || 0;
            const localPts = localStorage.getItem('mini_card_battle_defense_points') || 0;
            winsDisplay.innerText = `防衛に ${localWins} 回成功しました！\n(防衛戦ポイント: ${localPts} Pt)`;
        }
    }
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

            // 自分のポイントを取得
            const myPoints = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;

            // ポイント降順でソート
            players.sort((a, b) => (b.points || 0) - (a.points || 0));

            players.forEach((p, index) => {
                const char = CHARACTERS[p.character] || CHARACTERS.android;
                const pPoints = p.points || 0;

                // 勝利時の獲得ポイント計算
                let winPoints = 1;
                if (pPoints >= myPoints * 2 && pPoints > 0) winPoints = 5;
                else if (pPoints > myPoints) winPoints = 3;

                // 順位による枠の色設定
                let borderColor = '#cd7f32'; // 4位以下 (ブロンズ)
                let extraClass = '';
                if (index === 0) {
                    extraClass = 'legendary';
                    borderColor = 'transparent'; // CSSでアニメーション境界線をつける想定
                } else if (index === 1) {
                    borderColor = '#facc15'; // 2位 (ゴールド)
                } else if (index === 2) {
                    borderColor = '#e2e8f0'; // 3位 (シルバー)
                }

                const banner = document.createElement('button');
                banner.className = `btn-banner ${extraClass}`;
                banner.style.borderColor = borderColor;
                banner.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <div style="display: flex; align-items: center;">
                            <img src="${char.icon}" class="banner-icon">
                            <span class="banner-text" style="color: ${char.color}; margin-right: 10px;">${p.name}</span>
                            <span style="color: #cbd5e1; font-size: 0.85rem;">(Pt: ${pPoints})</span>
                        </div>
                        <div style="color: #10b981; font-weight: bold; font-size: 0.9rem;">Win +${winPoints}</div>
                    </div>
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

// --- 交換所関連ロジック ---

let exchangeDebugClickCount = 0;

function showExchangeScreen() {
    playSound(SOUNDS.seClick);
    exchangeDebugClickCount = 0;
    switchScreen('screen-exchange');
    renderExchange();

    // デバッグ用：タイトル10回クリックで100pt付与
    const titleEl = document.getElementById('exchange-title');
    if (titleEl) {
        titleEl.onclick = () => {
            exchangeDebugClickCount++;
            if (exchangeDebugClickCount >= 10) {
                exchangeDebugClickCount = 0;
                playSound(SOUNDS.seSkill);
                let currentPoints = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
                let totalPoints = parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) || 0;
                currentPoints += 100;
                totalPoints += 100;
                localStorage.setItem('mini_card_battle_defense_points', currentPoints);
                localStorage.setItem('mini_card_battle_defense_total_points', totalPoints);
                showAlertModal("【デバッグ】ポイントを100Pt獲得しました！", () => renderExchange());
            }
        };
    }
}

function renderExchange() {
    const listContainer = document.getElementById('exchange-item-grid');
    const pointsDisplay = document.getElementById('exchange-points-display');
    if (!listContainer || !pointsDisplay) return;

    const currentPoints = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
    const totalPoints = parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) || 0;
    pointsDisplay.innerText = `所持ポイント: ${currentPoints} / 総ポイント: ${totalPoints}`;

    listContainer.innerHTML = '';

    EXCHANGE_LINEUP.forEach(itemInfo => {
        const itemObj = CARD_MASTER.find(c => c.id === itemInfo.id) || CARD_MASTER[0];

        // 状態をチェック（「所持上限到達・プレミアム取得済み」または「ポイント不足」）
        let canExchange = true;
        let isMaxed = false;
        let ownedCount = 0;

        if (itemInfo.type === 'premium') {
            if (unlockedPremiumCards.includes(itemInfo.id)) {
                canExchange = false;
                isMaxed = true;
            }
        } else if (itemInfo.type === 'card') {
            ownedCount = playerInventory[itemInfo.id] || 0;
            if (ownedCount >= 4) {
                canExchange = false;
                isMaxed = true;
            }
        }

        if (currentPoints < itemInfo.cost) {
            canExchange = false;
        }

        // バッジや所持数など
        const opacity = canExchange ? "1.0" : (isMaxed ? "0.3" : "0.6");
        const rarityClass = itemObj.rarity ? ` rarity-${itemObj.rarity}` : '';
        let imgUrl = getCardImgUrl(itemObj);
        if (itemInfo.type === 'premium') {
            imgUrl = imgUrl.replace('.jpg', '_premium.gif');
        }

        // バッジや所持数など
        const countBadge = itemInfo.type === 'card' ?
            `<div style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.85); color:#facc15; padding:1px 6px; border-radius:10px; font-weight:bold; font-size:0.75rem; z-index:6; border:1px solid #facc15;">${ownedCount}/4</div>` : '';

        const itemEl = document.createElement('div');
        itemEl.className = 'deck-card-item';
        itemEl.style.opacity = opacity;
        itemEl.style.cursor = canExchange ? 'pointer' : 'not-allowed';

        itemEl.innerHTML = `
            <div class="card blue${rarityClass}" style="width:80px; height:120px; position:relative; display:block;">
                <div class="card-bg" style="background-image: url('${imgUrl}');"></div>
                ${countBadge}
                <div class="card-power" style="font-size:1.4rem; bottom:0; right:4px;">${itemObj.power}</div>
                ${renderSkillTag(itemObj)}
            </div>
        `;

        // 常に詳細画面を開けるようにする
        itemEl.onclick = () => showExchangeDetail(itemInfo.id, itemInfo.type, itemInfo.cost, itemObj, canExchange, isMaxed);

        listContainer.appendChild(itemEl);
    });
}

let pendingExchange = null;

function showExchangeDetail(id, type, cost, itemObj, canExchange, isMaxed) {
    playSound(SOUNDS.seClick);
    pendingExchange = { id, type, cost };

    const detailScreen = document.getElementById('screen-exchange-detail');
    if (!detailScreen) return;

    document.getElementById('exchange-detail-name').innerText = type === 'premium' ? `${itemObj.name} (プレミアム)` : `${itemObj.name} (カード)`;
    document.getElementById('exchange-detail-flavor').innerText = itemObj.flavor || '...';
    document.getElementById('exchange-detail-cost').innerText = `${cost} pt`;

    // スキルの表示
    const skillsList = document.getElementById('exchange-detail-skills-list');
    skillsList.innerHTML = '';

    let skillCandidates = [];
    if (itemObj.skill && itemObj.skill !== 'none') {
        skillCandidates.push({ id: itemObj.skill, value: itemObj.skillValue });
    }
    if (Array.isArray(itemObj.skills)) {
        skillCandidates = skillCandidates.concat(itemObj.skills);
    }

    if (skillCandidates.length > 0) {
        skillCandidates.forEach(sk => {
            const s = SKILLS[sk.id];
            if (s) {
                const item = document.createElement('div');
                item.className = 'preview-skill-item';
                const val = (sk.value === null || sk.value === undefined) ? '' : sk.value;
                const desc = typeof s.desc === 'function' ? s.desc(sk.value) : s.desc;

                if (sk.id === 'choice' && Array.isArray(itemObj.choices)) {
                    let subDetailsHtml = '';
                    itemObj.choices.forEach(cho => {
                        const cs = SKILLS[cho.id];
                        if (cs) {
                            const cVal = (cho.value === null || cho.value === undefined) ? '' : cho.value;
                            const cDesc = typeof cs.desc === 'function' ? cs.desc(cho.value) : cs.desc;
                            subDetailsHtml += `
                                <div style="margin-left: 10px; border-left: 2px solid #475569; padding-left: 10px; margin-top: 8px; margin-bottom: 8px;">
                                    <div class="preview-skill-badge" style="background: rgba(148, 163, 184, 0.2); border-color: #94a3b8; color: #94a3b8; font-size: 0.75rem;">${cs.icon} ${cs.name}${cVal}</div>
                                    <p class="preview-skill-desc" style="font-size: 0.8rem; color: #94a3b8; margin: 4px 0 0 0;">${cDesc}</p>
                                </div>
                            `;
                        }
                    });

                    item.innerHTML = `
                        <details class="choice-accordion" style="width: 100%;">
                            <summary style="list-style: none; cursor: pointer; outline: none; width: 100%;">
                                <div class="preview-skill-badge" style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 110px; position: relative; margin: 0 auto;">
                                    <span>${s.icon} ${s.name}${val}</span>
                                    <span class="accordion-icon" style="font-size: 0.8rem; transition: transform 0.2s; position: absolute; right: 8px;">▼</span>
                                </div>
                                <p class="preview-skill-desc" style="margin-top: 6px; margin-bottom: 8px; color: #f8fafc; text-align: center;">${desc}</p>
                            </summary>
                            <div class="accordion-content" style="margin-top: 5px;">
                                ${subDetailsHtml}
                            </div>
                        </details>
                    `;
                } else {
                    item.innerHTML = `
                        <div class="preview-skill-badge">${s.icon} ${s.name}${val}</div>
                        <p class="preview-skill-desc">${desc}</p>
                    `;
                }
                skillsList.appendChild(item);
            }
        });
    } else {
        skillsList.innerHTML = '<p class="preview-skill-desc">能力なし</p>';
    }

    const btn = document.getElementById('btn-exchange-confirm');
    if (btn) {
        if (isMaxed) {
            btn.innerText = "交換済み";
            btn.style.background = "#475569";
            btn.style.color = "#94a3b8";
            btn.onclick = () => { playSound(SOUNDS.seClick); showAlertModal(type === 'premium' ? "既にプレミアム化済みです。" : "所持上限(4枚)に達しています。"); };
        } else if (!canExchange) {
            btn.innerText = "ポイント不足";
            btn.style.background = "#475569";
            btn.style.color = "#94a3b8";
            btn.onclick = () => { playSound(SOUNDS.seClick); showAlertModal("ポイントが足りません！"); };
        } else {
            btn.innerText = "交換";
            btn.style.background = "linear-gradient(45deg, #f97316, #ea580c)";
            btn.style.color = "#ffffff";
            btn.onclick = confirmExchange;
        }
    }

    const cardContainer = document.getElementById('exchange-detail-card-container');
    const rarityClass = itemObj.rarity ? ` rarity-${itemObj.rarity}` : '';
    let imgUrl = getCardImgUrl(itemObj);
    if (type === 'premium') {
        imgUrl = imgUrl.replace('.jpg', '_premium.gif');
    }

    cardContainer.innerHTML = `
        <div class="card blue${rarityClass}" style="width:120px; height:180px; position:relative; display:block; transform: scale(1.2); margin-top:10px; margin-bottom:10px;">
            <div class="card-bg" style="background-image: url('${imgUrl}');"></div>
            <div class="card-power" style="font-size:2rem; bottom:0; right:6px;">${itemObj.power}</div>
            ${renderSkillTag(itemObj)}
        </div>
    `;

    detailScreen.style.display = 'flex';
}

function closeExchangeDetail() {
    playSound(SOUNDS.seClick);
    pendingExchange = null;
    const detailScreen = document.getElementById('screen-exchange-detail');
    if (detailScreen) detailScreen.style.display = 'none';
}

function confirmExchange() {
    if (!pendingExchange) return;
    const { id, type, cost } = pendingExchange;

    playSound(SOUNDS.seClick);
    let currentPoints = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;

    if (currentPoints < cost) {
        showAlertModal("ポイントが足りません！");
        return;
    }

    // Double clear pending exchange to avoid double clicks
    pendingExchange = null;
    closeExchangeDetail();

    // 交換処理
    let currentPointsInner = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
    if (currentPointsInner < cost) return;

    currentPointsInner -= cost;
    localStorage.setItem('mini_card_battle_defense_points', currentPointsInner);

    if (type === 'premium') {
        if (!unlockedPremiumCards.includes(id)) unlockedPremiumCards.push(id);
        localStorage.setItem('mini_card_battle_unlocked_premium', JSON.stringify(unlockedPremiumCards));
        playSound(SOUNDS.seSkill);
        showAlertModal(`プレミアム特典を解放しました！\n（デッキ編成画面で切り替えられます）`, () => renderExchange());
    } else {
        playerInventory[id] = (playerInventory[id] || 0) + 1;
        localStorage.setItem('mini_card_battle_inventory', JSON.stringify(playerInventory));
        playSound(SOUNDS.seSkill);
        showAlertModal(`カードを獲得しました！\n（デッキ編成画面で登録できます）`, () => renderExchange());
    }
}

// ==========================================
// デッキ生成・編集・セーブ・ロードロジック
// ==========================================

function generateDeck(owner, config, sessionId) {
    let deck = [];
    if (owner === 'blue') {
        deck = playerDeckSelection.map((t, i) => {
            const imgUrl = `assets/card_${t.skill}.jpg`;
            return {
                id: `${owner}_${sessionId}_${i}`, owner: owner,
                imgUrl: imgUrl, filter: config.filter,
                power: t.power, currentPower: t.power, skill: t.skill, name: t.name
            };
        });
    } else {
        const cardTemplates = [
            { id: 'deadly', power: 2, skill: 'deadly', name: '必殺' },
            { id: 'draw', power: 5, skill: 'draw', name: '入替' },
            { id: 'quick_knight', power: 2, skill: 'quick', name: '速攻' },
            { id: 'cleric', power: 3, skill: 'heal', name: '回復' },
            { id: 'sniper', power: 2, skill: 'snipe', name: '狙撃' },
            { id: 'bomber', power: 2, skill: 'spread', name: '拡散' },
            { id: 'mimic', power: 1, skill: 'copy', name: '複製' },
            { id: 'commander', power: 3, skill: 'support', name: '援護' },
            { id: 'golem', power: 10, skill: 'defender', name: '防御' },
            { id: 'mirror', power: 2, skill: 'clone', name: '分身' },
            { id: 'wolf', power: 3, skill: 'lone_wolf', name: '単騎' },
            { id: 'lich', power: 4, skill: 'soul_bind', name: '魂縛' },
            { id: 'ent', power: 4, skill: 'sturdy', name: '頑丈' },
            { id: 'soldier', power: 7, skill: 'none', name: '通常' }
        ];
        for (let i = 0; i < DECK_SIZE; i++) {
            const t = cardTemplates[Math.floor(Math.random() * cardTemplates.length)];
            let p = t.power;
            if (config.id === 'satan') p += 1;
            const imgUrl = `assets/card_${t.skill}.jpg`;
            deck.push({
                id: `${owner}_${sessionId}_${i}`, owner: owner,
                imgUrl: imgUrl, filter: config.filter,
                power: p, currentPower: p, skill: t.skill, name: t.name
            });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

function loadDeck() {
    const saved = localStorage.getItem('mini_card_battle_deck');
    if (saved) {
        try {
            playerDeckSelection = JSON.parse(saved);
        } catch (e) {
            console.error("Deck load error:", e);
            playerDeckSelection = [];
        }
    } else {
        playerDeckSelection = []; // 初期化されていない場合に備える
    }
}

function saveDeck() {
    localStorage.setItem('mini_card_battle_deck', JSON.stringify(playerDeckSelection));
}

function startBattleFlow() {
    loadDeck();
    renderDeckEdit();
    switchScreen('screen-deck-edit');
}

function renderDeckEdit() {
    const masterList = document.getElementById('deck-master-list');
    const currentList = document.getElementById('deck-current-list');
    const countDisplay = document.getElementById('deck-count-display');
    const finishBtn = document.getElementById('btn-finish-deck');

    masterList.innerHTML = '';
    CARD_MASTER.forEach(template => {
        const item = document.createElement('div');
        item.className = 'deck-card-item';
        const imgUrl = `assets/card_${template.skill}.jpg`;
        item.innerHTML = `
            <div class="card blue" style="width:70px; height:95px; position:relative; top:0; left:0; display:block;">
                <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${playerConfig.filter};"></div>
                <div class="card-power" style="font-size:1.2rem; bottom:0; right:4px;">${template.power}</div>
                <div style="position:absolute; top:0; left:0; background:rgba(0,0,0,0.7); font-size:0.5rem; padding:2px; color:#fff; width:100%; text-align:center; z-index:5;">${template.name}</div>
            </div>
        `;
        item.onclick = () => addCardToDeck(template);
        setupLongPress(item, template);
        masterList.appendChild(item);
    });

    currentList.innerHTML = '';
    playerDeckSelection.forEach((card, idx) => {
        const item = document.createElement('div');
        item.className = 'deck-card-item';
        const imgUrl = `assets/card_${card.skill}.jpg`;
        item.innerHTML = `
            <div class="card blue" style="width:60px; height:85px; position:relative; top:0; left:0; display:block;">
                <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${playerConfig.filter};"></div>
                <div class="card-power" style="font-size:1rem; bottom:0; right:2px;">${card.power}</div>
            </div>
        `;
        item.onclick = () => removeCardFromDeck(idx);
        setupLongPress(item, card);
        currentList.appendChild(item);
    });

    countDisplay.innerText = `Cards: ${playerDeckSelection.length} / ${DECK_SIZE}`;
    finishBtn.style.opacity = playerDeckSelection.length === DECK_SIZE ? "1" : "0.5";
}

function addCardToDeck(template) {
    if (playerDeckSelection.length >= DECK_SIZE) return;
    playerDeckSelection.push({ ...template });
    playSound(SOUNDS.seClick);
    saveDeck();
    renderDeckEdit();
}

function removeCardFromDeck(index) {
    playerDeckSelection.splice(index, 1);
    playSound(SOUNDS.seClick);
    saveDeck();
    renderDeckEdit();
}

function clearDeck() {
    if (confirm("デッキをリセットしますか？")) {
        playerDeckSelection = [];
        saveDeck();
        renderDeckEdit();
    }
}

function finishDeckEdit() {
    if (playerDeckSelection.length !== DECK_SIZE) {
        alert(`デッキを${DECK_SIZE}枚にしてください！`);
        return;
    }
    playSound(SOUNDS.seClick);
    appState = 'battle';
    prepareBattle();
}

function exportDeckXML() {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<deck>\n';
    playerDeckSelection.forEach(c => {
        xml += `  <card id="${c.id}" name="${c.name}" power="${c.power}" skill="${c.skill}" />\n`;
    });
    xml += '</deck>';
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my_deck.xml';
    a.click();
}

function importDeckXML(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
        const cards = xmlDoc.getElementsByTagName("card");
        playerDeckSelection = [];
        for (let i = 0; i < cards.length && i < DECK_SIZE; i++) {
            const id = cards[i].getAttribute("id");
            const template = CARD_MASTER.find(m => m.id === id) || CARD_MASTER[0];
            playerDeckSelection.push({ ...template });
        }
        saveDeck();
        renderDeckEdit();
    };
    reader.readAsText(file);
}

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
        // 敵のデッキ生成
        const templates = [...CARD_MASTER];
        for (let i = 0; i < DECK_SIZE; i++) {
            const t = templates[Math.floor(Math.random() * templates.length)];
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

/**
 * リーダー別のおすすめ初期デッキを生成 (20枚・同名5枚制限厳守)
 */
function getInitialDeck(charId) {
    const counts = {};
    const deck = [];

    if (charId === 'dragon') {
        // イグニス: 速攻(5), 狙撃(5), 拡散(5), 通常(5)
        counts.quick_knight = 5; counts.sniper = 5; counts.bomber = 5; counts.soldier = 5;
    } else if (charId === 'knight') {
        // セレスティア: 分身(5), 援護(5), 通常(5), 速攻(2), 狙撃(2), 回復(1)
        counts.mirror = 5; counts.commander = 5; counts.soldier = 5;
        counts.quick_knight = 2; counts.sniper = 2; counts.cleric = 1;
    } else if (charId === 'cthulhu') {
        // ナイア: 必殺(5), 魂縛(5), 単騎(5), 入替(5)
        counts.archer = 5; counts.lich = 5; counts.wolf = 5; counts.mage = 5;
    } else {
        // アイギス / サタン: バランス (計20枚)
        counts.soldier = 5;
        counts.mirror = 2; counts.archer = 2; counts.cleric = 2;
        // 残り9枚を各1枚ずつ (計13種-4種=9種)
        CARD_MASTER.forEach(m => {
            if (!['soldier', 'mirror', 'archer', 'cleric'].includes(m.id)) {
                counts[m.id] = 1;
            }
        });
    }

    Object.keys(counts).forEach(id => {
        const template = CARD_MASTER.find(m => m.id === id);
        if (template) {
            for (let i = 0; i < Math.min(counts[id], 5); i++) { // 常に5枚制限を適用
                deck.push({ ...template });
            }
        }
    });
    return deck.slice(0, DECK_SIZE); // 20枚
}

function loadDeck() {
    // リーダーごとに個別のキーを使用
    const key = `mini_card_battle_deck_${playerConfig.id}`;
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            playerDeckSelection = JSON.parse(saved);
        } catch (e) {
            console.error("Deck load error:", e);
            playerDeckSelection = getInitialDeck(playerConfig.id);
        }
    } else {
        playerDeckSelection = getInitialDeck(playerConfig.id);
    }
}

function saveDeck() {
    const key = `mini_card_battle_deck_${playerConfig.id}`;
    localStorage.setItem(key, JSON.stringify(playerDeckSelection));
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

    // --- 所持カードリスト (マスター) ---
    masterList.innerHTML = '';
    CARD_MASTER.forEach(template => {
        const item = document.createElement('div');
        item.className = 'deck-card-item';
        const imgUrl = `assets/card_${template.skill}.jpg`;
        const inDeckCount = playerDeckSelection.filter(c => c.id === template.id).length;
        const remaining = 5 - inDeckCount; // デッキに入れられる残り枚数
        const opacity = remaining <= 0 ? "0.4" : "1";

        item.innerHTML = `
            <div class="card blue" style="width:80px; height:110px; position:relative; top:0; left:0; display:block; opacity:${opacity};">
                <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${playerConfig.filter};"></div>
                <div class="card-power" style="font-size:1.4rem; bottom:0; right:4px;">${template.power}</div>
                <div style="position:absolute; top:0; left:0; background:rgba(0,0,0,0.7); font-size:0.6rem; padding:2px; color:#fff; width:100%; text-align:center; z-index:5;">${template.name}</div>
                <div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:${remaining > 0 ? '#facc15' : '#ef4444'}; padding:0 5px; border-radius:4px; font-weight:bold; font-size:0.8rem; z-index:6;">x${remaining}</div>
            </div>
        `;
        item.onclick = () => addCardToDeck(template);
        setupLongPress(item, { ...template, imgUrl: imgUrl });
        masterList.appendChild(item);
    });

    // --- 現在のデッキリスト (グループ化表示) ---
    currentList.innerHTML = '';
    const grouped = {};
    playerDeckSelection.forEach(card => {
        if (!grouped[card.id]) grouped[card.id] = { card: card, count: 0 };
        grouped[card.id].count++;
    });

    Object.keys(grouped).forEach(id => {
        const group = grouped[id];
        const card = group.card;
        const item = document.createElement('div');
        item.className = 'deck-card-item';
        const imgUrl = `assets/card_${card.skill}.jpg`;
        item.innerHTML = `
            <div class="card blue" style="width:80px; height:110px; position:relative; top:0; left:0; display:block;">
                <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${playerConfig.filter};"></div>
                <div class="card-power" style="font-size:1.4rem; bottom:0; right:4px;">${card.power}</div>
                <div style="position:absolute; top:0; left:0; background:rgba(0,0,0,0.7); font-size:0.6rem; padding:2px; color:#fff; width:100%; text-align:center; z-index:5;">${card.name}</div>
                <div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#facc15; padding:0 5px; border-radius:4px; font-weight:bold; font-size:0.8rem; z-index:6;">x${group.count}</div>
            </div>
        `;
        item.onclick = () => removeCardFromDeck(id);
        setupLongPress(item, { ...card, imgUrl: imgUrl });
        currentList.appendChild(item);
    });

    countDisplay.innerText = `カード枚数: ${playerDeckSelection.length} / ${DECK_SIZE}`;
    finishBtn.style.opacity = playerDeckSelection.length === DECK_SIZE ? "1" : "0.5";
}

function addCardToDeck(template) {
    if (playerDeckSelection.length >= DECK_SIZE) return;
    const count = playerDeckSelection.filter(c => c.id === template.id).length;
    if (count >= 5) return; 

    playerDeckSelection.push({ ...template });
    playSound(SOUNDS.seClick);
    saveDeck();
    renderDeckEdit();
}

function removeCardFromDeck(cardId) {
    const index = playerDeckSelection.findIndex(c => c.id === cardId);
    if (index !== -1) {
        playerDeckSelection.splice(index, 1);
        playSound(SOUNDS.seClick);
        saveDeck();
        renderDeckEdit();
    }
}

function clearDeck() {
    if (confirm("デッキのカードをすべて削除しますか？")) {
        playerDeckSelection = [];
        saveDeck();
        renderDeckEdit();
    }
}

function resetDeck() {
    if (confirm("デッキを初期状態（おすすめ構成）に戻しますか？")) {
        playerDeckSelection = getInitialDeck(playerConfig.id);
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
    a.download = `my_deck_${playerConfig.id}.xml`;
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
            const count = playerDeckSelection.filter(c => c.id === id).length;
            if (count < 5) {
                playerDeckSelection.push({ ...template });
            }
        }
        saveDeck();
        renderDeckEdit();
    };
    reader.readAsText(file);
}

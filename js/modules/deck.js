// ==========================================
// デッキ生成・編集・セーブ・ロードロジック
// ==========================================

function generateDeck(owner, config, sessionId) {
    let deck = [];
    if (owner === 'blue') {
        deck = playerDeckSelection.map((t, i) => {
            const imgUrl = t.imgUrl || `assets/card_${t.id}.jpg`;
            return {
                id: `${owner}_${sessionId}_${i}`, owner: owner,
                imgUrl: imgUrl, filter: config.filter,
                basePower: t.power, power: t.power, currentPower: t.power, skill: t.skill, name: t.name,
                skillValue: t.skillValue, flavor: t.flavor
            };
        });
    } else {
        // 敵のデッキ生成（リーダーごとの初期デッキを使用）
        const deckIds = INITIAL_DECKS[config.id] || INITIAL_DECKS.android;
        deckIds.forEach((cardId, i) => {
            const t = CARD_MASTER.find(m => m.id === cardId) || CARD_MASTER[0];
            let p = t.power;
            if (config.id === 'satan') p += 1; // サタン補正は維持

            // ミラーマッチ（シャドウ）用のフィルタ処理
            let filter = config.filter;
            if (config.isShadow) {
                filter = 'grayscale(1) brightness(0.7) contrast(1.2)';
            }

            const imgUrl = t.imgUrl || `assets/card_${t.id}.jpg`;
            deck.push({
                id: `${owner}_${sessionId}_${i}`, owner: owner,
                imgUrl: imgUrl, filter: filter,
                basePower: p, power: p, currentPower: p, skill: t.skill, name: t.name,
                skillValue: t.skillValue, flavor: t.flavor
            });
        });
    }
    return deck.sort(() => Math.random() - 0.5);
}

/**
 * リーダー別のおすすめ初期デッキを生成 (20枚・同名5枚制限厳守)
 */
function getInitialDeck(charId) {
    const deckIds = INITIAL_DECKS[charId] || INITIAL_DECKS.android;
    const deck = [];
    deckIds.forEach(id => {
        const template = CARD_MASTER.find(m => m.id === id);
        if (template) {
            deck.push({ ...template });
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
    CARD_MASTER.filter(t => !t.isToken).forEach(template => {
        const item = document.createElement('div');
        item.className = 'deck-card-item';
        const imgUrl = template.imgUrl || `assets/card_${template.id}.jpg`;
        const inDeckCount = playerDeckSelection.filter(c => c.id === template.id).length;
        const remaining = 5 - inDeckCount; // デッキに入れられる残り枚数
        const opacity = remaining <= 0 ? "0.4" : "1";

        item.innerHTML = `
            <div class="card blue" style="width:80px; height:110px; position:relative; top:0; left:0; display:block; opacity:${opacity};">
                <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${playerConfig.filter};"></div>
                <div class="card-power" style="font-size:1.4rem; bottom:0; right:4px;">${template.power}</div>
                ${renderSkillTag(template)}
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
        // IDから画像URLを特定
        const cardImgUrl = card.imgUrl || `assets/card_${card.id}.jpg`;
        item.innerHTML = `
            <div class="card blue" style="width:80px; height:110px; position:relative; top:0; left:0; display:block;">
                <div class="card-bg" style="background-image: url('${cardImgUrl}'); filter: ${playerConfig.filter};"></div>
                <div class="card-power" style="font-size:1.4rem; bottom:0; right:4px;">${card.power}</div>
                ${renderSkillTag(card)}
                <div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#facc15; padding:0 5px; border-radius:4px; font-weight:bold; font-size:0.8rem; z-index:6;">x${group.count}</div>
            </div>
        `;
        item.onclick = () => removeCardFromDeck(id);
        setupLongPress(item, { ...card, imgUrl: cardImgUrl });
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
    playSound(SOUNDS.seClick);
    showConfirmModal("デッキのカードをすべて削除しますか？", () => {
        playerDeckSelection = [];
        saveDeck(); // Keep saveDeck() for persistence
        renderDeckEdit();
    });
}

function resetDeck() {
    playSound(SOUNDS.seClick);
    showConfirmModal("デッキを初期状態（おすすめ構成）に戻しますか？", () => {
        playerDeckSelection = getInitialDeck(playerConfig.id);
        saveDeck(); // Keep saveDeck() for persistence
        renderDeckEdit();
    });
}

function finishDeckEdit() {
    if (playerDeckSelection.length !== DECK_SIZE) {
        playSound(SOUNDS.seClick);
        showAlertModal(`デッキを${DECK_SIZE}枚にしてください！`);
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

// ==========================================
// デッキ生成・編集・セーブ・ロードロジック
// ==========================================

function generateDeck(owner, config, sessionId) {
    let deck = [];
    if (owner === 'blue') {
        deck = playerDeckSelection.map((t, i) => {
            const imgUrl = getCardImgUrl(t);
            return {
                id: `${owner}_${sessionId}_${i}`, owner: owner,
                imgUrl: imgUrl, filter: config.filter,
                basePower: t.power, power: t.power, currentPower: t.power, name: t.name,
                skill: t.skill, skillValue: t.skillValue,
                skills: t.skills ? t.skills.map(s => ({ ...s })) : undefined,
                flavor: t.flavor, rarity: t.rarity
            };
        });
    } else {
        // 敵のデッキ生成
        let recipeId = config.id;
        if (gameMode === 'event_satan') recipeId = 'satan_high';
        let recipe = ENEMY_DECKS[recipeId] || ENEMY_DECKS.android;
        let deckIds = [];

        if (recipe.easy && recipe.normal && recipe.hard) {
            if (typeof aiLevel !== 'undefined') {
                if (aiLevel == 1) deckIds = recipe.easy;
                else if (aiLevel == 3) deckIds = recipe.hard;
                else deckIds = recipe.normal;
            } else {
                deckIds = recipe.normal;
            }
        } else if (Array.isArray(recipe)) {
            deckIds = recipe;
        } else {
            deckIds = Array.isArray(ENEMY_DECKS.android) ? ENEMY_DECKS.android : (ENEMY_DECKS.android.normal || []);
        }

        deckIds.forEach((cardId, i) => {
            const t = CARD_MASTER.find(m => m.id === cardId) || CARD_MASTER[0];
            let p = t.power;
            // if (config.id === 'satan') p += 1; // サタン補正は削除

            // ミラーマッチ（シャドウ）用のフィルタ処理
            let filter = (config.id === 'satan') ? 'none' : config.filter;
            if (config.isShadow) {
                filter = 'grayscale(1) brightness(0.7) contrast(1.2)';
            }

            const imgUrl = getCardImgUrl(t);
            deck.push({
                id: `${owner}_${sessionId}_${i}`, owner: owner,
                imgUrl: imgUrl, filter: filter,
                basePower: p, power: p, currentPower: p, name: t.name,
                skill: t.skill, skillValue: t.skillValue,
                skills: t.skills ? t.skills.map(s => ({ ...s })) : undefined,
                flavor: t.flavor, rarity: t.rarity
            });
        });
    }
    return deck.sort(() => Math.random() - 0.5);
}

/**
 * リーダー別のおすすめ初期デッキを生成 (20枚・同名5枚制限厳守)
 */
function getInitialDeck(charId) {
    const deck = [];
    INITIAL_PLAYER_DECK.forEach(id => {
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
            playerDeckSelection = JSON.parse(saved).map(savedCard => {
                const t = CARD_MASTER.find(m => m.id === savedCard.id);
                return t ? { ...t } : savedCard;
            });
        } catch (e) {
            console.error("Deck load error:", e);
            playerDeckSelection = getInitialDeck(playerConfig.id);
        }
    } else {
        playerDeckSelection = getInitialDeck(playerConfig.id);
    }

    // インベントリの読み込み
    const invKey = `mini_card_battle_inventory`;
    const invSaved = localStorage.getItem(invKey);
    if (invSaved) {
        try {
            playerInventory = JSON.parse(invSaved);
        } catch (e) {
            console.error("Inventory parse error:", e);
            playerInventory = {};
        }
    } else {
        // 初期インベントリの作成（初期デッキのカードを所持）
        playerInventory = {};
        INITIAL_PLAYER_DECK.forEach(id => {
            playerInventory[id] = (playerInventory[id] || 0) + 1;
        });
    }

    // プレミアムカード設定の読み込み
    const premiumKey = `mini_card_battle_premium_cards`;
    const premiumSaved = localStorage.getItem(premiumKey);
    if (premiumSaved) {
        try {
            premiumCards = JSON.parse(premiumSaved);
        } catch (e) {
            console.error("Premium cards load error:", e);
            premiumCards = [];
        }
    } else {
        premiumCards = [];
    }

    // 解放済みプレミアムカードの読み込み
    const unlockedPremiumKey = `mini_card_battle_unlocked_premium`;
    const unlockedPremiumSaved = localStorage.getItem(unlockedPremiumKey);
    if (unlockedPremiumSaved) {
        try {
            unlockedPremiumCards = JSON.parse(unlockedPremiumSaved);
        } catch (e) {
            console.error("Unlocked Premium load error:", e);
            unlockedPremiumCards = [];
        }
    } else {
        unlockedPremiumCards = [];
    }
}

function saveDeck() {
    const key = `mini_card_battle_deck_${playerConfig.id}`;
    localStorage.setItem(key, JSON.stringify(playerDeckSelection));
    const invKey = `mini_card_battle_inventory`;
    localStorage.setItem(invKey, JSON.stringify(playerInventory));
    
    // プレミアムカード解放状態もセーブ
    localStorage.setItem('mini_card_battle_unlocked_premium', JSON.stringify(unlockedPremiumCards));
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
        const owned = playerInventory[template.id] || 0;

        const item = document.createElement('div');
        item.className = 'deck-card-item';
        const imgUrl = getCardImgUrl(template);
        const inDeckCount = playerDeckSelection.filter(c => c.id === template.id).length;
        const remaining = owned - inDeckCount; // デッキに入れられる残り枚数
        const opacity = remaining <= 0 ? "0.4" : "1";
        const rarityClass = template.rarity ? ` rarity-${template.rarity}` : '';

        const premiumIcon = unlockedPremiumCards.includes(template.id) ? 
            `<div class="premium-toggle-icon" onclick="event.stopPropagation(); playSound(SOUNDS.seClick); togglePremiumCard('${template.id}'); renderDeckEdit();" style="position:absolute; top:4px; left:4px; background:rgba(0,0,0,0.85); color:${premiumCards.includes(template.id) ? '#d946ef' : '#94a3b8'}; padding:2px 6px; border-radius:10px; font-size:0.8rem; z-index:7; border:1px solid ${premiumCards.includes(template.id) ? '#d946ef' : '#475569'}; cursor:pointer;">✨</div>` : '';

        item.innerHTML = `
            <div class="card blue${rarityClass}" style="width:80px; height:120px; position:relative; top:0; left:0; display:block; opacity:${opacity};">
                <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${playerConfig.filter};"></div>
                ${premiumIcon}
                <div class="card-power" style="font-size:1.4rem; bottom:0; right:4px;">${template.power}</div>
                ${renderSkillTag(template)}
                <div style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.85); color:${remaining > 0 ? '#facc15' : '#ef4444'}; padding:1px 6px; border-radius:10px; font-weight:bold; font-size:0.75rem; z-index:6; border:1px solid ${remaining > 0 ? '#facc15' : '#ef4444'};">${inDeckCount}/${owned}</div>
            </div>
        `;
        item.onclick = () => addCardToDeck(template);
        setupLongPress(item, template);
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
        const cardImgUrl = getCardImgUrl(card);
        const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
        
        const premiumIcon = unlockedPremiumCards.includes(card.id) ? 
            `<div class="premium-toggle-icon" onclick="event.stopPropagation(); playSound(SOUNDS.seClick); togglePremiumCard('${card.id}'); renderDeckEdit();" style="position:absolute; top:4px; left:4px; background:rgba(0,0,0,0.85); color:${premiumCards.includes(card.id) ? '#d946ef' : '#94a3b8'}; padding:2px 6px; border-radius:10px; font-size:0.8rem; z-index:7; border:1px solid ${premiumCards.includes(card.id) ? '#d946ef' : '#475569'}; cursor:pointer;">✨</div>` : '';

        item.innerHTML = `
            <div class="card blue${rarityClass}" style="width:80px; height:120px; position:relative; top:0; left:0; display:block;">
                <div class="card-bg" style="background-image: url('${cardImgUrl}'); filter: ${playerConfig.filter};"></div>
                ${premiumIcon}
                <div class="card-power" style="font-size:1.4rem; bottom:0; right:4px;">${card.power}</div>
                ${renderSkillTag(card)}
                <div style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.85); color:#facc15; padding:1px 6px; border-radius:10px; font-weight:bold; font-size:0.75rem; z-index:6; border:1px solid #facc15;">x${group.count}</div>
            </div>
        `;
        item.onclick = () => removeCardFromDeck(id);
        setupLongPress(item, card);
        currentList.appendChild(item);
    });

    countDisplay.innerText = `カード枚数: ${playerDeckSelection.length} / ${DECK_SIZE}`;
    finishBtn.style.opacity = playerDeckSelection.length === DECK_SIZE ? "1" : "0.5";
}

function addCardToDeck(template) {
    if (playerDeckSelection.length >= DECK_SIZE) return;
    const inDeckCount = playerDeckSelection.filter(c => c.id === template.id).length;
    const ownedCount = playerInventory[template.id] || 0;
    if (inDeckCount >= ownedCount) return;

    playerDeckSelection.push({ ...template });
    playSound(SOUNDS.seClick);
    renderDeckEdit();
}

function removeCardFromDeck(cardId) {
    const index = playerDeckSelection.findIndex(c => c.id === cardId);
    if (index !== -1) {
        playerDeckSelection.splice(index, 1);
        playSound(SOUNDS.seClick);
        renderDeckEdit();
    }
}

function clearDeck() {
    playSound(SOUNDS.seClick);
    showConfirmModal("デッキのカードをすべて削除しますか？", () => {
        playerDeckSelection = [];
        renderDeckEdit();
    });
}

function resetDeck() {
    playSound(SOUNDS.seClick);
    showConfirmModal("デッキを初期状態に戻しますか？", () => {
        playerDeckSelection = getInitialDeck(playerConfig.id);
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
    saveDeck(); // ここでまとめて保存
    appState = 'battle';
    prepareBattle();
}

function exportDeckXML() {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<deck>\n';
    playerDeckSelection.forEach(c => {
        const skillsAttr = c.skills ? ` skills='${JSON.stringify(c.skills)}'` : '';
        xml += `  <card id="${c.id}" name="${c.name}" power="${c.power}" skill="${c.skill}"${skillsAttr} />\n`;
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
        renderDeckEdit();
    };
    reader.readAsText(file);
}

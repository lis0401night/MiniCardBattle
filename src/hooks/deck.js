import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { DECK_SIZE } from '../utils/constants/config.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { INITIAL_PLAYER_DECK } from '../utils/constants/initial_decks.js';
import { ownedPlaymats, setOwnedPlaymats } from '../utils/constants/playmats.js';
import { playSound, switchScreen, getCardImgUrl, togglePremiumCard, getOrCreateUUID, getSeededRandom, shuffleArray, VALID_PREMIUM_GIFS, VALID_PREMIUM_JPGS } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { prepareBattle } from './battle.js';
import { GameState } from './gameState.js';
import { setupLongPress } from './uiGallery.js';
import { showDefenseMenu, closePlayerNameModal, showOnlineLobby } from './uiMainCore.js';
import { showConfirmModal, showAlertModal } from './uiModals.js';

// ==========================================
// デッキ生成・編集・セーブ・ロードロジック
// ==========================================

export function generateDeck(owner, config, sessionId) {
    let deck = [];

    // オンラインモード：事前に渡された専用デッキ配列を使用する
    if (GameState.gameMode === 'online' && config && Array.isArray(config.deck)) {
        deck = config.deck.map((t, i) => {
            const isPremium = t.isPremium || false;
            const tempObj = { ...t, isPremium: isPremium };
            const imgUrl = getCardImgUrl(tempObj);
            return {
                ...t,
                baseId: t.id,
                id: `${owner}_${sessionId}_${i}`,
                owner: owner,
                imgUrl: imgUrl,
                power: t.power,
                basePower: t.power,
                currentPower: t.power,
                isPremium: isPremium,
                skills: t.skills ? t.skills.map(s => ({ ...s })) : undefined
            };
        });
        return shuffleArray(deck);
    }

    if (owner === 'blue') {
        deck = GameState.playerDeckSelection.map((t, i) => {
            const isPremium = GameState.premiumCards.includes(t.id);
            const tempObj = { ...t, isPremium: isPremium };
            const imgUrl = getCardImgUrl(tempObj);
            return {
                ...t,
                baseId: t.id,
                id: `${owner}_${sessionId}_${i}`,
                owner: owner,
                imgUrl: imgUrl,
                power: t.power,
                basePower: t.power,
                currentPower: t.power,
                isPremium: isPremium,
                skills: t.skills ? t.skills.map(s => ({ ...s })) : undefined
            };
        });
    } else {
        // 敵のデッキ生成
        let deckIds = [];
        if (GameState.gameMode === 'practice') {
            const enemyDeckData = GameState.decks[GameState.practiceEnemyDeckIndex];
            deckIds = enemyDeckData.cards.map(id => ({
                id: id,
                isPremium: enemyDeckData.premiumCards ? enemyDeckData.premiumCards.includes(id) : false
            }));
        } else if (GameState.gameMode === 'battle_dungeon' && config.dungeonDeck) {
            deckIds = config.dungeonDeck;
        } else {
            let recipeId = config.id;
            if (GameState.gameMode === 'event_satan') recipeId = 'satan_high';
            if (GameState.gameMode === 'event_android_high') recipeId = 'android_high';
            if (GameState.gameMode === 'event_dragon_high') recipeId = 'dragon_high';
            if (GameState.gameMode === 'defense_attack') recipeId = 'player_defense'; // 追加
            let recipe = ENEMY_DECKS[recipeId] || ENEMY_DECKS.android;

            if (recipe.easy && recipe.normal && recipe.hard) {
                if (typeof GameState.aiLevel !== 'undefined') {
                    if (GameState.aiLevel == 1) deckIds = recipe.easy;
                    else if (GameState.aiLevel == 3) deckIds = recipe.hard;
                    else deckIds = recipe.normal;
                } else {
                    deckIds = recipe.normal;
                }
            } else if (Array.isArray(recipe)) {
                deckIds = recipe;
            } else {
                deckIds = Array.isArray(ENEMY_DECKS.android) ? ENEMY_DECKS.android : (ENEMY_DECKS.android.normal || []);
            }
        }

        deckIds.forEach((cardItem, i) => {
            let cardId = typeof cardItem === 'object' ? cardItem.id : cardItem;
            let isPremium = typeof cardItem === 'object' ? (cardItem.isPremium || false) : false;

            const t = CARD_MASTER.find(m => m.id === cardId) || CARD_MASTER[0];
            let p = t.power;

            const tempObj = { ...t, isPremium: isPremium };
            const imgUrl = getCardImgUrl(tempObj);
            deck.push({
                ...t,
                baseId: t.id,
                id: `${owner}_${sessionId}_${i}`,
                owner: owner,
                imgUrl: imgUrl,
                power: p,
                basePower: t.power,
                currentPower: p,
                isPremium: isPremium,
                skills: t.skills ? t.skills.map(s => ({ ...s })) : undefined
            });
        });
    }
    return shuffleArray(deck);
}

/**
 * リーダー別のおすすめ初期デッキを生成 (20枚・同名5枚制限厳守)
 */
export function getInitialDeck(charId) {
    const deck = [];
    INITIAL_PLAYER_DECK.forEach(id => {
        const template = CARD_MASTER.find(m => m.id === id);
        if (template) {
            deck.push({ ...template });
        }
    });
    return deck.slice(0, DECK_SIZE); // 20枚
}

window.loadDeck = loadDeck;
export function loadDeck() {
    // 1. ダンジョン特殊処理
    if (GameState.gameMode === 'battle_dungeon') {
        if (!GameState.playerDeckSelection || GameState.playerDeckSelection.length !== 20) {
            GameState.playerDeckSelection = (GameState.dungeonCards || []).slice(0, 20).map(id => {
                const template = CARD_MASTER.find(c => c.id === id);
                return template ? { ...template } : null;
            }).filter(Boolean);
        }
        return;
    }

    // 2. 全体（アカウント）設定のベース読み込み
    // 全体スキン
    const skinsKey = 'mini_card_battle_skins';
    const skinsSaved = localStorage.getItem(skinsKey);
    let globalSkins = {};
    if (skinsSaved) {
        try { globalSkins = JSON.parse(skinsSaved); } 
        catch (e) { globalSkins = {}; }
    }
    GameState.playerSkins = { ...globalSkins };

    // インベントリ
    const invKey = `mini_card_battle_inventory`;
    const invSaved = localStorage.getItem(invKey);
    if (invSaved) {
        try { GameState.playerInventory = JSON.parse(invSaved); } 
        catch (e) { GameState.playerInventory = {}; }
    } else {
        GameState.playerInventory = {};
    }

    // 初期デッキのカードは必ず最低限持っているように補填する（アップデート時の後方互換用）
    const initialCounts = {};
    INITIAL_PLAYER_DECK.forEach(id => {
        initialCounts[id] = (initialCounts[id] || 0) + 1;
    });
    for (const id in initialCounts) {
        GameState.playerInventory[id] = Math.max(GameState.playerInventory[id] || 0, initialCounts[id]);
    }

    // プレミアムカード設定の読み込み（全体デフォルト）
    const premiumKey = `mini_card_battle_premium_cards`;
    const premiumSaved = localStorage.getItem(premiumKey);
    if (premiumSaved) {
        try { GameState.premiumCards = JSON.parse(premiumSaved).filter(id => VALID_PREMIUM_GIFS.includes(id) || VALID_PREMIUM_JPGS.includes(id)); } 
        catch (e) { GameState.premiumCards = []; }
    } else {
        GameState.premiumCards = [];
    }

    // 解放済みプレミアムカードの読み込み
    const unlockedPremiumKey = `mini_card_battle_unlocked_premium`;
    const unlockedPremiumSaved = localStorage.getItem(unlockedPremiumKey);
    if (unlockedPremiumSaved) {
        try { GameState.unlockedPremiumCards = JSON.parse(unlockedPremiumSaved).filter(id => VALID_PREMIUM_GIFS.includes(id) || VALID_PREMIUM_JPGS.includes(id)); } 
        catch (e) { GameState.unlockedPremiumCards = []; }
    } else {
        GameState.unlockedPremiumCards = [];
    }

    // 所持プレイマットの読み込み
    const playmatsKey = `mini_card_battle_owned_playmats`;
    const playmatsSaved = localStorage.getItem(playmatsKey);
    if (playmatsSaved) {
        try { setOwnedPlaymats(JSON.parse(playmatsSaved)); } 
        catch (e) { setOwnedPlaymats([]); }
    } else {
        setOwnedPlaymats([]);
    }

    // 3. デッキのロードと固有設定の適用

    if (GameState.gameMode === 'defense_register') {
        GameState.currentDeckIndex = 0; // 防衛時は必ず0番目を使用する
        const defenseSaved = localStorage.getItem('mini_card_battle_defense_deck_obj');
        if (defenseSaved) {
            try { 
                GameState.decks = [JSON.parse(defenseSaved)]; 
                // キャラクター選択直後の場合は選択されたリーダーを強制適用する
                if (GameState.playerConfig && GameState.playerConfig.id && GameState.appState === 'select_player') {
                    GameState.decks[0].leaderId = GameState.playerConfig.id;
                }
            }
            catch (e) { GameState.decks = []; }
        } else {
            // マイグレーション：古い構造からの引き継ぎ
            const oldDef = localStorage.getItem('mini_card_battle_deck_defense');
            if (oldDef) {
                try {
                    const cardsArr = JSON.parse(oldDef);
                    GameState.decks = [{
                        id: 'defense_deck',
                        name: '防衛デッキ',
                        leaderId: GameState.playerConfig?.id || 'android',
                        playmatId: localStorage.getItem('mini_card_battle_playmat_defense') || null,
                        playerSkins: {},
                        premiumCards: [...GameState.premiumCards],
                        cards: cardsArr
                    }];
                } catch (e) { GameState.decks = []; }
            } else { GameState.decks = []; }
        }
    } else if (GameState.gameMode === 'battle_dungeon') {
        GameState.currentDeckIndex = 0; // ダンジョン時は必ず0番目を使用する
        const dungeonSaved = localStorage.getItem('mini_card_battle_dungeon_deck_obj');
        if (dungeonSaved) {
            try { GameState.decks = [JSON.parse(dungeonSaved)]; }
            catch (e) { GameState.decks = []; }
        } else {
            // マイグレーション：既存の試練の宮殿中断データからの引き継ぎ
            const oldSaveStr = localStorage.getItem('mini_card_battle_dungeon_save');
            if (oldSaveStr) {
                try {
                    const data = JSON.parse(oldSaveStr);
                    const deckCardsStr = data.deck || (data.cards ? data.cards.slice(0, 20) : []);
                    GameState.decks = [{
                        id: 'dungeon_deck',
                        name: '試練の宮殿デッキ',
                        leaderId: data.playerConfig?.id || data.leaderId || 'android',
                        playmatId: null,
                        playerSkins: {},
                        premiumCards: [...GameState.premiumCards],
                        cards: deckCardsStr
                    }];
                } catch (e) { GameState.decks = []; }
            } else { GameState.decks = []; }
        }
    } else {
        // 通常のデッキ（最大20個）
        const decksSaved = localStorage.getItem('mini_card_battle_decks');
        if (decksSaved) {
            try { 
                GameState.decks = JSON.parse(decksSaved); 
            } 
            catch (e) { GameState.decks = []; }
        } else { GameState.decks = []; }

        if (GameState.currentDeckIndex >= GameState.decks.length || GameState.currentDeckIndex < 0) {
            GameState.currentDeckIndex = 0;
        }
    }

    if (!GameState.decks || GameState.decks.length === 0) {
        if (GameState.gameMode === 'defense_register' || GameState.gameMode === 'battle_dungeon') {
            createNewDeck('knight');
            if (GameState.gameMode === 'defense_register') GameState.decks[0].name = '防衛デッキ';
            if (GameState.gameMode === 'battle_dungeon') GameState.decks[0].name = '試練の宮殿デッキ';
        } else {
            // 新規プレイヤー向けの初期設定：全キャラクター（リーダー）分の初期デッキを生成
            const leaderIds = Object.keys(CHARACTERS).filter(id => id !== 'player' && id !== 'unknown' && id !== 'npc' && id !== 'satan');
            leaderIds.forEach(id => {
                const char = CHARACTERS[id];
                if (char && (!GameState.decks || GameState.decks.length < 20)) {
                    const newIndex = createNewDeck(id);
                    if (newIndex !== false && GameState.decks[newIndex]) {
                        // 名前が長すぎないよう、シンプルにキャラ名+デッキにする
                        const shortName = char.name.split(' ').pop(); // 「機動戦姫 アイギス」なら「アイギス」
                        GameState.decks[newIndex].name = `${shortName}デッキ`.substring(0, 12);
                    }
                }
            });
            GameState.currentDeckIndex = 0;
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('mini_card_battle_decks', JSON.stringify(GameState.decks));
            }
        }
    }

    if (GameState.decks.length > 0) {
        const activeDeck = GameState.decks[GameState.currentDeckIndex];
        const templateChar = CHARACTERS[activeDeck.leaderId] || CHARACTERS.android;
        if (!GameState.playerConfig || GameState.appState !== 'select_player') {
            GameState.playerConfig = { ...templateChar };
        }
        GameState.selectedPlaymatId = activeDeck.playmatId || null;

        // 【新規】デッキ固有のスキン・プレミアムをロード
        if (!activeDeck.playerSkins) activeDeck.playerSkins = {};
        GameState.playerSkins = { ...GameState.playerSkins, ...activeDeck.playerSkins };
        
        if (activeDeck.premiumCards) {
            GameState.premiumCards = [...activeDeck.premiumCards];
        } else {
            activeDeck.premiumCards = [...GameState.premiumCards];
        }

        GameState.playerDeckSelection = activeDeck.cards.map(item => {
            const id = typeof item === 'string' ? item : (item.id || "");
            const t = CARD_MASTER.find(m => m.id === id);
            return t ? { ...t } : (typeof item === 'string' ? { id: item } : item);
        });
    } else {
        GameState.playerDeckSelection = getInitialDeck(GameState.playerConfig?.id || 'knight');
    }

    // 選択中プレイマットの読み込み
    let playmatSelectKey = `mini_card_battle_playmat_${GameState.playerConfig?.id || 'android'}`;
    if (typeof GameState.gameMode !== 'undefined' && GameState.gameMode === 'defense_register') {
        playmatSelectKey = 'mini_card_battle_playmat_defense';
    }
    // デッキに紐付いて無い場合のフォールバック
    if (!GameState.selectedPlaymatId) {
        GameState.selectedPlaymatId = localStorage.getItem(playmatSelectKey) || null;
    }
}

export function createNewDeck(leaderId) {
    if (!GameState.decks) GameState.decks = [];
    if (GameState.decks.length >= 20) return false;

    // 新規作成時のデフォルトプレミアム設定は常にグローバルの設定（LocalStorage）から取得する
    const globalPremiumSrc = localStorage.getItem('mini_card_battle_premium_cards');
    const globalPremiumCards = globalPremiumSrc ? JSON.parse(globalPremiumSrc).filter(id => VALID_PREMIUM_GIFS.includes(id) || VALID_PREMIUM_JPGS.includes(id)) : [];

    const newDeck = {
        id: `deck_${Date.now()}_${GameState.decks.length}`,
        name: `デッキ${GameState.decks.length + 1}`,
        leaderId: leaderId || 'knight',
        playmatId: null,
        playerSkins: {},
        premiumCards: globalPremiumCards,
        cards: getInitialDeck(leaderId || 'knight').map(c => c.id)
    };
    GameState.decks.push(newDeck);
    if (GameState.gameMode !== 'defense_register' && GameState.gameMode !== 'battle_dungeon') {
        localStorage.setItem('mini_card_battle_decks', JSON.stringify(GameState.decks));
    }
    return GameState.decks.length - 1; // 生成したデッキのインデックスを返す
}

export function saveCurrentEditDeck() {
    if (GameState.decks && GameState.decks.length > GameState.currentDeckIndex) {
        const activeDeck = GameState.decks[GameState.currentDeckIndex];
        activeDeck.playmatId = GameState.selectedPlaymatId;
        activeDeck.playerSkins = { ...GameState.playerSkins };
        activeDeck.premiumCards = [...GameState.premiumCards];
        activeDeck.cards = GameState.playerDeckSelection.map(c => typeof c === 'string' ? c : (c.baseId || c.id));
        
        if (GameState.gameMode === 'defense_register') {
            localStorage.setItem('mini_card_battle_defense_deck_obj', JSON.stringify(activeDeck));
            // 旧来の他モジュールからの参照のため配列版も残す
            localStorage.setItem('mini_card_battle_deck_defense', JSON.stringify(activeDeck.cards));
        } else if (GameState.gameMode === 'battle_dungeon') {
            localStorage.setItem('mini_card_battle_dungeon_deck_obj', JSON.stringify(activeDeck));
        } else {
            localStorage.setItem('mini_card_battle_decks', JSON.stringify(GameState.decks));
        }
    }
}

export function saveDeck() {
    if (GameState.gameMode === 'online_deck_edit') {
        const settings = {
            leaderId: GameState.playerConfig?.id || 'android',
            stage: GameState.selectedStageId || 'plain'
        };
        localStorage.setItem('mini_card_battle_online_last_settings', JSON.stringify(settings));
    }
    
    // 試練・防衛戦含め、デッキ自体の保存は `saveCurrentEditDeck` の分岐に一任する
    saveCurrentEditDeck();

    const invKey = `mini_card_battle_inventory`;
    localStorage.setItem(invKey, JSON.stringify(GameState.playerInventory));

    // プレミアムカード解放状態もセーブ
    localStorage.setItem('mini_card_battle_unlocked_premium', JSON.stringify(GameState.unlockedPremiumCards));

    // 選択中プレイマットもセーブ
    let playmatSelectKey = GameState.playerConfig ? `mini_card_battle_playmat_${GameState.playerConfig.id}` : null;
    if (typeof GameState.gameMode !== 'undefined' && GameState.gameMode === 'defense_register') {
        playmatSelectKey = 'mini_card_battle_playmat_defense';
    }
    if (playmatSelectKey) {
        if (GameState.selectedPlaymatId) {
            localStorage.setItem(playmatSelectKey, GameState.selectedPlaymatId);
        } else {
            localStorage.removeItem(playmatSelectKey);
        }
    }

    // 所持プレイマットもセーブ
    localStorage.setItem('mini_card_battle_owned_playmats', JSON.stringify(ownedPlaymats));
}

export function startBattleFlow() {
    loadDeck();
    renderDeckEdit();
    switchScreen('screen-deck-edit');
}

export let renderDeckEditHook = null;
export function setRenderDeckEditHook(h) { renderDeckEditHook = h; }
export function renderDeckEdit() {
    if (renderDeckEditHook) return renderDeckEditHook();
    executeRenderDeckEdit();
}
export function executeRenderDeckEdit() {
    // DeckEditorScreen.jsx handles the rendering natively.
}

export function addCardToDeck(template) {
    if (GameState.playerDeckSelection.length >= DECK_SIZE) return;
    const inDeckCount = GameState.playerDeckSelection.filter(c => c.id === template.id).length;
    const ownedCount = GameState.playerInventory[template.id] || 0;
    if (inDeckCount >= ownedCount) return;

    GameState.playerDeckSelection.push({ ...template });
    playSound(SOUNDS.seClick);
    renderDeckEdit();
}

export function removeCardFromDeck(cardId) {
    const index = GameState.playerDeckSelection.findIndex(c => c.id === cardId);
    if (index !== -1) {
        GameState.playerDeckSelection.splice(index, 1);
        playSound(SOUNDS.seClick);
        renderDeckEdit();
    }
}

export function clearDeck() {
    playSound(SOUNDS.seClick);
    showConfirmModal("デッキのカードをすべて削除しますか？", () => {
        GameState.playerDeckSelection = [];
        renderDeckEdit();
    });
}

export function resetDeck() {
    playSound(SOUNDS.seClick);
    showConfirmModal("デッキを初期状態に戻しますか？", () => {
        GameState.playerDeckSelection = getInitialDeck(GameState.playerConfig.id);
        renderDeckEdit();
    });
}

export function finishDeckEdit() {
    if (GameState.playerDeckSelection.length !== DECK_SIZE) {
        playSound(SOUNDS.seClick);
        showAlertModal(`デッキを${DECK_SIZE}枚にしてください！`);
        return;
    }
    playSound(SOUNDS.seClick);
    saveDeck(); // ここでまとめて保存

    if (GameState.gameMode === 'defense_register') {
        if (window.showPlayerNameModalState) {
            window.showPlayerNameModalState();
        } else {
            const modal = document.getElementById('modal-player-name');
            if (modal) {
                modal.style.display = 'flex';
                const nameInput = document.getElementById('input-player-name');
                if (nameInput) {
                    const savedName = localStorage.getItem('mini_card_battle_player_name');
                    if (savedName) nameInput.value = savedName;
                }
            }
        }
    } else if (GameState.gameMode === 'online_deck_edit') {
        GameState.appState = 'online';
        if (window.reloadOnlineLobbyConfig) window.reloadOnlineLobbyConfig();
        showOnlineLobby();
    } else {
        GameState.appState = 'battle';
        prepareBattle();
    }
}

export async function submitDefenseDeck(providedName = null) {
    const nameInput = document.getElementById('input-player-name');
    const playerName = providedName || (nameInput ? nameInput.value.trim() : "");

    if (!playerName) {
        showAlertModal("プレイヤーネームを入力してください。");
        return;
    }

    playSound(SOUNDS.seClick);
    localStorage.setItem('mini_card_battle_player_name', playerName);

    const uuid = getOrCreateUUID();
    const payload = {
        uuid: uuid,
        name: playerName,
        character: GameState.playerConfig.id,
        stage: GameState.selectedStageId, // 追加
        deck: GameState.playerDeckSelection.map(c => ({ id: c.id, isPremium: GameState.premiumCards.includes(c.id) }))
    };

    console.log("Registering defense deck:", payload);

    // UIを閉じる
    closePlayerNameModal();

    try {
        const response = await fetch('api/register_deck.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uuid: getOrCreateUUID(),
                name: playerName,
                character: GameState.playerConfig.id,
                stage: GameState.selectedStageId || 'plain',
                deck: GameState.playerDeckSelection.map(c => ({
                    id: c.id,
                    isPremium: GameState.premiumCards ? GameState.premiumCards.includes(c.id) : false
                })),
                playmat: GameState.selectedPlaymatId,
                skin: GameState.playerSkins ? GameState.playerSkins[GameState.playerConfig.id] : null,
                points: parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0,
                total_points: parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) || 0
            })
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const result = await response.json();
        if (result.success) {
            showAlertModal("防衛デッキの登録が完了しました！", () => {
                showDefenseMenu();
            });
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (err) {
        console.error("Registration error:", err);
        showAlertModal("登録に失敗しました。サーバーの設定や接続を確認してください。\n" + err.message);
    }
}

export function exportDeckXML() {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<deck>\n';
    GameState.playerDeckSelection.forEach(c => {
        const skillsAttr = c.skills ? ` skills='${JSON.stringify(c.skills)}'` : '';
        xml += `  <card id="${c.id}" name="${c.name}" power="${c.power}" skill="${c.skill}"${skillsAttr} />\n`;
    });
    xml += '</deck>';
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my_deck_${GameState.playerConfig.id}.xml`;
    a.click();
}

export function importDeckXML(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
        const cards = xmlDoc.getElementsByTagName("card");
        GameState.playerDeckSelection = [];
        for (let i = 0; i < cards.length && i < DECK_SIZE; i++) {
            const id = cards[i].getAttribute("id");
            const template = CARD_MASTER.find(m => m.id === id) || CARD_MASTER[0];
            const count = GameState.playerDeckSelection.filter(c => c.id === id).length;
            if (count < 5) {
                GameState.playerDeckSelection.push({ ...template });
            }
        }
        renderDeckEdit();
    };
    reader.readAsText(file);
}

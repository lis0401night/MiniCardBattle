import { CARD_MASTER } from '../utils/constants/cards.js';
import { DECK_SIZE } from '../utils/constants/config.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { INITIAL_PLAYER_DECK } from '../utils/constants/initial_decks.js';
import { ownedPlaymats, setOwnedPlaymats } from '../utils/constants/playmats.js';
import { playSound, switchScreen, getCardImgUrl, togglePremiumCard, getOrCreateUUID, getSeededRandom } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { prepareBattle } from './battle.js';
import { GameState } from './gameState.js';
import { setupLongPress } from './uiGallery.js';
import { showDefenseMenu, closePlayerNameModal } from './uiMainCore.js';
import { showConfirmModal, showAlertModal } from './uiModals.js';

// ==========================================
// デッキ生成・編集・セーブ・ロードロジック
// ==========================================

export function generateDeck(owner, config, sessionId) {
    let deck = [];

    // オンラインモード：事前に渡された専用デッキ配列を使用する
    if (GameState.gameMode === 'online' && config && Array.isArray(config.deck)) {
        deck = config.deck.map((t, i) => {
            const isPremium = false; // Todo: プレミアム同期が必要なら後で追加
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
        return deck.sort(() => getSeededRandom() - 0.5);
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
        if (GameState.gameMode === 'battle_dungeon' && config.dungeonDeck) {
            deckIds = config.dungeonDeck;
        } else {
            let recipeId = config.id;
            if (GameState.gameMode === 'event_satan') recipeId = 'satan_high';
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
    return deck.sort(() => getSeededRandom() - 0.5);
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

export function loadDeck() {
    if (GameState.gameMode === 'battle_dungeon') {
        if (!GameState.playerDeckSelection || GameState.playerDeckSelection.length !== 20) {
            GameState.playerDeckSelection = (GameState.dungeonCards || []).slice(0, 20).map(id => {
                const template = CARD_MASTER.find(c => c.id === id);
                return template ? { ...template } : null;
            }).filter(Boolean);
        }
        return;
    }

    // リーダーごとに個別のキーを使用 (防衛登録時は共通キー)
    let key = `mini_card_battle_deck_${GameState.playerConfig?.id || 'default'}`;
    if (typeof GameState.gameMode !== 'undefined' && GameState.gameMode === 'defense_register') {
        key = 'mini_card_battle_deck_defense';
    }

    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            GameState.playerDeckSelection = parsed.map(item => {
                // itemが文字列（IDのみ）の場合と、オブジェクト（旧形式）の両方に対応
                const id = typeof item === 'string' ? item : (item.id || "");
                const t = CARD_MASTER.find(m => m.id === id);
                return t ? { ...t } : (typeof item === 'string' ? { id: item } : item);
            });
        } catch (e) {
            console.error("Deck load error:", e);
            GameState.playerDeckSelection = getInitialDeck(GameState.playerConfig.id);
        }
    } else {
        GameState.playerDeckSelection = getInitialDeck(GameState.playerConfig.id);
    }

    // インベントリの読み込み
    const invKey = `mini_card_battle_inventory`;
    const invSaved = localStorage.getItem(invKey);
    if (invSaved) {
        try {
            GameState.playerInventory = JSON.parse(invSaved);
        } catch (e) {
            console.error("Inventory parse error:", e);
            GameState.playerInventory = {};
        }
    } else {
        // 初期インベントリの作成（初期デッキのカードを所持）
        GameState.playerInventory = {};
        INITIAL_PLAYER_DECK.forEach(id => {
            GameState.playerInventory[id] = (GameState.playerInventory[id] || 0) + 1;
        });
    }

    // プレミアムカード設定の読み込み
    const premiumKey = `mini_card_battle_premium_cards`;
    const premiumSaved = localStorage.getItem(premiumKey);
    if (premiumSaved) {
        try {
            GameState.premiumCards = JSON.parse(premiumSaved);
        } catch (e) {
            console.error("Premium cards load error:", e);
            GameState.premiumCards = [];
        }
    } else {
        GameState.premiumCards = [];
    }

    // 解放済みプレミアムカードの読み込み
    const unlockedPremiumKey = `mini_card_battle_unlocked_premium`;
    const unlockedPremiumSaved = localStorage.getItem(unlockedPremiumKey);
    if (unlockedPremiumSaved) {
        try {
            GameState.unlockedPremiumCards = JSON.parse(unlockedPremiumSaved);
        } catch (e) {
            console.error("Unlocked Premium load error:", e);
            GameState.unlockedPremiumCards = [];
        }
    } else {
        GameState.unlockedPremiumCards = [];
    }

    // 所持プレイマットの読み込み
    const playmatsKey = `mini_card_battle_owned_playmats`;
    const playmatsSaved = localStorage.getItem(playmatsKey);
    if (playmatsSaved) {
        try {
            setOwnedPlaymats(JSON.parse(playmatsSaved));
        } catch (e) {
            console.error("Owned playmats load error:", e);
            setOwnedPlaymats([]);
        }
    } else {
        setOwnedPlaymats([]);
    }

    // 選択中プレイマットの読み込み
    let playmatSelectKey = `mini_card_battle_playmat_${GameState.playerConfig.id}`;
    if (typeof GameState.gameMode !== 'undefined' && GameState.gameMode === 'defense_register') {
        playmatSelectKey = 'mini_card_battle_playmat_defense';
    }
    GameState.selectedPlaymatId = localStorage.getItem(playmatSelectKey) || null;
}

export function saveDeck() {
    if (GameState.gameMode === 'battle_dungeon') {
        return; // ダンジョン中は恒常セーブデータにデッキを上書きしない
    }

    if (typeof GameState.gameMode !== 'undefined' && GameState.gameMode === 'defense_register') {
        // 防衛デッキはIDの配列として保存（サーバー送信形式に合わせる）
        const defenseDeck = GameState.playerDeckSelection.map(c => c.id);
        localStorage.setItem('mini_card_battle_deck_defense', JSON.stringify(defenseDeck));
    } else if (GameState.gameMode === 'online_deck_edit') {
        const payload = {
            leaderId: GameState.playerConfig?.id || 'android',
            deck: GameState.playerDeckSelection.map(c => c.id)
        };
        localStorage.setItem('mini_card_battle_online_deck', JSON.stringify(payload));
    } else if (GameState.playerConfig) {
        const key = `mini_card_battle_deck_${GameState.playerConfig.id}`;
        localStorage.setItem(key, JSON.stringify(GameState.playerDeckSelection));
    }

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

import { getRentalDeckOptions, generateDungeonEnemy, getDungeonEnemyCandidates } from '../utils/constants/battleDungeon.js';
import { GameState } from './gameState.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { showConfirmModal, showAlertModal } from './uiModals.js';
import { SOUNDS } from '../utils/sounds.js';
import { initSelectScreen, startGameMode } from './uiMainCore.js';
import { startBattleFlow } from './deck.js';
import { CARD_MASTER } from '../utils/constants/cards.js';

export function initBattleDungeon() {
    playSound(SOUNDS.seClick);
    GameState.gameMode = 'battle_dungeon';

    // 中断データがあるか確認
    if (localStorage.getItem('mini_card_battle_dungeon_save')) {
        GameState.dungeonState = 'resume_select';
    } else {
        GameState.dungeonWinStreak = 0;
        GameState.dungeonCards = [];
        GameState.dungeonOpponents = [];
        GameState.playerDeckSelection = null; // デッキ状態をリセットしレンタル構成を優先
        GameState.dungeonState = 'select_rental_deck';
    }
    switchScreen('screen-battle-dungeon');
}

export function saveDungeonProgress() {
    const saveData = {
        winStreak: GameState.dungeonWinStreak,
        cards: GameState.dungeonCards,
        deck: (GameState.playerDeckSelection || []).map(c => c.id), // デッキ構成を保存
        opponents: GameState.dungeonOpponents,
        leaderId: GameState.playerConfig?.id,
        dungeonState: GameState.dungeonState,
        timestamp: Date.now()
    };
    localStorage.setItem('mini_card_battle_dungeon_save', JSON.stringify(saveData));
}

export function loadDungeonProgress() {
    const json = localStorage.getItem('mini_card_battle_dungeon_save');
    if (!json) return false;
    try {
        const data = JSON.parse(json);
        GameState.dungeonWinStreak = data.winStreak || 0;
        GameState.dungeonCards = data.cards || [];

        // 保存されていたデッキ構成を復元
        if (data.deck) {
            GameState.playerDeckSelection = data.deck.map(id => {
                const template = CARD_MASTER.find(c => c.id === id);
                return template ? { ...template } : null;
            }).filter(Boolean);
        }

        GameState.dungeonOpponents = data.opponents || [];
        GameState.playerConfig = CHARACTERS[data.leaderId] || CHARACTERS.android;
        GameState.dungeonState = data.dungeonState || 'select_opponent';
        GameState.gameMode = 'battle_dungeon';

        // 再描画を促す
        if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
        return true;
    } catch (e) {
        console.error("Failed to load dungeon save", e);
        return false;
    }
}

export function clearDungeonSave() {
    localStorage.removeItem('mini_card_battle_dungeon_save');
}

import { CHARACTERS } from '../utils/constants/characters.js';

export function selectRentalDeck(deckData) {
    playSound(SOUNDS.seSelect);
    // 初期デッキ付与（所持プール）
    GameState.dungeonCards = [...deckData.deck];
    // 初期デッキ選択状態（デッキ）をセット
    GameState.playerDeckSelection = [...deckData.deck].map(id => {
        const template = CARD_MASTER.find(c => c.id === id);
        return template ? { ...template } : null;
    }).filter(Boolean);

    GameState.playerConfig = CHARACTERS[deckData.leaderId];
    GameState.dungeonState = 'select_opponent';
    generateNextOpponents();

    // 最初のリーダー確定タイミングで保存
    saveDungeonProgress();

    if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
}



export function generateNextOpponents() {
    const enemy1 = generateDungeonEnemy(GameState.dungeonWinStreak);
    let enemy2 = generateDungeonEnemy(GameState.dungeonWinStreak);
    // 同じ敵が出ないようにする（フェイルセーフ含む）
    let retry = 0;
    while (enemy1.id === enemy2.id && retry < 10) {
        enemy2 = generateDungeonEnemy(GameState.dungeonWinStreak);
        retry++;
    }
    GameState.dungeonOpponents = [enemy1, enemy2];
    if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
}

export function startDungeonBattle(enemyIndex) {
    playSound(SOUNDS.seClick);
    const enemy = GameState.dungeonOpponents[enemyIndex];
    if (!enemy) return;

    // 敵の設定を反映
    GameState.enemyConfig = enemy;
    GameState.aiLevel = enemy.fixedAiLevel || 3;
    GameState.dungeonState = 'battle';
    GameState.selectedStageId = 'dungeon';

    // ダンジョン敵の場合は専用デッキを設定
    if (enemy.dungeonDeck) {
        GameState.enemyDeckConfig = enemy.dungeonDeck;
    }

    // 会話シーンのセットアップへ
    GameState.appState = 'pre_dialogue';
    import('../utils/constants/battleDungeonCharacter.js').then(({ getDungeonCharacterDialogue }) => {
        const dialogueData = getDungeonCharacterDialogue(enemy.id);
        GameState.dialogueQueue = [
            { speaker: 'enemy', text: dialogueData.preBattleLine || '我が前に立ち塞がるか。' }
        ];
        import('./uiDialogue.js').then(({ setupDialogueScreen }) => {
            setupDialogueScreen();
        });
    });
}

export function winDungeonBattle() {
    GameState.dungeonWinStreak += 1;
    if (GameState.dungeonWinStreak > GameState.dungeonMaxWinStreak) {
        GameState.dungeonMaxWinStreak = GameState.dungeonWinStreak;
        localStorage.setItem('mini_card_battle_dungeon_max_streak', GameState.dungeonMaxWinStreak);
    }
    GameState.dungeonState = 'reward';

    // 勝利直後に保存（報酬選択前でも中断可能にするため）
    saveDungeonProgress();

    switchScreen('screen-battle-dungeon');
    if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
}

export function selectRewardCard(cardId) {
    playSound(SOUNDS.seGet);
    GameState.dungeonCards.push(cardId);
    GameState.dungeonState = 'select_opponent';
    generateNextOpponents();

    // 報酬獲得後に保存
    saveDungeonProgress();
}

export function loseDungeonBattle() {
    playSound(SOUNDS.seDamage);
    showConfirmModal(
        `敗北しました……。到達階層: ${GameState.dungeonWinStreak + 1} 階\nリトライしますか？それともリタイアしますか？`,
        () => {
            // リトライ
            GameState.dungeonState = 'select_opponent';
            switchScreen('screen-battle-dungeon');
            if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
        },
        "リトライ",
        "リタイア",
        () => {
            // リタイア
            retireDungeon();
        }
    );
}

export function retireDungeon() {
    playSound(SOUNDS.seClick);
    GameState.dungeonCards = [];
    GameState.dungeonWinStreak = 0;
    GameState.dungeonOpponents = [];
    GameState.dungeonState = 'none';
    GameState.gameMode = 'title';

    // 中断データを削除
    clearDungeonSave();

    switchScreen('screen-mode-select');
}

export function handleBattleDungeonProgression() {
    if (GameState.appState === 'pre_dialogue') {
        GameState.appState = 'select_player';
        import('./deck.js').then(({ startBattleFlow }) => {
            startBattleFlow();
        });
    } else if (GameState.appState === 'post_dialogue') {
        import('./uiMainCore.js').then(({ performFadeTransition }) => {
            performFadeTransition(() => {
                GameState.appState = 'menu';
                if (GameState.lastBattleResult === 'win') {
                    winDungeonBattle();
                } else {
                    loseDungeonBattle();
                }
            });
        });
    }
}

import { switchScreen } from '../utils/gameUtils.js';
import { startBattleFlow } from './deck.js';
import { handleEventProgression } from './events.js';
import { GameState } from './gameState.js';
import { handleStoryProgression } from './story.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { performFadeTransition, initSelectScreen, showDefenseBattleList, showOnlineLobby } from './uiMainCore.js';
import { handleBattleDungeonProgression } from './battleDungeon.js';

/**
 * Mini Card Battle - 共通進行管理 (progression.js)
 * ストーリー、フリーバトル、イベントの進行ロジックを統合・管理するハブ
 */

/**
 * ダイアログ終了後などの「次のステップ」を判定して実行する
 */
export function handleProgressionNextStep() {
    if (GameState.gameMode === 'free') {
        handleFreeBattleProgression();
    } else if (GameState.gameMode === 'battle_dungeon') {
        handleBattleDungeonProgression();
        return;
    } else if (GameState.gameMode === 'defense_attack') {
        if (typeof showDefenseBattleList === 'function') {
            showDefenseBattleList();
        } else {
            switchScreen('screen-mode-select');
        }
    } else if (GameState.gameMode === 'event_satan') {
        if (typeof handleEventProgression === 'function') {
            handleEventProgression();
        } else {
            console.error("handleEventProgression is not defined");
            switchScreen('screen-mode-select');
        }
    } else if (GameState.gameMode === 'online') {
        if (typeof showOnlineLobby === 'function') {
            showOnlineLobby();
        } else {
            switchScreen('screen-online-lobby');
        }
    } else {
        // デフォルトはストーリーモード
        if (typeof handleStoryProgression === 'function') {
            handleStoryProgression();
        } else {
            console.error("handleStoryProgression is not defined");
            switchScreen('screen-mode-select');
        }
    }
}

/**
 * フリーバトルの進行管理
 */
export function handleFreeBattleProgression() {
    if (GameState.appState === 'post_dialogue') {
        performFadeTransition(() => {
            GameState.appState = 'select_enemy';
            initSelectScreen(false);
            switchScreen('screen-select');
        });
    } else if (GameState.appState === 'pre_dialogue') {
        startBattleFlow();
    } else {
        switchScreen('screen-mode-select');
    }
}

import { switchScreen } from '../utils/gameUtils.js';
import { startBattleFlow } from './deck.js';
import { handleEventProgression } from './events.js';
import { GameState } from './gameState.js';
import { handleStoryProgression } from './story.js';
import { performFadeTransition, initSelectScreen } from './uiMainCore.js';

/**
 * Mini Card Battle - 共通進行管理 (progression.js)
 * ストーリー、フリーバトル、イベントの進行ロジックを統合・管理するハブ
 */

/**
 * ダイアログ終了後などの「次のステップ」を判定して実行する
 */
export function handleProgressionNextStep() {
    console.log(`handleProgressionNextStep: GameState.gameMode=${GameState.gameMode}, GameState.appState=${GameState.appState}`);

    if (GameState.gameMode === 'free') {
        handleFreeBattleProgression();
    } else if (GameState.gameMode === 'event_satan') {
        if (typeof handleEventProgression === 'function') {
            handleEventProgression();
        } else {
            console.error("handleEventProgression is not defined");
            switchScreen('screen-mode-select');
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

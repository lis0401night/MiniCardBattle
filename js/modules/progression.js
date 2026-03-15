/**
 * Mini Card Battle - 共通進行管理 (progression.js)
 * ストーリー、フリーバトル、イベントの進行ロジックを統合・管理するハブ
 */

/**
 * ダイアログ終了後などの「次のステップ」を判定して実行する
 */
function handleProgressionNextStep() {
    console.log(`handleProgressionNextStep: gameMode=${gameMode}, appState=${appState}`);

    if (gameMode === 'free') {
        handleFreeBattleProgression();
    } else if (gameMode === 'event_satan') {
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
function handleFreeBattleProgression() {
    if (appState === 'post_dialogue') {
        performFadeTransition(() => {
            appState = 'select_enemy';
            initSelectScreen(false);
            switchScreen('screen-select');
        });
    } else if (appState === 'pre_dialogue') {
        startBattleFlow();
    } else {
        switchScreen('screen-mode-select');
    }
}

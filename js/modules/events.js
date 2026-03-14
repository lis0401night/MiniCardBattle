/**
 * Mini Card Battle - イベントモード管理 (events.js)
 */

function initEventSatanMode(charId) {
    playerConfig = { ...CHARACTERS[charId] };
    enemyConfig = { ...CHARACTERS['satan'], hp: 100 };
    gameMode = 'event_satan';
    aiLevel = 3;
    battleCount = 7;
    selectedStageId = 'satan'; // ステージを魔王城に固定

    appState = 'story_intro';

    // フェーズ1: 噂と道中 (ナレーターとプレイヤーの独白)
    if (playerConfig.eventSatanIntro && playerConfig.eventSatanIntro.length >= 2) {
        // 最初の2行（噂と反応）を導入に使用
        dialogueQueue = [playerConfig.eventSatanIntro[0], playerConfig.eventSatanIntro[1]];
    } else {
        dialogueQueue = [
            { speaker: 'narrator', text: "一度倒したはずの魔王サタンが復活したという噂。不吉な予感と共に、再び魔界の最深部へ足を踏み入れる。" },
            { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'intro') }
        ];
    }

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

/**
 * イベントモード（サタン戦）の進行管理
 */
function handleEventProgression() {
    if (appState === 'story_intro') {
        // フェーズ2: 魔王城への到着と対峙 (暗転を挟んでサタンとの掛け合いへ)
        appState = 'pre_dialogue';

        let confrontationLines = [];
        if (playerConfig.eventSatanIntro && playerConfig.eventSatanIntro.length >= 3) {
            // 3行目（到着の描写）
            confrontationLines.push(playerConfig.eventSatanIntro[2]);
        }

        // サタンの共通台詞
        confrontationLines.push({
            speaker: 'enemy',
            text: "ククク……よくぞ戻った、人間ども。一度の死で我が絶望はより深く、より強固となった。貴様らの希望という名の光、今度こそ完全に塗り潰してやろう。"
        });

        // プレイヤーの決意
        confrontationLines.push({
            speaker: 'player',
            text: playerConfig.preBattleLine || "覚悟しなさい、サタン！"
        });

        dialogueQueue = confrontationLines;

        performFadeTransition(() => {
            setupEventSatanConfrontation();
        });
    } else if (appState === 'pre_dialogue') {
        // 導入ダイアログ(対峙)後はデッキ編成へ
        performFadeTransition(() => {
            startBattleFlow();
        });
    } else if (appState === 'post_dialogue') {
        if (lastBattleResult === 'lose') {
            // 敗北時はコンテニュー画面へ
            showContinueScreen();
        } else {
            // 戦闘終了後のダイアログが終わったらイベントメニューへ戻る（勝利時）
            performFadeTransition(() => {
                switchScreen('screen-event-menu');
            });
        }
    }
}

/**
 * サタン戦の対峙ダイアログ（コンテニュー時などにも使用）を設定
 */
function setupEventSatanConfrontation() {
    appState = 'pre_dialogue';
    let confrontationLines = [];
    if (playerConfig.eventSatanIntro && playerConfig.eventSatanIntro.length >= 3) {
        // 3行目（到着の描写）
        confrontationLines.push(playerConfig.eventSatanIntro[2]);
    }

    // サタンの共通台詞
    confrontationLines.push({
        speaker: 'enemy',
        text: "ククク……よくぞ戻った、人間ども。一度の死で我が絶望はより深く、より強固となった。貴様らの希望という名の光、今度こそ完全に塗り潰してやろう。"
    });

    // プレイヤーの決意
    confrontationLines.push({
        speaker: 'player',
        text: playerConfig.preBattleLine || "覚悟しなさい、サタン！"
    });

    dialogueQueue = confrontationLines;
    setupDialogueScreen();
}

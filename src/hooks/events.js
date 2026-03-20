import { CHARACTERS } from '../utils/constants/characters.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { getDialogue, switchScreen } from '../utils/gameUtils.js';
import { startBattleFlow } from './deck.js';
import { GameState } from './gameState.js';
import { setupDialogueScreen, showContinueScreen } from './uiDialogue.js';
import { performFadeTransition } from './uiMainCore.js';

/**
 * Mini Card Battle - イベントモード管理 (events.js)
 */

export function initEventSatanMode(charId) {
    GameState.playerConfig = { ...CHARACTERS[charId] };
    GameState.enemyConfig = { ...CHARACTERS['satan'], hp: 100 };
    GameState.gameMode = 'event_satan';
    GameState.aiLevel = 3;
    GameState.battleCount = 7;
    GameState.selectedStageId = 'satan'; // ステージを魔王城に固定

    GameState.appState = 'story_intro';

    // フェーズ1: 噂と道中 (ナレーターとプレイヤーの独白)
    if (GameState.playerConfig.eventSatanIntro && GameState.playerConfig.eventSatanIntro.length >= 2) {
        // 最初の2行（噂と反応）を導入に使用
        GameState.dialogueQueue = [GameState.playerConfig.eventSatanIntro[0], GameState.playerConfig.eventSatanIntro[1]];
    } else {
        GameState.dialogueQueue = [
            { speaker: 'narrator', text: "一度倒したはずの魔王サタンが復活したという噂。不吉な予感と共に、再び魔界の最深部へ足を踏み入れる。" },
            { speaker: 'player', text: getDialogue(GameState.playerConfig, GameState.enemyConfig, 'intro') }
        ];
    }

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

/**
 * イベントモード（サタン戦）の進行管理
 */
export function handleEventProgression() {
    if (GameState.appState === 'story_intro') {
        // フェーズ2: 魔王城への到着と対峙 (暗転を挟んでサタンとの掛け合いへ)
        GameState.appState = 'pre_dialogue';

        let confrontationLines = [];
        if (GameState.playerConfig.eventSatanIntro && GameState.playerConfig.eventSatanIntro.length >= 3) {
            // 3行目（到着の描写）
            confrontationLines.push(GameState.playerConfig.eventSatanIntro[2]);
        }

        // サタンの共通台詞
        confrontationLines.push({
            speaker: 'enemy',
            text: "ククク……よくぞ戻った、人間ども。一度の死で我が絶望はより深く、より強固となった。貴様らの希望という名の光、今度こそ完全に塗り潰してやろう。"
        });

        // プレイヤーの決意
        confrontationLines.push({
            speaker: 'player',
            text: GameState.playerConfig.preBattleLine || "覚悟しなさい、サタン！"
        });

        GameState.dialogueQueue = confrontationLines;

        performFadeTransition(() => {
            setupEventSatanConfrontation();
        });
    } else if (GameState.appState === 'pre_dialogue') {
        // 導入ダイアログ(対峙)後はデッキ編成へ
        performFadeTransition(() => {
            startBattleFlow();
        });
    } else if (GameState.appState === 'post_dialogue') {
        if (GameState.lastBattleResult === 'lose') {
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
export function setupEventSatanConfrontation() {
    GameState.appState = 'pre_dialogue';
    let confrontationLines = [];
    if (GameState.playerConfig.eventSatanIntro && GameState.playerConfig.eventSatanIntro.length >= 3) {
        // 3行目（到着の描写）
        confrontationLines.push(GameState.playerConfig.eventSatanIntro[2]);
    }

    // サタンの共通台詞
    confrontationLines.push({
        speaker: 'enemy',
        text: "ククク……よくぞ戻った、人間ども。一度の死で我が絶望はより深く、より強固となった。貴様らの希望という名の光、今度こそ完全に塗り潰してやろう。"
    });

    // プレイヤーの決意
    confrontationLines.push({
        speaker: 'player',
        text: GameState.playerConfig.preBattleLine || "覚悟しなさい、サタン！"
    });

    GameState.dialogueQueue = confrontationLines;
    setupDialogueScreen();
}

/**
 * 他プレイヤーのデッキデータをJSファイルから読み込む
 */
export async function loadPlayerDeck(uuid) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `api/decks/players/${uuid}.js?t=${Date.now()}`;
        script.onload = () => {
            if (typeof PLAYER_DECKS !== 'undefined' && PLAYER_DECKS[uuid]) {
                const data = PLAYER_DECKS[uuid];
                // 敵デッキデータとして整形
                const enemyDeckData = {
                    id: 'player_defense',
                    name: data.name,
                    character: data.character,
                    deck: data.deck
                };
                // ENEMY_DECKSに一時的に登録
                ENEMY_DECKS['player_defense'] = data.deck;
                
                if (script.parentNode) script.parentNode.removeChild(script);
                resolve(enemyDeckData);
            } else {
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error('Player deck data not found in script'));
            }
        };
        script.onerror = () => {
            document.body.removeChild(script);
            reject(new Error('Failed to load player deck script'));
        };
        document.body.appendChild(script);
    });
}

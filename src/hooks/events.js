import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { EVENT_DIALOGUES } from '../utils/constants/eventDialogues.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { getDialogue, switchScreen } from '../utils/gameUtils.js';
import { startBattleFlow } from './deck.js';
import { GameState } from './gameState.js';
import { setupDialogueScreen, showContinueScreen } from './uiDialogue.js';
import { performFadeTransition } from './uiMainCore.js';

/**
 * Mini Card Battle - イベントモード管理 (events.js)
 */

export function initEventAndroidHighMode(charId) {
    GameState.playerConfig = { ...CHARACTERS[charId] };
    GameState.enemyConfig = {
        ...CHARACTERS['android'],
        hp: 40,
        name: 'フルアーマー アイギス',
        leaderSkill: {
            name: '一斉射撃',
            desc: '(SP:4) 敵の場のすべてのカードに4ダメージ、敵リーダーに2ダメージを与える。',
            cost: 4,
            action: 'android_high_volley'
        }
    };
    GameState.gameMode = 'event_android_high';
    GameState.aiLevel = 3;
    GameState.battleCount = 7;
    GameState.selectedStageId = 'android';

    if (!GameState.enemySkins) GameState.enemySkins = {};
    GameState.enemySkins['android'] = 'android_high';

    if (typeof getSkinImage === 'function') {
        GameState.enemyConfig.image = getSkinImage(GameState.enemyConfig, 'android_high', 'image');
        GameState.enemyConfig.imageLose = getSkinImage(GameState.enemyConfig, 'android_high', 'imageLose');
        GameState.enemyConfig.icon = getSkinImage(GameState.enemyConfig, 'android_high', 'icon');
    }

    GameState.appState = 'story_intro';

    const introDialogues = EVENT_DIALOGUES.event_android_high[charId] || [];
    if (introDialogues.length >= 2) {
        GameState.dialogueQueue = [
            introDialogues[0],
            introDialogues[1]
        ];
    } else {
        GameState.dialogueQueue = [
            { speaker: 'narrator', text: "今日はアイギスの新装備のテスト運用日。広大な演習場に、重装備に身を包んだ彼女の姿があった。" },
            { speaker: 'enemy', text: "テスト対象、確認……これより新装備の戦闘テストを開始します。" },
            { speaker: 'player', text: "わかった、アイギス。手加減はしないよ！" }
        ];
    }

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

/**
 * 高難易度イベント：熱砂の客人 イグニス の初期化
 * ストーリー：砂漠の宴に招待された主人公が、退屈していた竜姫イグニスに戦いを申し込まれる
 */
export function initEventDragonHighMode(charId) {
    GameState.playerConfig = { ...CHARACTERS[charId] };
    GameState.enemyConfig = {
        ...CHARACTERS['dragon'],
        hp: 40,
        name: '熱砂の客人 イグニス',
        leaderSkill: {
            name: '焦熱のプレリュード',
            desc: '(SP:4) 場のすべてのカードに2ダメージ、自分のレーンに「イグニス(P:7/伝説)」を1体配置する。',
            cost: 4,
            action: 'dragon_high_ritual'
        }
    };
    GameState.gameMode = 'event_dragon_high';
    GameState.aiLevel = 3;
    GameState.battleCount = 7;
    GameState.selectedStageId = 'dragon'; // 竜の領域ステージ固定

    // イグニスに「熱砂の客人」スキンを適用
    if (!GameState.enemySkins) GameState.enemySkins = {};
    GameState.enemySkins['dragon'] = 'dragon_high';

    if (typeof getSkinImage === 'function') {
        GameState.enemyConfig.image = getSkinImage(GameState.enemyConfig, 'dragon_high', 'image');
        GameState.enemyConfig.imageLose = getSkinImage(GameState.enemyConfig, 'dragon_high', 'imageLose');
        GameState.enemyConfig.icon = getSkinImage(GameState.enemyConfig, 'dragon_high', 'icon');
    }

    GameState.appState = 'story_intro';

    // イベント導入ダイアログ（キャラ別・1〜2行目）
    const introDialogues = EVENT_DIALOGUES.event_dragon_high[charId] || [];
    if (introDialogues.length >= 2) {
        GameState.dialogueQueue = [introDialogues[0], introDialogues[1]];
    } else {
        GameState.dialogueQueue = [
            { speaker: 'narrator', text: '砂漠の都市国家から招待状が届いた。豪奢な宴の片隅で、退屈そうにしている竜姫の姿があった。' },
            { speaker: 'player', text: 'あの人、どこかで見たような……。' }
        ];
    }

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

export function initEventSatanMode(charId) {
    GameState.playerConfig = { ...CHARACTERS[charId] };
    GameState.enemyConfig = { ...CHARACTERS['satan'], hp: 100 };
    GameState.gameMode = 'event_satan';
    GameState.aiLevel = 3;
    GameState.battleCount = 7;
    GameState.selectedStageId = 'satan'; // ステージを魔王城に固定

    GameState.appState = 'story_intro';

    // フェーズ1: 噂と道中 (ナレーターとプレイヤーの独白)
    const introDialogues = EVENT_DIALOGUES.event_satan[charId] || [];
    if (introDialogues.length >= 2) {
        // 最初の2行（噂と反応）を導入に使用
        GameState.dialogueQueue = [introDialogues[0], introDialogues[1]];
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
 * イベントモード（サタン戦・アイギス高難易度戦・イグニス高難易度戦）の進行管理
 */
export function handleEventProgression() {
    if (GameState.appState === 'story_intro') {
        GameState.appState = 'pre_dialogue';

        if (GameState.gameMode === 'event_android_high') {
            performFadeTransition(() => {
                setupEventAndroidHighConfrontation();
            });
        } else if (GameState.gameMode === 'event_dragon_high') {
            performFadeTransition(() => {
                setupEventDragonHighConfrontation();
            });
        } else {
            let confrontationLines = [];
            const charId = GameState.playerConfig.id;
            const introDialogues = EVENT_DIALOGUES.event_satan[charId] || [];
            if (introDialogues.length >= 3) {
                // 3行目（到着の描写）
                confrontationLines.push(introDialogues[2]);
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
        }
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
    const charId = GameState.playerConfig.id;
    const introDialogues = EVENT_DIALOGUES.event_satan[charId] || [];
    if (introDialogues.length >= 3) {
        // 3行目（到着の描写）
        confrontationLines.push(introDialogues[2]);
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

export function setupEventAndroidHighConfrontation() {
    GameState.appState = 'pre_dialogue';

    let confrontationLines = [];
    const charId = GameState.playerConfig.id;
    const introDialogues = EVENT_DIALOGUES.event_android_high[charId] || [];
    if (introDialogues.length >= 3) {
        confrontationLines.push(introDialogues[2]);
    } else {
        confrontationLines.push({ speaker: 'narrator', text: "広大な演習場。アイギスは新装備「フルアーマーユニット」を纏い、静かにこちらを見つめている。" });
    }

    confrontationLines.push({ speaker: 'enemy', text: "フルアーマーユニット、出力安定。テスト対象、確認。……手加減は不要です。いつでもどうぞ。" });

    // プレイヤーの決意（あれば設定、なければ固定テキスト）
    confrontationLines.push({
        speaker: 'player',
        text: GameState.playerConfig.preBattleLine || "行くよ、アイギス！"
    });

    GameState.dialogueQueue = confrontationLines;
    setupDialogueScreen();
}

/**
 * 熱砂の客人イグニス戦の対峙ダイアログ（コンテニュー時などにも使用）
 */
export function setupEventDragonHighConfrontation() {
    GameState.appState = 'pre_dialogue';

    let confrontationLines = [];
    const charId = GameState.playerConfig.id;
    const introDialogues = EVENT_DIALOGUES.event_dragon_high[charId] || [];

    // 3行目（宴の場面描写）をフォールバック付きで設定
    if (introDialogues.length >= 3) {
        confrontationLines.push(introDialogues[2]);
    } else {
        confrontationLines.push({
            speaker: 'narrator',
            text: '宴の一角、黒いドレスを纏った竜姫が退屈そうに座っていた。周囲の人間は近づけず、その席だけが静寂に包まれていた。'
        });
    }

    // イグニスの台詞（プレイヤーがイグニス本人かどうかで分岐）
    if (charId === 'dragon') {
        // ミラーマッチ：もう一人のイグニスが話しかけてくる
        confrontationLines.push({
            speaker: 'enemy',
            text: 'あら、私と同じ顔ね。面白い……ちょうど退屈してたの。ねぇ、あなたも私と同じなら、戦うのも好きでしょ？ 付き合ってくれない？'
        });
        confrontationLines.push({
            speaker: 'player',
            text: 'なんで私が私と戦わなきゃいけないのよ！ ……でも、まぁ、退屈してたのは私も同じだからいいわ。やってやるんだから！'
        });
    } else {
        // 通常：退屈したイグニスが戦いを申し込む
        confrontationLines.push({
            speaker: 'enemy',
            text: 'はぁ……退屈。踊りも料理も、全っ然楽しくないんだから。ねぇ、ちょうど良かった。私と戦いなさい！'
        });
        confrontationLines.push({
            speaker: 'player',
            text: GameState.playerConfig.preBattleLine || 'こちらも暇を持て余していたところだよ。受けて立とう！'
        });
    }

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

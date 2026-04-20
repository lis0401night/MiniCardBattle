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

    const dialogues = EVENT_DIALOGUES.event_android_high[charId] || EVENT_DIALOGUES.event_android_high['default'];
    GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

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

    const dialogues = EVENT_DIALOGUES.event_dragon_high[charId] || EVENT_DIALOGUES.event_dragon_high['default'];
    GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

/**
 * 高難易度イベント：暗黒騎士 セレスティア の初期化
 */
export function initEventKnightHighMode(charId) {
    GameState.playerConfig = { ...CHARACTERS[charId] };
    GameState.enemyConfig = {
        ...CHARACTERS['knight'],
        hp: 40,
        name: '暗黒騎士 セレスティア',
        leaderSkill: {
            name: '暗黒の軍勢',
            desc: '(SP:3) 自分のレーンに「騎士(P:2/必殺/守護)」を最大2体召喚し、自分の場のすべてのカードのパワーを+2する。',
            cost: 3,
            action: 'evil_march'
        }
    };
    GameState.gameMode = 'event_knight_high';
    GameState.aiLevel = 3;
    GameState.battleCount = 7;
    GameState.selectedStageId = 'knight'; // 騎士の領域固定

    // セレスティアに「暗黒騎士 セレスティア」スキンを適用
    if (!GameState.enemySkins) GameState.enemySkins = {};
    GameState.enemySkins['knight'] = 'knight_high';

    if (typeof getSkinImage === 'function') {
        GameState.enemyConfig.image = getSkinImage(GameState.enemyConfig, 'knight_high', 'image');
        GameState.enemyConfig.imageLose = getSkinImage(GameState.enemyConfig, 'knight_high', 'imageLose');
        GameState.enemyConfig.icon = getSkinImage(GameState.enemyConfig, 'knight_high', 'icon');
    }

    GameState.appState = 'story_intro';

    const dialogues = EVENT_DIALOGUES.event_knight_high[charId] || EVENT_DIALOGUES.event_knight_high['default'];
    GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

/**
 * 高難易度イベント：魔界の征服者 ナイア の初期化
 */
export function initEventCthulhuHighMode(charId) {
    GameState.playerConfig = { ...CHARACTERS[charId] };
    GameState.enemyConfig = {
        ...CHARACTERS['cthulhu'],
        hp: 40,
        name: '魔界の征服者 ナイア',
        leaderSkill: {
            name: '異界の扉',
            desc: '(SP:2) 手札からカードを最大2枚捨てて同数引き、手札すべてのパワーを+2する。相手の手札からランダムに2枚を捨て、同数「虚空(パワー1)」を加える。',
            cost: 2,
            action: 'otherworld_gate'
        }
    };
    GameState.gameMode = 'event_cthulhu_high';
    GameState.aiLevel = 3;
    GameState.battleCount = 7;
    GameState.selectedStageId = 'cthulhu';

    // ナイアに「魔界の征服者 ナイア」スキンを適用
    if (!GameState.enemySkins) GameState.enemySkins = {};
    GameState.enemySkins['cthulhu'] = 'cthulhu_high';

    if (typeof getSkinImage === 'function') {
        GameState.enemyConfig.image = getSkinImage(GameState.enemyConfig, 'cthulhu_high', 'image');
        GameState.enemyConfig.imageLose = getSkinImage(GameState.enemyConfig, 'cthulhu_high', 'imageLose');
        GameState.enemyConfig.icon = getSkinImage(GameState.enemyConfig, 'cthulhu_high', 'icon');
    }

    GameState.appState = 'story_intro';

    const dialogues = EVENT_DIALOGUES.event_cthulhu_high[charId] || EVENT_DIALOGUES.event_cthulhu_high['default'];
    GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

export function initEventElfHighMode(charId) {
    GameState.playerConfig = { ...CHARACTERS[charId] };
    GameState.enemyConfig = {
        ...CHARACTERS['elf'],
        hp: 40,
        name: 'リナ&ヴォイテク',
        leaderSkill: {
            name: '連携攻撃',
            desc: '(SP:2) 相手の場のカード1枚を選び、破壊し、自分のレーンに「ヴォイテク(P:3/伝説/貫通)」を1体配置する。',
            cost: 2,
            action: 'elf_polarbear_combo'
        }
    };
    GameState.gameMode = 'event_elf_high';
    GameState.aiLevel = 3;
    GameState.battleCount = 7;
    GameState.selectedStageId = 'elf'; // ロストレイルの森

    if (!GameState.enemySkins) GameState.enemySkins = {};
    GameState.enemySkins['elf'] = 'elf_high';

    if (typeof getSkinImage === 'function') {
        GameState.enemyConfig.image = getSkinImage(GameState.enemyConfig, GameState.enemySkins['elf'], 'image');
        GameState.enemyConfig.imageLose = getSkinImage(GameState.enemyConfig, GameState.enemySkins['elf'], 'imageLose');
        GameState.enemyConfig.icon = getSkinImage(GameState.enemyConfig, GameState.enemySkins['elf'], 'icon');
    }

    GameState.appState = 'story_intro';

    const dialogues = EVENT_DIALOGUES.event_elf_high[charId] || EVENT_DIALOGUES.event_elf_high['default'];
    GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

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

    const dialogues = EVENT_DIALOGUES.event_satan[charId] || EVENT_DIALOGUES.event_satan['default'];
    GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

/**
 * イベントモード進行管理
 */
export function handleEventProgression() {
    if (GameState.appState === 'story_intro') {
        GameState.appState = 'pre_dialogue';
        
        if (GameState.gameMode.startsWith('event_')) {
            performFadeTransition(() => {
                setupEventConfrontation();
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
 * すべてのイベント共通の対峙ダイアログ（コンテニュー時などにも使用）を設定
 */
export function setupEventConfrontation() {
    GameState.appState = 'pre_dialogue';
    const charId = GameState.playerConfig.id;
    const modeDialogues = EVENT_DIALOGUES[GameState.gameMode] || {};
    const dialogs = modeDialogues[charId] || modeDialogues['default'] || [];

    let confrontationLines = [];
    // 3:対峙描写, 4:敵ボス台詞
    if (dialogs[3]) confrontationLines.push({...dialogs[3]});
    if (dialogs[4]) confrontationLines.push({...dialogs[4]});
    
    // 5:プレイヤーの返し台詞
    // ミラーマッチ等で [5] に専用台詞が手動設定されている場合はそれを使う。
    // 無い場合でも、キャラクターの preBattleLine があれば動的にそれを第三の台詞として表示する。
    if (dialogs[5]) {
        confrontationLines.push({...dialogs[5]});
    } else if (GameState.playerConfig.preBattleLine) {
        confrontationLines.push({
            speaker: 'player',
            text: GameState.playerConfig.preBattleLine
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

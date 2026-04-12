import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { incrementStat } from '../utils/constants/achievements.js';
import { getDialogue, playSound, stopSound, stopAllBGM, switchScreen, getCardImgUrl } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { setupEventSatanConfrontation, setupEventAndroidHighConfrontation } from './events.js';
import { GameState } from './gameState.js';
import { handleProgressionNextStep } from './progression.js';

// ==========================================
// UI Dialogue Logic (Dialogue & Sequences)
// ==========================================

export function startNextBattleSequence() {
    if (GameState.gameMode !== 'story') return;
    if (GameState.battleCount > 7) {
        startEndingSequence();
        return;
    }
    let nextEnemyId = GameState.storyQueue[GameState.battleCount - 1];
    if (nextEnemyId === 'shadow') {
        GameState.enemyConfig = { ...GameState.playerConfig };
        GameState.enemyConfig.isShadow = true;
        GameState.enemyConfig.name = `影の${GameState.playerConfig.name}`;
    } else {
        const charId = nextEnemyId || 'android';
        GameState.enemyConfig = { ...CHARACTERS[charId] };
        GameState.enemyConfig.isShadow = false;
    }
    if (GameState.gameMode === 'story') {
        GameState.aiLevel = GameState.storyDifficulty;
        console.log(`Story Mode Battle: ${GameState.battleCount}, GameState.aiLevel set to: ${GameState.aiLevel}`);
    }
    GameState.appState = 'pre_dialogue';
    let introText = (GameState.enemyConfig.preBattleLine || "次は私がお相手よ。") + "\n" + getDialogue(GameState.enemyConfig, GameState.playerConfig, 'intro');
    if (GameState.enemyConfig.isShadow) introText = "・・・・";
    GameState.dialogueQueue = [
        { speaker: 'enemy', text: introText },
        { speaker: 'player', text: GameState.enemyConfig.isShadow ? (GameState.playerConfig.mirrorIntro || "なっ、自分自身だと……！？") : getDialogue(GameState.playerConfig, GameState.enemyConfig, 'intro') }
    ];
    if (GameState.enemyConfig.id === 'satan' && !GameState.enemyConfig.isShadow) {
        introText = "……よくぞここまで辿り着いたな。" + getDialogue(GameState.enemyConfig, GameState.playerConfig, 'intro');
        GameState.dialogueQueue[0].text = introText;
    }
    setupDialogueScreen();
}

export function startEndingSequence() {
    GameState.appState = 'ending_dialogue';
    stopSound(SOUNDS.bgmTitle); stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle); stopSound(SOUNDS.bgmStageAndroid);
    playSound(SOUNDS.bgmEnding);
    GameState.dialogueQueue = GameState.playerConfig.dialogue.ending;
    GameState.currentDialogueIndex = 0;

    // 実績: ストーリークリア (完遂時にプレイヤーキャラクターのIDで記録)
    if (typeof incrementStat === 'function' && GameState.playerConfig && GameState.playerConfig.id) {
        incrementStat('storyClears', GameState.playerConfig.id);
    }
    
    window.currentDialogueData = window.currentDialogueData || {};
    window.currentDialogueData.centerMode = true;
    window.currentDialogueData.leftImage = getSkinImage(GameState.playerConfig, GameState.playerSkins[GameState.playerConfig.id], 'image');
    window.currentDialogueData.rightDisplay = 'none';

    document.getElementById('portrait-left').src = window.currentDialogueData.leftImage;
    switchScreen('screen-dialogue');
    showNextDialogue(true);
}

export function setupDialogueScreen() {
    GameState.isProcessing = false;
    GameState.currentDialogueIndex = 0;
    
    let pLeftImg = getSkinImage(GameState.playerConfig, GameState.playerSkins[GameState.playerConfig.id], 'image') || getCardImgUrl(GameState.playerConfig);
    
    let enemySkinId = GameState.enemySkins ? GameState.enemySkins[GameState.enemyConfig.id] : 'default';
    let pRightImg = getSkinImage(GameState.enemyConfig, enemySkinId, 'image') || GameState.enemyConfig.image || getCardImgUrl(GameState.enemyConfig);
    
    const isCenter = (GameState.appState === 'story_intro' || GameState.appState === 'inter_battle_story');

    if (GameState.appState === 'post_dialogue') {
        if (GameState.lastBattleResult === 'win') {
            pRightImg = getSkinImage(GameState.enemyConfig, enemySkinId, 'imageLose') || GameState.enemyConfig.imageLose || pRightImg;
        }
        else if (GameState.lastBattleResult === 'lose') {
            const loseImg = getSkinImage(GameState.playerConfig, GameState.playerSkins[GameState.playerConfig.id], 'imageLose');
            pLeftImg = loseImg || pLeftImg;
        }
    }
    
    window.currentDialogueData = window.currentDialogueData || {};
    window.currentDialogueData.centerMode = isCenter;
    window.currentDialogueData.leftImage = pLeftImg;
    window.currentDialogueData.rightImage = pRightImg;
    window.currentDialogueData.rightFilter = GameState.enemyConfig.isShadow ? 'grayscale(1) brightness(0.6) contrast(1.2)' : 'none';
    window.currentDialogueData.rightDisplay = 'block';
    
    switchScreen('screen-dialogue');
    showNextDialogue(true);
}

export async function showNextDialogue(force = false) {
    if (GameState.isProcessing && !force) return;
    if (GameState.currentDialogueIndex >= GameState.dialogueQueue.length) {
        // 次の画面への遷移（performFadeTransition等）が isProcessing 判定を要求するため、false に戻す
        GameState.isProcessing = false; 
        handleProgressionNextStep();
        return;
    }
    playSound(SOUNDS.seClick);
    
    const cur = GameState.dialogueQueue[GameState.currentDialogueIndex];
    window.currentDialogueData = window.currentDialogueData || {};

    // 1人（モノローグ）状態から対戦相手が登場した時の暗転演出
    let didFade = false;
    if (window.currentDialogueData.centerMode && (cur.speaker === 'enemy' || cur.speaker !== 'player') && GameState.appState !== 'ending_dialogue') {
        // centerMode のまま敵のターンが来たら、2人画面へ移行するべく暗転する
        if (cur.speaker === 'enemy') {
            GameState.isProcessing = true; // クリック連打を防止
            didFade = true;
            
            // React側に暗転を指示
            window.currentDialogueData.isFading = true;
            if (window._reactUpdateDialogueUI) window._reactUpdateDialogueUI(window.currentDialogueData);
            
            // 暗転（フェードアウト）が完了するまで待機
            await new Promise(r => setTimeout(r, 450));
            
            // 暗転中にキャラ位置を二人画面（centerMode = false）に切り替える
            window.currentDialogueData.centerMode = false;
        }
    }

    if (cur.speaker === 'player') {
        window.currentDialogueData.speakerName = GameState.playerConfig.name;
        window.currentDialogueData.nameColor = GameState.playerConfig.color;
        window.currentDialogueData.leftActive = true;
        if (GameState.appState !== 'ending_dialogue') window.currentDialogueData.rightActive = false;
        window.currentDialogueData.boxBorderColor = GameState.playerConfig.color;
    } else if (cur.speaker === 'narrator') {
        window.currentDialogueData.speakerName = "Narrator";
        window.currentDialogueData.nameColor = "#94a3b8";
        window.currentDialogueData.leftActive = false;
        window.currentDialogueData.rightActive = false;
        window.currentDialogueData.boxBorderColor = "#475569";
    } else {
        window.currentDialogueData.speakerName = GameState.enemyConfig.name;
        window.currentDialogueData.nameColor = GameState.enemyConfig.color;
        window.currentDialogueData.rightActive = true;
        window.currentDialogueData.leftActive = false;
        window.currentDialogueData.boxBorderColor = GameState.enemyConfig.color;
    }
    
    let text = cur.text;
    if (cur.speaker === 'enemy' && GameState.enemyConfig.isShadow) text = "・・・・";
    window.currentDialogueData.dialogueText = text;
    
    if (window._reactUpdateDialogueUI) {
        window._reactUpdateDialogueUI(window.currentDialogueData);
    }
    
    GameState.currentDialogueIndex++;

    // 暗転していた場合はフェードインして復帰
    if (didFade) {
        window.currentDialogueData.isFading = false;
        if (window._reactUpdateDialogueUI) {
            window._reactUpdateDialogueUI(window.currentDialogueData);
        }
        setTimeout(() => {
            GameState.isProcessing = false; // クリック連打防止解除
        }, 500);
    }
}


export let continueTimer = null;
export let continueCount = 9;

export function showContinueScreen() {
    stopSound(SOUNDS.bgmTitle);
    switchScreen('screen-continue');
}

export function executeContinue() {
    playSound(SOUNDS.seContinue);
    setTimeout(() => {
        if (GameState.gameMode === 'event_satan') {
            setupEventSatanConfrontation();
        } else if (GameState.gameMode === 'event_android_high') {
            setupEventAndroidHighConfrontation();
        } else {
            GameState.appState = 'pre_dialogue';
            let introText = (GameState.enemyConfig.preBattleLine || "次は私がお相手よ。") + "\n" + getDialogue(GameState.enemyConfig, GameState.playerConfig, 'intro');
            if (GameState.enemyConfig.isShadow) introText = "・・・・";
            GameState.dialogueQueue = [
                { speaker: 'enemy', text: introText },
                { speaker: 'player', text: GameState.enemyConfig.isShadow ? (GameState.playerConfig.mirrorIntro || "なっ、自分自身だと……！？") : getDialogue(GameState.playerConfig, GameState.enemyConfig, 'intro') }
            ];
            if (GameState.enemyConfig.id === 'satan' && !GameState.enemyConfig.isShadow) {
                introText = "……よくぞここまで辿り着いたな。" + getDialogue(GameState.enemyConfig, GameState.playerConfig, 'intro');
                GameState.dialogueQueue[0].text = introText;
            }
            setupDialogueScreen();
        }
    }, 2000);
}

export function executeGameOver() {
    GameState.appState = 'title';
    stopAllBGM();
    switchScreen('screen-mode-select');
    playSound(SOUNDS.bgmTitle);
}

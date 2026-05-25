import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { incrementStat } from '../utils/constants/achievements.js';
import {
  getDialogue,
  playSound,
  stopSound,
  stopAllBGM,
  switchScreen,
  getCardImgUrl,
} from '../utils/gameUtils.js';
import { SOUNDS, AUDIO_INSTANCES } from '../utils/sounds.js';
import { setupEventConfrontation } from '../game/events.js';
import { GameState } from '../state/gameState.js';
import { saveStoryProgress } from '../game/story.js';
import { handleProgressionNextStep } from '../game/progression.js';

// ==========================================
// UI Dialogue Logic (Dialogue & Sequences)
// ==========================================

export function handleDialogueChoice(choiceIndex) {
  playSound(SOUNDS.seClick);
  const cur = GameState.dialogueQueue[GameState.currentDialogueIndex];
  if (!cur || !cur.choices) return;
  const choice = cur.choices[choiceIndex];

  // 現在の選択肢ノードを削除し、選択結果のノードを挿入する
  GameState.dialogueQueue.splice(
    GameState.currentDialogueIndex,
    1,
    ...(choice.next || [])
  );

  // ui側の選択肢状態をクリアし、挿入した新しい先頭の会話を表示する
  window.currentDialogueData = window.currentDialogueData || {};
  window.currentDialogueData.choices = null;
  showNextDialogue(true);
}

// Reactから呼び出せるようにグローバルにも登録
window.handleDialogueChoice = handleDialogueChoice;

export function startNextBattleSequence() {
  if (GameState.gameMode !== 'story') return;
  saveStoryProgress();
  if (GameState.battleCount > 9) {
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
    console.log(
      `Story Mode Battle: ${GameState.battleCount}, GameState.aiLevel set to: ${GameState.aiLevel}`
    );
  }
  GameState.appState = 'pre_dialogue';
  // ストーリーモードではdialogue.introのみ使用（preBattleLineは連結しない）
  let introText =
    getDialogue(
      GameState.enemyConfig,
      GameState.playerConfig,
      'intro',
      'enemy'
    ) ||
    GameState.enemyConfig.preBattleLine ||
    '・・・・';
  if (GameState.enemyConfig.isShadow) introText = '・・・・';
  GameState.dialogueQueue = [
    { speaker: 'enemy', text: introText },
    {
      speaker: 'player',
      text: GameState.enemyConfig.isShadow
        ? GameState.playerConfig.mirrorIntro || 'なっ、自分自身だと……！？'
        : getDialogue(
            GameState.playerConfig,
            GameState.enemyConfig,
            'intro',
            'player'
          ),
    },
  ];
  if (GameState.enemyConfig.id === 'satan' && !GameState.enemyConfig.isShadow) {
    GameState.dialogueQueue[0].text =
      getDialogue(
        GameState.enemyConfig,
        GameState.playerConfig,
        'intro',
        'enemy'
      ) || '……よくぞここまで辿り着いたな。';
  }
  setupDialogueScreen();
}

export function startEndingSequence() {
  GameState.appState = 'ending_dialogue';
  stopSound(AUDIO_INSTANCES.bgmTitle);
  stopSound(AUDIO_INSTANCES.bgmBattle);
  stopSound(AUDIO_INSTANCES.bgmLastBattle);
  stopSound(AUDIO_INSTANCES.bgmStageAndroid);
  playSound(AUDIO_INSTANCES.bgmEnding);
  GameState.dialogueQueue = GameState.playerConfig.storyEnding || [];
  GameState.currentDialogueIndex = 0;

  // 実績: ストーリークリア (完遂時にプレイヤーキャラクターのIDで記録)
  if (
    typeof incrementStat === 'function' &&
    GameState.playerConfig &&
    GameState.playerConfig.id
  ) {
    incrementStat('storyClears', GameState.playerConfig.id);
  }

  window.currentDialogueData = window.currentDialogueData || {};
  window.currentDialogueData.centerMode = true;
  window.currentDialogueData.leftImage = getSkinImage(
    GameState.playerConfig,
    GameState.playerSkins[GameState.playerConfig.id],
    'image'
  );
  window.currentDialogueData.rightDisplay = 'none';

  document.getElementById('portrait-left').src =
    window.currentDialogueData.leftImage;
  switchScreen('screen-dialogue');
  showNextDialogue(true);
}

export function setupDialogueScreen() {
  GameState.isProcessing = false;
  GameState.currentDialogueIndex = 0;

  let playerSkinId = GameState.playerSkins[GameState.playerConfig.id];
  let enemySkinId = GameState.enemySkins
    ? GameState.enemySkins[GameState.enemyConfig.id]
    : 'default';

  if (GameState.gameMode === 'tournament') {
    playerSkinId = 'school';
    enemySkinId = 'school';
  }

  let pLeftImg =
    getSkinImage(GameState.playerConfig, playerSkinId, 'image') ||
    getCardImgUrl(GameState.playerConfig);

  if (GameState.gameMode === 'campaign') {
    pLeftImg = null; // キャンペーンモードでは主人公画像を表示しない
  }

  let pRightImg =
    getSkinImage(GameState.enemyConfig, enemySkinId, 'image') ||
    GameState.enemyConfig.image ||
    getCardImgUrl(GameState.enemyConfig);

  const isCenter =
    GameState.appState === 'story_intro' ||
    GameState.appState === 'inter_battle_story' ||
    (GameState.gameMode === 'tournament' &&
      (GameState.appState === 'pre_dialogue' ||
        GameState.appState === 'venue_dialogue' ||
        GameState.appState === 'tournament_win_dialogue' ||
        GameState.appState === 'post_tournament_match'));

  if (GameState.appState === 'post_dialogue') {
    if (GameState.lastBattleResult === 'win') {
      pRightImg =
        getSkinImage(GameState.enemyConfig, enemySkinId, 'imageLose') ||
        GameState.enemyConfig.imageLose ||
        pRightImg;
    } else if (GameState.lastBattleResult === 'lose') {
      let loseSkinId = GameState.playerSkins[GameState.playerConfig.id];
      if (GameState.gameMode === 'tournament') loseSkinId = 'school';
      const loseImg = getSkinImage(
        GameState.playerConfig,
        loseSkinId,
        'imageLose'
      );
      pLeftImg = loseImg || pLeftImg;
    }
  }

  window.currentDialogueData = window.currentDialogueData || {};
  window.currentDialogueData.centerMode = isCenter;
  window.currentDialogueData.leftImage = pLeftImg;
  window.currentDialogueData.rightImage = pRightImg;
  window.currentDialogueData.rightFilter = GameState.enemyConfig.isShadow
    ? 'grayscale(1) brightness(0.6) contrast(1.2)'
    : 'none';
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

  if (cur.choices) {
    window.currentDialogueData.choices = cur.choices;
    window.currentDialogueData.speakerName = '';
    window.currentDialogueData.dialogueText = cur.text || '……';
    window.currentDialogueData.leftActive = false;
    window.currentDialogueData.rightActive = false;
    if (window._reactUpdateDialogueUI)
      window._reactUpdateDialogueUI(window.currentDialogueData);
    return;
  } else {
    window.currentDialogueData.choices = null;
  }

  let didFade = false;
  if (
    window.currentDialogueData.centerMode &&
    (cur.speaker === 'enemy' || cur.speaker !== 'player') &&
    GameState.appState !== 'ending_dialogue' &&
    GameState.gameMode !== 'tournament'
  ) {
    // centerMode のまま敵のターンが来たら、2人画面へ移行するべく暗転する
    if (cur.speaker === 'enemy') {
      GameState.isProcessing = true; // クリック連打を防止
      didFade = true;

      // React側に暗転を指示
      window.currentDialogueData.isFading = true;
      if (window._reactUpdateDialogueUI)
        window._reactUpdateDialogueUI(window.currentDialogueData);

      // 暗転（フェードアウト）が完了するまで待機
      await new Promise((r) => setTimeout(r, 450));

      // 暗転中にキャラ位置を二人画面（centerMode = false）に切り替える
      window.currentDialogueData.centerMode = false;
    }
  }

  if (cur.speaker === 'player') {
    window.currentDialogueData.speakerName = GameState.playerConfig.name;
    window.currentDialogueData.nameColor = GameState.playerConfig.color;
    window.currentDialogueData.leftActive = true;
    if (GameState.appState !== 'ending_dialogue')
      window.currentDialogueData.rightActive = false;
    window.currentDialogueData.boxBorderColor = GameState.playerConfig.color;

    if (window.currentDialogueData.centerMode) {
      let playerSkinId = GameState.playerSkins[GameState.playerConfig.id];
      if (GameState.gameMode === 'tournament') {
        playerSkinId = 'school';
      }
      window.currentDialogueData.leftImage =
        getSkinImage(GameState.playerConfig, playerSkinId, 'image') ||
        GameState.playerConfig.image ||
        getCardImgUrl(GameState.playerConfig);
    }
  } else if (cur.speaker === 'narrator') {
    window.currentDialogueData.speakerName = cur.speakerName || 'ナレーター';
    window.currentDialogueData.nameColor = '#94a3b8';
    window.currentDialogueData.leftActive = false;
    window.currentDialogueData.rightActive = false;
    window.currentDialogueData.boxBorderColor = '#475569';
  } else {
    const charConfig =
      cur.charData ||
      (cur.charId
        ? CHARACTERS[cur.charId] || GameState.enemyConfig
        : GameState.enemyConfig);
    window.currentDialogueData.speakerName = charConfig.name;
    window.currentDialogueData.nameColor = charConfig.color;
    window.currentDialogueData.boxBorderColor = charConfig.color;

    if (window.currentDialogueData.centerMode) {
      window.currentDialogueData.leftActive = true;
      window.currentDialogueData.rightActive = false;
    } else {
      window.currentDialogueData.rightActive = true;
      window.currentDialogueData.leftActive = false;
    }

    // 話者が変わる場合は画像も更新
    if (cur.charData || cur.charId || cur.speaker === 'enemy') {
      let enemySkinId = GameState.enemySkins
        ? GameState.enemySkins[charConfig.id]
        : 'default';
      if (GameState.gameMode === 'tournament') {
        enemySkinId = 'school';
      }
      const newImg =
        getSkinImage(charConfig, enemySkinId, 'image') ||
        charConfig.image ||
        getCardImgUrl(charConfig);

      if (window.currentDialogueData.centerMode) {
        window.currentDialogueData.leftImage = newImg;
      } else {
        window.currentDialogueData.rightImage = newImg;
      }
    }
  }

  let text = cur.text;
  if (cur.speaker === 'enemy' && GameState.enemyConfig.isShadow)
    text = '・・・・';
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
  stopSound(AUDIO_INSTANCES.bgmTitle);
  switchScreen('screen-continue');
}

export function executeContinue() {
  playSound(SOUNDS.seContinue);
  setTimeout(() => {
    if (GameState.gameMode.startsWith('event_')) {
      setupEventConfrontation();
    } else {
      GameState.appState = 'pre_dialogue';
      let introText =
        (GameState.enemyConfig.preBattleLine || '次は私がお相手よ。') +
        '\n' +
        getDialogue(
          GameState.enemyConfig,
          GameState.playerConfig,
          'intro',
          'enemy'
        );
      if (GameState.enemyConfig.isShadow) introText = '・・・・';
      GameState.dialogueQueue = [
        { speaker: 'enemy', text: introText },
        {
          speaker: 'player',
          text: GameState.enemyConfig.isShadow
            ? GameState.playerConfig.mirrorIntro || 'なっ、自分自身だと……！？'
            : getDialogue(
                GameState.playerConfig,
                GameState.enemyConfig,
                'intro',
                'player'
              ),
        },
      ];
      if (
        GameState.enemyConfig.id === 'satan' &&
        !GameState.enemyConfig.isShadow
      ) {
        introText =
          '……よくぞここまで辿り着いたな。' +
          getDialogue(
            GameState.enemyConfig,
            GameState.playerConfig,
            'intro',
            'enemy'
          );
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
  playSound(AUDIO_INSTANCES.bgmTitle);
}

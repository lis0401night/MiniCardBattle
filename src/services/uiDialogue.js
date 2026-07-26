import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { incrementStat } from '../utils/constants/achievements.js';
import {
  getDialogue,
  playSound,
  stopSound,
  stopAllBGM,
  switchScreen,
  getCardImgUrl,
  currentBgmAudio,
} from '../utils/gameUtils.js';
import { SOUNDS, AUDIO_INSTANCES } from '../utils/sounds.js';
import { setupEventConfrontation } from '../game/events.js';
import { GameState } from '../state/gameState.js';
import { saveStoryProgress } from '../game/story.js';
import { handleProgressionNextStep } from '../game/progression.js';
import { performFadeTransition } from './uiMainCore.js';
import {
  STORY_DIALOGUES,
  STORY_NARRATIONS,
  STORY_ENDINGS,
  STORY_TOTAL_BATTLES,
  STORY_BGM_CHANGE_BATTLE,
  STORY_LATE_DIALOGUE_BATTLE,
  STORY_SATAN_CASTLE_BATTLE,
  STILL_EFFECT_SATAN_CASTLE,
  getFallbackStoryDialogue,
} from '../utils/constants/storyDialogues.js';

// ==========================================
// UI Dialogue Logic (Dialogue & Sequences)
// ==========================================

// スチルスクロール演出の待機時間（ミリ秒）
const STILL_SCROLL_DURATION = 8000;

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

/**
 * ストーリーモードの敵リーダー情報を構築して GameState.enemyConfig に適用する
 * @param {string} enemyId - 敵ID ('shadow' または キャラクターID)
 */
export function applyStoryEnemyConfig(enemyId) {
  if (enemyId === 'shadow') {
    GameState.enemyConfig = { ...GameState.playerConfig };
    GameState.enemyConfig.isShadow = true;
    GameState.enemyConfig.name = `影の${GameState.playerConfig.name}`;
  } else {
    const charId = enemyId || 'android';
    GameState.enemyConfig = { ...CHARACTERS[charId] };
    GameState.enemyConfig.isShadow = false;
  }
}

export function startNextBattleSequence() {
  if (GameState.gameMode !== 'story') return;
  GameState.isSimplifiedDialogue = false;
  saveStoryProgress();
  if (GameState.battleCount > STORY_TOTAL_BATTLES) {
    startEndingSequence();
    return;
  }
  const nextEnemyId = GameState.storyQueue[GameState.battleCount - 1];
  applyStoryEnemyConfig(nextEnemyId);

  if (GameState.gameMode === 'story') {
    GameState.aiLevel = GameState.storyDifficulty;
    console.log(
      `Story Mode Battle: ${GameState.battleCount}, GameState.aiLevel set to: ${GameState.aiLevel}`
    );
  }
  GameState.appState = 'pre_dialogue';

  const playerId = GameState.playerConfig.id;
  const isShadow = GameState.enemyConfig.isShadow;
  const enemyId = isShadow ? 'shadow' : GameState.enemyConfig.id;
  const battleCount = GameState.battleCount;

  // 開始ナレーションの取得（配列または文字列に対応）
  const preNarrationRaw = STORY_NARRATIONS[battleCount]?.pre || [
    '魔界の深部へと足を進める一行。行く手に新たなる影が立ち塞がった。',
  ];
  const preNarrations = Array.isArray(preNarrationRaw)
    ? preNarrationRaw
    : [preNarrationRaw];

  // 戦闘前会話（両者2回ずつの掛け合い、計4行）の取得
  let dialogLines = [];
  const isLate = battleCount >= STORY_LATE_DIALOGUE_BATTLE;
  if (STORY_DIALOGUES[playerId] && STORY_DIALOGUES[playerId][enemyId]) {
    const dialogueSource = isLate
      ? STORY_DIALOGUES[playerId][enemyId].late
      : STORY_DIALOGUES[playerId][enemyId].early;
    // ディープコピーして元の定義への副作用を防ぐ
    if (dialogueSource && Array.isArray(dialogueSource.pre)) {
      dialogLines = dialogueSource.pre.map((line) => ({ ...line }));
    } else {
      dialogLines = getFallbackStoryDialogue(
        playerId,
        isShadow ? playerId : enemyId,
        true,
        isLate
      );
    }
  } else {
    dialogLines = getFallbackStoryDialogue(
      playerId,
      isShadow ? playerId : enemyId,
      true,
      isLate
    );
  }

  // 影（自分自身）の場合は、敵（影）の台詞を「・・・・」に差し替え
  if (isShadow) {
    dialogLines = dialogLines.map((line) => {
      if (line.speaker === 'enemy') {
        return { speaker: 'enemy', text: '・・・・' };
      }
      return line;
    });
  }

  // dialogueQueue に一挙に連結セット
  GameState.dialogueQueue = [
    ...preNarrations.map((text) => ({ speaker: 'narrator', text })),
    ...dialogLines,
  ];

  setupDialogueScreen();
}

export function startEndingSequence() {
  GameState.appState = 'ending_dialogue';
  stopSound(AUDIO_INSTANCES.bgmTitle);
  stopSound(AUDIO_INSTANCES.bgmBattle);
  stopSound(AUDIO_INSTANCES.bgmLastBattle);
  stopSound(AUDIO_INSTANCES.bgmStageAndroid);
  playSound(AUDIO_INSTANCES.bgmEnding);
  GameState.dialogueQueue = STORY_ENDINGS[GameState.playerConfig.id] || [];
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

  switchScreen('screen-dialogue');
  showNextDialogue(true);
}

/**
 * [next] マーカーが含まれるダイアログテキストを、同一話者の複数ダイアログへ展開する
 * @param {Array} queue - ダイアログキュー
 * @returns {Array} 展開後のダイアログキュー
 */
function expandDialogueQueue(queue) {
  if (!Array.isArray(queue)) return queue;
  const newQueue = [];
  queue.forEach((item) => {
    if (item.text && item.text.includes('[next]')) {
      const parts = item.text.split('[next]');
      parts.forEach((partText) => {
        // [next] で分割した結果の前後の余分な改行コード等を取り除く
        const trimmedText = partText.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, '');
        if (trimmedText) {
          newQueue.push({
            ...item,
            text: trimmedText,
          });
        }
      });
    } else {
      newQueue.push(item);
    }
  });
  return newQueue;
}

export function setupDialogueScreen() {
  GameState.isProcessing = false;
  GameState.currentDialogueIndex = 0;

  if (GameState.dialogueQueue) {
    GameState.dialogueQueue = expandDialogueQueue(GameState.dialogueQueue);
  }

  // ストーリーモード専用BGMの再生と切り替え
  if (
    GameState.gameMode === 'story' &&
    GameState.appState !== 'ending_dialogue'
  ) {
    const targetBgm =
      GameState.battleCount >= STORY_BGM_CHANGE_BATTLE
        ? AUDIO_INSTANCES.bgmStory02
        : AUDIO_INSTANCES.bgmStory01;

    if (currentBgmAudio !== targetBgm) {
      stopAllBGM();
      if (targetBgm) {
        playSound(targetBgm);
      }
    }
  }

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

  let pRightImg =
    getSkinImage(GameState.enemyConfig, enemySkinId, 'image') ||
    GameState.enemyConfig.image ||
    getCardImgUrl(GameState.enemyConfig);

  const firstNode = GameState.dialogueQueue?.[0];
  const isCenter =
    GameState.appState === 'story_intro' ||
    GameState.appState === 'inter_battle_story' ||
    !!firstNode?.centerMode ||
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

  // 試練の宮殿の導入会話専用の初期制御
  if (GameState.appState === 'dungeon_intro_dialogue') {
    pRightImg = null;
    if (firstNode?.leftImage) {
      pLeftImg = firstNode.leftImage;
    } else {
      pLeftImg = null;
    }
  } else if (firstNode?.leftImage) {
    pLeftImg = firstNode.leftImage;
  }

  window.currentDialogueData = window.currentDialogueData || {};
  window.currentDialogueData.centerMode = isCenter;
  window.currentDialogueData.leftImage = pLeftImg;
  window.currentDialogueData.rightImage = pRightImg;
  window.currentDialogueData.rightFilter = GameState.enemyConfig?.isShadow
    ? 'grayscale(1) brightness(0.6) contrast(1.2)'
    : 'none';
  window.currentDialogueData.rightDisplay =
    GameState.appState === 'dungeon_intro_dialogue' || !pRightImg
      ? 'none'
      : 'block';

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
  if (cur.centerMode !== undefined) {
    window.currentDialogueData.centerMode = cur.centerMode;
  }

  if (cur.leftImage) {
    window.currentDialogueData.leftImage = cur.leftImage;
  }

  if (cur.rightImage) {
    window.currentDialogueData.rightImage = cur.rightImage;
    window.currentDialogueData.rightDisplay = 'block';
  } else if (GameState.appState === 'dungeon_intro_dialogue') {
    window.currentDialogueData.rightImage = null;
    window.currentDialogueData.rightDisplay = 'none';
  }
  window.currentDialogueData.blackScreen = !!cur.blackScreen;
  window.currentDialogueData.stillEffect = cur.stillEffect || null;
  window.currentDialogueData.stillStep =
    cur.stillStep !== undefined ? cur.stillStep : null;

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

  // 魔王城自動スクロール演出
  if (cur.isStillScroll) {
    GameState.isProcessing = true; // 連打防止

    // ダイアログボックスを非表示にしてスクロールを開始させる
    window.currentDialogueData = window.currentDialogueData || {};
    window.currentDialogueData.hideBox = true;
    window.currentDialogueData.stillStep = 1; // スクロール完了位置へ移動
    window.currentDialogueData.dialogueText = '';
    window.currentDialogueData.speakerName = '';

    if (window._reactUpdateDialogueUI) {
      window._reactUpdateDialogueUI(window.currentDialogueData);
    }

    // スクロールアニメーションの時間（8000ms）待機
    await new Promise((r) => setTimeout(r, STILL_SCROLL_DURATION));

    // 待機後、ダイアログボックスを再表示可能な状態にする
    window.currentDialogueData.hideBox = false;

    GameState.isProcessing = false;
    GameState.currentDialogueIndex++; // 演出ノードを消化

    // 自動で次のセリフを表示
    showNextDialogue(true);
    return;
  }

  // ストーリー戦闘後のフェードアウト＆中央配置切り替え演出
  if (cur.isTransition) {
    GameState.isProcessing = true; // 連打防止

    // フェードアウト開始：暗転させ、台詞やスピーカー名、アクティブ状態を消去する
    window.currentDialogueData.isFading = true;
    window.currentDialogueData.dialogueText = '';
    window.currentDialogueData.speakerName = '';
    window.currentDialogueData.leftActive = false;
    window.currentDialogueData.rightActive = false;
    if (window._reactUpdateDialogueUI) {
      window._reactUpdateDialogueUI(window.currentDialogueData);
    }

    // フェードアウト完了まで待つ
    await new Promise((r) => setTimeout(r, 450));

    // 暗転中に中央表示（centerMode = true）に切り替え、相手キャラ画像を非表示にする
    window.currentDialogueData.centerMode = true;
    window.currentDialogueData.rightDisplay = 'none';

    // 左画像（プレイヤー）が正しく中央に表示されるようにセット
    let playerSkinId = GameState.playerSkins[GameState.playerConfig.id];
    if (GameState.gameMode === 'tournament') {
      playerSkinId = 'school';
    }
    window.currentDialogueData.leftImage =
      getSkinImage(GameState.playerConfig, playerSkinId, 'image') ||
      GameState.playerConfig.image ||
      getCardImgUrl(GameState.playerConfig);

    if (window._reactUpdateDialogueUI) {
      window._reactUpdateDialogueUI(window.currentDialogueData);
    }

    // フェードイン復帰
    window.currentDialogueData.isFading = false;
    if (window._reactUpdateDialogueUI) {
      window._reactUpdateDialogueUI(window.currentDialogueData);
    }

    // フェードイン完了まで待つ
    await new Promise((r) => setTimeout(r, 450));

    GameState.isProcessing = false;
    GameState.currentDialogueIndex++; // トランジションノードを消化

    // 自動で次の本来の台詞（同行者への語り掛けの最初のセリフ）を表示する
    showNextDialogue(true);
    return;
  }

  let didFade = false;
  if (
    window.currentDialogueData.centerMode &&
    cur.speaker !== 'player' &&
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
    window.currentDialogueData.speakerName =
      cur.speakerName || GameState.playerConfig.name;
    window.currentDialogueData.nameColor = GameState.playerConfig.color;
    window.currentDialogueData.leftActive = true;
    if (GameState.appState !== 'ending_dialogue')
      window.currentDialogueData.rightActive = false;
    window.currentDialogueData.boxBorderColor = GameState.playerConfig.color;

    if (window.currentDialogueData.centerMode && !cur.leftImage) {
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
    let charConfig =
      cur.charData ||
      (cur.charId
        ? CHARACTERS[cur.charId] || GameState.enemyConfig
        : GameState.enemyConfig);

    // shadow の不完全な charData ({ id: 'shadow' }) が渡された場合、
    // 実データを持つ GameState.enemyConfig からコピーをマージして名前や画像パスなどを復元する
    if (charConfig.id === 'shadow' && !charConfig.name && !charConfig.image) {
      charConfig = {
        ...GameState.enemyConfig,
        ...charConfig,
      };
    }

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
      const imgType =
        GameState.appState === 'post_dialogue' &&
        GameState.lastBattleResult === 'win'
          ? 'imageLose'
          : 'image';
      const newImg =
        getSkinImage(charConfig, enemySkinId, imgType) ||
        charConfig[imgType] ||
        charConfig.image ||
        getCardImgUrl(charConfig);

      if (window.currentDialogueData.centerMode) {
        window.currentDialogueData.leftImage = newImg;
      } else {
        window.currentDialogueData.rightImage = newImg;
      }
    }
  }

  window.currentDialogueData.dialogueText = cur.text || cur.dialogueText || '';

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
        getDialogue(
          GameState.enemyConfig,
          GameState.playerConfig,
          'intro',
          'enemy'
        ) || '・・・・';
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

/**
 * 魔王城スチル演出の動作確認用テストを開始する
 */
export function startSatanCastleStillTest(charId) {
  playSound(SOUNDS.seClick);

  // テスト用の一時的なゲーム状態をセット
  if (charId && CHARACTERS[charId]) {
    GameState.playerConfig = CHARACTERS[charId];
  }

  GameState.gameMode = 'still_test';
  GameState.appState = 'story_intro';
  GameState.dialogueQueue = [
    {
      speaker: 'narrator',
      text: 'そしてついに——禍々しい瘴気に包まれた「魔王城」の門前に到着した。',
      stillEffect: STILL_EFFECT_SATAN_CASTLE,
      stillStep: 0,
    },
    {
      isStillScroll: true,
      stillEffect: STILL_EFFECT_SATAN_CASTLE,
    },
    {
      speaker: 'narrator',
      text: '見上げるほどの巨城が、天を衝くようにそびえ立っている。',
      stillEffect: STILL_EFFECT_SATAN_CASTLE,
      stillStep: 1,
    },
    {
      speaker: 'narrator',
      text: '門の奥からは、かつてない強大な魔力の波動が、波のように押し寄せてくる。',
      stillEffect: STILL_EFFECT_SATAN_CASTLE,
      stillStep: 1,
    },
    {
      speaker: 'narrator',
      text: '世界の運命を決める突入が、今果たされる。',
      stillEffect: STILL_EFFECT_SATAN_CASTLE,
      stillStep: 1,
    },
  ];

  GameState.currentDialogueIndex = 0;

  window.currentDialogueData = window.currentDialogueData || {};
  window.currentDialogueData.centerMode = true;
  window.currentDialogueData.leftImage = null;
  window.currentDialogueData.rightImage = null;
  window.currentDialogueData.rightDisplay = 'none';
  window.currentDialogueData.leftActive = false;
  window.currentDialogueData.rightActive = false;

  switchScreen('screen-dialogue');
  showNextDialogue(true);
}

/**
 * ストーリーモードの会話をスキップし、次のバトル前会話（簡易会話形式）に進む
 */
export function skipStoryDialogue() {
  if (GameState.gameMode !== 'story') return;

  // クリックSEを再生
  playSound(SOUNDS.seClick);

  // ダイアログ処理中フラグをリセット
  GameState.isProcessing = false;

  let targetBattleCount = GameState.battleCount;

  if (GameState.appState === 'story_intro') {
    // ストーリーイントロからのスキップは、1戦目の簡易戦闘前会話へ
    targetBattleCount = 1;
  } else if (GameState.appState === 'pre_dialogue') {
    // 通常の戦闘前会話からのスキップは、現在の戦闘の簡易戦闘前会話へ
    targetBattleCount = GameState.battleCount;
  } else if (
    GameState.appState === 'post_dialogue' &&
    GameState.lastBattleResult === 'win'
  ) {
    // 6戦目の勝利後会話で、スチル演出が含まれている場合
    if (GameState.battleCount === STORY_SATAN_CASTLE_BATTLE) {
      const stillIndex = GameState.dialogueQueue.findIndex(
        (node) => node.stillEffect === STILL_EFFECT_SATAN_CASTLE
      );
      if (stillIndex !== -1 && stillIndex >= GameState.currentDialogueIndex) {
        // スチル演出のノードまでスキップする
        GameState.currentDialogueIndex = stillIndex;
        // 表示を更新
        showNextDialogue(true);
        return;
      }
    }
    // 勝利後会話からのスキップは、次の戦闘の簡易戦闘前会話へ
    targetBattleCount = GameState.battleCount + 1;
  } else {
    return;
  }

  // 10戦（サタン撃破）を超えていたらエンディングへ
  if (targetBattleCount > STORY_TOTAL_BATTLES) {
    startEndingSequence();
    return;
  }

  // battleCount を更新
  GameState.battleCount = targetBattleCount;

  // 対戦相手の設定
  const nextEnemyId = GameState.storyQueue[targetBattleCount - 1];
  applyStoryEnemyConfig(nextEnemyId);

  GameState.aiLevel = GameState.storyDifficulty;
  GameState.appState = 'pre_dialogue';
  GameState.isSimplifiedDialogue = true;

  // セーブデータの保存
  saveStoryProgress();

  // 簡易戦闘前会話（フリーバトル形式）の構築
  let introText =
    getDialogue(
      GameState.enemyConfig,
      GameState.playerConfig,
      'intro',
      'enemy'
    ) || '・・・・';
  if (GameState.enemyConfig.isShadow) introText = '・・・・';

  const playerIntroText = GameState.enemyConfig.isShadow
    ? GameState.playerConfig.mirrorIntro || 'なっ、自分自身だと……！？'
    : getDialogue(
        GameState.playerConfig,
        GameState.enemyConfig,
        'intro',
        'player'
      );

  if (GameState.enemyConfig.id === 'satan' && !GameState.enemyConfig.isShadow) {
    introText =
      '……よくぞここまで辿り着いたな。' +
      getDialogue(
        GameState.enemyConfig,
        GameState.playerConfig,
        'intro',
        'enemy'
      );
  }

  // dialogueQueueに簡易会話をセット
  GameState.dialogueQueue = [
    { speaker: 'enemy', text: introText },
    { speaker: 'player', text: playerIntroText },
  ];

  // 画面のフェード遷移と会話画面のセットアップ
  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

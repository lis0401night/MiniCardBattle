import { CHARACTERS } from '../utils/constants/characters.js';
import { STORY_INTROS } from '../utils/constants/storyDialogues.js';
import { switchScreen } from '../utils/gameUtils.js';
import { loadDeck } from '../services/deck.js';
import { GameState } from '../state/gameState.js';
import {
  startNextBattleSequence,
  setupDialogueScreen,
  showContinueScreen,
} from '../services/uiDialogue.js';
import { performFadeTransition } from '../services/uiMainCore.js';

// ==========================================
// ストーリーモード進行管理 (story.js)
// ==========================================

export function initStoryMode(charId) {
  GameState.playerConfig = CHARACTERS[charId];
  GameState.enemySkins = {};

  // 他のキャラクターのIDをランダムに並び替え（プレイヤー、マキナ、中ボス・大ボスは除く）
  const otherIds = Object.keys(CHARACTERS).filter(
    (id) =>
      id !== charId &&
      id !== 'automata' &&
      id !== 'satan' &&
      id !== 'void' &&
      id !== 'succubus' &&
      id !== 'warlock'
  );
  for (let i = otherIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [otherIds[i], otherIds[j]] = [otherIds[j], otherIds[i]];
  }

  // ストーリー構成: 1-3戦目(ランダム), 4戦目(自分/影), 5-6戦目(残りランダム), 7戦目(ゼノン), 8戦目(ヴィオラ), 9戦目(バルタザール), 10戦目(サタン)
  GameState.storyQueue = [
    otherIds[0],
    otherIds[1],
    otherIds[2],
    'shadow',
    otherIds[3],
    otherIds[4],
    'void',
    'succubus',
    'warlock',
    'satan',
  ];

  GameState.battleCount = 1;
  GameState.appState = 'story_intro';

  const storyIntroData = STORY_INTROS[charId];
  if (Array.isArray(storyIntroData) && storyIntroData.length > 0) {
    GameState.dialogueQueue = [];
    storyIntroData.forEach((item) => {
      if (typeof item === 'string') {
        GameState.dialogueQueue.push({ speaker: 'player', text: item });
      } else {
        GameState.dialogueQueue.push(item);
      }
    });
  } else {
    GameState.dialogueQueue = [
      { speaker: 'narrator', text: '旅立ちの時が来た。', blackScreen: true },
    ];
    if (GameState.playerConfig.storyIntro) {
      GameState.playerConfig.storyIntro.forEach((item) => {
        if (typeof item === 'string') {
          GameState.dialogueQueue.push({ speaker: 'player', text: item });
        } else {
          GameState.dialogueQueue.push(item);
        }
      });
    }
  }

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * ストーリーモードの進行管理
 */
export function handleStoryProgression() {
  if (GameState.appState === 'pre_dialogue') {
    GameState.appState = 'select_deck';
    if (typeof window.loadDeck === 'function') {
      window.loadDeck();
    } else {
      loadDeck();
    }
    if (window.forceUpdateDeckList) window.forceUpdateDeckList();
    switchScreen('screen-deck-list');
  } else if (GameState.appState === 'post_dialogue') {
    if (GameState.lastBattleResult === 'lose') {
      showContinueScreen();
    } else {
      // ストーリー豪華ダイアログシステム：
      // 戦闘後会話、同行者への語り掛け、次のナレーションはすでに post_dialogue の queue 内ですべて
      // 再生完了しているため、即座にカウントアップして次の戦闘へ進みます。
      GameState.battleCount++;
      performFadeTransition(() => {
        startNextBattleSequence();
      });
    }
  } else if (GameState.appState === 'story_intro') {
    performFadeTransition(() => {
      startNextBattleSequence();
    });
  } else if (GameState.appState === 'inter_battle_story') {
    GameState.battleCount++;
    performFadeTransition(() => {
      startNextBattleSequence();
    });
  } else if (GameState.appState === 'ending_dialogue') {
    clearStoryProgress();
    GameState.appState = 'ending_illust';
    switchScreen('screen-ending-illust');
  }
}

/**
 * 現在のストーリー状況をセーブする
 */
export function saveStoryProgress() {
  if (GameState.gameMode !== 'story') return;
  const saveObj = {
    pendingCharId: GameState.playerConfig.id,
    storyQueue: GameState.storyQueue,
    battleCount: GameState.battleCount,
    storyDifficulty: GameState.storyDifficulty,
    currentDeckIndex: GameState.currentDeckIndex,
  };
  try {
    localStorage.setItem(
      'mini_card_battle_story_save',
      JSON.stringify(saveObj)
    );
  } catch (error) {
    console.error('ストーリー進行状況の保存に失敗しました:', error);
  }
}

/**
 * ストーリーのセーブデータを破棄する
 */
export function clearStoryProgress() {
  localStorage.removeItem('mini_card_battle_story_save');
  localStorage.removeItem('mini_card_battle_story_deck_obj');
}

/**
 * 保存されたストーリーデータを復元して再開する
 */
export function resumeStoryProgress(savedData) {
  GameState.gameMode = 'story';
  GameState.pendingCharId = savedData.pendingCharId;
  GameState.storyQueue = savedData.storyQueue;
  GameState.battleCount = savedData.battleCount;
  GameState.storyDifficulty = savedData.storyDifficulty;
  GameState.aiLevel = savedData.storyDifficulty;
  GameState.currentDeckIndex = savedData.currentDeckIndex;

  GameState.playerConfig = CHARACTERS[savedData.pendingCharId];

  // 保存されているデッキインデックスの最新デッキをロードする
  if (typeof window.loadDeck === 'function') {
    window.loadDeck();
  } else {
    loadDeck();
  }

  // フェードを経由して次のバトルへジャンプ
  performFadeTransition(() => {
    startNextBattleSequence();
  });
}

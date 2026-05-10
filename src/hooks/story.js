import { CHARACTERS } from '../utils/constants/characters.js';
import { switchScreen } from '../utils/gameUtils.js';
import { startBattleFlow, loadDeck } from './deck.js';
import { GameState } from './gameState.js';
import {
  startNextBattleSequence,
  setupDialogueScreen,
  showContinueScreen,
} from './uiDialogue.js';
import { performFadeTransition } from './uiMainCore.js';

// ==========================================
// ストーリーモード進行管理 (story.js)
// ==========================================

export function initStoryMode(charId) {
  GameState.playerConfig = CHARACTERS[charId];

  // 他のキャラクターのIDをランダムに並び替え（プレイヤーとサタンは除く）
  const otherIds = Object.keys(CHARACTERS).filter(
    (id) => id !== charId && id !== 'satan' && id !== 'campaign_player'
  );
  for (let i = otherIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [otherIds[i], otherIds[j]] = [otherIds[j], otherIds[i]];
  }

  // ストーリー構成: 1-3戦目(ランダム), 4戦目(自分/影), 5-6戦目(残りランダム), 7戦目(サタン)
  GameState.storyQueue = [
    otherIds[0],
    otherIds[1],
    otherIds[2],
    'shadow',
    otherIds[3],
    otherIds[4],
    'satan',
  ];

  GameState.battleCount = 1;
  GameState.appState = 'story_intro';

  GameState.dialogueQueue = [
    { speaker: 'narrator', text: GameState.playerConfig.narratorIntro },
  ];
  GameState.playerConfig.storyIntro.forEach((item) => {
    if (typeof item === 'string') {
      GameState.dialogueQueue.push({ speaker: 'player', text: item });
    } else {
      GameState.dialogueQueue.push(item);
    }
  });

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * ストーリーモードの進行管理
 */
export function handleStoryProgression() {
  if (GameState.appState === 'pre_dialogue') {
    startBattleFlow();
  } else if (GameState.appState === 'post_dialogue') {
    if (GameState.lastBattleResult === 'lose') {
      showContinueScreen();
    } else {
      // 戦闘に勝利した場合、中間のストーリーがあるか判定
      const isSatanBattle =
        GameState.enemyConfig.id === 'satan' && !GameState.enemyConfig.isShadow;
      if (GameState.playerConfig.interBattleStory && !isSatanBattle) {
        GameState.appState = 'inter_battle_story';
        GameState.dialogueQueue = [];

        let storyLines = null;
        const stories = GameState.playerConfig.interBattleStory;

        if (stories[GameState.battleCount]) {
          storyLines = stories[GameState.battleCount];
        } else if (stories.default && stories.default.length > 0) {
          const randomIndex = Math.floor(
            Math.random() * stories.default.length
          );
          storyLines = stories.default[randomIndex];
        }

        if (storyLines) {
          storyLines.forEach((item) => {
            if (typeof item === 'string') {
              GameState.dialogueQueue.push({ speaker: 'player', text: item });
            } else {
              GameState.dialogueQueue.push(item);
            }
          });
          performFadeTransition(() => {
            setupDialogueScreen();
          });
        } else {
          // ストーリーが無ければ即座にカウントアップして次へ
          GameState.battleCount++;
          performFadeTransition(() => {
            startNextBattleSequence();
          });
        }
      } else {
        // 通常勝利またはサタン戦後のストーリー用
        GameState.battleCount++;
        performFadeTransition(() => {
          startNextBattleSequence();
        });
      }
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
  localStorage.setItem('mini_card_battle_story_save', JSON.stringify(saveObj));
}

/**
 * ストーリーのセーブデータを破棄する
 */
export function clearStoryProgress() {
  localStorage.removeItem('mini_card_battle_story_save');
}

/**
 * 保存されたストーリーデータを復元して再開する
 */
export function resumeStoryProgress(savedData) {
  GameState.pendingCharId = savedData.pendingCharId;
  GameState.storyQueue = savedData.storyQueue;
  GameState.battleCount = savedData.battleCount;
  GameState.storyDifficulty = savedData.storyDifficulty;
  GameState.aiLevel = savedData.storyDifficulty;
  GameState.currentDeckIndex = savedData.currentDeckIndex;

  GameState.playerConfig = CHARACTERS[savedData.pendingCharId];

  // デッキを再読み込み
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

import { GameState } from './gameState.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import {
  playSound,
  stopAllBGM,
  switchScreen,
} from '../utils/gameUtils.js';
import { AUDIO_INSTANCES } from '../utils/sounds.js';
import { setupDialogueScreen } from './uiDialogue.js';

import { INITIAL_PLAYER_DECK } from '../utils/constants/initial_decks.js';
import { INITIAL_PLAYER_CARD } from '../utils/constants/initial_cards.js';
import { CHAPTER_01_NODES } from '../utils/constants/campaign/chapter01/nodes.js';

export function getCampaignSaveData() {
  const savedStr = localStorage.getItem('mini_card_battle_campaign_save');
  if (savedStr) {
    try {
      return JSON.parse(savedStr);
    } catch (e) {
      console.error('Campaign save data parse error', e);
    }
  }
  return null;
}

export function saveCampaignProgress() {
  const data = {
    currentNode: GameState.campaignNode || '1-1_pre',
    deck: GameState.campaignDeck || [...INITIAL_PLAYER_DECK].slice(0, 20),
    cards: GameState.campaignCards || [...INITIAL_PLAYER_CARD],
  };
  localStorage.setItem('mini_card_battle_campaign_save', JSON.stringify(data));
}

export function initCampaignMode() {
  GameState.gameMode = 'campaign';
  GameState.playerConfig = CHARACTERS['campaign_player'];

  let saveData = getCampaignSaveData();
  if (!saveData) {
    // Initial setup for Chapter 1
    saveData = {
      currentNode: '1-1_pre',
      deck: [...INITIAL_PLAYER_DECK].slice(0, 20),
      cards: [...INITIAL_PLAYER_CARD],
    };
    localStorage.setItem(
      'mini_card_battle_campaign_save',
      JSON.stringify(saveData)
    );
  }

  GameState.campaignNode = saveData.currentNode;
  GameState.campaignDeck = saveData.deck;
  GameState.campaignCards = saveData.cards;

  // We go to deck edit or directly to the next node?
  // User requested: "デッキ編集は基本的にバトルの戦闘前会話の直前" (Deck editing happens right before pre-battle dialogue).
  // So if the node is a battle, we go to deck selection/edit. If it's pure dialogue, we go to dialogue.

  // For now, let's just trigger the node logic.
  startCampaignNode(GameState.campaignNode);
}

export function resumeCampaignProgress(saveData) {
  GameState.gameMode = 'campaign';
  GameState.playerConfig = CHARACTERS['campaign_player'];
  GameState.campaignNode = saveData.currentNode || '1-1_pre';
  GameState.campaignDeck = saveData.deck || [];
  GameState.campaignCards = saveData.cards || [];

  startCampaignNode(GameState.campaignNode);
}

export function startCampaignNode(nodeId) {
  if (!GameState.campaignCards) {
    GameState.campaignCards = [...window.INITIAL_PLAYER_CARDS];
  }

  const node = CHAPTER_01_NODES[nodeId];
  if (node) {
    if (node.appState) GameState.appState = node.appState;
    if (node.gameMode) GameState.gameMode = node.gameMode;
    if (node.aiLevel) GameState.aiLevel = node.aiLevel;
    if (node.enemyConfig)
      GameState.enemyConfig =
        typeof node.enemyConfig === 'function'
          ? node.enemyConfig()
          : node.enemyConfig;
    if (node.dialogueQueue) GameState.dialogueQueue = node.dialogueQueue;

    if (
      node.appState === 'pre_dialogue' ||
      node.appState === 'ending_dialogue'
    ) {
      setupDialogueScreen();
    } else {
      // Play pre-battle dialogue first
      GameState.appState = 'pre_dialogue';
      setupDialogueScreen();
    }
  } else {
    console.warn('Unknown campaign node', nodeId);
  }
}

export function goToCampaignDeckEdit() {
  GameState.appState = 'deck_edit';
  GameState.gameMode = 'campaign';

  import('./deck.js').then(({ loadDeck, renderDeckEdit }) => {
    loadDeck();
    renderDeckEdit();
    switchScreen('screen-deck-edit');
  });
}

export function onCampaignBattleEnd(isWin) {
  if (isWin) {
    // Rewards and next node
    if (GameState.campaignNode === '1-1') {
      GameState.campaignCards.push('skeleton', 'skeleton');
    } else if (GameState.campaignNode === '1-2') {
      GameState.campaignCards.push('shade');
    } else if (GameState.campaignNode === '1-3') {
      GameState.campaignCards.push('warden');
    }

    GameState.campaignNode = CHAPTER_01_NODES[GameState.campaignNode]?.next;
    saveCampaignProgress();
    startCampaignNode(GameState.campaignNode);
  } else {
    // Lose -> GameOver
    GameState.appState = 'title';
    stopAllBGM();
    switchScreen('screen-mode-select');
    playSound(AUDIO_INSTANCES.bgmTitle);
  }
}

export function onCampaignDialogueEnd() {
  if (GameState.appState === 'post_dialogue') {
    onCampaignBattleEnd(GameState.lastBattleResult === 'win');
    return;
  }

  const currentNodeData = CHAPTER_01_NODES[GameState.campaignNode];
  if (
    currentNodeData?.appState === 'pre_dialogue' ||
    currentNodeData?.appState === 'ending_dialogue'
  ) {
    if (currentNodeData.next) {
      GameState.campaignNode = currentNodeData.next;
      saveCampaignProgress();
      startCampaignNode(GameState.campaignNode);
    } else {
      // Finish Chapter 1
      GameState.appState = 'title';
      stopAllBGM();
      switchScreen('screen-mode-select');
      playSound(AUDIO_INSTANCES.bgmTitle);
    }
  } else {
    // Dialogue before battle ended, go to deck edit
    goToCampaignDeckEdit();
  }
}

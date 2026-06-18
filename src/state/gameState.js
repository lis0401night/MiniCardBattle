import { CHARACTERS } from '../utils/constants/characters.js';

const safeParseArray = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`Failed to parse localStorage key "${key}":`, e);
    return [];
  }
};

export const GameState = {
  playerConfig: CHARACTERS.android,
  enemyConfig: CHARACTERS.dragon,
  isInitializing: false,
  playerSkins: {},
  unlockedSkins: safeParseArray('mini_card_battle_unlocked_skins'),
  decks: [], // 【追加】最大10個の別個デッキ
  currentDeckIndex: 0, // 【追加】現在操作中のデッキインデックス
  playerDeckSelection: [], // （旧）バトルや編集時の作業用として残す
  playerInventory: {},
  playerHP: 0,
  enemyHP: 0,
  playerMaxHP: 0,
  enemyMaxHP: 0,
  playerSP: 0,
  enemySP: 0,
  playerHand: [],
  enemyHand: [],
  playerDeck: [],
  enemyDeck: [],
  playerDiscard: [],
  enemyDiscard: [],
  // バトル開始時の初期デッキ枚数（デッキアイコン表示等で使用）
  initialPlayerDeckCount: 20,
  initialEnemyDeckCount: 20,
  playerBoard: [null, null, null],
  enemyBoard: [null, null, null],
  playerSealedLanes: [0, 0, 0],
  enemySealedLanes: [0, 0, 0],
  appState: 'title',
  gameMode: 'story',
  aiLevel: 1,
  storyDifficulty: 1,
  isProcessing: false,
  selectedCardIndex: null,
  isBattleEnded: false,
  firstPlayer: 'blue',
  turnCount: 0,
  battlePhase: 'INIT',
  actionQueue: [],
  combatStep: 0,
  aiDecision: null,
  selectedBoardLaneIndex: null,
  selectedBoardSide: null,
  isDiscardingMode: false,
  discardMaxCount: 0,
  discardSelectedIndices: [],
  isPlacementMode: false,
  battleCount: 1,
  storyQueue: [],
  dialogueQueue: [],
  currentDialogueIndex: 0,
  pendingCharId: null,
  lastBattleResult: null,
  longPressTimer: null,
  selectedStageId: null,
  extraTurnCount: 0,
  attackSkipCount: 0,
  gameVolume: 0.5,
  premiumCards: [],
  unlockedPremiumCards: [],
  selectedPlaymatId: null,
  dungeonWinStreak: 0,
  dungeonCards: [],
  dungeonOpponents: [],
  dungeonState: 'none',
  dungeonMaxWinStreak:
    parseInt(localStorage.getItem('mini_card_battle_dungeon_max_streak')) || 0,
  // デバッグ・チュートリアル用：バトル開始時の状態プリセット（適用後に自動クリア）
  battlePreset: null,
};

// Global fallback for browser debugging
if (typeof window !== 'undefined') {
  window.GameState = GameState;
}

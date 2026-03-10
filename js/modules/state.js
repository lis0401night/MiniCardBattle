// ==========================================
// グローバル変数（ゲーム状態管理）
// ==========================================
let playerConfig = CHARACTERS.android;
let enemyConfig = CHARACTERS.dragon;
let playerDeckSelection = [];
let playerInventory = {}; // 所持カード枚数管理
let playerHP, enemyHP, playerMaxHP, enemyMaxHP, playerSP, enemySP;
let playerHand, enemyHand, playerDeck, enemyDeck;
let playerDiscard, enemyDiscard;
let playerBoard, enemyBoard;
let appState = 'title', gameMode = 'story', aiLevel = 1;
let isProcessing = false, selectedCardIndex = null, isBattleEnded = false;
let battleCount = 1, storyQueue = [], dialogueQueue = [], currentDialogueIndex = 0;
let pendingCharId = null, lastBattleResult = null;
let longPressTimer;
let selectedStageId = null;
let gameVolume = 0.5;

// ==========================================
// グローバル変数（ゲーム状態管理）
// ==========================================
var playerConfig = CHARACTERS.android;
var enemyConfig = CHARACTERS.dragon;
var playerDeckSelection = [];
var playerInventory = {}; // 所持カード枚数管理
var playerHP, enemyHP, playerMaxHP, enemyMaxHP, playerSP, enemySP;
var playerHand, enemyHand, playerDeck, enemyDeck;
var playerDiscard, enemyDiscard;
var playerBoard, enemyBoard;
var appState = 'title', gameMode = 'story', aiLevel = 1, storyDifficulty = 1;
var isProcessing = false, selectedCardIndex = null, isBattleEnded = false;
var aiDecision = null; // AIの決定（選択スキルの結果等を含む）を一時保持用
var selectedBoardLaneIndex = null, selectedBoardSide = null; // 場のカード選択用
var isDiscardingMode = false, discardMaxCount = 0; // 手札入替時のプロンプト用
var isPlacementMode = false; // トークン配置時のプロンプト用
var battleCount = 1, storyQueue = [], dialogueQueue = [], currentDialogueIndex = 0;
var pendingCharId = null, lastBattleResult = null;
var longPressTimer;
var selectedStageId = null;
var gameVolume = 0.5;
var premiumCards = []; // プレミアムイラストを使用するカードIDのリスト
var unlockedPremiumCards = []; // 解放済みのプレミアムカードのIDリスト

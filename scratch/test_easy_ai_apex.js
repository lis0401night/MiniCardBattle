// Node.jsで実行するためにブラウザAPIのモックを設定
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => null,
  removeItem: () => null,
  clear: () => null
};

globalThis.Audio = class {
  constructor() {
    this.play = () => Promise.resolve();
    this.pause = () => {};
    this.load = () => {};
    this.addEventListener = () => {};
    this.removeEventListener = () => {};
  }
};

globalThis.window = {
  updateBgmGainNodes: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {}
};

async function run() {
  console.log('Testing Easy AI with Hellkite (Apex + Legendary card) in hand...');

  // 動的インポートを使用して、モックが設定された後にロードする
  const { GameState } = await import('../src/state/gameState.js');
  const { getEasyDecision } = await import('../src/game/ai_easy.js');
  const { CARD_MASTER } = await import('../src/utils/constants/cards.js');

  // 1. ヘルカイトの君主のデータを取得
  const hellkiteTpl = CARD_MASTER.find(c => c.id === 'hellkite');
  if (!hellkiteTpl) {
    console.error('Hellkite card master data not found!');
    process.exit(1);
  }

  // 2. モックGameStateを設定
  GameState.enemyHand = [ JSON.parse(JSON.stringify(hellkiteTpl)) ];
  GameState.enemyBoard = [ null, null, null ]; // 伝説のカードはない状態
  GameState.playerBoard = [ null, null, null ];
  GameState.enemyHP = 20;
  GameState.playerHP = 20;
  GameState.enemyMaxHP = 20;
  GameState.playerMaxHP = 20;
  GameState.enemySP = 0;
  GameState.playerSP = 0;
  GameState.playerHand = [];
  GameState.playerDiscard = [];
  GameState.enemyDiscard = [];
  GameState.playerDeck = [];
  GameState.enemyDeck = [];
  GameState.turnCount = 2; // 1ターン目制限を外すため
  GameState.enemySealedLanes = [0, 0, 0];
  GameState.playerSealedLanes = [0, 0, 0];

  console.log('Invoking getEasyDecision()...');
  try {
    const decision = getEasyDecision();
    console.log('Decision obtained successfully:', decision);
    console.log('✅ TEST PASSED: No crash occurred when evaluating Apex/Legendary card on invalid board!');
  } catch (err) {
    console.error('❌ TEST FAILED: Crash detected!', err);
    process.exit(1);
  }
}

run();

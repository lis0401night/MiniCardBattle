// Node.js の環境用に localStorage をモック
global.localStorage = {
  getItem: (key) => {
    if (key === 'mini_card_battle_dungeon_max_streak') return '0';
    return null;
  },
  setItem: () => {},
  removeItem: () => {}
};

// その他の必要なブラウザグローバルをモック
global.Audio = class {
  constructor() {}
  addEventListener() {}
  removeEventListener() {}
  play() { return Promise.resolve(); }
  pause() {}
  load() {}
};

global.window = {
  addEventListener() {},
  removeEventListener() {},
  AudioContext: class {
    createOscillator() {}
    createGain() {}
  },
  webkitAudioContext: class {},
};

global.document = {
  addEventListener() {},
  removeEventListener() {},
};

async function run() {
  const { GameState } = await import('../src/state/gameState.js');
  const { getBestSimulatedMove } = await import('../src/game/ai_normal.js');
  const { CARD_MASTER } = await import('../src/utils/constants/cards.js');

  // GameState のモックセットアップ
  GameState.playerBoard = [null, null, null];
  GameState.enemyBoard = [null, null, null];
  GameState.playerHand = [];
  GameState.enemyHand = [];
  GameState.playerDiscard = [];
  GameState.enemyDiscard = [];
  GameState.playerDeck = [];
  GameState.enemyDeck = [];
  GameState.playerHP = 20;
  GameState.enemyHP = 20;
  GameState.playerMaxHP = 20;
  GameState.enemyMaxHP = 20;
  GameState.playerSP = 0;
  GameState.enemySP = 0;
  GameState.turnCount = 2;
  GameState.enemyConfig = {
    id: 'enemy_challenger',
    name: '対戦相手',
    leaderSkill: null
  };

  // 手札の用意
  // 1. 鍛造を持つ「異形の刀鍛冶（ippondatara）」 (id: 'ippondatara', power: 4)
  // 2. 装備を持つ「無垢の光（light）」 (id: 'light', power: 4)
  const ippondatara = CARD_MASTER.find(c => c.id === 'ippondatara');
  const light = CARD_MASTER.find(c => c.id === 'light');

  if (!ippondatara || !light) {
    console.error('Card definitions not found!');
    process.exit(1);
  }

  // テストケース 1: 盤面が空の状態で、手札に「異形の刀鍛冶」と「無垢の光」がある場合
  console.log('--- Test Case 1: Empty board, Hand: Ippondatara + Light ---');
  GameState.enemyHand = [
    JSON.parse(JSON.stringify(ippondatara)),
    JSON.parse(JSON.stringify(light))
  ];
  // 各カードにUIDを設定
  GameState.enemyHand[0].uid = 'sim_ippondatara_1';
  GameState.enemyHand[1].uid = 'sim_light_1';

  const bestMoves = getBestSimulatedMove();
  console.log('AI Best Moves:', JSON.stringify(bestMoves, null, 2));

  // 結果の検証
  if (bestMoves) {
    const actionQueue = bestMoves.actionQueue || [];
    const hasForgeAction = actionQueue.some(m => m.type === 'forge');
    console.log(`Forge action generated: ${hasForgeAction ? 'SUCCESS' : 'FAILED'}`);
    if (hasForgeAction) {
      console.log('Forge action details:', JSON.stringify(actionQueue.find(m => m.type === 'forge')));
    }
  } else {
    console.log('No moves generated!');
  }

  // テストケース 2: 自分の場に「刀狩りの豪傑（benkei, 武装）」があり、手札に「異形の刀鍛冶（ippondatara）」と「スライム（slime）」がある場合
  console.log('\n--- Test Case 2: Own board has Benkei (arm_self), Hand: Ippondatara + Slime ---');
  const benkei = CARD_MASTER.find(c => c.id === 'benkei');
  const slime = CARD_MASTER.find(c => c.id === 'slime');

  if (!benkei || !slime) {
    console.error('Test case 2 card definitions not found!');
    process.exit(1);
  }

  // 盤面リセットとBenkeiの配置
  GameState.playerBoard = [null, null, null];
  GameState.enemyBoard = [
    JSON.parse(JSON.stringify(benkei)),
    null,
    null
  ];
  GameState.enemyBoard[0].uid = 'sim_benkei_1';

  // 手札設定
  GameState.enemyHand = [
    JSON.parse(JSON.stringify(ippondatara)),
    JSON.parse(JSON.stringify(slime))
  ];
  GameState.enemyHand[0].uid = 'sim_ippondatara_2';
  GameState.enemyHand[1].uid = 'sim_slime_2';

  const bestMoves2 = getBestSimulatedMove();
  console.log('AI Best Moves (TC2):', JSON.stringify(bestMoves2, null, 2));

  if (bestMoves2) {
    const actionQueue = bestMoves2.actionQueue || [];
    const hasForgeAction = actionQueue.some(m => m.type === 'forge');
    console.log(`Forge action generated (TC2): ${hasForgeAction ? 'SUCCESS' : 'FAILED'}`);
    if (hasForgeAction) {
      console.log('Forge action details (TC2):', JSON.stringify(actionQueue.find(m => m.type === 'forge')));
    }
  } else {
    console.log('No moves generated (TC2)!');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

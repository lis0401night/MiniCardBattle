// Node.js環境での localStorage、window、document、Audio のモック
global.localStorage = {
  getItem: (key) => {
    if (key === 'mini_card_battle_unlocked_skins') return '[]';
    if (key === 'mini_card_battle_unlocked_titles') return '[]';
    if (key === 'mini_card_battle_selected_skins') return '{}';
    return null;
  },
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

global.window = {
  triggerVfx: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

global.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
};

global.Audio = class {
  constructor() {
    this.volume = 1;
    this.loop = false;
  }
  play() { return Promise.resolve(); }
  pause() {}
  load() {}
};

// 動的インポート
const { applySingleCombat, processDestructionTriggers } = await import('../src/game/engine.js');

function runTests() {
  console.log('--- Starting soul_bind_void tests ---');

  // Test Case 1: Normal combat with soul_bind_void
  {
    const shadeCard = {
      uid: 'blue_shade_1',
      id: 'shade',
      name: '墓の亡霊',
      power: 4,
      currentPower: 4,
      skills: [{ id: 'soul_bind_void', value: 2 }],
      voiceCategory: 'undead',
    };

    const cheetahCard = {
      uid: 'red_cheetah_1',
      id: 'cheetah',
      name: '稲妻 of 猟豹',
      power: 3,
      currentPower: 3,
      skills: [{ id: 'quick' }],
      voiceCategory: 'beast',
    };

    const voidCard1 = { id: 'token_void', baseId: 'token_void', name: '虚空', power: 0, currentPower: 0 };
    const voidCard2 = { id: 'token_void', baseId: 'token_void', name: '虚空', power: 0, currentPower: 0 };

    const state = {
      playerBoard: [shadeCard, null, null],
      enemyBoard: [cheetahCard, null, null],
      playerHand: [voidCard1, voidCard2], // 2 void cards
      enemyHand: [],
      playerHP: 20,
      enemyHP: 20,
      playerDiscard: [],
      enemyDiscard: [],
    };

    const events = [];
    applySingleCombat(state, 'blue', 0, events);
    processDestructionTriggers(state, events);

    // Assertions:
    // shade initial power = 4. cheetah power = 3.
    // shade takes 3 counter damage -> currentPower becomes 1.
    // cheetah takes 4 damage -> destroyed.
    // soul_bind_void triggers: val (2) * voidCount (2) = +4 power.
    // Expected final power of shade = 1 + 4 = 5.
    console.log('Test Case 1 (Normal combat):');
    console.log('Shade final power:', shadeCard.currentPower);
    console.log('Events:', JSON.stringify(events.filter(e => e.source === 'soul_bind_void')));

    if (shadeCard.currentPower === 5) {
      console.log('=> Test Case 1: PASSED');
    } else {
      console.error('=> Test Case 1: FAILED (Expected 5, got ' + shadeCard.currentPower + ')');
      process.exit(1);
    }
  }

  // Test Case 2: Cleave combat with soul_bind_void (multiple destructions)
  {
    const shadeCleaveCard = {
      uid: 'blue_shade_cleave_1',
      id: 'shade_cleave',
      name: '一掃墓の亡霊',
      power: 6,
      currentPower: 6,
      skills: [{ id: 'soul_bind_void', value: 2 }, { id: 'cleave' }],
      voiceCategory: 'undead',
    };

    const enemyCard1 = {
      uid: 'red_enemy_1',
      id: 'cheetah',
      name: 'ターゲット1',
      power: 2,
      currentPower: 2,
      skills: [],
    };

    const enemyCard2 = {
      uid: 'red_enemy_2',
      id: 'cheetah',
      name: 'ターゲット2',
      power: 2,
      currentPower: 2,
      skills: [],
    };

    const voidCard1 = { id: 'token_void', baseId: 'token_void', name: '虚空', power: 0, currentPower: 0 };
    const voidCard2 = { id: 'token_void', baseId: 'token_void', name: '虚空', power: 0, currentPower: 0 };

    const state = {
      playerBoard: [shadeCleaveCard, null, null],
      enemyBoard: [enemyCard1, enemyCard2, null], // targets at lane 0 and lane 1
      playerHand: [voidCard1, voidCard2], // 2 void cards
      enemyHand: [],
      playerHP: 20,
      enemyHP: 20,
      playerDiscard: [],
      enemyDiscard: [],
    };

    const events = [];
    applySingleCombat(state, 'blue', 0, events);
    processDestructionTriggers(state, events);

    // Assertions:
    // shadeCleave power = 6.
    // targets = lane 0 and lane 1.
    // damage split: base = floor(6/2) = 3. rem = 0.
    // enemyCard1 takes 3 damage (currentPower -> -1, destroyed)
    // enemyCard2 takes 3 damage (currentPower -> -1, destroyed)
    // counter damage from original target (enemyCard1, power 2) -> shadeCleave takes 2 damage (currentPower -> 4)
    // soul_bind_void triggers: val (2) * voidCount (2) * destroyedCount (2) = +8 power.
    // Expected final power of shadeCleave = 4 + 8 = 12.
    console.log('\nTest Case 2 (Cleave combat):');
    console.log('ShadeCleave final power:', shadeCleaveCard.currentPower);
    console.log('Events:', JSON.stringify(events.filter(e => e.source === 'soul_bind_void')));

    if (shadeCleaveCard.currentPower === 12) {
      console.log('=> Test Case 2: PASSED');
    } else {
      console.error('=> Test Case 2: FAILED (Expected 12, got ' + shadeCleaveCard.currentPower + ')');
      process.exit(1);
    }
  }

  console.log('\n--- All tests completed successfully ---');
}

runTests();

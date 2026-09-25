/**
 * カード「コンビネーション」と「ミミック（万相）」の組み合わせ挙動、
 * および「self + excludeBoard + ミミック」の除外挙動テスト
 */

// Node.js 環境用モックの定義（モジュール読み込み前）
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.Audio = class {
  constructor() {}
  play() {
    return Promise.resolve();
  }
  pause() {}
  load() {}
  addEventListener() {}
  removeEventListener() {}
};

// ダイナミックインポートでモジュールをロード
const { CARD_MASTER } = await import('../src/utils/constants/cards.js');
const {
  hasSkillDeep,
  matchesHandOrDeckTarget,
  matchesGraveyardTarget,
  getCardActiveStatuses,
  renderSkillTag,
} = await import('../src/utils/gameUtils.js');

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedCount++;
  }
}

console.log('=== コンビネーション & ミミック 挙動検証テスト ===\n');

const combinationCard = CARD_MASTER.find((c) => c.id === 'combination');
const mimicCard = CARD_MASTER.find((c) => c.id === 'mimic');

assert(Boolean(combinationCard), 'コンビネーションカードが存在すること');
assert(Boolean(mimicCard), 'ミミックカードが存在すること');
assert(
  hasSkillDeep(mimicCard, 'all_forms'),
  'ミミックが万相（all_forms）を所持していること'
);

const summonSkill = combinationCard?.skills?.find((s) => s.id === 'summon');
const resurrectSkill = combinationCard?.skills?.find(
  (s) => s.id === 'resurrect'
);

assert(
  Boolean(summonSkill && summonSkill.excludeBoard),
  'コンビネーションが excludeBoard: true の召喚スキルを持つこと'
);
assert(
  Boolean(resurrectSkill && resurrectSkill.excludeBoard),
  'コンビネーションが excludeBoard: true の復活スキルを持つこと'
);

console.log('\n--- 1. 手札召喚（matchesHandOrDeckTarget）の検証 ---');

// 1-1. 盤面が空の場合
assert(
  matchesHandOrDeckTarget(mimicCard, summonSkill, { presentBoardIds: [] }),
  '盤面空: ミミックは召喚可能'
);

// 1-2. 盤面に4種のいずれか（赤ずきん: redhood）が存在する場合
assert(
  !matchesHandOrDeckTarget(mimicCard, summonSkill, {
    presentBoardIds: ['redhood'],
  }),
  '盤面に赤ずきん(redhood)存在: ミミックは召喚不可（厳密な代用判定）'
);

// 1-3. 盤面に4種以外の無関係なカード（ゴーレム）のみが存在する場合
assert(
  matchesHandOrDeckTarget(mimicCard, summonSkill, {
    presentBoardIds: ['golem'],
  }),
  '盤面にゴーレムのみ存在: ミミックは召喚可能（4種が未存在のため）'
);

console.log(
  '\n--- 2. 【新規検証】self + excludeBoard + ミミック（万相）の検証 ---'
);
// 「発動元自身と同じカードをデッキまたは手札から召喚するが、既に場にいる場合は不可」というスキル
const selfExcludeSkill = {
  id: 'summon',
  self: true,
  excludeBoard: true,
};

// 2-1. 発動元カード（例: phoenix）が盤面にいない場合
assert(
  matchesHandOrDeckTarget(mimicCard, selfExcludeSkill, {
    selfId: 'phoenix',
    presentBoardIds: [],
  }),
  '盤面にphoenix未存在: ミミックは万相として召喚可能'
);

// 2-2. 発動元カード（例: phoenix）が既に盤面に存在する場合
assert(
  !matchesHandOrDeckTarget(mimicCard, selfExcludeSkill, {
    selfId: 'phoenix',
    presentBoardIds: ['phoenix'],
  }),
  '盤面にphoenix存在: ミミックは万相（同名）とみなされ除外（召喚不可）されること'
);

// 2-3. targetSelf: true でも同様に除外されること
const targetSelfExcludeSkill = {
  id: 'summon',
  targetSelf: true,
  excludeBoard: true,
};
assert(
  !matchesHandOrDeckTarget(mimicCard, targetSelfExcludeSkill, {
    selfId: 'dragon_knight',
    presentBoardIds: ['dragon_knight'],
  }),
  'targetSelf指定: 盤面にdragon_knight存在時、ミミックは除外されること'
);

// 2-4. 墓地復活（matchesGraveyardTarget）での self + excludeBoard 検証
assert(
  !matchesGraveyardTarget(mimicCard, selfExcludeSkill, {
    selfId: 'phoenix',
    presentBoardIds: ['phoenix'],
  }),
  '墓地復活self指定: 盤面にphoenix存在時、ミミックは除外されること'
);

console.log('\n--- 3. renderSkillTag と getCardActiveStatuses の統合検証 ---');
// 盤面カードに複数状態と通常スキルが付与されている場合のタグ生成テスト
const testCard = {
  id: 'test_card',
  name: 'テストカード',
  owner: 'blue',
  skills: [
    { id: 'double_strike', value: 2 },
    { id: 'corrosion', value: 2, isStatus: true },
  ],
  stunTurns: 1,
};

const tagHtml = renderSkillTag(testCard, true, false);
assert(
  tagHtml.includes('badge-corrosion'),
  'renderSkillTag に腐食バッジが含まれること'
);
assert(
  tagHtml.includes('badge-stun'),
  'renderSkillTag にスタンバッジが含まれること'
);
assert(
  tagHtml.includes('連撃2'),
  'renderSkillTag に通常スキル（連撃2）が含まれること'
);

const statuses = getCardActiveStatuses(testCard, true, false);
assert(
  statuses.length === 2,
  'getCardActiveStatuses で2つの状態が取得されること'
);

console.log(`\n================================`);
console.log(`Result: ${passedCount} passed, ${failedCount} failed.`);
console.log(`================================`);

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

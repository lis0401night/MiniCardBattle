/**
 * カード「コンビネーション」と「ミミック（万相）」の組み合わせ挙動テスト
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
const { hasSkillDeep, matchesSummonTarget, matchesResurrectTarget } =
  await import('../src/utils/gameUtils.js');

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

// 1. マスターデータ取得
const combinationCard = CARD_MASTER.find((c) => c.id === 'combination');
const mimicCard = CARD_MASTER.find((c) => c.id === 'mimic');
const redhoodCard = CARD_MASTER.find((c) => c.id === 'redhood');
const snowwhiteCard = CARD_MASTER.find((c) => c.id === 'snowwhite');
const goldilocksCard = CARD_MASTER.find((c) => c.id === 'goldilocks');
const rosenbergCard = CARD_MASTER.find((c) => c.id === 'rosenberg');
const golemCard = CARD_MASTER.find((c) => c.id === 'golem');

assert(Boolean(combinationCard), 'コンビネーションカードが存在すること');
assert(Boolean(mimicCard), 'ミミックカードが存在すること');
assert(
  hasSkillDeep(mimicCard, 'all_forms'),
  'ミミックが万相（all_forms）を所持していること'
);

const summonSkill = combinationCard.skills.find((s) => s.id === 'summon');
const resurrectSkill = combinationCard.skills.find((s) => s.id === 'resurrect');

assert(
  Boolean(summonSkill && summonSkill.excludeBoard),
  'コンビネーションが excludeBoard: true の召喚スキルを持つこと'
);
assert(
  Boolean(resurrectSkill && resurrectSkill.excludeBoard),
  'コンビネーションが excludeBoard: true の復活スキルを持つこと'
);

console.log('\n--- 1. 手札召喚（matchesSummonTarget）の検証 ---');

// パターン A: 盤面が空の場合
{
  const options = { presentBoardIds: [], presentBoardCards: [] };
  assert(
    matchesSummonTarget(mimicCard, summonSkill, options) === true,
    '盤面空: ミミックは召喚可能'
  );
  assert(
    matchesSummonTarget(redhoodCard, summonSkill, options) === true,
    '盤面空: 赤ずきんは召喚可能'
  );
  assert(
    matchesSummonTarget(snowwhiteCard, summonSkill, options) === true,
    '盤面空: 白雪は召喚可能'
  );
  assert(
    matchesSummonTarget(goldilocksCard, summonSkill, options) === true,
    '盤面空: 金髪は召喚可能'
  );
  assert(
    matchesSummonTarget(rosenbergCard, summonSkill, options) === true,
    '盤面空: ローゼンバーグは召喚可能'
  );
  assert(
    matchesSummonTarget(golemCard, summonSkill, options) === false,
    '盤面空: ゴーレムは召喚不可'
  );
}

// パターン B: 盤面に「赤ずきん」が1体のみ存在する場合
{
  const presentBoardCards = [redhoodCard];
  const presentBoardIds = ['redhood'];
  const options = { presentBoardIds, presentBoardCards };

  assert(
    matchesSummonTarget(mimicCard, summonSkill, options) === false,
    '盤面に赤ずきん存在: ミミックは召喚不可（厳密な代用判定）'
  );
  assert(
    matchesSummonTarget(redhoodCard, summonSkill, options) === false,
    '盤面に赤ずきん存在: 赤ずきんは召喚不可（同名除外）'
  );
  assert(
    matchesSummonTarget(snowwhiteCard, summonSkill, options) === true,
    '盤面に赤ずきん存在: 白雪は召喚可能'
  );
  assert(
    matchesSummonTarget(goldilocksCard, summonSkill, options) === true,
    '盤面に赤ずきん存在: 金髪は召喚可能'
  );
  assert(
    matchesSummonTarget(rosenbergCard, summonSkill, options) === true,
    '盤面に赤ずきん存在: ローゼンバーグは召喚可能'
  );
}

// パターン C: 盤面に「白雪」が1体のみ存在する場合
{
  const presentBoardCards = [snowwhiteCard];
  const presentBoardIds = ['snowwhite'];
  const options = { presentBoardIds, presentBoardCards };

  assert(
    matchesSummonTarget(mimicCard, summonSkill, options) === false,
    '盤面に白雪存在: ミミックは召喚不可（厳密な代用判定）'
  );
  assert(
    matchesSummonTarget(redhoodCard, summonSkill, options) === true,
    '盤面に白雪存在: 赤ずきんは召喚可能'
  );
  assert(
    matchesSummonTarget(snowwhiteCard, summonSkill, options) === false,
    '盤面に白雪存在: 白雪は召喚不可（同名除外）'
  );
}

// パターン D: 盤面に「金髪」が1体のみ存在する場合
{
  const presentBoardCards = [goldilocksCard];
  const presentBoardIds = ['goldilocks'];
  const options = { presentBoardIds, presentBoardCards };

  assert(
    matchesSummonTarget(mimicCard, summonSkill, options) === false,
    '盤面に金髪存在: ミミックは召喚不可（厳密な代用判定）'
  );
}

// パターン E: 盤面に「ローゼンバーグ」が1体のみ存在する場合
{
  const presentBoardCards = [rosenbergCard];
  const presentBoardIds = ['rosenberg'];
  const options = { presentBoardIds, presentBoardCards };

  assert(
    matchesSummonTarget(mimicCard, summonSkill, options) === false,
    '盤面にローゼンバーグ存在: ミミックは召喚不可（厳密な代用判定）'
  );
}

// パターン F: 盤面に4種全員が存在する場合
{
  const presentBoardCards = [
    redhoodCard,
    snowwhiteCard,
    goldilocksCard,
    rosenbergCard,
  ];
  const presentBoardIds = ['redhood', 'snowwhite', 'goldilocks', 'rosenberg'];
  const options = { presentBoardIds, presentBoardCards };

  assert(
    matchesSummonTarget(mimicCard, summonSkill, options) === false,
    '盤面に4種全員存在: ミミックは召喚不可'
  );
  assert(
    matchesSummonTarget(redhoodCard, summonSkill, options) === false,
    '盤面に4種全員存在: 赤ずきんは召喚不可'
  );
  assert(
    matchesSummonTarget(snowwhiteCard, summonSkill, options) === false,
    '盤面に4種全員存在: 白雪は召喚不可'
  );
}

// パターン G: 盤面に「ミミック（万相）」が存在する場合
{
  const presentBoardCards = [mimicCard];
  const presentBoardIds = ['mimic'];
  const options = { presentBoardIds, presentBoardCards };

  assert(
    matchesSummonTarget(mimicCard, summonSkill, options) === false,
    '盤面に万相存在: ミミックは召喚不可'
  );
  assert(
    matchesSummonTarget(redhoodCard, summonSkill, options) === false,
    '盤面に万相存在: 赤ずきんは召喚不可（万相が全枠占有）'
  );
  assert(
    matchesSummonTarget(snowwhiteCard, summonSkill, options) === false,
    '盤面に万相存在: 白雪は召喚不可（万相が全枠占有）'
  );
  assert(
    matchesSummonTarget(goldilocksCard, summonSkill, options) === false,
    '盤面に万相存在: 金髪は召喚不可（万相が全枠占有）'
  );
  assert(
    matchesSummonTarget(rosenbergCard, summonSkill, options) === false,
    '盤面に万相存在: ローゼンバーグは召喚不可（万相が全枠占有）'
  );
}

// パターン H: 盤面に4種以外のカード（ゴーレム）のみが存在する場合
{
  const presentBoardCards = [golemCard];
  const presentBoardIds = ['golem'];
  const options = { presentBoardIds, presentBoardCards };

  assert(
    matchesSummonTarget(mimicCard, summonSkill, options) === true,
    '盤面にゴーレムのみ存在: ミミックは召喚可能（4種が未存在のため）'
  );
  assert(
    matchesSummonTarget(redhoodCard, summonSkill, options) === true,
    '盤面にゴーレムのみ存在: 赤ずきんは召喚可能'
  );
}

console.log('\n--- 2. 墓地復活（matchesResurrectTarget）の検証 ---');

// パターン A: 盤面が空の場合
{
  const options = { presentBoardIds: [], presentBoardCards: [] };
  assert(
    matchesResurrectTarget(mimicCard, resurrectSkill, options) === true,
    '墓地・盤面空: ミミックは復活可能'
  );
  assert(
    matchesResurrectTarget(redhoodCard, resurrectSkill, options) === true,
    '墓地・盤面空: 赤ずきんは復活可能'
  );
}

// パターン B: 盤面に「赤ずきん」が存在する場合
{
  const options = {
    presentBoardIds: ['redhood'],
    presentBoardCards: [redhoodCard],
  };
  assert(
    matchesResurrectTarget(mimicCard, resurrectSkill, options) === false,
    '墓地・盤面に赤ずきん存在: ミミックは復活不可（厳密な代用判定）'
  );
  assert(
    matchesResurrectTarget(redhoodCard, resurrectSkill, options) === false,
    '墓地・盤面に赤ずきん存在: 赤ずきんは復活不可'
  );
  assert(
    matchesResurrectTarget(snowwhiteCard, resurrectSkill, options) === true,
    '墓地・盤面に赤ずきん存在: 白雪は復活可能'
  );
}

// パターン C: 盤面に4種全員が存在する場合
{
  const options = {
    presentBoardIds: ['redhood', 'snowwhite', 'goldilocks', 'rosenberg'],
    presentBoardCards: [
      redhoodCard,
      snowwhiteCard,
      goldilocksCard,
      rosenbergCard,
    ],
  };
  assert(
    matchesResurrectTarget(mimicCard, resurrectSkill, options) === false,
    '墓地・盤面に4種全員存在: ミミックは復活不可'
  );
}

// パターン D: 盤面に「ミミック（万相）」が存在する場合
{
  const options = {
    presentBoardIds: ['mimic'],
    presentBoardCards: [mimicCard],
  };
  assert(
    matchesResurrectTarget(mimicCard, resurrectSkill, options) === false,
    '墓地・盤面に万相存在: ミミックは復活不可'
  );
  assert(
    matchesResurrectTarget(redhoodCard, resurrectSkill, options) === false,
    '墓地・盤面に万相存在: 赤ずきんは復活不可（万相が全枠占有）'
  );
}

console.log(
  `\n=== テスト結果サマリー: 成功 ${passedCount}件 / 失敗 ${failedCount}件 ===`
);
if (failedCount > 0) {
  process.exit(1);
}

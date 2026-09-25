/**
 * 状態表示（ステータス）抽出および表示テキストのユニットテスト
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
const { getCardActiveStatuses, renderSkillTag } =
  await import('../src/utils/gameUtils.js');
const { STATUSES } = await import('../src/utils/constants/statuses.js');

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

console.log('--- Testing getCardActiveStatuses & renderSkillTag ---');

// Test 1: スタン状態の抽出
{
  const card = { id: 'goblin', name: 'ゴブリン', stunTurns: 2 };
  const statuses = getCardActiveStatuses(card, true);
  assert(statuses.length === 1, 'スタン状態が1件抽出されること');
  assert(statuses[0].id === 'stun', '状態IDがstunであること');
  assert(
    statuses[0].name === STATUSES.stun.name,
    '名称がSTATUSESマスターと一致すること'
  );
  assert(
    statuses[0].badgeClass === STATUSES.stun.badgeClass,
    'badgeClassがSTATUSESマスターと一致すること'
  );
  assert(
    statuses[0].desc.includes('2ターンの間、攻撃を行わず'),
    '説明文に残りターン数と攻撃不可が含まれること'
  );
  const tag = renderSkillTag(card, true);
  assert(
    tag.includes('badge-stun'),
    'renderSkillTag に badge-stun が含まれること'
  );
}

// Test 2: 腐食状態の抽出（skills スロット + 直接プロパティ同期）
{
  const card = {
    id: 'corrupted_warrior',
    name: '腐食戦士',
    skills: [{ id: 'corrosion', value: 1, isStatus: true }],
    corrosion: 3,
  };
  const statuses = getCardActiveStatuses(card, true);
  assert(
    statuses.length === 1,
    'スロットと直接プロパティで重複せず1件のみ抽出されること'
  );
  assert(statuses[0].id === 'corrosion', '状態IDがcorrosionであること');
  assert(statuses[0].name === '腐食', '名称が「腐食」であること');
  assert(
    statuses[0].value === 3,
    '最新の直接プロパティ値(3)が反映されていること'
  );
  assert(statuses[0].icon === '💀', 'アイコンが💀であること');
  assert(
    statuses[0].badgeClass === 'badge-corrosion',
    'badgeClassがbadge-corrosionであること'
  );
  assert(
    statuses[0].desc === '自分のターン開始時、パワー-3',
    '説明文がパワー減少値と一致すること'
  );
  const tag = renderSkillTag(card, true);
  assert(
    tag.includes('badge-corrosion'),
    'renderSkillTag に badge-corrosion が含まれること'
  );
}

// Test 3: 無敵状態の抽出
{
  const card = { id: 'shadow_ninja', name: '忍者', invincibleTurns: 1 };
  const statuses = getCardActiveStatuses(card, true);
  assert(statuses.length === 1, '無敵状態が1件抽出されること');
  assert(statuses[0].id === 'invincible', '状態IDがinvincibleであること');
  assert(statuses[0].name === '無敵', '名称が「無敵」であること');
  assert(statuses[0].value === 1, '持続ターン数が1であること');
  assert(statuses[0].icon === '🌟', 'アイコンが🌟であること');
  assert(
    statuses[0].badgeClass === 'badge-invincible',
    'badgeClassがbadge-invincibleであること'
  );
  assert(
    statuses[0].desc.includes('戦闘でダメージを受けない'),
    '説明文が無敵効果であること'
  );
}

// Test 4: 加護状態の抽出（盤面カード・全体加護）
{
  const card = { id: 'holy_knight', name: '聖騎士', owner: 'blue' };
  const statuses = getCardActiveStatuses(card, true, true);
  assert(statuses.length === 1, '加護状態が1件抽出されること');
  assert(
    statuses[0].id === 'valkyria_guard',
    '状態IDがvalkyria_guardであること'
  );
  assert(statuses[0].name === '加護', '名称が「加護」であること');
  assert(statuses[0].icon === '🔆', 'アイコンが🔆であること');
  assert(
    statuses[0].badgeClass === 'badge-valkyria-guard',
    'badgeClassがbadge-valkyria-guardであること'
  );
  assert(
    statuses[0].desc === '全てのダメージを受けず、破壊されない。',
    '加護の説明文が正しいこと'
  );
  const tag = renderSkillTag(card, true, true);
  assert(
    tag.includes('badge-valkyria-guard'),
    'renderSkillTag に badge-valkyria-guard が含まれること'
  );
}

// Test 5: 攻撃不能状態の抽出
{
  const card = { id: 'archer', name: '射手', cantAttackTurns: 2 };
  const statuses = getCardActiveStatuses(card, true);
  assert(statuses.length === 1, '攻撃不能状態が1件抽出されること');
  assert(statuses[0].id === 'cant_attack', '状態IDがcant_attackであること');
  assert(statuses[0].name === '攻撃不能', '名称が「攻撃不能」であること');
  assert(statuses[0].value === 2, '持続ターン数が2であること');
  assert(
    statuses[0].badgeClass === 'badge-cant-attack',
    'badgeClassがbadge-cant-attackであること'
  );
  assert(
    statuses[0].desc === '2ターンの間、攻撃を行えない。',
    '攻撃不能の説明文が正しいこと'
  );
}

// Test 6: 複数状態（通常スキル混在）の抽出
{
  const card = {
    id: 'boss',
    name: 'ボス',
    skills: [
      { id: 'double_strike', value: 2 },
      { id: 'corrosion', value: 2, isStatus: true },
    ],
    stunTurns: 1,
    invincibleTurns: 1,
  };
  const statuses = getCardActiveStatuses(card, true);
  assert(
    statuses.length === 3,
    '通常スキルを除き状態異常のみ3件抽出されること'
  );
  const ids = statuses.map((s) => s.id);
  assert(ids.includes('corrosion'), '腐食が含まれること');
  assert(ids.includes('stun'), 'スタンが含まれること');
  assert(ids.includes('invincible'), '無敵が含まれること');
  // スロット順の確認: corrosion が skills 内にあったため最初に来ること
  assert(
    statuses[0].id === 'corrosion',
    'skills 内の状態スロットが優先して最初に来ること'
  );
  const tag = renderSkillTag(card, true);
  assert(
    tag.includes('badge-corrosion'),
    'renderSkillTag に corrosion が含まれること'
  );
  assert(tag.includes('badge-stun'), 'renderSkillTag に stun が含まれること');
  assert(
    tag.includes('badge-invincible'),
    'renderSkillTag に invincible が含まれること'
  );
  assert(tag.includes('連撃2'), 'renderSkillTag に通常スキルが含まれること');
}

// Test 7: 非配置カード（手札や一覧画面）では全体加護が付与されないこと
{
  const card = { id: 'holy_knight', name: '聖騎士' };
  const statuses = getCardActiveStatuses(card, false, true);
  assert(statuses.length === 0, '未配置カードには全体加護が付与されないこと');
}

console.log(`\n================================`);
console.log(`Result: ${passedCount} passed, ${failedCount} failed.`);
console.log(`================================`);

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

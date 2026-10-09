import assert from 'assert';
import {
  CHARACTERS,
  getLeaderDisplayNameInfo,
  getLeaderNameStyle,
} from '../src/utils/constants/characters.js';
import {
  hydrateDungeonOpponent,
  generateCharacterBossEnemy,
} from '../src/utils/constants/battleDungeon.js';

console.log('=== 表示名およびダンジョンボス復元テスト ===\n');

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. generateCharacterBossEnemy での水着ボス生成
test('generateCharacterBossEnemy: 通常ボスの水着スキンで name と displayName が「<二つ名> <名前>」であること', () => {
  // Math.random を 0 にして最初のボス（通常 android）を選出
  const origRandom = Math.random;
  try {
    Math.random = () => 0;
    const boss = generateCharacterBossEnemy(10);
    assert.strictEqual(boss.currentSkin, 'summer');
    const displayInfo = getLeaderDisplayNameInfo(CHARACTERS.android, 'summer');
    assert.strictEqual(boss.name, displayInfo.fullName);
    assert.strictEqual(boss.displayName, displayInfo.fullName);
    assert.strictEqual(boss.name, '水陸両用装備 アイギス');
  } finally {
    Math.random = origRandom;
  }
});

// 2. hydrateDungeonOpponent での復元（name プロパティが欠落したセーブデータからの復元）
test('hydrateDungeonOpponent: セーブデータから復元された水着マキナの name が「ウェイブライダー マキナ」であること', () => {
  const lightweightSavedOpp = {
    id: 'dungeon_boss_automata_1234567890',
    charId: 'automata',
    currentSkin: 'summer',
    isDungeonEnemy: true,
    hp: 20,
  };
  const hydrated = hydrateDungeonOpponent(lightweightSavedOpp);
  assert.strictEqual(hydrated.name, 'ウェイブライダー マキナ');
  assert.strictEqual(hydrated.displayName, 'ウェイブライダー マキナ');
});

// 3. hydrateDungeonOpponent での復元（過去のバグで opp.name が「ウェイブライダー」単体に汚染されていた場合）
test('hydrateDungeonOpponent: opp.name が二つ名単体で汚染されていても「ウェイブライダー マキナ」に自己修復されること', () => {
  const contaminatedSavedOpp = {
    id: 'dungeon_boss_automata_1234567890',
    charId: 'automata',
    name: 'ウェイブライダー',
    currentSkin: 'summer',
    isDungeonEnemy: true,
    hp: 20,
  };
  const hydrated = hydrateDungeonOpponent(contaminatedSavedOpp);
  assert.strictEqual(hydrated.name, 'ウェイブライダー マキナ');
  assert.strictEqual(hydrated.displayName, 'ウェイブライダー マキナ');
});

// 4. getLeaderDisplayNameInfo: 動的IDを持つ敵オブジェクトの解決
test('getLeaderDisplayNameInfo: 動的IDの敵オブジェクトから subtitle:「ウェイブライダー」, name:「マキナ」が分離解決されること', () => {
  const dungeonEnemy = {
    id: 'dungeon_boss_automata_1234567890',
    charId: 'automata',
    name: 'ウェイブライダー マキナ',
    currentSkin: 'summer',
    skins: CHARACTERS.automata.skins,
  };
  const info = getLeaderDisplayNameInfo(dungeonEnemy, 'summer');
  assert.strictEqual(info.subtitle, 'ウェイブライダー');
  assert.strictEqual(info.name, 'マキナ');
  assert.strictEqual(info.fullName, 'ウェイブライダー マキナ');
});

// 5. getLeaderDisplayNameInfo: 名前にスペースがない汚染オブジェクトが来てもマスタからマキナが救済されること
test('getLeaderDisplayNameInfo: 不完全な単語のみのオブジェクトでもマスタの正式名から名前「マキナ」を復元すること', () => {
  const brokenEnemy = {
    id: 'dungeon_boss_automata_1234567890',
    charId: 'automata',
    name: 'ウェイブライダー',
    currentSkin: 'summer',
  };
  const info = getLeaderDisplayNameInfo(brokenEnemy, 'summer');
  assert.strictEqual(info.subtitle, 'ウェイブライダー');
  assert.strictEqual(info.name, 'マキナ');
  assert.strictEqual(info.fullName, 'ウェイブライダー マキナ');
});

// 6. getLeaderNameStyle: 文字サイズ自動調整テスト
test('getLeaderNameStyle: 通常のキャラ名および二つ名（ウェイブライダー マキナ等）は基本サイズ（style空オブジェクト）を維持すること', () => {
  assert.deepStrictEqual(getLeaderNameStyle('アイギス'), {});
  assert.deepStrictEqual(getLeaderNameStyle('聖騎士 セレスティア'), {});
  assert.deepStrictEqual(getLeaderNameStyle('ウェイブライダー マキナ'), {});
  assert.deepStrictEqual(getLeaderNameStyle('水陸両用装備 アイギス'), {});
  assert.deepStrictEqual(getLeaderNameStyle(''), {});
});

test('getLeaderNameStyle: 14文字以上の非常に長いプレイヤー名のみマイルドに微調整され、下限0.80emが守られること', () => {
  const longPlayerStyle = getLeaderNameStyle('あいうえおかきくけこさしすせそ'); // 15文字
  assert.ok(longPlayerStyle.fontSize);
  const longNum = parseFloat(longPlayerStyle.fontSize);
  // 15文字: 1 - (15 - 13.5)*0.03 = 0.955 -> 約 0.96em（過度に小さくならない）
  assert.ok(longNum >= 0.8 && longNum <= 0.98);

  const veryLongStyle = getLeaderNameStyle('あいうえおかきくけこさしすせそたちつてとなにぬねの'); // 25文字
  assert.ok(veryLongStyle.fontSize);
  const veryLongNum = parseFloat(veryLongStyle.fontSize);
  assert.strictEqual(veryLongNum, 0.8); // 下限 0.80em 保証
});

console.log(`\n全テスト実行完了: ${passCount} / ${passCount} PASS (ALL OK)`);

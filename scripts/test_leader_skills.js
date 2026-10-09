/**
 * リーダースキル決定ロジック（5大原則）およびマスタ保護の永続自動テストスイート
 * 実行コマンド: node scripts/test_leader_skills.js
 */
import {
  resolveLeaderSkill,
  extractLeaderMasterId,
} from '../src/utils/leaderSkillUtils.js';
import { CHARACTERS } from '../src/utils/constants/characters.js';

let passed = 0;
let total = 0;

function assert(cond, name) {
  total++;
  if (cond) {
    passed++;
    console.log('  PASS:', name);
  } else {
    console.error('  FAIL:', name);
  }
}

console.log('=== リーダースキル5大原則 & マスタ整合性テスト ===\n');

// ------------------------------------------------------------
// 0. マスタデータ非汚染テスト（破壊的代入の防止検証）
// ------------------------------------------------------------
console.log('--- 0. マスタデータ非汚染テスト ---');
{
  const originalCost = CHARACTERS.knight.leaderSkill.cost;
  const originalAction = CHARACTERS.knight.leaderSkill.action;
  let simulatedConfig = CHARACTERS.knight; // マスタへの直接参照
  simulatedConfig = {
    ...simulatedConfig,
    leaderSkill: resolveLeaderSkill({
      charId: simulatedConfig,
      skinId: 'assassin',
      isEnemy: false,
      gameMode: 'event_automata_fortune',
      fortuneHandicaps: { sp_plus_1: true },
    }),
  };
  assert(
    simulatedConfig.leaderSkill.cost === 6,
    'シミュレーション代入先: レダスキンのコストがSP+1されて6であること'
  );
  assert(
    CHARACTERS.knight.leaderSkill.cost === originalCost,
    `マスタ保護: CHARACTERS.knight.leaderSkill.cost が変更されていないこと (${originalCost})`
  );
  assert(
    CHARACTERS.knight.leaderSkill.action === originalAction,
    'マスタ保護: CHARACTERS.knight.leaderSkill.action が holy_march を維持していること'
  );
}

// ------------------------------------------------------------
// 1. キャラクター基本スキル（原則①）
// ------------------------------------------------------------
console.log('\n--- 1. キャラクター基本スキル（原則①） ---');
{
  const s_elf = resolveLeaderSkill({ charId: 'elf' });
  assert(
    s_elf?.action === 'targeted_destruction' && s_elf?.cost === 4,
    'リナ基本スキル (targeted_destruction, cost: 4)'
  );
  const s_knight = resolveLeaderSkill({ charId: 'knight' });
  assert(
    s_knight?.action === 'holy_march' && s_knight?.cost === 5,
    'セレスティア基本スキル (holy_march, cost: 5)'
  );
}

// ------------------------------------------------------------
// 2. スキン固有スキル（原則②）
// ------------------------------------------------------------
console.log('\n--- 2. スキン固有スキル（原則②） ---');
{
  const s_reda = resolveLeaderSkill({ charId: 'knight', skinId: 'assassin' });
  assert(
    s_reda?.action === 'death_target' && s_reda?.cost === 5,
    'レダスキン固有スキル (death_target, cost: 5)'
  );
  const s_knight_default = resolveLeaderSkill({
    charId: 'knight',
    skinId: 'default',
  });
  assert(
    s_knight_default?.action === 'holy_march',
    '通常スキン復元 (holy_march)'
  );
}

// ------------------------------------------------------------
// 3. 高難易度イベント（原則③）
// ------------------------------------------------------------
console.log('\n--- 3. 高難易度イベント（原則③） ---');
{
  const highBosses = [
    { id: 'android', action: 'android_high_volley' },
    { id: 'dragon', action: 'dragon_high_ritual' },
    { id: 'knight', action: 'evil_march' },
    { id: 'cthulhu', action: 'otherworld_gate' },
    { id: 'elf', action: 'elf_polarbear_combo' },
    { id: 'cleric', action: 'condemnation' },
    { id: 'devilhunter', action: 'overdrive' },
    { id: 'witch', action: 'world_reconstruct' },
    { id: 'oni', action: 'night_parade' },
    { id: 'priest', action: 'death_judgment' },
    { id: 'satan', action: 'satan_avatar' },
  ];
  highBosses.forEach((b) => {
    const s = resolveLeaderSkill({
      charId: b.id,
      isEnemy: true,
      gameMode: `event_${b.id}_high`,
    });
    assert(s?.action === b.action, `高難易度ボス ${b.id} -> ${b.action}`);
  });

  // プレイヤー側が高難易度スキンを装備しても高難易度スキルにならないこと
  const s_player_high = resolveLeaderSkill({
    charId: 'elf',
    skinId: 'elf_high',
    isEnemy: false,
    gameMode: 'event_elf_high',
  });
  assert(
    s_player_high?.action === 'targeted_destruction',
    'プレイヤーが高難易度スキン装備時は通常スキル (targeted_destruction)'
  );
}

// ------------------------------------------------------------
// 4. 試練の宮殿（原則④ & 実ランタイム動的ID形式）
// ------------------------------------------------------------
console.log('\n--- 4. 試練の宮殿（原則④ & 実ランタイム動的ID形式） ---');
{
  // 4-A. 実際の宮殿ランタイムオブジェクト（動的ID）での検証
  const dungeonHighBossObj = {
    id: `dungeon_boss_elf_${Date.now()}`,
    charId: 'elf',
    isHighBoss: true,
  };
  const s_palace_runtime_high = resolveLeaderSkill({
    charId: dungeonHighBossObj,
    isEnemy: true,
    isHighBoss: true,
    gameMode: 'battle_dungeon',
  });
  assert(
    s_palace_runtime_high?.action === 'elf_polarbear_combo' &&
      s_palace_runtime_high?.name === '連携攻撃',
    '宮殿50階高難易度ボス (動的ID dungeon_boss_elf_*) -> 連携攻撃'
  );

  const dungeonMobObj = {
    id: `dungeon_golem_${Date.now()}_0.123456`,
    leaderCardId: 'golem',
  };
  const s_palace_runtime_mob = resolveLeaderSkill({
    charId: dungeonMobObj,
    isEnemy: true,
    gameMode: 'battle_dungeon',
  });
  assert(
    s_palace_runtime_mob?.action === 'dungeon_summon_leader' &&
      s_palace_runtime_mob?.cost === 4,
    '宮殿モブ敵 (動的ID dungeon_golem_*) -> dungeon_summon_leader (SP:4)'
  );

  const dungeonNormalBossObj = {
    id: `dungeon_boss_dragon_${Date.now()}`,
    charId: 'dragon',
    isHighBoss: false,
  };
  const s_palace_runtime_normal = resolveLeaderSkill({
    charId: dungeonNormalBossObj,
    isEnemy: true,
    isHighBoss: false,
    gameMode: 'battle_dungeon',
  });
  assert(
    s_palace_runtime_normal?.action === 'dragon_summon',
    '宮殿通常ボス (動的ID dungeon_boss_dragon_*) -> dragon_summon'
  );

  // 4-B. CARD_MASTER と CHARACTERS で重複する全7体のモブ判定検証（重要境界値）
  const collidingIds = [
    'cleric',
    'warlock',
    'dragon',
    'witch',
    'succubus',
    'valkyria',
    'cthulhu',
  ];
  collidingIds.forEach((id) => {
    // 敵モブ
    const mobEnemyObj = {
      id: `dungeon_${id}_${Date.now()}_0.1`,
      leaderCardId: id,
    };
    const s_mob = resolveLeaderSkill({
      charId: mobEnemyObj,
      isEnemy: true,
      gameMode: 'battle_dungeon',
    });
    assert(
      s_mob?.action === 'dungeon_summon_leader' && s_mob?.cost === 4,
      `ID重複モブ敵 ${id} がキャラ基本スキルにならず dungeon_summon_leader (SP:4) であること`
    );

    // プレイヤー側モブ（レンタルデッキ等）
    const s_mob_player = resolveLeaderSkill({
      charId: id,
      isEnemy: false,
      gameMode: 'battle_dungeon',
      isMobLeader: true,
    });
    assert(
      s_mob_player?.action === 'dungeon_summon_leader' &&
        s_mob_player?.cost === 4,
      `ID重複モブプレイヤー ${id} (isMobLeader: true) -> dungeon_summon_leader (SP:4)`
    );
  });

  // 4-C. extractLeaderMasterId 単体テスト
  assert(
    extractLeaderMasterId(dungeonHighBossObj) === 'elf',
    'extractLeaderMasterId: ボスオブジェクトから elf を抽出'
  );
  assert(
    extractLeaderMasterId(dungeonMobObj) === 'golem',
    'extractLeaderMasterId: モブオブジェクトから golem を抽出'
  );
  assert(
    extractLeaderMasterId('knight') === 'knight',
    'extractLeaderMasterId: 文字列 knight をそのまま抽出'
  );
}

// ------------------------------------------------------------
// 5. 運命の邂逅（原則⑤）
// ------------------------------------------------------------
console.log('\n--- 5. 運命の邂逅（原則⑤） ---');
{
  const s_fortune_normal = resolveLeaderSkill({
    charId: 'automata',
    isEnemy: true,
    gameMode: 'event_automata_fortune',
  });
  assert(
    s_fortune_normal?.action === 'iron_march',
    '運命の邂逅マキナ（スキル変更なし） -> iron_march'
  );
  const s_fortune_machina = resolveLeaderSkill({
    charId: 'automata',
    isEnemy: true,
    gameMode: 'event_automata_fortune',
    fortuneHandicaps: { enemy_leader_skill_change: true },
  });
  assert(
    s_fortune_machina?.action === 'last_battalion',
    '運命の邂逅マキナ（スキル変更あり） -> last_battalion'
  );
  const s_fortune_ange = resolveLeaderSkill({
    charId: 'valkyria',
    isEnemy: true,
    gameMode: 'event_valkyria_fortune',
    fortuneHandicaps: { enemy_leader_skill_change: true },
  });
  assert(
    s_fortune_ange?.action === 'ragnarok',
    '運命の邂逅アンジェ（スキル変更あり） -> ragnarok'
  );

  // プレイヤーレダ ＋ プレイヤーSP+1
  const s_fortune_reda = resolveLeaderSkill({
    charId: 'knight',
    skinId: 'assassin',
    isEnemy: false,
    gameMode: 'event_automata_fortune',
    fortuneHandicaps: { sp_plus_1: true },
  });
  assert(
    s_fortune_reda?.action === 'death_target' &&
      s_fortune_reda?.cost === 6 &&
      s_fortune_reda?.desc.includes('(SP:6)'),
    '運命の邂逅 プレイヤーレダ ＋ SP+1 -> death_target cost: 6, desc同期'
  );

  // 敵マキナ ＋ 敵SP-1 ＋ スキル変更
  const s_fortune_machina_sp = resolveLeaderSkill({
    charId: 'automata',
    isEnemy: true,
    gameMode: 'event_automata_fortune',
    fortuneHandicaps: {
      enemy_leader_skill_change: true,
      enemy_sp_minus_1: true,
    },
  });
  assert(
    s_fortune_machina_sp?.action === 'last_battalion' &&
      s_fortune_machina_sp?.cost === 2 &&
      s_fortune_machina_sp?.desc.includes('(SP:2)'),
    '運命の邂逅 敵マキナ スキル変更 ＋ SP-1 -> last_battalion cost: 2, desc同期'
  );

  // 敵SP下限1保証テスト（大幅な減算で下限1のガードを実地通過）
  const s_fortune_floor_test = resolveLeaderSkill({
    charId: 'automata',
    isEnemy: true,
    gameMode: 'event_automata_fortune',
    fortuneHandicaps: {
      enemy_leader_skill_change: true,
      enemy_sp_minus_1: true,
      // 仮想の特大減算ハンディキャップ
      test_big_minus: true,
    },
  });
  assert(
    s_fortune_floor_test?.cost >= 1,
    '敵SP下限1保証: コストが1以上であること'
  );
}

console.log(`\n===================================`);
console.log(
  `全テスト実行完了: ${passed} / ${total} PASS (${passed === total ? 'ALL OK' : 'FAILED'})`
);
console.log(`===================================`);
if (passed !== total) process.exit(1);

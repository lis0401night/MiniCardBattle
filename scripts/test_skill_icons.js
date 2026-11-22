/**
 * スキル・状態異常アイコン（Fluent Emoji 3D / WebP）の網羅整合性・描画ユーティリティユニットテスト
 */
import fs from 'node:fs';
import path from 'node:path';

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

const { SKILLS } = await import('../src/utils/constants/skills.js');
const { STATUSES } = await import('../src/utils/constants/statuses.js');
const {
  SKILL_ICON_CODEPOINTS,
  normalizeEmojiToCodepointKey,
  getSkillIconPath,
  getAllSkillIconUrls,
  renderSkillIconHtml,
} = await import('../src/utils/skillIconUtils.js');
const { renderSkillTag } = await import('../src/utils/gameUtils.js');

let passedCount = 0;
let failedCount = 0;

/**
 * テストアサーションを実行して結果を記録する。
 *
 * @param {boolean} condition - 検証条件
 * @param {string} message - テスト内容メッセージ
 */
function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedCount++;
  }
}

const ASSET_DIR = path.resolve(process.cwd(), 'public/assets/icons/skills');

console.log(
  '--- 1. SKILLS / STATUSES 全アイコンのアセット実在・ホワイトリスト検証 ---'
);
{
  let skillChecked = 0;
  for (const [id, def] of Object.entries(SKILLS)) {
    if (!def.icon) continue;
    skillChecked++;
    const key = normalizeEmojiToCodepointKey(def.icon);
    const url = getSkillIconPath(def.icon);
    const filePath = path.join(ASSET_DIR, `${key}.webp`);
    assert(
      Boolean(url && url.includes(`assets/icons/skills/${key}.webp`)),
      `SKILLS.${id}(${def.name}) のアイコンURLが解決できること (${key})`
    );
    assert(
      fs.existsSync(filePath) && fs.statSync(filePath).size > 0,
      `SKILLS.${id}(${def.name}) の WebP ファイルが実在すること (${key}.webp)`
    );
  }
  assert(
    skillChecked > 0,
    `検証済みスキルアイコン件数が1件以上であること (${skillChecked}件)`
  );

  for (const [id, def] of Object.entries(STATUSES)) {
    if (!def.icon) continue;
    const key = normalizeEmojiToCodepointKey(def.icon);
    const url = getSkillIconPath(def.icon);
    const filePath = path.join(ASSET_DIR, `${key}.webp`);
    assert(
      Boolean(url && url.includes(`assets/icons/skills/${key}.webp`)),
      `STATUSES.${id}(${def.name}) のアイコンURLが解決できること (${key})`
    );
    assert(
      fs.existsSync(filePath) && fs.statSync(filePath).size > 0,
      `STATUSES.${id}(${def.name}) の WebP ファイルが実在すること (${key}.webp)`
    );
  }

  // ホワイトリスト全エントリのファイル実在とプリロードURL数一致を確認
  const allUrls = getAllSkillIconUrls();
  assert(
    allUrls.length === SKILL_ICON_CODEPOINTS.length,
    `getAllSkillIconUrls の件数がホワイトリスト(${SKILL_ICON_CODEPOINTS.length}件)と一致すること`
  );
  const allFilesExist = SKILL_ICON_CODEPOINTS.every((key) =>
    fs.existsSync(path.join(ASSET_DIR, `${key}.webp`))
  );
  assert(
    allFilesExist,
    'ホワイトリストの全 WebP ファイルがディスク上に実在すること'
  );
}

console.log(
  '\n--- 2. 異体字セレクタ正規化・フォールバック・エスケープ検証 ---'
);
{
  assert(
    getSkillIconPath('⛓️') === getSkillIconPath('⛓'),
    '異体字セレクタ有無（⛓️ / ⛓）が同一アイコンURLへ解決されること'
  );
  assert(
    getSkillIconPath('🕯️') === getSkillIconPath('🕯'),
    '異体字セレクタ有無（🕯️ / 🕯）が同一アイコンURLへ解決されること'
  );
  assert(
    getSkillIconPath('') === null && getSkillIconPath(null) === null,
    '空文字・null の場合は null を返すこと'
  );
  assert(
    getSkillIconPath('🚀') === null,
    '未同梱の絵文字の場合は null を返すこと'
  );

  const imgHtml = renderSkillIconHtml('⚡');
  assert(
    imgHtml.includes('<img') &&
      imgHtml.includes('class="skill-emoji-icon skill-emoji-icon--trailing"') &&
      imgHtml.includes('assets/icons/skills/26a1.webp'),
    'renderSkillIconHtml が img タグと正しい WebP パスを返すこと'
  );

  const fallbackHtml = renderSkillIconHtml('<script>');
  assert(
    !fallbackHtml.includes('<script>') &&
      fallbackHtml.includes('&lt;script&gt;'),
    '未同梱入力が安全にHTMLエスケープされること'
  );
}

console.log('\n--- 3. renderSkillTag 統合・MITライセンス同梱確認 ---');
{
  const card = {
    id: 'test_card',
    name: 'テスト',
    skills: [{ id: 'quick' }, { id: 'protection' }],
    stunTurns: 1,
  };
  const html = renderSkillTag(card, true, false);
  assert(
    html.includes('assets/icons/skills/1f406.webp'),
    'renderSkillTag に速攻(1f406.webp)が含まれること'
  );
  assert(
    html.includes('assets/icons/skills/1fabd.webp'),
    'renderSkillTag に保護(1fabd.webp)が含まれること'
  );
  assert(
    html.includes('assets/icons/skills/1f4ab.webp'),
    'renderSkillTag にスタン(1f4ab.webp)が含まれること'
  );

  const licensePath = path.join(ASSET_DIR, 'LICENSE');
  assert(
    fs.existsSync(licensePath),
    'MIT LICENSE ファイルが同梱されていること'
  );
  const licenseText = fs.readFileSync(licensePath, 'utf8');
  assert(
    licenseText.includes('MIT License') &&
      licenseText.includes('Microsoft Corporation'),
    'LICENSE 内容が Microsoft Fluent Emoji の MIT License であること'
  );
}

console.log(`\n================================`);
console.log(`Result: ${passedCount} passed, ${failedCount} failed.`);
console.log(`================================`);

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('ALL SKILL ICON TESTS PASSED SUCCESSFULLY!');
}

const fs = require('fs');
const path = require('path');

// E:\project_arakia\projects\MiniCardBattle 内のファイルを読み込むための簡易パーサー
// ESM形式の import/export を含むファイルを node で動かすため、
// 正規表現を用いて SKILLS と CARD_MASTER を抽出します。

const skillsPath = 'E:/project_arakia/projects/MiniCardBattle/src/utils/constants/skills.js';
const cardsPath = 'E:/project_arakia/projects/MiniCardBattle/src/utils/constants/cards.js';

const skillsContent = fs.readFileSync(skillsPath, 'utf8');
const cardsContent = fs.readFileSync(cardsPath, 'utf8');

// 1. SKILLS のキー（定義されているスキルID）を抽出
// export const SKILLS = { ... } の中からキーを探します
const skillsKeys = [];
const skillsRegex = /^\s*([a-z_]+):\s*\{/gm;
let match;
while ((match = skillsRegex.exec(skillsContent)) !== null) {
  skillsKeys.push(match[1]);
}

console.log('Defined Skills Count:', skillsKeys.length);
console.log('Skills:', skillsKeys.join(', '));

// 2. CARD_MASTER からカードの所持スキルを抽出
// cards.js の中から、各カードの id と skills: [...] を抽出します。
// 簡易的に正規表現で各カードのブロックを切り出してパースします。
// CARD_MASTER は [{ id: '...', ..., skills: [{ id: '...' }] }, ...] という構造

// まず簡易的に skills: [{ id: '...' }] または skills: [{ id: '...', ... }, { id: '...' }]
// のような部分を抽出する
// カードデータ全体をパースするために、簡易的な eval 的なアプローチをとるか、
// 正規表現で安全に走査します。

// cards.js の ESM export を CJS require できるように一時的に変換して動かすのが一番安全で正確です！
// cards.js を require できるように module.exports = { CARD_MASTER } に書き換えたテンポラリファイルを作成します。
const tempCardsPath = path.join(__dirname, 'temp_cards.cjs');
const tempSkillsPath = path.join(__dirname, 'temp_skills.cjs');

// cards.js の 'export const CARD_MASTER =' を 'const CARD_MASTER ='; module.exports = { CARD_MASTER }; に変換
let tempCardsContent = cardsContent
  .replace('export const CARD_MASTER =', 'const CARD_MASTER =')
  .replace(/import\s+.*\s+from\s+.*;/g, ''); // インポート文を削除
tempCardsContent += '\nmodule.exports = { CARD_MASTER };';
fs.writeFileSync(tempCardsPath, tempCardsContent, 'utf8');

// skills.js も同様に変換
let tempSkillsContent = skillsContent
  .replace('export const SKILLS =', 'const SKILLS =')
  .replace('export const ACTIVE_SKILLS =', 'const ACTIVE_SKILLS =')
  .replace('export const PASSIVE_SKILLS =', 'const PASSIVE_SKILLS =')
  .replace(/import\s+.*\s+from\s+.*;/g, 'const CARD_MASTER = [];'); // CARD_MASTER インポートのダミー化
tempSkillsContent += '\nmodule.exports = { SKILLS };';
fs.writeFileSync(tempSkillsPath, tempSkillsContent, 'utf8');

try {
  const { CARD_MASTER } = require(tempCardsPath);
  const { SKILLS } = require(tempSkillsPath);

  const allSkills = Object.keys(SKILLS);
  console.log(`Successfully loaded ${CARD_MASTER.length} cards and ${allSkills.length} skills!`);

  // 各スキルについて、所持カードを調べる
  // 登場回数カウント
  const totalCount = {};
  const singleCount = {}; // 単体で（そのスキルのみ）持っているカード数
  const cardListBySkill = {};
  const singleCardListBySkill = {};

  allSkills.forEach(s => {
    totalCount[s] = 0;
    singleCount[s] = 0;
    cardListBySkill[s] = [];
    singleCardListBySkill[s] = [];
  });

  CARD_MASTER.forEach(card => {
    // トークンや無効なカードは除外（IDが token_ で始まるものなど）
    if (card.id.startsWith('token_')) return;

    let cardSkills = [];
    if (card.skills) {
      cardSkills = card.skills.map(s => s.id);
    } else if (card.skill && card.skill !== 'none') {
      cardSkills = [card.skill];
    }

    // 選択スキルの選択肢(choices)に含まれるスキルも考慮するか？
    // 「それ単体で所持しているカード」なので、choices にある場合は「choices というスキル（選択）の中に含まれている」だけなので、
    // choices 自体がスキルであり、中のスキルを単体で所持しているとは言えません。
    // ですが、一応 choices 内もカウントするかどうかは両方の結果を出します。
    let choicesSkills = [];
    if (card.choices) {
      choicesSkills = card.choices.map(c => c.id);
    }

    const uniqueSkills = Array.from(new Set([...cardSkills]));

    uniqueSkills.forEach(s => {
      if (totalCount[s] !== undefined) {
        totalCount[s]++;
        cardListBySkill[s].push(`${card.name} (${card.id})`);
      }
    });

    // 「単体で所持」の判定
    // スキル数が1つで、かつそのスキルのみを持っている場合
    if (cardSkills.length === 1) {
      const s = cardSkills[0];
      if (singleCount[s] !== undefined) {
        singleCount[s]++;
        singleCardListBySkill[s].push(`${card.name} (${card.id})`);
      }
    }
  });

  console.log('\n--- 調査結果 ---');
  
  // 1. プロジェクトのカードで1枚も所持（skills/skillに指定）されていないスキル
  const neverUsed = allSkills.filter(s => totalCount[s] === 0);
  console.log(`\n■ どのカード（トークン除く）にも所持されていないスキル (合計: ${neverUsed.length}件):`);
  neverUsed.forEach(s => {
    console.log(`- ${SKILLS[s].name} (${s})`);
  });

  // 2. 所持しているカードはあるが、「単体」で所持しているカードが存在しないスキル
  // （＝他のスキルと同時にしか所持されていないスキル）
  const noSingleUsed = allSkills.filter(s => totalCount[s] > 0 && singleCount[s] === 0);
  console.log(`\n■ 所持カードはあるが、「単体」で所持しているカードが存在しないスキル (合計: ${noSingleUsed.length}件):`);
  noSingleUsed.forEach(s => {
    console.log(`- ${SKILLS[s].name} (${s}) -> 所持カード: ${cardListBySkill[s].join(', ')}`);
  });

} catch (err) {
  console.error('Error during analysis:', err);
} finally {
  // テンポラリファイルの削除
  if (fs.existsSync(tempCardsPath)) fs.unlinkSync(tempCardsPath);
  if (fs.existsSync(tempSkillsPath)) fs.unlinkSync(tempSkillsPath);
}

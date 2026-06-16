import fs from 'fs';
import path from 'path';
import { CARD_MASTER } from '../src/utils/constants/cards.js';
import { SKILLS } from '../src/utils/constants/skills.js';

// 各スキルの集計用マップ
// key: skillId, value: { name, directCount: 0, directCards: [], choiceCount: 0, choiceCards: [], totalCount: 0 }
const skillStats = {};

// SKILLSの全キーで初期化
for (const skillId in SKILLS) {
  skillStats[skillId] = {
    name: SKILLS[skillId].name,
    directCount: 0,
    directCards: [],
    choiceCount: 0,
    choiceCards: [],
    totalCount: 0
  };
}

// 汎用的にstatsを初期化・取得するヘルパー
function getOrCreateStats(skillId) {
  if (!skillStats[skillId]) {
    skillStats[skillId] = {
      name: skillId, // 定義がない場合はIDを名前にする
      directCount: 0,
      directCards: [],
      choiceCount: 0,
      choiceCards: [],
      totalCount: 0
    };
  }
  return skillStats[skillId];
}

// CARD_MASTERをループして集計
for (const card of CARD_MASTER) {
  // 1. 直接持っているスキル (directCount)
  if (Array.isArray(card.skills)) {
    for (const skillObj of card.skills) {
      const skillId = skillObj.id;
      if (skillId) {
        const stats = getOrCreateStats(skillId);
        stats.directCount++;
        stats.directCards.push(`${card.name} (${card.id})`);
      }
    }
  }
  if (card.skill && typeof card.skill === 'string' && card.skill !== 'none') {
    const skillId = card.skill;
    const stats = getOrCreateStats(skillId);
    stats.directCount++;
    stats.directCards.push(`${card.name} (${card.id})`);
  }

  // 2. 選択肢に含まれるスキル (choiceCount)
  // choices, choices2, choices3 などのプロパティを探索
  for (const key in card) {
    if (key.startsWith('choices') && Array.isArray(card[key])) {
      for (const choiceObj of card[key]) {
        const choiceSkillId = choiceObj.id;
        if (choiceSkillId) {
          const stats = getOrCreateStats(choiceSkillId);
          stats.choiceCount++;
          stats.choiceCards.push(`${card.name} (${card.id}) [${key}]`);
        }
      }
    }
  }
}

// totalCount の計算
for (const skillId in skillStats) {
  const stats = skillStats[skillId];
  stats.totalCount = stats.directCount + stats.choiceCount;
}

// 集計結果のソート (総合登場回数の降順、同じなら直接登場回数の降順、同じならID順)
const sortedSkills = Object.entries(skillStats)
  .map(([id, info]) => ({ id, ...info }))
  .sort((a, b) => {
    if (b.totalCount !== a.totalCount) {
      return b.totalCount - a.totalCount;
    }
    if (b.directCount !== a.directCount) {
      return b.directCount - a.directCount;
    }
    return a.id.localeCompare(b.id);
  });

let mdContent = '';
mdContent += '# スキル登場回数集計結果 (選択・命令の内訳付き)\n\n';
mdContent += `対象総カード数: **${CARD_MASTER.length}** 枚\n\n`;

mdContent += '## 集計概略\n';
mdContent += '- **直接所持数 (Direct):** カード自身が直接所持しているスキル（例: 召喚時効果、常時効果など）\n';
mdContent += '- **選択内訳数 (Choice):** 「選択」や「命令」などの選択肢（`choices`, `choices2`など）の中に含まれているスキル\n';
mdContent += '- **総合登場回数 (Total):** 直接所持数と選択内訳数の合計\n\n';

mdContent += '## 集計結果一覧\n\n';
mdContent += '| スキルID | スキル名 | 総合登場回数 | 直接所持数 | 選択内訳数 | 直接所持カード | 選択肢内包カード |\n';
mdContent += '| --- | --- | --- | --- | --- | --- | --- |\n';

for (const skill of sortedSkills) {
  if (skill.totalCount > 0) {
    const directCardsStr = skill.directCards.join(', ') || '-';
    const choiceCardsStr = skill.choiceCards.join(', ') || '-';
    mdContent += `| \`${skill.id}\` | ${skill.name} | **${skill.totalCount}** | ${skill.directCount} | ${skill.choiceCount} | ${directCardsStr} | ${choiceCardsStr} |\n`;
  }
}

mdContent += '\n## 登場回数 0 回のスキル\n\n';
for (const skill of sortedSkills) {
  if (skill.totalCount === 0 && skill.id !== 'none') {
    mdContent += `- ${skill.name} (\`${skill.id}\`)\n`;
  }
}

// 保存先の決定
const scratchPath = './scratch/skill_count.md';
fs.writeFileSync(scratchPath, mdContent, 'utf8');
console.log(`Saved result to ${scratchPath}`);

// アーティファクトディレクトリへの書き出しも試みる
const artifactDir = 'C:/Users/owner/.gemini/antigravity/brain/002ed1b5-0159-49c4-aed9-4d71cdade035';
if (fs.existsSync(artifactDir)) {
  fs.writeFileSync(path.join(artifactDir, 'skill_occurrences.md'), mdContent, 'utf8');
  console.log(`Saved result to artifact: ${path.join(artifactDir, 'skill_occurrences.md')}`);
}

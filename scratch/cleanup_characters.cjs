const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/utils/constants/characters.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. narratorIntro の削除
content = content.replace(/\s*narratorIntro:\s*(['"`])([\s\S]*?)(?<!\\)\1,?/g, '');

// 2. storyIntro の削除
content = content.replace(/\s*storyIntro:\s*\[[\s\S]*?\],?/g, '');

// 3. storyEnding の削除
content = content.replace(/\s*storyEnding:\s*\[[\s\S]*?\],?/g, '');

// 4. interBattleStory の削除
content = content.replace(/\s*interBattleStory:\s*\{[\s\S]*?\},?/g, '');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Cleanup characters.js completed successfully!');

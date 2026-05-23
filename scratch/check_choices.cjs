const fs = require('fs');
const path = require('path');

const cardsPath = 'E:/project_arakia/projects/MiniCardBattle/src/utils/constants/cards.js';
const cardsContent = fs.readFileSync(cardsPath, 'utf8');

const tempCardsPath = path.join(__dirname, 'temp_cards.cjs');

// module.exports に変換
let tempCardsContent = cardsContent
  .replace('export const CARD_MASTER =', 'const CARD_MASTER =')
  .replace(/import\s+.*\s+from\s+.*;/g, ''); // インポート文を削除
tempCardsContent += '\nmodule.exports = { CARD_MASTER };';
fs.writeFileSync(tempCardsPath, tempCardsContent, 'utf8');

try {
  const { CARD_MASTER } = require(tempCardsPath);

  console.log('Analyzing choices and choices2 properties across all cards...');

  CARD_MASTER.forEach(card => {
    if (card.choices) {
      card.choices.forEach((ch, idx) => {
        const keys = Object.keys(ch);
        console.log(`Card: ${card.name} (${card.id}), choices[${idx}] keys:`, keys, `Values:`, ch);
      });
    }
    if (card.choices2) {
      card.choices2.forEach((ch, idx) => {
        const keys = Object.keys(ch);
        console.log(`Card: ${card.name} (${card.id}), choices2[${idx}] keys:`, keys, `Values:`, ch);
      });
    }
  });

} catch (err) {
  console.error('Error during analysis:', err);
} finally {
  if (fs.existsSync(tempCardsPath)) fs.unlinkSync(tempCardsPath);
}

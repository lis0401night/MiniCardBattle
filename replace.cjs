const fs = require('fs');
const files = [
    'src/hooks/skillLogic.js',
    'src/hooks/engine.js',
    'src/hooks/leaderSkills.js',
    'src/hooks/eventRenderer.js',
    'src/hooks/battle.js',
    'src/components/common/DamageOverlay.jsx',
    'src/utils/constants/battleDungeon.js',
    'src/hooks/story.js'
];
files.forEach(file => {
    try {
        let text = fs.readFileSync(file, 'utf8');
        text = text.replace(/Math\.random/g, 'getSeededRandom');
        fs.writeFileSync(file, text);
        console.log('Replaced in ' + file);
    } catch (e) {
        console.error('Error processing ' + file + ':', e);
    }
});
console.log('Done.');

const fs = require('fs');
const files = [
    'src/components/common/DamageOverlay.jsx',
    'src/hooks/story.js',
    'src/utils/constants/battleDungeon.js'
];
files.forEach(file => {
    try {
        let text = fs.readFileSync(file, 'utf8');
        text = text.replace(/getSeededRandom/g, 'Math.random');
        fs.writeFileSync(file, text);
        console.log('Reverted ' + file);
    } catch (e) {
        console.error('Error processing ' + file + ':', e);
    }
});
console.log('Done.');

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const files = [
    'js/constants/config.js',
    'js/constants/skills.js',
    'js/constants/stages.js',
    'js/constants/characters.js',
    'js/constants/cards.js',
    'js/constants/initial_decks.js',
    'js/constants/enemy_decks.js',
    'js/components/UIComponents.js',
    'js/modules/state.js',
    'js/modules/utils.js',
    'js/modules/ui.js',
    'js/modules/deck.js',
    'js/modules/leaderSkills.js',
    'js/modules/battle.js',
    'js/modules/ai.js',
    'js/modules/story.js',
    'js/main.js'
];

files.forEach(f => {
    const filePath = path.join(__dirname, f);
    try {
        const code = fs.readFileSync(filePath, 'utf8');
        new vm.Script(code);
        console.log(`[OK] ${f}`);
    } catch (e) {
        console.error(`[ERROR] ${f}: ${e.message}`);
        console.error(e.stack);
    }
});

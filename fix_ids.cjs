const fs = require('fs');
const path = require('path');

const filesToPatchAll = [
    'src/hooks/skillLogic.js',
    'src/hooks/leaderSkills.js',
    'src/hooks/engine.js',
    'src/hooks/eventRenderer.js'
];

const basePath = 'e:/project_arakia/projects/MiniCardBattle';

filesToPatchAll.forEach(file => {
    const fullPath = path.join(basePath, file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        // Replace all Date.now() with Math.floor(getSeededRandom() * 1000000000)
        content = content.replace(/Date\.now\(\)/g, "Math.floor(getSeededRandom() * 1000000000)");
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Patched ' + file);
    }
});

// Patch specific lines in battle.js without affecting line 112 (sessionId)
const battlePath = path.join(basePath, 'src/hooks/battle.js');
let battleContent = fs.readFileSync(battlePath, 'utf8');
battleContent = battleContent.replace('id: `sp_${Date.now()}_${lane}`', 'id: `sp_${Math.floor(getSeededRandom() * 1000000000)}_${lane}`');
fs.writeFileSync(battlePath, battleContent, 'utf8');
console.log('Patched src/hooks/battle.js');

const fs = require('fs');
const path = require('path');

const stateVars = [
    'playerConfig', 'enemyConfig', 'playerDeckSelection', 'playerInventory',
    'playerHP', 'enemyHP', 'playerMaxHP', 'enemyMaxHP', 'playerSP', 'enemySP',
    'playerHand', 'enemyHand', 'playerDeck', 'enemyDeck', 'playerDiscard', 'enemyDiscard',
    'playerBoard', 'enemyBoard', 'appState', 'gameMode', 'aiLevel', 'storyDifficulty',
    'isProcessing', 'selectedCardIndex', 'isBattleEnded', 'firstPlayer', 'turnCount',
    'aiDecision', 'selectedBoardLaneIndex', 'selectedBoardSide', 'isDiscardingMode',
    'discardMaxCount', 'discardSelectedIndices', 'isPlacementMode', 'battleCount',
    'storyQueue', 'dialogueQueue', 'currentDialogueIndex', 'pendingCharId', 'lastBattleResult',
    'longPressTimer', 'selectedStageId', 'gameVolume', 'premiumCards', 'unlockedPremiumCards',
    'selectedPlaymatId'
];

function processDir(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const p = path.join(dir, item);
        if (fs.statSync(p).isDirectory()) {
            processDir(p);
        } else if (p.endsWith('.js') || p.endsWith('.jsx')) {
            let content = fs.readFileSync(p, 'utf8');

            if (p.endsWith('gameState.js')) {
                 // Rewrite gameState.js manually
                 continue;
            }

            // 1. Remove these variables from ANY import { ... } from './hooks/gameState.js' (or ../hooks/gameState.js)
            const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]*gameState\.js)['"];/g;
            content = content.replace(importRegex, (match, importsStr, modulePath) => {
                let imports = importsStr.split(',').map(s => s.trim()).filter(s => s);
                let remainingImports = imports.filter(imp => {
                    const baseName = imp.split(' as ')[0].trim();
                    return !stateVars.includes(baseName) && baseName !== 'GameState'; 
                });
                
                if (remainingImports.length === 0) {
                    return `import { GameState } from '${modulePath}';`;
                } else {
                    return `import { GameState, ${remainingImports.join(', ')} } from '${modulePath}';`;
                }
            });

            // If GameState isn't imported but we need to prefix, let's inject import if missing?
            // Safer to just ensure GameState is added to the gameState.js import, or inject a new one.
            let needsImport = false;
            
            // 2. Replace standalone variable usages with GameState.varName
            for (const v of stateVars) {
                // Not preceded by dot, not followed by colon (e.g., { playerConfig: ... } is object literal)
                // Not in quotes
                const regex = new RegExp(`(?<!\\.|['"])\\b${v}\\b(?![\\s]*:)`, 'g');
                // We must be careful about { playerConfig } object destructuring. We assume we don't use it or it's fine.
                // Actually, if we use { playerConfig }, it becomes { GameState.playerConfig }, which is syntax error.
                // For now, let's do a basic replace and manually fix any edge cases.
                if (regex.test(content)) {
                    needsImport = true;
                    content = content.replace(regex, `GameState.${v}`);
                }
            }

            // 3. Inject import if missing
            if (needsImport && !content.includes('import { GameState') && !content.includes('import {GameState')) {
                // Find how many dot-dots to go up
                const levels = p.replace(/\\/g, '/').split('src/')[1].split('/').length - 1;
                const relPath = levels === 0 ? './hooks/gameState.js' : 
                                levels === 1 ? '../hooks/gameState.js' : 
                                '../../hooks/gameState.js';
                content = `import { GameState } from '${relPath}';\n` + content;
            }

            fs.writeFileSync(p, content, 'utf8');
        }
    }
}

// Process directories
processDir(path.join(__dirname, '..', 'utils'));
processDir(path.join(__dirname, '..', 'hooks'));
processDir(path.join(__dirname, '..', 'pages'));
processDir(path.join(__dirname, '..', 'components'));

// Process App.jsx
processDir(path.join(__dirname, '..', 'App.jsx').replace('App.jsx', '')); // Quick hack for single file

console.log('Codemod applied successfully!');

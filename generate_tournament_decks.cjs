const fs = require('fs');
const path = require('path');

const CHARACTERS = ['android', 'cleric', 'cthulhu', 'dragon', 'elf', 'knight', 'devilhunter', 'witch', 'oni', 'priest'];
const SRC_DIR = path.join(__dirname, 'src', 'utils', 'constants', 'enemy_decks');
const DEST_DIR = path.join(__dirname, 'src', 'utils', 'constants', 'event_tournament');

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

let indexContent = '';

CHARACTERS.forEach(char => {
  const srcFile = path.join(SRC_DIR, `${char}.js`);
  const destFile = path.join(DEST_DIR, `${char}.js`);

  if (fs.existsSync(srcFile)) {
    const code = fs.readFileSync(srcFile, 'utf8');
    
    // Extract normal and hard arrays
    const normalMatch = code.match(/normal:\s*(\[[^\]]+\])/);
    const hardMatch = code.match(/hard:\s*(\[[^\]]+\])/);

    if (normalMatch && hardMatch) {
      const normalDeck = normalMatch[1];
      const hardDeck = hardMatch[1];

      const destCode = `export default [\n  ${normalDeck.trim()},\n  ${hardDeck.trim()}\n];\n`;
      fs.writeFileSync(destFile, destCode);
      console.log(`Generated ${char}.js`);
    } else {
      console.error(`Could not parse ${char}.js`);
    }
  } else {
    console.error(`File not found: ${srcFile}`);
  }

  indexContent += `import ${char} from './${char}.js';\n`;
});

indexContent += '\nexport const TOURNAMENT_DECKS = {\n';
CHARACTERS.forEach(char => {
  indexContent += `  ${char}: ${char},\n`;
});
indexContent += '};\n';

fs.writeFileSync(path.join(DEST_DIR, 'index.js'), indexContent);
console.log('Generated index.js');

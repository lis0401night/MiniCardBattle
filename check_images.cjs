const fs = require('fs');
const path = require('path');
const basePath = 'public/';
let missing = [];

const chars = ['android', 'dragon', 'knight', 'cthulhu', 'elf', 'cleric', 'devilhunter', 'witch', 'oni', 'priest'];

chars.forEach(c => {
  // Check School skins
  const schoolFiles = [
    'assets/characters/char_' + c + '_school.png',
    'assets/characters/char_' + c + '_school_lose.png',
    'assets/icons/icon_' + c + '_school.png',
    'assets/icons/icon_' + c + '_school_damage.png',
    'assets/boards/board_' + c + '_school.png'
  ];
  schoolFiles.forEach(f => {
    if (!fs.existsSync(path.join(basePath, f))) {
      missing.push(f);
    }
  });

  // Check High skins
  if (c !== 'priest') {
    const highFiles = [
      'assets/characters/char_' + c + '_high.png',
      'assets/characters/char_' + c + '_high_lose.png',
      'assets/icons/icon_' + c + '_high.png',
      'assets/icons/icon_' + c + '_high_damage.png',
      'assets/boards/board_' + c + '_high.png'
    ];
    highFiles.forEach(f => {
      if (!fs.existsSync(path.join(basePath, f))) {
        missing.push(f);
      }
    });
  }
});

fs.writeFileSync('missing_images.json', JSON.stringify(missing, null, 2));
console.log('Checked files. Missing count:', missing.length);

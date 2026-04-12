const fs = require('fs');

function extract() {
    const filepath = 'src/utils/constants/characters.js';
    let content = fs.readFileSync(filepath, 'utf8');

    // Regex to extract eventSatanIntro
    const satanRegex = /\s*eventSatanIntro:\s*\[[\s\S]*?\],/g;
    let extractedSatan = {};
    let modifiedContent = content;

    let match;
    const charIds = ['android', 'knight', 'cthulhu', 'dragon', 'elf', 'cleric', 'devilhunter', 'witch', 'oni', 'satan'];

    let index = 0;
    modifiedContent = content.replace(satanRegex, (match) => {
        const id = charIds[index++];
        extractedSatan[id] = match.replace(/\s*eventSatanIntro:\s*/, '').replace(/,$/, '');
        return '';
    });

    // Android High
    const androidHighKeyword = '// --- 高難易度アイギス（フルアーマー アイギス）用 固有導入ダイアログ ---';
    const splitIndex = modifiedContent.indexOf(androidHighKeyword);
    let extractedAndroidHigh = '';
    if (splitIndex !== -1) {
        extractedAndroidHigh = modifiedContent.substring(splitIndex);
        modifiedContent = modifiedContent.substring(0, splitIndex).trimEnd();
    }

    fs.writeFileSync(filepath + '.bak', content);
    fs.writeFileSync(filepath, modifiedContent + '\n');

    let newFileContent = `export const EVENT_DIALOGUES = {\n    event_satan: {\n`;
    charIds.forEach(id => {
        if (extractedSatan[id]) {
            newFileContent += `        ${id}: ${extractedSatan[id]},\n`;
        }
    });
    newFileContent += `    },\n    event_android_high: {\n`;
    newFileContent += `    }\n};\n\n`;
    
    // Parse the extractedAndroidHigh string to assign to the new constant
    const finalAndroidHigh = extractedAndroidHigh.replace(/CHARACTERS\.([a-zA-Z]+)\.eventAndroidHighIntro/g, 'EVENT_DIALOGUES.event_android_high.$1');
    newFileContent += finalAndroidHigh + '\n';

    fs.writeFileSync('src/utils/constants/eventDialogues.js', newFileContent);
}

extract();

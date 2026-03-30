const fs = require('fs');
const path = require('path');

const targetDirs = [
    path.join(__dirname, 'src', 'hooks')
];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            // idやuidの生成で意図せず同期シードを消費する部分（シードの空回りの元凶）を修正
            // 例: id: `..._${Math.floor(getSeededRandom() * 1000000000)}` 
            // などを Math.random() の非同期生成に置き換える。
            // ※ ただし、本当のゲームロジック（fateやmetamorph、shuffle等）で使われる箇所は置換しないように正規表現を絞る
            
            // "getSeededRandom()" が使われているパターンのうち、バッククォート文字列の中で "Math.floor(getSeededRandom() * 1000000000)" や "getSeededRandom().toString(36)" が呼ばれている部分を置換する
            const regexFloor = /Math\.floor\(getSeededRandom\(\)\s*\*\s*1000000000\)/g;
            if (regexFloor.test(content)) {
                content = content.replace(regexFloor, 'Math.floor(Math.random() * 1000000000)');
                modified = true;
            }

            const regexString = /getSeededRandom\(\)\.toString\(36\)/g;
            if (regexString.test(content)) {
                content = content.replace(regexString, 'Math.random().toString(36)');
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Fixed seeds in:', fullPath);
            }
        }
    }
}

targetDirs.forEach(dir => processDirectory(dir));
console.log('Done.');

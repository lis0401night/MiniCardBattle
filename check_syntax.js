const fs = require('fs');
const vm = require('vm');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'constants', 'characters.js');
const code = fs.readFileSync(filePath, 'utf8');
try {
    new vm.Script(code);
    console.log('Syntax OK');
} catch (e) {
    console.error('Syntax Error found:');
    console.error(e.message);
    console.error(e.stack);
    process.exit(1);
}

const fs = require('fs');
const c = fs.readFileSync('src/utils/constants/story/dragon.js', 'utf8');
const lines = c.split(/\r?\n/);
lines.forEach((l, i) => {
  const m = l.match(/text:\s*'((?:[^'\\]|\\.)*)'/);
  if (m) {
    const t = m[1];
    if (t.length > 55) {
      console.log(`L${i+1} (${t.length}chars): ${t}`);
    }
  }
});

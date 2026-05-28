const fs = require('fs');
const lines = fs.readFileSync('src/utils/constants/story/android.js', 'utf8').split('\n');
lines.forEach((l, i) => {
  const m = l.match(/text:\s*'((?:[^'\\]|\\.)*)'/);
  if (m && m[1].length > 55) {
    console.log(`Line ${i+1} (${m[1].length}chars): ${m[1]}`);
  }
});

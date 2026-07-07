const fs = require('fs');
const p =
  'e:/project_arakia/projects/MiniCardBattle/src/utils/constants/avatars.js';
let c = fs.readFileSync(p, 'utf-8');
const helper = 'const iconPath = (id) => `assets/icons/icon_${id}.png`;\n\n';
c =
  helper +
  c.replace(
    /path:\s*'assets\/icons\/icon_([a-zA-Z0-9_]+)\.png'/g,
    "path: iconPath('$1')"
  );
fs.writeFileSync(p, c);

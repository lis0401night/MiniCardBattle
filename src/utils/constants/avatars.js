const iconPath = (id) => `assets/icons/icon_${id}.png`;

export const AVAILABLE_ICONS = [
  { id: 'player', path: iconPath('player'), name: 'デフォルト' },
  { id: 'android', path: iconPath('android'), name: 'アイギス' },
  { id: 'dragon', path: iconPath('dragon'), name: 'イグニス' },
  { id: 'knight', path: iconPath('knight'), name: 'セレスティア' },
  { id: 'cthulhu', path: iconPath('cthulhu'), name: 'ナイア' },
  { id: 'elf', path: iconPath('elf'), name: 'リナ' },
  { id: 'cleric', path: iconPath('cleric'), name: 'エリシア' },
  {
    id: 'devilhunter',
    path: iconPath('devilhunter'),
    name: 'マリア',
  },
  { id: 'witch', path: iconPath('witch'), name: 'クロエ' },
  { id: 'oni', path: iconPath('oni'), name: 'カグラ' },
  { id: 'priest', path: iconPath('priest'), name: 'ネフティ' },
];

export const EXTRA_ICONS = [
  // 高難易度
  {
    id: 'satan',
    name: 'サタン',
    path: iconPath('satan'),
  },
  {
    id: 'android_high',
    name: 'フルアーマーユニット',
    path: iconPath('android_high'),
  },
  {
    id: 'dragon_high',
    name: '熱砂の客人',
    path: iconPath('dragon_high'),
  },
  {
    id: 'knight_high',
    name: '暗黒騎士',
    path: iconPath('knight_high'),
  },
  {
    id: 'cthulhu_high',
    name: '魔界の征服者',
    path: iconPath('cthulhu_high'),
  },
  {
    id: 'elf_high',
    name: 'リナ&ヴォイテク',
    path: iconPath('elf_high'),
  },
  {
    id: 'cleric_high',
    name: '断罪の執行者',
    path: iconPath('cleric_high'),
  },
  {
    id: 'devilhunter_high',
    name: 'ゴーストライダー',
    path: iconPath('devilhunter_high'),
  },
  {
    id: 'witch_high',
    name: '時空の探索者',
    path: iconPath('witch_high'),
  },
  {
    id: 'oni_high',
    name: '紅月ノ狂鬼',
    path: iconPath('oni_high'),
  },
  {
    id: 'priest_high',
    name: '前世の記憶',
    path: iconPath('priest_high'),
  },

  // 水着
  {
    id: 'android_summer',
    name: '水陸両用装備',
    path: iconPath('android_summer'),
  },
  {
    id: 'dragon_summer',
    name: '真夏の焔竜姫',
    path: iconPath('dragon_summer'),
  },
  {
    id: 'knight_summer',
    name: '波打ち際の騎士',
    path: iconPath('knight_summer'),
  },
  {
    id: 'cthulhu_summer',
    name: '深海のサマースイム',
    path: iconPath('cthulhu_summer'),
  },
  {
    id: 'elf_summer',
    name: '水辺の流浪者',
    path: iconPath('elf_summer'),
  },
  {
    id: 'cleric_summer',
    name: '背徳のサマーバカンス',
    path: iconPath('cleric_summer'),
  },
  {
    id: 'devilhunter_summer',
    name: '渚の悪魔狩り',
    path: iconPath('devilhunter_summer'),
  },
  {
    id: 'witch_summer',
    name: '不機嫌なサマー・グリモワール',
    path: iconPath('witch_summer'),
  },
  {
    id: 'oni_summer',
    name: '涼み鬼の波打ち肌',
    path: iconPath('oni_summer'),
  },
  {
    id: 'priest_summer',
    name: '墓守の休息',
    path: iconPath('priest_summer'),
  },

  // 学園
  {
    id: 'android_school',
    name: '献身的な後輩',
    path: iconPath('android_school'),
  },
  {
    id: 'dragon_school',
    name: '放課後ディストーション',
    path: iconPath('dragon_school'),
  },
  {
    id: 'knight_school',
    name: '必勝の剣道部主将',
    path: iconPath('knight_school'),
  },
  {
    id: 'cthulhu_school',
    name: '妖しきオカ研部長',
    path: iconPath('cthulhu_school'),
  },
  {
    id: 'elf_school',
    name: '癒しの飼育委員',
    path: iconPath('elf_school'),
  },
  {
    id: 'cleric_school',
    name: '恐怖の特別指導',
    path: iconPath('cleric_school'),
  },
  {
    id: 'devilhunter_school',
    name: '孤高のスケバン',
    path: iconPath('devilhunter_school'),
  },
  {
    id: 'witch_school',
    name: '気怠げな親友の妹',
    path: iconPath('witch_school'),
  },
  {
    id: 'oni_school',
    name: '鬼の風紀委員',
    path: iconPath('oni_school'),
  },
  {
    id: 'priest_school',
    name: 'ミステリアスな留学生',
    path: iconPath('priest_school'),
  },
];

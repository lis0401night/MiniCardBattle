/**
 * Mini Card Battle - Game Configuration
 */
export const MAX_HP = 20;
export const DECK_SIZE = 20;

// 防衛戦 交換所ラインナップ
export const EXCHANGE_LINEUP = [
  { id: 'cyberdragon', type: 'premium', cost: 20 },
  { id: 'dragon', type: 'premium', cost: 20 },
  { id: 'assassin', type: 'premium', cost: 20 },
  { id: 'empress', type: 'premium', cost: 20 },
  { id: 'oldgod', type: 'premium', cost: 20 },
  { id: 'wolf', type: 'premium', cost: 20 },
  { id: 'vampire', type: 'premium', cost: 20 },
  { id: 'djinn', type: 'premium', cost: 20 },
  { id: 'shogun', type: 'premium', cost: 20 },
  { id: 'pharaoh', type: 'premium', cost: 20 },
  { id: 'dreadnought', type: 'premium', cost: 10 },
  { id: 'hammer', type: 'premium', cost: 10 },
  { id: 'crusher', type: 'premium', cost: 10 },
  { id: 'shark', type: 'premium', cost: 10 },
  { id: 'shaman', type: 'premium', cost: 10 },
  { id: 'light', type: 'premium', cost: 10 },
  { id: 'plaguedoctor', type: 'premium', cost: 10 },
  { id: 'dragonfire', type: 'premium', cost: 10 },
  { id: 'yukionna', type: 'premium', cost: 10 },
  { id: 'kitepriest', type: 'premium', cost: 10 },
  { id: 'cavalry', type: 'premium', cost: 10 },
  { id: 'badwolf', type: 'card', cost: 5 },
  { id: 'redhood', type: 'card', cost: 5 },
];

// 試練の宮殿 交換所ラインナップ
export const CHALLENGE_EXCHANGE_LINEUP = [
  {
    id: 'android_summer',
    type: 'skin',
    charId: 'android',
    name: '水陸両用装備',
    description: '研究所より支給された耐熱・耐水処理を施した特殊換装とのこと。',
    cost: 20,
  },
  {
    id: 'dragon_summer',
    type: 'skin',
    charId: 'dragon',
    name: '真夏の焔竜姫',
    description:
      '太陽の熱よりも熱い竜の息吹。水辺でも彼女の炎が消えることは決してない。',
    cost: 20,
  },
  {
    id: 'knight_summer',
    type: 'skin',
    charId: 'knight',
    name: '波打ち際の騎士',
    description:
      '鎧を脱ぎ捨て、ひとときの休息を楽しむ騎士。その剣腕は水着姿でも少しも鈍らない。',
    cost: 20,
  },
  {
    id: 'cthulhu_summer',
    type: 'skin',
    charId: 'cthulhu',
    name: '深海のサマースイム',
    description:
      '深淵から現れた名状しがたき水着姿。彼女が泳ぐたび、波間に狂気が蠢くという。',
    cost: 20,
  },
  {
    id: 'elf_summer',
    type: 'skin',
    charId: 'elf',
    name: '水辺の流浪者',
    description:
      '森を抜け出し、海辺にやってきた流浪のエルフ。波の音に耳を傾ける穏やかな時間。',
    cost: 20,
  },
  {
    id: 'cleric_summer',
    type: 'skin',
    charId: 'cleric',
    name: '背徳のサマーバカンス',
    description:
      '神職の務めを忘れ、開放的な夏を満喫する聖職者。神の慈悲は海よりも広いらしい。',
    cost: 20,
  },
  {
    id: 'devilhunter_summer',
    type: 'skin',
    charId: 'devilhunter',
    name: '渚の悪魔狩り',
    description:
      '悪魔を狩るのも夏休みが必要だ。ただし、銃の手入れだけは怠らない。',
    cost: 20,
  },
  {
    id: 'witch_summer',
    type: 'skin',
    charId: 'witch',
    name: '不機嫌なサマー・グリモワール',
    description:
      '無理矢理取らされた夏休み。慣れない水着と照りつける太陽のせいで、全く読書に集中できていないようだ。',
    cost: 20,
  },
  {
    id: 'oni_summer',
    type: 'skin',
    charId: 'oni',
    name: '涼み鬼の波打ち肌',
    description:
      '普段は和装の鬼娘も、たまには羽を伸ばして海辺で遊ぶ。しかしその圧倒的な力は健在である。',
    cost: 20,
  },
  {
    id: 'priest_summer',
    type: 'skin',
    charId: 'priest',
    name: '墓守の休息',
    description:
      '千年の眠りから覚め、海辺で静かに涼む墓守。水面に映る太陽の光を静かに見つめている。',
    cost: 20,
  },
  {
    id: 'pm_android_summer',
    type: 'playmat',
    name: '水陸両用装備',
    description: '研究所より支給された耐熱・耐水処理を施した特殊換装とのこと。',
    cost: 10,
  },
  {
    id: 'pm_dragon_summer',
    type: 'playmat',
    name: '真夏の焔竜姫',
    description:
      '太陽の熱よりも熱い竜の息吹。水辺でも彼女の炎が消えることは決してない。',
    cost: 10,
  },
  {
    id: 'pm_knight_summer',
    type: 'playmat',
    name: '波打ち際の騎士',
    description:
      '鎧を脱ぎ捨て、ひとときの休息を楽しむ騎士。その剣腕は水着姿でも少しも鈍らない。',
    cost: 10,
  },
  {
    id: 'pm_cthulhu_summer',
    type: 'playmat',
    name: '深海のサマースイム',
    description:
      '深淵から現れた名状しがたき水着姿。彼女が泳ぐたび、波間に狂気が蠢くという。',
    cost: 10,
  },
  {
    id: 'pm_elf_summer',
    type: 'playmat',
    name: '水辺の流浪者',
    description:
      '森を抜け出し、海辺にやってきた流浪のエルフ。波の音に耳を傾ける穏やかな時間。',
    cost: 10,
  },
  {
    id: 'pm_cleric_summer',
    type: 'playmat',
    name: '背徳のサマーバカンス',
    description:
      '神職の務めを忘れ、開放的な夏を満喫する聖職者。神の慈悲は海よりも広いらしい。',
    cost: 10,
  },
  {
    id: 'pm_devilhunter_summer',
    type: 'playmat',
    name: '渚の悪魔狩り',
    description:
      '悪魔を狩るのも夏休みが必要だ。ただし、銃の手入れだけは怠らない。',
    cost: 10,
  },
  {
    id: 'pm_witch_summer',
    type: 'playmat',
    name: '不機嫌なサマー・グリモワール',
    description:
      '無理矢理取らされた夏休み。慣れない水着と照りつける太陽のせいで、全く読書に集中できていないようだ。',
    cost: 10,
  },
  {
    id: 'pm_oni_summer',
    type: 'playmat',
    name: '涼み鬼の波打ち肌',
    description:
      '普段は和装の鬼娘も、たまには羽を伸ばして海辺で遊ぶ。しかしその圧倒的な力は健在である。',
    cost: 10,
  },
  {
    id: 'pm_priest_summer',
    type: 'playmat',
    name: '墓守の休息',
    description:
      '千年の眠りから覚め、海辺で静かに涼む墓守。水面に映る太陽の光を静かに見つめている。',
    cost: 10,
  },
  { id: 'queen', type: 'card', cost: 5 },
  { id: 'snowwhite', type: 'card', cost: 5 },
];

export const TOURNAMENT_EXCHANGE_LINEUP = [
  {
    id: 'android_school',
    type: 'skin',
    charId: 'android',
    name: '学生アイギス',
    description:
      '最新鋭の学園防衛システム。制服は特別製の耐弾素材でできている。',
    cost: 20,
  },
  {
    id: 'dragon_school',
    type: 'skin',
    charId: 'dragon',
    name: '学生イグニス',
    description:
      '燃えるような青春を謳歌する竜の姫。熱血すぎてたまに教室が焦げる。',
    cost: 20,
  },
  {
    id: 'knight_school',
    type: 'skin',
    charId: 'knight',
    name: '学生セレスティア',
    description: '風紀委員長を務める真面目な騎士。校則違反には容赦がない。',
    cost: 20,
  },
  {
    id: 'cthulhu_school',
    type: 'skin',
    charId: 'cthulhu',
    name: '学生ナイア',
    description: 'オカルト研究部の部長。常に怪しげな儀式を放課後に行っている。',
    cost: 20,
  },
  {
    id: 'elf_school',
    type: 'skin',
    charId: 'elf',
    name: '学生リナ',
    description: '弓道部のエース。その正確な射撃は他の追随を許さない。',
    cost: 20,
  },
  {
    id: 'cleric_school',
    type: 'skin',
    charId: 'cleric',
    name: '学生エリシア',
    description: '保健委員を務める心優しき生徒。ただし治療方法は少し過激。',
    cost: 20,
  },
  {
    id: 'devilhunter_school',
    type: 'skin',
    charId: 'devilhunter',
    name: '学生マリア',
    description:
      '不良生徒を取り締まる影の風紀委員。二丁拳銃の代わりにチョークを投げる。',
    cost: 20,
  },
  {
    id: 'witch_school',
    type: 'skin',
    charId: 'witch',
    name: '学生クロエ',
    description:
      '図書委員として静寂を愛する魔女。騒がしい生徒には時間の呪いをかける。',
    cost: 20,
  },
  {
    id: 'oni_school',
    type: 'skin',
    charId: 'oni',
    name: '学生カグラ',
    description: '剣道部の主将。木刀を振るう姿はまさに鬼神の如き迫力。',
    cost: 20,
  },
  {
    id: 'priest_school',
    type: 'skin',
    charId: 'priest',
    name: '学生ネフティ',
    description: '歴史研究部の幽霊部員。古代の石版を教科書代わりに読んでいる。',
    cost: 20,
  },
  {
    id: 'pm_android_school',
    type: 'playmat',
    name: 'プレイマット：学生アイギス',
    description:
      '最新鋭の学園防衛システム。制服は特別製の耐弾素材でできている。',
    cost: 10,
  },
  {
    id: 'pm_dragon_school',
    type: 'playmat',
    name: 'プレイマット：学生イグニス',
    description:
      '燃えるような青春を謳歌する竜の姫。熱血すぎてたまに教室が焦げる。',
    cost: 10,
  },
  {
    id: 'pm_knight_school',
    type: 'playmat',
    name: 'プレイマット：学生セレスティア',
    description: '風紀委員長を務める真面目な騎士。校則違反には容赦がない。',
    cost: 10,
  },
  {
    id: 'pm_cthulhu_school',
    type: 'playmat',
    name: 'プレイマット：学生ナイア',
    description: 'オカルト研究部の部長。常に怪しげな儀式を放課後に行っている。',
    cost: 10,
  },
  {
    id: 'pm_elf_school',
    type: 'playmat',
    name: 'プレイマット：学生リナ',
    description: '弓道部のエース。その正確な射撃は他の追随を許さない。',
    cost: 10,
  },
  {
    id: 'pm_cleric_school',
    type: 'playmat',
    name: 'プレイマット：学生エリシア',
    description: '保健委員を務める心優しき生徒。ただし治療方法は少し過激。',
    cost: 10,
  },
  {
    id: 'pm_devilhunter_school',
    type: 'playmat',
    name: 'プレイマット：学生マリア',
    description:
      '不良生徒を取り締まる影の風紀委員。二丁拳銃の代わりにチョークを投げる。',
    cost: 10,
  },
  {
    id: 'pm_witch_school',
    type: 'playmat',
    name: 'プレイマット：学生クロエ',
    description:
      '図書委員として静寂を愛する魔女。騒がしい生徒には時間の呪いをかける。',
    cost: 10,
  },
  {
    id: 'pm_oni_school',
    type: 'playmat',
    name: 'プレイマット：学生カグラ',
    description: '剣道部の主将。木刀を振るう姿はまさに鬼神の如き迫力。',
    cost: 10,
  },
  {
    id: 'pm_priest_school',
    type: 'playmat',
    name: 'プレイマット：学生ネフティ',
    description: '歴史研究部の幽霊部員。古代の石版を教科書代わりに読んでいる。',
    cost: 10,
  },
  { id: 'threebears', type: 'card', cost: 5 },
  { id: 'goldilocks', type: 'card', cost: 5 },
];

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
    { id: 'dreadnought', type: 'premium', cost: 10 },
    { id: 'hammer', type: 'premium', cost: 10 },
    { id: 'darkpaladin', type: 'premium', cost: 10 },
    { id: 'shark', type: 'premium', cost: 10 },
    { id: 'shaman', type: 'premium', cost: 10 },
    { id: 'light', type: 'premium', cost: 10 },
    { id: 'plaguedoctor', type: 'premium', cost: 10 },
    { id: 'dragonfire', type: 'premium', cost: 10 },
    { id: 'badwolf', type: 'card', cost: 5 },
    { id: 'redhood', type: 'card', cost: 5 }
];

// 試練の宮殿 交換所ラインナップ
export const CHALLENGE_EXCHANGE_LINEUP = [
    { id: 'android_summer', type: 'skin', charId: 'android', name: '水陸両用装備', description: '研究所より支給された耐熱・耐水処理を施した特殊換装とのこと。', cost: 20 },
    { id: 'dragon_summer', type: 'skin', charId: 'dragon', name: '真夏の焔竜姫', description: '太陽の熱よりも熱い竜の息吹。水辺でも彼女の炎が消えることは決してない。', cost: 20 },
    { id: 'knight_summer', type: 'skin', charId: 'knight', name: '波打ち際の騎士', description: '鎧を脱ぎ捨て、ひとときの休息を楽しむ騎士。その剣腕は水着姿でも少しも鈍らない。', cost: 20 },
    { id: 'cthulhu_summer', type: 'skin', charId: 'cthulhu', name: '深海のサマースイム', description: '深淵から現れた名状しがたき水着姿。彼女が泳ぐたび、波間に狂気が蠢くという。', cost: 20 },
    { id: 'elf_summer', type: 'skin', charId: 'elf', name: '水辺の流浪者', description: '森を抜け出し、海辺にやってきた流浪のエルフ。波の音に耳を傾ける穏やかな時間。', cost: 20 },
    { id: 'cleric_summer', type: 'skin', charId: 'cleric', name: '背徳のサマーバカンス', description: '神職の務めを忘れ、開放的な夏を満喫する聖職者。神の慈悲は海よりも広いらしい。', cost: 20 },
    { id: 'devilhunter_summer', type: 'skin', charId: 'devilhunter', name: '渚の悪魔狩り', description: '悪魔を狩るのも夏休みが必要だ。ただし、銃の手入れだけは怠らない。', cost: 20 },
    { id: 'witch_summer', type: 'skin', charId: 'witch', name: '不機嫌なサマー・グリモワール', description: '無理矢理取らされた夏休み。慣れない水着と照りつける太陽のせいで、全く読書に集中できていないようだ。', cost: 20 },
    { id: 'oni_summer', type: 'skin', charId: 'oni', name: '涼み鬼の夏装束', description: '普段は和装の鬼娘も、たまには羽を伸ばして海辺で遊ぶ。しかしその圧倒的な力は健在である。', cost: 20 },
    { id: 'pm_android_summer', type: 'playmat', name: '水陸両用装備', description: '研究所より支給された耐熱・耐水処理を施した特殊換装とのこと。', cost: 10 },
    { id: 'pm_dragon_summer', type: 'playmat', name: '真夏の焔竜姫', description: '太陽の熱よりも熱い竜の息吹。水辺でも彼女の炎が消えることは決してない。', cost: 10 },
    { id: 'pm_knight_summer', type: 'playmat', name: '波打ち際の騎士', description: '鎧を脱ぎ捨て、ひとときの休息を楽しむ騎士。その剣腕は水着姿でも少しも鈍らない。', cost: 10 },
    { id: 'pm_cthulhu_summer', type: 'playmat', name: '深海のサマースイム', description: '深淵から現れた名状しがたき水着姿。彼女が泳ぐたび、波間に狂気が蠢くという。', cost: 10 },
    { id: 'pm_elf_summer', type: 'playmat', name: '水辺の流浪者', description: '森を抜け出し、海辺にやってきた流浪のエルフ。波の音に耳を傾ける穏やかな時間。', cost: 10 },
    { id: 'pm_cleric_summer', type: 'playmat', name: '背徳のサマーバカンス', description: '神職の務めを忘れ、開放的な夏を満喫する聖職者。神の慈悲は海よりも広いらしい。', cost: 10 },
    { id: 'pm_devilhunter_summer', type: 'playmat', name: '渚の悪魔狩り', description: '悪魔を狩るのも夏休みが必要だ。ただし、銃の手入れだけは怠らない。', cost: 10 },
    { id: 'pm_witch_summer', type: 'playmat', name: '不機嫌なサマー・グリモワール', description: '無理矢理取らされた夏休み。慣れない水着と照りつける太陽のせいで、全く読書に集中できていないようだ。', cost: 10 },
    { id: 'pm_oni_summer', type: 'playmat', name: '涼み鬼の夏装束', description: '普段は和装の鬼娘も、たまには羽を伸ばして海辺で遊ぶ。しかしその圧倒的な力は健在である。', cost: 10 },
    { id: 'queen', type: 'card', cost: 5 },
    { id: 'snowwhite', type: 'card', cost: 5 }
];

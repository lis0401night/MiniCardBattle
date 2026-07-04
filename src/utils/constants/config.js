/**
 * Mini Card Battle - Game Configuration
 */
export const GAME_VERSION = '0.1.3';
export const DEFAULT_PLAYER_NAME = 'プレイヤー';
export const VERSION_CHECK_TIMEOUT_MS = 3000; // バージョン自動チェック時のAbortタイムアウト時間 (ms)
export const MAX_HP = 20;
export const DECK_SIZE = 20;
export const MAX_CARD_COPIES = 4; // 同一カードの最大編成枚数
export const MAX_DECK_SLOTS = 30; // デッキ登録の最大上限数
export const AI_THINKING_DURATION = 800; // 敵AIが対象を選択する際の思考ウェイト時間 (ms)
export const PLACE_ANIMATION_DURATION = 300; // カード登場・配置演出時のウェイト時間 (ms)
export const MAX_DISCARD_PREVIEW_COUNT = 999; // 墓地確認モーダルで全カードを表示するための最大値

// 交換コストの定義（カテゴリ・レアリティ別）
export const GOLD_PREMIUM_EXCHANGE_COST = 20; // ゴールド・プレミアムカード
export const SILVER_PREMIUM_EXCHANGE_COST = 10; // シルバー・プレミアムカード
export const GOLD_CARD_EXCHANGE_COST = 5; // ゴールド・非プレミアム（通常）カード

export const SKIN_EXCHANGE_COST = 20; // キャラクタースキン一律
export const PLAYMAT_EXCHANGE_COST = 10; // プレイマット一律
export const ICON_EXCHANGE_COST = 5; // アバターアイコン一律

// 防衛戦 交換所ラインナップ
export const EXCHANGE_LINEUP = [
  { id: 'cyberdragon', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'dragon', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'assassin', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'empress', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'oldgod', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'wolf', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'vampire', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'djinn', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'shogun', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'pharaoh', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'dreadnought', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'armsuits', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'hammer', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'berserker', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'horse', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'crusher', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'shark', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'parasite', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'shaman', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'darkelf', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'doom', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'acolyte', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'plaguedoctor', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'servant', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'ring', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'battlemage', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'yukionna', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'muramasa', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'kitepriest', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'snakepriest', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'badwolf', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
  { id: 'redhood', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
];

// 試練の宮殿 交換所ラインナップ
export const CHALLENGE_EXCHANGE_LINEUP = [
  {
    id: 'android_summer',
    type: 'skin',
    charId: 'android',
    name: '水陸両用装備',
    description: '研究所より支給された耐熱・耐水処理を施した特殊換装とのこと。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'dragon_summer',
    type: 'skin',
    charId: 'dragon',
    name: '真夏の焔竜姫',
    description:
      '太陽の熱よりも熱い竜の息吹。水辺でも彼女の炎が消えることは決してない。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'knight_summer',
    type: 'skin',
    charId: 'knight',
    name: '波打ち際の騎士',
    description:
      '鎧を脱ぎ捨て、ひとときの休息を楽しむ騎士。その剣腕は水着姿でも少しも鈍らない。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'cthulhu_summer',
    type: 'skin',
    charId: 'cthulhu',
    name: '深海のサマースイム',
    description:
      '深淵から現れた名状しがたき水着姿。彼女が泳ぐたび、波間に狂気が蠢くという。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'elf_summer',
    type: 'skin',
    charId: 'elf',
    name: '水辺の流浪者',
    description:
      '森を抜け出し、海辺にやってきた流浪のエルフ。波の音に耳を傾ける穏やかな時間。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'cleric_summer',
    type: 'skin',
    charId: 'cleric',
    name: '背徳のサマーバカンス',
    description:
      '神職の務めを忘れ、開放的な夏を満喫する聖職者。神の慈悲は海よりも広いらしい。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'devilhunter_summer',
    type: 'skin',
    charId: 'devilhunter',
    name: '渚の悪魔狩り',
    description:
      '悪魔を狩るのも夏休みが必要だ。ただし、銃の手入れだけは怠らない。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'witch_summer',
    type: 'skin',
    charId: 'witch',
    name: '不機嫌なサマー・グリモワール',
    description:
      '無理矢理取らされた夏休み。慣れない水着と照りつける太陽のせいで、全く読書に集中できていないようだ。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'oni_summer',
    type: 'skin',
    charId: 'oni',
    name: '涼み鬼の波打ち肌',
    description:
      '普段は和装の鬼娘も、たまには羽を伸ばして海辺で遊ぶ。しかしその圧倒的な力は健在である。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'priest_summer',
    type: 'skin',
    charId: 'priest',
    name: '墓守の休息',
    description:
      '千年の眠りから覚め、海辺で静かに涼む墓守。水面に映る太陽の光を静かに見つめている。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'pm_android_summer',
    type: 'playmat',
    name: 'プレイマット：水陸両用装備',
    description: '研究所より支給された耐熱・耐水処理を施した特殊換装とのこと。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_dragon_summer',
    type: 'playmat',
    name: 'プレイマット：真夏の焔竜姫',
    description:
      '太陽の熱よりも熱い竜の息吹。水辺でも彼女の炎が消えることは決してない。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_knight_summer',
    type: 'playmat',
    name: 'プレイマット：波打ち際の騎士',
    description:
      '鎧を脱ぎ捨て、ひとときの休息を楽しむ騎士。その剣腕は水着姿でも少しも鈍らない。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_cthulhu_summer',
    type: 'playmat',
    name: 'プレイマット：深海のサマースイム',
    description:
      '深淵から現れた名状しがたき水着姿。彼女が泳ぐたび、波間に狂気が蠢くという。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_elf_summer',
    type: 'playmat',
    name: 'プレイマット：水辺の流浪者',
    description:
      '森を抜け出し、海辺にやってきた流浪のエルフ。波の音に耳を傾ける穏やかな時間。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_cleric_summer',
    type: 'playmat',
    name: 'プレイマット：背徳のサマーバカンス',
    description:
      '神職の務めを忘れ、開放的な夏を満喫する聖職者。神の慈悲は海よりも広いらしい。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_devilhunter_summer',
    type: 'playmat',
    name: 'プレイマット：渚の悪魔狩り',
    description:
      '悪魔を狩るのも夏休みが必要だ。ただし、銃の手入れだけは怠らない。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_witch_summer',
    type: 'playmat',
    name: 'プレイマット：不機嫌なサマー・グリモワール',
    description:
      '無理矢理取らされた夏休み。慣れない水着と照りつける太陽のせいで、全く読書に集中できていないようだ。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_oni_summer',
    type: 'playmat',
    name: 'プレイマット：涼み鬼の波打ち肌',
    description:
      '普段は和装の鬼娘も、たまには羽を伸ばして海辺で遊ぶ。しかしその圧倒的な力は健在である。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_priest_summer',
    type: 'playmat',
    name: 'プレイマット：墓守の休息',
    description:
      '千年の眠りから覚め、海辺で静かに涼む墓守。水面に映る太陽の光を静かに見つめている。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'android_summer',
    type: 'icon',
    name: '水陸両用装備',
    description: '研究所より支給された耐熱・耐水処理を施した特殊換装とのこと。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'dragon_summer',
    type: 'icon',
    name: '真夏の焔竜姫',
    description:
      '太陽の熱よりも熱い竜の息吹。水辺でも彼女の炎が消えることは決してない。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'knight_summer',
    type: 'icon',
    name: '波打ち際の騎士',
    description:
      '鎧を脱ぎ捨て、ひとときの休息を楽しむ騎士。その剣腕は水着姿でも少しも鈍らない。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'cthulhu_summer',
    type: 'icon',
    name: '深海のサマースイム',
    description:
      '深淵から現れた名状しがたき水着姿。彼女が泳ぐたび、波間に狂気が蠢くという。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'elf_summer',
    type: 'icon',
    name: '水辺の流浪者',
    description:
      '森を抜け出し、海辺にやってきた流浪のエルフ。波の音に耳を傾ける穏やかな時間。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'cleric_summer',
    type: 'icon',
    name: '背徳のサマーバカンス',
    description:
      '神職の務めを忘れ、開放的な夏を満喫する聖職者。神の慈悲は海よりも広いらしい。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'devilhunter_summer',
    type: 'icon',
    name: '渚の悪魔狩り',
    description:
      '悪魔を狩るのも夏休みが必要だ。ただし、銃の手入れだけは怠らない。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'witch_summer',
    type: 'icon',
    name: '不機嫌なサマー・グリモワール',
    description:
      '無理矢理取らされた夏休み。慣れない水着と照りつける太陽のせいで、全く読書に集中できていないようだ。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'oni_summer',
    type: 'icon',
    name: '涼み鬼の波打ち肌',
    description:
      '普段は和装の鬼娘も、たまには羽を伸ばして海辺で遊ぶ。しかしその圧倒的な力は健在である。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'priest_summer',
    type: 'icon',
    name: '墓守の休息',
    description:
      '千年の眠りから覚め、海辺で静かに涼む墓守。水面に映る太陽の光を静かに見つめている。',
    cost: ICON_EXCHANGE_COST,
  },
  { id: 'queen', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
  { id: 'snowwhite', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
];

// トーナメント 交換所ラインナップ
export const TOURNAMENT_EXCHANGE_LINEUP = [
  {
    id: 'android_school',
    type: 'skin',
    charId: 'android',
    name: '献身的な後輩',
    description: 'いつも先輩の背中を追いかける、一途で献身的な後輩。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'dragon_school',
    type: 'skin',
    charId: 'dragon',
    name: '放課後ディストーション',
    description:
      '軽音部でギターをかき鳴らすサークルの姫。彼女のライブはいつも爆音。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'knight_school',
    type: 'skin',
    charId: 'knight',
    name: '必勝の剣道部主将',
    description: '剣道部を全国大会へ導く熱血主将。その竹刀の太刀筋は見えない。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'cthulhu_school',
    type: 'skin',
    charId: 'cthulhu',
    name: '妖しきオカ研部長',
    description: '放課後の旧校舎で怪しげな儀式を行うオカルト研究部の部長。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'elf_school',
    type: 'skin',
    charId: 'elf',
    name: '癒しの飼育委員',
    description:
      '動物をこよなく愛する飼育委員。彼女の周りには常に動物が集まる。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'cleric_school',
    type: 'skin',
    charId: 'cleric',
    name: '恐怖の特別指導',
    description: '逆らう生徒には容赦しない、学園で最も恐れられるスパルタ教師。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'devilhunter_school',
    type: 'skin',
    charId: 'devilhunter',
    name: '孤高のスケバン',
    description: '群れることを嫌う孤高のスケバン。喧嘩の強さは学園一との噂。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'witch_school',
    type: 'skin',
    charId: 'witch',
    name: '気怠げな親友の妹',
    description: '親友の妹で、いつも気怠げにしている。放課後は早く帰りたがる。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'oni_school',
    type: 'skin',
    charId: 'oni',
    name: '鬼の風紀委員',
    description: '校則違反を絶対に許さない風紀委員。その取り締まりはまさに鬼。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'priest_school',
    type: 'skin',
    charId: 'priest',
    name: 'ミステリアスな留学生',
    description: '遠い異国からやってきた留学生。いつも何かを調べているらしい。',
    cost: SKIN_EXCHANGE_COST,
  },
  {
    id: 'pm_android_school',
    type: 'playmat',
    name: 'プレイマット：献身的な後輩',
    description: 'いつも先輩の背中を追いかける、一途で献身的な後輩。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_dragon_school',
    type: 'playmat',
    name: 'プレイマット：放課後ディストーション',
    description:
      '軽音部でギターをかき鳴らすサークルの姫。彼女のライブはいつも爆音。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_knight_school',
    type: 'playmat',
    name: 'プレイマット：必勝の剣道部主将',
    description: '剣道部を全国大会へ導く熱血主将。その竹刀の太刀筋は見えない。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_cthulhu_school',
    type: 'playmat',
    name: 'プレイマット：妖しきオカ研部長',
    description: '放課後の旧校舎で怪しげな儀式を行うオカルト研究部の部長。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_elf_school',
    type: 'playmat',
    name: 'プレイマット：癒しの飼育委員',
    description:
      '動物をこよなく愛する飼育委員。彼女の周りには常に動物が集まる。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_cleric_school',
    type: 'playmat',
    name: 'プレイマット：恐怖の特別指導',
    description: '逆らう生徒には容赦しない、学園で最も恐れられるスパルタ教師。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_devilhunter_school',
    type: 'playmat',
    name: 'プレイマット：孤高のスケバン',
    description: '群れることを嫌う孤高のスケバン。喧嘩の強さは学園一との噂。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_witch_school',
    type: 'playmat',
    name: 'プレイマット：気怠げな親友の妹',
    description: '親友の妹で、いつも気怠げにしている。放課後は早く帰りたがる。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_oni_school',
    type: 'playmat',
    name: 'プレイマット：鬼の風紀委員',
    description: '校則違反を絶対に許さない風紀委員。その取り締まりはまさに鬼。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'pm_priest_school',
    type: 'playmat',
    name: 'プレイマット：ミステリアスな留学生',
    description: '遠い異国からやってきた留学生。いつも何かを調べているらしい。',
    cost: PLAYMAT_EXCHANGE_COST,
  },
  {
    id: 'android_school',
    type: 'icon',
    name: '献身的な後輩',
    description: 'いつも先輩の背中を追いかける、一途で献身的な後輩。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'dragon_school',
    type: 'icon',
    name: '放課後ディストーション',
    description:
      '軽音部でギターをかき鳴らすサークルの姫。彼女のライブはいつも爆音。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'knight_school',
    type: 'icon',
    name: '必勝の剣道部主将',
    description: '剣道部を全国大会へ導く熱血主将。その竹刀の太刀筋は見えない。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'cthulhu_school',
    type: 'icon',
    name: '妖しきオカ研部長',
    description: '放課後の旧校舎で怪しげな儀式を行うオカルト研究部の部長。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'elf_school',
    type: 'icon',
    name: '癒しの飼育委員',
    description:
      '動物をこよなく愛する飼育委員。彼女の周りには常に動物が集まる。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'cleric_school',
    type: 'icon',
    name: '恐怖の特別指導',
    description: '逆らう生徒には容赦しない、学園で最も恐れられるスパルタ教師。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'devilhunter_school',
    type: 'icon',
    name: '孤高のスケバン',
    description: '群れることを嫌う孤高のスケバン。喧嘩の強さは学園一との噂。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'witch_school',
    type: 'icon',
    name: '気怠げな親友の妹',
    description: '親友の妹で、いつも気怠げにしている。放課後は早く帰りたがる。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'oni_school',
    type: 'icon',
    name: '鬼の風紀委員',
    description: '校則違反を絶対に許さない風紀委員。その取り締まりはまさに鬼。',
    cost: ICON_EXCHANGE_COST,
  },
  {
    id: 'priest_school',
    type: 'icon',
    name: 'ミステリアスな留学生',
    description: '遠い異国からやってきた留学生。いつも何かを調べているらしい。',
    cost: ICON_EXCHANGE_COST,
  },
  { id: 'threebears', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
  { id: 'goldilocks', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
];

/**
 * アセットURLにバージョンクエリパラメータを付与してキャッシュを強制破棄します。
 * @param {string} url - アセットURL
 * @returns {string} クエリパラメータが付与されたURL
 */
export function appendVersionQuery(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('assets/')) {
    return url;
  }
  if (url.includes('?v=')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${GAME_VERSION}`;
}

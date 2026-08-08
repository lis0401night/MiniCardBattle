/**
 * Mini Card Battle - Leader Skill Master Definitions
 * リーダースキルのマスターデータ定数ファイル
 */

/**
 * 全リーダースキルのマスターデータ定義
 * 各キャラクターの固有リーダースキルおよび高難易度用リーダースキルの情報を一元管理します。
 */
export const LEADER_SKILLS = {
  annihilation: {
    name: '殲滅光線',
    desc: '(SP:4) 敵の場のすべてのカードに4ダメージを与える。',
    cost: 4,
    action: 'annihilation',
  },
  dragon_summon: {
    name: '竜王の降臨',
    desc: '(SP:4) 自分のレーンに「イグニス(P:7/伝説)」を1体配置する。',
    cost: 4,
    action: 'dragon_summon',
  },
  holy_march: {
    name: '聖なる進軍',
    desc: '(SP:5) 自分のレーンに「騎士(P:2)」を最大2体召喚し、自分の場のすべてのカードのパワーを+2する。',
    cost: 5,
    action: 'holy_march',
  },
  abyss_ritual: {
    name: '深淵の儀式',
    desc: '(SP:3) 手札からカードを最大2枚捨てて同数引き、手札すべてのパワーを+1する。',
    cost: 3,
    action: 'abyss_ritual',
  },
  targeted_destruction: {
    name: '星墜ちの矢',
    desc: '(SP:4) 相手の場のカード1枚を選び、破壊する。',
    cost: 4,
    action: 'targeted_destruction',
  },
  god_flame: {
    name: '神炎の審判',
    desc: '(SP:4) 相手リーダーに3ダメージを与え、自身のHPを3回復する。',
    cost: 4,
    action: 'god_flame',
  },
  devilhunter_resurrect: {
    name: '棺の解放',
    desc: '(SP:4) 自分の墓地からカードを1枚選び、自分のレーンに配置する。',
    cost: 4,
    action: 'devilhunter_resurrect',
  },
  time_stop: {
    name: '因果律の掌握',
    desc: '(SP:6) 追加のターンを2回行う。\n(ただし、追加ターン中はSPは溜まらず攻撃もできない)',
    cost: 6,
    action: 'time_stop',
  },
  seal_lanes: {
    name: '急急如律令',
    desc: '(SP:5) 相手のレーンを2つまで選択する。そのレーンのカードに4ダメージを与え、レーンを1ターン封印する。',
    cost: 5,
    action: 'seal_lanes',
  },
  tomb_guard: {
    name: '王墓の呪縛',
    desc: '(SP:3) 相手のデッキの上からカードを4枚墓地に送る。相手の場のカード1枚を選び、4ダメージを与える。',
    cost: 3,
    action: 'tomb_guard',
  },
  void_purge: {
    name: 'ゼロの理',
    desc: '(SP:4) 自分の手札を3枚選んで捨てる。相手は手札を全て捨て、捨てた「虚空」の枚数分ダメージを受ける。その後、お互いに捨てた枚数分の「虚空(P:0)」を手札に加える。',
    cost: 4,
    action: 'void_purge',
  },
  viola_domination: {
    name: '服従の刻印',
    desc: '(SP:5) 相手の場のカード1枚を選び、正面のレーンに移動する。',
    cost: 5,
    action: 'viola_domination',
  },
  warlock_place_demons: {
    name: '魔宴の儀',
    desc: '(SP:5) 自分のレーンに「スケルトン(P:3)」を1体配置する。その後、自分のカードが配置されている全てのレーンに「デーモン(P:7)」を配置する。',
    cost: 5,
    action: 'warlock_place_demons',
  },
  satan_avatar: {
    name: '魔王の化身',
    desc: '(SP:6) 自分のレーンに「サタンの化身(P:10)」を1体召喚する。',
    cost: 6,
    action: 'satan_avatar',
  },
  iron_march: {
    name: '鉄の行進',
    desc: '(SP:3) 自分のレーンに「オートマタ(P:1)」を1体配置する。その後、そのレーンのカードをただちに攻撃させる。これを3回繰り返す。',
    cost: 3,
    action: 'iron_march',
  },
  valkyria_guard: {
    name: '戦乙女の加護',
    desc: '(SP:4) 次の自分のターンの攻撃終了まで、自分のカードは破壊されず、リーダーとカードが受ける全てのダメージを0にする。',
    cost: 4,
    action: 'valkyria_guard',
  },
  // --- 高難易度用リーダースキル ---
  android_high_volley: {
    name: '一斉射撃',
    desc: '(SP:4) 敵の場のすべてのカードに4ダメージ、敵リーダーに2ダメージを与える。',
    cost: 4,
    action: 'android_high_volley',
  },
  dragon_high_ritual: {
    name: '焦熱のプレリュード',
    desc: '(SP:4) 場のすべてのカードに2ダメージ、自分のレーンに「イグニス(P:7/伝説)」を1体配置する。',
    cost: 4,
    action: 'dragon_high_ritual',
  },
  evil_march: {
    name: '暗黒の軍勢',
    desc: '(SP:3) 自分のレーンに「騎士(P:2/必殺/守護)」を最大2体召喚し、自分の場のすべてのカードのパワーを+2する。',
    cost: 3,
    action: 'evil_march',
  },
  otherworld_gate: {
    name: '異界の扉',
    desc: '(SP:3) 手札からカードを最大2枚捨てて同数引き、手札すべてのパワーを+2する。相手の手札からランダムに2枚を捨て、同数「虚空(パワー1)」を加える。',
    cost: 3,
    action: 'otherworld_gate',
  },
  elf_polarbear_combo: {
    name: '連携攻撃',
    desc: '(SP:2) 相手の場のカード1枚を選び、破壊し、自分のレーンに「ヴォイテク(P:4/伝説/貫通)」を1体配置する。',
    cost: 2,
    action: 'elf_polarbear_combo',
  },
  condemnation: {
    name: 'ギロチンクロス',
    desc: '(SP:3) 相手リーダーに5ダメージを与え、自身のHPを5回復する。',
    cost: 3,
    action: 'condemnation',
  },
  overdrive: {
    name: 'オーバードライブ',
    desc: '(SP:3) 自分の墓地からカードを1枚選び、自分のレーンに配置する。相手の墓地からカードを1枚選び、自分のレーンに配置する。',
    cost: 3,
    action: 'overdrive',
  },
  world_reconstruct: {
    name: '世界の再構築',
    desc: '(SP:3) お互いの手札を全て捨て、墓地をリセットする。その後、自分は4枚、相手は3枚引く。追加のターンを1回行う。\n(ただし、追加ターン中はSPは溜まらず攻撃もできない)',
    cost: 3,
    action: 'world_reconstruct',
  },
  night_parade: {
    name: '百鬼夜行',
    desc: '(SP:3) 相手のレーンを2つまで選択する。そのレーンのカードに4ダメージを与え、レーンを1ターン封印する。自分の場に「人魂（パワー1）」を1体配置する。',
    cost: 3,
    action: 'night_parade',
  },
  death_judgment: {
    name: '死者の審判',
    desc: '(SP:3) 相手のデッキを残り1枚になるように墓地に送る。相手の場のカード1枚を選び、4ダメージを与える。',
    cost: 3,
    action: 'death_judgment',
  },
};

/**
 * 相手リーダーに直接ダメージを与えるリーダースキルのaction一覧定数
 * バトルボーナス「攻撃以外のダメージで勝利 (win_by_skill)」の判定等で使用されます。
 */
export const DAMAGE_PLAYER_LEADER_SKILL_ACTIONS = [
  'god_flame',
  'condemnation',
  'void_purge',
  'android_high_volley',
];

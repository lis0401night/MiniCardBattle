// 特級目標のタイプ定義
export const HANDICAP_TYPES = {
  BAN_SKILL: 'ban_skill', // 特定スキルの使用禁止
  PLAYER_HP: 'player_hp', // プレイヤーの最大HP変動
  ENEMY_HP: 'enemy_hp', // 敵の最大HP変動
  PLAYER_SP: 'player_sp', // プレイヤーのSPコスト・上限変動
  ENEMY_SP: 'enemy_sp', // 敵のSPコスト・上限変動
  SPAWN_ENEMY: 'spawn_enemy', // 敵陣への初期カード配置
  ENEMY_LEADER_SKILL_CHANGE: 'enemy_leader_skill_change', // 敵のリーダースキル変更
};

// 特級目標のマスター定義
export const HANDICAP_MASTER = {
  ban_legend: {
    id: 'ban_legend',
    type: HANDICAP_TYPES.BAN_SKILL,
    skillIds: ['legendary'],
    name: '「伝説」使用禁止',
    cost: 2,
  },
  ban_snipe: {
    id: 'ban_snipe',
    type: HANDICAP_TYPES.BAN_SKILL,
    skillIds: ['snipe', 'snipe_void'],
    name: '「狙撃」「狙撃(虚)」使用禁止',
    cost: 2,
  },
  ban_heal: {
    id: 'ban_heal',
    type: HANDICAP_TYPES.BAN_SKILL,
    skillIds: ['heal', 'heal_void'],
    name: '「回復」「回復(虚)」使用禁止',
    cost: 2,
  },
  ban_sturdy: {
    id: 'ban_sturdy',
    type: HANDICAP_TYPES.BAN_SKILL,
    skillIds: ['sturdy'],
    name: '「頑丈」」使用禁止',
    cost: 2,
  },
  ban_dodge: {
    id: 'ban_dodge',
    type: HANDICAP_TYPES.BAN_SKILL,
    skillIds: ['dodge'],
    name: '「回避」」使用禁止',
    cost: 2,
  },
  hp_minus_3: {
    id: 'hp_minus_3',
    type: HANDICAP_TYPES.PLAYER_HP,
    value: -3,
    name: '自分の初期HP-3',
    cost: 1,
  },
  hp_minus_7: {
    id: 'hp_minus_7',
    type: HANDICAP_TYPES.PLAYER_HP,
    value: -7,
    name: '自分の初期HP-7',
    cost: 2,
  },
  enemy_hp_plus_10: {
    id: 'enemy_hp_plus_10',
    type: HANDICAP_TYPES.ENEMY_HP,
    value: 10,
    name: '相手の初期HP+10',
    cost: 1,
  },
  enemy_hp_plus_20: {
    id: 'enemy_hp_plus_20',
    type: HANDICAP_TYPES.ENEMY_HP,
    value: 20,
    name: '相手の初期HP+20',
    cost: 2,
  },
  sp_plus_1: {
    id: 'sp_plus_1',
    type: HANDICAP_TYPES.PLAYER_SP,
    value: 1,
    name: '自分のSP上限+1',
    cost: 2,
  },
  enemy_sp_minus_1: {
    id: 'enemy_sp_minus_1',
    type: HANDICAP_TYPES.ENEMY_SP,
    value: -1,
    name: '相手のSP上限-1',
    cost: 3,
  },
  enemy_left_cop: {
    id: 'enemy_left_cop',
    type: HANDICAP_TYPES.SPAWN_ENEMY,
    lane: 0,
    cardId: 'cop',
    name: '敵の左レーンに「ボーダーエンフォーサー(P:4, 初回攻撃不可)」配置',
    cost: 2,
  },
  enemy_right_cop: {
    id: 'enemy_right_cop',
    type: HANDICAP_TYPES.SPAWN_ENEMY,
    lane: 2,
    cardId: 'cop',
    name: '敵の右レーンに「ボーダーエンフォーサー(P:4, 初回攻撃不可)」配置',
    cost: 2,
  },
  enemy_leader_skill_change: {
    id: 'enemy_leader_skill_change',
    type: HANDICAP_TYPES.ENEMY_LEADER_SKILL_CHANGE,
    name: '相手のリーダースキル変更',
    cost: 3,
  },
};

// キャラクターごとの割り当て
export const CHAR_FORTUNE_HANDICAPS = {
  // マキナ
  automata: [
    HANDICAP_MASTER.ban_legend,
    HANDICAP_MASTER.ban_snipe,
    HANDICAP_MASTER.ban_heal,
    HANDICAP_MASTER.hp_minus_3,
    HANDICAP_MASTER.hp_minus_7,
    HANDICAP_MASTER.enemy_hp_plus_10,
    HANDICAP_MASTER.enemy_hp_plus_20,
    HANDICAP_MASTER.sp_plus_1,
    HANDICAP_MASTER.enemy_sp_minus_1,
    HANDICAP_MASTER.enemy_left_cop,
    HANDICAP_MASTER.enemy_right_cop,
    HANDICAP_MASTER.enemy_leader_skill_change,
  ],
  // アンジェ
  valkyria: [
    HANDICAP_MASTER.ban_legend,
    HANDICAP_MASTER.ban_sturdy,
    HANDICAP_MASTER.ban_dodge,
    HANDICAP_MASTER.hp_minus_3,
    HANDICAP_MASTER.hp_minus_7,
    HANDICAP_MASTER.enemy_hp_plus_10,
    HANDICAP_MASTER.enemy_hp_plus_20,
    HANDICAP_MASTER.sp_plus_1,
    HANDICAP_MASTER.enemy_sp_minus_1,
    HANDICAP_MASTER.enemy_left_cop,
    HANDICAP_MASTER.enemy_right_cop,
    HANDICAP_MASTER.enemy_leader_skill_change,
  ],
};

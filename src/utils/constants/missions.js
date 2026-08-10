/**
 * バトルボーナスの定義
 * 実際の判定ロジックは src/game/missionLogic.js に分離されています。
 */
export const CHALLENGE_MISSIONS = [
  {
    id: 'turn_10',
    name: '10ターン以内に勝利',
    points: 1,
    timing: 'end',
  },
  {
    id: 'hp_20',
    name: '自身のHPが20の状態で勝利',
    points: 1,
    timing: 'end',
  },
  {
    id: 'hp_5',
    name: '自身のHPが5以下の状態で勝利',
    points: 1,
    timing: 'end',
  },
  {
    id: 'damage_5_single',
    name: '一度の攻撃で相手に5ダメージ',
    points: 1,
    timing: 'instant',
  },
  {
    id: 'win_by_skill',
    name: '相手にダメージを与えるスキル・リーダースキルで勝利',
    points: 1,
    timing: 'end',
  },
  {
    id: 'play_sacrifice_apex',
    name: '生贄または頂点を持つカードを召喚',
    points: 1,
    timing: 'instant',
  },
  {
    id: 'play_golem',
    name: '「大理石のゴーレム」を召喚',
    points: 1,
    timing: 'instant',
  },
  {
    id: 'power_10',
    name: '自身のカードのパワーを10以上にする',
    points: 1,
    timing: 'instant',
  },
  {
    id: 'story_mode',
    name: 'ストーリーモードでプレイ',
    points: 2,
    timing: 'end',
  },
];

export const MISSION_POINTS_PER_PACK = 2;
export const MISSION_MAX_PACKS = 3;
export const MISSION_MAX_SCORE = MISSION_POINTS_PER_PACK * MISSION_MAX_PACKS;

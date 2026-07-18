/**
 * バトルボーナスの定義
 * 実際の判定ロジックは src/game/missionLogic.js に分離されています。
 */
export const CHALLENGE_MISSIONS = [
  {
    id: 'turn_10',
    name: '10ターン以内に勝利',
    desc: '10ターン以内に勝利する',
    points: 1,
    timing: 'end',
  },
  {
    id: 'hp_20',
    name: '自身のHPが20の状態で勝利',
    desc: 'ダメージを受けずに、または回復してライフ20以上で勝利する',
    points: 1,
    timing: 'end',
  },
  {
    id: 'hp_5',
    name: '自身のHPが5以下の状態で勝利',
    desc: 'ライフ5以下で勝利する',
    points: 1,
    timing: 'end',
  },
  {
    id: 'damage_5_single',
    name: '一度の攻撃で相手に5ダメージ',
    desc: '1回の攻撃・スキル等で相手に5以上のダメージを与える',
    points: 1,
    timing: 'instant',
  },
  {
    id: 'win_by_skill',
    name: '攻撃以外のダメージで勝利',
    desc: '攻撃以外のダメージで勝利する',
    points: 1,
    timing: 'end',
  },
  {
    id: 'sacrifice_apex_1',
    name: '生贄または頂点を持つカードを1回召喚',
    desc: '「生贄」または「頂点」を持つカードを1回以上プレイする',
    points: 1,
    timing: 'instant',
  },
  {
    id: 'play_golem',
    name: '「大理石のゴーレム」を召喚',
    desc: '「大理石のゴーレム」を召喚する',
    points: 1,
    timing: 'instant',
  },
  {
    id: 'power_10',
    name: '自身のカードのパワーを10以上にする',
    desc: '味方の場のカードパワーを10以上にする',
    points: 1,
    timing: 'instant',
  },
  {
    id: 'story_mode',
    name: 'ストーリーモードでプレイ',
    desc: 'ストーリーモードで勝利する',
    points: 2,
    timing: 'instant',
  },
];

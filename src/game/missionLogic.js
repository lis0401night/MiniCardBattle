import { hasSkill } from '../utils/gameUtils.js';
import { DAMAGE_PLAYER_SKILL_IDS } from '../utils/constants/skills.js';
import { DAMAGE_PLAYER_LEADER_SKILL_ACTIONS } from '../utils/constants/leaderSkills.js';

/**
 * 相手リーダーに直接ダメージを与える純粋な攻撃スキル・リーダースキルの発生源ID一覧
 */
const PURE_ATTACK_SKILL_SOURCES = [
  ...DAMAGE_PLAYER_SKILL_IDS,
  ...DAMAGE_PLAYER_LEADER_SKILL_ACTIONS,
];

/**
 * ボーナスの進捗をトラッキングするためのイベントハンドラ
 */

// カードプレイ時のトラッキング
export function trackMissionSacrifice(state, side, playingCard) {
  if (side === 'blue') {
    if (!state.missionProgress) state.missionProgress = {};
    if (hasSkill(playingCard, 'takeover') || hasSkill(playingCard, 'apex')) {
      state.missionProgress.sacrifice_count =
        (state.missionProgress.sacrifice_count || 0) + 1;
    }
    const cardId = playingCard.baseId || playingCard.id;
    if (cardId === 'golem') {
      state.missionProgress.played_golem = true;
    }
  }
}

// 場のカードパワーが10以上になったかどうかを追跡する
export function trackMissionPower(state) {
  if (state.playerBoard.some((c) => c && c.currentPower >= 10)) {
    if (!state.missionProgress) state.missionProgress = {};
    state.missionProgress.power_10 = true;
  }
}

// イベント配列からボーナス関連の情報をスキャンする
export function scanMissionEvents(state, events) {
  if (!state.missionProgress) state.missionProgress = {};

  // スキャン開始時の敵の仮想HP
  let virtualEnemyHP = state.enemyHP;
  let fatalDamageLogged = false;

  for (const ev of events) {
    if (ev.type === 'damage_player' && ev.side === 'red') {
      if (ev.amount >= 5) {
        state.missionProgress.damage_5_single = true;
      }

      // 仮想HPからダメージを減算
      virtualEnemyHP -= ev.amount;

      // 初めて敵HPが0以下になった（致死ダメージ）タイミングで、その発生源を記録
      if (virtualEnemyHP <= 0 && !fatalDamageLogged) {
        // 戦闘波及（一掃・貫通）や身代わり（憑依）ではなく、純粋な攻撃スキル・リーダースキルによるダメージであるかを判定
        const isPureSkill = PURE_ATTACK_SKILL_SOURCES.includes(ev.source);
        state.missionProgress.lastDamageSource = isPureSkill
          ? 'skill'
          : 'attack';
        fatalDamageLogged = true;
      }
    }
  }
}

/**
 * ボーナスの達成状況を評価する
 * @param {string} missionId - 評価するボーナスのID
 * @param {object} state - 現在のGameState
 * @returns {boolean} - 達成していればtrue
 */
export function evaluateMission(missionId, state) {
  switch (missionId) {
    case 'turn_10': {
      const playerTurnCount = Math.floor(
        (state.turnCount + (state.firstPlayer === 'blue' ? 1 : 0)) / 2
      );
      return playerTurnCount <= 10;
    }
    case 'hp_20':
      return state.playerHP >= 20;
    case 'hp_5':
      return state.playerHP <= 5;
    case 'damage_5_single':
      return state.missionProgress?.damage_5_single === true;
    case 'win_by_skill':
      return state.missionProgress?.lastDamageSource === 'skill';
    case 'sacrifice_apex_1':
      return (state.missionProgress?.sacrifice_count || 0) >= 1;
    case 'play_golem':
      return state.missionProgress?.played_golem === true;
    case 'power_10':
      if (state.missionProgress?.power_10) return true;
      return state.playerBoard.some(
        (c) => c && (c.currentPower ?? c.power) >= 10
      );
    case 'story_mode':
      return state.gameMode === 'story';
    default:
      return false;
  }
}

import { hasSkill } from '../utils/gameUtils.js';

/**
 * ミッションの進捗をトラッキングするためのイベントハンドラ
 */

// カードプレイ時のトラッキング
export function trackMissionSacrifice(state, side, playingCard) {
  if (side === 'blue') {
    if (!state.missionProgress) state.missionProgress = {};
    if (hasSkill(playingCard, 'takeover') || hasSkill(playingCard, 'apex')) {
      state.missionProgress.sacrifice_count = (state.missionProgress.sacrifice_count || 0) + 1;
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

// イベント配列からミッション関連の情報をスキャンする
export function scanMissionEvents(state, events) {
  if (!state.missionProgress) state.missionProgress = {};
  
  for (const ev of events) {
    if (ev.type === 'damage_player' && ev.side === 'red') {
      if (ev.amount >= 5) {
        state.missionProgress.damage_5_single = true;
      }
      state.missionProgress.lastDamageSource = ev.source === 'direct_attack' ? 'attack' : 'skill';
    }
  }
}

/**
 * ミッションの達成状況を評価する
 * @param {string} missionId - 評価するミッションのID
 * @param {object} state - 現在のGameState
 * @returns {boolean} - 達成していればtrue
 */
export function evaluateMission(missionId, state) {
  switch (missionId) {
    case 'turn_10': {
      const playerTurnCount = Math.floor((state.turnCount + (state.firstPlayer === 'blue' ? 1 : 0)) / 2);
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

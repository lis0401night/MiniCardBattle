// 運命の邂逅：特級目標ポイント報酬の計算ロジック
import { CHAR_FORTUNE_HANDICAPS, HANDICAP_MASTER } from './fortuneHandicaps.js';

// 達成レベルの閾値定義
export const FORTUNE_GRADE_THRESHOLDS = [
  { level: 0, min: 0, max: 0 },
  { level: 1, min: 1, max: 4 },
  { level: 2, min: 5, max: 9 },
  { level: 3, min: 10, max: 14 },
  { level: 4, min: 15, max: 19 },
  { level: 5, min: 20, max: 24 },
];

/**
 * 合計目標値からレベル（0～5）を判定する
 * @param {number} totalCost - 特級目標の合計コスト
 * @returns {number} 該当するレベル（0～5）
 */
export function getGradeLevel(totalCost) {
  for (let i = FORTUNE_GRADE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalCost >= FORTUNE_GRADE_THRESHOLDS[i].min) {
      return i;
    }
  }
  return 0;
}

/**
 * 運命の邂逅イベント勝利時に獲得するポイントを計算する
 *
 * @param {string} charId - 対戦相手キャラクターID
 * @param {Object} handicaps - 今回ONにした特級目標 { [handicapId]: true/false }
 * @param {Object} clearedHandicaps - これまでに達成済みの特級目標 { [handicapId]: true }
 * @param {number} clearedMaxGradeLevel - これまでの最大達成レベル（-1で未達成）
 * @returns {{ totalEarned: number, newClearedHandicaps: Object, newMaxGradeLevel: number, breakdown: Array }}
 */
export function calculateFortuneRewards(
  charId,
  handicaps,
  clearedHandicaps,
  clearedMaxGradeLevel,
  clearedMaxTotalCost = 0
) {
  const handicapList = CHAR_FORTUNE_HANDICAPS[charId] || [];
  let totalEarned = 0;
  const breakdown = [];
  const newClearedHandicaps = { ...clearedHandicaps };

  // 1. 初回達成報酬: 各ハンディキャップごとにcost分のポイント
  handicapList.forEach((h) => {
    if (!handicaps[h.id]) return; // 今回ONにしていない
    if (newClearedHandicaps[h.id]) return; // 既に達成済み

    // 初回達成：コストの3倍のポイントを付与 (獲得ポイント = コスト * 3)
    const master = HANDICAP_MASTER[h.id] || h;
    const cost = master.cost || 0;
    const earned = cost * 3;
    totalEarned += earned;
    newClearedHandicaps[h.id] = true;
    breakdown.push({
      type: 'handicap',
      id: h.id,
      name: master.name,
      points: earned,
    });
  });
  // 2. 達成レベル報酬: 今回の合計コストから該当レベルを判定
  let totalCost = 0;
  handicapList.forEach((h) => {
    if (handicaps[h.id]) {
      const master = HANDICAP_MASTER[h.id] || h;
      totalCost += master.cost || 0;
    }
  });

  const currentLevel = getGradeLevel(totalCost);
  const previousLevel = clearedMaxGradeLevel;

  // 最大達成レベルの判定のみ行い、クリア時の獲得ポイントには加算しない（レベルボーナスポイントは仕様上存在しない）

  return {
    totalEarned,
    newClearedHandicaps,
    newMaxGradeLevel: Math.max(currentLevel, previousLevel),
    newMaxTotalCost: Math.max(totalCost, clearedMaxTotalCost),
    currentTotalCost: totalCost,
    breakdown,
  };
}

/**
 * ローカルストレージから達成済み情報を読み込む
 * @param {string} charId - キャラクターID
 * @returns {{ clearedHandicaps: Object, maxGradeLevel: number }}
 */
export function loadFortuneClearedData(charId) {
  try {
    const dataKey = `mini_card_battle_fortune_cleared_data_${charId}`;
    const raw = localStorage.getItem(dataKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const clearedHandicaps = parsed.clearedHandicaps || {};
        let maxGradeLevel = parseInt(parsed.maxGradeLevel, 10);
        if (isNaN(maxGradeLevel)) maxGradeLevel = -1;
        let maxTotalCost = parseInt(parsed.maxTotalCost, 10);
        if (isNaN(maxTotalCost)) maxTotalCost = 0;
        return { clearedHandicaps, maxGradeLevel, maxTotalCost };
      }
    }
    return { clearedHandicaps: {}, maxGradeLevel: -1, maxTotalCost: 0 };
  } catch {
    return { clearedHandicaps: {}, maxGradeLevel: -1, maxTotalCost: 0 };
  }
}

/**
 * 達成済み情報をローカルストレージに保存する
 * @param {string} charId - キャラクターID
 * @param {Object} clearedHandicaps - 達成済み特級目標
 * @param {number} maxGradeLevel - 最大達成レベル
 */
export function saveFortuneClearedData(
  charId,
  clearedHandicaps,
  maxGradeLevel,
  maxTotalCost = 0
) {
  try {
    const dataKey = `mini_card_battle_fortune_cleared_data_${charId}`;
    const dataToSave = {
      clearedHandicaps: clearedHandicaps || {},
      maxGradeLevel: typeof maxGradeLevel === 'number' ? maxGradeLevel : -1,
      maxTotalCost: typeof maxTotalCost === 'number' ? maxTotalCost : 0,
    };
    localStorage.setItem(dataKey, JSON.stringify(dataToSave));
  } catch (e) {
    console.error('Failed to save fortune cleared data:', e);
  }
}

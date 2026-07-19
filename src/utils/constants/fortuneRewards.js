// 運命の邂逅：特級目標ポイント報酬の計算ロジック
import {
  CHAR_FORTUNE_HANDICAPS,
  HANDICAP_MASTER,
} from './fortuneHandicaps.js';

// 合計達成レベルの閾値とボーナス定義
// 各レベルにつき1回のみボーナスポイントが貰える
export const FORTUNE_GRADE_THRESHOLDS = [
  { level: 0, min: 0, max: 0, bonus: 3 },
  { level: 1, min: 1, max: 4, bonus: 3 },
  { level: 2, min: 5, max: 9, bonus: 3 },
  { level: 3, min: 10, max: 14, bonus: 3 },
  { level: 4, min: 15, max: 19, bonus: 3 },
  { level: 5, min: 20, max: 24, bonus: 3 },
];

/**
 * 合計目標値からレベル（0～4）を判定する
 * @param {number} totalCost - 特級目標の合計コスト
 * @returns {number} 該当するレベル（0～4）
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
  clearedMaxGradeLevel
) {
  const handicapList = CHAR_FORTUNE_HANDICAPS[charId] || [];
  let totalEarned = 0;
  const breakdown = [];
  const newClearedHandicaps = { ...clearedHandicaps };

  // 1. 初回達成報酬: 各ハンディキャップごとにcost分のポイント
  handicapList.forEach((h) => {
    if (!handicaps[h.id]) return; // 今回ONにしていない
    if (newClearedHandicaps[h.id]) return; // 既に達成済み

    // 初回達成：コストと同じポイントを付与
    const master = HANDICAP_MASTER[h.id] || h;
    const earned = master.cost || 0;
    totalEarned += earned;
    newClearedHandicaps[h.id] = true;
    breakdown.push({
      type: 'handicap',
      id: h.id,
      name: master.name,
      points: earned,
    });
  });

  // 2. 合計達成レベル報酬: 今回の合計コストから該当レベルを判定
  let totalCost = 0;
  handicapList.forEach((h) => {
    if (handicaps[h.id]) {
      const master = HANDICAP_MASTER[h.id] || h;
      totalCost += master.cost || 0;
    }
  });

  const currentLevel = getGradeLevel(totalCost);
  const previousLevel = clearedMaxGradeLevel;

  // 今回達成したレベルが過去の最大レベルを超えている場合、差分レベル数分のボーナスを付与
  if (currentLevel > previousLevel) {
    for (let lv = previousLevel + 1; lv <= currentLevel; lv++) {
      const threshold = FORTUNE_GRADE_THRESHOLDS[lv];
      if (threshold) {
        totalEarned += threshold.bonus;
        breakdown.push({
          type: 'grade',
          level: lv,
          label: `Lv.${lv}(${threshold.min}～${threshold.max}pt)`,
          points: threshold.bonus,
        });
      }
    }
  }

  return {
    totalEarned,
    newClearedHandicaps,
    newMaxGradeLevel: Math.max(currentLevel, previousLevel),
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
    const clearedKey = `mini_card_battle_fortune_cleared_${charId}`;
    const gradeKey = `mini_card_battle_fortune_max_grade_${charId}`;
    const clearedRaw = localStorage.getItem(clearedKey);
    const gradeRaw = localStorage.getItem(gradeKey);

    return {
      clearedHandicaps: clearedRaw ? JSON.parse(clearedRaw) : {},
      maxGradeLevel: gradeRaw !== null ? parseInt(gradeRaw, 10) : -1,
    };
  } catch {
    return { clearedHandicaps: {}, maxGradeLevel: -1 };
  }
}

/**
 * 達成済み情報をローカルストレージに保存する
 * @param {string} charId - キャラクターID
 * @param {Object} clearedHandicaps - 達成済み特級目標
 * @param {number} maxGradeLevel - 最大達成レベル
 */
export function saveFortuneClearedData(charId, clearedHandicaps, maxGradeLevel) {
  const clearedKey = `mini_card_battle_fortune_cleared_${charId}`;
  const gradeKey = `mini_card_battle_fortune_max_grade_${charId}`;
  localStorage.setItem(clearedKey, JSON.stringify(clearedHandicaps));
  localStorage.setItem(gradeKey, String(maxGradeLevel));
}

/**
 * Mini Card Battle - マッチング時間帯集計ユーティリティ
 *
 * クイックマッチなどの対戦ログから、日ごとの時間帯別割合を平均化して
 * 24時間（0時〜23時）のマッチング分布を算出します。
 */

/** 1日の時間帯数（24時間） */
export const HOURS_PER_DAY = 24;

/**
 * 空のマッチング時間帯集計結果オブジェクトを生成します。
 * @returns {{
 *   percentages: number[],
 *   dailyAvgCounts: number[],
 *   totalBattles: number,
 *   validDaysCount: number,
 *   peakHour: number,
 *   peakPercentage: number
 * }} 空の集計結果オブジェクト
 */
export function createEmptyHourlyResult() {
  return {
    percentages: Array(HOURS_PER_DAY).fill(0),
    dailyAvgCounts: Array(HOURS_PER_DAY).fill(0),
    totalBattles: 0,
    validDaysCount: 0,
    peakHour: 0,
    peakPercentage: 0,
  };
}

/**
 * 対戦履歴ログから日ごとの時間帯別平均割合を算出する計算関数
 *
 * 【重要計算仕様】
 * 「全ての日で時間帯毎に平均を出したうえで合算する」
 * 特定の日（当日やイベント日等）に試合数が偏っていても均等に評価できるよう、
 * 各日ごとに時間帯別の割合 (その日の該当時間試合数 / その日の総試合数) を算出した上で、
 * 全有効日数で平均を取り、24時間の合計が100%となる正規化された分布率を求めます。
 *
 * @param {Array<Object>} battles - サーバーから取得した対戦履歴レコード配列
 * @returns {{
 *   percentages: number[],
 *   dailyAvgCounts: number[],
 *   totalBattles: number,
 *   validDaysCount: number,
 *   peakHour: number,
 *   peakPercentage: number
 * }} 集計結果オブジェクト
 */
export function calculateHourlyAverages(battles) {
  if (!Array.isArray(battles) || battles.length === 0) {
    return createEmptyHourlyResult();
  }

  // 1. 日付ごとに各時間帯の試合数を集計
  /** @type {Record<string, { total: number, hours: number[] }>} */
  const dailyData = {};
  let totalValidBattles = 0;

  for (const battle of battles) {
    if (!battle || typeof battle.timestamp !== 'number') continue;

    // timestamp（秒）をローカル日時に変換
    const date = new Date(battle.timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    const hour = date.getHours();

    if (hour < 0 || hour >= HOURS_PER_DAY) continue;

    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        total: 0,
        hours: Array(HOURS_PER_DAY).fill(0),
      };
    }

    dailyData[dateKey].hours[hour]++;
    dailyData[dateKey].total++;
    totalValidBattles++;
  }

  const daysList = Object.values(dailyData).filter((d) => d.total > 0);
  const validDaysCount = daysList.length;

  if (validDaysCount === 0) {
    return createEmptyHourlyResult();
  }

  // 2. 全ての日で時間帯ごとの比率（割合）を算出し、全日数で平均化
  const percentages = Array(HOURS_PER_DAY).fill(0);
  const dailyAvgCounts = Array(HOURS_PER_DAY).fill(0);

  for (let h = 0; h < HOURS_PER_DAY; h++) {
    let sumRatio = 0;
    let sumCount = 0;
    for (const d of daysList) {
      sumRatio += d.hours[h] / d.total;
      sumCount += d.hours[h];
    }
    percentages[h] = (sumRatio / validDaysCount) * 100;
    dailyAvgCounts[h] = sumCount / validDaysCount;
  }

  // 3. 最も集中しているピーク時間帯の特定
  let peakHour = 0;
  let maxPct = -1;
  for (let h = 0; h < HOURS_PER_DAY; h++) {
    if (percentages[h] > maxPct) {
      maxPct = percentages[h];
      peakHour = h;
    }
  }

  return {
    percentages,
    dailyAvgCounts,
    totalBattles: totalValidBattles,
    validDaysCount,
    peakHour,
    peakPercentage: maxPct > 0 ? maxPct : 0,
  };
}

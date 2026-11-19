/**
 * Mini Card Battle - バトルパス定数およびユーティリティモジュール
 *
 * バトルパスのマスターデータ定義、解放状況の管理、ポイント加算・取得、
 * およびクイックマッチ勝利時のレート加算・サーバー同期処理を一元管理します。
 */

import { savePointsToServer, addCommonPoints } from '../apiUtils.js';
import { addShineTickets, safeParseArray } from '../gameUtils.js';
import {
  INVENTORY_KEY,
  UNLOCKED_PREMIUM_KEY,
  UNLOCKED_SKINS_KEY,
  UNLOCKED_ICONS_KEY,
  OWNED_PLAYMATS_KEY,
} from './config.js';
import { setOwnedPlaymats } from './playmats.js';
import { GameState } from '../../state/gameState.js';

/** 解放済みバトルパスIDリストのLocalStorage保存キー */
export const UNLOCKED_BATTLE_PASSES_KEY =
  'mini_card_battle_unlocked_battle_passes';

/** 現在「進行中」に設定されているバトルパスIDのLocalStorage保存キー */
export const SELECTED_BATTLE_PASS_KEY = 'mini_card_battle_selected_battle_pass';

/** クイックマッチレートのLocalStorage保存キー */
export const QUICK_RATING_KEY = 'mini_card_battle_quick_rating';

/** バトルパスのポイントLocalStorageキー接頭辞 */
export const BATTLE_PASS_POINTS_KEY_PREFIX =
  'mini_card_battle_battle_pass_points_';

/** バトルパス報酬受取済みレベルリストのLocalStorageキー接頭辞 */
export const BATTLE_PASS_CLAIMED_LEVELS_KEY_PREFIX =
  'mini_card_battle_battle_pass_claimed_levels_';

/** クイックマッチ勝利時の獲得ポイント（対人戦: 3pt） */
export const QUICK_WIN_POINTS_PVP = 3;

/** クイックマッチ勝利時の獲得ポイント（CPU戦: 1pt） */
export const QUICK_WIN_POINTS_CPU = 1;

/** バトルパスS1の達成段階（15段階: 10, 20, 30, ..., 150） */
export const BATTLE_PASS_S1_LEVEL_THRESHOLDS = Object.freeze([
  {
    level: 1,
    points: 10,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'royalguard',
    rewardDisplayName: '帝国近衛兵',
  },
  {
    level: 2,
    points: 20,
    rewardName: '共通ポイント20Pt',
    rewardType: 'common_points',
    rewardId: 'common_points',
    rewardDisplayName: '共通ポイント 20Pt',
    count: 20,
  },
  {
    level: 3,
    points: 30,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'ghoul',
    rewardDisplayName: '堕ちたる審問官',
  },
  {
    level: 4,
    points: 40,
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  {
    level: 5,
    points: 50,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'gorilla',
    rewardDisplayName: 'ゴリラの族長',
  },
  {
    level: 6,
    points: 60,
    rewardName: '共通ポイント20Pt',
    rewardType: 'common_points',
    rewardId: 'common_points',
    rewardDisplayName: '共通ポイント 20Pt',
    count: 20,
  },
  {
    level: 7,
    points: 70,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'omnipotent',
    rewardDisplayName: '全知のウィザード',
  },
  {
    level: 8,
    points: 80,
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  {
    level: 9,
    points: 90,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'warriormonk',
    rewardDisplayName: '残光の守護者',
  },
  {
    level: 10,
    points: 100,
    rewardName: '共通ポイント20Pt',
    rewardType: 'common_points',
    rewardId: 'common_points',
    rewardDisplayName: '共通ポイント 20Pt',
    count: 20,
  },
  {
    level: 11,
    points: 110,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'yasha',
    rewardDisplayName: '黒夜叉',
  },
  {
    level: 12,
    points: 120,
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  {
    level: 13,
    points: 130,
    rewardName: 'スキン',
    rewardType: 'skin',
    rewardId: 'knight_assassin',
    rewardDisplayName: 'ギルドの暗殺者 レダ',
  },
  {
    level: 14,
    points: 140,
    rewardName: 'プレイマット',
    rewardType: 'playmat',
    rewardId: 'pm_knight_assassin',
    rewardDisplayName: 'レダ',
  },
  {
    level: 15,
    points: 150,
    rewardName: 'アイコン',
    rewardType: 'icon',
    rewardId: 'knight_assassin',
    rewardDisplayName: 'レダ',
  },
]);

/** バトルパスS2の達成段階（15段階: 10, 20, 30, ..., 150） */
export const BATTLE_PASS_S2_LEVEL_THRESHOLDS = Object.freeze([
  {
    level: 1,
    points: 10,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'laser',
    rewardDisplayName: '航空支援',
  },
  {
    level: 2,
    points: 20,
    rewardName: '共通ポイント20Pt',
    rewardType: 'common_points',
    rewardId: 'common_points',
    rewardDisplayName: '共通ポイント 20Pt',
    count: 20,
  },
  {
    level: 3,
    points: 30,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'gammaray',
    rewardDisplayName: '眼魔の霊',
  },
  {
    level: 4,
    points: 40,
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  {
    level: 5,
    points: 50,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'mercenaryleader',
    rewardDisplayName: '傭兵隊長',
  },
  {
    level: 6,
    points: 60,
    rewardName: '共通ポイント20Pt',
    rewardType: 'common_points',
    rewardId: 'common_points',
    rewardDisplayName: '共通ポイント 20Pt',
    count: 20,
  },
  {
    level: 7,
    points: 70,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'prototype',
    rewardDisplayName: '革命派の試作機',
  },
  {
    level: 8,
    points: 80,
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  {
    level: 9,
    points: 90,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'predator',
    rewardDisplayName: 'クロコダイル',
  },
  {
    level: 10,
    points: 100,
    rewardName: '共通ポイント20Pt',
    rewardType: 'common_points',
    rewardId: 'common_points',
    rewardDisplayName: '共通ポイント 20Pt',
    count: 20,
  },
  {
    level: 11,
    points: 110,
    rewardName: 'プレミアム',
    rewardType: 'premium',
    rewardId: 'archangel',
    rewardDisplayName: '再誕のアークエンジェル',
  },
  {
    level: 12,
    points: 120,
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  {
    level: 13,
    points: 130,
    rewardName: 'スキン',
    rewardType: 'skin',
    rewardId: 'cleric_empress',
    rewardDisplayName: '蒼穹の審判者 アストレア',
  },
  {
    level: 14,
    points: 140,
    rewardName: 'プレイマット',
    rewardType: 'playmat',
    rewardId: 'pm_cleric_empress',
    rewardDisplayName: 'アストレア',
  },
  {
    level: 15,
    points: 150,
    rewardName: 'アイコン',
    rewardType: 'icon',
    rewardId: 'cleric_empress',
    rewardDisplayName: 'アストレア',
  },
]);

/** 既存コード・互換用エイリアス（デフォルトはS1の達成段階） */
export const BATTLE_PASS_LEVEL_THRESHOLDS = BATTLE_PASS_S1_LEVEL_THRESHOLDS;

/**
 * バトルパスマスターデータ定義一覧
 * 各シーズン（S1, S2等）ごとに固有のID・最大ポイント・報酬段階リストを保持します。
 *
 * @type {ReadonlyArray<{
 *   id: string,
 *   name: string,
 *   description: string,
 *   cost: number,
 *   maxPoints: number,
 *   imgUrl: string,
 *   thumbUrl: string,
 *   levels: ReadonlyArray<Object>
 * }>}
 */
export const BATTLE_PASS_MASTER = Object.freeze([
  {
    id: 'battle_pass_vol1',
    name: 'バトルパス S1',
    description:
      'クイックマッチで勝利してポイントを貯め、様々な報酬を獲得できるバトルパス。',
    cost: 30,
    maxPoints: 150,
    imgUrl: 'assets/characters/char_knight_assassin.webp',
    thumbUrl: 'assets/characters/char_knight_assassin_thumb.webp',
    levels: BATTLE_PASS_S1_LEVEL_THRESHOLDS,
  },
  {
    id: 'battle_pass_vol2',
    name: 'バトルパス S2',
    description:
      'クイックマッチで勝利してポイントを貯め、様々な報酬を獲得できるバトルパス。',
    cost: 30,
    maxPoints: 150,
    imgUrl: 'assets/characters/char_cleric_empress.webp',
    thumbUrl: 'assets/characters/char_cleric_empress_thumb.webp',
    levels: BATTLE_PASS_S2_LEVEL_THRESHOLDS,
  },
]);

/**
 * 現在実装されている全バトルパスの最大ポイント合計（クイックマッチレートの上限キャップ）を取得する。
 * 次シーズン分の過剰な先回り貯金を防ぐため、全パスの maxPoints 合計をレートの上限とします。
 *
 * @returns {number} クイックマッチレートの上限値（S1+S2時は300）
 */
export function getMaxQuickRatingCap() {
  return BATTLE_PASS_MASTER.reduce(
    (sum, pass) => sum + (pass.maxPoints || 0),
    0
  );
}

/**
 * 指定したIDのバトルパスマスターデータを取得する
 * @param {string} passId - バトルパスID
 * @returns {Object|null} バトルパス定義オブジェクト
 */
export function getBattlePassById(passId) {
  if (!passId) return null;
  return BATTLE_PASS_MASTER.find((p) => p.id === passId) || null;
}

/**
 * プレイヤーが解放済みのバトルパスID一覧を取得する
 * @returns {string[]} 解放済みバトルパスID配列
 */
export function getUnlockedBattlePasses() {
  try {
    return safeParseArray(UNLOCKED_BATTLE_PASSES_KEY);
  } catch {
    return [];
  }
}

/**
 * 指定したバトルパスが解放済みかどうかを判定する
 * @param {string} passId - バトルパスID
 * @returns {boolean} 解放済みならtrue
 */
export function checkIsBattlePassUnlocked(passId) {
  if (!passId) return false;
  const unlocked = getUnlockedBattlePasses();
  return unlocked.includes(passId);
}

/**
 * 現在のクイックマッチレートを取得する（全バトルパス合計ポイントの上限キャップ適用済み）
 * @returns {number} 現在のレート数値
 */
export function getQuickRating() {
  try {
    const raw = localStorage.getItem(QUICK_RATING_KEY);
    const val = raw !== null ? parseInt(raw, 10) || 0 : 0;
    return Math.max(0, Math.min(getMaxQuickRatingCap(), val));
  } catch {
    return 0;
  }
}

/**
 * クイックマッチレートを設定・保存する（全バトルパス合計ポイントの上限キャップ適用）
 * @param {number} rating - 設定するレート数値
 * @returns {void}
 */
export function setQuickRating(rating) {
  const cap = getMaxQuickRatingCap();
  const safeRating = Math.max(
    0,
    Math.min(cap, Math.floor(Number(rating) || 0))
  );
  localStorage.setItem(QUICK_RATING_KEY, String(safeRating));
}

/**
 * 指定したバトルパスの保存済みポイントを同期処理なしで直接取得する
 * @param {string} passId - バトルパスID
 * @returns {number} 保存済みのバトルパスポイント（0〜maxPoints）
 */
export function getRawBattlePassPoints(passId) {
  if (!passId) return 0;
  try {
    const raw = localStorage.getItem(
      `${BATTLE_PASS_POINTS_KEY_PREFIX}${passId}`
    );
    const val = raw !== null ? parseInt(raw, 10) || 0 : 0;
    const pass = getBattlePassById(passId);
    const maxPts = pass?.maxPoints ?? Infinity;
    return Math.max(0, Math.min(maxPts, val));
  } catch {
    return 0;
  }
}

/**
 * 指定したバトルパスのポイントを設定・保存する
 * @param {string} passId - バトルパスID
 * @param {number} points - 設定するポイント数値
 * @returns {void}
 */
export function setBattlePassPoints(passId, points) {
  if (!passId) return;
  const pass = getBattlePassById(passId);
  const maxPts = pass?.maxPoints ?? Infinity;
  const safePoints = Math.max(
    0,
    Math.min(maxPts, Math.floor(Number(points) || 0))
  );
  localStorage.setItem(
    `${BATTLE_PASS_POINTS_KEY_PREFIX}${passId}`,
    String(safePoints)
  );
}

/**
 * 全バトルパスに既に割り当て済みのポイント合計を取得する
 * @returns {number} 全パスの現在ポイント合計
 */
export function getTotalAllocatedBattlePassPoints() {
  return BATTLE_PASS_MASTER.reduce(
    (sum, pass) => sum + getRawBattlePassPoints(pass.id),
    0
  );
}

/**
 * まだどのバトルパスにも同期・割り当てされていない未同期のクイックマッチレートを取得する
 * @returns {number} 未同期レートポイント（0以上）
 */
export function getUnallocatedQuickRating() {
  return Math.max(0, getQuickRating() - getTotalAllocatedBattlePassPoints());
}

/**
 * 現在「進行中」に設定されている有効なバトルパスIDを取得する。
 * 未設定、または未解放・存在しないパスIDが保存されている場合は null を返します。
 *
 * @returns {string|null} 進行中のバトルパスID（未設定時はnull）
 */
export function getSelectedBattlePassId() {
  try {
    const raw = localStorage.getItem(SELECTED_BATTLE_PASS_KEY);
    if (!raw) return null;
    if (!getBattlePassById(raw)) return null;
    if (!checkIsBattlePassUnlocked(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * 現在「進行中」に設定されているバトルパスに対し、未同期のクイックマッチレート分を充当・同期する。
 * 進行中パスが未設定の場合は同期を行いません。
 *
 * @returns {{
 *   passId: string|null,
 *   previousPoints: number,
 *   syncedPoints: number,
 *   newPoints: number,
 *   remainingUnallocated: number
 * }} 同期結果オブジェクト
 */
export function syncSelectedBattlePassWithRating() {
  const selectedId = getSelectedBattlePassId();
  const unallocated = getUnallocatedQuickRating();

  if (!selectedId) {
    return {
      passId: null,
      previousPoints: 0,
      syncedPoints: 0,
      newPoints: 0,
      remainingUnallocated: unallocated,
    };
  }

  const pass = getBattlePassById(selectedId);
  const maxPts = pass?.maxPoints ?? 150;
  const prevPts = getRawBattlePassPoints(selectedId);
  const capacity = Math.max(0, maxPts - prevPts);
  const syncedDelta = Math.min(capacity, unallocated);
  const newPts = prevPts + syncedDelta;

  if (syncedDelta > 0) {
    setBattlePassPoints(selectedId, newPts);
  }

  return {
    passId: selectedId,
    previousPoints: prevPts,
    syncedPoints: syncedDelta,
    newPoints: newPts,
    remainingUnallocated: Math.max(0, unallocated - syncedDelta),
  };
}

/**
 * 指定した解放済みバトルパスを「進行中」に設定し、未同期レート分を即座に同期する。
 *
 * @param {string} passId - 進行中に設定するバトルパスID
 * @returns {{
 *   success: boolean,
 *   passId: string|null,
 *   previousPoints: number,
 *   syncedPoints: number,
 *   newPoints: number,
 *   remainingUnallocated: number
 * }} 設定および同期結果オブジェクト
 */
export function setSelectedBattlePass(passId) {
  if (
    !passId ||
    !getBattlePassById(passId) ||
    !checkIsBattlePassUnlocked(passId)
  ) {
    return {
      success: false,
      passId: null,
      previousPoints: 0,
      syncedPoints: 0,
      newPoints: 0,
      remainingUnallocated: getUnallocatedQuickRating(),
    };
  }

  localStorage.setItem(SELECTED_BATTLE_PASS_KEY, passId);
  const syncRes = syncSelectedBattlePassWithRating();

  return {
    success: true,
    ...syncRes,
  };
}

/**
 * 指定したバトルパスのポイントをレートと同期する（進行中に設定されているパスのみ未同期分を反映）。
 * 進行中でないパスに対しては勝手なレート充当を行わず、保存済みポイントをそのまま返します。
 *
 * @param {string} passId - 対象のバトルパスID
 * @returns {number} 同期後のバトルパスポイント
 */
export function syncBattlePassPointsWithRating(passId) {
  if (!passId) return 0;
  if (passId === getSelectedBattlePassId()) {
    return syncSelectedBattlePassWithRating().newPoints;
  }
  return getRawBattlePassPoints(passId);
}

/**
 * 現在「進行中」に設定されているバトルパスのみ未同期レートを反映し、
 * 解放済み全バトルパスの最新ポイント一覧を返します。
 *
 * @returns {Array<{ id: string, points: number }>} 各バトルパスIDとポイント配列
 */
export function syncAllBattlePassesWithRating() {
  syncSelectedBattlePassWithRating();
  const unlockedPassIds = getUnlockedBattlePasses();
  return unlockedPassIds.map((passId) => ({
    id: passId,
    points: getRawBattlePassPoints(passId),
  }));
}

/**
 * バトルパスを解放してLocalStorageに保存する。
 * 意図しないパスへのレート自動消費を防ぐため、解放時点ではレート同期を行わず 0 Pt のままとし、
 * プレイヤーがバトルパス画面で「進行中に設定」したタイミングでレート同期を実行します。
 *
 * @param {string} passId - 解放するバトルパスID
 * @returns {boolean} 新規に解放された場合はtrue、既に解放済みの場合はfalse
 */
export function unlockBattlePass(passId) {
  if (!passId) return false;
  const current = getUnlockedBattlePasses();
  if (current.includes(passId)) return false;

  const next = [...current, passId];
  localStorage.setItem(UNLOCKED_BATTLE_PASSES_KEY, JSON.stringify(next));
  return true;
}

/**
 * 指定したバトルパスの現在蓄積ポイントを取得する。
 * 現在「進行中」に設定されているパスの場合は、未同期レート分を反映した最新値を返します。
 *
 * @param {string} passId - バトルパスID
 * @returns {number} 現在のバトルパスポイント
 */
export function getBattlePassPoints(passId) {
  return syncBattlePassPointsWithRating(passId);
}

/**
 * クイックマッチ勝利時のレート加算および進行中バトルパスへのポイント同期処理。
 * レートには実装済み全バトルパスの合計上限キャップ（S1+S2時は300Pt）を適用し、
 * 現在「進行中」に設定されているバトルパスがある場合のみ未同期増分を反映します。
 *
 * @param {boolean} isCpu - CPU対戦での勝利かどうか（CPUなら1pt、人なら3pt）
 * @returns {{ earnedPoints: number, newRating: number, updatedPasses: Array<{ id: string, points: number }> }} 加算結果オブジェクト
 */
export function recordQuickMatchWin(isCpu) {
  const earnedPoints = isCpu ? QUICK_WIN_POINTS_CPU : QUICK_WIN_POINTS_PVP;

  // 1. レートの加算（全バトルパスの合計ポイントを上限としてキャップ）
  const curRating = getQuickRating();
  const newRating = Math.min(getMaxQuickRatingCap(), curRating + earnedPoints);
  setQuickRating(newRating);

  // 2. 現在「進行中」に設定されているバトルパスがあれば未同期分を同期
  const updatedPasses = [];
  const syncRes = syncSelectedBattlePassWithRating();
  if (syncRes.passId) {
    updatedPasses.push({ id: syncRes.passId, points: syncRes.newPoints });
  }

  // 3. サーバーへレート情報を非同期送信（ランキング用）
  savePointsToServer('update_quick_rating.php', newRating, newRating, {
    quick_rating: newRating,
  }).catch((e) => {
    console.warn('[BattlePass] update_quick_rating server sync failed:', e);
  });

  return {
    earnedPoints,
    newRating,
    updatedPasses,
  };
}

/**
 * 指定したバトルパスの受取済みレベル一覧を取得する
 * @param {string} passId - バトルパスID
 * @returns {number[]} 受取済みレベル番号の配列
 */
export function getBattlePassClaimedLevels(passId) {
  if (!passId) return [];
  try {
    return safeParseArray(`${BATTLE_PASS_CLAIMED_LEVELS_KEY_PREFIX}${passId}`);
  } catch {
    return [];
  }
}

/**
 * 指定したバトルパスの特定レベルを受取済みに設定する
 * @param {string} passId - バトルパスID
 * @param {number} level - 受取済みにするレベル番号
 * @returns {number[]} 更新後の受取済みレベル番号の配列
 */
export function setBattlePassLevelClaimed(passId, level) {
  if (!passId || !level) return [];
  const current = getBattlePassClaimedLevels(passId);
  if (!current.includes(level)) {
    const next = [...current, level];
    localStorage.setItem(
      `${BATTLE_PASS_CLAIMED_LEVELS_KEY_PREFIX}${passId}`,
      JSON.stringify(next)
    );
    return next;
  }
  return current;
}

/**
 * 達成レベルに応じた個別報酬を解放・付与する
 * @param {Object} threshold - 達成レベル定義オブジェクト
 * @returns {void}
 */
export function claimLevelReward(threshold) {
  if (!threshold || !threshold.rewardType) return;

  try {
    if (threshold.rewardType === 'skin') {
      const current = safeParseArray(UNLOCKED_SKINS_KEY);
      if (!current.includes(threshold.rewardId)) {
        current.push(threshold.rewardId);
        localStorage.setItem(UNLOCKED_SKINS_KEY, JSON.stringify(current));
      }
      if (typeof GameState !== 'undefined') {
        if (!GameState.unlockedSkins) GameState.unlockedSkins = [];
        if (!GameState.unlockedSkins.includes(threshold.rewardId)) {
          GameState.unlockedSkins.push(threshold.rewardId);
        }
      }
    } else if (threshold.rewardType === 'playmat') {
      const current = safeParseArray(OWNED_PLAYMATS_KEY);
      if (!current.includes(threshold.rewardId)) {
        current.push(threshold.rewardId);
        localStorage.setItem(OWNED_PLAYMATS_KEY, JSON.stringify(current));
      }
      if (typeof GameState !== 'undefined') {
        if (!GameState.ownedPlaymats) GameState.ownedPlaymats = [];
        if (!GameState.ownedPlaymats.includes(threshold.rewardId)) {
          GameState.ownedPlaymats.push(threshold.rewardId);
        }
        setOwnedPlaymats(current);
      }
    } else if (threshold.rewardType === 'icon') {
      const current = safeParseArray(UNLOCKED_ICONS_KEY);
      if (!current.includes(threshold.rewardId)) {
        current.push(threshold.rewardId);
        localStorage.setItem(UNLOCKED_ICONS_KEY, JSON.stringify(current));
      }
      if (typeof GameState !== 'undefined') {
        if (!GameState.unlockedIcons) GameState.unlockedIcons = [];
        if (!GameState.unlockedIcons.includes(threshold.rewardId)) {
          GameState.unlockedIcons.push(threshold.rewardId);
        }
      }
    } else if (threshold.rewardType === 'shine_ticket') {
      addShineTickets(threshold.count || 1);
    } else if (threshold.rewardType === 'common_points') {
      addCommonPoints(threshold.count || 20);
    } else if (threshold.rewardType === 'premium') {
      const cardId = threshold.rewardId;
      // 1. 解放済みプレミアムリスト（UNLOCKED_PREMIUM_KEY）に追加・永続化
      const currentUnlocked = safeParseArray(UNLOCKED_PREMIUM_KEY);
      if (!currentUnlocked.includes(cardId)) {
        currentUnlocked.push(cardId);
        localStorage.setItem(
          UNLOCKED_PREMIUM_KEY,
          JSON.stringify(currentUnlocked)
        );
      }
      if (typeof GameState !== 'undefined') {
        if (!GameState.unlockedPremiumCards)
          GameState.unlockedPremiumCards = [];
        if (!GameState.unlockedPremiumCards.includes(cardId)) {
          GameState.unlockedPremiumCards.push(cardId);
        }

        // 2. プレミアム表示の自動有効化（デッキ・一覧でプレミアム絵柄を即時反映）
        const currentActive = safeParseArray('mini_card_battle_premium_cards');
        if (!currentActive.includes(cardId)) {
          currentActive.push(cardId);
          localStorage.setItem(
            'mini_card_battle_premium_cards',
            JSON.stringify(currentActive)
          );
        }
        if (!GameState.premiumCards) GameState.premiumCards = [];
        if (!GameState.premiumCards.includes(cardId)) {
          GameState.premiumCards.push(cardId);
        }

        // 3. インベントリ未所持カードの場合は初期所持数1枚を保証
        if (GameState.playerInventory) {
          const owned = GameState.playerInventory[cardId] || 0;
          if (owned <= 0) {
            GameState.playerInventory[cardId] = 1;
            localStorage.setItem(
              INVENTORY_KEY,
              JSON.stringify(GameState.playerInventory)
            );
          }
        }
      }
    }
  } catch (e) {
    console.error('報酬解放処理エラー:', e);
  }
}

/**
 * バトルパスを全レベル達成状態にする（デバッグ・イースターエッグ用）
 * ポイントを最大値（150pt）に設定して全レベル達成状態とし、受取ボタンを押せるようにします。
 * 既に受取済みの場合でもテストできるよう受取済み状態をリセットします。
 *
 * @param {string} [passId='battle_pass_vol1'] - バトルパスID
 * @returns {{ currentPoints: number, claimedLevels: number[] }} 最新状態オブジェクト
 */
export function unlockAllBattlePass(passId = 'battle_pass_vol1') {
  // 本番環境（プロダクション）では安全のため実行を無効化
  if (!import.meta.env.DEV) {
    return {
      currentPoints: getBattlePassPoints(passId),
      claimedLevels: getBattlePassClaimedLevels(passId),
    };
  }

  // 1. バトルパス自体を未アンロックならアンロック
  unlockBattlePass(passId);

  // 2. ポイントを最大値（対象パスの maxPoints または 150pt）に設定
  const pass = getBattlePassById(passId);
  const targetMax = pass?.maxPoints || 150;
  setBattlePassPoints(passId, targetMax);

  // デバッグ時の未同期レート計算不整合を防ぐため、全パス合計を下回っていればレートも引き上げる
  const totalAllocated = getTotalAllocatedBattlePassPoints();
  if (getQuickRating() < totalAllocated) {
    setQuickRating(totalAllocated);
  }

  // 3. 受取ボタンを押せるようにするため、受取済みリストを未受取（空配列）にリセット
  localStorage.setItem(
    `${BATTLE_PASS_CLAIMED_LEVELS_KEY_PREFIX}${passId}`,
    JSON.stringify([])
  );

  return {
    currentPoints: targetMax,
    claimedLevels: [],
  };
}

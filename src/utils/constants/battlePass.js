/**
 * Mini Card Battle - バトルパス定数およびユーティリティモジュール
 *
 * バトルパスのマスターデータ定義、解放状況の管理、ポイント加算・取得、
 * およびクイックマッチ勝利時のレート加算・サーバー同期処理を一元管理します。
 */

import { savePointsToServer } from '../apiUtils.js';
import { addShineTickets, safeParseArray } from '../gameUtils.js';
import {
  UNLOCKED_SKINS_KEY,
  UNLOCKED_ICONS_KEY,
  OWNED_PLAYMATS_KEY,
} from './config.js';
import { setOwnedPlaymats } from './playmats.js';
import { GameState } from '../../state/gameState.js';

/** 解放済みバトルパスIDリストのLocalStorage保存キー */
export const UNLOCKED_BATTLE_PASSES_KEY =
  'mini_card_battle_unlocked_battle_passes';

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
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  { level: 2, points: 20, rewardName: '準備中' },
  {
    level: 3,
    points: 30,
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  { level: 4, points: 40, rewardName: '準備中' },
  {
    level: 5,
    points: 50,
    rewardName: 'シャインチケット',
    rewardType: 'shine_ticket',
    rewardId: 'shine_ticket',
    rewardDisplayName: 'シャインチケット',
    count: 1,
  },
  { level: 6, points: 60, rewardName: '準備中' },
  { level: 7, points: 70, rewardName: '準備中' },
  {
    level: 8,
    points: 80,
    rewardName: 'スキン',
    rewardType: 'skin',
    rewardId: 'knight_assassin',
    rewardDisplayName: 'ギルドの暗殺者 レダ',
  },
  {
    level: 9,
    points: 90,
    rewardName: 'プレイマット',
    rewardType: 'playmat',
    rewardId: 'pm_knight_assassin',
    rewardDisplayName: 'レダ',
  },
  {
    level: 10,
    points: 100,
    rewardName: 'アイコン',
    rewardType: 'icon',
    rewardId: 'knight_assassin',
    rewardDisplayName: 'レダ',
  },
  { level: 11, points: 110, rewardName: '準備中' },
  { level: 12, points: 120, rewardName: '準備中' },
  { level: 13, points: 130, rewardName: '準備中' },
  { level: 14, points: 140, rewardName: '準備中' },
  { level: 15, points: 150, rewardName: '準備中' },
]);

/** 既存コード・互換用エイリアス（デフォルトはS1の達成段階） */
export const BATTLE_PASS_LEVEL_THRESHOLDS = BATTLE_PASS_S1_LEVEL_THRESHOLDS;

/**
 * バトルパスマスターデータ定義一覧
 * 各シーズン（S1, 将来のS2等）ごとに固有のID・最大ポイント・報酬段階リストを保持します。
 *
 * @type {ReadonlyArray<{
 *   id: string,
 *   name: string,
 *   description: string,
 *   cost: number,
 *   maxPoints: number,
 *   levels: typeof BATTLE_PASS_S1_LEVEL_THRESHOLDS
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
]);

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
 * バトルパスを解放してLocalStorageに保存する
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
 * 指定したバトルパスの現在蓄積ポイントを取得する
 * @param {string} passId - バトルパスID
 * @returns {number} 現在のバトルパスポイント
 */
export function getBattlePassPoints(passId) {
  if (!passId) return 0;
  try {
    const raw = localStorage.getItem(
      `${BATTLE_PASS_POINTS_KEY_PREFIX}${passId}`
    );
    return raw !== null ? parseInt(raw, 10) || 0 : 0;
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
 * 現在のクイックマッチレートを取得する
 * @returns {number} 現在のレート数値
 */
export function getQuickRating() {
  try {
    const raw = localStorage.getItem(QUICK_RATING_KEY);
    return raw !== null ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * クイックマッチレートを設定・保存する
 * @param {number} rating - 設定するレート数値
 * @returns {void}
 */
export function setQuickRating(rating) {
  const safeRating = Math.max(0, Math.floor(Number(rating) || 0));
  localStorage.setItem(QUICK_RATING_KEY, String(safeRating));
}

/**
 * クイックマッチ勝利時のバトルパスポイント加算およびレート加算処理
 * 解放済みのすべてのバトルパスに対してポイントを加算し、
 * レートにも同数を加算した上でサーバーへ非同期送信します。
 *
 * @param {boolean} isCpu - CPU対戦での勝利かどうか（CPUなら1pt、人なら3pt）
 * @returns {{ earnedPoints: number, newRating: number, updatedPasses: Array<{ id: string, points: number }> }} 加算結果オブジェクト
 */
export function recordQuickMatchWin(isCpu) {
  const earnedPoints = isCpu ? QUICK_WIN_POINTS_CPU : QUICK_WIN_POINTS_PVP;

  // 1. 解放済み全バトルパスへポイントを加算
  const unlockedPassIds = getUnlockedBattlePasses();
  const updatedPasses = [];

  unlockedPassIds.forEach((passId) => {
    const curPts = getBattlePassPoints(passId);
    const newPts = curPts + earnedPoints;
    setBattlePassPoints(passId, newPts);
    updatedPasses.push({ id: passId, points: newPts });
  });

  // 2. レートの加算
  const curRating = getQuickRating();
  const newRating = curRating + earnedPoints;
  setQuickRating(newRating);

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
  // 1. バトルパス自体を未アンロックならアンロック
  unlockBattlePass(passId);

  // 2. ポイントを最大値（対象パスの maxPoints または 150pt）に設定
  const pass = getBattlePassById(passId);
  const targetMax = pass?.maxPoints || 150;
  setBattlePassPoints(passId, targetMax);

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

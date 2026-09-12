/**
 * デイリーミッションの定数定義および進捗・報酬受取管理モジュール
 * 防衛戦・試練の宮殿・夢幻の闘技祭での勝利記録、日本時間（JST 00:00）日次自動リセット、
 * パックvol01（vol1:ビギニング）の報酬付与および達成状況判定を提供します。
 */

import { saveDeck } from '../../services/deck.js';
import { GameState } from '../../state/gameState.js';
import { checkIsDungeonMode, checkIsTournamentMode } from '../gameUtils.js';
import { INVENTORY_KEY, MAX_CARD_COPIES } from './config.js';
import { PACK_MASTER, PACK_VOL01_CARD_IDS, drawCardFromPack } from './packs.js';
import { UI_IMAGES } from './uiImages.js';

/**
 * デイリーミッション進捗を保存するLocalStorageキー
 * @type {string}
 */
export const DAILY_MISSIONS_STORAGE_KEY = 'mini_card_battle_daily_missions';

/**
 * デイリーミッションのマスターデータ定義一覧
 * 各ミッションのID、タイトル、説明、目標値、報酬情報、UI表示用アイコンを保持します。
 * @type {ReadonlyArray<Readonly<{
 *   id: string,
 *   title: string,
 *   targetCount: number,
 *   rewardType: 'pack',
 *   rewardPackId: number,
 *   rewardLabel: string,
 *   iconImage: string
 * }>>}
 */
export const DAILY_MISSIONS = Object.freeze([
  Object.freeze({
    id: 'defense_win',
    title: '防衛戦で1勝する',
    targetCount: 1,
    rewardType: 'pack',
    rewardPackId: 1,
    rewardLabel: 'パックvol01',
    iconImage: UI_IMAGES.EVENT_DEFENSE,
  }),
  Object.freeze({
    id: 'dungeon_win',
    title: '試練の宮殿で1勝する',
    targetCount: 1,
    rewardType: 'pack',
    rewardPackId: 1,
    rewardLabel: 'パックvol01',
    iconImage: UI_IMAGES.MENU_DUNGEON,
  }),
  Object.freeze({
    id: 'tournament_win',
    title: '夢幻の闘技祭で1勝する',
    targetCount: 1,
    rewardType: 'pack',
    rewardPackId: 1,
    rewardLabel: 'パックvol01',
    iconImage: UI_IMAGES.EVENT_TOURNAMENT,
  }),
]);

/**
 * 現在の日本標準時（JST, UTC+9）における日付文字列（YYYY-MM-DD）を取得します。
 * 端末のタイムゾーン設定に関わらず、協定世界時（UTC）に9時間を加算して確実に日本時間を算出します。
 *
 * @param {Date} [date=new Date()] - 対象の日時オブジェクト（省略時は現在日時）
 * @returns {string} JSTの日付文字列 (例: '2026-09-13')
 */
export function getJSTDateString(date = new Date()) {
  const jstTime = date.getTime() + 9 * 60 * 60 * 1000;
  const jstDate = new Date(jstTime);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 初期状態（全ミッション進捗0、未受取）のデイリーミッションデータを生成します。
 *
 * @param {string} [dateStr] - 設定するJST日付文字列（省略時は現在のJST日付）
 * @returns {{ date: string, missions: Record<string, { progress: number, isClaimed: boolean }> }}
 */
export function createInitialDailyMissionsData(dateStr = getJSTDateString()) {
  const missions = {};
  DAILY_MISSIONS.forEach((m) => {
    missions[m.id] = {
      progress: 0,
      isClaimed: false,
    };
  });
  return {
    date: dateStr,
    missions,
  };
}

/**
 * LocalStorageからデイリーミッション進捗データを読み込みます。
 * 日本時間00:00を跨いだ日付変更を自動検知し、前日以前のデータの場合は自動リセットして保存します。
 *
 * @returns {{ date: string, missions: Record<string, { progress: number, isClaimed: boolean }> }}
 */
export function loadDailyMissionsProgress() {
  const todayJST = getJSTDateString();
  if (typeof localStorage === 'undefined') {
    return createInitialDailyMissionsData(todayJST);
  }

  try {
    const raw = localStorage.getItem(DAILY_MISSIONS_STORAGE_KEY);
    if (!raw) {
      const initial = createInitialDailyMissionsData(todayJST);
      saveDailyMissionsProgress(initial);
      return initial;
    }

    const data = JSON.parse(raw);
    // 日付が変わっている場合は自動リセット
    if (!data || typeof data !== 'object' || data.date !== todayJST) {
      const resetData = createInitialDailyMissionsData(todayJST);
      saveDailyMissionsProgress(resetData);
      return resetData;
    }

    // 既存データの整合性補正（新設されたミッションキー等の欠落防止）
    const normalizedMissions = {};
    DAILY_MISSIONS.forEach((m) => {
      const existing = data.missions?.[m.id];
      normalizedMissions[m.id] = {
        progress: Number(existing?.progress) || 0,
        isClaimed: Boolean(existing?.isClaimed),
      };
    });

    return {
      date: todayJST,
      missions: normalizedMissions,
    };
  } catch (err) {
    console.error('デイリーミッション進捗のロードに失敗しました:', err);
    return createInitialDailyMissionsData(todayJST);
  }
}

/**
 * デイリーミッション進捗データをLocalStorageに永続化します。
 *
 * @param {{ date: string, missions: Record<string, { progress: number, isClaimed: boolean }> }} data
 */
export function saveDailyMissionsProgress(data) {
  if (typeof localStorage === 'undefined' || !data) return;
  try {
    localStorage.setItem(DAILY_MISSIONS_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('デイリーミッション進捗の保存に失敗しました:', err);
  }
}

/**
 * パックvol01（vol01:ビギニング）の全封入カード（45種類）がすべて所持上限（MAX_CARD_COPIES = 4）
 * に達しているか（コンプリート済みか）を判定します。
 *
 * @param {Record<string, number>} [playerInventory] - プレイヤーの所持インベントリ辞書（省略時は GameState.playerInventory）
 * @returns {boolean} 全カード上限到達済みであれば true
 */
export function checkIsPackVol01Completed(
  playerInventory = GameState.playerInventory || {}
) {
  if (!Array.isArray(PACK_VOL01_CARD_IDS) || PACK_VOL01_CARD_IDS.length === 0) {
    return false;
  }
  return PACK_VOL01_CARD_IDS.every((cardId) => {
    const count = Number(playerInventory[cardId]) || 0;
    return count >= MAX_CARD_COPIES;
  });
}

/**
 * バトル勝利時に、該当するゲームモードのデイリーミッション進捗を記録します。
 * 防衛戦（攻撃）、試練の宮殿、夢幻の闘技祭での勝利をホワイトリスト判定して加算します。
 * パックvol01コンプリート済みの場合は、デイリーミッション進行の必要がないため記録しません。
 *
 * @param {string} gameMode - 勝利したバトルのゲームモード
 * @returns {boolean} ミッションが新規に達成または更新された場合は true
 */
export function recordDailyMissionWin(gameMode) {
  if (!gameMode) return false;
  // パックvol01コンプリート済みの場合は進捗記録をスキップ
  if (checkIsPackVol01Completed()) return false;

  let targetMissionId = null;
  if (gameMode === 'defense_attack') {
    targetMissionId = 'defense_win';
  } else if (checkIsDungeonMode(gameMode)) {
    targetMissionId = 'dungeon_win';
  } else if (checkIsTournamentMode(gameMode)) {
    targetMissionId = 'tournament_win';
  }

  if (!targetMissionId) return false;

  const data = loadDailyMissionsProgress();
  const missionState = data.missions[targetMissionId];
  if (!missionState) return false;

  // 既に達成値に達している場合は余計な再保存を避ける
  if (missionState.progress >= 1) return false;

  missionState.progress = 1;
  saveDailyMissionsProgress(data);
  return true;
}

/**
 * 受け取り可能な報酬があるデイリーミッションが存在するかどうかを判定します。
 * トップメニュー画面のデイリーミッションボタンに表示する赤丸バッジの制御に使用します。
 * パックvol01コンプリート済みの場合は、未受取バッジを表示しません（常に false）。
 *
 * @param {Record<string, number>} [playerInventory] - プレイヤーの所持インベントリ辞書（省略時は GameState.playerInventory）
 * @returns {boolean} 受け取り可能なミッションが1つ以上存在する場合は true
 */
export function hasClaimableDailyMissions(
  playerInventory = GameState.playerInventory || {}
) {
  // パックvol01コンプリート済みの場合は常に未受取なし（バッジ非表示）
  if (checkIsPackVol01Completed(playerInventory)) {
    return false;
  }

  const data = loadDailyMissionsProgress();
  return DAILY_MISSIONS.some((m) => {
    const state = data.missions[m.id];
    return state && state.progress >= m.targetCount && !state.isClaimed;
  });
}

/**
 * 指定されたデイリーミッションの報酬（パックvol01）を受け取り、カードを抽選・付与します。
 *
 * @param {string} missionId - 対象のミッションID ('defense_win' | 'dungeon_win' | 'tournament_win')
 * @returns {{ success: boolean, cardId?: string, packDef?: Object, error?: string }} 抽選結果
 */
export function claimDailyMissionReward(missionId) {
  // パックvol01コンプリート済みの場合は受け取り不可
  if (checkIsPackVol01Completed()) {
    return {
      success: false,
      error: 'パックのカードがコンプリート済みのため受け取れません。',
    };
  }

  const data = loadDailyMissionsProgress();
  const missionDef = DAILY_MISSIONS.find((m) => m.id === missionId);
  const missionState = data.missions[missionId];

  if (!missionDef || !missionState) {
    return { success: false, error: '指定されたミッションが存在しません。' };
  }

  if (missionState.progress < missionDef.targetCount) {
    return { success: false, error: 'ミッションが未達成です。' };
  }

  if (missionState.isClaimed) {
    return { success: false, error: '既に受け取り済みです。' };
  }

  // 対象パック（vol1:ビギニング）を取得
  const packDef =
    PACK_MASTER.find((p) => p.id === missionDef.rewardPackId) || PACK_MASTER[0];
  if (!packDef) {
    return {
      success: false,
      error: '報酬パックのマスターデータが見つかりません。',
    };
  }

  // カードを1枚抽選
  const currentInventory = { ...(GameState.playerInventory || {}) };
  const drawnCardId = drawCardFromPack(packDef, currentInventory);
  if (!drawnCardId) {
    return { success: false, error: 'カードの抽選に失敗しました。' };
  }

  // インベントリに加算
  currentInventory[drawnCardId] = (currentInventory[drawnCardId] || 0) + 1;
  GameState.playerInventory = currentInventory;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(currentInventory));
  }
  if (typeof saveDeck === 'function') {
    try {
      saveDeck();
    } catch (err) {
      console.warn('saveDeck の実行に失敗しました:', err);
    }
  }

  // 受取済みフラグを更新して永続化
  missionState.isClaimed = true;
  saveDailyMissionsProgress(data);

  return {
    success: true,
    cardId: drawnCardId,
    packDef,
  };
}

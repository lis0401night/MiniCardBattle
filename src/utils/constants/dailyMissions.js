/**
 * デイリーミッションの定数定義モジュール
 *
 * 各ミッションのマスターデータ定義一覧（DAILY_MISSIONS）および
 * LocalStorage保存用キー（DAILY_MISSIONS_STORAGE_KEY）を管理します。
 * ビジネスロジック・進捗管理・報酬付与は services/dailyMissions.js を参照してください。
 */

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

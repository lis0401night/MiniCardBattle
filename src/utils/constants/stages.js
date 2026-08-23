import { appendVersionQuery } from './config.js';

/**
 * Mini Card Battle - Stage Data
 */
export const STAGES = {
  practice: { id: 'practice', name: '仮想空間', bgm: 'bgmStagePractice' },
  android: { id: 'android', name: 'セクター7', bgm: 'bgmStageAndroid' },
  dragon: { id: 'dragon', name: '活火山', bgm: 'bgmStageDragon' },
  knight: { id: 'knight', name: '戦場', bgm: 'bgmStageKnight' },
  cthulhu: { id: 'cthulhu', name: '狂気の深淵', bgm: 'bgmStageCthulhu' },
  elf: { id: 'elf', name: '迷いの森', bgm: 'bgmStageElf' },
  cleric: { id: 'cleric', name: '静寂の聖堂', bgm: 'bgmStageCleric' },
  devilhunter: {
    id: 'devilhunter',
    name: '旧市街',
    bgm: 'bgmStageDevilHunter',
  },
  witch: { id: 'witch', name: '魔女の隠れ家', bgm: 'bgmStageWitch' },
  oni: { id: 'oni', name: '逢魔が時', bgm: 'bgmStageOni' },
  priest: { id: 'priest', name: '千年の王墓', bgm: 'bgmStagePriest' },
  automata: { id: 'automata', name: '鋼の墓標', bgm: 'bgmStageAutomata' },
  valkyria: { id: 'valkyria', name: '約束の丘', bgm: 'bgmStageValkyria' },
  satan: { id: 'satan', name: '魔王城', bgm: 'bgmStageSatan' },
  dungeon: { id: 'dungeon', name: '試練の宮殿', bgm: 'bgmStageDungeon' },
  tournament: { id: 'tournament', name: '全国大会', bgm: 'bgmStageTournament' },
};

/** 解放制ステージのID一覧 */
export const UNLOCKABLE_STAGE_IDS = ['automata', 'valkyria'];

/**
 * 解放制ステージの表示条件を判定する共通関数
 * @param {string} stageId - ステージID
 * @returns {boolean} 表示可能であればtrue
 */
export function canShowUnlockableStage(stageId) {
  if (!UNLOCKABLE_STAGE_IDS.includes(stageId)) return true;
  let unlockedStages = [];
  try {
    const raw = localStorage.getItem('mini_card_battle_unlocked_stages');
    const parsed = raw ? JSON.parse(raw.replace(/[\u200B-\u200D]/g, '')) : null;
    if (Array.isArray(parsed)) unlockedStages = parsed;
  } catch (e) {
    console.error('Failed to parse unlocked stages:', e);
  }
  return unlockedStages.includes(stageId);
}

/**
 * バトル画面・マッチング画面・BGM初期化で共通利用するステージID解決関数（純粋関数）。
 * ゲームモードや選択状態、敵設定から一元的にステージIDを決定する（DRY徹底・フォールバック整合）。
 * @param {object} [params={}] - 判定パラメータ
 * @param {string} [params.gameMode] - ゲームモード
 * @param {string} [params.selectedStageId] - 選択中ステージID
 * @param {object} [params.enemyConfig] - 敵の設定オブジェクト
 * @returns {string} 決定されたステージID
 */
export function resolveBattleStageId({
  gameMode,
  selectedStageId,
  enemyConfig,
} = {}) {
  // 1. ダンジョン・トーナメント等のモード固定ステージ
  if (gameMode === 'battle_dungeon') return 'dungeon';
  if (gameMode === 'tournament') return 'tournament';

  // 2. ストーリーモード（敵固有ステージ）
  if (gameMode === 'story') return enemyConfig?.stageId || 'android';

  // 3. 通常モード（選択ステージ > 敵固有ステージ > 敵IDプレフィックス > デフォルト）
  return (
    selectedStageId ||
    enemyConfig?.stageId ||
    enemyConfig?.id?.replace('_high', '') ||
    'android'
  );
}

/**
 * ステージ背景画像のURLを取得する（キャッシュバスティング・サムネイル対応）
 * @param {string} stageId - ステージID（例: 'android', 'dragon'）
 * @param {boolean} [useThumb=false] - サムネイル画像（_thumb.webp）を取得するかどうか
 * @returns {string} 画像パス
 */
export function getStageImgUrl(stageId, useThumb = false) {
  if (!stageId || stageId === 'random') return '';
  const suffix = useThumb ? '_thumb.webp' : '.webp';
  return appendVersionQuery(`assets/stages/stage_${stageId}${suffix}`);
}

/**
 * ステージ用の背景スタイルオブジェクトを生成します。
 * @param {string} stageId - ステージID
 * @returns {object} CSSスタイルオブジェクト
 */
export function getStageBackgroundStyle(stageId) {
  const url = getStageImgUrl(stageId, false);
  if (!url) return {};
  return {
    backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.3), rgba(15, 23, 42, 0.3)), url('${url}')`,
  };
}

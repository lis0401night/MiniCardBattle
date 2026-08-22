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

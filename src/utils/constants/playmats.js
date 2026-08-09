/**
 * Mini Card Battle - Playmat Constants
 *
 * プレイマットのマスタデータ。
 * 基本プレイマットは手書きで定義し、スキン系プレイマットは
 * スキンマスタ（skins.js）から自動生成する。
 */
import { SKIN_MASTER, buildPlaymatId } from './skins.js';

// ---------------------------------------------------------------------------
// 基本プレイマット（キャラクターごと + デフォルト）
// ---------------------------------------------------------------------------

/** @type {Array<Object>} 基本プレイマット定義 */
const BASE_PLAYMATS = [
  {
    id: 'pm_lanedefenders',
    name: 'LANE DEFENDERS',
    image: 'assets/boards/board_lanedefenders.webp',
  },
  {
    id: 'android',
    name: 'アイギス',
    image: 'assets/boards/board_android.webp',
    targetCharacter: 'android',
  },
  {
    id: 'dragon',
    name: 'イグニス',
    image: 'assets/boards/board_dragon.webp',
    targetCharacter: 'dragon',
  },
  {
    id: 'knight',
    name: 'セレスティア',
    image: 'assets/boards/board_knight.webp',
    targetCharacter: 'knight',
  },
  {
    id: 'cthulhu',
    name: 'ナイア',
    image: 'assets/boards/board_cthulhu.webp',
    targetCharacter: 'cthulhu',
  },
  {
    id: 'elf',
    name: 'リナ',
    image: 'assets/boards/board_elf.webp',
    targetCharacter: 'elf',
  },
  {
    id: 'cleric',
    name: 'エリシア',
    image: 'assets/boards/board_cleric.webp',
    targetCharacter: 'cleric',
  },
  {
    id: 'devilhunter',
    name: 'マリア',
    image: 'assets/boards/board_devilhunter.webp',
    targetCharacter: 'devilhunter',
  },
  {
    id: 'witch',
    name: 'クロエ',
    image: 'assets/boards/board_witch.webp',
    targetCharacter: 'witch',
  },
  {
    id: 'oni',
    name: 'カグラ',
    image: 'assets/boards/board_oni.webp',
    targetCharacter: 'oni',
  },
  {
    id: 'priest',
    name: 'ネフティ',
    image: 'assets/boards/board_priest.webp',
    targetCharacter: 'priest',
  },
  {
    id: 'automata',
    name: 'マキナ',
    image: 'assets/boards/board_automata.webp',
    targetCharacter: 'automata',
  },
  {
    id: 'valkyria',
    name: 'アンジェ',
    image: 'assets/boards/board_valkyria.webp',
    targetCharacter: 'valkyria',
  },
  {
    id: 'satan',
    name: 'サタン',
    image: 'assets/boards/board_satan.webp',
    targetCharacter: 'satan',
  },
];

// ---------------------------------------------------------------------------
// スキン系プレイマット（スキンマスタから自動生成）
// ---------------------------------------------------------------------------

/**
 * スキンマスタからスキン系プレイマットを自動生成する
 * @param {Object} skinMaster - SKIN_MASTER オブジェクト
 * @returns {Array<Object>} プレイマットエントリの配列
 */
function generateSkinPlaymats(skinMaster) {
  /** @type {Array<Object>} */
  const playmats = [];

  for (const [skinType, skins] of Object.entries(skinMaster)) {
    for (const [charId, skinData] of Object.entries(skins)) {
      if (!skinData.playmat) continue;
      playmats.push({
        id: buildPlaymatId(charId, skinType),
        name: skinData.name,
        image: skinData.playmat,
      });
    }
  }

  return playmats;
}

// ---------------------------------------------------------------------------
// エクスポート
// ---------------------------------------------------------------------------

/**
 * 全プレイマットのマスタ配列
 * 基本プレイマット + スキンマスタから自動生成されたスキン系プレイマット
 * @type {Array<Object>}
 */
export const PLAYMAT_MASTER = [
  ...BASE_PLAYMATS,
  ...generateSkinPlaymats(SKIN_MASTER),
];

/**
 * 所持プレイマットの管理用（セーブデータ：キー `mini_card_battle_owned_playmats`）
 * @type {Array<string>}
 */
export let ownedPlaymats = []; // ['android', 'dragon', ...]

/**
 * 所持プレイマットリストを更新する
 * @param {Array<string>} newList - 新しい所持プレイマットIDの配列
 * @returns {void}
 */
export function setOwnedPlaymats(newList) {
  ownedPlaymats = newList;
}

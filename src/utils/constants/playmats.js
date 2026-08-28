/**
 * Mini Card Battle - Playmat Constants
 *
 * プレイマットのマスタデータ。
 * 基本プレイマットは手書きで定義し、スキン系プレイマットは
 * スキンマスタ（skins.js）から自動生成する。
 */
import { CARD_MASTER } from './cards.js';
import {
  appendVersionQuery,
  HIGH_DIFFICULTY_COSMETIC_CARD_IDS,
} from './config.js';
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
// カード関連プレイマット
// ---------------------------------------------------------------------------

const CARD_BY_ID = new Map(CARD_MASTER.map((c) => [c.id, c]));

/**
 * カード関連プレイマット定義
 * CARD_MASTER および HIGH_DIFFICULTY_COSMETIC_CARD_IDS から動的に生成し、カード名とフレーバーテキストの単一情報源を保証する
 * @type {Array<{id: string, name: string, image: string, description: string}>}
 */
const CARD_PLAYMATS = HIGH_DIFFICULTY_COSMETIC_CARD_IDS.map((cardId) => {
  const card = CARD_BY_ID.get(cardId);
  return {
    id: `pm_card_${cardId}`,
    name: card?.name || cardId,
    image: `assets/boards/board_card_${cardId}.webp`,
    description: card?.flavor || '',
  };
});

// ---------------------------------------------------------------------------
// エクスポート
// ---------------------------------------------------------------------------

/**
 * 全プレイマットのマスタ配列
 * 基本プレイマット + カード関連プレイマット + スキンマスタから自動生成されたスキン系プレイマット
 * @type {Array<Object>}
 */
export const PLAYMAT_MASTER = [
  ...BASE_PLAYMATS,
  ...CARD_PLAYMATS,
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

/**
 * プレイマットの画像パスを取得する（キャッシュバスティング・サムネイル対応）
 * @param {string|Object} playmatOrId - プレイマットIDまたはプレイマットオブジェクト
 * @param {boolean} [useThumb=false] - サムネイル画像（_thumb.webp）を取得するかどうか
 * @returns {string} 画像パス
 */
export function getPlaymatImgUrl(playmatOrId, useThumb = false) {
  if (!playmatOrId) return '';
  let path = '';
  if (typeof playmatOrId === 'object' && playmatOrId.image) {
    path = playmatOrId.image;
  } else {
    const pm = PLAYMAT_MASTER.find((p) => p.id === playmatOrId);
    path = pm
      ? pm.image
      : `assets/boards/board_${String(playmatOrId).replace('pm_', '')}.webp`;
  }
  if (!path) return '';
  if (
    useThumb &&
    path.includes('assets/boards/') &&
    !path.includes('_thumb.webp')
  ) {
    path = path.replace('.webp', '_thumb.webp');
  }
  return appendVersionQuery(path);
}

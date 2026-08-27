/**
 * Mini Card Battle - Playmat Constants
 *
 * プレイマットのマスタデータ。
 * 基本プレイマットは手書きで定義し、スキン系プレイマットは
 * スキンマスタ（skins.js）から自動生成する。
 */
import { appendVersionQuery } from './config.js';
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

/**
 * カード関連プレイマット定義
 * 各カード名に対応したプレイマット定義
 * @type {Array<{id: string, name: string, image: string}>}
 */
const CARD_PLAYMATS = [
  {
    id: 'pm_card_scientist',
    name: '世紀の天才科学者',
    image: 'assets/boards/board_card_scientist.webp',
    description:
      '彼女の右に出る技術者はいない。その性格の難しさにさえ目を瞑れば、だが。',
  },
  {
    id: 'pm_card_hellkite',
    name: 'ヘルカイトの君主',
    image: 'assets/boards/board_card_hellkite.webp',
    description:
      '「黒き影が空を覆う時、古き王国は灰となる」というただの御伽話。だがある日空は黒く染まり、伝説は業火と共に舞い降りた。',
  },
  {
    id: 'pm_card_duelist',
    name: '血濡れの決闘者',
    image: 'assets/boards/board_card_duelist.webp',
    description:
      '無慈悲に命を刈り取る殺戮者。肉体が切り刻まれようと、血の海で最後まで立ち尽くし標的を屠る。',
  },
  {
    id: 'pm_card_cthulhu',
    name: '大いなる支配者',
    image: 'assets/boards/board_card_cthulhu.webp',
    description:
      'その姿を視認した瞬間、あらゆる物理法則は崩壊を始める。無限の絶望を増殖させていく絶対の主。',
  },
  {
    id: 'pm_card_elfking',
    name: 'エルフの王',
    image: 'assets/boards/board_card_elfking.webp',
    description:
      '千年の時を統べるエルフの王。彼の声が響く時、森の全てが呼応し、侵略者をなぎ払う軍勢と化す。',
  },
  {
    id: 'pm_card_goddess',
    name: '勝利の女神',
    image: 'assets/boards/board_card_goddess.webp',
    description:
      '戦場を舞う美しき女神。彼女が微笑む時、勝利の天秤は静かに傾き、受けるべき傷は運命の導きによって癒やしへと変わる。',
  },
  {
    id: 'pm_card_doll',
    name: '人形館の主',
    image: 'assets/boards/board_card_doll.webp',
    description:
      '洋館の奥深くに座す精巧な少女の人形。足を踏み入れた客人をもてなし、二度と外へ帰ることのない調度品へと変えていく。',
  },
  {
    id: 'pm_card_gorgon',
    name: '魔眼の勇者',
    image: 'assets/boards/board_card_gorgon.webp',
    description:
      '蛇の髪を持つ美しき戦乙女。その一瞥を受けた者は石と化し、剣の一閃は必殺の一撃となる。',
  },
  {
    id: 'pm_card_seimei',
    name: '天眼の陰陽師',
    image: 'assets/boards/board_card_seimei.webp',
    description:
      '森羅万象を見通すその眼差しに、死角はない。涼やかな指先が印を結べば、標的は抗う間もなく縛に就く。',
  },
  {
    id: 'pm_card_cleopatra',
    name: '最後の女王',
    image: 'assets/boards/board_card_cleopatra.webp',
    description:
      '傾きゆく帝国を、美貌と知略で支え続けた統治者。彼女が下した最後の冷徹な決断は、かつての栄華と共に歴史の闇へ消えた。',
  },
];

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

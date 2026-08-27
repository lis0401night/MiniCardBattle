import { SKIN_MASTER, buildSkinId } from './skins.js';

/**
 * アイコン画像パスを生成するヘルパー
 * @param {string} id - アイコンID
 * @returns {string} アイコン画像パス
 */
const iconPath = (id) => `assets/icons/icon_${id}.webp`;

/**
 * 初期から利用可能なアイコン一覧
 * @type {Array<{id: string, path: string, name: string}>}
 */
export const AVAILABLE_ICONS = [
  { id: 'player', path: iconPath('player'), name: 'デフォルト' },
  { id: 'android', path: iconPath('android'), name: 'アイギス' },
  { id: 'dragon', path: iconPath('dragon'), name: 'イグニス' },
  { id: 'knight', path: iconPath('knight'), name: 'セレスティア' },
  { id: 'cthulhu', path: iconPath('cthulhu'), name: 'ナイア' },
  { id: 'elf', path: iconPath('elf'), name: 'リナ' },
  { id: 'cleric', path: iconPath('cleric'), name: 'エリシア' },
  {
    id: 'devilhunter',
    path: iconPath('devilhunter'),
    name: 'マリア',
  },
  { id: 'witch', path: iconPath('witch'), name: 'クロエ' },
  { id: 'oni', path: iconPath('oni'), name: 'カグラ' },
  { id: 'priest', path: iconPath('priest'), name: 'ネフティ' },
];

// ---------------------------------------------------------------------------
// EXTRA_ICONS: スキンマスタから自動生成 + 手動追加分
// ---------------------------------------------------------------------------

/**
 * スキンマスタに含まれないが個別に解放されるアイコン
 * （イベント解放キャラ、ボスキャラなど）
 * @type {Array<{id: string, name: string, path: string}>}
 */
const STANDALONE_EXTRA_ICONS = [
  // イベント解放
  {
    id: 'automata',
    name: 'マキナ',
    path: iconPath('automata'),
  },
  {
    id: 'valkyria',
    name: 'アンジェ',
    path: iconPath('valkyria'),
  },
  // 高難易度
  {
    id: 'satan',
    name: 'サタン',
    path: iconPath('satan'),
  },
];

/**
 * スキンマスタからスキン系アイコンエントリを自動生成する
 * @param {Object} skinMaster - SKIN_MASTER オブジェクト
 * @returns {Array<{id: string, name: string, path: string}>} アイコン配列
 */
function generateSkinIcons(skinMaster) {
  /** @type {Array<{id: string, name: string, path: string}>} */
  const icons = [];

  for (const [skinType, skins] of Object.entries(skinMaster)) {
    for (const [charId, skinData] of Object.entries(skins)) {
      const id = buildSkinId(charId, skinType);
      icons.push({
        id,
        name: skinData.name,
        path: skinData.icon ?? iconPath(id),
      });
    }
  }

  return icons;
}

/**
 * カード関連の解放アイコン一覧
 * 各カード名に対応したアイコン定義
 * @type {Array<{id: string, name: string, path: string}>}
 */
const CARD_ICONS = [
  {
    id: 'card_scientist',
    name: '世紀の天才科学者',
    path: iconPath('card_scientist'),
    description:
      '彼女の右に出る技術者はいない。その性格の難しさにさえ目を瞑れば、だが。',
  },
  {
    id: 'card_hellkite',
    name: 'ヘルカイトの君主',
    path: iconPath('card_hellkite'),
    description:
      '「黒き影が空を覆う時、古き王国は灰となる」というただの御伽話。だがある日空は黒く染まり、伝説は業火と共に舞い降りた。',
  },
  {
    id: 'card_duelist',
    name: '血濡れの決闘者',
    path: iconPath('card_duelist'),
    description:
      '無慈悲に命を刈り取る殺戮者。肉体が切り刻まれようと、血の海で最後まで立ち尽くし標的を屠る。',
  },
  {
    id: 'card_cthulhu',
    name: '大いなる支配者',
    path: iconPath('card_cthulhu'),
    description:
      'その姿を視認した瞬間、あらゆる物理法則は崩壊を始める。無限の絶望を増殖させていく絶対の主。',
  },
  {
    id: 'card_elfking',
    name: 'エルフの王',
    path: iconPath('card_elfking'),
    description:
      '千年の時を統べるエルフの王。彼の声が響く時、森の全てが呼応し、侵略者をなぎ払う軍勢と化す。',
  },
  {
    id: 'card_goddess',
    name: '勝利の女神',
    path: iconPath('card_goddess'),
    description:
      '戦場を舞う美しき女神。彼女が微笑む時、勝利の天秤は静かに傾き、受けるべき傷は運命の導きによって癒やしへと変わる。',
  },
  {
    id: 'card_doll',
    name: '人形館の主',
    path: iconPath('card_doll'),
    description:
      '洋館の奥深くに座す精巧な少女の人形。足を踏み入れた客人をもてなし、二度と外へ帰ることのない調度品へと変えていく。',
  },
  {
    id: 'card_gorgon',
    name: '魔眼の勇者',
    path: iconPath('card_gorgon'),
    description:
      '蛇の髪を持つ美しき戦乙女。その一瞥を受けた者は石と化し、剣の一閃は必殺の一撃となる。',
  },
  {
    id: 'card_seimei',
    name: '天眼の陰陽師',
    path: iconPath('card_seimei'),
    description:
      '森羅万象を見通すその眼差しに、死角はない。涼やかな指先が印を結べば、標的は抗う間もなく縛に就く。',
  },
  {
    id: 'card_cleopatra',
    name: '最後の女王',
    path: iconPath('card_cleopatra'),
    description:
      '傾きゆく帝国を、美貌と知略で支え続けた統治者。彼女が下した最後の冷徹な決断は、かつての栄華と共に歴史の闇へ消えた。',
  },
];

/**
 * 解放報酬等で追加されるアイコン一覧
 * スキンマスタ（skins.js）から自動生成 + 個別追加分 + カードアイコン分
 * @type {Array<{id: string, name: string, path: string}>}
 */
export const EXTRA_ICONS = [
  ...STANDALONE_EXTRA_ICONS,
  ...CARD_ICONS,
  ...generateSkinIcons(SKIN_MASTER),
];

/**
 * 全有効アイコンIDのセット（AVAILABLE_ICONS + EXTRA_ICONS から自動生成）。
 * アイコンIDのバリデーションに使用します。
 * @type {Set<string>}
 */
export const VALID_ICON_IDS = new Set([
  ...AVAILABLE_ICONS.map((i) => i.id),
  ...EXTRA_ICONS.map((i) => i.id),
]);

/**
 * アイコンIDを検証し、不正な値の場合はデフォルトアイコン('player')にフォールバックします。
 * サーバ送信やLocalStorage保存の前にアイコンIDを必ずこの関数を通して安全な値にすること。
 *
 * @param {string|null|undefined} iconId - 検証対象のアイコンID
 * @returns {string} 有効なアイコンID（不正な場合は 'player'）
 */
export function resolveValidIconId(iconId) {
  if (iconId && VALID_ICON_IDS.has(iconId)) {
    return iconId;
  }
  return 'player';
}

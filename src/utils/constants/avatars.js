import { SKIN_MASTER } from './skins.js';

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

  // スキンタイプごとのアイコンIDプレフィックスとサフィックスの対応
  const skinTypeConfig = {
    high: {
      /** @param {string} charId */
      getId: (charId) => `${charId}_high`,
    },
    summer: {
      /** @param {string} charId */
      getId: (charId) => `${charId}_summer`,
    },
    school: {
      /** @param {string} charId */
      getId: (charId) => `${charId}_school`,
    },
  };

  for (const [skinType, config] of Object.entries(skinTypeConfig)) {
    const skins = skinMaster[skinType];
    if (!skins) continue;

    for (const [charId, skinData] of Object.entries(skins)) {
      const id = config.getId(charId);
      icons.push({
        id,
        name: skinData.name,
        path: iconPath(id),
      });
    }
  }

  return icons;
}

/**
 * 解放報酬等で追加されるアイコン一覧
 * スキンマスタ（skins.js）から自動生成 + 個別追加分
 * @type {Array<{id: string, name: string, path: string}>}
 */
export const EXTRA_ICONS = [
  ...STANDALONE_EXTRA_ICONS,
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

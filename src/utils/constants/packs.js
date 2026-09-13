/**
 * パックシステムの定数定義および抽選ロジック
 * 拡張パックのマスターデータ、封入カード一覧、レアリティ別確率重み付け、カード抽選関数を提供します。
 */

import { CARD_MASTER } from './cards.js';
import {
  appendVersionQuery,
  MAX_CARD_COPIES,
  PACK_EXCHANGE_COST,
} from './config.js';

/**
 * 第1弾拡張パック（vol01:ビギニング）の封入カードID一覧（全45種類）
 * @type {ReadonlyArray<string>}
 */
export const PACK_VOL01_CARD_IDS = Object.freeze([
  // ★2: シルバーカード（27枚）
  'laser',
  'gunship',
  'royalguard',
  'lightning',
  'shielder',
  'mercenaryleader',
  'ameba',
  'marimo',
  'gorilla',
  'rage',
  'warriormonk',
  'goblet',
  'ghost',
  'lantern',
  'oblivious',
  'countermagic',
  'kappa',
  'tomb',
  'jackal',
  'predator',
  'raid',
  'sisters',
  'maiden',
  'gleipnir',
  'firstlight',
  'elementalburst',
  'mimic',
  // ★3: ゴールドカード（15枚）
  'factory',
  'enlisteddragon',
  'mercenarycamp',
  'gammaray',
  'deadleaves',
  'angelpray',
  'ghoul',
  'omnipotent',
  'yasha',
  'falconpriest',
  'prototype',
  'thor',
  'catastrophe',
  'elementalguide',
  'hameln',
  // ★4: レジェンドカード（3枚）
  'fallenangel',
  'elementalmaster',
  'combination',
]);

/** @deprecated PACK_VOL01_CARD_IDS を使用してください */
export const PACK_V040_CARD_IDS = PACK_VOL01_CARD_IDS;

/**
 * パックのレアリティ別排出確率（重み付け）定義
 * 合計100%となるよう設定します。
 * - レジェンド（★4）: 10%
 * - ゴールド（★3）: 30%
 * - シルバー（★2）: 60%
 * @type {Readonly<Record<number, number>>}
 */
export const PACK_DEFAULT_RARITY_WEIGHTS = Object.freeze({
  4: 10, // レジェンド
  3: 30, // ゴールド
  2: 60, // シルバー
});

/**
 * パック既定ロゴ画像パス
 * @type {string}
 */
export const DEFAULT_PACK_LOGO_URL = 'assets/ui/packvol01.png';

/**
 * パックロゴURLを解決します。
 * 未指定（undefined）の場合は既定ロゴ、空文字等のfalsy値はロゴ非表示（null）として扱い、
 * 有効なURL文字列にはバージョンクエリを自動付与して返します。
 *
 * @param {string|undefined} logoUrl - 指定ロゴ画像URL（未指定時はデフォルト画像を採用）
 * @returns {string|null} バージョンクエリ付与済みの解決後画像URL、または非表示を表すnull
 */
export function resolvePackLogoUrl(logoUrl) {
  if (logoUrl === undefined) {
    return appendVersionQuery(DEFAULT_PACK_LOGO_URL);
  }
  return logoUrl ? appendVersionQuery(logoUrl) : null;
}

/**
 * パックマスターデータ一覧
 * 各パックのID、名称、説明、必要ポイント、封入カードリスト、排出設定を保持します。
 * @type {ReadonlyArray<Readonly<{
 *   id: number,
 *   packId: number,
 *   name: string,
 *   description: string,
 *   cost: number,
 *   pointsKey: string,
 *   cardsPerPack: number,
 *   coverCardId: string,
 *   logoUrl?: string,
 *   cardIds: ReadonlyArray<string>,
 *   rarityWeights: Readonly<Record<number, number>>
 * }>>}
 */
export const PACK_MASTER = Object.freeze([
  Object.freeze({
    id: 1,
    packId: 1,
    type: 'pack',
    name: 'vol01:ビギニング',
    description: '全45種類のカードが封入された拡張パック。',
    cost: PACK_EXCHANGE_COST,
    pointsKey: 'common',
    cardsPerPack: 1,
    coverCardId: 'catastrophe',
    logoUrl: DEFAULT_PACK_LOGO_URL,
    cardIds: PACK_VOL01_CARD_IDS,
    rarityWeights: PACK_DEFAULT_RARITY_WEIGHTS,
  }),
]);

/**
 * パックオブジェクトまたはパックIDからパック定義を取得します。
 *
 * @param {number|string|Object} packOrId - パック定義オブジェクトまたはパックID
 * @returns {Object|null} 該当するパック定義オブジェクト（未検出時はnull）
 */
export function getPackById(packOrId) {
  if (!packOrId) return null;
  if (typeof packOrId === 'object' && packOrId !== null) {
    return packOrId;
  }
  const numericId = Number(packOrId);
  return (
    PACK_MASTER.find(
      (pack) => pack.id === numericId || pack.packId === numericId
    ) || null
  );
}

/**
 * 指定されたカードIDリストから、指定レアリティのカードID一覧を抽出します。
 *
 * @param {Array<string>} cardIds - フィルタ対象のカードID配列
 * @param {number} targetRarity - 対象レアリティ（2, 3, 4など）
 * @returns {Array<string>} 該当レアリティのカードID配列
 */
export function filterCardsByRarity(cardIds, targetRarity) {
  if (!Array.isArray(cardIds) || cardIds.length === 0) return [];
  const cardMap = new Map(CARD_MASTER.map((c) => [c.id, c]));
  return cardIds.filter((id) => {
    const card = cardMap.get(id);
    return card && card.rarity === targetRarity;
  });
}

/**
 * パックからカードを1枚抽選します。
 *
 * 【抽選仕様】
 * 1. 封入カードのうち、所持数が上限（MAX_CARD_COPIES = 4）未満の未カンストカードを候補とします。
 * 2. 全封入カードが上限カンストしている場合は、すべての封入カードを候補とします。
 * 3. レアリティ確率（レジェンド: 10%, ゴールド: 30%, シルバー: 60%）に基づきレアリティを決定します。
 * 4. 当選レアリティに候補カードが存在する場合、その中から均等にランダム選出します。
 * 5. 当選レアリティのカードがすべてカンストしている場合は、未カンストの他レアリティ候補から選出します。
 *
 * @param {number|string|Object} packOrId - パック定義オブジェクトまたはパックID
 * @param {Record<string, number>} [playerInventory={}] - プレイヤーの所持インベントリ辞書
 * @returns {string|null} 抽選されたカードID（エラー時はnull）
 */
export function drawCardFromPack(packOrId, playerInventory = {}) {
  const pack = getPackById(packOrId);
  if (!pack || !Array.isArray(pack.cardIds) || pack.cardIds.length === 0) {
    console.error(
      `[packs] 有効なパック定義が見つかりません: ${JSON.stringify(packOrId)}`
    );
    return null;
  }

  // 1. 所持数が上限（MAX_CARD_COPIES = 4）未満のカードを抽出
  let eligibleCardIds = pack.cardIds.filter((cardId) => {
    const currentCount = Number(playerInventory[cardId]) || 0;
    return currentCount < MAX_CARD_COPIES;
  });

  // 2. もし全カードが上限カンスト済みの場合は、全封入カードを対象としてフォールバック
  if (eligibleCardIds.length === 0) {
    eligibleCardIds = [...pack.cardIds];
  }

  // 3. 候補カードをレアリティごとに分類
  const candidatesByRarity = {
    4: filterCardsByRarity(eligibleCardIds, 4), // レジェンド
    3: filterCardsByRarity(eligibleCardIds, 3), // ゴールド
    2: filterCardsByRarity(eligibleCardIds, 2), // シルバー
  };

  const weights = pack.rarityWeights || PACK_DEFAULT_RARITY_WEIGHTS;
  const legendWeight = weights[4] ?? PACK_DEFAULT_RARITY_WEIGHTS[4];
  const goldWeight = weights[3] ?? PACK_DEFAULT_RARITY_WEIGHTS[3];
  const silverWeight = weights[2] ?? PACK_DEFAULT_RARITY_WEIGHTS[2];
  const totalWeight = legendWeight + goldWeight + silverWeight;

  // 4. 1〜totalWeight（通常100）の乱数で当選レアリティを判定
  const roll = Math.random() * totalWeight;
  let targetRarity = 2; // デフォルトはシルバー

  if (roll < legendWeight) {
    targetRarity = 4; // レジェンド当選 (0 <= roll < 10)
  } else if (roll < legendWeight + goldWeight) {
    targetRarity = 3; // ゴールド当選 (10 <= roll < 40)
  } else {
    targetRarity = 2; // シルバー当選 (40 <= roll < 100)
  }

  // 5. 当選レアリティに対象カードが存在するか確認
  let targetPool = candidatesByRarity[targetRarity] || [];

  // 当選レアリティの候補が空の場合（例: レジェンド2種が両方4枚所持済み等）
  if (targetPool.length === 0) {
    // 他の未カンストレアリティから順にフォールバック（ゴールド -> シルバー -> 全体）
    const fallbackPriority = [3, 2, 4];
    for (const rarity of fallbackPriority) {
      if (candidatesByRarity[rarity] && candidatesByRarity[rarity].length > 0) {
        targetPool = candidatesByRarity[rarity];
        break;
      }
    }
    // それでも空なら候補全体から選出
    if (targetPool.length === 0) {
      targetPool = eligibleCardIds;
    }
  }

  // 6. 決定されたプールから等確率で1枚選出
  const randomIndex = Math.floor(Math.random() * targetPool.length);
  return targetPool[randomIndex] || pack.cardIds[0];
}

/**
 * パックを開封し、排出枚数分のカードID配列を取得します。
 *
 * @param {number|string|Object} packOrId - パック定義オブジェクトまたはパックID
 * @param {Record<string, number>} [playerInventory={}] - プレイヤーの所持インベントリ辞書
 * @returns {Array<string>} 抽選されたカードIDの配列
 */
export function openPack(packOrId, playerInventory = {}) {
  const pack = getPackById(packOrId);
  if (!pack) return [];

  const count = pack.cardsPerPack || 1;
  const drawnCards = [];
  // 排出処理中の重複所持数計算用（1パック内で引いたカードも一時カウント）
  const tempInventory = { ...playerInventory };

  for (let i = 0; i < count; i++) {
    const cardId = drawCardFromPack(pack, tempInventory);
    if (cardId) {
      drawnCards.push(cardId);
      tempInventory[cardId] = (tempInventory[cardId] || 0) + 1;
    }
  }

  return drawnCards;
}

/**
 * 交換対象アイテムの交換可能最大個数を算出します。
 * 所持ポイント、所持状況（カード所持枚数・パックの全カード未所持枠など）を考慮します。
 *
 * @param {Object} item - 交換対象アイテム
 * @param {number} currentPoints - プレイヤーの現在所持ポイント
 * @param {Record<string, number>} [playerInventory={}] - プレイヤーの所持インベントリ辞書
 * @param {Object} [packDef] - パック定義オブジェクト（パック交換時）
 * @returns {number} 交換可能な最大個数（0の場合は交換不可）
 */
export function calculateExchangeMaxCount(
  item,
  currentPoints,
  playerInventory = {},
  packDef = null
) {
  if (!item) return 0;
  const cost = Number(item.cost) || 0;
  if (cost < 0) return 0;

  // 1. 所持ポイントによる上限計算
  const pointMax = cost > 0 ? Math.floor(Math.max(0, currentPoints) / cost) : 1;
  if (pointMax <= 0) return 0;

  // 2. パック判定（type === 'pack' または packObj / packId / cardIds / packDef の存在）
  const isPack =
    item.type === 'pack' ||
    Boolean(item.packId || item.packObj || item.cardIds || packDef);

  if (isPack) {
    // パックの場合: 封入されている全カードの未所持枠 (4 - 所持枚数) の合計
    const targetPack =
      packDef || getPackById(item.packObj || item.id || item.packId || item);
    const cardIds = targetPack?.cardIds || item.cardIds || PACK_V040_CARD_IDS;
    let totalMissing = 0;
    cardIds.forEach((cId) => {
      const owned = Number(playerInventory[cId]) || 0;
      totalMissing += Math.max(0, MAX_CARD_COPIES - owned);
    });
    return Math.min(pointMax, totalMissing);
  }

  // 3. アイテム種別ごとの所持可能上限計算
  const itemType = item.type;
  const isOneTimeItem =
    itemType === 'skin' ||
    itemType === 'premium' ||
    itemType === 'playmat' ||
    itemType === 'icon';

  if (isOneTimeItem) {
    // スキン、プレミアム、プレイマット、アイコン等は1回限定アンロック
    return Math.min(pointMax, 1);
  }

  if (itemType === 'card') {
    // 通常カードは最大4枚所持。上限は (4 - 所持枚数)
    const cardId = item.id;
    const currentOwned = Number(playerInventory[cardId]) || 0;
    const missing = Math.max(0, MAX_CARD_COPIES - currentOwned);
    return Math.min(pointMax, missing);
  }

  return Math.min(pointMax, 1);
}

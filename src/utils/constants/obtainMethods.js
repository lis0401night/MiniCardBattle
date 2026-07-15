/**
 * Mini Card Battle - Obtain Methods Mapping constants and helpers
 */
import { CHARACTERS } from './characters.js';

export const OBTAIN_METHOD_MAP = {
  initial: '初期カード',
  exchange_defense: '交換所（防衛戦）',
  exchange_challenge: '交換所（試練の宮殿）',
  exchange_tournament: '交換所（夢幻の闘技祭）',
  achievement: '実績',
  token: 'トークン（特殊効果による配置）',
  gacha: 'ガチャなど',
};

const DIFFICULTY_MAP = {
  easy: '初級',
  normal: '中級',
  hard: '上級',
  high: '超級',
};

/**
 * 入手方法のID配列を日本語表示用テキストに変換します。
 * @param {string[]} obtainIds - 入手方法ID配列
 * @param {boolean} [isToken=false] - トークンカードかどうか
 * @returns {string} スラッシュで結合した日本語テキスト
 */
export function getObtainMethodsText(obtainIds, isToken = false) {
  if (isToken) {
    return OBTAIN_METHOD_MAP.token;
  }
  if (!Array.isArray(obtainIds) || obtainIds.length === 0) {
    return OBTAIN_METHOD_MAP.gacha;
  }

  const texts = obtainIds.map((id) => {
    if (OBTAIN_METHOD_MAP[id]) {
      return OBTAIN_METHOD_MAP[id];
    }

    // チュートリアルの場合 (例: android_tutorial)
    const tutorialMatch = id.match(/^([a-zA-Z0-9_]+)_tutorial$/);
    if (tutorialMatch) {
      const charId = tutorialMatch[1];
      const rawName = CHARACTERS[charId]?.name || charId;
      const charName = rawName.split(/[\s\u3000]+/).pop();
      return `${charName}（チュートリアル）`;
    }

    // 敵デッキIDの場合 (例: android_easy, cthulhu_high)
    const match = id.match(/^([a-zA-Z0-9_]+)_(easy|normal|hard|high)$/);
    if (match) {
      const charId = match[1];
      const diffKey = match[2];
      const rawName = CHARACTERS[charId]?.name || charId;
      const charName = rawName.split(/[\s\u3000]+/).pop();
      const diffName = DIFFICULTY_MAP[diffKey] || diffKey;
      return `${charName}（${diffName}）`;
    }

    return id;
  });

  return texts.join(' / ');
}

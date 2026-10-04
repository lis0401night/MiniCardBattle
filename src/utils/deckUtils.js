/**
 * @fileoverview デッキデータの正規化や各種変換処理を提供する共通ユーティリティモジュール。
 */

import { GameState } from '../state/gameState.js';

/**
 * カード配列（文字列またはオブジェクト）を { id, isPremium, isShine } の配列構造に正規化する。
 * 有効なカードIDを解決できない不正な要素は除外する。
 *
 * @param {Array<string|Object>} cards - 正規化対象のカード配列
 * @param {Array<string>} [premiumCardsList=GameState.premiumCards] - プレミアム所持カードIDの配列
 * @param {Array<string>} [shineCardsList=GameState.shineCards] - シャイン有効カードIDの配列
 * @returns {Array<{id: string, isPremium: boolean, isShine: boolean}>} 正規化済みのデッキ定義配列
 */
export function toDeckObjects(
  cards,
  premiumCardsList = GameState.premiumCards,
  shineCardsList = GameState.shineCards
) {
  if (!Array.isArray(cards)) return [];
  const premList = Array.isArray(premiumCardsList) ? premiumCardsList : [];
  const shineList = Array.isArray(shineCardsList) ? shineCardsList : [];
  return cards
    .map((c) => {
      // baseId が文字列の場合のみ優先使用し、非文字列や未定義の場合は id へ安全にフォールバック
      const cId =
        typeof c === 'string'
          ? c
          : typeof c?.baseId === 'string' && c.baseId.length > 0
            ? c.baseId
            : typeof c?.id === 'string' && c.id.length > 0
              ? c.id
              : null;
      if (!cId) return null;

      // カードオブジェクト自体に isPremium (boolean) が設定されている場合はそれを優先し、無ければ所持リストで判定する
      const isPrem =
        c && typeof c === 'object' && typeof c.isPremium === 'boolean'
          ? c.isPremium
          : premList.includes(cId);

      // カードオブジェクト自体に isShine (boolean) が設定されている場合はそれを優先し、無ければ有効リストで判定する
      const isShn =
        c && typeof c === 'object' && typeof c.isShine === 'boolean'
          ? c.isShine
          : shineList.includes(cId);

      return { id: cId, isPremium: isPrem, isShine: isShn };
    })
    .filter(Boolean);
}

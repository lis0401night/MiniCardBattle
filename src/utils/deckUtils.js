/**
 * @fileoverview デッキデータの正規化や各種変換処理を提供する共通ユーティリティモジュール。
 */

import { GameState } from '../state/gameState.js';
import { CARD_MASTER } from './constants/cards.js';

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

/**
 * デッキ配列（カードID文字列またはカードオブジェクト混在）を、
 * CARD_MASTER に基づく完全なカードオブジェクト配列へ正規化する。
 * 相手デッキへの自プレイヤー設定漏洩を防ぐため、`isSelfDeck` が true の場合のみ
 * 対象デッキまたは GameState のプレミアム／シャイン設定をフォールバック参照する。
 *
 * @param {Array<string|Object>} rawDeck - カードオブジェクトまたはカードID文字列の配列
 * @param {Object} [options={}] - 正規化オプション
 * @param {boolean} [options.isSelfDeck=false] - 自プレイヤーのデッキかどうか（false の場合は未指定の装飾を false 固定にする）
 * @param {Object|null} [options.activeDeck=null] - 自デッキ参照時に優先するデッキ定義オブジェクト（省略時は選択中デッキを参照）
 * @returns {Array<Object>} 正規化されたカードオブジェクト配列
 */
export function normalizeDeckCardTemplates(
  rawDeck,
  { isSelfDeck = false, activeDeck = null } = {}
) {
  if (!Array.isArray(rawDeck)) return [];
  const resolvedActiveDeck = isSelfDeck
    ? activeDeck || GameState.decks?.[GameState.currentDeckIndex] || null
    : null;

  return rawDeck
    .map((c) => {
      if (!c) return null;
      const actualId =
        typeof c === 'string'
          ? c
          : typeof c?.baseId === 'string' && c.baseId.length > 0
            ? c.baseId
            : typeof c?.id === 'string' && c.id.length > 0
              ? c.id
              : null;
      if (!actualId) return null;
      const template = CARD_MASTER.find((m) => m.id === actualId);
      if (!template) return null;

      // 相手側デッキではカードオブジェクトに明示されていない限り自プレイヤー設定を参照せず通常版（false）に固定する
      const isPremium =
        typeof c === 'object' && typeof c.isPremium === 'boolean'
          ? c.isPremium
          : isSelfDeck
            ? Array.isArray(resolvedActiveDeck?.premiumCards)
              ? resolvedActiveDeck.premiumCards.includes(actualId)
              : (GameState.premiumCards || []).includes(actualId)
            : false;
      const isShine =
        typeof c === 'object' && typeof c.isShine === 'boolean'
          ? c.isShine
          : isSelfDeck
            ? Array.isArray(resolvedActiveDeck?.shineCards)
              ? resolvedActiveDeck.shineCards.includes(actualId)
              : (GameState.shineCards || []).includes(actualId)
            : false;

      return {
        ...template,
        ...(typeof c === 'object' ? c : {}),
        // 過去バトルのインスタンスID（blue_... 等）が混入していても必ずマスタIDへ正規化する
        id: template.id,
        isPremium,
        isShine,
      };
    })
    .filter(Boolean);
}

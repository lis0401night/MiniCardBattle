/**
 * クイックマッチCPU対戦定義：聖騎士 セレスティア
 * デフォルトスキン、セレスティア専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import knightDeck from '../knight.js';

export default {
  characterId: 'knight',
  skin: 'default',
  playmat: 'knight',
  stage: 'knight',
  deck: [...knightDeck.hard],
};

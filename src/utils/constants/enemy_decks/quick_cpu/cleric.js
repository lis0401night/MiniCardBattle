/**
 * クイックマッチCPU対戦定義：狂信の聖職者 エリシア
 * デフォルトスキン、エリシア専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import clericDeck from '../cleric.js';

export default {
  characterId: 'cleric',
  skin: 'default',
  playmat: 'cleric',
  stage: 'cleric',
  deck: [...clericDeck.hard],
};

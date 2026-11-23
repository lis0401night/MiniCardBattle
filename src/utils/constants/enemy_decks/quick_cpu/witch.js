/**
 * クイックマッチCPU対戦定義：時駆けの魔女 クロエ
 * デフォルトスキン、クロエ専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import witchDeck from '../witch.js';

export default {
  characterId: 'witch',
  skin: 'default',
  playmat: 'witch',
  stage: 'witch',
  deck: [...witchDeck.hard],
};

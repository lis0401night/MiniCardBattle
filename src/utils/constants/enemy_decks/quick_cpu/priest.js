/**
 * クイックマッチCPU対戦定義：王墓の守護者 ネフティ
 * デフォルトスキン、ネフティ専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import priestDeck from '../priest.js';

export default {
  characterId: 'priest',
  skin: 'default',
  playmat: 'priest',
  stage: 'priest',
  deck: [...priestDeck.hard],
};

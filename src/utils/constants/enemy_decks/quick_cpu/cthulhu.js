/**
 * クイックマッチCPU対戦定義：深淵の呼び声 ナイア
 * デフォルトスキン、ナイア専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import cthulhuDeck from '../cthulhu.js';

export default {
  characterId: 'cthulhu',
  skin: 'default',
  playmat: 'cthulhu',
  stage: 'cthulhu',
  deck: [...cthulhuDeck.hard],
};

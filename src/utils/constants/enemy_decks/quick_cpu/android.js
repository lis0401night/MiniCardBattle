/**
 * クイックマッチCPU対戦定義：機動戦姫 アイギス
 * デフォルトスキン、アイギス専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import androidDeck from '../android.js';

export default {
  characterId: 'android',
  skin: 'default',
  playmat: 'android',
  stage: 'android',
  deck: [...androidDeck.hard],
};

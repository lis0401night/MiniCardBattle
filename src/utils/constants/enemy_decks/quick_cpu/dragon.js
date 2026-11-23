/**
 * クイックマッチCPU対戦定義：焔竜姫 イグニス
 * デフォルトスキン、イグニス専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import dragonDeck from '../dragon.js';

export default {
  characterId: 'dragon',
  skin: 'default',
  playmat: 'dragon',
  stage: 'dragon',
  deck: [...dragonDeck.hard],
};

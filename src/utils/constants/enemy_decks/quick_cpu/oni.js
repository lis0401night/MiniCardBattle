/**
 * クイックマッチCPU対戦定義：鬼血の陰陽師 カグラ
 * デフォルトスキン、カグラ専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import oniDeck from '../oni.js';

export default {
  characterId: 'oni',
  skin: 'default',
  playmat: 'oni',
  stage: 'oni',
  deck: [...oniDeck.hard],
};

/**
 * クイックマッチCPU対戦定義：魔皇女 ベルカ
 * デフォルトスキン、ベルカ専用プレイマット・ステージ、運命の邂逅と同一のデッキ構成
 */
import daughterFortuneDeck from '../event_fortune/daughter.js';

export default {
  characterId: 'daughter',
  skin: 'default',
  playmat: 'daughter',
  stage: 'daughter',
  deck: [...daughterFortuneDeck],
};

/**
 * クイックマッチCPU対戦定義：紅蓮の翼 アンジェ
 * デフォルトスキン、アンジェ専用プレイマット・ステージ、運命の邂逅と同一のデッキ構成
 */
import valkyriaFortuneDeck from '../event_fortune/valkyria.js';

export default {
  characterId: 'valkyria',
  skin: 'default',
  playmat: 'valkyria',
  stage: 'valkyria',
  deck: [...valkyriaFortuneDeck],
};

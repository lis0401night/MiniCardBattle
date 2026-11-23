/**
 * クイックマッチCPU対戦定義：廃鉄の声 マキナ
 * デフォルトスキン、マキナ専用プレイマット・ステージ、運命の邂逅と同一のデッキ構成
 */
import automataFortuneDeck from '../event_fortune/automata.js';

export default {
  characterId: 'automata',
  skin: 'default',
  playmat: 'automata',
  stage: 'automata',
  deck: [...automataFortuneDeck],
};

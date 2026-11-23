/**
 * クイックマッチCPU対戦定義：悪魔狩り マリア
 * デフォルトスキン、マリア専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import devilhunterDeck from '../devilhunter.js';

export default {
  characterId: 'devilhunter',
  skin: 'default',
  playmat: 'devilhunter',
  stage: 'devilhunter',
  deck: [...devilhunterDeck.hard],
};

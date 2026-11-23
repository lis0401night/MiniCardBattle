/**
 * クイックマッチCPU対戦定義：流浪の射手 リナ
 * デフォルトスキン、リナ専用プレイマット・ステージ、通常対戦ハードと同一のデッキ構成
 */
import elfDeck from '../elf.js';

export default {
  characterId: 'elf',
  skin: 'default',
  playmat: 'elf',
  stage: 'elf',
  deck: [...elfDeck.hard],
};

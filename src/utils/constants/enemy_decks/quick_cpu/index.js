/**
 * クイックマッチCPU対戦用の敵設定およびデッキ定義を集約するモジュールです。
 * トーナメントと同様に専用ディレクトリで各キャラクターごとの設定を管理し、
 * スキン（デフォルト）、キャラクター専用プレイマット、ステージ、ハード難易度デッキを保持します。
 */
import android from './android.js';
import automata from './automata.js';
import cleric from './cleric.js';
import cthulhu from './cthulhu.js';
import devilhunter from './devilhunter.js';
import dragon from './dragon.js';
import elf from './elf.js';
import knight from './knight.js';
import oni from './oni.js';
import priest from './priest.js';
import valkyria from './valkyria.js';
import witch from './witch.js';

/**
 * 全クイックマッチCPU設定のマップ
 * @type {Record<string, { characterId: string, skin: string, playmat: string, stage: string, deck: string[] }>}
 */
export const QUICK_CPU_CONFIGS = {
  android,
  automata,
  cleric,
  cthulhu,
  devilhunter,
  dragon,
  elf,
  knight,
  oni,
  priest,
  valkyria,
  witch,
};

/**
 * クイックマッチCPU対戦用のキャラクターID一覧
 * @type {string[]}
 */
export const QUICK_CPU_CHARACTER_IDS = Object.keys(QUICK_CPU_CONFIGS);

/**
 * クイックマッチCPU対戦用の設定をランダムに抽選して取得する。
 * プレイヤーと同じキャラクターは可能な限り避けて選定する。
 * @param {string} [playerCharId=null] - プレイヤーが使用しているキャラクターID
 * @returns {{ characterId: string, skin: string, playmat: string, stage: string, deck: string[] }} 選択されたCPU設定
 */
export function getRandomQuickCpuConfig(playerCharId = null) {
  let candidates = QUICK_CPU_CHARACTER_IDS;
  if (playerCharId && candidates.length > 1) {
    const filtered = candidates.filter((id) => id !== playerCharId);
    if (filtered.length > 0) {
      candidates = filtered;
    }
  }
  const chosenId = candidates[Math.floor(Math.random() * candidates.length)];
  return QUICK_CPU_CONFIGS[chosenId];
}

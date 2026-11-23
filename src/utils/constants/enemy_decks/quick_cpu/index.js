/**
 * クイックマッチCPU対戦用の敵設定およびデッキ定義を集約するモジュールです。
 * トーナメントと同様に専用ディレクトリで各キャラクターごとの設定を管理し、
 * スキン（デフォルト）、キャラクター専用プレイマット、ステージ、ハード難易度デッキを保持します。
 */
import android from './android.js';
import automata from './automata.js';
import cleric from './cleric.js';
import cthulhu from './cthulhu.js';
import daughter from './daughter.js';
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
  daughter,
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
 * クイックマッチCPU対戦用のキャラクターID一覧（複数スキン登録時も重複を除外）
 * @type {string[]}
 */
export const QUICK_CPU_CHARACTER_IDS = Array.from(
  new Set(Object.values(QUICK_CPU_CONFIGS).map((cfg) => cfg.characterId))
);

/**
 * クイックマッチCPU対戦用の設定をランダムに抽選して取得する。
 * 同一キャラクターの別スキン＋別デッキ設定が追加された場合も正しく除外できるよう、
 * キー名ではなく各設定の `characterId` プロパティでプレイヤーキャラとの被りを判定する。
 *
 * @param {string|null} [playerCharId=null] - プレイヤーが使用しているキャラクターID
 * @returns {{ characterId: string, skin: string, playmat: string, stage: string, deck: string[] }} 選択されたCPU設定
 */
export function getRandomQuickCpuConfig(playerCharId = null) {
  let candidates = Object.values(QUICK_CPU_CONFIGS);
  if (playerCharId && candidates.length > 1) {
    const filtered = candidates.filter(
      (cfg) => cfg.characterId !== playerCharId
    );
    if (filtered.length > 0) {
      candidates = filtered;
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

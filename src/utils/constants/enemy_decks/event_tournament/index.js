/**
 * イベントトーナメント用の敵デッキ定義を集約するモジュールです。
 * 各キャラクター（android, cleric, cthulhu等）がトーナメント戦で使用する
 * 専用デッキ定義のバリエーションをインポートし、集約オブジェクトとしてエクスポートします。
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
import witch from './witch.js';

/**
 * 各キャラクターIDに対応するトーナメント戦用デッキ定義のマップです。
 * ES6ショートハンド記法を使用して可読性と保守性を向上させています。
 */
export const TOURNAMENT_DECKS = {
  android,
  automata,
  cleric,
  cthulhu,
  dragon,
  elf,
  knight,
  devilhunter,
  witch,
  oni,
  priest,
};

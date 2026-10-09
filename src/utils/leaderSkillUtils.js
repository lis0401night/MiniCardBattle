import { CHARACTERS } from './constants/characters.js';
import { LEADER_SKILLS } from './constants/leaderSkills.js';
import { CARD_MASTER } from './constants/cards.js';
import {
  CHAR_FORTUNE_HANDICAPS,
  HANDICAP_TYPES,
} from './constants/fortuneHandicaps.js';

/**
 * 運命の邂逅（特級目標：相手のリーダースキル変更）における敵専用リーダースキル定義の対応マップ
 */
const FORTUNE_ENEMY_LEADER_SKILLS = {
  automata: LEADER_SKILLS.last_battalion,
  valkyria: LEADER_SKILLS.ragnarok,
};

/**
 * 対象リーダーのコンフィグオブジェクトまたはID文字列から、CHARACTERS や CARD_MASTER と照合可能なマスタIDを安全に特定する。
 * 試練の宮殿の敵（ボス: charId、モブ: leaderCardId）および通常対戦（id）の構造的差異を共通吸収する。
 *
 * @param {Object|string|null} configOrId - GameState.playerConfig / GameState.enemyConfig またはID文字列
 * @returns {string|null} 特定されたマスタID（未特定時はnull）
 */
export function extractLeaderMasterId(configOrId) {
  if (!configOrId) return null;
  if (typeof configOrId === 'string') {
    return configOrId;
  }
  return configOrId.charId || configOrId.leaderCardId || configOrId.id || null;
}

/**
 * キャラクター定義から指定スキンの定義オブジェクトを安全に取得する。
 * スキンIDのキー揺らぎ（'assassin' / 'knight_assassin' など）を吸収する。
 *
 * @param {Object} charObj - CHARACTERS[charId] オブジェクト
 * @param {string} skinId - スキンID文字列
 * @returns {Object|null} スキン定義オブジェクト（未定義時はnull）
 */
function getSkinDefinition(charObj, skinId) {
  if (!charObj || !charObj.skins || !skinId) return null;
  const skins = charObj.skins;
  if (skins[skinId]) return skins[skinId];
  if (charObj.id && skins[`${charObj.id}_${skinId}`]) {
    return skins[`${charObj.id}_${skinId}`];
  }
  if (skinId.includes('_')) {
    const suffix = skinId.split('_').slice(1).join('_');
    if (skins[suffix]) return skins[suffix];
  }
  return null;
}

/**
 * リーダースキルの決定ルール5原則に基づき、対象リーダーのリーダースキルを決定・解決する。
 *
 * 【第1段階：どのスキル定義を採用するか（相互排他）】
 *  1. 高難易度イベント（敵側）: event_*_high かつ isEnemy -> CHARACTERS[masterId].event_high.leaderSkill
 *  2. 試練の宮殿 高難易度ボス（敵側）: isHighBoss かつ isEnemy -> CHARACTERS[masterId].event_high.leaderSkill
 *  3. 運命の邂逅（敵側）: event_*_fortune かつ isEnemy かつ enemy_leader_skill_change -> 専用スキル (automata: last_battalion / valkyria: ragnarok)
 *  4. 試練の宮殿 モブリーダー: CARD_MASTER 由来のモブ敵/モブプレイヤー -> モブ専用召喚スキル (cost: 4, action: 'dungeon_summon_leader') または渡された customLeaderSkill
 *     ※CARD_MASTER と CHARACTERS に同名キー（cleric, dragon等7体）が存在するため、isMobLeader や leaderCardId で明示判定する
 *  5. スキン固有スキル: skinDef.leaderSkill が存在 -> skinDef.leaderSkill (例: レダスキンの「死の標的」)
 *  6. キャラクター基本スキル: CHARACTERS[masterId].leaderSkill (デフォルト)
 *
 * 【第2段階：決定されたスキルへのパラメータ補正】
 *  1. 運命の邂逅モード (event_*_fortune): 有効な特級目標に応じた SP コスト増減
 *     - プレイヤー側: PLAYER_SP ハンディキャップ値加算
 *     - 敵側: ENEMY_SP ハンディキャップ値加算 (下限1)
 *     - desc 内の (SP:\d+) を新しいコストに置換
 *  2. 試練の宮殿 モブリーダー: SP コストを 4 に固定
 *
 * @param {Object} options - 決定条件オプション
 * @param {string|Object} options.charId - キャラクターID文字列またはリーダーコンフィグオブジェクト
 * @param {string} [options.skinId='default'] - スキンID（例: 'default', 'assassin', 'elf_high'）
 * @param {boolean} [options.isEnemy=false] - 敵側キャラクターかどうか
 * @param {string} [options.gameMode=''] - 現在のゲームモード（例: 'event_elf_high', 'event_automata_fortune', 'dungeon'）
 * @param {boolean} [options.isHighBoss=false] - 試練の宮殿等の高難易度ボスフラグ
 * @param {boolean} [options.isMobLeader=false] - 試練の宮殿等のモブリーダーフラグ（明示指定）
 * @param {Object} [options.fortuneHandicaps=null] - 運命の邂逅のハンディキャップ設定（GameState.fortuneHandicaps）
 * @param {Object} [options.cardMaster=null] - モブリーダー用のカードマスターデータ（試練の宮殿用）
 * @param {Object} [options.customLeaderSkill=null] - モブリーダーや防衛戦等で既に固有指定されている場合のスキル
 * @returns {Object|null} 解決・ディープクローンされたリーダースキルオブジェクト（存在しない場合はnull）
 */
export function resolveLeaderSkill(options = {}) {
  const {
    charId,
    skinId = 'default',
    isEnemy = false,
    gameMode = '',
    isHighBoss = false,
    isMobLeader = false,
    fortuneHandicaps = null,
    cardMaster = null,
    customLeaderSkill = null,
  } = options;

  // charId がオブジェクトまたは動的ID形式の場合でも共通ヘルパーで安全にマスタIDを取り出す
  const masterId = extractLeaderMasterId(charId);
  if (!masterId) return null;

  const charObj = CHARACTERS[masterId] || null;

  // モード判定ヘルパー
  const isHighDiffMode =
    typeof gameMode === 'string' &&
    gameMode.startsWith('event_') &&
    gameMode.endsWith('_high');
  const isFortuneMode =
    typeof gameMode === 'string' &&
    gameMode.startsWith('event_') &&
    gameMode.endsWith('_fortune');

  // モブリーダー判定:
  // 1. isMobLeader が明示的に true
  // 2. 渡されたオブジェクトがモブ敵の構造（leaderCardId を持ち、charId を持たない）
  // 3. cardMaster が明示的に渡されている
  // 4. CHARACTERS に存在せず、CARD_MASTER に存在する
  const isMob = Boolean(
    isMobLeader ||
    (typeof charId === 'object' && charId?.leaderCardId && !charId?.charId) ||
    cardMaster ||
    (!charObj && CARD_MASTER.some((c) => c.id === masterId))
  );

  let baseSkill = null;
  let isMobApplied = false;

  // --- 【第1段階：どのスキル定義を採用するか（相互排他）】 ---

  // 1. ③ 高難易度イベント（敵側）
  if (isEnemy && isHighDiffMode && charObj?.event_high?.leaderSkill) {
    baseSkill = charObj.event_high.leaderSkill;
  }
  // 2. ④ 試練の宮殿 高難易度ボス（敵側）
  else if (isEnemy && isHighBoss && charObj?.event_high?.leaderSkill) {
    baseSkill = charObj.event_high.leaderSkill;
  }
  // 3. ⑤-a 運命の邂逅 敵スキル変更（敵側）
  else if (
    isEnemy &&
    isFortuneMode &&
    fortuneHandicaps?.enemy_leader_skill_change &&
    FORTUNE_ENEMY_LEADER_SKILLS[masterId]
  ) {
    baseSkill = FORTUNE_ENEMY_LEADER_SKILLS[masterId];
  }
  // 4. ④-mob 試練の宮殿 モブリーダー（プレイヤー/敵問わず、CARD_MASTERベース）
  // ※CARD_MASTER と CHARACTERS に同名キー（cleric, dragon等7体）が存在するため、
  // isMob フラグによる明示的判定でキャラ基本スキルへの誤判定を完全に防止する
  else if (isMob) {
    isMobApplied = true;
    if (customLeaderSkill) {
      baseSkill = customLeaderSkill;
    } else {
      const card = cardMaster || CARD_MASTER.find((c) => c.id === masterId);
      if (card) {
        baseSkill = {
          name: `${card.name}の召喚`,
          desc: `(SP:4) 自分のレーンに「${card.name}(P:${card.power})」を1体召喚する。`,
          cost: 4,
          action: 'dungeon_summon_leader',
        };
      }
    }
  }
  // 5. ② スキン固有スキル（プレイヤー/敵問わず）
  else {
    const skinDef = getSkinDefinition(charObj, skinId);
    if (skinDef?.leaderSkill) {
      baseSkill = skinDef.leaderSkill;
    }
    // 6. ① キャラクター基本スキル（デフォルト）
    else if (charObj?.leaderSkill) {
      baseSkill = charObj.leaderSkill;
    }
  }

  // スキルが定義されていない場合は null
  if (!baseSkill) return null;

  // 副作用防止のためディープコピーを作成
  const resolvedSkill = JSON.parse(JSON.stringify(baseSkill));

  // --- 【第2段階：決定されたスキルへのパラメータ補正】 ---

  // 1. ⑤-b 運命の邂逅 SP補正
  if (isFortuneMode && fortuneHandicaps) {
    const enemyCharId = gameMode.replace('event_', '').replace('_fortune', '');
    const handicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];

    handicapsList.forEach((h) => {
      if (!fortuneHandicaps[h.id]) return;

      if (!isEnemy && h.type === HANDICAP_TYPES.PLAYER_SP) {
        resolvedSkill.cost = (resolvedSkill.cost ?? 0) + h.value;
      } else if (isEnemy && h.type === HANDICAP_TYPES.ENEMY_SP) {
        // 元の仕様通り下限1を保証
        resolvedSkill.cost = Math.max(1, (resolvedSkill.cost ?? 0) + h.value);
      }
    });

    // コスト変更に応じて説明文中の (SP:\d+) を更新
    if (typeof resolvedSkill.desc === 'string') {
      resolvedSkill.desc = resolvedSkill.desc.replace(
        /\(SP:\d+\)/,
        `(SP:${resolvedSkill.cost})`
      );
    }
  }

  // 2. 試練の宮殿 モブリーダーのSP固定（4固定）
  if (isMobApplied && resolvedSkill.action === 'dungeon_summon_leader') {
    resolvedSkill.cost = 4;
  }

  return resolvedSkill;
}

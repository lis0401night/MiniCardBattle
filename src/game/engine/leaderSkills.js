/**
 * src/game/engine/leaderSkills.js
 * Mini Card Battle - リーダースキル純粋計算モジュール
 *
 * リーダースキル発動時のシミュレーション用データ更新ロジックを管理します。
 */

import { getAIDiscardIndices } from '../../utils/aiDiscardLogic.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { ACTIVE_SKILLS } from '../../utils/constants/skills.js';
import {
  applyEquipment,
  clearCardAbilities,
  getSeededRandom,
  hasSkill,
  matchesCardId,
  matchesUnionMaterial,
  resolveStartupFade,
} from '../../utils/gameUtils.js';
import {
  CONDEMNATION_AMOUNT,
  damageCard,
  damageLeader,
  getBestSimulatedPlacementLane,
  GOD_FLAME_AMOUNT,
  healLeader,
  quietDiscardFromBoard,
  RAGNAROK_CARD_DAMAGE_AMOUNT,
} from './core.js';
import {
  canCardBeDestroyed,
  grantValkyriaGuard,
  isGraveKeeperActive,
  isReverseActive,
  isValkyriaGuardActive,
  processDestructionTriggers,
} from './passiveSkills.js';
import { applyActiveSkillLogic } from './activeSkills.js';
import { applySingleCombat } from './combat.js';

/**
 * 盤面への装備（武装）を試み、成功した場合はtrueを返すヘルパー。
 * 「配置（Place）」経路でのトークン装備では原則として召喚時スキルを発動させないため、
 * triggerEquipSkills はデフォルトで false となっています。
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {Array<Object|null>} board - 対象プレイヤーの盤面配列
 * @param {number} lane - 配置・装備先のレーン番号 (0-2)
 * @param {Object} newToken - 装備するトークンまたはカードオブジェクト
 * @param {string} owner - 所有者 ('blue'|'red')
 * @param {Array<Object>} events - 演出イベント配列
 * @param {boolean} [triggerEquipSkills=false] - 装備カード由来のアクティブスキルを発動するかどうか（配置では false）
 * @returns {boolean} 装備（武装）が成功した場合は true、不可能な場合は false
 */
function tryEquipToken(
  state,
  board,
  lane,
  newToken,
  owner,
  events,
  triggerEquipSkills = false
) {
  let boardCard = board[lane];
  if (
    (hasSkill(newToken, 'equip') ||
      (boardCard && hasSkill(boardCard, 'arm_self'))) &&
    boardCard
  ) {
    if (
      !hasSkill(boardCard, 'possession') &&
      !hasSkill(newToken, 'possession') &&
      !hasSkill(boardCard, 'reflect') &&
      !hasSkill(newToken, 'reflect')
    ) {
      // 装備（既存カードの上へ）: applyEquipment に処理を集約
      const { equipSkills } = applyEquipment(boardCard, newToken);
      events.push({
        type: 'equip_card',
        side: owner,
        lane: lane,
        card: JSON.parse(JSON.stringify(newToken)),
      });

      // 召喚経路（triggerEquipSkills = true）の場合のみ、装備カードのアクティブスキルを実行
      // 「配置（Place）」経路ではゲームルールに基づき召喚時アクティブスキルは発動しない
      if (triggerEquipSkills && equipSkills) {
        equipSkills.forEach((sk) => {
          if (ACTIVE_SKILLS.includes(sk.id)) {
            applyActiveSkillLogic(
              state,
              owner,
              lane,
              sk.id,
              sk.value,
              events,
              newToken.cardTokenLanes || null
            );
          }
        });
      }

      return true;
    }
  }
  return false;
}

/**
 * ダメージ＋回復系リーダースキル（神炎 god_flame / 断罪のクロス condemnation）の共通実行ヘルパー
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} action - スキルID ('god_flame' | 'condemnation')
 * @param {string} owner - スキル発動者 ('blue' | 'red')
 * @param {number} damageAmount - 与えるダメージ量および回復量
 * @param {Array} events - イベントログ配列
 */
function executeFlameHealLeaderSkill(
  state,
  action,
  owner,
  damageAmount,
  events
) {
  const isBlue = owner === 'blue';
  const oppOwner = isBlue ? 'red' : 'blue';
  events.push({ type: 'leader_skill', skill: action, side: owner });
  damageLeader(state, oppOwner, damageAmount, action, events);
  healLeader(state, owner, damageAmount, action, events);
}

/**
 * リーダースキルの効果をシミュレーション状態へ適用する（純粋関数）
 *
 * @param {Object} state - バトル状態オブジェクト
 * @param {'blue'|'red'} owner - リーダースキル発動者 ('blue'|'red')
 * @param {string} action - 発動するリーダースキルID (CHARACTERS[key].leaderSkill.action)
 * @param {Array<number>|{my?:number[],enemy?:number[],allied?:number[]}|number|null} [tokenLanes=null] - 指定レーン/手札インデックス等の選択データ
 * @param {Array<Object>} [events=[]] - 発生したイベントログを格納する配列
 * @param {number|null} [forcedTargetIdx=null] - 自分墓地などの強制対象インデックス
 * @param {string|null} [forcedTargetUid=null] - 強制対象カードのUID
 * @param {number|null} [simulatedResurrectLane=null] - 召喚リーダー等の復活先レーン
 * @param {number|null} [forcedOppTargetIdx=null] - 相手墓地の強制対象インデックス
 * @returns {Array<Object>} 発生したイベントログ配列 (events)
 */
export function applyLeaderSkillLogic(
  state,
  owner,
  action,
  tokenLanes = null,
  events = [],
  forcedTargetIdx = null,
  forcedTargetUid = null,
  simulatedResurrectLane = null,
  forcedOppTargetIdx = null
) {
  const isBlue = owner === 'blue';
  const board = isBlue ? state.playerBoard : state.enemyBoard;
  const eBoard = isBlue ? state.enemyBoard : state.playerBoard;
  const oppOwner = isBlue ? 'red' : 'blue';

  if (action === 'iron_march' || action === 'last_battalion') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const automataTpl = CARD_MASTER.find((m) => m.id === 'token_automata');
    if (automataTpl) {
      const repeatCount = action === 'last_battalion' ? 5 : 3;
      for (let i = 0; i < repeatCount; i++) {
        if (state.playerHP <= 0 || state.enemyHP <= 0) break;

        let targetLane = -1;
        if (tokenLanes && tokenLanes[i] !== undefined) {
          targetLane = tokenLanes[i];
        } else {
          // 盤面シミュレーション評価に基づき客観的最適レーンを決定
          targetLane = getBestSimulatedPlacementLane(
            state,
            owner,
            automataTpl,
            [0, 1, 2],
            false
          );
        }
        if (targetLane === -1) break;

        // 1. オートマタの配置 or 起動消滅
        const existing = board[targetLane];
        if (existing && hasSkill(existing, 'startup')) {
          const deepClonedToken = JSON.parse(JSON.stringify(automataTpl));
          const deadToken = {
            ...deepClonedToken,
            id: `automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
            uid: `${owner}_automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
            baseId: automataTpl.id,
            owner,
            power: 1,
            currentPower: 1,
            rarity: automataTpl.rarity || 1,
            isToken: true,
          };
          resolveStartupFade(owner, existing, targetLane, deadToken, events);
        } else {
          // 通常の配置
          if (existing) {
            quietDiscardFromBoard(state, owner, targetLane);
          }

          const deepClonedToken = JSON.parse(JSON.stringify(automataTpl));
          board[targetLane] = {
            ...deepClonedToken,
            id: `automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
            uid: `${owner}_automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
            baseId: automataTpl.id,
            owner,
            power: 1, // パワーを1に設定
            currentPower: 1, // 現在のパワーを1に設定
            rarity: automataTpl.rarity || 1,
            isToken: true,
          };
          board[targetLane].skillTriggered = true;

          events.push({
            type: 'summon_token',
            side: owner,
            lane: targetLane,
            card: JSON.parse(JSON.stringify(board[targetLane])),
            source: action,
          });
        }

        // 2. そのレーンのカードをただちに攻撃させる
        applySingleCombat(state, owner, targetLane, events);

        // 戦闘による破壊処理
        processDestructionTriggers(state, events);
      }
    }
  } else if (action === 'void_purge') {
    events.push({ type: 'leader_skill', skill: action, side: owner });

    const myHand = isBlue ? state.playerHand : state.enemyHand;
    const oppHand = isBlue ? state.enemyHand : state.playerHand;
    const myDiscard = isBlue ? state.playerDiscard : state.enemyDiscard;
    const oppDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    // 1. 自分の手札を捨てる
    let myDiscardIndices = [];
    const myCount = Math.min(3, myHand.length);
    if (tokenLanes && Array.isArray(tokenLanes.my)) {
      myDiscardIndices = [...tokenLanes.my];
    } else if (
      tokenLanes &&
      Array.isArray(tokenLanes) &&
      tokenLanes.length > 0
    ) {
      myDiscardIndices = [...tokenLanes];
    } else {
      const sorted = myHand
        .map((c, i) => ({ c, i }))
        .sort(
          (a, b) =>
            (a.c.currentPower ?? a.c.power ?? 0) -
            (b.c.currentPower ?? b.c.power ?? 0)
        );
      myDiscardIndices = sorted.slice(0, myCount).map((x) => x.i);
    }
    myDiscardIndices.sort((a, b) => b - a);
    let myDiscarded = 0;
    for (const idx of myDiscardIndices) {
      if (myHand[idx]) {
        const card = myHand.splice(idx, 1)[0];
        myDiscard.push(card);
        myDiscarded++;
        events.push({
          type: 'discard_card',
          side: owner,
          card: JSON.parse(JSON.stringify(card)),
          source: 'void_purge',
        });
      }
    }

    // 2. 相手の手札を全て捨てる
    let oppDiscarded = 0;
    let voidDiscarded = 0;
    const oppCards = [...oppHand];
    oppHand.length = 0;
    for (const card of oppCards) {
      if (!card) continue;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウント
      if (matchesCardId(card, 'token_void')) {
        voidDiscarded++;
      }
      if (!card.isToken) {
        oppDiscard.push(card);
      }
      oppDiscarded++;
      events.push({
        type: 'discard_card',
        side: oppOwner,
        card: JSON.parse(JSON.stringify(card)),
        source: 'void_purge',
      });
    }

    // 相手が捨てた虚空の枚数分、相手がダメージを受ける
    if (voidDiscarded > 0) {
      damageLeader(state, oppOwner, voidDiscarded, 'void_purge', events);
    }

    // 3. 虚空を追加
    const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
      id: 'token_void',
      name: '虚空',
      power: 0,
    };
    for (let i = 0; i < myDiscarded; i++) {
      myHand.push({
        ...voidTpl,
        uid: `${owner}_void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
        owner: owner,
        baseId: 'token_void',
        isToken: true,
        currentPower: voidTpl.power ?? 0,
      });
    }
    for (let i = 0; i < oppDiscarded; i++) {
      oppHand.push({
        ...voidTpl,
        uid: `${oppOwner}_void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
        owner: oppOwner,
        baseId: 'token_void',
        isToken: true,
        currentPower: voidTpl.power ?? 0,
      });
    }
  } else if (action === 'viola_domination') {
    events.push({ type: 'leader_skill', skill: action, side: owner });

    let targetLane = -1;
    const mySealedLanes = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;
    if (tokenLanes && Array.isArray(tokenLanes) && tokenLanes.length > 0) {
      targetLane = tokenLanes[0];
    } else if (tokenLanes !== null && typeof tokenLanes === 'number') {
      targetLane = tokenLanes;
    } else {
      const validLanes = [];
      for (let i = 0; i < 3; i++) {
        if (eBoard[i] && (!mySealedLanes || mySealedLanes[i] === 0)) {
          validLanes.push(i);
        }
      }
      validLanes.sort(
        (a, b) =>
          (eBoard[b].currentPower ?? eBoard[b].power ?? 0) -
          (eBoard[a].currentPower ?? eBoard[a].power ?? 0)
      );
      if (validLanes.length > 0) {
        targetLane = validLanes[0];
      }
    }

    if (
      targetLane !== -1 &&
      eBoard[targetLane] !== null &&
      (!mySealedLanes || mySealedLanes[targetLane] === 0)
    ) {
      const selectedCard = eBoard[targetLane];
      eBoard[targetLane] = null;

      // 1. VFX再生イベントを登録（演出再生システムに統合）
      events.push({
        type: 'vfx_trigger',
        vfxId: 'anm_viola_arts',
        side: owner,
        lane: targetLane,
      });

      selectedCard.puppetOriginalOwner =
        selectedCard.puppetOriginalOwner || selectedCard.owner || oppOwner;
      if (selectedCard.equippedCards && selectedCard.equippedCards.length > 0) {
        selectedCard.equippedCards.forEach((eqCard) => {
          eqCard.puppetOriginalOwner =
            eqCard.puppetOriginalOwner || eqCard.owner || oppOwner;
        });
      }

      if (
        board[targetLane] &&
        (hasSkill(selectedCard, 'equip') ||
          hasSkill(board[targetLane], 'arm_self')) &&
        !hasSkill(board[targetLane], 'possession') &&
        !hasSkill(selectedCard, 'possession') &&
        !hasSkill(board[targetLane], 'reflect') &&
        !hasSkill(selectedCard, 'reflect')
      ) {
        const targetCard = board[targetLane];
        // 装備（既存カードの上へ）: applyEquipment に処理を集約
        applyEquipment(targetCard, selectedCard);

        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(targetCard)),
          source: 'equip',
          stealFromLane: targetLane, // 奪い元のレーンを指定
        });
      } else {
        const existingCard = board[targetLane];
        if (existingCard) {
          const myDiscard = isBlue ? state.playerDiscard : state.enemyDiscard;
          myDiscard.push(existingCard);
          events.push({
            type: 'discard_card',
            side: owner,
            card: JSON.parse(JSON.stringify(existingCard)),
            source: 'viola_domination_overwrite',
          });
        }

        const movedCard = {
          ...selectedCard,
          owner: owner,
          skillTriggered: true,
          stunTurns: selectedCard.stunTurns || 0,
          stunAppliedThisTurn: selectedCard.stunAppliedThisTurn || false,
        };
        board[targetLane] = movedCard;

        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(movedCard)),
          source: 'viola_domination',
          stealFromLane: targetLane, // 奪い元のレーンを指定
        });
      }
    }
  } else if (action === 'seal_lanes') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    let targets =
      tokenLanes && Array.isArray(tokenLanes) ? [...tokenLanes] : [];
    if (targets.length === 0) {
      const sealedLanes = isBlue
        ? state.enemySealedLanes
        : state.playerSealedLanes;
      const priority = [1, 0, 2]; // 中央 > 左 > 右
      // 1. まず敵カードが居るレーンを優先選択
      for (let l of priority) {
        if ((!sealedLanes || sealedLanes[l] === 0) && eBoard[l] !== null) {
          targets.push(l);
          if (targets.length >= 2) break;
        }
      }
      // 2. まだ選択肢が残っていれば中央→左→右の優先度で埋める
      if (targets.length < 2) {
        for (let l of priority) {
          if (targets.includes(l)) continue;
          if (!sealedLanes || sealedLanes[l] === 0) {
            targets.push(l);
            if (targets.length >= 2) break;
          }
        }
      }
    }

    for (const lane of targets) {
      // Apply Seal (高い方の値を維持・適用)
      if (isBlue) {
        if (state.enemySealedLanes)
          state.enemySealedLanes[lane] = Math.max(
            state.enemySealedLanes[lane] || 0,
            1
          );
      } else {
        if (state.playerSealedLanes)
          state.playerSealedLanes[lane] = Math.max(
            state.playerSealedLanes[lane] || 0,
            1
          );
      }

      // Damage card if exists
      if (eBoard[lane] !== null) {
        damageCard(state, oppOwner, lane, 4, 'seal_lanes', events, true);
      }
    }
  } else if (action === 'night_parade') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const sealedLanes = isBlue
      ? state.enemySealedLanes
      : state.playerSealedLanes;

    let enemyTargets = [];
    if (tokenLanes && tokenLanes.enemy) {
      enemyTargets = [...tokenLanes.enemy];
    } else if (Array.isArray(tokenLanes) && tokenLanes.length > 0) {
      enemyTargets = [...tokenLanes];
    } else {
      // AI Selection Logic
      const priorityLanes = [0, 2, 1].filter(
        (i) => !sealedLanes || sealedLanes[i] === 0
      );
      priorityLanes.sort(
        (a, b) =>
          (eBoard[b]?.currentPower || 0) - (eBoard[a]?.currentPower || 0)
      );
      enemyTargets = priorityLanes.slice(0, 2);
    }

    for (const lane of enemyTargets) {
      // Apply Seal (高い方の値を維持・適用)
      if (isBlue) {
        if (state.enemySealedLanes)
          state.enemySealedLanes[lane] = Math.max(
            state.enemySealedLanes[lane] || 0,
            1
          );
      } else {
        if (state.playerSealedLanes)
          state.playerSealedLanes[lane] = Math.max(
            state.playerSealedLanes[lane] || 0,
            1
          );
      }

      // Damage card if exists
      if (eBoard[lane] !== null) {
        damageCard(state, oppOwner, lane, 4, 'night_parade', events, true);
      }
    }
    // ※ processDestructionTriggers は呼び出し元 (leaderSkills.js) 側で一括実行する
    //    ここで呼ぶとイベントが二重になるため削除

    // Summon Hitodamas
    let allyTargets = [];

    const tM = CARD_MASTER.find((m) => m.id === 'token_soul') || {
      name: '人魂',
      power: 1,
    };

    if (tokenLanes && tokenLanes.allied) {
      allyTargets = [...tokenLanes.allied].slice(0, 1);
    } else {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定
      const bestAllyLane = getBestSimulatedPlacementLane(
        state,
        owner,
        tM,
        [0, 1, 2],
        false
      );
      if (bestAllyLane !== -1) {
        allyTargets = [bestAllyLane];
      }
    }
    for (let idx = 0; idx < allyTargets.length; idx++) {
      const lane = allyTargets[idx];
      const newToken = {
        ...JSON.parse(JSON.stringify(tM)),
        // ...tM のスプレッド後にidを設定し、tM.id による上書きを防ぐ
        id: `tk_np_${Math.floor(getSeededRandom() * 1000000000)}_${idx}`,
        baseId: tM.id,
        owner,
        currentPower: tM.power || 1,
        rarity: tM.rarity || 1,
        isToken: true,
        skillTriggered: true, // 配置なので召喚時スキルは発動させない
      };

      if (!tryEquipToken(state, board, lane, newToken, owner, events)) {
        if (board[lane] !== null) {
          quietDiscardFromBoard(state, owner, lane);
        }
        board[lane] = newToken;
        events.push({
          type: 'summon_token',
          side: owner,
          lane: lane,
          card: JSON.parse(JSON.stringify(newToken)),
          source: 'night_parade',
        });
      }
    }
  } else if (action === 'annihilation') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    for (let i = 0; i < 3; i++) {
      if (eBoard[i]) {
        damageCard(state, oppOwner, i, 4, 'annihilation', events, true);
      }
    }
  } else if (action === 'android_high_volley') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    // 敵の場のすべてのカードに4ダメージ
    for (let i = 0; i < 3; i++) {
      if (eBoard[i]) {
        damageCard(state, oppOwner, i, 4, 'android_high_volley', events, true);
      }
    }
    // 敵リーダーに4ダメージ
    damageLeader(state, oppOwner, 4, 'android_high_volley', events);
  } else if (action === 'dragon_high_ritual') {
    // ===== 焦熱のプレリュード =====
    // 効果①：敵の場のすべてのカードに2ダメージ（免疫は無効）
    events.push({ type: 'leader_skill', skill: action, side: owner });
    for (let i = 0; i < 3; i++) {
      // 相手の場のカードに2ダメージ
      if (eBoard[i]) {
        damageCard(state, oppOwner, i, 2, 'dragon_high_ritual', events, true);
      }
    }
    processDestructionTriggers(state, events);

    // 効果②：自分のレーンにイグニストークン(P:7/伝説)を「配置」（制約チェックなし）
    let dragonRitualLane = -1;
    const tM = CARD_MASTER.find((m) => m.id === 'token_ignis');
    if (tokenLanes && tokenLanes.length > 0) {
      dragonRitualLane = tokenLanes[0];
    } else if (tM) {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定
      dragonRitualLane = getBestSimulatedPlacementLane(
        state,
        owner,
        { ...tM, power: 7, currentPower: 7 },
        [0, 1, 2],
        false
      );
    }
    if (dragonRitualLane !== -1 && tM) {
      const newToken = {
        ...JSON.parse(JSON.stringify(tM)),
        id: `tk_dr_${Math.floor(getSeededRandom() * 1000000000)}`,
        baseId: tM.id,
        owner,
        currentPower: 7,
        rarity: tM.rarity || 1,
        // imgUrl は getCardImgUrl がスキンを参照して解決する
      };
      if (
        !tryEquipToken(state, board, dragonRitualLane, newToken, owner, events)
      ) {
        if (board[dragonRitualLane] !== null) {
          quietDiscardFromBoard(state, owner, dragonRitualLane);
        }
        board[dragonRitualLane] = newToken;
        events.push({
          type: 'summon_token',
          side: owner,
          lane: dragonRitualLane,
          card: JSON.parse(JSON.stringify(newToken)),
          source: 'dragon_high_ritual',
        });
      }
    }
  } else if (action === 'evil_march') {
    events.push({ type: 'leader_skill', skill: action, side: owner });

    // 1. 騎士(P:2)を最大2体「配置」
    const availableLanes = [];
    const sealedLanes = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;
    for (let i = 0; i < 3; i++) {
      if (!sealedLanes || sealedLanes[i] === 0) {
        availableLanes.push(i);
      }
    }

    const tM = CARD_MASTER.find((m) => m.id === 'token_knight') || {
      name: '騎士',
      power: 2,
    };

    // 指定レーンがあれば優先し、なければ客観的評価に基づいて最大2体を順次選定
    let targetLanes = [];
    if (tokenLanes && tokenLanes.length > 0) {
      targetLanes = tokenLanes.slice(0, 2);
    } else {
      // 盤面シミュレーション評価に基づき各騎士の客観的最適レーンを決定
      const candidateLanes = [...availableLanes];
      for (let k = 0; k < 2; k++) {
        if (candidateLanes.length === 0) break;
        const bestL = getBestSimulatedPlacementLane(
          state,
          owner,
          tM,
          candidateLanes,
          false
        );
        if (bestL !== -1) {
          targetLanes.push(bestL);
          // 同一レーンに2体重ねるのを避けるため選出済みレーンを除外
          const remIdx = candidateLanes.indexOf(bestL);
          if (remIdx !== -1) candidateLanes.splice(remIdx, 1);
        }
      }
    }

    for (let idx = 0; idx < targetLanes.length; idx++) {
      const lane = targetLanes[idx];
      const newToken = {
        id: `tk_km_${Math.floor(getSeededRandom() * 1000000000)}_${idx}`,
        uid: `${owner}_tk_km_${Math.floor(getSeededRandom() * 1000000000)}_${idx}`, // for resolution logic
        owner,
        baseId: 'token_knight',
        name: tM.name,
        isToken: true,
        rarity: tM.rarity || 1,
        power: 2,
        basePower: 2,
        currentPower: 2,
        skills: [{ id: 'deadly' }, { id: 'guardian' }],
      };

      if (!tryEquipToken(state, board, lane, newToken, owner, events)) {
        if (board[lane] !== null) {
          quietDiscardFromBoard(state, owner, lane);
        }

        // バフ適用前の状態で召喚イベントを発行
        events.push({
          type: 'summon_token',
          side: owner,
          lane: lane,
          card: JSON.parse(JSON.stringify(newToken)),
          source: 'evil_march',
        });

        board[lane] = newToken;
      }
    }

    // 2. 自分の場のすべてのカードのパワーを+2する
    const isReversedMarch = isReverseActive(state);
    const marchBuff = isReversedMarch ? -2 : 2;
    for (let i = 0; i < 3; i++) {
      if (board[i] !== null) {
        // パワーアップ（反転時はパワーダウン）
        board[i].currentPower += marchBuff;
        events.push({
          type: 'power_change',
          side: owner,
          lane: i,
          amount: marchBuff,
          source: 'evil_march',
          isReversed: isReversedMarch,
        });
      }
    }
  } else if (action === 'otherworld_gate') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const h = isBlue ? state.playerHand : state.enemyHand;
    const opH = isBlue ? state.enemyHand : state.playerHand;

    // 1. 最大2枚捨てる（共通のAI手札選択ロジックを使用、最大2枚まで任意のため isExact=false）
    let dc = 0;
    if (h.length > 0) {
      const dropIndices = getAIDiscardIndices(h, 2, false);
      // Splice from the end to avoid index shifting
      const sortedDropIndices = [...dropIndices].sort((a, b) => b - a);
      for (let i of sortedDropIndices) {
        h.splice(i, 1);
        dc++;
      }
    }

    // 2枚引く（シミュレーションでは仮のカードを引いた体にするか、評価値には直接影響させずとも手札数は補充）
    // ただし引いたカードはシミュレータからは予測不能なため仮カードを入れるか省略する。とりあえず手札数は維持する
    const dummyDraw = { name: 'Unknown', power: 3, currentPower: 3 }; // AIの平均的なパワー期待値
    for (let i = 0; i < dc; i++) {
      h.push(JSON.parse(JSON.stringify(dummyDraw)));
    }

    // 2. 自陣の手札バフ
    h.forEach((c) => {
      if (c.currentPower !== undefined) c.currentPower += 2;
      else c.power += 2;
    });

    // 3. 相手の手札破壊＆虚空（AIからはランダムドロップするだけ）
    let opDc = 0;
    for (let i = 0; i < 2; i++) {
      if (opH.length > 0) {
        const randIdx = Math.floor(getSeededRandom() * opH.length);
        opH.splice(randIdx, 1);
        opDc++;
      }
    }

    if (opDc > 0) {
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        id: 'token_void',
        name: '虚空',
        power: 0,
      };
      for (let i = 0; i < opDc; i++) {
        opH.push({
          ...voidTpl,
          id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_owg${i}`,
          uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidowg${i}`,
          owner: oppOwner,
          baseId: 'token_void',
          isToken: true,
          power: voidTpl.power ?? 0,
          basePower: voidTpl.power ?? 0,
          currentPower: voidTpl.power ?? 0,
        });
      }
    }
  } else if (action === 'targeted_destruction') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    let targetLane = -1;
    if (tokenLanes && tokenLanes.length > 0) {
      targetLane = tokenLanes[0];
    } else {
      let maxP = -1;
      for (let i = 0; i < 3; i++) {
        if (eBoard[i] && eBoard[i].currentPower > maxP) {
          maxP = eBoard[i].currentPower;
          targetLane = i;
        }
      }
    }

    if (targetLane !== -1 && eBoard[targetLane] !== null) {
      const decision = { type: 'targeted_destruction', laneIdx: targetLane };
      if (!state._actionQueue) state._actionQueue = [];
      state._actionQueue.push(decision);

      const targetCard = eBoard[targetLane];

      // 【能力をなくす処理（沈黙化）】
      // 破壊前に対象カードのすべてのスキル・一時効果を消去する
      clearCardAbilities(targetCard);

      events.push({
        type: 'oblivion_clear',
        side: oppOwner,
        lane: targetLane,
        source: 'targeted_destruction',
        silent: true,
        card: JSON.parse(JSON.stringify(targetCard)),
      });

      if (canCardBeDestroyed(state, targetCard, oppOwner)) {
        targetCard.currentPower = 0;
        events.push({
          type: 'deadly',
          side: oppOwner,
          lane: targetLane,
          source: 'targeted_destruction',
        });
      } else {
        events.push({
          type: isValkyriaGuardActive(state, oppOwner)
            ? 'valkyria_guard_block'
            : 'immune_block',
          side: oppOwner,
          lane: targetLane,
          source: 'targeted_destruction',
        });
      }
    }
  } else if (action === 'elf_polarbear_combo') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    let targetLane = -1;
    let myLane = -1;
    if (tokenLanes && tokenLanes.length === 2) {
      targetLane = tokenLanes[0];
      myLane = tokenLanes[1];
    } else if (tokenLanes && tokenLanes.length > 0) {
      // （フォールバックなどのため）
      targetLane = tokenLanes[0];
      myLane = tokenLanes.length > 1 ? tokenLanes[1] : 0; // fallback
    } else {
      // AI用決定ロジック
      let maxP = -1;
      for (let i = 0; i < 3; i++) {
        if (eBoard[i] && eBoard[i].currentPower > maxP) {
          maxP = eBoard[i].currentPower;
          targetLane = i;
        }
      }
      // 盤面シミュレーション評価に基づきヴォイテク配置の客観的最適レーンを決定
      const tBear = CARD_MASTER.find((m) => m.id === 'token_polarbear') || {
        name: 'ヴォイテク',
        power: 4,
      };
      myLane = getBestSimulatedPlacementLane(
        state,
        owner,
        tBear,
        [0, 1, 2],
        false
      );
    }

    if (targetLane !== -1 || myLane !== -1) {
      const decision = { type: 'elf_polarbear_combo', targetLane, myLane };
      if (!state._actionQueue) state._actionQueue = [];
      state._actionQueue.push(decision);
    }

    // パート1: 相手のカードの能力消去および破壊（選ばれた場合のみ）
    if (targetLane !== -1 && eBoard[targetLane] !== null) {
      const targetCard = eBoard[targetLane];

      // 【能力をなくす処理（沈黙化）】
      // 破壊前に対象カードのすべてのスキル・一時効果を消去する
      clearCardAbilities(targetCard);

      events.push({
        type: 'oblivion_clear',
        side: oppOwner,
        lane: targetLane,
        source: 'elf_polarbear_combo',
        silent: true,
        card: JSON.parse(JSON.stringify(targetCard)),
      });

      if (canCardBeDestroyed(state, targetCard, oppOwner)) {
        targetCard.currentPower = 0;
        events.push({
          type: 'deadly',
          side: oppOwner,
          lane: targetLane,
          source: 'elf_polarbear_combo',
        });
      } else {
        events.push({
          type: isValkyriaGuardActive(state, oppOwner)
            ? 'valkyria_guard_block'
            : 'immune_block',
          side: oppOwner,
          lane: targetLane,
          source: 'elf_polarbear_combo',
        });
      }
    }

    // パート2: ヴォイテクの配置
    const mySealedLanesFinal = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;
    if (
      myLane !== -1 &&
      (!mySealedLanesFinal || mySealedLanesFinal[myLane] === 0)
    ) {
      // 既存のカードがあれば墓地へ送る（上書き許可）or 起動
      const tokenMaster = {
        id: 'token_polarbear',
        name: 'ヴォイテク',
        rarity: 1,
        power: 4,
        isToken: true,
        skills: [{ id: 'legendary' }, { id: 'pierce' }],
        voiceCategory: 'beast',
        flavor: 'リナと共に戦う白熊',
      };
      const bearCard = {
        ...tokenMaster,
        uid: 'dng_tk_' + Math.floor(getSeededRandom() * 1000000000),
        owner: owner,
        currentPower: tokenMaster.power,
        skillTriggered: true, // 配置のため召喚時効果（もしあれば）は発動しない
        stunTurns: 0,
        stunAppliedThisTurn: false,
      };

      if (board[myLane] !== null && hasSkill(board[myLane], 'startup')) {
        const discardPile =
          owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
        if (!bearCard.isToken) {
          discardPile.push(bearCard);
        }
        resolveStartupFade(owner, board[myLane], myLane, bearCard, events);
      } else {
        if (board[myLane] !== null) {
          quietDiscardFromBoard(state, owner, myLane);
        }
        board[myLane] = bearCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: myLane,
          card: bearCard,
          source: 'elf_polarbear_combo',
        });
      }
    }
  } else if (action === 'tomb_guard') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const oppDeck = isBlue ? state.enemyDeck : state.playerDeck;
    const oppDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    // 相手のデッキの上から最大4枚を墓地へ送る
    const millCount = Math.min(4, oppDeck.length);
    if (millCount > 0) {
      const milledCards = oppDeck.splice(0, millCount);
      oppDiscard.push(...milledCards);
      events.push({
        type: 'deck_mill',
        side: oppOwner,
        count: millCount,
        source: 'tomb_guard',
      });
    }

    // 相手の場のカード1枚に4ダメージ
    if (tokenLanes && tokenLanes.length > 0) {
      const targetLane = tokenLanes[0];
      const targetCard = eBoard[targetLane];
      if (targetCard) {
        damageCard(state, oppOwner, targetLane, 4, 'tomb_guard', events, true);
      }
    }
  } else if (action === 'death_judgment') {
    // 【死者の審判】相手のデッキを残り1枚になるように墓地に送る + 相手の場のカード1枚に8ダメージ
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const oppDeck = isBlue ? state.enemyDeck : state.playerDeck;
    const oppDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    // 相手のデッキを残り1枚になるまで墓地へ送る
    const REMAINING_DECK_COUNT = 1;
    const DEATH_JUDGMENT_DAMAGE = 4;
    const millCount = Math.max(0, oppDeck.length - REMAINING_DECK_COUNT);
    if (millCount > 0) {
      const milledCards = oppDeck.splice(0, millCount);
      oppDiscard.push(...milledCards);
      events.push({
        type: 'deck_mill',
        side: oppOwner,
        count: millCount,
        source: 'death_judgment',
      });
    }

    // 相手の場のカード1枚に8ダメージ
    if (tokenLanes && tokenLanes.length > 0) {
      const targetLane = tokenLanes[0];
      const targetCard = eBoard[targetLane];
      if (targetCard) {
        damageCard(
          state,
          oppOwner,
          targetLane,
          DEATH_JUDGMENT_DAMAGE,
          'death_judgment',
          events,
          true
        );
      }
    }
  } else if (action === 'devilhunter_resurrect') {
    if (isGraveKeeperActive(state)) return events;
    const discard = isBlue ? state.playerDiscard : state.enemyDiscard;
    const validCards = discard.filter((card) => card && !card.isToken);
    if (validCards.length > 0) {
      let selectedCard = null;
      if (
        forcedTargetIdx !== null &&
        discard[forcedTargetIdx] &&
        !discard[forcedTargetIdx].isToken
      ) {
        selectedCard = discard[forcedTargetIdx];
      } else {
        const sorted = [...validCards].sort((a, b) => b.power - a.power);
        selectedCard = sorted[0];
      }
      let l = -1;
      if (tokenLanes && tokenLanes.length > 0) {
        l = tokenLanes[0];
      } else if (selectedCard) {
        // 盤面シミュレーション評価に基づき客観的最適レーンを決定（配置スキルのため制約チェックなし）
        l = getBestSimulatedPlacementLane(
          state,
          owner,
          selectedCard,
          [0, 1, 2],
          false
        );
      }
      if (l !== -1) {
        const decision = {
          type: 'devilhunter_resurrect',
          targetIdx: discard.indexOf(selectedCard),
          laneIdx: l,
        };
        if (!state._actionQueue) state._actionQueue = [];
        state._actionQueue.push(decision);

        events.push({ type: 'leader_skill', skill: action, side: owner });
        const existingCard = board[l];
        const unionSkill =
          selectedCard.skills &&
          selectedCard.skills.find((s) => s.id === 'union');
        const isUnion =
          unionSkill &&
          existingCard &&
          matchesUnionMaterial(existingCard, unionSkill);
        const isEquip =
          hasSkill(selectedCard, 'equip') ||
          (existingCard && hasSkill(existingCard, 'arm_self'));
        if (isUnion) {
          const masterData =
            CARD_MASTER.find((c) => c.id === unionSkill.summonId) ||
            CARD_MASTER.find((c) => c.id === 'android');
          let unionCard = JSON.parse(JSON.stringify(masterData));
          unionCard.uid = `ls_un_sim_${Math.floor(getSeededRandom() * 1000000000)}`;
          unionCard.owner = owner;
          unionCard.baseId = unionCard.id;
          unionCard.basePower = unionCard.power;
          unionCard.currentPower = unionCard.power;
          unionCard.skillTriggered = true; // 配置からの合体のため召喚時効果は不発
          unionCard.stunTurns = 0;
          board[l] = unionCard;
          events.push({
            type: 'summon_card',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(unionCard)),
            source: 'union',
          });
        } else if (
          isEquip &&
          existingCard &&
          !hasSkill(existingCard, 'possession') &&
          !hasSkill(selectedCard, 'possession') &&
          !hasSkill(existingCard, 'reflect') &&
          !hasSkill(selectedCard, 'reflect')
        ) {
          // 装備（既存カードの上へ）: applyEquipment に処理を集約
          applyEquipment(existingCard, selectedCard);

          events.push({
            type: 'power_change',
            side: owner,
            lane: l,
            amount: selectedCard.appliedEquipPower ?? selectedCard.power,
            source: 'equip',
            card: selectedCard,
          });
        } else if (existingCard && hasSkill(existingCard, 'startup')) {
          if (!selectedCard.isToken) {
            discard.push(selectedCard);
          }
          resolveStartupFade(
            owner,
            existingCard,
            l,
            JSON.parse(JSON.stringify(selectedCard)),
            events
          );
        } else {
          if (existingCard) {
            const simDiscard =
              owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
            simDiscard.push(existingCard);
          }
          const resurrectedCard = {
            ...selectedCard,
            id: `res_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
            baseId: selectedCard.baseId || selectedCard.id,
          };
          resurrectedCard.currentPower = resurrectedCard.power;
          resurrectedCard.skillTriggered = true;
          resurrectedCard.stunTurns = 0;
          board[l] = resurrectedCard;
          events.push({
            type: 'summon_card',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(resurrectedCard)),
            source: 'devilhunter_resurrect',
          });
        }

        if (selectedCard) {
          const removeIdx = discard.findIndex(
            (x) => x && x.id === selectedCard.id
          );
          if (removeIdx !== -1) discard.splice(removeIdx, 1);
        }
      }
    }
  } else if (action === 'overdrive') {
    if (isGraveKeeperActive(state)) return events;
    // 【オーバードライブ】自分の墓地 → tokenLanes[0] に配置、相手の墓地 → tokenLanes[1] に配置
    const myDiscard = isBlue ? state.playerDiscard : state.enemyDiscard;
    const oppDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    let mySelectedCard = null;
    let oppSelectedCard = null;

    const placeFromDiscard = (discard, laneIdx) => {
      const validCards = discard.filter((c) => c && !c.isToken);
      if (validCards.length === 0 || laneIdx === -1) return null;
      const sorted = [...validCards].sort(
        (a, b) => (b.power || 0) - (a.power || 0)
      );
      const selectedCard = sorted[0];
      const existingCard = board[laneIdx];
      if (existingCard) {
        // 上書き: 既存カードを墓地へ
        myDiscard.push(existingCard);
      }
      const resurrectedCard = {
        ...selectedCard,
        id: `od_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
        baseId: selectedCard.baseId || selectedCard.id,
      };
      resurrectedCard.currentPower = resurrectedCard.power;
      resurrectedCard.skillTriggered = true;
      resurrectedCard.stunTurns = 0;
      board[laneIdx] = resurrectedCard;
      events.push({
        type: 'summon_card',
        side: owner,
        lane: laneIdx,
        card: JSON.parse(JSON.stringify(resurrectedCard)),
        source: 'overdrive',
      });
      const removeIdx = discard.findIndex((x) => x && x.id === selectedCard.id);
      if (removeIdx !== -1) discard.splice(removeIdx, 1);
      return selectedCard;
    };

    const mySealed = (isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes) || [0, 0, 0];
    const isLaneAvailable = (l) =>
      typeof l === 'number' && l >= 0 && l < 3 && mySealed[l] === 0;

    // 自分の墓地 → tokenLanes[0] (forcedTargetIdx が指定されている場合はその優先)
    const myCandidates = myDiscard.filter((card) => card && !card.isToken);
    const targetMyCard =
      forcedTargetIdx !== null &&
      myDiscard[forcedTargetIdx] &&
      !myDiscard[forcedTargetIdx].isToken
        ? myDiscard[forcedTargetIdx]
        : [...myCandidates].sort((a, b) => (b.power || 0) - (a.power || 0))[0];

    let lane1 =
      tokenLanes && tokenLanes.length > 0 && isLaneAvailable(tokenLanes[0])
        ? tokenLanes[0]
        : -1;
    if (lane1 === -1 && targetMyCard) {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定（未封印レーンのみ対象）
      lane1 = getBestSimulatedPlacementLane(
        state,
        owner,
        targetMyCard,
        [0, 1, 2],
        false
      );
    }

    // 未封印レーンが存在し、有効なレーンが決定できた場合のみ配置を実行
    if (lane1 !== -1) {
      if (
        forcedTargetIdx !== null &&
        myDiscard[forcedTargetIdx] &&
        !myDiscard[forcedTargetIdx].isToken
      ) {
        const forcedCard = myDiscard[forcedTargetIdx];
        const existingCard = board[lane1];
        if (existingCard) myDiscard.push(existingCard);
        const resurrectedCard = {
          ...forcedCard,
          id: `od_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: forcedCard.baseId || forcedCard.id,
        };
        resurrectedCard.currentPower = resurrectedCard.power;
        resurrectedCard.skillTriggered = true;
        resurrectedCard.stunTurns = 0;
        board[lane1] = resurrectedCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: lane1,
          card: JSON.parse(JSON.stringify(resurrectedCard)),
          source: 'overdrive',
        });
        mySelectedCard = forcedCard;
        myDiscard.splice(forcedTargetIdx, 1);
      } else {
        mySelectedCard = placeFromDiscard(myDiscard, lane1);
      }
    }

    // 相手の墓地 → tokenLanes[1]
    const oppCandidates = oppDiscard.filter((card) => card && !card.isToken);
    const targetOppCard =
      forcedOppTargetIdx !== null &&
      oppDiscard[forcedOppTargetIdx] &&
      !oppDiscard[forcedOppTargetIdx].isToken
        ? oppDiscard[forcedOppTargetIdx]
        : [...oppCandidates].sort((a, b) => (b.power || 0) - (a.power || 0))[0];

    let lane2 =
      tokenLanes &&
      tokenLanes.length > 1 &&
      isLaneAvailable(tokenLanes[1]) &&
      tokenLanes[1] !== lane1
        ? tokenLanes[1]
        : -1;
    if (lane2 === -1 && targetOppCard) {
      const remainingLanes = [0, 1, 2].filter(
        (l) => l !== lane1 && isLaneAvailable(l)
      );
      if (remainingLanes.length > 0) {
        // 盤面シミュレーション評価に基づき客観的最適レーンを決定（未封印の残りレーンのみ対象）
        lane2 = getBestSimulatedPlacementLane(
          state,
          owner,
          targetOppCard,
          remainingLanes,
          false
        );
      }
    }

    // 未封印レーンが存在し、有効なレーンが決定できた場合のみ配置を実行
    if (lane2 !== -1) {
      // 相手墓地のカード選択: forcedOppTargetIdx が指定されている場合はその優先
      if (
        forcedOppTargetIdx !== null &&
        oppDiscard[forcedOppTargetIdx] &&
        !oppDiscard[forcedOppTargetIdx].isToken
      ) {
        const forcedOppCard = oppDiscard[forcedOppTargetIdx];
        const existingCard2 = board[lane2];
        if (existingCard2) {
          myDiscard.push(existingCard2);
        }
        const resurrectedOppCard = {
          ...forcedOppCard,
          id: `od_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: forcedOppCard.baseId || forcedOppCard.id,
        };
        resurrectedOppCard.currentPower = resurrectedOppCard.power;
        resurrectedOppCard.skillTriggered = true;
        resurrectedOppCard.stunTurns = 0;
        board[lane2] = resurrectedOppCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: lane2,
          card: JSON.parse(JSON.stringify(resurrectedOppCard)),
          source: 'overdrive',
        });
        oppSelectedCard = forcedOppCard;
        oppDiscard.splice(forcedOppTargetIdx, 1);
      } else {
        oppSelectedCard = placeFromDiscard(oppDiscard, lane2);
      }
    }

    // AIのアクションキューに決定した復活カード情報を登録（実際のゲームで正しく選択されるようにする）
    if (!state._actionQueue) state._actionQueue = [];
    if (mySelectedCard && lane1 !== -1) {
      state._actionQueue.push({
        type: 'overdrive',
        targetIdx: myDiscard.indexOf(mySelectedCard), // すでに splice されている可能性を考慮するが、基本的には UID 照合を優先するため UID を渡す
        targetUid: mySelectedCard.uid,
        laneIdx: lane1,
      });
    }
    if (oppSelectedCard && lane2 !== -1) {
      state._actionQueue.push({
        type: 'overdrive',
        targetIdx: oppDiscard.indexOf(oppSelectedCard),
        targetUid: oppSelectedCard.uid,
        laneIdx: lane2,
      });
    }
  } else if (action === 'warlock_place_demons') {
    events.push({ type: 'leader_skill', skill: action, side: owner });

    const sealedLanes = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;
    const skeletonTpl = CARD_MASTER.find((m) => m.id === 'token_skeleton');
    const daemonTpl = CARD_MASTER.find((m) => m.id === 'token_daemon');

    // 1. スケルトン1体を配置するレーンの決定
    let targetLane = -1;
    if (tokenLanes && tokenLanes.length > 0) {
      const requestedLane = tokenLanes[0];
      if (
        requestedLane >= 0 &&
        requestedLane < 3 &&
        (!sealedLanes || sealedLanes[requestedLane] === 0)
      ) {
        targetLane = requestedLane;
      }
    } else if (skeletonTpl) {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定
      targetLane = getBestSimulatedPlacementLane(
        state,
        owner,
        skeletonTpl,
        [0, 1, 2],
        false
      );
    }

    // 2. スケルトンを配置 or 起動
    if (targetLane !== -1) {
      if (
        board[targetLane] !== null &&
        hasSkill(board[targetLane], 'startup')
      ) {
        const newSkeleton = {
          ...JSON.parse(JSON.stringify(skeletonTpl)),
          id: `tk_sk_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
          uid: `${owner}_tk_sk_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
          baseId: skeletonTpl.id,
          owner,
          currentPower: skeletonTpl.power,
          rarity: skeletonTpl.rarity || 1,
          imgUrl: 'assets/cards/card_token_skeleton.webp',
          isToken: true,
        };
        resolveStartupFade(
          owner,
          board[targetLane],
          targetLane,
          newSkeleton,
          events
        );
      } else {
        if (board[targetLane] !== null) {
          quietDiscardFromBoard(state, owner, targetLane);
        }
        const newSkeleton = {
          ...JSON.parse(JSON.stringify(skeletonTpl)),
          id: `tk_sk_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
          uid: `${owner}_tk_sk_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`,
          baseId: skeletonTpl.id,
          owner,
          currentPower: skeletonTpl.power,
          rarity: skeletonTpl.rarity || 1,
          imgUrl: 'assets/cards/card_token_skeleton.webp',
          isToken: true,
        };
        // 【絶対厳守ルール】「配置」なので、召喚時のアクティブスキルは発動させない
        newSkeleton.skillTriggered = true;

        board[targetLane] = newSkeleton;
        events.push({
          type: 'summon_token',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(newSkeleton)),
          source: 'warlock_place_demons',
        });
      }
    }

    // 3. その後、自分のカードが配置されているすべてのレーンにデーモンを配置 or 起動
    for (let l = 0; l < 3; l++) {
      // 自分のカードが存在し、かつ封印されていないレーン
      if (board[l] !== null && (!sealedLanes || sealedLanes[l] === 0)) {
        if (hasSkill(board[l], 'startup')) {
          const newDaemon = {
            ...JSON.parse(JSON.stringify(daemonTpl)),
            id: `tk_d_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            uid: `${owner}_tk_d_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            baseId: daemonTpl.id,
            owner,
            currentPower: daemonTpl.power,
            rarity: daemonTpl.rarity || 1,
            imgUrl: 'assets/cards/card_token_daemon.webp',
            isToken: true,
          };
          resolveStartupFade(owner, board[l], l, newDaemon, events);
        } else {
          // カードを静かに捨てる
          quietDiscardFromBoard(state, owner, l);

          const newDaemon = {
            ...JSON.parse(JSON.stringify(daemonTpl)),
            id: `tk_d_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            uid: `${owner}_tk_d_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            baseId: daemonTpl.id,
            owner,
            currentPower: daemonTpl.power,
            rarity: daemonTpl.rarity || 1,
            imgUrl: 'assets/cards/card_token_daemon.webp',
            isToken: true,
          };
          // 【絶対厳守ルール】「配置」なので、召喚時のアクティブスキルは発動させない
          newDaemon.skillTriggered = true;

          board[l] = newDaemon;
          events.push({
            type: 'summon_token',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(newDaemon)),
            source: 'warlock_place_demons',
          });
        }
      }
    }
  } else if (
    action === 'satan_avatar' ||
    action === 'dragon_summon' ||
    action === 'dungeon_summon_leader'
  ) {
    let power = 5;
    if (action === 'satan_avatar') power = 10;
    else if (action === 'dragon_summon') power = 7;
    else if (action === 'dungeon_summon_leader') {
      const config = isBlue ? state.playerConfig : state.enemyConfig;
      const lc = config?.leaderCardId
        ? CARD_MASTER.find((m) => m.id === config.leaderCardId)
        : null;
      power = lc ? lc.power || 0 : 6;
    }

    let tM = null;
    if (action === 'satan_avatar') {
      tM = CARD_MASTER.find((m) => m.id === 'token_satan');
    } else if (action === 'dragon_summon') {
      tM = CARD_MASTER.find((m) => m.id === 'token_ignis');
    } else if (action === 'dungeon_summon_leader') {
      const config = isBlue ? state.playerConfig : state.enemyConfig;
      if (config && config.leaderCardId) {
        tM = CARD_MASTER.find((m) => m.id === config.leaderCardId);
      }
    }

    if (!tM) return events;

    let l = -1;
    if (tokenLanes && tokenLanes.length > 0) {
      l = tokenLanes[0];
    } else {
      // 盤面シミュレーション評価に基づき客観的最適レーンを決定
      // 試練の宮殿は「召喚」（制約あり）、サタン・竜王は「配置」（制約無視）
      const checkConstraints = action === 'dungeon_summon_leader';
      l = getBestSimulatedPlacementLane(
        state,
        owner,
        { ...tM, power, currentPower: power },
        [0, 1, 2],
        checkConstraints
      );
    }

    if (l !== -1) {
      events.push({ type: 'leader_skill', skill: action, side: owner });

      const newToken = {
        ...JSON.parse(JSON.stringify(tM)),
        id: `tk_${Math.floor(getSeededRandom() * 1000000000)}`,
        baseId: tM.id,
        owner,
        currentPower: power,
        rarity: tM.rarity || 1,
      };
      // satan_avatarのみimgUrlを固定設定；dragon系はgetCardImgUrlがスキンを参照して解決する
      if (action === 'satan_avatar')
        newToken.imgUrl = 'assets/cards/card_token_satan.webp';

      const isSummonLeaderAction = action === 'dungeon_summon_leader';
      if (
        !tryEquipToken(
          state,
          board,
          l,
          newToken,
          owner,
          events,
          isSummonLeaderAction
        )
      ) {
        if (board[l] !== null && hasSkill(board[l], 'startup')) {
          resolveStartupFade(
            owner,
            board[l],
            l,
            JSON.parse(JSON.stringify(newToken)),
            events
          );
        } else {
          if (board[l] !== null) {
            quietDiscardFromBoard(state, owner, l);
          }

          board[l] = newToken;
          events.push({
            type: 'summon_token',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(newToken)),
            source: action,
          });
        }

        // 【全通りシミュレーション対応】召喚されたリーダーカードの召喚時復活スキルを評価
        if (state._actionQueue && newToken.skills) {
          newToken.skills.forEach((s) => {
            if (s.id === 'resurrect') {
              const simDiscard =
                owner === 'blue' ? state.playerDiscard : state.enemyDiscard;

              // シミュレータから指定されたカードとレーンで復活をシミュレート
              if (
                forcedTargetIdx !== null &&
                forcedTargetIdx !== -1 &&
                simDiscard[forcedTargetIdx] &&
                simulatedResurrectLane !== null &&
                simulatedResurrectLane !== -1
              ) {
                const simResCard = simDiscard[forcedTargetIdx];
                const resLane = simulatedResurrectLane;

                // 封印されているレーンへの復活（配置）をブロック
                const sealedLanes =
                  owner === 'blue'
                    ? state.playerSealedLanes
                    : state.enemySealedLanes;
                if (sealedLanes && sealedLanes[resLane] > 0) {
                  return;
                }

                // 復活対象の上限とトークン除外の検証
                if (
                  simResCard.isToken ||
                  (simResCard.power || 0) > (s.value || 1)
                ) {
                  return;
                }

                // 盤面への配置 (または合体/装備) の処理を適用
                const existingCard = board[resLane];
                const unionSkill =
                  simResCard.skills &&
                  simResCard.skills.find((us) => us.id === 'union');
                const isUnion =
                  unionSkill &&
                  existingCard &&
                  matchesUnionMaterial(existingCard, unionSkill);
                const isEquip =
                  hasSkill(simResCard, 'equip') ||
                  (existingCard && hasSkill(existingCard, 'arm_self'));
                // 【憑依】：憑依・反射を持つカードには装備できない
                const targetBlocksEquip =
                  (existingCard &&
                    (hasSkill(existingCard, 'possession') ||
                      hasSkill(existingCard, 'reflect'))) ||
                  hasSkill(simResCard, 'possession') ||
                  hasSkill(simResCard, 'reflect');

                if (isUnion) {
                  const masterData =
                    CARD_MASTER.find((m) => m.id === unionSkill.summonId) ||
                    CARD_MASTER.find((m) => m.id === 'android');
                  let unionCard = JSON.parse(JSON.stringify(masterData));
                  unionCard.uid = `ls_un_sim_${Math.floor(getSeededRandom() * 1000000000)}`;
                  unionCard.owner = owner;
                  unionCard.baseId = unionCard.id;
                  unionCard.basePower = unionCard.power;
                  unionCard.currentPower = unionCard.power;
                  unionCard.unionMaterials = [existingCard, simResCard];
                  unionCard.skillTriggered = true; // 配置（復活）からの合体のため召喚時効果は不発
                  unionCard.stunTurns = 0;
                  unionCard.stunAppliedThisTurn = false;
                  board[resLane] = unionCard;

                  events.push({
                    type: 'summon_card',
                    side: owner,
                    lane: resLane,
                    card: unionCard,
                    source: 'union',
                  });
                } else if (isEquip && existingCard && !targetBlocksEquip) {
                  const targetCard = board[resLane];
                  // 装備（既存カードの上へ）: applyEquipment に処理を集約
                  applyEquipment(targetCard, simResCard);

                  events.push({
                    type: 'summon_card',
                    side: owner,
                    lane: resLane,
                    card: targetCard,
                    source: 'equip',
                  });
                } else {
                  if (existingCard) {
                    quietDiscardFromBoard(state, owner, resLane);
                  }
                  board[resLane] = {
                    ...JSON.parse(JSON.stringify(simResCard)),
                    id: `res_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
                    uid: `res_uid_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
                    owner: owner,
                    skillTriggered: true,
                    stunTurns: 0,
                    stunAppliedThisTurn: false,
                  };
                  board[resLane].currentPower = board[resLane].power;

                  events.push({
                    type: 'summon_card',
                    side: owner,
                    lane: resLane,
                    card: board[resLane],
                    source: 'resurrect',
                  });
                }

                // 墓地から削除
                simDiscard.splice(forcedTargetIdx, 1);

                // 【重要】実機での解決用に決定データをアクションキューに登録
                state._actionQueue.push({
                  type: 'resurrect',
                  targetIdx: forcedTargetIdx,
                  targetUid:
                    forcedTargetUid || simResCard.baseId || simResCard.id,
                  laneIdx: resLane,
                  simulated: true, // シミュレーション適用済みフラグ
                });
              }
            }
          });
        }
      }
    }
  } else if (action === 'holy_march' || action === 'death_target') {
    // 騎士/アサシン配置（最大2体）
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const config = isBlue ? state.playerConfig : state.enemyConfig;
    const isDeathTarget =
      action === 'death_target' ||
      config?.currentSkin === 'assassin' ||
      config?.leaderSkill?.action === 'death_target' ||
      config?.leaderSkill?.name === '死の標的';
    const tokenCardId = isDeathTarget ? 'token_assassin' : 'token_knight';
    const tokenDefaultImg = isDeathTarget
      ? 'assets/cards/card_token_assassin.webp'
      : 'assets/cards/card_token_knight.webp';

    let count = 0;
    const addToken = (lane) => {
      const tK = CARD_MASTER.find((m) => m.id === tokenCardId) ||
        CARD_MASTER.find((m) => m.id === 'token_knight') || {
          name: isDeathTarget ? 'アサシン' : '騎士',
          power: 2,
        };
      const tk = {
        ...JSON.parse(JSON.stringify(tK)),
        id: `tk_${isDeathTarget ? 'a' : 'k'}_${Math.floor(getSeededRandom() * 1000000000)}_${lane}`,
        owner,
        currentPower: tK.power,
        rarity: tK.rarity || 1,
        imgUrl: tokenDefaultImg,
        isToken: true,
      };

      // 「配置」：装備可能なら装備、それ以外は既存カードを墓地へ送ってから配置（オンプレイ能力は発動しない）
      if (!tryEquipToken(state, board, lane, tk, owner, events)) {
        if (board[lane] !== null) {
          quietDiscardFromBoard(state, owner, lane);
        }
        board[lane] = tk;
        // 後続のループで tk自身が +2 されるため、イベントに積むcardは追加時点のものをディープコピーしておく
        events.push({
          type: 'summon_token',
          side: owner,
          lane,
          card: JSON.parse(JSON.stringify(tk)),
          source: action,
        });
      }
      count++;
    };

    if (tokenLanes !== null) {
      // 多重防御: UI側の連打バグ等で3レーン以上が渡されても最大2体に制限
      for (let l of tokenLanes) {
        if (count >= 2) break;
        addToken(l);
      }
    } else {
      const tK = CARD_MASTER.find((m) => m.id === tokenCardId) ||
        CARD_MASTER.find((m) => m.id === 'token_knight') || {
          name: isDeathTarget ? 'アサシン' : '騎士',
          power: 2,
        };
      const candidateLanes = [0, 1, 2];
      while (count < 2 && candidateLanes.length > 0) {
        // 盤面シミュレーション評価に基づき客観的最適レーンを順次決定
        const bestL = getBestSimulatedPlacementLane(
          state,
          owner,
          tK,
          candidateLanes,
          false
        );
        if (bestL !== -1) {
          addToken(bestL);
          const remIdx = candidateLanes.indexOf(bestL);
          if (remIdx !== -1) candidateLanes.splice(remIdx, 1);
        } else {
          break;
        }
      }
    }
    // 全体バフ+2
    const isReversedMarch = isReverseActive(state);
    const marchBuff = isReversedMarch ? -2 : 2;
    for (let i = 0; i < 3; i++) {
      if (board[i]) {
        board[i].currentPower += marchBuff;
        board[i].power += marchBuff;
        events.push({
          type: 'power_change',
          side: owner,
          lane: i,
          amount: marchBuff,
          source: action,
          isReversed: isReversedMarch,
        });
      }
    }
  } else if (action === 'god_flame') {
    executeFlameHealLeaderSkill(state, action, owner, GOD_FLAME_AMOUNT, events);
  } else if (action === 'condemnation') {
    executeFlameHealLeaderSkill(
      state,
      action,
      owner,
      CONDEMNATION_AMOUNT,
      events
    );
  } else if (action === 'time_stop') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    state.extraTurnCount = (state.extraTurnCount || 0) + 2;
    state.attackSkipCount = (state.attackSkipCount || 0) + 2;
  } else if (action === 'world_reconstruct') {
    // 【世界の再構築】お互いの手札を全て捨て、墓地をリセットし、自分4枚/相手3枚引く＋追加1ターン
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const MY_DRAW_COUNT = 4;
    const OP_DRAW_COUNT = 3;

    const myHand = isBlue ? state.playerHand : state.enemyHand;
    const opHand = isBlue ? state.enemyHand : state.playerHand;
    const myDeck = isBlue ? state.playerDeck : state.enemyDeck;
    const opDeck = isBlue ? state.enemyDeck : state.playerDeck;
    // 墓地配列が存在しない場合（AIシミュレーション等）は初期化する
    if (!state.playerDiscard) state.playerDiscard = [];
    if (!state.enemyDiscard) state.enemyDiscard = [];
    const myDiscard = isBlue ? state.playerDiscard : state.enemyDiscard;
    const opDiscard = isBlue ? state.enemyDiscard : state.playerDiscard;

    // 1. 互いの手札を全て墓地に送る（トークンは墓地に入れず除外する）
    while (myHand.length > 0) {
      const card = myHand.pop();
      if (!card.isToken) myDiscard.push(card);
    }
    while (opHand.length > 0) {
      const card = opHand.pop();
      if (!card.isToken) opDiscard.push(card);
    }

    // 2. 墓地をリセット（墓地のカードをデッキに戻してシャッフル、トークンは除外）
    while (myDiscard.length > 0) {
      const card = myDiscard.pop();
      if (!card.isToken) myDeck.push(card);
    }
    while (opDiscard.length > 0) {
      const card = opDiscard.pop();
      if (!card.isToken) opDeck.push(card);
    }
    // シャッフル（シード付き乱数でデッキをシャッフル）
    for (let i = myDeck.length - 1; i > 0; i--) {
      const j = Math.floor(getSeededRandom() * (i + 1));
      [myDeck[i], myDeck[j]] = [myDeck[j], myDeck[i]];
    }
    for (let i = opDeck.length - 1; i > 0; i--) {
      const j = Math.floor(getSeededRandom() * (i + 1));
      [opDeck[i], opDeck[j]] = [opDeck[j], opDeck[i]];
    }

    // 3. 自分4枚ドロー
    for (let i = 0; i < MY_DRAW_COUNT && myDeck.length > 0; i++) {
      myHand.push(myDeck.pop());
    }
    // 相手3枚ドロー
    for (let i = 0; i < OP_DRAW_COUNT && opDeck.length > 0; i++) {
      opHand.push(opDeck.pop());
    }

    // 4. 追加ターン1回（SP増加なし・攻撃なし）
    state.extraTurnCount = (state.extraTurnCount || 0) + 1;
    state.attackSkipCount = (state.attackSkipCount || 0) + 1;
  } else if (action === 'valkyria_guard') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    // 戦乙女の加護: 次の自分のターン開始時まで、自分のカードは破壊されず、リーダーとカードが受ける全てのダメージを0にする（加護付与）
    grantValkyriaGuard(state, owner, events);
  } else if (action === 'ragnarok') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    // 敵の場のすべてのカードに2ダメージを与える
    for (let i = 0; i < 3; i++) {
      if (eBoard[i]) {
        damageCard(
          state,
          oppOwner,
          i,
          RAGNAROK_CARD_DAMAGE_AMOUNT,
          'ragnarok',
          events,
          true
        );
      }
    }
    // 戦乙女の加護を自分に付与
    grantValkyriaGuard(state, owner, events);
  }

  processDestructionTriggers(state, events);
  return events;
}

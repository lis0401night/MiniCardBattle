/**
 * src/game/engine/activeSkills.js
 * Mini Card Battle - アクティブスキル純粋計算モジュール
 *
 * 召喚時（オンプレイ）やアクティブスキル発動に伴う効果（ダメージ、バフ、召喚、ドロー等）
 * のシミュレーション用データ更新ロジックを管理します。
 */

import { getAIDiscardIndices } from '../../utils/aiDiscardLogic.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import {
  FATE_ESTIMATED_DAMAGE,
  METAMORPH_ESTIMATED_POWER,
} from '../../utils/constants/skills.js';
import {
  applyEquipment,
  applyUnleashSkill,
  clearCardAbilities,
  collectPresentBoardTargets,
  getSeededRandom,
  getSkillValue,
  grantCardStatus,
  hasSkill,
  matchesAssembleTarget,
  matchesCardId,
  matchesCardIds,
  matchesCardKeyword,
  matchesUnionMaterial,
  resolveCardSupremacySkills,
  resolveStartupFade,
  unmergeCardSkills,
} from '../../utils/gameUtils.js';
import {
  canTakeDamage,
  damageCard,
  damageLeader,
  getBestSimulatedPlacementLane,
  healLeader,
  PORTENT_THRESHOLD_HP,
  processPlacementOrEquip,
  quietDiscardCard,
  quietDiscardFromBoard,
  SUPREMACY_REQUIRED_BASE_POWER,
} from './core.js';
import {
  canCardBeDestroyed,
  isGraveKeeperActive,
  isLaneSealed,
  isReverseActive,
  isValkyriaGuardActive,
  processDestructionTriggers,
  VALKYRIA_GUARD_TURNS,
} from './passiveSkills.js';
import { applySingleCombat } from './combat.js';

/**
 * 指定したアクティブスキルをゲーム状態またはシミュレーション状態へ適用する。
 * ダメージ、バフ、デバフ、召喚、ドロー、手札破壊等の個別スキル効果を純粋なデータ更新として処理する。
 *
 * =========================================================================
 * 【開発ガイドライン：エンジン側でのアクティブスキル実装統一ルール】
 *
 * AIの思考シミュレーション等で使用されるこの関数内では、描画・VFX演出に関連する処理を
 * 一切記述しないでください。
 * - 「events.push({ type: 'vfx_trigger', ... })」などは絶対に積まないでください。
 * - 純粋に盤面データの更新やリーダーHP、SPの計算のみを処理してください。
 * - 実画面での演出と適用処理は「src/game/skillLogic.js」内の個別ロジックで担当します。
 * =========================================================================
 *
 * @param {object} state - ゲーム状態またはシミュレーション状態オブジェクト
 * @param {'blue'|'red'} owner - スキルの所有者陣営
 * @param {number} l - スキル発動カードのレーン番号（0〜2）
 * @param {string} sid - スキルID（例: 'strike', 'draw', 'assemble' 等）
 * @param {number} val - スキル効果値
 * @param {Array<object>} [events=[]] - 発生したイベントを記録する配列
 * @param {Array<number>|null} [simulatedTokenLanes=null] - シミュレーション用トークン配置対象レーン配列
 * @param {number|undefined} [simulatedLane=undefined] - 移動・配置先のシミュレーション用レーン番号
 * @returns {Array<object>} 解決後に発生したイベントログ配列
 */
export function applyActiveSkillLogic(
  state,
  owner,
  l,
  sid,
  val,
  events = [],
  simulatedTokenLanes = null,
  simulatedLane = undefined
) {
  const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
  const eB = owner === 'blue' ? state.enemyBoard : state.playerBoard;
  const oppOwner = owner === 'blue' ? 'red' : 'blue';
  const c = b[l];
  // 自身（カードオブジェクト）が盤面に存在しないと解決できない（自己バフや自己付与、速攻、覚醒などの）スキル一覧
  const requiresCard = [
    'quick',
    'double_power',
    'decay',
    'hero',
    'adversity',
    'lone_wolf',
    'portent',
    'invade',
    'replicate',
    'standby',
    // 'deteriorate', // 【未実装】劣化能力は現時点では実装を見送り
    'stealth',
    'invincible',
    'buff_void',
    'buff',
    'inspire',
    'supremacy',
    'unleash',
    'awake',
    'awake_legendary',
    'metamorph',
    'assemble',
    'summon',
    'forge',
  ];
  if (!c && requiresCard.includes(sid)) return events;

  switch (sid) {
    case 'choice':
    case 'force':
      // 選択・命令スキル自体は純粋ロジックでは解決できない（上位のシミュレーション層で展開済みのため）
      break;
    case 'oblivion': {
      const myBoard = state.playerBoard;
      const oppBoard = state.enemyBoard;

      [myBoard, oppBoard].forEach((board, bIdx) => {
        const side = bIdx === 0 ? 'blue' : 'red';
        for (let i = 0; i < 3; i++) {
          const card = board[i];
          if (card) {
            clearCardAbilities(card);

            events.push({
              type: 'oblivion_clear',
              side,
              lane: i,
              card: JSON.parse(JSON.stringify(card)),
            });
          }
        }
      });
      break;
    }
    case 'silence': {
      const oppBoard = owner === 'blue' ? state.enemyBoard : state.playerBoard;
      const targetCard = oppBoard[l];
      if (targetCard) {
        clearCardAbilities(targetCard);

        events.push({
          type: 'silence_clear',
          side: owner === 'blue' ? 'red' : 'blue',
          lane: l,
          card: JSON.parse(JSON.stringify(targetCard)),
        });
      }
      break;
    }
    case 'hack': {
      const myOldSP = owner === 'blue' ? state.playerSP : state.enemySP;
      const oppOldSP = owner === 'blue' ? state.enemySP : state.playerSP;
      const totalSP = (myOldSP || 0) + (oppOldSP || 0);

      // 端数切り捨て（両者ともfloor）
      const myNewSP = Math.floor(totalSP / 2);
      const oppNewSP = Math.floor(totalSP / 2);

      if (owner === 'blue') {
        state.playerSP = myNewSP;
        state.enemySP = oppNewSP;
      } else {
        state.enemySP = myNewSP;
        state.playerSP = oppNewSP;
      }

      if (myNewSP !== myOldSP)
        events.push({
          type: 'charge_sp',
          side: owner,
          amount: myNewSP - myOldSP,
          lane: l,
          source: 'hack',
        });
      if (oppNewSP !== oppOldSP)
        events.push({
          type: 'charge_sp',
          side: oppOwner,
          amount: oppNewSP - oppOldSP,
          lane: l,
          source: 'hack',
        });
      break;
    }
    case 'seal': {
      // 召喚時、正面のレーンをvalターン封印する
      // 既存の封印ターン数と比較し、大きい方の値を維持・適用する
      const sealTurns = val || 1;
      if (owner === 'blue') {
        if (state.enemySealedLanes)
          state.enemySealedLanes[l] = Math.max(
            state.enemySealedLanes[l] || 0,
            sealTurns
          );
      } else {
        if (state.playerSealedLanes)
          state.playerSealedLanes[l] = Math.max(
            state.playerSealedLanes[l] || 0,
            sealTurns
          );
      }
      events.push({
        type: 'leader_skill',
        skill: 'seal',
        side: owner,
        targetLane: l,
        amount: sealTurns,
      }); // Use generic event or leader_skill format
      break;
    }
    case 'dominate': {
      const maxPower = val || 0;
      let bestOppLane = -1;
      let maxOppPower = -1;
      for (let j = 0; j < 3; j++) {
        if (eB[j]) {
          const p = eB[j].currentPower ?? eB[j].power ?? 0;
          if (p <= maxPower && p > maxOppPower) {
            maxOppPower = p;
            bestOppLane = j;
          }
        }
      }

      if (bestOppLane !== -1) {
        const stolenCard = eB[bestOppLane];
        const targetLane = bestOppLane; // 奪うカードの正面（対面する同じレーン番号）！

        eB[bestOppLane] = null;

        stolenCard.puppetOriginalOwner =
          stolenCard.puppetOriginalOwner || stolenCard.owner || oppOwner;
        if (stolenCard.equippedCards && stolenCard.equippedCards.length > 0) {
          stolenCard.equippedCards.forEach((eqCard) => {
            eqCard.puppetOriginalOwner =
              eqCard.puppetOriginalOwner || eqCard.owner || oppOwner;
          });
        }

        const existingCard = b[targetLane];
        // 合体（union）スキルは一度だけ解決して再利用する
        const unionSkill = Array.isArray(stolenCard.skills)
          ? stolenCard.skills.find((s) => s.id === 'union')
          : null;

        // 1. 起動（startup）判定
        if (existingCard && hasSkill(existingCard, 'startup')) {
          // 支配で奪ったカード（および装備品・合体素材など）は初期化して元の持ち主の墓地へ返す
          const stolenOwner = stolenCard.puppetOriginalOwner || oppOwner;
          quietDiscardCard(state, stolenCard, stolenOwner);
          resolveStartupFade(
            owner,
            existingCard,
            targetLane,
            stolenCard,
            events
          );
        } else if (
          existingCard &&
          unionSkill &&
          matchesUnionMaterial(existingCard, unionSkill)
        ) {
          // 2. 合体（union）判定
          const mergedCard = CARD_MASTER.find(
            (mc) => mc.id === unionSkill.summonId
          );
          if (mergedCard) {
            const newInstance = JSON.parse(JSON.stringify(mergedCard));
            newInstance.uid = `${owner}_union_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}`;
            newInstance.baseId = mergedCard.id;
            newInstance.owner = owner;
            newInstance.basePower = mergedCard.power;
            newInstance.currentPower = mergedCard.power;
            newInstance.skillTriggered = true; // 支配による配置のため召喚時スキルは不発
            newInstance.stunTurns = 0;
            newInstance.stunAppliedThisTurn = false;
            newInstance.unionMaterials = [
              JSON.parse(JSON.stringify(existingCard)),
              JSON.parse(JSON.stringify(stolenCard)),
            ];
            b[targetLane] = newInstance;
            events.push({
              type: 'summon_card',
              side: owner,
              lane: targetLane,
              card: newInstance,
              source: 'union',
            });
          }
        } else if (
          existingCard &&
          (hasSkill(stolenCard, 'equip') ||
            hasSkill(existingCard, 'arm_self')) &&
          !hasSkill(existingCard, 'possession') &&
          !hasSkill(stolenCard, 'possession') &&
          !hasSkill(existingCard, 'reflect') &&
          !hasSkill(stolenCard, 'reflect')
        ) {
          // 3. 装備判定
          const targetCard = existingCard;
          applyEquipment(targetCard, stolenCard);

          events.push({
            type: 'summon_card',
            side: owner,
            lane: targetLane,
            card: targetCard,
            source: 'equip',
          });
        } else {
          // 4. 通常破棄配置
          if (existingCard) {
            events.push({
              type: 'deadly',
              side: owner,
              lane: targetLane,
              source: 'overwrite',
            });
            // 上書きされる既存カードを墓地へ送る（装備・合体素材・傀儡の帰属も処理される）
            quietDiscardFromBoard(state, owner, targetLane);
          }

          b[targetLane] = {
            ...stolenCard,
            owner: owner,
            skillTriggered: true,
            stunTurns: stolenCard.stunTurns || 0,
            stunAppliedThisTurn: stolenCard.stunAppliedThisTurn || false,
          };

          events.push({
            type: 'summon_card',
            side: owner,
            lane: targetLane,
            card: b[targetLane],
            source: 'dominate',
          });
        }
      }
      break;
    }
    case 'buff_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウントするため matchesCardId を使用
      const voidCount = hand
        ? hand.filter((card) => card && matchesCardId(card, 'token_void'))
            .length
        : 0;
      if (voidCount > 0) {
        let bonus = (val || 0) * voidCount;
        const isReversed = isReverseActive(state);
        if (isReversed) bonus = -bonus;
        c.currentPower += bonus;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: bonus,
          source: sid || 'buff_void',
          isReversed,
        });
      }
      break;
    }
    case 'snipe_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウントするため matchesCardId を使用
      const voidCount = hand
        ? hand.filter((card) => card && matchesCardId(card, 'token_void'))
            .length
        : 0;
      if (voidCount > 0) {
        const baseDmg = val || 4;
        const totalDmg = baseDmg * voidCount;
        let maxL = -1,
          maxP = -1;
        for (let j = 0; j < 3; j++) {
          if (eB[j]) {
            const p = eB[j].currentPower;
            // 同値の場合は左（jが小さい方）を優先するため、> を使用
            if (p > maxP) {
              maxP = p;
              maxL = j;
            }
          }
        }
        if (maxL !== -1) {
          damageCard(
            state,
            oppOwner,
            maxL,
            totalDmg,
            'snipe_void',
            events,
            true
          );
        }
      }
      break;
    }
    case 'heal_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウントするため matchesCardId を使用
      const voidCount = hand
        ? hand.filter((card) => card && matchesCardId(card, 'token_void'))
            .length
        : 0;
      if (voidCount > 0) {
        const hAmt = (val || 3) * voidCount;
        healLeader(state, owner, hAmt, 'heal_void', events);
      }
      break;
    }
    case 'support_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      // 万相（all_forms）スキル所持カード（ミミック等）も虚空としてカウントするため matchesCardId を使用
      const voidCount = hand
        ? hand.filter((card) => card && matchesCardId(card, 'token_void'))
            .length
        : 0;
      if (voidCount > 0) {
        let adjVal = (val || 2) * voidCount;
        const isReversed = isReverseActive(state);
        if (isReversed) adjVal = -adjVal;
        const sAdj = l === 1 ? [0, 2] : [1];
        sAdj.forEach((j) => {
          if (b[j]) {
            b[j].currentPower += adjVal;
            events.push({
              type: 'power_change',
              side: owner,
              lane: j,
              amount: adjVal,
              source: 'support_void',
              isReversed,
            });
          }
        });
      }
      break;
    }
    case 'support': {
      const sAdj = l === 1 ? [0, 2] : [1];
      let adjVal = val || 2;
      const isReversed = isReverseActive(state);
      if (isReversed) adjVal = -adjVal;
      sAdj.forEach((j) => {
        if (b[j]) {
          b[j].currentPower += adjVal;
          events.push({
            type: 'power_change',
            side: owner,
            lane: j,
            amount: adjVal,
            source: 'support',
            isReversed,
          });
        }
      });
      break;
    }
    case 'replicate': {
      let maxOtherPower = 0;
      b.forEach((x, idx) => {
        if (idx !== l && x !== null) {
          if (x.currentPower > maxOtherPower) maxOtherPower = x.currentPower;
        }
      });
      if (maxOtherPower > 0) {
        let amt = maxOtherPower;
        const isReversed = isReverseActive(state);
        if (isReversed) amt = -amt;
        c.currentPower += amt;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: amt,
          source: 'replicate',
          isReversed,
        });
      }
      break;
    }
    case 'hero': {
      const occ = b.filter((x, idx) => x !== null && idx !== l).length;
      const hVal = occ * (val || 3);
      if (hVal > 0) {
        let amt = hVal;
        const isReversed = isReverseActive(state);
        if (isReversed) amt = -amt;
        c.currentPower += amt;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: amt,
          source: 'hero',
          isReversed,
        });
      }
      break;
    }
    case 'adversity': {
      const opOcc = eB.filter((x) => x !== null).length;
      const advVal = opOcc * (val || 1);
      if (advVal !== 0) {
        let amt = advVal;
        const isReversed = isReverseActive(state);
        if (isReversed) amt = -amt;
        c.currentPower += amt;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: amt,
          source: 'adversity',
          isReversed,
        });
      }
      break;
    }
    case 'lone_wolf': {
      const empty = b.filter((x) => x === null).length;
      const wVal = empty * (val || 3);
      if (wVal > 0) {
        let amt = wVal;
        const isReversed = isReverseActive(state);
        if (isReversed) amt = -amt;
        c.currentPower += amt;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: amt,
          source: 'lone_wolf',
          isReversed,
        });
      }
      break;
    }
    case 'portent': {
      const currentHp =
        owner === 'blue' ? state?.playerHP || 0 : state?.enemyHP || 0;
      const bonus = Math.max(0, PORTENT_THRESHOLD_HP - currentHp);
      if (bonus > 0) {
        let amt = bonus;
        const isReversed = isReverseActive(state);
        if (isReversed) amt = -amt;
        c.currentPower += amt;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: amt,
          source: 'portent',
          isReversed,
        });
      }
      break;
    }
    case 'invade': {
      const discard =
        owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
      const uniqueTypes = new Set(
        (discard || []).map((card) => card.baseId || card.id)
      ).size;
      const powerDiff = uniqueTypes;
      if (powerDiff !== 0) {
        let amt = powerDiff;
        const isReversed = isReverseActive(state);
        if (isReversed) amt = -amt;
        c.currentPower += amt;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: amt,
          source: 'invade',
          isReversed,
        });
      }
      break;
    }
    case 'buff': {
      // 【「強化」スキル処理】
      // 召喚時、自身のパワーを+valする
      const bVal = val || 1;
      if (bVal !== 0) {
        let amt = bVal;
        const isReversed = isReverseActive(state);
        if (isReversed) amt = -amt;
        c.currentPower += amt;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: amt,
          source: 'buff',
          isReversed,
        });
      }
      break;
    }
    case 'inspire': {
      // 【「鼓舞」スキル処理】
      // 召喚時、自分の場の自身以外のカード1体を選択してパワーを+valする
      const bVal = val || 1;
      if (bVal !== 0) {
        const otherOccupiedLanes = b
          .map((targetCard, laneIdx) =>
            targetCard !== null && laneIdx !== l ? laneIdx : -1
          )
          .filter((idx) => idx !== -1);

        if (otherOccupiedLanes.length > 0) {
          // パワーが最も高いカードを優先（同値なら左レーン優先）
          otherOccupiedLanes.sort((laneA, laneB) => {
            const diff =
              (b[laneB].currentPower || 0) - (b[laneA].currentPower || 0);
            if (diff !== 0) return diff;
            return laneA - laneB;
          });
          const targetLane = otherOccupiedLanes[0];
          let amt = bVal;
          const isReversed = isReverseActive(state);
          if (isReversed) amt = -amt;
          b[targetLane].currentPower += amt;
          events.push({
            type: 'power_change',
            side: owner,
            lane: targetLane,
            amount: amt,
            source: 'inspire',
            isReversed,
          });
        }
      }
      break;
    }
    case 'supremacy': {
      // 召喚時、自分の場に自身以外の元々のパワー（基本パワー）が6以上のカードが存在する場合にサブスキルを発動
      const hasOriginal6Plus = b.some((tc, laneIdx) => {
        if (!tc || laneIdx === l) return false;
        const master = CARD_MASTER.find((m) => m.id === (tc.baseId || tc.id));
        const origPower = master?.power ?? tc.power ?? 0;
        return origPower >= SUPREMACY_REQUIRED_BASE_POWER;
      });

      if (hasOriginal6Plus) {
        const supSkills = resolveCardSupremacySkills(c);
        if (Array.isArray(supSkills) && supSkills.length > 0) {
          for (const subSk of supSkills) {
            applyActiveSkillLogic(
              state,
              owner,
              l,
              subSk.id,
              subSk.value,
              events,
              simulatedTokenLanes,
              simulatedLane
            );
          }
        }
      }
      break;
    }
    case 'unleash': {
      // 召喚時、自身の防御能力を除去し、スタン状態・バッジを完全解除する
      applyUnleashSkill(c);
      events.push({
        type: 'unleash',
        side: owner,
        lane: l,
        source: 'unleash',
      });
      break;
    }
    case 'double_power': {
      const dpVal = c.currentPower || 0;
      if (dpVal > 0) {
        c.currentPower += dpVal;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: dpVal,
          source: 'double_power',
        });
      }
      break;
    }
    case 'explore': {
      const myDeckSim = owner === 'blue' ? state.playerDeck : state.enemyDeck;
      const myHandSim = owner === 'blue' ? state.playerHand : state.enemyHand;
      if (myDeckSim && myDeckSim.length > 0) {
        // シミュレーション：デッキから最も強いカードを引き、手札の最も弱いカードと入れ替える
        let validCards = myDeckSim.filter((card) => card !== undefined);

        const exploreSkill = c?.skills?.find((s) => s.id === 'explore');
        const targetIds = Array.isArray(exploreSkill?.targetIds)
          ? exploreSkill.targetIds
          : exploreSkill?.targetId
            ? [exploreSkill.targetId]
            : [];
        const targetKeyword = exploreSkill?.targetKeyword;

        if (targetIds.length > 0) {
          validCards = validCards.filter((card) =>
            matchesCardIds(card, targetIds)
          );
        } else if (typeof targetKeyword === 'string' && targetKeyword) {
          validCards = validCards.filter((card) =>
            matchesCardKeyword(card, targetKeyword)
          );
        }

        if (validCards.length > 0) {
          const mP = Math.max(...validCards.map((c) => c.power || 0));
          const bestCards = validCards.filter((c) => (c.power || 0) === mP);
          const bestCard =
            bestCards[Math.floor(getSeededRandom() * bestCards.length)];
          const idx = myDeckSim.findIndex(
            (card) =>
              (bestCard.uid && card.uid === bestCard.uid) ||
              card === bestCard ||
              card.id === bestCard.id ||
              (Boolean(bestCard.baseId) &&
                (card.baseId === bestCard.baseId ||
                  card.id === bestCard.baseId))
          );
          if (idx !== -1) myDeckSim.splice(idx, 1);

          myHandSim.push({
            ...bestCard,
            uid: `${owner}_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          });
          events.push({ type: 'draw', side: owner, source: 'explore' });

          if (myHandSim.length > 0) {
            const dropIndices = getAIDiscardIndices(myHandSim, 1);
            if (dropIndices.length > 0) {
              const dIdx = dropIndices[0];
              myHandSim.splice(dIdx, 1);
            }
          }
        }
      }
      break;
    }
    case 'morph': {
      const eHandRef = owner === 'blue' ? state.enemyHand : state.playerHand;
      if (eHandRef && eHandRef.length > 0) {
        const count = Number(val) || 1;

        // 対象となるカードを抽出し、パワーの降順（同値なら左＝インデックス小が優先）でソート
        const validTargets = eHandRef
          .map((card, idx) => ({ card, idx }))
          .filter((item) => item.card !== null)
          .sort((a, b) => {
            const pA = a.card.currentPower ?? a.card.power ?? 0;
            const pB = b.card.currentPower ?? b.card.power ?? 0;
            if (pB !== pA) return pB - pA;
            return a.idx - b.idx; // インデックスが小さい方を優先
          });

        const actualCount = Math.min(count, validTargets.length);
        const newTokens = [];
        console.log(
          `[DEBUG] morph executed. val(skillValue): ${val}, count: ${count}, validTargets length: ${validTargets.length}, actualCount: ${actualCount}`
        );

        for (let i = 0; i < actualCount; i++) {
          const targetInfo = validTargets[i];
          // eHandRef から対象カードを探して削除
          // （※途中で削除するとインデックスがずれるため、一意なプロパティで検索するか、あるいは直接オブジェクト参照で削除する）
          const removeIdx = eHandRef.findIndex((c) => c === targetInfo.card);
          if (removeIdx !== -1) {
            const discarded = eHandRef.splice(removeIdx, 1)[0];
            const eD =
              owner === 'blue' ? state.enemyDiscard : state.playerDiscard;
            if (eD && !discarded.isToken) {
              const masterData = CARD_MASTER.find(
                (m) => m.id === (discarded.baseId || discarded.id)
              );
              if (masterData) {
                const restoredCard = JSON.parse(JSON.stringify(masterData));
                restoredCard.uid = discarded.uid;
                restoredCard.owner = oppOwner;
                restoredCard.baseId = discarded.baseId || discarded.id;
                if (discarded.isPremium !== undefined)
                  restoredCard.isPremium = discarded.isPremium;
                restoredCard.basePower = restoredCard.power;
                restoredCard.currentPower = restoredCard.power;
                eD.push(restoredCard);
              } else {
                eD.push({
                  ...discarded,
                  currentPower: discarded.basePower || discarded.power,
                  skills: [],
                });
              }
            }
            events.push({
              type: 'discard',
              side: oppOwner,
              card: JSON.parse(JSON.stringify(discarded)),
            });

            const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
              name: '虚空',
              power: 0,
            };
            const voidToken = {
              ...voidTpl,
              id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_vp${i}`,
              uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidvp${i}`,
              baseId: 'token_void',
              filter: voidTpl.filter,
              power: voidTpl.power,
              currentPower: voidTpl.power,
              basePower: voidTpl.power,
              voiceCategory: voidTpl.voiceCategory || 'undead',
              isToken: true,
              isMorphToken: true,
            };
            newTokens.push(voidToken);
            events.push({
              type: 'add_hand',
              side: oppOwner,
              card: voidToken,
              source: 'morph',
            });
          }
        }
        newTokens.forEach((t) => eHandRef.push(t));
      }
      break;
    }
    case 'toxic':
      if (eB[l]) {
        const toxVal = val || 1;
        // 【有毒スキル: 腐食状態の付与】
        // 成長スキルの付与ではなく独立した「腐食（corrosion）」状態を付与する。
        // 重ね掛け時はBの仕様（高い方を優先、Math.max）で管理し、スロット順に追加
        const appliedCorrosion = grantCardStatus(eB[l], 'corrosion', toxVal);
        events.push({
          type: 'add_status',
          side: oppOwner,
          lane: l,
          status: 'corrosion',
          value: appliedCorrosion,
          source: 'toxic',
        });
      }
      break;
    /*
    // 【未実装】劣化能力は現時点では実装を見送り
    case 'deteriorate': {
      const pVal = val || 1;
      // 【劣化スキル: 自身の腐食状態付与】
      // 召喚時、自身に腐食を付与する。Bの仕様（高い方を優先、Math.max）で管理し、スロット順に追加
      grantCardStatus(c, 'corrosion', pVal);
      events.push({
        type: 'add_status',
        side: owner,
        lane: l,
        status: 'corrosion',
        value: c.corrosion,
        source: 'deteriorate',
      });
      break;
    }
    */
    case 'spread': {
      const spVal = val || 2;
      [l - 1, l, l + 1].forEach((j) => {
        if (j >= 0 && j < 3 && eB[j]) {
          damageCard(state, oppOwner, j, spVal, 'spread', events, true);
        }
      });
      break;
    }
    case 'bind':
      // 既存の拘束・待機ターン数と比較し、大きい方の値を維持・適用する（スロット順管理）
      if (eB[l]) {
        grantCardStatus(eB[l], 'stun', (val || 1) + 1);
      }
      break;
    case 'standby':
      // 既存の防御・拘束ターン数と比較し、大きい方の値を維持・適用する（スロット順管理）
      grantCardStatus(c, 'stun', val || 1);
      break;
    case 'freeze':
      // 既存の防御・待機ターン数と比較し、大きい方の値を維持・適用する（スロット順管理）
      [l - 1, l, l + 1].forEach((j) => {
        if (j >= 0 && j < 3 && eB[j]) {
          grantCardStatus(eB[j], 'stun', (val || 1) + 1);
        }
      });
      break;
    case 'loss': {
      const lossDeck = owner === 'blue' ? state.playerDeck : state.enemyDeck;
      const lossDiscard =
        owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
      const lossCount = val || 1;
      for (let i = 0; i < lossCount; i++) {
        if (lossDeck.length > 0) lossDiscard.push(lossDeck.pop());
      }
      break;
    }
    case 'burial': {
      const burialDeck = owner === 'blue' ? state.enemyDeck : state.playerDeck;
      const burialDiscard =
        owner === 'blue' ? state.enemyDiscard : state.playerDiscard;
      const burialCount = val || 1;
      for (let i = 0; i < burialCount; i++) {
        if (burialDeck.length > 0) burialDiscard.push(burialDeck.pop());
      }
      break;
    }
    case 'snipe': {
      const snVal = val || 4;
      let maxL = -1,
        maxP = -1;
      for (let j = 0; j < 3; j++) {
        if (eB[j]) {
          const p = eB[j].currentPower;
          // 同値の場合は左（jが小さい方）を優先するため、> を使用
          if (p > maxP) {
            maxP = p;
            maxL = j;
          }
        }
      }
      if (maxL !== -1) {
        damageCard(state, oppOwner, maxL, snVal, 'snipe', events, true);
      }
      break;
    }
    case 'crush': {
      const targets = [];
      for (let j = 0; j < 3; j++) {
        if (eB[j] && (hasSkill(eB[j], 'defender') || eB[j].stunTurns > 0)) {
          if (canCardBeDestroyed(state, eB[j], oppOwner)) {
            targets.push({ side: oppOwner, lane: j, card: eB[j] });
          }
        }
        if (b[j] && (hasSkill(b[j], 'defender') || b[j].stunTurns > 0)) {
          if (canCardBeDestroyed(state, b[j], owner)) {
            targets.push({ side: owner, lane: j, card: b[j] });
          }
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const tr = targets[i];
        tr.card.currentPower = 0;
      }
      break;
    }
    case 'treason': {
      // お互いの場の「伝説」を持つカードを全て破壊する
      const targets = [];
      for (let j = 0; j < 3; j++) {
        if (eB[j] && hasSkill(eB[j], 'legendary')) {
          if (canCardBeDestroyed(state, eB[j], oppOwner)) {
            targets.push({ side: oppOwner, lane: j, card: eB[j] });
          }
        }
        if (b[j] && hasSkill(b[j], 'legendary')) {
          if (canCardBeDestroyed(state, b[j], owner)) {
            targets.push({ side: owner, lane: j, card: b[j] });
          }
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const tr = targets[i];
        tr.card.currentPower = 0;
      }
      break;
    }
    case 'dispel': {
      // 【AI思考空間：解除(dispel)スキルのシミュレーション】
      const targets = [];

      /**
       * 盤面から「解除」対象（装備カードを保持しているホスト、または自身が装備スキルのカード）を収集するヘルパー
       * @param {Array} board - 対象陣営の盤面
       * @param {string} side - 対象陣営
       */
      const gatherDispelTargets = (board, side) => {
        for (let j = 0; j < 3; j++) {
          if (board[j]) {
            const isEquipHost =
              board[j].equippedCards && board[j].equippedCards.length > 0;
            const isEquipItself = hasSkill(board[j], 'equip');
            if (isEquipHost || isEquipItself) {
              targets.push({
                lane: j,
                side: side,
                targetCard: board[j],
                isHost: isEquipHost,
                isSelf: isEquipItself,
              });
            }
          }
        }
      };
      gatherDispelTargets(eB, oppOwner);
      gatherDispelTargets(b, owner);

      const killTargets = [];
      for (let i = 0; i < targets.length; i++) {
        const tr = targets[i];
        const tgt = tr.targetCard;

        if (tr.isHost) {
          // 1. 装着されている装備カードを全て解除し、ステータス（パワー）を減算する
          let totalLoss = tgt.equippedCards.reduce(
            (sum, eq) =>
              sum + (eq.appliedEquipPower ?? eq.currentPower ?? eq.power ?? 0),
            0
          );
          for (const eqC of tgt.equippedCards) {
            const equipSkills = [];
            if (eqC.skills) {
              eqC.skills.forEach((s) => {
                if (s.id !== 'equip') equipSkills.push(s);
              });
            }
            unmergeCardSkills(tgt, equipSkills);
          }
          tgt.power -= totalLoss;
          tgt.currentPower -= totalLoss;
          tgt.basePower -= totalLoss;
          tgt.equippedCards = [];
          if (events) {
            events.push({
              type: 'dispel_equip',
              side: tr.side,
              lane: tr.lane,
              amount: totalLoss,
              source: 'dispel',
            });
          }
        }

        // 対象カードの破壊不能判定（無効(immune)スキル保持、または所有者の戦乙女の加護が有効な場合は false）
        const canDestroyTgt = canCardBeDestroyed(state, tgt, tr.side);

        // --- AIシミュレーションでの破壊確定条件 ---
        // A) 装備解除によりステータス（パワー）が 0 以下になった場合 (isHost): 戦乙女の加護や無効に関わらず確定破壊 (isKilledByStatLoss)
        // B) 自身が装備スキルのカードの直接破壊 (isSelf): 粉砕や叛逆と同様の直接破壊。canDestroyTgt (加護・無効) で保護される (isKilledBySkill)
        const isKilledByStatLoss = tr.isHost && tgt.currentPower <= 0;
        const isKilledBySkill = tr.isSelf && canDestroyTgt;

        if (isKilledByStatLoss || isKilledBySkill) {
          killTargets.push({ side: tr.side, lane: tr.lane, card: tgt });
          if (tr.side === oppOwner) {
            eB[tr.lane] = null;
          } else {
            b[tr.lane] = null;
          }
        }
      }

      if (killTargets.length > 0 && events) {
        events.push({
          type: 'destroy_cards',
          targets: killTargets,
        });

        // 報復（retaliate）スキル
        const isReversedRetaliate = isReverseActive(state);
        killTargets.forEach(({ side }) => {
          const alliedBoard =
            side === 'blue' ? state.playerBoard : state.enemyBoard;
          alliedBoard.forEach((allyCard, j) => {
            if (allyCard && hasSkill(allyCard, 'retaliate')) {
              let buffVal = getSkillValue(allyCard, 'retaliate') || 2;
              if (isReversedRetaliate) buffVal = -buffVal;
              allyCard.currentPower += buffVal;
              events.push({
                type: 'power_change',
                side,
                lane: j,
                amount: buffVal,
                source: 'retaliate',
                isReversed: isReversedRetaliate,
              });
            }
          });
        });
      }
      break;
    }
    case 'berserk': {
      const bVal = val || 2;
      const bAdj = l === 1 ? [0, 2] : [1];
      bAdj.forEach((j) => {
        if (b[j]) {
          damageCard(state, owner, j, bVal, 'berserk', events, true);
        }
      });
      break;
    }
    case 'heal': {
      const hAmt = val || 3;
      healLeader(state, owner, hAmt, 'heal', events);
      break;
    }
    case 'sacrifice': {
      const sacAmt = val || 3;
      damageLeader(state, owner, sacAmt, 'sacrifice', events);
      break;
    }
    case 'artillery': {
      // 砲撃：相手リーダーに直接ダメージ
      const artAmt = val || 3;
      damageLeader(state, oppOwner, artAmt, 'artillery', events);
      break;
    }
    case 'fate': {
      // 【システム解説】運命（fate）スキル：
      // AI思考シミュレーション時は常に最高の結果（相手リーダーに3ダメージ）として見積もり評価する。
      // ※ 実際の対戦プレイ時におけるダイス抽選（5/6で1~3、1/6で自傷6）およびVFXアニメーション・ポップアップ演出は
      //    「src/game/skillLogic.js」内の「resolveActiveSkillEffect」で実行されます。
      const fateMaxDmg = FATE_ESTIMATED_DAMAGE;
      damageLeader(state, oppOwner, fateMaxDmg, 'fate', events);
      break;
    }
    case 'decree': {
      // 宣告：手札の「宣告」を持つカード枚数×valダメージを相手リーダーに与える
      const decreeMultiplier = val || 4;
      const myHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const decreeCount = (myHand || []).filter(
        (card) => card && hasSkill(card, 'decree')
      ).length;
      const decreeDmg = decreeCount * decreeMultiplier;
      if (decreeDmg > 0) {
        damageLeader(state, oppOwner, decreeDmg, 'decree', events);
      }
      break;
    }
    case 'charge': {
      const chgAmt = val || 2;
      const pMaxSP = state.playerConfig?.leaderSkill?.cost || 5;
      const eMaxSP = state.enemyConfig?.leaderSkill?.cost || 5;
      if (owner === 'blue')
        state.playerSP = Math.min(pMaxSP, Math.max(0, state.playerSP + chgAmt));
      else
        state.enemySP = Math.min(eMaxSP, Math.max(0, state.enemySP + chgAmt));
      events.push({ type: 'charge_sp', side: owner, amount: chgAmt });
      break;
    }
    // 消費: 自分リーダーのSPをvalue分減らす（充填の逆）
    case 'spend': {
      const spendAmt = val || 1;
      if (owner === 'blue')
        state.playerSP = Math.max(0, state.playerSP - spendAmt);
      else state.enemySP = Math.max(0, state.enemySP - spendAmt);
      events.push({ type: 'charge_sp', side: owner, amount: -spendAmt });
      break;
    }
    case 'quick':
      applySingleCombat(state, owner, l, events);
      break;
    case 'bless': {
      const blessHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      if (blessHand && blessHand.length > 0) {
        const blessVal = val || 1;
        let bestCard = null;
        for (let hc of blessHand) {
          if (hc === null) continue;
          if (
            !hc.isToken &&
            (!bestCard || (hc.power || 0) > (bestCard.power || 0))
          ) {
            bestCard = hc;
          }
        }
        if (!bestCard) bestCard = blessHand.find((c) => c !== null);
        if (bestCard) {
          bestCard.power = (bestCard.power || 0) + blessVal;
          bestCard.currentPower = (bestCard.currentPower || 0) + blessVal;
          bestCard.basePower = (bestCard.basePower || 0) + blessVal;
          if (events) {
            events.push({
              type: 'skill_popup',
              side: owner,
              lane: l,
              skillName: '祝福',
            });
          }
        }
      }
      break;
    }
    case 'convert': {
      const convertHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const convertCount = val || 1;
      const actualConvertCount = Math.min(
        convertCount,
        convertHand ? convertHand.length : 0
      );
      if (actualConvertCount > 0 && convertHand) {
        const dropIndices = getAIDiscardIndices(
          convertHand,
          actualConvertCount
        );
        const sortedDropIndices = [...dropIndices].sort((a, b) => b - a);
        for (let i of sortedDropIndices) {
          convertHand.splice(i, 1);
        }
      }
      for (let i = 0; i < actualConvertCount; i++) {
        const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
          name: '虚空',
          power: 0,
        };
        const newToken = {
          ...voidTpl,
          isToken: true,
          power: voidTpl.power,
          basePower: voidTpl.power,
          currentPower: voidTpl.power,
          id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_vp${i}`,
          uid: `${owner}_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: 'token_void',
        };
        convertHand.push(newToken);
      }
      break;
    }
    case 'servant':
    case 'ambush': {
      // 【重要仕様】「使役 X」「奇襲 X」において X (val) はトークンのパワーを指す。
      // 個数は常に 1体 であるため、ループは 1回 固定。
      const summonTargetPower = val || 1;
      let tIdEngine = null;
      let tNameEngine = null;

      // カード本体またはスキルから召喚IDを取得
      const skillForSummonId = c?.skills?.find(
        (s) =>
          (s.id === 'servant' ||
            s.id === 'ambush' ||
            s.id === 'awake' ||
            s.id === 'awake_legendary' ||
            s.id === 'split') &&
          s.summonId
      );
      tIdEngine = c?.summonId || skillForSummonId?.summonId;

      if (!tIdEngine) {
        const engineCId = c?.baseId || c?.id;
        if (engineCId === 'admiral') {
          tIdEngine = 'token_knight';
        } else if (summonTargetPower >= 5) {
          tIdEngine = 'token_golem';
        } else {
          tIdEngine = 'token_drone';
        }
      }

      const baseTC = CARD_MASTER.find((m) => m.id === tIdEngine);
      tNameEngine = baseTC?.name || 'トークン';

      const sTC = {
        id: tIdEngine,
        name: tNameEngine,
        isToken: true,
        rarity: 1,
        voiceCategory: baseTC
          ? baseTC.voiceCategory
          : summonTargetPower >= 5
            ? 'monster'
            : 'machine_new',
      };
      for (let i = 0; i < 1; i++) {
        let targetLane = -1;
        if (simulatedLane !== undefined && simulatedLane !== -1) {
          targetLane = simulatedLane;
        } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
          targetLane = simulatedTokenLanes.shift();
        } else if (Array.isArray(simulatedTokenLanes)) {
          targetLane = -1;
        } else {
          // 盤面シミュレーション評価に基づき客観的最適レーンを決定
          targetLane = getBestSimulatedPlacementLane(
            state,
            owner,
            sTC,
            [0, 1, 2],
            false
          );
        }

        if (targetLane !== -1) {
          const newToken = {
            ...sTC,
            id: `sm_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
            baseId: tIdEngine,
            owner,
            isPremium: c?.isPremium || false,
            imgUrl: `assets/cards/card_${tIdEngine}.webp`,
            power: summonTargetPower,
            basePower: summonTargetPower,
            currentPower: summonTargetPower,
            skills: [],
          };
          processPlacementOrEquip(
            state,
            owner,
            targetLane,
            newToken,
            sid,
            events
          );

          // 奇襲（ambush）の場合、配置したレーンでただちに戦闘を行い、戦闘破壊を即座にクリーンアップ
          if (sid === 'ambush' && b[targetLane]) {
            b[targetLane].isSkillResolving = false;
            applySingleCombat(state, owner, targetLane, events);
            processDestructionTriggers(state, events);
          }
        }
      }
      break;
    }
    case 'awake':
    case 'awake_legendary': {
      // 封印（seal）されたレーンでは覚醒は不発（保留）となり、元のカードのまま場に留まる（最優先グローバル制約）
      if (isLaneSealed(state, owner, l)) break;

      // 覚醒 / 覚醒(伝説): 同レーンにトークンを配置し、元のカードを墓地へ送る（変身/置換）
      const awakeVal = val || 1;
      // 解決対象のスキルIDと同一のスキルから summonId を取得する
      const awakeSkill = c.skills?.find((s) => s.id === sid);
      const awakeTid =
        awakeSkill?.summonId ||
        (sid === 'awake_legendary' ? 'token_thebeast' : 'token_dragon');

      const awakeTpl = CARD_MASTER.find((m) => m.id === awakeTid);
      if (!awakeTpl) break;

      const awakeToken = {
        ...JSON.parse(JSON.stringify(awakeTpl)),
        id: `awake_sim_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
        uid: `${owner}_awake_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
        owner,
        isPremium: c.isPremium,
        power: awakeVal,
        basePower: awakeVal,
        currentPower: awakeVal,
        isToken: true,
        baseId: awakeTid,
        imgUrl: `assets/cards/card_${awakeTid}.webp`,
        skills: awakeTpl.skills
          ? JSON.parse(JSON.stringify(awakeTpl.skills))
          : [],
      };

      // 旧カードを盤面から除外（墓地へ送る）
      quietDiscardFromBoard(state, owner, l);

      // 新トークンを配置
      b[l] = awakeToken;
      events.push({
        type: 'summon_token',
        side: owner,
        lane: l,
        card: JSON.parse(JSON.stringify(awakeToken)),
        source: sid,
      });
      break;
    }
    case 'resurrect': {
      if (isGraveKeeperActive(state)) break;
      // 復活 (AIシミュレーション用): 墓地から一番パワーの高いカードを召喚する
      const maxPowSim = val || 1;
      const simDiscard =
        owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
      const validDiscard = simDiscard.filter(
        (c) => c && (c.power || 0) <= maxPowSim && !c.isToken
      );
      if (validDiscard.length === 0) break;

      // パワーが高い順にソートして一番強いのを取得し、シミュ内で墓地から取り除く
      const sortedDiscard = [...validDiscard].sort(
        (a, b) => (b.power || 0) - (a.power || 0)
      );
      const simResCard = sortedDiscard[0];

      let targetLaneRes = -1;
      if (simulatedLane !== undefined && simulatedLane !== -1) {
        targetLaneRes = simulatedLane;
      } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
        targetLaneRes = simulatedTokenLanes.shift();
      } else if (Array.isArray(simulatedTokenLanes)) {
        targetLaneRes = -1;
      } else {
        // 盤面シミュレーション評価に基づき客観的最適レーンを決定
        targetLaneRes = getBestSimulatedPlacementLane(
          state,
          owner,
          simResCard,
          [0, 1, 2],
          false
        );
      }

      if (targetLaneRes !== -1) {
        const existingCard = b[targetLaneRes];
        const unionSkill =
          simResCard.skills && simResCard.skills.find((s) => s.id === 'union');
        const isUnion =
          unionSkill &&
          existingCard &&
          matchesUnionMaterial(existingCard, unionSkill);

        if (isUnion) {
          const masterData =
            CARD_MASTER.find((c) => c.id === unionSkill.summonId) ||
            CARD_MASTER.find((c) => c.id === 'android');
          let unionCard = JSON.parse(JSON.stringify(masterData));
          unionCard.uid = `rs_sim_un_${Math.floor(getSeededRandom() * 1000000000)}`;
          unionCard.owner = owner;
          unionCard.baseId = unionCard.id;
          unionCard.basePower = unionCard.power;
          unionCard.currentPower = unionCard.power;
          unionCard.skills = []; // 蘇生からの合体のためスキル効果は不発
          unionCard.stunTurns = 0;
          b[targetLaneRes] = unionCard;
          events.push({
            type: 'summon_token',
            side: owner,
            lane: targetLaneRes,
            card: JSON.parse(JSON.stringify(unionCard)),
            source: 'union',
          });
        } else {
          const isEquip =
            hasSkill(simResCard, 'equip') ||
            (existingCard && hasSkill(existingCard, 'arm_self'));
          // 【憑依】：憑依を持つカードには装備できない
          const targetBlocksEquip =
            (existingCard &&
              (hasSkill(existingCard, 'possession') ||
                hasSkill(existingCard, 'reflect'))) ||
            hasSkill(simResCard, 'possession') ||
            hasSkill(simResCard, 'reflect');
          if (isEquip && existingCard && !targetBlocksEquip) {
            // 装備（既存カードの上へ）: applyEquipment に処理を集約
            applyEquipment(existingCard, simResCard);

            events.push({
              type: 'power_change',
              side: owner,
              lane: targetLaneRes,
              amount: simResCard.appliedEquipPower ?? simResCard.power,
              source: 'equip',
              card: simResCard,
            });
          } else {
            if (existingCard)
              quietDiscardFromBoard(state, owner, targetLaneRes);
            const newResToken = {
              ...JSON.parse(JSON.stringify(simResCard)),
              id: `rs_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
              baseId: simResCard.baseId || simResCard.id,
              voiceCategory:
                simResCard.voiceCategory ||
                CARD_MASTER.find(
                  (m) => m.id === (simResCard.baseId || simResCard.id)
                )?.voiceCategory,
              owner,
              currentPower: simResCard.power,
              skillTriggered: true, // ルール: 配置(Place)では召喚時スキルは発動しない
            };
            b[targetLaneRes] = newResToken;
            events.push({
              type: 'summon_card',
              side: owner,
              lane: targetLaneRes,
              card: JSON.parse(JSON.stringify(newResToken)),
              source: 'resurrect',
            });
          }
        }

        const resIdx = simDiscard.indexOf(simResCard);
        if (resIdx !== -1) simDiscard.splice(resIdx, 1);
      }
      break;
    }
    case 'puppet': {
      if (isGraveKeeperActive(state)) break;
      // 【傀儡】相手の墓地からパワー以下のカードを1枚選んで自分の場に配置する（復活の逆版）
      // AIシミュレーション: 相手墓地の中で最もパワーが高いカードを優先的に選択する
      const puppetMaxPow = val || 1;
      const oppPuppetDiscard =
        owner === 'blue' ? state.enemyDiscard : state.playerDiscard;
      const validPuppetCards = oppPuppetDiscard.filter(
        (c) => c && (c.power || 0) <= puppetMaxPow && !c.isToken
      );
      if (validPuppetCards.length === 0) break;

      // パワーが高い順にソートして最強カードを選択
      const sortedPuppetDiscard = [...validPuppetCards].sort(
        (a, b) => (b.power || 0) - (a.power || 0)
      );
      const simPuppetCard = sortedPuppetDiscard[0];

      let targetLanePuppet = -1;
      if (simulatedLane !== undefined && simulatedLane !== -1) {
        targetLanePuppet = simulatedLane;
      } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
        targetLanePuppet = simulatedTokenLanes.shift();
      } else if (Array.isArray(simulatedTokenLanes)) {
        targetLanePuppet = -1;
      } else {
        // 盤面シミュレーション評価に基づき客観的最適レーンを決定
        targetLanePuppet = getBestSimulatedPlacementLane(
          state,
          owner,
          simPuppetCard,
          [0, 1, 2],
          false
        );
      }

      if (targetLanePuppet !== -1) {
        const newPuppetCard = {
          ...JSON.parse(JSON.stringify(simPuppetCard)),
          id: `puppet_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: simPuppetCard.baseId || simPuppetCard.id,
          owner,
          currentPower: simPuppetCard.power,
          skillTriggered: true,
        };
        processPlacementOrEquip(
          state,
          owner,
          targetLanePuppet,
          newPuppetCard,
          'puppet',
          events
        );

        // 相手の墓地から取り除く
        const puppetIdx = oppPuppetDiscard.indexOf(simPuppetCard);
        if (puppetIdx !== -1) oppPuppetDiscard.splice(puppetIdx, 1);
      }
      break;
    }
    case 'clone': {
      // 【重要仕様】「分身 X」において X (val) は召喚される個数を指す。
      const cloneCount = val || 1;
      const tC = {
        id: 'token_clone',
        name: '分身',
        isToken: true,
        rarity: c.rarity || 1,
        voiceCategory: c.voiceCategory || 'sword',
      };
      // スキルの引き継ぎ（分身含む全スキル）
      // 分身(clone)は召喚時にしか発動しないため、コピーしても影響がない
      let inheritedSkills = Array.isArray(c.skills) ? [...c.skills] : [];

      for (let i = 0; i < cloneCount; i++) {
        let targetLane = -1;
        if (simulatedLane !== undefined && simulatedLane !== -1) {
          targetLane = simulatedLane;
        } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
          targetLane = simulatedTokenLanes.shift();
        } else if (Array.isArray(simulatedTokenLanes)) {
          targetLane = -1;
        } else {
          // 分身スキルの調整：元のレーン l の隣接レーンのみを対象とする
          const adjacentLanes = l === 1 ? [0, 2] : [1];
          // 隣接候補レーンに対する盤面シミュレーション評価に基づき客観的最適レーンを決定
          targetLane = getBestSimulatedPlacementLane(
            state,
            owner,
            tC,
            adjacentLanes,
            false
          );
        }

        if (targetLane !== -1) {
          const existingCard = b[targetLane];
          const inheritedUnionSkill = inheritedSkills.find(
            (sk) => sk.id === 'union'
          );
          const isUnion =
            inheritedUnionSkill &&
            existingCard &&
            matchesUnionMaterial(existingCard, inheritedUnionSkill);

          if (isUnion) {
            const masterData =
              CARD_MASTER.find(
                (md) => md.id === inheritedUnionSkill.summonId
              ) || CARD_MASTER.find((md) => md.id === 'android');
            let unionCard = JSON.parse(JSON.stringify(masterData));
            unionCard.uid = `cl_sim_un_${Math.floor(getSeededRandom() * 1000000000)}_${i}`;
            unionCard.owner = owner;
            unionCard.baseId = unionCard.id;
            unionCard.basePower = unionCard.power;
            unionCard.currentPower = unionCard.power;
            unionCard.skills = []; // 配置からのため不発
            unionCard.stunTurns = 0;
            b[targetLane] = unionCard;
            events.push({
              type: 'summon_token',
              side: owner,
              lane: targetLane,
              card: JSON.parse(JSON.stringify(unionCard)),
              source: 'union',
            });
          } else {
            const newToken = {
              ...tC,
              id: `cl_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
              baseId: c.baseId || c.id,
              owner,
              isPremium: c.isPremium,
              imgUrl: c.imgUrl, // シミュ内では元の情報を保持していればOK (UI表示は後で行われる)
              rarity: c.rarity || 1,
              power: c.power || 1,
              basePower: c.basePower || c.power || 1,
              currentPower:
                c.currentPower !== undefined ? c.currentPower : c.power || 1,
              skills: JSON.parse(JSON.stringify(inheritedSkills)),
              voiceCategory: c.voiceCategory || 'sword',
              stunTurns: c.stunTurns || 0,
              skillTriggered: true,
            };
            processPlacementOrEquip(
              state,
              owner,
              targetLane,
              newToken,
              'clone',
              events
            );
          }
        }
      }
      break;
    }
    case 'petrify':
      if (eB[l]) {
        const targetOriginal = JSON.parse(JSON.stringify(eB[l]));
        const statueTpl = CARD_MASTER.find((m) => m.id === 'token_statue') || {
          name: '石像',
          power: 5,
          rarity: 1,
        };
        const statueToken = {
          ...statueTpl,
          id: `statue_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: 'token_statue',
          uid: `${oppOwner}_${Math.floor(getSeededRandom() * 1000000000)}_statue`,
          owner: oppOwner,
          power: statueTpl.power,
          basePower: statueTpl.basePower || statueTpl.power,
          currentPower: statueTpl.power,
          isToken: true,
          skills: JSON.parse(JSON.stringify(statueTpl.skills || [])),
          voiceCategory: statueTpl.voiceCategory || 'stone',
          originalRevertTarget: targetOriginal, // 石像破壊時に墓地へ行く元カード
        };

        if (
          targetOriginal.equippedCards &&
          targetOriginal.equippedCards.length > 0
        ) {
          statueToken.equippedCards = JSON.parse(
            JSON.stringify(targetOriginal.equippedCards)
          );
        }
        if (
          targetOriginal.unionMaterials &&
          targetOriginal.unionMaterials.length > 0
        ) {
          statueToken.unionMaterials = JSON.parse(
            JSON.stringify(targetOriginal.unionMaterials)
          );
        }

        // 既存のカードを消すわけではなく変身扱いとするため、破壊イベントは積まない（あるいは変身イベントを積む）
        eB[l] = statueToken;
      }
      break;
    case 'reinforce': {
      // AIシミュレーション用: 手札の枚数が十分ある前提で最大数捨てるとしてトークンを手札に加える
      const h = owner === 'blue' ? state.playerHand : state.enemyHand;
      const actualReinforceCount = Math.min(val || 1, h.length);

      if (actualReinforceCount > 0 && h.length > 0) {
        // 増援はトークン獲得による強化が主目的のため、強制破棄ロジック（isExact = true）で最大枚数を破棄
        const dropIndices = getAIDiscardIndices(h, actualReinforceCount, true);
        const sortedDropIndices = [...dropIndices].sort((a, b) => b - a);
        for (let i of sortedDropIndices) {
          h.splice(i, 1);
        }
      }

      const rTC = {
        id: 'token_reinforce',
        name: c.name,
        isToken: true,
        rarity: c.rarity || 1,
        power: c.currentPower !== undefined ? c.currentPower : c.power || 1,
        basePower: c.basePower || c.power || 1,
        currentPower:
          c.currentPower !== undefined ? c.currentPower : c.power || 1,
        voiceCategory: c.voiceCategory || 'lizard',
      };

      for (let i = 0; i < actualReinforceCount; i++) {
        h.push({
          ...rTC,
          id: `rf_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
          owner,
          imgUrl: c.imgUrl,
          isPremium: c.isPremium,
        });
      }
      break;
    }
    case 'call':
      // 号令は純粋ロジックでの完全なシミュレーションが不可能なため（ユーザー選択や期待値ベース評価を行うため）
      // engine.jsでは盤面に干渉しない（ai_normal等で独自に+3として期待値評価する）
      break;
    case 'stealth':
    case 'invincible': {
      const invVal = val || 1;
      // 「状態（ステータス）」としてスロット順に追加・管理
      grantCardStatus(c, 'invincible', invVal);
      events.push({
        type: 'add_skill',
        side: owner,
        lane: l,
        skillId: 'invincible',
        value: invVal,
        source: sid,
      });
      break;
    }
    case 'decay': {
      const decayAmt = Math.floor((c.currentPower || c.power || 0) / 2);
      c.power = decayAmt;
      c.currentPower = decayAmt;
      c.basePower = decayAmt;
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: -decayAmt,
        source: 'decay',
      });
      break;
    }
    case 'cull': {
      // 【選別】相手の場でパワーの低いカードを指定枚数破壊（墓地送り）
      const occupiedLanes = eB
        .map((bc, i) => (bc !== null ? i : -1))
        .filter((i) => i !== -1);
      if (occupiedLanes.length > 0) {
        // パワー昇順ソート。ただし免疫(immune)を最優先で選択して損失を回避する
        occupiedLanes.sort((a, b) => {
          const aImmune = hasSkill(eB[a], 'immune');
          const bImmune = hasSkill(eB[b], 'immune');
          if (aImmune && !bImmune) return -1;
          if (!aImmune && bImmune) return 1;

          const diff = (eB[a].currentPower || 0) - (eB[b].currentPower || 0);
          if (diff !== 0) return diff;
          return a - b;
        });

        const count = val === undefined || val === 0 ? 1 : val;
        const selectCount = Math.min(count, occupiedLanes.length);
        const targets = [];

        for (let idx = 0; idx < selectCount; idx++) {
          const targetLane = occupiedLanes[idx];
          const targetCard = eB[targetLane];
          if (targetCard) {
            if (!canCardBeDestroyed(state, targetCard, oppOwner)) {
              events.push({
                type: isValkyriaGuardActive(state, oppOwner)
                  ? 'valkyria_guard_block'
                  : 'immune_block',
                side: oppOwner,
                lane: targetLane,
                card: targetCard,
              });
            } else {
              quietDiscardFromBoard(state, oppOwner, targetLane);
              targets.push({
                side: oppOwner,
                lane: targetLane,
                card: targetCard,
              });
            }
          }
        }

        if (targets.length > 0) {
          events.push({
            type: 'destroy_cards',
            targets: targets,
          });

          // 報復（retaliate）スキル: 破壊された枚数分、相手陣営の生存カードのパワーを上昇させる
          const isReversedRetaliate = isReverseActive(state);
          targets.forEach(() => {
            eB.forEach((allyCard, j) => {
              if (allyCard && hasSkill(allyCard, 'retaliate')) {
                let buffVal = getSkillValue(allyCard, 'retaliate') || 2;
                if (isReversedRetaliate) buffVal = -buffVal;
                allyCard.currentPower += buffVal;
                events.push({
                  type: 'power_change',
                  side: oppOwner,
                  lane: j,
                  amount: buffVal,
                  source: 'retaliate',
                  isReversed: isReversedRetaliate,
                });
              }
            });
          });
        }
      }
      break;
    }
    case 'grant_deadly':
    case 'grant_sturdy': {
      const targetSkill = sid === 'grant_deadly' ? 'deadly' : 'sturdy';
      const myBoard = owner === 'blue' ? state.playerBoard : state.enemyBoard;

      for (let i = 0; i < 3; i++) {
        const tc = myBoard[i];
        if (tc && tc !== c) {
          const originalCard = CARD_MASTER.find(
            (m) => m.id === (tc.baseId || tc.id)
          );
          const isVanilla = originalCard
            ? !originalCard.skills ||
              originalCard.skills.length === 0 ||
              originalCard.skills.every((s) => s.id === 'none')
            : !tc.skills ||
              tc.skills.length === 0 ||
              tc.skills.every((s) => s.id === 'none');
          if (isVanilla) {
            if (!tc.skills) {
              tc.skills = [];
            }
            tc.skills = tc.skills.filter((s) => s.id !== 'none');

            // 重複付与を防ぐ（頑丈や必殺は最大1個まで）
            if (!tc.skills.some((s) => s.id === targetSkill)) {
              tc.skills.push({ id: targetSkill });
              events.push({
                type: 'add_skill',
                side: owner,
                lane: i,
                skillId: targetSkill,
                value: 0,
                source: sid,
              });
            }
          }
        }
      }
      break;
    }
    case 'protection': {
      // 【保護】味方カード1体（自身含む）を選択し、次の自分のターン開始時まで「加護」を付与する。
      // シミュレーション時は、自陣の高パワーカード（加護未付与優先）を選択する
      const myOccupiedLanes = b
        .map((bc, i) => (bc !== null ? i : -1))
        .filter((i) => i !== -1);
      if (myOccupiedLanes.length > 0) {
        myOccupiedLanes.sort((i1, i2) => {
          const g1 = Boolean(b[i1].valkyriaGuard);
          const g2 = Boolean(b[i2].valkyriaGuard);
          if (g1 !== g2) return g1 ? 1 : -1;
          return (b[i2].currentPower || 0) - (b[i1].currentPower || 0);
        });
        const targetLane = myOccupiedLanes[0];
        const targetCard = b[targetLane];
        if (targetCard) {
          targetCard.valkyriaGuard = true;
          targetCard.valkyriaGuardTurns = VALKYRIA_GUARD_TURNS;
          events.push({
            type: 'add_status',
            side: owner,
            lane: targetLane,
            status: 'valkyria_guard',
            source: 'protection',
          });
        }
      }
      break;
    }
    case 'execute': {
      // 【処刑】自分の場で最もパワーの低いカード1枚を破壊（墓地送り）
      const myOccupiedLanes = b
        .map((bc, i) => (bc !== null ? i : -1))
        .filter((i) => i !== -1);
      if (myOccupiedLanes.length > 0) {
        // パワー昇順ソート。ただし免疫(immune)または加護を最優先で選択して損失を回避する
        myOccupiedLanes.sort((a, ab) => {
          const aImmune = !canCardBeDestroyed(state, b[a], owner);
          const bImmune = !canCardBeDestroyed(state, b[ab], owner);
          if (aImmune && !bImmune) return -1;
          if (!aImmune && bImmune) return 1;

          const diff = (b[a].currentPower || 0) - (b[ab].currentPower || 0);
          if (diff !== 0) return diff;
          return a - ab;
        });
        const execLane = myOccupiedLanes[0];
        const execCard = b[execLane];
        if (execCard) {
          if (!canCardBeDestroyed(state, execCard, owner)) {
            events.push({
              type: isValkyriaGuardActive(state, owner)
                ? 'valkyria_guard_block'
                : 'immune_block',
              side: owner,
              lane: execLane,
              card: execCard,
            });
          } else {
            // 分裂(split): 墓地送りの代わりにトークンを配置する
            if (hasSkill(execCard, 'split')) {
              const sealedLanes =
                owner === 'blue'
                  ? state.playerSealedLanes
                  : state.enemySealedLanes;
              if (!sealedLanes || sealedLanes[execLane] === 0) {
                const tokenId =
                  execCard.summonId ||
                  execCard.skills?.find((s) => s.id === 'split')?.summonId ||
                  'token_legs';
                const tL = CARD_MASTER.find((m) => m.id === tokenId) || {
                  name: 'トークン',
                  power: 1,
                };
                const val = getSkillValue(execCard, 'split') || tL.power || 2;
                b[execLane] = {
                  ...JSON.parse(JSON.stringify(tL)),
                  id: `sp_${Math.floor(getSeededRandom() * 1000000000)}_${execLane}_${getSeededRandom().toString(36).substr(2, 5)}`,
                  baseId: tokenId,
                  owner,
                  imgUrl: `assets/cards/card_${tokenId}.webp`,
                  power: val,
                  currentPower: val,
                  basePower: val,
                  rarity: tL.rarity || 1,
                };
                events.push({
                  type: 'summon_token',
                  side: owner,
                  lane: execLane,
                  card: JSON.parse(JSON.stringify(b[execLane])),
                  source: 'split',
                });
              } else {
                // 封印されたレーンでは分裂できないので通常の墓地送り
                quietDiscardFromBoard(state, owner, execLane);
              }
            } else {
              quietDiscardFromBoard(state, owner, execLane);
            }

            // 誘爆(explode): 隣接カードにダメージを与える
            if (hasSkill(execCard, 'explode')) {
              const dmg = getSkillValue(execCard, 'explode') || 3;
              [execLane - 1, execLane + 1].forEach((adj) => {
                if (adj >= 0 && adj < 3 && b[adj]) {
                  if (canTakeDamage(b[adj], dmg, true, state, owner)) {
                    b[adj].currentPower -= dmg;
                    events.push({
                      type: 'damage_card',
                      side: owner,
                      lane: adj,
                      amount: dmg,
                      source: 'explode',
                    });
                  } else {
                    events.push({
                      type: 'immune_block',
                      side: owner,
                      lane: adj,
                      source: 'explode',
                    });
                  }
                }
              });
            }

            events.push({
              type: 'destroy_cards',
              targets: [{ side: owner, lane: execLane, card: execCard }],
            });

            // 報復（retaliate）スキル: 自陣カードが破壊された時、自陣の生存カードのパワーを上昇させる
            const isReversedRetaliate = isReverseActive(state);
            b.forEach((allyCard, j) => {
              if (allyCard && hasSkill(allyCard, 'retaliate')) {
                let buffVal = getSkillValue(allyCard, 'retaliate') || 2;
                if (isReversedRetaliate) buffVal = -buffVal;
                allyCard.currentPower += buffVal;
                events.push({
                  type: 'power_change',
                  side: owner,
                  lane: j,
                  amount: buffVal,
                  source: 'retaliate',
                  isReversed: isReversedRetaliate,
                });
              }
            });
          }
        }
      }
      break;
    }
    case 'draw': {
      // 【入替(draw)スキル処理】
      // 召喚時、手札をval枚まで捨て、同数引く
      const myDeck = owner === 'blue' ? state.playerDeck : state.enemyDeck;
      const myHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const drawCount = val || 1;
      if (myDeck && myHand && myDeck.length > 0 && myHand.length > 0) {
        const actualDraw = Math.min(drawCount, myDeck.length, myHand.length);
        const dropIndices = getAIDiscardIndices(myHand, actualDraw);
        const sorted = [...dropIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          myHand.splice(idx, 1);
        }
        for (let i = 0; i < actualDraw; i++) {
          if (myDeck.length > 0) {
            myHand.push(myDeck.pop());
          }
        }
        events.push({ type: 'draw', side: owner, source: 'draw' });
      }
      break;
    }
    case 'salvage': {
      // 【回収(salvage)スキル処理】
      // 召喚時、手札をval枚まで捨て、同数自分の墓地からカードを手札に加える
      if (isGraveKeeperActive(state)) break;
      const discard =
        owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const validDiscard = discard
        ? discard.filter((card) => card && !card.isToken)
        : [];
      if (validDiscard.length > 0 && hand && hand.length > 0) {
        const salvageCount = Math.min(
          val || 1,
          validDiscard.length,
          hand.length
        );
        const dropIndices = getAIDiscardIndices(hand, salvageCount);
        const sorted = [...dropIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          hand.splice(idx, 1);
        }
        validDiscard.sort((a, b) => (b.power || 0) - (a.power || 0));
        for (let i = 0; i < salvageCount; i++) {
          const recovered = validDiscard[i];
          const dIdx = discard.indexOf(recovered);
          if (dIdx !== -1) discard.splice(dIdx, 1);
          hand.push(recovered);
        }
        events.push({ type: 'salvage', side: owner, source: 'salvage' });
      }
      break;
    }
    case 'shuffle': {
      // 【攪乱(shuffle)スキル処理】
      // 召喚時、お互いの手札を全て捨て、墓地をリセットし、お互いにカードを3枚引く
      events.push({ type: 'shuffle', side: owner, source: 'shuffle' });
      break;
    }
    case 'leap': {
      // 【跳躍(leap)スキル処理】
      // 召喚時、追加ターンを1回付与（SP増加なし・攻撃なし）
      state.extraTurnCount = (state.extraTurnCount || 0) + 1;
      state.attackSkipCount = (state.attackSkipCount || 0) + 1;
      events.push({ type: 'leap', side: owner, source: 'leap' });
      break;
    }
    case 'recurse': {
      // 【再帰(recurse)スキル処理】
      // 召喚時、お互いの墓地のカードをval枚まで選択してデッキに戻す
      if (isGraveKeeperActive(state)) break;
      events.push({ type: 'recurse', side: owner, source: 'recurse' });
      break;
    }
    case 'metamorph': {
      // 【変身(metamorph)スキル処理】
      // 召喚時、全カードの中からランダムに1枚に変身する。シミュレーションでは期待値パワーを設定
      const metaPower = METAMORPH_ESTIMATED_POWER;
      c.currentPower = metaPower;
      c.power = metaPower;
      c.basePower = metaPower;
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: metaPower,
        source: 'metamorph',
      });
      break;
    }
    case 'assemble': {
      // 【召集(assemble)スキル処理】
      // 先行1ターン目は他のレーンにカードを出せないためボーナス加算不可
      const turnCount = state.turnCount ?? 0;
      const firstPlayer = state.firstPlayer;
      if (turnCount === 1 && firstPlayer === owner) break;

      // 召喚時、デッキから条件に合うカード1枚を自分のレーンに召喚する（シミュレーション用近似）
      const myDeck = owner === 'blue' ? state.playerDeck : state.enemyDeck;
      if (!myDeck || myDeck.length === 0) break;
      const selfId = c ? c.baseId || c.id : null;
      const skObj = c?.skills?.find((s) => s.id === 'assemble') || {
        id: 'assemble',
        value: val,
      };
      const isExcludeBoard = Boolean(skObj.excludeBoard);
      const myBoard = owner === 'blue' ? state.playerBoard : state.enemyBoard;
      const { presentBoardCards, presentBoardIds } = collectPresentBoardTargets(
        myBoard,
        isExcludeBoard
      );
      const hasTarget = myDeck.some(
        (dCard) =>
          dCard &&
          matchesAssembleTarget(dCard, skObj, {
            selfId,
            presentBoardIds,
            presentBoardCards,
          })
      );
      if (!hasTarget) break;
      const assembleBonus = val || 3;
      c.currentPower += assembleBonus;
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: assembleBonus,
        source: 'assemble',
      });
      break;
    }
    case 'summon': {
      // 【召喚(summon)スキル処理】
      // 召喚時、手札から条件に合うカード1枚を召喚し、「虚空（パワー0）」を手札に加える
      const myHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      if (!myHand || myHand.length === 0) break;
      const summonBonus = val || 3;
      c.currentPower += summonBonus;
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      myHand.push({
        ...voidTpl,
        isToken: true,
        baseId: 'token_void',
        uid: `${owner}_sim_void_${Math.floor(getSeededRandom() * 1000000000)}`,
      });
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: summonBonus,
        source: 'summon',
      });
      break;
    }
    case 'forge': {
      // 【鍛造(forge)スキル処理】
      // 召喚時、カードが配置されているレーンに手札から「装備」を持つカードを召喚し、「虚空」を手札に加える
      const myHand = owner === 'blue' ? state.playerHand : state.enemyHand;
      if (!myHand || myHand.length === 0) break;
      const forgeBonus = 3;
      c.currentPower += forgeBonus;
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      myHand.push({
        ...voidTpl,
        isToken: true,
        baseId: 'token_void',
        uid: `${owner}_sim_void_${Math.floor(getSeededRandom() * 1000000000)}`,
      });
      events.push({
        type: 'power_change',
        side: owner,
        lane: l,
        amount: forgeBonus,
        source: 'forge',
      });
      break;
    }
  }

  processDestructionTriggers(state, events);
  return events;
}


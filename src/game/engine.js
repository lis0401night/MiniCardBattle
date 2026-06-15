import { getAIDiscardIndices } from '../utils/aiDiscardLogic.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  getSeededRandom,
  getSkillValue,
  hasSkill,
  mergeCardSkills,
  unmergeCardSkills,
} from '../utils/gameUtils.js';

export function canTakeDamage(card, amount, isSkill = true) {
  if (!card) return false;
  if (isSkill && hasSkill(card, 'immune')) return false;
  const resVal = getSkillValue(card, 'resist');
  if (resVal > 0 && amount >= resVal) return false;
  return true;
}

/**
 * リーダーが受けるダメージを「犠牲」を持つカードに肩代わりさせるか判定し、適用する。
 * 肩代わりが発生した場合は true を返し、カードにダメージを与えます。
 * 発生しなかった場合は false を返します。
 * 複数ある場合は、左側のレーン（インデックスが小さいレーン）から優先的に肩代わりします。
 */
export function applyMartyrForLeader(state, side, amount, events) {
  if (amount <= 0) return false;

  const board = side === 'blue' ? state.playerBoard : state.enemyBoard;
  let martyrLane = -1;
  let martyrCard = null;

  for (let i = 0; i < board.length; i++) {
    const card = board[i];
    // パワーが1以上で、「犠牲（martyr）」スキルを持つカードを左から検索（気絶状態でも肩代わり可能）
    if (card && card.currentPower > 0 && hasSkill(card, 'martyr')) {
      martyrCard = card;
      martyrLane = i;
      break;
    }
  }

  if (martyrCard) {
    events.push({
      type: 'skill_popup',
      side: side,
      lane: martyrLane,
      skillName: '犠牲',
    });

    let appliedDmg = amount;
    if (!canTakeDamage(martyrCard, appliedDmg, false)) {
      events.push({
        type: 'immune_block',
        side: side,
        lane: martyrLane,
        source: 'martyr',
      });
      appliedDmg = 0;
    } else if (hasSkill(martyrCard, 'invincible')) {
      events.push({
        type: 'invincible_block',
        side: side,
        lane: martyrLane,
      });
      appliedDmg = 0;
    }

    if (appliedDmg > 0) {
      martyrCard.currentPower -= appliedDmg;
      events.push({
        type: 'damage_card',
        side: side,
        lane: martyrLane,
        amount: appliedDmg,
        source: 'martyr',
      });
    }

    return true; // 肩代わり成功
  }

  return false; // 肩代わりなし
}

/**
 * リーダーにダメージを与える（犠牲の肩代わりを考慮する）
 */
export function damageLeader(state, side, amount, source, events, lane = null) {
  if (amount <= 0) return;

  // 犠牲の肩代わりチェック
  if (applyMartyrForLeader(state, side, amount, events)) {
    return; // 肩代わりされたので終了
  }

  // 肩代わりされなかった場合、通常通りリーダーダメージ
  if (side === 'blue') {
    state.playerHP = Math.max(0, state.playerHP - amount);
  } else {
    state.enemyHP = Math.max(0, state.enemyHP - amount);
  }

  events.push({
    type: 'damage_player',
    side: side,
    amount: amount,
    source: source,
    lane: lane,
  });
}

/**
 * Mini Card Battle - Core Game Engine
 * DOMや演出に依存しない、純粋な状態更新ロジック
 */

/**
 * 盤面のカードを静かに除外し、必要に応じてリセットして墓地へ送る
 * （上書き配置などのため、破壊演出の発動や死亡時効果を起こさない）
 */
export function quietDiscardFromBoard(state, owner, lane) {
  const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
  const targetCard = b[lane];

  if (!targetCard) return;

  // Helper to send a card to grave
  const sendToGrave = (cardToSend, fallBackOwner) => {
    if (cardToSend.isToken) return;
    let restoredCard;
    // 【傀儡】傀儡スキルで奪ったカードは元の持ち主の墓地へ返す
    const cOwner =
      cardToSend.puppetOriginalOwner || cardToSend.owner || fallBackOwner;
    const cDiscardPile =
      cOwner === 'blue' ? state.playerDiscard : state.enemyDiscard;
    const masterData = CARD_MASTER.find(
      (m) => m.id === (cardToSend.baseId || cardToSend.id)
    );
    if (masterData) {
      restoredCard = JSON.parse(JSON.stringify(masterData));
      restoredCard.uid = cardToSend.uid;
      restoredCard.owner = cOwner;
      restoredCard.baseId = cardToSend.baseId || cardToSend.id;
      if (cardToSend.isPremium !== undefined)
        restoredCard.isPremium = cardToSend.isPremium;
      restoredCard.basePower = restoredCard.power;
      restoredCard.currentPower = restoredCard.power;
    } else {
      restoredCard = { ...cardToSend };
      if ('basePower' in restoredCard)
        restoredCard.power = restoredCard.basePower;
      restoredCard.currentPower = restoredCard.power;
      restoredCard.skills = [];
      restoredCard.equippedCards = [];
      restoredCard.unionMaterials = [];
      if (restoredCard.puppetOriginalOwner)
        delete restoredCard.puppetOriginalOwner;
    }
    cDiscardPile.push(restoredCard);
  };

  if (targetCard.equippedCards && targetCard.equippedCards.length > 0) {
    targetCard.equippedCards.forEach((eq) => sendToGrave(eq, owner));
  }
  if (targetCard.unionMaterials && targetCard.unionMaterials.length > 0) {
    targetCard.unionMaterials.forEach((mat) => sendToGrave(mat, owner));
  }
  if (targetCard.originalRevertTarget) {
    sendToGrave(targetCard.originalRevertTarget, owner);
  }

  sendToGrave(targetCard, owner);

  b[lane] = null;
}

export function processPlacementOrEquip(
  state,
  owner,
  lane,
  newCard,
  sourceAction,
  events
) {
  const b = owner === 'blue' ? state.playerBoard : state.enemyBoard;
  const existingCard = b[lane];
  const isEquip =
    hasSkill(newCard, 'equip') ||
    (existingCard && hasSkill(existingCard, 'arm_self'));
  const targetBlocksEquip =
    (existingCard &&
      (hasSkill(existingCard, 'possession') ||
        hasSkill(existingCard, 'reflect'))) ||
    hasSkill(newCard, 'possession') ||
    hasSkill(newCard, 'reflect');

  if (isEquip && existingCard && !targetBlocksEquip) {
    existingCard.power = (existingCard.power || 0) + (newCard.power || 0);
    existingCard.basePower =
      (existingCard.basePower || 0) + (newCard.power || 0);
    existingCard.currentPower =
      (existingCard.currentPower || 0) + (newCard.power || 0);

    let equipSkills = [];
    if (newCard.skill && newCard.skill !== 'none' && newCard.skill !== 'equip')
      equipSkills.push({ id: newCard.skill, value: newCard.skillValue });
    if (newCard.skills)
      newCard.skills.forEach((s) => {
        if (s.id !== 'equip') equipSkills.push(s);
      });
    mergeCardSkills(existingCard, equipSkills);

    existingCard.equippedCards = existingCard.equippedCards || [];
    existingCard.equippedCards.push(newCard);

    // 武装（arm_self）の消費処理
    if (!hasSkill(newCard, 'equip') && hasSkill(existingCard, 'arm_self')) {
      existingCard.skills = existingCard.skills.filter(
        (s) => s.id !== 'arm_self'
      );
    }

    events.push({
      type: 'power_change',
      side: owner,
      lane: lane,
      amount: newCard.power,
      source: 'equip',
    });
  } else {
    if (existingCard) quietDiscardFromBoard(state, owner, lane);
    b[lane] = newCard;
    events.push({
      type: 'summon_token',
      side: owner,
      lane: lane,
      card: JSON.parse(JSON.stringify(newCard)),
      source: sourceAction,
    });
  }
}

/**
 * 破壊されたカードのクリーンアップと、破壊時スキルの処理を行う共通関数
 */
export function processDestructionTriggers(state, events) {
  let anyDestroyedAtAll = false;
  let anyDestroyed = true;
  while (anyDestroyed) {
    anyDestroyed = false;
    let destroyedThisLoop = [];
    let tokensToSummonThisLoop = [];
    const targets = [
      { board: state.playerBoard, side: 'blue' },
      { board: state.enemyBoard, side: 'red' },
    ];

    targets.forEach(({ board, side }) => {
      for (let i = 0; i < 3; i++) {
        // パワー0以下のカードを破壊対象にするが、スキル解決中のカードは除外する
        if (
          board[i] &&
          board[i].currentPower <= 0 &&
          !board[i].isSkillResolving
        ) {
          const deadCard = board[i];
          destroyedThisLoop.push({ side, lane: i, card: deadCard });

          board[i] = null;
          anyDestroyed = true;
          anyDestroyedAtAll = true;

          // 分裂(split)
          if (hasSkill(deadCard, 'split')) {
            const tokenId =
              deadCard.summonId ||
              deadCard.skills?.find((s) => s.id === 'split')?.summonId ||
              'token_legs'; // 安全のためのフォールバック値
            const tL = CARD_MASTER.find((m) => m.id === tokenId) || {
              name: 'トークン',
              power: 1,
            };
            const val = getSkillValue(deadCard, 'split') || tL.power || 2;

            tokensToSummonThisLoop.push({
              side,
              lane: i,
              card: {
                ...JSON.parse(JSON.stringify(tL)),
                id: `sp_${Math.floor(getSeededRandom() * 1000000000)}_${i}_${getSeededRandom().toString(36).substr(2, 5)}`,
                owner: side,
                imgUrl: `assets/cards/card_${tokenId}.jpg`,
                power: val,
                currentPower: val,
                basePower: val,
                rarity: tL.rarity || 1,
              },
            });
          }

          // 誘爆(explode)
          if (hasSkill(deadCard, 'explode')) {
            events.push({
              type: 'vfx_trigger',
              vfxId: 'anm_skill_explode',
              side,
              lane: i,
            });
            const dmg = getSkillValue(deadCard, 'explode') || 3;
            [i - 1, i + 1].forEach((adj) => {
              if (adj >= 0 && adj < 3 && board[adj]) {
                if (canTakeDamage(board[adj], dmg)) {
                  board[adj].currentPower -= dmg;
                  events.push({
                    type: 'damage_card',
                    side,
                    lane: adj,
                    amount: dmg,
                    source: 'explode',
                  });
                } else {
                  events.push({
                    type: 'immune_block',
                    side,
                    lane: adj,
                    source: 'explode',
                  });
                }
              }
            });
          }
        }
      }
    });

    if (destroyedThisLoop.length > 0) {
      events.push({ type: 'destroy_cards', targets: destroyedThisLoop });

      // 報復（retaliate）スキル: 味方カードが破壊された時、同陣営の生存カードのパワーを上昇させる
      destroyedThisLoop.forEach(({ side }) => {
        const alliedBoard =
          side === 'blue' ? state.playerBoard : state.enemyBoard;
        alliedBoard.forEach((allyCard, j) => {
          if (allyCard && hasSkill(allyCard, 'retaliate')) {
            const buffVal = getSkillValue(allyCard, 'retaliate') || 2;
            allyCard.currentPower += buffVal;
            events.push({
              type: 'power_change',
              side,
              lane: j,
              amount: buffVal,
              source: 'retaliate',
            });
          }
        });
      });
    }
    tokensToSummonThisLoop.forEach((t) => {
      const tgtBoard = t.side === 'blue' ? state.playerBoard : state.enemyBoard;
      if (!tgtBoard[t.lane]) {
        tgtBoard[t.lane] = t.card;
        events.push({
          type: 'summon_token',
          side: t.side,
          lane: t.lane,
          card: JSON.parse(JSON.stringify(t.card)),
          source: 'split',
        });
      }
    });
  }
  return anyDestroyedAtAll;
}

/**
 * @param {Object} state - 状態オブジェクト
 * @returns {boolean} 墓守が発動しているか
 */
export const isGraveKeeperActive = (state) => {
  return (
    state.playerBoard.some((c) => c && hasSkill(c, 'grave_keeper')) ||
    state.enemyBoard.some((c) => c && hasSkill(c, 'grave_keeper'))
  );
};

/**
 * 配置時スキルの効果を適用する (純粋関数)
 * @param {Object} state { b, eB, pHP, eHP, pSP, eSP, ... }
 * @param {string} owner 'blue' or 'red'
 * @param {number} l lane index
 * @param {string} sid skillId
 * @param {number} val skillValue
 * @param {Array} events - オプションのイベントログ配列
 * @returns {Array} 発生したイベントログ
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
  if (!c) return events;

  switch (sid) {
    case 'choice':
      // 選択スキル自体は純粋ロジックでは解決できない（上位のシミュレーション層で展開済みのため）
      break;
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
      const sealTurns = val || 1;
      if (owner === 'blue') {
        if (state.enemySealedLanes) state.enemySealedLanes[l] = sealTurns;
      } else {
        if (state.playerSealedLanes) state.playerSealedLanes[l] = sealTurns;
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

        if (
          b[targetLane] &&
          (hasSkill(stolenCard, 'equip') ||
            hasSkill(b[targetLane], 'arm_self')) &&
          !hasSkill(b[targetLane], 'possession') &&
          !hasSkill(stolenCard, 'possession') &&
          !hasSkill(b[targetLane], 'reflect') &&
          !hasSkill(stolenCard, 'reflect')
        ) {
          const targetCard = b[targetLane];
          targetCard.basePower =
            (targetCard.basePower || 0) + (stolenCard.power || 0);
          targetCard.currentPower =
            (targetCard.currentPower || 0) + (stolenCard.power || 0);

          if (!targetCard.skills) {
            targetCard.skills =
              targetCard.skill && targetCard.skill !== 'none'
                ? [{ id: targetCard.skill, value: targetCard.skillValue }]
                : [];
            targetCard.skill = 'none';
          }
          const equipSkills = [];
          if (
            stolenCard.skill &&
            stolenCard.skill !== 'none' &&
            stolenCard.skill !== 'equip'
          ) {
            equipSkills.push({
              id: stolenCard.skill,
              value: stolenCard.skillValue,
            });
          }
          if (stolenCard.skills) {
            stolenCard.skills.forEach((s) => {
              if (s.id !== 'equip') equipSkills.push(s);
            });
          }
          mergeCardSkills(targetCard, equipSkills);

          targetCard.equippedCards = targetCard.equippedCards || [];
          targetCard.equippedCards.push(stolenCard);

          // 武装（arm_self）の消費処理
          if (
            !hasSkill(stolenCard, 'equip') &&
            hasSkill(targetCard, 'arm_self')
          ) {
            targetCard.skills = targetCard.skills.filter(
              (s) => s.id !== 'arm_self'
            );
          }

          events.push({
            type: 'summon_card',
            side: owner,
            lane: targetLane,
            card: targetCard,
            source: 'equip',
          });
        } else {
          const existingCard = b[targetLane];
          if (existingCard) {
            events.push({
              type: 'deadly',
              side: owner,
              lane: targetLane,
              source: 'overwrite',
            });
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
    case 'sublimation': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const voidCount = hand
        ? hand.filter(
            (card) =>
              card && (card.id === 'token_void' || card.baseId === 'token_void')
          ).length
        : 0;
      if (voidCount > 0) {
        const bonus = (val || 0) * voidCount;
        c.currentPower += bonus;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: bonus,
          source: 'sublimation',
        });
      }
      break;
    }
    case 'snipe_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const voidCount = hand
        ? hand.filter(
            (card) =>
              card && (card.id === 'token_void' || card.baseId === 'token_void')
          ).length
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
          if (canTakeDamage(eB[maxL], totalDmg)) {
            eB[maxL].currentPower -= totalDmg;
            events.push({
              type: 'damage_card',
              side: oppOwner,
              lane: maxL,
              amount: totalDmg,
              source: 'snipe_void',
            });
          } else {
            events.push({
              type: 'immune_block',
              side: oppOwner,
              lane: maxL,
              source: 'snipe_void',
            });
          }
        }
      }
      break;
    }
    case 'heal_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const voidCount = hand
        ? hand.filter(
            (card) =>
              card && (card.id === 'token_void' || card.baseId === 'token_void')
          ).length
        : 0;
      if (voidCount > 0) {
        const hAmt = (val || 3) * voidCount;
        if (owner === 'blue')
          state.playerHP = Math.min(state.playerMaxHP, state.playerHP + hAmt);
        else state.enemyHP = Math.min(state.enemyMaxHP, state.enemyHP + hAmt);
        events.push({
          type: 'heal_player',
          side: owner,
          amount: hAmt,
          source: 'heal_void',
        });
      }
      break;
    }
    case 'spread_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const voidCount = hand
        ? hand.filter(
            (card) =>
              card && (card.id === 'token_void' || card.baseId === 'token_void')
          ).length
        : 0;
      if (voidCount > 0) {
        const spVal = (val || 2) * voidCount;
        [l - 1, l, l + 1].forEach((j) => {
          if (j >= 0 && j < 3 && eB[j]) {
            if (canTakeDamage(eB[j], spVal)) {
              eB[j].currentPower -= spVal;
              events.push({
                type: 'damage_card',
                side: oppOwner,
                lane: j,
                amount: spVal,
                source: 'spread_void',
              });
            } else {
              events.push({
                type: 'immune_block',
                side: oppOwner,
                lane: j,
                source: 'spread_void',
              });
            }
          }
        });
      }
      break;
    }
    case 'support_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const voidCount = hand
        ? hand.filter(
            (card) =>
              card && (card.id === 'token_void' || card.baseId === 'token_void')
          ).length
        : 0;
      if (voidCount > 0) {
        const adjVal = (val || 2) * voidCount;
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
            });
          }
        });
      }
      break;
    }
    case 'support': {
      const sAdj = l === 1 ? [0, 2] : [1];
      sAdj.forEach((j) => {
        if (b[j]) {
          const adjVal = val || 2;
          b[j].currentPower += adjVal;
          events.push({
            type: 'power_change',
            side: owner,
            lane: j,
            amount: adjVal,
            source: 'support',
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
        c.currentPower += maxOtherPower;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: maxOtherPower,
          source: 'replicate',
        });
      }
      break;
    }
    case 'hero': {
      const occ = b.filter((x, idx) => x !== null && idx !== l).length;
      const hVal = occ * (val || 3);
      if (hVal > 0) {
        c.currentPower += hVal;
        events.push({
          type: 'vfx_trigger',
          vfxId: 'anm_skill_hero',
          side: owner,
          lane: l,
        });
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: hVal,
          source: 'hero',
        });
      }
      break;
    }
    case 'adversity': {
      const opOcc = eB.filter((x) => x !== null).length;
      const advVal = opOcc * (val || 1);
      if (advVal !== 0) {
        c.currentPower += advVal;
        events.push({
          type: 'vfx_trigger',
          vfxId: 'anm_skill_adversity',
          side: owner,
          lane: l,
        });
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: advVal,
          source: 'adversity',
        });
      }
      break;
    }
    case 'lone_wolf': {
      const empty = b.filter((x) => x === null).length;
      const wVal = empty * (val || 3);
      if (wVal > 0) {
        c.currentPower += wVal;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: wVal,
          source: 'lone_wolf',
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
        c.currentPower += powerDiff;
        events.push({
          type: 'power_change',
          side: owner,
          lane: l,
          amount: powerDiff,
          source: 'invade',
        });
      }
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
        const validCards = myDeckSim.filter((card) => card !== undefined);
        if (validCards.length > 0) {
          const mP = Math.max(...validCards.map((c) => c.power || 0));
          const bestCards = validCards.filter((c) => (c.power || 0) === mP);
          const bestCard =
            bestCards[Math.floor(getSeededRandom() * bestCards.length)];
          const idx = myDeckSim.findIndex(
            (card) => card.id === bestCard.id || card.baseId === bestCard.baseId
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
              skill: voidTpl.skill || 'none',
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
        eB[l].skills = eB[l].skills || [];
        if (eB[l].skill === 'growth') {
          eB[l].skillValue = (eB[l].skillValue || 0) - toxVal;
        } else {
          const exist = eB[l].skills.find((s) => s.id === 'growth');
          if (exist) {
            exist.value = (exist.value || 0) - toxVal;
          } else {
            eB[l].skills.push({ id: 'growth', value: -toxVal });
          }
        }
        events.push({
          type: 'add_skill',
          side: oppOwner,
          lane: l,
          skillId: 'growth',
          skillValue: -toxVal,
          source: 'toxic',
        });
      }
      break;
    case 'spread': {
      const spVal = val || 2;
      [l - 1, l, l + 1].forEach((j) => {
        if (j >= 0 && j < 3 && eB[j]) {
          if (canTakeDamage(eB[j], spVal)) {
            let d = spVal;
            eB[j].currentPower -= d;
            events.push({
              type: 'damage_card',
              side: oppOwner,
              lane: j,
              amount: d,
              source: 'spread',
            });
          } else {
            events.push({
              type: 'immune_block',
              side: oppOwner,
              lane: j,
              source: 'spread',
            });
          }
        }
      });
      break;
    }
    case 'bind':
      if (eB[l]) eB[l].stunTurns = (val || 1) + 1;
      break;
    case 'standby':
      c.stunTurns = (val || 1) + 1;
      break;
    case 'freeze':
      [l - 1, l, l + 1].forEach((j) => {
        if (j >= 0 && j < 3 && eB[j]) {
          eB[j].stunTurns = (val || 1) + 1;
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
        if (canTakeDamage(eB[maxL], snVal)) {
          let d = snVal;
          eB[maxL].currentPower -= d;
          events.push({
            type: 'damage_card',
            side: oppOwner,
            lane: maxL,
            amount: d,
            source: 'snipe',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: oppOwner,
            lane: maxL,
            source: 'snipe',
          });
        }
      }
      break;
    }
    case 'crush': {
      const targets = [];
      for (let j = 0; j < 3; j++) {
        if (eB[j] && (hasSkill(eB[j], 'defender') || eB[j].stunTurns > 0)) {
          if (!hasSkill(eB[j], 'immune')) {
            targets.push({ side: oppOwner, lane: j, card: eB[j] });
          }
        }
        if (b[j] && (hasSkill(b[j], 'defender') || b[j].stunTurns > 0)) {
          if (!hasSkill(b[j], 'immune')) {
            targets.push({ side: owner, lane: j, card: b[j] });
          }
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const tr = targets[i];
        tr.card.currentPower = 0;
        if (tr.side === oppOwner) {
          eB[tr.lane] = null;
        } else {
          b[tr.lane] = null;
        }
      }
      if (targets.length > 0 && events) {
        events.push({
          type: 'destroy_cards',
          targets: targets,
        });
      }
      break;
    }
    case 'treason': {
      // お互いの場の「伝説」を持つカードを全て破壊する
      const targets = [];
      for (let j = 0; j < 3; j++) {
        if (eB[j] && hasSkill(eB[j], 'legendary')) {
          if (!hasSkill(eB[j], 'immune')) {
            targets.push({ side: oppOwner, lane: j, card: eB[j] });
          }
        }
        if (b[j] && hasSkill(b[j], 'legendary')) {
          if (!hasSkill(b[j], 'immune')) {
            targets.push({ side: owner, lane: j, card: b[j] });
          }
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const tr = targets[i];
        tr.card.currentPower = 0;
        if (tr.side === oppOwner) {
          eB[tr.lane] = null;
        } else {
          b[tr.lane] = null;
        }
      }
      if (targets.length > 0 && events) {
        events.push({
          type: 'destroy_cards',
          targets: targets,
        });
      }
      break;
    }
    case 'dispel': {
      const targets = [];
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
        const isImmune = hasSkill(tgt, 'immune');

        if (tr.isHost) {
          let totalLoss = tgt.equippedCards.reduce(
            (sum, eq) => sum + (eq.power || 0),
            0
          );
          for (const eqC of tgt.equippedCards) {
            const equipSkills = [];
            if (eqC.skill && eqC.skill !== 'none' && eqC.skill !== 'equip') {
              equipSkills.push({ id: eqC.skill, value: eqC.skillValue });
            }
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

        if (tr.isSelf) {
          if (!isImmune) {
            tgt.currentPower = 0;
          }
        }

        if (tgt.currentPower <= 0) {
          if (!isImmune) {
            killTargets.push({ side: tr.side, lane: tr.lane, card: tgt });
            if (tr.side === oppOwner) {
              eB[tr.lane] = null;
            } else {
              b[tr.lane] = null;
            }
          }
        }
      }

      if (killTargets.length > 0 && events) {
        events.push({
          type: 'destroy_cards',
          targets: killTargets,
        });
      }
      break;
    }
    case 'berserk': {
      const bVal = val || 2;
      const bAdj = l === 1 ? [0, 2] : [1];
      bAdj.forEach((j) => {
        if (b[j]) {
          if (canTakeDamage(b[j], bVal)) {
            b[j].currentPower -= bVal;
            events.push({
              type: 'damage_card',
              side: owner,
              lane: j,
              amount: bVal,
              source: 'berserk',
            });
          } else {
            events.push({
              type: 'immune_block',
              side: owner,
              lane: j,
              source: 'berserk',
            });
          }
        }
      });
      break;
    }
    case 'heal': {
      const hAmt = val || 3;
      if (owner === 'blue')
        state.playerHP = Math.min(state.playerMaxHP, state.playerHP + hAmt);
      else state.enemyHP = Math.min(state.enemyMaxHP, state.enemyHP + hAmt);
      events.push({ type: 'heal_player', side: owner, amount: hAmt });
      break;
    }
    case 'sacrifice': {
      events.push({
        type: 'vfx_trigger',
        vfxId: 'anm_skill_sacrifice',
        side: owner,
        lane: l, // 必須プロパティとして一応設定
      });

      const sacAmt = val || 3;
      if (owner === 'blue') state.playerHP -= sacAmt;
      else state.enemyHP -= sacAmt;
      events.push({
        type: 'damage_player',
        side: owner,
        amount: sacAmt,
        source: 'sacrifice',
      });
      break;
    }
    case 'sacrifice_void': {
      const hand = owner === 'blue' ? state.playerHand : state.enemyHand;
      const voidCount = hand
        ? hand.filter(
            (card) =>
              card && (card.id === 'token_void' || card.baseId === 'token_void')
          ).length
        : 0;
      if (voidCount > 0) {
        events.push({
          type: 'vfx_trigger',
          vfxId: 'anm_skill_sacrifice',
          side: owner,
          lane: l,
        });

        const sacAmt = (val || 1) * voidCount;
        if (owner === 'blue') state.playerHP -= sacAmt;
        else state.enemyHP -= sacAmt;
        events.push({
          type: 'damage_player',
          side: owner,
          amount: sacAmt,
          source: 'sacrifice_void',
        });
      }
      break;
    }
    case 'artillery': {
      // 砲撃：相手リーダーに直接ダメージ
      const artAmt = val || 3;
      if (owner === 'blue') state.enemyHP -= artAmt;
      else state.playerHP -= artAmt;
      events.push({
        type: 'damage_player',
        side: oppOwner,
        amount: artAmt,
        source: 'artillery',
      });
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
        if (owner === 'blue') state.enemyHP -= decreeDmg;
        else state.playerHP -= decreeDmg;
        events.push({
          type: 'damage_player',
          side: oppOwner,
          amount: decreeDmg,
          source: 'decree',
        });
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
    case 'summon': {
      // 【重要仕様】「召喚 X」において X (val) はトークンのパワーを指す。
      // 個数は常に 1体 であるため、ループは 1回 固定。
      const summonTargetPower = val || 1;
      let tIdEngine = null;
      let tNameEngine = null;

      // カード本体またはスキルから召喚IDを取得
      const skillForSummonId = c.skills?.find(
        (s) =>
          (s.id === 'summon' || s.id === 'awake' || s.id === 'split') &&
          s.summonId
      );
      tIdEngine = c.summonId || skillForSummonId?.summonId;

      if (!tIdEngine) {
        const engineCId = c.baseId || c.id;
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
          const sealedLanes =
            owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;
          const emptyLanes = [0, 2, 1].filter(
            (j) => b[j] === null && (!sealedLanes || sealedLanes[j] === 0)
          );
          if (emptyLanes.length > 0) {
            targetLane = emptyLanes[0];
          } else {
            const validOccupiedLanes = [0, 2, 1].filter(
              (j) => !sealedLanes || sealedLanes[j] === 0
            );
            if (validOccupiedLanes.length > 0)
              targetLane = validOccupiedLanes[0];
          }
        }

        if (targetLane !== -1) {
          const newToken = {
            ...sTC,
            id: `sm_sim_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
            baseId: tIdEngine,
            owner,
            isPremium: c.isPremium,
            imgUrl: `assets/cards/card_${tIdEngine}.jpg`,
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
            'summon',
            events
          );
        }
      }
      break;
    }
    case 'awake': {
      // 覚醒: 同レーンにトークンを配置し、元のカードを墓地へ送る（変身/置換）
      const awakeVal = val || 1;
      let awakeTid = null;
      const awakeSkill =
        c.skills?.find((s) => s.id === 'awake') ||
        (c.skill === 'awake'
          ? { id: 'awake', value: c.skillValue, summonId: c.summonId }
          : null);
      awakeTid = awakeSkill?.summonId || 'token_dragon';

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
        imgUrl: `assets/cards/card_${awakeTid}.jpg`,
        skills: [], // トークンは能力を持たない
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
        source: 'awake',
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
        const sealedLanes =
          owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;
        const emptyLanesRes = [0, 2, 1].filter(
          (j) => b[j] === null && (!sealedLanes || sealedLanes[j] === 0)
        );
        if (emptyLanesRes.length > 0) {
          targetLaneRes = emptyLanesRes[0];
        } else {
          const validOccupiedLanes = [0, 2, 1].filter(
            (j) => !sealedLanes || sealedLanes[j] === 0
          );
          if (validOccupiedLanes.length > 0)
            targetLaneRes = validOccupiedLanes[0];
        }
      }

      if (targetLaneRes !== -1) {
        const existingCard = b[targetLaneRes];
        const unionSkill =
          simResCard.skills && simResCard.skills.find((s) => s.id === 'union');
        const isUnion =
          unionSkill &&
          existingCard &&
          (existingCard.baseId === unionSkill.targetId ||
            existingCard.id === unionSkill.targetId);

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
            // 装備（既存カードの上へ）
            existingCard.power =
              (existingCard.power || 0) + (simResCard.power || 0);
            existingCard.basePower =
              (existingCard.basePower || 0) + (simResCard.power || 0);
            existingCard.currentPower =
              (existingCard.currentPower || 0) + (simResCard.power || 0);

            const equipSkills = [];
            if (
              simResCard.skill &&
              simResCard.skill !== 'none' &&
              simResCard.skill !== 'equip'
            ) {
              equipSkills.push({
                id: simResCard.skill,
                value: simResCard.skillValue,
              });
            }
            if (Array.isArray(simResCard.skills)) {
              simResCard.skills.forEach((s) => {
                if (s.id !== 'equip') equipSkills.push(s);
              });
            }
            mergeCardSkills(existingCard, equipSkills);

            // 武装（arm_self）の消費処理
            if (
              !hasSkill(simResCard, 'equip') &&
              hasSkill(existingCard, 'arm_self')
            ) {
              existingCard.skills = existingCard.skills.filter(
                (s) => s.id !== 'arm_self'
              );
            }
            events.push({
              type: 'power_change',
              side: owner,
              lane: targetLaneRes,
              amount: simResCard.power,
              source: 'equip',
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
        const sealedLanes =
          owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;
        const emptyLanesPuppet = [0, 2, 1].filter(
          (j) => b[j] === null && (!sealedLanes || sealedLanes[j] === 0)
        );
        if (emptyLanesPuppet.length > 0) {
          targetLanePuppet = emptyLanesPuppet[0];
        } else {
          const validOccupied = [0, 2, 1].filter(
            (j) => !sealedLanes || sealedLanes[j] === 0
          );
          if (validOccupied.length > 0) targetLanePuppet = validOccupied[0];
        }
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
      let inheritedSkills = [];
      if (c.skill) {
        const inherited = { id: c.skill, value: c.skillValue };
        if (c.summonId) inherited.summonId = c.summonId;
        if (c.targetId) inherited.targetId = c.targetId;
        inheritedSkills.push(inherited);
      }
      if (Array.isArray(c.skills)) {
        inheritedSkills = inheritedSkills.concat(c.skills);
      }

      for (let i = 0; i < cloneCount; i++) {
        let targetLane = -1;
        if (simulatedLane !== undefined && simulatedLane !== -1) {
          targetLane = simulatedLane;
        } else if (simulatedTokenLanes && simulatedTokenLanes.length > 0) {
          targetLane = simulatedTokenLanes.shift();
        } else if (Array.isArray(simulatedTokenLanes)) {
          targetLane = -1;
        } else {
          const sealedLanes =
            owner === 'blue' ? state.playerSealedLanes : state.enemySealedLanes;
          // 分身スキルの調整：元のレーン l の隣接レーンのみを対象とする
          const adjacentLanes = l === 1 ? [0, 2] : [1];
          const emptyLanes = adjacentLanes.filter(
            (j) => b[j] === null && (!sealedLanes || sealedLanes[j] === 0)
          );
          if (emptyLanes.length > 0) {
            targetLane = emptyLanes[0];
          } else {
            const validOccupiedLanes = adjacentLanes.filter(
              (j) => !sealedLanes || sealedLanes[j] === 0
            );
            if (validOccupiedLanes.length > 0)
              targetLane = validOccupiedLanes[0];
          }
        }

        if (targetLane !== -1) {
          const existingCard = b[targetLane];
          const inheritedUnionSkill = inheritedSkills.find(
            (sk) => sk.id === 'union'
          );
          const isUnion =
            inheritedUnionSkill &&
            existingCard &&
            (existingCard.baseId === inheritedUnionSkill.targetId ||
              existingCard.id === inheritedUnionSkill.targetId);

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
        events.push({
          type: 'vfx_trigger',
          vfxId: 'anm_skill_petrify',
          side: owner, // 発動者（自分）を基準にする。vfx.js側の 'targetSide: enemy' によって相手側のレーンに描画される
          lane: l,
        });
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
        events.push({
          type: 'petrify',
          side: oppOwner,
          lane: l,
          card: JSON.parse(JSON.stringify(statueToken)),
          source: 'petrify',
        });
      }
      break;
    case 'reinforce': {
      // AIシミュレーション用: 手札の枚数が十分ある前提で最大数捨てるとしてトークンを手札に加える
      const h = owner === 'blue' ? state.playerHand : state.enemyHand;
      const actualReinforceCount = Math.min(val || 1, h.length);

      if (actualReinforceCount > 0 && h.length > 0) {
        const dropIndices = getAIDiscardIndices(h, actualReinforceCount);
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
    case 'invincible':
      if (!Array.isArray(c.skills))
        c.skills = [{ id: 'invincible', value: val || 1 }];
      else c.skills.push({ id: 'invincible', value: val || 1 });
      events.push({
        type: 'add_skill',
        side: owner,
        lane: l,
        skillId: 'invincible',
        value: val || 1,
        source: sid,
      });
      break;
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
      // 【選別】相手の場で最もパワーの低いカード1枚を破壊（墓地送り）
      const occupiedLanes = eB
        .map((bc, i) => (bc !== null ? i : -1))
        .filter((i) => i !== -1 && !hasSkill(eB[i], 'immune'));
      if (occupiedLanes.length > 0) {
        // パワー昇順ソート（最小パワーを選択）
        occupiedLanes.sort((a, b) => {
          const diff = (eB[a].currentPower || 0) - (eB[b].currentPower || 0);
          if (diff !== 0) return diff;
          return a - b;
        });
        const targetLane = occupiedLanes[0];
        const targetCard = eB[targetLane];
        if (targetCard) {
          const oppDiscard =
            oppOwner === 'red' ? state.enemyDiscard : state.playerDiscard;
          oppDiscard.push(targetCard);
          eB[targetLane] = null;
          events.push({
            type: 'destroy_cards',
            targets: [{ side: oppOwner, lane: targetLane, card: targetCard }],
          });
        }
      }
      break;
    }
    case 'execute': {
      // 【処刑】自分の場で最もパワーの低いカード1枚を破壊（墓地送り）
      const myOccupiedLanes = b
        .map((bc, i) => (bc !== null ? i : -1))
        .filter((i) => i !== -1 && !hasSkill(b[i], 'immune'));
      if (myOccupiedLanes.length > 0) {
        // パワー昇順ソート（最小パワーを選択して損失を最小化）
        myOccupiedLanes.sort((a, ab) => {
          const diff = (b[a].currentPower || 0) - (b[ab].currentPower || 0);
          if (diff !== 0) return diff;
          return a - ab;
        });
        const execLane = myOccupiedLanes[0];
        const execCard = b[execLane];
        if (execCard) {
          const myDiscard =
            owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
          myDiscard.push(execCard);
          b[execLane] = null;
          events.push({
            type: 'destroy_cards',
            targets: [{ side: owner, lane: execLane, card: execCard }],
          });
        }
      }
      break;
    }
  }

  processDestructionTriggers(state, events);
  return events;
}

/**
 * リーダースキルの効果を適用する (純粋関数)
 * @returns {Array} events
 */
/**
 * 盤面への装備（武装）を試み、成功した場合はtrueを返すヘルパー
 */
function tryEquipToken(board, lane, newToken, owner, events) {
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
      boardCard.power = (boardCard.power || 0) + (newToken.currentPower || 0);
      boardCard.basePower =
        (boardCard.basePower || 0) + (newToken.currentPower || 0);
      boardCard.currentPower =
        (boardCard.currentPower || 0) + (newToken.currentPower || 0);
      boardCard.equippedCards = boardCard.equippedCards || [];
      boardCard.equippedCards.push(newToken);

      // 武装（arm_self）の消費処理
      if (!hasSkill(newToken, 'equip') && hasSkill(boardCard, 'arm_self')) {
        boardCard.skills = boardCard.skills.filter((s) => s.id !== 'arm_self');
      }
      let addedSkills = [];
      if (
        newToken.skill &&
        newToken.skill !== 'none' &&
        newToken.skill !== 'equip'
      )
        addedSkills.push({ id: newToken.skill, value: newToken.skillValue });
      if (newToken.skills)
        newToken.skills.forEach((s) => {
          if (s.id !== 'equip') addedSkills.push({ id: s.id, value: s.value });
        });
      mergeCardSkills(boardCard, addedSkills);
      events.push({
        type: 'equip_card',
        side: owner,
        lane: lane,
        card: JSON.parse(JSON.stringify(newToken)),
      });
      return true;
    }
  }
  return false;
}

export function applyLeaderSkillLogic(
  state,
  owner,
  action,
  tokenLanes = null,
  events = [],
  forcedTargetIdx = null
) {
  const isBlue = owner === 'blue';
  const board = isBlue ? state.playerBoard : state.enemyBoard;
  const eBoard = isBlue ? state.enemyBoard : state.playerBoard;
  const oppOwner = isBlue ? 'red' : 'blue';

  if (action === 'void_purge') {
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
    const oppCards = [...oppHand];
    oppHand.length = 0;
    for (const card of oppCards) {
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
        targetCard.power = (targetCard.power || 0) + (selectedCard.power || 0);
        targetCard.basePower =
          (targetCard.basePower || 0) + (selectedCard.power || 0);
        targetCard.currentPower =
          (targetCard.currentPower || 0) + (selectedCard.power || 0);

        if (!targetCard.skills) {
          targetCard.skills =
            targetCard.skill && targetCard.skill !== 'none'
              ? [{ id: targetCard.skill, value: targetCard.skillValue }]
              : [];
          targetCard.skill = 'none';
        }
        const equipSkills = [];
        if (
          selectedCard.skill &&
          selectedCard.skill !== 'none' &&
          selectedCard.skill !== 'equip'
        ) {
          equipSkills.push({
            id: selectedCard.skill,
            value: selectedCard.skillValue,
          });
        }
        if (selectedCard.skills) {
          selectedCard.skills.forEach((s) => {
            if (s.id !== 'equip') equipSkills.push(s);
          });
        }
        mergeCardSkills(targetCard, equipSkills);
        targetCard.equippedCards = targetCard.equippedCards || [];
        targetCard.equippedCards.push(selectedCard);

        // 武装（arm_self）の消費処理
        if (
          !hasSkill(selectedCard, 'equip') &&
          hasSkill(targetCard, 'arm_self')
        ) {
          targetCard.skills = targetCard.skills.filter(
            (s) => s.id !== 'arm_self'
          );
        }

        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(targetCard)),
          source: 'equip',
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
      // Apply Seal
      if (isBlue) {
        if (state.enemySealedLanes) state.enemySealedLanes[lane] = 1;
      } else {
        if (state.playerSealedLanes) state.playerSealedLanes[lane] = 1;
      }

      // Damage card if exists
      if (eBoard[lane] !== null) {
        if (canTakeDamage(eBoard[lane], 4)) {
          eBoard[lane].currentPower -= 4;
          events.push({
            type: 'damage_card',
            side: oppOwner,
            lane: lane,
            amount: 4,
            source: 'seal_lanes',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: oppOwner,
            lane: lane,
            source: 'seal_lanes',
          });
        }
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
      // Apply Seal
      if (isBlue) {
        if (state.enemySealedLanes) state.enemySealedLanes[lane] = 1;
      } else {
        if (state.playerSealedLanes) state.playerSealedLanes[lane] = 1;
      }

      // Damage card if exists
      if (eBoard[lane] !== null) {
        if (canTakeDamage(eBoard[lane], 4)) {
          eBoard[lane].currentPower -= 4;
          events.push({
            type: 'damage_card',
            side: oppOwner,
            lane: lane,
            amount: 4,
            source: 'night_parade',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: oppOwner,
            lane: lane,
            source: 'night_parade',
          });
        }
      }
    }
    // ※ processDestructionTriggers は呼び出し元 (leaderSkills.js) 側で一括実行する
    //    ここで呼ぶとイベントが二重になるため削除

    // Summon Hitodamas
    let allyTargets = [];
    const mySealedLanes = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;

    if (tokenLanes && tokenLanes.allied) {
      allyTargets = [...tokenLanes.allied].slice(0, 1);
    } else {
      // AI Selection Logic for Allied
      let availableLanes = [0, 2, 1].filter(
        (i) => !mySealedLanes || mySealedLanes[i] === 0
      );
      let emptyLanes = availableLanes.filter((i) => board[i] === null);
      let occupiedLanes = availableLanes
        .filter((i) => board[i] !== null)
        .sort(
          (a, b) =>
            (board[a]?.currentPower || 0) - (board[b]?.currentPower || 0)
        );

      allyTargets = [...emptyLanes];
      if (allyTargets.length < 1) {
        allyTargets = allyTargets.concat(
          occupiedLanes.slice(0, 1 - allyTargets.length)
        );
      }
      allyTargets = allyTargets.slice(0, 1);
    }

    const tM = CARD_MASTER.find((m) => m.id === 'token_soul') || {
      name: '人魂',
      power: 1,
    };
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

      if (!tryEquipToken(board, lane, newToken, owner, events)) {
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
        if (canTakeDamage(eBoard[i], 4)) {
          eBoard[i].currentPower -= 4;
          events.push({
            type: 'damage_card',
            side: oppOwner,
            lane: i,
            amount: 4,
            source: 'annihilation',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: oppOwner,
            lane: i,
            source: 'annihilation',
          });
        }
      }
    }
  } else if (action === 'android_high_volley') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    // 敵の場のすべてのカードに4ダメージ
    for (let i = 0; i < 3; i++) {
      if (eBoard[i]) {
        if (canTakeDamage(eBoard[i], 4)) {
          eBoard[i].currentPower -= 4;
          events.push({
            type: 'damage_card',
            side: oppOwner,
            lane: i,
            amount: 4,
            source: 'android_high_volley',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: oppOwner,
            lane: i,
            source: 'android_high_volley',
          });
        }
      }
    }
    // 敵リーダーに2ダメージ
    if (isBlue) {
      state.enemyHP -= 2;
      if (state.enemyHP < 0) state.enemyHP = 0;
    } else {
      state.playerHP -= 2;
      if (state.playerHP < 0) state.playerHP = 0;
    }
    events.push({
      type: 'damage_player',
      side: oppOwner,
      amount: 2,
      source: 'android_high_volley',
    });
  } else if (action === 'dragon_high_ritual') {
    // ===== 龍神演義 =====
    // 効果①：場のすべてのカード（両陣営）に2ダメージ（免疫は無効）
    events.push({ type: 'leader_skill', skill: action, side: owner });
    for (let i = 0; i < 3; i++) {
      // 自分の場のカードにも2ダメージ
      if (board[i]) {
        if (canTakeDamage(board[i], 2)) {
          board[i].currentPower -= 2;
          events.push({
            type: 'damage_card',
            side: owner,
            lane: i,
            amount: 2,
            source: 'dragon_high_ritual',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: owner,
            lane: i,
            source: 'dragon_high_ritual',
          });
        }
      }
      // 相手の場のカードにも2ダメージ
      if (eBoard[i]) {
        if (canTakeDamage(eBoard[i], 2)) {
          eBoard[i].currentPower -= 2;
          events.push({
            type: 'damage_card',
            side: oppOwner,
            lane: i,
            amount: 2,
            source: 'dragon_high_ritual',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: oppOwner,
            lane: i,
            source: 'dragon_high_ritual',
          });
        }
      }
    }
    processDestructionTriggers(state, events);

    // 効果②：自分のレーンにイグニストークン(P:7/伝説)を「配置」（制約チェックなし）
    let dragonRitualLane = -1;
    if (tokenLanes && tokenLanes.length > 0) {
      dragonRitualLane = tokenLanes[0];
    } else {
      const sealedLanes = isBlue
        ? state.playerSealedLanes
        : state.enemySealedLanes;
      const emptyLanes = [0, 2, 1].filter(
        (i) => board[i] === null && (!sealedLanes || sealedLanes[i] === 0)
      );
      if (emptyLanes.length > 0) dragonRitualLane = emptyLanes[0];
    }
    if (dragonRitualLane !== -1) {
      const tM = CARD_MASTER.find((m) => m.id === 'token_ignis');
      if (tM) {
        const newToken = {
          ...JSON.parse(JSON.stringify(tM)),
          id: `tk_dr_${Math.floor(getSeededRandom() * 1000000000)}`,
          owner,
          currentPower: 7,
          rarity: tM.rarity || 1,
          // imgUrl は getCardImgUrl がスキンを参照して解決する
        };
        if (!tryEquipToken(board, dragonRitualLane, newToken, owner, events)) {
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

    // 指定レーンがあれば優先し、なければ空いている且つ封印されていないレーンへ
    let targetLanes = [];
    if (tokenLanes && tokenLanes.length > 0) {
      targetLanes = tokenLanes.slice(0, 2);
    } else {
      const emptyValidLanes = availableLanes.filter((i) => board[i] === null);
      targetLanes = emptyValidLanes.slice(0, 2);
      // Capped at 2. If 0 or 1 empty, it just returns that amount.
      // If less than 2 empty lanes, we don't force overwrite for '配置' unless requested, but here we place directly.
    }

    const tM = CARD_MASTER.find((m) => m.id === 'token_knight') || {
      name: '騎士',
      power: 2,
    };

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

      if (!tryEquipToken(board, lane, newToken, owner, events)) {
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
    for (let i = 0; i < 3; i++) {
      if (board[i] !== null) {
        // パワーアップ
        board[i].currentPower += 2;
        events.push({
          type: 'power_change',
          side: owner,
          lane: i,
          amount: 2,
          source: 'evil_march',
        });
      }
    }
  } else if (action === 'otherworld_gate') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const h = isBlue ? state.playerHand : state.enemyHand;
    const opH = isBlue ? state.enemyHand : state.playerHand;

    // 1. 最大2枚捨てる（共通のAI手札選択ロジックを使用）
    let dc = 0;
    if (h.length > 0) {
      const dropIndices = getAIDiscardIndices(h, 2);
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
          owner: oppOwner,
          baseId: 'token_void',
          isToken: true,
          currentPower: voidTpl.power || 1,
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

      if (!hasSkill(eBoard[targetLane], 'immune')) {
        eBoard[targetLane].currentPower = 0;
        events.push({
          type: 'deadly',
          side: oppOwner,
          lane: targetLane,
          source: 'targeted_destruction',
        });
      } else {
        events.push({
          type: 'immune_block',
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
      // 配置レーンの決定
      const mySealedLanes = isBlue
        ? state.playerSealedLanes
        : state.enemySealedLanes;
      let emptyLanes = [];
      let possibleLanes = [];
      for (let i = 0; i < 3; i++) {
        if (!mySealedLanes || mySealedLanes[i] === 0) {
          possibleLanes.push(i);
          if (!board[i]) emptyLanes.push(i);
        }
      }
      if (emptyLanes.length > 0) {
        myLane = emptyLanes[0];
      } else if (possibleLanes.length > 0) {
        // 上書き：もっともパワーの低いレーンを選択
        possibleLanes.sort(
          (a, b) =>
            (board[a]?.currentPower || 0) - (board[b]?.currentPower || 0)
        );
        myLane = possibleLanes[0];
      }
    }

    if (targetLane !== -1 || myLane !== -1) {
      const decision = { type: 'elf_polarbear_combo', targetLane, myLane };
      if (!state._actionQueue) state._actionQueue = [];
      state._actionQueue.push(decision);
    }

    // パート1: 相手のカードの破壊（選ばれた場合のみ）
    if (targetLane !== -1 && eBoard[targetLane] !== null) {
      if (!hasSkill(eBoard[targetLane], 'immune')) {
        eBoard[targetLane].currentPower = 0;
        events.push({
          type: 'deadly',
          side: oppOwner,
          lane: targetLane,
          source: 'elf_polarbear_combo',
        });
      } else {
        events.push({
          type: 'immune_block',
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
      // 既存のカードがあれば墓地へ送る（上書き許可）
      if (board[myLane] !== null) {
        quietDiscardFromBoard(state, owner, myLane);
      }
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
      board[myLane] = bearCard;
      events.push({
        type: 'summon_card',
        side: owner,
        lane: myLane,
        card: bearCard,
        source: 'elf_polarbear_combo',
      });
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
        if (!canTakeDamage(targetCard, 4)) {
          events.push({
            type: 'immune_block',
            side: oppOwner,
            lane: targetLane,
            source: 'tomb_guard',
          });
        } else {
          targetCard.currentPower -= 4;
          events.push({
            type: 'damage_card',
            side: oppOwner,
            lane: targetLane,
            amount: 4,
            source: 'tomb_guard',
          });
          // ここではHPが0以下になってもそのままにしておく（呼び出し元の cleanupDestroyedCards 等で処理される）
        }
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
        if (!canTakeDamage(targetCard, DEATH_JUDGMENT_DAMAGE)) {
          events.push({
            type: 'immune_block',
            side: oppOwner,
            lane: targetLane,
            source: 'death_judgment',
          });
        } else {
          targetCard.currentPower -= DEATH_JUDGMENT_DAMAGE;
          events.push({
            type: 'damage_card',
            side: oppOwner,
            lane: targetLane,
            amount: DEATH_JUDGMENT_DAMAGE,
            source: 'death_judgment',
          });
        }
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
      } else {
        const sealedLanes = isBlue
          ? state.playerSealedLanes
          : state.enemySealedLanes;
        const emptyLanes = [0, 2, 1].filter(
          (i) => board[i] === null && (!sealedLanes || sealedLanes[i] === 0)
        );
        if (emptyLanes.length > 0) l = emptyLanes[0];
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
          (existingCard.baseId === unionSkill.targetId ||
            existingCard.id === unionSkill.targetId);
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
          // 装備（既存カードの上へ）
          existingCard.power =
            (existingCard.power || 0) + (selectedCard.power || 0);
          existingCard.basePower =
            (existingCard.basePower || 0) + (selectedCard.power || 0);
          existingCard.currentPower =
            (existingCard.currentPower || 0) + (selectedCard.power || 0);

          const equipSkills = [];
          if (
            selectedCard.skill &&
            selectedCard.skill !== 'none' &&
            selectedCard.skill !== 'equip'
          ) {
            equipSkills.push({
              id: selectedCard.skill,
              value: selectedCard.skillValue,
            });
          }
          if (selectedCard.skills) {
            selectedCard.skills.forEach((s) => {
              if (s.id !== 'equip') equipSkills.push(s);
            });
          }
          mergeCardSkills(existingCard, equipSkills);

          existingCard.equippedCards = existingCard.equippedCards || [];
          existingCard.equippedCards.push(selectedCard);

          // 武装（arm_self）の消費処理
          if (
            !hasSkill(selectedCard, 'equip') &&
            hasSkill(existingCard, 'arm_self')
          ) {
            existingCard.skills = existingCard.skills.filter(
              (s) => s.id !== 'arm_self'
            );
          }

          events.push({
            type: 'power_change',
            side: owner,
            lane: l,
            amount: selectedCard.power,
            source: 'equip',
          });
        } else {
          if (existingCard) {
            const simDiscard =
              owner === 'blue' ? state.playerDiscard : state.enemyDiscard;
            simDiscard.push(existingCard);
          }
          const resurrectedCard = {
            ...selectedCard,
            id: `res_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
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
    const sealedLanes = isBlue
      ? state.playerSealedLanes
      : state.enemySealedLanes;

    const placeFromDiscard = (discard, laneIdx) => {
      const validCards = discard.filter((c) => c && !c.isToken);
      if (validCards.length === 0 || laneIdx === -1) return;
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
    };

    // 自分の墓地 → tokenLanes[0] (forcedTargetIdx が指定されている場合はその優先)
    let lane1 = tokenLanes && tokenLanes.length > 0 ? tokenLanes[0] : -1;
    if (lane1 === -1) {
      const emptyLanes = [0, 2, 1].filter(
        (i) => board[i] === null && (!sealedLanes || sealedLanes[i] === 0)
      );
      lane1 = emptyLanes.length > 0 ? emptyLanes[0] : 0;
    }
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
      myDiscard.splice(forcedTargetIdx, 1);
    } else {
      placeFromDiscard(myDiscard, lane1);
    }

    // 相手の墓地 → tokenLanes[1]
    let lane2 = tokenLanes && tokenLanes.length > 1 ? tokenLanes[1] : -1;
    if (lane2 === -1) {
      const emptyLanes = [0, 2, 1].filter(
        (i) =>
          board[i] === null &&
          (!sealedLanes || sealedLanes[i] === 0) &&
          i !== lane1
      );
      lane2 = emptyLanes.length > 0 ? emptyLanes[0] : lane1 !== 0 ? 0 : 1;
    }
    placeFromDiscard(oppDiscard, lane2);
  } else if (
    action === 'satan_avatar' ||
    action === 'dragon_summon' ||
    action === 'dungeon_summon_leader'
  ) {
    let power = 5;
    if (action === 'satan_avatar') power = 10;
    else if (action === 'dragon_summon') power = 7;
    else if (action === 'dungeon_summon_leader') power = 6; // 一般的なリーダーを想定した強めの仮パワー設定

    let l = -1;
    if (tokenLanes && tokenLanes.length > 0) {
      l = tokenLanes[0];
    } else {
      const sealedLanes = isBlue
        ? state.playerSealedLanes
        : state.enemySealedLanes;
      const emptyLanes = [0, 2, 1].filter(
        (i) => board[i] === null && (!sealedLanes || sealedLanes[i] === 0)
      );
      if (emptyLanes.length > 0) l = emptyLanes[0];
    }

    if (l !== -1) {
      events.push({ type: 'leader_skill', skill: action, side: owner });
      const tM = CARD_MASTER.find(
        (m) =>
          m.id === (action === 'satan_avatar' ? 'token_satan' : 'token_ignis')
      );
      const newToken = {
        ...JSON.parse(JSON.stringify(tM)),
        id: `tk_${Math.floor(getSeededRandom() * 1000000000)}`,
        owner,
        currentPower: power,
        rarity: tM.rarity || 1,
      };
      // satan_avatarのみimgUrlを固定設定；dragon系はgetCardImgUrlがスキンを参照して解決する
      if (action === 'satan_avatar')
        newToken.imgUrl = 'assets/cards/card_token_satan.jpg';

      if (!tryEquipToken(board, l, newToken, owner, events)) {
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
    }
  } else if (action === 'holy_march') {
    // 騎士召喚（最大2体）
    events.push({ type: 'leader_skill', skill: action, side: owner });
    let count = 0;
    const addKnight = (lane) => {
      const tK = CARD_MASTER.find((m) => m.id === 'token_knight');
      const tk = {
        ...JSON.parse(JSON.stringify(tK)),
        id: `tk_k_${Math.floor(getSeededRandom() * 1000000000)}_${lane}`,
        owner,
        currentPower: tK.power,
        rarity: tK.rarity || 1,
        imgUrl: 'assets/cards/card_token_knight.jpg',
      };
      board[lane] = tk;
      // 後続のループで tk自身が +2 されるため、イベントに積むcardは追加時点のものをディープコピーしておく
      events.push({
        type: 'summon_token',
        side: owner,
        lane,
        card: JSON.parse(JSON.stringify(tk)),
        source: 'holy_march',
      });
      count++;
    };

    if (tokenLanes !== null) {
      for (let l of tokenLanes) {
        const tK = CARD_MASTER.find((m) => m.id === 'token_knight');
        const tk = {
          ...JSON.parse(JSON.stringify(tK)),
          id: `tk_k_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
          owner,
          currentPower: tK.power,
          rarity: tK.rarity || 1,
          imgUrl: 'assets/cards/card_token_knight.jpg',
          isToken: true,
        };

        if (!tryEquipToken(board, l, tk, owner, events)) {
          if (board[l] !== null) {
            quietDiscardFromBoard(state, owner, l);
          }
          board[l] = tk;
          events.push({
            type: 'summon_token',
            side: owner,
            lane: l,
            card: JSON.parse(JSON.stringify(tk)),
            source: 'holy_march',
          });
        }
        count++;
      }
    } else {
      const sealedLanes = isBlue
        ? state.playerSealedLanes
        : state.enemySealedLanes;
      for (let i = 0; i < 3 && count < 2; i++) {
        if (board[i] === null && (!sealedLanes || sealedLanes[i] === 0))
          addKnight(i);
      }
    }
    // 全体バフ+2
    for (let i = 0; i < 3; i++) {
      if (board[i]) {
        board[i].currentPower += 2;
        board[i].power += 2;
        events.push({
          type: 'power_change',
          side: owner,
          lane: i,
          amount: 2,
          source: 'holy_march',
        });
      }
    }
  } else if (action === 'god_flame') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const d = 3;
    if (isBlue) {
      state.enemyHP -= d;
      state.playerHP = Math.min(state.playerMaxHP, state.playerHP + d);
    } else {
      state.playerHP -= d;
      state.enemyHP = Math.min(state.enemyMaxHP, state.enemyHP + d);
    }
    events.push({
      type: 'damage_player',
      side: oppOwner,
      amount: d,
      source: 'god_flame',
    });
    events.push({
      type: 'heal_player',
      side: owner,
      amount: d,
      source: 'god_flame',
    });
  } else if (action === 'condemnation') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const d = 5;
    if (isBlue) {
      state.enemyHP -= d;
      state.playerHP = Math.min(state.playerMaxHP, state.playerHP + d);
    } else {
      state.playerHP -= d;
      state.enemyHP = Math.min(state.enemyMaxHP, state.enemyHP + d);
    }
    events.push({
      type: 'damage_player',
      side: oppOwner,
      amount: d,
      source: 'condemnation',
    });
    events.push({
      type: 'heal_player',
      side: owner,
      amount: d,
      source: 'condemnation',
    });
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
  }

  processDestructionTriggers(state, events);
  return events;
}

/**
 * 戦闘フェーズの計算 (純粋関数)
 * @param {Object} state
 * @param {string} attackerSide 'blue' or 'red'
 * @param {Array} events - オプションのイベントログ配列
 * @returns {Array} 発生したイベントログ
 */
export function calculateCombatPhase(state, attackerSide, events = []) {
  for (let l = 0; l < 3; l++) {
    if (state.playerHP <= 0 || state.enemyHP <= 0) break;
    applySingleCombat(state, attackerSide, l, events);
  }
  processDestructionTriggers(state, events);
  return events;
}

/**
 * 指定した1レーンのみの戦闘計算（Quick等のシミュレーション用）
 * @returns {Array} events
 */
export function applySingleCombat(state, attackerSide, l, events = []) {
  const atkBoard =
    attackerSide === 'blue' ? state.playerBoard : state.enemyBoard;
  const defBoard =
    attackerSide === 'blue' ? state.enemyBoard : state.playerBoard;
  let defHP = attackerSide === 'blue' ? state.enemyHP : state.playerHP;
  const defSide = attackerSide === 'blue' ? 'red' : 'blue';

  const aC = atkBoard[l];
  if (!aC || hasSkill(aC, 'defender') || aC.stunTurns > 0) return events;

  const aHasPhase = hasSkill(aC, 'phase');

  let dLane = l;
  // 守護側も位相が一致しないとかばうことができないが、防御を持っていればブロック可能
  const checkGuardian = (c) =>
    c &&
    hasSkill(c, 'guardian') &&
    (hasSkill(c, 'phase') === aHasPhase ||
      hasSkill(c, 'defender') ||
      c.stunTurns > 0);
  // 【重要】守護は隣のレーンに味方カードがいる場合のみ発動する（空きレーンはかばわない）
  let dg = null;
  if (defBoard[l]) {
    dg =
      l === 1
        ? checkGuardian(defBoard[0])
          ? 0
          : checkGuardian(defBoard[2])
            ? 2
            : null
        : l === 0
          ? checkGuardian(defBoard[1])
            ? 1
            : null
          : checkGuardian(defBoard[1])
            ? 1
            : null;
  }
  if (dg !== null && !hasSkill(defBoard[l], 'guardian')) {
    dLane = dg;
    events.push({
      type: 'skill_popup',
      side: defSide,
      lane: dg,
      skillName: '守護',
    });
  }

  // 身替の対応: ダメージを受ける自身が substitute を持つなら、隣の味方に肩代わりさせる
  // 【重要】身替も隣のレーンに味方カードがいる場合のみ発動する
  if (defBoard[dLane] && hasSkill(defBoard[dLane], 'substitute')) {
    const checkSubstituteTarget = (c) =>
      c &&
      (hasSkill(c, 'phase') === aHasPhase ||
        hasSkill(c, 'defender') ||
        c.stunTurns > 0);
    let sub =
      dLane === 1
        ? checkSubstituteTarget(defBoard[0])
          ? 0
          : checkSubstituteTarget(defBoard[2])
            ? 2
            : null
        : dLane === 0
          ? checkSubstituteTarget(defBoard[1])
            ? 1
            : null
          : checkSubstituteTarget(defBoard[1])
            ? 1
            : null;
    if (sub !== null) {
      dLane = sub;
      events.push({
        type: 'skill_popup',
        side: defSide,
        lane: dLane,
        skillName: '身替',
      });
    }
  }

  let aLane = l;
  if (atkBoard[l]) {
    // 【重要】攻撃側の守護も、隣のレーンに味方カードがいる場合のみ発動する
    let ag = null;
    if (atkBoard[l]) {
      ag =
        l === 1
          ? hasSkill(atkBoard[0], 'guardian')
            ? 0
            : hasSkill(atkBoard[2], 'guardian')
              ? 2
              : null
          : l === 0
            ? hasSkill(atkBoard[1], 'guardian')
              ? 1
              : null
            : hasSkill(atkBoard[1], 'guardian')
              ? 1
              : null;
    }
    if (ag !== null) {
      aLane = ag;
      events.push({
        type: 'skill_popup',
        side: attackerSide,
        lane: aLane,
        skillName: '守護',
      });
    }

    // 身替の対応: 反撃を受ける自身が substitute を持つなら、隣の味方に肩代わりさせる
    if (hasSkill(atkBoard[aLane], 'substitute')) {
      let sub =
        aLane === 1
          ? atkBoard[0]
            ? 0
            : atkBoard[2]
              ? 2
              : null
          : aLane === 0
            ? atkBoard[1]
              ? 1
              : null
            : atkBoard[1]
              ? 1
              : null;
      if (sub !== null) {
        aLane = sub;
        events.push({
          type: 'skill_popup',
          side: attackerSide,
          lane: aLane,
          skillName: '身替',
        });
      }
    }
  }

  let dC = defBoard[dLane];
  if (dC && hasSkill(dC, 'phase') !== aHasPhase) {
    if (!hasSkill(dC, 'defender') && !(dC.stunTurns > 0)) {
      dC = null; // 位相が合わないため完全すり抜け（直接攻撃扱い）
    }
  }
  // 正面のカードを特定
  const frontCard = defBoard[l];
  // 位相が一致するか、または防御/拘束などの理由でブロック可能か
  const originalTarget =
    frontCard &&
    (hasSkill(frontCard, 'phase') === aHasPhase ||
      hasSkill(frontCard, 'defender') ||
      frontCard.stunTurns > 0)
      ? frontCard
      : null;
  let aP = Number(aC.currentPower ?? aC.power ?? 0) || 0;

  // 反撃ダメージを与えるカードは、守護や身代わりに関わらず「常に正面の相手」
  let dC_counter = originalTarget;
  // 防御（および拘束・待機）状態でなく、位相が一致している場合のみ反撃が発生
  let dP =
    dC_counter &&
    !hasSkill(dC_counter, 'defender') &&
    !(dC_counter.stunTurns > 0)
      ? Number(dC_counter.currentPower ?? dC_counter.power ?? 0) || 0
      : 0;

  // 貫通計算用に、実際にダメージを受けるカードの元パワーを保持しておく（肩代わりが発生した場合は肩代わり先を参照）
  let originalTargetPower = dC
    ? Number(dC.currentPower ?? dC.power ?? 0) || 0
    : 0;

  // 反撃ダメージを受けるカード（攻撃者自身、またはその隣の守護）
  const aC_defend = atkBoard[aLane];

  events.push({ type: 'attack', attackerSide, lane: l, targetLane: dLane });

  if (hasSkill(aC, 'brutal')) {
    const brutalDmg = getSkillValue(aC, 'brutal') || 1;
    events.push({
      type: 'vfx_trigger',
      vfxId: 'anm_skill_brutal',
      side: attackerSide,
      lane: l,
    });

    [l - 1, l + 1].forEach((tj) => {
      if (tj >= 0 && tj <= 2 && atkBoard[tj]) {
        if (canTakeDamage(atkBoard[tj], brutalDmg)) {
          atkBoard[tj].currentPower -= brutalDmg;
          events.push({
            type: 'damage_card',
            side: attackerSide,
            lane: tj,
            amount: brutalDmg,
            source: 'brutal',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: attackerSide,
            lane: tj,
            source: 'brutal',
          });
        }
      }
    });
  }

  if (hasSkill(aC, 'cleave')) {
    let targets = [l - 1, l, l + 1].filter((j) => j >= 0 && j <= 2);
    targets.sort((a, b) => a - b);

    let N = targets.length;
    let base = Math.floor(aP / N);
    let rem = aP % N;
    let hasDoubleStrike = hasSkill(aC, 'double_strike');
    if (hasDoubleStrike && aP > 0) {
      events.push({
        type: 'double_strike_proc',
        side: attackerSide,
        lane: aLane,
      });
    }

    // [1] 与ダメージ分配（肩代わり無効: 守護・身替・憑依のリダイレクトを無視し、各レーンに直接ダメージ）
    let totalActualDmgToDef = 0;
    const preDmgPowers = {}; // 貫通計算用: 各レーンのダメージ前パワーを記録
    for (let targetLane of targets) {
      let currentDmg = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;

      if (currentDmg <= 0) continue;

      let targetCard = defBoard[targetLane];
      if (targetCard) {
        if (hasDoubleStrike) currentDmg *= 2;

        preDmgPowers[targetLane] =
          Number(targetCard.currentPower ?? targetCard.power ?? 0) || 0;
        let effectiveDmg = currentDmg;
        if (hasSkill(targetCard, 'sturdy')) {
          events.push({
            type: 'sturdy_block',
            side: defSide,
            lane: targetLane,
          });
          effectiveDmg = Math.floor(effectiveDmg / 2);
        }
        if (hasSkill(targetCard, 'invincible')) {
          events.push({
            type: 'invincible_block',
            side: defSide,
            lane: targetLane,
          });
          effectiveDmg = 0;
        }

        if (effectiveDmg > 0) {
          if (canTakeDamage(targetCard, effectiveDmg, false)) {
            targetCard.currentPower -= effectiveDmg;
            events.push({
              type: 'damage_card',
              side: defSide,
              lane: targetLane,
              amount: effectiveDmg,
              source: 'cleave',
            });
            totalActualDmgToDef += effectiveDmg;
          } else {
            events.push({
              type: 'immune_block',
              side: defSide,
              lane: targetLane,
              source: 'cleave',
            });
          }

          if (hasSkill(aC, 'deadly')) {
            if (!hasSkill(targetCard, 'immune')) {
              targetCard.currentPower = 0;
              events.push({ type: 'deadly', side: defSide, lane: targetLane });
            } else {
              events.push({
                type: 'immune_block',
                side: defSide,
                lane: targetLane,
                source: 'deadly',
              });
            }
          }
        }
      } else {
        // 空レーン: ダメージはリーダーへ
        defHP -= currentDmg;
        events.push({
          type: 'damage_player',
          side: defSide,
          amount: currentDmg,
          source: 'cleave',
        });
        totalActualDmgToDef += currentDmg;
        // 簒奪: リーダーにダメージを与えた際に発動
        applyExtort(aC, defSide, attackerSide, aLane, events, state);
      }
    }

    // [2] 反撃処理 (一掃でも正面からのみ受ける)
    let dmgToAtk = dP;
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'sturdy')) {
      events.push({ type: 'sturdy_block', side: attackerSide, lane: aLane });
      dmgToAtk = Math.floor(dmgToAtk / 2);
    }
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'invincible')) {
      events.push({
        type: 'invincible_block',
        side: attackerSide,
        lane: aLane,
      });
      dmgToAtk = 0;
    }

    if (originalTarget && hasSkill(originalTarget, 'double_strike')) {
      if (dmgToAtk > 0)
        events.push({ type: 'double_strike_proc', side: defSide, lane: l });
      dmgToAtk *= 2;
    }
    const isOriginalTargetDefender =
      originalTarget &&
      (hasSkill(originalTarget, 'defender') || originalTarget.stunTurns > 0);
    if (isOriginalTargetDefender) dmgToAtk = 0;

    if (dmgToAtk > 0 && !canTakeDamage(aC_defend, dmgToAtk, false)) {
      events.push({ type: 'immune_block', side: attackerSide, lane: aLane });
      dmgToAtk = 0;
    }

    if (dmgToAtk > 0) {
      events.push({
        type: 'damage_card',
        side: attackerSide,
        lane: aLane,
        amount: dmgToAtk,
      });
      aC_defend.currentPower -= dmgToAtk;
      if (originalTarget && hasSkill(originalTarget, 'deadly')) {
        if (!hasSkill(aC_defend, 'immune')) {
          aC_defend.currentPower = 0;
          events.push({ type: 'deadly', side: attackerSide, lane: aLane });
        } else {
          events.push({
            type: 'immune_block',
            side: attackerSide,
            lane: aLane,
            source: 'deadly',
          });
        }
      }
    }

    // [3] 吸収 (リーダーダメージも含む実際の与ダメージに基づく)
    if (totalActualDmgToDef > 0 && hasSkill(aC, 'absorb')) {
      const healAmt = Math.floor(totalActualDmgToDef / 2);
      if (healAmt > 0) {
        if (attackerSide === 'blue')
          state.playerHP = Math.min(
            state.playerMaxHP || 20,
            state.playerHP + healAmt
          );
        else
          state.enemyHP = Math.min(
            state.enemyMaxHP || 20,
            state.enemyHP + healAmt
          );
        events.push({
          type: 'heal_player',
          side: attackerSide,
          amount: healAmt,
          source: 'absorb',
          lane: aLane,
        });
      }
    }

    if (dmgToAtk > 0 && originalTarget && hasSkill(originalTarget, 'absorb')) {
      const healAmt = Math.floor(dmgToAtk / 2);
      if (healAmt > 0) {
        // 【重要】defHPに加算する。state.xxxHPを直接変更するとdefHP書き戻しで上書きされる。
        defHP = Math.min(
          (attackerSide === 'blue' ? state.enemyMaxHP : state.playerMaxHP) ||
            20,
          defHP + healAmt
        );
        events.push({
          type: 'heal_player',
          side: defSide,
          amount: healAmt,
          source: 'absorb',
          lane: l,
        });
      }
    }

    // [4] 貫通: 通常攻撃と同様に「分配ダメージ - 防御者パワー」の差分をリーダーに与える
    //     各レーンでの余剰分を合算する（ダメージ前のパワーを基準にするため deadly でも正しく発動）
    if (hasSkill(aC, 'pierce')) {
      let totalPierceDmg = 0;
      // ダメージ分配を再計算（[1]と同じ配分ロジック）
      let pBase = Math.floor(aP / N);
      let pRem = aP % N;
      let hasDoubleStrike = hasSkill(aC, 'double_strike');
      for (let targetLane of targets) {
        let laneDmg = pBase + (pRem > 0 ? 1 : 0);
        if (pRem > 0) pRem--;
        if (hasDoubleStrike) laneDmg *= 2;

        // カードが存在するレーンのみ（空レーンは既にリーダーダメージ処理済み）
        if (preDmgPowers[targetLane] !== undefined) {
          const pierceDmg = Math.max(0, laneDmg - preDmgPowers[targetLane]);
          totalPierceDmg += pierceDmg;
        }
      }
      if (totalPierceDmg > 0) {
        defHP -= totalPierceDmg;
        events.push({
          type: 'damage_player',
          side: defSide,
          amount: totalPierceDmg,
          source: 'pierce',
        });
        applyExtort(aC, defSide, attackerSide, aLane, events, state);
        if (hasSkill(aC, 'absorb')) {
          const healAmt = Math.floor(totalPierceDmg / 2);
          if (healAmt > 0) {
            if (attackerSide === 'blue')
              state.playerHP = Math.min(
                state.playerMaxHP || 20,
                state.playerHP + healAmt
              );
            else
              state.enemyHP = Math.min(
                state.enemyMaxHP || 20,
                state.enemyHP + healAmt
              );
            events.push({
              type: 'heal_player',
              side: attackerSide,
              amount: healAmt,
              source: 'absorb',
              lane: aLane,
            });
          }
        }
      }
    }

    // [5] 魂縛: 一掃で破壊した敵カードの数だけ発動（攻撃者自身が生存している場合のみ）
    if (hasSkill(aC, 'soul_bind') && aC.currentPower > 0) {
      let destroyedCount = 0;
      for (let targetLane of targets) {
        const targetCard = defBoard[targetLane];
        if (targetCard && targetCard.currentPower <= 0) destroyedCount++;
      }
      if (destroyedCount > 0) {
        const val = getSkillValue(aC, 'soul_bind') || 2;
        const totalGain = val * destroyedCount;
        aC.currentPower += totalGain;
        events.push({
          type: 'power_change',
          side: attackerSide,
          lane: l,
          amount: totalGain,
          source: 'soul_bind',
        });
      }
    }
    // 防御側の魂縛: 反撃で攻撃者（またはその守護）を倒した場合に発動
    if (
      originalTarget &&
      hasSkill(originalTarget, 'soul_bind') &&
      originalTarget.currentPower > 0 &&
      aC_defend.currentPower <= 0
    ) {
      const val = getSkillValue(originalTarget, 'soul_bind') || 2;
      originalTarget.currentPower += val;
      events.push({
        type: 'power_change',
        side: defSide,
        lane: l,
        amount: val,
        source: 'soul_bind',
      });
    }
  } else if (dC) {
    let dmgToDef = aP;
    let dmgToAtk = dP;

    // 連撃（ダブルストライク）: 頑丈の半減より先に2倍を適用（3*2/2=3で±0になる）
    if (hasSkill(aC, 'double_strike')) {
      if (dmgToDef > 0)
        events.push({
          type: 'double_strike_proc',
          side: attackerSide,
          lane: l,
        });
      dmgToDef *= 2;
    }
    if (originalTarget && hasSkill(originalTarget, 'double_strike')) {
      if (dmgToAtk > 0)
        events.push({ type: 'double_strike_proc', side: defSide, lane: l });
      dmgToAtk *= 2;
    }

    if (dmgToDef > 0 && hasSkill(dC, 'sturdy')) {
      if (dmgToDef > 0)
        events.push({ type: 'sturdy_block', side: defSide, lane: dLane });
      dmgToDef = Math.floor(dmgToDef / 2);
    }
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'sturdy')) {
      if (dmgToAtk > 0)
        events.push({ type: 'sturdy_block', side: attackerSide, lane: aLane });
      dmgToAtk = Math.floor(dmgToAtk / 2);
    }
    if (dmgToDef > 0 && !canTakeDamage(dC, dmgToDef, false)) {
      if (dmgToDef > 0)
        events.push({ type: 'immune_block', side: defSide, lane: dLane });
      dmgToDef = 0;
    }
    if (dmgToDef > 0 && hasSkill(dC, 'invincible')) {
      if (dmgToDef > 0)
        events.push({ type: 'invincible_block', side: defSide, lane: dLane });
      dmgToDef = 0;
    }
    if (dmgToDef > 0 && hasSkill(dC, 'reflect')) {
      // 「反射」スキル：場にいるすべてのカード（null以外）を収集して、ランダムな1枚にダメージを肩代わりさせる
      const candidates = [];
      for (let i = 0; i < 3; i++) {
        if (state.playerBoard[i]) {
          candidates.push({
            card: state.playerBoard[i],
            side: 'blue',
            lane: i,
          });
        }
        if (state.enemyBoard[i]) {
          candidates.push({ card: state.enemyBoard[i], side: 'red', lane: i });
        }
      }

      // ランダムに1枚決定
      if (candidates.length > 0) {
        const randIdx = Math.floor(getSeededRandom() * candidates.length);
        const chosenObj = candidates[randIdx];

        // 自身以外が選ばれた場合は、そのカードにダメージを肩代わりさせる
        if (chosenObj.card !== dC) {
          events.push({ type: 'reflect_block', side: defSide, lane: dLane });
          const chosenCard = chosenObj.card;
          const chosenSide = chosenObj.side;
          const chosenLane = chosenObj.lane;

          let effectiveDmg = dmgToDef;
          if (hasSkill(chosenCard, 'invincible')) {
            events.push({
              type: 'invincible_block',
              side: chosenSide,
              lane: chosenLane,
            });
            effectiveDmg = 0;
          }

          if (effectiveDmg > 0) {
            if (canTakeDamage(chosenCard, effectiveDmg, false)) {
              chosenCard.currentPower -= effectiveDmg;
              events.push({
                type: 'damage_card',
                side: chosenSide,
                lane: chosenLane,
                amount: effectiveDmg,
                source: 'reflect',
              });
            } else {
              events.push({
                type: 'immune_block',
                side: chosenSide,
                lane: chosenLane,
                source: 'reflect',
              });
            }

            // 攻撃側のカードが「即死（deadly）」を持っている場合の即死判定
            if (hasSkill(aC, 'deadly')) {
              if (!hasSkill(chosenCard, 'immune')) {
                chosenCard.currentPower = 0;
                events.push({
                  type: 'deadly',
                  side: chosenSide,
                  lane: chosenLane,
                });
              } else {
                events.push({
                  type: 'immune_block',
                  side: chosenSide,
                  lane: chosenLane,
                  source: 'deadly',
                });
              }
            }
          }
          dmgToDef = 0; // 肩代わりさせたので自身のダメージは0
        }
        // 自身が選ばれた場合は、肩代わり（反射処理）をスキップし、その後の通常フローに任せて自身がダメージを受ける
      } else {
        // 場にカードが存在しない場合は肩代わり不可、通常通りダメージを受ける
      }
    }
    if (dmgToAtk > 0 && !canTakeDamage(aC_defend, dmgToAtk, false)) {
      if (dmgToAtk > 0)
        events.push({ type: 'immune_block', side: attackerSide, lane: aLane });
      dmgToAtk = 0;
    }
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'invincible')) {
      if (dmgToAtk > 0)
        events.push({
          type: 'invincible_block',
          side: attackerSide,
          lane: aLane,
        });
      dmgToAtk = 0;
    }
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'reflect')) {
      // 「反射」スキル：場にいるすべてのカード（null以外）を収集して、ランダムな1枚にダメージを肩代わりさせる
      const candidates = [];
      for (let i = 0; i < 3; i++) {
        if (state.playerBoard[i]) {
          candidates.push({
            card: state.playerBoard[i],
            side: 'blue',
            lane: i,
          });
        }
        if (state.enemyBoard[i]) {
          candidates.push({ card: state.enemyBoard[i], side: 'red', lane: i });
        }
      }

      // ランダムに1枚決定
      if (candidates.length > 0) {
        const randIdx = Math.floor(getSeededRandom() * candidates.length);
        const chosenObj = candidates[randIdx];

        // 自身以外が選ばれた場合は、そのカードにダメージを肩代わりさせる
        if (chosenObj.card !== aC_defend) {
          events.push({
            type: 'reflect_block',
            side: attackerSide,
            lane: aLane,
          });
          const chosenCard = chosenObj.card;
          const chosenSide = chosenObj.side;
          const chosenLane = chosenObj.lane;

          let effectiveDmg = dmgToAtk;
          if (hasSkill(chosenCard, 'invincible')) {
            events.push({
              type: 'invincible_block',
              side: chosenSide,
              lane: chosenLane,
            });
            effectiveDmg = 0;
          }

          if (effectiveDmg > 0) {
            if (canTakeDamage(chosenCard, effectiveDmg, false)) {
              chosenCard.currentPower -= effectiveDmg;
              events.push({
                type: 'damage_card',
                side: chosenSide,
                lane: chosenLane,
                amount: effectiveDmg,
                source: 'reflect',
              });
            } else {
              events.push({
                type: 'immune_block',
                side: chosenSide,
                lane: chosenLane,
                source: 'reflect',
              });
            }

            // 防御側（反撃元）のカードが「即死（deadly）」を持っている場合の即死判定
            if (originalTarget && hasSkill(originalTarget, 'deadly')) {
              if (!hasSkill(chosenCard, 'immune')) {
                chosenCard.currentPower = 0;
                events.push({
                  type: 'deadly',
                  side: chosenSide,
                  lane: chosenLane,
                });
              } else {
                events.push({
                  type: 'immune_block',
                  side: chosenSide,
                  lane: chosenLane,
                  source: 'deadly',
                });
              }
            }
          }
          dmgToAtk = 0; // 肩代わりさせたので自身のダメージは0
        }
        // 自身が選ばれた場合は、肩代わり（反射処理）をスキップし、その後の通常フローに任せて自身がダメージを受ける
      } else {
        // 場にカードが存在しない場合は肩代わり不可、通常通りダメージを受ける
      }
    }

    // 連撃（ダブルストライク）: sturdy判定前に移動済み（ここでは処理しない）

    const isOriginalTargetDefender =
      originalTarget &&
      (hasSkill(originalTarget, 'defender') || originalTarget.stunTurns > 0);
    if (isOriginalTargetDefender) dmgToAtk = 0; // 防御（および待機・拘束）は反撃ダメージを与えない

    if (dmgToDef > 0 && hasSkill(dC, 'possession')) {
      if (dmgToDef > 0) {
        events.push({
          type: 'skill_popup',
          side: defSide,
          lane: dLane,
          skillName: '憑依',
        });
        if (!applyMartyrForLeader(state, defSide, dmgToDef, events)) {
          defHP -= dmgToDef;
          events.push({
            type: 'damage_player',
            side: defSide,
            amount: dmgToDef,
            source: 'possession',
            lane: dLane,
          });
        }
        dmgToDef = 0;
      }
    }
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'possession')) {
      if (dmgToAtk > 0) {
        events.push({
          type: 'skill_popup',
          side: attackerSide,
          lane: aLane,
          skillName: '憑依',
        });
        if (!applyMartyrForLeader(state, attackerSide, dmgToAtk, events)) {
          if (attackerSide === 'blue') state.playerHP -= dmgToAtk;
          else state.enemyHP -= dmgToAtk;
          events.push({
            type: 'damage_player',
            side: attackerSide,
            amount: dmgToAtk,
            source: 'possession',
            lane: aLane,
          });
        }
        dmgToAtk = 0;
      }
    }

    if (dmgToDef > 0) {
      events.push({
        type: 'damage_card',
        side: defSide,
        lane: dLane,
        amount: dmgToDef,
      });
      dC.currentPower -= dmgToDef;

      if (hasSkill(aC, 'deadly')) {
        if (!hasSkill(dC, 'immune')) {
          dC.currentPower = 0;
          events.push({ type: 'deadly', side: defSide, lane: dLane });
        } else {
          events.push({
            type: 'immune_block',
            side: defSide,
            lane: dLane,
            source: 'deadly',
          });
        }
      }
    }

    if (dmgToAtk > 0) {
      events.push({
        type: 'damage_card',
        side: attackerSide,
        lane: aLane,
        amount: dmgToAtk,
      });
      aC_defend.currentPower -= dmgToAtk;
      if (originalTarget && hasSkill(originalTarget, 'deadly')) {
        if (!hasSkill(aC_defend, 'immune')) {
          aC_defend.currentPower = 0;
          events.push({ type: 'deadly', side: attackerSide, lane: aLane });
        } else {
          events.push({
            type: 'immune_block',
            side: attackerSide,
            lane: aLane,
            source: 'deadly',
          });
        }
      }
    }

    if (dmgToDef > 0 && hasSkill(aC, 'absorb')) {
      const healAmt = Math.floor(dmgToDef / 2);
      if (healAmt > 0) {
        if (attackerSide === 'blue')
          state.playerHP = Math.min(
            state.playerMaxHP || 20,
            state.playerHP + healAmt
          );
        else
          state.enemyHP = Math.min(
            state.enemyMaxHP || 20,
            state.enemyHP + healAmt
          );
        events.push({
          type: 'heal_player',
          side: attackerSide,
          amount: healAmt,
          source: 'absorb',
          lane: aLane,
        });
      }
    }
    if (dmgToAtk > 0 && originalTarget && hasSkill(originalTarget, 'absorb')) {
      const healAmt = Math.floor(dmgToAtk / 2);
      if (healAmt > 0) {
        // 【重要】defHPに加算する。state.xxxHPを直接変更するとL3819のdefHP書き戻しで上書きされる。
        defHP = Math.min(
          (attackerSide === 'blue' ? state.enemyMaxHP : state.playerMaxHP) ||
            20,
          defHP + healAmt
        );
        events.push({
          type: 'heal_player',
          side: defSide,
          amount: healAmt,
          source: 'absorb',
          lane: dLane,
        });
      }
    }

    if (hasSkill(aC, 'pierce')) {
      let effectiveAP = hasSkill(aC, 'double_strike') ? aP * 2 : aP;
      let pDmg = Math.max(0, effectiveAP - originalTargetPower);
      if (pDmg > 0) {
        if (!applyMartyrForLeader(state, defSide, pDmg, events)) {
          defHP -= pDmg;
          events.push({
            type: 'damage_player',
            side: defSide,
            amount: pDmg,
            source: 'pierce',
          });
          applyExtort(aC, defSide, attackerSide, aLane, events, state);

          if (hasSkill(aC, 'absorb')) {
            const healAmt = Math.floor(pDmg / 2);
            if (healAmt > 0) {
              if (attackerSide === 'blue')
                state.playerHP = Math.min(
                  state.playerMaxHP || 20,
                  state.playerHP + healAmt
                );
              else
                state.enemyHP = Math.min(
                  state.enemyMaxHP || 20,
                  state.enemyHP + healAmt
                );
              events.push({
                type: 'heal_player',
                side: attackerSide,
                amount: healAmt,
                source: 'absorb',
                lane: aLane,
              });
            }
          }
        }
      }
    }

    // 魂縛
    let aD = aC_defend.currentPower <= 0,
      dD = dC.currentPower <= 0;
    if (dD && !aD && hasSkill(aC, 'soul_bind')) {
      const val = getSkillValue(aC, 'soul_bind') || 2;
      aC.currentPower += val;
      events.push({
        type: 'power_change',
        side: attackerSide,
        lane: l,
        amount: val,
        source: 'soul_bind',
      });
    }
    if (aD && !dD && hasSkill(dC, 'soul_bind')) {
      const val = getSkillValue(dC, 'soul_bind') || 2;
      dC.currentPower += val;
      events.push({
        type: 'power_change',
        side: defSide,
        lane: dLane,
        amount: val,
        source: 'soul_bind',
      });
    }
  } else {
    let finalDmg = aP;
    if (!applyMartyrForLeader(state, defSide, finalDmg, events)) {
      defHP -= finalDmg;
      events.push({
        type: 'damage_player',
        side: defSide,
        amount: finalDmg,
        source: 'direct_attack',
      });
      applyExtort(aC, defSide, attackerSide, aLane, events, state);

      if (finalDmg > 0 && hasSkill(aC, 'absorb')) {
        const healAmt = Math.floor(finalDmg / 2);
        if (healAmt > 0) {
          if (attackerSide === 'blue')
            state.playerHP = Math.min(
              state.playerMaxHP || 20,
              state.playerHP + healAmt
            );
          else
            state.enemyHP = Math.min(
              state.enemyMaxHP || 20,
              state.enemyHP + healAmt
            );
          events.push({
            type: 'heal_player',
            side: attackerSide,
            amount: healAmt,
            source: 'absorb',
            lane: aLane,
          });
        }
      }
    }
  }

  if (attackerSide === 'blue') state.enemyHP = defHP;
  else state.playerHP = defHP;

  processDestructionTriggers(state, events);
  return events;
}

/**
 * ターン開始パッシブの適用
 * @returns {Array} events
 */
export function applyPassiveSkillLogic(
  state,
  side,
  skipContract = false,
  events = []
) {
  // シミュレーション用のクリーンアップと誘爆の処理
  processDestructionTriggers(state, events);

  const b = side === 'blue' ? state.playerBoard : state.enemyBoard;
  const teleportMovedIds = new Set();
  for (let i = 0; i < 3; i++) {
    const c = b[i];
    if (!c) continue;

    // 神出 (teleport): 空きレーンが1つの時に確定移動をシミュレート
    if (
      hasSkill(c, 'teleport') &&
      (c.stunTurns || 0) === 0 &&
      !hasSkill(c, 'defender') &&
      !teleportMovedIds.has(c.uid || c.id)
    ) {
      const sealedLanes =
        side === 'blue'
          ? state.playerSealedLanes || [0, 0, 0]
          : state.enemySealedLanes || [0, 0, 0];
      const emptyLanes = [];
      for (let j = 0; j < 3; j++) {
        if (b[j] === null && sealedLanes[j] === 0) {
          emptyLanes.push(j);
        }
      }
      if (emptyLanes.length === 1) {
        const targetLane = emptyLanes[0];
        b[targetLane] = c;
        b[i] = null;
        teleportMovedIds.add(c.uid || c.id);
        events.push({
          type: 'teleport_simulation',
          side,
          from: i,
          to: targetLane,
          source: 'teleport',
        });
      }
    }

    if (hasSkill(c, 'growth')) {
      const v = getSkillValue(c, 'growth') || 1;
      c.currentPower += v;
      events.push({
        type: 'power_change',
        side,
        lane: i,
        amount: v,
        source: 'growth',
      });
    }
    // 迎撃: ターン開始時に相手の最大パワーカードにダメージ
    if (hasSkill(c, 'intercept')) {
      const dmg = getSkillValue(c, 'intercept') || 2;
      const eB = side === 'blue' ? state.enemyBoard : state.playerBoard;
      const oppSide = side === 'blue' ? 'red' : 'blue';
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
        events.push({
          type: 'skill_popup',
          side,
          lane: i,
          skillName: '迎撃',
        });
        if (canTakeDamage(eB[maxL], dmg)) {
          eB[maxL].currentPower -= dmg;
          events.push({
            type: 'damage_card',
            side: oppSide,
            lane: maxL,
            amount: dmg,
            source: 'intercept',
          });
        } else {
          events.push({
            type: 'immune_block',
            side: oppSide,
            lane: maxL,
            source: 'intercept',
          });
        }
      }
    }
    if (hasSkill(c, 'contract') && !skipContract) {
      let v = getSkillValue(c, 'contract') || 3;
      if (side === 'blue') state.playerHP -= v;
      else state.enemyHP -= v;
      events.push({
        type: 'damage_player',
        side,
        amount: v,
        source: 'contract',
      });
    }
    if (hasSkill(c, 'awake')) {
      const v = getSkillValue(c, 'awake') || 1;
      const awakeSkill =
        c.skills?.find((s) => s.id === 'awake') ||
        (c.skill === 'awake'
          ? { id: 'awake', value: c.skillValue, summonId: c.summonId }
          : null);
      const summonId = awakeSkill?.summonId || 'token_dragon';

      // 同レーンにトークンを配置（Place）
      events.push({
        type: 'awake_trigger',
        side,
        lane: i,
        card: c,
        summonId,
        value: v,
      });
      applyActiveSkillLogic(state, side, i, 'awake', v, events, [], i);
    }
  }
  processDestructionTriggers(state, events);
  return events;
}

/**
 * 簒奪スキルの適用 (指定した相手プレイヤーの手札をランダムに虚空に変換)
 */
function applyExtort(aC, oppSide, attackerSide, aLane, events, state) {
  if (!hasSkill(aC, 'extort')) return;

  const val = getSkillValue(aC, 'extort') || 1;
  const oppHand = oppSide === 'blue' ? state.playerHand : state.enemyHand;
  const oppDiscard =
    oppSide === 'blue' ? state.playerDiscard : state.enemyDiscard;

  if (oppHand && oppHand.length > 0) {
    let activated = false;
    const newTokens = [];

    // 【システム解説】
    // 簒奪（extort）スキルは相手の手札から「最大パワー」のカードを優先的に選択して処理します。
    // 手札内の有効なカードをインデックス情報付きで抽出し、
    // パワーの降順（同値の場合は左側＝手札のインデックスが小さい方を優先）でソートします。
    const validTargets = oppHand
      .map((card, idx) => ({ card, idx }))
      .filter((item) => item.card !== null)
      .sort((a, b) => {
        const pA = a.card.currentPower ?? a.card.power ?? 0;
        const pB = b.card.currentPower ?? b.card.power ?? 0;
        if (pB !== pA) return pB - pA;
        return a.idx - b.idx; // 同値の場合は左優先
      });

    const actualCount = Math.min(val, validTargets.length);

    for (let i = 0; i < actualCount; i++) {
      const targetInfo = validTargets[i];
      // ソート順のカードを手札配列から直接オブジェクト参照で検索して削除（インデックスずれを防止）
      const removeIdx = oppHand.findIndex((c) => c === targetInfo.card);
      if (removeIdx === -1) continue;

      if (!activated) {
        events.push({
          type: 'skill_popup',
          side: attackerSide,
          lane: aLane,
          skillName: '簒奪',
        });
        events.push({
          type: 'vfx_trigger',
          vfxId: 'anm_skill_extort',
          side: attackerSide,
          lane: aLane,
        });
        activated = true;
      }

      const discarded = oppHand.splice(removeIdx, 1)[0];

      if (!discarded) {
        i--;
        continue;
      }

      if (!discarded.isToken) {
        const masterData = CARD_MASTER.find(
          (m) => m.id === (discarded.baseId || discarded.id)
        );
        if (masterData) {
          const restoredCard = JSON.parse(JSON.stringify(masterData));
          restoredCard.uid = discarded.uid;
          restoredCard.owner = oppSide;
          restoredCard.baseId = discarded.baseId || discarded.id;
          if (discarded.isPremium !== undefined)
            restoredCard.isPremium = discarded.isPremium;
          restoredCard.basePower = restoredCard.power;
          restoredCard.currentPower = restoredCard.power;
          oppDiscard.push(restoredCard);
        } else {
          oppDiscard.push({
            ...discarded,
            currentPower: discarded.basePower || discarded.power,
            skills: [],
          });
        }
      }

      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      const voidToken = {
        ...voidTpl,
        id: `token_void_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_extort${i}`,
        uid: `${oppSide}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}_voidext${i}`,
        baseId: 'token_void',
        filter: voidTpl.filter,
        power: voidTpl.power,
        currentPower: voidTpl.power,
        basePower: voidTpl.power,
        skill: voidTpl.skill || 'none',
        voiceCategory: voidTpl.voiceCategory || 'undead',
        isToken: true,
        isMorphToken: true,
      };
      newTokens.push(voidToken);

      events.push({
        type: 'discard',
        side: oppSide,
        card: JSON.parse(JSON.stringify(discarded)),
        source: 'extort',
      });
      events.push({
        type: 'add_hand',
        side: oppSide,
        card: JSON.parse(JSON.stringify(voidToken)),
        source: 'extort',
      });
    }
    newTokens.forEach((t) => oppHand.push(t));
  }
}

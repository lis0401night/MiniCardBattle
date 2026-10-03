/**
 * src/game/engine/combat.js
 * Mini Card Battle - 戦闘ロジックモジュール
 *
 * 戦闘フェーズの計算（calculateCombatPhase、applySingleCombat、簒奪等）を管理します。
 */

import { CARD_MASTER } from '../../utils/constants/cards.js';
import {
  getSeededRandom,
  getSkillValue,
  hasSkill,
  isCardInvincible,
} from '../../utils/gameUtils.js';
import {
  BLOCK_TYPE_EVENT_MAP,
  canTakeDamage,
  damageCard,
  damageLeader,
  getDamageBlockType,
  healDefenderLeaderHP,
  healLeader,
  pushDamageBlockEvent,
} from './core.js';
import {
  canCardBeDestroyed,
  isReverseActive,
  isValkyriaGuardActive,
  processDestructionTriggers,
} from './passiveSkills.js';

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
  if (
    !aC ||
    hasSkill(aC, 'defender') ||
    aC.stunTurns > 0 ||
    aC.cantAttackTurns > 0
  )
    return events;

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
  let isPhaseBypass = false;
  if (dC && hasSkill(dC, 'phase') !== aHasPhase) {
    if (!hasSkill(dC, 'defender') && !(dC.stunTurns > 0)) {
      dC = null; // 位相が合わないため完全すり抜け（直接攻撃扱い）
      isPhaseBypass = true;
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
  // 防御（および拘束・待機、攻撃不能）状態でなく、位相が一致している場合のみ反撃が発生
  let dP =
    dC_counter &&
    !hasSkill(dC_counter, 'defender') &&
    !(dC_counter.stunTurns > 0) &&
    !(dC_counter.cantAttackTurns > 0)
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

    [l - 1, l + 1].forEach((tj) => {
      if (tj >= 0 && tj <= 2 && atkBoard[tj]) {
        damageCard(state, attackerSide, tj, brutalDmg, 'brutal', events, true);
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
      let isTargetPhaseBypass = false;
      // 位相（phase）の判定: 位相が一致しないカードは「防御」または「気絶(stun)」を持っていない限りすり抜け（直接攻撃扱い）
      if (targetCard && hasSkill(targetCard, 'phase') !== aHasPhase) {
        if (!hasSkill(targetCard, 'defender') && !(targetCard.stunTurns > 0)) {
          targetCard = null;
          isTargetPhaseBypass = true;
        }
      }

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
        if (isCardInvincible(targetCard)) {
          events.push({
            type: 'invincible_block',
            side: defSide,
            lane: targetLane,
          });
          effectiveDmg = 0;
        }

        if (effectiveDmg > 0) {
          const blockType = getDamageBlockType(
            targetCard,
            effectiveDmg,
            false,
            state,
            defSide
          );
          if (!blockType) {
            if (hasSkill(targetCard, 'possession')) {
              events.push({
                type: 'skill_popup',
                side: defSide,
                lane: targetLane,
                skillName: '憑依',
              });
              if (isValkyriaGuardActive(state, defSide)) {
                events.push({
                  type: 'valkyria_guard_block',
                  side: defSide,
                  amount: effectiveDmg,
                  source: 'possession',
                });
              } else {
                defHP -= effectiveDmg;
                events.push({
                  type: 'damage_player',
                  side: defSide,
                  amount: effectiveDmg,
                  source: 'possession',
                  lane: targetLane,
                });
                // 憑依により相手リーダーに戦闘ダメージが肩代わりされたため、簒奪（extort）を発動
                applyExtort(aC, defSide, attackerSide, aLane, events, state);
                totalActualDmgToDef += effectiveDmg;
              }
            } else {
              targetCard.currentPower -= effectiveDmg;
              events.push({
                type: 'damage_card',
                side: defSide,
                lane: targetLane,
                amount: effectiveDmg,
                source: 'cleave',
              });
              totalActualDmgToDef += effectiveDmg;
            }
          } else if (blockType === 'valkyria_guard') {
            events.push({
              type: 'valkyria_guard_block',
              side: defSide,
              lane: targetLane,
              amount: effectiveDmg,
            });
            effectiveDmg = 0;
          } else {
            events.push({
              type: BLOCK_TYPE_EVENT_MAP[blockType] || `${blockType}_block`,
              side: defSide,
              lane: targetLane,
              source: 'cleave',
            });
            effectiveDmg = 0;
          }

          if (hasSkill(aC, 'deadly')) {
            if (canCardBeDestroyed(state, targetCard, defSide)) {
              targetCard.currentPower = 0;
              events.push({ type: 'deadly', side: defSide, lane: targetLane });
            } else {
              events.push({
                type: isValkyriaGuardActive(state, defSide)
                  ? 'valkyria_guard_block'
                  : 'immune_block',
                side: defSide,
                lane: targetLane,
                source: 'deadly',
              });
            }
          }
        }
      } else {
        // 空レーン: ダメージはリーダーへ
        if (isValkyriaGuardActive(state, defSide)) {
          events.push({
            type: 'valkyria_guard_block',
            side: defSide,
            amount: currentDmg,
            source: 'cleave',
          });
        } else {
          defHP -= currentDmg;
          if (isTargetPhaseBypass) {
            state.phaseBypassDamageTaken =
              (state.phaseBypassDamageTaken || 0) + currentDmg;
          }
          events.push({
            type: 'damage_player',
            side: defSide,
            amount: currentDmg,
            source: 'cleave',
            isPhaseBypass: isTargetPhaseBypass,
          });
          totalActualDmgToDef += currentDmg;
          // 簒奪: リーダーにダメージを与えた際に発動
          applyExtort(aC, defSide, attackerSide, aLane, events, state);
        }
      }
    }

    // [2] 反撃処理 (一掃でも正面からのみ受ける)
    let dmgToAtk = dP;
    if (dmgToAtk > 0 && hasSkill(aC_defend, 'sturdy')) {
      events.push({ type: 'sturdy_block', side: attackerSide, lane: aLane });
      dmgToAtk = Math.floor(dmgToAtk / 2);
    }
    if (dmgToAtk > 0 && isCardInvincible(aC_defend)) {
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

    if (
      dmgToAtk > 0 &&
      pushDamageBlockEvent(
        state,
        aC_defend,
        dmgToAtk,
        false,
        attackerSide,
        aLane,
        null,
        events
      )
    ) {
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
        if (canCardBeDestroyed(state, aC_defend, attackerSide)) {
          aC_defend.currentPower = 0;
          events.push({ type: 'deadly', side: attackerSide, lane: aLane });
        } else {
          events.push({
            type: isValkyriaGuardActive(state, attackerSide)
              ? 'valkyria_guard_block'
              : 'immune_block',
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
      healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
    }

    if (dmgToAtk > 0 && originalTarget && hasSkill(originalTarget, 'absorb')) {
      const healAmt = Math.floor(dmgToAtk / 2);
      defHP = healDefenderLeaderHP(
        state,
        defHP,
        defSide,
        attackerSide === 'blue' ? state.enemyMaxHP : state.playerMaxHP,
        healAmt,
        'absorb',
        events,
        l
      );
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
        if (isValkyriaGuardActive(state, defSide)) {
          events.push({
            type: 'valkyria_guard_block',
            side: defSide,
            amount: totalPierceDmg,
            source: 'pierce',
          });
        } else {
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
            healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
          }
        }
      }
    }

    // [5] 魂縛: 一掃で破壊した敵カードの数だけ発動（攻撃者自身が生存している場合のみ）
    if (aC.currentPower > 0) {
      let destroyedCount = 0;
      for (let targetLane of targets) {
        const targetCard = defBoard[targetLane];
        if (targetCard && targetCard.currentPower <= 0) destroyedCount++;
      }
      if (destroyedCount > 0) {
        if (hasSkill(aC, 'soul_bind')) {
          const val = getSkillValue(aC, 'soul_bind') || 2;
          const isReversed = isReverseActive(state);
          const totalGain = val * destroyedCount * (isReversed ? -1 : 1);
          aC.currentPower += totalGain;
          events.push({
            type: 'power_change',
            side: attackerSide,
            lane: l,
            amount: totalGain,
            source: 'soul_bind',
            isReversed,
          });
        }
      }
    }
    // 防御側の魂縛: 反撃で攻撃者（またはその守護）を倒した場合に発動
    if (
      originalTarget &&
      originalTarget.currentPower > 0 &&
      aC_defend.currentPower <= 0
    ) {
      if (hasSkill(originalTarget, 'soul_bind')) {
        const val = getSkillValue(originalTarget, 'soul_bind') || 2;
        const isReversed = isReverseActive(state);
        const gain = val * (isReversed ? -1 : 1);
        originalTarget.currentPower += gain;
        events.push({
          type: 'power_change',
          side: defSide,
          lane: l,
          amount: gain,
          source: 'soul_bind',
          isReversed,
        });
      }
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
    if (dmgToDef > 0) {
      const blockType = getDamageBlockType(dC, dmgToDef, false, state, defSide);
      if (blockType === 'valkyria_guard') {
        events.push({
          type: 'valkyria_guard_block',
          side: defSide,
          lane: dLane,
          amount: dmgToDef,
        });
        dmgToDef = 0;
      } else if (blockType) {
        events.push({
          type: BLOCK_TYPE_EVENT_MAP[blockType] || `${blockType}_block`,
          side: defSide,
          lane: dLane,
        });
        dmgToDef = 0;
      }
    }
    if (dmgToDef > 0 && isCardInvincible(dC)) {
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
          if (isCardInvincible(chosenCard)) {
            events.push({
              type: 'invincible_block',
              side: chosenSide,
              lane: chosenLane,
            });
            effectiveDmg = 0;
          }

          if (effectiveDmg > 0) {
            let damageApplied = false;
            if (
              canTakeDamage(chosenCard, effectiveDmg, false, state, chosenSide)
            ) {
              chosenCard.currentPower -= effectiveDmg;
              damageApplied = true;
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
            if (damageApplied && hasSkill(aC, 'deadly')) {
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
    if (
      dmgToAtk > 0 &&
      pushDamageBlockEvent(
        state,
        aC_defend,
        dmgToAtk,
        false,
        attackerSide,
        aLane,
        null,
        events
      )
    ) {
      dmgToAtk = 0;
    }
    if (dmgToAtk > 0 && isCardInvincible(aC_defend)) {
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
          if (isCardInvincible(chosenCard)) {
            events.push({
              type: 'invincible_block',
              side: chosenSide,
              lane: chosenLane,
            });
            effectiveDmg = 0;
          }

          if (effectiveDmg > 0) {
            let damageApplied = false;
            if (
              canTakeDamage(chosenCard, effectiveDmg, false, state, chosenSide)
            ) {
              chosenCard.currentPower -= effectiveDmg;
              damageApplied = true;
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
            if (
              damageApplied &&
              originalTarget &&
              hasSkill(originalTarget, 'deadly')
            ) {
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
        if (isValkyriaGuardActive(state, defSide)) {
          events.push({
            type: 'valkyria_guard_block',
            side: defSide,
            amount: dmgToDef,
            source: 'possession',
          });
        } else {
          defHP -= dmgToDef;
          events.push({
            type: 'damage_player',
            side: defSide,
            amount: dmgToDef,
            source: 'possession',
            lane: dLane,
          });
          // 憑依により相手リーダーに戦闘ダメージが肩代わりされたため、簒奪（extort）を発動
          applyExtort(aC, defSide, attackerSide, aLane, events, state);
          if (hasSkill(aC, 'absorb')) {
            const healAmt = Math.floor(dmgToDef / 2);
            healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
          }
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
        damageLeader(
          state,
          attackerSide,
          dmgToAtk,
          'possession',
          events,
          aLane
        );
        // 加護でダメージが無効化された場合、簒奪・吸収は発動しない（最優先ルール）
        if (!isValkyriaGuardActive(state, attackerSide)) {
          // 反撃の戦闘ダメージが憑依により肩代わりされたため、反撃側の簒奪・吸収を発動
          if (originalTarget && hasSkill(originalTarget, 'extort')) {
            applyExtort(
              originalTarget,
              attackerSide,
              defSide,
              l,
              events,
              state
            );
          }
          if (originalTarget && hasSkill(originalTarget, 'absorb')) {
            const healAmt = Math.floor(dmgToAtk / 2);
            defHP = healDefenderLeaderHP(
              state,
              defHP,
              defSide,
              attackerSide === 'blue' ? state.enemyMaxHP : state.playerMaxHP,
              healAmt,
              'absorb',
              events,
              dLane
            );
          }
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
      dC.hasTakenDamage = true;

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
      aC_defend.hasTakenDamage = true;
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
      healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
    }
    if (dmgToAtk > 0 && originalTarget && hasSkill(originalTarget, 'absorb')) {
      const healAmt = Math.floor(dmgToAtk / 2);
      defHP = healDefenderLeaderHP(
        state,
        defHP,
        defSide,
        attackerSide === 'blue' ? state.enemyMaxHP : state.playerMaxHP,
        healAmt,
        'absorb',
        events,
        dLane
      );
    }

    if (hasSkill(aC, 'pierce')) {
      let effectiveAP = hasSkill(aC, 'double_strike') ? aP * 2 : aP;
      let pDmg = Math.max(0, effectiveAP - originalTargetPower);
      if (pDmg > 0) {
        if (isValkyriaGuardActive(state, defSide)) {
          events.push({
            type: 'valkyria_guard_block',
            side: defSide,
            amount: pDmg,
            source: 'pierce',
          });
        } else {
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
            healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
          }
        }
      }
    }

    // 魂縛
    let aD = aC_defend.currentPower <= 0,
      dD = dC.currentPower <= 0;
    if (dD && aC.currentPower > 0) {
      if (hasSkill(aC, 'soul_bind')) {
        const val = getSkillValue(aC, 'soul_bind') || 2;
        const isReversed = isReverseActive(state);
        const gain = val * (isReversed ? -1 : 1);
        aC.currentPower += gain;
        events.push({
          type: 'power_change',
          side: attackerSide,
          lane: l,
          amount: gain,
          source: 'soul_bind',
          isReversed,
        });
      }
    }
    const counterSoulBindCard =
      originalTarget && originalTarget.currentPower > 0 ? originalTarget : null;
    if (aD && counterSoulBindCard) {
      if (hasSkill(counterSoulBindCard, 'soul_bind')) {
        const val = getSkillValue(counterSoulBindCard, 'soul_bind') || 2;
        const isReversed = isReverseActive(state);
        const gain = val * (isReversed ? -1 : 1);
        counterSoulBindCard.currentPower += gain;
        events.push({
          type: 'power_change',
          side: defSide,
          lane: l,
          amount: gain,
          source: 'soul_bind',
          isReversed,
        });
      }
    }
  } else {
    let finalDmg = aP;
    if (isValkyriaGuardActive(state, defSide)) {
      events.push({
        type: 'valkyria_guard_block',
        side: defSide,
        amount: finalDmg,
        source: 'direct_attack',
      });
      finalDmg = 0;
    } else {
      defHP -= finalDmg;
      if (isPhaseBypass) {
        state.phaseBypassDamageTaken =
          (state.phaseBypassDamageTaken || 0) + finalDmg;
      }
      events.push({
        type: 'damage_player',
        side: defSide,
        amount: finalDmg,
        source: 'direct_attack',
        isPhaseBypass,
      });
      applyExtort(aC, defSide, attackerSide, aLane, events, state);
    }

    if (finalDmg > 0 && hasSkill(aC, 'absorb')) {
      const healAmt = Math.floor(finalDmg / 2);
      healLeader(state, attackerSide, healAmt, 'absorb', events, aLane);
    }
  }

  if (attackerSide === 'blue') state.enemyHP = defHP;
  else state.playerHP = defHP;

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


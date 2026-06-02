import { AI_SKILL_UTILITY } from '../utils/constants/aiSkillValues.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  getSeededRandom,
  hasSkill,
  mergeCardSkills,
} from '../utils/gameUtils.js';
import {
  applyActiveSkillLogic,
  applyLeaderSkillLogic,
  applyPassiveSkillLogic,
  calculateCombatPhase,
  isGraveKeeperActive,
} from './engine.js';
import { GameState } from '../state/gameState.js';
import { ACTIVE_SKILLS } from '../utils/constants/skills.js';

// 判定補助: カードが何らかのアクティブスキルを持っているか（シミュレーション時の一時的な破壊を防ぐため）
function hasActiveSkill(c) {
  if (!c) return false;
  return ACTIVE_SKILLS.some((s) => hasSkill(c, s));
}

/**
 * 【号令（call）・変身（metamorph）のAIシミュレーション仕様】
 *
 * ■ 号令（call）:
 *   デッキトップのカードを場に出すスキルだが、シミュレーション時点ではデッキ内容が不明なため、
 *   「callの値（skillValue）分のパワーを、号令を持つカード自身に仮加算」して評価する。
 *   例: パワー3 + 号令3 → パワー6として戦闘シミュレーションに投入。
 *
 *   実際に号令が発動する際（skillLogic.js）には、デッキトップの実カードが判明するため、
 *   evaluateAdhocTokenLanes() でシミュレーションベースの最適レーン選択を行う。
 *   この時点では号令元カードは「本来のパワー」で盤面に存在している（GameStateから読むため）。
 *   また、号令によるカード配置はリーダースキルの発動タイミングが過ぎているため、
 *   リーダースキルは使用しないシミュレーションとなる。
 *
 * ■ 変身（metamorph）:
 *   全カードからランダムに1枚に変身するスキルだが、結果が不明なため、
 *   METAMORPH_ESTIMATED_POWER（定数）のパワーとして仮評価する。
 *
 * ■ 号令で呼ばれたカードが号令や変身を持つ場合:
 *   evaluateAdhocTokenLanes() 内でもスキル実行ループに同じ仮評価ロジックを適用しているため、
 *   号令で出されたカードがさらに号令や変身を持っていても、同じルールで正しく評価される。
 */
const METAMORPH_ESTIMATED_POWER = 5;

const cloneCard = (c) => (c ? structuredClone(c) : null);

const getCombinations = (arr, k) => {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  let results = [];
  for (let i = 0; i <= arr.length - k; i++) {
    let sub = getCombinations(arr.slice(i + 1), k - 1);
    for (let s of sub) results.push([arr[i], ...s]);
  }
  return results;
};

/**
 * 【AI設計の絶対原則 - グローバルルール】
 * ノーマル以上のAIは、実行可能な全ての選択肢（手札、配置レーン、スキルによる対象選択、分岐）を
 * 網羅的に検証しなければならない。
 *
 * 1. 召喚位置の全レーン検証。
 * 2. 復活・回収対象の全カード検証。
 * 3. スキル選択（引抜・復活・回収等）の全組み合わせ検証。
 *
 * 計算コストの削減のためにシミュレーションの質を落とすことは、このAIにおいて許容されない。
 */

export function processActionSequence(
  actionQueue,
  isLeaderSkillPlay = false,
  leaderSkillActionStr = null,
  leaderSkillTokenLanes = null,
  skillOrderTiming = 'before',
  leaderSkillTargetIdx = null,
  leaderSkillTargetUid = null,
  initialSimState = null
) {
  let simState = initialSimState;
  if (!simState) {
    simState = {
      playerBoard: GameState.playerBoard.map(cloneCard),
      enemyBoard: GameState.enemyBoard.map(cloneCard),
      playerDiscard: GameState.playerDiscard
        ? GameState.playerDiscard.map(cloneCard)
        : [],
      enemyDiscard: GameState.enemyDiscard
        ? GameState.enemyDiscard.map(cloneCard)
        : [],
      playerSealedLanes: [...(GameState.playerSealedLanes || [0, 0, 0])],
      enemySealedLanes: [...(GameState.enemySealedLanes || [0, 0, 0])],
      playerHP: GameState.playerHP,
      enemyHP: GameState.enemyHP,
      playerMaxHP: GameState.playerMaxHP || 25,
      enemyMaxHP: GameState.enemyMaxHP || 25,
      playerSP: GameState.playerSP || 0,
      enemySP: GameState.enemySP || 0,
      playerHand: GameState.playerHand
        ? GameState.playerHand.map(cloneCard)
        : [],
      enemyHand: GameState.enemyHand ? GameState.enemyHand.map(cloneCard) : [],
      playerDeck: GameState.playerDeck
        ? GameState.playerDeck.map(cloneCard)
        : [],
      enemyDeck: GameState.enemyDeck ? GameState.enemyDeck.map(cloneCard) : [],
      extraTurnCount: GameState.extraTurnCount || 0,
      attackSkipCount: GameState.attackSkipCount || 0,
      combatDamageTaken: 0,
      lastCardPlayed: null,
      lastPlayedLane: -1,
      _actionQueue: [],
    };
  }

  [simState.playerBoard, simState.enemyBoard].forEach((b) => {
    b.forEach((c) => {
      if (c) {
        if (c.currentPower === undefined || c.currentPower === null) {
          c.currentPower = c.power || 0;
        }
        c.isSkillResolving = false; // シミュレート空間ではアニメーション待ちの保護フラグを無効化
      }
    });
  });

  if (
    isLeaderSkillPlay &&
    skillOrderTiming === 'before' &&
    leaderSkillActionStr
  ) {
    simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
    applyLeaderSkillLogic(
      simState,
      'red',
      leaderSkillActionStr,
      leaderSkillTokenLanes,
      [],
      leaderSkillTargetIdx,
      leaderSkillTargetUid
    );
    if (simState._actionQueue && simState._actionQueue.length > 0) {
      actionQueue.unshift(...simState._actionQueue);
      delete simState._actionQueue;
    }
    // リーダースキル適用後、パワー0以下のカードを破壊済みとしてnullにする
    // （targeted_destruction等はcurrentPowerを0にするだけなので、制約チェックが正しく機能するよう反映）
    for (let i = 0; i < 3; i++) {
      if (simState.playerBoard[i] && simState.playerBoard[i].currentPower <= 0)
        simState.playerBoard[i] = null;
      if (simState.enemyBoard[i] && simState.enemyBoard[i].currentPower <= 0)
        simState.enemyBoard[i] = null;
    }
  }

  for (let action of actionQueue) {
    if (action.type === 'pass') continue;
    // choice/forceノードはメタ情報のみ（choices指定）で、カード配置には関与しない
    if (action.type === 'choice' || action.type === 'force') continue;

    // 連鎖召喚の子プレイ（またはスキップ）が始まったら、親カードの保護フラグを解除し、パワー0以下なら破壊する
    if (
      action.type === 'invite' ||
      action.type === 'chant' ||
      action.type === 'forge'
    ) {
      for (let i = 0; i < 3; i++) {
        const c = simState.enemyBoard[i];
        if (c && c.isSkillResolving) {
          if (
            hasSkill(c, 'invite') ||
            hasSkill(c, 'chant') ||
            hasSkill(c, 'forge')
          ) {
            c.isSkillResolving = false;
            if (c.currentPower <= 0) {
              simState.enemyBoard[i] = null;
            }
          }
        }
      }
    }

    if (action.type === 'discard') {
      if (simState.enemyHand[action.targetIdx]) {
        simState.enemyDiscard.push(simState.enemyHand[action.targetIdx]);
        simState.enemyHand[action.targetIdx] = null;
      }
      continue;
    }

    const tIdx = action.targetIdx;
    const lIdx = action.laneIdx;
    let playedCard = null;

    if (simState.enemySealedLanes[lIdx] > 0) return null;

    let checkConstraints = false;
    let triggerSkills = true;

    if (
      action.type === 'play' ||
      action.type === 'invite' ||
      action.type === 'chant' ||
      action.type === 'forge' ||
      action.type === 'play_adhoc'
    ) {
      // laneIdx=-1 は「このスキルをスキップ」のセンチネル値（chant/invite/forge/play_adhoc用）
      // 実行時と同様に手札を消費せずスキップする
      if (
        lIdx === -1 &&
        (action.type === 'invite' ||
          action.type === 'chant' ||
          action.type === 'forge' ||
          action.type === 'play_adhoc')
      ) {
        continue;
      }
      if (action.type === 'play_adhoc') {
        playedCard = cloneCard(action.card);
        checkConstraints =
          action.checkConstraints !== undefined
            ? action.checkConstraints
            : true;
      } else {
        playedCard = cloneCard(simState.enemyHand[tIdx]);
        if (action.type === 'forge') {
          const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
            name: '虚空',
            power: 0,
          };
          simState.enemyHand.push(cloneCard(voidTpl));
        }
        checkConstraints = true;
        if (simState.enemyHand[tIdx]) simState.enemyHand[tIdx] = null;
      }
      simState.lastPlayedLane = lIdx;
    } else if (action.type === 'token_placement') {
      const sourceL =
        simState.lastPlayedLane !== -1 ? simState.lastPlayedLane : 0;
      const sourceCard = simState.enemyBoard[sourceL];
      // パワー0カードが破壊済みの場合、applyActiveSkillLogic は c=null で即リターンするため
      // summonId が分かっているなら直接トークンを生成する
      if (['summon', 'clone', 'split', 'puppet'].includes(action.skillId)) {
        let tokenPower = action.skillValue || 1;
        if (action.skillId === 'clone' && sourceCard) {
          tokenPower =
            sourceCard.currentPower !== undefined
              ? sourceCard.currentPower
              : sourceCard.power || 0;
        }
        let tokenId = action.summonId;
        if (!tokenId) {
          if (action.skillId === 'puppet') {
            tokenId = 'token_doll';
          } else if (action.skillId === 'clone') {
            tokenId = 'token_clone';
          } else {
            // summon / split のフォールバック（summonIdが未指定の場合）
            tokenId = tokenPower >= 5 ? 'token_golem' : 'token_drone';
          }
        }
        const baseMaster = CARD_MASTER.find((m) => m.id === tokenId);
        const lanes = [...(action.lanes || [])];
        for (const tLane of lanes) {
          const sealedLanes = simState.enemySealedLanes || [0, 0, 0];
          if (sealedLanes[tLane] > 0) continue;
          // cloneトークンは元カードのスキルを引き継ぐ（分身含む全スキル）
          // 分身(clone)は召喚時にしか発動しないため、コピーしても影響がない
          let inheritedSkills = [];
          if (action.skillId === 'clone' && sourceCard) {
            if (sourceCard.skill && sourceCard.skill !== 'none') {
              inheritedSkills.push({
                id: sourceCard.skill,
                value: sourceCard.skillValue,
              });
            }
            if (Array.isArray(sourceCard.skills)) {
              inheritedSkills = inheritedSkills.concat(sourceCard.skills);
            }
          }
          const newToken = {
            id: `sm_sim_${Math.floor(getSeededRandom() * 1000000000)}`,
            baseId: tokenId,
            name: baseMaster?.name || 'トークン',
            isToken: true,
            rarity: 1,
            owner: 'red',
            imgUrl: `assets/cards/card_${tokenId}.jpg`,
            power: tokenPower,
            basePower: tokenPower,
            currentPower: tokenPower,
            voiceCategory: baseMaster?.voiceCategory || 'monster',
            skills: inheritedSkills,
          };
          // 【装備(equip) / 武装(arm_self)】トークンの装備合体をシミュレート
          const existingCard = simState.enemyBoard[tLane];
          if (
            existingCard &&
            (hasSkill(newToken, 'equip') ||
              hasSkill(existingCard, 'arm_self')) &&
            !hasSkill(existingCard, 'possession') &&
            !hasSkill(newToken, 'possession') &&
            !hasSkill(existingCard, 'reflect') &&
            !hasSkill(newToken, 'reflect')
          ) {
            // 装備合体: パワー加算 + スキル統合
            existingCard.basePower =
              (existingCard.basePower || 0) + (newToken.currentPower || 0);
            existingCard.currentPower =
              (existingCard.currentPower || 0) + (newToken.currentPower || 0);
            // トークンのスキルを統合（equip自体は除外）
            let addedSkills = [];
            if (newToken.skills) {
              newToken.skills.forEach((s) => {
                if (s.id !== 'equip') addedSkills.push(s);
              });
            }
            if (addedSkills.length > 0) {
              mergeCardSkills(existingCard, addedSkills);
            }
          } else if (existingCard) {
            // 装備不可: 既存カードを墓地に移動して上書き
            simState.enemyDiscard.push(existingCard);
            simState.enemyBoard[tLane] = null;
            simState.enemyBoard[tLane] = newToken;
          } else {
            // 空きレーン: そのまま配置
            simState.enemyBoard[tLane] = newToken;
          }
        }
      } else {
        // 【重要】action.lanes のコピーを渡す。applyActiveSkillLogic 内部で shift() により
        // 配列が消費されるため、元配列をそのまま渡すと actionQueue に空配列が残り、
        // 実行時の skillLogic.js でレーン指定が取得できなくなる。
        applyActiveSkillLogic(
          simState,
          'red',
          sourceL,
          action.skillId,
          action.skillValue || 0,
          [],
          [...(action.lanes || [])],
          undefined
        );
      }
      continue;
    } else if (action.type === 'resurrect') {
      if (isGraveKeeperActive(simState)) return null;
      if (lIdx === -1) continue; // 明示的キャンセル
      // 【重要】UID優先照合: リーダースキルのspliceでインデックスがずれる問題を回避
      let resIdx = -1;
      if (action.targetUid) {
        resIdx = simState.enemyDiscard.findIndex(
          (c) =>
            c && (c.baseId === action.targetUid || c.id === action.targetUid)
        );
      }
      if (resIdx === -1 && action.targetIdx !== undefined) {
        resIdx = action.targetIdx;
      }
      if (resIdx === -1 || !simState.enemyDiscard[resIdx]) return null;
      playedCard = cloneCard(simState.enemyDiscard[resIdx]);
      simState.lastPlayedLane = lIdx;
      if (playedCard && action.maxP !== undefined) {
        const master = CARD_MASTER.find(
          (m) => m.id === playedCard.id || m.id === playedCard.baseId
        );
        const baseP = master ? master.power : playedCard.power || 0;
        if (baseP > action.maxP) return null; // 制限オーバーは不正として棄却
      }
      checkConstraints = false;
      triggerSkills = false;
      if (playedCard) playedCard.skillTriggered = true;
      simState.enemyDiscard[resIdx] = null;
    } else if (action.type === 'dominate') {
      const oppL = action.oppLaneIdx;
      const myL = action.myLaneIdx;
      if (oppL !== -1 && myL !== -1) {
        // 移動先レーン（自分側）が封印されている場合はシミュレーション上でも無効（棄却）
        if (simState.enemySealedLanes && simState.enemySealedLanes[myL] > 0)
          return null;

        const oppBoard = simState.playerBoard; // AI(自分)から見た相手は playerBoard
        const board = simState.enemyBoard; // AI(自分)のボード

        if (oppBoard[oppL]) {
          const selectedCard = cloneCard(oppBoard[oppL]);
          oppBoard[oppL] = null;

          selectedCard.puppetOriginalOwner =
            selectedCard.puppetOriginalOwner || selectedCard.owner || 'blue';
          if (
            selectedCard.equippedCards &&
            selectedCard.equippedCards.length > 0
          ) {
            selectedCard.equippedCards.forEach((eqCard) => {
              eqCard.puppetOriginalOwner =
                eqCard.puppetOriginalOwner || eqCard.owner || 'blue';
            });
          }

          if (
            board[myL] &&
            (hasSkill(selectedCard, 'equip') ||
              hasSkill(board[myL], 'arm_self'))
          ) {
            const targetCard = board[myL];
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
          } else {
            board[myL] = {
              ...selectedCard,
              owner: 'red',
              skillTriggered: true,
              stunTurns: selectedCard.stunTurns || 0,
              stunAppliedThisTurn: selectedCard.stunAppliedThisTurn || false,
            };
          }
        }
      }
      continue;
    } else if (action.type === 'salvage') {
      if (isGraveKeeperActive(simState)) return null;
      let resIdx = -1;
      if (action.targetUid)
        resIdx = simState.enemyDiscard.findIndex(
          (c) =>
            c && (c.baseId === action.targetUid || c.id === action.targetUid)
        );
      if (resIdx === -1 && action.targetIdx !== undefined)
        resIdx = action.targetIdx;
      if (resIdx === -1 || !simState.enemyDiscard[resIdx]) return null;

      let salvagedCard = cloneCard(simState.enemyDiscard[resIdx]);
      simState.enemyDiscard[resIdx] = null;
      simState.enemyHand.push(salvagedCard);
      continue; // 盤面には出さない
    } else if (
      action.type === 'devilhunter_resurrect' ||
      action.type === 'targeted_destruction' ||
      action.type === 'tomb_guard' ||
      action.type === 'death_judgment' ||
      action.type === 'elf_polarbear_combo'
    ) {
      // すでにapplyLeaderSkillLogicによって、盤面への配置や合体・装備処理は「完了」している。
      // したがって、アクションループの残りの処理（盤面の上書きやスキルの再発動）は行わず、
      // 次のアクションのシミュレートへ移るためにcontinueする。
      continue;
    } else if (action.type === 'leap') {
      // 【跳躍】追加ターンを1回付与（SP増加なし・攻撃なし）
      simState.extraTurnCount = (simState.extraTurnCount || 0) + 1;
      simState.attackSkipCount = (simState.attackSkipCount || 0) + 1;
      continue;
    }

    if (!playedCard) return null;

    if (checkConstraints) {
      if (
        hasSkill(playedCard, 'challenge') &&
        simState.playerBoard[lIdx] === null
      )
        return null;
      if (
        hasSkill(playedCard, 'takeover') &&
        simState.enemyBoard[lIdx] === null
      )
        return null;
      if (hasSkill(playedCard, 'legendary') && lIdx !== 1) return null;
      if (
        hasSkill(playedCard, 'apex') &&
        !(
          simState.enemyBoard[lIdx] &&
          hasSkill(simState.enemyBoard[lIdx], 'legendary')
        )
      )
        return null;
    }

    // 【装備・配置共通】選択スキル（choice/force）を事前解決し、手札カードのスキル情報に反映する
    if (playedCard) {
      let resolvedSkills = [];
      let newSkillsArr = [];

      // 1. メインの単一スキル（skill）が choice / force の場合
      if (playedCard.skill && playedCard.skill !== 'none') {
        if (
          (playedCard.skill === 'choice' || playedCard.skill === 'force') &&
          action.choices &&
          playedCard.choices
        ) {
          action.choices.forEach((idx) => {
            if (playedCard.choices[idx]) {
              resolvedSkills.push({
                id: playedCard.choices[idx].id,
                value: playedCard.choices[idx].value,
              });
            }
          });
          playedCard.skill = 'none';
        }
      }

      // 2. 複数スキル配列（skills）内の各要素が choice / force の場合
      if (Array.isArray(playedCard.skills)) {
        playedCard.skills.forEach((sk) => {
          if (sk.id === 'choice' || sk.id === 'force') {
            if (
              sk.choiceGroup === 2 &&
              action.choices2 &&
              playedCard.choices2
            ) {
              action.choices2.forEach((idx) => {
                if (playedCard.choices2[idx]) {
                  newSkillsArr.push({
                    id: playedCard.choices2[idx].id,
                    value: playedCard.choices2[idx].value,
                  });
                }
              });
            } else if (action.choices && playedCard.choices) {
              action.choices.forEach((idx) => {
                if (playedCard.choices[idx]) {
                  newSkillsArr.push({
                    id: playedCard.choices[idx].id,
                    value: playedCard.choices[idx].value,
                  });
                }
              });
            }
          } else {
            newSkillsArr.push(sk);
          }
        });
      }

      // 3. 解決したスキルを playedCard に反映させる
      if (resolvedSkills.length > 0) {
        // メインスキルから解決された最初のものをメインスキルにセット、残りは skills 配列に追加する
        playedCard.skill = resolvedSkills[0].id;
        playedCard.skillValue = resolvedSkills[0].value;
        if (resolvedSkills.length > 1) {
          newSkillsArr = newSkillsArr.concat(resolvedSkills.slice(1));
        }
      }
      playedCard.skills = newSkillsArr;
    }

    let skillWasHandledByEquip = false;
    if (
      (hasSkill(playedCard, 'equip') ||
        hasSkill(simState.enemyBoard[lIdx], 'arm_self')) &&
      simState.enemyBoard[lIdx]
    ) {
      skillWasHandledByEquip = true;
      const targetCard = simState.enemyBoard[lIdx];
      targetCard.basePower =
        (targetCard.basePower || 0) + (playedCard.power || 0);
      targetCard.currentPower =
        (targetCard.currentPower || 0) + (playedCard.power || 0);
      let addedSkills = [];
      if (
        playedCard.skill &&
        playedCard.skill !== 'none' &&
        playedCard.skill !== 'equip'
      )
        addedSkills.push({
          id: playedCard.skill,
          value: playedCard.skillValue,
        });
      if (playedCard.skills)
        playedCard.skills.forEach((s) => {
          if (s.id !== 'equip') addedSkills.push({ id: s.id, value: s.value });
        });
      mergeCardSkills(targetCard, addedSkills);
      let cLanesForEquip = action.cardTokenLanes
        ? [...action.cardTokenLanes]
        : null;
      applyActiveSkillLogic(
        simState,
        'red',
        lIdx,
        'equip',
        0,
        [],
        cLanesForEquip,
        lIdx
      ); // 装備によるバフと付随スキルのシミュレート
      if (simState._actionQueue && simState._actionQueue.length > 0) {
        actionQueue.push(...simState._actionQueue);
        delete simState._actionQueue;
      }

      // 【修正】装備カードが持っていた追加アクティブスキル（事前解決された選択スキル等含む）を順次実行シミュレートする
      addedSkills.forEach((sk) => {
        // 配置系・復活系スキルは buildSkillBranch 内のアクションで個別管理するため、ここでは即時実行をスキップする
        if (
          ['clone', 'summon', 'split', 'puppet', 'resurrect'].includes(sk.id)
        ) {
          return;
        }
        applyActiveSkillLogic(
          simState,
          'red',
          lIdx,
          sk.id,
          sk.value,
          [],
          cLanesForEquip,
          undefined
        );
        if (simState._actionQueue && simState._actionQueue.length > 0) {
          actionQueue.push(...simState._actionQueue);
          delete simState._actionQueue;
        }
      });
    }

    if (!skillWasHandledByEquip) {
      let activeCardForSkills = playedCard;
      const unionSkill =
        playedCard.skills && playedCard.skills.find((s) => s.id === 'union');
      if (
        unionSkill &&
        simState.enemyBoard[lIdx] &&
        (simState.enemyBoard[lIdx].baseId === unionSkill.targetId ||
          simState.enemyBoard[lIdx].id === unionSkill.targetId)
      ) {
        const masterData =
          CARD_MASTER.find((c) => c.id === unionSkill.summonId) ||
          CARD_MASTER.find((c) => c.id === 'android');
        let unionCard = JSON.parse(JSON.stringify(masterData));
        unionCard.uid = 'sim_union_' + Math.floor(Math.random() * 1000000);
        unionCard.owner = 'red';
        unionCard.baseId = unionCard.id;
        unionCard.basePower = unionCard.power;
        unionCard.currentPower = unionCard.power;
        unionCard.stunTurns = 0;
        simState.enemyBoard[lIdx] = unionCard;
        activeCardForSkills = unionCard;
      } else {
        if (
          playedCard.currentPower === undefined ||
          Number.isNaN(playedCard.currentPower) ||
          (playedCard.currentPower <= 0 && (playedCard.power || 0) > 0)
        ) {
          playedCard.currentPower = playedCard.power || 0;
          playedCard.basePower = playedCard.power || 0;
        }
        simState.enemyBoard[lIdx] = playedCard;
      }

      // 出現時スキルを持つ場合は即座に保護フラグを立てる（シミュレーション時も同様に一時的な破壊を防ぐ）
      if (hasActiveSkill(activeCardForSkills)) {
        activeCardForSkills.isSkillResolving = true;
      }

      let skills = [];
      let modifiedSkillsForCard = [];
      if (activeCardForSkills.skill && activeCardForSkills.skill !== 'none') {
        if (
          (activeCardForSkills.skill === 'choice' ||
            activeCardForSkills.skill === 'force') &&
          action.choices &&
          activeCardForSkills.choices
        ) {
          action.choices.forEach((idx) => {
            if (activeCardForSkills.choices[idx]) {
              let sk = {
                id: activeCardForSkills.choices[idx].id,
                value: activeCardForSkills.choices[idx].value,
              };
              skills.push(sk);
              modifiedSkillsForCard.push(sk);
            }
          });
          activeCardForSkills.skill = 'none';
        } else {
          skills.push({
            id: activeCardForSkills.skill,
            value: activeCardForSkills.skillValue,
          });
        }
      }

      let newSkillsArr = [];
      if (Array.isArray(activeCardForSkills.skills)) {
        activeCardForSkills.skills.forEach((sk) => {
          if (sk.id === 'choice' || sk.id === 'force') {
            if (
              sk.choiceGroup === 2 &&
              action.choices2 &&
              activeCardForSkills.choices2
            ) {
              action.choices2.forEach((idx) => {
                if (activeCardForSkills.choices2[idx]) {
                  let chosenSk = {
                    id: activeCardForSkills.choices2[idx].id,
                    value: activeCardForSkills.choices2[idx].value,
                  };
                  skills.push(chosenSk);
                  newSkillsArr.push(chosenSk);
                }
              });
            } else if (action.choices && activeCardForSkills.choices) {
              action.choices.forEach((idx) => {
                if (activeCardForSkills.choices[idx]) {
                  let chosenSk = {
                    id: activeCardForSkills.choices[idx].id,
                    value: activeCardForSkills.choices[idx].value,
                  };
                  skills.push(chosenSk);
                  newSkillsArr.push(chosenSk);
                }
              });
            }
          } else {
            skills.push(sk);
            newSkillsArr.push(sk);
          }
        });
        activeCardForSkills.skills = [
          ...newSkillsArr,
          ...modifiedSkillsForCard,
        ];
      } else if (modifiedSkillsForCard.length > 0) {
        activeCardForSkills.skills = [...modifiedSkillsForCard];
      }

      if (triggerSkills && !activeCardForSkills.skillTriggered) {
        skills.forEach((sk) => {
          if (['draw', 'heal', 'bless', 'morph', 'shuffle'].includes(sk.id)) {
            simState.actionUtilityBonus =
              (simState.actionUtilityBonus || 0) +
              (AI_SKILL_UTILITY[sk.id] || 0);
          }
          if (sk.id === 'call') {
            const callBonus = sk.value || 3;
            const boardCard = simState.enemyBoard[lIdx];
            if (boardCard) {
              boardCard.currentPower =
                (boardCard.currentPower || 0) + callBonus;
              boardCard.basePower = (boardCard.basePower || 0) + callBonus;
            }
          } else if (sk.id === 'metamorph') {
            const boardCard = simState.enemyBoard[lIdx];
            if (boardCard) {
              boardCard.currentPower = METAMORPH_ESTIMATED_POWER;
              boardCard.basePower = METAMORPH_ESTIMATED_POWER;
            }
          } else if (sk.id === 'leap') {
            simState.extraTurnCount = (simState.extraTurnCount || 0) + 1;
            simState.attackSkipCount = (simState.attackSkipCount || 0) + 1;
          } else if (
            ![
              'invite',
              'chant',
              'convert',
              'draw',
              'salvage',
              'reinforce',
              'puppet',
              'summon',
              'resurrect',
              'awake',
              'clone',
              'split',
            ].includes(sk.id)
          ) {
            applyActiveSkillLogic(
              simState,
              'red',
              lIdx,
              sk.id,
              sk.value,
              [],
              action.cardTokenLanes ? [...action.cardTokenLanes] : null,
              undefined
            );
          }
        });
        if (simState._actionQueue && simState._actionQueue.length > 0) {
          actionQueue.push(...simState._actionQueue);
          delete simState._actionQueue;
        }
      }

      // スキル解決が終わったため、保護フラグを解除する
      // 【招来・詠唱・鍛造】これらの連続プレイを伴う出現時スキルの場合は、
      // 次の追加プレイアクションが実行されるまで保護フラグ（isSkillResolving）を維持する
      if (activeCardForSkills) {
        const hasChainSummon =
          hasSkill(activeCardForSkills, 'invite') ||
          hasSkill(activeCardForSkills, 'chant') ||
          hasSkill(activeCardForSkills, 'forge');
        if (!hasChainSummon) {
          activeCardForSkills.isSkillResolving = false;
        }
      }

      // 出現時スキルの処理中（isSkillResolvingがtrue）のカードは、パワー0以下でも破壊（null化）しない
      if (
        simState.enemyBoard[lIdx] &&
        simState.enemyBoard[lIdx].currentPower <= 0 &&
        !simState.enemyBoard[lIdx].isSkillResolving
      ) {
        simState.enemyBoard[lIdx] = null;
      }
    }
  }

  const hpBeforeCombat = simState.enemyHP;

  if (!(simState.extraTurnCount > 0)) {
    // 【修正】プレイヤーのターン開始に伴い、プレイヤー側カードの「無敵（invincible）」スキル持続ターンを減退・解除する
    simState.playerBoard.forEach((c) => {
      if (!c) return;

      // 1. メインの skill フィールドが invincible の場合
      if (c.skill === 'invincible') {
        c.skillValue = (c.skillValue || 1) - 1;
        if (c.skillValue <= 0) {
          c.skill = 'none';
          c.skillValue = 0;
        }
      }

      // 2. skills 配列内に invincible がある場合
      if (Array.isArray(c.skills)) {
        const invSk = c.skills.find((s) => s.id === 'invincible');
        if (invSk) {
          invSk.value--;
          if (invSk.value <= 0) {
            c.skills = c.skills.filter((s) => s !== invSk);
          }
        }
      }
    });

    applyPassiveSkillLogic(simState, 'blue');
    simState.playerBoard.forEach((c) => {
      if (c && c.stunTurns > 0) c.stunTurns--;
    });
    calculateCombatPhase(simState, 'blue');
    simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);
  } else {
    simState.extraTurnCount--;
    simState.combatDamageTaken = 0;
  }

  return simState;
}

export function getBestSimulatedMove() {
  const hand = GameState.enemyHand.map(cloneCard);
  const discard = GameState.enemyDiscard.map(cloneCard);
  let myBoard = GameState.enemyBoard.map(cloneCard);
  let opBoard = GameState.playerBoard.map(cloneCard);

  let mySP = GameState.enemySP || 0;
  const mySealedLanes = GameState.enemySealedLanes || [0, 0, 0];

  const canUseSkill =
    GameState.enemyConfig.leaderSkill &&
    mySP >= GameState.enemyConfig.leaderSkill.cost &&
    !GameState.enemyConfig.leaderSkillUsableTurns?.includes(
      GameState.turnCount
    ) &&
    !GameState.enemyConfig.leaderSkillUsed;
  const skill = GameState.enemyConfig.leaderSkill;

  function buildCardPlayTree(
    card,
    sourceIdx,
    sourceType,
    originalHand,
    originalDiscard,
    usedHand,
    usedDiscard,
    depth,
    forcedLane = undefined
  ) {
    if (depth >= 2) return [[]];

    let availableLanes = [0, 1, 2].filter((l) => mySealedLanes[l] === 0);

    if (forcedLane !== undefined) {
      if (mySealedLanes[forcedLane] > 0) return [[]];
      availableLanes = [forcedLane];
    } else if (depth > 0) {
      availableLanes.push(-1);
    }

    // 【召喚制約の事前フィルタリング】
    // processActionSequence にも同等のチェックがあるが、ここで弾くことで
    // ・リーダースキルで相手カードが消えた後の「挑戦」違反ノードの生成を防ぐ
    // ・無効な候補によるシミュレーション負荷を削減する
    // 注意: depth > 0 で push(-1) された「スキップレーン（-1）」は制約対象外とする
    if (
      sourceType === 'play' ||
      sourceType === 'invite' ||
      sourceType === 'chant'
    ) {
      // 1ターン目の「召喚」アクションは中央のみ（親・子カード共通）
      if (GameState.turnCount === 1 && GameState.firstPlayer === 'red') {
        availableLanes = availableLanes.filter((l) => l === -1 || l === 1);
      }

      // 挑戦: 正面に相手カードがあるレーンのみ
      if (hasSkill(card, 'challenge')) {
        availableLanes = availableLanes.filter(
          (l) => l === -1 || opBoard[l] !== null
        );
      }
      // 伝説: 中央（レーン1）のみ
      if (hasSkill(card, 'legendary')) {
        availableLanes = availableLanes.filter((l) => l === -1 || l === 1);
      }
      // 生贄・頂点: invite時は親カードが同レーンに配置済みだがmyBoardには未反映のため、
      // プリフィルタをスキップしprocessActionSequenceの正確なsimStateチェックに委ねる
      if (sourceType !== 'invite' && sourceType !== 'chant') {
        // 生贄: 既にカードが置かれているレーンのみ
        if (hasSkill(card, 'takeover')) {
          availableLanes = availableLanes.filter(
            (l) => l === -1 || myBoard[l] !== null
          );
        }
        // 頂点: 自分の場に「伝説」を持つカードがいるレーンのみ
        if (hasSkill(card, 'apex')) {
          availableLanes = availableLanes.filter(
            (l) => l === -1 || (myBoard[l] && hasSkill(myBoard[l], 'legendary'))
          );
        }
      }
    }

    // 制約フィルタ後に有効なレーンが0になった場合は空を返す（スキップレーン-1のみなら branches は[[]]扱い）
    if (
      availableLanes.filter((l) => l !== -1).length === 0 &&
      !availableLanes.includes(-1)
    )
      return [[]];

    let choiceCombinations = [undefined];
    let choice2Combinations = [undefined];
    if (hasSkill(card, 'choice') || hasSkill(card, 'force')) {
      // 「増幅」パッシブによる選択数ボーナス（自分の場に amplify があれば+1）
      const amplifyBonus = myBoard.filter(
        (bc) => bc && hasSkill(bc, 'amplify')
      ).length;
      if (Array.isArray(card.choices)) {
        let cc = 1;
        if (card.skill === 'choice' || card.skill === 'force')
          cc = card.skillValue || 1;
        else if (card.skills) {
          const c = card.skills.find(
            (s) => s.id === 'choice' || s.id === 'force'
          );
          if (c) cc = c.value || 1;
        }
        cc = Math.min(cc + amplifyBonus, card.choices.length);
        const idxs = card.choices.map((_, i) => i);
        choiceCombinations = getCombinations(idxs, Math.min(idxs.length, cc));
      }
      if (Array.isArray(card.choices2)) {
        let cc2 = 1;
        const c2 = card.skills
          ? card.skills.find((s) => s.id === 'choice' && s.choiceGroup === 2)
          : null;
        if (c2) cc2 = c2.value || 1;
        cc2 = Math.min(cc2 + amplifyBonus, card.choices2.length);
        const idxs2 = card.choices2.map((_, i) => i);
        choice2Combinations = getCombinations(
          idxs2,
          Math.min(idxs2.length, cc2)
        );
      }
    }

    // --- ループの外での静的な事前計算を削除し、内部で動的に計算するように変更 ---

    let branches = [];
    for (let lane of availableLanes) {
      for (let c1 of choiceCombinations) {
        for (let c2 of choice2Combinations) {
          // --- 動的な配置/ターゲットパターンの生成 ---
          let tc = 0;
          let tokenTargetCount = 0;

          // 基本性能からの集計
          const gatherCounts = (c) => {
            const skillsToGather = [];
            if (c.skill && c.skill !== 'none')
              skillsToGather.push({ id: c.skill, value: c.skillValue ?? 1 });
            if (Array.isArray(c.skills))
              c.skills.forEach((s) => skillsToGather.push(s));

            skillsToGather.forEach((sk) => {
              if (['snipe', 'artillery', 'seal'].includes(sk.id))
                tokenTargetCount += sk.value || 1;

              // 【重要仕様】スキルの値(value)の解釈：
              // ※ clone, summon は buildSkillBranch 内の token_placement で個別管理するため tc には含めない
              if (sk.id === 'resurrect') {
                // 復活: 値(value) = トークンのパワー / 個数は常に「1体」
                tc += 1;
              }
            });
          };
          gatherCounts(card);

          // 選択されたスキル（c1, c2）からの合算
          const countInChoices = (arr, group) => {
            if (!group || !arr) return;
            arr.forEach((idx) => {
              const sk = group[idx];
              if (!sk) return;
              if (['snipe', 'artillery', 'seal'].includes(sk.id))
                tokenTargetCount += sk.value || 1;
              // ※ clone, summon は buildSkillBranch 内の token_placement で個別管理するため tc には含めない
              // ※ call, metamorph は実行時の動的判断（アドホック）や自身への適用となるため、事前のレーン確保は不要
              if (sk.id === 'resurrect') tc += 1;
            });
          };
          countInChoices(c1, card.choices);
          countInChoices(c2, card.choices2);

          let tokenLanePatterns = [null];
          if (tc > 0) {
            // 召喚先候補から、今カードを置こうとしている「lane」自身を除外する
            let possibleLanes = [0, 1, 2].filter(
              (l) => mySealedLanes[l] === 0 && l !== lane
            );
            let combs = []; // 配置は0件不可（最低限tc分、あるいは全埋め）
            for (
              let k = Math.min(possibleLanes.length, tc);
              k <= Math.min(possibleLanes.length, tc);
              k++
            ) {
              combs.push(...getCombinations(possibleLanes, k));
            }
            if (combs.length > 0) tokenLanePatterns = combs;
          } else if (tokenTargetCount > 0) {
            let occupied = opBoard
              .map((c, i) => (c ? i : -1))
              .filter((i) => i !== -1);
            let combs = [];
            for (
              let k = 1;
              k <= Math.min(occupied.length, tokenTargetCount);
              k++
            ) {
              combs.push(...getCombinations(occupied, k));
            }
            if (combs.length > 0) tokenLanePatterns = combs;
          }

          for (let tLanes of tokenLanePatterns) {
            let node = {
              type: sourceType,
              targetIdx: sourceIdx,
              targetUid: card.uid || card.id,
              laneIdx: lane,
              choices: c1 !== undefined ? [...c1] : undefined,
              choices2: c2 !== undefined ? [...c2] : undefined,
              cardTokenLanes:
                tLanes && tLanes.length > 0 ? [...tLanes] : undefined,
            };
            // 【重要】lane === -1 は「このカードをスキップする」を意味する。
            // スキップ時はスキルブランチ（summon, clone等の子アクション）を
            // 生成してはならない。スキップノードのみを返す。
            if (lane === -1) {
              branches.push([node]);
              continue;
            }

            // 発動するスキル群を特定（召喚系アクションの場合のみ）
            let effectiveSkills = [];

            const isSummonAction = ['play', 'call', 'invite', 'chant'].includes(
              sourceType
            );
            if (isSummonAction) {
              // ※ awake（覚醒）はパッシブスキル（所有者のターン開始時発動）のため、ここには含めない
              if (
                [
                  'invite',
                  'chant',
                  'resurrect',
                  'convert',
                  'draw',
                  'reinforce',
                  'clone',
                  'summon',
                  'split',
                  'puppet',
                  'leap',
                ].includes(card.skill)
              ) {
                effectiveSkills.push({
                  id: card.skill,
                  value: card.skillValue ?? 1,
                });
              }
              if (Array.isArray(card.skills)) {
                card.skills.forEach((s) => {
                  // ※ awake（覚醒）はパッシブスキルのため除外
                  if (
                    [
                      'invite',
                      'chant',
                      'resurrect',
                      'convert',
                      'draw',
                      'reinforce',
                      'clone',
                      'summon',
                      'split',
                      'puppet',
                      'leap',
                    ].includes(s.id)
                  )
                    effectiveSkills.push(s);
                });
              }
              if (c1)
                c1.forEach((idx) => {
                  if (card.choices && card.choices[idx])
                    effectiveSkills.push(card.choices[idx]);
                });
              if (c2)
                c2.forEach((idx) => {
                  if (card.choices2 && card.choices2[idx])
                    effectiveSkills.push(card.choices2[idx]);
                });
            }

            const buildSkillBranch = (
              currentSkills,
              currentUsedHand,
              currentUsedDiscard,
              currentDepth,
              currentDiscardedFromHand = []
            ) => {
              if (currentSkills.length === 0 || currentDepth >= 4) return [[]];

              let sk = currentSkills[0];
              let remainingSkills = currentSkills.slice(1);
              let results = [];

              // 【共通】配置系スキル以外は常に「このスキルをキャンセル/スキップする」選択肢を考慮する
              const isPlacementSkill = [
                'clone',
                'summon',
                'split',
                'puppet',
                'resurrect',
              ].includes(sk.id);
              if (!isPlacementSkill) {
                results.push(
                  ...buildSkillBranch(
                    remainingSkills,
                    currentUsedHand,
                    currentUsedDiscard,
                    currentDepth,
                    currentDiscardedFromHand
                  )
                );
              }

              if (sk.id === 'invite') {
                for (let i = 0; i < originalHand.length; i++) {
                  if (currentUsedHand.includes(i)) continue;
                  let childCard = originalHand[i];
                  // 【招来】同じレーンに召喚する仕様のため、forcedLane = lane（親カードのレーン）を渡す
                  let children = buildCardPlayTree(
                    childCard,
                    i,
                    'invite',
                    originalHand,
                    originalDiscard,
                    [...currentUsedHand, i],
                    currentUsedDiscard,
                    currentDepth + 1,
                    lane
                  );
                  for (let cNode of children) {
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      [...currentUsedHand, i],
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscardedFromHand
                    );
                    for (let nb of nextBranches) {
                      results.push([...cNode, ...nb]);
                    }
                  }
                }
              } else if (sk.id === 'chant') {
                // 【詠唱】招来と違い全レーンが配置候補（forcedLaneなし）
                const maxP = sk.value ?? 3;
                for (let i = 0; i < originalHand.length; i++) {
                  if (currentUsedHand.includes(i)) continue;
                  let childCard = originalHand[i];
                  // パワー制限チェック
                  if ((childCard.power || 0) > maxP) continue;
                  // 【詠唱】全レーンが候補のためforcedLaneは渡さない
                  let children = buildCardPlayTree(
                    childCard,
                    i,
                    'chant',
                    originalHand,
                    originalDiscard,
                    [...currentUsedHand, i],
                    currentUsedDiscard,
                    currentDepth + 1
                  );
                  for (let cNode of children) {
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      [...currentUsedHand, i],
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscardedFromHand
                    );
                    for (let nb of nextBranches) {
                      results.push([...cNode, ...nb]);
                    }
                  }
                }
              } else if (sk.id === 'forge') {
                for (let i = 0; i < originalHand.length; i++) {
                  if (currentUsedHand.includes(i)) continue;
                  let childCard = originalHand[i];

                  const isEquip = hasSkill(childCard, 'equip');
                  let validLanes = [];
                  for (let j = 0; j < 3; j++) {
                    if (myBoard[j] !== null) {
                      if (isEquip || hasSkill(myBoard[j], 'arm_self')) {
                        validLanes.push(j);
                      }
                    }
                  }

                  for (let vLane of validLanes) {
                    let children = buildCardPlayTree(
                      childCard,
                      i,
                      'forge',
                      originalHand,
                      originalDiscard,
                      [...currentUsedHand, i],
                      currentUsedDiscard,
                      currentDepth + 1,
                      vLane
                    );
                    for (let cNode of children) {
                      let nextBranches = buildSkillBranch(
                        remainingSkills,
                        [...currentUsedHand, i],
                        currentUsedDiscard,
                        currentDepth,
                        currentDiscardedFromHand
                      );
                      for (let nb of nextBranches) {
                        results.push([...cNode, ...nb]);
                      }
                    }
                  }
                }

                // スキップのブランチも作る
                let nextBranches = buildSkillBranch(
                  remainingSkills,
                  currentUsedHand,
                  currentUsedDiscard,
                  currentDepth,
                  currentDiscardedFromHand
                );
                for (let nb of nextBranches) {
                  results.push([
                    { type: 'forge', targetIdx: -1, laneIdx: -1 },
                    ...nb,
                  ]);
                }
              } else if (sk.id === 'leap') {
                // 【跳躍】スキップせずに使用する分岐（追加ターン付与）
                // leapノードをアクションキューに追加
                let leapBranch = buildSkillBranch(
                  remainingSkills,
                  currentUsedHand,
                  currentUsedDiscard,
                  currentDepth,
                  currentDiscardedFromHand
                );
                for (let nb of leapBranch) {
                  results.push([{ type: 'leap' }, ...nb]);
                }
              } else if (sk.id === 'resurrect') {
                const maxP = sk.value || 1;
                const candidates = [
                  ...originalDiscard,
                  ...currentDiscardedFromHand,
                ];

                for (let i = 0; i < candidates.length; i++) {
                  if (currentUsedDiscard.includes(i)) continue;
                  let resCard = candidates[i];

                  const master = CARD_MASTER.find(
                    (m) => m.id === resCard.id || m.id === resCard.baseId
                  );
                  const baseP = master ? master.power : resCard.power || 0;
                  if (baseP > maxP || resCard.isToken) continue;

                  for (let j = 0; j < 3; j++) {
                    if (mySealedLanes[j] > 0) continue;
                    // targetUid: discardCard はマスターデータで再構成するため baseId（マスターID）を優先使用する。
                    // ランタイムID（"red_xxx_7" 等）は discardCard 後に失われるため使用不可。
                    let resNode = {
                      type: 'resurrect',
                      targetIdx: i,
                      targetUid: resCard.baseId || resCard.id,
                      laneIdx: j,
                      maxP: maxP,
                    };
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      currentUsedHand,
                      [...currentUsedDiscard, i],
                      currentDepth,
                      currentDiscardedFromHand
                    );
                    for (let nb of nextBranches) {
                      results.push([resNode, ...nb]);
                    }
                  }
                }

                // 復活の明示的なキャンセル分岐
                let cancelNode = {
                  type: 'resurrect',
                  targetIdx: -1,
                  laneIdx: -1,
                };
                let cancelBranches = buildSkillBranch(
                  remainingSkills,
                  currentUsedHand,
                  currentUsedDiscard,
                  currentDepth,
                  currentDiscardedFromHand
                );
                for (let nb of cancelBranches) {
                  results.push([cancelNode, ...nb]);
                }
              } else if (
                sk.id === 'convert' ||
                sk.id === 'draw' ||
                sk.id === 'reinforce'
              ) {
                const count = sk.value || 1;
                let handIndices = [];
                for (let i = 0; i < originalHand.length; i++) {
                  if (!currentUsedHand.includes(i)) handIndices.push(i);
                }

                if (handIndices.length > 0) {
                  const actualCount = Math.min(count, handIndices.length);
                  let combinations = getCombinations(handIndices, actualCount);
                  for (let combo of combinations) {
                    let discardNodes = combo.map((idx) => ({
                      type: 'discard',
                      targetIdx: idx,
                    }));
                    let newlyDiscarded = combo.map((idx) => originalHand[idx]);
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      [...currentUsedHand, ...combo],
                      currentUsedDiscard,
                      currentDepth,
                      [...currentDiscardedFromHand, ...newlyDiscarded]
                    );
                    for (let nb of nextBranches) {
                      results.push([...discardNodes, ...nb]);
                    }
                  }
                }
                // ※ awake（覚醒）はパッシブスキル（所有者のターン開始時に発動）のため、
                //   召喚時のtoken_placementとしては扱わない。シミュレーション上は元のパワーのまま評価される。
              } else if (
                ['clone', 'summon', 'split', 'puppet'].includes(sk.id)
              ) {
                const count = sk.id === 'clone' ? sk.value || 1 : 1;
                // レーン選択の全組み合わせを生成するヘルパー
                // 同一レーンへの複数配置は武装カードへの装備等で有効な戦略のため、
                // 重複レーンを含む全パターンを生成する（例: [0,0]も有効）
                const generateLaneCombos = (remainingCount) => {
                  if (remainingCount <= 0) return [[]];
                  let combos = [];
                  let subCombos = generateLaneCombos(remainingCount - 1);
                  for (let j = 0; j < 3; j++) {
                    if (mySealedLanes[j] > 0) continue;
                    for (let sc of subCombos) {
                      combos.push([j, ...sc]);
                    }
                  }
                  return combos;
                };

                let allCombos = [[]]; // 配置しない（空配列）という明示的な意思
                // 部分的な配置キャンセル（1体だけ置くなど）をシミュレーションするため、1〜count までの全パターンを生成
                for (let c = 1; c <= count; c++) {
                  allCombos.push(...generateLaneCombos(c));
                }
                for (let combo of allCombos) {
                  let tokenNode = {
                    type: 'token_placement',
                    skillId: sk.id,
                    skillValue: sk.value,
                    summonId: sk.summonId,
                    lanes: combo,
                  };
                  let nextBranches = buildSkillBranch(
                    remainingSkills,
                    currentUsedHand,
                    currentUsedDiscard,
                    currentDepth,
                    currentDiscardedFromHand
                  );
                  for (let nb of nextBranches) {
                    results.push([tokenNode, ...nb]);
                  }
                }
              } else if (sk.id === 'choice') {
                const cc = sk.value || 1;
                const cArr =
                  sk.choiceGroup === 2 ? card.choices2 : card.choices;
                if (cArr) {
                  const idxs = cArr.map((_, i) => i);
                  let combinations = getCombinations(
                    idxs,
                    Math.min(idxs.length, cc)
                  );
                  for (let combo of combinations) {
                    // 選択したスキルをスキルリストの先頭に追加して再帰（連鎖をシミュレート）
                    const chosenSkills = combo.map((idx) => cArr[idx]);
                    let nextSkills = [...chosenSkills, ...remainingSkills];
                    let choiceNode = {
                      type: 'choice',
                      choices: combo,
                      choiceGroup: sk.choiceGroup,
                    };
                    let nextBranches = buildSkillBranch(
                      nextSkills,
                      currentUsedHand,
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscardedFromHand
                    );
                    for (let nb of nextBranches) {
                      results.push([choiceNode, ...nb]);
                    }
                  }
                }
              } else if (sk.id === 'force') {
                // 【命令】相手が選ぶスキル。AI上はchoiceと同様に全組み合わせを列挙し、
                // processActionSequenceでシミュレートして最良/最悪結果を評価する
                const fc = sk.value || 1;
                const fArr =
                  sk.choiceGroup === 2 ? card.choices2 : card.choices;
                if (fArr) {
                  const idxs = fArr.map((_, i) => i);
                  let combinations = getCombinations(
                    idxs,
                    Math.min(idxs.length, fc)
                  );
                  for (let combo of combinations) {
                    const chosenSkills = combo.map((idx) => fArr[idx]);
                    let nextSkills = [...chosenSkills, ...remainingSkills];
                    let forceNode = {
                      type: 'force',
                      choices: combo,
                      choiceGroup: sk.choiceGroup,
                    };
                    let nextBranches = buildSkillBranch(
                      nextSkills,
                      currentUsedHand,
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscardedFromHand
                    );
                    for (let nb of nextBranches) {
                      results.push([forceNode, ...nb]);
                    }
                  }
                }
              } else {
                return buildSkillBranch(
                  remainingSkills,
                  currentUsedHand,
                  currentUsedDiscard,
                  currentDepth,
                  currentDiscardedFromHand
                );
              }
              return results;
            };

            if (depth < 2 && effectiveSkills.length > 0) {
              let skillChains = buildSkillBranch(
                effectiveSkills,
                usedHand,
                usedDiscard,
                depth
              );
              for (let chain of skillChains) {
                branches.push([node, ...chain]);
              }
            } else {
              branches.push([node]);
            }
          }
        }
      }
    }

    if (branches.length === 0) return [[]];
    // 空のアクション配列（何も起きないブランチ）を除去し、重複を避ける
    return branches.filter((b) => b.length > 0);
  }

  // シミュレートした候補アクションを保持する配列
  const candidates = [];

  // 【最適化】候補のsimStateを即時評価してスコアのみ保持する。

  // 候補を追加するヘルパー関数（simStateを即時評価してメモリを解放する）
  const addCandidate = (candidateData, simState) => {
    candidateData.score = evaluateSimState(simState);
    // simStateはスコア計算後に参照しないため保持しない（メモリ節約）
    candidates.push(candidateData);
  };

  let passSimState = processActionSequence([{ type: 'pass' }]);
  if (passSimState)
    addCandidate(
      {
        index: -1,
        lane: -1,
        isOverwrite: false,
        useSkill: false,
      },
      passSimState
    );

  for (let i = 0; i < hand.length; i++) {
    let card = hand[i];
    let queues = buildCardPlayTree(card, i, 'play', hand, discard, [i], [], 0);

    for (let actionQ of queues) {
      if (actionQ.length === 0) continue;
      let simState = processActionSequence(actionQ);
      if (simState) {
        let firstAction = actionQ[0];
        let fChcs = [firstAction.choices, firstAction.choices2].filter(
          (x) => x !== undefined
        );
        let followUp = actionQ.slice(1).map((act) => {
          let adjusted = { ...act };
          if (
            (adjusted.type === 'invite' ||
              adjusted.type === 'chant' ||
              adjusted.type === 'play' ||
              adjusted.type === 'discard') &&
            firstAction.type === 'play'
          ) {
            // targetUidがあればuid照合で確実に特定できるが、processActionSequence用にtargetIdxも調整
            if (adjusted.targetIdx > firstAction.targetIdx)
              adjusted.targetIdx -= 1;
          }
          return adjusted;
        });

        addCandidate(
          {
            index: firstAction.targetIdx,
            lane: firstAction.laneIdx,
            useSkill: false,
            choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
            cardTokenLanes: firstAction.cardTokenLanes,
            actionQueue: followUp.length > 0 ? followUp : undefined,
          },
          simState
        );
      }
    }
  }

  if (canUseSkill) {
    let tokenLanePatterns = [null];
    const action = skill.action;
    if (action === 'holy_march' || action === 'evil_march') {
      const avail = [0, 1, 2].filter((l) => mySealedLanes[l] === 0);
      let combs = [];
      combs.push([]); // 0体パターン（騎士を出さずバフのみ）
      for (let l of avail) combs.push([l]);
      if (avail.length >= 2) combs.push(...getCombinations(avail, 2));
      tokenLanePatterns = combs.length > 0 ? combs : [null];
    } else if (
      [
        'satan_avatar',
        'dragon_summon',
        'dragon_high_ritual',
        'devilhunter_resurrect',
        'dungeon_summon_leader',
      ].includes(action)
    ) {
      tokenLanePatterns = [[0], [1], [2]].filter(
        (pattern) => mySealedLanes[pattern[0]] === 0
      );
      if (
        action === 'dungeon_summon_leader' &&
        GameState.enemyConfig &&
        GameState.enemyConfig.leaderCardId
      ) {
        const lc = CARD_MASTER.find(
          (c) => c.id === GameState.enemyConfig.leaderCardId
        );
        if (lc && hasSkill(lc, 'legendary'))
          tokenLanePatterns = [[1]].filter(
            (pattern) => mySealedLanes[pattern[0]] === 0
          );
        if (lc && hasSkill(lc, 'takeover'))
          tokenLanePatterns = tokenLanePatterns.filter(
            (pattern) => myBoard[pattern[0]] !== null
          );
        if (lc && hasSkill(lc, 'challenge'))
          tokenLanePatterns = tokenLanePatterns.filter(
            (pattern) => opBoard[pattern[0]] !== null
          );
      }
    } else if (action === 'overdrive') {
      // overdrive は自分の墓地・相手の墓地から1枚ずつ2回配置するため
      // [自分墓地の配置先, 相手墓地の配置先] の2要素ペアを生成する
      const avail = [0, 1, 2].filter((l) => mySealedLanes[l] === 0);
      let pairs = [];
      for (let l1 of avail) {
        for (let l2 of avail) {
          if (l1 !== l2) pairs.push([l1, l2]); // 異なるレーンのペア（上書き防止）
        }
      }
      // 空きレーンが1つしかない場合は同一レーンも許可（上書きは仕様）
      if (pairs.length === 0 && avail.length > 0) {
        pairs = avail.map((l) => [l, l]);
      }
      tokenLanePatterns = pairs.length > 0 ? pairs : [null];
    } else if (
      action === 'targeted_destruction' ||
      action === 'tomb_guard' ||
      action === 'death_judgment'
    ) {
      tokenLanePatterns = [0, 1, 2]
        .filter((l) => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune'))
        .map((l) => [l]);
      if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
    } else if (action === 'seal_lanes') {
      const avail = [0, 1, 2].filter(
        (l) =>
          !GameState.playerSealedLanes || GameState.playerSealedLanes[l] === 0
      );
      let combs = [];
      for (let l of avail) combs.push([l]);
      if (avail.length >= 2) combs.push(...getCombinations(avail, 2));
      tokenLanePatterns = combs.length > 0 ? combs : [null];
    } else if (action === 'night_parade') {
      const availEnemy = [0, 1, 2].filter(
        (l) =>
          !GameState.playerSealedLanes || GameState.playerSealedLanes[l] === 0
      );
      let enemyPatterns = [[]];
      for (let l of availEnemy) enemyPatterns.push([l]);
      if (availEnemy.length >= 2)
        enemyPatterns.push(...getCombinations(availEnemy, 2));

      const availAllied = [0, 1, 2].filter((l) => mySealedLanes[l] === 0);
      let alliedPatterns = [[]];
      for (let l1 of availAllied) {
        alliedPatterns.push([l1]);
      }

      let combs = [];
      for (let e of enemyPatterns) {
        for (let a of alliedPatterns) {
          combs.push({ enemy: e, allied: a });
        }
      }
      tokenLanePatterns = combs.length > 0 ? combs : [null];
    } else if (action === 'elf_polarbear_combo') {
      const enemyOcc = [0, 1, 2].filter(
        (l) => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune')
      );
      const myAvail = [0, 1, 2].filter((l) => mySealedLanes[l] === 0);
      let combs = [];
      if (enemyOcc.length > 0 && myAvail.length > 0) {
        for (let e of enemyOcc) for (let m of myAvail) combs.push([e, m]);
        tokenLanePatterns = combs;
      } else tokenLanePatterns = [null];
    } else if (action === 'void_purge') {
      tokenLanePatterns = [null];
    } else if (action === 'viola_domination') {
      const avail = [0, 1, 2].filter(
        (l) => opBoard[l] !== null && mySealedLanes[l] === 0
      );
      tokenLanePatterns = avail.length > 0 ? avail.map((l) => [l]) : [null];
    }

    for (let i = 0; i < hand.length; i++) {
      let card = hand[i];
      for (let tokenLanes of tokenLanePatterns) {
        let isResurrectLeaderSkill =
          action === 'devilhunter_resurrect' || action === 'overdrive';
        let dIdxLoop = isResurrectLeaderSkill
          ? discard.map((_, idx) => idx)
          : [-1];

        for (let dIdxForTree of dIdxLoop) {
          if (isResurrectLeaderSkill && discard[dIdxForTree].isToken) continue;
          let qs = buildCardPlayTree(
            card,
            i,
            'play',
            hand,
            discard,
            [i],
            isResurrectLeaderSkill ? [dIdxForTree] : [],
            0
          );
          for (let actionQ of qs) {
            if (actionQ.length === 0) continue;
            const fA = actionQ[0];

            // 配置レーンが重複している場合は避ける（他に空きがある場合）
            let overlapLanes = [];
            if (Array.isArray(tokenLanes)) overlapLanes = tokenLanes;
            else if (tokenLanes && tokenLanes.allied)
              overlapLanes = tokenLanes.allied;

            const isOverlap =
              overlapLanes &&
              overlapLanes.length > 0 &&
              overlapLanes.includes(fA.laneIdx);
            if (isOverlap) {
              // リーダースキル(before)でトークン配置後の盤面で空きレーンを判定する
              const currentEmpty = myBoard.filter((l) => l === null).length;
              const tokensFillingEmpty = overlapLanes.filter(
                (l) => myBoard[l] === null
              ).length;
              const effectiveEmptyCount = currentEmpty - tokensFillingEmpty;
              // 重複しているが他に空きがあるなら、わざわざトークンを上書きする必要はないのでスキップ
              if (effectiveEmptyCount >= 1) continue;
            }

            if (action === 'devilhunter_resurrect' || action === 'overdrive') {
              let dIdx = dIdxForTree;
              let simState = processActionSequence(
                actionQ,
                true,
                action,
                tokenLanes,
                'before',
                dIdx
              );
              if (simState) {
                let fChcs = [fA.choices, fA.choices2].filter(
                  (x) => x !== undefined
                );
                const resTargetCard = discard[dIdx];
                addCandidate(
                  {
                    index: i,
                    lane: fA.laneIdx,
                    isOverwrite: myBoard[fA.laneIdx] !== null,
                    useSkill: true,
                    tokenLanes,
                    skillOrder: 'before',
                    leaderSkillTargetIdx: dIdx,
                    leaderSkillTargetUid:
                      resTargetCard.baseId || resTargetCard.id,
                    choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
                    cardTokenLanes: fA.cardTokenLanes,
                    actionQueue:
                      actionQ.slice(1).length > 0
                        ? actionQ.slice(1).map((act) => {
                            let adjusted = { ...act };
                            if (
                              (adjusted.type === 'invite' ||
                                adjusted.type === 'chant' ||
                                adjusted.type === 'play' ||
                                adjusted.type === 'discard') &&
                              fA.type === 'play'
                            ) {
                              if (adjusted.targetIdx > fA.targetIdx)
                                adjusted.targetIdx -= 1;
                            }
                            return adjusted;
                          })
                        : undefined,
                  },
                  simState
                );
              }
            } else {
              // その他（聖戦・邪戦・サタン・龍神等）
              let simState = processActionSequence(
                actionQ,
                true,
                action,
                tokenLanes,
                'before'
              );
              if (simState) {
                let fChcs = [fA.choices, fA.choices2].filter(
                  (x) => x !== undefined
                );
                addCandidate(
                  {
                    index: i,
                    lane: fA.laneIdx,
                    isOverwrite: myBoard[fA.laneIdx] !== null,
                    useSkill: true,
                    tokenLanes,
                    skillOrder: 'before',
                    choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
                    cardTokenLanes: fA.cardTokenLanes,
                    actionQueue:
                      actionQ.slice(1).length > 0
                        ? actionQ.slice(1).map((act) => {
                            let adjusted = { ...act };
                            if (
                              (adjusted.type === 'invite' ||
                                adjusted.type === 'chant' ||
                                adjusted.type === 'play' ||
                                adjusted.type === 'discard') &&
                              fA.type === 'play'
                            ) {
                              if (adjusted.targetIdx > fA.targetIdx)
                                adjusted.targetIdx -= 1;
                            }
                            return adjusted;
                          })
                        : undefined,
                  },
                  simState
                );
              }
            }
          }
        } // End of dIdxForTree loop
      }
    }
    for (let tokenLanes of tokenLanePatterns) {
      if (action === 'devilhunter_resurrect' || action === 'overdrive') {
        for (let dIdx = 0; dIdx < discard.length; dIdx++) {
          if (discard[dIdx].isToken) continue;
          const resTargetCard = discard[dIdx];
          let simState = processActionSequence(
            [{ type: 'pass' }],
            true,
            action,
            tokenLanes,
            'before',
            dIdx,
            resTargetCard.baseId || resTargetCard.id
          );
          if (simState) {
            addCandidate(
              {
                index: -1,
                lane: -1,
                isOverwrite: false,
                useSkill: true,
                tokenLanes,
                skillOrder: 'before',
                leaderSkillTargetIdx: dIdx,
                leaderSkillTargetUid: resTargetCard.baseId || resTargetCard.id,
              },
              simState
            );
          }
        }
      } else {
        let simState = processActionSequence(
          [{ type: 'pass' }],
          true,
          action,
          tokenLanes,
          'before'
        );
        if (simState)
          addCandidate(
            {
              index: -1,
              lane: -1,
              isOverwrite: false,
              useSkill: true,
              tokenLanes,
              skillOrder: 'before',
            },
            simState
          );
      }
    }
  }

  // 【最適化】addCandidateでスコアは既に計算済みのため、nullフィルタは不要
  // （addCandidateはsimStateがnullの場合は呼ばれない）

  // レーン優先順位に基づくタイブレーク用スコアボーナスを加算
  const getLanePri = (l) => {
    if (l === 0) return 3;
    if (l === 2) return 2;
    if (l === 1) return 1;
    return 0;
  };
  candidates.forEach((c) => {
    // レーン優先順位を加味 (左 0=3点, 右 2=2点, 中央 1=1点)
    let pri = 0;
    if (c.lane === 0) pri = 3;
    else if (c.lane === 2) pri = 2;
    else if (c.lane === 1) pri = 1;
    c.lanePriority = pri;
    // スコアに僅かな優先度ボーナスを乗せ、同点時に「左→右→中央」を選びやすくする
    c.score += pri * 0.01;

    // トークンやリーダースキルの配置先にもタイブレークを適用（同点時に左を優先）
    if (c.cardTokenLanes && Array.isArray(c.cardTokenLanes)) {
      c.cardTokenLanes.forEach((l) => (c.score += getLanePri(l) * 0.001));
    }
    if (c.tokenLanes && Array.isArray(c.tokenLanes)) {
      c.tokenLanes.forEach((l) => (c.score += getLanePri(l) * 0.001));
    }
    if (c.actionQueue) {
      c.actionQueue.forEach((a) => {
        if (a.lanes && Array.isArray(a.lanes)) {
          a.lanes.forEach((l) => (c.score += getLanePri(l) * 0.0001));
        } else if (a.laneIdx !== undefined && a.laneIdx !== -1) {
          c.score += getLanePri(a.laneIdx) * 0.0001;
        }
      });
    }
  });

  // スコア順、次いでリーダースキル不使用優先、最後にアクションの短さ順でソート（不要なスキル消費を避ける）
  candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.00001) return b.score - a.score;
    if (a.useSkill !== b.useSkill) return a.useSkill ? 1 : -1;
    const aLen = a.actionQueue ? a.actionQueue.length : 0;
    const bLen = b.actionQueue ? b.actionQueue.length : 0;
    return aLen - bLen;
  });

  if (candidates.length === 0) return { index: -1, lane: -1, useSkill: false };

  const bestScore = candidates[0].score;
  let bestGroup = candidates.filter(
    (c) => Math.abs(c.score - bestScore) < 0.00001
  );

  // 同スコア候補の中で、リーダースキルを使用しない選択肢があればそれを優先する
  const hasNoSkill = bestGroup.some((c) => !c.useSkill);
  if (hasNoSkill) {
    bestGroup = bestGroup.filter((c) => !c.useSkill);
  }

  // 同スコア候補の中で最短のアクション数のものだけを残す（不要なスキル消費を避ける）
  const minActionLen = Math.min(
    ...bestGroup.map((c) => (c.actionQueue ? c.actionQueue.length : 0))
  );
  const finalGroup = bestGroup.filter(
    (c) => (c.actionQueue ? c.actionQueue.length : 0) === minActionLen
  );

  const finalDecision =
    finalGroup[Math.floor(Math.random() * finalGroup.length)];

  const cardName =
    finalDecision.index !== -1 ? hand[finalDecision.index].name : 'PASS';

  let resInfo = '';
  if (
    finalDecision.useSkill &&
    (skill.action === 'devilhunter_resurrect' ||
      skill.action === 'overdrive') &&
    finalDecision.leaderSkillTargetIdx !== undefined
  ) {
    const resCard = finalDecision.leaderSkillTargetUid
      ? discard.find(
          (c) =>
            c &&
            (c.baseId === finalDecision.leaderSkillTargetUid ||
              c.id === finalDecision.leaderSkillTargetUid)
        )
      : discard[finalDecision.leaderSkillTargetIdx];
    if (resCard) resInfo = ` (Resurrect: ${resCard.name})`;
  }

  console.log(
    `[AI Decision] ${cardName} -> Lane: ${finalDecision.lane}${resInfo} (LeaderSkill: ${finalDecision.useSkill ? 'YES' : 'NO'})`
  );
  console.log(
    `[AI Reasoning] Score: ${finalDecision.score.toFixed(3)}, Candidates: ${bestGroup.length}`
  );

  // 詳細な盤面ログ出力（シミュレーション前の状態のみ）
  const dumpB = (b) =>
    b
      .map((c) =>
        c
          ? `${c.name}(${c.currentPower !== undefined ? c.currentPower : c.power})`
          : 'EMPTY'
      )
      .join(' | ');
  console.log(
    `[AI DEBUG] Before: [Player] ${dumpB(opBoard)} vs [AI] ${dumpB(myBoard)}`
  );

  // 最初のプレイアクションを含む完全なアクションキューを再構築
  const fullActionQueue = [];
  if (finalDecision.index !== -1) {
    const firstChoice = finalDecision.choiceIndexQueue
      ? finalDecision.choiceIndexQueue[0]
      : undefined;
    const secondChoice =
      finalDecision.choiceIndexQueue &&
      finalDecision.choiceIndexQueue.length > 1
        ? finalDecision.choiceIndexQueue[1]
        : undefined;
    fullActionQueue.push({
      type: 'play',
      targetIdx: finalDecision.index,
      laneIdx: finalDecision.lane,
      choices: firstChoice,
      choices2: secondChoice,
      cardTokenLanes: finalDecision.cardTokenLanes,
    });
  } else {
    fullActionQueue.push({ type: 'pass' });
  }

  if (finalDecision.actionQueue && Array.isArray(finalDecision.actionQueue)) {
    fullActionQueue.push(...finalDecision.actionQueue);
  }

  // シミュレーション実行後の予想盤面（After）を再計算してデバッグログに常に出力
  const afterSim = processActionSequence(
    fullActionQueue,
    finalDecision.useSkill,
    skill?.action,
    finalDecision.tokenLanes,
    'before',
    finalDecision.leaderSkillTargetIdx,
    finalDecision.leaderSkillTargetUid
  );
  if (afterSim) {
    console.log(
      `[AI DEBUG] After:  [Player] ${dumpB(afterSim.playerBoard)} (HP:${afterSim.playerHP}) vs [AI] ${dumpB(afterSim.enemyBoard)} (HP:${afterSim.enemyHP})`
    );
  }
  if (finalDecision.actionQueue) {
    console.log(
      `[AI DEBUG] ActionQueue: ${JSON.stringify(finalDecision.actionQueue)}`
    );
  }

  // 【重要システム処理】通常プレイの意思決定決定時において、
  // 連鎖アクション（actionQueue）に含まれるターゲット選択（支配、復活、選択など）のターゲット情報を
  // choiceIndexQueue や cardTokenLanes にあらかじめ平坦化して割り込み登録します。
  // これにより、アドホックプレイと同様に、実戦実行時にシミュレーション時の選択結果（dominateの対象など）が正しく取り出せるようになります。
  if (finalDecision.actionQueue && Array.isArray(finalDecision.actionQueue)) {
    if (!finalDecision.choiceIndexQueue) {
      finalDecision.choiceIndexQueue = [];
    }
    if (!finalDecision.cardTokenLanes) {
      finalDecision.cardTokenLanes = [];
    }
    const reversedChain = [...finalDecision.actionQueue].reverse();
    reversedChain.forEach((act) => {
      if (act.type === 'choice' || act.type === 'force') {
        if (act.choices !== undefined) {
          finalDecision.choiceIndexQueue.unshift(act.choices);
        }
      } else if (act.type === 'token_placement') {
        if (act.lanes !== undefined) {
          const revLanes = [...act.lanes].reverse();
          revLanes.forEach((lane) => {
            finalDecision.cardTokenLanes.unshift(lane);
          });
        }
      } else if (act.type === 'resurrect') {
        if (act.laneIdx !== undefined && act.laneIdx !== -1) {
          finalDecision.cardTokenLanes.unshift(act.laneIdx);
        }
      } else if (act.type === 'dominate') {
        if (act.oppLaneIdx !== undefined && act.oppLaneIdx !== -1) {
          finalDecision.cardTokenLanes.unshift(act.oppLaneIdx);
        }
      }
    });
  }

  GameState.aiDecision = finalDecision;
  return finalDecision;
}

/**
 * 【AI思考の核】盤面の状態をティア（生存階層）とスコアで厳密に評価する
 *
 * 優先順位（上にあるほど絶対的）:
 * 1. 勝利判定 (相手HPを0以下にできるなら最優先で選ぶ)
 * 2. 生存ティア (Tier 1:安全 > Tier 2:危険 > Tier 3:敗北)
 * 2.5. 追加ターンボーナス (次ターンにカードを追加で出せる + 敵の攻撃を受けない)
 * 3. 盤面パワー合計差 (自分の生存パワー総和 - 相手の生存パワー総和)
 * 4. ユーティリティ価値 (ドローや回復スキルの期待値)
 * 5. タイブレーク (生存枚数、封印レーン優先順位、被ダメージ軽減)
 *
 * ※重要: 「代償(sacrifice)」スキルによる自傷ダメージは、ティア判定（4ダメージ以上の警戒）からは除外する。
 * これは代償が「戦略的なコスト」であり、敵の攻撃による「戦術的な脅威」とは別物であるため。
 */
export function evaluateSimState(state) {
  let myPower = 0;
  let opPower = 0;
  let utilityScore = 0;

  // 1. 各種数値の集計
  for (let i = 0; i < 3; i++) {
    if (state.enemyBoard[i]) {
      const c = state.enemyBoard[i];
      myPower += Number(c.currentPower ?? c.power ?? 0);

      // 4. ユーティリティ価値の算出（AI_SKILL_UTILITYテーブル参照）
      // skillTriggered = true の場合、アクティブスキルは発動済みなので
      // パッシブスキルのみ評価する
      const addUtility = (skillId) => {
        const val = AI_SKILL_UTILITY[skillId];
        if (val === undefined || val === null) return;
        // 動的評価関数（hack等）の場合は関数を呼び出して値を取得する
        if (typeof val === 'function') {
          utilityScore += val(state, GameState);
        } else {
          utilityScore += val;
        }
      };
      if (c.skill && c.skill !== 'none') {
        // アクティブスキル（draw, heal等）は未発動時のみ加算
        if (
          !c.skillTriggered ||
          !['draw', 'heal', 'bless', 'morph', 'shuffle'].includes(c.skill)
        ) {
          addUtility(c.skill);
        }
      }
      if (Array.isArray(c.skills)) {
        c.skills.forEach((sk) => {
          if (
            !c.skillTriggered ||
            !['draw', 'heal', 'bless', 'morph', 'shuffle'].includes(sk.id)
          ) {
            addUtility(sk.id);
          }
        });
      }
    }
    if (state.playerBoard[i]) {
      const opC = state.playerBoard[i];
      opPower += Number(opC.currentPower ?? opC.power ?? 0);
    }
  }

  // 2. 生存ティアの判定 (Tier 1:安全 > Tier 2:危険 > Tier 3:敗北)
  let tier = 1;
  if (state.enemyHP <= 0) {
    tier = 3;
  } else if ((state.combatDamageTaken || 0) >= 4) {
    tier = 2;
  }

  // 3. 【AI思考の核】に基づいた絶対優先順位スコアの構築
  // スロットごとに桁を分けることで、下位の項目が上位を逆転できないようにする

  // スロット1: 勝利判定 (1か0) — 最優先：勝てる手は必ず選ぶ
  let s1 = (state.playerHP <= 0 ? 1 : 0) * 100000000;

  // スロット2: 生存ティア (Tier1=2, Tier2=1, Tier3=0)
  let s2 = (3 - tier) * 10000000;

  // スロット3: 追加ターンボーナス
  // 追加ターンは「次ターンにカードを追加で出せる + 敵の攻撃を受けない」ため非常に強力。
  // 戦闘フェーズスキップの恩恵はsimStateのcombatDamageTakenに既に反映されているが、
  // 「次ターンにカードを1枚追加で出せる」アドバンテージは評価されていないため加算する。
  const extraTurnBonus = (state.extraTurnCount || 0) > 0 ? 1 : 0;
  let s3 = extraTurnBonus * 1000000;

  // スロット4: 盤面パワー合計差 (自分の生存パワー総和 - 相手の生存パワー総和)
  // -150〜150の範囲を想定し+200して正の値にする
  let s4 = (myPower - opPower + 200) * 1000;

  // スロット5: 相手リーダーへのダメージ評価
  // 砲撃(artillery)等によるリーダーダメージを評価し、
  // 盤面が同等の場合にリーダーHPを削る手を優先する
  let s5 = -state.playerHP * 100;

  // スロット6: 自分リーダーHPの評価
  // 回復(heal)や吸収(absorb)等による自リーダーHP維持を評価する
  // 自分のHPが高いほど高評価
  let s6 = state.enemyHP * 100;

  // スロット7: ユーティリティ価値
  let s7 = (utilityScore + (state.actionUtilityBonus || 0)) * 10;

  // スロット8: タイブレーク (生存枚数)
  // 自分の枚数が少ないほど高評価（装備一点集中・生贄の高打点を評価）
  // 相手の枚数が少ないほど高評価（盤面制圧を評価）
  const myCount = state.enemyBoard.filter(
    (c) =>
      c &&
      (c.currentPower !== undefined ? c.currentPower > 0 : (c.power || 0) > 0)
  ).length;
  const opCount = state.playerBoard.filter(
    (c) =>
      c &&
      (c.currentPower !== undefined ? c.currentPower > 0 : (c.power || 0) > 0)
  ).length;
  let s8 = 8 - myCount - opCount;

  // スロット9: 封印ボーナス (空のレーンを封印した際の優先度：中央 > 左 > 右)
  // パワー差等で同点になった場合のタイブレークとして微小なスコアを加算
  let s9 = 0;
  if (state.playerSealedLanes) {
    if (state.playerSealedLanes[1] > 0) s9 += 0.03; // 中央
    if (state.playerSealedLanes[0] > 0) s9 += 0.02; // 左
    if (state.playerSealedLanes[2] > 0) s9 += 0.01; // 右
  }

  // スロット10: 被ダメージペナルティ
  // 【重要】危険状態（tier === 2、被ダメ4以上）の時は、少しでも被ダメージを抑えるプレイ（ブロック）を
  // 盤面パワー差（スロット4：1あたり1000点）よりも絶対優先するため、大きなペナルティ（1ダメージにつき -100,000点）を適用する。
  // 安全状態（tier === 1、被ダメ4未満）の時は、従来通りの微小なタイブレークペナルティ（-0.1）で評価する。
  const damageTaken = state.combatDamageTaken || 0;
  let s10 = 0;
  if (tier === 2) {
    s10 = -damageTaken * 100000;
  } else {
    s10 = -damageTaken * 0.1;
  }

  return s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8 + s9 + s10;
}

export function evaluateAdhocTokenLanes(
  tokenCard,
  checkConstraints = true,
  canCancel = false
) {
  /*
  console.log(`[AI CALL Debug] evaluateAdhocTokenLanes start.
  tokenCard: ${tokenCard ? JSON.stringify(tokenCard) : 'null'}
  checkConstraints: ${checkConstraints}, canCancel: ${canCancel}
  `);
  */

  // 号令解決時点の正確なゲーム状態をシミュレーションの初期値として構築
  const initialSimState = {
    playerBoard: GameState.playerBoard.map(cloneCard),
    enemyBoard: GameState.enemyBoard.map(cloneCard),
    playerDiscard: GameState.playerDiscard
      ? GameState.playerDiscard.map(cloneCard)
      : [],
    enemyDiscard: GameState.enemyDiscard
      ? GameState.enemyDiscard.map(cloneCard)
      : [],
    playerSealedLanes: [...(GameState.playerSealedLanes || [0, 0, 0])],
    enemySealedLanes: [...(GameState.enemySealedLanes || [0, 0, 0])],
    playerHP: GameState.playerHP,
    enemyHP: GameState.enemyHP,
    playerMaxHP: GameState.playerMaxHP || 25,
    enemyMaxHP: GameState.enemyMaxHP || 25,
    playerSP: GameState.playerSP || 0,
    enemySP: GameState.enemySP || 0,
    playerHand: GameState.playerHand ? GameState.playerHand.map(cloneCard) : [],
    enemyHand: GameState.enemyHand ? GameState.enemyHand.map(cloneCard) : [],
    playerDeck: GameState.playerDeck ? GameState.playerDeck.map(cloneCard) : [],
    enemyDeck: GameState.enemyDeck ? GameState.enemyDeck.map(cloneCard) : [],
    extraTurnCount: GameState.extraTurnCount || 0,
    attackSkipCount: GameState.attackSkipCount || 0,
    combatDamageTaken: 0,
    lastCardPlayed: null,
    lastPlayedLane: -1,
    _actionQueue: [],
  };

  const sealedLanes = GameState.enemySealedLanes || [0, 0, 0];
  const allLanes = [0, 1, 2].filter((l) => sealedLanes[l] === 0);

  // 配置可能なレーンを抽出（召喚制約のチェック）
  let validLanes = allLanes.filter((l) => {
    if (checkConstraints) {
      // 1ターン目の「召喚」は中央のみ
      if (
        GameState.turnCount === 1 &&
        GameState.firstPlayer === 'red' &&
        l !== 1
      )
        return false;
    }
    if (checkConstraints && tokenCard) {
      if (hasSkill(tokenCard, 'legendary') && l !== 1) return false;
      if (hasSkill(tokenCard, 'takeover') && GameState.enemyBoard[l] === null)
        return false;
      if (hasSkill(tokenCard, 'challenge') && GameState.playerBoard[l] === null)
        return false;
      if (
        hasSkill(tokenCard, 'apex') &&
        !(
          GameState.enemyBoard[l] &&
          hasSkill(GameState.enemyBoard[l], 'legendary')
        )
      )
        return false;
    }
    return true;
  });

  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 }; // 左(1) > 右(2) > 中央(3) の優先順

  if (validLanes.length === 0) return [];

  // ==========================================
  // 【号令アドホックシミュレーション用 ツリー展開ロジック】
  // ==========================================

  // 連鎖するスキルをシミュレーション上のアクションキューとして展開するローカル関数
  const buildSkillBranchAdhoc = (
    currentSkills,
    currentUsedHand,
    currentUsedDiscard,
    currentDepth,
    currentDiscardedFromHand = [],
    laneIdx // めくれた親カードが置かれるレーン
  ) => {
    if (currentSkills.length === 0 || currentDepth >= 4) return [[]];

    let sk = currentSkills[0];
    let remainingSkills = currentSkills.slice(1);
    let results = [];

    const isPlacementSkill = [
      'clone',
      'summon',
      'split',
      'puppet',
      'resurrect',
    ].includes(sk.id);
    if (!isPlacementSkill) {
      // 配置系スキル以外は常に「このスキルをキャンセル/スキップする」選択肢を考慮する
      results.push(
        ...buildSkillBranchAdhoc(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscardedFromHand,
          laneIdx
        )
      );
    }

    if (sk.id === 'invite') {
      const originalHand = GameState.enemyHand || [];
      const originalDiscard = GameState.enemyDiscard || [];
      for (let i = 0; i < originalHand.length; i++) {
        if (currentUsedHand.includes(i)) continue;
        let childCard = originalHand[i];
        // 【招来】同じレーンに召喚する仕様のため、forcedLane = laneIdx を渡す
        let children = buildCardPlayTreeAdhoc(
          childCard,
          i,
          'invite',
          originalHand,
          originalDiscard,
          [...currentUsedHand, i],
          currentUsedDiscard,
          currentDepth + 1,
          laneIdx
        );
        for (let cNode of children) {
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            [...currentUsedHand, i],
            currentUsedDiscard,
            currentDepth,
            currentDiscardedFromHand,
            laneIdx
          );
          for (let nb of nextBranches) {
            results.push([...cNode, ...nb]);
          }
        }
      }
    } else if (sk.id === 'chant') {
      const originalHand = GameState.enemyHand || [];
      const originalDiscard = GameState.enemyDiscard || [];
      const maxP = sk.value ?? 3;
      for (let i = 0; i < originalHand.length; i++) {
        if (currentUsedHand.includes(i)) continue;
        let childCard = originalHand[i];
        if ((childCard.power || 0) > maxP) continue;
        // 【詠唱】全レーンが候補のためforcedLaneは指定しない
        let children = buildCardPlayTreeAdhoc(
          childCard,
          i,
          'chant',
          originalHand,
          originalDiscard,
          [...currentUsedHand, i],
          currentUsedDiscard,
          currentDepth + 1
        );
        for (let cNode of children) {
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            [...currentUsedHand, i],
            currentUsedDiscard,
            currentDepth,
            currentDiscardedFromHand,
            laneIdx
          );
          for (let nb of nextBranches) {
            results.push([...cNode, ...nb]);
          }
        }
      }
    } else if (sk.id === 'forge') {
      const originalHand = GameState.enemyHand || [];
      const originalDiscard = GameState.enemyDiscard || [];
      for (let i = 0; i < originalHand.length; i++) {
        if (currentUsedHand.includes(i)) continue;
        let childCard = originalHand[i];

        const isEquip = hasSkill(childCard, 'equip');
        let validLanes = [];
        for (let j = 0; j < 3; j++) {
          if (GameState.enemyBoard[j] !== null) {
            if (isEquip || hasSkill(GameState.enemyBoard[j], 'arm_self')) {
              validLanes.push(j);
            }
          }
        }

        for (let vLane of validLanes) {
          let children = buildCardPlayTreeAdhoc(
            childCard,
            i,
            'forge',
            originalHand,
            originalDiscard,
            [...currentUsedHand, i],
            currentUsedDiscard,
            currentDepth + 1,
            vLane
          );
          for (let cNode of children) {
            let nextBranches = buildSkillBranchAdhoc(
              remainingSkills,
              [...currentUsedHand, i],
              currentUsedDiscard,
              currentDepth,
              currentDiscardedFromHand,
              laneIdx
            );
            for (let nb of nextBranches) {
              results.push([...cNode, ...nb]);
            }
          }
        }
      }

      // スキップのブランチ
      let nextBranches = buildSkillBranchAdhoc(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscardedFromHand,
        laneIdx
      );
      for (let nb of nextBranches) {
        results.push([{ type: 'forge', targetIdx: -1, laneIdx: -1 }, ...nb]);
      }
    } else if (sk.id === 'leap') {
      let leapBranch = buildSkillBranchAdhoc(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscardedFromHand,
        laneIdx
      );
      for (let nb of leapBranch) {
        results.push([{ type: 'leap' }, ...nb]);
      }
    } else if (sk.id === 'resurrect') {
      const originalDiscard = GameState.enemyDiscard || [];
      const maxP = sk.value || 1;
      const candidates = [...originalDiscard, ...currentDiscardedFromHand];

      for (let i = 0; i < candidates.length; i++) {
        if (currentUsedDiscard.includes(i)) continue;
        let resCard = candidates[i];

        const master = CARD_MASTER.find(
          (m) => m.id === resCard.id || m.id === resCard.baseId
        );
        const baseP = master ? master.power : resCard.power || 0;
        if (baseP > maxP || resCard.isToken) continue;

        for (let j = 0; j < 3; j++) {
          if (sealedLanes[j] > 0) continue;
          let resNode = {
            type: 'resurrect',
            targetIdx: i,
            targetUid: resCard.baseId || resCard.id,
            laneIdx: j,
            maxP: maxP,
          };
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            currentUsedHand,
            [...currentUsedDiscard, i],
            currentDepth,
            currentDiscardedFromHand,
            laneIdx
          );
          for (let nb of nextBranches) {
            results.push([resNode, ...nb]);
          }
        }
      }

      // 復活のキャンセル分岐
      let cancelNode = {
        type: 'resurrect',
        targetIdx: -1,
        laneIdx: -1,
      };
      let cancelBranches = buildSkillBranchAdhoc(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscardedFromHand,
        laneIdx
      );
      for (let nb of cancelBranches) {
        results.push([cancelNode, ...nb]);
      }
    } else if (sk.id === 'dominate') {
      const maxP = sk.value || 0;
      const oppBoard = GameState.playerBoard; // AI(自分)から見た相手は playerBoard
      let validOppLanes = [];
      for (let j = 0; j < 3; j++) {
        if (
          oppBoard[j] &&
          (oppBoard[j].currentPower ?? oppBoard[j].power ?? 0) <= maxP &&
          sealedLanes[j] === 0 // 自分側の同じレーンが封印されていないこと！
        ) {
          validOppLanes.push(j);
        }
      }

      // 相手の対象レーンのみを展開（配置レーンは相手の対象レーン i と同じ正面対面レーンに固定）
      for (let i of validOppLanes) {
        const myL = i; // 奪うカードの正面（対面する同じレーン番号）！
        if (sealedLanes[myL] > 0) continue;
        let domNode = {
          type: 'dominate',
          oppLaneIdx: i,
          myLaneIdx: myL,
          maxP: maxP,
        };
        let nextBranches = buildSkillBranchAdhoc(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscardedFromHand,
          laneIdx
        );
        for (let nb of nextBranches) {
          results.push([domNode, ...nb]);
        }
      }

      // キャンセル（支配しない）の分岐
      let cancelNode = {
        type: 'dominate',
        oppLaneIdx: -1,
        myLaneIdx: -1,
        maxP: maxP,
      };
      let cancelBranches = buildSkillBranchAdhoc(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscardedFromHand,
        laneIdx
      );
      for (let nb of cancelBranches) {
        results.push([cancelNode, ...nb]);
      }
    } else if (
      sk.id === 'convert' ||
      sk.id === 'draw' ||
      sk.id === 'reinforce'
    ) {
      const originalHand = GameState.enemyHand || [];
      const count = sk.value || 1;
      let handIndices = [];
      for (let i = 0; i < originalHand.length; i++) {
        if (!currentUsedHand.includes(i)) handIndices.push(i);
      }

      if (handIndices.length > 0) {
        const actualCount = Math.min(count, handIndices.length);
        let combinations = getCombinations(handIndices, actualCount);
        for (let combo of combinations) {
          let discardNodes = combo.map((idx) => ({
            type: 'discard',
            targetIdx: idx,
          }));
          let newlyDiscarded = combo.map((idx) => originalHand[idx]);
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            [...currentUsedHand, ...combo],
            currentUsedDiscard,
            currentDepth,
            [...currentDiscardedFromHand, ...newlyDiscarded],
            laneIdx
          );
          for (let nb of nextBranches) {
            results.push([...discardNodes, ...nb]);
          }
        }
      }
    } else if (['clone', 'summon', 'split', 'puppet'].includes(sk.id)) {
      const count = sk.id === 'clone' ? sk.value || 1 : 1;
      const generateLaneCombos = (remainingCount) => {
        if (remainingCount <= 0) return [[]];
        let combos = [];
        let subCombos = generateLaneCombos(remainingCount - 1);
        for (let j = 0; j < 3; j++) {
          if (sealedLanes[j] > 0) continue;
          for (let sc of subCombos) {
            combos.push([j, ...sc]);
          }
        }
        return combos;
      };

      let allCombos = [[]]; // 配置しない（空配列）という明示的な意思
      for (let c = 1; c <= count; c++) {
        allCombos.push(...generateLaneCombos(c));
      }
      for (let combo of allCombos) {
        let tokenNode = {
          type: 'token_placement',
          skillId: sk.id,
          skillValue: sk.value,
          summonId: sk.summonId,
          lanes: combo,
        };
        let nextBranches = buildSkillBranchAdhoc(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscardedFromHand,
          laneIdx
        );
        for (let nb of nextBranches) {
          results.push([tokenNode, ...nb]);
        }
      }
    } else if (sk.id === 'choice') {
      const cc = sk.value || 1;
      const cArr =
        sk.choiceGroup === 2 ? tokenCard.choices2 : tokenCard.choices;
      if (cArr) {
        const idxs = cArr.map((_, i) => i);
        let combinations = getCombinations(idxs, Math.min(idxs.length, cc));
        for (let combo of combinations) {
          const chosenSkills = combo.map((idx) => cArr[idx]);
          let nextSkills = [...chosenSkills, ...remainingSkills];
          let choiceNode = {
            type: 'choice',
            choices: combo,
            choiceGroup: sk.choiceGroup,
          };
          let nextBranches = buildSkillBranchAdhoc(
            nextSkills,
            currentUsedHand,
            currentUsedDiscard,
            currentDepth,
            currentDiscardedFromHand,
            laneIdx
          );
          for (let nb of nextBranches) {
            results.push([choiceNode, ...nb]);
          }
        }
      }
    } else if (sk.id === 'force') {
      const fc = sk.value || 1;
      const fArr =
        sk.choiceGroup === 2 ? tokenCard.choices2 : tokenCard.choices;
      if (fArr) {
        const idxs = fArr.map((_, i) => i);
        let combinations = getCombinations(idxs, Math.min(idxs.length, fc));
        for (let combo of combinations) {
          const chosenSkills = combo.map((idx) => fArr[idx]);
          let nextSkills = [...chosenSkills, ...remainingSkills];
          let forceNode = {
            type: 'force',
            choices: combo,
            choiceGroup: sk.choiceGroup,
          };
          let nextBranches = buildSkillBranchAdhoc(
            nextSkills,
            currentUsedHand,
            currentUsedDiscard,
            currentDepth,
            currentDiscardedFromHand,
            laneIdx
          );
          for (let nb of nextBranches) {
            results.push([forceNode, ...nb]);
          }
        }
      }
    } else {
      return buildSkillBranchAdhoc(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscardedFromHand,
        laneIdx
      );
    }
    return results;
  };

  // 連鎖召喚用の子カードプレイツリーを構築するローカル関数
  function buildCardPlayTreeAdhoc(
    card,
    sourceIdx,
    sourceType,
    originalHand,
    originalDiscard,
    usedHand,
    usedDiscard,
    depth,
    forcedLane = undefined
  ) {
    if (depth >= 2) return [[]];

    let availableLanes = [0, 1, 2].filter((l) => sealedLanes[l] === 0);

    if (forcedLane !== undefined) {
      if (sealedLanes[forcedLane] > 0) return [[]];
      availableLanes = [forcedLane];
    } else if (depth > 0) {
      availableLanes.push(-1);
    }

    if (
      sourceType === 'play' ||
      sourceType === 'invite' ||
      sourceType === 'chant'
    ) {
      if (GameState.turnCount === 1 && GameState.firstPlayer === 'red') {
        availableLanes = availableLanes.filter((l) => l === -1 || l === 1);
      }

      if (hasSkill(card, 'challenge')) {
        availableLanes = availableLanes.filter(
          (l) => l === -1 || GameState.playerBoard[l] !== null
        );
      }
      if (hasSkill(card, 'legendary')) {
        availableLanes = availableLanes.filter((l) => l === -1 || l === 1);
      }
      if (sourceType !== 'invite' && sourceType !== 'chant') {
        if (hasSkill(card, 'takeover')) {
          availableLanes = availableLanes.filter(
            (l) => l === -1 || GameState.enemyBoard[l] !== null
          );
        }
        if (hasSkill(card, 'apex')) {
          availableLanes = availableLanes.filter(
            (l) =>
              l === -1 ||
              (GameState.enemyBoard[l] &&
                hasSkill(GameState.enemyBoard[l], 'legendary'))
          );
        }
      }
    }

    if (
      availableLanes.filter((l) => l !== -1).length === 0 &&
      !availableLanes.includes(-1)
    )
      return [[]];

    let choiceCombinations = [undefined];
    let choice2Combinations = [undefined];
    if (hasSkill(card, 'choice') || hasSkill(card, 'force')) {
      const amplifyBonus = (GameState.enemyBoard || []).filter(
        (bc) => bc && hasSkill(bc, 'amplify')
      ).length;
      if (Array.isArray(card.choices)) {
        let cc = 1;
        if (card.skill === 'choice' || card.skill === 'force')
          cc = card.skillValue || 1;
        else if (card.skills) {
          const c = card.skills.find(
            (s) => s.id === 'choice' || s.id === 'force'
          );
          if (c) cc = c.value || 1;
        }
        cc = Math.min(cc + amplifyBonus, card.choices.length);
        const idxs = card.choices.map((_, i) => i);
        choiceCombinations = getCombinations(idxs, Math.min(idxs.length, cc));
      }
      if (Array.isArray(card.choices2)) {
        let cc2 = 1;
        const c2 = card.skills
          ? card.skills.find((s) => s.id === 'choice' && s.choiceGroup === 2)
          : null;
        if (c2) cc2 = c2.value || 1;
        cc2 = Math.min(cc2 + amplifyBonus, card.choices2.length);
        const idxs2 = card.choices2.map((_, i) => i);
        choice2Combinations = getCombinations(
          idxs2,
          Math.min(idxs2.length, cc2)
        );
      }
    }

    let branches = [];
    for (let lane of availableLanes) {
      for (let c1 of choiceCombinations) {
        for (let c2 of choice2Combinations) {
          let node = {
            type: sourceType,
            targetIdx: sourceIdx,
            targetUid: card.uid || card.id,
            laneIdx: lane,
            choices: c1 !== undefined ? [...c1] : undefined,
            choices2: c2 !== undefined ? [...c2] : undefined,
          };
          if (lane === -1) {
            branches.push([node]);
            continue;
          }

          let effectiveSkills = [];
          const isSummonAction = ['play', 'call', 'invite', 'chant'].includes(
            sourceType
          );
          if (isSummonAction) {
            if (
              [
                'invite',
                'chant',
                'resurrect',
                'convert',
                'draw',
                'reinforce',
                'clone',
                'summon',
                'split',
                'puppet',
                'leap',
              ].includes(card.skill)
            ) {
              effectiveSkills.push({
                id: card.skill,
                value: card.skillValue ?? 1,
              });
            }
            if (Array.isArray(card.skills)) {
              card.skills.forEach((s) => {
                if (
                  [
                    'invite',
                    'chant',
                    'resurrect',
                    'convert',
                    'draw',
                    'reinforce',
                    'clone',
                    'summon',
                    'split',
                    'puppet',
                    'leap',
                  ].includes(s.id)
                )
                  effectiveSkills.push(s);
              });
            }
            if (c1)
              c1.forEach((idx) => {
                if (card.choices && card.choices[idx])
                  effectiveSkills.push(card.choices[idx]);
              });
            if (c2)
              c2.forEach((idx) => {
                if (card.choices2 && card.choices2[idx])
                  effectiveSkills.push(card.choices2[idx]);
              });
          }

          if (depth < 2 && effectiveSkills.length > 0) {
            let skillChains = buildSkillBranchAdhoc(
              effectiveSkills,
              usedHand,
              usedDiscard,
              depth,
              [],
              lane
            );
            for (let chain of skillChains) {
              branches.push([node, ...chain]);
            }
          } else {
            branches.push([node]);
          }
        }
      }
    }
    return branches.filter((b) => b.length > 0);
  }

  // ==========================================
  // 【シミュレーションの実行と最善解の決定】
  // ==========================================

  let bestBranch = null;
  let maxScore = -999999999;
  let bestLane = -1;
  let bestSimState = null;

  for (let l of validLanes) {
    // このレーンにめくれたカードを配置するアクション
    let playAction = {
      type: 'play_adhoc',
      card: tokenCard,
      laneIdx: l,
      checkConstraints: checkConstraints,
    };

    // 発動するスキルを収集
    let effectiveSkills = [];
    if (tokenCard.skill && tokenCard.skill !== 'none') {
      if (tokenCard.skill !== 'choice' && tokenCard.skill !== 'force') {
        effectiveSkills.push({
          id: tokenCard.skill,
          value: tokenCard.skillValue ?? 1,
        });
      }
    }
    if (Array.isArray(tokenCard.skills)) {
      tokenCard.skills.forEach((s) => {
        if (s.id !== 'choice' && s.id !== 'force') {
          effectiveSkills.push(s);
        }
      });
    }

    // 選択スキルの選択肢展開
    let choiceCombinations = [undefined];
    let choice2Combinations = [undefined];
    if (hasSkill(tokenCard, 'choice') || hasSkill(tokenCard, 'force')) {
      const amplifyBonus = (GameState.enemyBoard || []).filter(
        (bc) => bc && hasSkill(bc, 'amplify')
      ).length;

      if (Array.isArray(tokenCard.choices)) {
        let cc = 1;
        if (tokenCard.skill === 'choice' || tokenCard.skill === 'force')
          cc = tokenCard.skillValue || 1;
        else if (tokenCard.skills) {
          const c = tokenCard.skills.find(
            (s) => s.id === 'choice' || s.id === 'force'
          );
          if (c) cc = c.value || 1;
        }
        cc = Math.min(cc + amplifyBonus, tokenCard.choices.length);
        const idxs = tokenCard.choices.map((_, i) => i);
        choiceCombinations = getCombinations(idxs, Math.min(idxs.length, cc));
      }

      if (Array.isArray(tokenCard.choices2)) {
        let cc2 = 1;
        const c2 = tokenCard.skills
          ? tokenCard.skills.find(
              (s) => s.id === 'choice' && s.choiceGroup === 2
            )
          : null;
        if (c2) cc2 = c2.value || 1;
        cc2 = Math.min(cc2 + amplifyBonus, tokenCard.choices2.length);
        const idxs2 = tokenCard.choices2.map((_, i) => i);
        choice2Combinations = getCombinations(
          idxs2,
          Math.min(idxs2.length, cc2)
        );
      }
    }

    // 各選択肢の組み合わせで展開
    for (let c1 of choiceCombinations) {
      for (let c2 of choice2Combinations) {
        let branchSkills = [...effectiveSkills];
        if (c1) {
          c1.forEach((idx) => {
            if (tokenCard.choices && tokenCard.choices[idx])
              branchSkills.push(tokenCard.choices[idx]);
          });
        }
        if (c2) {
          c2.forEach((idx) => {
            if (tokenCard.choices2 && tokenCard.choices2[idx])
              branchSkills.push(tokenCard.choices2[idx]);
          });
        }

        let playActionWithChoice = {
          ...playAction,
          choices: c1 !== undefined ? [...c1] : undefined,
          choices2: c2 !== undefined ? [...c2] : undefined,
        };

        // スキルブランチを展開
        let skillChains = buildSkillBranchAdhoc(branchSkills, [], [], 0, [], l);

        for (let chain of skillChains) {
          const actionQueue = [playActionWithChoice, ...chain];

          // 盤面のシミュレーション実行
          const simState = processActionSequence(
            actionQueue,
            false,
            null,
            null,
            'before',
            null,
            null,
            structuredClone(initialSimState)
          );
          if (!simState) continue;

          let score = evaluateSimState(simState);
          // タイブレーク：左 > 右 > 中央
          score += 0.1 / lanePriorityOrder[l];

          /*
          console.log(`[AI CALL Debug] Lane ${l} simulation:
          ActionQueue: ${JSON.stringify(actionQueue)}
          Score: ${score}
          `);
          */

          if (score > maxScore) {
            maxScore = score;
            bestBranch = actionQueue;
            bestLane = l;
            bestSimState = simState;
          }
        }
      }
    }
  }

  // 配置キャンセルのシミュレーション
  if (canCancel) {
    const simState = processActionSequence(
      [{ type: 'play_adhoc', card: null, laneIdx: -1 }],
      false,
      null,
      null,
      'before',
      null,
      null,
      structuredClone(initialSimState)
    );
    if (simState) {
      let score = evaluateSimState(simState) + 0.05; // キャンセル優先ボーナス
      if (score > maxScore) {
        maxScore = score;
        bestBranch = [{ type: 'play_adhoc', card: null, laneIdx: -1 }];
        bestLane = -1;
        bestSimState = simState;
      }
    }
  }

  if (bestLane === -1) {
    console.log(
      `[AI CALL] Cancelled placement (Score: ${maxScore.toFixed(1)})`
    );
    return null;
  }

  // ==========================================
  // 【シミュレーション結果の GameState 同期（マージ）】
  // ==========================================
  if (bestBranch) {
    if (!GameState.aiDecision) {
      GameState.aiDecision = {};
    }
    if (!GameState.aiDecision.actionQueue) {
      GameState.aiDecision.actionQueue = [];
    }
    if (!GameState.aiDecision.choiceIndexQueue) {
      GameState.aiDecision.choiceIndexQueue = [];
    }
    if (!GameState.aiDecision.cardTokenLanes) {
      GameState.aiDecision.cardTokenLanes = [];
    }

    // 最初の `play_adhoc` を除いた連鎖アクション（インデックス1以降）を `GameState.aiDecision.actionQueue` の先頭に unshift
    const chainActions = bestBranch.slice(1);
    const reversedChain = [...chainActions].reverse();
    reversedChain.forEach((act) => {
      GameState.aiDecision.actionQueue.unshift(act);

      // 互換性および実処理部（battle.js/skillLogic.js）での取り出し順整合のため
      // `choiceIndexQueue` や `cardTokenLanes` にも同時に割り込み登録する
      if (act.type === 'choice' || act.type === 'force') {
        if (act.choices !== undefined) {
          GameState.aiDecision.choiceIndexQueue.unshift(act.choices);
        }
      } else if (act.type === 'token_placement') {
        if (act.lanes !== undefined) {
          const revLanes = [...act.lanes].reverse();
          revLanes.forEach((lane) => {
            GameState.aiDecision.cardTokenLanes.unshift(lane);
          });
        }
      } else if (act.type === 'resurrect') {
        if (act.laneIdx !== undefined && act.laneIdx !== -1) {
          GameState.aiDecision.cardTokenLanes.unshift(act.laneIdx);
        }
      } else if (act.type === 'dominate') {
        if (act.oppLaneIdx !== undefined && act.oppLaneIdx !== -1) {
          GameState.aiDecision.cardTokenLanes.unshift(act.oppLaneIdx);
        }
      }
    });

    // めくれたカード自身が選択肢を持つ場合、その選択も choiceIndexQueue に登録する
    const adhocPlayAct = bestBranch[0];
    if (adhocPlayAct && adhocPlayAct.choices !== undefined) {
      GameState.aiDecision.choiceIndexQueue.unshift(adhocPlayAct.choices);
    }
    if (adhocPlayAct && adhocPlayAct.choices2 !== undefined) {
      GameState.aiDecision.choiceIndexQueue.unshift(adhocPlayAct.choices2);
    }
  }

  // 以前の evaluateAdhocTokenLanes に合わせて、最善レーンの配列形式で統一
  const dumpB = (b) =>
    b
      .map((c) =>
        c
          ? `${c.name}(${c.currentPower !== undefined ? c.currentPower : c.power})`
          : 'EMPTY'
      )
      .join(' | ');
  console.log(
    `[AI CALL] ${tokenCard ? tokenCard.name : 'unknown'} -> Lane: ${bestLane} (Score: ${maxScore.toFixed(1)})`
  );
  console.log(
    `[AI CALL] Before: [Player] ${dumpB(GameState.playerBoard)} vs [AI] ${dumpB(GameState.enemyBoard)}`
  );
  if (bestSimState) {
    console.log(
      `[AI CALL] After:  [Player] ${dumpB(bestSimState.playerBoard)} (HP:${bestSimState.playerHP}) vs [AI] ${dumpB(bestSimState.enemyBoard)} (HP:${bestSimState.enemyHP})`
    );
  }

  return [bestLane];
}

export function getNormalTokenLanes(
  allLanes,
  owner,
  tokenCard,
  count,
  canCancel = false,
  checkConstraints = true
) {
  if (owner === 'red') {
    // 常に最新の盤面状況と判明したカード情報に基づき、アドホックにシミュレーションして決定する
    const results = evaluateAdhocTokenLanes(
      tokenCard,
      checkConstraints,
      canCancel
    );
    if (results === null) return []; // キャンセル判定
    if (results.length > 0) return results.slice(0, count);
  }

  // プレイヤー用または最終フォールバック
  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };
  const sortedLanes = [...allLanes].sort(
    (a, b) => lanePriorityOrder[a] - lanePriorityOrder[b]
  );
  const results = [];
  for (let l of sortedLanes) {
    if (checkConstraints) {
      if (
        GameState.turnCount === 1 &&
        GameState.firstPlayer === 'red' &&
        l !== 1
      )
        continue;
    }
    if (checkConstraints && tokenCard) {
      if (hasSkill(tokenCard, 'legendary') && l !== 1) continue;
      if (hasSkill(tokenCard, 'takeover') && GameState.enemyBoard[l] === null)
        continue;
      if (hasSkill(tokenCard, 'challenge') && GameState.playerBoard[l] === null)
        continue;
      if (
        hasSkill(tokenCard, 'apex') &&
        !(
          GameState.enemyBoard[l] &&
          hasSkill(GameState.enemyBoard[l], 'legendary')
        )
      )
        continue;
    }
    if (GameState.enemyBoard[l] === null && results.length < count)
      results.push(l);
  }
  if (results.length < count) {
    for (let l of sortedLanes) {
      if (checkConstraints && tokenCard) {
        if (hasSkill(tokenCard, 'legendary') && l !== 1) continue;
        if (hasSkill(tokenCard, 'takeover') && GameState.enemyBoard[l] === null)
          continue;
        if (
          hasSkill(tokenCard, 'challenge') &&
          GameState.playerBoard[l] === null
        )
          continue;
        if (
          hasSkill(tokenCard, 'apex') &&
          !(
            GameState.enemyBoard[l] &&
            hasSkill(GameState.enemyBoard[l], 'legendary')
          )
        )
          continue;
      }
      if (!results.includes(l) && results.length < count) results.push(l);
    }
  }
  return results;
}

export function evaluateAIMoves(currentState) {
  const b = currentState.enemyBoard;
  const moveCards = [];
  for (let i = 0; i < 3; i++) {
    if (b[i] && hasSkill(b[i], 'move') && (b[i].stunTurns || 0) === 0)
      moveCards.push({ card: b[i], lane: i });
  }
  if (moveCards.length === 0) return null;
  let bestScore = -Infinity;
  let bestMoves = [];
  const generateMovePermutations = (boardMap, depth, currentMoves) => {
    if (depth === moveCards.length) {
      const simState = {
        playerBoard: currentState.playerBoard.map((c) =>
          c ? JSON.parse(JSON.stringify(c)) : null
        ),
        enemyBoard: boardMap.map((c) =>
          c ? JSON.parse(JSON.stringify(c)) : null
        ),
        playerHP: currentState.playerHP,
        enemyHP: currentState.enemyHP,
        playerHand: [],
        enemyHand: [],
        playerDiscard: [],
        enemyDiscard: [],
        playerDeck: [],
        enemyDeck: [],
        extraTurnCount: 0,
        attackSkipCount: 0,
      };
      calculateCombatPhase(simState, 'red');
      let score =
        (currentState.playerHP - simState.playerHP) * 5 + simState.enemyHP * 2;
      let myPow = 0;
      let opPow = 0;
      simState.enemyBoard.forEach((c) => {
        if (c) myPow += c.currentPower || 0;
      });
      simState.playerBoard.forEach((c) => {
        if (c) opPow += c.currentPower || 0;
      });
      score += myPow - opPow;
      const currentAllyCount = currentState.enemyBoard.filter(
        (c) => c !== null
      ).length;
      const newAllyCount = boardMap.filter((c) => c !== null).length;
      if (currentAllyCount > newAllyCount)
        score -= (currentAllyCount - newAllyCount) * 10;
      score -= currentMoves.length * 0.1;
      if (score > bestScore) {
        bestScore = score;
        bestMoves = currentMoves;
      }
      return;
    }
    const mCard = moveCards[depth];
    const mySealedLanes = GameState.enemySealedLanes || [0, 0, 0];
    const currentPos = boardMap.findIndex((c) => c && c.id === mCard.card.id);
    if (currentPos === -1 || currentPos !== mCard.lane) {
      generateMovePermutations(boardMap, depth + 1, currentMoves);
      return;
    }
    const validTargets = [mCard.lane];
    if (mCard.lane > 0 && mySealedLanes[mCard.lane - 1] === 0)
      validTargets.push(mCard.lane - 1);
    if (mCard.lane < 2 && mySealedLanes[mCard.lane + 1] === 0)
      validTargets.push(mCard.lane + 1);
    for (let target of validTargets) {
      const nextBoard = [...boardMap];
      if (target !== mCard.lane) {
        nextBoard[target] = nextBoard[mCard.lane];
        nextBoard[mCard.lane] = null;
      }
      const nextMoves = [...currentMoves];
      if (target !== mCard.lane)
        nextMoves.push({ from: mCard.lane, to: target });
      generateMovePermutations(nextBoard, depth + 1, nextMoves);
    }
  };
  generateMovePermutations([...b], 0, []);
  return bestMoves.length > 0 ? bestMoves : null;
}

export const getNormalDecision = getBestSimulatedMove;

export function simulateMove(
  handIdx,
  laneIdx,
  hand,
  currentMyBoard,
  currentOpBoard,
  currentMyHP,
  useSkill = false,
  currentMySP,
  tokenLanes = null,
  choiceIndex = undefined,
  cardTokenLanes = null,
  checkConstraints = true,
  choiceIndex2 = undefined
) {
  const cloneCard = (c) => (c ? structuredClone(c) : null);
  let simState = {
    playerBoard: currentOpBoard.map(cloneCard),
    enemyBoard: currentMyBoard.map(cloneCard),
    playerHP: GameState.playerHP,
    enemyHP: currentMyHP,
    playerMaxHP: GameState.playerMaxHP,
    enemyMaxHP: GameState.enemyMaxHP,
    playerSP: GameState.playerSP,
    enemySP: currentMySP || 0,
    playerHand: GameState.playerHand.map(cloneCard),
    enemyHand: hand.map(cloneCard),
    playerDiscard: GameState.playerDiscard.map(cloneCard),
    enemyDiscard: GameState.enemyDiscard.map(cloneCard),
    playerDeck: GameState.playerDeck.map(cloneCard),
    enemyDeck: GameState.enemyDeck.map(cloneCard),
    playerSealedLanes: [...(GameState.playerSealedLanes || [0, 0, 0])],
    enemySealedLanes: [...(GameState.enemySealedLanes || [0, 0, 0])],
    extraTurnCount: GameState.extraTurnCount,
    attackSkipCount: GameState.attackSkipCount,
  };

  if (useSkill && GameState.enemyConfig.leaderSkill) {
    simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
    applyLeaderSkillLogic(
      simState,
      'red',
      GameState.enemyConfig.leaderSkill.action,
      tokenLanes
    );
  }

  if (handIdx !== -1) {
    const playedCard = cloneCard(simState.enemyHand[handIdx]);

    let cLanesForPass = cardTokenLanes ? [...cardTokenLanes] : null;

    if (laneIdx !== -1) {
      if (checkConstraints && playedCard) {
        if (
          hasSkill(playedCard, 'challenge') &&
          simState.playerBoard[laneIdx] === null
        )
          return null;
        if (
          hasSkill(playedCard, 'takeover') &&
          simState.enemyBoard[laneIdx] === null
        )
          return null;
        if (hasSkill(playedCard, 'legendary') && laneIdx !== 1) return null;
        if (
          hasSkill(playedCard, 'apex') &&
          !(
            simState.enemyBoard[laneIdx] &&
            hasSkill(simState.enemyBoard[laneIdx], 'legendary')
          )
        )
          return null;
        if (
          !hasSkill(playedCard, 'takeover') &&
          !hasSkill(playedCard, 'equip') &&
          !hasSkill(playedCard, 'apex') &&
          simState.enemyBoard[laneIdx] !== null &&
          !hasSkill(simState.enemyBoard[laneIdx], 'arm_self')
        ) {
          if (
            !(
              playedCard.skills &&
              playedCard.skills.find((s) => s.id === 'union') &&
              (simState.enemyBoard[laneIdx].baseId ===
                playedCard.skills.find((s) => s.id === 'union').targetId ||
                simState.enemyBoard[laneIdx].id ===
                  playedCard.skills.find((s) => s.id === 'union').targetId)
            )
          ) {
            return null;
          }
        }
      }

      if (playedCard) {
        if (
          (hasSkill(playedCard, 'equip') ||
            hasSkill(simState.enemyBoard[laneIdx], 'arm_self')) &&
          simState.enemyBoard[laneIdx]
        ) {
          const targetCard = simState.enemyBoard[laneIdx];
          targetCard.basePower =
            (targetCard.basePower || 0) + (playedCard.power || 0);
          targetCard.currentPower =
            (targetCard.currentPower || 0) + (playedCard.power || 0);
          let addedSkills = [];
          if (
            playedCard.skill &&
            playedCard.skill !== 'none' &&
            playedCard.skill !== 'equip'
          )
            addedSkills.push({
              id: playedCard.skill,
              value: playedCard.skillValue,
            });
          if (playedCard.skills)
            playedCard.skills.forEach((s) => {
              if (s.id !== 'equip')
                addedSkills.push({ id: s.id, value: s.value });
            });
          mergeCardSkills(targetCard, addedSkills);
          addedSkills.forEach((sk) => {
            // 配置系・復活系スキルは個別のアクションとして処理されるため、ここでは即時実行をスキップする
            if (
              ['clone', 'summon', 'split', 'puppet', 'resurrect'].includes(
                sk.id
              )
            ) {
              return;
            }
            applyActiveSkillLogic(
              simState,
              'red',
              laneIdx,
              sk.id,
              sk.value,
              [],
              cLanesForPass
            );
          });
        } else {
          let activeCard = playedCard;
          const unionSkill =
            playedCard.skills &&
            playedCard.skills.find((s) => s.id === 'union');
          if (
            unionSkill &&
            simState.enemyBoard[laneIdx] &&
            (simState.enemyBoard[laneIdx].baseId === unionSkill.targetId ||
              simState.enemyBoard[laneIdx].id === unionSkill.targetId)
          ) {
            const masterData =
              CARD_MASTER.find((c) => c.id === unionSkill.summonId) ||
              CARD_MASTER.find((c) => c.id === 'android');
            let uc = JSON.parse(JSON.stringify(masterData));
            uc.owner = 'red';
            uc.baseId = uc.id;
            uc.currentPower = uc.power;
            uc.basePower = uc.power;
            uc.stunTurns = 0;
            simState.enemyBoard[laneIdx] = uc;
            activeCard = uc;
          } else {
            if (
              playedCard.currentPower === undefined ||
              Number.isNaN(playedCard.currentPower)
            ) {
              playedCard.currentPower = playedCard.power || 0;
              playedCard.basePower = playedCard.power || 0;
            }
            simState.enemyBoard[laneIdx] = playedCard;
          }
          // 出現時スキルを持つ場合は即座に保護フラグを立てる（シミュレーション時も同様に一時的な破壊を防ぐ）
          if (hasActiveSkill(activeCard)) {
            activeCard.isSkillResolving = true;
          }
          let skills = [];
          if (activeCard.skill && activeCard.skill !== 'none') {
            if (
              activeCard.skill === 'choice' &&
              choiceIndex !== undefined &&
              activeCard.choices
            ) {
              let idxs = Array.isArray(choiceIndex)
                ? choiceIndex
                : [choiceIndex];
              idxs.forEach((idx) => {
                if (activeCard.choices[idx])
                  skills.push({
                    id: activeCard.choices[idx].id,
                    value: activeCard.choices[idx].value,
                  });
              });
            } else
              skills.push({
                id: activeCard.skill,
                value: activeCard.skillValue,
              });
          }
          if (Array.isArray(activeCard.skills)) {
            activeCard.skills.forEach((sk) => {
              if (sk.id === 'choice') {
                let cIdx = sk.choiceGroup === 2 ? choiceIndex2 : choiceIndex;
                let cArr =
                  sk.choiceGroup === 2
                    ? activeCard.choices2
                    : activeCard.choices;
                if (cIdx !== undefined && cArr) {
                  let idxs = Array.isArray(cIdx) ? cIdx : [cIdx];
                  idxs.forEach((i) => {
                    if (cArr[i])
                      skills.push({ id: cArr[i].id, value: cArr[i].value });
                  });
                }
              } else skills.push(sk);
            });
          }

          // 選択されたスキルでカードのスキルを上書きし、パッシブスキルの評価に反映させる
          activeCard.skills = [...skills];
          activeCard.skill = 'none';

          if (!activeCard.skillTriggered) {
            skills.forEach((sk) => {
              if (sk.id === 'call') {
                // 【号令の仮評価（simulateMove版）】
                // processActionSequence と同じロジック: callの値分のパワーを仮加算
                const callBonus = sk.value || 3;
                const boardCard = simState.enemyBoard[laneIdx];
                if (boardCard) {
                  boardCard.currentPower =
                    (boardCard.currentPower || 0) + callBonus;
                  boardCard.basePower = (boardCard.basePower || 0) + callBonus;
                }
              } else if (sk.id === 'metamorph') {
                // 【変身の仮評価（simulateMove版）】
                // processActionSequence と同じロジック: 固定パワーで仮評価
                const boardCard = simState.enemyBoard[laneIdx];
                if (boardCard) {
                  boardCard.currentPower = METAMORPH_ESTIMATED_POWER;
                  boardCard.basePower = METAMORPH_ESTIMATED_POWER;
                }
              } else {
                applyActiveSkillLogic(
                  simState,
                  'red',
                  laneIdx,
                  sk.id,
                  sk.value,
                  [],
                  cLanesForPass
                );
              }
            });
          }
          // スキル解決が終わったため、保護フラグを解除する
          // 【招来・詠唱・鍛造】これらの連続プレイを伴う出現時スキルの場合は、
          // 次の追加プレイアクションが実行されるまで保護フラグ（isSkillResolving）を維持する
          if (activeCard) {
            const hasChainSummon =
              hasSkill(activeCard, 'invite') ||
              hasSkill(activeCard, 'chant') ||
              hasSkill(activeCard, 'forge');
            if (!hasChainSummon) {
              activeCard.isSkillResolving = false;
            }
          }
          if (
            simState.enemyBoard[laneIdx] &&
            simState.enemyBoard[laneIdx].currentPower <= 0 &&
            !simState.enemyBoard[laneIdx].isSkillResolving
          )
            simState.enemyBoard[laneIdx] = null;
        }
      }
    }
  }

  const hpBeforeCombat = simState.enemyHP;
  if (!(simState.extraTurnCount > 0)) {
    // 【修正】プレイヤーのターン開始に伴い、プレイヤー側カードの「無敵（invincible）」スキル持続ターンを減退・解除する
    simState.playerBoard.forEach((c) => {
      if (!c) return;

      // 1. メインの skill フィールドが invincible の場合
      if (c.skill === 'invincible') {
        c.skillValue = (c.skillValue || 1) - 1;
        if (c.skillValue <= 0) {
          c.skill = 'none';
          c.skillValue = 0;
        }
      }

      // 2. skills 配列内に invincible がある場合
      if (Array.isArray(c.skills)) {
        const invSk = c.skills.find((s) => s.id === 'invincible');
        if (invSk) {
          invSk.value--;
          if (invSk.value <= 0) {
            c.skills = c.skills.filter((s) => s !== invSk);
          }
        }
      }
    });

    // 【絶対厳守】プレイヤーの攻撃フェーズのみシミュレート。AI of the attackは次AIターンなので範囲外。
    applyPassiveSkillLogic(simState, 'blue');
    simState.playerBoard.forEach((c) => {
      if (c && c.stunTurns > 0) c.stunTurns--;
    });
    calculateCombatPhase(simState, 'blue');
    simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);
  } else {
    simState.extraTurnCount--;
    simState.combatDamageTaken = 0;
  }
  return simState;
}

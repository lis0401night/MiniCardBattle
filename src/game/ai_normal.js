import { GameState } from '../state/gameState.js';
import { AI_SKILL_UTILITY } from '../utils/constants/aiSkillValues.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { ACTIVE_SKILLS } from '../utils/constants/skills.js';
import {
  consumeArmSelf,
  getCurrentRNG,
  getSeededRandom,
  getSkillValue,
  hasSkill,
  mergeCardSkills,
  setCurrentRNG,
} from '../utils/gameUtils.js';
import {
  applyActiveSkillLogic,
  applyLeaderSkillLogic,
  applyPassiveSkillLogic,
  applySingleCombat,
  calculateCombatPhase,
  canCardBeDestroyed,
  isGraveKeeperActive,
  isMiasmaActive,
  isValkyriaGuardActive,
  processDestructionTriggers,
  quietDiscardFromBoard,
} from './engine.js';

// 判定補助: カードが何らかのアクティブスキルを持っているか（シミュレーション時の一時的な破壊を防ぐため）
function hasActiveSkill(c) {
  if (!c) return false;
  return ACTIVE_SKILLS.some((s) => hasSkill(c, s));
}

/**
 * AIシミュレーション内で分裂(split)スキル発動時に生成されるトークンカードオブジェクトを生成する。
 * 実行処理と分岐評価処理の両方で同じトークン構造（isToken: true, baseId）を保証する。
 * @param {object} execCard - 分裂スキルを持つカード
 * @param {number} tgtLane - 対象レーンインデックス (0~2)
 * @param {string} [owner='red'] - 所有者 ('blue' | 'red')
 * @returns {object} 生成されたシミュレーション用トークンカードオブジェクト
 */
function createSplitSimToken(execCard, tgtLane, owner = 'red') {
  const tokenId =
    execCard.summonId ||
    execCard.skills?.find((s) => s.id === 'split')?.summonId ||
    'token_legs';
  const tL = CARD_MASTER.find((m) => m.id === tokenId) || {
    name: 'トークン',
    power: 1,
  };
  const val = getSkillValue(execCard, 'split') || tL.power || 2;
  return {
    ...JSON.parse(JSON.stringify(tL)),
    id: `sp_sim_${Math.floor(getSeededRandom() * 1000000000)}_${tgtLane}`,
    baseId: tokenId,
    isToken: true,
    owner,
    imgUrl: `assets/cards/card_${tokenId}.webp`,
    power: val,
    currentPower: val,
    basePower: val,
    rarity: tL.rarity || 1,
  };
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

/**
 * ボード上の全カードの「無敵（invincible）」スキルの持続ターンを減退・解除する共通ヘルパー
 * @param {Array} board - カードの配列 (playerBoard または enemyBoard)
 */
function decayInvincibleSkills(board) {
  if (!Array.isArray(board)) return;
  board.forEach((c) => {
    if (!c) return;

    // 2. skills 配列内に invincible がある場合
    if (Array.isArray(c.skills)) {
      const invSk = c.skills.find((s) => s.id === 'invincible');
      if (invSk) {
        invSk.value = (invSk.value || 1) - 1;
        if (invSk.value <= 0) {
          c.skills = c.skills.filter((s) => s !== invSk);
        }
      }
    }
  });
}

const cloneCard = (c) => (c ? structuredClone(c) : null);

/**
 * canCardBeDestroyed が参照する加護カウンターのみを持つ軽量ステートオブジェクトを生成します。
 * @returns {Object} { valkyriaGuardBlue: number, valkyriaGuardRed: number }
 */
function createGuardProjectedState() {
  return {
    valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
    valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
  };
}

// リーダースキルが特定のレーンにトークン・カードを配置するかを判定するヘルパー
function isLaneOccupiedByLeaderSkill(lane, context) {
  if (!context || !context.tokenLanes) return false;
  const action = context.action;

  if (
    [
      'holy_march',
      'evil_march',
      'satan_avatar',
      'dragon_summon',
      'dragon_high_ritual',
      'devilhunter_resurrect',
      'dungeon_summon_leader',
      'warlock_place_demons',
    ].includes(action)
  ) {
    return context.tokenLanes.includes(lane);
  }

  if (action === 'night_parade') {
    return (
      context.tokenLanes.allied && context.tokenLanes.allied.includes(lane)
    );
  }

  if (action === 'overdrive') {
    return (
      Array.isArray(context.tokenLanes) && context.tokenLanes.includes(lane)
    );
  }

  return false;
}

// リーダースキルで配置されるカードが「伝説」を持つかを判定するヘルパー
function isLegendarySummonedByLeaderSkill(lane, context) {
  if (!context || !context.tokenLanes) return false;
  const action = context.action;

  if (action === 'dungeon_summon_leader' && context.tokenLanes.includes(lane)) {
    if (context.leaderCardId) {
      const leaderCard = CARD_MASTER.find((c) => c.id === context.leaderCardId);
      return leaderCard && hasSkill(leaderCard, 'legendary');
    }
  }

  if (
    (action === 'devilhunter_resurrect' && context.tokenLanes.includes(lane)) ||
    (action === 'overdrive' && context.tokenLanes[0] === lane)
  ) {
    if (context.targetCard) {
      return hasSkill(context.targetCard, 'legendary');
    }
  }

  if (action === 'overdrive' && context.tokenLanes[1] === lane) {
    const oppDiscard = GameState.playerDiscard || [];
    const validCards = oppDiscard.filter((c) => c && !c.isToken);
    if (validCards.length > 0) {
      const sorted = [...validCards].sort(
        (a, b) => (b.power || 0) - (a.power || 0)
      );
      const targetOppCard = sorted[0];
      return targetOppCard && hasSkill(targetOppCard, 'legendary');
    }
  }

  return false;
}

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

/**
 * AIシミュレーション中にカードへ一時保留されていた即時スキルを発動し、保留リストを削除する
 *
 * @param {Object} simState - シミュレーション状態オブジェクト
 * @param {Object|null} card - 保留スキルを持つカードオブジェクト
 * @param {number} lane - カードが配置されているレーンインデックス
 * @returns {void}
 */
function flushPendingSimSkills(simState, card, lane) {
  if (!card || !Array.isArray(card._pendingSimSkills)) return;
  if (card._pendingSimSkills.length === 0) return;
  for (const pendingSk of card._pendingSimSkills) {
    applyActiveSkillLogic(
      simState,
      'red',
      lane,
      pendingSk.id,
      pendingSk.value,
      [],
      pendingSk.targetLanes ? [...pendingSk.targetLanes] : null,
      undefined
    );
  }
  delete card._pendingSimSkills;
}

export function processActionSequence(
  actionQueue,
  isLeaderSkillPlay = false,
  leaderSkillActionStr = null,
  leaderSkillTokenLanes = null,
  skillOrderTiming = 'before',
  leaderSkillTargetIdx = null,
  leaderSkillTargetUid = null,
  initialSimState = null,
  leaderSkillResurrectLane = null,
  leaderSkillOppTargetIdx = null,
  leaderCardSkillActions = null
) {
  actionQueue = [...actionQueue];
  const savedRNG = getCurrentRNG();
  try {
    let simState = initialSimState
      ? {
          ...initialSimState,
          valkyriaGuardBlue: initialSimState.valkyriaGuardBlue ?? 0,
          valkyriaGuardRed: initialSimState.valkyriaGuardRed ?? 0,
          playerConfig:
            initialSimState.playerConfig ??
            (GameState.playerConfig
              ? JSON.parse(JSON.stringify(GameState.playerConfig))
              : null),
          enemyConfig:
            initialSimState.enemyConfig ??
            (GameState.enemyConfig
              ? JSON.parse(JSON.stringify(GameState.enemyConfig))
              : null),
        }
      : null;
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
        enemyHand: GameState.enemyHand
          ? GameState.enemyHand.map(cloneCard)
          : [],
        playerDeck: GameState.playerDeck
          ? GameState.playerDeck.map(cloneCard)
          : [],
        enemyDeck: GameState.enemyDeck
          ? GameState.enemyDeck.map(cloneCard)
          : [],
        playerConfig: GameState.playerConfig
          ? JSON.parse(JSON.stringify(GameState.playerConfig))
          : null,
        enemyConfig: GameState.enemyConfig
          ? JSON.parse(JSON.stringify(GameState.enemyConfig))
          : null,
        valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
        valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
        turnCount: GameState.turnCount || 0,
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
        leaderSkillTargetUid,
        leaderSkillResurrectLane,
        leaderSkillOppTargetIdx
      );
      if (simState._actionQueue && simState._actionQueue.length > 0) {
        actionQueue.unshift(...simState._actionQueue);
        delete simState._actionQueue;
      }
      // リーダースキル適用後、パワー0以下のカードを破壊済みとしてnullにする
      // （targeted_destruction等はcurrentPowerを0にするだけなので、制約チェックが正しく機能するよう反映）
      for (let i = 0; i < 3; i++) {
        if (
          simState.playerBoard[i] &&
          simState.playerBoard[i].currentPower <= 0
        )
          simState.playerBoard[i] = null;
        if (simState.enemyBoard[i] && simState.enemyBoard[i].currentPower <= 0)
          simState.enemyBoard[i] = null;
      }

      // 【リーダーカードのスキルシミュレーション】
      // buildSkillBranchで生成されたアクション（resurrect, summon, clone等）をactionQueueに追加
      if (leaderCardSkillActions && leaderCardSkillActions.length > 0) {
        actionQueue.unshift(...leaderCardSkillActions);
      }

      // リーダーカードの非分岐系スキル（call, heal等）を手札カードと同じ近似処理でシミュレート
      if (
        leaderSkillActionStr === 'dungeon_summon_leader' &&
        leaderSkillTokenLanes &&
        leaderSkillTokenLanes.length > 0
      ) {
        const leaderLane = leaderSkillTokenLanes[0];
        const boardCard = simState.enemyBoard[leaderLane];
        if (boardCard && !boardCard.skillTriggered) {
          const lCardConfig = GameState.enemyConfig;
          const lCardMaster = lCardConfig?.leaderCardId
            ? CARD_MASTER.find((m) => m.id === lCardConfig.leaderCardId)
            : null;
          if (lCardMaster && lCardMaster.skills) {
            lCardMaster.skills.forEach((sk) => {
              // 1. ユーティリティボーナス系スキル (手札プレイ時と同等)
              if (sk.id === 'draw') {
                simState.actionUtilityBonus =
                  (simState.actionUtilityBonus || 0) +
                  (AI_SKILL_UTILITY[sk.id] || 0);
              }

              // 2. leap（追加ターン）のボーナス処理
              if (sk.id === 'leap') {
                simState.extraTurnCount = (simState.extraTurnCount || 0) + 1;
                simState.attackSkipCount = (simState.attackSkipCount || 0) + 1;
              }

              // 3. すでに buildSkillBranch で分岐アクションとして登録されている（またはパッシブな）ものはシミュレーション処理から除外
              if (
                [
                  'resurrect',
                  'summon',
                  'ambush',
                  'invite',
                  'chant',
                  'clone',
                  'puppet',
                  'forge',
                  'execute',
                  'convert',
                  'draw',
                  'reinforce',
                  'leap',
                ].includes(sk.id)
              )
                return;
              // 号令: デッキトップからカードを出す動的スキルのため、パワーボーナスで近似
              if (sk.id === 'call') {
                const callBonus = sk.value || 3;
                boardCard.currentPower =
                  (boardCard.currentPower || 0) + callBonus;
                boardCard.basePower = (boardCard.basePower || 0) + callBonus;
              } else if (sk.id === 'metamorph') {
                boardCard.currentPower = METAMORPH_ESTIMATED_POWER;
                boardCard.basePower = METAMORPH_ESTIMATED_POWER;
              } else if (
                ['heal', 'bless', 'morph', 'shuffle'].includes(sk.id)
              ) {
                // ユーティリティボーナス系スキル (瘴気発動時は回復ボーナスを除外)
                if (sk.id !== 'heal' || !isMiasmaActive(simState)) {
                  simState.actionUtilityBonus =
                    (simState.actionUtilityBonus || 0) +
                    (AI_SKILL_UTILITY[sk.id] || 0);
                }
              } else {
                // その他のスキル: applyActiveSkillLogicで直接シミュレート
                applyActiveSkillLogic(
                  simState,
                  'red',
                  leaderLane,
                  sk.id,
                  sk.value,
                  [],
                  null,
                  undefined
                );
              }
            });
            boardCard.skillTriggered = true;
          }
        }
      }
    }

    let parentCardOnLane = [null, null, null];
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
              parentCardOnLane[i] = c; // 親カードの参照を記録
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

      if (action.type === 'execute') {
        const tgtLane = action.targetLane;
        if (tgtLane !== undefined && simState.enemyBoard[tgtLane] !== null) {
          const execCard = simState.enemyBoard[tgtLane];
          if (canCardBeDestroyed(simState, execCard, 'red')) {
            // 分裂(split): 墓地送りにせず、対象レーンにトークンを配置する
            if (hasSkill(execCard, 'split')) {
              if (
                !simState.enemySealedLanes ||
                simState.enemySealedLanes[tgtLane] === 0
              ) {
                simState.enemyBoard[tgtLane] = createSplitSimToken(
                  execCard,
                  tgtLane,
                  'red'
                );
              } else {
                quietDiscardFromBoard(simState, 'red', tgtLane);
              }
            } else {
              quietDiscardFromBoard(simState, 'red', tgtLane);
            }
          }
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
          // 【スキップ時の保留スキル発動】
          // 連鎖スキルがスキップされた場合でも、親カードに保留されていた
          // 即時スキル（quick/snipe等）は発動する必要がある
          for (let i = 0; i < 3; i++) {
            flushPendingSimSkills(simState, parentCardOnLane[i], i);
          }
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
        const side = action.owner || 'red';
        const sealedLanes =
          side === 'blue'
            ? simState.playerSealedLanes
            : simState.enemySealedLanes;
        const targetBoard =
          side === 'blue' ? simState.playerBoard : simState.enemyBoard;
        const targetDiscard =
          side === 'blue' ? simState.playerDiscard : simState.enemyDiscard;
        const sourceL =
          simState.lastPlayedLane !== -1 ? simState.lastPlayedLane : 0;
        const sourceCard = targetBoard[sourceL];
        // パワー0カードが破壊済みの場合、applyActiveSkillLogic は c=null で即リターンするため
        // summonId が分かっているなら直接トークンを生成する
        if (['summon', 'clone', 'split', 'ambush'].includes(action.skillId)) {
          let tokenPower = action.skillValue || 1;
          if (action.skillId === 'clone' && sourceCard) {
            tokenPower =
              sourceCard.currentPower !== undefined
                ? sourceCard.currentPower
                : sourceCard.power || 0;
          }
          let tokenId = action.summonId;
          if (!tokenId) {
            if (action.skillId === 'clone') {
              tokenId = 'token_clone';
            } else {
              // summon / split のフォールバック（summonIdが未指定の場合）
              tokenId = tokenPower >= 5 ? 'token_golem' : 'token_drone';
            }
          }
          const baseMaster = CARD_MASTER.find((m) => m.id === tokenId);
          const lanes = [...(action.lanes || [])];
          for (const tLane of lanes) {
            if (sealedLanes[tLane] > 0) continue;
            // cloneトークンは元カードのスキルを引き継ぐ（分身含む全スキル）
            // 分身(clone)は召喚時にしか発動しないため、コピーしても影響がない
            let inheritedSkills = [];
            if (action.skillId === 'clone' && sourceCard) {
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
              owner: side,
              imgUrl: `assets/cards/card_${tokenId}.webp`,
              power: tokenPower,
              basePower: tokenPower,
              currentPower: tokenPower,
              voiceCategory: baseMaster?.voiceCategory || 'monster',
              skills: inheritedSkills,
            };
            // 【起動(startup)】起動カードの上にトークンを配置する場合の特別処理
            // トークンは墓地に送られ、起動カードからstartupとdefenderが除去されて盤面に残る
            const existingCard = targetBoard[tLane];
            if (existingCard && hasSkill(existingCard, 'startup')) {
              existingCard.skills = existingCard.skills.filter(
                (s) => s.id !== 'startup' && s.id !== 'defender'
              );
              if (!newToken.isToken) {
                targetDiscard.push(newToken);
              }
            } else if (
              existingCard &&
              (hasSkill(newToken, 'equip') ||
                hasSkill(existingCard, 'arm_self')) &&
              !hasSkill(existingCard, 'possession') &&
              !hasSkill(newToken, 'possession') &&
              !hasSkill(existingCard, 'reflect') &&
              !hasSkill(newToken, 'reflect')
            ) {
              // 【装備(equip) / 武装(arm_self)】トークンの装備合体をシミュレート
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
              // 武装（arm_self）の消費処理
              consumeArmSelf(existingCard, newToken);
            } else if (existingCard) {
              // 装備不可: 既存カードを墓地に移動して上書き
              if (!existingCard.isToken) {
                targetDiscard.push(existingCard);
              }
              targetBoard[tLane] = newToken;
            } else {
              // 空きレーン: そのまま配置
              targetBoard[tLane] = newToken;
            }
            // 奇襲（ambush）の場合、配置したレーンでただちに戦闘を行い、戦闘で破壊されたカードを即時クリーンアップする
            if (action.skillId === 'ambush') {
              if (newToken) newToken.isSkillResolving = false;
              applySingleCombat(simState, side, tLane, []);
              processDestructionTriggers(simState, []);
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
      } else if (action.type === 'resurrect' || action.type === 'puppet') {
        if (action.simulated) {
          // すでに applyLeaderSkillLogic 内でシミュレーション盤面への適用・墓地削除が完了しているため
          // シミュレーションでの二重解決はスキップする
          continue;
        }
        if (isGraveKeeperActive(simState)) return null;
        if (lIdx === -1) continue; // 明示的キャンセル
        const targetDiscardPile =
          action.type === 'puppet'
            ? simState.playerDiscard
            : simState.enemyDiscard;
        // 【重要】UID優先照合: リーダースキルのspliceでインデックスがずれる問題を回避
        let resIdx = -1;
        if (action.targetUid) {
          resIdx = targetDiscardPile.findIndex(
            (c) =>
              c &&
              (c.uid === action.targetUid ||
                c.baseId === action.targetUid ||
                c.id === action.targetUid)
          );
        }
        if (resIdx === -1 && action.targetIdx !== undefined) {
          resIdx = action.targetIdx;
        }
        if (resIdx === -1 || !targetDiscardPile[resIdx]) return null;
        playedCard = cloneCard(targetDiscardPile[resIdx]);
        if (action.type === 'puppet') {
          playedCard.owner = 'red';
          playedCard.puppetOriginalOwner =
            playedCard.puppetOriginalOwner || 'blue';
        }
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
        targetDiscardPile[resIdx] = null;
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
              targetCard.power =
                (targetCard.power || 0) + (selectedCard.power || 0);
              targetCard.basePower =
                (targetCard.basePower || 0) + (selectedCard.power || 0);
              targetCard.currentPower =
                (targetCard.currentPower || 0) + (selectedCard.power || 0);

              if (!targetCard.skills) {
                targetCard.skills = [];
              }
              const equipSkills = [];
              if (selectedCard.skills) {
                selectedCard.skills.forEach((s) => {
                  if (s.id !== 'equip') equipSkills.push(s);
                });
              }
              mergeCardSkills(targetCard, equipSkills);

              targetCard.equippedCards = targetCard.equippedCards || [];
              targetCard.equippedCards.push(selectedCard);

              // 武装（arm_self）の消費処理
              consumeArmSelf(targetCard, selectedCard);
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
        action.type === 'overdrive' ||
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
        if (hasSkill(playedCard, 'takeover')) {
          const hasExisting =
            simState.enemyBoard[lIdx] !== null ||
            parentCardOnLane[lIdx] !== null;
          if (!hasExisting) return null;
        }
        if (hasSkill(playedCard, 'legendary') && lIdx !== 1) return null;
        if (hasSkill(playedCard, 'apex')) {
          const targetCard =
            simState.enemyBoard[lIdx] || parentCardOnLane[lIdx];
          if (!targetCard || !hasSkill(targetCard, 'legendary')) {
            return null;
          }
        }
      }

      // 【装備・配置共通】選択スキル（choice/force）を事前解決し、手札カードのスキル情報に反映する
      if (playedCard) {
        let newSkillsArr = [];

        // 複数スキル配列（skills）内の各要素が choice / force の場合
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
        playedCard.skills = newSkillsArr;
      }

      const existingCard = simState.enemyBoard[lIdx];
      let skillWasHandledByEquip = false;
      if (existingCard && hasSkill(existingCard, 'startup')) {
        skillWasHandledByEquip = true;
        existingCard.skills = existingCard.skills.filter(
          (s) => s.id !== 'startup' && s.id !== 'defender'
        );
        simState.enemyDiscard.push(playedCard);
        actionQueue.length = 0; // 起動消滅したため、このカードによる後続の連鎖アクションをすべてキャンセル
      } else if (
        (hasSkill(playedCard, 'equip') ||
          (existingCard && hasSkill(existingCard, 'arm_self'))) &&
        existingCard
      ) {
        skillWasHandledByEquip = true;
        const targetCard = existingCard;
        targetCard.basePower =
          (targetCard.basePower || 0) + (playedCard.power || 0);
        targetCard.currentPower =
          (targetCard.currentPower || 0) + (playedCard.power || 0);
        let addedSkills = [];
        if (playedCard.skills)
          playedCard.skills.forEach((s) => {
            if (s.id !== 'equip')
              addedSkills.push({ id: s.id, value: s.value });
          });
        mergeCardSkills(targetCard, addedSkills);

        // 武装（arm_self）の消費処理
        consumeArmSelf(targetCard, playedCard);
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
        // ※ 復活(resurrect)・傀儡(puppet)による「配置」経路では triggerSkills=false のため、
        //    アクティブスキルの即時発動は行わない（ゲームルール準拠: 配置ではスキル不発）
        if (triggerSkills) {
          addedSkills.forEach((sk) => {
            // 配置系・復活系スキルは buildSkillBranch 内のアクションで個別管理するため、ここでは即時実行をスキップする
            if (
              [
                'clone',
                'summon',
                'ambush',
                'puppet',
                'resurrect',
                'execute',
              ].includes(sk.id)
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
          if (simState.enemyBoard[lIdx] !== null) {
            quietDiscardFromBoard(simState, 'red', lIdx);
          }
          simState.enemyBoard[lIdx] = playedCard;
        }

        // 出現時スキルを持つ場合は即座に保護フラグを立てる（シミュレーション時も同様に一時的な破壊を防ぐ）
        if (hasActiveSkill(activeCardForSkills)) {
          activeCardForSkills.isSkillResolving = true;
        }

        let skills = [];
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
          activeCardForSkills.skills = newSkillsArr;
        }

        if (triggerSkills && !activeCardForSkills.skillTriggered) {
          // 【連鎖スキルと即時スキルの実行順序制御】
          // カードが連鎖スキル（forge/invite/chant）を持つ場合、
          // 除外リスト外の即時スキル（quick/snipe等）は連鎖完了後に発動する必要がある。
          // （例: forge→装備合体→quickの順で処理しないと、装備前のパワーで速攻が発動してしまう）
          // battle.js の resolveOnPlaySkill と同じ実行順序を再現するため、
          // 連鎖スキルを持つカードでは即時スキルを _pendingSimSkills に保留し、
          // アクションキュー上で連鎖子アクションが処理される際に発動させる。
          const hasChainSkill =
            hasSkill(activeCardForSkills, 'forge') ||
            hasSkill(activeCardForSkills, 'invite') ||
            hasSkill(activeCardForSkills, 'chant');

          skills.forEach((sk) => {
            if (['draw', 'heal', 'bless', 'morph', 'shuffle'].includes(sk.id)) {
              if (sk.id !== 'heal' || !isMiasmaActive(simState)) {
                simState.actionUtilityBonus =
                  (simState.actionUtilityBonus || 0) +
                  (AI_SKILL_UTILITY[sk.id] || 0);
              }
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
                'ambush',
                'resurrect',
                'awake',
                'clone',
                'split',
                'forge',
                'execute',
              ].includes(sk.id)
            ) {
              // 連鎖スキルを持つカードの場合は即時スキルを保留する
              if (hasChainSkill) {
                if (!activeCardForSkills._pendingSimSkills) {
                  activeCardForSkills._pendingSimSkills = [];
                }
                activeCardForSkills._pendingSimSkills.push({
                  id: sk.id,
                  value: sk.value,
                  targetLanes: action.cardTokenLanes
                    ? [...action.cardTokenLanes]
                    : null,
                });
              } else {
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
            }
          });
          activeCardForSkills.skillTriggered = true;
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

      // 【連鎖スキル完了後の保留スキル発動】
      // 連鎖スキル（forge/invite/chant）の子アクション処理（装備合体や追加カード配置）が完了した後に、
      // 親カードに保留されていた即時スキル（quick/snipe等）を発動する。
      // これにより装備合体完了後の強化ステータスで速攻や砲撃が正しく実行される。
      if (
        action.type === 'invite' ||
        action.type === 'chant' ||
        action.type === 'forge'
      ) {
        for (let i = 0; i < 3; i++) {
          flushPendingSimSkills(simState, parentCardOnLane[i], i);
        }
      }
    }

    // 【保留スキルの最終回収】
    // 連鎖スキル（forge/invite/chant）の子アクションがアクションキューに
    // 生成されなかった場合でも、保留された即時スキルを必ず発動させる。
    for (let i = 0; i < 3; i++) {
      flushPendingSimSkills(simState, simState.enemyBoard[i], i);
    }

    // アクションキュー全解決後、敵の攻撃（プレイヤーのダイレクトアタック）をシミュレートする前に
    // 全カードのスキル解決保護フラグ（isSkillResolving）を強制解除し、パワー0以下のカードを盤面から完全に除去（null化）する
    [simState.playerBoard, simState.enemyBoard].forEach((b) => {
      if (Array.isArray(b)) {
        b.forEach((c) => {
          if (c) c.isSkillResolving = false;
        });
      }
    });
    processDestructionTriggers(simState, []);

    const hpBeforeCombat = simState.enemyHP;

    if (!(simState.extraTurnCount > 0)) {
      // 【修正】プレイヤーのターン開始に伴い、プレイヤー側カードの「無敵（invincible）」スキル持続ターンを減退・解除する
      decayInvincibleSkills(simState.playerBoard);

      applyPassiveSkillLogic(simState, 'blue');
      simState.playerBoard.forEach((c) => {
        if (c && c.stunTurns > 0) c.stunTurns--;
        if (c && c.cantAttackTurns > 0) c.cantAttackTurns--;
      });
      calculateCombatPhase(simState, 'blue');
      simState.combatDamageTaken = Math.max(
        0,
        hpBeforeCombat - simState.enemyHP
      );
    } else {
      simState.extraTurnCount--;
      simState.combatDamageTaken = 0;
    }

    return simState;
  } finally {
    setCurrentRNG(savedRNG);
  }
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
    forcedLane = undefined,
    leaderSkillContext = undefined
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
        // 生贄: 既にカードが置かれているレーン、またはリーダースキルで配置される予定のレーン
        if (hasSkill(card, 'takeover')) {
          availableLanes = availableLanes.filter((l) => {
            if (l === -1) return true;
            const hasExisting = myBoard[l] !== null;
            const willBeSummoned = isLaneOccupiedByLeaderSkill(
              l,
              leaderSkillContext
            );
            return hasExisting || willBeSummoned;
          });
        }
        // 頂点: 自分の場に「伝説」を持つカードがいるレーン、またはリーダースキルで伝説が配置される予定のレーン
        if (hasSkill(card, 'apex')) {
          availableLanes = availableLanes.filter((l) => {
            if (l === -1) return true;
            const hasLegendaryOnBoard =
              myBoard[l] && hasSkill(myBoard[l], 'legendary');
            const willLegendaryBeSummoned = isLegendarySummonedByLeaderSkill(
              l,
              leaderSkillContext
            );
            return hasLegendaryOnBoard || willLegendaryBeSummoned;
          });
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
      if (Array.isArray(card.choices)) {
        let cc = 1;
        if (card.skills) {
          const c = card.skills.find(
            (s) => s.id === 'choice' || s.id === 'force'
          );
          if (c) cc = c.value || 1;
        }
        cc = Math.min(cc, card.choices.length);
        const idxs = card.choices.map((_, i) => i);
        choiceCombinations = getCombinations(idxs, Math.min(idxs.length, cc));
      }
      if (Array.isArray(card.choices2)) {
        let cc2 = 1;
        const c2 = card.skills
          ? card.skills.find((s) => s.id === 'choice' && s.choiceGroup === 2)
          : null;
        if (c2) cc2 = c2.value || 1;
        cc2 = Math.min(cc2, card.choices2.length);
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
            const skillsToGather = Array.isArray(c.skills) ? [...c.skills] : [];

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

            const isSummonAction = [
              'play',
              'call',
              'invite',
              'chant',
              'forge',
              'dungeon_summon_leader', // 【試練の宮殿】敵リーダースキルによるカード配置時のスキルシミュレーション用
            ].includes(sourceType);
            if (isSummonAction) {
              // ※ awake（覚醒）はパッシブスキル（所有者のターン開始時発動）のため、ここには含めない
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
                      'ambush',
                      'puppet',
                      'leap',
                      'forge',
                      'execute',
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
              currentDiscarded = [],
              currentEnemyBoard = null,
              currentPlayerBoard = null
            ) => {
              if (currentSkills.length === 0 || currentDepth >= 4) return [[]];

              const activeEnemyBoard = currentEnemyBoard || myBoard;
              const activePlayerBoard = currentPlayerBoard || opBoard;

              let sk = currentSkills[0];
              let remainingSkills = currentSkills.slice(1);
              let results = [];

              // 【共通】配置系スキル以外は常に「このスキルをキャンセル/スキップする」選択肢を考慮する
              const isPlacementSkill = [
                'clone',
                'summon',
                'ambush',
                'puppet',
                'resurrect',
                'execute', // 処刑は強制配置系（破壊対象選択）のため、自動キャンセルの対象外とする
              ].includes(sk.id);
              if (!isPlacementSkill) {
                results.push(
                  ...buildSkillBranch(
                    remainingSkills,
                    currentUsedHand,
                    currentUsedDiscard,
                    currentDepth,
                    currentDiscarded,
                    activeEnemyBoard,
                    activePlayerBoard
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
                    lane,
                    leaderSkillContext
                  );
                  for (let cNode of children) {
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      [...currentUsedHand, i],
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscarded,
                      activeEnemyBoard,
                      activePlayerBoard
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
                    currentDepth + 1,
                    undefined,
                    leaderSkillContext
                  );
                  for (let cNode of children) {
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      [...currentUsedHand, i],
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscarded,
                      activeEnemyBoard,
                      activePlayerBoard
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
                    const isParentOnThisLane = j === lane;
                    const simulatedBoardCard = isParentOnThisLane
                      ? card
                      : activeEnemyBoard[j];
                    if (simulatedBoardCard !== null) {
                      if (isEquip || hasSkill(simulatedBoardCard, 'arm_self')) {
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
                        currentDiscarded,
                        activeEnemyBoard,
                        activePlayerBoard
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
                  currentDiscarded,
                  activeEnemyBoard,
                  activePlayerBoard
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
                  currentDiscarded,
                  activeEnemyBoard,
                  activePlayerBoard
                );
                for (let nb of leapBranch) {
                  results.push([{ type: 'leap' }, ...nb]);
                }
              } else if (sk.id === 'resurrect') {
                const maxP = sk.value || 1;
                const candidates = [...originalDiscard, ...currentDiscarded];

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
                      targetUid: resCard.uid,
                      laneIdx: j,
                      maxP: maxP,
                    };
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      currentUsedHand,
                      [...currentUsedDiscard, i],
                      currentDepth,
                      currentDiscarded,
                      activeEnemyBoard,
                      activePlayerBoard
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
                  currentDiscarded,
                  activeEnemyBoard,
                  activePlayerBoard
                );
                for (let nb of cancelBranches) {
                  results.push([cancelNode, ...nb]);
                }
              } else if (sk.id === 'execute') {
                // 【処刑】自分の通常カード1枚を選択して破壊する（トークンは除外）
                let occupiedLanes = [];
                for (let j = 0; j < 3; j++) {
                  const simulatedBoardCard =
                    j === lane ? card : activeEnemyBoard[j];
                  if (simulatedBoardCard !== null) {
                    occupiedLanes.push(j);
                  }
                }

                if (occupiedLanes.length > 0) {
                  for (let tgtLane of occupiedLanes) {
                    let execNode = {
                      type: 'execute',
                      targetLane: tgtLane,
                    };
                    const destroyedCard =
                      tgtLane === lane ? card : activeEnemyBoard[tgtLane];
                    // canCardBeDestroyed が参照するのは加護カウンターのみのため軽量オブジェクトを生成
                    const projectedState = createGuardProjectedState();
                    const isDestroyable =
                      destroyedCard &&
                      canCardBeDestroyed(projectedState, destroyedCard, 'red');
                    let newlyDiscarded = [...currentDiscarded];
                    if (
                      destroyedCard &&
                      !destroyedCard.isToken &&
                      !hasSkill(destroyedCard, 'split') &&
                      isDestroyable
                    ) {
                      newlyDiscarded.push(destroyedCard);
                    }

                    // 破壊された後の盤面を生成して引き継ぐ（splitスキルの場合は封印されていないレーンのみトークンを残留させる）
                    const nextEnemyBoard = activeEnemyBoard.map((c) =>
                      c ? { ...c } : null
                    );
                    if (isDestroyable) {
                      const canPlaceSplitToken =
                        !mySealedLanes || mySealedLanes[tgtLane] === 0;
                      nextEnemyBoard[tgtLane] =
                        hasSkill(destroyedCard, 'split') && canPlaceSplitToken
                          ? createSplitSimToken(destroyedCard, tgtLane, 'red')
                          : null;
                    }

                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      currentUsedHand,
                      currentUsedDiscard,
                      currentDepth,
                      newlyDiscarded,
                      nextEnemyBoard,
                      activePlayerBoard
                    );
                    for (let nb of nextBranches) {
                      results.push([execNode, ...nb]);
                    }
                  }
                } else {
                  return buildSkillBranch(
                    remainingSkills,
                    currentUsedHand,
                    currentUsedDiscard,
                    currentDepth,
                    currentDiscarded,
                    activeEnemyBoard,
                    activePlayerBoard
                  );
                }
              } else if (sk.id === 'berserk') {
                // 【狂乱】隣接レーンの自分の通常カードが破壊されるかを予測し、バッファに追加
                const bVal = sk.value || 2;
                const adjLanes = lane === 1 ? [0, 2] : [1];
                let newlyDiscarded = [...currentDiscarded];
                adjLanes.forEach((j) => {
                  const adjCard = activeEnemyBoard[j];
                  if (adjCard && !adjCard.isToken) {
                    const isImmune = hasSkill(adjCard, 'immune');
                    const currentP = adjCard.currentPower ?? adjCard.power ?? 0;
                    if (!isImmune && currentP <= bVal) {
                      newlyDiscarded.push(adjCard);
                    }
                  }
                });

                return buildSkillBranch(
                  remainingSkills,
                  currentUsedHand,
                  currentUsedDiscard,
                  currentDepth,
                  newlyDiscarded,
                  activeEnemyBoard,
                  activePlayerBoard
                );
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
                      [...currentDiscarded, ...newlyDiscarded],
                      activeEnemyBoard,
                      activePlayerBoard
                    );
                    for (let nb of nextBranches) {
                      results.push([...discardNodes, ...nb]);
                    }
                  }
                }
                // ※ awake（覚醒）はパッシブスキル（所有者のターン開始時に発動）のため、
                //   召喚時のtoken_placementとしては扱わない。シミュレーション上は元のパワーのまま評価される。
              } else if (['clone', 'summon', 'ambush'].includes(sk.id)) {
                const count = sk.id === 'clone' ? sk.value || 1 : 1;
                // レーン選択の全組み合わせを生成するヘルパー
                // 同一レーンへの複数配置は武装カードへの装備等で有効な戦略のため、
                // 重複レーンを含む全パターンを生成する（例: [0,0]も有効）
                const generateLaneCombos = (remainingCount) => {
                  if (remainingCount <= 0) return [[]];
                  let combos = [];
                  let subCombos = generateLaneCombos(remainingCount - 1);
                  // 分身スキルの調整：元のレーン lane の隣接レーンのみを対象とする
                  const allowedLanes =
                    sk.id === 'clone' ? (lane === 1 ? [0, 2] : [1]) : [0, 1, 2];
                  for (let j of allowedLanes) {
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
                    owner: sk.owner,
                  };
                  let nextBranches = buildSkillBranch(
                    remainingSkills,
                    currentUsedHand,
                    currentUsedDiscard,
                    currentDepth,
                    currentDiscarded,
                    activeEnemyBoard,
                    activePlayerBoard
                  );
                  for (let nb of nextBranches) {
                    results.push([tokenNode, ...nb]);
                  }
                }
              } else if (sk.id === 'puppet') {
                const maxP = sk.value || 1;
                // 傀儡：相手の墓地（GameState.playerDiscard）から選択
                const candidates = GameState.playerDiscard || [];

                for (let i = 0; i < candidates.length; i++) {
                  let resCard = candidates[i];
                  if (!resCard || resCard.isToken) continue;

                  const master = CARD_MASTER.find(
                    (m) => m.id === resCard.id || m.id === resCard.baseId
                  );
                  const baseP = master ? master.power : resCard.power || 0;
                  if (baseP > maxP) continue;

                  for (let j = 0; j < 3; j++) {
                    if (mySealedLanes[j] > 0) continue;
                    let puppetNode = {
                      type: 'puppet',
                      targetIdx: i,
                      targetUid: resCard.uid,
                      laneIdx: j,
                      maxP: maxP,
                    };
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      currentUsedHand,
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscarded,
                      activeEnemyBoard,
                      activePlayerBoard
                    );
                    for (let nb of nextBranches) {
                      results.push([puppetNode, ...nb]);
                    }
                  }
                }

                // 傀儡の明示的なキャンセル分岐
                let cancelNode = {
                  type: 'puppet',
                  targetIdx: -1,
                  laneIdx: -1,
                  maxP: maxP,
                };
                let cancelBranches = buildSkillBranch(
                  remainingSkills,
                  currentUsedHand,
                  currentUsedDiscard,
                  currentDepth,
                  currentDiscarded,
                  activeEnemyBoard,
                  activePlayerBoard
                );
                for (let nb of cancelBranches) {
                  results.push([cancelNode, ...nb]);
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
                      currentDiscarded,
                      activeEnemyBoard,
                      activePlayerBoard
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
                    const chosenSkills = combo
                      .map((idx) => {
                        const choiceSkill = fArr[idx];
                        return choiceSkill ? { ...choiceSkill } : null;
                      })
                      .filter(Boolean);
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
                      currentDiscarded,
                      activeEnemyBoard,
                      activePlayerBoard
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
                  currentDiscarded,
                  activeEnemyBoard,
                  activePlayerBoard
                );
              }
              return results;
            };

            if (depth < 2 && effectiveSkills.length > 0) {
              // 上書き配置されるカード（通常カードのみ）があれば、一時墓地バッファの初期値として渡す
              let initialDiscarded = [];
              if (
                lane !== -1 &&
                myBoard[lane] !== null &&
                !myBoard[lane].isToken
              ) {
                initialDiscarded.push(myBoard[lane]);
              }
              const nextEnemyBoard = myBoard.map((c) => (c ? { ...c } : null));
              nextEnemyBoard[lane] = {
                ...card,
                owner: 'red',
              };

              let skillChains = buildSkillBranch(
                effectiveSkills,
                usedHand,
                usedDiscard,
                depth,
                initialDiscarded,
                nextEnemyBoard,
                opBoard
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
        'warlock_place_demons',
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
    } else if (action === 'iron_march' || action === 'last_battalion') {
      const avail = [0, 1, 2].filter((l) => mySealedLanes[l] === 0);
      let patterns = [];
      const repeatCount = action === 'last_battalion' ? 5 : 3;
      if (repeatCount === 3) {
        for (let l1 of avail) {
          for (let l2 of avail) {
            for (let l3 of avail) {
              patterns.push([l1, l2, l3]);
            }
          }
        }
      } else if (repeatCount === 5) {
        for (let l1 of avail) {
          for (let l2 of avail) {
            for (let l3 of avail) {
              for (let l4 of avail) {
                for (let l5 of avail) {
                  patterns.push([l1, l2, l3, l4, l5]);
                }
              }
            }
          }
        }
      }
      tokenLanePatterns = patterns.length > 0 ? patterns : [null];
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
      // 相手側に戦乙女の加護が有効な場合、破壊対象は成立しないため空撃ち候補を生成しない
      const oppGuarded = isValkyriaGuardActive(GameState, 'blue');
      if (oppGuarded) {
        tokenLanePatterns = [];
      } else {
        tokenLanePatterns = [0, 1, 2]
          .filter((l) => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune'))
          .map((l) => [l]);
        if (tokenLanePatterns.length === 0) tokenLanePatterns = [null];
      }
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
      const oppGuarded = isValkyriaGuardActive(GameState, 'blue');
      // 加護中や対象不在でも「ヴォイテクの配置」は有効なため、破壊対象なし(-1)の候補を必ず残す
      const enemyOcc = oppGuarded
        ? []
        : [0, 1, 2].filter(
            (l) => opBoard[l] !== null && !hasSkill(opBoard[l], 'immune')
          );
      const myAvail = [0, 1, 2].filter((l) => mySealedLanes[l] === 0);
      let combs = [];
      for (let m of myAvail) {
        for (let e of enemyOcc) combs.push([e, m]);
        combs.push([-1, m]); // 破壊対象を選ばず配置のみ行う
      }
      tokenLanePatterns = combs.length > 0 ? combs : [];
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
        const config = GameState.enemyConfig;
        const leaderCard =
          action === 'dungeon_summon_leader' && config?.leaderCardId
            ? CARD_MASTER.find((m) => m.id === config.leaderCardId)
            : null;
        const isDngResurrect =
          leaderCard &&
          leaderCard.skills &&
          leaderCard.skills.some((s) => s.id === 'resurrect');

        let isResurrectLeaderSkill =
          action === 'devilhunter_resurrect' ||
          action === 'overdrive' ||
          isDngResurrect;

        // 墓地が空、またはトークンしかない場合でもリーダー召喚自体は行えるように -1 を含める
        const validResurrectIndices = discard
          .map((card, idx) => ({ card, idx }))
          .filter(({ card }) => card && !card.isToken)
          .map(({ idx }) => idx);
        // overdriveでは-1（自動選択）を含めない: 全カードを明示インデックスで試し、
        // leaderSkillTargetUidが確実に設定されるようにする（-1だとnullになりランダムフォールバックに落ちる）
        // 墓地が空の場合のみ-1を使用（相手墓地からの復活だけでも機能するため）
        let dIdxLoop;
        if (action === 'overdrive' || action === 'devilhunter_resurrect') {
          dIdxLoop =
            validResurrectIndices.length > 0 ? validResurrectIndices : [-1];
        } else if (isDngResurrect) {
          // dungeon_summon_leader の resurrect は buildSkillBranch で処理するため外側ループでは [-1] のみ
          dIdxLoop = [-1];
        } else {
          dIdxLoop = isResurrectLeaderSkill
            ? [-1, ...validResurrectIndices]
            : [-1];
        }

        // オーバードライブ用: 相手墓地のカードも全通りシミュレーションする
        const oppDiscard = GameState.playerDiscard
          ? GameState.playerDiscard.map(cloneCard)
          : [];
        const validOppResurrectIndices =
          action === 'overdrive'
            ? oppDiscard
                .map((card, idx) => ({ card, idx }))
                .filter(({ card }) => card && !card.isToken)
                .map(({ idx }) => idx)
            : [];
        // overdriveでは-1を含めない（同理由: leaderSkillOppTargetUidがnullになるのを防ぐ）
        const oppDIdxLoop =
          action === 'overdrive' && validOppResurrectIndices.length > 0
            ? validOppResurrectIndices
            : [-1];

        // 【試練の宮殿（Trial Palace）敵リーダースキル専用】
        // 敵リーダーカードが配置される際のアクティブスキル分岐（召喚・復活・分身・傀儡等）を手札カードと同一のスコープ/条件でシミュレートするため、
        // buildCardPlayTree をダミー実行し、最初のアクション（dungeon_summon_leader）を切り落としてアクティブスキルの子アクションチェーンのみを抽出する。
        let leaderCardSkillBranches = [[]]; // デフォルト: スキル分岐なし（アクション空配列）
        if (
          leaderCard &&
          leaderCard.skills &&
          action === 'dungeon_summon_leader'
        ) {
          const hasActiveSkills = leaderCard.skills.some((s) =>
            [
              'invite',
              'chant',
              'resurrect',
              'convert',
              'draw',
              'reinforce',
              'clone',
              'summon',
              'ambush',
              'puppet',
              'leap',
              'forge',
              'execute',
              'choice',
              'force',
            ].includes(s.id)
          );
          if (hasActiveSkills) {
            // リーダーカードの配置レーンを推定（tokenLanes[0]、またはデフォルトの空きレーン）
            const leaderLane =
              tokenLanes && Array.isArray(tokenLanes) && tokenLanes.length > 0
                ? tokenLanes[0]
                : ([0, 2, 1].find(
                    (l) => mySealedLanes[l] === 0 && myBoard[l] === null
                  ) ?? 1);

            const trialPalaceLeaderSkillContext = {
              action: action,
              tokenLanes: tokenLanes,
              leaderCardId: config ? config.leaderCardId : null,
            };
            const trialPalaceDummyQueues = buildCardPlayTree(
              leaderCard,
              -1,
              'dungeon_summon_leader',
              hand,
              discard,
              [i],
              [],
              0,
              leaderLane,
              trialPalaceLeaderSkillContext
            );
            const branches = [];
            for (let q of trialPalaceDummyQueues) {
              let childQ = q.slice(1);
              if (
                q[0] &&
                (q[0].choices !== undefined || q[0].choices2 !== undefined)
              ) {
                childQ = [
                  {
                    type: 'choice',
                    choices: q[0].choices,
                    choices2: q[0].choices2,
                  },
                  ...childQ,
                ];
              }
              branches.push(childQ);
            }
            if (branches.length > 0) {
              leaderCardSkillBranches = branches;
            }
          }
        }

        for (let dIdxForTree of dIdxLoop) {
          // 復活対象がない（dIdxForTree === -1）なら復活レーン指定は不要（-1）にする
          // devilhunter_resurrect/overdrive 用のレーンループ（dungeon_summon_leader では不要）
          const actualResLaneLoop =
            isDngResurrect && dIdxForTree !== -1 ? [0, 1, 2] : [-1];

          for (let resLane of actualResLaneLoop) {
            // 封印されているレーンへの復活はシミュレーション上スキップ
            if (isDngResurrect && resLane !== -1 && mySealedLanes[resLane] > 0)
              continue;

            // 【リーダーカードスキル分岐ループ】buildSkillBranch で生成された全分岐を反復
            for (let leaderSkillChain of leaderCardSkillBranches) {
              // leaderSkillContext: 手札カードの制約チェック用（生贄・頂点等）
              // buildSkillBranch のチェーンから resurrect 情報を抽出して leaderSkillContext に反映
              const resAction = leaderSkillChain.find(
                (a) => a.type === 'resurrect' && a.laneIdx >= 0
              );
              let leaderSkillContext = {
                action: action,
                tokenLanes: tokenLanes,
                leaderCardId: config ? config.leaderCardId : null,
                targetCard:
                  isResurrectLeaderSkill && dIdxForTree !== -1
                    ? discard[dIdxForTree]
                    : resAction
                      ? discard[resAction.targetIdx]
                      : null,
                resurrectLane:
                  isDngResurrect && resAction
                    ? resAction.laneIdx
                    : isDngResurrect && dIdxForTree !== -1 && resLane !== -1
                      ? resLane
                      : null,
              };
              let qs = buildCardPlayTree(
                card,
                i,
                'play',
                hand,
                discard,
                [i],
                isResurrectLeaderSkill && dIdxForTree !== -1
                  ? [dIdxForTree]
                  : [],
                0,
                undefined,
                leaderSkillContext
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

                if (
                  action === 'devilhunter_resurrect' ||
                  action === 'overdrive'
                ) {
                  let dIdx = dIdxForTree;
                  // overdriveの場合は相手墓地カードも全通りシミュレーションする
                  const currentOppDIdxLoop =
                    action === 'overdrive' ? oppDIdxLoop : [-1];
                  for (let oppDIdx of currentOppDIdxLoop) {
                    let simState = processActionSequence(
                      actionQ,
                      true,
                      action,
                      tokenLanes,
                      'before',
                      dIdx,
                      dIdx !== -1 && discard[dIdx] ? discard[dIdx].uid : null,
                      null,
                      resLane,
                      oppDIdx !== -1 ? oppDIdx : null
                    );
                    if (simState) {
                      let fChcs = [fA.choices, fA.choices2].filter(
                        (x) => x !== undefined
                      );
                      const resTargetCard = discard[dIdx];
                      // overdriveの相手墓地ターゲットUID（実行時の直接選択に使用）
                      const oppTargetCard =
                        oppDIdx !== -1 && oppDiscard[oppDIdx]
                          ? oppDiscard[oppDIdx]
                          : null;
                      addCandidate(
                        {
                          index: i,
                          lane: fA.laneIdx,
                          isOverwrite: myBoard[fA.laneIdx] !== null,
                          useSkill: true,
                          tokenLanes,
                          skillOrder: 'before',
                          leaderSkillTargetIdx: dIdx,
                          leaderSkillTargetUid: resTargetCard
                            ? resTargetCard.uid
                            : null,
                          leaderSkillOppTargetUid: oppTargetCard
                            ? oppTargetCard.uid
                            : undefined,
                          leaderSkillResurrectLane: isDngResurrect
                            ? resLane
                            : undefined,
                          choiceIndexQueue:
                            fChcs.length > 0 ? fChcs : undefined,
                          cardTokenLanes: fA.cardTokenLanes,
                          actionQueue:
                            actionQ.slice(1).length > 0
                              ? actionQ
                                  .slice(1)
                                  .filter(
                                    (act) =>
                                      act.type !== 'overdrive' &&
                                      act.type !== 'devilhunter_resurrect'
                                  )
                                  .map((act) => {
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
                } else {
                  // その他（聖なる軍勢・魔王の化身・世界の再構築・百鬼夜行・試練の宮殿リーダー召喚等）
                  let simState = processActionSequence(
                    actionQ,
                    true,
                    action,
                    tokenLanes,
                    'before',
                    null,
                    null,
                    null,
                    null,
                    null,
                    leaderSkillChain.length > 0 ? leaderSkillChain : null
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
                        // リーダーカードスキルの分岐情報を保存（実行時にactionQueueに登録する）
                        leaderCardSkillActions:
                          leaderSkillChain.length > 0
                            ? leaderSkillChain
                            : undefined,
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
            } // End of leaderSkillChain loop
          } // End of resLane loop
        } // End of dIdxForTree loop
      }
    }
    for (let tokenLanes of tokenLanePatterns) {
      if (action === 'devilhunter_resurrect' || action === 'overdrive') {
        // overdriveの場合は相手墓地カードも全通りシミュレーションする
        const oppDiscardPass = GameState.playerDiscard
          ? GameState.playerDiscard.map(cloneCard)
          : [];
        const validOppIndicesPass =
          action === 'overdrive'
            ? oppDiscardPass
                .map((card, idx) => ({ card, idx }))
                .filter(({ card }) => card && !card.isToken)
                .map(({ idx }) => idx)
            : [];
        const oppDIdxLoopPass =
          action === 'overdrive' && validOppIndicesPass.length > 0
            ? validOppIndicesPass
            : [-1];

        for (let dIdx = 0; dIdx < discard.length; dIdx++) {
          if (discard[dIdx].isToken) continue;
          const resTargetCard = discard[dIdx];
          // overdriveの場合は相手墓地カードも全通りシミュレーションする
          const currentOppDIdxLoop =
            action === 'overdrive' ? oppDIdxLoopPass : [-1];
          for (let oppDIdx of currentOppDIdxLoop) {
            let simState = processActionSequence(
              [{ type: 'pass' }],
              true,
              action,
              tokenLanes,
              'before',
              dIdx,
              resTargetCard.uid,
              null,
              null,
              oppDIdx !== -1 ? oppDIdx : null
            );
            if (simState) {
              // overdriveの相手墓地ターゲットUID（実行時の直接選択に使用）
              const oppTargetCardPass =
                oppDIdx !== -1 && oppDiscardPass[oppDIdx]
                  ? oppDiscardPass[oppDIdx]
                  : null;
              addCandidate(
                {
                  index: -1,
                  lane: -1,
                  isOverwrite: false,
                  useSkill: true,
                  tokenLanes,
                  skillOrder: 'before',
                  leaderSkillTargetIdx: dIdx,
                  leaderSkillTargetUid: resTargetCard.uid,
                  leaderSkillOppTargetUid: oppTargetCardPass
                    ? oppTargetCardPass.uid
                    : undefined,
                },
                simState
              );
            }
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
    c.tieBreaker = 0;
    // レーン優先順位を加味 (左 0=3点, 右 2=2点, 中央 1=1点)
    let pri = 0;
    if (c.lane === 0) pri = 3;
    else if (c.lane === 2) pri = 2;
    else if (c.lane === 1) pri = 1;
    c.lanePriority = pri;
    // タイブレークに僅かな優先度ボーナスを乗せ、同点時に「左→右→中央」を選びやすくする
    c.tieBreaker += pri * 0.01;

    // トークンやリーダースキルの配置先にもタイブレークを適用（同点時に左を優先）
    if (c.cardTokenLanes && Array.isArray(c.cardTokenLanes)) {
      c.cardTokenLanes.forEach((l) => (c.tieBreaker += getLanePri(l) * 0.001));
    }
    if (c.tokenLanes && Array.isArray(c.tokenLanes)) {
      c.tokenLanes.forEach((l) => (c.tieBreaker += getLanePri(l) * 0.001));
    }
    if (c.actionQueue) {
      c.actionQueue.forEach((a) => {
        if (a.lanes && Array.isArray(a.lanes)) {
          a.lanes.forEach((l) => (c.tieBreaker += getLanePri(l) * 0.0001));
        } else if (a.laneIdx !== undefined && a.laneIdx !== -1) {
          c.tieBreaker += getLanePri(a.laneIdx) * 0.0001;
        }
      });
      // 【手数ペナルティ】アクション数（手数）が増えるごとにタイブレークを微小減点する
      // （不要な中間プレイによるタイブレーク加点を防ぎ、最短手数を選択させる）
      c.tieBreaker -= c.actionQueue.length * 0.002;
    }
  });

  // スコア順、次いでリーダースキル不使用優先、タイブレーク順、最後にアクションの短さ順でソート（不要なスキル消費を避ける）
  candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.00001) return b.score - a.score;
    if (a.useSkill !== b.useSkill) return a.useSkill ? 1 : -1;
    if (Math.abs((a.tieBreaker || 0) - (b.tieBreaker || 0)) > 0.00001) {
      return (b.tieBreaker || 0) - (a.tieBreaker || 0);
    }
    const aLen = a.actionQueue ? a.actionQueue.length : 0;
    const bLen = b.actionQueue ? b.actionQueue.length : 0;
    return aLen - bLen;
  });

  if (candidates.length === 0) return { index: -1, lane: -1, useSkill: false };

  // 1. 本質的な評価スコアが最善のもののみを抽出
  const bestScore = candidates[0].score;
  let bestGroup = candidates.filter(
    (c) => Math.abs(c.score - bestScore) < 0.00001
  );

  // 2. その中で、リーダースキルを使用しない選択肢があればそれを優先する
  const hasNoSkill = bestGroup.some((c) => !c.useSkill);
  if (hasNoSkill) {
    bestGroup = bestGroup.filter((c) => !c.useSkill);
  }

  // 3. その中で、タイブレークスコアが最善のもののみを抽出（バグ修正：不要なスキル使用を防止）
  const maxTieBreaker = Math.max(...bestGroup.map((c) => c.tieBreaker || 0));
  bestGroup = bestGroup.filter(
    (c) => Math.abs((c.tieBreaker || 0) - maxTieBreaker) < 0.00001
  );

  // 4. その中で最短のアクション数のものだけを残す（不要なスキル消費を避ける）
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

  // 【命令スキルの根本治療】
  // finalDecision と同じプレイ（同じカード・同じレーン）から分岐する他のシミュレーション候補を抽出し、
  // プレイヤーが選んだ命令（force）スキルの選択肢に応じて、アクションキューを切り替えられるよう branchMap を構築する。
  // ※ プレイしたカードまたはアクションキューの中に 'force' アクションが含まれる場合のみ適用する。
  const decisionQueue = Array.isArray(finalDecision.actionQueue)
    ? finalDecision.actionQueue
    : [];

  const playedCard =
    finalDecision.index !== -1 ? hand[finalDecision.index] : null;
  const hasForceInPlay =
    playedCard &&
    playedCard.skills &&
    playedCard.skills.some((s) => s.id === 'force');
  const hasForceInQueue = decisionQueue.some((act) => act.type === 'force');

  if (hasForceInPlay || hasForceInQueue) {
    const samePlayCandidates = candidates.filter(
      (c) =>
        c.index === finalDecision.index &&
        c.lane === finalDecision.lane &&
        c.useSkill === finalDecision.useSkill
    );

    const branchMap = {};
    samePlayCandidates.forEach((c) => {
      if (c.choiceIndexQueue && Array.isArray(c.choiceIndexQueue)) {
        // 例: [[1]] -> "1", [[0, 2]] -> "0,2"
        const key = c.choiceIndexQueue
          .map((q) =>
            Array.isArray(q) ? [...q].sort((a, b) => a - b).join(',') : ''
          )
          .join('|');

        const tempBranch = {
          actionQueue: c.actionQueue
            ? JSON.parse(JSON.stringify(c.actionQueue))
            : [],
          choiceIndexQueue: [],
          cardTokenLanes: [],
        };

        const revChain = [...tempBranch.actionQueue].reverse();
        revChain.forEach((act) => {
          if (act.type === 'choice' || act.type === 'force') {
            if (act.choices !== undefined) {
              tempBranch.choiceIndexQueue.unshift(act.choices);
            }
          } else if (act.type === 'token_placement') {
            if (act.lanes !== undefined) {
              const revLanes = [...act.lanes].reverse();
              revLanes.forEach((lane) => {
                tempBranch.cardTokenLanes.unshift(lane);
              });
            }
          } else if (act.type === 'resurrect') {
            if (act.laneIdx !== undefined && act.laneIdx !== -1) {
              tempBranch.cardTokenLanes.unshift(act.laneIdx);
            }
          } else if (act.type === 'dominate') {
            if (act.oppLaneIdx !== undefined && act.oppLaneIdx !== -1) {
              tempBranch.cardTokenLanes.unshift(act.oppLaneIdx);
            }
          }
        });

        if (!branchMap[key]) {
          branchMap[key] = tempBranch;
        }
      }
    });
    finalDecision.branches = branchMap;
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
        // 瘴気が発動中は回復・吸収系スキルの価値を評価しない（実戦で回復効果が100%無効化されるため）
        if (
          ['heal', 'absorb', 'heal_void'].includes(skillId) &&
          isMiasmaActive(state)
        ) {
          return;
        }

        const val = AI_SKILL_UTILITY[skillId];
        if (val === undefined || val === null) return;
        // 動的評価関数（hack等）の場合は関数を呼び出して値を取得する
        if (typeof val === 'function') {
          utilityScore += val(state, GameState);
        } else {
          utilityScore += val;
        }
      };
      if (Array.isArray(c.skills)) {
        c.skills.forEach((sk) => {
          // アクティブスキル（draw, heal等）は未発動時のみ加算
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
    playerConfig: GameState.playerConfig
      ? JSON.parse(JSON.stringify(GameState.playerConfig))
      : null,
    enemyConfig: GameState.enemyConfig
      ? JSON.parse(JSON.stringify(GameState.enemyConfig))
      : null,
    extraTurnCount: GameState.extraTurnCount || 0,
    attackSkipCount: GameState.attackSkipCount || 0,
    valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
    valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
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
    currentDiscard = [],
    laneIdx, // めくれた親カードが置かれるレーン
    currentEnemyBoard = null,
    currentPlayerBoard = null,
    leaderSkillContext = undefined
  ) => {
    if (currentSkills.length === 0 || currentDepth >= 4) return [[]];

    const activeEnemyBoard = currentEnemyBoard || GameState.enemyBoard;
    const activePlayerBoard = currentPlayerBoard || GameState.playerBoard;

    let sk = currentSkills[0];
    let remainingSkills = currentSkills.slice(1);
    let results = [];

    const isPlacementSkill = [
      'clone',
      'summon',
      'ambush',
      'puppet',
      'resurrect',
      'execute', // 処刑を追加
    ].includes(sk.id);
    if (!isPlacementSkill) {
      // 配置系スキル以外は常に「このスキルをキャンセル/スキップする」選択肢を考慮する
      results.push(
        ...buildSkillBranchAdhoc(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          activeEnemyBoard,
          activePlayerBoard,
          leaderSkillContext
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
            currentDiscard,
            laneIdx,
            activeEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
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
            currentDiscard,
            laneIdx,
            activeEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
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
          if (activeEnemyBoard[j] !== null) {
            if (isEquip || hasSkill(activeEnemyBoard[j], 'arm_self')) {
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
              currentDiscard,
              laneIdx,
              activeEnemyBoard,
              activePlayerBoard,
              leaderSkillContext
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
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        leaderSkillContext
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
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        leaderSkillContext
      );
      for (let nb of leapBranch) {
        results.push([{ type: 'leap' }, ...nb]);
      }
    } else if (sk.id === 'resurrect') {
      const originalDiscard = GameState.enemyDiscard || [];
      const maxP = sk.value || 1;
      const candidates = [...originalDiscard, ...currentDiscard];

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
            targetUid: resCard.uid,
            laneIdx: j,
            maxP: maxP,
          };
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            currentUsedHand,
            [...currentUsedDiscard, i],
            currentDepth,
            currentDiscard,
            laneIdx,
            activeEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
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
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        leaderSkillContext
      );
      for (let nb of cancelBranches) {
        results.push([cancelNode, ...nb]);
      }
    } else if (sk.id === 'execute') {
      // 【処刑】自分の通常カード1枚を選択して破壊する（トークンは除外）
      let occupiedLanes = [];
      for (let j = 0; j < 3; j++) {
        const simulatedBoardCard =
          j === laneIdx ? tokenCard : activeEnemyBoard[j];
        if (simulatedBoardCard !== null) {
          occupiedLanes.push(j);
        }
      }

      if (occupiedLanes.length > 0) {
        for (let tgtLane of occupiedLanes) {
          let execNode = {
            type: 'execute',
            targetLane: tgtLane,
          };
          const destroyedCard =
            tgtLane === laneIdx ? tokenCard : activeEnemyBoard[tgtLane];
          // canCardBeDestroyed が参照するのは加護カウンターのみのため軽量オブジェクトを生成
          const projectedState = createGuardProjectedState();
          const isDestroyable =
            destroyedCard &&
            canCardBeDestroyed(projectedState, destroyedCard, 'red');
          let newlyDiscarded = [...currentDiscard];
          if (
            destroyedCard &&
            !destroyedCard.isToken &&
            !hasSkill(destroyedCard, 'split') &&
            isDestroyable
          ) {
            newlyDiscarded.push(destroyedCard);
          }

          // 破壊された後の盤面を生成して引き継ぐ（splitスキルの場合は封印されていないレーンのみトークンを残留させる）
          const nextEnemyBoard = activeEnemyBoard.map((c) =>
            c ? { ...c } : null
          );
          if (isDestroyable) {
            const canPlaceSplitToken =
              !sealedLanes || sealedLanes[tgtLane] === 0;
            nextEnemyBoard[tgtLane] =
              hasSkill(destroyedCard, 'split') && canPlaceSplitToken
                ? createSplitSimToken(destroyedCard, tgtLane, 'red')
                : null;
          }

          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            currentUsedHand,
            currentUsedDiscard,
            currentDepth,
            newlyDiscarded,
            laneIdx,
            nextEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
          );
          for (let nb of nextBranches) {
            results.push([execNode, ...nb]);
          }
        }
      } else {
        return buildSkillBranchAdhoc(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          activeEnemyBoard,
          activePlayerBoard,
          leaderSkillContext
        );
      }
    } else if (sk.id === 'berserk') {
      // 【狂乱】隣接レーンの自分の通常カードが破壊されるかを予測し、バッファに追加
      const bVal = sk.value || 2;
      const adjLanes = laneIdx === 1 ? [0, 2] : [1];
      let newlyDiscarded = [...currentDiscard];
      adjLanes.forEach((j) => {
        const adjCard = activeEnemyBoard[j];
        if (adjCard && !adjCard.isToken) {
          const isImmune = hasSkill(adjCard, 'immune');
          const currentP = adjCard.currentPower ?? adjCard.power ?? 0;
          if (!isImmune && currentP <= bVal) {
            newlyDiscarded.push(adjCard);
          }
        }
      });

      return buildSkillBranchAdhoc(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        newlyDiscarded,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        leaderSkillContext
      );
    } else if (sk.id === 'dominate') {
      const maxP = sk.value || 0;
      const oppBoard = activePlayerBoard; // AI(自分)から見た相手は playerBoard
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

        // 支配（強奪）を反映した盤面を生成して引き継ぐ
        const nextEnemyBoard = activeEnemyBoard.map((c) =>
          c ? { ...c } : null
        );
        const nextPlayerBoard = activePlayerBoard.map((c) =>
          c ? { ...c } : null
        );
        const stolenCard = nextPlayerBoard[i];
        if (stolenCard) {
          nextEnemyBoard[myL] = {
            ...stolenCard,
            owner: 'red', // 自分が奪ったので自分(red)のもの
          };
          nextPlayerBoard[i] = null;
        }

        let nextBranches = buildSkillBranchAdhoc(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          nextEnemyBoard,
          nextPlayerBoard,
          leaderSkillContext
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
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        leaderSkillContext
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
            [...currentDiscard, ...newlyDiscarded],
            laneIdx,
            activeEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
          );
          for (let nb of nextBranches) {
            results.push([...discardNodes, ...nb]);
          }
        }
      }
    } else if (['clone', 'summon', 'ambush'].includes(sk.id)) {
      const count = sk.id === 'clone' ? sk.value || 1 : 1;
      const generateLaneCombos = (remainingCount) => {
        if (remainingCount <= 0) return [[]];
        let combos = [];
        let subCombos = generateLaneCombos(remainingCount - 1);
        // 分身スキルの調整：元のレーン laneIdx の隣接レーンのみを対象とする
        const allowedLanes =
          sk.id === 'clone' ? (laneIdx === 1 ? [0, 2] : [1]) : [0, 1, 2];
        for (let j of allowedLanes) {
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
          currentDiscard,
          laneIdx,
          activeEnemyBoard,
          activePlayerBoard,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([tokenNode, ...nb]);
        }
      }
    } else if (sk.id === 'puppet') {
      const originalDiscard = GameState.playerDiscard || []; // 相手の墓地
      const maxP = sk.value || 1;
      const candidates = [...originalDiscard];

      for (let i = 0; i < candidates.length; i++) {
        let resCard = candidates[i];
        if (!resCard || resCard.isToken) continue;

        const master = CARD_MASTER.find(
          (m) => m.id === resCard.id || m.id === resCard.baseId
        );
        const baseP = master ? master.power : resCard.power || 0;
        if (baseP > maxP) continue;

        for (let j = 0; j < 3; j++) {
          if (sealedLanes[j] > 0) continue;
          let puppetNode = {
            type: 'puppet',
            targetIdx: i,
            targetUid: resCard.uid,
            laneIdx: j,
            maxP: maxP,
          };
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            currentUsedHand,
            currentUsedDiscard,
            currentDepth,
            currentDiscard,
            laneIdx,
            activeEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
          );
          for (let nb of nextBranches) {
            results.push([puppetNode, ...nb]);
          }
        }
      }

      // 傀儡のキャンセル分岐
      let cancelNode = {
        type: 'puppet',
        targetIdx: -1,
        laneIdx: -1,
        maxP: maxP,
      };
      let cancelBranches = buildSkillBranchAdhoc(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        leaderSkillContext
      );
      for (let nb of cancelBranches) {
        results.push([cancelNode, ...nb]);
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
            currentDiscard,
            laneIdx,
            activeEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
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
            currentDiscard,
            laneIdx,
            activeEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
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
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        leaderSkillContext
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
    forcedLane = undefined,
    leaderSkillContext = undefined
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
          availableLanes = availableLanes.filter((l) => {
            if (l === -1) return true;
            const hasExisting = GameState.enemyBoard[l] !== null;
            const willBeSummoned = isLaneOccupiedByLeaderSkill(
              l,
              leaderSkillContext
            );
            return hasExisting || willBeSummoned;
          });
        }
        if (hasSkill(card, 'apex')) {
          availableLanes = availableLanes.filter((l) => {
            if (l === -1) return true;
            const hasLegendaryOnBoard =
              GameState.enemyBoard[l] &&
              hasSkill(GameState.enemyBoard[l], 'legendary');
            const willLegendaryBeSummoned = isLegendarySummonedByLeaderSkill(
              l,
              leaderSkillContext
            );
            return hasLegendaryOnBoard || willLegendaryBeSummoned;
          });
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
      if (Array.isArray(card.choices)) {
        let cc = 1;
        if (card.skills) {
          const c = card.skills.find(
            (s) => s.id === 'choice' || s.id === 'force'
          );
          if (c) cc = c.value || 1;
        }
        cc = Math.min(cc, card.choices.length);
        const idxs = card.choices.map((_, i) => i);
        choiceCombinations = getCombinations(idxs, Math.min(idxs.length, cc));
      }
      if (Array.isArray(card.choices2)) {
        let cc2 = 1;
        const c2 = card.skills
          ? card.skills.find((s) => s.id === 'choice' && s.choiceGroup === 2)
          : null;
        if (c2) cc2 = c2.value || 1;
        cc2 = Math.min(cc2, card.choices2.length);
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
          const isSummonAction = [
            'play',
            'call',
            'invite',
            'chant',
            'forge',
          ].includes(sourceType);
          if (isSummonAction) {
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
                    'ambush',
                    'puppet',
                    'leap',
                    'forge',
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
            // 上書き配置されるカード（通常カードのみ）があれば、一時墓地バッファの初期値として渡す
            let initialDiscarded = [];
            if (
              lane !== -1 &&
              GameState.enemyBoard[lane] !== null &&
              !GameState.enemyBoard[lane].isToken
            ) {
              initialDiscarded.push(GameState.enemyBoard[lane]);
            }
            const nextEnemyBoard = GameState.enemyBoard.map((c) =>
              c ? { ...c } : null
            );
            nextEnemyBoard[lane] = {
              ...card,
              owner: 'red',
            };

            let skillChains = buildSkillBranchAdhoc(
              effectiveSkills,
              usedHand,
              usedDiscard,
              depth,
              initialDiscarded,
              lane,
              nextEnemyBoard,
              GameState.playerBoard
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
      if (Array.isArray(tokenCard.choices)) {
        let cc = 1;
        if (tokenCard.skills) {
          const c = tokenCard.skills.find(
            (s) => s.id === 'choice' || s.id === 'force'
          );
          if (c) cc = c.value || 1;
        }
        cc = Math.min(cc, tokenCard.choices.length);
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
        cc2 = Math.min(cc2, tokenCard.choices2.length);
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
        let initialDiscarded = [];
        if (
          l !== -1 &&
          GameState.enemyBoard[l] !== null &&
          !GameState.enemyBoard[l].isToken
        ) {
          initialDiscarded.push(GameState.enemyBoard[l]);
        }
        const nextEnemyBoard = GameState.enemyBoard.map((c) =>
          c ? { ...c } : null
        );
        nextEnemyBoard[l] = {
          ...tokenCard,
          owner: 'red',
        };

        let skillChains = buildSkillBranchAdhoc(
          branchSkills,
          [],
          [],
          0,
          initialDiscarded,
          l,
          nextEnemyBoard,
          GameState.playerBoard
        );

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
        const existingCard = simState.enemyBoard[laneIdx];
        if (existingCard && hasSkill(existingCard, 'startup')) {
          existingCard.skills = existingCard.skills.filter(
            (s) => s.id !== 'startup' && s.id !== 'defender'
          );
          simState.enemyDiscard.push(playedCard);
        } else if (
          (hasSkill(playedCard, 'equip') ||
            (existingCard && hasSkill(existingCard, 'arm_self'))) &&
          existingCard
        ) {
          const targetCard = existingCard;
          targetCard.basePower =
            (targetCard.basePower || 0) + (playedCard.power || 0);
          targetCard.currentPower =
            (targetCard.currentPower || 0) + (playedCard.power || 0);
          let addedSkills = [];
          if (playedCard.skills)
            playedCard.skills.forEach((s) => {
              if (s.id !== 'equip')
                addedSkills.push({ id: s.id, value: s.value });
            });
          mergeCardSkills(targetCard, addedSkills);

          // 武装（arm_self）の消費処理
          consumeArmSelf(targetCard, playedCard);
          addedSkills.forEach((sk) => {
            // 配置系・復活系スキルは個別のアクションとして処理されるため、ここでは即時実行をスキップする
            if (
              [
                'clone',
                'summon',
                'ambush',
                'puppet',
                'resurrect',
                'execute',
              ].includes(sk.id)
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
              } else if (
                ![
                  'clone',
                  'summon',
                  'ambush',
                  'puppet',
                  'resurrect',
                  'execute',
                ].includes(sk.id)
              ) {
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
            activeCard.skillTriggered = true;
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
    decayInvincibleSkills(simState.playerBoard);

    // 【絶対厳守】プレイヤーの攻撃フェーズのみシミュレート。AI of the attackは次AIターンなので範囲外。
    applyPassiveSkillLogic(simState, 'blue');
    simState.playerBoard.forEach((c) => {
      if (c && c.stunTurns > 0) c.stunTurns--;
      if (c && c.cantAttackTurns > 0) c.cantAttackTurns--;
    });
    calculateCombatPhase(simState, 'blue');
    simState.combatDamageTaken = Math.max(0, hpBeforeCombat - simState.enemyHP);
  } else {
    simState.extraTurnCount--;
    simState.combatDamageTaken = 0;
  }
  return simState;
}

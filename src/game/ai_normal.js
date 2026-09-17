import { GameState } from '../state/gameState.js';
import { AI_SKILL_UTILITY } from '../utils/constants/aiSkillValues.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { ACTIVE_SKILLS } from '../utils/constants/skills.js';
import {
  getCurrentRNG,
  getSkillValue,
  hasSkill,
  hasSkillDeep,
  setCurrentRNG,
  matchesCardId,
  matchesCardIds,
  matchesCardKeyword,
  matchesResurrectTarget,
  matchesSummonTarget,
  matchesUnionMaterial,
} from '../utils/gameUtils.js';
import {
  applyEquipment,
  canEquipCard,
  getValidSummonLanes,
} from './battle/index.js';
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
  VALKYRIA_GUARD_TURNS,
} from './engine.js';

/**
 * =========================================================================================
 * 【Mini Card Battle - AI思考ロジック設計原則（Architecture Principles）】
 * =========================================================================================
 *
 * 本AIシステムは、大局的な計画性と戦況変化への即応性を両立させるため、
 * 「事前シミュレーション」と「直前シミュレーション」の二重構造を採用し、
 * かつ計算量の爆発を防ぐための「重複排除（枝刈り）」と「合理的な上書き判定」を徹底している。
 *
 * -----------------------------------------------------------------------------------------
 * ■ 原則 1: 事前シミュレーション（Lookahead Pre-simulation）の役割と方針
 * -----------------------------------------------------------------------------------------
 * 1. 目的:
 *    - ターン開始時や手札プレイ決定時（getBestSimulatedMove）において、手札からどのカードを
 *      どのレーンに出すべきか、リーダースキルを使うべきかの「大局方針」を決定する。
 * 2. 探索深度（Depth 4）:
 *    - 手札の通常召喚から派生する多段連鎖（例: 手札ジャッカル① → 召集ジャッカル② →
 *      召集ジャッカル③ → 召集ミミック④）を最大4手先まで再帰的にツリー展開し、
 *      連鎖が最後まで完遂した盤面の合計パワーや戦闘結果を完全予測する。
 * 3. アクションキュー（ActionQueue）の策定:
 *    - 連鎖スキルで選ぶべきカードや配置レーンを事前計画キューとして生成する。
 *
 * -----------------------------------------------------------------------------------------
 * ■ 原則 2: 直前シミュレーション（Ad-hoc Just-in-Time Simulation）の役割と方針
 * -----------------------------------------------------------------------------------------
 * 1. 目的:
 *    - 実際の対局中、カードが場に出てスキルが発動する「まさにその瞬間（skillLogic.js）」に、
 *      最新の盤面状況・相手のリアクション・最新デッキ残数に基づき、最善の選択をアドホックに再計算する。
 * 2. 事前計画キューの消費と動的補正:
 *    - スキル発動時に事前計画（consumeAIAction）をクリーンアップし、常にその場の実盤面で
 *      直前シミュレーション関数（evaluateAdhocAssembleMove / evaluateBestLanesForToken 等）を実行する。
 * 3. 相手の妨害（雷撃被弾・バフ・デバフ等）への柔軟な適応:
 *    - 例えば、事前シミュレーション段階では「無傷で3体横並び」を想定していても、
 *      手札から出した1体目が相手の「雷撃」でパワー1に被弾した場合、直前シミュレーションが
 *      「中央にパワー1の弱体化カードが存在する」という最新の事実を即座に認識する。
 *    - これにより、満杯になった盤面において被弾したパワー1の味方を的確に上書きして
 *      戦況を更新するなど、戦況のズレに自動適応した最善手を打つことができる。
 *
 * -----------------------------------------------------------------------------------------
 * ■ 原則 3: 重複排除（Deduplication / Pruning）の原則
 * -----------------------------------------------------------------------------------------
 * 1. カードシグネチャ（ID・パワー・所持スキル構成）に基づく重複探索排除:
 *    - 単なる「同一カードID（同名カード）」か否かだけで判断するのではなく、カードID・現在のパワー・
 *      所持スキル構成（値や選択グループ含む）までを完全に含むカードシグネチャ（getCardSignature）を用いて
 *      完全一致する等価なカードのみ重複シミュレーションを排除する。
 *    - バフや弱体化、スキルの有無などによってステータスや能力が異なるカードは、同名であっても別カードとして
 *      正当に探索・評価される。
 *    - 完全等価なユニークカード候補（uniqueCards）のみを評価することで、同名・同能力のカードが複数あっても
 *      探索の重複を防ぎ、常に超高速で最善手を判定できる。
 * 2. 状態の等価性評価:
 *    - レーン配置やカード選択において、結果として同一の盤面状態（Board State）を生み出す枝は
 *      早期に刈り取り、探索効率を極大化する。
 *
 * -----------------------------------------------------------------------------------------
 * ■ 原則 4: 全合法レーンの網羅検証と自然な盤面評価
 * -----------------------------------------------------------------------------------------
 * 1. レーン網羅検証の徹底:
 *    - 「空き枠判定」やパワー比較による恣意的なスキップ・除外は一切行わず、全合法レーンを平等に評価する。
 * 2. 必要に応じた上書き（戦況改善）の自然な評価:
 *    - 相手の攻撃や呪文で弱体化した味方（例: パワー1）をより強いカード（パワー3や4）で上書きして
 *      そのレーンの戦力を改善する場合や、盤面が満杯の時により高打点のカードで盤面パワーを更新する場合など、
 *      有意義な手はシミュレーション評価（evaluateTurnOutcome）によって正当に高評価される。
 * 3. 意味のない上書きの自然な劣後・排除:
 *    - 既存の味方のパワーと同等以下のカードを重ねるような「戦力改善が一切見込めない上書き」や、
 *      空き枠があるにもかかわらず健全な味方を無駄に破壊するような愚手は、
 *      事前のハードコードで除外するのではなく、全レーンを等しくシミュレートした結果として
 *      盤面戦力・生存数などの総合スコアにより自然に最善手から劣後・排除される。
 *    - 健全な味方を無駄に破壊する上書きに対して、安易に連鎖ボーナスを与えて過大評価することを厳禁とする。
 * =========================================================================================
 */

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
    id: `sp_sim_${owner}_${execCard.uid ?? execCard.baseId ?? execCard.id}_${tgtLane}`,
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
 * ■ 変身（metamorph）:
 *   全カードからランダムに1枚に変身するスキルだが、結果が不明なため、
 *   METAMORPH_ESTIMATED_POWER（定数）のパワーとして仮評価する。
 *
 * ■ 運命（fate）:
 *   確率で相手ダメージまたは自傷となるスキルだが、AI思考シミュレーション時は
 *   常に最高の結果（FATE_ESTIMATED_DAMAGE = 3）を想定して盤面・打点を評価する。
 *
 * ■ 号令で呼ばれたカードが号令や変身を持つ場合:
 *   evaluateAdhocTokenLanes() 内でもスキル実行ループに同じ仮評価ロジックを適用しているため、
 *   号令で出されたカードがさらに号令や変身を持っていても、同じルールで正しく評価される。
 */
const METAMORPH_ESTIMATED_POWER = 5;

/**
 * 号令（call）および召集（assemble）スキルによる盤面戦力の上昇値（パワーボーナス）を近似計算する共通関数。
 * 対象指定（targetIds / targetId）が存在する場合はその対象カードのパワー（複数候補がある場合は最大パワー）を採用し、
 * キーワード指定（targetKeyword）や通常指定の場合は sk.value または規定フォールバック値（4）で近似する。
 *
 * @param {object|null|undefined} sk - 号令または召集のスキル定義オブジェクト
 * @returns {number} 近似されるパワーボーナス値
 */
function estimateCallAssembleBonus(sk) {
  if (!sk || typeof sk !== 'object') return 4;
  let callBonus = sk.value || 4;

  // targetIds（配列）または targetId（単数フォールバック）から候補ID配列を正規化
  const rawTargetIds = Array.isArray(sk.targetIds)
    ? sk.targetIds.filter(Boolean)
    : sk.targetId
      ? [sk.targetId]
      : [];

  if (rawTargetIds.length > 0) {
    let maxPower = 0;
    for (const id of rawTargetIds) {
      const targetCard = CARD_MASTER?.find((c) => c.id === id);
      const p = targetCard?.power ?? 6;
      if (p > maxPower) {
        maxPower = p;
      }
    }
    callBonus = maxPower > 0 ? maxPower : 6;
  }
  return callBonus;
}

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
 * スキル選択肢（choices）から指定個数を選ぶインデックスの組み合わせを生成し、
 * 実質的に同一の効果となる組み合わせ（同名スキル・同一値・同一召喚ID）をユニーク化（重複排除）して返却する。
 *
 * 例: シスターズ（buff×6, ambush×6）から6個選ぶ場合、
 * 数学的な全組み合わせ 924通り から、実質的に効果が異なる 7パターン の代表インデックス配列に圧縮する。
 *
 * @param {Array<object>} choicesArray - 選択肢オブジェクトの配列
 * @param {number} count - 選択する個数
 * @returns {Array<number[]>} ユニーク化された選択インデックス配列のリスト
 */
export const getUniqueChoiceCombinations = (choicesArray, count) => {
  if (!choicesArray || choicesArray.length === 0 || count <= 0) {
    return [];
  }
  const maxK = Math.min(choicesArray.length, count);
  const idxs = choicesArray.map((_, i) => i);
  const rawCombinations = getCombinations(idxs, maxK);
  if (rawCombinations.length <= 1) {
    return rawCombinations;
  }

  const seenSignatures = new Set();
  const uniqueCombinations = [];

  for (const combo of rawCombinations) {
    // 組み合わせに含まれる各スキルのシグネチャをソートして結合
    const sig = combo
      .map((i) => {
        const sk = choicesArray[i];
        if (!sk) return 'null';
        return `${sk.id}_${sk.value || 0}_${sk.summonId || ''}_${sk.choiceGroup || ''}`;
      })
      .sort()
      .join('|');

    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      uniqueCombinations.push(combo);
    }
  }

  return uniqueCombinations;
};

/**
 * 手札カードの同一性を判定するためのシグネチャ（文字列）を生成する。
 * 手札内の同名・同ステータス・同スキルの完全同一カードを重複探索しないために使用する。
 *
 * @param {object} card - カードオブジェクト
 * @returns {string} カードシグネチャ文字列
 */
export function getCardSignature(card) {
  if (!card) return 'null';
  const skillsStr = Array.isArray(card.skills)
    ? card.skills
        .map((s) => `${s.id}_${s.value || 0}_${s.choiceGroup || ''}`)
        .join(',')
    : '';
  return `${card.id || card.baseId}_${card.power ?? card.basePower ?? 0}_${skillsStr}`;
}

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
        initialPlayerHP: GameState.playerHP,
        initialEnemyHP: GameState.enemyHP,
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
        phaseBypassDamageTaken: 0,
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
                  'servant',
                  'summon',
                  'ambush',
                  'invite',
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
              // 号令・召集: デッキからカードを出す動的スキルのため、パワーボーナスで近似
              if (sk.id === 'call' || sk.id === 'assemble') {
                const callBonus = estimateCallAssembleBonus(sk);
                boardCard.currentPower =
                  (boardCard.currentPower || 0) + callBonus;
                boardCard.basePower = (boardCard.basePower || 0) + callBonus;
              } else if (sk.id === 'metamorph') {
                boardCard.currentPower = METAMORPH_ESTIMATED_POWER;
                boardCard.basePower = METAMORPH_ESTIMATED_POWER;
              } else if (
                [
                  'heal',
                  'bless',
                  'morph',
                  'shuffle',
                  'draw',
                  'salvage',
                  'explore',
                ].includes(sk.id)
              ) {
                // ユーティリティボーナス系スキル (瘴気発動時は回復ボーナスを除外して実ロジックで自傷シミュレート)
                if (sk.id === 'heal' && isMiasmaActive(simState)) {
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
                } else {
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
        action.type === 'forge' ||
        action.type === 'summon' ||
        action.type === 'assemble'
      ) {
        for (let i = 0; i < 3; i++) {
          const c = simState.enemyBoard[i];
          if (c && c.isSkillResolving) {
            if (
              hasSkill(c, 'invite') ||
              hasSkill(c, 'forge') ||
              hasSkill(c, 'summon') ||
              hasSkill(c, 'assemble')
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

      if (action.type === 'inspire') {
        const tgtLane = action.targetLane;
        if (tgtLane !== undefined && simState.enemyBoard[tgtLane] !== null) {
          const c = simState.enemyBoard[tgtLane];
          c.currentPower = (c.currentPower || 0) + (action.value || 1);
        }
        continue;
      }

      if (action.type === 'protection') {
        const tgtLane = action.targetLane;
        if (tgtLane !== undefined && simState.enemyBoard[tgtLane] !== null) {
          const c = simState.enemyBoard[tgtLane];
          c.valkyriaGuard = true;
          c.valkyriaGuardTurns = VALKYRIA_GUARD_TURNS;
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
        action.type === 'forge' ||
        action.type === 'play_adhoc' ||
        action.type === 'summon' ||
        action.type === 'assemble'
      ) {
        // laneIdx=-1 は「このスキルをスキップ」のセンチネル値（invite/forge/summon/assemble/play_adhoc用）
        // 実行時と同様に手札・デッキを消費せずスキップする
        if (
          lIdx === -1 &&
          (action.type === 'invite' ||
            action.type === 'forge' ||
            action.type === 'summon' ||
            action.type === 'assemble' ||
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
        } else if (action.type === 'assemble') {
          // デッキからカードを取得・消費
          let dIdx = -1;
          if (action.targetUid) {
            dIdx = simState.enemyDeck.findIndex(
              (c) =>
                c &&
                (c.uid === action.targetUid ||
                  c.id === action.targetUid ||
                  c.baseId === action.targetUid)
            );
          }
          if (
            dIdx === -1 &&
            action.targetIdx !== undefined &&
            action.targetIdx < simState.enemyDeck.length
          ) {
            dIdx = action.targetIdx;
          }
          if (dIdx !== -1 && simState.enemyDeck[dIdx]) {
            playedCard = cloneCard(simState.enemyDeck[dIdx]);
            simState.enemyDeck.splice(dIdx, 1);
          } else {
            const master = CARD_MASTER.find(
              (m) => m.id === action.targetUid || m.id === action.cardId
            );
            if (master) playedCard = cloneCard(master);
          }
          checkConstraints = true;
        } else {
          // play, invite, forge, summon は手札から
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
        if (['servant', 'clone', 'split', 'ambush'].includes(action.skillId)) {
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
              // servant / split のフォールバック（summonIdが未指定の場合）
              tokenId = tokenPower >= 5 ? 'token_golem' : 'token_drone';
            }
          }
          const baseMaster = CARD_MASTER.find((m) => m.id === tokenId);
          const lanes = [...(action.lanes || [])];
          for (const tLane of lanes) {
            if (sealedLanes[tLane] > 0) continue;
            const seq = simState._simTokenSequence || 0;
            simState._simTokenSequence = seq + 1;
            // cloneトークンは元カードのスキルを引き継ぐ（分身含む全スキル）
            // 分身(clone)は召喚時にしか発動しないため、コピーしても影響がない
            let inheritedSkills = [];
            if (action.skillId === 'clone' && sourceCard) {
              if (Array.isArray(sourceCard.skills)) {
                inheritedSkills = inheritedSkills.concat(sourceCard.skills);
              }
            }
            const newToken = {
              id: `sm_sim_${side}_${tokenId}_${tLane}_${seq}`,
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
            } else if (existingCard && canEquipCard(newToken, existingCard)) {
              // 【装備(equip) / 武装(arm_self)】トークンの装備合体をシミュレート（実行時と同一ロジックを適用）
              applyEquipment(existingCard, newToken);
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

            if (board[myL] && canEquipCard(selectedCard, board[myL])) {
              // 装備パワー・スキル統合・武装消費を実行時と同一ロジックで適用する
              applyEquipment(board[myL], selectedCard);
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
                      ...playedCard.choices2[idx],
                    });
                  }
                });
              } else if (action.choices && playedCard.choices) {
                action.choices.forEach((idx) => {
                  if (playedCard.choices[idx]) {
                    newSkillsArr.push({
                      ...playedCard.choices[idx],
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
      } else if (existingCard && canEquipCard(playedCard, existingCard)) {
        skillWasHandledByEquip = true;
        const targetCard = existingCard;
        const { equipSkills } = applyEquipment(targetCard, playedCard);
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
          equipSkills.forEach((sk) => {
            // 配置系・復活系スキルは buildSkillBranch 内のアクションで個別管理するため、ここでは即時実行をスキップする
            if (
              [
                'clone',
                'servant',
                'summon',
                'ambush',
                'puppet',
                'resurrect',
                'execute',
                'inspire',
                'protection',
                'dominate',
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
          matchesUnionMaterial(simState.enemyBoard[lIdx], unionSkill)
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
                      ...activeCardForSkills.choices2[idx],
                    };
                    skills.push(chosenSk);
                    newSkillsArr.push(chosenSk);
                  }
                });
              } else if (action.choices && activeCardForSkills.choices) {
                action.choices.forEach((idx) => {
                  if (activeCardForSkills.choices[idx]) {
                    let chosenSk = {
                      ...activeCardForSkills.choices[idx],
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
          // カードが連鎖スキル（forge/invite/summon）を持つ場合、
          // 除外リスト外の即時スキル（quick/snipe等）は連鎖完了後に発動する必要がある。
          // （例: forge→装備合体→quickの順で処理しないと、装備前のパワーで速攻が発動してしまう）
          // battle.js の resolveOnPlaySkill と同じ実行順序を再現するため、
          // 連鎖スキルを持つカードでは即時スキルを _pendingSimSkills に保留し、
          // アクションキュー上で連鎖子アクションが処理される際に発動させる。
          const hasChainSkill =
            hasSkill(activeCardForSkills, 'forge') ||
            hasSkill(activeCardForSkills, 'invite') ||
            hasSkill(activeCardForSkills, 'summon') ||
            hasSkill(activeCardForSkills, 'assemble');

          skills.forEach((sk) => {
            if (
              [
                'draw',
                'heal',
                'bless',
                'morph',
                'shuffle',
                'salvage',
                'explore',
              ].includes(sk.id)
            ) {
              if (sk.id !== 'heal' || !isMiasmaActive(simState)) {
                simState.actionUtilityBonus =
                  (simState.actionUtilityBonus || 0) +
                  (AI_SKILL_UTILITY[sk.id] || 0);
              }
            }
            if (sk.id === 'call' || sk.id === 'assemble') {
              const callBonus = estimateCallAssembleBonus(sk);
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
                'convert',
                'draw',
                'salvage',
                'reinforce',
                'puppet',
                'servant',
                'summon',
                'ambush',
                'resurrect',
                'awake',
                'awake_legendary',
                'clone',
                'split',
                'forge',
                'execute',
                'inspire',
                'protection',
                'dominate',
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
        // 【招来・召喚・召集・鍛造】これらの連続プレイを伴う出現時スキルの場合は、
        // 次の追加プレイアクションが実行されるまで保護フラグ（isSkillResolving）を維持する
        if (activeCardForSkills) {
          const hasChainSummon =
            hasSkill(activeCardForSkills, 'invite') ||
            hasSkill(activeCardForSkills, 'summon') ||
            hasSkill(activeCardForSkills, 'assemble') ||
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
      // 連鎖スキル（forge/invite/summon/assemble）の子アクション処理（装備合体や追加カード配置）が完了した後に、
      // 親カードに保留されていた即時スキル（quick/snipe等）を発動する。
      // これにより装備合体完了後の強化ステータスで速攻や砲撃が正しく実行される。
      if (
        action.type === 'invite' ||
        action.type === 'summon' ||
        action.type === 'assemble' ||
        action.type === 'forge'
      ) {
        for (let i = 0; i < 3; i++) {
          flushPendingSimSkills(simState, parentCardOnLane[i], i);
        }
      }
    }

    // 【保留スキルの最終回収】
    // 連鎖スキル（forge/invite/summon）の子アクションがアクションキューに
    // 生成されなかった場合でも、保留された即時スキルを必ず発動させる。
    for (let i = 0; i < 3; i++) {
      flushPendingSimSkills(simState, simState.enemyBoard[i], i);
    }

    // アクションキュー全解決後、客観的なターン進行ルールに従って戦闘フェーズを実行
    advanceCombatPhase(simState);

    return simState;
  } finally {
    setCurrentRNG(savedRNG);
  }
}

/**
 * 候補手の総アクション数（手数）を算出する。
 *
 * 【設計目的】
 * 「同じ結果をもたらす場合は手が少ないもの（パス等）を選ぶ原則」を厳密に実現するための判定基準。
 * - パス（手札プレイなし、スキル使用なし）: 0手
 * - 通常の手札プレイ（index !== -1）: 1手
 * - リーダースキル使用（useSkill）: 1手
 * - 召喚時スキル等に伴う追加・追従アクション: actionQueue や leaderCardSkillActions の要素数を加算
 *
 * これにより、例えば味方不在時の「レイジ」のように自壊して盤面・ライフに一切寄与しない（パスと同スコアの）手札プレイ（1手）が、
 * 手数0の「パス」よりもタイブレーク加算によって不当に優先されるバグを根絶する。
 *
 * @param {Object} candidate - 評価対象の候補手オブジェクト
 * @returns {number} 候補手が消費する総アクション数（手数）
 */
export function getCandidateActionCount(candidate) {
  if (!candidate) return 0;
  let count = 0;
  // リーダースキルの使用
  if (candidate.useSkill) {
    count += 1;
    if (
      candidate.leaderCardSkillActions &&
      Array.isArray(candidate.leaderCardSkillActions)
    ) {
      count += candidate.leaderCardSkillActions.length;
    }
  }
  // 手札からのカードプレイ
  if (candidate.index !== -1 && candidate.index !== undefined) {
    count += 1;
  }
  // 召喚時スキル（召喚・召集・復活等）に伴う後続アクション
  if (candidate.actionQueue && Array.isArray(candidate.actionQueue)) {
    count += candidate.actionQueue.length;
  }
  return count;
}

/**
 * 通常AIの最適な行動候補をシミュレーションして選択する。
 * 手札・盤面・リーダースキル・召喚時スキル・後続アクションを全探索・シミュレーションし、
 * スコア、リーダースキル温存、最短アクション手数（不要なプレイ・自壊プレイの防止）、
 * レーン配置優先順位の多段評価により、最も有利な着手（またはパス）を決定する。
 *
 * @returns {{ index: number, lane: number, useSkill: boolean, isOverwrite?: boolean, actionQueue?: Array<Object>, leaderCardSkillActions?: Array<Object>, score?: number }} 選択したAI行動候補
 */
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
    leaderSkillContext = undefined,
    usedDeck = []
  ) {
    if (depth >= 4) return [[]];

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
      sourceType === 'summon' ||
      sourceType === 'assemble'
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
      // 生贄・頂点: invite/summon/assemble時は親カードが配置済みだがmyBoardには未反映のため、
      // プリフィルタをスキップしprocessActionSequenceの正確なsimStateチェックに委ねる
      if (
        sourceType !== 'invite' &&
        sourceType !== 'summon' &&
        sourceType !== 'assemble'
      ) {
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
        choiceCombinations = getUniqueChoiceCombinations(card.choices, cc);
      }
      if (Array.isArray(card.choices2)) {
        let cc2 = 1;
        const c2 = card.skills
          ? card.skills.find((s) => s.id === 'choice' && s.choiceGroup === 2)
          : null;
        if (c2) cc2 = c2.value || 1;
        cc2 = Math.min(cc2, card.choices2.length);
        choice2Combinations = getUniqueChoiceCombinations(card.choices2, cc2);
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
              // ※ clone, summon, resurrect は buildSkillBranch 内で個別管理するため tc には含めない
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
              // ※ clone, summon, resurrect は buildSkillBranch 内で個別管理するため tc には含めない
              // ※ call, metamorph は実行時の動的判断（アドホック）や自身への適用となるため、事前のレーン確保は不要
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
              'forge',
              'summon',
              'assemble',
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
                      'resurrect',
                      'convert',
                      'draw',
                      'reinforce',
                      'clone',
                      'servant',
                      'summon',
                      'assemble',
                      'ambush',
                      'puppet',
                      'leap',
                      'forge',
                      'execute',
                      'inspire',
                      'protection',
                      'dominate',
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
              currentPlayerBoard = null,
              currentUsedDeck = []
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
                'servant',
                'ambush',
                'puppet',
                'resurrect',
                'execute', // 処刑は強制配置系（破壊対象選択）のため、自動キャンセルの対象外とする
                'inspire', // 鼓舞は対象が存在すれば対象選択、いなければスキップするため自律分岐
                'protection', // 保護も対象が存在すれば対象選択、いなければスキップするため自律分岐
                'dominate', // 支配は明示的なキャンセルノードを自前生成するため自動キャンセルの対象外とする
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
                    activePlayerBoard,
                    currentUsedDeck
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
              } else if (sk.id === 'summon') {
                const selfId = card ? card.baseId || card.id : null;
                const isExcludeBoard = Boolean(sk.excludeBoard);
                const presentBoardIds = isExcludeBoard
                  ? activeEnemyBoard
                      .filter(Boolean)
                      .flatMap((c) => [c.id, c.baseId])
                      .filter(Boolean)
                  : [];

                for (let i = 0; i < originalHand.length; i++) {
                  if (currentUsedHand.includes(i)) continue;
                  let childCard = originalHand[i];

                  // skillLogic.js の isValidSummonCard と同一の判定順序・論理（matchesSummonTarget）で評価
                  if (
                    !matchesSummonTarget(childCard, sk, {
                      selfId,
                      presentBoardIds,
                    })
                  ) {
                    continue;
                  }

                  let children = buildCardPlayTree(
                    childCard,
                    i,
                    'summon',
                    originalHand,
                    originalDiscard,
                    [...currentUsedHand, i],
                    currentUsedDiscard,
                    currentDepth + 1,
                    undefined,
                    leaderSkillContext,
                    currentUsedDeck
                  );
                  for (let cNode of children) {
                    const summonLane = cNode[0]?.laneIdx;
                    const nextEnemyBoard = [...activeEnemyBoard];
                    if (
                      summonLane !== undefined &&
                      summonLane >= 0 &&
                      summonLane < 3
                    ) {
                      nextEnemyBoard[summonLane] = childCard;
                    }
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      [...currentUsedHand, i],
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscarded,
                      nextEnemyBoard,
                      activePlayerBoard,
                      currentUsedDeck
                    );
                    for (let nb of nextBranches) {
                      results.push([...cNode, ...nb]);
                    }
                  }
                }
              } else if (sk.id === 'assemble') {
                const isSelf = Boolean(sk.self || sk.targetSelf);
                const selfId = card ? card.baseId || card.id : null;
                const targetIds =
                  sk.targetIds || (sk.targetId ? [sk.targetId] : null);
                const targetKeyword = sk.targetKeyword;
                const rawSkillIds = Array.isArray(sk.targetSkills)
                  ? sk.targetSkills.filter(Boolean)
                  : typeof sk.targetSkills === 'string' &&
                      sk.targetSkills.trim() !== ''
                    ? [sk.targetSkills.trim()]
                    : sk.targetSkill
                      ? [sk.targetSkill]
                      : [];
                const targetSkills = [...new Set(rawSkillIds)];
                const reqP = sk.value;
                const isExcludeBoard = Boolean(sk.excludeBoard);
                const presentBoardIds = isExcludeBoard
                  ? activeEnemyBoard
                      .filter(Boolean)
                      .flatMap((c) => [c.id, c.baseId])
                      .filter(Boolean)
                  : [];

                const originalDeck = GameState.enemyDeck || [];
                const seenKeys = new Set();

                for (let i = 0; i < originalDeck.length; i++) {
                  if (currentUsedDeck.includes(i)) continue;
                  let childCard = originalDeck[i];
                  if (!childCard) continue;

                  const cardKey = childCard.baseId || childCard.id;
                  if (seenKeys.has(cardKey)) continue;

                  if (isExcludeBoard) {
                    if (
                      presentBoardIds.includes(childCard.id) ||
                      (childCard.baseId &&
                        presentBoardIds.includes(childCard.baseId))
                    ) {
                      continue;
                    }
                  }

                  let matches = true;
                  if (isSelf && selfId) {
                    matches = matchesCardId(childCard, selfId);
                  } else if (Array.isArray(targetIds) && targetIds.length > 0) {
                    matches = matchesCardIds(childCard, targetIds);
                  } else if (
                    typeof targetKeyword === 'string' &&
                    targetKeyword
                  ) {
                    matches = matchesCardKeyword(childCard, targetKeyword);
                  } else if (
                    Array.isArray(targetSkills) &&
                    targetSkills.length > 0
                  ) {
                    const masterCard = CARD_MASTER?.find(
                      (m) => m.id === childCard.id
                    );
                    matches = targetSkills.some(
                      (sId) =>
                        hasSkillDeep(childCard, sId) ||
                        (masterCard && hasSkillDeep(masterCard, sId))
                    );
                  } else if (reqP !== undefined && reqP !== null) {
                    matches = (childCard.power || 0) <= reqP;
                  }

                  if (!matches) continue;
                  seenKeys.add(cardKey);

                  const masterData = CARD_MASTER.find(
                    (m) => m.id === (childCard.baseId || childCard.id)
                  );
                  const assembleCard = masterData
                    ? cloneCard(masterData)
                    : cloneCard(childCard);
                  assembleCard.uid = childCard.uid || childCard.id;
                  assembleCard.baseId = childCard.baseId || childCard.id;
                  assembleCard.basePower = assembleCard.power;
                  assembleCard.currentPower = assembleCard.power;

                  let children = buildCardPlayTree(
                    assembleCard,
                    i,
                    'assemble',
                    originalHand,
                    originalDiscard,
                    currentUsedHand,
                    currentUsedDiscard,
                    currentDepth + 1,
                    undefined,
                    leaderSkillContext,
                    [...currentUsedDeck, i]
                  );
                  for (let cNode of children) {
                    const assembleLane = cNode[0]?.laneIdx;
                    const nextEnemyBoard = [...activeEnemyBoard];
                    if (
                      assembleLane !== undefined &&
                      assembleLane >= 0 &&
                      assembleLane < 3
                    ) {
                      nextEnemyBoard[assembleLane] = assembleCard;
                    }
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      currentUsedHand,
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscarded,
                      nextEnemyBoard,
                      activePlayerBoard,
                      [...currentUsedDeck, i]
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
                // 【重要】特定対象（targetIds / targetKeyword）が指定されている復活スキルの場合、
                // パワー制限（sk.value）は存在しないため maxP を undefined としてパワー上限チェックを解除する。
                // （sk.value が未指定の場合に 1 と誤認してパワー1超のカードを不正棄却するバグを防止）
                const hasSpecificTarget =
                  (Array.isArray(sk.targetIds) && sk.targetIds.length > 0) ||
                  sk.targetId ||
                  (typeof sk.targetKeyword === 'string' && sk.targetKeyword);
                const maxP = hasSpecificTarget
                  ? undefined
                  : sk.value !== undefined && sk.value !== null
                    ? sk.value
                    : 1;
                const candidates = [...originalDiscard, ...currentDiscarded];
                const isExcludeBoard = Boolean(sk.excludeBoard);
                const presentBoardIds = isExcludeBoard
                  ? activeEnemyBoard
                      .filter(Boolean)
                      .flatMap((c) => [c.id, c.baseId])
                      .filter(Boolean)
                  : [];

                for (let i = 0; i < candidates.length; i++) {
                  if (currentUsedDiscard.includes(i)) continue;
                  let resCard = candidates[i];

                  // skillLogic.js の実戦判定（matchesResurrectTarget）と同一ロジックで評価
                  if (
                    !matchesResurrectTarget(resCard, sk, {
                      presentBoardIds,
                    })
                  ) {
                    continue;
                  }

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
              } else if (['clone', 'servant', 'ambush'].includes(sk.id)) {
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
              } else if (sk.id === 'inspire') {
                const bVal = sk.value || 1;
                const otherOccupiedLanes = [0, 1, 2].filter(
                  (j) => activeEnemyBoard[j] !== null && j !== lane
                );
                if (otherOccupiedLanes.length > 0 && bVal !== 0) {
                  for (let tgtLane of otherOccupiedLanes) {
                    let inspireNode = {
                      type: 'inspire',
                      targetLane: tgtLane,
                      value: bVal,
                    };
                    const nextEnemyBoard = activeEnemyBoard.map((c) =>
                      c ? { ...c } : null
                    );
                    if (nextEnemyBoard[tgtLane]) {
                      nextEnemyBoard[tgtLane].currentPower =
                        (nextEnemyBoard[tgtLane].currentPower || 0) + bVal;
                    }
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      currentUsedHand,
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscarded,
                      nextEnemyBoard,
                      activePlayerBoard,
                      currentUsedDeck
                    );
                    for (let nb of nextBranches) {
                      results.push([inspireNode, ...nb]);
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
                    activePlayerBoard,
                    currentUsedDeck
                  );
                }
              } else if (sk.id === 'protection') {
                const occupiedLanes = [0, 1, 2].filter(
                  (j) => activeEnemyBoard[j] !== null
                );
                if (occupiedLanes.length > 0) {
                  for (let tgtLane of occupiedLanes) {
                    let protectNode = {
                      type: 'protection',
                      targetLane: tgtLane,
                    };
                    const nextEnemyBoard = activeEnemyBoard.map((c) =>
                      c ? { ...c } : null
                    );
                    if (nextEnemyBoard[tgtLane]) {
                      nextEnemyBoard[tgtLane].valkyriaGuard = true;
                    }
                    let nextBranches = buildSkillBranch(
                      remainingSkills,
                      currentUsedHand,
                      currentUsedDiscard,
                      currentDepth,
                      currentDiscarded,
                      nextEnemyBoard,
                      activePlayerBoard,
                      currentUsedDeck
                    );
                    for (let nb of nextBranches) {
                      results.push([protectNode, ...nb]);
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
                    activePlayerBoard,
                    currentUsedDeck
                  );
                }
              } else if (sk.id === 'dominate') {
                const maxP = sk.value || 0;
                const oppBoard = activePlayerBoard;
                let validOppLanes = [];
                for (let j = 0; j < 3; j++) {
                  if (
                    oppBoard[j] &&
                    (oppBoard[j].currentPower ?? oppBoard[j].power ?? 0) <=
                      maxP &&
                    mySealedLanes[j] === 0
                  ) {
                    validOppLanes.push(j);
                  }
                }
                for (let i of validOppLanes) {
                  const myL = i;
                  if (mySealedLanes[myL] > 0) continue;
                  let domNode = {
                    type: 'dominate',
                    oppLaneIdx: i,
                    myLaneIdx: myL,
                    maxP: maxP,
                  };
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
                      owner: 'red',
                    };
                    nextPlayerBoard[i] = null;
                  }
                  let nextBranches = buildSkillBranch(
                    remainingSkills,
                    currentUsedHand,
                    currentUsedDiscard,
                    currentDepth,
                    currentDiscarded,
                    nextEnemyBoard,
                    nextPlayerBoard,
                    currentUsedDeck
                  );
                  for (let nb of nextBranches) {
                    results.push([domNode, ...nb]);
                  }
                }
                let cancelNode = {
                  type: 'dominate',
                  oppLaneIdx: -1,
                  myLaneIdx: -1,
                  maxP: maxP,
                };
                let cancelBranches = buildSkillBranch(
                  remainingSkills,
                  currentUsedHand,
                  currentUsedDiscard,
                  currentDepth,
                  currentDiscarded,
                  activeEnemyBoard,
                  activePlayerBoard,
                  currentUsedDeck
                );
                for (let nb of cancelBranches) {
                  results.push([cancelNode, ...nb]);
                }
              } else if (sk.id === 'choice') {
                const cc = sk.value || 1;
                const cArr =
                  sk.choiceGroup === 2 ? card.choices2 : card.choices;
                if (cArr) {
                  let combinations = getUniqueChoiceCombinations(
                    cArr,
                    Math.min(cArr.length, cc)
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
                  let combinations = getUniqueChoiceCombinations(
                    fArr,
                    Math.min(fArr.length, fc)
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

            if (depth < 4 && effectiveSkills.length > 0) {
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
                opBoard,
                usedDeck
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

  // 手札内の同一カードの重複探索を排除（先頭の1枚のみを探索して計算量を削減）
  const seenHandCards = new Set();
  for (let i = 0; i < hand.length; i++) {
    let card = hand[i];
    if (!card) continue;
    const cardSig = getCardSignature(card);
    if (seenHandCards.has(cardSig)) continue;
    seenHandCards.add(cardSig);

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
              adjusted.type === 'summon' ||
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
          .filter((l) => {
            if (opBoard[l] === null) return false;
            // targeted_destruction は能力を無力化してから破壊するため immune も対象にできる
            if (
              action !== 'targeted_destruction' &&
              hasSkill(opBoard[l], 'immune')
            ) {
              return false;
            }
            return true;
          })
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
      // 能力を無力化してから破壊するため immune も対象にできる
      const enemyOcc = oppGuarded
        ? []
        : [0, 1, 2].filter((l) => opBoard[l] !== null);
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

    // リーダースキル併用時も手札内の同一カードの重複探索を排除（先頭の1枚のみ探索）
    const seenSkillHandCards = new Set();
    for (let i = 0; i < hand.length; i++) {
      let card = hand[i];
      if (!card) continue;
      const cardSig = getCardSignature(card);
      if (seenSkillHandCards.has(cardSig)) continue;
      seenSkillHandCards.add(cardSig);
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
              'resurrect',
              'convert',
              'draw',
              'reinforce',
              'clone',
              'servant',
              'summon',
              'ambush',
              'puppet',
              'leap',
              'forge',
              'execute',
              'choice',
              'force',
              'inspire',
              'protection',
              'dominate',
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
                                        adjusted.type === 'summon' ||
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
                                    adjusted.type === 'summon' ||
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
    }
    // 【手数ペナルティ】アクション数（手数）が増えるごとにタイブレークを微小減点する
    // （不要なプレイや中間アクションによるタイブレーク加点を防ぎ、最短手数を選択させる）
    c.tieBreaker -= getCandidateActionCount(c) * 0.002;
  });

  // スコア順、次いでリーダースキル不使用優先、アクションの短さ順（同じ結果なら手が少ないもの・パスを優先）、最後にタイブレーク順でソート
  candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.00001) return b.score - a.score;
    if (a.useSkill !== b.useSkill) return a.useSkill ? 1 : -1;
    const aLen = getCandidateActionCount(a);
    const bLen = getCandidateActionCount(b);
    if (aLen !== bLen) return aLen - bLen;
    if (Math.abs((a.tieBreaker || 0) - (b.tieBreaker || 0)) > 0.00001) {
      return (b.tieBreaker || 0) - (a.tieBreaker || 0);
    }
    return 0;
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

  // 3. その中で最短のアクション数のものだけを残す（「同じ結果をもたらす場合は手が少ないものを選ぶ原則」の徹底）
  // ※パス（手数0）と無意味なプレイ（手数1以上）が同スコアの場合、確実にパスを残す
  const minActionLen = Math.min(
    ...bestGroup.map((c) => getCandidateActionCount(c))
  );
  bestGroup = bestGroup.filter(
    (c) => getCandidateActionCount(c) === minActionLen
  );

  // 4. 同手数の中で、タイブレークスコア（レーン優先順位等）が最善のもののみを抽出
  const maxTieBreaker = Math.max(...bestGroup.map((c) => c.tieBreaker || 0));
  const finalGroup = bestGroup.filter(
    (c) => Math.abs((c.tieBreaker || 0) - maxTieBreaker) < 0.00001
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
 * 【評価処理の全体フロー】
 * 1. 各種数値の集計 (パワーおよびユーティリティ価値の事前計算)
 * 2. 生存ティアおよびライフレース優位の判定 (安全・危険・敗北および打点勝負の判定)
 * 3. 絶対優先順位スコアの構築 (スロット1〜11の桁別加算)
 *
 * 【スコアの絶対優先順位（スロット構成）】
 * ・スロット1: 勝利判定 (相手HPを0以下にできるなら最優先で選ぶ)
 * ・スロット2: 生存ティア (Tier 1:安全 > Tier 2:危険 > Tier 3:敗北)
 * ・スロット3: 追加ターンボーナス (次ターンにカードを追加で出せる + 敵の攻撃を受けない)
 * ・スロット4: ライフレース優位ボーナス (与ダメージ > 戦闘被ダメージ時の相手リーダー削り優先)
 * ・スロット5: 盤面パワー合計差 (自分の生存パワー総和 - 相手の生存パワー総和)
 * ・スロット6: 相手リーダーへのダメージ評価 (砲撃等によるリーダーHP削り)
 * ・スロット7: 自分リーダーHPの評価 (回復・吸収等による自リーダーHP維持)
 * ・スロット8: ユーティリティ価値 (ドローや回復スキルの期待値)
 * ・スロット9: タイブレーク (生存枚数)
 * ・スロット10: 封印ボーナス (空のレーン封印時の位置優先順位)
 * ・スロット11: 被ダメージペナルティ (危険状態での被弾抑止・微小タイブレーク)
 *
 * ※重要: 「代償(sacrifice)」スキルによる自傷ダメージは、ティア判定（4ダメージ以上の警戒）からは除外する。
 * これは代償が「戦略的なコスト」であり、敵の攻撃による「戦術的な脅威」とは別物であるため。
 *
 * @param {object} state - 評価対象の盤面状態
 * @returns {number} 総合評価スコア
 */
export function evaluateSimState(state) {
  let myPower = 0;
  let opPower = 0;
  let myUtilityScore = 0;
  let opUtilityScore = 0;

  // 1. 各種数値の集計（パワーおよびユーティリティ価値）
  // ユーティリティ価値の算出ヘルパー（AI_SKILL_UTILITYテーブル参照）
  const getSkillUtilityVal = (skillId, isSelf) => {
    // 瘴気が発動中は回復・吸収系スキルの価値を評価しない（実戦で回復効果が100%無効化されるため）
    if (
      ['heal', 'absorb', 'heal_void'].includes(skillId) &&
      isMiasmaActive(state)
    ) {
      return 0;
    }

    const val = AI_SKILL_UTILITY[skillId];
    if (val === undefined || val === null) return 0;
    // 動的評価関数（hack等）の場合は自身のみ評価
    if (typeof val === 'function') {
      return isSelf ? val(state, GameState) : 0;
    }
    return val;
  };

  for (let i = 0; i < 3; i++) {
    // ① AI側のカード：パワー集計 ＋ ユーティリティ価値（プラス評価）
    if (state.enemyBoard[i]) {
      const c = state.enemyBoard[i];
      myPower += Number(c.currentPower ?? c.power ?? 0);

      if (Array.isArray(c.skills)) {
        c.skills.forEach((sk) => {
          // アクティブスキル（draw, heal等）は未発動時のみ加算
          if (
            !c.skillTriggered ||
            ![
              'draw',
              'heal',
              'bless',
              'morph',
              'shuffle',
              'salvage',
              'explore',
            ].includes(sk.id)
          ) {
            myUtilityScore += getSkillUtilityVal(sk.id, true);
          }
        });
      }
    }

    // ② プレイヤー側のカード：パワー集計 ＋ ユーティリティ価値（マイナス評価：相手の強力スキルを残さない）
    if (state.playerBoard[i]) {
      const opC = state.playerBoard[i];
      const opCurrentP = Number(opC.currentPower ?? opC.power ?? 0);
      opPower += opCurrentP;

      if (Array.isArray(opC.skills)) {
        opC.skills.forEach((sk) => {
          // プレイヤーの場に残っているパッシブスキル（召喚時発動済みのアクティブスキルは除外）
          if (
            ![
              'draw',
              'heal',
              'bless',
              'morph',
              'shuffle',
              'salvage',
              'explore',
            ].includes(sk.id)
          ) {
            opUtilityScore += getSkillUtilityVal(sk.id, false);
          }
        });
      }

      // 相手カードが防御・拘束・凍結状態（stunTurns > 0）の場合、
      // 次ターン以降も攻撃不能であり続ける（無力化される）価値をAIの妨害ユーティリティとして加点
      // 【相手パワー連動型】残存ターン数 × min(相手パワー, 10) × 1.5pt（パワー0でも最低1保証）
      if (opC.stunTurns > 0) {
        const opPowerClamped = Math.min(Math.max(0, opCurrentP), 10);
        const effectivePower = Math.max(1, opPowerClamped);
        myUtilityScore += opC.stunTurns * effectivePower * 1.5;
      }
    }
  }

  // 2. 生存ティアおよびライフレース優位の判定 (Tier 1:安全 > Tier 2:危険 > Tier 3:敗北)
  // ※位相の相互すり抜けによる被ダメージはクロックレース（打点勝負）とみなし、
  // パニック（Tier 2:危険状態）判定から除外する
  const netCombatDamageTaken = Math.max(
    0,
    (state.combatDamageTaken || 0) - (state.phaseBypassDamageTaken || 0)
  );

  // 相手リーダーへの与ダメージ総量（戦闘ダメージ、砲撃、速攻、位相、バーン等の総和）
  const initialPlayerHP =
    state.initialPlayerHP ??
    (typeof GameState !== 'undefined' ? GameState.playerHP : 25) ??
    25;
  const damageDealt = Math.max(0, initialPlayerHP - (state.playerHP ?? 0));

  // ライフレース優位判定:
  // 相手リーダーに与えるダメージが、次の相手の攻撃で自分が受ける純粋な戦闘被ダメージよりも大きい（打点レースで勝っている）
  // ※HP回復で被ダメを相殺したり、代償(自傷)が戦闘被ダメと誤認されるのを防ぐため、純粋な netCombatDamageTaken と比較
  const isLifeRaceAdvantage =
    damageDealt > 0 && damageDealt > netCombatDamageTaken && state.enemyHP > 0;

  let tier = 1;
  if (state.enemyHP <= 0) {
    tier = 3;
  } else if (netCombatDamageTaken >= 4) {
    // ライフレースで勝っており、かつ自リーダーの残りHPに十分な余裕がある場合（即死圏外）はパニック（Tier 2）に落とさない
    if (isLifeRaceAdvantage && state.enemyHP > netCombatDamageTaken + 2) {
      tier = 1;
    } else {
      tier = 2;
    }
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

  // スロット4: ライフレース優位ボーナス
  // 次の相手の攻撃の結果、自分が受けるダメージが相手が受けるダメージよりも低い（ライフレースで勝っている）場合、
  // 盤面制圧（相手カード破壊・スロット5）よりも相手リーダーを削る手を優先するボーナスを付与する。
  // 基礎ボーナス(2,000点) + ダメージ差分(1点あたり2,000点)
  let s4 = 0;
  if (isLifeRaceAdvantage && tier !== 3) {
    const diff = damageDealt - netCombatDamageTaken;
    s4 = 2000 + diff * 2000;
  }

  // スロット5: 盤面パワー合計差 (自分の生存パワー総和 - 相手の生存パワー総和)
  // -150〜150の範囲を想定し+200して正の値にする
  let s5 = (myPower - opPower + 200) * 1000;

  // スロット6: 相手リーダーへのダメージ評価
  // 砲撃(artillery)等によるリーダーダメージを評価し、
  // 盤面が同等の場合にリーダーHPを削る手を優先する
  let s6 = -state.playerHP * 100;

  // スロット7: 自分リーダーHPの評価
  // 回復(heal)や吸収(absorb)等による自リーダーHP維持を評価する
  // 自分のHPが高いほど高評価
  let s7 = state.enemyHP * 100;

  // スロット8: ユーティリティ価値（自分のスキル付加価値 - 相手のスキル脅威度）
  let s8 =
    (myUtilityScore - opUtilityScore + (state.actionUtilityBonus || 0)) * 10;

  // スロット9: タイブレーク (生存枚数)
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
  let s9 = 8 - myCount - opCount;

  // スロット10: 封印ボーナス (空のレーンを封印した際の優先度：中央 > 左 > 右)
  // パワー差等で同点になった場合のタイブレークとして封印ターン数に応じた微小スコアを加算
  let s10 = 0;
  if (state.playerSealedLanes) {
    if (state.playerSealedLanes[1] > 0)
      s10 += 0.03 * state.playerSealedLanes[1]; // 中央
    if (state.playerSealedLanes[0] > 0)
      s10 += 0.02 * state.playerSealedLanes[0]; // 左
    if (state.playerSealedLanes[2] > 0)
      s10 += 0.01 * state.playerSealedLanes[2]; // 右
  }

  // スロット11: 被ダメージペナルティ
  // 【重要】危険状態（tier === 2、被ダメ4以上）の時は、少しでも被ダメージを抑えるプレイ（ブロック）を
  // 盤面パワー差（スロット5：1あたり1000点）よりも絶対優先するため、大きなペナルティ（1ダメージにつき -100,000点）を適用する。
  // 安全状態（tier === 1、被ダメ4未満）の時は、従来通りの微小なタイブレークペナルティ（-0.1）で評価する。
  const damageTaken = netCombatDamageTaken;
  let s11 = 0;
  if (tier === 2) {
    s11 = -damageTaken * 100000;
  } else {
    s11 = -damageTaken * 0.1;
  }

  return s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8 + s9 + s10 + s11;
}

/**
 * 指定陣営の戦闘フェーズ（パッシブスキル・状態異常減衰・戦闘ダメージ計算・破壊処理）をシミュレートする共通関数。
 * ※実戦では無敵（invincible）の減衰はターン開始時（triggerStartTurnPassive）に行われるため、
 * 戦闘直前の減衰は行わず、カードの無敵防御能力を正常に機能させる。
 *
 * @param {object} simState - シミュレーション盤面状態
 * @param {'red' | 'blue'} attackerSide - 攻撃側陣営 ('blue' = プレイヤー, 'red' = 敵AI)
 */
export function simulateCombatStep(simState, attackerSide) {
  const isRed = attackerSide === 'red';
  const board = isRed ? simState.enemyBoard : simState.playerBoard;
  const hpBeforeCombat = isRed ? simState.playerHP : simState.enemyHP;

  // パッシブスキルの適用
  applyPassiveSkillLogic(simState, attackerSide);

  // 状態異常の持続ターン減衰
  board.forEach((c) => {
    if (c) {
      if (c.stunTurns > 0) c.stunTurns--;
      if (c.cantAttackTurns > 0) c.cantAttackTurns--;
      if (c.immuneTurns > 0) c.immuneTurns--;
    }
  });

  const bypassBefore = simState.phaseBypassDamageTaken || 0;
  simState.phaseBypassDamageTaken = 0;
  calculateCombatPhase(simState, attackerSide);
  processDestructionTriggers(simState, []);

  const damageTaken = Math.max(
    0,
    hpBeforeCombat - (isRed ? simState.playerHP : simState.enemyHP)
  );
  if (isRed) {
    simState.playerCombatDamageTaken = damageTaken;
    // AI(red)の攻撃で発生したすり抜け量は相手側の被弾分のため、AI視点の控除値は復元する
    simState.phaseBypassDamageTaken = bypassBefore;
  } else {
    simState.combatDamageTaken = damageTaken;
  }
}

/**
 * シミュレーション盤面に対し、客観的なターン進行ルールに従って次の戦闘フェーズを実行する共通関数。
 *
 * 【本ゲームの絶対的ターン進行ルール】
 * カードプレイ、召喚時スキル発動、誘発（trigger）スキル等のメインアクションは、
 * 自ターン・相手ターンを問わずすべて「戦闘フェーズ（COMBAT）終了後」に行われる。
 * したがって、現在進行中ターンの戦闘フェーズは既に終了している（全行動共通の絶対的前提）。
 *
 * 【ターン交代後の戦闘進行】
 * 現在進行中ターンが終了し、客観的なゲームルールに従って次のターンのターンプレイヤーへ移行する：
 * 1. 現在が自陣（Red/AI）のターンの場合:
 *    - 自ターンの手札プレイ、召喚時スキル、自ターン中の召喚に対する誘発など。
 *    - ターン交代により次の相手（Blue）のターンとなり、相手の戦闘フェーズ（simulateCombatStep(simState, 'blue')）を実行。
 *    - ※追加ターン（extraTurnCount > 0）がある場合は相手の戦闘フェーズをスキップし、カウントを減算。
 * 2. 現在が相手（Blue/プレイヤー）のターンの場合:
 *    - 相手の召喚に対する誘発など。
 *    - 相手ターンが終了して次の自陣（Red）のターンとなり、自陣の戦闘フェーズ（simulateCombatStep(simState, 'red')）を実行。
 *    - その後、両者のHPが残っていれば自陣ターン終了後に相手の反撃フェーズ（simulateCombatStep(simState, 'blue')）を実行。
 *    - ※ターン交代に伴い無敵スキル（invincible）等の持続時間を正しく減衰（decayInvincibleSkills）させる。
 *
 * @param {object} simState - アクション適用後のシミュレーション盤面状態
 * @returns {object} 戦闘フェーズ解決後のシミュレーション盤面状態
 */
export function advanceCombatPhase(simState) {
  // アクションキュー全解決後、戦闘をシミュレートする前に
  // 全カードのスキル解決保護フラグ（isSkillResolving）を強制解除し、パワー0以下のカードを盤面から完全に除去（null化）する
  [simState.playerBoard, simState.enemyBoard].forEach((b) => {
    if (Array.isArray(b)) {
      b.forEach((c) => {
        if (c) c.isSkillResolving = false;
      });
    }
  });
  processDestructionTriggers(simState, []);

  const currentTurn = GameState.currentTurn; // 現在のターンプレイヤー ('player' | 'enemy')
  const isRedTurn = currentTurn === 'enemy';

  if (isRedTurn) {
    // 【Red（AI）のターン中】
    // 手札プレイ、自ターンの召喚時スキル（choice/invite/resurrect等）、自ターン中の誘発など
    // Redの戦闘フェーズは既に終了しているため、次の相手（Blue）の戦闘フェーズをシミュレート
    if (!(simState.extraTurnCount > 0)) {
      simulateCombatStep(simState, 'blue');
    } else {
      simState.extraTurnCount--;
      simState.combatDamageTaken = 0;
      simState.phaseBypassDamageTaken = 0;
    }
  } else {
    // 【Blue（プレイヤー）のターン中】
    // 相手の召喚に対する誘発など
    // Blueの戦闘フェーズは既に終了しているため、Blueターン終了後の次のターンへ移行：
    // ① 次のRed（自陣）のターンの戦闘フェーズ（自陣の攻撃）
    simulateCombatStep(simState, 'red');

    // ② Red攻撃後、両者が生存していれば、Redターン終了後の次のBlueターンの攻撃（相手の反撃）
    if (simState.enemyHP > 0 && simState.playerHP > 0) {
      decayInvincibleSkills(simState.enemyBoard);
      if (!(simState.extraTurnCount > 0)) {
        simulateCombatStep(simState, 'blue');
      } else {
        simState.extraTurnCount--;
        simState.combatDamageTaken = 0;
        simState.phaseBypassDamageTaken = 0;
      }
    }
  }

  return simState;
}

/**
 * アクション適用後の盤面において、客観的なゲームルールのターン進行に従って戦闘フェーズを進行させ、
 * 総合盤面スコア（AI(red)視点）を評価・返却する統一シミュレーション関数。
 * 自ターンの手札行動決定、各種直前スキル選択、誘発スキルの評価で共通利用する。
 *
 * @param {object} simState - アクション適用後のシミュレーション盤面状態
 * @param {'red' | 'blue'} [_actionOwner='red'] - アクションを行った陣営（互換性パラメータ）
 * @returns {number} 評価スコア（AI(red)視点のスコア）
 */
export function evaluateTurnOutcome(simState, _actionOwner = 'red') {
  advanceCombatPhase(simState);
  return evaluateSimState(simState);
}

/**
 * 互換性のためのエイリアス。旧 evaluateTriggerTurnOutcome 呼び出しを evaluateTurnOutcome に委譲する。
 * @param {object} simState - シミュレーション盤面状態
 * @param {'red' | 'blue'} [triggerOwner='red'] - スキル発動または誘発を行う陣営
 * @param {boolean} [_isPostCombat=true] - 互換用フラグ（メインアクションは常に戦闘終了後）
 * @returns {number} 評価スコア
 * @deprecated evaluateTurnOutcome を使用してください。
 */
export function evaluateTriggerTurnOutcome(
  simState,
  triggerOwner = 'red',
  _isPostCombat = true
) {
  return evaluateTurnOutcome(simState, triggerOwner);
}

/**
 * シミュレーション用の初期ゲーム状態（ディープコピー）を構築する共通ヘルパー関数。
 * 号令・狂気・反魂および誘発シミュレーションで共通利用する。
 *
 * @returns {object} シミュレーション用初期状態オブジェクト
 */
export function buildInitialSimState() {
  return {
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
    initialPlayerHP: GameState.playerHP,
    initialEnemyHP: GameState.enemyHP,
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
    phaseBypassDamageTaken: 0,
    lastCardPlayed: null,
    lastPlayedLane: -1,
    _actionQueue: [],
  };
}

/**
 * 誘発（trigger）スキルの最適選択をシミュレーション評価する。
 * 今が自ターンか相手ターンかに応じた戦闘順序でシミュレートし、最善手を決定する。
 * owner が 'red'（AI）の場合は AI スコア最大化の手を、
 * owner が 'blue'（相手）の場合は AI スコア最小化（相手にとって最善）の手を探索する。
 *
 * @param {Array<object>} validTriggerCards - 手札にある召喚可能な誘発スキル所持カード群
 * @param {'red' | 'blue'} [owner='red'] - 誘発を行う陣営 ('red' | 'blue')
 * @param {object} [customSimState=null] - 外部から渡すシミュレーション盤面（省略時はGameStateから構築）
 * @returns {{ cardIdx: number, laneIdx: number, score: number }|null} 最善手（パスなら null）
 */
export function evaluateTriggerSimulation(
  validTriggerCards,
  owner = 'red',
  customSimState = null
) {
  if (!validTriggerCards || validTriggerCards.length === 0) return null;

  const initialSimState = customSimState
    ? structuredClone(customSimState)
    : buildInitialSimState();

  const isRed = owner === 'red';
  const triggerHand = isRed
    ? initialSimState.enemyHand || []
    : initialSimState.playerHand || [];

  let bestMove = null;
  // red は AIスコア最大化(-Infinityから)、blue は プレイヤー最大化=AIスコア最小化(+Infinityから)
  let bestScore = isRed ? -Infinity : Infinity;

  // 1. 「誘発しない（パス）」候補のシミュレーション
  let passScore;
  {
    const simState = structuredClone(initialSimState);
    passScore = evaluateTurnOutcome(simState, owner);
    bestScore = passScore;
    bestMove = { cardIdx: -1, laneIdx: -1, score: passScore };
  }

  // 2. 各誘発カード × 召喚可能レーンのシミュレーション
  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 }; // 左(1) > 右(2) > 中央(3) の優先順

  for (let i = 0; i < triggerHand.length; i++) {
    const card = triggerHand[i];
    if (!card || !hasSkill(card, 'trigger')) continue;

    const validLanes = getValidSummonLanes(owner, card, initialSimState);
    if (!validLanes || validLanes.length === 0) continue;

    for (const lane of validLanes) {
      const simState = structuredClone(initialSimState);

      // 手札から消費し、虚空トークンを手札に追加
      const consumedCard = cloneCard(card);
      const handArray = isRed ? simState.enemyHand : simState.playerHand;
      const boardArray = isRed ? simState.enemyBoard : simState.playerBoard;
      const discardArray = isRed
        ? simState.enemyDiscard
        : simState.playerDiscard;

      handArray[i] = null;
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        name: '虚空',
        power: 0,
      };
      handArray.push(cloneCard(voidTpl));

      // 盤面に配置（既存カードがあれば墓地へ）
      const existingCard = boardArray[lane];
      if (existingCard && !existingCard.isToken) {
        discardArray.push(existingCard);
      }
      consumedCard.owner = owner;
      consumedCard.skillTriggered = false;

      // パワーの正規化（currentPower未定義によるパワー0カードの残留・壁化バグを完全に防止）
      if (
        consumedCard.currentPower === undefined ||
        Number.isNaN(consumedCard.currentPower) ||
        (consumedCard.currentPower <= 0 && (consumedCard.power || 0) > 0)
      ) {
        consumedCard.currentPower = consumedCard.power || 0;
        consumedCard.basePower = consumedCard.power || 0;
      }

      // 出現時スキル解決中は一時保護フラグを立てる
      if (hasActiveSkill(consumedCard)) {
        consumedCard.isSkillResolving = true;
      }

      boardArray[lane] = consumedCard;
      simState.lastPlayedLane = lane;

      // 召喚時スキル（snipe, draw, heal 等）の解決
      if (Array.isArray(consumedCard.skills)) {
        consumedCard.skills.forEach((sk) => {
          if (sk.id !== 'trigger') {
            applyActiveSkillLogic(
              simState,
              owner,
              lane,
              sk.id,
              sk.value,
              [],
              null,
              undefined
            );
          }
        });
        consumedCard.skillTriggered = true;
      }

      // スキル解決完了に伴い保護フラグを解除（パワー0のスペルカード等が確実に消滅するようにする）
      consumedCard.isSkillResolving = false;

      // 出現時スキル解決後の破壊クリーンアップ（パワー0カードはここで盤面から即座に墓地送り/null化）
      processDestructionTriggers(simState, []);

      // ターン状況（自ターン/相手ターン）に応じた戦闘シミュレーションと評価
      const rawScore = evaluateTurnOutcome(simState, owner);

      // 【手数ペナルティ／パス優先原則】
      // 「同じ結果をもたらす場合は手が少ないもの（パス）を選ぶ」原則に従い、
      // 基礎スコアがパスと同等以下であれば、タイブレークによってパスを逆転しないよう除外する。
      // （自壊や不発など盤面・ライフを改善しない手はパスと同スコアになるため自然に排除される）
      if (isRed ? rawScore <= passScore : rawScore >= passScore) {
        continue;
      }

      // パスよりも明確に戦況が改善し、カードが有効に機能した手のみ、レーン優先タイブレークを適用
      let score = rawScore + (isRed ? 0.01 : -0.01) / lanePriorityOrder[lane];

      if (isRed) {
        if (score > bestScore) {
          bestScore = score;
          bestMove = { cardIdx: i, laneIdx: lane, score };
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestMove = { cardIdx: i, laneIdx: lane, score };
        }
      }
    }
  }

  // もしパスが最も良い手の場合は null を返す
  if (!bestMove || bestMove.cardIdx === -1 || bestMove.laneIdx === -1) {
    return null;
  }

  return bestMove;
}

/**
 * 相手の手札の誘発スキルシミュレーション（非公開情報保護のため無効化）。
 * AIの意思決定シミュレーションにおいて非公開情報であるプレイヤーの手札の誘発カードを
 * 透視してシミュレートすることを防止するため、この処理は無効化されています。
 *
 * @param {object} _simState - シミュレーション盤面状態
 * @return {void}
 */
export function applyOpponentTriggerReaction(_simState) {
  // 非公開情報（相手手札）の透視防止のため、シミュレーション内でのカウンター誘発は行わない
  return;
}

/**
 * 復活（resurrect）および傀儡（puppet）のアドホック（解決時）シミュレーション評価。
 * 相手の誘発（trigger）等で戦況が変化した場合や、事前計画キューが存在しない場合に、
 * 墓地の候補カード群と現在の最新盤面をシミュレートし、最も盤面スコアが高くなる
 * { selectedCard, laneIdx } を決定する。
 * （配置しない方が良い場合は selectedCard: null を返し、自爆を防止する）
 *
 * @param {Array<object>} validCards - 墓地内の有効な復活・傀儡対象カード群
 * @param {'red' | 'blue'} [owner='red'] - スキル発動者 ('red' | 'blue')
 * @param {boolean} [isPuppet=false] - 傀儡（相手墓地からの配置）かどうか
 * @returns {{ selectedCard: object|null, laneIdx: number|null }} 最善カードと配置レーン
 */
export function evaluateBestResurrectChoice(
  validCards,
  owner = 'red',
  isPuppet = false
) {
  if (!validCards || validCards.length === 0) {
    return { selectedCard: null, laneIdx: null };
  }

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';

  // 1. 「配置しない（パス）」基準スコアを算出
  let passScore;
  {
    const passSimState = structuredClone(initialSimState);
    passScore = evaluateTurnOutcome(passSimState, owner);
  }
  let bestScore = passScore;
  let bestChoice = { selectedCard: null, laneIdx: null };

  const sealedLanes = isRed
    ? initialSimState.enemySealedLanes || [0, 0, 0]
    : initialSimState.playerSealedLanes || [0, 0, 0];

  // 封印されていない全レーン（0, 1, 2）
  // ルール厳守: 「復活」「傀儡」は配置（Place）のため、制約チェック（legendary/takeover等）はなし
  const candidateLanes = [0, 1, 2].filter((l) => sealedLanes[l] === 0);
  if (candidateLanes.length === 0) {
    return { selectedCard: null, laneIdx: null };
  }

  // 封印されていない全候補レーン（空き枠・上書き配置問わず）を平等にシミュレーション
  const lanesToTest = candidateLanes;

  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 }; // 左(1) > 右(2) > 中央(3)

  // 候補カードの重複探索を排除（ID + power + skills が同一のものはスキップ）
  const seenSignatures = new Set();

  for (const card of validCards) {
    if (!card) continue;
    const sig = `${card.id || card.baseId}_${card.power || 0}_${(card.skills || []).map((s) => s.id).join(',')}`;
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);

    for (const lane of lanesToTest) {
      const simState = structuredClone(initialSimState);
      const targetBoard = isRed ? simState.enemyBoard : simState.playerBoard;
      const targetDiscard = isRed
        ? isPuppet
          ? simState.playerDiscard
          : simState.enemyDiscard
        : isPuppet
          ? simState.enemyDiscard
          : simState.playerDiscard;

      // 墓地からカードを取り除く
      const dIdx = targetDiscard.findIndex(
        (c) =>
          c &&
          (c.uid === card.uid ||
            c.id === card.id ||
            c.baseId === (card.baseId || card.id))
      );
      if (dIdx !== -1) {
        targetDiscard.splice(dIdx, 1);
      }

      // カードを配置
      const placedCard = cloneCard(card);
      placedCard.owner = owner;
      placedCard.skillTriggered = true; // 配置（Place）のため召喚時スキルは不発
      placedCard.stunTurns = 0;

      // パワーの正規化
      if (
        placedCard.currentPower === undefined ||
        Number.isNaN(placedCard.currentPower) ||
        (placedCard.currentPower <= 0 && (placedCard.power || 0) > 0)
      ) {
        placedCard.currentPower = placedCard.power || 0;
        placedCard.basePower = placedCard.power || 0;
      }

      // 上書きされるカードがあれば墓地送り
      const existing = targetBoard[lane];
      if (existing && !existing.isToken) {
        const myDiscard = isRed
          ? simState.enemyDiscard
          : simState.playerDiscard;
        myDiscard.push(existing);
      }

      targetBoard[lane] = placedCard;

      // 破壊クリーンアップ
      processDestructionTriggers(simState, []);

      // 評価スコア計算
      const rawScore = evaluateTurnOutcome(simState, owner);

      // 【手が少ないもの（パス）を選ぶ原則】
      // 基礎スコアがパス（配置しない）と同等以下であれば、タイブレークによってパスを逆転しないよう除外
      if (isRed ? rawScore <= passScore : rawScore >= passScore) {
        continue;
      }

      // タイブレーク（左 > 右 > 中央）
      let score = rawScore + (isRed ? 0.001 : -0.001) / lanePriorityOrder[lane];

      if (isRed) {
        if (score > bestScore) {
          bestScore = score;
          bestChoice = { selectedCard: card, laneIdx: lane };
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestChoice = { selectedCard: card, laneIdx: lane };
        }
      }
    }
  }

  return bestChoice;
}

/**
 * 招来（invite）のアドホック（解決時）シミュレーション評価。
 * 同一レーン（laneIdx）に手札から召喚する最善カードをシミュレートする。
 * （召喚しない方が良い場合は selectedIdx: -1 を返す）
 *
 * @param {Array<object>} hand - 手札カード配列
 * @param {number} laneIdx - 召喚先レーン番号
 * @param {'red' | 'blue'} [owner='red'] - プレイヤー種別
 * @returns {{ selectedIdx: number }} 最善手札インデックス（パスなら -1）
 */
export function evaluateAdhocInviteMove(hand, laneIdx, owner = 'red') {
  if (!hand || hand.length === 0 || laneIdx < 0 || laneIdx > 2) {
    return { selectedIdx: -1 };
  }

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';

  // 1. パス基準スコア
  let bestScore;
  {
    const passSimState = structuredClone(initialSimState);
    bestScore = evaluateTurnOutcome(passSimState, owner);
  }
  let bestIdx = -1;

  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    if (!card) continue;

    // 召喚制約チェック（召喚なので制約チェックあり）
    const validLanes = getValidSummonLanes(owner, card, initialSimState);
    if (!validLanes.includes(laneIdx)) continue;

    const simState = structuredClone(initialSimState);
    const targetHand = isRed ? simState.enemyHand : simState.playerHand;
    const targetBoard = isRed ? simState.enemyBoard : simState.playerBoard;
    const targetDiscard = isRed
      ? simState.enemyDiscard
      : simState.playerDiscard;

    const consumedCard = targetHand.splice(i, 1)[0];
    if (!consumedCard) continue;

    const existing = targetBoard[laneIdx];
    if (existing && !existing.isToken) {
      targetDiscard.push(existing);
    }

    consumedCard.owner = owner;
    consumedCard.skillTriggered = false;
    if (
      consumedCard.currentPower === undefined ||
      Number.isNaN(consumedCard.currentPower) ||
      (consumedCard.currentPower <= 0 && (consumedCard.power || 0) > 0)
    ) {
      consumedCard.currentPower = consumedCard.power || 0;
      consumedCard.basePower = consumedCard.power || 0;
    }

    if (hasActiveSkill(consumedCard)) {
      consumedCard.isSkillResolving = true;
    }

    targetBoard[laneIdx] = consumedCard;
    simState.lastPlayedLane = laneIdx;

    if (Array.isArray(consumedCard.skills)) {
      consumedCard.skills.forEach((sk) => {
        if (sk.id !== 'trigger' && sk.id !== 'invite') {
          applyActiveSkillLogic(
            simState,
            owner,
            laneIdx,
            sk.id,
            sk.value,
            [],
            null,
            undefined
          );
        }
      });
      consumedCard.skillTriggered = true;
    }
    consumedCard.isSkillResolving = false;
    processDestructionTriggers(simState, []);

    let score = evaluateTurnOutcome(simState, owner);
    if (isRed) {
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }

  return { selectedIdx: bestIdx };
}

/**
 * 鼓舞（inspire）スキルの直前シミュレーション評価。
 * スキル解決の直前に最新盤面（GameState）に基づいて全候補レーンをシミュレートし、
 * 最も有利・安全な対象レーンを決定する。
 *
 * @param {Array<object|null>} myBoard - 味方盤面カード配列
 * @param {number} currentLane - 鼓舞スキルを発動したカードのレーン番号
 * @param {number} bVal - パワー上昇量
 * @param {'red' | 'blue'} [owner='red'] - スキル発動陣営
 * @returns {number|null} 最善対象レーン番号（対象なしの場合は null）
 */
export function evaluateAdhocInspireChoice(
  myBoard,
  currentLane,
  bVal,
  owner = 'red'
) {
  if (!myBoard || bVal === 0) return null;

  // 自身以外の配置済みレーンを抽出
  const candidateLanes = [0, 1, 2].filter(
    (j) => myBoard[j] !== null && j !== currentLane
  );
  if (candidateLanes.length === 0) return null;
  if (candidateLanes.length === 1) return candidateLanes[0];

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';
  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 }; // 左(1) > 右(2) > 中央(3)

  let bestScore = isRed ? -Infinity : Infinity;
  let bestLane = candidateLanes[0];

  for (const candLane of candidateLanes) {
    const simState = structuredClone(initialSimState);
    const targetBoard = isRed ? simState.enemyBoard : simState.playerBoard;

    if (targetBoard[candLane]) {
      targetBoard[candLane].currentPower =
        (targetBoard[candLane].currentPower || 0) + bVal;
    }

    processDestructionTriggers(simState, []);
    let score = evaluateTurnOutcome(simState, owner);
    // タイブレーク微調整（左 > 右 > 中央）
    score += (isRed ? 0.001 : -0.001) / lanePriorityOrder[candLane];

    if (isRed) {
      if (score > bestScore) {
        bestScore = score;
        bestLane = candLane;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestLane = candLane;
      }
    }
  }

  return bestLane;
}

/**
 * 保護（protection）スキルの直前シミュレーション評価。
 * スキル解決の直前に最新盤面（GameState）に基づいて全味方カード（自身含む）をシミュレートし、
 * 加護（valkyriaGuard）を付与することで最も生存率や盤面アドバンテージが高まる最善対象レーンを決定する。
 *
 * @param {Array<object|null>} myBoard - 味方盤面カード配列
 * @param {'red' | 'blue'} [owner='red'] - スキル発動陣営
 * @returns {number|null} 最善対象レーン番号（対象なしの場合は null）
 */
export function evaluateAdhocProtectionChoice(myBoard, owner = 'red') {
  if (!myBoard) return null;

  // 自陣の配置済みレーン（自身含む）を抽出
  const candidateLanes = [0, 1, 2].filter((j) => myBoard[j] !== null);
  if (candidateLanes.length === 0) return null;
  if (candidateLanes.length === 1) return candidateLanes[0];

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';
  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };

  let bestScore = isRed ? -Infinity : Infinity;
  let bestLane = candidateLanes[0];

  for (const candLane of candidateLanes) {
    const simState = structuredClone(initialSimState);
    const targetBoard = isRed ? simState.enemyBoard : simState.playerBoard;

    if (targetBoard[candLane]) {
      targetBoard[candLane].valkyriaGuard = true;
      targetBoard[candLane].valkyriaGuardTurns = VALKYRIA_GUARD_TURNS;
    }

    processDestructionTriggers(simState, []);
    let score = evaluateTurnOutcome(simState, owner);
    score += (isRed ? 0.001 : -0.001) / lanePriorityOrder[candLane];

    if (isRed) {
      if (score > bestScore) {
        bestScore = score;
        bestLane = candLane;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestLane = candLane;
      }
    }
  }

  return bestLane;
}

/**
 * 支配（dominate）スキルの直前シミュレーション評価。
 * スキル解決の直前に相手の対象レーン（および奪わないキャンセル手）を全通りシミュレートし、
 * 最も盤面スコアが高くなる選択肢を決定する。
 *
 * @param {number[]} validOppLanes - 奪うことが可能な相手レーン番号配列
 * @param {number} maxPower - 支配可能なカードのパワー上限
 * @param {'red' | 'blue'} [owner='red'] - スキル発動陣営
 * @returns {number} 奪う対象の相手レーン番号（キャンセルが最善の場合は -1）
 */
export function evaluateAdhocDominateChoice(
  validOppLanes,
  maxPower,
  owner = 'red'
) {
  if (!validOppLanes || validOppLanes.length === 0) return -1;

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';
  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };

  // 1. 「奪わない（キャンセル）」基準スコアを算出
  let passScore;
  {
    const passSimState = structuredClone(initialSimState);
    passScore = evaluateTurnOutcome(passSimState, owner);
  }
  let bestScore = passScore;
  let bestLane = -1;

  for (const oppLane of validOppLanes) {
    const myLane = oppLane; // 奪ったカードは正面の同一レーンに配置
    const simState = structuredClone(initialSimState);
    const simOppBoard = isRed ? simState.playerBoard : simState.enemyBoard;
    const simMyBoard = isRed ? simState.enemyBoard : simState.playerBoard;

    const stolenCard = simOppBoard[oppLane];
    if (!stolenCard) continue;

    simOppBoard[oppLane] = null;
    stolenCard.puppetOriginalOwner =
      stolenCard.puppetOriginalOwner ||
      stolenCard.owner ||
      (isRed ? 'blue' : 'red');

    // 既存カードがある場合は装備可能なら装備、不可なら上書き配置
    if (simMyBoard[myLane] && canEquipCard(stolenCard, simMyBoard[myLane])) {
      applyEquipment(simMyBoard[myLane], stolenCard);
    } else {
      simMyBoard[myLane] = {
        ...stolenCard,
        owner: owner,
        skillTriggered: true,
        stunTurns: stolenCard.stunTurns || 0,
        stunAppliedThisTurn: stolenCard.stunAppliedThisTurn || false,
      };
    }

    processDestructionTriggers(simState, []);
    const rawScore = evaluateTurnOutcome(simState, owner);

    // 【手が少ないもの（奪わない・キャンセル）を選ぶ原則】
    // 基礎スコアが奪わない基準と同等以下であれば、タイブレークによってキャンセルを逆転しないよう除外
    if (isRed ? rawScore <= passScore : rawScore >= passScore) {
      continue;
    }

    let score =
      rawScore + (isRed ? 0.001 : -0.001) / lanePriorityOrder[oppLane];

    if (isRed) {
      if (score > bestScore) {
        bestScore = score;
        bestLane = oppLane;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestLane = oppLane;
      }
    }
  }

  return bestLane;
}

/**
 * 自軍カード破壊（処刑 execute / 選別 cull 等）のアドホック（発動直前）シミュレーション評価共通関数。
 * 最新の盤面状況に基づき、自軍カードのうちどれを破壊するのが最も損失が少ない（または有利・リーサルか）をシミュレートする。
 * ターン進行・戦闘評価には共通関数 evaluateTurnOutcome を使用し、直後および次ターンの戦闘展開を総合評価する。
 *
 * @param {Array<object|null>} myBoard - 破壊対象を選ぶ側の盤面配列
 * @param {number} [selectCount=1] - 破壊対象とするカード枚数
 * @param {'red' | 'blue'} [owner='red'] - プレイヤー種別
 * @returns {Array<number>} 破壊対象とする最善レーン番号の配列
 */
export function evaluateAdhocCardDestructionChoice(
  myBoard,
  selectCount = 1,
  owner = 'red'
) {
  if (!myBoard) return [];
  const occupiedLanes = myBoard
    .map((c, i) => (c !== null ? i : -1))
    .filter((i) => i !== -1);
  if (occupiedLanes.length === 0) return [];
  if (occupiedLanes.length <= selectCount) return occupiedLanes;

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';

  // 1. 破壊不能（「無効」や「戦乙女の加護」）のカードがあれば、実質損失ゼロのため最優先
  const undestroyableLanes = [];
  const destroyableLanes = [];
  for (const l of occupiedLanes) {
    const card = myBoard[l];
    if (card && !canCardBeDestroyed(initialSimState, card, owner)) {
      undestroyableLanes.push(l);
    } else {
      destroyableLanes.push(l);
    }
  }

  // 破壊不能カードだけで要求枚数を満たせるなら即座にそれを返す
  if (undestroyableLanes.length >= selectCount) {
    return undestroyableLanes.slice(0, selectCount);
  }

  // 2. 組み合わせ（コンビネーション）を生成して evaluateTurnOutcome で最善レーンを選択
  const neededFromDestroyable = selectCount - undestroyableLanes.length;
  const combinations = getCombinations(destroyableLanes, neededFromDestroyable);

  let bestScore = isRed ? -Infinity : Infinity;
  let bestLanes = [
    ...undestroyableLanes,
    ...destroyableLanes.slice(0, neededFromDestroyable),
  ];

  for (const combo of combinations) {
    const candidateLanes = [...undestroyableLanes, ...combo];
    const simState = structuredClone(initialSimState);
    const targetBoard = isRed ? simState.enemyBoard : simState.playerBoard;
    const targetDiscard = isRed
      ? simState.enemyDiscard
      : simState.playerDiscard;

    for (const l of candidateLanes) {
      const cardToDestroy = targetBoard[l];
      if (cardToDestroy) {
        if (!canCardBeDestroyed(simState, cardToDestroy, owner)) {
          continue;
        }
        if (hasSkill(cardToDestroy, 'split')) {
          targetBoard[l] = createSplitSimToken(cardToDestroy, l, owner);
        } else {
          targetBoard[l] = null;
          if (!cardToDestroy.isToken) {
            targetDiscard.push(cardToDestroy);
          }
        }
      }
    }

    processDestructionTriggers(simState, []);
    const score = evaluateTurnOutcome(simState, owner);

    if (isRed) {
      if (score > bestScore) {
        bestScore = score;
        bestLanes = candidateLanes;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestLanes = candidateLanes;
      }
    }
  }

  return bestLanes;
}

/**
 * 処刑（execute）のアドホック（発動直前）シミュレーション評価。
 * 共通関数 evaluateAdhocCardDestructionChoice に委譲して1枚の破壊対象レーン番号を返す。
 *
 * @param {Array<object|null>} myBoard - 自軍の盤面配列
 * @param {'red' | 'blue'} [owner='red'] - 発動側プレイヤー種別
 * @returns {number} 破壊対象とする最善レーン番号（0〜2）。対象なしなら -1
 */
export function evaluateAdhocExecuteChoice(myBoard, owner = 'red') {
  const lanes = evaluateAdhocCardDestructionChoice(myBoard, 1, owner);
  return lanes.length > 0 ? lanes[0] : -1;
}

/**
 * 選別（cull）のアドホック（発動直前）シミュレーション評価。
 * 共通関数 evaluateAdhocCardDestructionChoice に委譲して指定枚数の破壊対象レーン配列を返す。
 *
 * @param {Array<object|null>} myBoard - 選別を受けた側の盤面配列（自軍）
 * @param {number} [selectCount=1] - 破壊対象とするカード枚数
 * @param {'red' | 'blue'} [owner='red'] - プレイヤー種別
 * @returns {Array<number>} 破壊対象とする最善レーン番号の配列
 */
export function evaluateAdhocCullChoice(
  myBoard,
  selectCount = 1,
  owner = 'red'
) {
  return evaluateAdhocCardDestructionChoice(myBoard, selectCount, owner);
}

/**
 * 召喚（summon）のアドホック（発動直前）シミュレーション評価。
 * 最新の盤面・手札に基づき、手札から召喚条件を満たす最善カードと配置レーンを決定する。
 *
 * @param {Array<object>} hand - 手札配列
 * @param {object} skObj - スキル定義オブジェクト
 * @param {string|null} selfId - 発動元カードID
 * @param {Array<string>} presentBoardIds - 盤面に既に存在するカードID群
 * @param {number} defaultLane - フォールバック先レーン
 * @param {'red' | 'blue'} [owner='red'] - プレイヤー種別
 * @returns {{ selectedIdx: number, laneIdx: number }} 最善手札インデックスと配置レーン（パスなら selectedIdx: -1）
 */
export function evaluateAdhocSummonMove(
  hand,
  skObj,
  selfId,
  presentBoardIds,
  defaultLane,
  owner = 'red'
) {
  if (!hand || hand.length === 0) {
    return { selectedIdx: -1, laneIdx: defaultLane };
  }

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';
  const sealed = isRed
    ? initialSimState.enemySealedLanes
    : initialSimState.playerSealedLanes;
  const availableLanes = [0, 1, 2].filter((l) => !sealed || sealed[l] === 0);

  if (availableLanes.length === 0) {
    return { selectedIdx: -1, laneIdx: defaultLane };
  }

  // 1. パス基準スコア
  let bestScore;
  {
    const passSimState = structuredClone(initialSimState);
    bestScore = evaluateTurnOutcome(passSimState, owner);
  }
  let bestIdx = -1;
  let bestLane = availableLanes[0];

  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    if (!card) continue;
    if (!matchesSummonTarget(card, skObj, { selfId, presentBoardIds }))
      continue;

    // 召喚制約チェック
    const validLanes = getValidSummonLanes(owner, card, initialSimState);
    const candidateLanes = availableLanes.filter((l) => validLanes.includes(l));
    if (candidateLanes.length === 0) continue;

    for (const laneIdx of candidateLanes) {
      const simState = structuredClone(initialSimState);
      const targetHand = isRed ? simState.enemyHand : simState.playerHand;
      const targetBoard = isRed ? simState.enemyBoard : simState.playerBoard;
      const targetDiscard = isRed
        ? simState.enemyDiscard
        : simState.playerDiscard;

      const consumedCard = targetHand.splice(i, 1)[0];
      if (!consumedCard) continue;

      const existing = targetBoard[laneIdx];
      if (existing && !existing.isToken) {
        targetDiscard.push(existing);
      }

      consumedCard.owner = owner;
      consumedCard.skillTriggered = false;
      if (
        consumedCard.currentPower === undefined ||
        Number.isNaN(consumedCard.currentPower) ||
        (consumedCard.currentPower <= 0 && (consumedCard.power || 0) > 0)
      ) {
        consumedCard.currentPower = consumedCard.power || 0;
        consumedCard.basePower = consumedCard.power || 0;
      }

      if (hasActiveSkill(consumedCard)) {
        consumedCard.isSkillResolving = true;
      }

      targetBoard[laneIdx] = consumedCard;
      simState.lastPlayedLane = laneIdx;

      if (Array.isArray(consumedCard.skills)) {
        consumedCard.skills.forEach((sk) => {
          if (sk.id !== 'trigger' && sk.id !== 'summon') {
            applyActiveSkillLogic(
              simState,
              owner,
              laneIdx,
              sk.id,
              sk.value,
              [],
              null,
              undefined
            );
          }
        });
      }

      processDestructionTriggers(simState, []);
      const score = evaluateTurnOutcome(simState, owner);

      if (isRed) {
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
          bestLane = laneIdx;
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
          bestLane = laneIdx;
        }
      }
    }
  }

  return { selectedIdx: bestIdx, laneIdx: bestLane };
}

/**
 * 召集（assemble）のアドホック（発動直前）シミュレーション評価。
 *
 * 【直前シミュレーション原則】
 * 実際の対局中、カードが場に出て「召集」が発動する瞬間に最新の盤面・相手の妨害（雷撃被弾等）・
 * 最新デッキ残数に基づき、最善の召集カードをリアルタイムに決定する。
 *
 * 【重複排除（枝刈り）原則】
 * 手札探索や選択スキルと同様に、カードシグネチャ（ID・パワー・スキル構成）に基づく重複シミュレーションを
 * 排除し、実質的に同一ステータス・同一能力の重複候補を枝刈りすることで探索コストを極小化する。
 * 同名カードであってもパワーや能力が異なる場合は正当に別候補として評価される。
 *
 * 【全合法レーン網羅検証原則】
 * 恣意的なレーン除外を行わず、空き枠・上書き配置を問わずすべての合法レーンを網羅的にシミュレートし、
 * evaluateTurnOutcome による総合スコア評価（盤面戦力、生存数、与ダメージ等）によって客観的に最善手を決定する。
 *
 * @param {Array<object>} deck - デッキ配列
 * @param {object} skObj - スキル定義オブジェクト
 * @param {string|null} selfId - 発動元カードID
 * @param {number} defaultLane - 召喚先レーン番号
 * @param {'red' | 'blue'} [owner='red'] - プレイヤー種別
 * @returns {object|null} 最善カードオブジェクト（パスなら null）
 */
export function evaluateAdhocAssembleMove(
  deck,
  skObj,
  selfId,
  defaultLane,
  owner = 'red'
) {
  if (!deck || deck.length === 0 || defaultLane < 0 || defaultLane > 2) {
    return null;
  }

  const isSelf = Boolean(skObj?.self || skObj?.targetSelf);
  const targetIds = Array.isArray(skObj?.targetIds)
    ? skObj.targetIds
    : skObj?.targetId
      ? [skObj.targetId]
      : [];
  const targetKeyword = skObj?.targetKeyword;
  const skillValue = skObj?.value;

  let validCards = [...deck];
  if (isSelf && selfId) {
    validCards = validCards.filter((card) => matchesCardId(card, selfId));
  } else if (targetIds.length > 0) {
    validCards = validCards.filter((card) => matchesCardIds(card, targetIds));
  } else if (typeof targetKeyword === 'string' && targetKeyword) {
    validCards = validCards.filter((card) =>
      matchesCardKeyword(card, targetKeyword)
    );
  } else if (skillValue !== undefined && skillValue !== null) {
    validCards = validCards.filter((card) => (card.power || 0) <= skillValue);
  }

  if (validCards.length === 0) return null;
  if (validCards.length === 1) return validCards[0];

  // カードシグネチャ（ID・パワー・スキル構成）に基づく重複シミュレーションの排除
  const seenCards = new Set();
  const uniqueCards = [];
  for (const card of validCards) {
    const k = getCardSignature(card);
    if (!seenCards.has(k)) {
      seenCards.add(k);
      uniqueCards.push(card);
    }
  }
  if (uniqueCards.length === 1) return uniqueCards[0];

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';
  const sealed = isRed
    ? initialSimState.enemySealedLanes
    : initialSimState.playerSealedLanes;

  // 封印されていないレーン
  const unsealedLanes = [0, 1, 2].filter((l) => !sealed || sealed[l] === 0);

  let bestScore = isRed ? -Infinity : Infinity;
  let bestCard = uniqueCards[0];

  for (const card of uniqueCards) {
    // 召喚制約のチェック（伝説、挑戦、生贄、頂点等）
    const validSummonLanes = getValidSummonLanes(owner, card, initialSimState);
    let candidateLanes = unsealedLanes.filter((l) =>
      validSummonLanes.includes(l)
    );

    if (candidateLanes.length === 0) {
      // 合法配置レーンがない場合はデフォルトレーンをフォールバック候補とする
      candidateLanes = [defaultLane];
    }

    // 各候補レーン（空き枠・上書き配置問わず全合法レーン）に配置した盤面をシミュレート
    for (const targetLane of candidateLanes) {
      const simState = structuredClone(initialSimState);
      const targetBoard = isRed ? simState.enemyBoard : simState.playerBoard;
      const targetDiscard = isRed
        ? simState.enemyDiscard
        : simState.playerDiscard;

      const existing = targetBoard[targetLane];

      if (existing && !existing.isToken) {
        targetDiscard.push(existing);
      }

      const assembleCard = cloneCard(card);
      assembleCard.owner = owner;
      assembleCard.skillTriggered = false;
      assembleCard.currentPower = assembleCard.power || 0;
      assembleCard.basePower = assembleCard.power || 0;

      if (hasActiveSkill(assembleCard)) {
        assembleCard.isSkillResolving = true;
      }

      targetBoard[targetLane] = assembleCard;
      simState.lastPlayedLane = targetLane;

      if (Array.isArray(assembleCard.skills)) {
        assembleCard.skills.forEach((sk) => {
          if (sk.id !== 'trigger' && sk.id !== 'assemble') {
            applyActiveSkillLogic(
              simState,
              owner,
              targetLane,
              sk.id,
              sk.value,
              [],
              null,
              undefined
            );
          }
        });
      }

      processDestructionTriggers(simState, []);
      let score = evaluateTurnOutcome(simState, owner);

      // 【召集連鎖の評価】
      // 候補カード自身が「召集（assemble）」スキルを持ち、デッキにさらに対象カードが存在し、
      // かつ次のカードを展開して盤面をさらに改善できる余地（空き枠または弱体化味方の戦力向上）がある場合、連鎖価値を加算
      const assembleSk = assembleCard.skills?.find((s) => s.id === 'assemble');
      if (assembleSk) {
        const childSelfId = assembleCard.baseId || assembleCard.id;
        const isChildSelf = Boolean(assembleSk.self || assembleSk.targetSelf);
        const nextTargets = deck.filter((dc) => {
          if (
            dc.id === card.id ||
            (Boolean(card.baseId) && dc.baseId === card.baseId)
          ) {
            const countInDeck = deck.filter(
              (c) => (c.baseId || c.id) === (card.baseId || card.id)
            ).length;
            if (countInDeck <= 1 && !hasSkill(dc, 'all_forms')) return false;
          }
          if (isChildSelf && childSelfId) {
            return matchesCardId(dc, childSelfId);
          }
          return false;
        });

        if (nextTargets.length > 0) {
          const maxNextPower = Math.max(
            ...nextTargets.map((t) => t.power || 0)
          );
          // targetLane 配置後の盤面において、別の空きレーンがあるか、
          // または被弾・デバフ等で弱体化（currentPower < basePower）しており戦力向上が見込める味方がいるか判定
          const hasRoomForImprovement = unsealedLanes.some((l) => {
            if (l === targetLane) return false;
            const occupant = targetBoard[l];
            if (occupant === null) return true; // 空きレーンあり
            const isWeakened =
              (occupant.currentPower || 0) <
              (occupant.basePower || occupant.power || 0);
            return isWeakened && (occupant.currentPower || 0) < maxNextPower; // 弱体化味方の戦力改善
          });

          if (hasRoomForImprovement) {
            const bonus = 1500;
            if (isRed) score += bonus;
            else score -= bonus;
          }
        }
      }

      if (isRed) {
        if (score > bestScore) {
          bestScore = score;
          bestCard = card;
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestCard = card;
        }
      }
    }
  }

  return bestCard;
}

/**
 * 選択（choice）スキルの直前シミュレーション評価。
 * waitSkillChoice 呼び出し時に、最新盤面において各選択肢スキルを仮想適用し、
 * 最も安全かつ有利になる最善の選択肢を決定する。
 *
 * @param {object} card - 選択スキルを発動したカードオブジェクト
 * @param {Array<object>} choices - 選択肢オブジェクト配列
 * @param {number} [maxChoices=1] - 選択可能な個数
 * @param {'red' | 'blue'} [owner='red'] - スキル発動陣営
 * @param {number} [sourceLane=-1] - 発動元カードが召喚された元のレーン番号（破壊後の参照用）
 * @returns {Array<object>} 最善の選択肢配列
 */
export function evaluateAdhocSkillChoice(
  card,
  choices,
  maxChoices = 1,
  owner = 'red',
  sourceLane = -1
) {
  if (!choices || choices.length === 0) return [];
  if (choices.length <= maxChoices) return [...choices];

  const combinations = getUniqueChoiceCombinations(
    choices,
    Math.min(choices.length, maxChoices)
  );
  if (combinations.length === 0) return choices.slice(0, maxChoices);
  if (combinations.length === 1) return combinations[0].map((i) => choices[i]);

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';
  const targetBoard = isRed
    ? initialSimState.enemyBoard
    : initialSimState.playerBoard;
  const realBoard = isRed ? GameState.enemyBoard : GameState.playerBoard;

  // 発動カードが盤面のどのレーンに存在するか特定
  // 渡された sourceLane が有効な場合はそれを最優先し、未指定または無効な場合は盤面から検索
  let lane = sourceLane >= 0 && sourceLane <= 2 ? sourceLane : -1;
  if (lane === -1 && card) {
    const realLane = realBoard.findIndex(
      (c) => c && (c === card || (card.uid && c.uid === card.uid))
    );
    if (realLane !== -1) {
      lane = realLane;
    } else {
      lane = targetBoard.findIndex(
        (c) =>
          c &&
          ((card.uid && c.uid === card.uid) ||
            c.id === card.id ||
            c.baseId === (card.baseId || card.id))
      );
    }
  }
  if (lane === -1) lane = 0; // 見つからない場合のフォールバック

  let bestCombo = combinations[0];
  let bestScore = isRed ? -Infinity : Infinity;

  for (const combo of combinations) {
    const simState = structuredClone(initialSimState);
    const targetSimBoard = isRed ? simState.enemyBoard : simState.playerBoard;
    const simCard = targetSimBoard[lane];

    for (const idx of combo) {
      const choiceSkill = choices[idx];
      if (choiceSkill) {
        // 選択されたスキル（パッシブ・アクティブ問わず）をカードに付与して戦闘フェーズ等で正確に解決
        if (simCard) {
          if (!simCard.skills) simCard.skills = [];
          simCard.skills.push({ ...choiceSkill });
        }

        if (choiceSkill.id === 'ambush' || choiceSkill.id === 'servant') {
          // 奇襲や使役などの配置を伴うスキルの場合、各レーンへの配置をシミュレートして最適レーンを選択
          const sealed =
            owner === 'blue'
              ? simState.playerSealedLanes
              : simState.enemySealedLanes;
          const candidateLanes = [0, 1, 2].filter(
            (l) => !sealed || sealed[l] === 0
          );
          let bestPlacementLane = candidateLanes[0] ?? 0;
          let bestSubScore = isRed ? -Infinity : Infinity;

          for (const candLane of candidateLanes) {
            const testState = structuredClone(simState);
            applyActiveSkillLogic(
              testState,
              owner,
              lane,
              choiceSkill.id,
              choiceSkill.value,
              [],
              null,
              candLane
            );
            processDestructionTriggers(testState, []);
            const subScore = evaluateTurnOutcome(testState, owner);
            if (isRed) {
              if (subScore > bestSubScore) {
                bestSubScore = subScore;
                bestPlacementLane = candLane;
              }
            } else {
              if (subScore < bestSubScore) {
                bestSubScore = subScore;
                bestPlacementLane = candLane;
              }
            }
          }

          applyActiveSkillLogic(
            simState,
            owner,
            lane,
            choiceSkill.id,
            choiceSkill.value,
            [],
            null,
            bestPlacementLane
          );
        } else {
          applyActiveSkillLogic(
            simState,
            owner,
            lane,
            choiceSkill.id,
            choiceSkill.value,
            [],
            null,
            undefined
          );
        }

        // 手札補充・リソース系スキルのユーティリティ評価を一元的に反映（AI_SKILL_UTILITY準拠: 7〜10pt程度）
        const utilityVal = AI_SKILL_UTILITY[choiceSkill.id];
        if (typeof utilityVal === 'number') {
          if (choiceSkill.id !== 'heal' || !isMiasmaActive(simState)) {
            simState.actionUtilityBonus =
              (simState.actionUtilityBonus || 0) + utilityVal;
          }
        } else if (typeof utilityVal === 'function') {
          simState.actionUtilityBonus =
            (simState.actionUtilityBonus || 0) +
            utilityVal(simState, GameState);
        }
      }
    }

    processDestructionTriggers(simState, []);
    const score = evaluateTurnOutcome(simState, owner);

    if (isRed) {
      if (score > bestScore) {
        bestScore = score;
        bestCombo = combo;
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestCombo = combo;
      }
    }
  }

  return bestCombo.map((i) => choices[i]);
}

/**
 * 号令・狂気・反魂などのアドホック召喚／配置において、最善レーンをシミュレーション評価する。
 *
 * @param {object} tokenCard - 配置または召喚するカードオブジェクト
 * @param {boolean} [checkConstraints=true] - 召喚制約（伝説・生贄・挑戦・頂点）を適用するか
 * @param {boolean} [canCancel=false] - 配置キャンセルを候補に含めるか
 * @param {number[]|null} [candidateLanes=null] - 配置候補レーンの配列（分身の隣接レーン制限など）
 * @returns {number[]|null} 最善レーンの配列。キャンセルが最善の場合は null、候補なしの場合は空配列
 */
export function evaluateAdhocTokenLanes(
  tokenCard,
  checkConstraints = true,
  canCancel = false,
  candidateLanes = null
) {
  /*
  console.log(`[AI CALL Debug] evaluateAdhocTokenLanes start.
  tokenCard: ${tokenCard ? JSON.stringify(tokenCard) : 'null'}
  checkConstraints: ${checkConstraints}, canCancel: ${canCancel}
  `);
  */

  // 号令解決時点の正確なゲーム状態をシミュレーションの初期値として構築
  const initialSimState = buildInitialSimState();

  const sealedLanes = GameState.enemySealedLanes || [0, 0, 0];
  const unsealedLanes = [0, 1, 2].filter((l) => sealedLanes[l] === 0);
  const allLanes = Array.isArray(candidateLanes)
    ? candidateLanes.filter((l) => unsealedLanes.includes(l))
    : unsealedLanes;

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
      'servant',
      'ambush',
      'puppet',
      'resurrect',
      'execute', // 処刑を追加
      'inspire',
      'protection',
      'dominate',
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
    } else if (sk.id === 'summon') {
      const selfId = tokenCard ? tokenCard.baseId || tokenCard.id : null;
      const originalHand = GameState.enemyHand || [];
      const originalDiscard = GameState.enemyDiscard || [];
      const isExcludeBoard = Boolean(sk.excludeBoard);
      const presentBoardIds = isExcludeBoard
        ? activeEnemyBoard
            .filter(Boolean)
            .flatMap((c) => [c.id, c.baseId])
            .filter(Boolean)
        : [];

      for (let i = 0; i < originalHand.length; i++) {
        if (currentUsedHand.includes(i)) continue;
        let childCard = originalHand[i];

        // skillLogic.js の isValidSummonCard と同一の判定順序・論理（matchesSummonTarget）で評価
        if (
          !matchesSummonTarget(childCard, sk, {
            selfId,
            presentBoardIds,
          })
        ) {
          continue;
        }

        let children = buildCardPlayTreeAdhoc(
          childCard,
          i,
          'summon',
          originalHand,
          originalDiscard,
          [...currentUsedHand, i],
          currentUsedDiscard,
          currentDepth + 1
        );
        for (let cNode of children) {
          const summonLane = cNode[0]?.laneIdx;
          const nextEnemyBoard = [...activeEnemyBoard];
          if (summonLane !== undefined && summonLane >= 0 && summonLane < 3) {
            nextEnemyBoard[summonLane] = childCard;
          }
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            [...currentUsedHand, i],
            currentUsedDiscard,
            currentDepth,
            currentDiscard,
            laneIdx,
            nextEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
          );
          for (let nb of nextBranches) {
            results.push([...cNode, ...nb]);
          }
        }
      }
    } else if (sk.id === 'assemble') {
      const isSelf = Boolean(sk.self || sk.targetSelf);
      const selfId = tokenCard ? tokenCard.baseId || tokenCard.id : null;
      const originalHand = GameState.enemyHand || [];
      const originalDiscard = GameState.enemyDiscard || [];
      const targetIds = sk.targetIds || (sk.targetId ? [sk.targetId] : null);
      const targetKeyword = sk.targetKeyword;
      const rawSkillIds = Array.isArray(sk.targetSkills)
        ? sk.targetSkills.filter(Boolean)
        : typeof sk.targetSkills === 'string' && sk.targetSkills.trim() !== ''
          ? [sk.targetSkills.trim()]
          : sk.targetSkill
            ? [sk.targetSkill]
            : [];
      const targetSkills = [...new Set(rawSkillIds)];
      const reqP = sk.value;
      const isExcludeBoard = Boolean(sk.excludeBoard);
      const presentBoardIds = isExcludeBoard
        ? activeEnemyBoard
            .filter(Boolean)
            .flatMap((c) => [c.id, c.baseId])
            .filter(Boolean)
        : [];

      const originalDeck = GameState.enemyDeck || [];
      const seenKeys = new Set();

      for (let i = 0; i < originalDeck.length; i++) {
        let childCard = originalDeck[i];
        if (!childCard) continue;

        const cardKey = childCard.baseId || childCard.id;
        if (seenKeys.has(cardKey)) continue;

        if (isExcludeBoard) {
          if (
            presentBoardIds.includes(childCard.id) ||
            (childCard.baseId && presentBoardIds.includes(childCard.baseId))
          ) {
            continue;
          }
        }

        let matches = true;
        if (isSelf && selfId) {
          matches = matchesCardId(childCard, selfId);
        } else if (Array.isArray(targetIds) && targetIds.length > 0) {
          matches = matchesCardIds(childCard, targetIds);
        } else if (typeof targetKeyword === 'string' && targetKeyword) {
          matches = matchesCardKeyword(childCard, targetKeyword);
        } else if (Array.isArray(targetSkills) && targetSkills.length > 0) {
          const masterCard = CARD_MASTER?.find((m) => m.id === childCard.id);
          matches = targetSkills.some(
            (sId) =>
              hasSkillDeep(childCard, sId) ||
              (masterCard && hasSkillDeep(masterCard, sId))
          );
        } else if (reqP !== undefined && reqP !== null) {
          matches = (childCard.power || 0) <= reqP;
        }

        if (!matches) continue;
        seenKeys.add(cardKey);

        const masterData = CARD_MASTER.find(
          (m) => m.id === (childCard.baseId || childCard.id)
        );
        const assembleCard = masterData
          ? cloneCard(masterData)
          : cloneCard(childCard);
        assembleCard.uid = childCard.uid || childCard.id;
        assembleCard.baseId = childCard.baseId || childCard.id;
        assembleCard.basePower = assembleCard.power;
        assembleCard.currentPower = assembleCard.power;

        let children = buildCardPlayTreeAdhoc(
          assembleCard,
          i,
          'assemble',
          originalHand,
          originalDiscard,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth + 1
        );
        for (let cNode of children) {
          const assembleLane = cNode[0]?.laneIdx;
          const nextEnemyBoard = [...activeEnemyBoard];
          if (
            assembleLane !== undefined &&
            assembleLane >= 0 &&
            assembleLane < 3
          ) {
            nextEnemyBoard[assembleLane] = assembleCard;
          }
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            currentUsedHand,
            currentUsedDiscard,
            currentDepth,
            currentDiscard,
            laneIdx,
            nextEnemyBoard,
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
      // 【重要】特定対象（targetIds / targetKeyword）が指定されている復活スキルの場合、
      // パワー制限（sk.value）は存在しないため maxP を undefined としてパワー上限チェックを解除する。
      // （sk.value が未指定の場合に 1 と誤認してパワー1超のカードを不正棄却するバグを防止）
      const hasSpecificTarget =
        (Array.isArray(sk.targetIds) && sk.targetIds.length > 0) ||
        sk.targetId ||
        (typeof sk.targetKeyword === 'string' && sk.targetKeyword);
      const maxP = hasSpecificTarget
        ? undefined
        : sk.value !== undefined && sk.value !== null
          ? sk.value
          : 1;
      const candidates = [...originalDiscard, ...currentDiscard];
      const isExcludeBoard = Boolean(sk.excludeBoard);
      const presentBoardIds = isExcludeBoard
        ? activeEnemyBoard
            .filter(Boolean)
            .flatMap((c) => [c.id, c.baseId])
            .filter(Boolean)
        : [];

      for (let i = 0; i < candidates.length; i++) {
        if (currentUsedDiscard.includes(i)) continue;
        let resCard = candidates[i];

        // skillLogic.js の実戦判定（matchesResurrectTarget）と同一ロジックで評価
        if (
          !matchesResurrectTarget(resCard, sk, {
            presentBoardIds,
          })
        ) {
          continue;
        }

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
    } else if (sk.id === 'inspire') {
      const bVal = sk.value || 1;
      const otherOccupiedLanes = [0, 1, 2].filter(
        (j) => activeEnemyBoard[j] !== null && j !== laneIdx
      );
      if (otherOccupiedLanes.length > 0 && bVal !== 0) {
        for (let tgtLane of otherOccupiedLanes) {
          let inspireNode = {
            type: 'inspire',
            targetLane: tgtLane,
            value: bVal,
          };
          const nextEnemyBoard = activeEnemyBoard.map((c) =>
            c ? { ...c } : null
          );
          if (nextEnemyBoard[tgtLane]) {
            nextEnemyBoard[tgtLane].currentPower =
              (nextEnemyBoard[tgtLane].currentPower || 0) + bVal;
          }
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            currentUsedHand,
            currentUsedDiscard,
            currentDepth,
            currentDiscard,
            laneIdx,
            nextEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
          );
          for (let nb of nextBranches) {
            results.push([inspireNode, ...nb]);
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
    } else if (sk.id === 'protection') {
      const occupiedLanes = [0, 1, 2].filter(
        (j) => activeEnemyBoard[j] !== null
      );
      if (occupiedLanes.length > 0) {
        for (let tgtLane of occupiedLanes) {
          let protectNode = {
            type: 'protection',
            targetLane: tgtLane,
          };
          const nextEnemyBoard = activeEnemyBoard.map((c) =>
            c ? { ...c } : null
          );
          if (nextEnemyBoard[tgtLane]) {
            nextEnemyBoard[tgtLane].valkyriaGuard = true;
          }
          let nextBranches = buildSkillBranchAdhoc(
            remainingSkills,
            currentUsedHand,
            currentUsedDiscard,
            currentDepth,
            currentDiscard,
            laneIdx,
            nextEnemyBoard,
            activePlayerBoard,
            leaderSkillContext
          );
          for (let nb of nextBranches) {
            results.push([protectNode, ...nb]);
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
    } else if (['clone', 'servant', 'ambush'].includes(sk.id)) {
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
    if (depth >= 4) return [[]];

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
      sourceType === 'summon' ||
      sourceType === 'assemble'
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
      if (sourceType !== 'invite') {
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
            'forge',
            'summon',
            'assemble',
          ].includes(sourceType);
          if (isSummonAction) {
            if (Array.isArray(card.skills)) {
              card.skills.forEach((s) => {
                if (
                  [
                    'invite',
                    'resurrect',
                    'convert',
                    'draw',
                    'reinforce',
                    'clone',
                    'servant',
                    'summon',
                    'assemble',
                    'ambush',
                    'puppet',
                    'leap',
                    'forge',
                    'inspire',
                    'protection',
                    'dominate',
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

          if (depth < 4 && effectiveSkills.length > 0) {
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

      // 選択スキル（choice / force）の選択肢情報は choiceIndexQueue に割り込み登録する
      // ※ token_placement / resurrect / dominate などのレーン指定は actionQueue の各アクションオブジェクト自身が保持し、
      //    実処理部（skillLogic.js の servant/clone/resurrect 等）が actionQueue から直接取り出して消費するため、
      //    cardTokenLanes に二重登録してはならない（未消費のゴミが残り後続のアドホック召喚を誤バイパスする原因となるため）。
      if (act.type === 'choice' || act.type === 'force') {
        if (act.choices !== undefined) {
          GameState.aiDecision.choiceIndexQueue.unshift(act.choices);
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

/**
 * Normal/Hard AI 用のトークン/アドホック配置レーン決定関数
 * 最新盤面シミュレーション（evaluateAdhocTokenLanes）で最善レーンを選定し、
 * count > 1（分身等）の場合は残りの候補レーンから空きレーンを優先して最大count個まで選択する。
 *
 * @param {Array<number>} allLanes - 選択可能な候補レーン配列
 * @param {'red' | 'blue'} owner - 配置プレイヤー
 * @param {object|null} tokenCard - 配置対象のカード/トークン
 * @param {number} count - 配置要求数
 * @param {boolean} [canCancel=false] - 配置キャンセル可能フラグ
 * @param {boolean} [checkConstraints=true] - 召喚制約（伝説・生贄・挑戦・頂点）の適用フラグ
 * @returns {Array<number>} 決定された配置レーン配列
 */
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
      canCancel,
      allLanes
    );
    if (results === null) return []; // キャンセル判定
    if (results.length > 0) {
      if (results.length >= count) return results.slice(0, count);

      // count > 1（分身等）の場合：残りの候補レーンから空き枠を優先して追加選択する
      const remainingLanes = allLanes.filter((l) => !results.includes(l));
      const validRemaining = remainingLanes.filter((l) => {
        if (checkConstraints && tokenCard) {
          if (hasSkill(tokenCard, 'legendary') && l !== 1) return false;
          if (
            hasSkill(tokenCard, 'takeover') &&
            GameState.enemyBoard[l] === null
          )
            return false;
          if (
            hasSkill(tokenCard, 'challenge') &&
            GameState.playerBoard[l] === null
          )
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
        const sealedLanes = GameState.enemySealedLanes || [0, 0, 0];
        return sealedLanes[l] === 0;
      });

      // 1. 空きレーンを最優先で追加
      const emptyLanes = validRemaining.filter(
        (l) => GameState.enemyBoard[l] === null
      );
      for (const el of emptyLanes) {
        if (results.length < count) {
          results.push(el);
        }
      }

      // 2. キャンセル不可（!canCancel）で枠が不足している場合のみ、味方上書きも許容して補充
      if (!canCancel && results.length < count) {
        const occupiedLanes = validRemaining.filter(
          (l) => GameState.enemyBoard[l] !== null
        );
        occupiedLanes.sort(
          (a, b) =>
            (GameState.enemyBoard[a]?.currentPower || 0) -
            (GameState.enemyBoard[b]?.currentPower || 0)
        );
        for (const ol of occupiedLanes) {
          if (results.length < count) {
            results.push(ol);
          }
        }
      }

      return results.slice(0, count);
    }
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
    initialPlayerHP: GameState.playerHP,
    initialEnemyHP: currentMyHP,
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
          const unionSkillForCheck =
            playedCard.skills &&
            playedCard.skills.find((s) => s.id === 'union');
          if (!(
            unionSkillForCheck &&
            matchesUnionMaterial(
              simState.enemyBoard[laneIdx],
              unionSkillForCheck
            )
          )) {
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
        } else if (existingCard && canEquipCard(playedCard, existingCard)) {
          const targetCard = existingCard;
          const { equipSkills } = applyEquipment(targetCard, playedCard);
          equipSkills.forEach((sk) => {
            // 配置系・復活系スキルは個別のアクションとして処理されるため、ここでは即時実行をスキップする
            if (
              [
                'clone',
                'servant',
                'summon',
                'ambush',
                'puppet',
                'resurrect',
                'execute',
                'inspire',
                'protection',
                'dominate',
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
            matchesUnionMaterial(simState.enemyBoard[laneIdx], unionSkill)
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
                    if (cArr[i]) skills.push({ ...cArr[i] });
                  });
                }
              } else skills.push(sk);
            });
          }

          // 選択されたスキルでカードのスキルを上書きし、パッシブスキルの評価に反映させる
          activeCard.skills = [...skills];

          if (!activeCard.skillTriggered) {
            skills.forEach((sk) => {
              if (sk.id === 'call' || sk.id === 'assemble') {
                // 【号令・召集の仮評価（simulateMove版）】
                // processActionSequence と同じロジック: call/assembleの値分のパワーを仮加算
                const callBonus = estimateCallAssembleBonus(sk);
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
                  'servant',
                  'summon',
                  'ambush',
                  'puppet',
                  'resurrect',
                  'execute',
                  'inspire',
                  'protection',
                  'dominate',
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
          // 【招来・召喚・鍛造】これらの連続プレイを伴う出現時スキルの場合は、
          // 次の追加プレイアクションが実行されるまで保護フラグ（isSkillResolving）を維持する
          if (activeCard) {
            const hasChainSummon =
              hasSkill(activeCard, 'invite') ||
              hasSkill(activeCard, 'summon') ||
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

  if (!(simState.extraTurnCount > 0)) {
    // 【絶対厳守】相手（blue）の戦闘フェーズのみをシミュレート（AIの返しの攻撃は次ターンなので範囲外）
    simulateCombatStep(simState, 'blue');
  } else {
    simState.extraTurnCount--;
    simState.combatDamageTaken = 0;
    simState.phaseBypassDamageTaken = 0;
  }
  return simState;
}

import { GameState } from '../state/gameState.js';
import { AI_SKILL_UTILITY } from '../utils/constants/aiSkillValues.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { ACTIVE_SKILLS } from '../utils/constants/skills.js';
import {
  checkIsEasyAI,
  getAdventRequirement,
  getCardCurrentPower,
  getCurrentRNG,
  getSeededRandom,
  getSkillValue,
  hasSkill,
  isProtectedZeroPowerCard,
  matchesAssembleTarget,
  matchesCallTarget,
  matchesInvokeTarget,
  matchesResurrectTarget,
  matchesSummonTarget,
  consumeStartupSkill,
  clearStatusDecaySkips,
  decayCardStatus,
  matchesUnionMaterial,
  resolveCardSupremacySkills,
  setCurrentRNG,
  collectPresentBoardTargets,
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
  clearValkyriaGuard,
  damageCard,
  isGraveKeeperActive,
  isMiasmaActive,
  isReverseActive,
  isValkyriaGuardActive,
  processDestructionTriggers,
  quietDiscardFromBoard,
  SUPREMACY_REQUIRED_BASE_POWER,
  VALKYRIA_GUARD_TURNS,
  getBestSimulatedPlacementLane,
  registerPlacementEvaluator,
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
 * 対象カードが連続プレイを伴う出現時連鎖召喚スキル（forge / summon / assemble / invoke）を保持しているか判定する。
 *
 * @param {object|null|undefined} c - 判定対象のカードオブジェクト
 * @returns {boolean} 連鎖召喚スキルを持つ場合は true
 */
function hasChainSummonSkill(c) {
  if (!c) return false;
  return (
    hasSkill(c, 'forge') ||
    hasSkill(c, 'summon') ||
    hasSkill(c, 'assemble') ||
    hasSkill(c, 'invoke')
  );
}

/**
 * 対象カードがアクションキュー上の後続ノードとして解決されるスキル（使役・分身・処刑・復活・傀儡等）を
 * 保持しているかを判定する。パワー0の親カードがこれらの後続ノード解決前に早まって除去されるのを防ぐ。
 *
 * @param {object|null|undefined} c - 判定対象のカードオブジェクト
 * @returns {boolean} 後続子アクション系スキルを保持している場合は true
 */
function hasDeferredChildActionSkill(c) {
  if (!c) return false;
  const deferredIds = [
    'servant',
    'clone',
    'ambush',
    'execute',
    'puppet',
    'resurrect',
    'inspire',
    'protection',
    'dominate',
  ];
  return deferredIds.some((id) => hasSkill(c, id));
}

/**
 * スキルツリー構築（buildSkillBranch / buildSkillBranchAdhoc）において、
 * トークン配置スキル（servant / clone / ambush）の選択レーン組み合わせ（combo）を
 * 仮想盤面と一時墓地リストへ反映した新しい配列ペアを生成する。
 * 直後に続く「処刑（execute）」等のスキル分岐が、配置されたトークン（「虚空」等）を
 * 盤面上の対象カードとして正確に認識できるようにするために使用する。
 *
 * @param {Array<object|null>} sourceBoard - 配置前の自陣仮想盤面配列
 * @param {Array<object>} sourceDiscarded - 配置前の一時墓地カード配列
 * @param {Array<number>} combo - トークンを配置するレーン番号配列
 * @param {object} sk - スキル定義オブジェクト（id, value, summonId 等）
 * @param {object|null} parentCard - スキル発動元の親カードオブジェクト
 * @param {Array<number>} sealedLanes - 自陣の封印レーン配列
 * @param {'red'|'blue'} [side='red'] - 配置を行う陣営
 * @returns {{ nextBoard: Array<object|null>, nextDiscarded: Array<object> }} 更新後の盤面と一時墓地配列
 */
function applySimTokenComboToBoard(
  sourceBoard,
  sourceDiscarded,
  combo,
  sk,
  parentCard,
  sealedLanes,
  side = 'red'
) {
  const nextBoard = sourceBoard.map((c) => (c ? cloneCard(c) : null));
  const nextDiscarded = [...sourceDiscarded];
  if (!Array.isArray(combo) || combo.length === 0) {
    return { nextBoard, nextDiscarded };
  }

  let tokenPower = sk.value ?? 1;
  if (sk.id === 'clone' && parentCard) {
    tokenPower =
      parentCard.currentPower !== undefined
        ? parentCard.currentPower
        : parentCard.power || 0;
  }

  let tokenId = sk.summonId || parentCard?.summonId;
  if (!tokenId) {
    if (sk.id === 'clone') {
      tokenId = 'token_clone';
    } else {
      tokenId = tokenPower >= 5 ? 'token_golem' : 'token_drone';
    }
  }
  const baseMaster = CARD_MASTER.find((m) => m.id === tokenId);

  for (let idx = 0; idx < combo.length; idx++) {
    const tLane = combo[idx];
    if (sealedLanes && sealedLanes[tLane] > 0) continue;

    let inheritedSkills = [];
    if (sk.id === 'clone' && parentCard && Array.isArray(parentCard.skills)) {
      inheritedSkills = parentCard.skills.map((s) =>
        typeof s === 'object' && s !== null ? { ...s } : s
      );
    } else if (baseMaster?.skills) {
      inheritedSkills = JSON.parse(JSON.stringify(baseMaster.skills));
    }

    const simToken = {
      id: `branch_sim_${side}_${tokenId}_${tLane}_${idx}`,
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
      isSkillResolving: sk.id !== 'ambush',
    };

    const existingCard = nextBoard[tLane];
    if (existingCard && hasSkill(existingCard, 'startup')) {
      consumeStartupSkill(existingCard);
    } else if (existingCard && canEquipCard(simToken, existingCard)) {
      applyEquipment(existingCard, simToken);
    } else {
      if (existingCard && !existingCard.isToken) {
        nextDiscarded.push(existingCard);
      }
      nextBoard[tLane] = simToken;
    }
  }

  return { nextBoard, nextDiscarded };
}

/**
 * AIシミュレーション内で分裂(split)スキル発動時に生成されるトークンカードオブジェクトを生成する。
 * 実行処理と分岐評価処理の両方で同じトークン構造（isToken: true, baseId）を保証する。
 * @param {object} execCard - 分裂スキルを持つカード
 * @param {number} tgtLane - 対象レーンインデックス (0~2)
 * @param {string} [owner='red'] - 所有者 ('blue' | 'red')
 * @return {object} 生成されたシミュレーション用トークンカードオブジェクト
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
 * @return {number} 近似されるパワーボーナス値
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
 * 指定されたデッキ内に対象スキル（号令または召集）の条件を満たすカードが存在するか判定する。
 * デッキが0枚の場合、または条件に合致するカードが1枚も存在しない場合は false を返す。
 *
 * @param {object|null|undefined} sk - 号令または召集のスキル定義オブジェクト
 * @param {Array<object>|null|undefined} deck - 判定対象のデッキ配列
 * @param {object} [options={}] - 判定用オプション
 * @param {string|null} [options.selfId=null] - 発動元カードのIDまたはbaseId
 * @param {Array<string>} [options.presentBoardIds=[]] - 盤面に配置済みのカードID配列
 * @param {Array<object>} [options.presentBoardCards=[]] - 盤面に配置済みの実カードオブジェクト配列
 * @returns {boolean} 条件を満たすカードが1枚以上存在すれば true
 */
function hasValidTargetInDeck(sk, deck, options = {}) {
  if (!sk || !Array.isArray(deck) || deck.length === 0) return false;
  return deck.some((card) => card && matchesCallTarget(card, sk, options));
}

/**
 * 指定されたプレイヤーが先行1ターン目（中央レーン以外への配置不可）であるかを判定する。
 * 先行1ターン目は他のレーンにカードを出すことができないため、追加展開スキルのボーナス等を抑止する。
 *
 * @param {'blue' | 'red'} owner - 対象プレイヤー
 * @param {object|null|undefined} [state=null] - シミュレーション状態オブジェクト
 * @returns {boolean} 先行1ターン目であれば true
 */
function isFirstTurnRestricted(owner, state = null) {
  const turnCount = state?.turnCount ?? GameState.turnCount ?? 0;
  const firstPlayer = state?.firstPlayer ?? GameState.firstPlayer;
  return turnCount === 1 && firstPlayer === owner;
}

/**
 * CARD_MASTER のID→定義オブジェクト高速参照用マップ（O(1) 検索）
 */
const CARD_MASTER_MAP = new Map(
  CARD_MASTER.map((cardDef) => [cardDef.id, cardDef])
);

/**
 * カードIDからマスタ定義オブジェクトを O(1) で取得する。
 * マップ未登録の動的カードにも対応するため、見つからない場合は CARD_MASTER をフォールバック検索する。
 *
 * @param {string|null|undefined} id - 検索対象のカードID
 * @returns {object|null} カードマスタ定義オブジェクト（未存在時は null）
 */
function getCardMasterById(id) {
  if (!id) return null;
  return (
    CARD_MASTER_MAP.get(id) || CARD_MASTER.find((m) => m.id === id) || null
  );
}

/**
 * カードオブジェクトをシミュレーション用に高速ディープコピーする。
 * structuredClone() と同等の独立性（ネストされたスキル配列・選択肢配列・装備配列・合体素材配列・保留スキル配列の分離）を
 * 保ちつつ、大量シミュレーション時のオブジェクト複製コストを大幅に削減する。
 *
 * @param {object|null|undefined} c - 複製元のカードオブジェクト
 * @returns {object|null} 複製されたカードオブジェクト（入力が falsy の場合は null）
 */
function cloneCard(c) {
  if (!c) return null;
  const copy = { ...c };
  if (Array.isArray(c.skills)) {
    copy.skills = c.skills.map((s) =>
      s && typeof s === 'object' ? { ...s } : s
    );
  }
  if (Array.isArray(c.choices)) {
    copy.choices = c.choices.map((s) =>
      s && typeof s === 'object' ? { ...s } : s
    );
  }
  if (Array.isArray(c.choices2)) {
    copy.choices2 = c.choices2.map((s) =>
      s && typeof s === 'object' ? { ...s } : s
    );
  }
  if (Array.isArray(c.supremacySkills)) {
    copy.supremacySkills = c.supremacySkills.map((s) =>
      s && typeof s === 'object' ? { ...s } : s
    );
  }
  if (Array.isArray(c.equippedCards)) {
    copy.equippedCards = c.equippedCards.map(cloneCard);
  }
  if (Array.isArray(c.unionMaterials)) {
    copy.unionMaterials = c.unionMaterials.map(cloneCard);
  }
  if (Array.isArray(c._pendingSimSkills)) {
    copy._pendingSimSkills = c._pendingSimSkills.map((p) =>
      p && typeof p === 'object'
        ? {
            ...p,
            targetLanes: Array.isArray(p.targetLanes)
              ? [...p.targetLanes]
              : p.targetLanes,
          }
        : p
    );
  }
  return copy;
}

/**
 * リーダーコンフィグからAIシミュレーション内で参照される軽量プロパティのみを抽出したスナップショットを生成する。
 * セリフ辞書（dialogue）やスキン定義（skins）などの巨大な読み取り専用データを毎回JSONクローンする無駄を排除する。
 *
 * @param {object|null|undefined} config - GameState.playerConfig または enemyConfig
 * @returns {object|null} シミュレーション用の軽量コンフィグスナップショット
 */
function createSimConfigSnapshot(config) {
  if (!config) return null;
  return {
    id: config.id,
    charId: config.charId,
    currentSkin: config.currentSkin,
    leaderCardId: config.leaderCardId,
    leaderSkill: config.leaderSkill ? { ...config.leaderSkill } : null,
  };
}

/**
 * シミュレーション状態（simState）を高速に独立複製する。
 * リーダースキル先出し後の仮想状態（postLeaderSim）を後続の手札探索でそのまま再利用するために使用する。
 * 山札内のカード要素オブジェクトはシミュレーション中に直接書き換えられないため、山札配列はシャローコピーとする。
 *
 * @param {object|null} state - 複製元のシミュレーション状態オブジェクト
 * @returns {object|null} 複製されたシミュレーション状態オブジェクト
 */
function cloneSimState(state) {
  if (!state) return null;
  return {
    ...state,
    playerBoard: state.playerBoard
      ? state.playerBoard.map(cloneCard)
      : [null, null, null],
    enemyBoard: state.enemyBoard
      ? state.enemyBoard.map(cloneCard)
      : [null, null, null],
    playerDiscard: state.playerDiscard ? [...state.playerDiscard] : [],
    enemyDiscard: state.enemyDiscard ? [...state.enemyDiscard] : [],
    playerSealedLanes: state.playerSealedLanes
      ? [...state.playerSealedLanes]
      : [0, 0, 0],
    enemySealedLanes: state.enemySealedLanes
      ? [...state.enemySealedLanes]
      : [0, 0, 0],
    playerHand: state.playerHand ? [...state.playerHand] : [],
    enemyHand: state.enemyHand ? state.enemyHand.map(cloneCard) : [],
    playerDeck: state.playerDeck ? [...state.playerDeck] : [],
    enemyDeck: state.enemyDeck ? [...state.enemyDeck] : [],
    playerConfig: state.playerConfig || null,
    enemyConfig: state.enemyConfig || null,
    _actionQueue: [],
  };
}

/**
 * 盤面上のカード1体の完全な状態（ステータス・スキル・装備・合体素材・状態異常・保留スキル等）を
 * 厳密な一意キー文字列へシリアライズする。
 *
 * @param {object|null|undefined} c - 盤面上のカードオブジェクト
 * @returns {string} 厳密なカード状態キー文字列
 */
function serializeBoardCardKey(c) {
  if (!c) return '_';
  const skillsStr = Array.isArray(c.skills)
    ? c.skills
        .map(
          (s) =>
            `${s.id}:${s.value ?? ''}:${s.choiceGroup ?? ''}:${s.summonId ?? ''}`
        )
        .join(',')
    : '';
  const eqStr =
    Array.isArray(c.equippedCards) && c.equippedCards.length > 0
      ? c.equippedCards.map(serializeBoardCardKey).join('+')
      : '';
  const unStr =
    Array.isArray(c.unionMaterials) && c.unionMaterials.length > 0
      ? c.unionMaterials.map(serializeBoardCardKey).join('+')
      : '';
  const pendStr =
    Array.isArray(c._pendingSimSkills) && c._pendingSimSkills.length > 0
      ? c._pendingSimSkills
          .map(
            (p) =>
              `${p.id}:${p.value ?? ''}:${Array.isArray(p.targetLanes) ? p.targetLanes.join('.') : ''}`
          )
          .join(',')
      : '';
  return [
    c.baseId || c.id || '',
    c.currentPower ?? c.power ?? 0,
    c.basePower ?? c.power ?? 0,
    c.power ?? 0,
    c.isToken ? 1 : 0,
    c.skillTriggered ? 1 : 0,
    c.isSkillResolving ? 1 : 0,
    c.hasTakenDamage ? 1 : 0,
    c.stunTurns || 0,
    c.stunAppliedThisTurn ? 1 : 0,
    c.cantAttackTurns || 0,
    c.cantAttackAppliedThisTurn ? 1 : 0,
    c.invincibleTurns || 0,
    c.invincibleAppliedThisTurn ? 1 : 0,
    c.poisonValue || 0,
    c.valkyriaGuard ? 1 : 0,
    c.valkyriaGuardTurns || 0,
    c.puppetOriginalOwner || '',
    skillsStr,
    eqStr,
    unStr,
    pendStr,
  ].join('|');
}

/**
 * Phase 2（後続手札探索＋戦闘＋評価）において、どの非盤面ゾーン（墓地・山札・相手手札等）が
 * 探索結果や評価スコアに影響し得るかを、現在の手札・山札・盤面プール全体から厳密に判定する。
 * 合体先カード・選択スキル・覇道サブスキルまで再帰的に検査し、該当スキルが1つも存在しないゾーンのみ
 * 中間状態キーから安全に除外することで、探索品質を一切落とさず状態集約率を最大化する。
 *
 * @param {Array<object|null>} hand - AI手札配列
 * @param {Array<object|null>} deck - AI山札配列
 * @param {Array<object|null>} myBoard - AI盤面配列
 * @param {Array<object|null>} opBoard - プレイヤー盤面配列
 * @returns {{
 *   needsMyDiscard: boolean,
 *   needsOppDiscard: boolean,
 *   needsFullMyDeck: boolean,
 *   needsAdventDeckOnly: boolean,
 *   needsOppDeck: boolean,
 *   needsOppHand: boolean,
 *   needsExtraHandCards: boolean
 * }} ゾーン参照の必要性フラグ群
 */
function analyzePhase2ZoneRelevance(hand, deck, myBoard, opBoard) {
  const skillIds = new Set();
  const visitedUnionIds = new Set();

  /**
   * カードが直接または選択肢・覇道・合体進化経由で発動し得る全スキルIDを収集する。
   * @param {object|null|undefined} c - 検査対象カード
   * @returns {void}
   */
  const collectCardSkills = (c) => {
    if (!c) return;
    const allLists = [c.skills, c.choices, c.choices2, c.supremacySkills];
    for (const list of allLists) {
      if (!Array.isArray(list)) continue;
      for (const sk of list) {
        if (!sk || !sk.id) continue;
        skillIds.add(sk.id);
        if (
          sk.id === 'union' &&
          sk.summonId &&
          !visitedUnionIds.has(sk.summonId)
        ) {
          visitedUnionIds.add(sk.summonId);
          collectCardSkills(getCardMasterById(sk.summonId));
        }
      }
    }
  };

  for (const c of hand || []) collectCardSkills(c);
  for (const c of deck || []) collectCardSkills(c);
  for (const c of myBoard || []) collectCardSkills(c);
  for (const c of opBoard || []) collectCardSkills(c);

  // 変身(metamorph)・輪廻(samsara)を含む場合は安全側に倒して全ゾーンを参照対象とする
  // ※ 回収(salvage)は事前シミュレーションではユーティリティボーナス加算のみで墓地を参照しないため除外可
  const forceAll = skillIds.has('metamorph') || skillIds.has('samsara');
  const needsMyDiscard =
    forceAll ||
    skillIds.has('invade') ||
    skillIds.has('resurrect') ||
    skillIds.has('recurse');
  const needsOppDiscard =
    forceAll || skillIds.has('puppet') || skillIds.has('recurse');
  const needsFullMyDeck =
    forceAll ||
    skillIds.has('assemble') ||
    skillIds.has('call') ||
    skillIds.has('explore') ||
    skillIds.has('loss') ||
    skillIds.has('shuffle');
  const needsAdventDeckOnly = !needsFullMyDeck && skillIds.has('invoke');
  const needsOppDeck = forceAll || skillIds.has('burial');
  const needsOppHand =
    forceAll || skillIds.has('morph') || skillIds.has('extort');
  const needsExtraHandCards =
    forceAll ||
    skillIds.has('buff_void') ||
    skillIds.has('snipe_void') ||
    skillIds.has('heal_void') ||
    skillIds.has('support_void') ||
    skillIds.has('decree');

  return {
    needsMyDiscard,
    needsOppDiscard,
    needsFullMyDeck,
    needsAdventDeckOnly,
    needsOppDeck,
    needsOppHand,
    needsExtraHandCards,
  };
}

/**
 * リーダースキル先出し直後の中間状態（postLeaderSim）から、残存手札（enemyHand）を除く
 * 全関連状態（盤面・HP/SP・加護・封印・関連墓地/山札/相手手札・ユーティリティボーナス等）の
 * 厳密な一意キーを生成する。Phase 1 の状態集約および Phase 2 の支配枝刈りメモ化で共用する。
 *
 * @param {object} state - 戦闘フェーズ前の中間シミュレーション状態
 * @param {object|null} [relevance=null] - analyzePhase2ZoneRelevance の解析結果（省略時は全ゾーンを厳密比較）
 * @returns {string} 手札を除く中間状態の一意キー文字列
 */
function buildPostLeaderBoardAndZonesKey(state, relevance = null) {
  const eb = state.enemyBoard.map(serializeBoardCardKey).join('||');
  const pb = state.playerBoard.map(serializeBoardCardKey).join('||');

  const pHand =
    !relevance || relevance.needsOppHand
      ? state.playerHand.filter(Boolean).map(getCardSignature).join(',')
      : '';
  const eDisc =
    !relevance || relevance.needsMyDiscard
      ? state.enemyDiscard
          .filter(Boolean)
          .map(getCardSignature)
          .sort()
          .join(',')
      : '';
  const pDisc =
    !relevance || relevance.needsOppDiscard
      ? state.playerDiscard
          .filter(Boolean)
          .map(getCardSignature)
          .sort()
          .join(',')
      : '';
  let eDeck = '';
  if (!relevance || relevance.needsFullMyDeck) {
    eDeck = state.enemyDeck
      .filter(Boolean)
      .map(getCardSignature)
      .sort()
      .join(',');
  } else if (relevance.needsAdventDeckOnly) {
    // 招来(invoke)のみが山札を参照する場合は、山札内の「降臨」カードの種類集合（有無）のみが
    // 後続探索の合法性・結果に影響するため、非降臨カードの残数差による重複状態を安全に統合する
    const adventSigSet = new Set();
    for (const c of state.enemyDeck) {
      if (c && getAdventRequirement(c) !== null) {
        adventSigSet.add(getCardSignature(c));
      }
    }
    eDeck = [...adventSigSet].sort().join(',');
  }
  const pDeck =
    !relevance || relevance.needsOppDeck
      ? state.playerDeck.filter(Boolean).map(getCardSignature).join(',')
      : '';

  return [
    eb,
    pb,
    state.enemyHP,
    state.playerHP,
    state.enemySP,
    state.playerSP,
    state.valkyriaGuardRed || 0,
    state.valkyriaGuardBlue || 0,
    state.extraTurnCount || 0,
    state.attackSkipCount || 0,
    state.combatDamageTaken || 0,
    state.phaseBypassDamageTaken || 0,
    state.actionUtilityBonus || 0,
    (state.enemySealedLanes || [0, 0, 0]).join(','),
    (state.playerSealedLanes || [0, 0, 0]).join(','),
    pHand,
    eDisc,
    pDisc,
    eDeck,
    pDeck,
  ].join('#');
}

/**
 * リーダースキル先出し直後の中間状態（postLeaderSim）から、後続の手札探索・戦闘・評価に影響し得る
 * 全ての状態（盤面・HP/SP・加護・封印・手札・関連ゾーン・ユーティリティボーナス等）を厳密に表現する一意キーを生成する。
 *
 * @param {object} state - 戦闘フェーズ前の中間シミュレーション状態
 * @param {object|null} [relevance=null] - analyzePhase2ZoneRelevance の解析結果（省略時は全ゾーンを厳密比較）
 * @param {number|null} [origHandLen=null] - 元の手札枚数（追加トークン分離判定用）
 * @param {string|null} [precomputedBoardZonesKey=null] - 事前計算済みの盤面・関連ゾーンキー
 * @returns {string} 中間状態の一意キー文字列
 */
function buildPostLeaderStateKey(
  state,
  relevance = null,
  origHandLen = null,
  precomputedBoardZonesKey = null
) {
  const boardZonesKey =
    precomputedBoardZonesKey ??
    buildPostLeaderBoardAndZonesKey(state, relevance);
  const handSource =
    relevance && !relevance.needsExtraHandCards && origHandLen !== null
      ? state.enemyHand.slice(0, origHandLen)
      : state.enemyHand;
  const eHand = handSource
    .filter(Boolean)
    .map(getCardSignature)
    .sort()
    .join(',');
  return `${boardZonesKey}#H:${eHand}`;
}

/**
 * Phase 2 の手札カード 1 枚をプレイするサブ問題において、残存する「他の手札カード群」が
 * そのカードの解決結果に影響する本質情報のみを厳密なキー文字列へ圧縮する。
 * これにより、同一盤面・同一プレイカードに対して異なる残存手札構成が同値なサブ問題を生む場合でも、
 * 探索深度・評価精度を一切落とさずに重複探索を完全に排除できる。
 *
 * @param {object} playedCard - プレイ対象の手札カード
 * @param {number} playedIdx - プレイ対象カードの手札インデックス
 * @param {Array<object|null>} postHandSlice - 元手札範囲の残存手札配列
 * @param {Array<object|null>} fullEnemyHand - 追加トークン（虚空等）を含む全手札配列
 * @param {object} relevance - analyzePhase2ZoneRelevance の解析結果
 * @returns {string} サブ問題の手札依存キー文字列
 */
function buildPhase2HandSubproblemKey(
  playedCard,
  playedIdx,
  postHandSlice,
  fullEnemyHand,
  relevance
) {
  const cardSkillIds = new Set();
  const visitedUnions = new Set();
  const collect = (c) => {
    if (!c) return;
    const lists = [c.skills, c.choices, c.choices2, c.supremacySkills];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const sk of list) {
        if (!sk || !sk.id) continue;
        cardSkillIds.add(sk.id);
        if (
          sk.id === 'union' &&
          sk.summonId &&
          !visitedUnions.has(sk.summonId)
        ) {
          visitedUnions.add(sk.summonId);
          collect(getCardMasterById(sk.summonId));
        }
      }
    }
  };
  collect(playedCard);

  const hasExactHandRef =
    cardSkillIds.has('summon') ||
    cardSkillIds.has('forge') ||
    cardSkillIds.has('buff_void') ||
    cardSkillIds.has('snipe_void') ||
    cardSkillIds.has('heal_void') ||
    cardSkillIds.has('support_void') ||
    cardSkillIds.has('decree') ||
    cardSkillIds.has('metamorph');
  const hasInvoke = cardSkillIds.has('invoke');
  const hasSimpleDiscard =
    cardSkillIds.has('convert') ||
    cardSkillIds.has('draw') ||
    cardSkillIds.has('reinforce');

  // 手札の他カードを一切参照しないカード（eater, バニラ, 降臨等）は残存手札に完全非依存
  if (!hasExactHandRef && !hasInvoke && !hasSimpleDiscard) {
    return '';
  }

  // 厳密な手札参照スキルや墓地/追加手札参照が絡む場合は全残存手札シグネチャを厳密比較
  if (
    hasExactHandRef ||
    relevance.needsMyDiscard ||
    relevance.needsExtraHandCards
  ) {
    return fullEnemyHand
      .filter((c, idx) => c && idx !== playedIdx)
      .map(getCardSignature)
      .sort()
      .join(',');
  }

  // convert / draw / reinforce のみの場合: 狂気カードが無ければ捨てられる枚数のみに依存
  if (hasSimpleDiscard && !hasInvoke) {
    let otherCount = 0;
    let hasMadness = false;
    for (let k = 0; k < postHandSlice.length; k++) {
      if (k === playedIdx) continue;
      const c = postHandSlice[k];
      if (!c) continue;
      otherCount++;
      if (hasSkill(c, 'madness')) hasMadness = true;
    }
    if (!hasMadness) {
      return `SD:${otherCount}`;
    }
  }

  // invoke（招来）の場合（墓地・追加手札非参照）:
  // 他の手札は「非降臨・非狂気カードのパワー集合」「降臨カードのシグネチャ集合」「狂気カードのシグネチャ集合」のみに依存
  if (hasInvoke && !hasSimpleDiscard) {
    const nonAdventPowers = [];
    const adventSigs = [];
    const madnessSigs = [];
    for (let k = 0; k < postHandSlice.length; k++) {
      if (k === playedIdx) continue;
      const c = postHandSlice[k];
      if (!c) continue;
      if (c.id === 'token_void' || c.baseId === 'token_void') continue;
      if (hasSkill(c, 'madness')) {
        madnessSigs.push(getCardSignature(c));
      } else if (getAdventRequirement(c) !== null) {
        adventSigs.push(`${getCardCurrentPower(c)}:${getCardSignature(c)}`);
      } else {
        nonAdventPowers.push(getCardCurrentPower(c));
      }
    }
    nonAdventPowers.sort((a, b) => b - a);
    adventSigs.sort();
    madnessSigs.sort();
    return `INV:${nonAdventPowers.join(',')}|A:${adventSigs.join(',')}|M:${madnessSigs.join(',')}`;
  }

  // フォールバック: 安全側で全残存手札シグネチャを厳密比較
  return postHandSlice
    .filter((c, idx) => c && idx !== playedIdx)
    .map(getCardSignature)
    .sort()
    .join(',');
}

/**
 * 戦闘フェーズ直前の状態（simState）から、advanceCombatPhase および evaluateSimState の結果を
 * 決定論的に一意特定するキャッシュキーを生成する。
 * 乱数依存・手札/山札参照を伴う盤面パッシブ（reflect / samsara / extort / teleport）が存在する場合は
 * 誤キャッシュを完全に防ぐため null を返す。
 *
 * @param {object} state - 戦闘フェーズ実行直前のシミュレーション状態
 * @returns {string|null} キャッシュキー文字列（キャッシュ対象外時は null）
 */
function buildPreCombatStateKey(state) {
  const nonDeterministicOrZoneSkills = [
    'reflect',
    'samsara',
    'extort',
    'teleport',
  ];
  for (let i = 0; i < 3; i++) {
    const ec = state.enemyBoard[i];
    const pc = state.playerBoard[i];
    if (ec && nonDeterministicOrZoneSkills.some((skId) => hasSkill(ec, skId))) {
      return null;
    }
    if (pc && nonDeterministicOrZoneSkills.some((skId) => hasSkill(pc, skId))) {
      return null;
    }
  }
  const eb = state.enemyBoard.map(serializeBoardCardKey).join('||');
  const pb = state.playerBoard.map(serializeBoardCardKey).join('||');
  return [
    eb,
    pb,
    state.enemyHP,
    state.playerHP,
    state.initialEnemyHP,
    state.initialPlayerHP,
    state.enemyMaxHP,
    state.playerMaxHP,
    state.enemySP,
    state.playerSP,
    state.valkyriaGuardRed || 0,
    state.valkyriaGuardBlue || 0,
    state.extraTurnCount || 0,
    state.attackSkipCount || 0,
    state.combatDamageTaken || 0,
    state.phaseBypassDamageTaken || 0,
    state.actionUtilityBonus || 0,
    (state.enemySealedLanes || [0, 0, 0]).join(','),
    (state.playerSealedLanes || [0, 0, 0]).join(','),
    state.turnCount || 0,
    state.firstPlayer || '',
  ].join('#');
}

/**
 * canCardBeDestroyed が参照する加護カウンターのみを持つ軽量ステートオブジェクトを生成します。
 * @return {Object} { valkyriaGuardBlue: number, valkyriaGuardRed: number }
 */
function createGuardProjectedState() {
  return {
    valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
    valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
  };
}

// リーダースキルが特定のレーンにトークン・カードを配置するかを判定するヘルパー
/**
 * 指定されたレーンがリーダースキルによって先に埋められるかを判定するヘルパー関数。
 * 手札カードの「生贄（takeover）」条件判定等で使用される。
 *
 * @param {number} lane - 判定するレーン番号 (0〜2)
 * @param {object|null} context - リーダースキルのシミュレーションコンテキスト
 * @return {boolean} リーダースキルにより対象レーンへカード・トークンが出る場合は true
 */
function isLaneOccupiedByLeaderSkill(lane, context) {
  if (!context || !context.tokenLanes) return false;
  const action = context.action;

  if (
    [
      'holy_march',
      'evil_march',
      'death_target',
      'satan_avatar',
      'dragon_summon',
      'dragon_high_ritual',
      'devilhunter_resurrect',
      'daemon_call',
      'dungeon_summon_leader',
      'warlock_place_daemons',
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

/**
 * リーダースキルで召喚・配置されるカードが「伝説（legendary）」を持つかを判定するヘルパー関数。
 * 手札カードの「頂点（apex）」条件判定等で使用される。
 *
 * @param {number} lane - 判定するレーン番号 (0〜2)
 * @param {object|null} context - リーダースキルのシミュレーションコンテキスト
 * @return {boolean} 対象レーンへ伝説カードが出る場合は true
 */
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
    ((action === 'devilhunter_resurrect' || action === 'daemon_call') &&
      context.tokenLanes.includes(lane)) ||
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
 * @return {Array<number[]>} ユニーク化された選択インデックス配列のリスト
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
 * 手札・墓地・山札カードの同一性を判定するためのシグネチャ（文字列）を生成する。
 * 同名（baseId）・同ステータス（元パワー/現在パワー）・同スキル構成の完全同一カードを
 * 重複探索しないために使用する。
 *
 * @param {object|null|undefined} card - カードオブジェクト
 * @return {string} カードシグネチャ文字列
 */
export function getCardSignature(card) {
  if (!card) return 'null';
  const skillsStr = Array.isArray(card.skills)
    ? card.skills
        .map(
          (s) =>
            `${s.id}_${s.value || 0}_${s.choiceGroup || ''}_${s.summonId || ''}`
        )
        .join(',')
    : '';
  const cardId = card.baseId || card.id || '';
  const basePow = card.power ?? card.basePower ?? 0;
  const curPow = card.currentPower ?? basePow;
  return `${cardId}_${basePow}_${curPow}_${skillsStr}`;
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
 * 発動元カード自身がそのレーンの盤面上に残っていないと成立しない（自身のパワー・状態・変身・単体戦闘のみを対象とする）
 * 純粋な自己対象オンプレイスキル群。
 * ※ 鼓舞(inspire)・召喚(summon)・召集(assemble)・鍛造(forge)・招来(invoke)等の他者/ゾーン対象スキルやパッシブ覚醒は含めない。
 */
const SELF_REQUIRING_PENDING_SIM_SKILLS = new Set([
  'quick',
  'buff',
  'buff_void',
  'double_power',
  'decay',
  'hero',
  'adversity',
  'lone_wolf',
  'portent',
  'invade',
  'replicate',
  'standby',
  'stealth',
  'invincible',
  'unleash',
  'metamorph',
]);

/**
 * カードに保留されていた後続の即時アクティブスキル群を解決する。
 * 発動元カードが自己破棄・上書き等で既に盤面から離れている場合は、同じレーンの別カードへの自己対象スキル誤適用を防ぎつつ、
 * 実戦（resolveOnPlaySkill）と同様に盤面不在でも有効なスキル（砲撃・狙撃・拡散・狂乱・回復・覇道の非自己対象サブスキル等）を解決する。
 *
 * @param {Object} simState - シミュレーション状態オブジェクト
 * @param {Object|null} card - 保留スキルを持つ発動元カードオブジェクト
 * @param {number} lane - カードが配置されていたレーンインデックス
 * @return {void}
 */
function flushPendingSimSkills(simState, card, lane) {
  if (!card || !Array.isArray(card._pendingSimSkills)) return;
  if (card._pendingSimSkills.length === 0) return;
  const isStillOnLane = simState.enemyBoard[lane] === card;
  for (const pendingSk of card._pendingSimSkills) {
    if (pendingSk.id === 'supremacy' && !isStillOnLane) {
      // 発動元が盤面を離れている場合の「覇道」：退避した親カードの定義からサブスキルを展開し、非自己対象サブスキルのみ解決する
      const hasOriginal6Plus = simState.enemyBoard.some((tc, laneIdx) => {
        if (!tc || laneIdx === lane) return false;
        const master = CARD_MASTER.find((m) => m.id === (tc.baseId || tc.id));
        const origPower = master?.power ?? tc.power ?? 0;
        return origPower >= SUPREMACY_REQUIRED_BASE_POWER;
      });
      if (hasOriginal6Plus) {
        const supSkills = resolveCardSupremacySkills(card);
        if (Array.isArray(supSkills)) {
          for (const subSk of supSkills) {
            if (SELF_REQUIRING_PENDING_SIM_SKILLS.has(subSk.id)) {
              continue;
            }
            applyActiveSkillLogic(
              simState,
              'red',
              lane,
              subSk.id,
              subSk.value,
              [],
              pendingSk.targetLanes ? [...pendingSk.targetLanes] : null,
              undefined
            );
          }
        }
      }
      continue;
    }

    if (!isStillOnLane && SELF_REQUIRING_PENDING_SIM_SKILLS.has(pendingSk.id)) {
      continue;
    }
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

/**
 * AI用の行動キューをシミュレーション実行し、戦闘フェーズ完了後のシミュレーション状態を返す。
 * 通常プレイ、召集、鍛造、アドホック召喚、トークン配置、リーダースキル発動等の連鎖アクションを一括処理する。
 *
 * @param {Array<object>} actionQueue - 実行する行動キュー（{ type, targetIdx, laneIdx, ... } の配列）
 * @param {boolean} [isLeaderSkillPlay=false] - リーダースキルを使用する場合は true
 * @param {string|null} [leaderSkillActionStr=null] - リーダースキルの action ID
 * @param {Array<number>|null} [leaderSkillTokenLanes=null] - リーダースキル配置用の対象レーン配列
 * @param {'before'|'after'} [skillOrderTiming='before'] - スキル発動タイミング
 * @param {number|null} [leaderSkillTargetIdx=null] - リーダースキル対象味方カードインデックス
 * @param {string|null} [leaderSkillTargetUid=null] - リーダースキル対象カードUID
 * @param {object|null} [initialSimState=null] - 開始時のシミュレーション状態（省略時はGameStateから構築）
 * @param {number|null} [leaderSkillResurrectLane=null] - 復活・使役等の配置先レーン
 * @param {number|null} [leaderSkillOppTargetIdx=null] - リーダースキル対象相手カードインデックス
 * @param {Array<object>|null} [leaderCardSkillActions=null] - リーダーカードスキルの追加アクションリスト
 * @param {boolean} [skipCombatPhase=false] - 戦闘フェーズ実行前の状態を取得する場合は true（リーダースキル先出し後盤面計算用）
 * @returns {object|null} 解決後のシミュレーション状態オブジェクト。無効な行動が含まれる場合は null
 */
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
  leaderCardSkillActions = null,
  skipCombatPhase = false
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
            createSimConfigSnapshot(GameState.playerConfig),
          enemyConfig:
            initialSimState.enemyConfig ??
            createSimConfigSnapshot(GameState.enemyConfig),
        }
      : null;
    if (!simState) {
      simState = {
        playerBoard: GameState.playerBoard.map(cloneCard),
        enemyBoard: GameState.enemyBoard.map(cloneCard),
        playerDiscard: GameState.playerDiscard
          ? [...GameState.playerDiscard]
          : [],
        enemyDiscard: GameState.enemyDiscard ? [...GameState.enemyDiscard] : [],
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
        playerHand: GameState.playerHand ? [...GameState.playerHand] : [],
        enemyHand: GameState.enemyHand
          ? GameState.enemyHand.map(cloneCard)
          : [],
        playerDeck: GameState.playerDeck ? [...GameState.playerDeck] : [],
        enemyDeck: GameState.enemyDeck ? [...GameState.enemyDeck] : [],
        playerConfig: createSimConfigSnapshot(GameState.playerConfig),
        enemyConfig: createSimConfigSnapshot(GameState.enemyConfig),
        valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
        valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
        turnCount: GameState.turnCount || 0,
        firstPlayer: GameState.firstPlayer,
        extraTurnCount: GameState.extraTurnCount || 0,
        attackSkipCount: GameState.attackSkipCount || 0,
        combatDamageTaken: 0,
        phaseBypassDamageTaken: 0,
        lastCardPlayed: null,
        lastPlayedLane: -1,
        _actionQueue: [],
      };
    }

    const preserveResolving = Boolean(simState._preserveResolvingOnStart);
    const skipPendingFlush = Boolean(simState._skipPendingFlush);
    if (preserveResolving) delete simState._preserveResolvingOnStart;
    if (skipPendingFlush) delete simState._skipPendingFlush;

    if (!preserveResolving) {
      [simState.playerBoard, simState.enemyBoard].forEach((b) => {
        b.forEach((c) => {
          if (c) {
            if (c.currentPower === undefined || c.currentPower === null) {
              c.currentPower = c.power || 0;
            }
            // 元々パワー0でスキル解決保護中（未被弾）のカード・トークンは、アドホック評価中の後続スキル（処刑等）の
            // 対象になり得るため保護を維持する（戦闘フェーズ直前の advanceCombatPhase で確実に解除・除去される）
            if (!isProtectedZeroPowerCard(c)) {
              c.isSkillResolving = false;
            }
          }
        });
      });
    }

    if (
      isLeaderSkillPlay &&
      skillOrderTiming === 'before' &&
      leaderSkillActionStr
    ) {
      simState.enemySP -= GameState.enemyConfig.leaderSkill.cost;
      if (leaderSkillActionStr === 'daemon_call') {
        simState._deferDaemonCallOnPlay = true;
      }
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
      delete simState._deferDaemonCallOnPlay;
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

      // リーダー召喚カードの非分岐系スキル（call, heal, snipe等）を手札カードと同じ処理でシミュレート
      if (
        (leaderSkillActionStr === 'dungeon_summon_leader' ||
          leaderSkillActionStr === 'daemon_call') &&
        leaderSkillTokenLanes &&
        leaderSkillTokenLanes.length > 0
      ) {
        const leaderLane = leaderSkillTokenLanes[0];
        const boardCard = simState.enemyBoard[leaderLane];
        if (boardCard && !boardCard.skillTriggered) {
          const lCardConfig = GameState.enemyConfig;
          const lCardMaster =
            leaderSkillActionStr === 'daemon_call'
              ? boardCard
              : lCardConfig?.leaderCardId
                ? CARD_MASTER.find((m) => m.id === lCardConfig.leaderCardId)
                : null;
          if (lCardMaster && lCardMaster.skills) {
            let effectiveLeaderSkills = [...lCardMaster.skills];
            if (leaderCardSkillActions && leaderCardSkillActions.length > 0) {
              const choiceAct = leaderCardSkillActions.find(
                (a) => a.type === 'choice' || a.type === 'force'
              );
              if (choiceAct) {
                if (
                  Array.isArray(choiceAct.choices) &&
                  Array.isArray(lCardMaster.choices)
                ) {
                  choiceAct.choices.forEach((cIdx) => {
                    if (lCardMaster.choices[cIdx]) {
                      effectiveLeaderSkills.push(lCardMaster.choices[cIdx]);
                    }
                  });
                }
                if (
                  Array.isArray(choiceAct.choices2) &&
                  Array.isArray(lCardMaster.choices2)
                ) {
                  choiceAct.choices2.forEach((cIdx) => {
                    if (lCardMaster.choices2[cIdx]) {
                      effectiveLeaderSkills.push(lCardMaster.choices2[cIdx]);
                    }
                  });
                }
              }
            }
            effectiveLeaderSkills.forEach((sk) => {
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
                  'assemble',
                  'ambush',
                  'clone',
                  'puppet',
                  'forge',
                  'execute',
                  'convert',
                  'draw',
                  'reinforce',
                  'leap',
                  'invoke',
                  'inspire',
                  'protection',
                  'dominate',
                  'awake',
                  'awake_legendary',
                  'split',
                  'choice',
                  'force',
                ].includes(sk.id)
              )
                return;
              // 号令・召集: デッキに対象カードが存在する場合のみパワーボーナスで近似
              // （※ 先行1ターン目は他のレーンにカードを出せないためボーナス加算不可）
              if (sk.id === 'call' || sk.id === 'assemble') {
                if (!isFirstTurnRestricted('red', simState)) {
                  const selfId = boardCard
                    ? boardCard.baseId || boardCard.id
                    : null;
                  const isExcludeBoard = Boolean(sk.excludeBoard);
                  const { presentBoardCards, presentBoardIds } =
                    collectPresentBoardTargets(
                      simState.enemyBoard,
                      isExcludeBoard
                    );
                  if (
                    hasValidTargetInDeck(sk, simState.enemyDeck, {
                      selfId,
                      presentBoardIds,
                      presentBoardCards,
                    })
                  ) {
                    const callBonus = estimateCallAssembleBonus(sk);
                    boardCard.currentPower =
                      (boardCard.currentPower || 0) + callBonus;
                    boardCard.basePower =
                      (boardCard.basePower || 0) + callBonus;
                  }
                }
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
            // リーダー召喚カードのオンプレイ即時スキル（拡散・狂乱・狙撃等）でパワー0以下となったカードを破壊済みとして除去する
            for (let i = 0; i < 3; i++) {
              if (
                simState.playerBoard[i] &&
                simState.playerBoard[i].currentPower <= 0 &&
                !simState.playerBoard[i].isSkillResolving
              ) {
                simState.playerBoard[i] = null;
              }
              if (
                simState.enemyBoard[i] &&
                simState.enemyBoard[i].currentPower <= 0 &&
                !simState.enemyBoard[i].isSkillResolving
              ) {
                simState.enemyBoard[i] = null;
              }
            }
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
        action.type === 'forge' ||
        action.type === 'summon' ||
        action.type === 'assemble'
      ) {
        for (let i = 0; i < 3; i++) {
          const c = simState.enemyBoard[i];
          if (c && c.isSkillResolving) {
            if (
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
        const tgtLanes = Array.isArray(action.targetLanes)
          ? action.targetLanes
          : action.targetLane !== undefined
            ? [action.targetLane]
            : [];
        const selectedTargets = tgtLanes.map((l) => ({
          lane: l,
          card: simState.enemyBoard[l],
        }));

        for (const { lane: tgtLane, card: expectedCard } of selectedTargets) {
          if (
            tgtLane !== undefined &&
            simState.enemyBoard[tgtLane] !== null &&
            simState.enemyBoard[tgtLane] === expectedCard
          ) {
            const execCard = simState.enemyBoard[tgtLane];
            if (canCardBeDestroyed(simState, execCard, 'red')) {
              // 分裂(split): 本体・付属物を墓地へ送り、非封印レーンであれば分裂トークンを配置する
              if (hasSkill(execCard, 'split')) {
                quietDiscardFromBoard(simState, 'red', tgtLane);
                if (
                  !simState.enemySealedLanes ||
                  simState.enemySealedLanes[tgtLane] === 0
                ) {
                  simState.enemyBoard[tgtLane] = createSplitSimToken(
                    execCard,
                    tgtLane,
                    'red'
                  );
                }
              } else {
                quietDiscardFromBoard(simState, 'red', tgtLane);
              }

              // 誘爆(explode): 隣接カードにダメージを与え破壊トリガーを処理
              if (hasSkill(execCard, 'explode')) {
                const dmg = getSkillValue(execCard, 'explode') || 3;
                [tgtLane - 1, tgtLane + 1].forEach((adj) => {
                  if (adj >= 0 && adj < 3 && simState.enemyBoard[adj]) {
                    damageCard(simState, 'red', adj, dmg, 'explode', [], true);
                  }
                });
                processDestructionTriggers(simState, []);
              }

              // 報復(retaliate): 自陣生存カードのパワー上昇
              const isReversedRetaliate = isReverseActive(simState);
              simState.enemyBoard.forEach((allyCard) => {
                if (allyCard && hasSkill(allyCard, 'retaliate')) {
                  let buffVal = getSkillValue(allyCard, 'retaliate') || 2;
                  if (isReversedRetaliate) buffVal = -buffVal;
                  allyCard.currentPower += buffVal;
                }
              });
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
        action.type === 'forge' ||
        action.type === 'play_adhoc' ||
        action.type === 'summon' ||
        action.type === 'assemble' ||
        action.type === 'invoke'
      ) {
        let resolvedInvokeDeckIdx = -1;
        let resolvedInvokeHandIdx = -1;

        if (action.type === 'invoke') {
          const sacBoardLanes = Array.isArray(action.boardSacrificeLanes)
            ? action.boardSacrificeLanes
            : [];
          const sacHandIndices = Array.isArray(action.handSacrificeIndices)
            ? action.handSacrificeIndices
            : [];

          // 0. 破棄ループで盤面から外れる前に「招来」発動元カードの参照とレーンを退避し、保留スキル解決用に保持する
          if (
            Number.isInteger(action.sourceLane) &&
            action.sourceLane >= 0 &&
            action.sourceLane < 3
          ) {
            const explicitSrc = simState.enemyBoard[action.sourceLane];
            if (
              explicitSrc &&
              (!action.sourceUid ||
                explicitSrc.uid === action.sourceUid ||
                explicitSrc.id === action.sourceUid)
            ) {
              parentCardOnLane[action.sourceLane] = explicitSrc;
            }
          }
          for (let i = 0; i < 3; i++) {
            const c = simState.enemyBoard[i];
            if (
              c &&
              c.isSkillResolving &&
              hasSkill(c, 'invoke') &&
              !parentCardOnLane[i]
            ) {
              parentCardOnLane[i] = c;
            }
          }

          // 降臨カードを召喚する計画（lIdx !== -1）の場合、カードを消費する前に
          // 先行スキル（狂乱・処刑＋誘爆等）適用後の現在パワー合計および破棄後レーン制約を再検証する
          if (lIdx !== -1) {
            if (action.summonZone === 'deck') {
              const targetDeck = simState.enemyDeck;
              const targetKey = action.targetUid;
              if (targetKey) {
                resolvedInvokeDeckIdx = targetDeck.findIndex(
                  (c) =>
                    c &&
                    (c.uid === targetKey ||
                      c.id === targetKey ||
                      c.baseId === targetKey)
                );
              }
              if (
                resolvedInvokeDeckIdx === -1 &&
                action.targetIdx !== undefined &&
                action.targetIdx >= 0 &&
                action.targetIdx < targetDeck.length
              ) {
                const cand = targetDeck[action.targetIdx];
                if (
                  cand &&
                  (!targetKey ||
                    cand.uid === targetKey ||
                    cand.id === targetKey ||
                    cand.baseId === targetKey)
                ) {
                  resolvedInvokeDeckIdx = action.targetIdx;
                }
              }
              if (
                resolvedInvokeDeckIdx === -1 ||
                !targetDeck[resolvedInvokeDeckIdx]
              ) {
                return null;
              }
            } else if (action.summonZone === 'hand') {
              if (
                tIdx !== undefined &&
                tIdx >= 0 &&
                tIdx < simState.enemyHand.length &&
                simState.enemyHand[tIdx]
              ) {
                resolvedInvokeHandIdx = tIdx;
              } else if (action.targetUid) {
                resolvedInvokeHandIdx = simState.enemyHand.findIndex(
                  (c) =>
                    c &&
                    (c.uid === action.targetUid ||
                      c.id === action.targetUid ||
                      c.baseId === action.targetUid)
                );
              }
              if (
                resolvedInvokeHandIdx === -1 ||
                !simState.enemyHand[resolvedInvokeHandIdx] ||
                sacHandIndices.includes(resolvedInvokeHandIdx)
              ) {
                return null;
              }
            } else {
              return null;
            }

            let actualTotalPower = 0;
            for (const sacLane of new Set(sacBoardLanes)) {
              const bCard = simState.enemyBoard[sacLane];
              if (bCard) {
                actualTotalPower += getCardCurrentPower(bCard);
              }
            }
            for (const hIdx of new Set(sacHandIndices)) {
              const hCard = simState.enemyHand[hIdx];
              if (hCard) {
                actualTotalPower += getCardCurrentPower(hCard);
              }
            }

            const rawTarget =
              action.summonZone === 'deck'
                ? simState.enemyDeck[resolvedInvokeDeckIdx]
                : simState.enemyHand[resolvedInvokeHandIdx];
            if (!matchesInvokeTarget(rawTarget, actualTotalPower)) {
              return null;
            }

            const checkCardObj =
              action.summonZone === 'deck'
                ? getCardMasterById(rawTarget.baseId || rawTarget.id) ||
                  rawTarget
                : rawTarget;

            const postSacCheckBoard = simState.enemyBoard.map((c, idx) => {
              if (!c || sacBoardLanes.includes(idx)) return null;
              if (
                c.isSkillResolving &&
                hasSkill(c, 'invoke') &&
                c.currentPower <= 0
              ) {
                return null;
              }
              return c;
            });

            if (isFirstTurnRestricted('red', simState) && lIdx !== 1) {
              return null;
            }
            if (hasSkill(checkCardObj, 'legendary') && lIdx !== 1) {
              return null;
            }
            if (
              hasSkill(checkCardObj, 'challenge') &&
              simState.playerBoard[lIdx] === null
            ) {
              return null;
            }
            if (
              hasSkill(checkCardObj, 'takeover') &&
              postSacCheckBoard[lIdx] === null
            ) {
              return null;
            }
            if (
              hasSkill(checkCardObj, 'apex') &&
              (!postSacCheckBoard[lIdx] ||
                !hasSkill(postSacCheckBoard[lIdx], 'legendary'))
            ) {
              return null;
            }
          }

          // 1. 選択された自陣盤面のカードを破棄（自身のカードも含み得る）
          for (const sacLane of sacBoardLanes) {
            const bCard = simState.enemyBoard[sacLane];
            if (bCard) {
              bCard.isSkillResolving = false;
              if (!bCard.isToken) {
                simState.enemyDiscard.push(cloneCard(bCard));
              }
              simState.enemyBoard[sacLane] = null;
            }
          }

          // 2. 選択された手札のカードを破棄し、同数の「虚空」トークンを手札に追加
          const voidTpl = getCardMasterById('token_void') || {
            name: '虚空',
            power: 0,
          };
          let voidAddCount = 0;
          for (const hIdx of sacHandIndices) {
            const hCard = simState.enemyHand[hIdx];
            if (hCard) {
              if (!hCard.isToken) {
                simState.enemyDiscard.push(cloneCard(hCard));
              }
              simState.enemyHand[hIdx] = null;
              voidAddCount++;
            }
          }
          for (let v = 0; v < voidAddCount; v++) {
            simState.enemyHand.push({
              ...cloneCard(voidTpl),
              isToken: true,
              baseId: 'token_void',
            });
          }

          // 3. 盤面に残っている親カード（招来発動元）の解決中保護フラグを解除し、パワー0以下なら墓地送り
          for (let i = 0; i < 3; i++) {
            const c = simState.enemyBoard[i];
            if (c && c.isSkillResolving && hasSkill(c, 'invoke')) {
              parentCardOnLane[i] = c;
              c.isSkillResolving = false;
              if (c.currentPower <= 0) {
                if (!c.isToken) {
                  simState.enemyDiscard.push(cloneCard(c));
                }
                simState.enemyBoard[i] = null;
              }
            }
          }
        }

        // laneIdx=-1 は「このスキルをスキップ」のセンチネル値（forge/summon/assemble/invoke/play_adhoc用）
        // 実行時と同様に手札・デッキを消費せずスキップする
        if (
          lIdx === -1 &&
          (action.type === 'forge' ||
            action.type === 'summon' ||
            action.type === 'assemble' ||
            action.type === 'invoke' ||
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
        } else if (
          action.type === 'assemble' ||
          (action.type === 'invoke' && action.summonZone === 'deck')
        ) {
          // デッキからカードを取得・消費（存在しない場合は不発としてスキップ）
          // processActionSequence はAI（red）専用の思考シミュレーションのため enemyDeck を直接参照
          const targetDeck = simState.enemyDeck;
          let dIdx = action.type === 'invoke' ? resolvedInvokeDeckIdx : -1;
          const targetKey = action.targetUid;

          if (dIdx === -1 && targetKey) {
            dIdx = targetDeck.findIndex(
              (c) =>
                c &&
                (c.uid === targetKey ||
                  c.id === targetKey ||
                  c.baseId === targetKey)
            );
          }
          // targetIdx のフォールバックは、対象カードと同一IDの場合のみ許可（spliceによるずれ・別カードの誤取得を防止）
          if (
            dIdx === -1 &&
            action.targetIdx !== undefined &&
            action.targetIdx >= 0 &&
            action.targetIdx < targetDeck.length
          ) {
            const cand = targetDeck[action.targetIdx];
            if (
              cand &&
              (!targetKey ||
                cand.uid === targetKey ||
                cand.id === targetKey ||
                cand.baseId === targetKey)
            ) {
              dIdx = action.targetIdx;
            }
          }

          if (dIdx === -1 || !targetDeck[dIdx]) {
            // デッキに対象カードが存在しない場合は召集・招来不発
            for (let i = 0; i < 3; i++) {
              flushPendingSimSkills(simState, parentCardOnLane[i], i);
            }
            continue;
          }

          const rawDeckCard = targetDeck[dIdx];
          const masterData = getCardMasterById(
            rawDeckCard.baseId || rawDeckCard.id
          );
          playedCard = masterData
            ? cloneCard(masterData)
            : cloneCard(rawDeckCard);
          playedCard.uid = rawDeckCard.uid || rawDeckCard.id;
          playedCard.baseId = rawDeckCard.baseId || rawDeckCard.id;
          playedCard.basePower = playedCard.power;
          playedCard.currentPower = playedCard.power;
          targetDeck.splice(dIdx, 1);
          checkConstraints = true;
        } else if (action.type === 'invoke' && action.summonZone === 'hand') {
          // 「招来」で手札の降臨カードを召喚する場合（事前検証済みインデックスを利用）
          const hIdx = resolvedInvokeHandIdx;
          if (hIdx === -1 || !simState.enemyHand[hIdx]) {
            for (let i = 0; i < 3; i++) {
              flushPendingSimSkills(simState, parentCardOnLane[i], i);
            }
            continue;
          }
          playedCard = cloneCard(simState.enemyHand[hIdx]);
          simState.enemyHand[hIdx] = null;
          // 手札から「降臨」カードを召喚して減った1枚分の「虚空」トークンを手札に補填する
          const voidTpl = getCardMasterById('token_void') || {
            name: '虚空',
            power: 0,
          };
          simState.enemyHand.push({
            ...cloneCard(voidTpl),
            isToken: true,
            baseId: 'token_void',
          });
          checkConstraints = true;
        } else {
          // play, forge, summon は手札から
          playedCard = cloneCard(simState.enemyHand[tIdx]);
          if (action.type === 'forge') {
            const voidTpl = getCardMasterById('token_void') || {
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
          let tokenPower = action.skillValue ?? 1;
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
          const baseMaster = getCardMasterById(tokenId);
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
              // 親カードの召喚時スキル解決完了（advanceCombatPhase）までパワー0トークンを保護する
              isSkillResolving: action.skillId !== 'ambush',
            };
            // 【起動(startup)】起動カードの上にトークンを配置する場合の特別処理
            // トークンは墓地に送られ、起動カードからstartupとdefenderが除去されて盤面に残る
            const existingCard = targetBoard[tLane];
            if (existingCard && hasSkill(existingCard, 'startup')) {
              consumeStartupSkill(existingCard);
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
        if (action.type === 'play' && hasSkill(playedCard, 'advent'))
          return null;
        if (
          hasSkill(playedCard, 'challenge') &&
          simState.playerBoard[lIdx] === null
        )
          return null;
        const allowParentAsBase = action.type !== 'invoke';
        if (hasSkill(playedCard, 'takeover')) {
          const hasExisting =
            simState.enemyBoard[lIdx] !== null ||
            (allowParentAsBase && parentCardOnLane[lIdx] !== null);
          if (!hasExisting) return null;
        }
        if (hasSkill(playedCard, 'legendary') && lIdx !== 1) return null;
        if (hasSkill(playedCard, 'apex')) {
          const targetCard =
            simState.enemyBoard[lIdx] ||
            (allowParentAsBase ? parentCardOnLane[lIdx] : null);
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
        consumeStartupSkill(existingCard);
        simState.enemyDiscard.push(playedCard);
        simState._abortedByStartup = true;
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

        // 出現時スキルを持つ場合、または後続の待機スキル解決が控えている配置（play_adhoc）の場合は保護フラグを立てる
        if (
          hasActiveSkill(activeCardForSkills) ||
          action.keepResolvingForPending
        ) {
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
          // カードが連鎖スキル（forge/summon）を持つ場合、
          // 除外リスト外の即時スキル（quick/snipe等）は連鎖完了後に発動する必要がある。
          // （例: forge→装備合体→quickの順で処理しないと、装備前のパワーで速攻が発動してしまう）
          // battle.js の resolveOnPlaySkill と同じ実行順序を再現するため、
          // 連鎖スキルを持つカードでは即時スキルを _pendingSimSkills に保留し、
          // アクションキュー上で連鎖子アクションが処理される際に発動させる。
          const hasChainSkill = hasChainSummonSkill(activeCardForSkills);

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
            if (sk.id === 'call') {
              // 号令（call）: デッキに対象カードが存在する場合のみパワーボーナスを仮加算
              // （※ 先行1ターン目は他のレーンにカードを出せないためボーナス加算不可）
              // （※ assemble は buildSkillBranch で子アクションとして展開されるため親カードには加算しない）
              if (!isFirstTurnRestricted('red', simState)) {
                const boardCard = simState.enemyBoard[lIdx];
                const selfId = boardCard
                  ? boardCard.baseId || boardCard.id
                  : null;
                const isExcludeBoard = Boolean(sk.excludeBoard);
                const { presentBoardCards, presentBoardIds } =
                  collectPresentBoardTargets(
                    simState.enemyBoard,
                    isExcludeBoard
                  );
                if (
                  boardCard &&
                  hasValidTargetInDeck(sk, simState.enemyDeck, {
                    selfId,
                    presentBoardIds,
                    presentBoardCards,
                  })
                ) {
                  const callBonus = estimateCallAssembleBonus(sk);
                  boardCard.currentPower =
                    (boardCard.currentPower || 0) + callBonus;
                  boardCard.basePower = (boardCard.basePower || 0) + callBonus;
                }
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
                'convert',
                'draw',
                'salvage',
                'reinforce',
                'puppet',
                'servant',
                'summon',
                'assemble',
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
                'invoke',
              ].includes(sk.id)
            ) {
              // 連鎖スキルを持つカードの場合は即時スキルを保留する（ただし先に発動する「代償」は即時適用）
              if (hasChainSkill && sk.id !== 'sacrifice') {
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
          if (simState.enemyHP <= 0 || simState.playerHP <= 0) {
            return simState;
          }
          activeCardForSkills.skillTriggered = true;
          if (simState._actionQueue && simState._actionQueue.length > 0) {
            actionQueue.push(...simState._actionQueue);
            delete simState._actionQueue;
          }
        }

        // スキル解決が終わったため、保護フラグを解除する
        // 【召喚・召集・鍛造・招来】および後続アクションキューで解決されるスキル（使役・処刑等）、
        // または親カードの後続待機スキルが続く play_adhoc の場合は保護フラグ（isSkillResolving）を維持する
        if (activeCardForSkills) {
          const keepProtected =
            hasChainSummonSkill(activeCardForSkills) ||
            hasDeferredChildActionSkill(activeCardForSkills) ||
            Boolean(action.keepResolvingForPending);
          if (!keepProtected) {
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

        // 【奇襲（ambush）】play_adhocで配置されたカードが奇襲を持つ場合、または奇襲トークンとして配置された場合、ただちに単体戦闘と破壊トリガーをシミュレート
        if (
          action.type === 'play_adhoc' &&
          (action.isAmbush || hasSkill(playedCard, 'ambush')) &&
          simState.enemyBoard[lIdx]
        ) {
          simState.enemyBoard[lIdx].isSkillResolving = false;
          applySingleCombat(simState, 'red', lIdx, []);
          processDestructionTriggers(simState, []);
        }
      }

      // 【連鎖スキル完了後の保留スキル発動】
      // 連鎖スキル（forge/summon/assemble）の子アクション処理（装備合体や追加カード配置）が完了した後に、
      // 親カードに保留されていた即時スキル（quick/snipe等）を発動する。
      // これにより装備合体完了後の強化ステータスで速攻や砲撃が正しく実行される。
      if (
        action.type === 'summon' ||
        action.type === 'assemble' ||
        action.type === 'forge' ||
        action.type === 'invoke'
      ) {
        for (let i = 0; i < 3; i++) {
          flushPendingSimSkills(simState, parentCardOnLane[i], i);
        }
      }
    }

    // 【保留スキルの最終回収】
    // 連鎖スキル（forge/summon）の子アクションがアクションキューに
    // 生成されなかった場合でも、保留された即時スキルを必ず発動させる。
    // （先頭playプレフィックスの途中状態保存時は後続子アクション解決後にフラッシュするため抑止）
    if (!skipPendingFlush) {
      for (let i = 0; i < 3; i++) {
        flushPendingSimSkills(simState, simState.enemyBoard[i], i);
      }
    }

    if (skipCombatPhase) {
      return simState;
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
 * @return {number} 候補手が消費する総アクション数（手数）
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
  // 召喚時スキル（召喚・召集）および配置スキル（復活・傀儡等）に伴う後続アクション
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
 * @return {{ index: number, lane: number, useSkill: boolean, isOverwrite?: boolean, actionQueue?: Array<Object>, leaderCardSkillActions?: Array<Object>, score?: number }} 選択したAI行動候補
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
    usedDeck = [],
    stateOverride = null
  ) {
    if (depth >= 4) return [[]];

    const localMyBoard = stateOverride?.myBoard || myBoard;
    const localOpBoard = stateOverride?.opBoard || opBoard;
    const localMySealedLanes = stateOverride?.mySealedLanes || mySealedLanes;
    const localDeck = stateOverride?.deck || GameState.enemyDeck || [];
    const localOpDiscard =
      stateOverride?.opDiscard || GameState.playerDiscard || [];

    let availableLanes = [0, 1, 2].filter((l) => localMySealedLanes[l] === 0);

    if (forcedLane !== undefined) {
      if (localMySealedLanes[forcedLane] > 0) return [[]];
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
      sourceType === 'summon' ||
      sourceType === 'assemble' ||
      sourceType === 'invoke'
    ) {
      // 「降臨」を持つカードは通常の手札プレイ（sourceType === 'play'）では召喚不可
      if (sourceType === 'play' && hasSkill(card, 'advent')) {
        return [[]];
      }

      // 1ターン目の「召喚」アクションは中央のみ（親・子カード共通）
      if (GameState.turnCount === 1 && GameState.firstPlayer === 'red') {
        availableLanes = availableLanes.filter((l) => l === -1 || l === 1);
      }

      // 挑戦: 正面に相手カードがあるレーンのみ
      if (hasSkill(card, 'challenge')) {
        availableLanes = availableLanes.filter(
          (l) => l === -1 || localOpBoard[l] !== null
        );
      }
      // 伝説: 中央（レーン1）のみ
      if (hasSkill(card, 'legendary')) {
        availableLanes = availableLanes.filter((l) => l === -1 || l === 1);
      }
      // 生贄・頂点: summon/assemble/invoke時は親カード配置や破棄後の盤面がmyBoardに未反映のため、
      // プリフィルタをスキップしprocessActionSequenceの正確なsimStateチェックに委ねる
      if (
        sourceType !== 'summon' &&
        sourceType !== 'assemble' &&
        sourceType !== 'invoke'
      ) {
        // 生贄: 既にカードが置かれているレーン、またはリーダースキルで配置される予定のレーン
        if (hasSkill(card, 'takeover')) {
          availableLanes = availableLanes.filter((l) => {
            if (l === -1) return true;
            const hasExisting = localMyBoard[l] !== null;
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
              localMyBoard[l] && hasSkill(localMyBoard[l], 'legendary');
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
              (l) => localMySealedLanes[l] === 0 && l !== lane
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
            let occupied = localOpBoard
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
              'forge',
              'summon',
              'assemble',
              'invoke',
              'dungeon_summon_leader', // 【試練の宮殿】敵リーダースキルによるカード配置時のスキルシミュレーション用
              'daemon_call', // 【次元斬】山札からのリーダースキル召喚時のオンプレイスキルシミュレーション用
            ].includes(sourceType);
            if (isSummonAction) {
              // ※ awake（覚醒）はパッシブスキル（所有者のターン開始時発動）のため、ここには含めない
              if (Array.isArray(card.skills)) {
                card.skills.forEach((s) => {
                  // ※ awake（覚醒）はパッシブスキルのため除外
                  if (
                    [
                      'resurrect',
                      'convert',
                      'draw',
                      'reinforce',
                      'clone',
                      'servant',
                      'summon',
                      'assemble',
                      'invoke',
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
              currentUsedDeck = [],
              minTokenLane = 0,
              lastTokenSkillKey = null
            ) => {
              if (currentSkills.length === 0 || currentDepth >= 4) return [[]];

              const activeEnemyBoard = currentEnemyBoard || localMyBoard;
              const activePlayerBoard = currentPlayerBoard || localOpBoard;

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

              if (sk.id === 'summon') {
                const selfId = card ? card.baseId || card.id : null;
                const isExcludeBoard = Boolean(sk.excludeBoard);
                const { presentBoardCards, presentBoardIds } =
                  collectPresentBoardTargets(activeEnemyBoard, isExcludeBoard);
                const seenSummonHandSigs = new Set();

                for (let i = 0; i < originalHand.length; i++) {
                  if (currentUsedHand.includes(i)) continue;
                  let childCard = originalHand[i];
                  if (!childCard) continue;

                  // skillLogic.js の isValidSummonCard と同一の判定順序・論理（matchesSummonTarget）で評価
                  if (
                    !matchesSummonTarget(childCard, sk, {
                      selfId,
                      presentBoardIds,
                      presentBoardCards,
                    })
                  ) {
                    continue;
                  }
                  const summonSig = getCardSignature(childCard);
                  if (seenSummonHandSigs.has(summonSig)) continue;
                  seenSummonHandSigs.add(summonSig);

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
                    currentUsedDeck,
                    {
                      myBoard: activeEnemyBoard,
                      opBoard: activePlayerBoard,
                      mySealedLanes: localMySealedLanes,
                      deck: localDeck,
                      opDiscard: localOpDiscard,
                      initialDiscarded: currentDiscarded,
                    }
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
                const selfId = card ? card.baseId || card.id : null;
                const isExcludeBoard = Boolean(sk.excludeBoard);
                const { presentBoardCards, presentBoardIds } =
                  collectPresentBoardTargets(activeEnemyBoard, isExcludeBoard);

                const originalDeck = localDeck;
                const seenKeys = new Set();

                for (let i = 0; i < originalDeck.length; i++) {
                  if (currentUsedDeck.includes(i)) continue;
                  let childCard = originalDeck[i];
                  if (!childCard) continue;

                  const cardKey = childCard.baseId || childCard.id;
                  if (seenKeys.has(cardKey)) continue;

                  if (
                    !matchesAssembleTarget(childCard, sk, {
                      selfId,
                      presentBoardIds,
                      presentBoardCards,
                    })
                  ) {
                    continue;
                  }
                  seenKeys.add(cardKey);

                  const masterData = getCardMasterById(
                    childCard.baseId || childCard.id
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
                    [...currentUsedDeck, i],
                    {
                      myBoard: activeEnemyBoard,
                      opBoard: activePlayerBoard,
                      mySealedLanes: localMySealedLanes,
                      deck: localDeck,
                      opDiscard: localOpDiscard,
                      initialDiscarded: currentDiscarded,
                    }
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
              } else if (sk.id === 'invoke') {
                // 【招来（invoke）】手札・自陣カードの極小破棄サブセットを列挙し、
                // 合計パワー以下の「降臨」カードを手札または山札から全有効レーンへ召喚する分岐を展開する
                const originalDeck = localDeck;
                const subsets = buildInvokeSacrificeSubsets(
                  originalHand,
                  currentUsedHand,
                  activeEnemyBoard,
                  originalDeck,
                  currentUsedDeck
                );

                for (const sub of subsets) {
                  // 0枚破棄かつ降臨0対象がない場合は、既に先頭で自動追加されたスキップ分岐と重複するため除外
                  const nextUsedHandBase = [
                    ...currentUsedHand,
                    ...sub.handIndices,
                  ];
                  const postSacBoard = activeEnemyBoard.map((bCard, bIdx) =>
                    sub.boardLanes.includes(bIdx) ? null : bCard
                  );
                  // 実戦（skillLogic.js）および processActionSequence と同じ「盤面破棄 → 手札破棄」の順序で墓地へ積む
                  const newlyDiscarded = [...currentDiscarded];
                  for (const bLane of sub.boardLanes) {
                    const bc = activeEnemyBoard[bLane];
                    if (bc && !bc.isToken) newlyDiscarded.push(bc);
                  }
                  for (const hIdx of sub.handIndices) {
                    const hc = originalHand[hIdx];
                    if (hc && !hc.isToken) newlyDiscarded.push(hc);
                  }
                  const invokeChildStateOverride = {
                    myBoard: postSacBoard,
                    opBoard: activePlayerBoard,
                    mySealedLanes: localMySealedLanes,
                    deck: localDeck,
                    opDiscard: localOpDiscard,
                    initialDiscarded: newlyDiscarded,
                  };

                  // 1. 山札（デッキ）からの「降臨」召喚候補（スコアが同点以上の場合は山札を優先）
                  const seenDeckSigs = new Set();
                  for (let dIdx = 0; dIdx < originalDeck.length; dIdx++) {
                    if (currentUsedDeck.includes(dIdx)) continue;
                    const dCard = originalDeck[dIdx];
                    if (!matchesInvokeTarget(dCard, sub.totalPower)) continue;
                    const sig = getCardSignature(dCard);
                    if (seenDeckSigs.has(sig)) continue;
                    seenDeckSigs.add(sig);

                    const masterData = getCardMasterById(
                      dCard.baseId || dCard.id
                    );
                    const invokeDeckCard = masterData
                      ? cloneCard(masterData)
                      : cloneCard(dCard);
                    invokeDeckCard.uid = dCard.uid || dCard.id;
                    invokeDeckCard.baseId = dCard.baseId || dCard.id;
                    invokeDeckCard.basePower = invokeDeckCard.power;
                    invokeDeckCard.currentPower = invokeDeckCard.power;

                    const children = buildCardPlayTree(
                      invokeDeckCard,
                      dIdx,
                      'invoke',
                      originalHand,
                      originalDiscard,
                      nextUsedHandBase,
                      currentUsedDiscard,
                      currentDepth + 1,
                      undefined,
                      leaderSkillContext,
                      [...currentUsedDeck, dIdx],
                      invokeChildStateOverride
                    );
                    for (const cNode of children) {
                      if (!cNode || cNode.length === 0) continue;
                      const summonLane = cNode[0]?.laneIdx;
                      if (summonLane === -1) continue;
                      const enrichedRoot = {
                        ...cNode[0],
                        type: 'invoke',
                        handSacrificeIndices: [...sub.handIndices],
                        boardSacrificeLanes: [...sub.boardLanes],
                        summonZone: 'deck',
                        sourceLane: lane,
                        sourceUid: card?.uid || card?.id || null,
                      };
                      const nextEnemyBoard = [...postSacBoard];
                      if (summonLane >= 0 && summonLane < 3) {
                        nextEnemyBoard[summonLane] = invokeDeckCard;
                      }
                      const nextBranches = buildSkillBranch(
                        remainingSkills,
                        nextUsedHandBase,
                        currentUsedDiscard,
                        currentDepth,
                        newlyDiscarded,
                        nextEnemyBoard,
                        activePlayerBoard,
                        [...currentUsedDeck, dIdx]
                      );
                      for (const nb of nextBranches) {
                        results.push([enrichedRoot, ...cNode.slice(1), ...nb]);
                      }
                    }
                  }

                  // 2. 手札からの「降臨」召喚候補
                  const seenHandSigs = new Set();
                  for (let hIdx = 0; hIdx < originalHand.length; hIdx++) {
                    if (nextUsedHandBase.includes(hIdx)) continue;
                    const hCard = originalHand[hIdx];
                    if (!matchesInvokeTarget(hCard, sub.totalPower)) continue;
                    const sig = getCardSignature(hCard);
                    if (seenHandSigs.has(sig)) continue;
                    seenHandSigs.add(sig);

                    const children = buildCardPlayTree(
                      hCard,
                      hIdx,
                      'invoke',
                      originalHand,
                      originalDiscard,
                      [...nextUsedHandBase, hIdx],
                      currentUsedDiscard,
                      currentDepth + 1,
                      undefined,
                      leaderSkillContext,
                      currentUsedDeck,
                      invokeChildStateOverride
                    );
                    for (const cNode of children) {
                      if (!cNode || cNode.length === 0) continue;
                      const summonLane = cNode[0]?.laneIdx;
                      if (summonLane === -1) continue;
                      const enrichedRoot = {
                        ...cNode[0],
                        type: 'invoke',
                        handSacrificeIndices: [...sub.handIndices],
                        boardSacrificeLanes: [...sub.boardLanes],
                        summonZone: 'hand',
                        sourceLane: lane,
                        sourceUid: card?.uid || card?.id || null,
                      };
                      const nextEnemyBoard = [...postSacBoard];
                      if (summonLane >= 0 && summonLane < 3) {
                        nextEnemyBoard[summonLane] = hCard;
                      }
                      const nextBranches = buildSkillBranch(
                        remainingSkills,
                        [...nextUsedHandBase, hIdx],
                        currentUsedDiscard,
                        currentDepth,
                        newlyDiscarded,
                        nextEnemyBoard,
                        activePlayerBoard,
                        currentUsedDeck
                      );
                      for (const nb of nextBranches) {
                        results.push([enrichedRoot, ...cNode.slice(1), ...nb]);
                      }
                    }
                  }
                }
              } else if (sk.id === 'forge') {
                const seenForgeHandSigs = new Set();
                for (let i = 0; i < originalHand.length; i++) {
                  if (currentUsedHand.includes(i)) continue;
                  let childCard = originalHand[i];
                  if (!childCard) continue;
                  const forgeSig = getCardSignature(childCard);
                  if (seenForgeHandSigs.has(forgeSig)) continue;
                  seenForgeHandSigs.add(forgeSig);

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
                    const forgeParentBoard = [...activeEnemyBoard];
                    forgeParentBoard[lane] = card;
                    let children = buildCardPlayTree(
                      childCard,
                      i,
                      'forge',
                      originalHand,
                      originalDiscard,
                      [...currentUsedHand, i],
                      currentUsedDiscard,
                      currentDepth + 1,
                      vLane,
                      leaderSkillContext,
                      currentUsedDeck,
                      {
                        myBoard: forgeParentBoard,
                        opBoard: activePlayerBoard,
                        mySealedLanes: localMySealedLanes,
                        deck: localDeck,
                        opDiscard: localOpDiscard,
                        initialDiscarded: currentDiscarded,
                      }
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
                const { presentBoardCards, presentBoardIds } =
                  collectPresentBoardTargets(activeEnemyBoard, isExcludeBoard);

                const seenResurrectSigs = new Set();
                for (let i = 0; i < candidates.length; i++) {
                  if (currentUsedDiscard.includes(i)) continue;
                  let resCard = candidates[i];
                  if (!resCard) continue;

                  // skillLogic.js の実戦判定（matchesResurrectTarget）と同一ロジックで評価
                  if (
                    !matchesResurrectTarget(resCard, sk, {
                      presentBoardIds,
                      presentBoardCards,
                    })
                  ) {
                    continue;
                  }
                  const resSig = getCardSignature(resCard);
                  if (seenResurrectSigs.has(resSig)) continue;
                  seenResurrectSigs.add(resSig);

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
                // 【処刑】自分の場のカードを指定枚数選択して破壊する（直前の使役等で配置したトークンも含む）
                let occupiedLanes = [];
                for (let j = 0; j < 3; j++) {
                  const simulatedBoardCard = activeEnemyBoard[j];
                  if (simulatedBoardCard !== null) {
                    occupiedLanes.push(j);
                  }
                }

                if (occupiedLanes.length > 0) {
                  const execVal =
                    sk.value === undefined ||
                    sk.value === null ||
                    sk.value === 0
                      ? 1
                      : sk.value;
                  const selectCount = Math.min(execVal, occupiedLanes.length);
                  const combos = getCombinations(occupiedLanes, selectCount);
                  const projectedState = createGuardProjectedState();

                  for (const combo of combos) {
                    let execNode = {
                      type: 'execute',
                      targetLane: combo[0],
                      targetLanes: combo,
                    };
                    let newlyDiscarded = [...currentDiscarded];
                    const nextEnemyBoard = activeEnemyBoard.map((c) =>
                      c ? { ...c } : null
                    );

                    for (const tgtLane of combo) {
                      const destroyedCard = activeEnemyBoard[tgtLane];
                      const isDestroyable =
                        destroyedCard &&
                        canCardBeDestroyed(
                          projectedState,
                          destroyedCard,
                          'red'
                        );
                      if (isDestroyable) {
                        if (!destroyedCard.isToken) {
                          newlyDiscarded.push(destroyedCard);
                        }
                        const canPlaceSplitToken =
                          !mySealedLanes || mySealedLanes[tgtLane] === 0;
                        nextEnemyBoard[tgtLane] =
                          hasSkill(destroyedCard, 'split') && canPlaceSplitToken
                            ? createSplitSimToken(destroyedCard, tgtLane, 'red')
                            : null;
                      }
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
                  if (!currentUsedHand.includes(i) && originalHand[i]) {
                    handIndices.push(i);
                  }
                }

                if (handIndices.length > 0) {
                  const actualCount = Math.min(count, handIndices.length);
                  let combinations = getCombinations(handIndices, actualCount);
                  const seenDiscardCombos = new Set();
                  for (let combo of combinations) {
                    const comboSig = combo
                      .map((idx) => getCardSignature(originalHand[idx]))
                      .sort()
                      .join('|');
                    if (seenDiscardCombos.has(comboSig)) continue;
                    seenDiscardCombos.add(comboSig);
                    let discardNodes = combo.map((idx) => ({
                      type: 'discard',
                      targetIdx: idx,
                      targetUid: originalHand[idx]?.uid,
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
                // 同一のトークン配置スキル（ambush または servant）が連続する場合、
                // トークン配置順序の入れ替えによる無駄な同一盤面重複計算（順列）を排除するため
                // レーンインデックスを非減少順（j >= effectiveMinLane）に制限して重複組み合わせ化する。
                const isContinuousTokenSkill =
                  sk.id === 'ambush' || sk.id === 'servant';
                const currentTokenKey = isContinuousTokenSkill
                  ? `${sk.id}_${sk.summonId || ''}_${sk.value ?? 1}`
                  : null;
                const effectiveMinLane =
                  isContinuousTokenSkill &&
                  lastTokenSkillKey === currentTokenKey
                    ? minTokenLane
                    : 0;

                // レーン選択の全組み合わせを生成するヘルパー
                // 同一レーンへの複数配置は武装カードへの装備等で有効な戦略のため、
                // 重複レーンを含む全パターンを生成する（例: [0,0]も有効）
                const generateLaneCombos = (remainingCount) => {
                  if (remainingCount <= 0) return [[]];
                  let combos = [];
                  let subCombos = generateLaneCombos(remainingCount - 1);
                  // 分身スキルの調整：元のレーン lane の隣接レーンのみを対象とする
                  const allowedLanes =
                    sk.id === 'clone'
                      ? lane === 1
                        ? [0, 2]
                        : [1]
                      : [0, 1, 2].filter((j) => j >= effectiveMinLane);
                  for (let j of allowedLanes) {
                    if (mySealedLanes[j] > 0) continue;
                    for (let sc of subCombos) {
                      combos.push([j, ...sc]);
                    }
                  }
                  return combos;
                };

                let allCombos = [[]]; // 配置しない選択肢（canCancel: true に準拠し、自壊回避およびアドホックツリーと探索空間を統一）
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
                  const nextMinLane =
                    isContinuousTokenSkill && combo.length > 0
                      ? combo[combo.length - 1]
                      : 0;
                  const nextTokenKey = isContinuousTokenSkill
                    ? currentTokenKey
                    : null;
                  const {
                    nextBoard: nextEnemyBoardAfterToken,
                    nextDiscarded: nextDiscardedAfterToken,
                  } = applySimTokenComboToBoard(
                    activeEnemyBoard,
                    currentDiscarded,
                    combo,
                    sk,
                    activeEnemyBoard[lane] || card,
                    mySealedLanes,
                    'red'
                  );
                  let nextBranches = buildSkillBranch(
                    remainingSkills,
                    currentUsedHand,
                    currentUsedDiscard,
                    currentDepth,
                    nextDiscardedAfterToken,
                    nextEnemyBoardAfterToken,
                    activePlayerBoard,
                    currentUsedDeck,
                    nextMinLane,
                    nextTokenKey
                  );
                  for (let nb of nextBranches) {
                    results.push([tokenNode, ...nb]);
                  }
                }
              } else if (sk.id === 'puppet') {
                const maxP = sk.value || 1;
                // 傀儡：相手の墓地（リーダースキル先出し時は破壊反映後の相手墓地）から選択
                const candidates = localOpDiscard;

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
              // 親アクション（招来等）から引き継いだ破棄バッファに、今回の上書き配置による破棄カード（通常カードのみ）を加える
              let initialDiscarded = stateOverride?.initialDiscarded
                ? [...stateOverride.initialDiscarded]
                : [];
              if (
                lane !== -1 &&
                localMyBoard[lane] !== null &&
                !localMyBoard[lane].isToken
              ) {
                initialDiscarded.push(localMyBoard[lane]);
              }
              const nextEnemyBoard = localMyBoard.map((c) =>
                c ? { ...c } : null
              );
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
                localOpBoard,
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

  // 「命令（force）」スキルが関与する場合のみ branchMap 構築のため全候補を保持し、
  // それ以外は現時点の最高スコアより明確に劣る候補を配列へ積まずにメモリ・ソート負荷を削減する
  const hasForceInPool =
    hand.some((c) => c && hasSkill(c, 'force')) ||
    (GameState.enemyDeck || []).some((c) => c && hasSkill(c, 'force')) ||
    Boolean(
      canUseSkill &&
      skill.action === 'dungeon_summon_leader' &&
      GameState.enemyConfig?.leaderCardId &&
      hasSkill(getCardMasterById(GameState.enemyConfig.leaderCardId), 'force')
    );
  let bestScoreSoFar = -Infinity;

  // 戦闘直前状態（S2）の決定論的スコアキャッシュ（同一盤面への重複戦闘シミュレーションを排除）
  const combatScoreCache = new Map();

  /**
   * 算出済みスコアを候補オブジェクトへ設定し、最善スコア群に残る可能性がある候補のみを記録する。
   * 「命令（force）」が関与する場合は branchMap 生成のため全候補を保持する。
   *
   * @param {object} candidateData - 候補アクションデータ
   * @param {number} score - 算出済み評価スコア
   * @returns {void}
   */
  const addCandidateWithScore = (candidateData, score) => {
    candidateData.score = score;
    if (!hasForceInPool && score < bestScoreSoFar - 0.0001) {
      return;
    }
    if (score > bestScoreSoFar) {
      bestScoreSoFar = score;
    }
    candidates.push(candidateData);
  };

  /**
   * 戦闘フェーズ直前のシミュレーション状態（preCombatSim）に対し、
   * 状態キャッシュを活用して戦闘フェーズ解決および総合評価スコア算出を行い候補へ記録する。
   * 戦闘開始前に勝敗が確定している場合は processActionSequence と同じく戦闘を行わず即時評価する。
   *
   * @param {object} candidateData - 候補アクションデータ
   * @param {object|null} preCombatSim - 戦闘フェーズ直前のシミュレーション状態
   * @returns {void}
   */
  const evaluatePreCombatAndRecord = (candidateData, preCombatSim) => {
    if (!preCombatSim) return;
    let score;
    if (preCombatSim.enemyHP <= 0 || preCombatSim.playerHP <= 0) {
      score = evaluateSimState(preCombatSim);
    } else {
      const combatKey = buildPreCombatStateKey(preCombatSim);
      if (combatKey !== null && combatScoreCache.has(combatKey)) {
        score = combatScoreCache.get(combatKey);
      } else {
        advanceCombatPhase(preCombatSim);
        score = evaluateSimState(preCombatSim);
        if (combatKey !== null) {
          combatScoreCache.set(combatKey, score);
        }
      }
    }
    addCandidateWithScore(candidateData, score);
  };

  let passPreCombat = processActionSequence(
    [{ type: 'pass' }],
    false,
    null,
    null,
    'before',
    null,
    null,
    null,
    null,
    null,
    null,
    true
  );
  if (passPreCombat)
    evaluatePreCombatAndRecord(
      {
        index: -1,
        lane: -1,
        isOverwrite: false,
        useSkill: false,
      },
      passPreCombat
    );

  // 手札内の同一カードの重複探索を排除（先頭の1枚のみを探索して計算量を削減）
  const seenHandCards = new Set();
  const cachedNormalHandTrees = new Map();
  for (let i = 0; i < hand.length; i++) {
    let card = hand[i];
    if (!card) continue;
    const cardSig = getCardSignature(card);
    if (seenHandCards.has(cardSig)) continue;
    seenHandCards.add(cardSig);

    let queues = buildCardPlayTree(card, i, 'play', hand, discard, [i], [], 0);
    cachedNormalHandTrees.set(i, queues);

    for (let actionQ of queues) {
      if (actionQ.length === 0) continue;
      let preCombatSim = processActionSequence(
        actionQ,
        false,
        null,
        null,
        'before',
        null,
        null,
        null,
        null,
        null,
        null,
        true
      );
      if (preCombatSim) {
        let firstAction = actionQ[0];
        let fChcs = [firstAction.choices, firstAction.choices2].filter(
          (x) => x !== undefined
        );
        let followUp = actionQ.slice(1).map((act) => {
          let adjusted = { ...act };
          if (
            (adjusted.type === 'summon' ||
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

        evaluatePreCombatAndRecord(
          {
            index: firstAction.targetIdx,
            lane: firstAction.laneIdx,
            useSkill: false,
            choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
            cardTokenLanes: firstAction.cardTokenLanes,
            actionQueue: followUp.length > 0 ? followUp : undefined,
          },
          preCombatSim
        );
      }
    }
  }

  if (canUseSkill) {
    let tokenLanePatterns = [null];
    const action = skill.action;
    if (
      action === 'holy_march' ||
      action === 'evil_march' ||
      action === 'death_target'
    ) {
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
        'daemon_call',
        'dungeon_summon_leader',
        'warlock_place_daemons',
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
      const set = new Set();
      const addPattern = (p) => {
        const k = p.join(',');
        if (!set.has(k)) {
          set.add(k);
          patterns.push(p);
        }
      };

      if (avail.length > 0) {
        // 1. 各レーン集中突破: [l, l, l, ...] (リーダー直接攻撃、または強敵集中削り)
        for (const l of avail) {
          addPattern(Array(repeatCount).fill(l));
        }

        // 2. 全レーン散開 (制圧・盤面展開)
        if (avail.length >= 2) {
          const spread = [];
          for (let idx = 0; idx < repeatCount; idx++) {
            spread.push(avail[idx % avail.length]);
          }
          addPattern(spread);
        }

        // 3. 敵カードがいるレーンへの重点削り (2回集中 + 1回空き枠・他敵)
        const enemyLanes = avail.filter((l) => opBoard[l] !== null);
        const emptyOppLanes = avail.filter((l) => opBoard[l] === null);

        if (repeatCount === 3) {
          for (const el of enemyLanes) {
            const other =
              emptyOppLanes.length > 0
                ? emptyOppLanes[0]
                : avail.find((l) => l !== el);
            if (other !== undefined) {
              addPattern([el, el, other]);
            }
          }
          // 4. 空きレーンからのリーダー連打 (2回リーダー + 1回敵カード)
          for (const emptyL of emptyOppLanes) {
            const other =
              enemyLanes.length > 0
                ? enemyLanes[0]
                : avail.find((l) => l !== emptyL);
            if (other !== undefined) {
              addPattern([emptyL, emptyL, other]);
            }
          }
        } else if (repeatCount === 5) {
          for (const el of enemyLanes) {
            const other =
              emptyOppLanes.length > 0
                ? emptyOppLanes[0]
                : avail.find((l) => l !== el);
            if (other !== undefined) {
              addPattern([el, el, el, other, other]);
            }
          }
          for (const emptyL of emptyOppLanes) {
            const other =
              enemyLanes.length > 0
                ? enemyLanes[0]
                : avail.find((l) => l !== emptyL);
            if (other !== undefined) {
              addPattern([emptyL, emptyL, emptyL, other, other]);
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

    const config = GameState.enemyConfig;
    const leaderCard =
      action === 'dungeon_summon_leader' && config?.leaderCardId
        ? getCardMasterById(config.leaderCardId)
        : null;
    const isDngResurrect =
      leaderCard &&
      leaderCard.skills &&
      leaderCard.skills.some((s) => s.id === 'resurrect');

    const isResurrectLeaderSkill =
      action === 'devilhunter_resurrect' ||
      action === 'overdrive' ||
      isDngResurrect;

    // マリア（棺の解放・オーバードライブ）および試練の宮殿復活リーダー用:
    // 同一シグネチャ（baseId・元パワー・現在パワー・スキル構成一致）の墓地カード重複探索を排除し、
    // 探索深度・網羅性を維持したまま計算量を削減する
    const validResurrectIndices = [];
    const seenResurrectSigs = new Set();
    discard.forEach((card, idx) => {
      if (!card || card.isToken) return;
      const sig = getCardSignature(card);
      if (!seenResurrectSigs.has(sig)) {
        seenResurrectSigs.add(sig);
        validResurrectIndices.push(idx);
      }
    });
    // 次元斬（daemon_call）用: 山札内で現在召喚可能なユニークカードのインデックスを抽出
    const enemyDeckForLeader = GameState.enemyDeck
      ? GameState.enemyDeck.map(cloneCard)
      : [];
    const validDaemonCallDeckIndices = [];
    if (action === 'daemon_call') {
      const seenDeckSigs = new Set();
      enemyDeckForLeader.forEach((dCard, idx) => {
        if (!dCard) return;
        const master = getCardMasterById(dCard.baseId || dCard.id);
        const checkCard = master || dCard;
        if (getValidSummonLanes('red', checkCard).length === 0) return;
        const sig = getCardSignature(checkCard);
        if (!seenDeckSigs.has(sig)) {
          seenDeckSigs.add(sig);
          validDaemonCallDeckIndices.push(idx);
        }
      });
    }

    /**
     * 「次元斬（daemon_call）」で山札から召喚されるカードのオンプレイスキル全分岐を生成する。
     * 対象レーンの起動消滅・合体進化も考慮し、選択分岐を伴うスキル（召喚・召集・復活・選択・処刑・使役等）の
     * アクションチェーン配列を返す。分岐対象スキルを持たない場合は `[[]]` を返す。
     *
     * @param {object} masterCard - 召喚される山札カードのマスタ定義オブジェクト
     * @param {number} dIdx - 山札内の対象カードインデックス
     * @param {number} targetLane - 召喚先レーン番号 (0〜2)
     * @param {Array<number>} reservedHandIndices - 後続手札プレイ等で予約済みの手札インデックス配列
     * @returns {Array<Array<object>>} 子スキルアクションチェーンの配列
     */
    const buildDaemonCallSkillBranches = (
      masterCard,
      dIdx,
      targetLane,
      reservedHandIndices
    ) => {
      if (!masterCard || targetLane === undefined || targetLane < 0) {
        return [[]];
      }
      const existingOnLane = myBoard[targetLane];
      // 起動（startup）持ちの上に出す場合は起動消滅となるためオンプレイスキル分岐は発生しない
      if (existingOnLane && hasSkill(existingOnLane, 'startup')) {
        return [[]];
      }
      // 合体（union）が成立する場合は合体後カードのスキルを評価対象にする
      let effectiveCard = masterCard;
      const unionSk =
        masterCard.skills && masterCard.skills.find((s) => s.id === 'union');
      if (
        existingOnLane &&
        unionSk &&
        matchesUnionMaterial(existingOnLane, unionSk)
      ) {
        const uMaster = getCardMasterById(unionSk.summonId);
        if (uMaster) effectiveCard = uMaster;
      }
      if (!Array.isArray(effectiveCard.skills)) return [[]];

      const BRANCHING_SKILL_IDS = [
        'resurrect',
        'convert',
        'draw',
        'reinforce',
        'clone',
        'servant',
        'summon',
        'assemble',
        'invoke',
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
      ];
      const hasBranchingSkills = effectiveCard.skills.some((s) =>
        BRANCHING_SKILL_IDS.includes(s.id)
      );
      if (!hasBranchingSkills) return [[]];

      const dcContext = {
        action: 'daemon_call',
        tokenLanes: [targetLane],
        targetCard: effectiveCard,
      };
      const dummyQueues = buildCardPlayTree(
        effectiveCard,
        dIdx,
        'daemon_call',
        hand,
        discard,
        reservedHandIndices,
        [],
        0,
        targetLane,
        dcContext,
        [dIdx]
      );
      const branches = [];
      for (const q of dummyQueues) {
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
      return branches.length > 0 ? branches : [[]];
    };

    // overdriveでは-1（自動選択）を含めない: 全カードを明示インデックスで試し、
    // leaderSkillTargetUidが確実に設定されるようにする（-1だとnullになりランダムフォールバックに落ちる）
    // 墓地が空の場合のみ-1を使用（相手墓地からの復活だけでも機能するため）
    let dIdxLoop;
    if (action === 'overdrive' || action === 'devilhunter_resurrect') {
      dIdxLoop =
        validResurrectIndices.length > 0 ? validResurrectIndices : [-1];
    } else if (action === 'daemon_call') {
      dIdxLoop = validDaemonCallDeckIndices;
    } else if (isDngResurrect) {
      // dungeon_summon_leader の resurrect は buildSkillBranch で処理するため外側ループでは [-1] のみ
      dIdxLoop = [-1];
    } else {
      dIdxLoop = isResurrectLeaderSkill ? [-1, ...validResurrectIndices] : [-1];
    }

    // オーバードライブ用: 相手墓地のユニークカード（getCardSignature で重複排除）を全通りシミュレーションする
    const oppDiscard = GameState.playerDiscard
      ? GameState.playerDiscard.map(cloneCard)
      : [];
    const validOppResurrectIndices = [];
    if (action === 'overdrive') {
      const seenOppResurrectSigs = new Set();
      oppDiscard.forEach((card, idx) => {
        if (!card || card.isToken) return;
        const sig = getCardSignature(card);
        if (!seenOppResurrectSigs.has(sig)) {
          seenOppResurrectSigs.add(sig);
          validOppResurrectIndices.push(idx);
        }
      });
    }
    // overdriveでは-1を含めない（同理由: leaderSkillOppTargetUidがnullになるのを防ぐ）
    const oppDIdxLoop =
      action === 'overdrive' && validOppResurrectIndices.length > 0
        ? validOppResurrectIndices
        : [-1];

    // リーダースキル先出し適用後の仮想盤面・墓地・山札状態をパターン単位でキャッシュし、手札間の重複計算を防ぐ
    const postLeaderStateCache = new Map();
    /**
     * リーダースキル（およびリーダー召喚カードの分岐スキル）を先出し適用した直後のシミュレーション状態を取得する。
     * 「次元斬」での『狂乱』による味方パワー減少やトークン配置後の盤面を、後続手札の「招来」等へ正確に反映するために使用する。
     *
     * @param {Array<number>|null} tLanes - リーダースキル対象レーン配列
     * @param {number} dIdx - 対象カードインデックス
     * @param {number} rLane - 復活先レーン
     * @param {Array<object>} lsChain - リーダーカードの追加スキルチェーン
     * @returns {object|null} 戦闘フェーズ前のシミュレーション状態
     */
    const getPostLeaderSimState = (tLanes, dIdx, rLane, lsChain) => {
      if (action === 'overdrive') return null;
      const cacheKey = JSON.stringify({ tLanes, dIdx, rLane, lsChain });
      if (postLeaderStateCache.has(cacheKey)) {
        return postLeaderStateCache.get(cacheKey);
      }
      const targetUid =
        action === 'daemon_call'
          ? enemyDeckForLeader[dIdx]?.uid || null
          : isResurrectLeaderSkill && dIdx !== -1
            ? discard[dIdx]?.uid || null
            : null;
      const preSim = processActionSequence(
        [],
        true,
        action,
        tLanes,
        'before',
        dIdx !== -1 ? dIdx : null,
        targetUid,
        null,
        isDngResurrect && rLane !== -1 ? rLane : null,
        null,
        lsChain && lsChain.length > 0 ? lsChain : null,
        true
      );
      postLeaderStateCache.set(cacheKey, preSim);
      return preSim;
    };

    const BOARD_DEPENDENT_CARD_SKILLS = [
      'takeover',
      'apex',
      'challenge',
      'invoke',
      'forge',
      'summon',
      'assemble',
      'resurrect',
      'puppet',
      'inspire',
      'protection',
      'dominate',
      'execute',
      'snipe',
      'artillery',
      'seal',
      'choice',
      'force',
    ];

    if (action === 'daemon_call') {
      // 【ベルカ「次元斬（daemon_call）」専用：探索深度100%維持の2段階完全探索】
      // Phase 1: 次元斬（山札ユニークカード × 合法レーン × オンプレイ分岐）を1回のみ全展開し、
      //          解決後の中間状態（盤面・HP/SP・手札・墓地・山札等）が完全一致する同値分岐を
      //          最短手数・最優先レーンの代表1件へ厳密集約する。
      // Phase 2: 集約済みの中間状態（postLeaderSim）を直接再利用して、パスおよび残存ユニーク手札の
      //          全分岐をシミュレーション評価する（リーダースキル再計算・既消費手札の無駄な再展開を完全排除）。
      const getDaemonLanePri = (l) =>
        l === 0 ? 3 : l === 2 ? 2 : l === 1 ? 1 : 0;
      const phase2Relevance = analyzePhase2ZoneRelevance(
        hand,
        enemyDeckForLeader,
        myBoard,
        opBoard
      );
      const uniqueDaemonEntryMap = new Map();
      const forceDaemonEntries = [];

      for (const dIdx of validDaemonCallDeckIndices) {
        const rawDeckCard = enemyDeckForLeader[dIdx];
        if (!rawDeckCard) continue;
        const masterCard =
          getCardMasterById(rawDeckCard.baseId || rawDeckCard.id) ||
          rawDeckCard;
        const legalDaemonLanes = getValidSummonLanes('red', masterCard);
        const cardHasForce = hasSkill(masterCard, 'force');

        for (const tokenLanes of tokenLanePatterns) {
          const targetLane = tokenLanes?.[0];
          if (
            targetLane === undefined ||
            !legalDaemonLanes.includes(targetLane)
          ) {
            continue;
          }
          const skillBranches = buildDaemonCallSkillBranches(
            masterCard,
            dIdx,
            targetLane,
            []
          );
          const lanePri = getDaemonLanePri(targetLane);
          // 選択/命令(choice/force)を含まないカードは、次元斬の召喚本体（空チェーン）を1回だけ実行し、
          // その結果状態 baseDaemonSim を各分岐チェーンへプレフィックス再利用する
          const canReuseDaemonBase =
            !cardHasForce &&
            !hasSkill(masterCard, 'choice') &&
            skillBranches.length > 1;
          let baseDaemonSim = null;
          let baseDaemonComputed = false;

          for (const leaderSkillChain of skillBranches) {
            let postLeaderSim = null;
            const chainHasChoiceOrForce = leaderSkillChain.some(
              (act) => act.type === 'choice' || act.type === 'force'
            );

            if (canReuseDaemonBase && !chainHasChoiceOrForce) {
              if (!baseDaemonComputed) {
                baseDaemonComputed = true;
                baseDaemonSim = processActionSequence(
                  [],
                  true,
                  'daemon_call',
                  tokenLanes,
                  'before',
                  dIdx,
                  rawDeckCard.uid,
                  null,
                  null,
                  null,
                  null,
                  true
                );
              }
              if (!baseDaemonSim) continue;
              if (leaderSkillChain.length === 0) {
                postLeaderSim = cloneSimState(baseDaemonSim);
              } else if (
                baseDaemonSim.enemyHP <= 0 ||
                baseDaemonSim.playerHP <= 0
              ) {
                postLeaderSim = cloneSimState(baseDaemonSim);
              } else {
                const initForChain = cloneSimState(baseDaemonSim);
                initForChain._preserveResolvingOnStart = true;
                postLeaderSim = processActionSequence(
                  leaderSkillChain,
                  false,
                  null,
                  null,
                  'before',
                  null,
                  null,
                  initForChain,
                  null,
                  null,
                  null,
                  true
                );
              }
            } else {
              postLeaderSim = processActionSequence(
                [],
                true,
                'daemon_call',
                tokenLanes,
                'before',
                dIdx,
                rawDeckCard.uid,
                null,
                null,
                null,
                leaderSkillChain.length > 0 ? leaderSkillChain : null,
                true
              );
            }
            if (!postLeaderSim) continue;

            const boardZonesKey = buildPostLeaderBoardAndZonesKey(
              postLeaderSim,
              phase2Relevance
            );
            const entry = {
              dIdx,
              rawDeckCard,
              tokenLanes,
              leaderSkillChain,
              postLeaderSim,
              boardZonesKey,
              chainLen: leaderSkillChain.length,
              lanePri,
            };

            const chainHasForce =
              cardHasForce ||
              leaderSkillChain.some((act) => act.type === 'force');
            if (chainHasForce) {
              forceDaemonEntries.push(entry);
              continue;
            }

            const stateKey = buildPostLeaderStateKey(
              postLeaderSim,
              phase2Relevance,
              hand.length,
              boardZonesKey
            );
            const prev = uniqueDaemonEntryMap.get(stateKey);
            if (
              !prev ||
              entry.chainLen < prev.chainLen ||
              (entry.chainLen === prev.chainLen && entry.lanePri > prev.lanePri)
            ) {
              uniqueDaemonEntryMap.set(stateKey, entry);
            }
          }
        }
      }

      // 手数が短くレーン優先順位が高い中間状態から順に処理することで、
      // 同一のPhase 2サブ問題（盤面・関連ゾーン・プレイカード・本質的手札条件が完全一致）に対する
      // 劣後側の重複展開を数学的支配（Dominance）により安全かつ完全に排除する
      const allDaemonEntries = [
        ...uniqueDaemonEntryMap.values(),
        ...forceDaemonEntries,
      ].sort((a, b) => a.chainLen - b.chainLen || b.lanePri - a.lanePri);

      const seenPassBoardZonesKeys = !hasForceInPool ? new Set() : null;
      const evaluatedPhase2Subproblems = !hasForceInPool ? new Set() : null;
      // 同一盤面・関連ゾーン（boardZonesKey）を共有する別中間状態（残存手札のみ異なる）を横断して、
      // ターン最終行動 [play, invoke] が同一の盤面破棄・召喚元・召喚対象・召喚レーンを生む支配済み重複を排除する
      const canDedupTerminalInvokeGlobal =
        !hasForceInPool &&
        !phase2Relevance.needsMyDiscard &&
        !phase2Relevance.needsExtraHandCards;
      const globalSeenTerminalInvokeKeys = canDedupTerminalInvokeGlobal
        ? new Set()
        : null;

      for (const entry of allDaemonEntries) {
        const {
          dIdx,
          rawDeckCard,
          tokenLanes,
          leaderSkillChain,
          postLeaderSim,
          boardZonesKey,
        } = entry;

        // 1. 次元斬＋手札パス候補を中間状態から直接評価（同盤面の支配済みパスはスキップ）
        if (
          !seenPassBoardZonesKeys ||
          !seenPassBoardZonesKeys.has(boardZonesKey)
        ) {
          if (seenPassBoardZonesKeys) {
            seenPassBoardZonesKeys.add(boardZonesKey);
          }
          evaluatePreCombatAndRecord(
            {
              index: -1,
              lane: -1,
              isOverwrite: false,
              useSkill: true,
              tokenLanes,
              skillOrder: 'before',
              leaderSkillTargetIdx: dIdx,
              leaderSkillTargetUid: rawDeckCard.uid,
              leaderCardSkillActions:
                leaderSkillChain.length > 0 ? leaderSkillChain : undefined,
            },
            cloneSimState(postLeaderSim)
          );
        }

        // 2. 次元斬解決後に手札へ残存している元手札のユニークカードを全分岐展開して評価
        const consumedOrigHandIndices = [];
        for (let k = 0; k < hand.length; k++) {
          if (!postLeaderSim.enemyHand[k]) {
            consumedOrigHandIndices.push(k);
          }
        }
        const postHandSlice = postLeaderSim.enemyHand.slice(0, hand.length);
        const sealedUnchanged = (
          postLeaderSim.enemySealedLanes || [0, 0, 0]
        ).every((v, idx) => v === (mySealedLanes[idx] || 0));
        const treeStateOverride = {
          myBoard: postLeaderSim.enemyBoard,
          opBoard: postLeaderSim.playerBoard,
          mySealedLanes: postLeaderSim.enemySealedLanes,
          deck: postLeaderSim.enemyDeck,
          opDiscard: postLeaderSim.playerDiscard,
        };

        const seenPostHandSigs = new Set();
        for (let i = 0; i < hand.length; i++) {
          const postCard = postHandSlice[i];
          if (!postCard) continue;
          const origCard = hand[i];
          const postSig = getCardSignature(postCard);
          if (seenPostHandSigs.has(postSig)) continue;
          seenPostHandSigs.add(postSig);

          if (evaluatedPhase2Subproblems) {
            const handSubKey = buildPhase2HandSubproblemKey(
              postCard,
              i,
              postHandSlice,
              postLeaderSim.enemyHand,
              phase2Relevance
            );
            const subproblemKey = `${boardZonesKey}@@${postSig}@@${handSubKey}`;
            if (evaluatedPhase2Subproblems.has(subproblemKey)) continue;
            evaluatedPhase2Subproblems.add(subproblemKey);
          }

          const needsBoardAwareTree = BOARD_DEPENDENT_CARD_SKILLS.some((skId) =>
            hasSkill(postCard, skId)
          );
          const canReuseNormalTree =
            !needsBoardAwareTree &&
            consumedOrigHandIndices.length === 0 &&
            sealedUnchanged &&
            cachedNormalHandTrees.has(i) &&
            postSig === getCardSignature(origCard);

          const qs = canReuseNormalTree
            ? cachedNormalHandTrees.get(i)
            : buildCardPlayTree(
                postCard,
                i,
                'play',
                postHandSlice,
                postLeaderSim.enemyDiscard,
                [i, ...consumedOrigHandIndices],
                [],
                0,
                undefined,
                undefined,
                [],
                treeStateOverride
              );

          // 先頭playアクションが共通する複数分岐（招来・使役+処刑等）では、先頭playの適用直後状態を
          // プレフィックスキャッシュして再利用し、盤面上書き破棄や召喚計算の重複実行を排除する。
          // また、ターン最終行動が [play, invoke] で完結し墓地・手札参照スキルが存在しない場合、
          // 同一盤面・関連ゾーン上で同じ盤面破棄・召喚元・召喚対象・召喚レーンを生む支配済み手札破棄は
          // 全中間状態を横断して1件のみ評価する（allDaemonEntries は (chainLen ASC, lanePri DESC) でソート済み）。
          const afterFirstPlayCache = new Map();

          for (const actionQ of qs) {
            if (actionQ.length === 0) continue;
            const fA = actionQ[0];
            const prefixKey = `${fA.laneIdx}|${fA.choices ? fA.choices.join(',') : ''}|${fA.choices2 ? fA.choices2.join(',') : ''}|${fA.cardTokenLanes ? fA.cardTokenLanes.join(',') : ''}`;
            let terminalInvokeKey = null;
            if (globalSeenTerminalInvokeKeys && fA.type === 'play') {
              if (actionQ.length === 1) {
                terminalInvokeKey = `${boardZonesKey}|${postSig}|${prefixKey}|SOLO`;
                if (globalSeenTerminalInvokeKeys.has(terminalInvokeKey)) {
                  continue;
                }
              } else if (actionQ.length === 2 && actionQ[1].type === 'invoke') {
                const act1 = actionQ[1];
                if (act1.laneIdx === -1) {
                  terminalInvokeKey = `${boardZonesKey}|${postSig}|${prefixKey}|INV_SKIP`;
                  if (globalSeenTerminalInvokeKeys.has(terminalInvokeKey)) {
                    continue;
                  }
                } else {
                  const hasMadnessSac =
                    Array.isArray(act1.handSacrificeIndices) &&
                    act1.handSacrificeIndices.some(
                      (hIdx) =>
                        postHandSlice[hIdx] &&
                        hasSkill(postHandSlice[hIdx], 'madness')
                    );
                  if (!hasMadnessSac) {
                    const sacBoardKey = Array.isArray(act1.boardSacrificeLanes)
                      ? [...act1.boardSacrificeLanes]
                          .sort((a, b) => a - b)
                          .join(',')
                      : '';
                    const targetCardObj =
                      act1.summonZone === 'deck'
                        ? postLeaderSim.enemyDeck[act1.targetIdx]
                        : postHandSlice[act1.targetIdx];
                    const targetSig = targetCardObj
                      ? getCardSignature(targetCardObj)
                      : act1.targetUid || String(act1.targetIdx);
                    terminalInvokeKey = `${boardZonesKey}|${postSig}|${prefixKey}|${sacBoardKey}|${act1.summonZone}|${targetSig}|${act1.laneIdx}`;
                    if (globalSeenTerminalInvokeKeys.has(terminalInvokeKey)) {
                      continue;
                    }
                  }
                }
              }
            }

            let preCombatSim = null;
            if (actionQ.length > 1 && fA.type === 'play') {
              let afterFirstSim;
              if (afterFirstPlayCache.has(prefixKey)) {
                afterFirstSim = afterFirstPlayCache.get(prefixKey);
              } else {
                const initForPrefix = cloneSimState(postLeaderSim);
                initForPrefix._skipPendingFlush = true;
                afterFirstSim = processActionSequence(
                  [fA],
                  false,
                  null,
                  null,
                  'before',
                  null,
                  null,
                  initForPrefix,
                  null,
                  null,
                  null,
                  true
                );
                afterFirstPlayCache.set(prefixKey, afterFirstSim);
              }
              if (!afterFirstSim) continue;
              if (
                afterFirstSim._abortedByStartup ||
                afterFirstSim.enemyHP <= 0 ||
                afterFirstSim.playerHP <= 0
              ) {
                preCombatSim = cloneSimState(afterFirstSim);
                delete preCombatSim._abortedByStartup;
              } else {
                const initForTail = cloneSimState(afterFirstSim);
                initForTail._preserveResolvingOnStart = true;
                preCombatSim = processActionSequence(
                  actionQ.slice(1),
                  false,
                  null,
                  null,
                  'before',
                  null,
                  null,
                  initForTail,
                  null,
                  null,
                  null,
                  true
                );
              }
            } else {
              preCombatSim = processActionSequence(
                actionQ,
                false,
                null,
                null,
                'before',
                null,
                null,
                cloneSimState(postLeaderSim),
                null,
                null,
                null,
                true
              );
            }
            if (!preCombatSim) continue;
            if (terminalInvokeKey) {
              globalSeenTerminalInvokeKeys.add(terminalInvokeKey);
            }

            const fChcs = [fA.choices, fA.choices2].filter(
              (x) => x !== undefined
            );
            evaluatePreCombatAndRecord(
              {
                index: i,
                cardUid: origCard.uid,
                lane: fA.laneIdx,
                isOverwrite: myBoard[fA.laneIdx] !== null,
                useSkill: true,
                tokenLanes,
                skillOrder: 'before',
                leaderSkillTargetIdx: dIdx,
                leaderSkillTargetUid: rawDeckCard.uid,
                leaderCardSkillActions:
                  leaderSkillChain.length > 0 ? leaderSkillChain : undefined,
                choiceIndexQueue: fChcs.length > 0 ? fChcs : undefined,
                cardTokenLanes: fA.cardTokenLanes,
                actionQueue:
                  actionQ.slice(1).length > 0
                    ? actionQ.slice(1).map((act) => {
                        const adjusted = { ...act };
                        if (
                          (adjusted.type === 'summon' ||
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
              preCombatSim
            );
          }
        }
      }
    } else {
      // リーダースキル併用時も手札内の同一カードの重複探索を排除（先頭の1枚のみ探索）
      const seenSkillHandCards = new Set();
      for (let i = 0; i < hand.length; i++) {
        let card = hand[i];
        if (!card) continue;
        const cardSig = getCardSignature(card);
        if (seenSkillHandCards.has(cardSig)) continue;
        seenSkillHandCards.add(cardSig);

        // 【手札ツリー事前キャッシュ最適化】
        // 盤面・墓地・山札状態に依存するスキルを持たず、復活リーダースキルやリーダー召喚系スキルでない場合のみ、
        // 通常プレイ時に生成済みの cachedNormalHandTrees を安全に再利用する。
        const needsBoardAwareTree = BOARD_DEPENDENT_CARD_SKILLS.some((skId) =>
          hasSkill(card, skId)
        );
        let cachedCardPlayTree = null;
        if (
          !needsBoardAwareTree &&
          !isResurrectLeaderSkill &&
          action !== 'dungeon_summon_leader'
        ) {
          cachedCardPlayTree =
            cachedNormalHandTrees.get(i) ||
            buildCardPlayTree(card, i, 'play', hand, discard, [i], [], 0);
        }

        for (let tokenLanes of tokenLanePatterns) {
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
              // リーダーカードの配置レーンを推定（tokenLanes[0]、または最適化レーン評価）
              const leaderLane =
                tokenLanes && Array.isArray(tokenLanes) && tokenLanes.length > 0
                  ? tokenLanes[0]
                  : getBestSimulatedPlacementLane(
                      GameState,
                      'red',
                      leaderCard,
                      [0, 1, 2],
                      false
                    );

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
              if (
                isDngResurrect &&
                resLane !== -1 &&
                mySealedLanes[resLane] > 0
              )
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
                let qs = cachedCardPlayTree;
                const postLeaderSim =
                  action !== 'overdrive'
                    ? getPostLeaderSimState(
                        tokenLanes,
                        dIdxForTree,
                        resLane,
                        leaderSkillChain
                      )
                    : null;
                if (!qs) {
                  const chainUsedHand = [i];
                  const chainUsedDiscard =
                    !postLeaderSim &&
                    isResurrectLeaderSkill &&
                    dIdxForTree !== -1
                      ? [dIdxForTree]
                      : [];
                  const chainUsedDeck = [];
                  leaderSkillChain.forEach((act) => {
                    if (
                      (act.type === 'summon' ||
                        act.type === 'discard' ||
                        act.type === 'forge' ||
                        (act.type === 'invoke' && act.summonZone === 'hand')) &&
                      act.targetIdx !== undefined &&
                      act.targetIdx >= 0 &&
                      act.laneIdx !== -1
                    ) {
                      chainUsedHand.push(act.targetIdx);
                    }
                    if (
                      act.type === 'invoke' &&
                      Array.isArray(act.handSacrificeIndices)
                    ) {
                      act.handSacrificeIndices.forEach((hIdx) => {
                        if (hIdx >= 0 && !chainUsedHand.includes(hIdx)) {
                          chainUsedHand.push(hIdx);
                        }
                      });
                    }
                    if (
                      !postLeaderSim &&
                      act.type === 'resurrect' &&
                      act.targetIdx !== undefined &&
                      act.targetIdx >= 0 &&
                      act.laneIdx !== -1
                    ) {
                      chainUsedDiscard.push(act.targetIdx);
                    }
                    if (
                      !postLeaderSim &&
                      (act.type === 'assemble' ||
                        (act.type === 'invoke' && act.summonZone === 'deck')) &&
                      act.targetIdx !== undefined &&
                      act.targetIdx >= 0 &&
                      act.laneIdx !== -1
                    ) {
                      chainUsedDeck.push(act.targetIdx);
                    }
                  });

                  const effectiveDiscardForTree = postLeaderSim
                    ? postLeaderSim.enemyDiscard
                    : discard;
                  const treeStateOverride = postLeaderSim
                    ? {
                        myBoard: postLeaderSim.enemyBoard,
                        opBoard: postLeaderSim.playerBoard,
                        mySealedLanes: postLeaderSim.enemySealedLanes,
                        deck: postLeaderSim.enemyDeck,
                        opDiscard: postLeaderSim.playerDiscard,
                      }
                    : null;

                  qs = buildCardPlayTree(
                    card,
                    i,
                    'play',
                    hand,
                    effectiveDiscardForTree,
                    chainUsedHand,
                    chainUsedDiscard,
                    0,
                    undefined,
                    postLeaderSim ? undefined : leaderSkillContext,
                    chainUsedDeck,
                    treeStateOverride
                  );
                }
                for (let actionQ of qs) {
                  if (actionQ.length === 0) continue;
                  const fA = actionQ[0];

                  if (
                    action === 'devilhunter_resurrect' ||
                    action === 'overdrive'
                  ) {
                    let dIdx = dIdxForTree;
                    // overdriveの場合は相手墓地カードも重複排除済みの全通りをシミュレーションする
                    const currentOppDIdxLoop =
                      action === 'overdrive' ? oppDIdxLoop : [-1];
                    for (let oppDIdx of currentOppDIdxLoop) {
                      let preCombatSim =
                        action === 'devilhunter_resurrect' && postLeaderSim
                          ? processActionSequence(
                              actionQ,
                              false,
                              null,
                              null,
                              'before',
                              null,
                              null,
                              cloneSimState(postLeaderSim),
                              null,
                              null,
                              null,
                              true
                            )
                          : processActionSequence(
                              actionQ,
                              true,
                              action,
                              tokenLanes,
                              'before',
                              dIdx,
                              dIdx !== -1 && discard[dIdx]
                                ? discard[dIdx].uid
                                : null,
                              null,
                              resLane,
                              oppDIdx !== -1 ? oppDIdx : null,
                              null,
                              true
                            );
                      if (preCombatSim) {
                        let fChcs = [fA.choices, fA.choices2].filter(
                          (x) => x !== undefined
                        );
                        const resTargetCard = discard[dIdx];
                        // overdriveの相手墓地ターゲットUID（実行時の直接選択に使用）
                        const oppTargetCard =
                          oppDIdx !== -1 && oppDiscard[oppDIdx]
                            ? oppDiscard[oppDIdx]
                            : null;
                        evaluatePreCombatAndRecord(
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
                                        (adjusted.type === 'summon' ||
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
                          preCombatSim
                        );
                      }
                    }
                  } else {
                    // その他（聖なる軍勢・魔王の化身・世界の再構築・百鬼夜行・試練の宮殿リーダー召喚等）
                    let preCombatSim = postLeaderSim
                      ? processActionSequence(
                          actionQ,
                          false,
                          null,
                          null,
                          'before',
                          null,
                          null,
                          cloneSimState(postLeaderSim),
                          null,
                          null,
                          null,
                          true
                        )
                      : processActionSequence(
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
                          leaderSkillChain.length > 0 ? leaderSkillChain : null,
                          true
                        );
                    if (preCombatSim) {
                      let fChcs = [fA.choices, fA.choices2].filter(
                        (x) => x !== undefined
                      );
                      evaluatePreCombatAndRecord(
                        {
                          index: i,
                          lane: fA.laneIdx,
                          isOverwrite: myBoard[fA.laneIdx] !== null,
                          useSkill: true,
                          tokenLanes,
                          skillOrder: 'before',
                          choiceIndexQueue:
                            fChcs.length > 0 ? fChcs : undefined,
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
                                    (adjusted.type === 'summon' ||
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
                        preCombatSim
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
          // 既にシグネチャ重複排除済みの validResurrectIndices / oppDIdxLoop を再利用
          const passResIndices =
            validResurrectIndices.length > 0
              ? validResurrectIndices
              : action === 'overdrive' && validOppResurrectIndices.length > 0
                ? [-1]
                : [];
          const currentOppDIdxLoop =
            action === 'overdrive' ? oppDIdxLoop : [-1];

          for (const dIdx of passResIndices) {
            const resTargetCard = dIdx !== -1 ? discard[dIdx] : null;
            for (const oppDIdx of currentOppDIdxLoop) {
              const cachedPostSim =
                action === 'devilhunter_resurrect'
                  ? getPostLeaderSimState(tokenLanes, dIdx, -1, [])
                  : null;
              const preCombatSim = cachedPostSim
                ? cloneSimState(cachedPostSim)
                : processActionSequence(
                    [{ type: 'pass' }],
                    true,
                    action,
                    tokenLanes,
                    'before',
                    dIdx !== -1 ? dIdx : null,
                    resTargetCard ? resTargetCard.uid : null,
                    null,
                    null,
                    oppDIdx !== -1 ? oppDIdx : null,
                    null,
                    true
                  );
              if (preCombatSim) {
                // overdriveの相手墓地ターゲットUID（実行時の直接選択に使用）
                const oppTargetCardPass =
                  oppDIdx !== -1 && oppDiscard[oppDIdx]
                    ? oppDiscard[oppDIdx]
                    : null;
                evaluatePreCombatAndRecord(
                  {
                    index: -1,
                    lane: -1,
                    isOverwrite: false,
                    useSkill: true,
                    tokenLanes,
                    skillOrder: 'before',
                    leaderSkillTargetIdx: dIdx,
                    leaderSkillTargetUid: resTargetCard
                      ? resTargetCard.uid
                      : null,
                    leaderSkillOppTargetUid: oppTargetCardPass
                      ? oppTargetCardPass.uid
                      : undefined,
                  },
                  preCombatSim
                );
              }
            }
          }
        } else {
          const preCombatSim = processActionSequence(
            [{ type: 'pass' }],
            true,
            action,
            tokenLanes,
            'before',
            null,
            null,
            null,
            null,
            null,
            null,
            true
          );
          if (preCombatSim)
            evaluatePreCombatAndRecord(
              {
                index: -1,
                lane: -1,
                isOverwrite: false,
                useSkill: true,
                tokenLanes,
                skillOrder: 'before',
              },
              preCombatSim
            );
        }
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
        // 「招来」でスコアが同点の場合は山札（deck）からの降臨召喚を優先する
        if (a.type === 'invoke' && a.summonZone === 'deck') {
          c.tieBreaker += 0.05;
        }
        if (a.lanes && Array.isArray(a.lanes)) {
          a.lanes.forEach((l) => (c.tieBreaker += getLanePri(l) * 0.0001));
        } else if (a.laneIdx !== undefined && a.laneIdx !== -1) {
          c.tieBreaker += getLanePri(a.laneIdx) * 0.0001;
        }
      });
    }
    // ※ 手数（アクション数の短さ）の優先順位は、直後の候補ソート（aLen - bLen）および
    //    最善手絞り込み（minActionLen）において一元的に厳密適用されるため、tieBreakerでの減算は不要
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
  } else if (
    finalDecision.useSkill &&
    skill.action === 'daemon_call' &&
    finalDecision.leaderSkillTargetIdx !== undefined
  ) {
    const deckList = GameState.enemyDeck || [];
    const dcCard = finalDecision.leaderSkillTargetUid
      ? deckList.find(
          (c) =>
            c &&
            (c.uid === finalDecision.leaderSkillTargetUid ||
              c.id === finalDecision.leaderSkillTargetUid)
        )
      : deckList[finalDecision.leaderSkillTargetIdx];
    if (dcCard) resInfo = ` (DaemonCall: ${dcCard.name})`;
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
    finalDecision.leaderSkillTargetUid,
    null,
    null,
    null,
    finalDecision.leaderCardSkillActions || null
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

  // リーダースキル召喚カード（dungeon_summon_leader / daemon_call）の連鎖アクションも先頭へ平坦化登録する
  if (
    finalDecision.leaderCardSkillActions &&
    Array.isArray(finalDecision.leaderCardSkillActions)
  ) {
    if (!finalDecision.choiceIndexQueue) {
      finalDecision.choiceIndexQueue = [];
    }
    if (!finalDecision.cardTokenLanes) {
      finalDecision.cardTokenLanes = [];
    }
    const reversedLeaderChain = [
      ...finalDecision.leaderCardSkillActions,
    ].reverse();
    reversedLeaderChain.forEach((act) => {
      if (act.type === 'choice' || act.type === 'force') {
        if (act.choices2 !== undefined) {
          finalDecision.choiceIndexQueue.unshift(act.choices2);
        }
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
 * @return {number} 総合評価スコア
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
 * 指定陣営の戦闘フェーズ（ターン開始時パッシブ・加護解除・状態異常減衰・戦闘ダメージ計算・破壊処理）をシミュレートする共通関数。
 * 実戦の startTurn シーケンス（battleTurn.js の VALKYRIA_CLEAR 等）と同一の順序で、ターンプレイヤー（攻撃側陣営）の
 * 加護（戦乙女の加護、保護等）を解除し、盤面カードの状態（スタン・攻撃不能・無敵ターン）をターン開始時に減衰・同期させ、
 * 客観的かつ正確な戦闘計算を行います。
 *
 * ※本関数の呼び出し元（advanceCombatPhase / simulateMove）は、いずれも「相手陣営（防御側）の手番が終了した直後」に
 *   本関数を呼び出す前提です。そのため冒頭で、実戦の endTurnLogic と同様に防御側盤面の状態の初回減衰スキップを解除します。
 *
 * @param {object} simState - シミュレーション盤面状態
 * @param {'red' | 'blue'} attackerSide - 攻撃側陣営 ('blue' = プレイヤー, 'red' = 敵AI)
 * @returns {void}
 */
export function simulateCombatStep(simState, attackerSide) {
  const isRed = attackerSide === 'red';
  const board = isRed ? simState.enemyBoard : simState.playerBoard;
  const hpBeforeCombat = isRed ? simState.playerHP : simState.enemyHP;

  // 0. 直前の手番（防御側陣営）のターン終了処理：状態の初回減衰スキップを解除する（実戦の endTurnLogic と同一）
  clearStatusDecaySkips(isRed ? simState.playerBoard : simState.enemyBoard);

  // 1. パッシブスキルの適用（ターン開始時スキル・毒ダメージ・契約等）
  applyPassiveSkillLogic(simState, attackerSide);

  // 【重要】ターン開始時の加護解除：実戦（battleTurn.js の VALKYRIA_CLEAR フェーズ）と同様に、
  // ターンプレイヤー（攻撃側陣営）の加護（戦乙女の加護、保護等）を戦闘計算前に解除する
  clearValkyriaGuard(simState, attackerSide);

  // 2. 状態異常の持続ターン減衰（ターン開始時にターンプレイヤー側の盤面状態を減衰）
  // 共通API（decayCardStatus）を用いて直接プロパティとスキル枠スロットの同期・減衰・解除を一元処理する
  board.forEach((c) => {
    if (c) {
      decayCardStatus(c, 'stun');
      decayCardStatus(c, 'cant_attack');
      decayCardStatus(c, 'invincible');
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
 * @return {object} 戦闘フェーズ解決後のシミュレーション盤面状態
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
    // 手札プレイ、自ターンの召喚時スキル（choice/summon/resurrect等）、自ターン中の誘発など
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
 * @return {number} 評価スコア（AI(red)視点のスコア）
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
 * @return {number} 評価スコア
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
 * 号令・狂気・反魂、召集、および各種直前シミュレーションで共通利用する。
 * 盤面、手札、デッキ、墓地、HP/SP、封印レーン、turnCount、firstPlayer を含む完全なスキーマを持つ。
 *
 * @returns {object} シミュレーション用初期状態オブジェクト
 */
export function buildInitialSimState() {
  return {
    playerBoard: GameState.playerBoard.map(cloneCard),
    enemyBoard: GameState.enemyBoard.map(cloneCard),
    playerDiscard: GameState.playerDiscard ? [...GameState.playerDiscard] : [],
    enemyDiscard: GameState.enemyDiscard ? [...GameState.enemyDiscard] : [],
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
    playerHand: GameState.playerHand ? [...GameState.playerHand] : [],
    enemyHand: GameState.enemyHand ? GameState.enemyHand.map(cloneCard) : [],
    playerDeck: GameState.playerDeck ? [...GameState.playerDeck] : [],
    enemyDeck: GameState.enemyDeck ? [...GameState.enemyDeck] : [],
    playerConfig: createSimConfigSnapshot(GameState.playerConfig),
    enemyConfig: createSimConfigSnapshot(GameState.enemyConfig),
    extraTurnCount: GameState.extraTurnCount || 0,
    attackSkipCount: GameState.attackSkipCount || 0,
    valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
    valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
    turnCount: GameState.turnCount || 0,
    firstPlayer: GameState.firstPlayer,
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
 * @return {{ cardIdx: number, laneIdx: number, score: number }|null} 最善手（パスなら null）
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

      // スキル解決完了に伴い、誘発側陣営の保護フラグを解除（パワー0のスペルカードや生成トークンが確実に消滅するようにする）
      // ※相手陣営で召喚解決中（isSkillResolving === true）のカードの保護は維持する
      consumedCard.isSkillResolving = false;
      boardArray.forEach((bc) => {
        if (bc) bc.isSkillResolving = false;
      });

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
 * シミュレーション盤面の指定レーンにカードを配置・召喚・装備・合体する共通シミュレーション関数。
 * 「起動（startup）消滅」、「装備（canEquipCard）」、「合体（matchesUnionMaterial）」、
 * および通常の上書き墓地送りをゲームエンジン実戦処理と完全に一致させてシミュレートする。
 *
 * @param {object} simState - シミュレーション用ゲーム状態オブジェクト
 * @param {'red' | 'blue'} owner - プレイヤー ('red' | 'blue')
 * @param {number} laneIdx - 対象レーンインデックス (0〜2)
 * @param {object} card - 配置・召喚するカードオブジェクト
 * @param {boolean} isSummon - 召喚（スキル発動あり）の場合は true、配置（スキル不発）の場合は false
 * @param {object} [options={}] - 追加オプション（除外スキルID等）
 * @returns {{ activeCard: object|null, isEquipped: boolean, isUnion: boolean, isDispelled: boolean }} 盤面処理結果
 */
export function simulateCardPlacementOnBoard(
  simState,
  owner,
  laneIdx,
  card,
  isSummon,
  _options = {}
) {
  if (!simState || !card || laneIdx < 0 || laneIdx > 2) {
    return {
      activeCard: null,
      isEquipped: false,
      isUnion: false,
      isDispelled: false,
    };
  }

  const isRed = owner === 'red';
  const targetBoard = isRed ? simState.enemyBoard : simState.playerBoard;
  const targetDiscard = isRed ? simState.enemyDiscard : simState.playerDiscard;
  const existing = targetBoard[laneIdx];

  // 配置カードのクローンと初期化
  const placedCard = cloneCard(card);
  placedCard.owner = owner;
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

  // 1. 起動（startup）スキルの解除判定
  if (existing && hasSkill(existing, 'startup')) {
    consumeStartupSkill(existing);
    targetDiscard.push(placedCard);
    return {
      activeCard: existing,
      isEquipped: false,
      isUnion: false,
      isDispelled: true,
    };
  }

  // 2. 装備（canEquipCard）判定
  if (existing && canEquipCard(placedCard, existing)) {
    const { equipSkills } = applyEquipment(existing, placedCard);
    // 装備パッシブ/アクティブ効果のシミュレート
    applyActiveSkillLogic(
      simState,
      owner,
      laneIdx,
      'equip',
      0,
      [],
      null,
      laneIdx
    );

    // 召喚（isSummon === true）の場合のみ、装備カード自身が持つアクティブ召喚時スキルを発動
    // ※ 配置（isSummon === false: 復活・傀儡等）はゲームルール厳守でオンプレイスキル不発
    if (isSummon && Array.isArray(equipSkills)) {
      equipSkills.forEach((sk) => {
        // 連鎖召喚系スキルは個別管理のため即時実行をスキップ
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
          owner,
          laneIdx,
          sk.id,
          sk.value,
          [],
          null,
          undefined
        );
      });
    }

    return {
      activeCard: existing,
      isEquipped: true,
      isUnion: false,
      isDispelled: false,
    };
  }

  // 3. 合体（union）判定
  const unionSkill =
    placedCard.skills && placedCard.skills.find((s) => s.id === 'union');
  if (existing && unionSkill && matchesUnionMaterial(existing, unionSkill)) {
    const masterData =
      CARD_MASTER.find((c) => c.id === unionSkill.summonId) ||
      CARD_MASTER.find((c) => c.id === 'android');
    let unionCard = JSON.parse(JSON.stringify(masterData));
    unionCard.uid = `sim_union_${Math.floor(Math.random() * 1000000)}`;
    unionCard.owner = owner;
    unionCard.baseId = unionCard.id;
    unionCard.basePower = unionCard.power;
    unionCard.currentPower = unionCard.power;
    unionCard.stunTurns = 0;
    targetBoard[laneIdx] = unionCard;
    simState.lastPlayedLane = laneIdx;

    if (isSummon) {
      if (hasActiveSkill(unionCard)) {
        unionCard.isSkillResolving = true;
      }
      if (Array.isArray(unionCard.skills)) {
        unionCard.skills.forEach((sk) => {
          if (
            sk.id !== 'trigger' &&
            sk.id !== 'summon' &&
            sk.id !== 'assemble'
          ) {
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
      unionCard.isSkillResolving = false;
      unionCard.skillTriggered = true;
    } else {
      unionCard.skillTriggered = true; // 配置（復活等）では召喚時効果不発
    }

    return {
      activeCard: unionCard,
      isEquipped: false,
      isUnion: true,
      isDispelled: false,
    };
  }

  // 4. 通常の上書き配置
  if (existing && !existing.isToken) {
    targetDiscard.push(existing);
  }

  placedCard.skillTriggered = !isSummon;
  if (isSummon && hasActiveSkill(placedCard)) {
    placedCard.isSkillResolving = true;
  }

  targetBoard[laneIdx] = placedCard;
  simState.lastPlayedLane = laneIdx;

  if (isSummon && Array.isArray(placedCard.skills)) {
    placedCard.skills.forEach((sk) => {
      if (sk.id !== 'trigger' && sk.id !== 'summon' && sk.id !== 'assemble') {
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
    placedCard.isSkillResolving = false;
    placedCard.skillTriggered = true;
  }

  return {
    activeCard: placedCard,
    isEquipped: false,
    isUnion: false,
    isDispelled: false,
  };
}

/**
 * アドホックシミュレーションで決定された最善ブランチ（アクションシーケンス）の
 * 選択肢情報（choices / choices2）および連鎖アクションを GameState.aiDecision に同期する。
 *
 * @param {Array<object>} bestBranch - 最善アクションシーケンス
 */
export function syncAdhocDecision(bestBranch) {
  if (!bestBranch || bestBranch.length === 0) return;
  if (!GameState.aiDecision) {
    GameState.aiDecision = {};
  }
  if (!GameState.aiDecision.actionQueue) {
    GameState.aiDecision.actionQueue = [];
  }
  if (!GameState.aiDecision.choiceIndexQueue) {
    GameState.aiDecision.choiceIndexQueue = [];
  }

  // 1. 親アクション（インデックス0）が choices を持つ場合、choiceIndexQueue に登録
  const rootAct = bestBranch[0];
  if (rootAct) {
    if (rootAct.choices !== undefined) {
      GameState.aiDecision.choiceIndexQueue.unshift(rootAct.choices);
    }
    if (rootAct.choices2 !== undefined) {
      GameState.aiDecision.choiceIndexQueue.unshift(rootAct.choices2);
    }
  }

  // 2. 連鎖アクション（インデックス1以降）を actionQueue の先頭に追加
  const chainActions = bestBranch.slice(1);
  const reversedChain = [...chainActions].reverse();
  reversedChain.forEach((act) => {
    GameState.aiDecision.actionQueue.unshift(act);
    if (act.type === 'choice' || act.type === 'force') {
      if (act.choices !== undefined) {
        GameState.aiDecision.choiceIndexQueue.unshift(act.choices);
      }
    }
  });
}

/**
 * アドホック（直前）シミュレーション用のスキル分岐展開共通関数。
 * カードプレイまたはオンプレイによって誘発するスキル群（choice, force, ambush, clone, servant, puppet, resurrect, leap, forge, inspire, protection, dominate, execute, berserk等）
 * を再帰的にアクションキューとして展開する。
 *
 * @param {Array<object>} currentSkills - 解決対象のスキル配列
 * @param {number[]} currentUsedHand - 使用済み手札インデックス
 * @param {number[]} currentUsedDiscard - 使用済み墓地インデックス
 * @param {number} currentDepth - 再帰深さ
 * @param {Array<object>} currentDiscard - 一時的に墓地に送られたカード配列
 * @param {number} laneIdx - 親カードが置かれたレーン
 * @param {Array<object|null>} currentEnemyBoard - シミュレーション上のAI(red)盤面
 * @param {Array<object|null>} currentPlayerBoard - シミュレーション上のプレイヤー(blue)盤面
 * @param {object|null} [parentCard=null] - 親カードオブジェクト（choice/forceの選択肢取得やselfId特定用）
 * @param {'red' | 'blue'} [owner='red'] - 発動陣営
 * @param {object} [leaderSkillContext=undefined] - リーダースキルコンテキスト
 * @param {Array<object>|null} [currentHand=null] - シミュレーション上の手札配列（未指定時はGameStateからフォールバック）
 * @param {Array<object>|null} [currentDiscardPile=null] - シミュレーション上の自陣営墓地配列（未指定時はGameStateからフォールバック）
 * @param {Array<object>|null} [currentOppDiscardPile=null] - シミュレーション上の敵陣営墓地配列（未指定時はGameStateからフォールバック）
 * @return {Array<Array<object>>} アクションシーケンスの配列
 */
export function buildSkillBranchAdhoc(
  currentSkills,
  currentUsedHand,
  currentUsedDiscard,
  currentDepth,
  currentDiscard = [],
  laneIdx,
  currentEnemyBoard = null,
  currentPlayerBoard = null,
  parentCard = null,
  owner = 'red',
  leaderSkillContext = undefined,
  currentHand = null,
  currentDiscardPile = null,
  currentOppDiscardPile = null
) {
  if (currentSkills.length === 0 || currentDepth >= 4) return [[]];

  const isRed = owner === 'red';
  const sealedLanes = isRed
    ? GameState.enemySealedLanes || [0, 0, 0]
    : GameState.playerSealedLanes || [0, 0, 0];

  const activeEnemyBoard =
    currentEnemyBoard ||
    (GameState.enemyBoard ? [...GameState.enemyBoard] : [null, null, null]);
  const activePlayerBoard =
    currentPlayerBoard ||
    (GameState.playerBoard ? [...GameState.playerBoard] : [null, null, null]);
  const activeMyBoard = isRed ? activeEnemyBoard : activePlayerBoard;
  const activeOppBoard = isRed ? activePlayerBoard : activeEnemyBoard;

  const myHand =
    currentHand ||
    (isRed ? GameState.enemyHand || [] : GameState.playerHand || []);
  const myDiscard =
    currentDiscardPile ||
    (isRed ? GameState.enemyDiscard || [] : GameState.playerDiscard || []);
  const oppDiscard =
    currentOppDiscardPile ||
    (isRed ? GameState.playerDiscard || [] : GameState.enemyDiscard || []);
  const myDeck = isRed ? GameState.enemyDeck || [] : GameState.playerDeck || [];

  // 自己再帰用ヘルパー：シミュレーション手札・墓地コンテキスト（myHand, myDiscard, oppDiscard）を確実に引き継ぐ
  const callNextBranch = (
    nextSkills,
    nextUsedHand,
    nextUsedDiscard,
    nextDepth,
    nextDiscard,
    nextLane,
    nextEnemyBoard,
    nextPlayerBoard,
    nextParentCard,
    nextOwner = owner,
    nextLeaderSkillContext = leaderSkillContext
  ) => {
    return buildSkillBranchAdhoc(
      nextSkills,
      nextUsedHand,
      nextUsedDiscard,
      nextDepth,
      nextDiscard,
      nextLane,
      nextEnemyBoard,
      nextPlayerBoard,
      nextParentCard,
      nextOwner,
      nextLeaderSkillContext,
      myHand,
      myDiscard,
      oppDiscard
    );
  };

  let sk = currentSkills[0];
  let remainingSkills = currentSkills.slice(1);
  let results = [];

  const isPlacementSkill = [
    'clone',
    'servant',
    'ambush',
    'puppet',
    'resurrect',
    'execute',
    'inspire',
    'protection',
    'dominate',
  ].includes(sk.id);
  if (!isPlacementSkill) {
    results.push(
      ...callNextBranch(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        parentCard,
        owner,
        leaderSkillContext
      )
    );
  }

  if (sk.id === 'summon') {
    const selfId = parentCard ? parentCard.baseId || parentCard.id : null;
    const isExcludeBoard = Boolean(sk.excludeBoard);
    const { presentBoardCards, presentBoardIds } = collectPresentBoardTargets(
      activeMyBoard,
      isExcludeBoard
    );

    for (let i = 0; i < myHand.length; i++) {
      if (currentUsedHand.includes(i)) continue;
      let childCard = myHand[i];

      if (
        !matchesSummonTarget(childCard, sk, {
          selfId,
          presentBoardIds,
          presentBoardCards,
        })
      ) {
        continue;
      }

      let children = buildCardPlayTreeAdhoc(
        childCard,
        i,
        'summon',
        myHand,
        myDiscard,
        [...currentUsedHand, i],
        currentUsedDiscard,
        currentDepth + 1,
        undefined,
        leaderSkillContext,
        owner,
        true
      );
      for (let cNode of children) {
        const summonLane = cNode[0]?.laneIdx;
        const nextEnemyBoard = isRed ? [...activeEnemyBoard] : activeEnemyBoard;
        const nextPlayerBoard = !isRed
          ? [...activePlayerBoard]
          : activePlayerBoard;
        if (summonLane !== undefined && summonLane >= 0 && summonLane < 3) {
          if (isRed) nextEnemyBoard[summonLane] = childCard;
          else nextPlayerBoard[summonLane] = childCard;
        }
        let nextBranches = callNextBranch(
          remainingSkills,
          [...currentUsedHand, i],
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          nextEnemyBoard,
          nextPlayerBoard,
          parentCard,
          owner,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([...cNode, ...nb]);
        }
      }
    }
  } else if (sk.id === 'assemble') {
    const selfId = parentCard ? parentCard.baseId || parentCard.id : null;
    const isExcludeBoard = Boolean(sk.excludeBoard);
    const { presentBoardCards, presentBoardIds } = collectPresentBoardTargets(
      activeMyBoard,
      isExcludeBoard
    );

    const seenKeys = new Set();

    for (let i = 0; i < myDeck.length; i++) {
      let childCard = myDeck[i];
      if (!childCard) continue;

      const cardKey = childCard.baseId || childCard.id;
      if (seenKeys.has(cardKey)) continue;

      if (
        !matchesAssembleTarget(childCard, sk, {
          selfId,
          presentBoardIds,
          presentBoardCards,
        })
      ) {
        continue;
      }
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
        myHand,
        myDiscard,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth + 1,
        undefined,
        leaderSkillContext,
        owner,
        true
      );
      for (let cNode of children) {
        const assembleLane = cNode[0]?.laneIdx;
        const nextEnemyBoard = isRed ? [...activeEnemyBoard] : activeEnemyBoard;
        const nextPlayerBoard = !isRed
          ? [...activePlayerBoard]
          : activePlayerBoard;
        if (
          assembleLane !== undefined &&
          assembleLane >= 0 &&
          assembleLane < 3
        ) {
          if (isRed) nextEnemyBoard[assembleLane] = assembleCard;
          else nextPlayerBoard[assembleLane] = assembleCard;
        }
        let nextBranches = callNextBranch(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          nextEnemyBoard,
          nextPlayerBoard,
          parentCard,
          owner,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([...cNode, ...nb]);
        }
      }
    }
  } else if (sk.id === 'invoke') {
    const subsets = buildInvokeSacrificeSubsets(
      myHand,
      currentUsedHand,
      activeMyBoard,
      myDeck,
      []
    );

    for (const sub of subsets) {
      const nextUsedHandBase = [...currentUsedHand, ...sub.handIndices];
      const postSacMyBoard = activeMyBoard.map((bCard, bIdx) =>
        sub.boardLanes.includes(bIdx) ? null : bCard
      );
      const newlyDiscarded = [...currentDiscard];
      for (const bLane of sub.boardLanes) {
        const bc = activeMyBoard[bLane];
        if (bc && !bc.isToken) newlyDiscarded.push(bc);
      }
      for (const hIdx of sub.handIndices) {
        const hc = myHand[hIdx];
        if (hc && !hc.isToken) newlyDiscarded.push(hc);
      }
      const adhocInvokeChildOverride = {
        myBoard: postSacMyBoard,
        opBoard: isRed ? activePlayerBoard : activeEnemyBoard,
        initialDiscarded: newlyDiscarded,
      };

      // 1. 山札（デッキ）からの「降臨」召喚候補（スコアが同点以上の場合は山札を優先）
      const seenDeckSigs = new Set();
      for (let dIdx = 0; dIdx < myDeck.length; dIdx++) {
        const dCard = myDeck[dIdx];
        if (!matchesInvokeTarget(dCard, sub.totalPower)) continue;
        const sig = getCardSignature(dCard);
        if (seenDeckSigs.has(sig)) continue;
        seenDeckSigs.add(sig);

        const masterData = CARD_MASTER.find(
          (m) => m.id === (dCard.baseId || dCard.id)
        );
        const invokeDeckCard = masterData
          ? cloneCard(masterData)
          : cloneCard(dCard);
        invokeDeckCard.uid = dCard.uid || dCard.id;
        invokeDeckCard.baseId = dCard.baseId || dCard.id;
        invokeDeckCard.basePower = invokeDeckCard.power;
        invokeDeckCard.currentPower = invokeDeckCard.power;

        const children = buildCardPlayTreeAdhoc(
          invokeDeckCard,
          dIdx,
          'invoke',
          myHand,
          myDiscard,
          nextUsedHandBase,
          currentUsedDiscard,
          currentDepth + 1,
          undefined,
          leaderSkillContext,
          owner,
          true,
          [],
          adhocInvokeChildOverride
        );
        for (const cNode of children) {
          if (!cNode || cNode.length === 0) continue;
          const summonLane = cNode[0]?.laneIdx;
          if (summonLane === -1) continue;
          const enrichedRoot = {
            ...cNode[0],
            type: 'invoke',
            handSacrificeIndices: [...sub.handIndices],
            boardSacrificeLanes: [...sub.boardLanes],
            summonZone: 'deck',
            sourceLane: laneIdx,
            sourceUid: parentCard?.uid || parentCard?.id || null,
          };
          const nextEnemyBoard = isRed
            ? [...postSacMyBoard]
            : [...activeEnemyBoard];
          const nextPlayerBoard = !isRed
            ? [...postSacMyBoard]
            : [...activePlayerBoard];
          if (summonLane >= 0 && summonLane < 3) {
            if (isRed) nextEnemyBoard[summonLane] = invokeDeckCard;
            else nextPlayerBoard[summonLane] = invokeDeckCard;
          }
          const nextBranches = callNextBranch(
            remainingSkills,
            nextUsedHandBase,
            currentUsedDiscard,
            currentDepth,
            newlyDiscarded,
            laneIdx,
            nextEnemyBoard,
            nextPlayerBoard,
            parentCard,
            owner,
            leaderSkillContext
          );
          for (const nb of nextBranches) {
            results.push([enrichedRoot, ...cNode.slice(1), ...nb]);
          }
        }
      }

      // 2. 手札からの「降臨」召喚候補
      const seenHandSigs = new Set();
      for (let hIdx = 0; hIdx < myHand.length; hIdx++) {
        if (nextUsedHandBase.includes(hIdx)) continue;
        const hCard = myHand[hIdx];
        if (!matchesInvokeTarget(hCard, sub.totalPower)) continue;
        const sig = getCardSignature(hCard);
        if (seenHandSigs.has(sig)) continue;
        seenHandSigs.add(sig);

        const children = buildCardPlayTreeAdhoc(
          hCard,
          hIdx,
          'invoke',
          myHand,
          myDiscard,
          [...nextUsedHandBase, hIdx],
          currentUsedDiscard,
          currentDepth + 1,
          undefined,
          leaderSkillContext,
          owner,
          true,
          [],
          adhocInvokeChildOverride
        );
        for (const cNode of children) {
          if (!cNode || cNode.length === 0) continue;
          const summonLane = cNode[0]?.laneIdx;
          if (summonLane === -1) continue;
          const enrichedRoot = {
            ...cNode[0],
            type: 'invoke',
            handSacrificeIndices: [...sub.handIndices],
            boardSacrificeLanes: [...sub.boardLanes],
            summonZone: 'hand',
            sourceLane: laneIdx,
            sourceUid: parentCard?.uid || parentCard?.id || null,
          };
          const nextEnemyBoard = isRed
            ? [...postSacMyBoard]
            : [...activeEnemyBoard];
          const nextPlayerBoard = !isRed
            ? [...postSacMyBoard]
            : [...activePlayerBoard];
          if (summonLane >= 0 && summonLane < 3) {
            if (isRed) nextEnemyBoard[summonLane] = hCard;
            else nextPlayerBoard[summonLane] = hCard;
          }
          const nextBranches = callNextBranch(
            remainingSkills,
            [...nextUsedHandBase, hIdx],
            currentUsedDiscard,
            currentDepth,
            newlyDiscarded,
            laneIdx,
            nextEnemyBoard,
            nextPlayerBoard,
            parentCard,
            owner,
            leaderSkillContext
          );
          for (const nb of nextBranches) {
            results.push([enrichedRoot, ...cNode.slice(1), ...nb]);
          }
        }
      }
    }
  } else if (sk.id === 'forge') {
    for (let i = 0; i < myHand.length; i++) {
      if (currentUsedHand.includes(i)) continue;
      let childCard = myHand[i];

      const isEquip = hasSkill(childCard, 'equip');
      let validLanes = [];
      for (let j = 0; j < 3; j++) {
        if (activeMyBoard[j] !== null) {
          if (isEquip || hasSkill(activeMyBoard[j], 'arm_self')) {
            validLanes.push(j);
          }
        }
      }

      for (let vLane of validLanes) {
        let children = buildCardPlayTreeAdhoc(
          childCard,
          i,
          'forge',
          myHand,
          myDiscard,
          [...currentUsedHand, i],
          currentUsedDiscard,
          currentDepth + 1,
          vLane,
          leaderSkillContext,
          owner,
          true
        );
        for (let cNode of children) {
          let nextBranches = callNextBranch(
            remainingSkills,
            [...currentUsedHand, i],
            currentUsedDiscard,
            currentDepth,
            currentDiscard,
            laneIdx,
            activeEnemyBoard,
            activePlayerBoard,
            parentCard,
            owner,
            leaderSkillContext
          );
          for (let nb of nextBranches) {
            results.push([...cNode, ...nb]);
          }
        }
      }
    }

    let nextBranches = callNextBranch(
      remainingSkills,
      currentUsedHand,
      currentUsedDiscard,
      currentDepth,
      currentDiscard,
      laneIdx,
      activeEnemyBoard,
      activePlayerBoard,
      parentCard,
      owner,
      leaderSkillContext
    );
    for (let nb of nextBranches) {
      results.push([{ type: 'forge', targetIdx: -1, laneIdx: -1 }, ...nb]);
    }
  } else if (sk.id === 'leap') {
    let leapBranch = callNextBranch(
      remainingSkills,
      currentUsedHand,
      currentUsedDiscard,
      currentDepth,
      currentDiscard,
      laneIdx,
      activeEnemyBoard,
      activePlayerBoard,
      parentCard,
      owner,
      leaderSkillContext
    );
    for (let nb of leapBranch) {
      results.push([{ type: 'leap' }, ...nb]);
    }
  } else if (sk.id === 'resurrect') {
    const hasSpecificTarget =
      (Array.isArray(sk.targetIds) && sk.targetIds.length > 0) ||
      sk.targetId ||
      (typeof sk.targetKeyword === 'string' && sk.targetKeyword);
    const maxP = hasSpecificTarget
      ? undefined
      : sk.value !== undefined && sk.value !== null
        ? sk.value
        : 1;
    const candidates = [...myDiscard, ...currentDiscard];
    const isExcludeBoard = Boolean(sk.excludeBoard);
    const { presentBoardCards, presentBoardIds } = collectPresentBoardTargets(
      activeMyBoard,
      isExcludeBoard
    );

    for (let i = 0; i < candidates.length; i++) {
      if (currentUsedDiscard.includes(i)) continue;
      let resCard = candidates[i];

      if (
        !matchesResurrectTarget(resCard, sk, {
          presentBoardIds,
          presentBoardCards,
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
        let nextBranches = callNextBranch(
          remainingSkills,
          currentUsedHand,
          [...currentUsedDiscard, i],
          currentDepth,
          currentDiscard,
          laneIdx,
          activeEnemyBoard,
          activePlayerBoard,
          parentCard,
          owner,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([resNode, ...nb]);
        }
      }
    }

    let cancelNode = {
      type: 'resurrect',
      targetIdx: -1,
      laneIdx: -1,
    };
    let cancelBranches = callNextBranch(
      remainingSkills,
      currentUsedHand,
      currentUsedDiscard,
      currentDepth,
      currentDiscard,
      laneIdx,
      activeEnemyBoard,
      activePlayerBoard,
      parentCard,
      owner,
      leaderSkillContext
    );
    for (let nb of cancelBranches) {
      results.push([cancelNode, ...nb]);
    }
  } else if (sk.id === 'execute') {
    let occupiedLanes = [];
    for (let j = 0; j < 3; j++) {
      const simulatedBoardCard = activeMyBoard[j];
      if (simulatedBoardCard !== null) {
        occupiedLanes.push(j);
      }
    }

    if (occupiedLanes.length > 0) {
      const execVal =
        sk.value === undefined || sk.value === null || sk.value === 0
          ? 1
          : sk.value;
      const selectCount = Math.min(execVal, occupiedLanes.length);
      const combos = getCombinations(occupiedLanes, selectCount);
      const projectedState = createGuardProjectedState();

      for (const combo of combos) {
        let execNode = {
          type: 'execute',
          targetLane: combo[0],
          targetLanes: combo,
        };
        let newlyDiscarded = [...currentDiscard];
        const nextEnemyBoard = activeEnemyBoard.map((c) =>
          c ? { ...c } : null
        );
        const nextPlayerBoard = activePlayerBoard.map((c) =>
          c ? { ...c } : null
        );
        const nextMyBoard = isRed ? nextEnemyBoard : nextPlayerBoard;

        for (const tgtLane of combo) {
          const destroyedCard = activeMyBoard[tgtLane];
          const isDestroyable =
            destroyedCard &&
            canCardBeDestroyed(projectedState, destroyedCard, owner);
          if (isDestroyable) {
            if (!destroyedCard.isToken) {
              newlyDiscarded.push(destroyedCard);
            }
            const canPlaceSplitToken =
              !sealedLanes || sealedLanes[tgtLane] === 0;
            nextMyBoard[tgtLane] =
              hasSkill(destroyedCard, 'split') && canPlaceSplitToken
                ? createSplitSimToken(destroyedCard, tgtLane, owner)
                : null;
          }
        }

        let nextBranches = callNextBranch(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          newlyDiscarded,
          laneIdx,
          nextEnemyBoard,
          nextPlayerBoard,
          parentCard,
          owner,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([execNode, ...nb]);
        }
      }
    } else {
      return callNextBranch(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        parentCard,
        owner,
        leaderSkillContext
      );
    }
  } else if (sk.id === 'berserk') {
    const bVal = sk.value || 2;
    const adjLanes = laneIdx === 1 ? [0, 2] : [1];
    let newlyDiscarded = [...currentDiscard];
    adjLanes.forEach((j) => {
      const adjCard = activeMyBoard[j];
      if (adjCard && !adjCard.isToken) {
        const isImmune = hasSkill(adjCard, 'immune');
        const currentP = adjCard.currentPower ?? adjCard.power ?? 0;
        if (!isImmune && currentP <= bVal) {
          newlyDiscarded.push(adjCard);
        }
      }
    });

    return callNextBranch(
      remainingSkills,
      currentUsedHand,
      currentUsedDiscard,
      currentDepth,
      newlyDiscarded,
      laneIdx,
      activeEnemyBoard,
      activePlayerBoard,
      parentCard,
      owner,
      leaderSkillContext
    );
  } else if (sk.id === 'dominate') {
    const maxP = sk.value || 0;
    let validOppLanes = [];
    for (let j = 0; j < 3; j++) {
      if (
        activeOppBoard[j] &&
        (activeOppBoard[j].currentPower ?? activeOppBoard[j].power ?? 0) <=
          maxP &&
        sealedLanes[j] === 0
      ) {
        validOppLanes.push(j);
      }
    }

    for (let i of validOppLanes) {
      const myL = i;
      if (sealedLanes[myL] > 0) continue;
      let domNode = {
        type: 'dominate',
        oppLaneIdx: i,
        myLaneIdx: myL,
        maxP: maxP,
      };

      const nextEnemyBoard = activeEnemyBoard.map((c) => (c ? { ...c } : null));
      const nextPlayerBoard = activePlayerBoard.map((c) =>
        c ? { ...c } : null
      );
      const nextMyBoard = isRed ? nextEnemyBoard : nextPlayerBoard;
      const nextOppBoard = isRed ? nextPlayerBoard : nextEnemyBoard;

      const stolenCard = nextOppBoard[i];
      if (stolenCard) {
        nextMyBoard[myL] = {
          ...stolenCard,
          owner: owner,
        };
        nextOppBoard[i] = null;
      }

      let nextBranches = callNextBranch(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscard,
        laneIdx,
        nextEnemyBoard,
        nextPlayerBoard,
        parentCard,
        owner,
        leaderSkillContext
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
    let cancelBranches = callNextBranch(
      remainingSkills,
      currentUsedHand,
      currentUsedDiscard,
      currentDepth,
      currentDiscard,
      laneIdx,
      activeEnemyBoard,
      activePlayerBoard,
      parentCard,
      owner,
      leaderSkillContext
    );
    for (let nb of cancelBranches) {
      results.push([cancelNode, ...nb]);
    }
  } else if (sk.id === 'inspire') {
    const bVal = sk.value || 1;
    const otherOccupiedLanes = [0, 1, 2].filter(
      (j) => activeMyBoard[j] !== null && j !== laneIdx
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
        const nextPlayerBoard = activePlayerBoard.map((c) =>
          c ? { ...c } : null
        );
        const nextMyBoard = isRed ? nextEnemyBoard : nextPlayerBoard;
        if (nextMyBoard[tgtLane]) {
          nextMyBoard[tgtLane].currentPower =
            (nextMyBoard[tgtLane].currentPower || 0) + bVal;
        }
        let nextBranches = callNextBranch(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          nextEnemyBoard,
          nextPlayerBoard,
          parentCard,
          owner,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([inspireNode, ...nb]);
        }
      }
    } else {
      return callNextBranch(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        parentCard,
        owner,
        leaderSkillContext
      );
    }
  } else if (sk.id === 'protection') {
    const occupiedLanes = [0, 1, 2].filter((j) => activeMyBoard[j] !== null);
    if (occupiedLanes.length > 0) {
      for (let tgtLane of occupiedLanes) {
        let protectNode = {
          type: 'protection',
          targetLane: tgtLane,
        };
        const nextEnemyBoard = activeEnemyBoard.map((c) =>
          c ? { ...c } : null
        );
        const nextPlayerBoard = activePlayerBoard.map((c) =>
          c ? { ...c } : null
        );
        const nextMyBoard = isRed ? nextEnemyBoard : nextPlayerBoard;
        if (nextMyBoard[tgtLane]) {
          nextMyBoard[tgtLane].valkyriaGuard = true;
        }
        let nextBranches = callNextBranch(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          nextEnemyBoard,
          nextPlayerBoard,
          parentCard,
          owner,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([protectNode, ...nb]);
        }
      }
    } else {
      return callNextBranch(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        currentDiscard,
        laneIdx,
        activeEnemyBoard,
        activePlayerBoard,
        parentCard,
        owner,
        leaderSkillContext
      );
    }
  } else if (sk.id === 'convert' || sk.id === 'draw' || sk.id === 'reinforce') {
    const count = sk.value || 1;
    let handIndices = [];
    for (let i = 0; i < myHand.length; i++) {
      if (!currentUsedHand.includes(i)) handIndices.push(i);
    }

    if (handIndices.length > 0) {
      const actualCount = Math.min(count, handIndices.length);
      let combinations = getCombinations(handIndices, actualCount);
      for (let combo of combinations) {
        let discardNodes = combo.map((idx) => ({
          type: 'discard',
          targetIdx: idx,
          targetUid: myHand[idx]?.uid,
        }));
        let newlyDiscarded = combo.map((idx) => myHand[idx]);
        let nextBranches = callNextBranch(
          remainingSkills,
          [...currentUsedHand, ...combo],
          currentUsedDiscard,
          currentDepth,
          [...currentDiscard, ...newlyDiscarded],
          laneIdx,
          activeEnemyBoard,
          activePlayerBoard,
          parentCard,
          owner,
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

    let allCombos = [[]]; // 配置しない選択肢
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
      const {
        nextBoard: nextMyBoardAfterToken,
        nextDiscarded: nextDiscardAfterToken,
      } = applySimTokenComboToBoard(
        activeMyBoard,
        currentDiscard,
        combo,
        sk,
        (laneIdx >= 0 ? activeMyBoard[laneIdx] : null) || parentCard,
        sealedLanes,
        owner
      );
      const nextEnemyBoardAfterToken = isRed
        ? nextMyBoardAfterToken
        : activeEnemyBoard;
      const nextPlayerBoardAfterToken = isRed
        ? activePlayerBoard
        : nextMyBoardAfterToken;
      let nextBranches = callNextBranch(
        remainingSkills,
        currentUsedHand,
        currentUsedDiscard,
        currentDepth,
        nextDiscardAfterToken,
        laneIdx,
        nextEnemyBoardAfterToken,
        nextPlayerBoardAfterToken,
        parentCard,
        owner,
        leaderSkillContext
      );
      for (let nb of nextBranches) {
        results.push([tokenNode, ...nb]);
      }
    }
  } else if (sk.id === 'puppet') {
    const maxP = sk.value || 1;
    const candidates = [...oppDiscard];

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
        let nextBranches = callNextBranch(
          remainingSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          activeEnemyBoard,
          activePlayerBoard,
          parentCard,
          owner,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([puppetNode, ...nb]);
        }
      }
    }

    let cancelNode = {
      type: 'puppet',
      targetIdx: -1,
      laneIdx: -1,
      maxP: maxP,
    };
    let cancelBranches = callNextBranch(
      remainingSkills,
      currentUsedHand,
      currentUsedDiscard,
      currentDepth,
      currentDiscard,
      laneIdx,
      activeEnemyBoard,
      activePlayerBoard,
      parentCard,
      owner,
      leaderSkillContext
    );
    for (let nb of cancelBranches) {
      results.push([cancelNode, ...nb]);
    }
  } else if (sk.id === 'choice') {
    const cc = sk.value || 1;
    const cArr =
      sk.choiceGroup === 2 ? parentCard?.choices2 : parentCard?.choices;
    if (cArr) {
      let combinations = getUniqueChoiceCombinations(
        cArr,
        Math.min(cArr.length, cc)
      );
      for (let combo of combinations) {
        const chosenSkills = combo.map((idx) => cArr[idx]);
        let nextSkills = [...chosenSkills, ...remainingSkills];
        let choiceNode = {
          type: 'choice',
          choices: combo,
          choiceGroup: sk.choiceGroup,
        };
        let nextBranches = callNextBranch(
          nextSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          activeEnemyBoard,
          activePlayerBoard,
          parentCard,
          owner,
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
      sk.choiceGroup === 2 ? parentCard?.choices2 : parentCard?.choices;
    if (fArr) {
      let combinations = getUniqueChoiceCombinations(
        fArr,
        Math.min(fArr.length, fc)
      );
      for (let combo of combinations) {
        const chosenSkills = combo.map((idx) => fArr[idx]);
        let nextSkills = [...chosenSkills, ...remainingSkills];
        let forceNode = {
          type: 'force',
          choices: combo,
          choiceGroup: sk.choiceGroup,
        };
        let nextBranches = callNextBranch(
          nextSkills,
          currentUsedHand,
          currentUsedDiscard,
          currentDepth,
          currentDiscard,
          laneIdx,
          activeEnemyBoard,
          activePlayerBoard,
          parentCard,
          owner,
          leaderSkillContext
        );
        for (let nb of nextBranches) {
          results.push([forceNode, ...nb]);
        }
      }
    }
  } else {
    return callNextBranch(
      remainingSkills,
      currentUsedHand,
      currentUsedDiscard,
      currentDepth,
      currentDiscard,
      laneIdx,
      activeEnemyBoard,
      activePlayerBoard,
      parentCard,
      owner,
      leaderSkillContext
    );
  }
  return results;
}

/**
 * アドホック（直前）シミュレーション用の子カードプレイツリー構築共通関数。
 *
 * @param {object} card - プレイ対象カード
 * @param {number} sourceIdx - 手札/デッキ/墓地のインデックス
 * @param {string} sourceType - アクションタイプ ('play' | 'summon' | 'assemble' | 'resurrect' | 'puppet' | 'forge' | 'play_adhoc' 等)
 * @param {Array<object>} originalHand - 手札配列
 * @param {Array<object>} originalDiscard - 墓地配列
 * @param {number[]} usedHand - 使用済み手札インデックス
 * @param {number[]} usedDiscard - 使用済み墓地インデックス
 * @param {number} depth - ツリー深さ
 * @param {number} [forcedLane=undefined] - 配置レーン強制
 * @param {object} [leaderSkillContext=undefined] - リーダースキルコンテキスト
 * @param {'red' | 'blue'} [owner='red'] - 発動陣営
 * @param {boolean} [checkConstraints=true] - 召喚制約をチェックするか（召喚はtrue、配置はfalse）
 * @param {Array<object>} [pendingSkills=[]] - カードプレイ後に解決すべき待機スキル群
 * @param {object|null} [stateOverride=null] - 招来コスト破棄後等の盤面・墓地状態オーバーライド
 * @return {Array<Array<object>>} アクションシーケンスの配列
 */
export function buildCardPlayTreeAdhoc(
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
  owner = 'red',
  checkConstraints = true,
  pendingSkills = [],
  stateOverride = null
) {
  if (depth >= 4) return [[]];

  const isRed = owner === 'red';
  const sealedLanes =
    stateOverride?.sealedLanes ||
    (isRed
      ? GameState.enemySealedLanes || [0, 0, 0]
      : GameState.playerSealedLanes || [0, 0, 0]);
  const myBoard =
    stateOverride?.myBoard ||
    (isRed ? GameState.enemyBoard : GameState.playerBoard);
  const opBoard =
    stateOverride?.opBoard ||
    (isRed ? GameState.playerBoard : GameState.enemyBoard);

  let availableLanes = [0, 1, 2].filter((l) => sealedLanes[l] === 0);

  if (forcedLane !== undefined) {
    if (sealedLanes[forcedLane] > 0) return [[]];
    availableLanes = [forcedLane];
  } else if (depth > 0) {
    availableLanes.push(-1);
  }

  if (
    checkConstraints &&
    (sourceType === 'play' ||
      sourceType === 'summon' ||
      sourceType === 'assemble' ||
      sourceType === 'invoke')
  ) {
    if (sourceType === 'play' && hasSkill(card, 'advent')) {
      return [[]];
    }
    if (GameState.turnCount === 1 && GameState.firstPlayer === owner) {
      availableLanes = availableLanes.filter((l) => l === -1 || l === 1);
    }

    if (hasSkill(card, 'challenge')) {
      availableLanes = availableLanes.filter(
        (l) => l === -1 || opBoard[l] !== null
      );
    }
    if (hasSkill(card, 'legendary')) {
      availableLanes = availableLanes.filter((l) => l === -1 || l === 1);
    }
    // 生贄・頂点: summon/assemble/invoke時は親カード配置や破棄後の盤面がmyBoardに未反映のため、
    // プリフィルタをスキップしprocessActionSequenceの正確なsimStateチェックに委ねる（buildCardPlayTreeと同様）
    if (
      sourceType !== 'summon' &&
      sourceType !== 'assemble' &&
      sourceType !== 'invoke'
    ) {
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

  if (
    availableLanes.filter((l) => l !== -1).length === 0 &&
    !availableLanes.includes(-1)
  )
    return [[]];

  let choiceCombinations = [undefined];
  let choice2Combinations = [undefined];
  if (
    checkConstraints &&
    (hasSkill(card, 'choice') || hasSkill(card, 'force'))
  ) {
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
        const isSummonAction =
          checkConstraints &&
          [
            'play',
            'call',
            'forge',
            'summon',
            'assemble',
            'invoke',
            'play_adhoc',
          ].includes(sourceType);
        if (isSummonAction) {
          if (Array.isArray(card.skills)) {
            card.skills.forEach((s) => {
              if (
                [
                  'resurrect',
                  'convert',
                  'draw',
                  'reinforce',
                  'clone',
                  'servant',
                  'summon',
                  'assemble',
                  'invoke',
                  'ambush',
                  'puppet',
                  'leap',
                  'forge',
                  'inspire',
                  'protection',
                  'dominate',
                  'execute',
                  'berserk',
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

        if (Array.isArray(pendingSkills) && pendingSkills.length > 0) {
          pendingSkills.forEach((s) => {
            if (s && s.id !== 'choice' && s.id !== 'force') {
              effectiveSkills.push(s);
            }
          });
        }

        if (depth < 4 && effectiveSkills.length > 0) {
          let initialDiscarded = stateOverride?.initialDiscarded
            ? [...stateOverride.initialDiscarded]
            : [];
          if (lane !== -1 && myBoard[lane] !== null && !myBoard[lane].isToken) {
            initialDiscarded.push(myBoard[lane]);
          }
          const nextEnemyBoard = isRed
            ? myBoard.map((c) => (c ? { ...c } : null))
            : opBoard;
          const nextPlayerBoard = !isRed
            ? myBoard.map((c) => (c ? { ...c } : null))
            : opBoard;
          if (isRed) {
            nextEnemyBoard[lane] = { ...card, owner: 'red' };
          } else {
            nextPlayerBoard[lane] = { ...card, owner: 'blue' };
          }

          let skillChains = buildSkillBranchAdhoc(
            effectiveSkills,
            usedHand,
            usedDiscard,
            depth,
            initialDiscarded,
            lane,
            nextEnemyBoard,
            nextPlayerBoard,
            card,
            owner,
            leaderSkillContext,
            originalHand,
            originalDiscard
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

/**
 * 復活（resurrect）および傀儡（puppet）のアドホック（解決時）シミュレーション評価。
 *
 * 【手抜き簡易シミュレーションの完全削除と完全多段シミュレーション化】
 * 墓地の候補カードそれぞれについて、配置後の連鎖スキルを多段ツリー展開（buildCardPlayTreeAdhoc）し、
 * processActionSequence による完全シミュレーションを実行。
 * 最善カードと配置レーンを決定し、後続アクションを同期する。
 *
 * @param {Array<object>} validCards - 墓地内の有効な復活・傀儡対象カード群
 * @param {'red' | 'blue'} [owner='red'] - スキル発動者 ('red' | 'blue')
 * @param {boolean} [isPuppet=false] - 傀儡（相手墓地からの配置）かどうか
 * @return {{ selectedCard: object|null, laneIdx: number|null }} 最善カードと配置レーン
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

  // 1. パス基準スコア（何もしない状態のスコア）を算出
  let passScore;
  {
    const passSimState = structuredClone(initialSimState);
    passScore = evaluateTurnOutcome(passSimState, owner);
  }
  let bestScore = passScore;
  let bestChoice = { selectedCard: null, laneIdx: null };
  let bestBranch = null;

  const sealedLanes = isRed
    ? initialSimState.enemySealedLanes || [0, 0, 0]
    : initialSimState.playerSealedLanes || [0, 0, 0];

  const candidateLanes = [0, 1, 2].filter((l) => sealedLanes[l] === 0);
  if (candidateLanes.length === 0) {
    return { selectedCard: null, laneIdx: null };
  }

  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 }; // 左(1) > 右(2) > 中央(3)
  const seenSignatures = new Set();

  for (let cardIdx = 0; cardIdx < validCards.length; cardIdx++) {
    const card = validCards[cardIdx];
    if (!card) continue;
    const sig = `${card.id || card.baseId}_${card.power || 0}_${(card.skills || []).map((s) => s.id).join(',')}`;
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);

    for (const lane of candidateLanes) {
      // 復活・傀儡は「配置（Place）」のため checkConstraints = false
      const actionBranches = buildCardPlayTreeAdhoc(
        card,
        cardIdx,
        isPuppet ? 'puppet' : 'resurrect',
        isRed ? initialSimState.enemyHand : initialSimState.playerHand,
        isRed ? initialSimState.enemyDiscard : initialSimState.playerDiscard,
        [],
        [cardIdx],
        0,
        lane,
        undefined,
        owner,
        false
      );

      for (const branch of actionBranches) {
        if (!branch || branch.length === 0) continue;

        const simState = processActionSequence(
          branch,
          false,
          null,
          null,
          'before',
          null,
          null,
          structuredClone(initialSimState)
        );
        if (!simState) continue;

        // 召集アクション解決および戦闘フェーズ完了後の盤面状態を総合評価関数で採点
        const rawScore = evaluateSimState(simState);

        // パス以下ならスキップ
        if (isRed ? rawScore <= passScore : rawScore >= passScore) {
          continue;
        }

        const score =
          rawScore + (isRed ? 0.001 : -0.001) / lanePriorityOrder[lane];

        if (isRed) {
          if (score > bestScore) {
            bestScore = score;
            bestChoice = { selectedCard: card, laneIdx: lane };
            bestBranch = branch;
          }
        } else {
          if (score < bestScore) {
            bestScore = score;
            bestChoice = { selectedCard: card, laneIdx: lane };
            bestBranch = branch;
          }
        }
      }
    }
  }

  if (bestChoice.selectedCard && bestBranch) {
    syncAdhocDecision(bestBranch);
  }

  return bestChoice;
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
 * @return {number|null} 最善対象レーン番号（対象なしの場合は null）
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
 * @return {number|null} 最善対象レーン番号（対象なしの場合は null）
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
 * @return {number} 奪う対象の相手レーン番号（キャンセルが最善の場合は -1）
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
 * @return {Array<number>} 破壊対象とする最善レーン番号の配列
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
    const targetSealedLanes = isRed
      ? simState.enemySealedLanes
      : simState.playerSealedLanes;
    const selectedTargets = candidateLanes.map((l) => ({
      lane: l,
      card: targetBoard[l],
    }));

    for (const { lane: l, card: expectedCard } of selectedTargets) {
      const cardToDestroy = targetBoard[l];
      if (cardToDestroy && cardToDestroy === expectedCard) {
        if (!canCardBeDestroyed(simState, cardToDestroy, owner)) {
          continue;
        }
        if (hasSkill(cardToDestroy, 'split')) {
          quietDiscardFromBoard(simState, owner, l);
          if (!targetSealedLanes || targetSealedLanes[l] === 0) {
            targetBoard[l] = createSplitSimToken(cardToDestroy, l, owner);
          }
        } else {
          quietDiscardFromBoard(simState, owner, l);
        }

        // 誘爆(explode): 隣接カードへダメージを与え破壊トリガーを処理
        if (hasSkill(cardToDestroy, 'explode')) {
          const dmg = getSkillValue(cardToDestroy, 'explode') || 3;
          [l - 1, l + 1].forEach((adj) => {
            if (adj >= 0 && adj < 3 && targetBoard[adj]) {
              damageCard(simState, owner, adj, dmg, 'explode', [], true);
            }
          });
          processDestructionTriggers(simState, []);
        }

        // 報復(retaliate): 自陣生存カードのパワー上昇
        const isReversedRetaliate = isReverseActive(simState);
        targetBoard.forEach((allyCard) => {
          if (allyCard && hasSkill(allyCard, 'retaliate')) {
            let buffVal = getSkillValue(allyCard, 'retaliate') || 2;
            if (isReversedRetaliate) buffVal = -buffVal;
            allyCard.currentPower += buffVal;
          }
        });
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
 * 共通関数 evaluateAdhocCardDestructionChoice に委譲して指定枚数の破壊対象レーン配列を返す。
 *
 * @param {Array<object|null>} myBoard - 自軍の盤面配列
 * @param {number | 'red' | 'blue'} [selectCount=1] - 破壊対象とするカード枚数（後方互換で owner 文字列も許容）
 * @param {'red' | 'blue'} [owner='red'] - 発動側プレイヤー種別
 * @return {Array<number>} 破壊対象とする最善レーン番号の配列
 */
export function evaluateAdhocExecuteChoice(
  myBoard,
  selectCount = 1,
  owner = 'red'
) {
  if (typeof selectCount === 'string') {
    owner = selectCount;
    selectCount = 1;
  }
  return evaluateAdhocCardDestructionChoice(myBoard, selectCount, owner);
}

/**
 * 選別（cull）のアドホック（発動直前）シミュレーション評価。
 * 共通関数 evaluateAdhocCardDestructionChoice に委譲して指定枚数の破壊対象レーン配列を返す。
 *
 * @param {Array<object|null>} myBoard - 選別を受けた側の盤面配列（自軍）
 * @param {number} [selectCount=1] - 破壊対象とするカード枚数
 * @param {'red' | 'blue'} [owner='red'] - プレイヤー種別
 * @return {Array<number>} 破壊対象とする最善レーン番号の配列
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
 *
 * 【手抜き簡易シミュレーションの完全削除と完全多段シミュレーション化】
 * 手札内の有効候補カードそれぞれについて、選択スキル（choice/force）や後続スキル（ambush, servant等）
 * を多段ツリー展開（buildCardPlayTreeAdhoc）し、processActionSequence による完全シミュレーションを実行。
 * 最善カード、配置レーン、選択肢（choices）、および後続連鎖アクションを決定・同期する。
 *
 * @param {Array<object>} hand - 手札カード配列
 * @param {object} skObj - スキル定義オブジェクト
 * @param {string|null} selfId - 発動元カードID
 * @param {Array<string>} presentBoardIds - 盤面に既に存在するカードID群
 * @param {number} defaultLane - フォールバック先レーン番号
 * @param {'red' | 'blue'} [owner='red'] - プレイヤー種別
 * @param {Array<object>|null} [presentBoardCards=null] - 盤面に配置済みの実カードオブジェクト配列（未指定時は初期シミュレーション状態から取得）
 * @returns {{ selectedIdx: number, laneIdx: number }} 最善手札インデックスと配置レーン（パス時は selectedIdx: -1）
 */
export function evaluateAdhocSummonMove(
  hand,
  skObj,
  selfId,
  presentBoardIds,
  defaultLane,
  owner = 'red',
  presentBoardCards = null
) {
  if (!hand || hand.length === 0) {
    return { selectedIdx: -1, laneIdx: defaultLane };
  }

  const isRed = owner === 'red';
  const initialSimState = buildInitialSimState();
  const sealed = isRed
    ? initialSimState.enemySealedLanes
    : initialSimState.playerSealedLanes;
  const availableLanes = [0, 1, 2].filter((l) => !sealed || sealed[l] === 0);

  if (availableLanes.length === 0) {
    return { selectedIdx: -1, laneIdx: defaultLane };
  }

  // 1. パス基準スコア（何もしない状態のスコア）を算出
  let bestScore;
  {
    const passSimState = structuredClone(initialSimState);
    bestScore = evaluateTurnOutcome(passSimState, owner);
  }
  let bestIdx = -1;
  let bestLane = defaultLane;
  let bestBranch = null;

  const seenSignatures = new Set();
  const resolvedBoardCards = Array.isArray(presentBoardCards)
    ? presentBoardCards
    : isRed
      ? initialSimState.enemyBoard.filter(Boolean)
      : initialSimState.playerBoard.filter(Boolean);

  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    if (!card) continue;
    if (
      !matchesSummonTarget(card, skObj, {
        selfId,
        presentBoardIds,
        presentBoardCards: resolvedBoardCards,
      })
    )
      continue;

    const sig = getCardSignature(card);
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);

    // 召喚制約の事前チェック
    const validLanes = getValidSummonLanes(owner, card, initialSimState);
    if (validLanes.length === 0) continue;

    // 多段ツリー展開（選択スキルや後続スキルを完全展開）
    const actionBranches = buildCardPlayTreeAdhoc(
      card,
      i,
      'summon',
      isRed ? initialSimState.enemyHand : initialSimState.playerHand,
      isRed ? initialSimState.enemyDiscard : initialSimState.playerDiscard,
      [i],
      [],
      0,
      undefined,
      undefined,
      owner,
      true
    );

    for (const branch of actionBranches) {
      if (!branch || branch.length === 0) continue;
      const summonLane = branch[0].laneIdx;
      if (summonLane === -1 || !availableLanes.includes(summonLane)) continue;

      // アクションシーケンスを完全シミュレーション実行
      const simState = processActionSequence(
        branch,
        false,
        null,
        null,
        'before',
        null,
        null,
        structuredClone(initialSimState)
      );
      if (!simState) continue;

      // 召喚アクション解決および戦闘フェーズ完了後の盤面状態を総合評価関数で採点
      const score = evaluateSimState(simState);

      // タイブレーク用レーン優先順位：左(1) > 右(2) > 中央(3)
      const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };
      const currentPri = lanePriorityOrder[summonLane] || 99;
      const bestPri = lanePriorityOrder[bestLane] || 99;

      if (isRed) {
        if (score > bestScore + 0.00001) {
          bestScore = score;
          bestIdx = i;
          bestLane = summonLane;
          bestBranch = branch;
        } else if (Math.abs(score - bestScore) <= 0.00001) {
          // 「同じ結果をもたらす場合は手が少ないものを選ぶ原則」の徹底
          // パス（何もしない）は手数0なので、bestBranchがnull（パス）の時に同点なら、手数1以上のブランチには更新しない（パスを優先）
          if (bestBranch !== null) {
            const currentLen = branch.length;
            const bestLen = bestBranch.length;
            if (currentLen < bestLen) {
              bestScore = score;
              bestIdx = i;
              bestLane = summonLane;
              bestBranch = branch;
            } else if (currentLen === bestLen && currentPri < bestPri) {
              bestScore = score;
              bestIdx = i;
              bestLane = summonLane;
              bestBranch = branch;
            }
          }
        }
      } else {
        if (score < bestScore - 0.00001) {
          bestScore = score;
          bestIdx = i;
          bestLane = summonLane;
          bestBranch = branch;
        } else if (Math.abs(score - bestScore) <= 0.00001) {
          if (bestBranch !== null) {
            const currentLen = branch.length;
            const bestLen = bestBranch.length;
            if (currentLen < bestLen) {
              bestScore = score;
              bestIdx = i;
              bestLane = summonLane;
              bestBranch = branch;
            } else if (currentLen === bestLen && currentPri < bestPri) {
              bestScore = score;
              bestIdx = i;
              bestLane = summonLane;
              bestBranch = branch;
            }
          }
        }
      }
    }
  }

  // 最善手が見つかった場合、GameState.aiDecision に選択情報と連鎖アクションを同期
  if (bestIdx !== -1 && bestBranch) {
    syncAdhocDecision(bestBranch);
  }

  return { selectedIdx: bestIdx, laneIdx: bestLane };
}

/**
 * 召集（assemble）のアドホック（発動直前）シミュレーション評価。
 *
 * 【手抜き簡易シミュレーションの完全削除と完全多段シミュレーション化】
 * デッキ内の有効候補カードそれぞれについて、選択スキル（choice/force）や後続スキル（ambush, summon等）
 * を多段ツリー展開（buildCardPlayTreeAdhoc）し、processActionSequence による完全シミュレーションを実行。
 * 最善カードを決定し、後続アクションを同期する。
 *
 * @param {Array<object>} deck - デッキ配列
 * @param {object} skObj - スキル定義オブジェクト
 * @param {string|null} selfId - 発動元カードID
 * @param {number} defaultLane - 召喚先レーン番号
 * @param {'red' | 'blue'} [owner='red'] - プレイヤー種別
 * @param {Array<string>} [presentBoardIds=[]] - 盤面に配置済みのカードID配列（excludeBoard用）
 * @param {Array<object>|null} [presentBoardCards=null] - 盤面に配置済みの実カードオブジェクト配列（未指定時は初期シミュレーション状態から取得）
 * @param {object} [options={}] - 評価オプション
 * @param {boolean} [options.allowPass=true] - パス（召喚しない）を選択肢として許容するか（強制召喚時は false）
 * @param {boolean} [options.returnDetail=false] - true の場合 `{ card, lane }` 形式で最善レーンも併せて返す
 * @return {object|null} 最善カードオブジェクト（パスなら null）、または `returnDetail: true` 時は `{ card: object|null, lane: number }`
 */
export function evaluateAdhocAssembleMove(
  deck,
  skObj,
  selfId,
  defaultLane,
  owner = 'red',
  presentBoardIds = [],
  presentBoardCards = null,
  options = {}
) {
  const { allowPass = true, returnDetail = false } = options;
  const emptyResult = returnDetail ? { card: null, lane: -1 } : null;
  if (!deck || deck.length === 0 || defaultLane < 0 || defaultLane > 2) {
    return emptyResult;
  }

  const initialSimState = buildInitialSimState();
  const isRed = owner === 'red';
  const resolvedBoardCards = Array.isArray(presentBoardCards)
    ? presentBoardCards
    : isRed
      ? initialSimState.enemyBoard.filter(Boolean)
      : initialSimState.playerBoard.filter(Boolean);

  const validCards = deck.filter((card) =>
    matchesAssembleTarget(card, skObj, {
      selfId,
      presentBoardIds,
      presentBoardCards: resolvedBoardCards,
    })
  );

  if (validCards.length === 0) return emptyResult;

  const seenCards = new Set();
  const uniqueCards = [];
  for (const card of validCards) {
    const k = getCardSignature(card);
    if (!seenCards.has(k)) {
      seenCards.add(k);
      uniqueCards.push(card);
    }
  }

  const sealed = isRed
    ? initialSimState.enemySealedLanes
    : initialSimState.playerSealedLanes;
  const unsealedLanes = [0, 1, 2].filter((l) => !sealed || sealed[l] === 0);

  if (unsealedLanes.length === 0) return emptyResult;

  // パス（召集を行わない）シミュレーション状態のスコアをベースラインとして算出（強制召喚時は無限大から開始）
  let bestScore = isRed ? -Infinity : Infinity;
  if (allowPass) {
    const passSimState = processActionSequence(
      [{ type: 'play_adhoc', card: null, laneIdx: -1 }],
      false,
      null,
      null,
      'before',
      null,
      null,
      structuredClone(initialSimState)
    );
    bestScore = passSimState
      ? evaluateSimState(passSimState)
      : isRed
        ? -Infinity
        : Infinity;
  }

  let bestCard = null;
  let bestBranch = null;

  for (const card of uniqueCards) {
    const dIdx = deck.indexOf(card);
    const actionBranches = buildCardPlayTreeAdhoc(
      card,
      dIdx !== -1 ? dIdx : 0,
      'assemble',
      isRed ? initialSimState.enemyHand : initialSimState.playerHand,
      isRed ? initialSimState.enemyDiscard : initialSimState.playerDiscard,
      [],
      [],
      0,
      undefined,
      undefined,
      owner,
      true
    );

    for (const branch of actionBranches) {
      if (!branch || branch.length === 0) continue;
      const assembleLane = branch[0].laneIdx;
      if (assembleLane === -1 || !unsealedLanes.includes(assembleLane))
        continue;

      const simState = processActionSequence(
        branch,
        false,
        null,
        null,
        'before',
        null,
        null,
        structuredClone(initialSimState)
      );
      if (!simState) continue;

      // 召集アクション解決および戦闘フェーズ完了後の盤面状態を総合評価関数で採点
      const score = evaluateSimState(simState);

      // タイブレーク用レーン優先順位：左(1) > 右(2) > 中央(3)
      const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };
      const currentPri = lanePriorityOrder[assembleLane] || 99;
      const bestPri = lanePriorityOrder[bestBranch?.[0]?.laneIdx] || 99;

      if (isRed) {
        if (score > bestScore + 0.00001) {
          bestScore = score;
          bestCard = card;
          bestBranch = branch;
        } else if (Math.abs(score - bestScore) <= 0.00001) {
          // 「同じ結果をもたらす場合は手が少ないものを選ぶ原則」の徹底
          // パス（何もしない）は手数0なので、bestBranchがnull（パス）の時に同点なら、手数1以上のブランチには更新しない（パスを優先）
          if (bestBranch !== null) {
            const currentLen = branch.length;
            const bestLen = bestBranch.length;
            if (currentLen < bestLen) {
              bestScore = score;
              bestCard = card;
              bestBranch = branch;
            } else if (currentLen === bestLen && currentPri < bestPri) {
              bestScore = score;
              bestCard = card;
              bestBranch = branch;
            }
          }
        }
      } else {
        if (score < bestScore - 0.00001) {
          bestScore = score;
          bestCard = card;
          bestBranch = branch;
        } else if (Math.abs(score - bestScore) <= 0.00001) {
          if (bestBranch !== null) {
            const currentLen = branch.length;
            const bestLen = bestBranch.length;
            if (currentLen < bestLen) {
              bestScore = score;
              bestCard = card;
              bestBranch = branch;
            } else if (currentLen === bestLen && currentPri < bestPri) {
              bestScore = score;
              bestCard = card;
              bestBranch = branch;
            }
          }
        }
      }
    }
  }

  if (bestBranch) {
    syncAdhocDecision(bestBranch);
  }

  if (returnDetail) {
    return {
      card: bestCard,
      lane: bestBranch?.[0]?.laneIdx ?? -1,
    };
  }

  return bestCard;
}

/**
 * 「招来（invoke）」スキル用に、手札および自陣盤面のカードから
 * 冗長な重複・無駄な過剰破棄を除いた極小破棄サブセット群を列挙する共通関数。
 *
 * 【最適化と網羅性の両立】
 * 1. 手札の「虚空（token_void）」は破棄してもパワー0かつ虚空1枚が戻る無意味操作のため候補から除外する。
 * 2. 同一シグネチャの手札カードはプレフィックス個数のみを展開し、同値な組み合わせ爆発を排除する。
 * 3. 手札・山札内の「降臨」要求値集合 R に対し、ある r ∈ R を満たすために全要素が必要不可欠な極小集合
 *    （および0枚破棄・狂気カードを含む集合）のみを抽出し、最適手を1つも落とさず高速に列挙する。
 *
 * @param {Array<object|null>} hand - 現在の手札配列
 * @param {Array<number>} usedHandIndices - 既に使用済みの手札インデックス配列
 * @param {Array<object|null>} board - 現在の自陣盤面配列（長さ3）
 * @param {Array<object|null>} deck - 現在の山札配列
 * @param {Array<number>} [usedDeckIndices=[]] - 既に使用済みの山札インデックス配列
 * @returns {Array<{ handIndices: number[], boardLanes: number[], totalPower: number }>} 破棄サブセット候補配列
 */
function buildInvokeSacrificeSubsets(
  hand,
  usedHandIndices,
  board,
  deck,
  usedDeckIndices = []
) {
  const safeHand = Array.isArray(hand) ? hand : [];
  const safeBoard = Array.isArray(board) ? board : [null, null, null];
  const safeDeck = Array.isArray(deck) ? deck : [];

  // 手札・山札に存在する「降臨」カードの要求値セットを収集
  const adventReqSet = new Set();
  for (let i = 0; i < safeHand.length; i++) {
    if (usedHandIndices.includes(i) || !safeHand[i]) continue;
    const req = getAdventRequirement(safeHand[i]);
    if (req !== null) adventReqSet.add(req);
  }
  for (let d = 0; d < safeDeck.length; d++) {
    if (usedDeckIndices.includes(d) || !safeDeck[d]) continue;
    const req = getAdventRequirement(safeDeck[d]);
    if (req !== null) adventReqSet.add(req);
  }
  const adventReqs = [...adventReqSet];

  // 盤面上のカードが存在するレーン一覧（最大3要素）
  const boardSlots = [0, 1, 2].filter((lane) => safeBoard[lane] !== null);

  // 手札の破棄候補（虚空を除く）を収集し、極端な大量手札時の安全上限（最大6枠）を設定
  const eligibleHandItems = [];
  for (let i = 0; i < safeHand.length; i++) {
    if (usedHandIndices.includes(i)) continue;
    const hc = safeHand[i];
    if (!hc) continue;
    if (hc.id === 'token_void' || hc.baseId === 'token_void') continue;
    const curPow = getCardCurrentPower(hc);
    eligibleHandItems.push({
      idx: i,
      card: hc,
      sig: `${getCardSignature(hc)}_${curPow}`,
      curPow,
      isMadness: hasSkill(hc, 'madness'),
    });
  }
  eligibleHandItems.sort((a, b) => {
    if (a.isMadness !== b.isMadness) return a.isMadness ? -1 : 1;
    return b.curPow - a.curPow;
  });
  const boundedHandItems = eligibleHandItems.slice(0, 6);

  // 同一シグネチャごとにグループ化（同種カードは先頭から k 枚選ぶパターンのみ展開）
  const sigGroups = [];
  const sigMap = new Map();
  for (const item of boundedHandItems) {
    if (!sigMap.has(item.sig)) {
      const grp = [];
      sigMap.set(item.sig, grp);
      sigGroups.push(grp);
    }
    sigMap.get(item.sig).push(item.idx);
  }

  const handSubsets = [[]];
  for (const grp of sigGroups) {
    const prevLen = handSubsets.length;
    for (let p = 0; p < prevLen; p++) {
      for (let count = 1; count <= grp.length; count++) {
        handSubsets.push([...handSubsets[p], ...grp.slice(0, count)]);
      }
    }
  }

  const boardSubsets = [[]];
  for (const bLane of boardSlots) {
    const prevLen = boardSubsets.length;
    for (let p = 0; p < prevLen; p++) {
      boardSubsets.push([...boardSubsets[p], bLane]);
    }
  }

  const results = [];
  for (const hSub of handSubsets) {
    for (const bSub of boardSubsets) {
      if (hSub.length === 0 && bSub.length === 0) {
        results.push({ handIndices: [], boardLanes: [], totalPower: 0 });
        continue;
      }

      let totalPower = 0;
      let hasMadness = false;
      for (const hIdx of hSub) {
        totalPower += getCardCurrentPower(safeHand[hIdx]);
        if (hasSkill(safeHand[hIdx], 'madness')) hasMadness = true;
      }
      for (const bLane of bSub) {
        totalPower += getCardCurrentPower(safeBoard[bLane]);
      }

      if (adventReqs.length === 0 && !hasMadness) continue;

      // 極小性判定: いずれかの要求値 req (<= totalPower) に対し、
      // 非狂気の全要素が totalPower >= req の達成に不可欠である場合のみ採用する
      const isMinimalForSomeAdvent = adventReqs.some((req) => {
        if (totalPower < req) return false;
        for (const hIdx of hSub) {
          if (hasSkill(safeHand[hIdx], 'madness')) continue;
          if (totalPower - getCardCurrentPower(safeHand[hIdx]) >= req) {
            return false;
          }
        }
        for (const bLane of bSub) {
          if (totalPower - getCardCurrentPower(safeBoard[bLane]) >= req) {
            return false;
          }
        }
        return true;
      });

      if (isMinimalForSomeAdvent || (hasMadness && bSub.length === 0)) {
        results.push({
          handIndices: hSub,
          boardLanes: bSub,
          totalPower,
        });
      }
    }
  }

  return results;
}

/**
 * 「招来（invoke）」の発動直前（アドホック）完全シミュレーション評価。
 *
 * 【AI思考原則の徹底遵守】
 * - 空きレーン優先ヒューリスティックや人為的な上書き・自壊ペナルティは一切使用しない。
 * - 手札・自陣カードの破棄サブセット、召喚対象となる手札・山札の「降臨」カード、
 *   および全合法召喚先レーン（空きレーン・既存味方上書きレーンを等しく候補とする）の全組み合わせについて
 *   processActionSequence による完全戦闘シミュレーションを実行し、客観的盤面評価関数（evaluateSimState）の
 *   スコア比較のみによって最善手（何も捨てず召喚しないパスを含む）を決定する。
 * - 評価スコアが同点以上の場合は、手札よりも山札（deck）からの「降臨」カード召喚を優先する。
 *
 * @param {'red' | 'blue'} [owner='red'] - スキル発動陣営（※内部の processActionSequence が赤AI専用のため 'red' 専用）
 * @returns {{
 *   handIndices: number[],
 *   boardLanes: number[],
 *   summonZone: 'hand' | 'deck' | null,
 *   targetUid: string | null,
 *   targetIdx: number,
 *   summonLane: number
 * }} 最善の破棄・召喚プラン（パス時は summonZone: null, summonLane: -1）
 */
export function evaluateAdhocInvokeMove(owner = 'red') {
  const emptyPlan = {
    handIndices: [],
    boardLanes: [],
    summonZone: null,
    targetUid: null,
    targetIdx: -1,
    summonLane: -1,
  };

  // processActionSequence は赤AI（enemyBoard/enemyHand/enemyDeck）専用のシミュレーションパイプラインのため、赤以外が渡された場合は安全に空プランを返す
  if (owner !== 'red') {
    return emptyPlan;
  }

  const initialSimState = buildInitialSimState();
  const isRed = true;
  const myHand = initialSimState.enemyHand;
  const myBoard = initialSimState.enemyBoard;
  const opBoard = initialSimState.playerBoard;
  const myDeck = initialSimState.enemyDeck;
  const myDiscard = initialSimState.enemyDiscard;
  const sealed = initialSimState.enemySealedLanes;
  const unsealedLanes = [0, 1, 2].filter((l) => !sealed || sealed[l] === 0);

  if (unsealedLanes.length === 0) {
    return emptyPlan;
  }

  const invokeSourceLane = myBoard.findIndex(
    (c) => c && c.isSkillResolving && hasSkill(c, 'invoke')
  );
  const invokeSourceUid =
    invokeSourceLane !== -1
      ? myBoard[invokeSourceLane]?.uid || myBoard[invokeSourceLane]?.id || null
      : null;

  // 1. パス（0枚破棄・召喚なし）基準スコアを同一シミュレーションパイプラインで算出
  const passSimState = processActionSequence(
    [
      {
        type: 'invoke',
        handSacrificeIndices: [],
        boardSacrificeLanes: [],
        summonZone: null,
        targetIdx: -1,
        targetUid: null,
        laneIdx: -1,
        sourceLane: invokeSourceLane !== -1 ? invokeSourceLane : undefined,
        sourceUid: invokeSourceUid,
      },
    ],
    false,
    null,
    null,
    'before',
    null,
    null,
    structuredClone(initialSimState)
  );
  let bestScore = passSimState ? evaluateSimState(passSimState) : -Infinity;
  let bestBranch = null;

  // 2. 全候補ブランチ（破棄サブセット × 山札/手札の降臨カード × 全合法レーン）を構築
  const subsets = buildInvokeSacrificeSubsets(myHand, [], myBoard, myDeck, []);
  const candidateBranches = [];

  for (const sub of subsets) {
    const usedHandAfterSac = [...sub.handIndices];
    const postSacBoard = myBoard.map((bCard, bIdx) =>
      sub.boardLanes.includes(bIdx) ? null : bCard
    );
    const newlyDiscarded = [];
    for (const bLane of sub.boardLanes) {
      const bc = myBoard[bLane];
      if (bc && !bc.isToken) newlyDiscarded.push(bc);
    }
    for (const hIdx of sub.handIndices) {
      const hc = myHand[hIdx];
      if (hc && !hc.isToken) newlyDiscarded.push(hc);
    }
    const invokeStateOverride = {
      myBoard: postSacBoard,
      opBoard,
      sealedLanes: sealed,
      initialDiscarded: newlyDiscarded,
    };

    // 2-A: 山札（デッキ）内の「降臨」カード召喚候補（スコアが同点以上の場合は山札を優先）
    const seenDeckSigs = new Set();
    for (let dIdx = 0; dIdx < myDeck.length; dIdx++) {
      const dCard = myDeck[dIdx];
      if (!matchesInvokeTarget(dCard, sub.totalPower)) continue;
      const sig = getCardSignature(dCard);
      if (seenDeckSigs.has(sig)) continue;
      seenDeckSigs.add(sig);

      const masterData = CARD_MASTER.find(
        (m) => m.id === (dCard.baseId || dCard.id)
      );
      const invokeDeckCard = masterData
        ? cloneCard(masterData)
        : cloneCard(dCard);
      invokeDeckCard.uid = dCard.uid || dCard.id;
      invokeDeckCard.baseId = dCard.baseId || dCard.id;
      invokeDeckCard.basePower = invokeDeckCard.power;
      invokeDeckCard.currentPower = invokeDeckCard.power;

      const branches = buildCardPlayTreeAdhoc(
        invokeDeckCard,
        dIdx,
        'invoke',
        myHand,
        myDiscard,
        usedHandAfterSac,
        [],
        0,
        undefined,
        undefined,
        owner,
        true,
        [],
        invokeStateOverride
      );
      for (const b of branches) {
        if (!b || b.length === 0 || b[0].laneIdx === -1) continue;
        if (!unsealedLanes.includes(b[0].laneIdx)) continue;
        candidateBranches.push([
          {
            ...b[0],
            type: 'invoke',
            handSacrificeIndices: [...sub.handIndices],
            boardSacrificeLanes: [...sub.boardLanes],
            summonZone: 'deck',
            sourceLane: invokeSourceLane !== -1 ? invokeSourceLane : undefined,
            sourceUid: invokeSourceUid,
          },
          ...b.slice(1),
        ]);
      }
    }

    // 2-B: 手札内の「降臨」カード召喚候補
    const seenHandSigs = new Set();
    for (let hIdx = 0; hIdx < myHand.length; hIdx++) {
      if (usedHandAfterSac.includes(hIdx)) continue;
      const hCard = myHand[hIdx];
      if (!matchesInvokeTarget(hCard, sub.totalPower)) continue;
      const sig = getCardSignature(hCard);
      if (seenHandSigs.has(sig)) continue;
      seenHandSigs.add(sig);

      const branches = buildCardPlayTreeAdhoc(
        hCard,
        hIdx,
        'invoke',
        myHand,
        myDiscard,
        [...usedHandAfterSac, hIdx],
        [],
        0,
        undefined,
        undefined,
        owner,
        true,
        [],
        invokeStateOverride
      );
      for (const b of branches) {
        if (!b || b.length === 0 || b[0].laneIdx === -1) continue;
        if (!unsealedLanes.includes(b[0].laneIdx)) continue;
        candidateBranches.push([
          {
            ...b[0],
            type: 'invoke',
            handSacrificeIndices: [...sub.handIndices],
            boardSacrificeLanes: [...sub.boardLanes],
            summonZone: 'hand',
            sourceLane: invokeSourceLane !== -1 ? invokeSourceLane : undefined,
            sourceUid: invokeSourceUid,
          },
          ...b.slice(1),
        ]);
      }
    }
  }

  if (candidateBranches.length === 0) {
    return emptyPlan;
  }

  // 初級難易度（Easy AI）の場合：自滅しない合法シミュレーション結果からシード乱数で選択（リーサル優先・同格なら山札優先）
  if (checkIsEasyAI()) {
    const evaluatedEasy = [];
    for (const branch of candidateBranches) {
      const simState = processActionSequence(
        branch,
        false,
        null,
        null,
        'before',
        null,
        null,
        structuredClone(initialSimState)
      );
      if (!simState) continue;
      evaluatedEasy.push({ branch, simState });
    }
    if (evaluatedEasy.length === 0) return emptyPlan;

    const lethals = evaluatedEasy.filter((x) => x.simState.playerHP <= 0);
    const basePool =
      lethals.length > 0
        ? lethals
        : evaluatedEasy.filter((x) => x.simState.enemyHP > 0);
    if (basePool.length === 0) return emptyPlan;

    const deckPool = basePool.filter((x) => x.branch[0]?.summonZone === 'deck');
    const pool = deckPool.length > 0 ? deckPool : basePool;

    const picked = pool[Math.floor(getSeededRandom() * pool.length)].branch;
    syncAdhocDecision(picked);
    const root = picked[0];
    return {
      handIndices: root.handSacrificeIndices || [],
      boardLanes: root.boardSacrificeLanes || [],
      summonZone: root.summonZone,
      targetUid: root.targetUid || null,
      targetIdx: root.targetIdx ?? -1,
      summonLane: root.laneIdx ?? -1,
    };
  }

  // 中級以上（Normal/Hard AI）：全候補ブランチを完全シミュレーション＆客観的評価関数で比較
  const lanePriorityOrder = { 0: 1, 2: 2, 1: 3 };

  for (const branch of candidateBranches) {
    const simState = processActionSequence(
      branch,
      false,
      null,
      null,
      'before',
      null,
      null,
      structuredClone(initialSimState)
    );
    if (!simState) continue;

    const score = evaluateSimState(simState);
    const root = branch[0];
    const currentIsDeck = root.summonZone === 'deck' ? 1 : 0;
    const bestIsDeck =
      bestBranch && bestBranch[0].summonZone === 'deck' ? 1 : 0;
    const currentSacCount =
      (root.handSacrificeIndices?.length || 0) +
      (root.boardSacrificeLanes?.length || 0);
    const bestSacCount = bestBranch
      ? (bestBranch[0].handSacrificeIndices?.length || 0) +
        (bestBranch[0].boardSacrificeLanes?.length || 0)
      : 0;
    const currentPri = lanePriorityOrder[root.laneIdx] || 99;
    const bestPri = lanePriorityOrder[bestBranch?.[0]?.laneIdx] || 99;

    /**
     * 同スコア時に現行候補（branch）が暫定最善（bestBranch）より優先されるか判定する。
     * 優先順位：山札召喚優先 > アクション手数最小 > 破棄枚数最小 > レーン優先度（左 > 右 > 中央）
     * @returns {boolean} 更新すべきであれば true
     */
    const isBetterTieBreak = () => {
      if (currentIsDeck !== bestIsDeck) return currentIsDeck > bestIsDeck;
      if (branch.length !== bestBranch.length) {
        return branch.length < bestBranch.length;
      }
      if (currentSacCount !== bestSacCount) {
        return currentSacCount < bestSacCount;
      }
      return currentPri < bestPri;
    };

    if (isRed) {
      if (score > bestScore + 0.00001) {
        bestScore = score;
        bestBranch = branch;
      } else if (
        Math.abs(score - bestScore) <= 0.00001 &&
        bestBranch !== null &&
        isBetterTieBreak()
      ) {
        bestScore = score;
        bestBranch = branch;
      }
    } else {
      if (score < bestScore - 0.00001) {
        bestScore = score;
        bestBranch = branch;
      } else if (
        Math.abs(score - bestScore) <= 0.00001 &&
        bestBranch !== null &&
        isBetterTieBreak()
      ) {
        bestScore = score;
        bestBranch = branch;
      }
    }
  }

  if (!bestBranch) {
    return emptyPlan;
  }

  syncAdhocDecision(bestBranch);
  const bestRoot = bestBranch[0];
  return {
    handIndices: bestRoot.handSacrificeIndices || [],
    boardLanes: bestRoot.boardSacrificeLanes || [],
    summonZone: bestRoot.summonZone,
    targetUid: bestRoot.targetUid || null,
    targetIdx: bestRoot.targetIdx ?? -1,
    summonLane: bestRoot.laneIdx ?? -1,
  };
}

/**
 * 選択（choice）スキル解決シミュレーションにおいて、手札からの召喚（summon / forge）を精密に評価・適用する。
 * 手札に対象カードが存在しない場合は不発（何もしない）とし、
 * 存在する場合は最善カードとレーンを選択して盤面に召喚・装備・合体シミュレートを適用する。
 *
 * @param {object} simState - シミュレーション中のゲーム状態
 * @param {'red' | 'blue'} owner - 発動プレイヤー
 * @param {number} sourceLane - 発動元カードのレーン
 * @param {object} choiceSkill - 選択された召喚スキル定義オブジェクト
 * @returns {void}
 */
export function simulateAdhocChoiceSummon(
  simState,
  owner,
  sourceLane,
  choiceSkill
) {
  const isRed = owner === 'red';
  const simHand = isRed ? simState.enemyHand : simState.playerHand;
  if (!simHand || simHand.length === 0) return;

  const simBoard = isRed ? simState.enemyBoard : simState.playerBoard;
  const sourceCard = simBoard[sourceLane];
  const selfId = sourceCard ? sourceCard.baseId || sourceCard.id : null;
  const { presentBoardCards, presentBoardIds } = collectPresentBoardTargets(
    simBoard,
    Boolean(choiceSkill.excludeBoard)
  );

  // 対象となる手札カードのインデックスを抽出
  const validHandIndices = [];
  for (let i = 0; i < simHand.length; i++) {
    const hCard = simHand[i];
    if (!hCard) continue;

    if (choiceSkill.id === 'forge') {
      if (hasSkill(hCard, 'equip')) validHandIndices.push(i);
    } else {
      if (
        matchesSummonTarget(hCard, choiceSkill, {
          selfId,
          presentBoardIds,
          presentBoardCards,
        })
      ) {
        validHandIndices.push(i);
      }
    }
  }

  // 手札に対象カードが1枚もない場合は不発（何も召喚できない）
  if (validHandIndices.length === 0) return;

  // 配置候補レーンの決定
  const sealed = isRed ? simState.enemySealedLanes : simState.playerSealedLanes;
  let candidateLanes;
  if (choiceSkill.id === 'forge') {
    // 鍛造は発動元レーン限定
    candidateLanes = !sealed || sealed[sourceLane] === 0 ? [sourceLane] : [];
  } else {
    // 通常の召喚は封印されていない全レーン
    candidateLanes = [0, 1, 2].filter((l) => !sealed || sealed[l] === 0);
  }

  if (candidateLanes.length === 0) return;

  let bestHandIdx = validHandIndices[0];
  let bestPlacementLane = candidateLanes[0];
  let bestScore = isRed ? -Infinity : Infinity;

  for (const hIdx of validHandIndices) {
    const testCard = simHand[hIdx];
    const actionBranches = buildCardPlayTreeAdhoc(
      testCard,
      hIdx,
      'summon',
      simHand,
      isRed ? simState.enemyDiscard : simState.playerDiscard,
      [hIdx],
      [],
      0,
      undefined,
      undefined,
      owner,
      true
    );

    for (const branch of actionBranches) {
      if (!branch || branch.length === 0) continue;
      const lane = branch[0].laneIdx;
      if (!candidateLanes.includes(lane)) continue;

      const subState = processActionSequence(
        branch,
        false,
        null,
        null,
        'before',
        null,
        null,
        structuredClone(simState)
      );
      if (!subState) continue;

      // 召喚による配置アクション解決および戦闘フェーズ完了後の盤面状態を総合評価関数で採点
      const subScore = evaluateSimState(subState);
      if (isRed) {
        if (subScore > bestScore) {
          bestScore = subScore;
          bestHandIdx = hIdx;
          bestPlacementLane = lane;
        }
      } else {
        if (subScore < bestScore) {
          bestScore = subScore;
          bestHandIdx = hIdx;
          bestPlacementLane = lane;
        }
      }
    }
  }

  // 有効な分岐（制約を満たす合法手など）が1つも存在しなかった場合は不発として終了
  if (!Number.isFinite(bestScore)) return;

  // 【二重戦闘防止】processActionSequence は戦闘フェーズまで完了済みの盤面（bestSimState）を返すため、
  // これを親（evaluateAdhocSkillChoice）に上書き代入すると親の末尾の evaluateTurnOutcome と合わせて
  // 戦闘フェーズが2回走る二重戦闘バグが発生する。
  // そのため、探索によって決定した最善カード・レーンに基づき、戦闘前の配置状態のみを simState に反映する。
  const [chosenCard] = simHand.splice(bestHandIdx, 1);
  simulateCardPlacementOnBoard(
    simState,
    owner,
    bestPlacementLane,
    chosenCard,
    true
  );

  // 召喚スキル固有の「虚空」トークン手札補充
  const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void');
  if (voidTpl) {
    simHand.push({
      ...voidTpl,
      isToken: true,
      baseId: 'token_void',
      uid: `${owner}_sim_void_${Math.floor(getSeededRandom() * 1000000000)}`,
    });
  }
}

/**
 * 選択（choice）スキル解決シミュレーションにおいて、デッキからの召集（assemble）を精密に評価・適用する。
 * デッキに対象カードが存在しない場合は不発（何もしない）とし、
 * 存在する場合は最善カードとレーンを選択して盤面に召喚・装備・合体シミュレートを適用する。
 *
 * @param {object} simState - シミュレーション中のゲーム状態
 * @param {'red' | 'blue'} owner - 発動プレイヤー
 * @param {number} sourceLane - 発動元カードのレーン
 * @param {object} choiceSkill - 選択された召集スキル定義オブジェクト
 * @returns {void}
 */
export function simulateAdhocChoiceAssemble(
  simState,
  owner,
  sourceLane,
  choiceSkill
) {
  const isRed = owner === 'red';
  const simDeck = isRed ? simState.enemyDeck : simState.playerDeck;
  if (!simDeck || simDeck.length === 0) return;
  // 先行1ターン目は他のレーンにカードを出せないため召集による展開不可
  if (isFirstTurnRestricted(owner, simState)) return;

  const simBoard = isRed ? simState.enemyBoard : simState.playerBoard;
  const sourceCard = simBoard[sourceLane];
  const selfId = sourceCard ? sourceCard.baseId || sourceCard.id : null;
  const { presentBoardCards, presentBoardIds } = collectPresentBoardTargets(
    simBoard,
    Boolean(choiceSkill.excludeBoard)
  );

  const validDeckIndices = [];
  for (let i = 0; i < simDeck.length; i++) {
    const dCard = simDeck[i];
    if (
      dCard &&
      matchesAssembleTarget(dCard, choiceSkill, {
        selfId,
        presentBoardIds,
        presentBoardCards,
      })
    ) {
      validDeckIndices.push(i);
    }
  }

  if (validDeckIndices.length === 0) return;

  const sealed = isRed ? simState.enemySealedLanes : simState.playerSealedLanes;
  const candidateLanes = [0, 1, 2].filter((l) => !sealed || sealed[l] === 0);
  if (candidateLanes.length === 0) return;

  let bestDeckIdx = validDeckIndices[0];
  let bestPlacementLane = candidateLanes[0];
  let bestScore = isRed ? -Infinity : Infinity;

  for (const dIdx of validDeckIndices) {
    const testCard = simDeck[dIdx];
    const actionBranches = buildCardPlayTreeAdhoc(
      testCard,
      dIdx,
      'assemble',
      isRed ? simState.enemyHand : simState.playerHand,
      isRed ? simState.enemyDiscard : simState.playerDiscard,
      [],
      [],
      0,
      undefined,
      undefined,
      owner,
      true
    );

    for (const branch of actionBranches) {
      if (!branch || branch.length === 0) continue;
      const lane = branch[0].laneIdx;
      if (!candidateLanes.includes(lane)) continue;

      const subState = processActionSequence(
        branch,
        false,
        null,
        null,
        'before',
        null,
        null,
        structuredClone(simState)
      );
      if (!subState) continue;

      // 召集による配置アクション解決および戦闘フェーズ完了後の盤面状態を総合評価関数で採点
      const subScore = evaluateSimState(subState);
      if (isRed) {
        if (subScore > bestScore) {
          bestScore = subScore;
          bestDeckIdx = dIdx;
          bestPlacementLane = lane;
        }
      } else {
        if (subScore < bestScore) {
          bestScore = subScore;
          bestDeckIdx = dIdx;
          bestPlacementLane = lane;
        }
      }
    }
  }

  // 有効な分岐（制約を満たす合法手など）が1つも存在しなかった場合は不発として終了
  if (!Number.isFinite(bestScore)) return;

  // 【二重戦闘防止】processActionSequence は戦闘フェーズまで完了済みの盤面（bestSimState）を返すため、
  // これを親（evaluateAdhocSkillChoice）に上書き代入すると親の末尾の evaluateTurnOutcome と合わせて
  // 戦闘フェーズが2回走る二重戦闘バグが発生する。
  // そのため、探索によって決定した最善カード・レーンに基づき、戦闘前の配置状態のみを simState に反映する。
  const [chosenCard] = simDeck.splice(bestDeckIdx, 1);
  simulateCardPlacementOnBoard(
    simState,
    owner,
    bestPlacementLane,
    chosenCard,
    true
  );
}

/**
 * 選択（choice）スキル解決シミュレーションにおいて、墓地からの復活（resurrect）を精密に評価・適用する。
 * 墓地に対象カードが存在しない場合は不発（何もしない）とし、
 * 存在する場合は最善カードとレーンを選択して盤面に配置・装備・合体シミュレートを適用する。
 *
 * @param {object} simState - シミュレーション中のゲーム状態
 * @param {'red' | 'blue'} owner - 発動プレイヤー
 * @param {number} _sourceLane - 発動元カードのレーン
 * @param {object} choiceSkill - 選択された復活スキル定義オブジェクト
 * @returns {void}
 */
export function simulateAdhocChoiceResurrect(
  simState,
  owner,
  _sourceLane,
  choiceSkill
) {
  if (isGraveKeeperActive(simState)) return;

  const isRed = owner === 'red';
  const simDiscard = isRed ? simState.enemyDiscard : simState.playerDiscard;
  if (!simDiscard || simDiscard.length === 0) return;

  const isExcludeBoard = Boolean(choiceSkill.excludeBoard);
  const simBoard = isRed ? simState.enemyBoard : simState.playerBoard;
  const { presentBoardCards, presentBoardIds } = collectPresentBoardTargets(
    simBoard,
    isExcludeBoard
  );

  // パワー上限および特定対象（targetIds / targetKeyword / targetId）の判定は
  // 共通関数 matchesResurrectTarget（matchesGraveyardTarget）に一元委譲する
  const validDiscardIndices = [];
  for (let i = 0; i < simDiscard.length; i++) {
    const dCard = simDiscard[i];
    if (
      dCard &&
      matchesResurrectTarget(dCard, choiceSkill, {
        presentBoardIds,
        presentBoardCards,
      })
    ) {
      validDiscardIndices.push(i);
    }
  }

  if (validDiscardIndices.length === 0) return;

  const sealed = isRed ? simState.enemySealedLanes : simState.playerSealedLanes;
  const candidateLanes = [0, 1, 2].filter((l) => !sealed || sealed[l] === 0);
  if (candidateLanes.length === 0) return;

  let bestDiscardIdx = validDiscardIndices[0];
  let bestPlacementLane = candidateLanes[0];
  let bestScore = isRed ? -Infinity : Infinity;

  for (const dIdx of validDiscardIndices) {
    const testCard = simDiscard[dIdx];
    const actionBranches = buildCardPlayTreeAdhoc(
      testCard,
      dIdx,
      'resurrect',
      isRed ? simState.enemyHand : simState.playerHand,
      simDiscard,
      [],
      [dIdx],
      0,
      undefined,
      undefined,
      owner,
      false
    );

    for (const branch of actionBranches) {
      if (!branch || branch.length === 0) continue;
      const lane = branch[0].laneIdx;
      if (!candidateLanes.includes(lane)) continue;

      const subState = processActionSequence(
        branch,
        false,
        null,
        null,
        'before',
        null,
        null,
        structuredClone(simState)
      );
      if (!subState) continue;

      // 復活による配置アクション解決および戦闘フェーズ完了後の盤面状態を総合評価関数で採点
      const subScore = evaluateSimState(subState);
      if (isRed) {
        if (subScore > bestScore) {
          bestScore = subScore;
          bestDiscardIdx = dIdx;
          bestPlacementLane = lane;
        }
      } else {
        if (subScore < bestScore) {
          bestScore = subScore;
          bestDiscardIdx = dIdx;
          bestPlacementLane = lane;
        }
      }
    }
  }

  // 有効な分岐（合法手など）が1つも存在しなかった場合は不発として終了
  if (!Number.isFinite(bestScore)) return;

  // 【二重戦闘防止】processActionSequence は戦闘フェーズまで完了済みの盤面（bestSimState）を返すため、
  // これを親（evaluateAdhocSkillChoice）に上書き代入すると親の末尾の evaluateTurnOutcome と合わせて
  // 戦闘フェーズが2回走る二重戦闘バグが発生する。
  // そのため、探索によって決定した最善カード・レーンに基づき、戦闘前の配置状態のみを simState に反映する。
  const [chosenCard] = simDiscard.splice(bestDiscardIdx, 1);
  simulateCardPlacementOnBoard(
    simState,
    owner,
    bestPlacementLane,
    chosenCard,
    false
  );
}

/**
 * 選択（choice）や命令（force）など、カード効果によるスキル選択において最善の選択肢を直前シミュレーションする。
 *
 * @param {object} card - 選択スキルを発動したカードオブジェクト
 * @param {Array<object>} choices - 選択肢オブジェクト配列
 * @param {number} [maxChoices=1] - 選択可能な個数
 * @param {'red' | 'blue'} [owner='red'] - スキル発動陣営
 * @param {number} [sourceLane=-1] - 発動元カードが召喚された元のレーン番号（破壊後の参照用）
 * @return {Array<object>} 最善の選択肢配列
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
        } else if (choiceSkill.id === 'summon' || choiceSkill.id === 'forge') {
          // 手札からの召喚・鍛造：手札に対象カードが存在するか判定し、精密にシミュレート（不在なら不発）
          simulateAdhocChoiceSummon(simState, owner, lane, choiceSkill);
        } else if (choiceSkill.id === 'assemble') {
          // デッキからの召集：デッキに対象カードが存在するか判定し、精密にシミュレート（不在なら不発）
          simulateAdhocChoiceAssemble(simState, owner, lane, choiceSkill);
        } else if (choiceSkill.id === 'call') {
          // 号令（call）：デッキに対象カードが存在する場合のみ期待値としてパワー加算
          // （※ 先行1ターン目は他のレーンにカードを出せないため加算不可）
          const targetOwner = isRed ? 'red' : 'blue';
          if (!isFirstTurnRestricted(targetOwner, simState)) {
            const simDeck = isRed ? simState.enemyDeck : simState.playerDeck;
            const selfId = simCard ? simCard.baseId || simCard.id : null;
            const isExcludeBoard = Boolean(choiceSkill.excludeBoard);
            const currentSimBoard = isRed
              ? simState.enemyBoard
              : simState.playerBoard;
            const { presentBoardCards, presentBoardIds } =
              collectPresentBoardTargets(currentSimBoard, isExcludeBoard);
            if (
              simCard &&
              hasValidTargetInDeck(choiceSkill, simDeck, {
                selfId,
                presentBoardIds,
                presentBoardCards,
              })
            ) {
              const callBonus = estimateCallAssembleBonus(choiceSkill);
              simCard.currentPower = (simCard.currentPower || 0) + callBonus;
              simCard.basePower = (simCard.basePower || 0) + callBonus;
            }
          }
        } else if (choiceSkill.id === 'resurrect') {
          // 墓地からの復活：墓地に対象カードが存在するか判定し、精密にシミュレート（不在なら不発）
          simulateAdhocChoiceResurrect(simState, owner, lane, choiceSkill);
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
 * @param {Array<object>} [pendingSkills=[]] - 後続で待機している未解決スキル群
 * @return {number[]|null} 最善レーンの配列。キャンセルが最善の場合は null、候補なしの場合は空配列
 */
export function evaluateAdhocTokenLanes(
  tokenCard,
  checkConstraints = true,
  canCancel = false,
  candidateLanes = null,
  pendingSkills = []
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
  // 【シミュレーションの実行と最善解の決定】
  // ==========================================

  let bestBranch = null;
  let maxScore = -999999999;
  let bestLane = -1;
  let bestSimState = null;

  // 後続で待機している未解決スキル群（親カードの後続スキル等）を抽出
  const effectivePending =
    Array.isArray(pendingSkills) && pendingSkills.length > 0
      ? pendingSkills
      : Array.isArray(tokenCard?.pendingSkills)
        ? tokenCard.pendingSkills
        : [];
  const filteredPendingSkills = effectivePending.filter(
    (s) => s && s.id !== 'choice' && s.id !== 'force'
  );

  for (let l of validLanes) {
    // このレーンにめくれたカードを配置するアクション
    // 後続スキル（処刑等）が待機している場合は、後続アクション解決までパワー0トークンを保護する
    let playAction = {
      type: 'play_adhoc',
      card: tokenCard,
      laneIdx: l,
      checkConstraints: checkConstraints,
      isAmbush: Boolean(tokenCard?.isAmbush),
      keepResolvingForPending: filteredPendingSkills.length > 0,
    };

    // 発動するスキルを収集（「配置(Place)」の場合はオンプレイ能力が発動しないため、checkConstraints === true の場合のみ収集）
    let effectiveSkills = [];
    if (checkConstraints && Array.isArray(tokenCard.skills)) {
      tokenCard.skills.forEach((s) => {
        if (s.id !== 'choice' && s.id !== 'force') {
          effectiveSkills.push(s);
        }
      });
    }

    // 後続で待機している未解決スキル群（親カードの後続スキル等）を追加し、後続能力も含めた多段シミュレーションを実行する
    if (filteredPendingSkills.length > 0) {
      effectiveSkills.push(...filteredPendingSkills);
    }

    // 選択スキルの選択肢展開（「配置」時はオンプレイスキルは不発のため、checkConstraints === true のみ展開）
    let choiceCombinations = [undefined];
    let choice2Combinations = [undefined];
    if (
      checkConstraints &&
      (hasSkill(tokenCard, 'choice') || hasSkill(tokenCard, 'force'))
    ) {
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
          GameState.playerBoard,
          tokenCard,
          'red'
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

          // トークン配置および戦闘フェーズ完了後の盤面状態を総合評価関数で客観的に採点
          const rawScore = evaluateSimState(simState);

          const currentPri = lanePriorityOrder[l] || 99;
          const bestPri = lanePriorityOrder[bestLane] || 99;
          const currentLen = actionQueue.length;
          const bestLen = bestBranch ? bestBranch.length : Infinity;

          if (rawScore > maxScore + 0.00001) {
            maxScore = rawScore;
            bestBranch = actionQueue;
            bestLane = l;
            bestSimState = simState;
          } else if (Math.abs(rawScore - maxScore) <= 0.00001) {
            // 「同じ結果をもたらす場合は手が少ないものを選ぶ原則」の徹底
            if (currentLen < bestLen) {
              maxScore = rawScore;
              bestBranch = actionQueue;
              bestLane = l;
              bestSimState = simState;
            } else if (currentLen === bestLen && currentPri < bestPri) {
              maxScore = rawScore;
              bestBranch = actionQueue;
              bestLane = l;
              bestSimState = simState;
            }
          }
        }
      }
    }
  }

  // 配置キャンセルのシミュレーション
  // ※親カードに後続待機スキル（filteredPendingSkills: 処刑等）が存在する場合、
  //   今回のトークン配置をキャンセルしても後続スキルは必ず発動するため、後続スキル展開後の盤面で公平に比較する。
  if (canCancel) {
    const cancelBoard = GameState.enemyBoard.map((c) => (c ? { ...c } : null));
    const cancelChains =
      filteredPendingSkills.length > 0
        ? buildSkillBranchAdhoc(
            filteredPendingSkills,
            [],
            [],
            0,
            [],
            -1,
            cancelBoard,
            GameState.playerBoard,
            null,
            'red'
          )
        : [[]];

    for (const cancelChain of cancelChains) {
      const cancelQueue = [
        { type: 'play_adhoc', card: null, laneIdx: -1 },
        ...cancelChain,
      ];
      const simState = processActionSequence(
        cancelQueue,
        false,
        null,
        null,
        'before',
        null,
        null,
        structuredClone(initialSimState)
      );
      if (!simState) continue;

      // 配置を行わない（パス）場合の戦闘解決結果を総合評価関数で採点
      const rawScore = evaluateSimState(simState);
      // 先頭のキャンセルノード自体は手数0のため、実質手数は後続チェーン長（cancelChain.length）
      const cancelLen = cancelChain.length;
      const bestLen = bestBranch ? bestBranch.length : Infinity;
      if (rawScore > maxScore + 0.00001) {
        maxScore = rawScore;
        bestBranch = cancelQueue;
        bestLane = -1;
        bestSimState = simState;
      } else if (Math.abs(rawScore - maxScore) <= 0.00001) {
        // 同スコア時は手数が少ない（不要な配置をしない）選択を優先
        if (cancelLen < bestLen) {
          maxScore = rawScore;
          bestBranch = cancelQueue;
          bestLane = -1;
          bestSimState = simState;
        }
      }
    }
  }

  // ==========================================
  // 【シミュレーション結果の GameState 同期（マージ）】
  // 配置キャンセル（bestLane === -1）が最善となった場合も、採点済みの後続選択（処刑ターゲット等）を確実にキューへ反映する
  // ==========================================
  if (bestBranch) {
    syncAdhocDecision(bestBranch);
  }

  if (bestLane === -1) {
    console.log(
      `[AI CALL] Cancelled placement (Score: ${maxScore.toFixed(1)})`
    );
    return null;
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
 * @param {Array<object>} [pendingSkills=[]] - 後続で待機している未解決スキル群
 * @return {Array<number>} 決定された配置レーン配列
 */
export function getNormalTokenLanes(
  allLanes,
  owner,
  tokenCard,
  count,
  canCancel = false,
  checkConstraints = true,
  pendingSkills = []
) {
  if (owner === 'red') {
    // 常に最新の盤面状況と後続待機スキル情報に基づき、アドホックにシミュレーションして決定する
    const results = evaluateAdhocTokenLanes(
      tokenCard,
      checkConstraints,
      canCancel,
      allLanes,
      pendingSkills
    );
    if (results === null) return []; // キャンセル判定
    if (results.length > 0) {
      if (results.length >= count) return results.slice(0, count);

      // count > 1（分身等）の場合：残りの候補レーンから、仮想配置盤面を客観的総合評価関数（evaluateTurnOutcome）でシミュレートして順次最善レーンを選択する
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

      // 2体目以降のトークンについて、各候補レーンに配置した盤面を実際にシミュレートし、evaluateTurnOutcome の客観的スコアを比較して最善レーンを順次決定する
      while (results.length < count && validRemaining.length > 0) {
        let bestSubScore = -Infinity;
        let bestSubLane = -1;

        // パス基準スコア（配置しない場合のスコア）
        let passScore = -Infinity;
        if (canCancel) {
          const passSim = buildInitialSimState();
          for (const prevL of results) {
            simulateCardPlacementOnBoard(
              passSim,
              owner,
              prevL,
              tokenCard,
              false
            );
          }
          passScore = evaluateTurnOutcome(passSim, owner);
        }

        for (const l of validRemaining) {
          const testSim = buildInitialSimState();
          for (const prevL of results) {
            simulateCardPlacementOnBoard(
              testSim,
              owner,
              prevL,
              tokenCard,
              false
            );
          }
          simulateCardPlacementOnBoard(testSim, owner, l, tokenCard, false);
          const score = evaluateTurnOutcome(testSim, owner);

          if (score > bestSubScore) {
            bestSubScore = score;
            bestSubLane = l;
          }
        }

        // キャンセル可能な場合、追加配置によってスコアが下がる（自爆する）なら配置を終了
        if (canCancel && bestSubScore < passScore) {
          break;
        }

        if (bestSubLane !== -1) {
          results.push(bestSubLane);
          const remIdx = validRemaining.indexOf(bestSubLane);
          if (remIdx !== -1) validRemaining.splice(remIdx, 1);
        } else {
          break;
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

/**
 * 盤面上の「移動（move）」スキルを持つ味方カードの最適移動先をシミュレーション評価する。
 * 全移動パターンの戦闘解決結果を全探索し、最も戦闘スコアの高い移動手順リストを返す。
 *
 * @param {object} currentState - 現在のゲーム状態（enemyBoard, playerBoard, HP等を含む）
 * @returns {Array<{ from: number, to: number }>|null} 決定された移動手順の配列。移動不要または移動可能カードなしの場合は null
 */
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
        turnCount: GameState.turnCount || 0,
        firstPlayer: GameState.firstPlayer,
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
      score -= currentMoves.length * 0.1; // 不要な移動を防ぐための微小なタイブレーク
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

/**
 * 1ターンの単一着手（手札カードプレイおよびリーダースキル発動）を仮想シミュレーション実行する。
 * カード配置、スキル発動、戦闘フェーズを順次解決し、結果の盤面評価スコアを返す。
 *
 * @param {number} handIdx - プレイする手札カードのインデックス（-1 の場合は手札プレイなし）
 * @param {number} laneIdx - 配置先レーン番号（0〜2）
 * @param {Array<object>} hand - 手札カード配列
 * @param {Array<object|null>} currentMyBoard - プレイ前の自分（AI）盤面配列
 * @param {Array<object|null>} currentOpBoard - プレイ前の相手（プレイヤー）盤面配列
 * @param {number} currentMyHP - 現在の自分（AI）HP
 * @param {boolean} [useSkill=false] - リーダースキルを発動するかどうか
 * @param {number} [currentMySP=0] - 現在の自分（AI）SP
 * @param {Array<number>|null} [tokenLanes=null] - リーダースキル用トークン配置レーン配列
 * @param {number|undefined} [choiceIndex=undefined] - 選択肢1の選択インデックス
 * @param {Array<number>|null} [cardTokenLanes=null] - カードスキル用トークン配置レーン配列
 * @param {boolean} [checkConstraints=true] - 召喚制約（伝説・生贄・挑戦・頂点）をチェックするかどうか
 * @param {number|undefined} [choiceIndex2=undefined] - 選択肢2の選択インデックス
 * @returns {number} 戦闘フェーズ解決後の客観的盤面評価スコア
 */
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
    playerDeck: [...GameState.playerDeck],
    enemyDeck: [...GameState.enemyDeck],
    playerSealedLanes: [...(GameState.playerSealedLanes || [0, 0, 0])],
    enemySealedLanes: [...(GameState.enemySealedLanes || [0, 0, 0])],
    turnCount: GameState.turnCount || 0,
    firstPlayer: GameState.firstPlayer,
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
        if (hasSkill(playedCard, 'advent')) return null;
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
          consumeStartupSkill(existingCard);
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
                // 先行1ターン目は他のレーンにカードを出せないためボーナス加算不可
                // デッキに対象カードが存在する場合のみ、パワーボーナスを仮加算
                if (!isFirstTurnRestricted('red', simState)) {
                  const selfId = activeCard
                    ? activeCard.baseId || activeCard.id
                    : null;
                  const isExcludeBoard = Boolean(sk.excludeBoard);
                  const { presentBoardCards, presentBoardIds } =
                    collectPresentBoardTargets(
                      simState.enemyBoard,
                      isExcludeBoard
                    );
                  if (
                    hasValidTargetInDeck(sk, simState.enemyDeck, {
                      selfId,
                      presentBoardIds,
                      presentBoardCards,
                    })
                  ) {
                    const callBonus = estimateCallAssembleBonus(sk);
                    const boardCard = simState.enemyBoard[laneIdx];
                    if (boardCard) {
                      boardCard.currentPower =
                        (boardCard.currentPower || 0) + callBonus;
                      boardCard.basePower =
                        (boardCard.basePower || 0) + callBonus;
                    }
                  }
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
                  'assemble',
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
          // 【召喚・召集・鍛造】これらの連続プレイを伴う出現時スキルの場合は、
          // 次の追加プレイアクションが実行されるまで保護フラグ（isSkillResolving）を維持する
          if (activeCard) {
            const hasChainSummon = hasChainSummonSkill(activeCard);
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

// engine.js のトークン・カード配置シミュレーション評価器として、戦闘フェーズ・ターン進行を含む客観的総合評価関数（evaluateTurnOutcome）を注入・登録する
registerPlacementEvaluator((state, owner) => evaluateTurnOutcome(state, owner));

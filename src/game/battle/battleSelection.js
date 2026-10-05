/**
 * ===========================================
 * battleSelection.js
 *
 * バトル中のプレイヤー入力を待機する処理群を提供します。
 * 配置先の選択、カードの選択、スキルの選択など、主にユーザーからの
 * 選択完了を非同期で待機し、結果を返す関数の集まりです。
 * ===========================================
 */
import {
  evaluateBestLanesForToken,
  evaluateAdhocDominateChoice,
  evaluateAdhocSkillChoice,
} from '../ai.js';
import { getAIDiscardIndices } from '../../utils/aiDiscardLogic.js';
import { applyActiveSkillLogic, calculateCombatPhase } from '../engine.js';
import { isTutorialMode, filterPlacementLaneClick } from '../tutorialEngine.js';
import { GameState } from '../../state/gameState.js';
import {
  checkIsEasyAI,
  checkIsOnlineMode,
  hasSkill,
  getSeededRandom,
  shuffleArray,
  sleep,
  playSound,
  matchesUnionMaterial,
} from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import {
  updateBattleUIHook,
  renderHand,
  updateCardDetail,
} from '../../services/uiBattle.js';
import { sendOnlineAction } from '../../services/multiplayer.js';
import {
  AI_THINKING_DURATION,
  PLACEMENT_CONFIRM_DELAY_MS,
} from '../../utils/constants/config.js';
import { showAlertModal, showConfirmModal } from '../../services/uiModals.js';
import { consumeAIAction } from './battleCombat.js';
import {
  pendingChoiceResolver,
  setPendingChoiceResolver,
} from './battleQueue.js';
import { battleEvents } from './events/battleEventEmitter.js';
import { startOnlineTimer, stopOnlineTimer } from './onlineTimer.js';
import { checkIsOnlineTimerEnabled } from '../../utils/constants/onlineTimer.js';
import { BATTLE_PHASE } from './phases/phaseTypes.js';

/**
 * オンライン対戦でリモートから受信した選択データ（配列、プレーンオブジェクト、カンマ区切り文字列、単一値）を
 * 安全に数値インデックスの配列（number[]）に正規化する。
 * Firebase RTDB のオブジェクト化（{ "0": 1, "1": 2 }）やカンマ区切り文字列（"1,2"）にも完全対応。
 * @param {*} rawVal - リモートから受信した未加工の選択データ
 * @returns {number[]} 重複を除外した数値インデックス配列
 */
export function normalizeRemoteChoiceIndices(rawVal) {
  if (
    rawVal === null ||
    rawVal === undefined ||
    rawVal === '' ||
    rawVal === -1
  ) {
    return [];
  }
  let result = [];
  if (Array.isArray(rawVal)) {
    result = rawVal;
  } else if (typeof rawVal === 'object') {
    result = Object.values(rawVal);
  } else if (typeof rawVal === 'string') {
    if (rawVal.includes(',')) {
      result = rawVal
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '');
    } else {
      result = [rawVal];
    }
  } else if (typeof rawVal === 'number') {
    result = [rawVal];
  }

  return Array.from(
    new Set(
      result
        .map((x) => {
          if (typeof x === 'number') return x;
          // 部分一致の数値化（parseInt("1abc") -> 1）やカードUID誤変換を防ぐため、完全一致の整数文字列のみを数値化
          if (typeof x === 'string' && /^-?\d+$/.test(x.trim())) {
            return Number(x.trim());
          }
          return NaN;
        })
        .filter((x) => Number.isInteger(x))
    )
  );
}

/**
 * 配置または召喚において、特定レーンが盤面状況および制約条件に合致しているかを判定するヘルパー関数。
 * 封印レーン、指定可能レーン、先攻初手中央制約、伝説・生贄・頂点・挑戦等の制約を包括的にチェックする。
 *
 * @param {number} lane - 判定対象のレーンインデックス (0, 1, 2)
 * @param {Object} ctx - 判定コンテキスト
 * @param {Array<Object|null>} ctx.board - 配置側プレイヤーの盤面配列
 * @param {Array<number>} ctx.sealedLanes - 配置側プレイヤーの封印レーン状態配列
 * @param {Array<number>|null} [ctx.tokenLanes] - 配置可能レーン制限（指定がある場合）
 * @param {boolean} [ctx.checkConstraints=false] - 召喚制約（伝説・生贄・頂点・挑戦など）を適用するかどうか
 * @param {Object|null} [ctx.tokenCard] - 配置・召喚するカードオブジェクト
 * @param {'blue'|'red'} ctx.owner - 配置を行うプレイヤー
 * @returns {boolean} 合法な配置候補レーンであれば true
 */
function isPlacementCandidateLane(lane, ctx) {
  const { board, sealedLanes, tokenLanes, checkConstraints, tokenCard, owner } =
    ctx;
  if (sealedLanes[lane] !== 0) return false;
  if (
    tokenLanes !== null &&
    Array.isArray(tokenLanes) &&
    !tokenLanes.includes(lane)
  ) {
    return false;
  }
  if (checkConstraints && tokenCard) {
    if (
      GameState.turnCount === 1 &&
      GameState.firstPlayer === owner &&
      lane !== 1
    ) {
      return false;
    }
    const hasLegendary = hasSkill(tokenCard, 'legendary');
    const hasTakeover = hasSkill(tokenCard, 'takeover');
    const hasApex = hasSkill(tokenCard, 'apex');
    const hasChallenge = hasSkill(tokenCard, 'challenge');

    if (hasLegendary && lane !== 1) {
      return false;
    }
    if (hasTakeover && board[lane] === null) {
      return false;
    }
    if (hasApex) {
      const targetCard = board[lane];
      if (!targetCard || !hasSkill(targetCard, 'legendary')) {
        return false;
      }
    }
    if (hasChallenge) {
      const oppBoard =
        owner === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
      if (oppBoard[lane] === null) {
        return false;
      }
    }
  }
  return true;
}

/**
 * キャンセル不可の配置選択において、未選択枠を制約に合致するレーンから自動補完する（空き枠優先、次に既存上書き）。
 * 選択済みレーンの重複追加を確実に防止する（DRY原則）。
 *
 * @param {Array<number>} selectedLanes - 現在選択済みのレーン配列
 * @param {number} targetCount - 要求される総配置数
 * @param {Object} ctx - 判定コンテキスト
 * @param {Array<Object|null>} ctx.board - 配置側プレイヤーの盤面配列
 * @param {Array<number>} ctx.sealedLanes - 配置側プレイヤーの封印レーン状態配列
 * @param {Array<number>|null} [ctx.tokenLanes] - 配置可能レーン制限
 * @param {boolean} [ctx.checkConstraints=false] - 召喚制約の有効フラグ
 * @param {Object|null} [ctx.tokenCard] - 配置・召喚するカードオブジェクト
 * @param {'blue'|'red'} ctx.owner - 配置を行うプレイヤー
 * @returns {Array<number>} 補完後のレーン配列
 */
function fillRemainingPlacementLanes(selectedLanes, targetCount, ctx) {
  const result = [...selectedLanes];
  const { board } = ctx;

  // 1. 空きレーンのうち、未選択かつ合法な候補を優先追加
  const validEmptyLanes = [0, 1, 2].filter(
    (i) =>
      board[i] === null &&
      !result.includes(i) &&
      isPlacementCandidateLane(i, ctx)
  );
  while (result.length < targetCount && validEmptyLanes.length > 0) {
    result.push(validEmptyLanes.shift());
  }

  // 2. 占有レーン（上書き）のうち、未選択かつ合法な候補を追加
  const validOccupiedLanes = [0, 1, 2].filter(
    (i) =>
      board[i] !== null &&
      !result.includes(i) &&
      isPlacementCandidateLane(i, ctx)
  );
  while (result.length < targetCount && validOccupiedLanes.length > 0) {
    result.push(validOccupiedLanes.shift());
  }

  return result;
}

/**
 * プレイヤーまたはAIのカード配置レーン選択を非同期で待機する。
 * @param {number} count - 配置を行う枚数
 * @param {string} owner - プレイヤー種別 ('blue' | 'red')
 * @param {object} tokenCard - 配置対象のカードオブジェクト
 * @param {boolean} [_isLeaderSkill=false] - リーダースキルによる配置かどうかのフラグ
 * @param {Array<number>} [tokenLanes=null] - 配置可能レーンの指定
 * @param {boolean} [checkConstraints=true] - 制約（「伝説」「生贄」等の配置制約）のチェックを行うかどうかのフラグ
 * @param {boolean} [canCancel=false] - キャンセル可能かどうかのフラグ
 * @param {string} [buttonText='配置終了'] - 決定ボタンのテキスト
 * @param {boolean} [_skipImmediateDiscard=false] - 即時破棄スキップフラグ
 * @param {Array<object>} [pendingSkills=[]] - 後続で待機している未解決スキル群
 * @returns {Promise<Array<number>|null>} 選択されたレーンインデックスの配列（キャンセルの場合はnull）
 */
export async function waitPlayerLaneSelection(
  count,
  owner,
  tokenCard,
  _isLeaderSkill = false,
  tokenLanes = null,
  checkConstraints = true,
  canCancel = false,
  buttonText = '配置完了',
  _skipImmediateDiscard = false, // 【追加】後続の playCard 等で破棄を行う場合、この関数内での即時破棄をスキップするフラグ
  pendingSkills = []
) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const sealedLanes =
    owner === 'blue'
      ? GameState.playerSealedLanes || [0, 0, 0]
      : GameState.enemySealedLanes || [0, 0, 0];
  // Check for Remote Choice Wait
  if (checkIsOnlineMode(GameState.gameMode) && owner === 'red') {
    const placementCtx = {
      board,
      sealedLanes,
      tokenLanes,
      checkConstraints,
      tokenCard,
      owner,
    };

    startOnlineTimer({
      type: 'choice',
      owner: 'red',
      onFailsafeTimeout: () => {
        if (pendingChoiceResolver) {
          const resolver = pendingChoiceResolver;
          setPendingChoiceResolver(null);
          // フェイルセーフタイムアウト（相手の応答途絶）時：
          // キャンセル不可なら送信側と同一の決定論的補完を行い、キャンセル可能なら空で解決
          const fallback = !canCancel
            ? fillRemainingPlacementLanes([], count, placementCtx)
            : [];
          resolver(fallback);
        }
      },
    });

    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });

    stopOnlineTimer();

    // Firebase RTDB のオブジェクト化やカンマ区切りを含む受信データを安全に number[] に正規化
    let parsedLanes = normalizeRemoteChoiceIndices(rawVal);

    // 合法なレーン (validLanes) の算出
    let validLanes = [0, 1, 2].filter((i) => sealedLanes[i] === 0);

    if (tokenLanes !== null && Array.isArray(tokenLanes)) {
      validLanes = validLanes.filter((i) => tokenLanes.includes(i));
    }

    if (checkConstraints && tokenCard) {
      const oppBoard =
        owner === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
      const hasLegendary = hasSkill(tokenCard, 'legendary');
      const hasTakeover = hasSkill(tokenCard, 'takeover');
      const hasApex = hasSkill(tokenCard, 'apex');
      const hasChallenge = hasSkill(tokenCard, 'challenge');

      validLanes = validLanes.filter((i) => {
        if (
          GameState.turnCount === 1 &&
          GameState.firstPlayer === owner &&
          i !== 1
        ) {
          return false;
        }
        if (hasLegendary && i !== 1) {
          return false;
        }
        if (hasTakeover && board[i] === null) {
          return false;
        }
        if (hasApex) {
          const targetCard = board[i];
          if (!targetCard || !hasSkill(targetCard, 'legendary')) {
            return false;
          }
        }
        if (hasChallenge && oppBoard[i] === null) {
          return false;
        }
        return true;
      });
    }

    // 送信値が合法手か検証
    let resultLanes = parsedLanes.filter((i) => validLanes.includes(i));

    // 送信側から未達または空でキャンセル不可の場合は決定論的に補完して盤面乖離を防止
    if (resultLanes.length < count && !canCancel && validLanes.length > 0) {
      resultLanes = fillRemainingPlacementLanes(
        resultLanes,
        count,
        placementCtx
      );
    }

    return resultLanes.slice(0, count);
  }

  // AIの場合：
  if (owner === 'red') {
    const availableAI = [0, 1, 2].filter((l) => sealedLanes[l] === 0);
    let selectedLanes;
    // AIが意図的に「配置しない」と決定した場合のフラグ
    let intentionalEmpty = false;

    if (
      tokenLanes !== null &&
      Array.isArray(tokenLanes) &&
      tokenLanes.length > 0
    ) {
      selectedLanes = tokenLanes.splice(0, count);
      // tokenLanesが渡されて消費された場合、もしGameState.aiDecision.cardTokenLanesにも同一の指示が残っていれば同期消費する
      if (
        typeof GameState.aiDecision !== 'undefined' &&
        GameState.aiDecision &&
        Array.isArray(GameState.aiDecision.cardTokenLanes) &&
        GameState.aiDecision.cardTokenLanes.length > 0
      ) {
        GameState.aiDecision.cardTokenLanes.splice(0, count);
        if (GameState.aiDecision.cardTokenLanes.length === 0) {
          delete GameState.aiDecision.cardTokenLanes;
        }
      }
    } else if (
      tokenLanes !== null &&
      Array.isArray(tokenLanes) &&
      tokenLanes.length === 0
    ) {
      // AIが意図的に空配列を渡した場合（例: summonのキャンセル、holy_marchの0体バフのみ）、配置なしとして返す
      selectedLanes = [];
      intentionalEmpty = true;
      if (
        typeof GameState.aiDecision !== 'undefined' &&
        GameState.aiDecision &&
        Array.isArray(GameState.aiDecision.cardTokenLanes)
      ) {
        delete GameState.aiDecision.cardTokenLanes;
      }
    } else {
      // 事前計画キューに残骸があれば消費（クリーンアップ）する
      if (
        typeof GameState.aiDecision !== 'undefined' &&
        GameState.aiDecision &&
        GameState.aiDecision.cardTokenLanes &&
        GameState.aiDecision.cardTokenLanes.length > 0
      ) {
        GameState.aiDecision.cardTokenLanes.splice(0, count);
        if (GameState.aiDecision.cardTokenLanes.length === 0) {
          delete GameState.aiDecision.cardTokenLanes;
        }
      } else {
        consumeAIAction([
          'devilhunter_resurrect',
          'servant',
          'call',
          'assemble',
          'leader_skill',
          'clone',
          'move',
          'elf_polarbear_combo',
          'token_placement',
          'puppet',
        ]);
      }

      // 事前計画の固定レーン再生ではなく、常に最新盤面に基づいた直前シミュレーションを実行して最善レーンを決定する
      const effectivePending =
        Array.isArray(pendingSkills) && pendingSkills.length > 0
          ? pendingSkills
          : Array.isArray(tokenCard?.pendingSkills)
            ? tokenCard.pendingSkills
            : [];
      selectedLanes = evaluateBestLanesForToken(
        availableAI,
        owner,
        tokenCard,
        count,
        canCancel,
        checkConstraints,
        effectivePending
      );
    }

    // カード制約の適用 (ランダムフォールバック発生時に備えて安全弁として適用)
    if (checkConstraints && tokenCard) {
      if (GameState.turnCount === 1 && GameState.firstPlayer === owner) {
        selectedLanes = selectedLanes.filter((i) => i === 1);
      }
      const hasLegendary = hasSkill(tokenCard, 'legendary');
      const hasTakeover = hasSkill(tokenCard, 'takeover');
      const hasApex = hasSkill(tokenCard, 'apex');

      if (hasLegendary) {
        selectedLanes = selectedLanes.filter((i) => i === 1);
      }
      if (hasTakeover) {
        selectedLanes = selectedLanes.filter((i) => board[i] !== null);
      }
      if (hasApex) {
        selectedLanes = selectedLanes.filter(
          (i) => board[i] && hasSkill(board[i], 'legendary')
        );
      }
      const hasChallenge = hasSkill(tokenCard, 'challenge');
      if (hasChallenge) {
        const oppBoard =
          owner === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
        selectedLanes = selectedLanes.filter((i) => oppBoard[i] !== null);
      }
    }

    // それでも足りない場合、空きレーンや重複を許容する（キャンセル可能な場合はAIの「配置しない・数を絞る」という判断を尊重して強制補充しない）
    if (selectedLanes.length < count && !canCancel && !intentionalEmpty) {
      let validEmptyLanes = board
        .map((c, i) => (c === null && sealedLanes[i] === 0 ? i : -1))
        .filter((i) => i !== -1);
      let validOccupiedLanes = [0, 1, 2].filter(
        (i) =>
          !validEmptyLanes.includes(i) &&
          !selectedLanes.includes(i) &&
          sealedLanes[i] === 0
      );

      if (checkConstraints && tokenCard) {
        if (GameState.turnCount === 1 && GameState.firstPlayer === owner) {
          validEmptyLanes = validEmptyLanes.filter((i) => i === 1);
          validOccupiedLanes = validOccupiedLanes.filter((i) => i === 1);
        }
        const hasLegendary = hasSkill(tokenCard, 'legendary');
        const hasTakeover = hasSkill(tokenCard, 'takeover');
        const hasApex = hasSkill(tokenCard, 'apex');

        if (hasLegendary) {
          validEmptyLanes = validEmptyLanes.filter((i) => i === 1);
          validOccupiedLanes = validOccupiedLanes.filter((i) => i === 1);
        }
        if (hasTakeover) {
          validEmptyLanes = []; // 生贄（takeover）は空きレーン不可
        }
        if (hasApex) {
          validEmptyLanes = validEmptyLanes.filter(
            (i) => board[i] && hasSkill(board[i], 'legendary')
          );
          validOccupiedLanes = validOccupiedLanes.filter(
            (i) => board[i] && hasSkill(board[i], 'legendary')
          );
        }
        const hasChallenge = hasSkill(tokenCard, 'challenge');
        if (hasChallenge) {
          const oppBoard =
            owner === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
          validEmptyLanes = validEmptyLanes.filter((i) => oppBoard[i] !== null);
          validOccupiedLanes = validOccupiedLanes.filter(
            (i) => oppBoard[i] !== null
          );
        }
      }

      while (selectedLanes.length < count && validEmptyLanes.length > 0) {
        selectedLanes.push(validEmptyLanes.shift());
      }
      // 上書き対象を決める簡易評価（パワーが低い順）
      validOccupiedLanes.sort(
        (a, b) => (board[a]?.currentPower || 0) - (board[b]?.currentPower || 0)
      );
      while (selectedLanes.length < count && validOccupiedLanes.length > 0) {
        selectedLanes.push(validOccupiedLanes.shift());
      }
    }

    // 最終的に配置先レーンが1つも確保できず、キャンセル可能なら中止する
    // （分身等で隣接レーンが1枠しかない場合など、一部のみ確保できた場合は選ばれたレーンへの配置を続行する）
    if (selectedLanes.length === 0 && canCancel) {
      return [];
    }

    // 不正なレーンが混ざった場合の最終安全装置
    selectedLanes = selectedLanes.filter((i) => sealedLanes[i] === 0);

    return selectedLanes.slice(0, count);
  }

  // プレイヤーの場合：手動選択
  return new Promise((resolve) => {
    GameState.isPlacementMode = true;
    GameState.placementCount = count;
    GameState.placementToken = tokenCard || null;
    GameState.placementSelectedLanes = [];
    GameState.placementCheckConstraints = checkConstraints;
    GameState.placementButtonText = buttonText;
    GameState.placementRestrictLanes = tokenLanes || null;
    GameState.selectedCardIndex = null; // 配置モード開始時に手札の選択解除
    updateCardDetail(null);

    // 【多重実行防止】カウント到達時の setTimeout と「配置終了」ボタンの
    // 両方から cleanUp が呼ばれうるため、実行済みフラグで再入を防ぐ。
    // 2回目の実行を許すと、空の選択結果がオンライン相手へ再送信される。
    let isCleanedUp = false;

    const cleanUp = async () => {
      if (isCleanedUp) return [];
      isCleanedUp = true;
      if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
        stopOnlineTimer();
      }

      // キャンセル不可（!canCancel）で未選択枠が残っている場合、有効レーンから補完する
      if (!canCancel && GameState.placementSelectedLanes.length < count) {
        const placementCtx = {
          board,
          sealedLanes,
          tokenLanes,
          checkConstraints,
          tokenCard,
          owner,
        };
        GameState.placementSelectedLanes = fillRemainingPlacementLanes(
          GameState.placementSelectedLanes,
          count,
          placementCtx
        );
      }

      GameState.isPlacementMode = false;
      GameState.placementCount = 0;
      GameState.placementToken = null;
      GameState.placementCheckConstraints = true;
      GameState.placementButtonText = '配置完了';
      GameState.placementRestrictLanes = null;
      const result = [...GameState.placementSelectedLanes];
      GameState.placementSelectedLanes = [];
      window.handlePlacementLaneClick = null;
      window.finishPlacement = null;
      battleEvents.off('PLACEMENT_FINISH', onFinishPlacement);
      battleEvents.off('PLACEMENT_LANE_CLICK', onPlacementLaneClick);
      updateCardDetail(null);

      if (checkIsOnlineMode(GameState.gameMode)) {
        // 送信先を同期
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: result,
        });
      }

      if (updateBattleUIHook) updateBattleUIHook();
      return result;
    };

    if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
      startOnlineTimer({
        type: 'choice',
        owner: 'blue',
        onTimeout: async () => {
          if (isCleanedUp) return;
          resolve(await cleanUp());
        },
      });
    }

    const onFinishPlacement = async () => {
      // チュートリアル中はまだ配置先がある場合ブロック
      if (isTutorialMode()) {
        const t = GameState.tutorial;
        if (
          (t.placementTargetLane !== undefined &&
            t.placementTargetLane !== null) ||
          (Array.isArray(t.placementTargetLanes) &&
            t.placementTargetLanes.length > 0)
        ) {
          playSound(SOUNDS.seDamage);
          return;
        }
      }
      playSound(SOUNDS.seClick);
      resolve(await cleanUp());
    };

    const onPlacementLaneClick = async (laneIndex) => {
      // 連打防止: count分のレーンが既に選択済みなら追加クリックを無視
      if (GameState.placementSelectedLanes.length >= count) return;
      if (GameState.placementSelectedLanes.includes(laneIndex)) return;
      if (sealedLanes[laneIndex] > 0) {
        playSound(SOUNDS.seDamage);
        return;
      }
      if (
        GameState.placementRestrictLanes &&
        !GameState.placementRestrictLanes.includes(laneIndex)
      ) {
        playSound(SOUNDS.seDamage);
        return;
      }
      // チュートリアルのレーン制限フィルタ
      if (filterPlacementLaneClick(laneIndex)) return;
      playSound(SOUNDS.seClick);

      const newCard = GameState.placementToken;
      if (newCard && checkConstraints) {
        if (
          GameState.turnCount === 1 &&
          GameState.firstPlayer === 'blue' &&
          laneIndex !== 1
        ) {
          playSound(SOUNDS.seDamage);
          showAlertModal(`1ターン目は中央のレーンにしか召喚できません。`);
          return;
        }
        if (hasSkill(newCard, 'legendary') && laneIndex !== 1) {
          playSound(SOUNDS.seDamage);
          showAlertModal(
            `「${newCard.name}」は伝説のカードのため、中央のレーンにしか召喚できません。`
          );
          return;
        }
        if (hasSkill(newCard, 'takeover') && board[laneIndex] === null) {
          playSound(SOUNDS.seDamage);
          showAlertModal(
            `「${newCard.name}」は生贄のカードのため、既にカードがあるレーンにしか召喚できません。`
          );
          return;
        }
        if (hasSkill(newCard, 'apex')) {
          const targetCard = board[laneIndex];
          if (!targetCard || !hasSkill(targetCard, 'legendary')) {
            playSound(SOUNDS.seDamage);
            showAlertModal(
              `「${newCard.name}」は頂点のカードのため、自分の場の伝説カードの上にしか召喚できません。`
            );
            return;
          }
        }
        if (hasSkill(newCard, 'challenge')) {
          const oppBoard =
            owner === 'blue' ? GameState.enemyBoard : GameState.playerBoard;
          if (oppBoard[laneIndex] === null) {
            playSound(SOUNDS.seDamage);
            showAlertModal(
              `「${newCard.name}」は挑戦を持つため、正面に敵がいるレーンにしか召喚できません。`
            );
            return;
          }
        }
      }

      // 根本的リファクタリングにより、既存カードの破棄・確認処理は呼び出し元で一元管理するため、ここでは何もしません。

      GameState.placementSelectedLanes.push(laneIndex);
      if (updateBattleUIHook) updateBattleUIHook();

      if (GameState.placementSelectedLanes.length >= count) {
        setTimeout(async () => {
          resolve(await cleanUp());
        }, PLACEMENT_CONFIRM_DELAY_MS);
      }
    };

    // 【移行措置】battleEvents への完全移行が完了するまで、旧 window グローバル経由の
    // 呼び出しも受け付ける。UI 側が両方を発火した場合でも、onPlacementLaneClick の
    // 重複ガード（L396-397）と cleanUp の isCleanedUp フラグにより二重処理を防ぐ。
    window.finishPlacement = onFinishPlacement;
    window.handlePlacementLaneClick = onPlacementLaneClick;
    battleEvents.on('PLACEMENT_FINISH', onFinishPlacement);
    battleEvents.on('PLACEMENT_LANE_CLICK', onPlacementLaneClick);

    if (updateBattleUIHook) updateBattleUIHook();
  });
}

/**
 * 対象カードに配置カードを装備可能かどうかを判定する共通ヘルパー関数
 * （憑依・反射などの装備禁止スキル持ちのカードは除外する）
 * @param {object} playingCard - 配置・移動しようとしているカード
 * @param {object} targetCard - 盤面の配置先にあるカード
 * @returns {boolean} 装備可能ならtrue、不可能ならfalse
 */
export function canEquipCard(playingCard, targetCard) {
  if (!playingCard || !targetCard) return false;

  // 1. 基本的な装備スキル/武装スキルの所持チェック
  const hasEquipAbility =
    hasSkill(playingCard, 'equip') || hasSkill(targetCard, 'arm_self');
  if (!hasEquipAbility) return false;

  // 2. 装備禁止（憑依・反射）のチェック
  const hasRestriction =
    hasSkill(targetCard, 'possession') ||
    hasSkill(playingCard, 'possession') ||
    hasSkill(targetCard, 'reflect') ||
    hasSkill(playingCard, 'reflect');

  return !hasRestriction;
}

/**
 * 既存カードがあるレーンへの配置・移動・召喚時に、合体・装備・破棄の確認モーダルを表示します。
 * 状態の変更（カードの破棄など）は行いません。
 * 本関数は確認モーダルの表示のみを担当します。「伝説」「生贄」等の配置制約チェックは
 * 呼び出し元（waitPlayerLaneSelection / playCard）が既に完了させている前提です。
 * @param {string} owner - 'blue' | 'red'
 * @param {object} tokenCard - 配置しようとしているカード
 * @param {number} laneIndex - 配置先レーン
 * @returns {Promise<boolean>} 配置を続行してよいならtrue、キャンセルされたならfalse
 */
export async function confirmOverwrittenLane(owner, tokenCard, laneIndex) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  if (board[laneIndex] === null) return true;

  const existingCard = board[laneIndex];
  const tokenName = tokenCard ? tokenCard.name : 'トークン';

  // AI（owner !== 'blue'）の場合は、確認モーダルを出さずに自動的に承諾したものとして進行する
  if (owner !== 'blue') {
    return true;
  }

  // 0. 起動の判定 (合体や装備に優先して処理される)
  if (existingCard && hasSkill(existingCard, 'startup')) {
    const confirmed = await new Promise((res) => {
      showConfirmModal(
        `「${tokenName}」で「${existingCard.name}」を起動しますか？`,
        () => res(true),
        () => res(false)
      );
    });
    if (!confirmed) return false;
    return true;
  }

  // 1. 合体の判定
  let canUnion = false;
  if (tokenCard) {
    const unionSkill =
      tokenCard.skills && tokenCard.skills.find((s) => s.id === 'union');
    if (unionSkill && matchesUnionMaterial(existingCard, unionSkill)) {
      canUnion = true;
    }
  }
  if (canUnion) {
    const confirmed = await new Promise((res) => {
      showConfirmModal(
        `「${existingCard.name}」と合体しますか？`,
        () => res(true),
        () => res(false)
      );
    });
    if (!confirmed) return false;
    return true;
  }

  // 2. 装備の判定（共通ヘルパーcanEquipCardで憑依・反射等の制限を考慮して判定）
  if (canEquipCard(tokenCard, existingCard)) {
    const confirmed = await new Promise((res) => {
      showConfirmModal(
        `「${existingCard.name}」に「${tokenName}」を装備しますか？`,
        () => res(true),
        () => res(false)
      );
    });
    if (!confirmed) return false;
    return true;
  }

  // 3. 通常の破棄配置の判定
  const confirmed = await new Promise((res) => {
    showConfirmModal(
      `「${existingCard.name}」を破棄して「${tokenName}」を配置しますか？`,
      () => res(true),
      () => res(false)
    );
  });
  if (!confirmed) return false;

  return true;
}

/**
 * 相手の場のカードを選択させるユーティリティ（破壊スキル用など）
 */
export async function waitPlayerEnemyLaneSelection(
  count,
  owner,
  canCancel = false,
  message = null,
  allowEmpty = false,
  maxPower = null, // 【追加】支配などでパワー上限制限を設けるためのフィルター
  restrictLanes = null // 【追加】選択可能なレーンを制限するための配列
) {
  const isBlue = owner === 'blue';
  const targetBoard = isBlue ? GameState.enemyBoard : GameState.playerBoard;

  // ターゲット可能なレーンを取得（allowEmptyがtrueなら空レーンも含む、かつmaxPower指定時はそれを超えるカードを除外）
  let validLanes = allowEmpty
    ? [0, 1, 2]
    : targetBoard
        .map((c, i) => {
          if (c === null) return -1;
          if (
            maxPower !== null &&
            (c.currentPower ?? c.power ?? 0) > maxPower
          ) {
            return -1;
          }
          return i;
        })
        .filter((i) => i !== -1);

  if (restrictLanes !== null) {
    validLanes = validLanes.filter((i) => restrictLanes.includes(i));
  }

  if (validLanes.length === 0) return [];

  // Check for Remote Choice Wait
  if (checkIsOnlineMode(GameState.gameMode) && owner === 'red') {
    startOnlineTimer({
      type: 'choice',
      owner: 'red',
      onFailsafeTimeout: () => {
        if (pendingChoiceResolver) {
          const resolver = pendingChoiceResolver;
          setPendingChoiceResolver(null);
          // フェイルセーフタイムアウト時：キャンセル不可なら有効レーンから決定論的に補完
          resolver(
            !canCancel && validLanes.length > 0
              ? validLanes.slice(0, count)
              : []
          );
        }
      },
    });

    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });

    stopOnlineTimer();

    // Firebase RTDB のオブジェクト化やカンマ区切りを含む受信データを安全に number[] に正規化
    let parsedLanes = normalizeRemoteChoiceIndices(rawVal);
    let resultLanes = parsedLanes.filter((i) => validLanes.includes(i));

    // 補正は送信側（blue の確定時）で確定済み。受信側で独自補正すると盤面が分岐するため行わない
    if (resultLanes.length === 0 && !canCancel && validLanes.length > 0) {
      console.warn(
        '[online] 空の敵レーン選択を受信しました。送信側の確定値をそのまま適用します。'
      );
    }

    return resultLanes.slice(0, count);
  }

  // AIの場合：常に最新盤面に基づいた直前全通りシミュレーションで最善レーンを選択する
  if (owner === 'red') {
    if (GameState.aiDecision?.cardTokenLanes?.length > 0) {
      delete GameState.aiDecision.cardTokenLanes;
    }

    if (checkIsEasyAI()) {
      // Easy AI: パワーが高いカードを優先して狙う
      const sortedLanes = [...validLanes].sort((a, b) => {
        const pA = targetBoard[a] ? targetBoard[a].currentPower : -1;
        const pB = targetBoard[b] ? targetBoard[b].currentPower : -1;
        const diff = pB - pA;
        if (diff !== 0) return diff;
        return a - b; // インデックスが小さい方（左）を優先
      });
      return sortedLanes.slice(0, count);
    } else {
      // Normal以上: 常に最新盤面に基づいた直前シミュレーションで最善レーン（またはキャンセル）を決定
      const bestLane = evaluateAdhocDominateChoice(
        validLanes,
        maxPower !== null ? maxPower : 999,
        owner
      );
      if (bestLane !== null && bestLane >= 0) {
        return [bestLane];
      } else {
        // キャンセル（奪わない）が最善の場合は空配列を返却
        return [];
      }
    }
  }

  return new Promise((resolve) => {
    GameState.isEnemyTargetMode = true;
    GameState.targetMaxCount = count;
    GameState.targetSelectedLanes = [];
    GameState.isTargetCancelable = canCancel;
    GameState.isEnemyTargetAllowEmpty = allowEmpty;

    if (message) {
      updateCardDetail(message);
    } else {
      updateCardDetail(null);
    }

    let isCleanedUp = false;
    const cleanUp = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
        stopOnlineTimer();
      }
      GameState.isEnemyTargetMode = false;
      GameState.targetSelectedLanes = [];
      GameState.targetMaxCount = 0;
      GameState.isEnemyTargetAllowEmpty = false;
      GameState.isTargetCancelable = false;
      window.handleEnemyLaneClick = null;
      window.finishEnemyTargetSelection = null;
      battleEvents.off('ENEMY_LANE_CLICK', onEnemyLaneClick);
      battleEvents.off(
        'ENEMY_TARGET_SELECTION_FINISH',
        onFinishEnemyTargetSelection
      );
      updateCardDetail(null);
    };

    if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
      startOnlineTimer({
        type: 'choice',
        owner: 'blue',
        onTimeout: () => {
          if (isCleanedUp) return;
          if (!canCancel) {
            for (const lane of validLanes) {
              if (GameState.targetSelectedLanes.length >= count) break;
              if (!GameState.targetSelectedLanes.includes(lane)) {
                GameState.targetSelectedLanes.push(lane);
              }
            }
          }
          onFinishEnemyTargetSelection();
        },
      });
    }

    const onEnemyLaneClick = (laneIndex) => {
      if (isCleanedUp) return;
      // 連打防止: count分のレーンが既に選択済みなら追加クリックを無視
      if (GameState.targetSelectedLanes.length >= count) return;
      if (!validLanes.includes(laneIndex)) {
        playSound(SOUNDS.seDamage);
        return;
      }

      // チュートリアルのレーン制限フィルタ（配置やターゲット選択用）
      if (filterPlacementLaneClick && filterPlacementLaneClick(laneIndex))
        return;

      playSound(SOUNDS.seClick);

      if (!GameState.targetSelectedLanes.includes(laneIndex)) {
        GameState.targetSelectedLanes.push(laneIndex);
        if (updateBattleUIHook) updateBattleUIHook(); // 選択ハイライト更新

        if (GameState.targetSelectedLanes.length >= count) {
          setTimeout(() => {
            // 自身の選択が既に終了している場合は確定しない（後続の選択待ちを誤確定させないため）
            if (isCleanedUp) return;
            onFinishEnemyTargetSelection();
          }, 300);
        }
      }
    };

    const onFinishEnemyTargetSelection = async () => {
      if (isCleanedUp) return;
      playSound(SOUNDS.seClick);

      // キャンセル不可かつ未選択の場合、有効レーンから補完
      if (
        !canCancel &&
        GameState.targetSelectedLanes.length === 0 &&
        validLanes.length > 0
      ) {
        for (const lane of validLanes) {
          if (GameState.targetSelectedLanes.length >= count) break;
          GameState.targetSelectedLanes.push(lane);
        }
      }

      const result = [...GameState.targetSelectedLanes];
      cleanUp();

      if (checkIsOnlineMode(GameState.gameMode)) {
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: result,
        });
      }

      if (updateBattleUIHook) updateBattleUIHook();
      resolve(result);
    };

    window.handleEnemyLaneClick = onEnemyLaneClick;
    window.finishEnemyTargetSelection = onFinishEnemyTargetSelection;
    battleEvents.on('ENEMY_LANE_CLICK', onEnemyLaneClick);
    battleEvents.on(
      'ENEMY_TARGET_SELECTION_FINISH',
      onFinishEnemyTargetSelection
    );

    if (updateBattleUIHook) updateBattleUIHook();
  });
}

/**
 * 自分のボード上のカードやレーンを選択させる処理（非同期ユーティリティ）
 * 主に「分身」「転向」「鍛造」「跳躍」「処刑」「強化」などの、自分のカードまたはレーンを選択して発動するアクティブスキルの解決時に呼び出される。
 *
 * @param {number} count - 選択させるカードやレーンの目標数
 * @param {string} owner - 誰が選択を行うか ('blue': プレイヤー, 'red': 敵/AI)
 * @param {boolean} [canCancel=false] - 選択キャンセルが許容されるか
 * @param {number[]} [excludedLanes=[]] - 選択候補から除外する自陣レーンインデックスの配列（例: 自身が配置されているレーン）
 * @returns {Promise<number[]>} 選択された自陣のレーンインデックス（0〜2）の配列を返す Promise
 */
export async function waitPlayerAlliedLaneSelection(
  count,
  owner,
  canCancel = false,
  excludedLanes = []
) {
  const isBlue = owner === 'blue';
  // 選択を行う側の盤面（自陣ボード）を取得する
  const targetBoard = isBlue ? GameState.playerBoard : GameState.enemyBoard;

  // すでにカードが配置されており、かつ除外対象外のレーン（ターゲット候補となるインデックス）を取得
  const occupiedLanes = targetBoard
    .map((c, i) => (c !== null && !excludedLanes.includes(i) ? i : -1))
    .filter((i) => i !== -1);

  // 味方の盤面に1枚もカードがなければ、選択の余地がないため即座に空配列を返す
  if (occupiedLanes.length === 0) return [];

  // 【フェーズ 1】オンライン対戦かつ相手プレイヤーの選択待ちの場合
  if (checkIsOnlineMode(GameState.gameMode) && owner === 'red') {
    startOnlineTimer({
      type: 'choice',
      owner: 'red',
      onFailsafeTimeout: () => {
        if (pendingChoiceResolver) {
          const resolver = pendingChoiceResolver;
          setPendingChoiceResolver(null);
          resolver(
            !canCancel && occupiedLanes.length > 0
              ? occupiedLanes.slice(0, count)
              : []
          );
        }
      },
    });

    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });

    stopOnlineTimer();

    // 受信データを数値配列 [laneIndex] に正規化する
    let parsedLanes = normalizeRemoteChoiceIndices(rawVal).filter(
      (x) => x >= 0 && x < 3
    );
    // 実際にカードが存在するレーンのみを抽出
    let resultLanes = parsedLanes.filter((i) => occupiedLanes.includes(i));

    // 補正は送信側（blue の確定時）で確定済み。受信側で独自補正すると盤面が分岐するため行わない
    if (resultLanes.length === 0 && !canCancel && occupiedLanes.length > 0) {
      console.warn(
        '[online] 空の味方レーン選択を受信しました。送信側の確定値をそのまま適用します。'
      );
    }

    return resultLanes.slice(0, count);
  }

  // 【フェーズ 2】AI（敵またはシミュレーション）が選択を行う場合
  if (owner === 'red') {
    // ターゲット可能なレーンの中で、現在のパワーが最も高いカードを優先して選択する
    const sortedLanes = [...occupiedLanes].sort((a, b) => {
      const diff = targetBoard[b].currentPower - targetBoard[a].currentPower;
      if (diff !== 0) return diff;
      return a - b; // パワーが同じなら左側（インデックス小）を優先
    });
    return sortedLanes.slice(0, count);
  }

  // 【フェーズ 3】プレイヤーが画面上で手動選択を行う場合
  return new Promise((resolve) => {
    // グローバル状態に自分のカード/レーン選択モードであることを設定する
    GameState.isAlliedTargetMode = true;
    GameState.targetMaxCount = count;
    GameState.targetSelectedLanes = [];
    GameState.isTargetCancelable = canCancel;
    updateCardDetail(null);

    /**
     * 自分のカードやレーンがクリックされた時のイベントハンドラ
     * @param {number} laneIndex - クリックされたレーンインデックス
     */
    let isCleanedUp = false;
    const cleanUp = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
        stopOnlineTimer();
      }
      GameState.isAlliedTargetMode = false;
      GameState.targetSelectedLanes = [];
      GameState.targetMaxCount = 0;
      GameState.isTargetCancelable = false;
      window.handleAlliedLaneClick = null;
      window.finishAlliedSelection = null;
      battleEvents.off('ALLIED_LANE_CLICK', onAlliedLaneClick);
      battleEvents.off('ALLIED_SELECTION_FINISH', onFinishAlliedSelection);
      updateCardDetail(null);
    };

    if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
      startOnlineTimer({
        type: 'choice',
        owner: 'blue',
        onTimeout: () => {
          if (isCleanedUp) return;
          if (!canCancel) {
            for (const lane of occupiedLanes) {
              if (GameState.targetSelectedLanes.length >= count) break;
              if (!GameState.targetSelectedLanes.includes(lane)) {
                GameState.targetSelectedLanes.push(lane);
              }
            }
          }
          onFinishAlliedSelection();
        },
      });
    }

    /**
     * 自分のカードやレーンがクリックされた時のイベントハンドラ
     * @param {number} laneIndex - クリックされたレーンインデックス
     */
    const onAlliedLaneClick = (laneIndex) => {
      if (isCleanedUp) return;
      // 対象レーンにカードがない、または範囲外・不正なレーンの場合は処理をスキップ
      if (!occupiedLanes.includes(laneIndex)) return;
      playSound(SOUNDS.seClick);

      // まだ選択されていないレーンであれば選択リストに追加する
      if (!GameState.targetSelectedLanes.includes(laneIndex)) {
        GameState.targetSelectedLanes.push(laneIndex);
        if (updateBattleUIHook) updateBattleUIHook(); // 選択ハイライトのUI表示を更新

        // 規定枚数（目標数）の選択が完了した場合
        if (GameState.targetSelectedLanes.length >= count) {
          // タップ決定演出のために300ms待ってから、非同期で決定処理を呼び出す
          setTimeout(() => {
            // 自身の選択が既に終了している場合は確定しない（後続の選択待ちを誤確定させないため）
            if (isCleanedUp) return;
            onFinishAlliedSelection();
          }, 300);
        }
      }
    };

    /**
     * 選択処理を確定させ、画面上の選択モードを解除するクリーンアップ兼決定関数
     */
    const onFinishAlliedSelection = async () => {
      if (isCleanedUp) return;
      playSound(SOUNDS.seClick);

      // キャンセル不可かつ未選択の場合、有効レーンから補完
      if (
        !canCancel &&
        GameState.targetSelectedLanes.length === 0 &&
        occupiedLanes.length > 0
      ) {
        for (const lane of occupiedLanes) {
          if (GameState.targetSelectedLanes.length >= count) break;
          GameState.targetSelectedLanes.push(lane);
        }
      }

      const result = [...GameState.targetSelectedLanes];
      cleanUp();

      // オンライン対戦の場合は、選択決定データを同期送信する
      if (checkIsOnlineMode(GameState.gameMode)) {
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: result,
        });
      }

      if (updateBattleUIHook) updateBattleUIHook(); // UIハイライト等の状態更新をトリガー
      resolve(result); // 非同期の呼び出し元へ選択結果配列を返却する
    };

    window.handleAlliedLaneClick = onAlliedLaneClick;
    window.finishAlliedSelection = onFinishAlliedSelection;
    battleEvents.on('ALLIED_LANE_CLICK', onAlliedLaneClick);
    battleEvents.on('ALLIED_SELECTION_FINISH', onFinishAlliedSelection);

    if (updateBattleUIHook) updateBattleUIHook();
  });
}

/**
 * プレイヤーまたはAIに手札からカードを選択させるユーティリティ（入替スキル用）
 */
export async function waitPlayerHandSelection(
  count,
  owner,
  forceExact = false,
  message = null
) {
  const hand = owner === 'blue' ? GameState.playerHand : GameState.enemyHand;
  const isMulligan = GameState.battlePhase === BATTLE_PHASE.MULLIGAN;

  // Check for Remote Choice Wait
  if (checkIsOnlineMode(GameState.gameMode) && owner === 'red') {
    if (!isMulligan) {
      startOnlineTimer({
        type: 'choice',
        owner: 'red',
        onFailsafeTimeout: () => {
          if (pendingChoiceResolver) {
            const resolver = pendingChoiceResolver;
            setPendingChoiceResolver(null);
            const fallback = forceExact
              ? Array.from(
                  { length: Math.min(count, hand.length) },
                  (_, i) => hand.length - 1 - i
                )
              : [];
            resolver(fallback);
          }
        },
      });
    }

    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });

    if (!isMulligan) {
      stopOnlineTimer();
    }

    // number[] に正規化
    let parsedIndices = normalizeRemoteChoiceIndices(rawVal);
    let resultIndices = parsedIndices.filter((i) => i >= 0 && i < hand.length);

    if (forceExact && resultIndices.length < count) {
      for (
        let i = hand.length - 1;
        i >= 0 && resultIndices.length < count;
        i--
      ) {
        if (!resultIndices.includes(i)) resultIndices.push(i);
      }
    }

    return resultIndices.slice(0, count);
  }

  // AIの場合：事前計画キュー（actionQueue）から破棄予定カードを取得し、シミュレーション通りの最善カードを選択
  if (owner === 'red') {
    const plannedIndices = [];
    for (let i = 0; i < count; i++) {
      const plannedAction = consumeAIAction('discard');
      if (plannedAction) {
        // UID優先照合（手札配列の変動やインデックスずれに影響されない確実な特定）
        if (plannedAction.targetUid) {
          const matchIdx = hand.findIndex(
            (c, idx) =>
              c &&
              !plannedIndices.includes(idx) &&
              (c.uid === plannedAction.targetUid ||
                c.baseId === plannedAction.targetUid ||
                c.id === plannedAction.targetUid)
          );
          if (matchIdx !== -1) {
            plannedIndices.push(matchIdx);
            continue;
          }
        }
        // インデックス照合（フォールバック）
        if (
          plannedAction.targetIdx !== undefined &&
          plannedAction.targetIdx >= 0 &&
          plannedAction.targetIdx < hand.length &&
          !plannedIndices.includes(plannedAction.targetIdx)
        ) {
          plannedIndices.push(plannedAction.targetIdx);
          continue;
        }
      }
    }

    // 事前計画で規定枚数すべてのカードが特定できた場合はそのまま確定
    if (plannedIndices.length === count) {
      return plannedIndices;
    }

    // 計画が一部のみ特定できた場合、残りの枚数をフォールバックで補う
    if (plannedIndices.length > 0) {
      const remainingCount = count - plannedIndices.length;
      const remainingHand = hand.map((c, i) =>
        plannedIndices.includes(i) ? null : c
      );
      const fallbackIndices = getAIDiscardIndices(
        remainingHand,
        remainingCount,
        forceExact
      );
      return [...plannedIndices, ...fallbackIndices].slice(0, count);
    }

    // 事前計画が存在しない場合（相手のハンデス効果等）：共通のAI破棄選択ロジックで最適インデックスを決定
    return getAIDiscardIndices(hand, count, forceExact);
  }

  // プレイヤーの場合：手動選択
  return new Promise((resolve) => {
    GameState.discardSelectedIndices = [];

    // 手札入れ替え用のプロンプトを表示
    GameState.isDiscardingMode = true;
    GameState.isDiscardingExact = forceExact;
    GameState.discardMaxCount = count;

    if (message) {
      updateCardDetail(message);
    } else {
      updateCardDetail(null);
    }

    renderHand(); // 描画更新
    // カード説明の表示を確実にReact描画に反映させる
    if (updateBattleUIHook) updateBattleUIHook();

    const cleanUp = () => {
      GameState.isDiscardingMode = false;
      GameState.isDiscardingExact = false;
      if (checkIsOnlineTimerEnabled(GameState.gameMode) && !isMulligan) {
        stopOnlineTimer();
      }
      const result = [...GameState.discardSelectedIndices];
      GameState.discardSelectedIndices = [];
      GameState.discardMaxCount = 0;
      window.finishHandSelection = null;
      updateCardDetail(null);
      renderHand(); // 通常の状態に戻す
      if (updateBattleUIHook) updateBattleUIHook();
      return result;
    };

    if (checkIsOnlineTimerEnabled(GameState.gameMode) && !isMulligan) {
      startOnlineTimer({
        type: 'choice',
        owner: 'blue',
        onTimeout: () => {
          if (forceExact) {
            for (
              let i = hand.length - 1;
              i >= 0 && GameState.discardSelectedIndices.length < count;
              i--
            ) {
              if (!GameState.discardSelectedIndices.includes(i)) {
                GameState.discardSelectedIndices.push(i);
              }
            }
          }
          if (typeof window.finishHandSelection === 'function') {
            window.finishHandSelection();
          }
        },
      });
    }

    window.finishHandSelection = async () => {
      // チュートリアル中: カードを選ばずに終了することをブロック
      if (isTutorialMode() && GameState.discardSelectedIndices.length === 0) {
        playSound(SOUNDS.seDamage);
        return;
      }
      playSound(SOUNDS.seClick);
      const indices = cleanUp();

      if (checkIsOnlineMode(GameState.gameMode)) {
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: indices,
        });
      }

      resolve(indices);
    };
  });
}

/**
 * 墓地から選択する共有ユーティリティ（復活、回収等）
 * @param {Array} validCards - 選択対象のカードリスト
 * @param {number} maxPow - 選択可能な最大パワー
 * @param {string} owner - 'blue' | 'red'
 * @param {string} title - モーダルのタイトル
 * @param {string} desc - モーダルの説明文
 * @param {boolean} [canCancel=true] - キャンセル可能か
 * @param {number} [maxChoices=1] - 最大選択数
 * @param {string|null} [skillId=null] - 選択を要求しているスキルの英語ID
 */
export async function waitPlayerDiscardSelection(
  validCards,
  maxPow,
  owner,
  title,
  desc,
  canCancel = true,
  maxChoices = 1,
  skillId = null
) {
  if (!validCards || validCards.length === 0) return maxChoices > 1 ? [] : null;

  // Check for Remote Choice Wait
  if (checkIsOnlineMode(GameState.gameMode) && owner === 'red') {
    startOnlineTimer({
      type: 'choice',
      owner: 'red',
      onFailsafeTimeout: () => {
        if (pendingChoiceResolver) {
          const resolver = pendingChoiceResolver;
          setPendingChoiceResolver(null);
          if (canCancel) {
            resolver(maxChoices > 1 ? [] : null);
          } else {
            resolver(
              validCards.length > 0
                ? maxChoices > 1
                  ? validCards.slice(0, maxChoices).map((c) => c.uid || c.id)
                  : validCards[0].uid || validCards[0].id
                : null
            );
          }
        }
      },
    });

    const choiceStr = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });

    stopOnlineTimer();

    if (!choiceStr || choiceStr === -1) {
      if (!canCancel) {
        if (validCards.length > 0) {
          return maxChoices > 1 ? [validCards[0]] : validCards[0];
        }
        throw new Error(
          'Invalid online action: Discard selection cannot be cancelled.'
        );
      }
      return maxChoices > 1 ? [] : null;
    }

    let selected = [];
    if (Array.isArray(choiceStr)) {
      selected = validCards.filter(
        (c) =>
          choiceStr.includes(c.uid) ||
          choiceStr.includes(c.id) ||
          choiceStr.some(
            (item) => item && (item.uid === c.uid || item.id === c.id)
          )
      );
    } else if (choiceStr && typeof choiceStr === 'object') {
      const targetId = choiceStr.uid || choiceStr.id;
      selected = validCards.filter(
        (c) => c.uid === targetId || c.id === targetId
      );
    } else if (typeof choiceStr === 'string' && choiceStr) {
      const uids = choiceStr.split(',');
      selected = validCards.filter(
        (c) => uids.includes(c.uid) || uids.includes(c.id)
      );
    }

    if (maxChoices > 1) {
      // 補正は送信側で確定済み。受信側で独自補正すると盤面が分岐するため行わない
      if (selected.length === 0 && !canCancel && validCards.length > 0) {
        console.warn(
          '[online] 空の手札選択を受信しました。送信側の確定値をそのまま適用します。'
        );
      }
      return selected.slice(0, maxChoices);
    } else {
      const matchingCard = selected[0] || null;
      if (!matchingCard && !canCancel && validCards.length > 0) {
        console.warn(
          '[online] 手札選択なしを受信しました。送信側の確定値をそのまま適用します。'
        );
      }
      return matchingCard;
    }
  }

  // AIの場合
  if (
    owner === 'red' &&
    GameState.gameMode !== 'online' &&
    GameState.gameMode !== 'pvp'
  ) {
    const aiAction = consumeAIAction([
      'resurrect',
      'devilhunter_resurrect',
      'overdrive',
      'call',
      'assemble',
      'salvage',
      'choice',
      'puppet',
    ]);
    if (aiAction) {
      if (maxChoices > 1) {
        let selected = [];
        if (aiAction.targetUid) {
          const uids = String(aiAction.targetUid).split(',');
          selected = validCards.filter(
            (c) => uids.includes(c.uid) || uids.includes(c.id)
          );
        }
        if (selected.length > 0) return selected.slice(0, maxChoices);
      } else {
        // targetUid が存在する場合はUID優先で照合（フィルタ済みvalidCardsとのインデックスずれを防ぐ）
        if (aiAction.targetUid) {
          const byUid = validCards.find(
            (c) => c.uid === aiAction.targetUid || c.id === aiAction.targetUid
          );
          if (byUid) return byUid;
        }
        // フォールバック: targetIdx がそのまま使える場合
        if (
          aiAction.targetIdx !== undefined &&
          validCards[aiAction.targetIdx]
        ) {
          return validCards[aiAction.targetIdx];
        }
      }
    }
    // フォールバック: ランダムに選択（回収などのシミュレーション除外スキル用）
    if (maxChoices > 1) {
      const shuffled = shuffleArray([...validCards]);
      return shuffled.slice(0, maxChoices);
    } else {
      // 探索（explore）や召集（assemble）のフォールバック時は、選べる中で最大パワーのカードからランダムに選ぶ
      if (skillId === 'explore' || skillId === 'assemble') {
        const maxP = Math.max(...validCards.map((c) => c.power || 0));
        const bestCards = validCards.filter((c) => (c.power || 0) === maxP);
        return bestCards[Math.floor(getSeededRandom() * bestCards.length)];
      }
      const randomIndex = Math.floor(getSeededRandom() * validCards.length);
      return validCards[randomIndex];
    }
  }

  // プレイヤーの場合
  if (window.showDiscardSelectionModalReact) {
    if (maxChoices > 1) {
      let isDone = false;
      let modalResolve = null;

      if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
        startOnlineTimer({
          type: 'choice',
          owner: 'blue',
          onTimeout: () => {
            if (isDone) return;
            isDone = true;
            if (window.closeDiscardSelectionModalReact) {
              window.closeDiscardSelectionModalReact();
            }
            const fallback = canCancel ? [] : validCards.slice(0, maxChoices);
            if (modalResolve) modalResolve(fallback);
          },
        });
      }

      const selectedCards = await new Promise((resolve) => {
        modalResolve = resolve;
        window.showDiscardSelectionModalReact(
          validCards,
          maxPow,
          (cards) => {
            if (isDone) return;
            isDone = true;
            resolve(cards);
          },
          { title, desc, canCancel, maxChoices }
        );
      });

      if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
        stopOnlineTimer();
      }

      // キャンセル不可かつ未選択の場合、有効カードから補完
      const effectiveCards =
        !canCancel &&
        (!selectedCards || selectedCards.length === 0) &&
        validCards.length > 0
          ? validCards.slice(0, maxChoices)
          : selectedCards;

      if (checkIsOnlineMode(GameState.gameMode)) {
        const choiceStr =
          effectiveCards && effectiveCards.length > 0
            ? effectiveCards.map((c) => c.uid || c.id).join(',')
            : null;
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: choiceStr,
        });
      }
      return effectiveCards || [];
    } else {
      let isDone = false;
      let modalResolve = null;

      if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
        startOnlineTimer({
          type: 'choice',
          owner: 'blue',
          onTimeout: () => {
            if (isDone) return;
            isDone = true;
            if (window.closeDiscardSelectionModalReact) {
              window.closeDiscardSelectionModalReact();
            }
            const fallback = canCancel ? null : validCards[0];
            if (modalResolve) modalResolve(fallback);
          },
        });
      }

      const card = await new Promise((resolve) => {
        modalResolve = resolve;
        window.showDiscardSelectionModalReact(
          validCards,
          maxPow,
          (c) => {
            if (isDone) return;
            isDone = true;
            resolve(c);
          },
          { title, desc, canCancel }
        );
      });

      if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
        stopOnlineTimer();
      }

      // キャンセル不可かつ未選択の場合、有効カードから補完
      const effectiveCard =
        !canCancel && !card && validCards.length > 0 ? validCards[0] : card;

      if (checkIsOnlineMode(GameState.gameMode)) {
        const choiceStr = effectiveCard
          ? effectiveCard.uid || effectiveCard.id
          : null;
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: choiceStr,
        });
      }
      return effectiveCard;
    }
  } else {
    return maxChoices > 1 ? [] : validCards[0];
  }
}

/**
 * 複数タブ（自分/相手の墓地）の選択を待機する
 */
export async function waitPlayerDualDiscardSelection(
  blueCards,
  redCards,
  maxChoices,
  owner,
  title,
  desc,
  canCancel = true
) {
  // 両方の墓地が空の場合は選択処理自体を即時スキップして解決
  const totalCardsCount = (blueCards?.length || 0) + (redCards?.length || 0);
  if (totalCardsCount === 0) {
    return [];
  }

  // Check for Remote Choice Wait
  if (checkIsOnlineMode(GameState.gameMode) && owner === 'red') {
    startOnlineTimer({
      type: 'choice',
      owner: 'red',
      onFailsafeTimeout: () => {
        if (pendingChoiceResolver) {
          const resolver = pendingChoiceResolver;
          setPendingChoiceResolver(null);
          const allCards = [...blueCards, ...redCards];
          resolver(
            !canCancel && allCards.length > 0
              ? allCards.slice(0, maxChoices).map((c) => c.uid || c.id)
              : []
          );
        }
      },
    });

    const choiceStr = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });

    stopOnlineTimer();

    if (!choiceStr || choiceStr === -1) {
      if (!canCancel) {
        const allCards = [...blueCards, ...redCards];
        return allCards.slice(0, maxChoices);
      }
      return [];
    }

    const allCards = [...blueCards, ...redCards];
    let selected = [];

    if (Array.isArray(choiceStr)) {
      selected = allCards.filter(
        (c) =>
          choiceStr.includes(c.uid) ||
          choiceStr.includes(c.id) ||
          choiceStr.some(
            (item) => item && (item.uid === c.uid || item.id === c.id)
          )
      );
    } else if (choiceStr && typeof choiceStr === 'object') {
      const targetId = choiceStr.uid || choiceStr.id;
      selected = allCards.filter(
        (c) => c.uid === targetId || c.id === targetId
      );
    } else if (typeof choiceStr === 'string' && choiceStr) {
      const uids = choiceStr.split(',');
      selected = allCards.filter(
        (c) => uids.includes(c.uid) || uids.includes(c.id)
      );
    }

    // 重複除去
    const uniqueSelected = [];
    const seenUids = new Set();
    selected.forEach((c) => {
      if (!seenUids.has(c.uid)) {
        seenUids.add(c.uid);
        uniqueSelected.push(c);
      }
    });

    // 補正は送信側で確定済み。受信側で独自補正すると盤面が分岐するため行わない
    if (uniqueSelected.length === 0 && !canCancel && allCards.length > 0) {
      console.warn(
        '[online] 空のデュアル選択を受信しました。送信側の確定値をそのまま適用します。'
      );
    }

    return uniqueSelected.slice(0, maxChoices);
  }

  // AIの場合
  if (
    owner === 'red' &&
    GameState.gameMode !== 'online' &&
    GameState.gameMode !== 'pvp'
  ) {
    // 回帰など: デッキ切れを防ぐため、相手の墓地からは選ばず自分の墓地（redCards）からのみランダムに選ぶ
    // 【重要】シード付き乱数を使い、同一シードでの再現性を保証する
    const ownCards = shuffleArray([...redCards]);
    return ownCards.slice(0, maxChoices);
  }

  // プレイヤーの場合
  if (window.showDiscardSelectionModalReact) {
    let isDone = false;
    let modalResolve = null;

    if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
      startOnlineTimer({
        type: 'choice',
        owner: 'blue',
        onTimeout: () => {
          if (isDone) return;
          isDone = true;
          if (window.closeDiscardSelectionModalReact) {
            window.closeDiscardSelectionModalReact();
          }
          const allCards = [...blueCards, ...redCards];
          const fallback = canCancel ? [] : allCards.slice(0, maxChoices);
          if (modalResolve) modalResolve(fallback);
        },
      });
    }

    const selectedCards = await new Promise((resolve) => {
      modalResolve = resolve;
      window.showDiscardSelectionModalReact(
        blueCards,
        Infinity,
        (cards) => {
          if (isDone) return;
          isDone = true;
          resolve(cards);
        },
        {
          title,
          desc,
          canCancel,
          isDual: true,
          redCards,
          maxChoices,
        }
      );
    });

    if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
      stopOnlineTimer();
    }

    // キャンセル不可かつ未選択の場合、全対象カードから補完
    const allCards = [...blueCards, ...redCards];
    const effectiveCards =
      !canCancel &&
      (!selectedCards || selectedCards.length === 0) &&
      allCards.length > 0
        ? allCards.slice(0, maxChoices)
        : selectedCards;

    if (checkIsOnlineMode(GameState.gameMode)) {
      const choiceStr =
        effectiveCards && effectiveCards.length > 0
          ? effectiveCards.map((c) => c.uid || c.id).join(',')
          : null;
      await sendOnlineAction({
        type: 'submitChoice',
        owner: 'blue',
        choiceData: choiceStr,
      });
    }
    return effectiveCards || [];
  } else {
    return [];
  }
}

/**
 * 召喚時スキル「選択」の選択を待機する
 * @param {Array<object>} choices - 選択可能なスキル定義配列
 * @param {'blue' | 'red'} owner - 選択を行う側のプレイヤー
 * @param {object} card - 発動元カードオブジェクト
 * @param {number} [maxChoices=1] - 選択可能な最大数
 * @param {boolean} [isForce=false] - 「命令 (force)」スキルによる強制選択か否か
 * @param {number} [sourceLane=-1] - 発動元カードが召喚された元のレーン番号（破壊後の参照用）
 * @returns {Promise<Array<object> | object | null>} 選択されたスキルまたはスキル配列
 */
export async function waitSkillChoice(
  choices,
  owner,
  card,
  maxChoices = 1,
  isForce = false,
  sourceLane = -1
) {
  if (!choices || choices.length === 0) return null;

  // Check for Remote Choice Wait
  if (checkIsOnlineMode(GameState.gameMode) && owner === 'red') {
    startOnlineTimer({
      type: 'choice',
      owner: 'red',
      onFailsafeTimeout: () => {
        if (pendingChoiceResolver) {
          const resolver = pendingChoiceResolver;
          setPendingChoiceResolver(null);
          resolver(choices.slice(0, Math.min(maxChoices, choices.length)));
        }
      },
    });

    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });

    stopOnlineTimer();
    if (
      rawVal === null ||
      rawVal === undefined ||
      rawVal === '' ||
      rawVal === -1
    ) {
      if (isForce) {
        throw new Error(
          'Invalid online action: Forced skill choice cannot be cancelled.'
        );
      }
      return [];
    }

    const choiceKey = (choice) =>
      [
        choice?.id ?? '',
        choice?.value ?? '',
        choice?.choiceGroup ?? '',
        choice?.summonId ?? '',
        choice?.targetId ?? '',
      ].join('|');

    let results = [];
    const parseItem = (item) => {
      if (item === null || item === undefined) return;
      if (typeof item === 'object') {
        const key = choiceKey(item);
        const match = choices.find((c) => choiceKey(c) === key);
        if (match) results.push(match);
      } else if (typeof item === 'number') {
        if (choices[item]) results.push(choices[item]);
      } else if (typeof item === 'string') {
        const idx = parseInt(item, 10);
        if (!isNaN(idx) && choices[idx]) {
          results.push(choices[idx]);
        } else {
          const match = choices.find((c) => c && c.id === item);
          if (match) results.push(match);
        }
      }
    };

    let itemsToProcess = [];
    if (Array.isArray(rawVal)) {
      itemsToProcess = rawVal;
    } else if (rawVal && typeof rawVal === 'object') {
      const keys = Object.keys(rawVal);
      if (keys.length > 0 && keys.every((k) => !isNaN(Number(k)))) {
        itemsToProcess = keys
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => rawVal[k]);
      } else {
        itemsToProcess = [rawVal];
      }
    } else {
      itemsToProcess = [rawVal];
    }
    itemsToProcess.forEach(parseItem);

    // 意図的な重複選択（拡散と拡散など）を許容するため、SeenKeyによる一律の重複除去を廃止
    const validResults = results.filter(Boolean);

    if (validResults.length === 0 && choices.length > 0) {
      if (isForce) {
        throw new Error(
          'Invalid online action: Forced skill choice result cannot be empty.'
        );
      }
      return [choices[0]];
    }
    return validResults.slice(0, maxChoices);
  }

  // AIの場合
  if (owner === 'red') {
    // 【命令スキル】AIが相手のスキル選択肢から選ぶ
    // カードオーナー（プレイヤー）がforceカードを出し、AIがどのスキルを発動させるか決定する
    if (isForce) {
      await sleep(AI_THINKING_DURATION);

      // Easy AI: ランダム選択
      if (checkIsEasyAI()) {
        const shuffled = shuffleArray([...choices]);
        return shuffled.slice(0, Math.min(maxChoices, choices.length));
      }

      // Normal/Hard AI: シミュレーションで最もAIに有利な選択肢を選ぶ
      // 命令スキルでは「相手が選ぶ」ため、AIは自分に有利な結果を選ぶ
      const cardOwner = 'blue'; // forceの場合、AIが選択者＝カードオーナーはプレイヤー
      const lane =
        sourceLane >= 0 && sourceLane <= 2
          ? sourceLane
          : GameState.playerBoard.indexOf(card);

      if (lane === -1) {
        // レーンが見つからない場合はランダムフォールバック
        const shuffled = shuffleArray([...choices]);
        return shuffled.slice(0, Math.min(maxChoices, choices.length));
      }

      // リソース変動ペナルティ係数（デッキ/手札の増減を微小に評価）
      const RESOURCE_PENALTY = 0.1;
      const scoredChoices = [];

      // 現在のリソース数を記録
      const baseAiHand = GameState.enemyHand.length;
      const baseAiDeck = GameState.enemyDeck.length;
      const basePlHand = GameState.playerHand.length;
      const basePlDeck = GameState.playerDeck.length;

      for (let i = 0; i < choices.length; i++) {
        const cloneCard = (c) => (c ? JSON.parse(JSON.stringify(c)) : null);
        const simState = {
          playerBoard: GameState.playerBoard.map(cloneCard),
          enemyBoard: GameState.enemyBoard.map(cloneCard),
          playerHand: GameState.playerHand.map(cloneCard),
          enemyHand: GameState.enemyHand.map(cloneCard),
          playerDeck: GameState.playerDeck.map(cloneCard),
          enemyDeck: GameState.enemyDeck.map(cloneCard),
          playerDiscard: GameState.playerDiscard.map(cloneCard),
          enemyDiscard: GameState.enemyDiscard.map(cloneCard),
          playerHP: GameState.playerHP,
          enemyHP: GameState.enemyHP,
          playerSP: GameState.playerSP,
          enemySP: GameState.enemySP,
          playerMaxHP: GameState.playerMaxHP,
          enemyMaxHP: GameState.enemyMaxHP,
          extraTurnCount: GameState.extraTurnCount,
          attackSkipCount: GameState.attackSkipCount,
          valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
          valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
        };

        // 1. スキル効果を適用（カードオーナー=blue側で発動）
        applyActiveSkillLogic(
          simState,
          cardOwner,
          lane,
          choices[i].id,
          choices[i].value
        );
        // 2. カードオーナーのターン戦闘フェーズ
        calculateCombatPhase(simState, cardOwner);
        // 3. 次のAIターンの戦闘フェーズ
        calculateCombatPhase(simState, 'red');

        // AIにとっての評価（高いほどAIに有利）
        let score = simState.enemyHP - simState.playerHP;
        for (const b of simState.enemyBoard) if (b) score += b.currentPower;
        for (const b of simState.playerBoard) if (b) score -= b.currentPower;

        // リソース変動ペナルティ: AI側の減少はマイナス、プレイヤー側の減少はプラス
        score += (simState.enemyHand.length - baseAiHand) * RESOURCE_PENALTY;
        score += (simState.enemyDeck.length - baseAiDeck) * RESOURCE_PENALTY;
        score -= (simState.playerHand.length - basePlHand) * RESOURCE_PENALTY;
        score -= (simState.playerDeck.length - basePlDeck) * RESOURCE_PENALTY;

        scoredChoices.push({ choice: choices[i], score });
      }

      scoredChoices.sort((a, b) => b.score - a.score);
      return scoredChoices
        .slice(0, Math.min(maxChoices, choices.length))
        .map((x) => x.choice);
    }

    // 古い事前計画キューが残っていればクリーンアップ（消費・破棄）
    consumeAIAction(['choice', 'force']);
    if (GameState.aiDecision?.choiceIndexQueue) {
      delete GameState.aiDecision.choiceIndexQueue;
    }
    if (GameState.aiDecision?.choiceIndex !== undefined) {
      delete GameState.aiDecision.choiceIndex;
    }

    if (checkIsEasyAI()) {
      // Easy AI: ランダム
      const shuffled = shuffleArray([...choices]);
      return shuffled.slice(0, Math.min(maxChoices, choices.length));
    } else {
      // Normal以上: 常に最新盤面に基づいた直前全通りシミュレーションで最善の選択肢を決定
      if (GameState.gameMode !== 'online') await sleep(AI_THINKING_DURATION);
      return evaluateAdhocSkillChoice(
        card,
        choices,
        maxChoices,
        'red',
        sourceLane
      );
    }
  }

  // プレイヤーの場合
  return new Promise((resolve) => {
    let isDone = false;

    const handleSelect = async (selectedSkill) => {
      if (isDone) return;
      isDone = true;
      if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
        stopOnlineTimer();
      }
      if (checkIsOnlineMode(GameState.gameMode)) {
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: selectedSkill,
        });
      }
      resolve(selectedSkill); // App returns Array here automatically handled in UI
    };

    if (checkIsOnlineTimerEnabled(GameState.gameMode)) {
      startOnlineTimer({
        type: 'choice',
        owner: 'blue',
        onTimeout: () => {
          if (isDone) return;
          if (window.closeSkillChoiceModalReact) {
            window.closeSkillChoiceModalReact();
          }
          const defaultSkill = choices.slice(
            0,
            Math.min(maxChoices, choices.length)
          );
          handleSelect(defaultSkill);
        },
      });
    }

    if (window.showSkillChoiceModalReact) {
      window.showSkillChoiceModalReact(
        choices,
        handleSelect,
        maxChoices,
        isForce
      );
    } else {
      // フォールバック（通常は発生しない）
      const shuffled = shuffleArray([...choices]);
      handleSelect(shuffled.slice(0, Math.min(maxChoices, choices.length)));
    }
  });
}

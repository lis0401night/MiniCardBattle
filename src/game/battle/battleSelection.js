/**
 * ===========================================
 * battleSelection.js
 *
 * バトル中のプレイヤー入力を待機する処理群を提供します。
 * 配置先の選択、カードの選択、スキルの選択など、主にユーザーからの
 * 選択完了を非同期で待機し、結果を返す関数の集まりです。
 * ===========================================
 */
import { evaluateBestLanesForToken } from '../ai.js';
import { getAIDiscardIndices } from '../../utils/aiDiscardLogic.js';
import { applyActiveSkillLogic, calculateCombatPhase } from '../engine.js';
import { isTutorialMode, filterPlacementLaneClick } from '../tutorialEngine.js';
import { GameState } from '../../state/gameState.js';
import {
  hasSkill,
  getCurrentRNG,
  setCurrentRNG,
  getSeededRandom,
  shuffleArray,
  sleep,
  playSound,
} from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import {
  updateBattleUIHook,
  renderHand,
  updateCardDetail,
} from '../../services/uiBattle.js';
import { sendOnlineAction } from '../../services/multiplayer.js';
import { AI_THINKING_DURATION } from '../../utils/constants/config.js';
import { showAlertModal, showConfirmModal } from '../../services/uiModals.js';
import { consumeAIAction } from './battleCombat.js';
import { setPendingChoiceResolver } from './battleQueue.js';
import { battleEvents } from './events/battleEventEmitter.js';

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
  buttonText = '配置終了',
  _skipImmediateDiscard = false // 【追加】後続の playCard 等で破棄を行う場合、この関数内での即時破棄をスキップするフラグ
) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const sealedLanes =
    owner === 'blue'
      ? GameState.playerSealedLanes || [0, 0, 0]
      : GameState.enemySealedLanes || [0, 0, 0];
  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });
    // number[] に正規化
    let parsedLanes = [];
    if (
      rawVal !== null &&
      rawVal !== undefined &&
      rawVal !== '' &&
      rawVal !== -1
    ) {
      if (Array.isArray(rawVal)) {
        parsedLanes = rawVal
          .map((x) => (typeof x === 'string' ? parseInt(x, 10) : x))
          .filter((x) => !isNaN(x));
      } else if (typeof rawVal === 'number') {
        parsedLanes = [rawVal];
      } else if (typeof rawVal === 'string') {
        const parsed = parseInt(rawVal, 10);
        if (!isNaN(parsed)) parsedLanes = [parsed];
      }
    }

    // 重複の除去
    parsedLanes = Array.from(new Set(parsedLanes));

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
    const resultLanes = parsedLanes.filter((i) => validLanes.includes(i));

    if (resultLanes.length === 0 && !canCancel) {
      throw new Error(
        'Invalid online action: Empty lane selection not allowed when cancel is disabled.'
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
    } else if (
      tokenLanes !== null &&
      Array.isArray(tokenLanes) &&
      tokenLanes.length === 0
    ) {
      // AIが意図的に空配列を渡した場合（例: summonのキャンセル、holy_marchの0体バフのみ）、配置なしとして返す
      selectedLanes = [];
      intentionalEmpty = true;
    } else {
      // まず現在のアクション自体に紐づく指示があるか確認
      // 【重要】deleteではなくspliceで消費する。summonスキルを複数持つカード（例：慈悲なき提督）では
      // waitPlayerLaneSelectionが複数回呼ばれるため、全部消してしまうと2回目以降がランダムになる。
      if (
        typeof GameState.aiDecision !== 'undefined' &&
        GameState.aiDecision &&
        GameState.aiDecision.cardTokenLanes &&
        GameState.aiDecision.cardTokenLanes.length > 0
      ) {
        selectedLanes = GameState.aiDecision.cardTokenLanes.splice(0, count);
        if (GameState.aiDecision.cardTokenLanes.length === 0) {
          delete GameState.aiDecision.cardTokenLanes;
        }
      } else {
        // なければ後続のアクションキューから取得
        const aiAction = consumeAIAction([
          'devilhunter_resurrect',
          'summon',
          'call',
          'leader_skill',
          'clone',
          'move',
          'elf_polarbear_combo',
          'token_placement',
          'puppet',
        ]);
        if (aiAction) {
          if (Array.isArray(aiAction.lanes)) {
            selectedLanes = [...aiAction.lanes];
          } else if (
            aiAction.laneIdx !== undefined ||
            aiAction.myLane !== undefined ||
            aiAction.targetLane !== undefined
          ) {
            const lane =
              aiAction.laneIdx !== undefined
                ? aiAction.laneIdx
                : aiAction.myLane !== undefined
                  ? aiAction.myLane
                  : aiAction.targetLane;
            if (lane !== undefined && lane !== -1) {
              selectedLanes = [lane];
            }
          }
          // actionQueueからアクションを取得できたがレーン情報がない場合 → 空として扱う（フォールバック防止）
          if (!selectedLanes) selectedLanes = [];
        }
      }
      if (!selectedLanes) {
        // 【号令(call)専用フォールバック】
        // 号令はデッキトップのカードが実行時に判明するため、事前にレーンを決定できない。
        // そのため唯一 evaluateBestLanesForToken によるリアルタイム評価を許可する。
        selectedLanes = evaluateBestLanesForToken(
          availableAI,
          owner,
          tokenCard,
          count,
          canCancel,
          checkConstraints
        );
      }
    }

    // カード制約の適用 (ランダムフォールバック発生時に備えて安全弁として適用)
    if (checkConstraints && tokenCard) {
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

    // 最終的に十分なレーンが確保できず、キャンセル可能なら中止する
    if (selectedLanes.length < count && canCancel) {
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

    const cleanUp = async () => {
      GameState.isPlacementMode = false;
      GameState.placementCount = 0;
      GameState.placementToken = null;
      GameState.placementCheckConstraints = true;
      GameState.placementButtonText = '配置終了';
      GameState.placementRestrictLanes = null;
      const result = [...GameState.placementSelectedLanes];
      GameState.placementSelectedLanes = [];
      window.handlePlacementLaneClick = null;
      window.finishPlacement = null;
      battleEvents.off('PLACEMENT_FINISH', onFinishPlacement);
      battleEvents.off('PLACEMENT_LANE_CLICK', onPlacementLaneClick);
      updateCardDetail(null);

      if (GameState.gameMode === 'online') {
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
        setTimeout(() => {
          resolve(cleanUp());
        }, 300);
      }
    };

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
 * @param {string} owner - 'blue' | 'red'
 * @param {object} tokenCard - 配置しようとしているカード
 * @param {number} laneIndex - 配置先レーン
 * @param {boolean} checkConstraints - 制約チェックを行うかどうか（号令や招来などの召喚時はtrue、復活や分身などはfalse）
 * @returns {Promise<boolean>} 配置を続行してよいならtrue、キャンセルされたならfalse
 */
export async function confirmOverwrittenLane(
  owner,
  tokenCard,
  laneIndex,
  _checkConstraints = true
) {
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
    if (
      unionSkill &&
      (existingCard.baseId === unionSkill.targetId ||
        existingCard.id === unionSkill.targetId)
    ) {
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
  if (GameState.gameMode === 'online' && owner === 'red') {
    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });
    // number[] に正規化
    let parsedLanes = [];
    if (
      rawVal !== null &&
      rawVal !== undefined &&
      rawVal !== '' &&
      rawVal !== -1
    ) {
      if (Array.isArray(rawVal)) {
        parsedLanes = rawVal
          .map((x) => (typeof x === 'string' ? parseInt(x, 10) : x))
          .filter((x) => !isNaN(x));
      } else if (typeof rawVal === 'number') {
        parsedLanes = [rawVal];
      } else if (typeof rawVal === 'string') {
        const parsed = parseInt(rawVal, 10);
        if (!isNaN(parsed)) parsedLanes = [parsed];
      }
    }

    parsedLanes = Array.from(new Set(parsedLanes));
    const resultLanes = parsedLanes.filter((i) => validLanes.includes(i));

    if (resultLanes.length === 0 && !canCancel) {
      throw new Error(
        'Invalid online action: Empty enemy lane selection not allowed when cancel is disabled.'
      );
    }

    return resultLanes.slice(0, count);
  }

  // AIの場合：判定済みのシミュレーション結果があれば優先
  if (owner === 'red' || owner === 'blue') {
    if (
      owner === 'red' &&
      typeof GameState.aiDecision !== 'undefined' &&
      GameState.aiDecision
    ) {
      if (
        GameState.aiDecision.cardTokenLanes &&
        GameState.aiDecision.cardTokenLanes.length > 0
      ) {
        const decidedLanes = GameState.aiDecision.cardTokenLanes.splice(
          0,
          count
        );
        if (GameState.aiDecision.cardTokenLanes.length === 0) {
          delete GameState.aiDecision.cardTokenLanes;
        }
        return decidedLanes;
      }
    }

    const sortedLanes = [...validLanes].sort((a, b) => {
      const pA = targetBoard[a] ? targetBoard[a].currentPower : -1;
      const pB = targetBoard[b] ? targetBoard[b].currentPower : -1;
      const diff = pB - pA;
      if (diff !== 0) return diff;
      return a - b; // インデックスが小さい方（左）を優先
    });
    if (owner === 'red') return sortedLanes.slice(0, count);
    // プレイヤー側で自動選択が必要な場合（現状は手動だが、一貫性のため）
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

    window.handleEnemyLaneClick = (laneIndex) => {
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
            if (window.finishEnemyTargetSelection)
              window.finishEnemyTargetSelection();
          }, 300);
        }
      }
    };

    window.finishEnemyTargetSelection = async () => {
      playSound(SOUNDS.seClick);
      GameState.isEnemyTargetMode = false;
      const result = [...GameState.targetSelectedLanes];
      GameState.targetSelectedLanes = [];
      GameState.targetMaxCount = 0;
      GameState.isEnemyTargetAllowEmpty = false;
      window.handleEnemyLaneClick = null;
      window.finishEnemyTargetSelection = null;
      updateCardDetail(null);

      if (GameState.gameMode === 'online') {
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: result,
        });
      }

      if (updateBattleUIHook) updateBattleUIHook();
      resolve(result);
    };

    if (updateBattleUIHook) updateBattleUIHook();
  });
}

/**
 * 自分のボード上のカードやレーンを選択させる処理（非同期ユーティリティ）
 * 主に「分身」「転向」「鍛造」「跳躍」などの、自分のカードまたはレーンを選択して発動するアクティブスキルの解決時に呼び出される。
 *
 * @param {number} count - 選択させるカードやレーンの目標数
 * @param {string} owner - 誰が選択を行うか ('blue': プレイヤー, 'red': 敵/AI)
 * @param {boolean} [canCancel=false] - 選択キャンセルが許容されるか
 * @returns {Promise<number[]>} 選択された自陣のレーンインデックス（0〜2）の配列を返す Promise
 */
export async function waitPlayerAlliedLaneSelection(
  count,
  owner,
  canCancel = false
) {
  const isBlue = owner === 'blue';
  // 選択を行う側の盤面（自陣ボード）を取得する
  const targetBoard = isBlue ? GameState.playerBoard : GameState.enemyBoard;

  // すでにカードが配置されているレーン（ターゲット候補となるインデックス）を取得
  const occupiedLanes = targetBoard
    .map((c, i) => (c !== null ? i : -1))
    .filter((i) => i !== -1);

  // 味方の盤面に1枚もカードがなければ、選択の余地がないため即座に空配列を返す
  if (occupiedLanes.length === 0) return [];

  // 【フェーズ 1】オンライン対戦かつ相手プレイヤーの選択待ちの場合
  if (GameState.gameMode === 'online' && owner === 'red') {
    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });
    // 受信データを数値配列 [laneIndex] に正規化する
    let parsedLanes = [];
    if (
      rawVal !== null &&
      rawVal !== undefined &&
      rawVal !== '' &&
      rawVal !== -1
    ) {
      if (Array.isArray(rawVal)) {
        parsedLanes = rawVal
          .map((x) => (typeof x === 'string' ? parseInt(x, 10) : x))
          .filter((x) => !isNaN(x) && x >= 0 && x < 3);
      } else if (typeof rawVal === 'number') {
        if (rawVal >= 0 && rawVal < 3) parsedLanes = [rawVal];
      } else if (typeof rawVal === 'string') {
        const parsed = parseInt(rawVal, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed < 3) parsedLanes = [parsed];
      }
    }

    parsedLanes = Array.from(new Set(parsedLanes));
    // 実際にカードが存在するレーンのみを抽出
    const resultLanes = parsedLanes.filter((i) => occupiedLanes.includes(i));

    // キャンセル不可の設定なのにデータが空だった場合はエラーとする
    if (resultLanes.length === 0 && !canCancel) {
      throw new Error(
        'Invalid online action: Empty allied lane selection not allowed when cancel is disabled.'
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
    window.handleAlliedLaneClick = (laneIndex) => {
      // 対象レーンにカードがない場合は処理をスキップ
      if (targetBoard[laneIndex] === null) return;
      playSound(SOUNDS.seClick);

      // まだ選択されていないレーンであれば選択リストに追加する
      if (!GameState.targetSelectedLanes.includes(laneIndex)) {
        GameState.targetSelectedLanes.push(laneIndex);
        if (updateBattleUIHook) updateBattleUIHook(); // 選択ハイライトのUI表示を更新

        // 規定枚数（目標数）の選択が完了した場合
        if (GameState.targetSelectedLanes.length >= count) {
          // タップ決定演出のために300ms待ってから、非同期で決定処理（finishAlliedSelection）を呼び出す
          // ※【多重タップ防止】
          // 300msの待機中にプレイヤーが連打（ダブルクリック等）した場合、タイマーが重複して走り、
          // 1回目のタイマーで null クリアされた window.finishAlliedSelection が2回目で呼び出され、
          // TypeError クラッシュを引き起こすため、必ず存在判定のif文ガードを挟む。
          setTimeout(() => {
            if (window.finishAlliedSelection) window.finishAlliedSelection();
          }, 300);
        }
      }
    };

    /**
     * 選択処理を確定させ、画面上の選択モードを解除するクリーンアップ兼決定関数
     */
    window.finishAlliedSelection = async () => {
      playSound(SOUNDS.seClick);
      GameState.isAlliedTargetMode = false;
      const result = [...GameState.targetSelectedLanes];

      // 選択状態のクリーンアップ
      GameState.targetSelectedLanes = [];
      GameState.targetMaxCount = 0;
      window.handleAlliedLaneClick = null;
      window.finishAlliedSelection = null; // 多重実行を避けるため自身を即座に破棄する
      updateCardDetail(null);

      // オンライン対戦の場合は、選択決定データを同期送信する
      if (GameState.gameMode === 'online') {
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: result,
        });
      }

      if (updateBattleUIHook) updateBattleUIHook(); // UIハイライト等の状態更新をトリガー
      resolve(result); // 非同期の呼び出し元へ選択結果配列を返却する
    };

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
  if (hand.length === 0) return [];

  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });
    // number[] に正規化
    let parsedIndices = [];
    if (
      rawVal !== null &&
      rawVal !== undefined &&
      rawVal !== '' &&
      rawVal !== -1
    ) {
      if (Array.isArray(rawVal)) {
        parsedIndices = rawVal
          .map((x) => (typeof x === 'string' ? parseInt(x, 10) : x))
          .filter((x) => !isNaN(x));
      } else if (typeof rawVal === 'number') {
        parsedIndices = [rawVal];
      } else if (typeof rawVal === 'string') {
        const parsed = parseInt(rawVal, 10);
        if (!isNaN(parsed)) parsedIndices = [parsed];
      }
    }

    parsedIndices = Array.from(new Set(parsedIndices));
    const resultIndices = parsedIndices.filter(
      (i) => i >= 0 && i < hand.length
    );

    if (forceExact && resultIndices.length < count) {
      throw new Error(
        `Invalid online action: Hand selection requires exact count of ${count}, but got ${resultIndices.length}.`
      );
    }

    return resultIndices.slice(0, count);
  }

  // AIの場合：判定済みのシミュレーション結果があれば優先
  if (owner === 'red') {
    const results = [];
    for (let i = 0; i < count; i++) {
      const aiAction = consumeAIAction('discard');
      if (aiAction && aiAction.targetIdx !== undefined) {
        results.push(aiAction.targetIdx);
      } else {
        break;
      }
    }
    if (results.length > 0) return results;

    // フォールバック: 共通のAI破棄選択ロジックを利用する
    return getAIDiscardIndices(hand, count);
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
      const result = [...GameState.discardSelectedIndices];
      GameState.discardSelectedIndices = [];
      GameState.discardMaxCount = 0;
      window.finishHandSelection = null;
      updateCardDetail(null);
      renderHand(); // 通常の状態に戻す
      if (updateBattleUIHook) updateBattleUIHook();
      return result;
    };

    window.finishHandSelection = async () => {
      // チュートリアル中: カードを選ばずに終了することをブロック
      if (isTutorialMode() && GameState.discardSelectedIndices.length === 0) {
        playSound(SOUNDS.seDamage);
        return;
      }
      playSound(SOUNDS.seClick);
      const indices = cleanUp();

      if (GameState.gameMode === 'online') {
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
 */
export async function waitPlayerDiscardSelection(
  validCards,
  maxPow,
  owner,
  title,
  desc,
  canCancel = true,
  maxChoices = 1
) {
  if (!validCards || validCards.length === 0) return maxChoices > 1 ? [] : null;

  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    const choiceStr = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });
    if (!choiceStr || choiceStr === -1) {
      if (!canCancel) {
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
      if (selected.length === 0 && !canCancel) {
        throw new Error(
          'Invalid online action: Discard selection cannot be empty and cancel is disabled.'
        );
      }
      return selected.slice(0, maxChoices);
    } else {
      const matchingCard = selected[0] || null;
      if (!matchingCard && !canCancel) {
        throw new Error(
          'Invalid online action: Discard selection card not found and cancel is disabled.'
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
      const shuffled = [...validCards];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(getSeededRandom() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, maxChoices);
    } else {
      // 探索（explore）の場合は、選べる中で最大パワーのカードからランダムに選ぶ
      if (title && title.includes('探索')) {
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
      const selectedCards = await new Promise((resolve) => {
        window.showDiscardSelectionModalReact(
          validCards,
          maxPow,
          (cards) => resolve(cards),
          { title, desc, canCancel, maxChoices }
        );
      });

      if (GameState.gameMode === 'online') {
        const choiceStr =
          selectedCards && selectedCards.length > 0
            ? selectedCards.map((c) => c.uid || c.id).join(',')
            : null;
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: choiceStr,
        });
      }
      return selectedCards || [];
    } else {
      const card = await new Promise((resolve) => {
        window.showDiscardSelectionModalReact(
          validCards,
          maxPow,
          (c) => resolve(c),
          { title, desc, canCancel }
        );
      });

      if (GameState.gameMode === 'online') {
        const choiceStr = card ? card.uid || card.id : null;
        await sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: choiceStr,
        });
      }
      return card;
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
  if (GameState.gameMode === 'online' && owner === 'red') {
    const choiceStr = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });
    if (!choiceStr || choiceStr === -1) {
      if (!canCancel) {
        throw new Error(
          'Invalid online action: Dual discard selection cannot be cancelled.'
        );
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

    if (uniqueSelected.length === 0 && !canCancel) {
      throw new Error(
        'Invalid online action: Dual discard selection cannot be empty and cancel is disabled.'
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
    const ownCards = [...redCards].sort(() => Math.random() - 0.5);
    return ownCards.slice(0, maxChoices);
  }

  // プレイヤーの場合
  if (window.showDiscardSelectionModalReact) {
    const selectedCards = await new Promise((resolve) => {
      window.showDiscardSelectionModalReact(
        blueCards,
        Infinity,
        (cards) => resolve(cards),
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

    if (GameState.gameMode === 'online') {
      const choiceStr =
        selectedCards && selectedCards.length > 0
          ? selectedCards.map((c) => c.uid || c.id).join(',')
          : null;
      await sendOnlineAction({
        type: 'submitChoice',
        owner: 'blue',
        choiceData: choiceStr,
      });
    }
    return selectedCards || [];
  } else {
    return [];
  }
}

/**
 * 召喚時スキル「選択」の選択を待機する
 */
export async function waitSkillChoice(
  choices,
  owner,
  card,
  maxChoices = 1,
  isForce = false
) {
  if (!choices || choices.length === 0) return null;

  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    const rawVal = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else setPendingChoiceResolver(resolve);
    });
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

    if (Array.isArray(rawVal)) {
      rawVal.forEach(parseItem);
    } else {
      parseItem(rawVal);
    }

    // 意図的な重複選択（拡散と拡散など）を許容するため、SeenKeyによる一律の重複除去を廃止
    const uniqueResults = results.filter(Boolean);

    if (uniqueResults.length === 0 && choices.length > 0) {
      if (isForce) {
        throw new Error(
          'Invalid online action: Forced skill choice result cannot be empty.'
        );
      }
      return [choices[0]];
    }
    return uniqueResults.slice(0, maxChoices);
  }

  // AIの場合
  if (owner === 'red') {
    // 【命令スキル】AIが相手のスキル選択肢から選ぶ
    // カードオーナー（プレイヤー）がforceカードを出し、AIがどのスキルを発動させるか決定する
    if (isForce) {
      await sleep(AI_THINKING_DURATION);

      // Easy AI: ランダム選択
      if (GameState.aiLevel <= 1) {
        const shuffled = shuffleArray([...choices]);
        return shuffled.slice(0, Math.min(maxChoices, choices.length));
      }

      // Normal/Hard AI: シミュレーションで最もAIに有利な選択肢を選ぶ
      // 命令スキルでは「相手が選ぶ」ため、AIは自分に有利な結果を選ぶ
      const cardOwner = 'blue'; // forceの場合、AIが選択者＝カードオーナーはプレイヤー
      const lane = GameState.playerBoard.indexOf(card);

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

    // 先にアクションキューの指示があるか確認（連鎖スキルの途中にあるchoice/forceノード）
    const aiAction = consumeAIAction(['choice', 'force']);
    if (aiAction && aiAction.choices !== undefined) {
      if (GameState.gameMode !== 'online') await sleep(AI_THINKING_DURATION); // AIの思考時間を演出
      return aiAction.choices.map((i) => choices[i]);
    }

    // 1. すでに意思決定時に選択が決定している場合（Normal/Hardのシミュレーション後 - 親ノード側）
    if (
      typeof GameState.aiDecision !== 'undefined' &&
      GameState.aiDecision &&
      GameState.aiDecision.choiceIndexQueue !== undefined
    ) {
      const idx = GameState.aiDecision.choiceIndexQueue.shift();
      if (idx !== undefined) {
        const indices = Array.isArray(idx) ? idx : [idx];
        return indices.map((i) => choices[i]);
      }
    } else if (
      typeof GameState.aiDecision !== 'undefined' &&
      GameState.aiDecision &&
      GameState.aiDecision.choiceIndex !== undefined
    ) {
      // 互換性フェーズ
      const idx = GameState.aiDecision.choiceIndex;
      delete GameState.aiDecision.choiceIndex; // 使い終わったら消去
      const indices = Array.isArray(idx) ? idx : [idx];
      return indices.map((i) => choices[i]);
    }

    // 2. 意思決定時に決定していない場合（Easy or フォールバック）
    if (GameState.aiLevel <= 1) {
      // Easy: ランダム
      const shuffled = shuffleArray([...choices]);
      return shuffled.slice(0, Math.min(maxChoices, choices.length));
    } else {
      // Normal/Hard: ここで簡易的にシミュレーション
      // 本来は意思決定時に行われるべきだが、フォールバックとして実装
      console.log('AI performing on-the-fly skill choice simulation');
      const savedRNG = getCurrentRNG();
      try {
        const scoredChoices = [];
        const originalBoard = GameState.enemyBoard.map((c) =>
          c ? JSON.parse(JSON.stringify(c)) : null
        );
        const originalPlayerBoard = GameState.playerBoard.map((c) =>
          c ? JSON.parse(JSON.stringify(c)) : null
        );

        for (let i = 0; i < choices.length; i++) {
          setCurrentRNG(savedRNG);
          const cloneCard = (c) => (c ? JSON.parse(JSON.stringify(c)) : null);
          const simState = {
            playerBoard: originalPlayerBoard.map(cloneCard),
            enemyBoard: originalBoard.map(cloneCard),
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
          // 簡易シミュレーション
          const lane = GameState.enemyBoard.indexOf(card);
          let score = -Infinity;
          if (lane !== -1) {
            applyActiveSkillLogic(
              simState,
              'red',
              lane,
              choices[i].id,
              choices[i].value
            );
            calculateCombatPhase(simState, 'blue');
            // スコア計算
            score = simState.enemyHP - simState.playerHP;
            for (let b of simState.enemyBoard) if (b) score += b.currentPower;
          }
          scoredChoices.push({ choice: choices[i], score });
        }
        scoredChoices.sort((a, b) => b.score - a.score);
        return scoredChoices
          .slice(0, Math.min(maxChoices, choices.length))
          .map((x) => x.choice);
      } finally {
        setCurrentRNG(savedRNG);
      }
    }
  }

  // プレイヤーの場合
  return new Promise((resolve) => {
    if (window.showSkillChoiceModalReact) {
      window.showSkillChoiceModalReact(
        choices,
        async (selectedSkill) => {
          if (GameState.gameMode === 'online') {
            await sendOnlineAction({
              type: 'submitChoice',
              owner: 'blue',
              choiceData: selectedSkill,
            });
          }
          resolve(selectedSkill); // App returns Array here automatically handled in UI
        },
        maxChoices,
        isForce
      );
    } else {
      // フォールバック（通常は発生しない）
      const shuffled = shuffleArray([...choices]);
      resolve(shuffled.slice(0, Math.min(maxChoices, choices.length)));
    }
  });
}

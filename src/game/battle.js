import { getAIDiscardIndices } from '../utils/aiDiscardLogic.js';
import { incrementStat } from '../utils/constants/achievements.js';
import { getDungeonCharacterDialogue } from '../utils/constants/battleDungeonCharacter.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  MAX_HP,
  AI_THINKING_DURATION,
  PLACE_ANIMATION_DURATION,
} from '../utils/constants/config.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { getTournamentPostBattleAnnounce } from '../utils/constants/eventTournamentDialogues.js';
import { ACTIVE_SKILLS } from '../utils/constants/skills.js';
import { STAGES } from '../utils/constants/stages.js';
import { playCardVoice } from '../utils/constants/voices.js';
import {
  STORY_DIALOGUES,
  STORY_NARRATIONS,
  PLAYER_TALKS,
  getFallbackStoryDialogue,
} from '../utils/constants/storyDialogues.js';
import {
  createDamagePopup,
  getCardImgUrl,
  getDialogue,
  getOrCreateUUID,
  getSeededRandom,
  getSkillValue,
  hasSkill,
  mergeCardSkills,
  playSound,
  setRNGSeed,
  shuffleArray,
  sleep,
  stopAllBGM,
  switchScreen,
  triggerGraveKeeperEffect,
} from '../utils/gameUtils.js';
import { AUDIO_INSTANCES, SOUNDS } from '../utils/sounds.js';
import { evaluateBestLanesForToken, executeEnemyAI } from './ai.js';
import { evaluateAIMoves } from './ai_normal.js';
import { generateDeck } from '../services/deck.js';
import {
  applyActiveSkillLogic,
  applySingleCombat,
  calculateCombatPhase,
} from './engine.js';
import { playEvents } from './eventRenderer.js';
import { simulateTournamentRound } from './tournament.js';

import { GameState } from '../state/gameState.js';
import { activateLeaderSkill } from './leaderSkills.js';
import {
  cachedRoomData,
  clearActionQueueAndRegenerateSeed,
  getIsHost,
  listenToRoomActions,
  sendOnlineAction,
  setPlayerReadyOnly,
} from '../services/multiplayer.js';
import {
  resolveActiveSkillEffect,
  triggerStartTurnPassive,
} from './skillLogic.js';
import {
  cleanupTutorial,
  filterPlacementLaneClick,
  handleTutorialEnd,
  isTutorialMode,
  runTutorialFlow,
} from './tutorialEngine.js';
import {
  closeSkillConfirm,
  playSummonAnimation,
  renderBoard,
  renderHand,
  showDeckRefreshEffect,
  showSpeechBubble,
  triggerFinishVisuals,
  updateBattleUIHook,
  updateCardDetail,
  updateCardPowerOnly,
  updateDeckDisplay,
  updateHPBar,
  updateSPOrbs,
} from '../services/uiBattle.js';
import { setupDialogueScreen } from '../services/uiDialogue.js';
import { showDefenseBattleList } from '../services/uiMainCore.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';

export let pendingChoiceResolver = null;

// バトル準備中の二重呼び出し防止フラグ
let isBattleLoading = false;

// ==========================================
// イベント駆動型タスクキューエンジン (State Machine Core)
// ==========================================

export async function dispatchBattleAction(action, isRemote = false) {
  if (GameState.gameMode === 'online' && !isRemote) {
    // ローカルのアクションは直接キューに入れず、Firebaseのルームへ送信
    await sendOnlineAction(action);
    return;
  }

  if (action.type === 'submitChoice') {
    // 自分が送信した選択結果の反響(echo)は完全に無視する（自分のローカルはUIのPromiseで既に勝手に解決されているため）
    if (action.owner === 'blue') return;

    // Firebase仕様で空配列[]が送信されないため、undefinedで来た場合は空配列とみなす
    const choiceData = action.choiceData !== undefined ? action.choiceData : [];

    if (pendingChoiceResolver) {
      pendingChoiceResolver(choiceData);
      pendingChoiceResolver = null;
    } else {
      if (!GameState.pendingChoices) GameState.pendingChoices = [];
      GameState.pendingChoices.push(choiceData);
    }
    return; // Do not process via queue, evaluate synchronously
  }

  if (action.type === 'retire') {
    // チュートリアルモードの場合、待機中の全Promiseを解決してからリタイア処理
    if (GameState.gameMode === 'tutorial') {
      cleanupTutorial();
    }
    if (action.owner === 'blue') {
      GameState.playerConfig.hp = 0;
      GameState.playerHP = 0;
    } else {
      GameState.enemyConfig.hp = 0;
      GameState.enemyHP = 0;
    }
    playSound(SOUNDS.seDamage);
    if (updateBattleUIHook) updateBattleUIHook();
    checkWinCondition();
    return;
  }

  GameState.actionQueue.push(action);
  if (!GameState.isProcessing) {
    await processActionQueue();
  }
}

export async function processActionQueue() {
  if (GameState.isProcessing) return;
  GameState.isProcessing = true;

  while (GameState.actionQueue.length > 0) {
    const action = GameState.actionQueue.shift();

    if (action.type === 'playCard') {
      const played = await playCard(
        action.owner,
        action.handIndex,
        action.lane
      );
      if (played) {
        if (checkWinCondition()) break;
        GameState.selectedCardIndex = null;
        if (window.updateCardDetail) window.updateCardDetail(null);
        await sleep(PLACE_ANIMATION_DURATION);
        await endTurnLogic(action.owner);
      }
      // 【CodeRabbit指摘反映】無効プレイ時（playedがfalse）でも、オンライン対戦での状態ズレを防ぐため、
      // ループ後段の updateBattleUIHook() や syncState 送信をスキップせずに通す
    } else if (action.type === 'endTurn') {
      await endTurnLogic(action.owner);
    } else if (action.type === 'leaderSkill') {
      await activateLeaderSkill(action.owner);
    } else if (action.type === 'enemyTurn') {
      if (GameState.gameMode === 'tutorial') {
        // チュートリアルモード: スクリプト行動を実行
        await sleep(AI_THINKING_DURATION);
        await executeTutorialEnemyTurn();
      } else if (GameState.gameMode !== 'online') {
        await sleep(AI_THINKING_DURATION);
        await executeEnemyAI();
      }
    } else if (action.type === 'syncState') {
      applySyncState(action.state);
    }

    if (updateBattleUIHook) updateBattleUIHook(); // React側に再描画を通知

    // ホスト側：syncState以外のアクション処理が終わるごとに現在の正しいステートを送信する
    if (
      GameState.gameMode === 'online' &&
      getIsHost() &&
      action.type !== 'syncState' &&
      action.type !== 'enemyTurn' &&
      action.type !== 'submitChoice'
    ) {
      sendOnlineAction({ type: 'syncState', state: generateSyncState() });
    }
  }

  GameState.isProcessing = false;
  if (updateBattleUIHook) updateBattleUIHook();
}

function generateSyncState() {
  return {
    playerHP: GameState.playerHP,
    enemyHP: GameState.enemyHP,
    playerSP: GameState.playerSP,
    enemySP: GameState.enemySP,
    playerSealedLanes: JSON.parse(
      JSON.stringify(GameState.playerSealedLanes || [0, 0, 0])
    ),
    enemySealedLanes: JSON.parse(
      JSON.stringify(GameState.enemySealedLanes || [0, 0, 0])
    ),
    extraTurnCount: GameState.extraTurnCount || 0,
    attackSkipCount: GameState.attackSkipCount || 0,
    playerBoard: JSON.parse(JSON.stringify(GameState.playerBoard)),
    enemyBoard: JSON.parse(JSON.stringify(GameState.enemyBoard)),
    playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
    enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
    playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
    enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard)),
    playerDeck: JSON.parse(JSON.stringify(GameState.playerDeck)),
    enemyDeck: JSON.parse(JSON.stringify(GameState.enemyDeck)),
    currentTurn: GameState.currentTurn,
    turnCount: GameState.turnCount,
  };
}

function applySyncState(state) {
  if (!state) return;

  // ホスト自身がエコーを受信した場合は無視
  if (getIsHost()) return;

  // クライアント（受信側）はホストから見て「敵（enemy）」なので、
  // 送られてきた状態の player と enemy を反転させてローカルに適用しなければならない。
  GameState.playerHP = state.enemyHP || 0;
  GameState.enemyHP = state.playerHP || 0;
  GameState.playerSP = state.enemySP || 0;
  GameState.enemySP = state.playerSP || 0;

  // Firebaseでは配列に自動変換されたり省略されたりオブジェクト化されたりするため、厳密に配列化する
  const restoreArr = (arr, len = null) => {
    if (!arr) return len !== null ? Array(len).fill(null) : [];
    if (Array.isArray(arr))
      return len !== null
        ? Array.from({ length: len }, (_, i) => arr[i] || null)
        : arr;
    if (typeof arr === 'object')
      return len !== null
        ? Array.from({ length: len }, (_, i) => arr[i] || null)
        : Object.values(arr);
    return len !== null ? Array(len).fill(null) : [];
  };

  const restoreNumericArr = (arr, len) =>
    Array.from({ length: len }, (_, i) => Number(arr?.[i] ?? 0));

  GameState.playerBoard = restoreArr(state.enemyBoard, 3);
  GameState.enemyBoard = restoreArr(state.playerBoard, 3);
  GameState.playerHand = restoreArr(state.enemyHand);
  GameState.enemyHand = restoreArr(state.playerHand);
  GameState.playerDiscard = restoreArr(state.enemyDiscard);
  GameState.enemyDiscard = restoreArr(state.playerDiscard);
  GameState.playerDeck = restoreArr(state.enemyDeck);
  GameState.enemyDeck = restoreArr(state.playerDeck);

  // 封印レーン（敵味方を反転）と戦闘追加・スキップ状態の同期
  GameState.playerSealedLanes = restoreNumericArr(state.enemySealedLanes, 3);
  GameState.enemySealedLanes = restoreNumericArr(state.playerSealedLanes, 3);
  GameState.extraTurnCount = state.extraTurnCount || 0;
  GameState.attackSkipCount = state.attackSkipCount || 0;

  // ターン表記（player / enemy）もホストから見た主観なので逆転させる
  if (state.currentTurn === 'player') GameState.currentTurn = 'enemy';
  else if (state.currentTurn === 'enemy') GameState.currentTurn = 'player';
  else GameState.currentTurn = state.currentTurn;

  GameState.turnCount = state.turnCount;

  // 全てのUIを新しいステートに合わせて強制更新
  updateHPBar('blue', GameState.playerHP);
  updateHPBar('red', GameState.enemyHP);
  updateSPOrbs('blue');
  updateSPOrbs('red');
  renderBoard();
  renderHand();
  if (updateBattleUIHook) updateBattleUIHook();
}

// ==========================================
// バトル進行とスキルロジック
// ==========================================

export function prepareBattle() {
  // ローディング画面連打による二重呼び出し防止
  if (isBattleLoading) return;
  isBattleLoading = true;

  switchScreen('screen-loading');
  const isOnline = GameState.gameMode === 'online';
  const sessionId = isOnline
    ? GameState.battleSeed || cachedRoomData?.battleSeed || Date.now()
    : Date.now();
  let isFinished = false;

  // プレイマットは loadDeck() 時にデッキ固有のものが GameState.selectedPlaymatId に設定済みなのを使用する

  try {
    setRNGSeed(sessionId); // シードを完全に固定して初期化

    if (isOnline) {
      const isHost = getIsHost();
      const hostConfig = isHost
        ? GameState.playerConfig
        : GameState.enemyConfig;
      const clientConfig = isHost
        ? GameState.enemyConfig
        : GameState.playerConfig;

      // オンライン時はホスト -> クライアントの順でデッキを生成し、乱数消費順を世界共通に固定する
      const hostDeck = generateDeck(
        isHost ? 'blue' : 'red',
        hostConfig,
        sessionId
      );
      const clientDeck = generateDeck(
        isHost ? 'red' : 'blue',
        clientConfig,
        sessionId
      );

      GameState.playerDeck = isHost ? hostDeck : clientDeck;
      GameState.enemyDeck = isHost ? clientDeck : hostDeck;

      // アクション受信リスナー起動
      listenToRoomActions((snapshotVal) => {
        const { action, actor } = snapshotVal;
        // 自分自身が出したアクションか判定
        const isMe = actor === (getIsHost() ? 'host' : 'client');
        // 送信者は常に自己視点の 'blue' として出しているので、それを変換する
        action.owner = isMe ? 'blue' : 'red';

        dispatchBattleAction(action, true);
      });
    } else {
      GameState.playerDeck = generateDeck(
        'blue',
        GameState.playerConfig,
        sessionId
      );
      GameState.enemyDeck = generateDeck(
        'red',
        GameState.enemyConfig,
        sessionId
      );
    }
  } catch (e) {
    console.error('Deck generation error:', e);
    // エラー時も空のデッキで続行を試みる（フリーズ回避）
    GameState.playerDeck = GameState.playerDeck || [];
    GameState.enemyDeck = GameState.enemyDeck || [];
  }

  const allCards = [...GameState.playerDeck, ...GameState.enemyDeck];
  let loaded = 0;

  const finishLoading = () => {
    if (isFinished) return;
    isFinished = true;
    setTimeout(initBattleState, 500);
  };

  // セーフティタイムアウト: 5秒経過したら強制的に開始
  setTimeout(() => {
    if (!isFinished) {
      console.warn('Battle loading timed out. Forcing start...');
      finishLoading();
    }
  }, 5000);

  const updateProgress = () => {
    if (isFinished) return;
    loaded++;
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
      loadingText.innerText = `Generating Cards... ${Math.floor((loaded / Math.max(1, allCards.length)) * 100)}%`;
    }
    if (loaded >= allCards.length) finishLoading();
  };

  if (allCards.length === 0) {
    finishLoading();
    return;
  }

  allCards.forEach((card) => {
    const img = new Image();
    img.onload = updateProgress;
    img.onerror = updateProgress;
    img.src = card.imgUrl;
  });
}

export function initBattleState() {
  // バトル準備フラグをリセット（次回のprepareBattle呼び出しを許可）
  isBattleLoading = false;

  try {
    // 全てのBGMを停止
    stopAllBGM();

    // ステージ情報の取得
    let stageId =
      GameState.gameMode === 'story'
        ? GameState.enemyConfig.stageId || 'android'
        : GameState.selectedStageId || 'android';
    if (GameState.gameMode === 'battle_dungeon') {
      stageId = 'dungeon';
    } else if (GameState.gameMode === 'tournament') {
      stageId = 'practice';
    }
    const stageData = STAGES[stageId];
    // BGMの再生
    let bgmKey = stageData && stageData.bgm ? stageData.bgm : 'bgmBattle';
    if (
      GameState.gameMode === 'story' &&
      GameState.enemyConfig?.id === 'satan'
    ) {
      bgmKey = 'bgmLastBattle'; // ストーリーのラストボス（サタン）決戦専用BGM
    } else if (GameState.gameMode === 'tournament') {
      bgmKey = 'bgmTournament2'; // トーナメントバトル専用BGM
    } else if (
      GameState.gameMode &&
      GameState.gameMode.startsWith('event_') &&
      GameState.gameMode.endsWith('_high')
    ) {
      bgmKey = 'bgmStageHighDifficulty';
    }
    playSound(SOUNDS[bgmKey]);
    GameState.playerMaxHP = MAX_HP;
    GameState.enemyMaxHP =
      GameState.enemyConfig.hp ||
      (GameState.enemyConfig.id === 'satan'
        ? 40
        : ['void', 'succubus'].includes(GameState.enemyConfig.id)
          ? 30
          : MAX_HP);
    if (GameState.gameMode === 'campaign') {
      GameState.enemyMaxHP = 10;
    }
    if (
      GameState.gameMode.startsWith('event_') &&
      GameState.gameMode.endsWith('_high')
    )
      GameState.aiLevel = 3; // 念のため再セット

    if (GameState.gameMode === 'battle_dungeon') {
      // 敵のHPは汎用モンスターのみレアリティで決定。固有キャラの場合は元のHPを優先
      if (
        GameState.enemyConfig.leaderSkill &&
        GameState.enemyConfig.leaderSkill.action === 'dungeon_summon_leader'
      ) {
        const eRarity = GameState.enemyConfig.rarity || 4;
        GameState.enemyMaxHP = eRarity === 1 ? 10 : eRarity === 2 ? 15 : 20;
      } else {
        GameState.enemyMaxHP = GameState.enemyConfig.hp || 20;
      }

      // リーダースキルのSP要件も、汎用モンスターのみレアリティで決定（一律4ターン＝SP:4に固定）
      if (
        GameState.playerConfig &&
        GameState.playerConfig.leaderSkill &&
        GameState.playerConfig.leaderSkill.action === 'dungeon_summon_leader'
      ) {
        GameState.playerConfig = {
          ...GameState.playerConfig,
          leaderSkill: { ...GameState.playerConfig.leaderSkill },
        };
        GameState.playerConfig.leaderSkill.cost = 4;
        if (GameState.playerConfig.leaderSkill.desc) {
          GameState.playerConfig.leaderSkill.desc =
            GameState.playerConfig.leaderSkill.desc.replace(
              /\(SP:\d+\)/,
              '(SP:4)'
            );
        }
      }
      if (
        GameState.enemyConfig &&
        GameState.enemyConfig.leaderSkill &&
        GameState.enemyConfig.leaderSkill.action === 'dungeon_summon_leader'
      ) {
        GameState.enemyConfig = {
          ...GameState.enemyConfig,
          leaderSkill: { ...GameState.enemyConfig.leaderSkill },
        };
        GameState.enemyConfig.leaderSkill.cost = 4;
        if (GameState.enemyConfig.leaderSkill.desc) {
          GameState.enemyConfig.leaderSkill.desc =
            GameState.enemyConfig.leaderSkill.desc.replace(
              /\(SP:\d+\)/,
              '(SP:4)'
            );
        }
      }

      GameState.playerHP =
        typeof GameState.dungeonPlayerHP !== 'undefined'
          ? GameState.dungeonPlayerHP
          : GameState.playerMaxHP;
    } else {
      GameState.playerHP = GameState.playerMaxHP;
    }

    GameState.enemyHP = GameState.enemyMaxHP;
    GameState.playerSP = 0;
    GameState.enemySP = 0;
    GameState.turnCount = 0;
    GameState.firstPlayer = 'blue';
    GameState.battlePhase = 'INIT';
    GameState.combatStep = 0;
    GameState.playerHand = [];
    GameState.enemyHand = [];
    GameState.playerDiscard = [];
    GameState.enemyDiscard = [];
    GameState.playerBoard = [null, null, null];
    GameState.enemyBoard = [null, null, null];
    GameState.playerSealedLanes = [0, 0, 0];
    GameState.enemySealedLanes = [0, 0, 0];
    GameState.actionQueue = [];
    GameState.pendingChoices = [];
    GameState.isProcessing = false;
    GameState.isBattleEnded = false;
    GameState.lastBattleResult = null;
    GameState.selectedCardIndex = null;
    GameState.selectedBoardLaneIndex = null;
    GameState.selectedBoardSide = null;
    GameState.aiDecision = null;
    GameState.currentTurn = null;
    GameState.extraTurnCount = 0;
    GameState.attackSkipCount = 0;

    // --- モード系フラグの完全リセット ---
    GameState.isPlacementMode = false;
    GameState.placementCount = 0;
    GameState.placementToken = null;
    GameState.placementSelectedLanes = [];
    GameState.isEnemyTargetMode = false;
    GameState.isAlliedTargetMode = false;
    GameState.enemyTargetSkillId = null;
    GameState.targetSelectResolve = null;
    GameState.isDiscardingMode = false;
    GameState.discardSelectedIndices = [];
    GameState.discardMaxCount = 0;
    GameState.isDiscardingExact = false;

    // --- グローバルコールバック・リゾルバの確実なリセット ---
    pendingChoiceResolver = null;
    window.finishHandSelection = null;
    window.handlePlacementLaneClick = null;
    window.finishPlacement = null;
    window.handleEnemyLaneClick = null;
    window.finishEnemyTargetSelection = null;
    window.handleAlliedLaneClick = null;
    window.finishAlliedSelection = null;
    updateCardDetail(null);
    if (updateBattleUIHook) updateBattleUIHook();

    // 実績: リーダー使用率のカウント (プレイヤーが選択したキャラ)
    if (
      typeof incrementStat === 'function' &&
      GameState.playerConfig &&
      GameState.playerConfig.id &&
      GameState.gameMode !== 'practice' &&
      GameState.gameMode !== 'tutorial'
    ) {
      incrementStat('leaderUsage', GameState.playerConfig.id, 1);
    }

    // バトル画面への遷移シグナル。ここから先は BattleScreen.jsx に委ねる
    switchScreen('screen-battle');

    // 画面切り替えとDOM構成を待機してから戦闘開始処理へ
    setTimeout(() => {
      determineTurnOrder();
    }, 1000);
  } catch (e) {
    console.error('Critical error in initBattleState:', e);
    showAlertModal(
      'バトルの初期化中にエラーが発生しました。タイトルに戻ります。',
      () => {
        location.reload();
      }
    );
  }
}

export function checkWinCondition() {
  if (GameState.isBattleEnded) return true;

  if (GameState.playerHP <= 0 || GameState.enemyHP <= 0) {
    GameState.isBattleEnded = true;
    triggerFinishVisuals();
    setTimeout(endBattle, 2000);
    return true;
  }
  return false;
}

/**
 * リーダースキル確認モーダルから実行ボタンを押した時の処理
 * dispatchBattleActionに依存するためbattle.jsに残す
 */
export function executeSkillFromConfirm() {
  // 実行直前にもう一度チェック
  if (
    GameState.isProcessing ||
    GameState.isBattleEnded ||
    GameState.currentTurn !== 'player'
  ) {
    return;
  }
  closeSkillConfirm();
  dispatchBattleAction({ type: 'leaderSkill', owner: 'blue' });
}

/**
 * プレイヤーまたはAIに配置レーンを選択させるユーティリティ
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
  skipImmediateDiscard = false // 【追加】後続の playCard 等で破棄を行う場合、この関数内での即時破棄をスキップするフラグ
) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const sealedLanes =
    owner === 'blue'
      ? GameState.playerSealedLanes || [0, 0, 0]
      : GameState.enemySealedLanes || [0, 0, 0];
  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    return new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else pendingChoiceResolver = resolve;
    });
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
      const hasLegendary =
        tokenCard.skill === 'legendary' ||
        (tokenCard.skills &&
          tokenCard.skills.some((s) => s.id === 'legendary'));
      const hasTakeover =
        tokenCard.skill === 'takeover' ||
        (tokenCard.skills && tokenCard.skills.some((s) => s.id === 'takeover'));
      const hasApex =
        tokenCard.skill === 'apex' ||
        (tokenCard.skills && tokenCard.skills.some((s) => s.id === 'apex'));

      if (hasLegendary) {
        selectedLanes = selectedLanes.filter((i) => i === 1);
      }
      if (hasTakeover) {
        selectedLanes = selectedLanes.filter((i) => board[i] !== null);
      }
      if (hasApex) {
        selectedLanes = selectedLanes.filter(
          (i) =>
            board[i] &&
            (board[i].skill === 'legendary' ||
              (board[i].skills &&
                board[i].skills.some((s) => s.id === 'legendary')))
        );
      }
      const hasChallenge =
        tokenCard.skill === 'challenge' ||
        (tokenCard.skills &&
          tokenCard.skills.some((s) => s.id === 'challenge'));
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
        const hasLegendary =
          tokenCard.skill === 'legendary' ||
          (tokenCard.skills &&
            tokenCard.skills.some((s) => s.id === 'legendary'));
        const hasTakeover =
          tokenCard.skill === 'takeover' ||
          (tokenCard.skills &&
            tokenCard.skills.some((s) => s.id === 'takeover'));
        const hasApex =
          tokenCard.skill === 'apex' ||
          (tokenCard.skills && tokenCard.skills.some((s) => s.id === 'apex'));

        if (hasLegendary) {
          validEmptyLanes = validEmptyLanes.filter((i) => i === 1);
          validOccupiedLanes = validOccupiedLanes.filter((i) => i === 1);
        }
        if (hasTakeover) {
          validEmptyLanes = []; // 生贄（takeover）は空きレーン不可
        }
        if (hasApex) {
          validEmptyLanes = validEmptyLanes.filter(
            (i) =>
              board[i] &&
              (board[i].skill === 'legendary' ||
                (board[i].skills &&
                  board[i].skills.some((s) => s.id === 'legendary')))
          );
          validOccupiedLanes = validOccupiedLanes.filter(
            (i) =>
              board[i] &&
              (board[i].skill === 'legendary' ||
                (board[i].skills &&
                  board[i].skills.some((s) => s.id === 'legendary')))
          );
        }
        const hasChallenge =
          tokenCard.skill === 'challenge' ||
          (tokenCard.skills &&
            tokenCard.skills.some((s) => s.id === 'challenge'));
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

    const cleanUp = () => {
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
      updateCardDetail(null);

      if (GameState.gameMode === 'online') {
        // 送信先を同期
        sendOnlineAction({
          type: 'submitChoice',
          owner: 'blue',
          choiceData: result,
        });
      }

      if (updateBattleUIHook) updateBattleUIHook();
      return result;
    };

    window.finishPlacement = () => {
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
      resolve(cleanUp());
    };

    window.handlePlacementLaneClick = async (laneIndex) => {
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
          if (
            !targetCard ||
            !(
              targetCard.skill === 'legendary' ||
              (targetCard.skills &&
                targetCard.skills.some((s) => s.id === 'legendary'))
            )
          ) {
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

    if (updateBattleUIHook) updateBattleUIHook();
  });
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
export async function confirmOverwrittenLane(owner, tokenCard, laneIndex, checkConstraints = true) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  if (board[laneIndex] === null) return true;

  const existingCard = board[laneIndex];
  const tokenName = tokenCard ? tokenCard.name : 'トークン';

  // AI（owner !== 'blue'）の場合は、確認モーダルを出さずに自動的に承諾したものとして進行する
  if (owner !== 'blue') {
    return true;
  }

  // 1. 合体の判定
  let canUnion = false;
  if (tokenCard) {
    const unionSkill = tokenCard.skills && tokenCard.skills.find((s) => s.id === 'union');
    if (unionSkill && (existingCard.baseId === unionSkill.targetId || existingCard.id === unionSkill.targetId)) {
      canUnion = true;
    }
  }
  if (canUnion) {
    const confirmed = await new Promise((res) => {
      showConfirmModal(`「${existingCard.name}」と合体しますか？`, () => res(true), () => res(false));
    });
    if (!confirmed) return false;
    return true;
  }

  // 2. 装備の判定
  if (
    (tokenCard && typeof hasSkill === 'function' && hasSkill(tokenCard, 'equip')) ||
    (typeof hasSkill === 'function' && hasSkill(existingCard, 'arm_self'))
  ) {
    const confirmed = await new Promise((res) => {
      showConfirmModal(`「${existingCard.name}」に「${tokenName}」を装備しますか？`, () => res(true), () => res(false));
    });
    if (!confirmed) return false;
    return true;
  }

  // 3. 通常の破棄配置の判定
  const confirmed = await new Promise((res) => {
    showConfirmModal(`「${existingCard.name}」を破棄して「${tokenName}」を配置しますか？`, () => res(true), () => res(false));
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
  maxPower = null // 【追加】支配などでパワー上限制限を設けるためのフィルター
) {
  const isBlue = owner === 'blue';
  const targetBoard = isBlue ? GameState.enemyBoard : GameState.playerBoard;

  // ターゲット可能なレーンを取得（allowEmptyがtrueなら空レーンも含む、かつmaxPower指定時はそれを超えるカードを除外）
  const validLanes = allowEmpty
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

  if (validLanes.length === 0) return [];

  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    return new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else pendingChoiceResolver = resolve;
    });
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

    window.finishEnemyTargetSelection = () => {
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
        sendOnlineAction({
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
 * 自分の場のカードを選択させるユーティリティ（強化スキル用など）
 */
export async function waitPlayerAlliedLaneSelection(
  count,
  owner,
  canCancel = false
) {
  const isBlue = owner === 'blue';
  const targetBoard = isBlue ? GameState.playerBoard : GameState.enemyBoard;

  // ターゲット可能なレーン（配置されている場所）を取得
  const occupiedLanes = targetBoard
    .map((c, i) => (c !== null ? i : -1))
    .filter((i) => i !== -1);

  if (occupiedLanes.length === 0) return [];

  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    return new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else pendingChoiceResolver = resolve;
    });
  }

  // AIの場合：パワーが最も高いカード優先
  if (owner === 'red') {
    const sortedLanes = [...occupiedLanes].sort((a, b) => {
      const diff = targetBoard[b].currentPower - targetBoard[a].currentPower;
      if (diff !== 0) return diff;
      return a - b;
    });
    return sortedLanes.slice(0, count);
  }

  return new Promise((resolve) => {
    GameState.isAlliedTargetMode = true;
    GameState.targetMaxCount = count;
    GameState.targetSelectedLanes = [];
    GameState.isTargetCancelable = canCancel;
    updateCardDetail(null);

    window.handleAlliedLaneClick = (laneIndex) => {
      if (targetBoard[laneIndex] === null) return;
      playSound(SOUNDS.seClick);

      if (!GameState.targetSelectedLanes.includes(laneIndex)) {
        GameState.targetSelectedLanes.push(laneIndex);
        if (updateBattleUIHook) updateBattleUIHook(); // 選択ハイライト更新

        if (GameState.targetSelectedLanes.length >= count) {
          setTimeout(() => {
            window.finishAlliedSelection();
          }, 300);
        }
      }
    };

    window.finishAlliedSelection = () => {
      playSound(SOUNDS.seClick);
      GameState.isAlliedTargetMode = false;
      const result = [...GameState.targetSelectedLanes];
      GameState.targetSelectedLanes = [];
      GameState.targetMaxCount = 0;
      window.handleAlliedLaneClick = null;
      window.finishAlliedSelection = null;
      updateCardDetail(null);

      if (GameState.gameMode === 'online') {
        sendOnlineAction({
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
    return new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else pendingChoiceResolver = resolve;
    });
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

    window.finishHandSelection = () => {
      // チュートリアル中: カードを選ばずに終了することをブロック
      if (isTutorialMode() && GameState.discardSelectedIndices.length === 0) {
        playSound(SOUNDS.seDamage);
        return;
      }
      playSound(SOUNDS.seClick);
      const indices = cleanUp();

      if (GameState.gameMode === 'online') {
        sendOnlineAction({
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
  canCancel = true
) {
  if (await triggerGraveKeeperEffect()) return null;
  if (!validCards || validCards.length === 0) return null;

  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    const choiceStr = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else pendingChoiceResolver = resolve;
    });
    if (!choiceStr || choiceStr === -1) return null;
    // UID優先、なければidで検索して同期ズレを防ぐ
    const matchingCard = validCards.find(
      (c) => c.uid === choiceStr || c.id === choiceStr
    );
    return matchingCard || validCards[0];
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
    ]);
    if (aiAction) {
      // targetUid が存在する場合はUID優先で照合（フィルタ済みvalidCardsとのインデックスずれを防ぐ）
      if (aiAction.targetUid) {
        const byUid = validCards.find(
          (c) => c.uid === aiAction.targetUid || c.id === aiAction.targetUid
        );
        if (byUid) return byUid;
      }
      // フォールバック: targetIdx がそのまま使える場合
      if (aiAction.targetIdx !== undefined && validCards[aiAction.targetIdx]) {
        return validCards[aiAction.targetIdx];
      }
    }
    // フォールバック: ランダムに選択（回収などのシミュレーション除外スキル用）
    // 探索（explore）の場合は、選べる中で最大パワーのカードからランダムに選ぶ
    if (title && title.includes('探索')) {
      const maxP = Math.max(...validCards.map((c) => c.power || 0));
      const bestCards = validCards.filter((c) => (c.power || 0) === maxP);
      return bestCards[Math.floor(Math.random() * bestCards.length)];
    }
    const randomIndex = Math.floor(Math.random() * validCards.length);
    return validCards[randomIndex];
  }

  // プレイヤーの場合
  if (window.showDiscardSelectionModalReact) {
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
      sendOnlineAction({
        type: 'submitChoice',
        owner: 'blue',
        choiceData: choiceStr,
      });
    }
    return card;
  } else {
    return validCards[0];
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
  if (await triggerGraveKeeperEffect()) return [];
  // Check for Remote Choice Wait
  if (GameState.gameMode === 'online' && owner === 'red') {
    const choiceStr = await new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else pendingChoiceResolver = resolve;
    });
    if (!choiceStr || choiceStr === -1) return [];
    const uids = choiceStr.split(',');
    const allCards = [...blueCards, ...redCards];
    return allCards.filter((c) => uids.includes(c.uid) || uids.includes(c.id));
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
      sendOnlineAction({
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
    return new Promise((resolve) => {
      if (GameState.pendingChoices && GameState.pendingChoices.length > 0)
        resolve(GameState.pendingChoices.shift());
      else pendingChoiceResolver = resolve;
    });
  }

  // AIの場合
  if (owner === 'red') {
    // 【命令スキル】AIが相手のスキル選択肢から選ぶ
    // カードオーナー（プレイヤー）がforceカードを出し、AIがどのスキルを発動させるか決定する
    if (isForce) {
      await sleep(AI_THINKING_DURATION);
      const localAiLevel =
        parseInt(localStorage.getItem('storyDifficulty')) || 2;

      // Easy AI: ランダム選択（既存の挙動を維持）
      if (localAiLevel <= 1) {
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

    const localAiLevel = parseInt(localStorage.getItem('storyDifficulty')) || 2;

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

    // 2. 意思決定時に決定していない場合（Easy or 特殊な呼び出し）
    if (localAiLevel <= 1) {
      // Easy: ランダム
      const shuffled = shuffleArray([...choices]);
      return shuffled.slice(0, Math.min(maxChoices, choices.length));
    } else {
      // Normal/Hard: ここで簡易的にシミュレーション
      // 本来は意思決定時に行われるべきだが、フォールバックとして実装
      console.log('AI performing on-the-fly skill choice simulation');
      const scoredChoices = [];
      const originalBoard = GameState.enemyBoard.map((c) =>
        c ? JSON.parse(JSON.stringify(c)) : null
      );
      const originalPlayerBoard = GameState.playerBoard.map((c) =>
        c ? JSON.parse(JSON.stringify(c)) : null
      );

      for (let i = 0; i < choices.length; i++) {
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
    }
  }

  // プレイヤーの場合
  return new Promise((resolve) => {
    if (window.showSkillChoiceModalReact) {
      window.showSkillChoiceModalReact(
        choices,
        (selectedSkill) => {
          if (GameState.gameMode === 'online') {
            sendOnlineAction({
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
export async function discardCard(owner, card, lane, isDestroyed = true) {
  // 防御: card が undefined/null の場合はエラーにならないようガード
  if (!card) {
    console.warn(
      '[discardCard] card は undefined/null です。スキップします。',
      { owner, lane }
    );
    return;
  }
  if (card.equippedCards && card.equippedCards.length > 0) {
    for (const eqCard of card.equippedCards) {
      let restoredEq;
      // 【傀儡対応】装備カードに puppetOriginalOwner がある場合は元の持ち主の墓地に返却
      const eqOwner = eqCard.puppetOriginalOwner || eqCard.owner || owner;
      const discardPile =
        eqOwner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
      const eqMaster = CARD_MASTER.find(
        (m) => m.id === (eqCard.baseId || eqCard.id)
      );
      if (eqMaster) {
        restoredEq = JSON.parse(JSON.stringify(eqMaster));
        restoredEq.uid = eqCard.uid;
        restoredEq.owner = eqOwner;
        restoredEq.baseId = eqCard.baseId || eqCard.id;
        restoredEq.basePower = restoredEq.power;
        restoredEq.currentPower = restoredEq.power;
      } else {
        restoredEq = { ...eqCard };
      }
      if (restoredEq.puppetOriginalOwner) delete restoredEq.puppetOriginalOwner;
      if (!restoredEq.isToken) {
        if (typeof window.stripEphemeralSkills === 'function') {
          window.stripEphemeralSkills(restoredEq);
        }
        discardPile.push(restoredEq);
      }
    }
    card.equippedCards = [];
  }

  if (card.unionMaterials && card.unionMaterials.length > 0) {
    for (const matCard of card.unionMaterials) {
      let restoredMat;
      // 【傀儡対応】合体素材に puppetOriginalOwner がある場合は元の持ち主の墓地に返却
      const matOwner = matCard.puppetOriginalOwner || matCard.owner || owner;
      const discardPile =
        matOwner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
      const matMaster = CARD_MASTER.find(
        (m) => m.id === (matCard.baseId || matCard.id)
      );
      if (matMaster) {
        restoredMat = JSON.parse(JSON.stringify(matMaster));
        restoredMat.uid = matCard.uid;
        restoredMat.owner = matOwner;
        restoredMat.baseId = matCard.baseId || matCard.id;
        restoredMat.basePower = restoredMat.power;
        restoredMat.currentPower = restoredMat.power;
      } else {
        restoredMat = { ...matCard };
      }
      if (restoredMat.puppetOriginalOwner)
        delete restoredMat.puppetOriginalOwner;
      if (!restoredMat.isToken) {
        discardPile.push(restoredMat);
      }
    }
    card.unionMaterials = [];
  }

  if (card.originalRevertTarget) {
    const rvTarget = card.originalRevertTarget;
    // 【傀儡対応】石化された元カードに puppetOriginalOwner がある場合は元の持ち主の墓地に返却
    const rvOwner = rvTarget.puppetOriginalOwner || owner;
    const masterData = CARD_MASTER.find(
      (m) => m.id === (rvTarget.baseId || rvTarget.id)
    );
    let restoredCard;
    if (masterData) {
      restoredCard = JSON.parse(JSON.stringify(masterData));
      restoredCard.uid = rvTarget.uid;
      restoredCard.owner = rvOwner;
      restoredCard.baseId = rvTarget.baseId || rvTarget.id;
      if (rvTarget.isPremium !== undefined)
        restoredCard.isPremium = rvTarget.isPremium;
      restoredCard.basePower = restoredCard.power;
      restoredCard.currentPower = restoredCard.power;
    } else {
      restoredCard = { ...rvTarget };
      restoredCard.equippedCards = [];
    }
    if (restoredCard.puppetOriginalOwner)
      delete restoredCard.puppetOriginalOwner;
    if (!restoredCard.isToken) {
      (rvOwner === 'blue'
        ? GameState.playerDiscard
        : GameState.enemyDiscard
      ).push(restoredCard);
    }
    updateDeckDisplay(rvOwner);
  }

  if (card.isToken) return false;
  let skillsToResolve = [];
  if (card.skill && card.skill !== 'none')
    skillsToResolve.push({ id: card.skill, value: card.skillValue });
  if (Array.isArray(card.skills))
    skillsToResolve = skillsToResolve.concat(card.skills);

  for (const sk of skillsToResolve) {
    if (isDestroyed) {
      // 分裂(split)
      if (sk.id === 'split' && lane !== undefined) {
        await triggerSplitSkill(owner, lane, card);
        return true; // 分裂した場合は墓地に行かず場に残る
      }
      // 誘爆(explode)
      if (sk.id === 'explode' && lane !== undefined) {
        await triggerExplodeSkill(owner, lane, card);
      }
    }
  }

  // スキル発動フラグをリセット
  card.skillTriggered = false;
  card.stunTurns = 0;
  card.stunAppliedThisTurn = false;

  // 一時的なスキルの除去（無敵など）
  if (Array.isArray(card.skills)) {
    card.skills = card.skills.filter((sk) => sk.id !== 'invincible');
  }

  // 変相の復帰処理
  if (card.originalCardId) {
    const originalMaster = CARD_MASTER.find(
      (m) => m.id === card.originalCardId
    );
    if (originalMaster) {
      card.name = originalMaster.name;
      card.power = originalMaster.power || 0;
      card.basePower = originalMaster.power || 0;
      card.currentPower = originalMaster.power || 0;
      card.skill = originalMaster.skill || 'none';
      card.skillValue = originalMaster.skillValue || 0;
      card.skills = originalMaster.skills
        ? JSON.parse(JSON.stringify(originalMaster.skills))
        : [];
      card.choices = originalMaster.choices
        ? JSON.parse(JSON.stringify(originalMaster.choices))
        : [];
      card.choices2 = originalMaster.choices2
        ? JSON.parse(JSON.stringify(originalMaster.choices2))
        : null;
      card.rarity = originalMaster.rarity;
      card.imgUrl = originalMaster.imgUrl;
      card.flavor = originalMaster.flavor;
      card.voiceCategory = originalMaster.voiceCategory;
      delete card.originalCardId;
    }
  }

  // マスターデータから完全な初期状態を再構成して墓地へ
  let restoredCard;
  const masterData = CARD_MASTER.find((m) => m.id === (card.baseId || card.id));
  if (masterData) {
    restoredCard = JSON.parse(JSON.stringify(masterData));
    restoredCard.uid = card.uid; // IDなどの一意のプロパティは引き継ぐ
    restoredCard.owner = owner;
    restoredCard.baseId = card.baseId || card.id; // 画像URL等の解決に必須
    if (card.isPremium !== undefined) restoredCard.isPremium = card.isPremium;
    restoredCard.basePower = restoredCard.power;
    restoredCard.currentPower = restoredCard.power;
  } else {
    // マスターデータが見つからない場合（特殊トークン等）のフォールバック
    restoredCard = { ...card };
    if ('basePower' in restoredCard)
      restoredCard.power = restoredCard.basePower;
    restoredCard.currentPower = restoredCard.power;
    restoredCard.skills = []; // 付与されたスキルなどをクリア
  }

  // 【傀儡】傀儡スキルで奪ったカードは、元の持ち主の墓地に返却する
  const discardOwner = card.puppetOriginalOwner || owner;
  if (restoredCard.puppetOriginalOwner) delete restoredCard.puppetOriginalOwner;
  restoredCard.owner = discardOwner;

  if (typeof window.stripEphemeralSkills === 'function') {
    window.stripEphemeralSkills(restoredCard);
  }

  (discardOwner === 'blue'
    ? GameState.playerDiscard
    : GameState.enemyDiscard
  ).push(restoredCard);
  updateDeckDisplay(discardOwner);
  return false;
}

export async function triggerSplitSkill(owner, lane, card) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  let tokenId =
    card.summonId || card.skills?.find((s) => s.id === 'split')?.summonId;
  if (!tokenId) {
    const tokenMap = {
      bird: 'token_ent',
      octopus: 'legs',
      phoenix: 'token_phoenix',
      egg: 'token_dragon',
    };
    let testId = card.baseId || card.id;
    if (testId && testId.includes('_') && !testId.startsWith('token_')) {
      const master = CARD_MASTER.find((c) => c.name === card.name);
      if (master) testId = master.id;
    }
    tokenId = tokenMap[testId] || 'legs';
  }
  const tL = CARD_MASTER.find((m) => m.id === tokenId) || {
    name: 'トークン',
    power: 1,
  };

  // skills配列・skillプロパティの両方に対応したスキル値の取得
  let val = getSkillValue(card, 'split');
  if (val === undefined || val === null || isNaN(val)) {
    val = tL.power || 2;
  }

  board[lane] = {
    id: `sp_${Math.floor(getSeededRandom() * 1000000000)}_${lane}`,
    owner,
    ...tL,
    imgUrl: `assets/cards/card_${tokenId}.jpg`,
    power: val,
    currentPower: val,
    basePower: val,
    rarity: tL.rarity || 1,
  };

  playSound(SOUNDS.sePlace);
  renderBoard();
  const cEl = document.querySelector(
    `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${lane}"] .card`
  );
  if (cEl) createDamagePopup(cEl, '分裂', '#facc15');
  await sleep(PLACE_ANIMATION_DURATION);
}

export async function cleanupDestroyedCards(excludeCard = null) {
  let anyDestroyedAtAll = false;
  while (true) {
    let destroyedItems = [];
    [GameState.playerBoard, GameState.enemyBoard].forEach((board, bIdx) => {
      const side = bIdx === 0 ? 'player' : 'enemy';
      for (let i = 0; i < 3; i++) {
        if (
          board[i] &&
          board[i].currentPower <= 0 &&
          board[i] !== excludeCard &&
          !board[i].isSkillResolving
        ) {
          const el = document.querySelector(
            `#${side}-lanes .cell[data-lane="${i}"] .card`
          );
          destroyedItems.push({
            board,
            index: i,
            el,
            owner: bIdx === 0 ? 'blue' : 'red',
            card: board[i],
          });
        }
      }
    });

    if (destroyedItems.length === 0) break;
    anyDestroyedAtAll = true;

    // 演出: 死亡ボイス再生（揺れよりも先に開始）
    destroyedItems.forEach((item) => {
      if (item.card && item.card.voiceCategory) {
        playCardVoice(item.card.voiceCategory, 'death');
      }
    });
    // その後に揺らす
    destroyedItems.forEach((item) => {
      if (item.el) {
        // アニメーションを再トリガーするために一度クラスを外してリフロー
        item.el.classList.remove('anim-shake');
        void item.el.offsetWidth;
        item.el.classList.add('anim-shake');
      }
    });
    playSound(SOUNDS.seDamage);
    await sleep(400);

    // 実際の除去処理
    for (const item of destroyedItems) {
      if (item.board[item.index] !== item.card) continue;
      item.board[item.index] = null;
      await discardCard(item.owner, item.card, item.index);

      // 報復（retaliate）スキルの誘発
      const ownerSide = item.owner; // 'blue' or 'red'
      const alliedBoard =
        ownerSide === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
      const sideLabel = ownerSide === 'blue' ? 'player' : 'enemy';

      for (let j = 0; j < 3; j++) {
        const ally = alliedBoard[j];
        if (ally && hasSkill(ally, 'retaliate')) {
          const buffVal = getSkillValue(ally, 'retaliate') || 2;
          ally.currentPower += buffVal;

          const allyEl = document.querySelector(
            `#${sideLabel}-lanes .cell[data-lane="${j}"] .card`
          );
          if (allyEl) {
            createDamagePopup(allyEl, `報復 +${buffVal}`, '#f87171');
          }
        }
      }
    }

    playSound(SOUNDS.seDestroy);
    renderBoard();
    await sleep(400); // 連続破壊の際の間隔
  }
  return anyDestroyedAtAll;
}

// 以前の定義を削除
export async function triggerExplodeSkill(owner, lane, card) {
  const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const side = owner === 'blue' ? 'player' : 'enemy';
  const val = getSkillValue(card, 'explode') || 3;
  const adj = lane === 1 ? [0, 2] : [1];

  console.log(`Exploding at ${lane} with value ${val}`);

  let targetsFound = false;
  adj.forEach((j) => {
    if (board[j]) {
      board[j].currentPower -= val;
      targetsFound = true;
    }
  });

  if (targetsFound) {
    playSound(SOUNDS.seDamage);
    // renderBoard(); // アニメーションを壊すため避ける
    adj.forEach((j) => updateCardPowerOnly(j, side));

    // 描画更新後の新しいDOM要素に対して演出をかける
    adj.forEach((j) => {
      const cEl = document.querySelector(
        `#${side}-lanes .cell[data-lane="${j}"] .card`
      );
      if (cEl) {
        requestAnimationFrame(() => {
          cEl.classList.add('anim-shake');
        });
        createDamagePopup(cEl, `誘爆 -${val}`, '#ef4444');
      }
    });

    await sleep(500);
    await cleanupDestroyedCards();
  }
}

// AI用: アクションキューから指定された型のアクションを1つ取り出して削除する
export function consumeAIAction(types) {
  if (!GameState.aiDecision || !GameState.aiDecision.actionQueue) return null;
  const typeList = Array.isArray(types) ? types : [types];
  const idx = GameState.aiDecision.actionQueue.findIndex((a) =>
    typeList.includes(a.type)
  );
  if (idx !== -1) {
    return GameState.aiDecision.actionQueue.splice(idx, 1)[0];
  }
  return null;
}
export function drawCard(owner) {
  let d = owner === 'blue' ? GameState.playerDeck : GameState.enemyDeck,
    h = owner === 'blue' ? GameState.playerHand : GameState.enemyHand,
    ds = owner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;

  // 手札がいっぱいの場合は何もしない
  if (h.length >= 4) {
    updateDeckDisplay(owner);
    return;
  }

  if (d.length === 0 && ds.length > 0) {
    d.push(...shuffleArray(ds));
    ds.length = 0;
    playSound(SOUNDS.seSkill);
    showDeckRefreshEffect(owner);

    // 山札補充時のペナルティ（体力が半分（切り上げ）になるようにダメージ）
    const currentHP = owner === 'blue' ? GameState.playerHP : GameState.enemyHP;
    const newHP = Math.ceil(currentHP / 2);
    const damage = currentHP - newHP;

    if (damage > 0) {
      if (owner === 'blue') {
        GameState.playerHP = newHP;
      } else {
        GameState.enemyHP = newHP;
      }
      createDamagePopup(
        document.getElementById(
          `${owner === 'blue' ? 'player' : 'enemy'}-hp-fill`
        ),
        `-${damage}`,
        '#ef4444'
      );
      playSound(SOUNDS.seDamage);
      showSpeechBubble(owner);
      updateHPBar();
      checkWinCondition();
    }
  }

  if (d.length > 0) {
    const drawn = d.pop();
    if (
      drawn.currentPower === undefined ||
      Number.isNaN(drawn.currentPower) ||
      (drawn.currentPower <= 0 && (drawn.power || 0) > 0)
    ) {
      drawn.currentPower = drawn.power || 0;
    }
    h.push(drawn);
  }

  updateDeckDisplay(owner);
  if (owner === 'blue') renderHand();
}

export async function handleMoveSkills(owner) {
  const currentBoard =
    owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const curSealed =
    owner === 'blue'
      ? GameState.playerSealedLanes || [0, 0, 0]
      : GameState.enemySealedLanes || [0, 0, 0];

  // 1. 神出 (teleport) スキルの自動解決
  const teleportMovedIds = new Set();
  for (let i = 0; i < 3; i++) {
    const c = currentBoard[i];
    if (
      c &&
      typeof hasSkill === 'function' &&
      hasSkill(c, 'teleport') &&
      (c.stunTurns || 0) === 0 &&
      !hasSkill(c, 'defender') &&
      !teleportMovedIds.has(c.uid || c.id)
    ) {
      const emptyLanes = [];
      for (let j = 0; j < 3; j++) {
        if (currentBoard[j] === null && curSealed[j] === 0) {
          emptyLanes.push(j);
        }
      }

      if (emptyLanes.length > 0) {
        const randomIndex = Math.floor(getSeededRandom() * emptyLanes.length);
        const targetLane = emptyLanes[randomIndex];

        // 演出（元の位置でポップアップ表示）
        const originalEl = document.querySelector(
          `#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`
        );
        if (originalEl) {
          createDamagePopup(originalEl, '神出', '#facc15');
        }
        playSound(SOUNDS.sePlace);

        // 移動実行
        currentBoard[targetLane] = c;
        currentBoard[i] = null;
        teleportMovedIds.add(c.uid || c.id);

        await sleep(PLACE_ANIMATION_DURATION);
        renderBoard();
      }
    }
  }

  // 2. 移動 (move) スキルの解決
  if (owner !== 'blue' && GameState.gameMode !== 'online') {
    const b = GameState.enemyBoard;
    // AIの移動判断
    const bestMoves = evaluateAIMoves(GameState);
    if (bestMoves) {
      for (let move of bestMoves) {
        b[move.to] = b[move.from];
        b[move.from] = null;
        playSound(SOUNDS.seClick);
        await sleep(PLACE_ANIMATION_DURATION);
        renderBoard();
      }
    }
    return;
  }

  const b = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const movedIds = new Set();
  for (let i = 0; i < 3; i++) {
    const c = b[i];
    if (
      c &&
      typeof hasSkill === 'function' &&
      hasSkill(c, 'move') &&
      (c.stunTurns || 0) === 0 &&
      !movedIds.has(c.uid || c.id)
    ) {
      const possibleLanes = [];
      if (i > 0) possibleLanes.push(i - 1);
      if (i < 2) possibleLanes.push(i + 1);
      if (possibleLanes.length === 0) continue;

      let successMove = false;
      while (!successMove) {
        if (owner === 'blue') {
          GameState.placementMessage = `移動するレーンを選んでください`;
          if (updateBattleUIHook) updateBattleUIHook();
        }

        const targetIdx = await waitPlayerLaneSelection(
          1,
          owner,
          c,
          false,
          possibleLanes,
          false,
          true,
          '移動終了'
        );

        if (owner === 'blue') {
          GameState.placementMessage = null;
        }
        if (!targetIdx || targetIdx.length === 0) {
          // 移動選択自体をキャンセルした場合は移動を終了
          break;
        }
        const target = targetIdx[0];
        if (target !== i) {
          // 根本的リファクタリング：移動先レーンに既存カードがある場合の上書き確認
          const proceed = await confirmOverwrittenLane(owner, c, target, false);
          if (!proceed) {
            await sleep(200);
            continue; // キャンセルされた場合はレーン選択からやり直す
          }
          if (b[target]) {
            if (!(await discardCard(owner, b[target], target, false)))
              b[target] = null;
          }
          movedIds.add(c.uid || c.id);
          b[target] = c;
          b[i] = null;
          playSound(SOUNDS.sePlace);
          renderBoard();
          await sleep(PLACE_ANIMATION_DURATION);
          successMove = true;
        } else {
          // 同じレーンをクリックした場合は何もせず移動終了
          successMove = true;
        }
      }
    }
  }
}

export async function startTurn(owner) {
  if (GameState.isBattleEnded) return;
  GameState.isProcessing = true;

  // スタン（拘束/待機）状態の更新（そのプレイヤーのターン開始時に減算）
  const myBoard =
    owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  myBoard.forEach((c) => {
    if (c && c.stunTurns > 0) {
      c.stunTurns--;
    }
  });

  GameState.currentTurn = owner === 'blue' ? 'player' : 'enemy';
  if (updateBattleUIHook) updateBattleUIHook();
  renderBoard(); // スタン状態の見た目更新のため描画
  await sleep(50); // Reactの再描画(DOM更新)を確実に行わせるための待機時間

  // チュートリアルモード: 敵ターン開始前にメッセージ表示のため一時停止
  if (
    owner === 'red' &&
    GameState.tutorial &&
    GameState.tutorial.pauseBeforeEnemyTurn
  ) {
    GameState.tutorial.pauseBeforeEnemyTurn = false;
    GameState.isProcessing = false;
    if (updateBattleUIHook) updateBattleUIHook();
    // チュートリアルフローからの再開通知を待つ
    await new Promise((resolve) => {
      GameState.tutorial.enemyTurnResumeResolver = resolve;
    });
    GameState.isProcessing = true;
  }

  const c = owner === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
  // ターン数のカウント
  GameState.turnCount++;

  // ターン開始時スキルの発動
  await triggerStartTurnSkills(owner);
  if (GameState.isBattleEnded) return;

  // 移動スキルの処理
  await handleMoveSkills(owner);
  if (GameState.isBattleEnded) return;

  // SPの増加（先攻の1ターン目や追加ターン中は増えない）
  if (GameState.turnCount > 1 && GameState.attackSkipCount === 0) {
    if (c.leaderSkill && c.leaderSkill.cost) {
      if (owner === 'blue')
        GameState.playerSP = Math.min(
          c.leaderSkill.cost,
          GameState.playerSP + 1
        );
      else
        GameState.enemySP = Math.min(c.leaderSkill.cost, GameState.enemySP + 1);
    }
    updateSPOrbs(owner);
  }

  // チュートリアルモード: 攻撃フェーズ前にメッセージ表示のため一時停止
  if (
    owner === 'blue' &&
    GameState.tutorial &&
    GameState.tutorial.pauseBeforeCombat
  ) {
    GameState.tutorial.pauseBeforeCombat = false;
    GameState.isProcessing = false;
    if (updateBattleUIHook) updateBattleUIHook();
    // チュートリアルフローからの再開通知を待つ
    await new Promise((resolve) => {
      GameState.tutorial.combatResumeResolver = resolve;
    });
    GameState.isProcessing = true;
  }

  let skipAttack = false;
  if (GameState.attackSkipCount > 0) {
    skipAttack = true;
    GameState.attackSkipCount--;
  }

  if (skipAttack) {
    // 何もせず攻撃フェーズをスキップ
  } else {
    if (
      (owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard).some(
        (x) => x !== null
      )
    ) {
      await executeCombatPhase(owner);
      if (checkWinCondition()) return;
    }
  }

  // 【デバッグ】プレイヤー攻撃終了後の実際の盤面状態をAIデバッグと同形式で出力
  if (owner === 'blue') {
    const dumpBoard = (b) =>
      b
        .map((c) =>
          c
            ? `${c.name}(${c.currentPower !== undefined ? c.currentPower : c.power})`
            : 'EMPTY'
        )
        .join(' | ');
    console.log(
      `[Player Turn End] Board: [Player] ${dumpBoard(GameState.playerBoard)} vs [AI] ${dumpBoard(GameState.enemyBoard)}`
    );
  }

  drawCard(owner);
  if (owner === 'blue') {
    GameState.selectedCardIndex = null;
    updateCardDetail(null);
    renderHand();
    renderBoard();
    GameState.isProcessing = false;
    GameState.battlePhase = 'MAIN_ACTION';
  } else {
    renderBoard(); // 重要: 敵ターン開始前の状態（戦闘結果等）を画面に反映
    GameState.isProcessing = false;
    dispatchBattleAction({ type: 'enemyTurn' });
  }
}

export async function endPlayerTurn() {
  if (GameState.isProcessing) return;
  // 確認モーダルを表示
  const confirmed = await new Promise((resolve) => {
    showConfirmModal(
      'ターンを終了しますか？\nまだカードを使用できます。',
      () => resolve(true),
      () => resolve(false)
    );
  });
  if (!confirmed) return;
  document
    .querySelectorAll('.cell')
    .forEach((c) => c.classList.remove('highlight'));
  GameState.selectedCardIndex = null;
  updateCardDetail(null);
  renderHand();
  renderBoard();
  // processActionQueue内でロックするため、ここは解除しておく（または最初からセットしない）
  GameState.isProcessing = false;
  dispatchBattleAction({ type: 'endTurn', owner: 'blue' });
}

export async function endTurnLogic(o) {
  if (!GameState.isBattleEnded) {
    if (o === 'blue') {
      if (GameState.playerSealedLanes)
        GameState.playerSealedLanes = GameState.playerSealedLanes.map((v) =>
          Math.max(0, v - 1)
        );
    } else {
      if (GameState.enemySealedLanes)
        GameState.enemySealedLanes = GameState.enemySealedLanes.map((v) =>
          Math.max(0, v - 1)
        );
    }

    const hand = o === 'blue' ? GameState.playerHand : GameState.enemyHand;
    if (hand.length > 3) {
      const discardCount = hand.length - 3;
      GameState.placementMessage = null;
      if (updateBattleUIHook) updateBattleUIHook();

      if (o === 'blue') {
        const indices = await waitPlayerHandSelection(
          discardCount,
          'blue',
          true,
          '手札が上限を超えています。捨てるカードを選択してください。'
        );
        const sortedIndices = [...indices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          const dropped = GameState.playerHand.splice(idx, 1)[0];
          await discardCard('blue', dropped, undefined, false);
        }
      } else {
        if (GameState.gameMode === 'online') {
          const indices = await waitPlayerHandSelection(
            discardCount,
            'red',
            true
          );
          const sortedIndices = [...indices].sort((a, b) => b - a);
          for (const idx of sortedIndices) {
            const dropped = GameState.enemyHand.splice(idx, 1)[0];
            await discardCard('red', dropped, undefined, false);
          }
        } else {
          let candidates = GameState.enemyHand.map((c, i) => ({
            idx: i,
            power: c.power || 0,
          }));
          candidates.sort((a, b) => b.power - a.power);
          const sortedIndices = candidates
            .slice(0, discardCount)
            .map((c) => c.idx)
            .sort((a, b) => b - a);
          for (const idx of sortedIndices) {
            const dropped = GameState.enemyHand.splice(idx, 1)[0];
            await discardCard('red', dropped, undefined, false);
          }
        }
      }

      GameState.placementMessage = null;
      renderHand();
    }

    renderBoard();
    let nextOwner = o === 'blue' ? 'red' : 'blue';
    if (GameState.extraTurnCount > 0) {
      GameState.extraTurnCount--;
      nextOwner = o;
    }
    await startTurn(nextOwner);
  }
}

export async function playCard(o, hI, l) {
  const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand,
    b = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  const playingCard = h[hI];
  if (!playingCard) return false;

  const sealedLanes =
    o === 'blue'
      ? GameState.playerSealedLanes || [0, 0, 0]
      : GameState.enemySealedLanes || [0, 0, 0];
  const oppBoard = o === 'blue' ? GameState.enemyBoard : GameState.playerBoard;

  // 封印（Seal）レーンは絶対に配置・召喚不可（最優先ルール）
  if (sealedLanes[l] > 0) return false;

  // 1ターン目中央制限
  if (GameState.turnCount === 1 && GameState.firstPlayer === o && l !== 1)
    return false;

  // 伝説のカード制限（中央のみ）
  if (hasSkill(playingCard, 'legendary') && l !== 1) return false;

  // 生贄のカード制限（自分のカードがあるレーンのみ）
  if (hasSkill(playingCard, 'takeover') && b[l] === null) return false;

  // 挑戦のカード制限（正面に敵がいるレーンのみ）
  if (hasSkill(playingCard, 'challenge') && oppBoard[l] === null) return false;

  // 頂点のカード制限（自分の伝説カードの上のみ）
  if (hasSkill(playingCard, 'apex')) {
    const targetCard = b[l];
    if (
      !targetCard ||
      !(
        targetCard.skill === 'legendary' ||
        (targetCard.skills &&
          targetCard.skills.some((s) => s.id === 'legendary'))
      )
    ) {
      return false;
    }
  }

  // 手札からのプレイ（召喚・合体・装備含む）時にアニメーションを再生
  await playSummonAnimation(playingCard, o);

  if (b[l]) {
    // 合体（Union）の判定
    const unionSkill =
      playingCard.skills && playingCard.skills.find((s) => s.id === 'union');
    if (
      unionSkill &&
      (b[l].baseId === unionSkill.targetId || b[l].id === unionSkill.targetId)
    ) {
      const targetCard = b[l];
      const combineId = unionSkill.summonId;

      // BattleScreen 等の UI 側で既に合体確認（または破棄確認等による上書き）が完了しているため
      // 即座に合体を実行する。
      const consumedCard = h.splice(hI, 1)[0];
      const masterData = CARD_MASTER.find((c) => c.id === combineId);
      let unionCard = JSON.parse(JSON.stringify(masterData));
      unionCard.uid = getOrCreateUUID(null);
      unionCard.owner = o;
      unionCard.baseId = unionCard.id;
      unionCard.basePower = unionCard.power;
      unionCard.currentPower = unionCard.power;
      unionCard.unionMaterials = [targetCard, consumedCard];

      b[l] = unionCard;

      playSound(SOUNDS.sePlace);
      if (unionCard.voiceCategory) {
        playCardVoice(unionCard.voiceCategory, 'play');
      }

      if (o === 'blue') {
        GameState.selectedCardIndex = null;
        updateCardDetail(null);
      }
      renderHand();
      renderBoard();

      await resolveOnPlaySkill(o, l, unionCard);
      await cleanupDestroyedCards();

      await sleep(100);
      renderBoard();
      return true;
    }

    if (
      hasSkill(playingCard, 'equip') ||
      (b[l] && hasSkill(b[l], 'arm_self'))
    ) {
      const targetCard = b[l];

      // 【憑依】：「憑依」を持つカードには装備できない。また「憑依」を持つカード自身も装備になれない。
      if (
        targetCard &&
        (hasSkill(targetCard, 'possession') ||
          hasSkill(playingCard, 'possession') ||
          hasSkill(targetCard, 'reflect') ||
          hasSkill(playingCard, 'reflect'))
      ) {
        // possession チェック: equip 処理をスキップし、下の通常上書き配置へ進む
      } else if (targetCard) {
        // 装備によるパワー加算
        targetCard.basePower =
          (targetCard.basePower || 0) + (playingCard.power || 0);
        targetCard.currentPower =
          (targetCard.currentPower || 0) + (playingCard.power || 0);

        // スキルの統合
        if (!targetCard.skills) {
          targetCard.skills =
            targetCard.skill !== 'none'
              ? [{ id: targetCard.skill, value: targetCard.skillValue }]
              : [];
          if (targetCard.skill !== 'none' && targetCard.summonId) {
            targetCard.skills[0].summonId = targetCard.summonId;
          }
          if (targetCard.skill !== 'none' && targetCard.targetId) {
            targetCard.skills[0].targetId = targetCard.targetId;
          }
          targetCard.skill = 'none';
        }

        const equipSkills = [];
        if (
          playingCard.skill &&
          playingCard.skill !== 'none' &&
          playingCard.skill !== 'equip'
        ) {
          equipSkills.push({
            id: playingCard.skill,
            value: playingCard.skillValue,
          });
        }
        if (playingCard.skills) {
          playingCard.skills.forEach((s) => {
            if (s.id !== 'equip') equipSkills.push(s);
          });
        }
        mergeCardSkills(targetCard, equipSkills);

        // choiceスキルがある場合は、装備元の選択肢を引き継ぐ
        if (playingCard.choices && playingCard.choices.length > 0) {
          targetCard.choices = targetCard.choices || [];
          playingCard.choices.forEach((pc) => {
            const isDup = targetCard.choices.some(
              (tc) =>
                tc.id === pc.id &&
                tc.value === pc.value &&
                tc.choiceGroup === pc.choiceGroup
            );
            if (!isDup) targetCard.choices.push({ ...pc });
          });
        }
        if (playingCard.choices2 && playingCard.choices2.length > 0) {
          targetCard.choices2 = targetCard.choices2 || [];
          playingCard.choices2.forEach((pc) => {
            const isDup = targetCard.choices2.some(
              (tc) =>
                tc.id === pc.id &&
                tc.value === pc.value &&
                tc.choiceGroup === pc.choiceGroup
            );
            if (!isDup) targetCard.choices2.push({ ...pc });
          });
        }

        // 手札の装備カードを消費して対象カードにアタッチ
        const consumedCard = h.splice(hI, 1)[0];
        targetCard.equippedCards = targetCard.equippedCards || [];
        targetCard.equippedCards.push(consumedCard);

        // 配置音・ボイス
        playSound(SOUNDS.sePlace);
        if (playingCard.voiceCategory)
          playCardVoice(playingCard.voiceCategory, 'play');

        if (o === 'blue') {
          GameState.selectedCardIndex = null;
          updateCardDetail(null);
        }
        renderHand();
        renderBoard();

        // 装備カードが持っていたアクティブスキルを即時発動させる
        for (const sk of equipSkills) {
          if (ACTIVE_SKILLS.includes(sk.id)) {
            await sleep(50);
            const enhancedSk = {
              ...sk,
              _sourceChoices: playingCard.choices,
              _sourceChoices2: playingCard.choices2,
            };
            await resolveActiveSkillEffect(
              o,
              l,
              targetCard,
              sk.id,
              sk.value,
              enhancedSk
            );
          }
        }

        await sleep(100);
        renderBoard();
        await cleanupDestroyedCards();
        return true; // 装備完了
      }
    }
    // 通常の上書き配置時の破棄処理（装備でも合体でもない場合、破壊効果は発動させない）
    if (!(await discardCard(o, b[l], l, false))) b[l] = null;
  } // if (b[l]) end

  b[l] = h.splice(hI, 1)[0];
  const c = b[l];

  // 出現時スキルを持つ場合は即座に保護フラグを立てる（描画待ちの破壊を防ぐ）
  if (hasActiveSkill(c)) {
    c.isSkillResolving = true;
  }

  // 旧環境データ由来等のパワー欠落・異常(手札なのに0やNaN)を自動修復
  if (
    c.currentPower === undefined ||
    Number.isNaN(c.currentPower) ||
    (c.currentPower <= 0 && (c.power || 0) > 0)
  ) {
    c.currentPower = c.power || 0;
    c.basePower = c.power || 0;
  }

  // 配置音とボイスの再生
  playSound(SOUNDS.sePlace);
  if (c.voiceCategory) {
    playCardVoice(c.voiceCategory, 'play');
  }

  if (o === 'blue') {
    GameState.selectedCardIndex = null;
    updateCardDetail(null);
  }
  renderHand();
  renderBoard();

  // 出現時スキルの発動（単一または複数）
  if (hasActiveSkill(c)) {
    await sleep(50); // React DOMコミット待機
    await resolveOnPlaySkill(o, l, c);
  }

  // スキル解決後、自分自身（パワー0のスペル等）や他カードの死亡を一括確認
  await cleanupDestroyedCards();

  // 召喚効果解決後などにパワー0以下のカードがあれば破壊する
  await cleanupDestroyedCards();
  return true;
}

// 判定補助: カードが何らかのアクティブスキルを持っているか
export function hasActiveSkill(c) {
  if (!c) return false;
  return ACTIVE_SKILLS.some((s) => hasSkill(c, s));
}

export async function triggerStartTurnSkills(owner) {
  let triggered = false;

  for (let i = 0; i < 3; i++) {
    const tr = await triggerStartTurnPassive(owner, i);
    if (tr) {
      triggered = true;
      if (checkWinCondition()) return;
      updateHPBar();
      await sleep(300);
    }
  }
  if (triggered) {
    renderBoard();
    await sleep(200);
  }
}

/**
 * 【デバッグ・チュートリアル用】プリセットからカードオブジェクトを生成する
 * @param {string} cardId - CARD_MASTER上のカードID
 * @param {string} owner - 'blue' | 'red'
 * @param {number} index - 一意のインデックス（UID生成用）
 * @returns {object|null} カードオブジェクト
 */
function resolvePresetCard(cardId, owner, index) {
  const master = CARD_MASTER.find((m) => m.id === cardId);
  if (!master) {
    console.warn(`[BattlePreset] カードID "${cardId}" が見つかりません`);
    return null;
  }
  const card = {
    ...master,
    baseId: master.id,
    id: `${owner}_preset_${index}`,
    owner: owner,
    power: master.power,
    basePower: master.power,
    currentPower: master.power,
    skills: master.skills ? master.skills.map((s) => ({ ...s })) : undefined,
    uid: `${owner}_preset_${Date.now()}_${index}`,
  };
  card.imgUrl = getCardImgUrl(card);
  return card;
}

/**
 * 【デバッグ・チュートリアル用】バトル状態プリセットを適用する
 * プリセットオブジェクトの各フィールド（省略可能）に基づき、GameStateを上書きする。
 * @param {object} preset - プリセットデータ（詳細はdebug_state_plan.mdを参照）
 */
function applyBattlePreset(preset) {
  if (!preset) return;
  console.log('[BattlePreset] プリセットを適用中...', preset);

  // カードID配列からカードオブジェクト配列を生成するヘルパー
  let cardCounter = 0;
  const resolveCards = (cardIds, owner) => {
    if (!Array.isArray(cardIds)) return null;
    return cardIds
      .map((id) => resolvePresetCard(id, owner, cardCounter++))
      .filter(Boolean);
  };

  // --- HP ---
  if (preset.playerHP !== undefined) GameState.playerHP = preset.playerHP;
  if (preset.enemyHP !== undefined) GameState.enemyHP = preset.enemyHP;

  // --- SP ---
  if (preset.playerSP !== undefined) GameState.playerSP = preset.playerSP;
  if (preset.enemySP !== undefined) GameState.enemySP = preset.enemySP;

  // --- ターン数 ---
  if (preset.turnCount !== undefined) GameState.turnCount = preset.turnCount;

  // --- 手札 ---
  if (preset.playerHand) {
    const cards = resolveCards(preset.playerHand, 'blue');
    if (cards) GameState.playerHand = cards;
  }
  if (preset.enemyHand) {
    const cards = resolveCards(preset.enemyHand, 'red');
    if (cards) GameState.enemyHand = cards;
  }

  // --- 山札（指定された場合のみ完全入れ替え。配列の先頭がデッキトップ）---
  if (preset.playerDeck) {
    const cards = resolveCards(preset.playerDeck, 'blue');
    if (cards) GameState.playerDeck = cards.reverse();
  }
  if (preset.enemyDeck) {
    const cards = resolveCards(preset.enemyDeck, 'red');
    if (cards) GameState.enemyDeck = cards.reverse();
  }

  // --- 墓地 ---
  if (preset.playerDiscard) {
    const cards = resolveCards(preset.playerDiscard, 'blue');
    if (cards) GameState.playerDiscard = cards;
  }
  if (preset.enemyDiscard) {
    const cards = resolveCards(preset.enemyDiscard, 'red');
    if (cards) GameState.enemyDiscard = cards;
  }

  // --- 場（3レーン。null = 空きレーン、文字列ID または {id, imgUrl?, ...} オブジェクト）---
  const resolveBoardEntry = (entry, owner) => {
    if (!entry) return null;
    // オブジェクト形式: {id: 'card_id', imgUrl?: '...'} で画像等を上書き可能
    const cardId = typeof entry === 'string' ? entry : entry.id;
    const overrides = typeof entry === 'object' ? entry : {};
    const card = resolvePresetCard(cardId, owner, cardCounter++);
    if (card) {
      card.skillTriggered = true;
      card.stunTurns = 0;
      card.stunAppliedThisTurn = false;
      // オブジェクト形式で指定された追加プロパティを上書き
      if (overrides.imgUrl) card.imgUrl = overrides.imgUrl;
      if (overrides.power !== undefined) {
        card.power = overrides.power;
        card.basePower = overrides.power;
        card.currentPower = overrides.power;
      }
      if (overrides.name) card.name = overrides.name;
    }
    return card;
  };
  if (preset.playerBoard) {
    GameState.playerBoard = preset.playerBoard.map((e) =>
      resolveBoardEntry(e, 'blue')
    );
  }
  if (preset.enemyBoard) {
    GameState.enemyBoard = preset.enemyBoard.map((e) =>
      resolveBoardEntry(e, 'red')
    );
  }

  // --- 封印レーン ---
  if (preset.playerSealedLanes) {
    GameState.playerSealedLanes = [...preset.playerSealedLanes];
  }
  if (preset.enemySealedLanes) {
    GameState.enemySealedLanes = [...preset.enemySealedLanes];
  }

  // デッキ残数表示を更新
  updateDeckDisplay('blue');
  updateDeckDisplay('red');

  console.log('[BattlePreset] プリセット適用完了');
}

/**
 * チュートリアル用: 敵のスクリプト行動
 * ターン数に応じて事前定義されたカードを出す
 */
async function executeTutorialEnemyTurn() {
  // チュートリアルIDに応じた敵行動スクリプト
  const tutorialId = GameState.tutorial?.id || 'basic_rules';

  const enemyHandIndex = 0; // 常に手札の先頭を使用

  if (GameState.enemyHand.length > 0 && tutorialId !== 'leader_oni') {
    const card = GameState.enemyHand[0];
    let targetLane = 1; // デフォルトは中央

    if (tutorialId === 'basic_rules') {
      // 基本ルール: 鉄亀→左、ゴブリン→中央
      if (card.id === 'tortoise' || card.baseId === 'tortoise') {
        targetLane = 0;
      } else if (card.id === 'goblin' || card.baseId === 'goblin') {
        targetLane = 1;
      }
    } else if (tutorialId === 'leader_dragon') {
      // イグニス: ゴーレムを右に配置
      targetLane = 2;
    } else if (tutorialId === 'leader_knight') {
      // セレスティア: ゴーレムを中央に配置
      targetLane = 1;
    } else if (tutorialId === 'leader_devilhunter') {
      // マリア: ゴーレムを左に配置
      targetLane = 0;
    } else if (tutorialId === 'leader_witch') {
      // クロエ: ゴーレムを中央に配置
      targetLane = 1;
    } else if (tutorialId === 'leader_priest') {
      // ネフティ: ゴーレムを左に配置
      targetLane = 0;
    }

    await playCard('red', enemyHandIndex, targetLane);
    if (checkWinCondition()) return;
    GameState.selectedCardIndex = null;
    await sleep(PLACE_ANIMATION_DURATION);
  }

  await endTurnLogic('red');
}

/**
 * 先攻・後攻を決定する演出
 */
export async function determineTurnOrder() {
  GameState.isProcessing = true;
  GameState.turnCount = 0;

  // ゲーム開始時の初期ドロー（両者3枚ずつ）
  if (GameState.playerHand.length === 0 && GameState.enemyHand.length === 0) {
    for (let i = 0; i < 3; i++) {
      drawCard('blue');
      drawCard('red');
    }
  }

  // プリセットが設定されている場合、状態を上書きしてマリガン・先攻決定をスキップ
  if (GameState.battlePreset) {
    const preset = GameState.battlePreset;
    applyBattlePreset(preset);
    GameState.battlePreset = null; // 適用後にクリア（リトライ時の二重適用を防止）
    GameState.firstPlayer =
      preset.firstPlayer || (getSeededRandom() < 0.5 ? 'blue' : 'red');
    GameState.isProcessing = false;
    GameState.battlePhase = 'BATTLE';
    renderBoard();
    renderHand();
    updateHPBar();
    updateSPOrbs();
    // BattleScreen側のisInitializingをfalseにする（TurnOrderOverlayをスキップするため）
    if (window.onBattlePresetReady) window.onBattlePresetReady();
    await sleep(PLACE_ANIMATION_DURATION);
    await startTurn(GameState.firstPlayer);
    // チュートリアルモードの場合、最初のターン処理完了後にフローを開始
    if (GameState.gameMode === 'tutorial' && isTutorialMode()) {
      runTutorialFlow();
    }
    return;
  }

  if (window.startTurnOrderReact) {
    window.startTurnOrderReact((firstPlayer) => {
      GameState.firstPlayer = firstPlayer;
      GameState.isProcessing = false;
      startMulliganPhase();
    });
  } else {
    // フォールバック
    GameState.firstPlayer = getSeededRandom() < 0.5 ? 'blue' : 'red';
    GameState.isProcessing = false;
    startMulliganPhase();
  }
}

export async function startMulliganPhase() {
  GameState.battlePhase = 'MULLIGAN';
  GameState.placementMessage = null;
  if (updateBattleUIHook) updateBattleUIHook();

  let playerPromise = waitPlayerHandSelection(
    3,
    'blue',
    false,
    '引き直すカードを3枚まで選んでください'
  );
  let enemyPromise;

  if (GameState.gameMode === 'online') {
    enemyPromise = waitPlayerHandSelection(3, 'red', false);
  } else {
    enemyPromise = new Promise((resolve) => {
      let aiIndices = [];
      const aiHand = GameState.enemyHand;
      const allTakeover =
        aiHand.length > 0 && aiHand.every((card) => hasSkill(card, 'takeover'));
      if (allTakeover) {
        aiIndices = aiHand.map((_, i) => i);
      }
      resolve(aiIndices);
    });
  }

  const [playerMulliganIndices, enemyMulliganIndices] = await Promise.all([
    playerPromise,
    enemyPromise,
  ]);

  const processMulligan = (owner, indices) => {
    if (!indices || indices.length === 0) return;
    const hand = owner === 'blue' ? GameState.playerHand : GameState.enemyHand;
    const deck = owner === 'blue' ? GameState.playerDeck : GameState.enemyDeck;

    // 降順にソートして削除
    const sortedIndices = [...indices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      const card = hand.splice(idx, 1)[0];
      deck.push(card);
    }

    // デッキをシャッフル
    if (owner === 'blue') {
      GameState.playerDeck = shuffleArray(deck);
    } else {
      GameState.enemyDeck = shuffleArray(deck);
    }

    // 戻した枚数だけドロー
    for (let i = 0; i < indices.length; i++) {
      drawCard(owner);
    }
  };

  if (getIsHost()) {
    if (playerMulliganIndices && playerMulliganIndices.length > 0) {
      processMulligan('blue', playerMulliganIndices);
    }
    if (enemyMulliganIndices && enemyMulliganIndices.length > 0) {
      processMulligan('red', enemyMulliganIndices);
    }
  } else {
    // 乱数消費順序をホストと完全に一致させるため、クライアント側はホスト(red)から先に処理する
    if (enemyMulliganIndices && enemyMulliganIndices.length > 0) {
      processMulligan('red', enemyMulliganIndices);
    }
    if (playerMulliganIndices && playerMulliganIndices.length > 0) {
      processMulligan('blue', playerMulliganIndices);
    }
  }

  GameState.placementMessage = null;
  GameState.battlePhase = 'BATTLE';

  await sleep(AI_THINKING_DURATION); // マリガン終了後に少し間をあける

  await startTurn(GameState.firstPlayer);
}

export async function resolveOnPlaySkill(o, l, c) {
  // スキル実行中フラグを立てて、パワー0による即時破壊を防ぐ
  c.isSkillResolving = true;

  try {
    // 発動対象スキルのリストを作成
    let skillsToResolve = [];
    if (c.skill && c.skill !== 'none') {
      const skObj = { id: c.skill, value: c.skillValue };
      if (c.summonId) skObj.summonId = c.summonId;
      if (c.targetId) skObj.targetId = c.targetId;
      skillsToResolve.push(skObj);
    }
    if (Array.isArray(c.skills))
      skillsToResolve = skillsToResolve.concat(c.skills);

    // 召喚時に複数のスキルがある場合は、特定のスキル（quickやchoice等）を後回しにするなどして安全な順序で処理する
    skillsToResolve.sort((a, b) => {
      const order = { quick: 100, choice: 90 }; // 数値が大きいほど後回し
      const orderA = order[a.id] || 0;
      const orderB = order[b.id] || 0;
      return orderA - orderB;
    });

    for (const sk of skillsToResolve) {
      if (ACTIVE_SKILLS.includes(sk.id)) {
        await resolveActiveSkillEffect(o, l, c, sk.id, sk.value, sk);
      }
    }

    // バッジが消える前に一呼吸置く（プレイヤーが効果を確認できるようにするため）
    await sleep(PLACE_ANIMATION_DURATION);

    // 全ての召喚時スキルが完了したらフラグを立てる（ボード上でのバッジ非表示用）
    c.skillTriggered = true;
    renderBoard();

    // スキル解決によって破壊されたカード（自分自身含む）を除去
    await cleanupDestroyedCards();
  } finally {
    // 処理が完了したらフラグを解除する
    c.isSkillResolving = false;
  }
}

export async function executeSingleCombat(atk, l) {
  // quick スキル等での単発攻撃に対応するための簡易ラッパー
  const state = {
    playerBoard: GameState.playerBoard.map((c) =>
      c ? JSON.parse(JSON.stringify(c)) : null
    ),
    enemyBoard: GameState.enemyBoard.map((c) =>
      c ? JSON.parse(JSON.stringify(c)) : null
    ),
    playerHP: GameState.playerHP,
    enemyHP: GameState.enemyHP,
    playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
    enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
    playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
    enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard)),
  };

  // 特定のレーンだけ発火させるための個別処理
  const events = [];
  applySingleCombat(state, atk, l, events);

  // UI/演出の実行（イベントログ内で状態も同期更新される）
  await playEvents(events);
  await cleanupDestroyedCards();
  checkWinCondition();
}

export async function executeCombatPhase(atk) {
  // 盤面に攻撃可能なカードが1枚もなければ何もしない
  const b = atk === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  if (!b.some((x) => x !== null)) return;

  // --- ロジックの実行 (Engineの呼び出し) ---
  const currentState = {
    playerBoard: GameState.playerBoard.map((c) =>
      c ? JSON.parse(JSON.stringify(c)) : null
    ),
    enemyBoard: GameState.enemyBoard.map((c) =>
      c ? JSON.parse(JSON.stringify(c)) : null
    ),
    playerHP: GameState.playerHP,
    enemyHP: GameState.enemyHP,
    playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
    enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
    playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
    enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard)),
  };

  // Engineで全レーンの戦闘結果をシミュレートし、イベントログを受け取る
  const events = calculateCombatPhase(currentState, atk, []);

  // --- UI/演出の実行 (Rendererの呼び出し) ---
  // 蓄積されたイベントを順番に再生（攻撃モーション、ダメージポップアップ、破壊音など）
  // イベント再生中にGameStateも連動して更新される
  await playEvents(events);

  // 整合性を取るために最終的な盤面状態を描画
  renderBoard();

  // 戦闘フェーズ中に破壊されたカード（トークン含む）を一括クリーニング
  await cleanupDestroyedCards();

  // 勝敗判定
  checkWinCondition();
}

export function endBattle() {
  document.body.classList.remove('slow-motion');
  stopAllBGM();
  GameState.lastBattleResult =
    GameState.playerHP > 0
      ? GameState.enemyHP <= 0
        ? 'win'
        : 'draw'
      : GameState.enemyHP > 0
        ? 'lose'
        : 'draw';
  GameState.currentTurn = null;
  if (updateBattleUIHook) updateBattleUIHook();
  GameState.isProcessing = false; // バトル結果表示と同時にフラグをリセット

  if (GameState.gameMode === 'online') {
    setPlayerReadyOnly(false);
    if (getIsHost()) {
      clearActionQueueAndRegenerateSeed();
    }
  }

  // 全モード共通：実績用の勝利カウントアップ
  if (
    GameState.lastBattleResult === 'win' &&
    typeof incrementStat === 'function' &&
    GameState.gameMode !== 'practice' &&
    GameState.gameMode !== 'tutorial'
  ) {
    incrementStat('freeBattleWins');
  }

  setTimeout(() => {
    if (GameState.gameMode === 'battle_dungeon') {
      playSound(AUDIO_INSTANCES.bgmChallenge);
    } else if (GameState.gameMode === 'defense_attack') {
      playSound(AUDIO_INSTANCES.bgmDefense);
    } else if (GameState.gameMode === 'high_difficulty') {
      playSound(AUDIO_INSTANCES.bgmHighDifficulty);
    } else if (GameState.gameMode === 'tournament') {
      playSound(AUDIO_INSTANCES.bgmTournament1);
    } else if (GameState.gameMode === 'story') {
      const targetBgm =
        GameState.battleCount >= 4
          ? AUDIO_INSTANCES.bgmStory02
          : AUDIO_INSTANCES.bgmStory01;
      playSound(targetBgm);
    } else {
      playSound(AUDIO_INSTANCES.bgmTitle);
    }

    GameState.appState = 'post_dialogue'; // 全モード共通の設定

    // チュートリアルモードの場合は、ダイアログをスキップしてチュートリアル終了処理へ
    if (GameState.gameMode === 'tutorial') {
      handleTutorialEnd();
      return;
    }

    // 勝敗に応じたダイアログのセット (全モード共通)
    if (
      GameState.gameMode === 'story' &&
      GameState.lastBattleResult === 'win'
    ) {
      const playerId = GameState.playerConfig.id;
      const isShadow = GameState.enemyConfig.isShadow;
      const enemyId = isShadow ? 'shadow' : GameState.enemyConfig.id;
      const battleCount = GameState.battleCount;

      // 敗絶掛け合い4行の取得
      let postDialogs = [];
      const isLate = battleCount >= 5;
      if (STORY_DIALOGUES[playerId] && STORY_DIALOGUES[playerId][enemyId]) {
        const dialogueSource = isLate
          ? STORY_DIALOGUES[playerId][enemyId].late
          : STORY_DIALOGUES[playerId][enemyId].early;
        // ディープコピーして副作用を防止
        postDialogs = dialogueSource.post.map((line) => ({ ...line }));
      } else {
        postDialogs = getFallbackStoryDialogue(
          playerId,
          isShadow ? playerId : enemyId,
          false,
          isLate
        );
      }

      // 同行プレイヤーへの語り掛けと次のナレーション
      const playerTalk = PLAYER_TALKS[playerId]?.[battleCount] || [
        '周囲の安全を確保しました。',
        '前進を継続しましょう。',
      ];
      const postNarrationRaw = STORY_NARRATIONS[battleCount]?.post || [
        '強敵を打ち倒した一行は、さらなる深部を目指し歩みを進めるのだった。',
      ];
      const postNarrations = Array.isArray(postNarrationRaw)
        ? postNarrationRaw
        : [postNarrationRaw];

      let queue = [];
      queue = [...postDialogs];

      // 敗絶掛け合い（2人画面）の後に、中央表示切り替えのトランジション疑似ノードを挿入する
      queue.push({
        speaker: 'player',
        text: '',
        isTransition: true,
      });

      if (Array.isArray(playerTalk)) {
        playerTalk.forEach((text) => {
          queue.push({ speaker: 'player', text });
        });
      } else {
        queue.push({ speaker: 'player', text: playerTalk });
      }

      postNarrations.forEach((text) => {
        queue.push({ speaker: 'narrator', text });
      });

      GameState.dialogueQueue = queue;
    } else if (GameState.lastBattleResult === 'win') {
      GameState.dialogueQueue = [
        {
          speaker: 'enemy',
          text: getDialogue(
            GameState.enemyConfig,
            GameState.playerConfig,
            'lose',
            'enemy'
          ),
        },
        {
          speaker: 'player',
          text: getDialogue(
            GameState.playerConfig,
            GameState.enemyConfig,
            'win',
            'player'
          ),
        },
      ];
    } else {
      GameState.dialogueQueue = [
        {
          speaker: 'player',
          text: getDialogue(
            GameState.playerConfig,
            GameState.enemyConfig,
            'lose',
            'player'
          ),
        },
        {
          speaker: 'enemy',
          text: getDialogue(
            GameState.enemyConfig,
            GameState.playerConfig,
            'win',
            'enemy'
          ),
        },
      ];
    }

    if (GameState.gameMode === 'campaign') {
      GameState.dialogueQueue = GameState.dialogueQueue.filter(
        (d) => d.speaker !== 'player'
      );
    }

    // トーナメント：両キャラ表示中に司会者の実況コメントを追加
    if (GameState.gameMode === 'tournament' && GameState.tournament) {
      const currentRound = GameState.tournament.round;
      const playerWon = GameState.lastBattleResult === 'win';
      const announceLines = getTournamentPostBattleAnnounce(
        currentRound,
        playerWon,
        GameState.playerConfig,
        GameState.enemyConfig
      );
      GameState.dialogueQueue = [...GameState.dialogueQueue, ...announceLines];
    }

    if (GameState.gameMode === 'battle_dungeon') {
      const dialogueData = getDungeonCharacterDialogue(
        GameState.enemyConfig.id
      );
      let endText =
        GameState.lastBattleResult === 'win'
          ? dialogueData.dialogue?.lose?.default || ''
          : dialogueData.dialogue?.win?.default || '';

      GameState.dialogueQueue = [{ speaker: 'enemy', text: endText }];
      setupDialogueScreen();
      return;
    }

    if (GameState.gameMode === 'defense_attack') {
      if (GameState.lastBattleResult === 'win') {
        // ポイント計算（総ポイント基準）
        const myCurrentPoints =
          parseInt(localStorage.getItem('mini_card_battle_defense_points')) ||
          0;
        const myTotalPoints =
          parseInt(
            localStorage.getItem('mini_card_battle_defense_total_points')
          ) || myCurrentPoints;
        const enemyTotalPoints =
          GameState.enemyConfig.total_points ||
          GameState.enemyConfig.points ||
          0;

        let winPoints = 1;
        if (enemyTotalPoints > myTotalPoints) {
          if (enemyTotalPoints >= myTotalPoints * 2 && myTotalPoints > 0) {
            winPoints = 5;
          } else {
            winPoints = 3;
          }
        }

        // UI表示の整合性を優先する場合（もし敵設定に保持されていたらそちらを信頼）
        if (GameState.enemyConfig.calculatedWinPoints) {
          winPoints = GameState.enemyConfig.calculatedWinPoints;
        }

        const newCurrentPoints = myCurrentPoints + winPoints;
        const newTotalPoints = myTotalPoints + winPoints;

        // ローカルの保存
        localStorage.setItem(
          'mini_card_battle_defense_points',
          newCurrentPoints
        );
        localStorage.setItem(
          'mini_card_battle_defense_total_points',
          newTotalPoints
        );

        // サーバーへの送信
        const uuid = getOrCreateUUID();
        fetch('api/update_points.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uuid: uuid,
            points: newCurrentPoints,
            total_points: newTotalPoints,
          }),
        }).catch((err) => console.error('Failed to update points:', err));

        // 自身が攻撃して勝利した場合も実績「防衛戦勝利数」としてカウントする
        if (typeof incrementStat === 'function') {
          incrementStat('defenseAttackWins');
        }

        // ポイント獲得のアラートを出してから、会話へ進む
        playSound(SOUNDS.seSkill);
        showAlertModal(
          `防衛戦に勝利しました！\n防衛ポイントを ${winPoints} Pt 獲得しました！`,
          () => {
            setupDialogueScreen();
          }
        );
        return;
      } else if (GameState.lastBattleResult === 'lose') {
        // 負けた場合は敵に3ポイントと防衛回数を付与する
        const enemyUuid = GameState.enemyConfig.uuid;
        if (enemyUuid) {
          fetch('api/update_points.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uuid: enemyUuid,
              points: 3,
              total_points: 3, // 総ポイントも加算
              increment: true,
              defense_wins: 1,
            }),
          }).catch((err) =>
            console.error('Failed to update enemy points:', err)
          );
        }

        showDefenseBattleList();
      } else {
        showDefenseBattleList();
      }
      return;
    }

    // --- 防衛戦以外（フリー、ストーリー、高難易度など）の処理 ---
    if (
      GameState.lastBattleResult === 'win' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'practice' &&
      GameState.gameMode !== 'tournament'
    ) {
      // 実績の加算処理
      if (
        GameState.gameMode === 'story' &&
        GameState.enemyConfig &&
        typeof incrementStat === 'function'
      ) {
        if (GameState.enemyConfig.id === 'satan') {
          incrementStat('storyClears', GameState.playerConfig.id);
          if (
            typeof GameState.aiLevel !== 'undefined' &&
            GameState.aiLevel === 3
          ) {
            incrementStat('storyClearsHard', GameState.playerConfig.id);
          }
        } else if (GameState.enemyConfig.id === 'void') {
          // 【新規】虚空の騎士ゼノンをストーリーモードで撃破した記録を保存
          incrementStat('voidDefeated');
        } else if (GameState.enemyConfig.id === 'succubus') {
          // 【新規】隷属の女王ヴィオラをストーリーモードで撃破した記録を保存
          incrementStat('succubusDefeated');
        }
      }
      if (
        GameState.gameMode.startsWith('event_') &&
        GameState.gameMode.endsWith('_high') &&
        typeof incrementStat === 'function'
      ) {
        const charId = GameState.gameMode
          .replace('event_', '')
          .replace('_high', '');
        incrementStat('eventClear', `${charId}_high`);
      }

      // --- カードドロップ抽選・表示処理 ---
      if (GameState.gameMode === 'campaign') {
        let rewardCardId = null;
        if (GameState.campaignNode === '1-1') rewardCardId = 'skeleton';
        else if (GameState.campaignNode === '1-2') rewardCardId = 'shade';
        else if (GameState.campaignNode === '1-3') rewardCardId = 'warden';

        if (rewardCardId && window.showCardRewardReact) {
          window.showCardRewardReact(rewardCardId);
          return;
        }
      } else {
        let recipeId = GameState.enemyConfig.id;
        if (
          GameState.gameMode.startsWith('event_') &&
          GameState.gameMode.endsWith('_high')
        ) {
          const charId = GameState.gameMode
            .replace('event_', '')
            .replace('_high', '');
          if (recipeId === charId) recipeId = `${charId}_high`;
        }
        const diffKey =
          GameState.aiLevel === 1
            ? 'easy'
            : GameState.aiLevel === 3
              ? 'hard'
              : 'normal';

        let deckList = [];
        if (Array.isArray(ENEMY_DECKS[recipeId])) {
          deckList = ENEMY_DECKS[recipeId];
        } else if (ENEMY_DECKS[recipeId] && ENEMY_DECKS[recipeId][diffKey]) {
          deckList = ENEMY_DECKS[recipeId][diffKey];
        } else if (ENEMY_DECKS[recipeId] && ENEMY_DECKS[recipeId]['normal']) {
          deckList = ENEMY_DECKS[recipeId]['normal'];
        }

        let availableCards = [];
        if (deckList.length > 0) {
          const uniqueCards = [...new Set(deckList)];
          // 所持数が4枚未満（4枚以上持っていない）カードのみを抽出
          availableCards = uniqueCards.filter((cid) => {
            const count = GameState.playerInventory[cid] || 0;
            return count < 4;
          });

          if (availableCards.length > 0) {
            const rewardCardId =
              availableCards[
                Math.floor(getSeededRandom() * availableCards.length)
              ];
            if (window.showCardRewardReact) {
              window.showCardRewardReact(rewardCardId);
            }
            return; // 報酬画面が表示されたらここで一旦終了（OK押下後に setupDialogueScreen が呼ばれる）
          }
        }
      }
    }

    if (GameState.gameMode === 'practice') {
      GameState.appState = 'select_deck';
      if (typeof window.loadDeck === 'function') window.loadDeck();
      if (window.forceUpdateDeckList) window.forceUpdateDeckList();
      switchScreen('screen-deck-list');
      playSound(AUDIO_INSTANCES.bgmTitle);
      return;
    }

    if (GameState.gameMode === 'tournament') {
      if (GameState.lastBattleResult === 'win') {
        // トーナメント各ラウンド勝利の実績を記録
        const wonRound = GameState.tournament.round;
        incrementStat('eventClear', `tournament_round_${wonRound}`);
        simulateTournamentRound();
      } else {
        GameState.tournament.playerLost = true;
      }
      setupDialogueScreen();
      return;
    }

    // ドロップがない、全所持、または敗北/引き分けの場合
    setupDialogueScreen();
  }, 1500);
}

export function returnToTitle() {
  // チュートリアルモードの場合はチュートリアル選択画面に戻る
  if (GameState.gameMode === 'tutorial') {
    showConfirmModal('チュートリアルを中断しますか？', () => {
      stopAllBGM();
      cleanupTutorial();
      GameState.isBattleEnded = true;
      GameState.isProcessing = false;
      GameState.appState = 'title';
      switchScreen('screen-tutorial-select');
      playSound(AUDIO_INSTANCES.bgmTitle);
    });
    return;
  }
  showConfirmModal('バトルを諦めますか？', () => {
    dispatchBattleAction({ type: 'retire', owner: 'blue' });
  });
}

/**
 * @fileoverview バトルの勝敗判定や終了処理、それに伴う報酬付与・ダイアログ設定などを担当するモジュール。
 */

import { GameState } from '../../state/gameState.js';
import {
  closeSkillConfirm,
  triggerFinishVisuals,
  updateBattleUIHook,
} from '../../services/uiBattle.js';
import {
  dispatchBattleAction,
  setPendingChoiceResolver,
} from './battleQueue.js';
import { battleEvents } from './events/battleEventEmitter.js';
import {
  checkIsMissionEligible,
  getDialogue,
  getOrCreateUUID,
  getSeededRandom,
  playSound,
  resolvePlayerName,
  stopAllBGM,
  switchScreen,
} from '../../utils/gameUtils.js';
import {
  clearActionQueueAndRegenerateSeed,
  getIsHost,
  resetRoomStatusToWaiting,
} from '../../services/multiplayer.js';
import {
  checkFortuneAchievements,
  incrementStat,
} from '../../utils/constants/achievements.js';
import { AUDIO_INSTANCES, SOUNDS } from '../../utils/sounds.js';
import { cleanupVoiceBuffers } from '../../utils/constants/voices.js';
import { cleanupTutorial, handleTutorialEnd } from '../tutorialEngine.js';
import {
  PLAYER_TALKS,
  STORY_BGM_CHANGE_BATTLE,
  STORY_DIALOGUES,
  STORY_LATE_DIALOGUE_BATTLE,
  STORY_NARRATIONS,
  getFallbackStoryDialogue,
} from '../../utils/constants/storyDialogues.js';
import { getTournamentPostBattleAnnounce } from '../../utils/constants/eventTournamentDialogues.js';
import { getDungeonCharacterDialogue } from '../../utils/constants/battleDungeonCharacter.js';
import { setupDialogueScreen } from '../../services/uiDialogue.js';
import {
  recordDefenseBattleToServer,
  savePointsToServer,
} from '../../utils/apiUtils.js';
import {
  showAlertModal,
  showConfirmModal,
  showPointAcquisitionModal,
} from '../../services/uiModals.js';
import { showDefenseBattleList } from '../../services/uiMainCore.js';
import {
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
  DEFENSE_TARGETS_KEY,
  FORTUNE_POINTS_KEY,
  FORTUNE_TOTAL_POINTS_KEY,
  MAX_CARD_COPIES,
} from '../../utils/constants/config.js';
import {
  calculateFortuneRewards,
  loadFortuneClearedData,
  saveFortuneClearedData,
} from '../../utils/constants/fortuneRewards.js';
import { ENEMY_DECKS } from '../../utils/constants/enemy_decks.js';
import { simulateTournamentRound } from '../tournament.js';
import { toDeckObjects } from '../../utils/deckUtils.js';

/** フィニッシュ演出から endBattle 起動までの待機時間 (ms) */
const FINISH_VISUAL_DURATION_MS = 2000;

/** バトル終了から結果処理開始までの待機時間 (ms) */
const BATTLE_RESULT_DELAY_MS = 1500;

/** 防衛戦の獲得ポイント配点 */
const DEFENSE_WIN_POINTS = {
  /** 格下または同格の相手に勝利 */
  EQUAL_OR_LOWER: 1,
  /** 格上の相手に勝利 */
  HIGHER: 3,
  /** 総ポイントが2倍以上の相手に勝利 */
  FAR_HIGHER: 5,
};

/** 「格上」判定を強化する総ポイント倍率 */
const DEFENSE_FAR_HIGHER_RATIO = 2;

/** 防衛成功時に防衛側へ付与するポイント */
const DEFENSE_SUCCESS_POINTS = 3;

/**
 * プレイヤーおよび敵のHPを判定し、勝敗が決したかチェックする。
 * 勝敗確定時はバトル終了フラグを立て、フィニッシュ演出および endBattle を起動する。
 * @returns {boolean} 勝敗が確定した場合は true
 */
export function checkWinCondition() {
  if (GameState.isBattleEnded) return true;

  if (GameState.playerHP <= 0 || GameState.enemyHP <= 0) {
    GameState.isBattleEnded = true;
    triggerFinishVisuals();
    setTimeout(endBattle, FINISH_VISUAL_DURATION_MS);
    return true;
  }
  return false;
}

/**
 * リーダースキル確認モーダルから実行ボタンを押した時の処理
 * dispatchBattleAction（battleQueue.js）に依存するため、結果処理モジュールに配置する
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
 * イベントモード文字列（例: 'event_android_high'）からキャラクターID（例: 'android'）を抽出するヘルパー関数
 * @param {string} gameMode - ゲームモード文字列
 * @param {string} suffix - 接尾辞（例: '_high', '_fortune'）
 * @returns {string} キャラクターID
 */
function extractEventCharacterId(gameMode, suffix) {
  if (!gameMode || typeof gameMode !== 'string') return '';
  return gameMode.replace('event_', '').replace(suffix, '');
}

/**
 * バトル終了時のモードに応じた BGM 再生を行う
 */
function playPostBattleBGM() {
  if (GameState.gameMode === 'battle_dungeon') {
    playSound(AUDIO_INSTANCES.bgmChallenge);
  } else if (GameState.gameMode === 'defense_attack') {
    playSound(AUDIO_INSTANCES.bgmDefense);
  } else if (
    GameState.gameMode?.startsWith('event_') &&
    GameState.gameMode?.endsWith('_fortune')
  ) {
    playSound(AUDIO_INSTANCES.bgmFortune1);
  } else if (GameState.gameMode === 'high_difficulty') {
    playSound(AUDIO_INSTANCES.bgmHighDifficulty);
  } else if (GameState.gameMode === 'tournament') {
    playSound(AUDIO_INSTANCES.bgmTournament1);
  } else if (GameState.gameMode === 'story') {
    const targetBgm =
      GameState.battleCount >= STORY_BGM_CHANGE_BATTLE
        ? AUDIO_INSTANCES.bgmStory02
        : AUDIO_INSTANCES.bgmStory01;
    playSound(targetBgm);
  } else {
    playSound(AUDIO_INSTANCES.bgmTitle);
  }
}

/**
 * 勝敗やゲームモードに応じた会話ダイアログキューを構築する
 */
function buildResultDialogueQueue() {
  if (GameState.gameMode === 'story' && GameState.lastBattleResult === 'win') {
    const playerId = GameState.playerConfig.id;
    const isShadow = GameState.enemyConfig.isShadow;
    const enemyId = isShadow ? 'shadow' : GameState.enemyConfig.id;
    const battleCount = GameState.battleCount;

    let postDialogs = [];
    const isLate = battleCount >= STORY_LATE_DIALOGUE_BATTLE;
    const dialogueSource =
      STORY_DIALOGUES[playerId]?.[enemyId]?.[isLate ? 'late' : 'early'];
    if (dialogueSource?.post && Array.isArray(dialogueSource.post)) {
      postDialogs = dialogueSource.post.map((line) => ({ ...line }));
    } else {
      postDialogs = getFallbackStoryDialogue(
        playerId,
        isShadow ? playerId : enemyId,
        false,
        isLate
      );
    }

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

    let queue = [...postDialogs];

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
      if (text && typeof text === 'object') {
        queue.push(text);
      } else {
        queue.push({ speaker: 'narrator', text });
      }
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
  } else if (GameState.lastBattleResult === 'lose') {
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
  } else {
    GameState.dialogueQueue = [{ speaker: 'narrator', text: '引き分けです。' }];
  }

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
}

/**
 * 試練の宮殿（ダンジョン）モードの終了処理を実行する。
 * @returns {boolean} 処理を完結し、後続のドロップ抽選等をスキップする場合は true
 */
function resolveDungeonResult() {
  if (GameState.gameMode !== 'battle_dungeon') return false;

  if (GameState.lastBattleResult === 'draw') {
    cleanupBattleState();
    setupDialogueScreen();
    return true;
  }

  const opp = GameState.enemyConfig || {};
  const dialogueData = getDungeonCharacterDialogue(
    opp.id || opp.leaderCardId,
    opp
  );
  const dialogueObj = opp.dialogue || dialogueData?.dialogue || {};
  const endText =
    GameState.lastBattleResult === 'win'
      ? dialogueObj?.lose?.default ||
        dialogueData?.dialogue?.lose?.default ||
        ''
      : dialogueObj?.win?.default || dialogueData?.dialogue?.win?.default || '';

  GameState.dialogueQueue = endText
    ? [{ speaker: 'enemy', text: endText }]
    : [];
  cleanupBattleState();
  setupDialogueScreen();
  return true;
}

/**
 * 防衛戦モードの終了処理（ポイント計算・履歴送信・一覧画面遷移等）を実行する。
 * @returns {boolean} 処理を完結し、後続のドロップ抽選等をスキップする場合は true
 */
function resolveDefenseResult() {
  // 勝敗結果に関わらず消化した防衛ターゲット一覧のキャッシュを消去する
  localStorage.removeItem(DEFENSE_TARGETS_KEY);

  if (GameState.gameMode !== 'defense_attack') return false;

  // 対象の防衛者宛に防衛履歴（勝敗、攻撃者情報、攻撃デッキ）を送信
  const enemyUuid = GameState.enemyConfig?.uuid;
  if (enemyUuid) {
    const activeDeckIdx = GameState.currentDeckIndex || 0;
    const activeDeck = GameState.decks?.[activeDeckIdx] || GameState.decks?.[0];
    const attackerDeckObjects =
      Array.isArray(GameState.battleStartPlayerDeckObjects) &&
      GameState.battleStartPlayerDeckObjects.length > 0
        ? GameState.battleStartPlayerDeckObjects
        : toDeckObjects(
            activeDeck?.cards,
            activeDeck?.premiumCards || GameState.premiumCards
          );
    const attackerName = resolvePlayerName();
    const playerCharId = GameState.playerConfig?.id || 'android';
    const attackerCharacter = playerCharId;
    const attackerSkin =
      (GameState.playerSkins && GameState.playerSkins[playerCharId]) ||
      'default';
    const attackerTotalPoints =
      parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) || 0;

    recordDefenseBattleToServer(enemyUuid, {
      attackerUuid: getOrCreateUUID(),
      attackerName,
      attackerCharacter,
      attackerSkin,
      attackerTotalPoints,
      attackerDeck: attackerDeckObjects,
      result: GameState.lastBattleResult,
    }).catch((err) => console.error('Failed to record defense battle:', err));
  }

  if (GameState.lastBattleResult === 'win') {
    const myCurrentPoints =
      parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0;
    const myTotalPoints =
      parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) ||
      myCurrentPoints;
    const enemyTotalPoints =
      GameState.enemyConfig?.total_points || GameState.enemyConfig?.points || 0;

    let winPoints = DEFENSE_WIN_POINTS.EQUAL_OR_LOWER;
    if (enemyTotalPoints > myTotalPoints) {
      if (
        enemyTotalPoints >= myTotalPoints * DEFENSE_FAR_HIGHER_RATIO &&
        myTotalPoints > 0
      ) {
        winPoints = DEFENSE_WIN_POINTS.FAR_HIGHER;
      } else {
        winPoints = DEFENSE_WIN_POINTS.HIGHER;
      }
    }

    if (GameState.enemyConfig?.calculatedWinPoints) {
      winPoints = GameState.enemyConfig.calculatedWinPoints;
    }

    const newCurrentPoints = myCurrentPoints + winPoints;
    const newTotalPoints = myTotalPoints + winPoints;

    // ローカル保存
    localStorage.setItem(DEFENSE_POINTS_KEY, String(newCurrentPoints));
    localStorage.setItem(DEFENSE_TOTAL_POINTS_KEY, String(newTotalPoints));

    // サーバーへのポイント同期送信
    // ※サーバー送信失敗時もローカル数値を優先更新する。次回の syncModePoints 同期処理にて
    //   Math.max(local, server) により高い方のポイントが自動補正・同期される設計仕様。
    savePointsToServer(
      'update_defense_points.php',
      newCurrentPoints,
      newTotalPoints
    ).catch((err) =>
      console.error('防衛ポイントの同期送信に失敗しました:', err)
    );

    if (typeof incrementStat === 'function') {
      incrementStat('defenseAttackWins');
    }

    playSound(SOUNDS.seSkill);
    showAlertModal(
      `防衛戦に勝利しました！\n防衛ポイントを ${winPoints} Pt 獲得しました！`,
      () => {
        cleanupBattleState();
        setupDialogueScreen();
      }
    );
    return true;
  } else if (GameState.lastBattleResult === 'lose') {
    // 負けた場合は敵防衛者に3ポイントと防衛回数を付与する
    // ※防衛側プレイヤーへのポイント加算（非冪等）。通信失敗時はログ出力のみ（ゲーム仕様上、厳密な再送処理は不要）。
    if (enemyUuid) {
      savePointsToServer('update_defense_points.php', 0, 0, {
        uuid: enemyUuid,
        points: DEFENSE_SUCCESS_POINTS,
        total_points: DEFENSE_SUCCESS_POINTS,
        increment: true,
        defense_wins: 1,
      }).catch((err) => {
        console.error(
          '防衛側プレイヤーへのポイント加算送信に失敗しました:',
          err
        );
      });
    }

    cleanupBattleState();
    showDefenseBattleList();
    return true;
  } else {
    cleanupBattleState();
    showDefenseBattleList();
    return true;
  }
}

/**
 * 運命の邂逅（Fortune）イベントの報酬およびポイント計算・更新処理を実行する。
 * @returns {boolean} 処理を完結し、後続のドロップ抽選等をスキップする場合は true
 */
function resolveFortuneRewards() {
  if (!(
    GameState.lastBattleResult === 'win' &&
    GameState.gameMode?.startsWith('event_') &&
    GameState.gameMode?.endsWith('_fortune') &&
    GameState.fortuneHandicaps
  )) {
    return false;
  }

  const fortuneCharId = extractEventCharacterId(GameState.gameMode, '_fortune');

  const { clearedHandicaps, maxGradeLevel, maxTotalCost } =
    loadFortuneClearedData(fortuneCharId);

  const result = calculateFortuneRewards(
    fortuneCharId,
    GameState.fortuneHandicaps,
    clearedHandicaps,
    maxGradeLevel,
    maxTotalCost
  );

  let currentPts = parseInt(localStorage.getItem(FORTUNE_POINTS_KEY), 10) || 0;
  let totalPts =
    parseInt(localStorage.getItem(FORTUNE_TOTAL_POINTS_KEY), 10) || 0;
  if (result.totalEarned > 0) {
    currentPts += result.totalEarned;
    totalPts += result.totalEarned;
    localStorage.setItem(FORTUNE_POINTS_KEY, String(currentPts));
    localStorage.setItem(FORTUNE_TOTAL_POINTS_KEY, String(totalPts));
  }

  saveFortuneClearedData(
    fortuneCharId,
    result.newClearedHandicaps,
    result.newMaxGradeLevel,
    result.newMaxTotalCost
  );

  const fortuneSyncExtra = {
    fortune_max_grade: result.newMaxGradeLevel,
    fortune_cleared: JSON.stringify(result.newClearedHandicaps),
    fortune_max_total_cost: result.newMaxTotalCost,
  };
  if (fortuneCharId) {
    fortuneSyncExtra[`fortune_max_total_cost_${fortuneCharId}`] =
      result.newMaxTotalCost;
  }

  savePointsToServer(
    'update_fortune_points.php',
    currentPts,
    totalPts,
    fortuneSyncExtra
  ).catch((err) =>
    console.error('運命の邂逅ポイントの同期送信に失敗しました:', err)
  );

  checkFortuneAchievements();

  if (result.totalEarned > 0) {
    let breakdownText = '';
    result.breakdown.forEach((item) => {
      if (item.type === 'handicap') {
        breakdownText += `\n  ${item.name}: +${item.points}pt`;
      } else if (item.type === 'grade') {
        breakdownText += `\n  達成レベル ${item.label}: +${item.points}pt`;
      }
    });

    playSound(SOUNDS.seSkill);
    showPointAcquisitionModal({
      title: '特級目標達成',
      message: `特級目標ポイントを ${result.totalEarned} Pt 獲得しました！${breakdownText}`,
      points: result.totalEarned,
      totalPoints: totalPts,
      color: '#f97316',
      darkColor: '#ea580c',
      onClose: () => {
        cleanupBattleState();
        GameState.appState = 'post_dialogue';
        setupDialogueScreen();
      },
    });
    return true;
  } else {
    cleanupBattleState();
    GameState.appState = 'post_dialogue';
    setupDialogueScreen();
    return true;
  }
}

/**
 * バトル勝利時のカードドロップ抽選および報酬画面への遷移を実行する。
 * @returns {boolean} 報酬画面を表示した場合は true
 */
function resolveCardDrop() {
  if (!(
    GameState.lastBattleResult === 'win' &&
    GameState.gameMode !== 'online' &&
    GameState.gameMode !== 'practice' &&
    GameState.gameMode !== 'tournament'
  )) {
    return false;
  }

  let recipeId = GameState.enemyConfig?.id;
  if (GameState.gameMode?.startsWith('event_')) {
    if (GameState.gameMode?.endsWith('_high')) {
      const charId = extractEventCharacterId(GameState.gameMode, '_high');
      if (recipeId === charId) recipeId = `${charId}_high`;
    } else if (GameState.gameMode?.endsWith('_fortune')) {
      const charId = extractEventCharacterId(GameState.gameMode, '_fortune');
      if (recipeId === charId) recipeId = `${charId}_fortune`;
    }
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

  if (deckList.length === 0) return false;

  const uniqueCards = [
    ...new Set(
      deckList
        .map((item) => (typeof item === 'string' ? item : item && item.id))
        .filter(Boolean)
    ),
  ];

  const availableCards = uniqueCards.filter((cid) => {
    const count = GameState.playerInventory?.[cid] || 0;
    return count < MAX_CARD_COPIES;
  });

  if (availableCards.length === 0) return false;

  const rewardCount = 1;
  const baseCards = [];
  const tempInventory = { ...GameState.playerInventory };

  for (let i = 0; i < rewardCount; i++) {
    const currentAvailable = uniqueCards.filter((cid) => {
      const count = tempInventory[cid] || 0;
      return count < MAX_CARD_COPIES;
    });

    if (currentAvailable.length > 0) {
      const rewardCardId =
        currentAvailable[
          Math.floor(getSeededRandom() * currentAvailable.length)
        ];
      baseCards.push(rewardCardId);
      tempInventory[rewardCardId] = (tempInventory[rewardCardId] || 0) + 1;
    }
  }

  const isMissionEligible = checkIsMissionEligible(GameState.gameMode);

  if (
    isMissionEligible &&
    window.showMissionResultReact &&
    baseCards.length > 0
  ) {
    window.showMissionResultReact(baseCards, uniqueCards);
    return true;
  } else if (window.showCardRewardReact && baseCards.length > 0) {
    window.showCardRewardReact(baseCards);
    return true;
  }

  return false;
}

/**
 * バトル終了時の後処理（勝敗画面モーダル表示、報酬計算、解放フラグ更新、BGM切り替え等）を実行する。
 */
export function endBattle() {
  if (typeof window.setSlowMotionReact === 'function') {
    window.setSlowMotionReact(false);
  }
  stopAllBGM();

  const isPlayerAlive = GameState.playerHP > 0;
  const isEnemyAlive = GameState.enemyHP > 0;
  if (isPlayerAlive && !isEnemyAlive) {
    GameState.lastBattleResult = 'win';
  } else if (!isPlayerAlive && isEnemyAlive) {
    GameState.lastBattleResult = 'lose';
  } else {
    GameState.lastBattleResult = 'draw';
  }

  GameState.currentTurn = null;
  if (updateBattleUIHook) updateBattleUIHook();
  GameState.isProcessing = false;

  if (GameState.gameMode === 'online') {
    resetRoomStatusToWaiting().catch((e) =>
      console.warn('resetRoomStatusToWaiting failed:', e)
    );
    if (getIsHost()) {
      clearActionQueueAndRegenerateSeed();
    }
  }

  if (
    GameState.lastBattleResult === 'win' &&
    typeof incrementStat === 'function' &&
    GameState.gameMode !== 'practice' &&
    GameState.gameMode !== 'tutorial'
  ) {
    incrementStat('freeBattleWins');
  }

  setTimeout(() => {
    playPostBattleBGM();
    GameState.appState = 'post_dialogue';

    if (GameState.gameMode === 'tutorial') {
      cleanupBattleState();
      handleTutorialEnd();
      return;
    }

    buildResultDialogueQueue();

    // ※ 各resolve関数は内部で画面遷移直前またはモーダルのコールバック内で
    //    cleanupBattleState() を呼ぶため、ここでは呼ばない。
    //    resolveDefenseResult() は内部で battleStartPlayerDeckObjects を参照するため、
    //    cleanupBattleState() は必ず各resolve関数の実行「後」に呼ぶこと。
    if (resolveDungeonResult()) {
      return;
    }
    if (resolveDefenseResult()) {
      return;
    }

    if (
      GameState.lastBattleResult === 'win' &&
      GameState.gameMode !== 'online' &&
      GameState.gameMode !== 'practice' &&
      GameState.gameMode !== 'tournament'
    ) {
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
          incrementStat('voidDefeated');
        } else if (GameState.enemyConfig.id === 'succubus') {
          incrementStat('succubusDefeated');
        } else if (GameState.enemyConfig.id === 'warlock') {
          incrementStat('warlockDefeated');
        }
      }

      if (
        GameState.gameMode?.startsWith('event_') &&
        GameState.gameMode?.endsWith('_high') &&
        typeof incrementStat === 'function'
      ) {
        const charId = extractEventCharacterId(GameState.gameMode, '_high');
        incrementStat('eventClear', `${charId}_high`);
      }

      // resolveFortuneRewards: 内部のコールバックまたは同期パスでcleanupBattleState実行
      if (resolveFortuneRewards()) {
        return;
      }
      // resolveCardDrop: RewardOverlay閉じ時にcleanupBattleState実行
      if (resolveCardDrop()) {
        return;
      }
    }

    if (GameState.gameMode === 'practice') {
      GameState.appState = 'select_deck';
      cleanupBattleState();
      if (typeof window.loadDeck === 'function') window.loadDeck();
      if (window.forceUpdateDeckList) window.forceUpdateDeckList();
      switchScreen('screen-deck-list');
      playSound(AUDIO_INSTANCES.bgmTitle);
      return;
    }

    if (GameState.gameMode === 'tournament') {
      if (!GameState.tournament) {
        console.error('Tournament state is missing at endBattle.');
        cleanupBattleState();
        setupDialogueScreen();
        return;
      }
      if (GameState.lastBattleResult === 'win') {
        const wonRound = GameState.tournament.round;
        incrementStat('eventClear', `tournament_round_${wonRound}`);
        simulateTournamentRound();
      } else {
        GameState.tournament.playerLost = true;
      }
      cleanupBattleState();
      setupDialogueScreen();
      return;
    }

    cleanupBattleState();
    setupDialogueScreen();
  }, BATTLE_RESULT_DELAY_MS);
}

/**
 * 対戦終了時の包括的メモリクリーンアップを実行する。
 * 対戦中に蓄積されたカードオブジェクト配列、アクション履歴、一時ステート、
 * 選択待機リゾルバ、イベントリスナー、およびグローバルコールバックを完全に解放し、
 * iOS (WebKit) のメモリ肥大化および画面遷移後の誤動作を防止する。
 */
export function cleanupBattleState() {
  // 1. 対戦用カード・盤面オブジェクトの参照を解放
  GameState.playerDeck = [];
  GameState.enemyDeck = [];
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
  GameState.battleStartPlayerDeckObjects = null;
  GameState.aiDecision = null;

  // 2. モード系フラグおよび選択リゾルバのクリア
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

  // 3. グローバルコールバック・リゾルバ・イベントリスナーの解除
  setPendingChoiceResolver(null);
  battleEvents.clearAll();
  window.finishHandSelection = null;
  window.handlePlacementLaneClick = null;
  window.finishPlacement = null;
  window.handleEnemyLaneClick = null;
  window.finishEnemyTargetSelection = null;
  window.handleAlliedLaneClick = null;
  window.finishAlliedSelection = null;

  // 4. 長押しやタイマーのクリア
  if (GameState.longPressTimer) {
    clearTimeout(GameState.longPressTimer);
    GameState.longPressTimer = null;
  }

  // 5. デコード済みボイスバッファの完全解放（メニュー巡回中の生PCMメモリ常駐をゼロにする）
  cleanupVoiceBuffers();

  // ※ BGMバッファは sounds.js の LRUキャッシュ（MAX_CACHED_BGMS = 2）によって
  //    自動管理・維持されるため、ここでの明示的パージは行わない（再戦時の再デコード負荷を防止）。
}

/**
 * バトルのリタイア（諦める）またはチュートリアル中断を行い、タイトル画面・選択画面へ遷移する。
 */
export function returnToTitle() {
  // チュートリアルモードの場合はチュートリアル選択画面に戻る
  if (GameState.gameMode === 'tutorial') {
    showConfirmModal('チュートリアルを中断しますか？', () => {
      stopAllBGM();
      cleanupTutorial();
      cleanupBattleState();
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

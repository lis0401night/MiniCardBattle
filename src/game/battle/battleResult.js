/**
 * @fileoverview バトルの勝敗判定や終了処理、それに伴う報酬付与・ダイアログ設定などを担当するモジュール。
 */

import { GameState } from '../../state/gameState.js';
import {
  closeSkillConfirm,
  triggerFinishVisuals,
  updateBattleUIHook,
} from '../../services/uiBattle.js';
import { dispatchBattleAction } from './battleQueue.js';
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
  setPlayerReadyOnly,
} from '../../services/multiplayer.js';
import {
  checkFortuneAchievements,
  incrementStat,
} from '../../utils/constants/achievements.js';
import { AUDIO_INSTANCES, SOUNDS } from '../../utils/sounds.js';
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
} from '../../utils/constants/config.js';
import {
  calculateFortuneRewards,
  loadFortuneClearedData,
  saveFortuneClearedData,
} from '../../utils/constants/fortuneRewards.js';
import { ENEMY_DECKS } from '../../utils/constants/enemy_decks.js';
import { simulateTournamentRound } from '../tournament.js';

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
 * カード配列（文字列またはオブジェクト）を { id, isPremium } の配列に正規化する共通ヘルパー
 */
function toDeckObjects(cards, premiumCardsList = GameState.premiumCards) {
  if (!Array.isArray(cards)) return [];
  const list = premiumCardsList || [];
  return cards
    .map((c) => {
      const cId = typeof c === 'string' ? c : c?.baseId || c?.id;
      if (typeof cId !== 'string' || !cId) return null;
      const isPrem =
        typeof c === 'object' && c?.isPremium !== undefined
          ? !!c.isPremium
          : list.includes(cId);
      return { id: cId, isPremium: isPrem };
    })
    .filter(Boolean);
}

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
 * バトル終了時の後処理（勝敗画面モーダル表示、報酬計算、解放フラグ更新、BGM切り替え等）を実行する。
 */
export function endBattle() {
  if (typeof window.setSlowMotionReact === 'function') {
    window.setSlowMotionReact(false);
  }
  stopAllBGM();
  // プレイヤーと敵の生存状況から勝敗を確定する（相打ちは引き分け）
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
  GameState.isProcessing = false; // バトル結果表示と同時にフラグをリセット

  if (GameState.gameMode === 'online') {
    setPlayerReadyOnly(false);
    if (getIsHost()) {
      clearActionQueueAndRegenerateSeed();
    }
  }

  // 全モード共通：実績用の勝利カウントアップ
  // ※キー名は freeBattleWins ですが、実績システム上の仕様として「累計勝利数（練習・チュートリアル以外の全バトルモードの勝利）」を全般的にカウントします
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
      const isLate = battleCount >= STORY_LATE_DIALOGUE_BATTLE;
      const dialogueSource =
        STORY_DIALOGUES[playerId]?.[enemyId]?.[isLate ? 'late' : 'early'];
      if (dialogueSource?.post && Array.isArray(dialogueSource.post)) {
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
      // 引き分け（draw）時のナレーション設定
      GameState.dialogueQueue = [
        { speaker: 'narrator', text: '引き分けです。' },
      ];
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
      // 引き分け時は敵の勝利セリフで上書きせず、設定済みの引き分けダイアログ（「引き分けです。」）を表示する
      if (GameState.lastBattleResult === 'draw') {
        setupDialogueScreen();
        return;
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
          : dialogueObj?.win?.default ||
            dialogueData?.dialogue?.win?.default ||
            '';

      // セリフが未定義の場合は空の吹き出しを出さない
      GameState.dialogueQueue = endText
        ? [{ speaker: 'enemy', text: endText }]
        : [];
      setupDialogueScreen();
      return;
    }

    if (GameState.gameMode === 'defense_attack') {
      // 戦闘終了時に勝ち負けにかかわらず対戦相手5人の選出キャッシュをリセットし、次回訪問時に新しい相手が更新選出されるようにする
      localStorage.removeItem(DEFENSE_TARGETS_KEY);

      // 対象の防衛者宛に防衛履歴（勝敗、攻撃者情報、攻撃デッキ）を送信
      const enemyUuid = GameState.enemyConfig?.uuid;
      if (enemyUuid) {
        const activeDeckIdx = GameState.currentDeckIndex || 0;
        const activeDeck =
          GameState.decks?.[activeDeckIdx] || GameState.decks?.[0];
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
          parseInt(
            localStorage.getItem('mini_card_battle_defense_total_points'),
            10
          ) || 0;

        recordDefenseBattleToServer(enemyUuid, {
          attackerUuid: getOrCreateUUID(),
          attackerName,
          attackerCharacter,
          attackerSkin,
          attackerTotalPoints,
          attackerDeck: attackerDeckObjects,
          result: GameState.lastBattleResult,
        }).catch((err) =>
          console.error('Failed to record defense battle:', err)
        );
      }

      if (GameState.lastBattleResult === 'win') {
        // ポイント計算（総ポイント基準）
        const myCurrentPoints =
          parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0;
        const myTotalPoints =
          parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) ||
          myCurrentPoints;
        const enemyTotalPoints =
          GameState.enemyConfig.total_points ||
          GameState.enemyConfig.points ||
          0;

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

        // UI表示の整合性を優先する場合（もし敵設定に保持されていたらそちらを信頼）
        if (GameState.enemyConfig.calculatedWinPoints) {
          winPoints = GameState.enemyConfig.calculatedWinPoints;
        }

        const newCurrentPoints = myCurrentPoints + winPoints;
        const newTotalPoints = myTotalPoints + winPoints;

        // ローカルの保存
        localStorage.setItem(DEFENSE_POINTS_KEY, String(newCurrentPoints));
        localStorage.setItem(DEFENSE_TOTAL_POINTS_KEY, String(newTotalPoints));

        // サーバーへの送信
        savePointsToServer(
          'update_defense_points.php',
          newCurrentPoints,
          newTotalPoints
        );

        // 自身が攻撃して勝利した場合も実績「防衛戦勝利数」としてカウントする
        if (typeof incrementStat === 'function') {
          incrementStat('defenseAttackWins');
        }

        // 相手プレイヤーの全勝・全敗判定用の対戦結果を保存
        const defenseTargetsRaw = localStorage.getItem(DEFENSE_TARGETS_KEY);
        let defenseTargets = [];
        try {
          if (defenseTargetsRaw) defenseTargets = JSON.parse(defenseTargetsRaw);
        } catch (e) {
          console.warn('防衛ターゲットの読み込みに失敗しました:', e);
        }
        if (Array.isArray(defenseTargets)) {
          const targetItem = defenseTargets.find(
            (t) => t.uuid === GameState.enemyConfig?.uuid
          );
          if (targetItem) {
            targetItem.isWon = true;
            localStorage.setItem(
              DEFENSE_TARGETS_KEY,
              JSON.stringify(defenseTargets)
            );
          }
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
          try {
            savePointsToServer('update_defense_points.php', 0, 0, {
              uuid: enemyUuid,
              points: DEFENSE_SUCCESS_POINTS,
              total_points: DEFENSE_SUCCESS_POINTS, // 総ポイントも加算
              increment: true,
              defense_wins: 1,
            });
          } catch (err) {
            console.error(
              '防衛側プレイヤーへのポイント加算送信に失敗しました:',
              err
            );
          }
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
        } else if (GameState.enemyConfig.id === 'warlock') {
          // 【新規】闇の総帥バルタザールをストーリーモードで撃破した記録を保存
          incrementStat('warlockDefeated');
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

      /**
       * 運命の邂逅の進行値をサーバーへ同期するためのペイロードを組み立てる
       * @param {string} fortuneCharId - 対戦キャラクターID
       * @param {Object} result - calculateFortuneRewards の戻り値
       * @returns {Object} 同期用の追加パラメータ
       */
      const buildFortuneSyncExtra = (fortuneCharId, result) => {
        const extra = {
          fortune_max_grade: result.newMaxGradeLevel,
          fortune_cleared: JSON.stringify(result.newClearedHandicaps),
          fortune_max_total_cost: result.newMaxTotalCost,
        };
        if (fortuneCharId) {
          extra[`fortune_max_total_cost_${fortuneCharId}`] =
            result.newMaxTotalCost;
        }
        return extra;
      };

      // --- 運命の邂逅：特級目標ポイント付与処理 ---
      if (
        GameState.gameMode.startsWith('event_') &&
        GameState.gameMode.endsWith('_fortune') &&
        GameState.fortuneHandicaps
      ) {
        const fortuneCharId = GameState.gameMode
          .replace('event_', '')
          .replace('_fortune', '');

        // 達成済み情報を読み込み
        const { clearedHandicaps, maxGradeLevel, maxTotalCost } =
          loadFortuneClearedData(fortuneCharId);

        // ポイント計算
        const result = calculateFortuneRewards(
          fortuneCharId,
          GameState.fortuneHandicaps,
          clearedHandicaps,
          maxGradeLevel,
          maxTotalCost
        );

        // 現在のポイントを読み込み、獲得分があれば加算して保存
        let currentPts =
          parseInt(localStorage.getItem(FORTUNE_POINTS_KEY), 10) || 0;
        let totalPts =
          parseInt(localStorage.getItem(FORTUNE_TOTAL_POINTS_KEY), 10) || 0;
        if (result.totalEarned > 0) {
          currentPts += result.totalEarned;
          totalPts += result.totalEarned;
          localStorage.setItem(FORTUNE_POINTS_KEY, String(currentPts));
          localStorage.setItem(FORTUNE_TOTAL_POINTS_KEY, String(totalPts));
        }

        // 達成済み情報と最大等級をローカルストレージに保存（ポイント0でも更新）
        saveFortuneClearedData(
          fortuneCharId,
          result.newClearedHandicaps,
          result.newMaxGradeLevel,
          result.newMaxTotalCost
        );

        // サーバーへポイントと達成情報を同期（対戦キャラクターごとの合計目標値も送信）
        const fortuneSyncExtra = buildFortuneSyncExtra(fortuneCharId, result);
        savePointsToServer(
          'update_fortune_points.php',
          currentPts,
          totalPts,
          fortuneSyncExtra
        );

        // 達成情報更新に伴い実績チェックをトリガー
        checkFortuneAchievements();

        if (result.totalEarned > 0) {
          // ポイント内訳メッセージを構築
          let breakdownText = '';
          result.breakdown.forEach((item) => {
            if (item.type === 'handicap') {
              breakdownText += `\n  ${item.name}: +${item.points}pt`;
            } else if (item.type === 'grade') {
              breakdownText += `\n  達成レベル ${item.label}: +${item.points}pt`;
            }
          });

          // ポイント取得モーダルを表示
          playSound(SOUNDS.seSkill);
          showPointAcquisitionModal({
            title: '特級目標達成',
            message: `特級目標ポイントを ${result.totalEarned} Pt 獲得しました！${breakdownText}`,
            points: result.totalEarned,
            totalPoints: totalPts,
            color: '#f97316',
            darkColor: '#ea580c',
            onClose: () => {
              // 運命の邂逅イベントではカード報酬はドロップせず直接会話画面へ
              GameState.appState = 'post_dialogue';
              setupDialogueScreen();
            },
          });
          return;
        } else {
          // 運命の邂逅イベントではカード報酬はドロップせず直接会話画面へ
          GameState.appState = 'post_dialogue';
          setupDialogueScreen();
          return;
        }
      }

      // --- カードドロップ抽選・表示処理 ---
      let recipeId = GameState.enemyConfig.id;
      if (GameState.gameMode.startsWith('event_')) {
        if (GameState.gameMode.endsWith('_high')) {
          const charId = GameState.gameMode
            .replace('event_', '')
            .replace('_high', '');
          if (recipeId === charId) recipeId = `${charId}_high`;
        } else if (GameState.gameMode.endsWith('_fortune')) {
          const charId = GameState.gameMode
            .replace('event_', '')
            .replace('_fortune', '');
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

      let availableCards = [];
      if (deckList.length > 0) {
        const uniqueCards = [
          ...new Set(
            deckList
              .map((item) =>
                typeof item === 'string' ? item : item && item.id
              )
              .filter(Boolean)
          ),
        ];
        // 所持数が4枚未満（4枚以上持っていない）カードのみを抽出
        availableCards = uniqueCards.filter((cid) => {
          const count = GameState.playerInventory[cid] || 0;
          return count < 4;
        });

        if (availableCards.length > 0) {
          const rewardCount = 1; // ストーリーモードのデフォルト報酬+1キャンペーンは終了
          const baseCards = [];
          const tempInventory = { ...GameState.playerInventory };

          for (let i = 0; i < rewardCount; i++) {
            const currentAvailable = uniqueCards.filter((cid) => {
              const count = tempInventory[cid] || 0;
              return count < 4;
            });

            if (currentAvailable.length > 0) {
              const rewardCardId =
                currentAvailable[
                  Math.floor(getSeededRandom() * currentAvailable.length)
                ];
              baseCards.push(rewardCardId);
              tempInventory[rewardCardId] =
                (tempInventory[rewardCardId] || 0) + 1;
            }
          }

          // バトルボーナスは対象のモード（ストーリー・フリー対戦・高難易度イベント）でのみ機能する
          const isMissionEligible = checkIsMissionEligible(GameState.gameMode);

          if (
            isMissionEligible &&
            window.showMissionResultReact &&
            baseCards.length > 0
          ) {
            window.showMissionResultReact(baseCards, uniqueCards);
            return;
          } else if (window.showCardRewardReact && baseCards.length > 0) {
            window.showCardRewardReact(baseCards);
            return;
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
      // トーナメント状態が失われている場合は会話画面へ退避する
      if (!GameState.tournament) {
        console.error('Tournament state is missing at endBattle.');
        setupDialogueScreen();
        return;
      }
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
  }, BATTLE_RESULT_DELAY_MS);
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

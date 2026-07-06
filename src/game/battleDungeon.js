import { generateDungeonOpponentsList } from '../utils/constants/battleDungeon.js';
import { GameState } from '../state/gameState.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { showPointAcquisitionModal } from '../services/uiModals.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  showDungeonMenu,
  performFadeTransition,
} from '../services/uiMainCore.js';
import { startBattleFlow } from '../services/deck.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { setupDialogueScreen } from '../services/uiDialogue.js';
import { DEFAULT_DUNGEON_AI_LEVEL } from '../utils/constants/config.js';

/**
 * 敵のスキンを GameState.enemySkins に同期する
 * @param {string} enemyId - 敵のID
 * @param {string} skinName - スキン名
 */
function syncEnemySkin(enemyId, skinName) {
  if (!GameState.enemySkins) GameState.enemySkins = {};
  if (enemyId) {
    GameState.enemySkins[enemyId] = skinName || 'default';
  }
}

/**
 * 試練の宮殿（ダンジョン）用デッキを解決する共通ヘルパー
 * データ破損時や未定義時のフォールバックとしても機能する
 * @param {string} leaderCardId - リーダーカードID
 * @param {string|number} aiLevelOrDiff - 難易度キー（'normal', 'hard'など）またはAIレベル
 */
export function resolveDungeonDeck(leaderCardId, aiLevelOrDiff = 'normal') {
  const leaderId = leaderCardId || 'android';
  const rawDeck = ENEMY_DECKS[leaderId] || ENEMY_DECKS.android;
  if (Array.isArray(rawDeck)) {
    return [...rawDeck];
  }

  let diffKey = 'normal';
  if (typeof aiLevelOrDiff === 'number') {
    diffKey = aiLevelOrDiff >= DEFAULT_DUNGEON_AI_LEVEL ? 'hard' : 'normal';
  } else if (typeof aiLevelOrDiff === 'string') {
    diffKey = aiLevelOrDiff;
  }

  const resolved = rawDeck[diffKey] || rawDeck.normal || [];
  return [...resolved];
}

export function initBattleDungeon() {
  playSound(SOUNDS.seClick);
  GameState.gameMode = 'battle_dungeon';

  // 中断データがあるか確認
  if (localStorage.getItem('mini_card_battle_dungeon_save')) {
    GameState.dungeonState = 'resume_select';
  } else {
    GameState.dungeonWinStreak = 0;
    GameState.dungeonCards = [];
    GameState.dungeonOpponents = [];
    GameState.playerDeckSelection = null; // デッキ状態をリセットしレンタル構成を優先
    delete GameState.dungeonPlayerHP; // HPをリセット（MAXから開始）
    GameState.dungeonState = 'select_rental_deck';

    // 新規開始時はスキンとプレイマットIDを初期化
    GameState.playerSkins = {};
    GameState.selectedPlaymatId = null;
  }
  switchScreen('screen-battle-dungeon');
}

export function saveDungeonProgress() {
  const saveData = {
    winStreak: GameState.dungeonWinStreak,
    cards: GameState.dungeonCards,
    deck: (GameState.playerDeckSelection || []).map((c) => c.id), // デッキ構成を保存
    opponents: GameState.dungeonOpponents,
    playerConfig: GameState.playerConfig, // 動的リーダー全データ
    enemyConfig: GameState.enemyConfig, // 動的敵リーダー全データ
    dungeonState: GameState.dungeonState,
    playerHP:
      typeof GameState.dungeonPlayerHP !== 'undefined'
        ? GameState.dungeonPlayerHP
        : 20,
    playerSkins: GameState.playerSkins || {}, // スキン設定を保存
    selectedPlaymatId: GameState.selectedPlaymatId || null, // プレイマットIDを保存
    timestamp: Date.now(),
  };
  localStorage.setItem(
    'mini_card_battle_dungeon_save',
    JSON.stringify(saveData)
  );
}

export function loadDungeonProgress() {
  const json = localStorage.getItem('mini_card_battle_dungeon_save');
  if (!json) return false;

  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    // 【CodeRabbit指摘反映・データ損失防止】JSONパース自体が失敗（データ破損）した場合のみクリアを実行する
    console.error('Failed to parse dungeon save', e);
    clearDungeonSave();
    return false;
  }

  try {
    GameState.dungeonWinStreak = data.winStreak || 0;
    GameState.dungeonCards = data.cards || [];

    // 保存されていたデッキ構成を復元
    if (data.deck) {
      GameState.playerDeckSelection = data.deck
        .map((id) => {
          const template = CARD_MASTER.find((c) => c.id === id);
          return template ? { ...template } : null;
        })
        .filter(Boolean);
    }

    GameState.dungeonOpponents = data.opponents || [];

    // プレイヤーコンフィグを直接復元（無い場合は従来のleaderIdもしくはandroidでフォールバック）
    if (data.playerConfig) {
      GameState.playerConfig = data.playerConfig;
    } else if (data.leaderId) {
      GameState.playerConfig = CHARACTERS[data.leaderId] || CHARACTERS.android;
    } else {
      GameState.playerConfig = CHARACTERS.android;
    }

    if (data.enemyConfig) {
      GameState.enemyConfig = data.enemyConfig;
      if (
        !GameState.enemyConfig.dungeonDeck ||
        GameState.enemyConfig.dungeonDeck.length === 0
      ) {
        GameState.enemyConfig.dungeonDeck = resolveDungeonDeck(
          GameState.enemyConfig.leaderCardId,
          GameState.enemyConfig.fixedAiLevel || 3
        );
      }
      // 敵のスキンを同期
      syncEnemySkin(data.enemyConfig.id, data.enemyConfig.currentSkin);
    }

    GameState.dungeonState = data.dungeonState || 'select_opponent';
    if (data.playerHP !== undefined) GameState.dungeonPlayerHP = data.playerHP;
    GameState.gameMode = 'battle_dungeon';

    // スキンとプレイマットを復元
    GameState.playerSkins = data.playerSkins || {};
    GameState.selectedPlaymatId = data.selectedPlaymatId || null;

    // 再描画を促す
    if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
    return true;
  } catch (e) {
    // 【データ損失防止】パース成功後の復元ロジックや描画時（React側）の例外ではセーブデータを保護するため削除しない
    console.error('Failed to restore dungeon save', e);
    return false;
  }
}

export function clearDungeonSave() {
  localStorage.removeItem('mini_card_battle_dungeon_save');
}

export function selectRentalDeck(deckData) {
  playSound(SOUNDS.seSelect);
  // 初期デッキ付与（所持プール）
  GameState.dungeonCards = [...deckData.deck];
  // 初期デッキ選択状態（デッキ）をセット
  GameState.playerDeckSelection = [...deckData.deck]
    .map((id) => {
      const template = CARD_MASTER.find((c) => c.id === id);
      return template ? { ...template } : null;
    })
    .filter(Boolean);

  GameState.playerConfig = deckData.originalData;
  GameState.dungeonState = 'select_opponent';
  // 最初のリーダー確定タイミングで保存（非同期の対戦相手生成完了後）
  generateNextOpponents(() => {
    saveDungeonProgress();
  });

  if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
}

export function generateNextOpponents(callback) {
  GameState.dungeonOpponents = generateDungeonOpponentsList(
    GameState.dungeonWinStreak
  );
  if (callback) callback();
  if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
}

export function startDungeonBattle(enemyIndex) {
  playSound(SOUNDS.seClick);
  const enemy = GameState.dungeonOpponents[enemyIndex];
  if (!enemy) return;

  if (!enemy.dungeonDeck || enemy.dungeonDeck.length === 0) {
    enemy.dungeonDeck = resolveDungeonDeck(
      enemy.leaderCardId,
      enemy.fixedAiLevel || 3
    );
  }

  // 敵の設定を反映
  GameState.enemyConfig = enemy;
  GameState.aiLevel = enemy.fixedAiLevel || 3;
  GameState.dungeonState = 'battle';
  GameState.selectedStageId = 'dungeon';

  // 敵のスキンを同期
  syncEnemySkin(enemy.id, enemy.currentSkin);

  // ダンジョン敵の場合は専用デッキを設定
  if (enemy.dungeonDeck) {
    GameState.enemyDeckConfig = enemy.dungeonDeck;
  }

  // 会話シーンのセットアップへ
  GameState.appState = 'pre_dialogue';
  GameState.dialogueQueue = [
    { speaker: 'enemy', text: enemy.preBattleLine || '我が前に立ち塞がるか。' },
  ];
  setupDialogueScreen();
}

export function winDungeonBattle() {
  GameState.dungeonWinStreak += 1;
  if (GameState.dungeonWinStreak > GameState.dungeonMaxWinStreak) {
    GameState.dungeonMaxWinStreak = GameState.dungeonWinStreak;
    localStorage.setItem(
      'mini_card_battle_dungeon_max_streak',
      GameState.dungeonMaxWinStreak
    );
  }
  if (typeof window.incrementStat === 'function') {
    window.incrementStat(
      'maxDungeonFloor',
      null,
      GameState.dungeonWinStreak + 1
    );
  }
  GameState.dungeonState = 'reward';
  GameState.dungeonPlayerHP = GameState.playerHP; // 現在のHPを引き継ぐ

  // 勝利直後に保存（報酬選択前でも中断可能にするため）
  saveDungeonProgress();

  switchScreen('screen-battle-dungeon');
  if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
}

export function selectRewardCard(cardId) {
  playSound(SOUNDS.seGet);
  GameState.dungeonCards.push(cardId);
  GameState.dungeonState = 'select_opponent';
  generateNextOpponents(() => {
    // 報酬獲得後に保存
    saveDungeonProgress();
  });
}

export function loseDungeonBattle() {
  // 試練の宮殿にリトライ機能はないため、直ちにリタイア処理（ポイント精算）へ移行する
  retireDungeon();
}

export function calculateDungeonPoints(winStreak) {
  if (winStreak <= 0) return 0;

  const basePoints = Math.floor(winStreak / 10) * 10;
  const remainder = winStreak % 10;

  let remainderPoints = 0;
  if (remainder === 1 || remainder === 2) remainderPoints = 1;
  else if (remainder === 3 || remainder === 4) remainderPoints = 2;
  else if (remainder === 5) remainderPoints = 3;
  else if (remainder === 6 || remainder === 7) remainderPoints = 4;
  else if (remainder === 8 || remainder === 9) remainderPoints = 5;

  return basePoints + remainderPoints;
}

export function retireDungeon() {
  const currentStreak = GameState.dungeonWinStreak || 0;
  const earnedPoints = calculateDungeonPoints(currentStreak);

  GameState.dungeonCards = [];
  GameState.dungeonWinStreak = 0;
  GameState.dungeonOpponents = [];
  GameState.dungeonState = 'none';
  delete GameState.dungeonPlayerHP;
  GameState.gameMode = null; // ゲームモードをクリア

  // 中断データを削除
  clearDungeonSave();

  if (earnedPoints > 0) {
    let currentPts =
      parseInt(localStorage.getItem('mini_card_battle_challenge_points')) || 0;
    let totalPts =
      parseInt(
        localStorage.getItem('mini_card_battle_challenge_total_points')
      ) || 0;
    currentPts += earnedPoints;
    totalPts += earnedPoints;
    localStorage.setItem('mini_card_battle_challenge_points', currentPts);
    localStorage.setItem('mini_card_battle_challenge_total_points', totalPts);

    const maxStreak = GameState.dungeonMaxWinStreak || currentStreak;

    // サーバーへの同期処理を走らせる（keepalive: true により画面遷移しても裏で最後まで送信されます）
    savePointsToServer('update_challenge_points.php', currentPts, totalPts, {
      max_streak: maxStreak,
    });

    showPointAcquisitionModal({
      title: '試練終了',
      message: `ダンジョンの挑戦が終了しました。\n到達階層: ${currentStreak + 1}階（クリア: ${currentStreak}階）\n試練ポイントを ${earnedPoints} Pt 獲得しました！`,
      points: earnedPoints,
      totalPoints: totalPts,
      color: '#facc15',
      darkColor: '#eab308',
      onClose: () => {
        showDungeonMenu();
      },
    });
  } else {
    showDungeonMenu(); // ダンジョンメニューに戻る
  }
}

export function handleBattleDungeonProgression() {
  if (GameState.appState === 'pre_dialogue') {
    GameState.appState = 'select_player';
    startBattleFlow();
  } else if (GameState.appState === 'post_dialogue') {
    performFadeTransition(() => {
      GameState.appState = 'menu';
      if (GameState.lastBattleResult === 'win') {
        winDungeonBattle();
      } else {
        loseDungeonBattle();
      }
    });
  }
}

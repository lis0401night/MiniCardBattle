import { generateDungeonOpponentsList } from '../utils/constants/battleDungeon.js';
import { GameState } from './gameState.js';
import {
  playSound,
  switchScreen,
  getOrCreateUUID,
} from '../utils/gameUtils.js';
import { showPointAcquisitionModal } from './uiModals.js';
import { SOUNDS } from '../utils/sounds.js';
import { showDungeonMenu, performFadeTransition } from './uiMainCore.js';
import { startBattleFlow } from './deck.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { setupDialogueScreen } from './uiDialogue.js';

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
  try {
    const data = JSON.parse(json);
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
    }

    GameState.dungeonState = data.dungeonState || 'select_opponent';
    if (data.playerHP !== undefined) GameState.dungeonPlayerHP = data.playerHP;
    GameState.gameMode = 'battle_dungeon';

    // 再描画を促す
    if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
    return true;
  } catch (e) {
    console.error('Failed to load dungeon save', e);
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

  // 敵の設定を反映
  GameState.enemyConfig = enemy;
  GameState.aiLevel = enemy.fixedAiLevel || 3;
  GameState.dungeonState = 'battle';
  GameState.selectedStageId = 'dungeon';

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

    const uuid = getOrCreateUUID();
    const playerName =
      localStorage.getItem('mini_card_battle_player_name') || 'Player';
    const maxStreak = GameState.dungeonMaxWinStreak || currentStreak;
    fetch('api/update_challenge_points.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid: uuid,
        name: playerName,
        points: currentPts,
        total_points: totalPts,
        max_streak: maxStreak,
      }),
    }).catch((err) => console.error('Failed to save challenge points:', err));
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

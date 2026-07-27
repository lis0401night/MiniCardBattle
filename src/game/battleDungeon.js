import { loadDeck, startBattleFlow } from '../services/deck.js';
import { setupDialogueScreen } from '../services/uiDialogue.js';
import {
  performFadeTransition,
  showDungeonMenu,
} from '../services/uiMainCore.js';
import { showPointAcquisitionModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import {
  generateDungeonOpponentsList,
  hydrateDungeonOpponent,
  hydratePlayerConfig,
} from '../utils/constants/battleDungeon.js';
import { buildDungeonIntroDialogue } from '../utils/constants/dungeonIntroDialogues.js';
import { buildDungeonLeaderTalkDialogue } from '../utils/constants/dungeonTalkDialogues.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import {
  CHALLENGE_POINTS_KEY,
  CHALLENGE_TOTAL_POINTS_KEY,
  DEFAULT_DUNGEON_AI_LEVEL,
} from '../utils/constants/config.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

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

function syncDungeonDeckLeaderId(charId) {
  if (!charId) return;
  try {
    const json = localStorage.getItem('mini_card_battle_dungeon_deck_obj');
    if (json) {
      const obj = JSON.parse(json);
      if (obj && obj.leaderId !== charId) {
        obj.leaderId = charId;
        localStorage.setItem(
          'mini_card_battle_dungeon_deck_obj',
          JSON.stringify(obj)
        );
      }
    }
  } catch (e) {
    console.error('Failed to sync dungeon deck leaderId', e);
  }
}

export function saveDungeonProgress() {
  const pConf = GameState.playerConfig;
  const charId = pConf?.id || pConf?.leaderCardId || 'android';

  // 対戦相手候補のデータから、不要な定数テキスト（台詞、説明文、画像パス等）を除外した超軽量オブジェクトに変換
  const lightweightOpponents = (GameState.dungeonOpponents || [])
    .map((opp) => {
      if (!opp) return null;
      return {
        id: opp.id,
        leaderCardId: opp.leaderCardId || opp.id,
        fixedAiLevel: opp.fixedAiLevel,
        hp: opp.hp,
        stageId: opp.stageId,
        color: opp.color,
        currentSkin: opp.currentSkin,
        isDungeonEnemy: opp.isDungeonEnemy,
        dungeonDeck: opp.dungeonDeck,
      };
    })
    .filter(Boolean);

  // カードリーダー（モブ）の場合は最小限の表示パラメータのみ保存
  const savedPlayerConfig = pConf?.leaderCardId
    ? {
        id: pConf.id,
        leaderCardId: pConf.leaderCardId,
        name: pConf.name,
        rarity: pConf.rarity,
        icon: pConf.icon,
        image: pConf.image,
      }
    : undefined;

  const sanitizedSkins = {};
  if (CHARACTERS[charId] && GameState.playerSkins?.[charId]) {
    sanitizedSkins[charId] = GameState.playerSkins[charId];
  }

  const saveData = {
    winStreak: GameState.dungeonWinStreak,
    cards: GameState.dungeonCards,
    deck: (GameState.playerDeckSelection || []).map((c) => c.id), // デッキ構成を保存
    charId: charId, // キャラクターIDを軽量保存
    playerConfig: savedPlayerConfig,
    opponents: lightweightOpponents,
    dungeonState: GameState.dungeonState,
    playerHP:
      typeof GameState.dungeonPlayerHP !== 'undefined'
        ? GameState.dungeonPlayerHP
        : 20,
    playerSkins: sanitizedSkins, // クリーンなスキン設定を保存
    selectedPlaymatId: GameState.selectedPlaymatId || null, // プレイマットIDを保存
    timestamp: Date.now(),
  };
  localStorage.setItem(
    'mini_card_battle_dungeon_save',
    JSON.stringify(saveData)
  );

  // 一時デッキキャッシュ (mini_card_battle_dungeon_deck_obj) の leaderId も同期
  syncDungeonDeckLeaderId(charId);
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

    // マスタデータ（CARD_MASTER / CHARACTERS）から対戦相手情報を動的復元
    GameState.dungeonOpponents = (data.opponents || [])
      .map(hydrateDungeonOpponent)
      .filter(Boolean);

    // スキンとプレイマットを先に復元（キャラクター画像の適用に使用）
    GameState.playerSkins = data.playerSkins || {};
    GameState.selectedPlaymatId = data.selectedPlaymatId || null;

    // プレイヤーコンフィグの動的復元（キャラリーダー / カードリーダー問わず完璧に対応）
    const playerCharId =
      data.charId || data.playerConfig?.id || data.leaderId || 'android';
    GameState.playerConfig = hydratePlayerConfig(
      playerCharId,
      data.playerConfig,
      GameState.playerSkins
    );

    // デッキキャッシュの leaderId を同期
    syncDungeonDeckLeaderId(playerCharId);

    if (data.enemyConfig) {
      GameState.enemyConfig = data.enemyConfig;
      if (
        !GameState.enemyConfig.dungeonDeck ||
        GameState.enemyConfig.dungeonDeck.length === 0
      ) {
        GameState.enemyConfig.dungeonDeck = resolveDungeonDeck(
          GameState.enemyConfig.leaderCardId,
          GameState.enemyConfig.fixedAiLevel || DEFAULT_DUNGEON_AI_LEVEL
        );
      }
      // 敵のスキンを同期
      syncEnemySkin(data.enemyConfig.id, data.enemyConfig.currentSkin);
    }

    // 再開時は「battle」等の途中状態であっても安全に対戦相手選択画面へ復帰させる
    const restoredState = data.dungeonState || 'select_opponent';
    GameState.dungeonState =
      restoredState === 'battle' ? 'select_opponent' : restoredState;
    if (data.playerHP !== undefined) GameState.dungeonPlayerHP = data.playerHP;
    GameState.gameMode = 'battle_dungeon';

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

  // 対戦相手候補を生成
  generateNextOpponents();

  // 会話キューの組み立て（選んだリーダーのイラストを中央表示 → ナレーション → セリフ）
  GameState.dialogueQueue = buildDungeonIntroDialogue(deckData);
  GameState.currentDialogueIndex = 0;
  GameState.appState = 'dungeon_intro_dialogue';
  GameState.dungeonState = 'select_opponent';

  // 会話中にリロード・離脱してもデッキや対戦相手が失われないよう即座にセーブ
  saveDungeonProgress();

  performFadeTransition(() => {
    setupDialogueScreen();
  });
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
  const rawEnemy = GameState.dungeonOpponents[enemyIndex];
  if (!rawEnemy) return;

  const enemy = hydrateDungeonOpponent(rawEnemy) || rawEnemy;

  if (!enemy.dungeonDeck || enemy.dungeonDeck.length === 0) {
    enemy.dungeonDeck = resolveDungeonDeck(
      enemy.leaderCardId,
      enemy.fixedAiLevel || DEFAULT_DUNGEON_AI_LEVEL
    );
  }

  // 敵の設定を反映
  GameState.enemyConfig = enemy;
  GameState.aiLevel = enemy.fixedAiLevel || DEFAULT_DUNGEON_AI_LEVEL;
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

  // 50階ごとの高難易度ボス撃破ボーナス (+10pt/回)
  const highBossBonus = Math.floor(winStreak / 50) * 10;

  return basePoints + remainderPoints + highBossBonus;
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

  // モード終了に伴い、通常デッキをリロードして GameState.decks を正常状態に復元する
  loadDeck();

  if (earnedPoints > 0) {
    let currentPts = parseInt(localStorage.getItem(CHALLENGE_POINTS_KEY)) || 0;
    let totalPts =
      parseInt(localStorage.getItem(CHALLENGE_TOTAL_POINTS_KEY)) || 0;
    currentPts += earnedPoints;
    totalPts += earnedPoints;
    localStorage.setItem(CHALLENGE_POINTS_KEY, currentPts);
    localStorage.setItem(CHALLENGE_TOTAL_POINTS_KEY, totalPts);

    const maxStreak = Math.max(
      GameState.dungeonMaxWinStreak || 0,
      currentStreak
    );

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

export function startDungeonLeaderTalk() {
  playSound(SOUNDS.seClick);
  const floor = (GameState.dungeonWinStreak || 0) + 1;

  // コンテキスト情報を収集して会話生成関数に渡す
  const context = {
    floor,
    hp: GameState.dungeonPlayerHP ?? 20,
    deckSize: (GameState.dungeonCards || []).length,
  };

  GameState.dialogueQueue = buildDungeonLeaderTalkDialogue(
    context,
    GameState.playerConfig
  );
  GameState.currentDialogueIndex = 0;
  GameState.appState = 'dungeon_talk_dialogue';

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

export function handleBattleDungeonProgression() {
  if (
    GameState.appState === 'dungeon_intro_dialogue' ||
    GameState.appState === 'dungeon_talk_dialogue'
  ) {
    GameState.dungeonState = 'select_opponent';
    saveDungeonProgress();
    performFadeTransition(() => {
      switchScreen('screen-battle-dungeon');
      if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
    });
  } else if (GameState.appState === 'pre_dialogue') {
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

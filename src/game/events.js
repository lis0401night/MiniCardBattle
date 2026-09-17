import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { EVENT_DIALOGUES } from '../utils/constants/eventDialogues.js';
import { EVENT_FORTUNE_DIALOGUES } from '../utils/constants/eventFortuneDialogues.js';
import { switchScreen } from '../utils/gameUtils.js';
import { asyncGet } from '../utils/fetch.js';
import { startBattleFlow, migrateCardId } from '../services/deck.js';
import { GameState } from '../state/gameState.js';
import {
  setupDialogueScreen,
  showContinueScreen,
} from '../services/uiDialogue.js';
import { performFadeTransition } from '../services/uiMainCore.js';

/**
 * 汎用：高難易度イベントの初期化（サタン含む全高難易度キャラ共通）
 */
export function initHighDifficultyEventMode(playerCharId, enemyCharId) {
  const eventConfig = CHARACTERS[enemyCharId]?.event_high;
  if (!eventConfig) {
    console.error('High difficulty event config not found for', enemyCharId);
    return;
  }

  GameState.playerConfig = { ...CHARACTERS[playerCharId] };
  GameState.enemyConfig = {
    ...CHARACTERS[enemyCharId],
    hp: eventConfig.maxHP,
    name: eventConfig.name,
    leaderSkill: eventConfig.leaderSkill,
  };

  const modeKey = `event_${enemyCharId}_high`;
  GameState.gameMode = modeKey;
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = enemyCharId; // ステージはボスのホーム

  // startGameMode で enemySkins は既にリセット済み
  GameState.enemySkins[enemyCharId] = `${enemyCharId}_high`;

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      `${enemyCharId}_high`,
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      `${enemyCharId}_high`,
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      `${enemyCharId}_high`,
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES[modeKey]?.[playerCharId] ||
    EVENT_DIALOGUES[modeKey]?.['default'] ||
    [];

  if (dialogues.length >= 3) {
    GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];
  }

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * 汎用：運命の邂逅イベントの初期化
 */
export function initFortuneEventMode(playerCharId, enemyCharId) {
  const eventConfig = CHARACTERS[enemyCharId]?.event_fortune;
  if (!eventConfig) {
    console.error('Fortune event config not found for', enemyCharId);
    return;
  }

  GameState.playerConfig = { ...CHARACTERS[playerCharId] };
  GameState.enemyConfig = {
    ...CHARACTERS[enemyCharId],
    hp: CHARACTERS[enemyCharId].hp || 20,
    name: eventConfig.name,
    leaderSkill: eventConfig.leaderSkill ?? CHARACTERS[enemyCharId].leaderSkill,
  };

  const modeKey = `event_${enemyCharId}_fortune`;
  GameState.gameMode = modeKey;
  GameState.battleCount = 7;
  GameState.selectedStageId = CHARACTERS[enemyCharId].stageId || enemyCharId;

  GameState.enemySkins[enemyCharId] = 'default';

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_FORTUNE_DIALOGUES[modeKey]?.[playerCharId] ||
    EVENT_FORTUNE_DIALOGUES[modeKey]?.['default'] ||
    [];

  if (dialogues.length >= 3) {
    GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];
  } else {
    GameState.dialogueQueue = dialogues;
  }

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * イベントモード進行管理
 */
export function handleEventProgression() {
  if (GameState.appState === 'story_intro') {
    GameState.appState = 'pre_dialogue';

    if (GameState.gameMode.startsWith('event_')) {
      performFadeTransition(() => {
        setupEventConfrontation();
      });
    }
  } else if (GameState.appState === 'pre_dialogue') {
    // 導入ダイアログ(対峙)後はデッキ編成へ
    performFadeTransition(() => {
      startBattleFlow();
    });
  } else if (GameState.appState === 'post_dialogue') {
    if (GameState.lastBattleResult === 'lose') {
      // 敗北時はコンテニュー画面へ
      showContinueScreen();
    } else {
      // 勝利時の処理：運命の邂逅時は fortune-menu、高難易度は high-difficulty-menu へ戻る
      let targetScreen = 'screen-event-menu';
      if (GameState.gameMode?.endsWith('_fortune')) {
        targetScreen = 'screen-fortune-menu';
      } else if (GameState.gameMode?.endsWith('_high')) {
        targetScreen = 'screen-high-difficulty-menu';
      }

      performFadeTransition(() => {
        switchScreen(targetScreen);
      });
    }
  }
}

/**
 * すべてのイベント共通の対峙ダイアログ（コンテニュー時などにも使用）を設定
 */
export function setupEventConfrontation() {
  GameState.appState = 'pre_dialogue';
  const charId = GameState.playerConfig.id;
  const isFortune = GameState.gameMode?.endsWith('_fortune');
  const dialoguesSource = isFortune ? EVENT_FORTUNE_DIALOGUES : EVENT_DIALOGUES;
  const modeDialogues = dialoguesSource[GameState.gameMode] || {};
  const dialogs = modeDialogues[charId] || modeDialogues['default'] || [];

  let confrontationLines = [];
  // 3:対峙描写, 4:敵ボス台詞
  if (dialogs[3]) confrontationLines.push({ ...dialogs[3] });
  if (dialogs[4]) confrontationLines.push({ ...dialogs[4] });

  // 5:プレイヤーの返し台詞
  // ミラーマッチ等で [5] に専用台詞が手動設定されている場合はそれを使う。
  // 無い場合でも、キャラクターの preBattleLine があれば動的にそれを第三の台詞として表示する。
  if (dialogs[5]) {
    confrontationLines.push({ ...dialogs[5] });
  } else if (GameState.playerConfig.preBattleLine) {
    confrontationLines.push({
      speaker: 'player',
      text: GameState.playerConfig.preBattleLine,
    });
  }

  GameState.dialogueQueue = confrontationLines;
  setupDialogueScreen();
}

/**
 * 他プレイヤーのデッキデータを取得・解決します。
 * 高速な JSON 形式（api/decks/players/{uuid}.json）を優先取得し、
 * 未移行の場合は旧 JS 形式（api/decks/players/{uuid}.js）へのフォールバックを行います。
 *
 * @param {string} uuid - 読み込み対象プレイヤーのUUID
 * @returns {Promise<{ id: string, name: string, character: string, deck: Array<any> }>} 敵デッキ定義データ
 */
export async function loadPlayerDeck(uuid) {
  let data = null;

  // 1. JSON 形式の直接取得（優先・高速パース）
  try {
    const jsonData = await asyncGet(`decks/players/${uuid}.json`, {
      t: Date.now(),
    });
    if (jsonData && typeof jsonData === 'object') {
      data = jsonData;
    }
  } catch {
    // 未移行や取得失敗時は旧JS形式へフォールバック
  }

  // 2. 旧 JS 形式のフォールバック読み込み
  if (!data) {
    data = await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `api/decks/players/${uuid}.js?t=${Date.now()}`;
      script.onload = () => {
        if (
          typeof window.PLAYER_DECKS !== 'undefined' &&
          window.PLAYER_DECKS[uuid]
        ) {
          const loadedData = window.PLAYER_DECKS[uuid];
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(loadedData);
        } else {
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error('Player deck data not found in script'));
        }
      };
      script.onerror = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('Failed to load player deck script'));
      };
      document.body.appendChild(script);
    });
  }

  if (!data) {
    throw new Error('Player data could not be loaded');
  }

  // データを安全にマイグレーション
  const migratedDeck = Array.isArray(data.deck)
    ? data.deck.map((item) => migrateCardId(item))
    : [];

  // 敵デッキデータとして整形
  const enemyDeckData = {
    id: 'player_defense',
    name: data.name,
    character: data.character,
    deck: migratedDeck,
  };
  // ENEMY_DECKSに一時的に登録
  ENEMY_DECKS['player_defense'] = migratedDeck;

  return enemyDeckData;
}

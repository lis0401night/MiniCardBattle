import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { EVENT_DIALOGUES } from '../utils/constants/eventDialogues.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import {
  switchScreen,
  getOrCreateUUID,
} from '../utils/gameUtils.js';
import { startBattleFlow } from './deck.js';
import { GameState } from './gameState.js';
import { setupDialogueScreen, showContinueScreen } from './uiDialogue.js';
import { performFadeTransition } from './uiMainCore.js';
import { showAlertModal } from './uiModals.js';

/**
 * Mini Card Battle - イベントモード管理 (events.js)
 */

export function initEventAndroidHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['android'],
    hp: 40,
    name: 'フルアーマー アイギス',
    leaderSkill: {
      name: '一斉射撃',
      desc: '(SP:4) 敵の場のすべてのカードに4ダメージ、敵リーダーに2ダメージを与える。',
      cost: 4,
      action: 'android_high_volley',
    },
  };
  GameState.gameMode = 'event_android_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'android';

  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['android'] = 'android_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      'android_high',
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      'android_high',
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      'android_high',
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_android_high[charId] ||
    EVENT_DIALOGUES.event_android_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * 高難易度イベント：熱砂の客人 イグニス の初期化
 * ストーリー：砂漠の宴に招待された主人公が、退屈していた竜姫イグニスに戦いを申し込まれる
 */
export function initEventDragonHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['dragon'],
    hp: 40,
    name: '熱砂の客人 イグニス',
    leaderSkill: {
      name: '焦熱のプレリュード',
      desc: '(SP:4) 場のすべてのカードに2ダメージ、自分のレーンに「イグニス(P:7/伝説)」を1体配置する。',
      cost: 4,
      action: 'dragon_high_ritual',
    },
  };
  GameState.gameMode = 'event_dragon_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'dragon'; // 竜の領域ステージ固定

  // イグニスに「熱砂の客人」スキンを適用
  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['dragon'] = 'dragon_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      'dragon_high',
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      'dragon_high',
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      'dragon_high',
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_dragon_high[charId] ||
    EVENT_DIALOGUES.event_dragon_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * 高難易度イベント：暗黒騎士 セレスティア の初期化
 */
export function initEventKnightHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['knight'],
    hp: 40,
    name: '暗黒騎士 セレスティア',
    leaderSkill: {
      name: '暗黒の軍勢',
      desc: '(SP:3) 自分のレーンに「騎士(P:2/必殺/守護)」を最大2体召喚し、自分の場のすべてのカードのパワーを+2する。',
      cost: 3,
      action: 'evil_march',
    },
  };
  GameState.gameMode = 'event_knight_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'knight'; // 騎士の領域固定

  // セレスティアに「暗黒騎士 セレスティア」スキンを適用
  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['knight'] = 'knight_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      'knight_high',
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      'knight_high',
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      'knight_high',
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_knight_high[charId] ||
    EVENT_DIALOGUES.event_knight_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * 高難易度イベント：魔界の征服者 ナイア の初期化
 */
export function initEventCthulhuHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['cthulhu'],
    hp: 40,
    name: '魔界の征服者 ナイア',
    leaderSkill: {
      name: '異界の扉',
      desc: '(SP:3) 手札からカードを最大2枚捨てて同数引き、手札すべてのパワーを+2する。相手の手札からランダムに2枚を捨て、同数「虚空(パワー1)」を加える。',
      cost: 3,
      action: 'otherworld_gate',
    },
  };
  GameState.gameMode = 'event_cthulhu_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'cthulhu';

  // ナイアに「魔界の征服者 ナイア」スキンを適用
  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['cthulhu'] = 'cthulhu_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      'cthulhu_high',
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      'cthulhu_high',
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      'cthulhu_high',
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_cthulhu_high[charId] ||
    EVENT_DIALOGUES.event_cthulhu_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

export function initEventElfHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['elf'],
    hp: 40,
    name: 'リナ&ヴォイテク',
    leaderSkill: {
      name: '連携攻撃',
      desc: '(SP:2) 相手の場のカード1枚を選び、破壊し、自分のレーンに「ヴォイテク(P:4/伝説/貫通)」を1体配置する。',
      cost: 2,
      action: 'elf_polarbear_combo',
    },
  };
  GameState.gameMode = 'event_elf_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'elf'; // ロストレイルの森

  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['elf'] = 'elf_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      GameState.enemySkins['elf'],
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      GameState.enemySkins['elf'],
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      GameState.enemySkins['elf'],
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_elf_high[charId] ||
    EVENT_DIALOGUES.event_elf_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * 高難易度イベント：断罪の執行者 エリシア の初期化
 */
export function initEventClericHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['cleric'],
    hp: 40,
    name: '断罪の執行者 エリシア',
    leaderSkill: {
      name: 'ギロチンクロス',
      desc: '(SP:3) 相手リーダーに5ダメージを与え、自身のHPを5回復する。',
      cost: 3,
      action: 'condemnation',
    },
  };
  GameState.gameMode = 'event_cleric_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'cleric';

  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['cleric'] = 'cleric_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      'cleric_high',
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      'cleric_high',
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      'cleric_high',
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_cleric_high[charId] ||
    EVENT_DIALOGUES.event_cleric_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * 高難易度イベント：レーサー マリア の初期化
 * ストーリー：廃都オールドヘイヴンで開催された無法者の賞金レース。
 * プレイヤーキャラはそれぞれの手段でレースに参加し、同じ参加者のマリアと一位をかけて対決する。
 * マリア本人は自身の幻影と戦う。
 */
export function initEventDevilhunterHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['devilhunter'],
    hp: 40,
    name: 'ゴーストライダー マリア',
    // 【オーバードライブ】自分の墓地と相手の墓地それぞれからカードを1枚選び配置する
    leaderSkill: {
      name: 'オーバードライブ',
      desc: '(SP:3) 自分の墓地からカードを1枚選び、自分のレーンに配置する。相手の墓地からカードを1枚選び、自分のレーンに配置する。',
      cost: 3,
      action: 'overdrive',
    },
  };
  GameState.gameMode = 'event_devilhunter_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'devilhunter'; // 廃都レーストラック

  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['devilhunter'] = 'devilhunter_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      'devilhunter_high',
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      'devilhunter_high',
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      'devilhunter_high',
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_devilhunter_high[charId] ||
    EVENT_DIALOGUES.event_devilhunter_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * 高難易度イベント：時空の探索者 クロエ の初期化
 * ストーリー：未来からやってきた大人のクロエが、先輩の顔を見に来て、
 * 隣にいるのが自分でないことが気に食わないと戦いを仕掛けてくる。
 */
export function initEventWitchHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['witch'],
    hp: 40,
    name: '時空の探索者 クロエ',
    leaderSkill: {
      name: '世界の再構築',
      desc: '(SP:3) お互いの手札を全て捨て、墓地をリセットする。その後、自分は4枚、相手は3枚引く。追加のターンを1回行う。\n(ただし、追加ターン中はSPは溜まらず攻撃もできない)',
      cost: 3,
      action: 'world_reconstruct',
    },
  };
  GameState.gameMode = 'event_witch_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'witch'; // 時計塔ステージ

  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['witch'] = 'witch_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      'witch_high',
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      'witch_high',
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      'witch_high',
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_witch_high[charId] ||
    EVENT_DIALOGUES.event_witch_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

/**
 * 高難易度イベント：紅月ノ狂鬼 カグラ の初期化
 */
export function initEventOniHighMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = {
    ...CHARACTERS['oni'],
    hp: 40,
    name: '紅月ノ狂鬼 カグラ',
    leaderSkill: {
      name: '百鬼夜行',
      desc: '(SP:3) 相手のレーンを2つまで選択する。そのレーンのカードに4ダメージを与え、レーンを1ターン封印する。自分の場に「人魂（パワー1）」を2体まで配置する。',
      cost: 3,
      action: 'night_parade',
    },
  };
  GameState.gameMode = 'event_oni_high';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'oni';

  if (!GameState.enemySkins) GameState.enemySkins = {};
  GameState.enemySkins['oni'] = 'oni_high';

  if (typeof getSkinImage === 'function') {
    GameState.enemyConfig.image = getSkinImage(
      GameState.enemyConfig,
      'oni_high',
      'image'
    );
    GameState.enemyConfig.imageLose = getSkinImage(
      GameState.enemyConfig,
      'oni_high',
      'imageLose'
    );
    GameState.enemyConfig.icon = getSkinImage(
      GameState.enemyConfig,
      'oni_high',
      'icon'
    );
  }

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_oni_high[charId] ||
    EVENT_DIALOGUES.event_oni_high['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

export function initEventSatanMode(charId) {
  GameState.playerConfig = { ...CHARACTERS[charId] };
  GameState.enemyConfig = { ...CHARACTERS['satan'], hp: 100 };
  GameState.gameMode = 'event_satan';
  GameState.aiLevel = 3;
  GameState.battleCount = 7;
  GameState.selectedStageId = 'satan'; // ステージを魔王城に固定

  GameState.appState = 'story_intro';

  const dialogues =
    EVENT_DIALOGUES.event_satan[charId] ||
    EVENT_DIALOGUES.event_satan['default'];
  GameState.dialogueQueue = [dialogues[0], dialogues[1], dialogues[2]];

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

export function grantHighDifficultyPoints(onClose) {
  const earnedPoints = 1;
  let currentPts =
    parseInt(localStorage.getItem('mini_card_battle_high_difficulty_points')) ||
    0;
  let totalPts =
    parseInt(
      localStorage.getItem('mini_card_battle_high_difficulty_total_points')
    ) || 0;
  currentPts += earnedPoints;
  totalPts += earnedPoints;
  localStorage.setItem('mini_card_battle_high_difficulty_points', currentPts);
  localStorage.setItem(
    'mini_card_battle_high_difficulty_total_points',
    totalPts
  );

  try {
    const uuid = getOrCreateUUID();
    fetch('api/update_high_difficulty_points.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid: uuid,
        points: currentPts,
        total_points: totalPts,
      }),
    }).catch(() => {});
  } catch (e) {
    console.error(e);
  }

  if (typeof showAlertModal === 'function') {
    showAlertModal(
      `イベントをクリアしました！\n高難易度ポイントを ${earnedPoints} Pt 獲得しました！`,
      () => {
        if (onClose) onClose();
      }
    );
  } else {
    if (onClose) onClose();
  }
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
      // 勝利時の処理：メニューへ（ポイント付与は既に完了している）
      performFadeTransition(() => {
        switchScreen('screen-event-menu');
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
  const modeDialogues = EVENT_DIALOGUES[GameState.gameMode] || {};
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
 * 他プレイヤーのデッキデータをJSファイルから読み込む
 */
export async function loadPlayerDeck(uuid) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `api/decks/players/${uuid}.js?t=${Date.now()}`;
    script.onload = () => {
      if (typeof PLAYER_DECKS !== 'undefined' && PLAYER_DECKS[uuid]) {
        const data = PLAYER_DECKS[uuid];
        // 敵デッキデータとして整形
        const enemyDeckData = {
          id: 'player_defense',
          name: data.name,
          character: data.character,
          deck: data.deck,
        };
        // ENEMY_DECKSに一時的に登録
        ENEMY_DECKS['player_defense'] = data.deck;

        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(enemyDeckData);
      } else {
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('Player deck data not found in script'));
      }
    };
    script.onerror = () => {
      document.body.removeChild(script);
      reject(new Error('Failed to load player deck script'));
    };
    document.body.appendChild(script);
  });
}

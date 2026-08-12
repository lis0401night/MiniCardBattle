import { loadDeck } from '../services/deck.js';
import { setupDialogueScreen } from '../services/uiDialogue.js';
import { performFadeTransition } from '../services/uiMainCore.js';
import { GameState } from '../state/gameState.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import {
  TOURNAMENT_INTRO_DIALOGUE,
  getTournamentPostMatchDialogue,
  getTournamentPreMatchDialogue,
  getTournamentVenueDialogue,
  getTournamentWinDialogue,
} from '../utils/constants/eventTournamentDialogues.js';
import { TOURNAMENT_RANDOM_OPPONENT_EXCLUDED_IDS } from '../utils/constants/config.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/** トーナメントに参加する実在NPCキャラクター数 */
const TOURNAMENT_REAL_CHARACTER_COUNT = 11;

/** トーナメントに参加するダミー（モブ）キャラクター数 */
const TOURNAMENT_DUMMY_CHARACTER_COUNT = 4;

/**
 * トーナメント用キャラクター名を生成する
 * 異世界の二つ名を除去し、学園世界観であることを示す「？」を付ける
 * 例: "機動戦姫 アイギス" → "アイギス？"
 */
function toTournamentName(fullName) {
  if (!fullName) return 'プレイヤー？';
  // 半角・全角スペースで分割し、末尾の名前部分を取得
  const parts = fullName.split(/[\s\u3000]+/);
  const shortName = parts.length > 1 ? parts[parts.length - 1] : fullName;
  return `${shortName}？`;
}

/**
 * トーナメントモードの初期化処理
 * プレイヤーおよび参加NPC（実在キャラクター11体 + ダミー4体）のトーナメント表（ブラケット）を組み立て、オープニング画面へ遷移します。
 */
export function initTournamentMode() {
  GameState.gameMode = 'tournament';

  // プレイヤー情報
  const playerChar = {
    id: 'player',
    isPlayer: true,
    charId: GameState.pendingCharId,
    skin: `${GameState.pendingCharId}_school`,
    name: toTournamentName(
      GameState.playerConfig.name || CHARACTERS[GameState.pendingCharId]?.name
    ),
  };

  // プレイヤー以外のキャラクターを選ぶ（ボスやトーナメント禁止キャラクターは除外）
  const allCharIds = Object.keys(CHARACTERS).filter(
    (id) =>
      !CHARACTERS[id].isDummy &&
      id !== GameState.pendingCharId &&
      !TOURNAMENT_RANDOM_OPPONENT_EXCLUDED_IDS.includes(id)
  );

  // シャッフル
  allCharIds.sort(() => Math.random() - 0.5);
  const selectedCharIds = allCharIds.slice(0, TOURNAMENT_REAL_CHARACTER_COUNT);

  const realChars = selectedCharIds.map((charId) => ({
    id: `npc_${charId}`,
    isPlayer: false,
    charId: charId,
    skin: `${charId}_school`,
    name: toTournamentName(CHARACTERS[charId].name),
    isDummy: false,
  }));

  // ダミーを作成
  const dummies = Array.from({ length: TOURNAMENT_DUMMY_CHARACTER_COUNT }).map(
    (_, i) => ({
      id: `dummy_${i}`,
      isPlayer: false,
      charId: 'android', // ダミーのステータスベース
      name: `参加者${i + 1}`, // ダミー感のある名前
      isDummy: true,
    })
  );

  // 対戦カード（1回戦の8試合）を組み立てる
  // 条件:
  // - プレイヤーは絶対にダミーと当たらない (Player vs Real)
  // - ダミー同士は当たらない (Real vs Dummy x 4)
  // - プレイヤー対実在キャラクター
  // - ダミー同士は対戦しない（実在キャラクター対ダミーを4試合）
  // - 残りの6人の実在キャラクターが対戦する（実在キャラクター対実在キャラクターを3試合）
  //
  // 実在キャラクターは全部で11人。
  // 第1試合: プレイヤー対実在キャラクター（1人消費、残り10人）
  // 第2〜5試合: 実在キャラクター（4人消費）対ダミーキャラクター（4人消費）
  // 第6〜8試合: 実在キャラクター（6人消費）対実在キャラクター
  // これにより、ダミーは全員1回戦で実在キャラクターに負けるため、2回戦以降には絶対進まない。

  // 実在キャラクターをシャッフル
  realChars.sort(() => Math.random() - 0.5);

  const bracket = []; // 1回戦の参加者16人（2人ずつペア）

  // 第1試合（プレイヤー対 realChars[0]）
  bracket.push(playerChar);
  bracket.push(realChars[0]);

  // 第2〜5試合（realChars[1〜4] 対 dummies[0〜3]）
  for (let i = 0; i < TOURNAMENT_DUMMY_CHARACTER_COUNT; i++) {
    const pair = [realChars[1 + i], dummies[i]];
    // 左右をランダムにする
    if (Math.random() > 0.5) pair.reverse();
    bracket.push(...pair);
  }

  // 第6〜8試合（残りの実在キャラクター同士の対戦）
  const remainingRealChars = realChars.slice(
    1 + TOURNAMENT_DUMMY_CHARACTER_COUNT
  );
  for (let i = 0; i < remainingRealChars.length; i += 2) {
    bracket.push(remainingRealChars[i], remainingRealChars[i + 1]);
  }

  // 試合の順番(8試合)を、プレイヤーの試合以外ランダムにシャッフルするのも良いが、
  // UIの描画上、プレイヤーがどこにいるか見つけやすいように、そのままにするかペア単位でシャッフルする。
  const pairs = [];
  for (let i = 0; i < 16; i += 2) {
    pairs.push([bracket[i], bracket[i + 1]]);
  }

  // プレイヤーのペア（pairs[0]）以外の7ペアをシャッフル
  const otherPairs = pairs.slice(1);
  otherPairs.sort(() => Math.random() - 0.5);

  // プレイヤーの位置もランダムにしたい場合は pairs 全体をシャッフル
  pairs.splice(1, 7, ...otherPairs);
  pairs.sort(() => Math.random() - 0.5);

  // 最終的な1回戦の並び
  const finalBracket = pairs.flat();

  GameState.tournament = {
    round: 1,
    participants: finalBracket, // 16要素
    winners: [], // 勝者のリストを保持していく
    bracketTree: [finalBracket], // [ [16人(1回戦)], [8人(2回戦)], [4人(3回戦)], [2人(決勝)], [1人(優勝)] ]
    playerLost: false,
    deckEditDone: true, // デッキ編成完了フラグ（再開時にデッキ編成画面をスキップするため）
  };

  // トーナメントモードでは全キャラクターが学園スキンを使用する
  // getDialogueが学園スキンの台詞を正しく参照できるようにGameState側にも反映する
  if (!GameState.playerSkins) GameState.playerSkins = {};
  // トーナメント開始前の本来のスキン設定を、対象キャラIDとセットで一時退避する
  if (GameState.pendingCharId) {
    GameState._prevPlayerSkinBeforeTournament = {
      charId: GameState.pendingCharId,
      skin: GameState.playerSkins[GameState.pendingCharId],
    };
    GameState.playerSkins[GameState.pendingCharId] = 'school';
  }
  // startGameMode で enemySkins は既にリセット済み

  // 会話シーンのセットアップ
  // プレイヤー名をトーナメント形式（学園世界観）に変換する
  GameState.playerConfig = { ...GameState.playerConfig };
  GameState.playerConfig.name = toTournamentName(
    CHARACTERS[GameState.pendingCharId]?.name
  );
  GameState.appState = 'pre_dialogue';
  GameState.enemyConfig = GameState.playerConfig;
  GameState.dialogueQueue = TOURNAMENT_INTRO_DIALOGUE(GameState.playerConfig);

  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

// ラウンドのシミュレーション（NPC戦の勝敗決定）
export function simulateTournamentRound() {
  const currentParticipants =
    GameState.tournament.bracketTree[GameState.tournament.round - 1];
  const nextParticipants = [];

  for (let i = 0; i < currentParticipants.length; i += 2) {
    const p1 = currentParticipants[i];
    const p2 = currentParticipants[i + 1];

    if (p1.isPlayer || p2.isPlayer) {
      // プレイヤーの試合は実際のバトルの結果で既に勝者が決まっているので、
      // ここでは何もしないか、またはbattle.js側で勝者を `nextParticipants` に追加する処理を行うが、
      // 便宜上、この関数ではNPCの勝敗のみを決め、プレイヤーの勝敗は事前に処理されているものとする。
      // 実際には、この関数は「プレイヤーが勝った直後」に呼ばれるため、プレイヤーを進める。
      const winner = p1.isPlayer ? p1 : p2; // プレイヤーがここまで来てる＝勝った前提
      nextParticipants.push(winner);
      continue;
    }

    // NPC同士の試合
    let winner;
    if (p1.isDummy && !p2.isDummy) {
      winner = p2;
    } else if (!p1.isDummy && p2.isDummy) {
      winner = p1;
    } else {
      // 両方ダミー、または両方Realの場合はランダム
      winner = Math.random() > 0.5 ? p1 : p2;
    }
    nextParticipants.push(winner);
  }

  GameState.tournament.bracketTree.push(nextParticipants);
  GameState.tournament.round++;
}

export function startTournamentMatch() {
  playSound(SOUNDS.seClick);
  const currentParticipants =
    GameState.tournament.bracketTree[GameState.tournament.round - 1];

  // プレイヤーの次の対戦相手を探す
  let opponent = null;
  for (let i = 0; i < currentParticipants.length; i += 2) {
    const p1 = currentParticipants[i];
    const p2 = currentParticipants[i + 1];
    if (p1.isPlayer) {
      opponent = p2;
      break;
    } else if (p2.isPlayer) {
      opponent = p1;
      break;
    }
  }

  if (!opponent) {
    console.error('Opponent not found!');
    return;
  }

  // 敵のステータスをセットアップ
  GameState.enemyConfig = { ...CHARACTERS[opponent.charId] };
  GameState.enemyConfig.name = opponent.name;

  // プレイヤー名もトーナメント形式に変換する（戦闘画面で表示される名前）
  GameState.playerConfig = { ...GameState.playerConfig };
  GameState.playerConfig.name = toTournamentName(
    CHARACTERS[GameState.playerConfig.id]?.name
  );

  // 敵の学園スキンを設定（getDialogueが学園スキンの台詞を参照するために必要）
  if (!GameState.enemySkins) GameState.enemySkins = {}; // 再開時のフォールバック
  GameState.enemySkins[opponent.charId] = 'school';

  GameState.selectedStageId = 'practice'; // トーナメント用の背景
  GameState.aiLevel = 2; // 適度な強さ

  // バトル前の会話をセットアップ
  performFadeTransition(() => {
    GameState.battleCount = 1;
    GameState.appState = 'pre_battle_dialogue';
    GameState.dialogueQueue = getTournamentPreMatchDialogue(
      GameState.tournament.round,
      GameState.enemyConfig,
      GameState.playerConfig
    );
    setupDialogueScreen();
  });
}

// トーナメント中断・再開機能

export function saveTournamentProgress() {
  const pConf = GameState.playerConfig ? { ...GameState.playerConfig } : null;
  if (pConf && GameState.pendingCharId) {
    pConf.charId = GameState.pendingCharId;
    if (
      !pConf.leaderSkill &&
      CHARACTERS[GameState.pendingCharId]?.leaderSkill
    ) {
      pConf.leaderSkill = CHARACTERS[GameState.pendingCharId].leaderSkill;
    }
  }

  const saveData = {
    tournament: GameState.tournament,
    playerConfig: pConf,
    deckEditDone: GameState.tournament?.deckEditDone || false,
    playerHP: GameState.playerHP,
  };
  localStorage.setItem(
    'mini_card_battle_tournament_save',
    JSON.stringify(saveData)
  );
}

export function loadTournamentProgress() {
  const json = localStorage.getItem('mini_card_battle_tournament_save');
  if (json) {
    try {
      const saveData = JSON.parse(json);
      GameState.tournament = saveData.tournament;
      if (saveData.playerConfig) {
        GameState.playerConfig = {
          ...saveData.playerConfig,
          icon: saveData.playerConfig.icon
            ? saveData.playerConfig.icon.replace(
                /\.(png|jpg|jpeg|gif)$/i,
                '.webp'
              )
            : saveData.playerConfig.icon,
          image: saveData.playerConfig.image
            ? saveData.playerConfig.image.replace(
                /\.(png|jpg|jpeg|gif)$/i,
                '.webp'
              )
            : saveData.playerConfig.image,
          imageLose: saveData.playerConfig.imageLose
            ? saveData.playerConfig.imageLose.replace(
                /\.(png|jpg|jpeg|gif)$/i,
                '.webp'
              )
            : saveData.playerConfig.imageLose,
          imageEnding: saveData.playerConfig.imageEnding
            ? saveData.playerConfig.imageEnding.replace(
                /\.(png|jpg|jpeg|gif)$/i,
                '.webp'
              )
            : saveData.playerConfig.imageEnding,
        };
      } else {
        GameState.playerConfig = null;
      }
      if (saveData.playerHP !== undefined) {
        GameState.playerHP = saveData.playerHP;
      }
      GameState.gameMode = 'tournament';

      // トーナメント用デッキのスナップショットをロード
      loadDeck();

      // 状態に応じて適切な画面へ遷移
      if (!GameState.tournament.deckEditDone) {
        switchScreen('screen-deck-edit');
      } else {
        switchScreen('screen-tournament-bracket');
      }
      return true;
    } catch (e) {
      console.error('Failed to load tournament save', e);
      return false;
    }
  }
  return false;
}

export function clearTournamentSave() {
  localStorage.removeItem('mini_card_battle_tournament_save');
  localStorage.removeItem('mini_card_battle_tournament_deck_obj');
  // メモリ上のトーナメント状態もクリア（goBackFromSelect等での誤参照を防止）
  GameState.tournament = null;

  // トーナメント中の学園スキン一時設定をクリーンアップし、通常デッキの本来のスキン状態を復元
  if (GameState._prevPlayerSkinBeforeTournament) {
    const { charId, skin } = GameState._prevPlayerSkinBeforeTournament;
    if (GameState.playerSkins && charId) {
      if (skin !== undefined) {
        GameState.playerSkins[charId] = skin;
      } else {
        delete GameState.playerSkins[charId];
      }
    }
    delete GameState._prevPlayerSkinBeforeTournament;
  }
  loadDeck();
}

export function playTournamentVenueDialogue() {
  GameState.dialogueQueue = getTournamentVenueDialogue(GameState.playerConfig);
  GameState.appState = 'venue_dialogue';
  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

export function playTournamentPostMatchDialogue() {
  // simulateTournamentRound() で round が既にインクリメント済みのため、
  // 「今終わったラウンド」の台詞を取得するには round - 1 を使う
  const finishedRound = GameState.tournament.round - 1;
  GameState.dialogueQueue = getTournamentPostMatchDialogue(
    finishedRound,
    GameState.playerConfig
  );
  GameState.appState = 'post_tournament_match';
  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

export function playTournamentWinDialogue() {
  GameState.dialogueQueue = getTournamentWinDialogue(GameState.playerConfig);
  GameState.appState = 'tournament_win_dialogue';
  performFadeTransition(() => {
    setupDialogueScreen();
  });
}

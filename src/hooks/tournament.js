import { CHARACTERS } from '../utils/constants/characters.js';
import { GameState } from './gameState.js';
import { playSound, switchScreen, getDialogue } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { setupDialogueScreen } from './uiDialogue.js';
import { startBattleFlow, loadDeck } from './deck.js';
import { TOURNAMENT_INTRO_DIALOGUE, getTournamentPreMatchDialogue } from '../utils/constants/eventTournamentDialogues.js';

export function initTournamentMode() {
  GameState.gameMode = 'tournament';

  // プレイヤー情報
  const playerChar = {
    id: 'player',
    isPlayer: true,
    charId: GameState.pendingCharId,
    name: GameState.playerConfig.name || CHARACTERS[GameState.pendingCharId]?.name || 'プレイヤー',
  };

  // プレイヤー以外のキャラクターを9体ランダムに選ぶ
  const allCharIds = Object.keys(CHARACTERS).filter(
    (id) =>
      !CHARACTERS[id].isDummy &&
      id !== GameState.pendingCharId &&
      id !== 'satan' && // ボスすぎるキャラは除くかはお好みだが一旦除外
      id !== 'campaign_player' // キャンペーン用キャラは除外
  );

  // シャッフル
  allCharIds.sort(() => Math.random() - 0.5);
  const selectedCharIds = allCharIds.slice(0, 9);
  
  const realChars = selectedCharIds.map((charId) => ({
    id: `npc_${charId}`,
    isPlayer: false,
    charId: charId,
    name: CHARACTERS[charId].name,
    isDummy: false
  }));

  // ダミーを6体作成
  const dummies = Array.from({ length: 6 }).map((_, i) => ({
    id: `dummy_${i}`,
    isPlayer: false,
    charId: 'android', // ダミーのステータスベース
    name: `参加者${i + 1}`, // ダミー感のある名前
    isDummy: true
  }));

  // 対戦カード（1回戦の8試合）を組み立てる
  // 条件:
  // - プレイヤーは絶対にダミーと当たらない (Player vs Real)
  // - ダミー同士は当たらない (Real vs Dummy x 6)
  // - 残りの2人のRealが当たる (Real vs Real)
  //
  // Realは全部で9人。
  // Match 1: Player vs Real (1人消費、残り8人)
  // Match 2~7: Real(6人消費) vs Dummy(6人消費)
  // Match 8: Real(2人消費) vs Real
  // これにより、ダミーは全員1回戦でRealに負けるため、2回戦以降には絶対進まない。

  // Realをシャッフル
  realChars.sort(() => Math.random() - 0.5);

  const bracket = []; // 1回戦の参加者16人（2人ずつペア）

  // Match 1 (Player vs Real[0])
  bracket.push(playerChar);
  bracket.push(realChars[0]);

  // Match 2~7 (Real[1~6] vs Dummy[0~5])
  for (let i = 0; i < 6; i++) {
    const pair = [realChars[1 + i], dummies[i]];
    // 左右をランダムにする
    if (Math.random() > 0.5) pair.reverse();
    bracket.push(...pair);
  }

  // Match 8 (Real[7] vs Real[8])
  bracket.push(realChars[7]);
  bracket.push(realChars[8]);

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
    playerLost: false
  };

  // 会話シーンのセットアップ
  GameState.appState = 'pre_dialogue';
  GameState.enemyConfig = GameState.playerConfig; // 選んだデッキのキャラクターが案内役になる
  
  GameState.dialogueQueue = TOURNAMENT_INTRO_DIALOGUE(GameState.enemyConfig);
  
  setupDialogueScreen();
}

// ラウンドのシミュレーション（NPC戦の勝敗決定）
export function simulateTournamentRound() {
  const currentParticipants = GameState.tournament.bracketTree[GameState.tournament.round - 1];
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
  const currentParticipants = GameState.tournament.bracketTree[GameState.tournament.round - 1];
  
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
  
  // テスト用に敵HPを1にする
  GameState.enemyConfig.hp = 1;

  GameState.selectedStageId = 'arena'; // トーナメント用の背景
  GameState.aiLevel = 2; // 適度な強さ

  // バトル前の会話をセットアップ
  import('./uiMainCore.js').then(({ performFadeTransition }) => {
    performFadeTransition(() => {
      GameState.battleCount = 1;
      GameState.appState = 'pre_battle_dialogue';
      GameState.dialogueQueue = getTournamentPreMatchDialogue(GameState.tournament.round, GameState.enemyConfig, GameState.playerConfig);
      setupDialogueScreen();
    });
  });
}

// トーナメント中断・再開機能

export function saveTournamentProgress() {
  const saveData = {
    tournament: GameState.tournament,
    playerConfig: GameState.playerConfig,
    deckEditDone: GameState.tournament?.deckEditDone || false,
    playerHP: GameState.playerHP,
  };
  localStorage.setItem('mini_card_battle_tournament_save', JSON.stringify(saveData));
}

export function loadTournamentProgress() {
  const json = localStorage.getItem('mini_card_battle_tournament_save');
  if (json) {
    try {
      const saveData = JSON.parse(json);
      GameState.tournament = saveData.tournament;
      GameState.playerConfig = saveData.playerConfig;
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
}

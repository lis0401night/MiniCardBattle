import { loadDeck } from '../services/deck.js';
import {
  initSelectScreen,
  performFadeTransition,
  showDefenseBattleList,
  showOnlineLobby,
} from '../services/uiMainCore.js';
import { GameState } from '../state/gameState.js';
import { switchScreen } from '../utils/gameUtils.js';
import { prepareBattle } from './battle/index.js';
import { handleBattleDungeonProgression } from './battleDungeon.js';

import { handleEventProgression } from './events.js';
import { handleStoryProgression } from './story.js';
import {
  playTournamentPostMatchDialogue,
  playTournamentVenueDialogue,
  playTournamentWinDialogue,
  saveTournamentProgress,
} from './tournament.js';

/**
 * Mini Card Battle - 共通進行管理 (progression.js)
 * ストーリー、フリーバトル、イベントの進行ロジックを統合・管理するハブ
 */

/**
 * 選択済みデッキを読み込み、ゲーム状態を battle に更新してバトルを開始する共通処理。
 *
 * @returns {void}
 */
export function startPreparedBattle() {
  loadDeck();
  GameState.appState = 'battle';
  prepareBattle();
}

/**
 * 現在のゲームモードとアプリ状態に応じて、次の進行処理を実行する。
 * バトル前会話の完了時は、対象モードのバトル開始処理へ遷移する。
 *
 * @returns {void}
 */
export function handleProgressionNextStep() {
  // gameModeが設定されていない場合は安全にモード選択画面に戻る
  if (!GameState.gameMode) {
    switchScreen('screen-mode-select');
    return;
  }
  // スキルテストモードの場合は即座にモード選択画面に戻る
  if (GameState.gameMode === 'still_test') {
    switchScreen('screen-mode-select');
    return;
  }
  // カード獲得演出デモモードの場合
  if (GameState.gameMode === 'reward_demo') {
    const characterRewardMap = {
      android: 'killermachine',
      dragon: 'dragon',
      knight: 'nobleknight',
      cthulhu: 'cthulhu',
      elf: 'elfking',
      cleric: 'cleric',
      devilhunter: 'vampire',
      witch: 'witch',
      oni: 'omyouji',
      priest: 'voidcleric',
      satan: 'baphomet',
    };
    const enemyId = GameState.enemyConfig?.id || 'android';
    const rewardCardId = characterRewardMap[enemyId] || 'skeleton';

    if (window.showCardRewardReact) {
      window.showCardRewardReact(rewardCardId);
    } else {
      switchScreen('screen-solo-menu');
    }
    return;
  }
  if (GameState.gameMode === 'free') {
    handleFreeBattleProgression();
  } else if (GameState.gameMode === 'battle_dungeon') {
    handleBattleDungeonProgression();
    return;
  } else if (GameState.gameMode === 'defense_attack') {
    if (typeof showDefenseBattleList === 'function') {
      showDefenseBattleList();
    } else {
      switchScreen('screen-mode-select');
    }
  } else if (
    GameState.gameMode?.startsWith('event_') &&
    (GameState.gameMode?.endsWith('_high') ||
      GameState.gameMode?.endsWith('_fortune'))
  ) {
    if (typeof handleEventProgression === 'function') {
      handleEventProgression();
    } else {
      console.error('handleEventProgression is not defined');
      switchScreen('screen-mode-select');
    }
  } else if (GameState.gameMode === 'online') {
    if (typeof showOnlineLobby === 'function') {
      showOnlineLobby();
    } else {
      switchScreen('screen-online-lobby');
    }
  } else if (GameState.gameMode === 'tournament') {
    if (GameState.appState === 'pre_battle_dialogue') {
      startPreparedBattle();
      return;
    }

    if (GameState.appState === 'post_dialogue') {
      if (GameState.lastBattleResult === 'win') {
        if (GameState.tournament && GameState.tournament.round === 5) {
          playTournamentWinDialogue();
          return;
        } else {
          playTournamentPostMatchDialogue();
          return;
        }
      } else {
        // 敗北時はそのままブラケットへ
        saveTournamentProgress();
        switchScreen('screen-tournament-bracket');
        return;
      }
    }

    if (GameState.appState === 'pre_dialogue') {
      playTournamentVenueDialogue();
      return;
    }

    if (
      GameState.appState === 'venue_dialogue' ||
      GameState.appState === 'post_tournament_match' ||
      GameState.appState === 'tournament_win_dialogue'
    ) {
      saveTournamentProgress();
      performFadeTransition(() => {
        switchScreen('screen-tournament-bracket');
      });
      return;
    }

    if (
      GameState.tournament &&
      (GameState.tournament.playerLost || GameState.tournament.round > 4)
    ) {
      // 終了処理 (ポイント付与などはBracket画面で行う)
      saveTournamentProgress();
      switchScreen('screen-tournament-bracket');
    } else {
      saveTournamentProgress();
      performFadeTransition(() => {
        switchScreen('screen-tournament-bracket');
      });
    }
  } else {
    // デフォルトはストーリーモード
    if (typeof handleStoryProgression === 'function') {
      handleStoryProgression();
    } else {
      console.error('handleStoryProgression is not defined');
      switchScreen('screen-mode-select');
    }
  }
}

/**
 * フリーバトルのアプリ状態に応じて、敵選択またはバトル開始へ遷移する。
 * 戦闘前会話の完了時は、選択済みデッキでバトルを開始する。
 *
 * @returns {void}
 */
export function handleFreeBattleProgression() {
  if (GameState.appState === 'post_dialogue') {
    performFadeTransition(() => {
      GameState.appState = 'select_enemy';
      initSelectScreen(false);
      switchScreen('screen-select');
    });
  } else if (GameState.appState === 'pre_dialogue') {
    // 難易度選択直後にデッキ一覧・デッキ編成・ステージ選択を完了しているため、
    // 戦闘前会話終了後はデッキ編成画面を挟まず、直接バトルを開始する
    startPreparedBattle();
  } else {
    switchScreen('screen-mode-select');
  }
}

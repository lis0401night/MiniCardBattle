import { loadDeck, startBattleFlow } from '../services/deck.js';
import {
  initSelectScreen,
  performFadeTransition,
  showDefenseBattleList,
  showOnlineLobby,
} from '../services/uiMainCore.js';
import { GameState } from '../state/gameState.js';
import { switchScreen } from '../utils/gameUtils.js';
import { prepareBattle } from './battle.js';
import { handleBattleDungeonProgression } from './battleDungeon.js';
import { onCampaignDialogueEnd } from './campaign.js';
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
 * ダイアログ終了後などの「次のステップ」を判定して実行する
 */
export function handleProgressionNextStep() {
  // スキルテストモードの場合は即座にモード選択画面に戻る
  if (GameState.gameMode === 'still_test') {
    switchScreen('screen-mode-select');
    return;
  }
  if (GameState.gameMode === 'free') {
    handleFreeBattleProgression();
  } else if (GameState.gameMode === 'campaign') {
    onCampaignDialogueEnd();
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
    GameState.gameMode.startsWith('event_') &&
    GameState.gameMode.endsWith('_high')
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
      loadDeck();
      GameState.appState = 'battle';
      prepareBattle();
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
 * フリーバトルの進行管理
 */
export function handleFreeBattleProgression() {
  if (GameState.appState === 'post_dialogue') {
    performFadeTransition(() => {
      GameState.appState = 'select_enemy';
      initSelectScreen(false);
      switchScreen('screen-select');
    });
  } else if (GameState.appState === 'pre_dialogue') {
    startBattleFlow();
  } else {
    switchScreen('screen-mode-select');
  }
}

import { switchScreen } from '../utils/gameUtils.js';
import { startBattleFlow } from './deck.js';
import { handleEventProgression } from './events.js';
import { GameState } from './gameState.js';
import { handleStoryProgression } from './story.js';
import {
  performFadeTransition,
  initSelectScreen,
  showDefenseBattleList,
  showOnlineLobby,
} from './uiMainCore.js';
import { handleBattleDungeonProgression } from './battleDungeon.js';

/**
 * Mini Card Battle - 共通進行管理 (progression.js)
 * ストーリー、フリーバトル、イベントの進行ロジックを統合・管理するハブ
 */

/**
 * ダイアログ終了後などの「次のステップ」を判定して実行する
 */
export function handleProgressionNextStep() {
  if (GameState.gameMode === 'free') {
    handleFreeBattleProgression();
  } else if (GameState.gameMode === 'campaign') {
    import('./campaign.js').then(({ onCampaignDialogueEnd }) => {
      onCampaignDialogueEnd();
    });
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
    GameState.gameMode === 'event_satan' ||
    (GameState.gameMode.startsWith('event_') && GameState.gameMode.endsWith('_high'))
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
      import('./deck.js').then(({ loadDeck }) => {
        loadDeck();
        GameState.appState = 'battle';
        import('./battle.js').then(({ prepareBattle }) => {
          prepareBattle();
        });
      });
      return;
    }

    if (GameState.appState === 'post_dialogue') {
      if (GameState.lastBattleResult === 'win') {
        if (GameState.tournament && GameState.tournament.round === 5) {
          import('./tournament.js').then(({ playTournamentWinDialogue }) => {
            playTournamentWinDialogue();
          });
          return;
        } else {
          import('./tournament.js').then(({ playTournamentPostMatchDialogue }) => {
            playTournamentPostMatchDialogue();
          });
          return;
        }
      } else {
        // 敗北時はそのままブラケットへ
        import('./tournament.js').then(({ saveTournamentProgress }) => {
          saveTournamentProgress();
          switchScreen('screen-tournament-bracket');
        });
        return;
      }
    }

    if (GameState.appState === 'pre_dialogue') {
      import('./tournament.js').then(({ playTournamentVenueDialogue }) => {
        playTournamentVenueDialogue();
      });
      return;
    }

    if (GameState.appState === 'venue_dialogue' || GameState.appState === 'post_tournament_match' || GameState.appState === 'tournament_win_dialogue') {
      import('./tournament.js').then(({ saveTournamentProgress }) => {
        saveTournamentProgress();
        import('./uiMainCore.js').then(({ performFadeTransition }) => {
          performFadeTransition(() => {
            switchScreen('screen-tournament-bracket');
          });
        });
      });
      return;
    }

    if (GameState.tournament && (GameState.tournament.playerLost || GameState.tournament.round > 4)) {
      // 終了処理 (ポイント付与などはBracket画面で行う)
      import('./tournament.js').then(({ saveTournamentProgress }) => {
        saveTournamentProgress();
        switchScreen('screen-tournament-bracket');
      });
    } else {
      import('./tournament.js').then(({ saveTournamentProgress }) => {
        saveTournamentProgress();
        import('./uiMainCore.js').then(({ performFadeTransition }) => {
          performFadeTransition(() => {
            switchScreen('screen-tournament-bracket');
          });
        });
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

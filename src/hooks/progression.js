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
    GameState.gameMode === 'event_android_high' ||
    GameState.gameMode === 'event_dragon_high' ||
    GameState.gameMode === 'event_knight_high' ||
    GameState.gameMode === 'event_cthulhu_high' ||
    GameState.gameMode === 'event_elf_high' ||
    GameState.gameMode === 'event_cleric_high' ||
    GameState.gameMode === 'event_devilhunter_high' ||
    GameState.gameMode === 'event_witch_high' ||
    GameState.gameMode === 'event_oni_high'
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
          switchScreen('screen-battle');
        });
      });
      return;
    }

    if (GameState.tournament && (GameState.tournament.playerLost || GameState.tournament.round > 4)) {
      // 終了処理 (ポイント付与などはBracket画面で行うか、ここでやるか)
      // Bracket画面で優勝/敗北を表示してから戻りたいので、必ずBracket画面に飛ばす
      import('./tournament.js').then(({ saveTournamentProgress }) => {
        saveTournamentProgress();
        switchScreen('screen-tournament-bracket');
      });
    } else {
      if (GameState.tournament && GameState.tournament.round === 1 && !GameState.tournament.deckEditDone) {
        switchScreen('screen-deck-edit');
      } else {
        import('./tournament.js').then(({ saveTournamentProgress }) => {
          saveTournamentProgress();
          switchScreen('screen-tournament-bracket');
        });
      }
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

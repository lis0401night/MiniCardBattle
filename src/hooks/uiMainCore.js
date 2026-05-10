import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { STAGES } from '../utils/constants/stages.js';
import {
  getDialogue,
  getOrCreateUUID,
  playSound,
  sleep,
  switchScreen,
} from '../utils/gameUtils.js';
import { AUDIO_INSTANCES, SOUNDS } from '../utils/sounds.js';
import { initCampaignMode } from './campaign.js';
import {
  createNewDeck,
  loadDeck,
  renderDeckEdit,
  startBattleFlow,
} from './deck.js';
import {
  initEventSatanMode,
  initHighDifficultyEventMode,
  loadPlayerDeck,
} from './events.js';
import { initTournamentMode } from './tournament.js';

import { prepareBattle } from './battle.js';
import { GameState } from './gameState.js';
import { setPlayerReadyOnly } from './multiplayer.js';
import { clearStoryProgress, initStoryMode } from './story.js';
import { setupDialogueScreen } from './uiDialogue.js';
import { showAlertModal, showConfirmModal } from './uiModals.js';

/**
 * Mini Card Battle - UI Core (uiMainCore.js)
 * VERSION: 1.2
 */

// 初期ロード時に音量を復元
(function () {
  if (typeof GameState.gameVolume === 'undefined') {
    GameState.gameVolume = 0.5;
  }
  const savedVol = localStorage.getItem('mini_card_battle_volume');
  if (savedVol !== null) {
    GameState.gameVolume = parseFloat(savedVol);
  }
  // Storageから復帰した音量を、既に生成済みの全音声インスタンスに即時適用させる
  // (関数の巻き上げを利用してここで事前に適用しておく)
  setTimeout(() => {
    if (typeof updateVolume === 'function') {
      updateVolume(GameState.gameVolume);
    }
  }, 100);
})();

console.log('!!! uiMainCore.js Version 1.2 Loaded !!!');

export function goToModeSelect() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmTitle);
  switchScreen('screen-mode-select');
}

export function showRules() {
  playSound(SOUNDS.seClick);
  rulesClickCount = 0; // 画面を開くたびにリセット
  switchScreen('screen-rules');
}

export function showOptions() {
  playSound(SOUNDS.seClick);
  // スライダーの値同期待ちは OptionsScreen.jsx の React 側に一任する
  switchScreen('screen-options');
  window.dispatchEvent(new Event('optionsOpened'));
}

export function updateVolume(val) {
  GameState.gameVolume = parseFloat(val);
  // すべての Audio インスタンス（BGM/SEのフォールバック等）へ即座に音量を反映 (PC＆非iOS用)
  Object.keys(AUDIO_INSTANCES).forEach((key) => {
    if (
      AUDIO_INSTANCES[key] &&
      typeof AUDIO_INSTANCES[key].volume !== 'undefined'
    ) {
      try {
        AUDIO_INSTANCES[key].volume = GameState.gameVolume;
      } catch {
        // ignore
      }
    }
  });
  // Web Audio Gain Nodeの更新 (iOSなどモバイル用)
  if (typeof window.updateBgmGainNodes === 'function') {
    window.updateBgmGainNodes(GameState.gameVolume);
  }
  localStorage.setItem('mini_card_battle_volume', GameState.gameVolume);
}

export function resetGameData() {
  playSound(SOUNDS.seClick);
  showConfirmModal(
    '本当に全てのデータを削除しますか？\nデッキと所持カードが初期化されます。(この操作は取り消せません)',
    () => {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith('mini_card_battle_')) {
          localStorage.removeItem(key);
        }
      });
      // 新規作成された実績データも初期化対象に含まれる
      playSound(SOUNDS.seDestroy);
      showAlertModal('データをリセットしました。タイトルに戻ります。', () => {
        location.reload();
      });
    }
  );
}

export function showSyncDataModal() {
  playSound(SOUNDS.seClick);
  if (window.showSyncDataModalState) {
    window.showSyncDataModalState();
  } else {
    const modal = document.getElementById('screen-sync-data');
    if (modal) modal.style.display = 'flex';
  }
}

export function closeSyncDataModal() {
  playSound(SOUNDS.seClick);
  if (window.closeSyncDataModalState) {
    window.closeSyncDataModalState();
  } else {
    const modal = document.getElementById('screen-sync-data');
    if (modal) modal.style.display = 'none';
  }
}

export function backupDataToXML() {
  playSound(SOUNDS.seClick);
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<GameData>\n';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('mini_card_battle_')) {
      const val = localStorage.getItem(key);
      const escapedVal = val
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      xml += `  <Entry key="${key}">${escapedVal}</Entry>\n`;
    }
  }
  xml += '</GameData>';

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mini_card_battle_backup_${new Date().toISOString().split('T')[0]}.xml`;
  document.body.appendChild(a);
  a.click();
  if (a.parentNode) a.parentNode.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importDataFromXML() {
  playSound(SOUNDS.seClick);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xml';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      if (input.parentNode) input.parentNode.removeChild(input);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');
        const entries = xmlDoc.getElementsByTagName('Entry');

        if (entries.length === 0) {
          showAlertModal('有効なバックアップデータが見つかりませんでした。');
          return;
        }

        showConfirmModal(
          'データを上書きしてよろしいですか？\n取り込んだデータで現在の進行状況が上書きされ、自動的にリロードされます。',
          () => {
            for (let i = 0; i < entries.length; i++) {
              const key = entries[i].getAttribute('key');
              const val = entries[i].textContent;
              if (key) localStorage.setItem(key, val);
            }
            location.reload();
          }
        );
      } catch (err) {
        console.error('Import error:', err);
        showAlertModal(
          'ファイルのパースに失敗しました。正しいXMLファイルか確認してください。'
        );
      } finally {
        if (document.body.contains(input)) document.body.removeChild(input);
      }
    };
    reader.onerror = () => {
      showAlertModal('ファイルの読み込みに失敗しました。');
      if (document.body.contains(input)) document.body.removeChild(input);
    };
    reader.readAsText(file);
  };

  input.click();
}

export function reloadGame() {
  playSound(SOUNDS.seClick);
  location.reload();
}

let rulesClickCount = 0;
export function incrementRulesClickCount() {
  return ++rulesClickCount;
}
export function resetRulesClickCount() {
  rulesClickCount = 0;
}
export let optionsTitleClickCount = 0;

export function handleOptionsTitleClick() {
  optionsTitleClickCount++;
  if (optionsTitleClickCount >= 10) {
    optionsTitleClickCount = 0;
    // 意図的にエラーを発生させる
    const error = new Error(
      'Debug: Intentional error triggered by clicking options title 10 times.'
    );
    window.onerror(error.message, window.location.href, 0, 0, error);
  }
}

export function goBackFromSelect() {
  playSound(SOUNDS.seClick);
  if (GameState.gameMode === 'defense_register') {
    switchScreen('screen-defense-menu');
  } else if (GameState.gameMode === 'defense_attack') {
    switchScreen('screen-defense-battle-list');
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
    switchScreen('screen-high-difficulty');
  } else if (GameState.appState === 'create_deck_select_char') {
    // 新規作成のキャラ選択画面からキャンセルして戻る場合、
    // gameModeを元のモードに復帰させてからデッキ一覧に戻す
    if (GameState.prevGameModeForCreate) {
      GameState.gameMode = GameState.prevGameModeForCreate;
    }
    if (GameState.prevAppStateForCreate) {
      GameState.appState = GameState.prevAppStateForCreate;
    }
    if (window.forceUpdateDeckList) window.forceUpdateDeckList();
    switchScreen('screen-deck-list');
  } else if (GameState.appState === 'select_enemy') {
    GameState.appState = 'select_deck';
    if (typeof window.loadDeck === 'function') window.loadDeck();
    if (window.forceUpdateDeckList) window.forceUpdateDeckList();
    switchScreen('screen-deck-list');
  } else if (GameState.appState === 'select_enemy_deck') {
    GameState.appState = 'select_deck';
    if (typeof window.loadDeck === 'function') window.loadDeck();
    if (window.forceUpdateDeckList) window.forceUpdateDeckList();
    switchScreen('screen-deck-list');
  } else if (GameState.gameMode === 'online_deck_edit') {
    showOnlineLobby();
  } else if (GameState.gameMode === 'tournament') {
    playSound(AUDIO_INSTANCES.bgmTournament1);
    if (GameState.tournament && GameState.tournament.participants) {
      if (GameState.tournament.currentMatch === 0) {
        switchScreen('screen-tournament-bracket');
      } else {
        switchScreen('screen-tournament-resume');
      }
    } else {
      switchScreen('screen-tournament-menu');
    }
  } else {
    // デッキ選択のフローから抜ける際にページネーションをリセット
    GameState.deckListPage = 0;

    playSound(AUDIO_INSTANCES.bgmTitle);
    if (
      GameState.gameMode === 'story' ||
      GameState.gameMode === 'free' ||
      GameState.gameMode === 'practice'
    ) {
      switchScreen('screen-solo-menu');
    } else {
      switchScreen('screen-mode-select');
    }
  }
}

export function goBackFromDifficulty() {
  playSound(SOUNDS.seClick);
  if (GameState.gameMode === 'defense_register') {
    switchScreen('screen-defense-menu');
  } else if (GameState.gameMode === 'story') {
    GameState.appState = 'select_deck';
    switchScreen('screen-deck-list');
  } else {
    GameState.appState = 'select_enemy';
    initSelectScreen(false);
    switchScreen('screen-select');
  }
}

export function goBackFromStage() {
  playSound(SOUNDS.seClick);
  if (
    GameState.gameMode === 'defense_register' ||
    GameState.gameMode === 'online_deck_edit'
  ) {
    // 防衛・オンラインのステージ選択画面からは、直前のデッキ編集画面へと戻る
    switchScreen('screen-deck-edit');
  } else if (GameState.gameMode === 'practice') {
    GameState.appState = 'select_enemy_deck';
    if (typeof window.loadDeck === 'function') window.loadDeck();
    if (window.forceUpdateDeckList) window.forceUpdateDeckList();
    switchScreen('screen-deck-list');
  } else {
    GameState.appState = 'select_difficulty';
    switchScreen('screen-difficulty');
  }
}

export function goBackFromDeckEdit(isCancel = false) {
  playSound(SOUNDS.seClick);
  if (
    GameState.gameMode === 'defense_register' ||
    GameState.gameMode === 'online_deck_edit'
  ) {
    // キャラクター選択に戻る
    GameState.appState = 'select_player';
    initSelectScreen(false);
    switchScreen('screen-select');
  } else if (GameState.gameMode === 'defense_attack') {
    // 攻撃側：キャラクター選択に戻る（攻撃開始フローでは対戦相手選択は固定されているため）
    GameState.appState = 'select_deck';
    switchScreen('screen-deck-list');
  } else if (GameState.appState === 'tournament_init_deck_edit') {
    if (isCancel) {
      GameState.appState = 'select_deck';
      switchScreen('screen-deck-list');
    } else {
      GameState.pendingCharId =
        GameState.decks[GameState.currentDeckIndex].leaderId;
      GameState.playerConfig = CHARACTERS[GameState.pendingCharId];
      initTournamentMode();
    }
  } else if (GameState.gameMode === 'create_deck') {
    if (isCancel) {
      // 新規作成中にキャンセルして戻る場合、仮で作成されたデッキを破棄する
      const index = GameState.currentDeckIndex;
      if (
        index !== undefined &&
        index >= 0 &&
        GameState.decks &&
        GameState.decks.length > index
      ) {
        GameState.decks.splice(index, 1);
        localStorage.setItem(
          'mini_card_battle_decks',
          JSON.stringify(GameState.decks)
        );
      }
      GameState.appState = 'create_deck_select_char';
      initSelectScreen(false);
      switchScreen('screen-select');
    } else {
      // 完了の場合、gameModeを元のモードに復帰してからデッキ一覧に戻る
      if (GameState.prevGameModeForCreate) {
        GameState.gameMode = GameState.prevGameModeForCreate;
      } else {
        GameState.gameMode = 'free_deck_edit';
      }
      GameState.appState = GameState.prevAppStateForCreate || 'select_deck';
      if (window.forceUpdateDeckList) window.forceUpdateDeckList();
      switchScreen('screen-deck-list');
    }
  } else if (GameState.gameMode === 'story') {
    // 難易度選択に戻る
    GameState.appState = 'select_difficulty';
    switchScreen('screen-difficulty');
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
    // 高難易度画面に戻る
    switchScreen('screen-high-difficulty');
  } else if (GameState.gameMode === 'battle_dungeon') {
    GameState.dungeonState = 'select_opponent';
    switchScreen('screen-battle-dungeon');
    if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
  } else if (GameState.gameMode === 'free_deck_edit') {
    // マイデッキ編集：デッキ一覧に戻る
    if (typeof window.loadDeck === 'function') window.loadDeck();
    if (window.forceUpdateDeckList) window.forceUpdateDeckList();
    switchScreen('screen-deck-list');
  } else {
    // フリー対戦など：デッキ選択（一覧）画面に戻る
    GameState.appState = 'select_deck';
    if (typeof window.loadDeck === 'function') window.loadDeck();
    if (window.forceUpdateDeckList) window.forceUpdateDeckList();
    switchScreen('screen-deck-list');
  }
}

export function showSoloMenu() {
  playSound(SOUNDS.seClick);
  switchScreen('screen-solo-menu');
}

export function showDeckEditMenu() {
  playSound(SOUNDS.seClick);
  GameState.gameMode = 'free_deck_edit';
  GameState.appState = 'free_deck_edit';
  GameState.deckListPage = 0; // メニューから入る際はページリセット
  // 確実に現在の本来の通常デッキをロードし直す
  if (typeof window.loadDeck === 'function') window.loadDeck();
  if (window.forceUpdateDeckList) window.forceUpdateDeckList();
  switchScreen('screen-deck-list');
}

export function startGameMode(mode) {
  playSound(SOUNDS.seClick);
  GameState.lastBattleResult = null;
  GameState.gameMode = mode;

  // 前モードの敵スキン設定をクリアし、新モードへの漏洩を防ぐ
  GameState.enemySkins = {};

  if (mode === 'battle_dungeon') {
    showDungeonMenu();
    return;
  }

  if (mode === 'story') {
    const savedStoryStr = localStorage.getItem('mini_card_battle_story_save');
    if (savedStoryStr) {
      try {
        JSON.parse(savedStoryStr);
        GameState.appState = 'story_resume';
        switchScreen('screen-story-resume');
        return;
      } catch (e) {
        console.error('Save data parse error', e);
        clearStoryProgress();
      }
    }
  }

  if (mode === 'campaign') {
    const savedCampaignStr = localStorage.getItem(
      'mini_card_battle_campaign_save'
    );
    if (savedCampaignStr) {
      try {
        JSON.parse(savedCampaignStr);
        GameState.appState = 'story_resume'; // Reusing story resume screen
        switchScreen('screen-story-resume');
        return;
      } catch (e) {
        console.error('Campaign save data parse error', e);
      }
    }

    // No valid save found, start new campaign
    initCampaignMode();
    return;
  }

  if (mode === 'tournament') {
    const savedTournament = localStorage.getItem(
      'mini_card_battle_tournament_save'
    );
    if (savedTournament) {
      GameState.appState = 'tournament_resume';
      switchScreen('screen-tournament-resume');
      return;
    }
  }

  // 以下はストーリー/キャンペーン/トーナメント（再開なし）/ダンジョン以外の処理
  GameState.appState = 'select_deck';
  // デッキ選択画面遷移前に最新状態のデッキをリロードし、強制再描画を要求する
  if (typeof window.loadDeck === 'function') window.loadDeck();
  if (window.forceUpdateDeckList) window.forceUpdateDeckList();
  switchScreen('screen-deck-list');
}

export async function performFadeTransition(action) {
  if (GameState.isProcessing) return;
  GameState.isProcessing = true;

  const getFadeLayer = () =>
    document.getElementById('app-fade-layer') ||
    document.getElementById('fade-overlay');
  let fade = getFadeLayer();

  try {
    if (fade) {
      fade.style.display = 'block';
      fade.offsetHeight; // Force reflow
      fade.classList.add('active');
      await sleep(650);
    }

    if (action) {
      await action();
    }

    // Reactの再描画などを確実に待機
    await new Promise((resolve) =>
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            resolve();
          }, 100);
        });
      })
    );

    // アクション（switchScreenなど）によってDOMが再構築された可能性を考慮し、フェード要素を再取得
    fade = getFadeLayer();
    if (fade) {
      fade.classList.remove('active');
      await sleep(650);
      fade.style.display = 'none';
      console.log('performFadeTransition: Fading out DONE (display: none set)');
    }
  } catch (err) {
    console.error('Fade Transition Error:', err);
  } finally {
    GameState.isProcessing = false;
    if (typeof window.debugLog === 'function') window.debugLog('Fade End.');
    console.log('performFadeTransition: FINALLY block executed.');
  }
}

export function initSelectScreen() {
  if (window.initSelectScreenReact) window.initSelectScreenReact();
}

export function showCharDetail(charId) {
  GameState.pendingCharId = charId;
  const char = CHARACTERS[charId];
  if (window.showCharDetailModal) {
    window.showCharDetailModal(char);
  }
}

export function closeCharDetail() {
  if (window.closeCharDetailModal) {
    window.closeCharDetailModal();
  }
}

export function showEventMenu() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmTitle);
  switchScreen('screen-event-menu');
}

export function startHighDifficulty() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmHighDifficulty);
  switchScreen('screen-high-difficulty-menu');
}

export function showHighDifficultyRules() {
  playSound(SOUNDS.seClick);
  switchScreen('screen-high-difficulty-rules');
}

export function handleSatanBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_satan');
}

export function handleAndroidHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_android_high');
}

export function handleDragonHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_dragon_high');
}

export function handleKnightHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_knight_high');
}

export function handleCthulhuHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_cthulhu_high');
}
export function handleElfHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_elf_high');
}
export function handleClericHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_cleric_high');
}
window.startEventClericHighHook = () => {
  startGameMode('event_cleric_high');
};

export function handleDevilhunterHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_devilhunter_high');
}

export function handleWitchHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_witch_high');
}

export function handleOniHighBattle() {
  playSound(SOUNDS.seClick);
  startGameMode('event_oni_high');
}

window.startHighOniEvent = () => {
  playSound(SOUNDS.seSelect);
  startGameMode('event_oni_high');
};

export async function showDefenseMenu() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmDefense);
  const hasRegistered =
    localStorage.getItem('mini_card_battle_deck_defense') !== null;
  const startBtn = document.getElementById('btn-start-attack');
  const disabledBtn = document.getElementById('btn-start-attack-disabled');

  if (startBtn && disabledBtn) {
    if (hasRegistered) {
      startBtn.style.display = 'block';
      disabledBtn.style.display = 'none';
    } else {
      startBtn.style.display = 'none';
      disabledBtn.style.display = 'block';
    }
  }
  switchScreen('screen-defense-menu');

  if (hasRegistered) {
    try {
      const response = await fetch(`api/get_player_decks.php?t=${Date.now()}`);
      const result = await response.json();
      if (result.success) {
        const myUuid = getOrCreateUUID();
        const myData = result.players.find((p) => p.uuid === myUuid);
        if (myData) {
          const wins = myData.defense_wins || 0;
          const pts = myData.points || 0;
          const totalPts = myData.total_points || pts;

          const localPts =
            parseInt(localStorage.getItem('mini_card_battle_defense_points')) ||
            0;
          const localTotalPts =
            parseInt(
              localStorage.getItem('mini_card_battle_defense_total_points')
            ) || 0;

          // サーバーの値が0でローカルに値がある場合は、サーバーの初期化ミスと判断して上書きを避ける
          const finalPts = pts === 0 && localPts > 0 ? localPts : pts;
          const finalTotalPts =
            totalPts === 0 && localTotalPts > 0 ? localTotalPts : totalPts;

          const lastWins =
            parseInt(localStorage.getItem('mini_card_battle_defense_wins')) ||
            0;
          const newWinsCount = wins - lastWins;

          if (newWinsCount > 0) {
            if (typeof window.incrementStat === 'function') {
              window.incrementStat('defenseWins', null, newWinsCount);
            }
            showAlertModal(
              `防衛に ${newWinsCount} 回新しく成功しました！\n現在の防衛ポイント: ${finalPts} Pt`,
              () => {}
            );
          }
          localStorage.setItem('mini_card_battle_defense_points', finalPts);
          localStorage.setItem(
            'mini_card_battle_defense_total_points',
            finalTotalPts
          );
          localStorage.setItem('mini_card_battle_defense_wins', wins);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}

export function showDungeonMenu() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmChallenge);
  switchScreen('screen-dungeon-menu');
}

export function showDungeonRules() {
  playSound(SOUNDS.seClick);
  switchScreen('screen-dungeon-rules');
}

export async function showDefenseBattleList() {
  playSound(SOUNDS.seClick);
  switchScreen('screen-defense-battle-list');
}

export async function startAttackBattle(enemyPlayerData) {
  playSound(SOUNDS.seClick);

  try {
    // デッキデータをロード（ENEMY_DECKS['player_defense']に登録される）
    await loadPlayerDeck(enemyPlayerData.uuid);

    GameState.gameMode = 'defense_attack';
    GameState.aiLevel = 3; // 防衛戦のAIは常に上級（レベル3）固定

    // 敵の設定を保存
    GameState.enemyConfig = {
      ...(CHARACTERS[enemyPlayerData.character] || CHARACTERS.android),
    };
    GameState.enemyConfig.playerName = enemyPlayerData.name;
    GameState.enemyConfig.uuid = enemyPlayerData.uuid;
    GameState.enemyConfig.points = enemyPlayerData.points || 0;
    GameState.enemyConfig.total_points =
      enemyPlayerData.total_points || enemyPlayerData.points || 0;
    GameState.enemyConfig.calculatedWinPoints =
      enemyPlayerData.calculatedWinPoints; // リスト表示時の計算結果
    GameState.enemyConfig.stageId = enemyPlayerData.stage;
    GameState.enemyConfig.playmat = enemyPlayerData.playmat; // 追加

    // --- 敵のスキン情報の反映 ---
    const skinIdToUse = enemyPlayerData.skin || 'default';
    if (typeof getSkinImage === 'function') {
      GameState.enemyConfig.image = getSkinImage(
        GameState.enemyConfig,
        skinIdToUse,
        'image'
      );
      GameState.enemyConfig.imageLose = getSkinImage(
        GameState.enemyConfig,
        skinIdToUse,
        'imageLose'
      );
      GameState.enemyConfig.icon = getSkinImage(
        GameState.enemyConfig,
        skinIdToUse,
        'icon'
      );
    }

    // 前モードの敵スキン設定をクリアし、漏洩を防ぐ
    GameState.enemySkins = {};
    GameState.enemySkins[GameState.enemyConfig.id] = skinIdToUse;
    // トークン画像等の正しい表示のため、敵のスキン設定全体をマージする
    if (enemyPlayerData.skins && typeof enemyPlayerData.skins === 'object') {
      Object.assign(GameState.enemySkins, enemyPlayerData.skins);
    }

    GameState.selectedStageId = enemyPlayerData.stage || 'plain'; // バトル背景として設定

    // 自分の使用するデッキを選択するためデッキ一覧画面から開始
    GameState.appState = 'select_deck';
    if (typeof window.loadDeck === 'function') window.loadDeck();
    if (window.forceUpdateDeckList) window.forceUpdateDeckList();
    switchScreen('screen-deck-list');
  } catch (err) {
    console.error('Failed to start attack battle:', err);
    showAlertModal('対戦データの読み込みに失敗しました。');
  }
}

export function showDefenseRules() {
  playSound(SOUNDS.seClick);
  switchScreen('screen-defense-rules');
}

export function startDefenseRegistration() {
  playSound(SOUNDS.seClick);
  GameState.gameMode = 'defense_register';
  // 防衛デッキ新規登録時はプレイヤースキンをリセットし、デフォルト状態で選べるようにする
  GameState.playerSkins = {};

  if (window.showPlayerNameModalState) {
    window.showPlayerNameModalState((name) => {
      GameState.playerName = name || 'プレイヤー';
      GameState.appState = 'select_player';
      initSelectScreen(false);
      switchScreen('screen-select');
    });
  } else {
    GameState.appState = 'select_player';
    initSelectScreen(false);
    switchScreen('screen-select');
  }
}

export function closePlayerNameModal() {
  playSound(SOUNDS.seClick);
  if (window.closePlayerNameModalState) {
    window.closePlayerNameModalState();
  } else {
    const modal = document.getElementById('modal-player-name');
    if (modal) modal.style.display = 'none';
  }
}

export function startDefenseBattle() {
  showDefenseMenu();
}

export function confirmCharSelect() {
  playSound(SOUNDS.seClick);
  if (GameState.appState === 'create_deck_select_char') {
    const charId = GameState.pendingCharId;
    const chosenSkin = GameState.playerSkins[charId];
    const deckIndex = createNewDeck(charId);
    if (deckIndex !== false) {
      GameState.currentDeckIndex = deckIndex;
      if (chosenSkin) {
        if (!GameState.decks[deckIndex].playerSkins)
          GameState.decks[deckIndex].playerSkins = {};
        GameState.decks[deckIndex].playerSkins[charId] = chosenSkin;
        localStorage.setItem(
          'mini_card_battle_decks',
          JSON.stringify(GameState.decks)
        );
      }
      loadDeck();
      switchScreen('screen-deck-edit');
    } else {
      showAlertModal('デッキは最大10個までです。');
    }
    return;
  }

  if (
    GameState.appState === 'select_player' ||
    GameState.appState === 'select_deck'
  ) {
    if (GameState.gameMode === 'practice') {
      GameState.playerConfig = CHARACTERS[GameState.pendingCharId];
      GameState.appState = 'select_enemy_deck';
      if (window.forceUpdateDeckList) window.forceUpdateDeckList();
      return;
    } else if (GameState.gameMode === 'story') {
      GameState.appState = 'select_difficulty';
      switchScreen('screen-difficulty');
      updateDifficultyCheckButtons();
    } else if (GameState.gameMode === 'event_satan') {
      // 高難易度サタン戦専用の導入へ
      initEventSatanMode(GameState.pendingCharId);
    } else if (
      GameState.gameMode.startsWith('event_') &&
      GameState.gameMode.endsWith('_high')
    ) {
      const enemyCharId = GameState.gameMode
        .replace('event_', '')
        .replace('_high', '');
      initHighDifficultyEventMode(GameState.pendingCharId, enemyCharId);
    } else if (GameState.gameMode === 'tournament') {
      GameState.playerConfig = CHARACTERS[GameState.pendingCharId];
      initTournamentMode();
    } else if (GameState.gameMode === 'free_deck_edit') {
      // マイデッキ編集時はそのままデッキ編成画面へ移行
      switchScreen('screen-deck-edit');
    } else if (
      GameState.gameMode === 'defense_register' ||
      GameState.gameMode === 'online_deck_edit'
    ) {
      // 防衛登録 / オンライン：ステージ選択を省略してすぐデッキ編集へ移行
      GameState.playerConfig = CHARACTERS[GameState.pendingCharId];
      const chosenSkin = GameState.playerSkins[GameState.pendingCharId];
      startBattleFlow();
      if (chosenSkin) {
        GameState.playerSkins[GameState.pendingCharId] = chosenSkin;
        if (
          GameState.gameMode === 'defense_register' &&
          GameState.defenseDeck
        ) {
          if (!GameState.defenseDeck.playerSkins)
            GameState.defenseDeck.playerSkins = {};
          GameState.defenseDeck.playerSkins[GameState.pendingCharId] =
            chosenSkin;
          if (!GameState.decks) GameState.decks = [];
          GameState.decks[0] = GameState.defenseDeck;
          localStorage.setItem(
            'mini_card_battle_defense_deck_obj',
            JSON.stringify(GameState.defenseDeck)
          );
        }
        if (
          GameState.decks &&
          GameState.currentDeckIndex >= 0 &&
          GameState.decks.length > GameState.currentDeckIndex
        ) {
          if (!GameState.decks[GameState.currentDeckIndex].playerSkins) {
            GameState.decks[GameState.currentDeckIndex].playerSkins = {};
          }
          GameState.decks[GameState.currentDeckIndex].playerSkins[
            GameState.pendingCharId
          ] = chosenSkin;
          if (
            GameState.gameMode !== 'defense_register' &&
            GameState.gameMode !== 'battle_dungeon'
          ) {
            localStorage.setItem(
              'mini_card_battle_decks',
              JSON.stringify(GameState.decks)
            );
          }
        }
        setTimeout(() => {
          if (typeof renderDeckEdit === 'function') renderDeckEdit();
        }, 50);
      }
    } else if (GameState.gameMode === 'defense_attack') {
      // 攻撃側：キャラクター選択後は対戦相手選択をスキップして即デッキ編成へ
      GameState.playerConfig = CHARACTERS[GameState.pendingCharId];
      startBattleFlow();
    } else {
      GameState.playerConfig = CHARACTERS[GameState.pendingCharId];
      GameState.appState = 'select_enemy';
      initSelectScreen(false);
      switchScreen('screen-select');
    }
  } else if (GameState.appState === 'select_enemy_deck') {
    GameState.enemyConfig = { ...CHARACTERS[GameState.pendingCharId] };
    const enemyDeckData = GameState.decks[GameState.practiceEnemyDeckIndex];
    const skinIdToUse =
      enemyDeckData.playerSkins?.[GameState.pendingCharId] || 'default';
    // startGameMode で enemySkins は既にリセット済み
    if (!GameState.enemySkins) GameState.enemySkins = {}; // フォールバック
    GameState.enemySkins[GameState.pendingCharId] = skinIdToUse;

    if (typeof getSkinImage === 'function') {
      GameState.enemyConfig.image = getSkinImage(
        GameState.enemyConfig,
        skinIdToUse,
        'image'
      );
      GameState.enemyConfig.imageLose = getSkinImage(
        GameState.enemyConfig,
        skinIdToUse,
        'imageLose'
      );
      GameState.enemyConfig.icon = getSkinImage(
        GameState.enemyConfig,
        skinIdToUse,
        'icon'
      );
    }

    GameState.aiLevel = 3;
    confirmStageSelect('practice');
  } else if (GameState.appState === 'select_enemy') {
    GameState.enemyConfig = CHARACTERS[GameState.pendingCharId];
    GameState.appState = 'select_difficulty';
    switchScreen('screen-difficulty');
    updateDifficultyCheckButtons();
  }
}

export function confirmDifficulty(level) {
  playSound(SOUNDS.seClick);
  GameState.aiLevel = level;
  GameState.storyDifficulty = level;
  if (GameState.gameMode === 'story') {
    initStoryMode(GameState.pendingCharId);
  } else if (GameState.gameMode === 'defense_attack') {
    // 攻撃側：難易度選択の後はステージを敵の設定からロード（またはランダム）
    GameState.selectedStageId = GameState.enemyConfig.stageId || 'plain';
    startBattleFlow();
  } else {
    GameState.appState = 'select_stage';
    initStageSelectScreen();
    switchScreen('screen-stage-select');
  }
}

export function initStageSelectScreen() {
  // StageSelectScreen.jsx handles the rendering natively.
}

export function confirmStageSelect(stageId) {
  playSound(SOUNDS.seClick);
  if (stageId === 'random') {
    const bgIds = Object.keys(STAGES);
    GameState.selectedStageId = bgIds[Math.floor(Math.random() * bgIds.length)];
  } else {
    GameState.selectedStageId = stageId;
  }

  if (GameState.gameMode === 'defense_register') {
    // 防衛登録：ステージ選択の後はデータ保存処理へ
    if (window.submitDefenseDeckWrapper) {
      window.submitDefenseDeckWrapper(GameState.playerName || 'プレイヤー');
    } else if (typeof window.submitDefenseDeck === 'function') {
      window.submitDefenseDeck(GameState.playerName || 'プレイヤー');
    }
  } else if (GameState.gameMode === 'online_deck_edit') {
    // ステージ選択が完了したので最新状態をオンライン設定として保存
    const settings = {
      leaderId: GameState.playerConfig?.id || 'android',
      stage: GameState.selectedStageId || 'plain',
      deckId:
        GameState.decks && GameState.decks[GameState.currentDeckIndex]
          ? GameState.decks[GameState.currentDeckIndex].id
          : null,
    };
    localStorage.setItem(
      'mini_card_battle_online_last_settings',
      JSON.stringify(settings)
    );

    GameState.appState = 'online';
    if (typeof window.showOnlineLobby === 'function') {
      window.showOnlineLobby();
    } else {
      switchScreen('screen-online-lobby');
    }
  } else if (GameState.gameMode === 'practice') {
    performFadeTransition(() => {
      GameState.battleCount = 1;
      GameState.appState = 'battle';
      GameState.currentDeckIndex = GameState.practicePlayerDeckIndex;
      loadDeck();
      prepareBattle();
    });
  } else {
    performFadeTransition(() => {
      GameState.battleCount = 1;
      GameState.appState = 'pre_dialogue';
      GameState.dialogueQueue = [
        {
          speaker: 'enemy',
          text:
            getDialogue(
              GameState.enemyConfig,
              GameState.playerConfig,
              'intro',
              'enemy'
            ) || '・・・・',
        },
        {
          speaker: 'player',
          text:
            getDialogue(
              GameState.playerConfig,
              GameState.enemyConfig,
              'intro',
              'player'
            ) || '・・・・',
        },
      ];
      setupDialogueScreen();
    });
  }
}

// --- 交換所関連ロジック ---

export let exchangeDebugClickCount = 0;

export function showExchangeScreen() {
  playSound(SOUNDS.seClick);
  exchangeDebugClickCount = 0;
  switchScreen('screen-exchange');
  renderExchange();

  // デバッグ用：タイトル10回クリックで100pt付与
  const titleEl = document.getElementById('exchange-title');
  if (titleEl) {
    titleEl.onclick = () => {
      exchangeDebugClickCount++;
      if (exchangeDebugClickCount >= 10) {
        exchangeDebugClickCount = 0;
        playSound(SOUNDS.seSkill);
        let currentPoints =
          parseInt(localStorage.getItem('mini_card_battle_defense_points')) ||
          0;
        let totalPoints =
          parseInt(
            localStorage.getItem('mini_card_battle_defense_total_points')
          ) || 0;
        currentPoints += 100;
        totalPoints += 100;
        localStorage.setItem('mini_card_battle_defense_points', currentPoints);
        localStorage.setItem(
          'mini_card_battle_defense_total_points',
          totalPoints
        );
        showAlertModal('【デバッグ】ポイントを100Pt獲得しました！', () =>
          renderExchange()
        );
      }
    };
  }
}

export let renderExchangeHook = null;
export function setRenderExchangeHook(h) {
  renderExchangeHook = h;
}
export function renderExchange() {
  if (renderExchangeHook) return renderExchangeHook();
}
export function executeRenderExchange() {
  // Legacy mapping removed. ExchangeScreen.jsx handles rendering smoothly.
}

export let pendingExchange = null;

export function showExchangeDetail(
  id,
  type,
  cost,
  itemObj,
  canExchange,
  isMaxed
) {
  playSound(SOUNDS.seClick);
  pendingExchange = { id, type, cost };
  if (window.showExchangeDetailModal) {
    window.showExchangeDetailModal({
      id,
      type,
      cost,
      itemObj,
      canExchange,
      isMaxed,
    });
  }
}

export function closeExchangeDetail() {
  playSound(SOUNDS.seClick);
  pendingExchange = null;
  if (window.closeExchangeDetailModal) window.closeExchangeDetailModal();
}

export function confirmExchange() {
  if (!pendingExchange) return;
  const { id, type, cost } = pendingExchange;

  playSound(SOUNDS.seClick);
  let currentPoints =
    parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;

  if (currentPoints < cost) {
    showAlertModal('ポイントが足りません！');
    return;
  }

  // Double clear pending exchange to avoid double clicks
  pendingExchange = null;
  closeExchangeDetail();

  // 交換処理
  let currentPointsInner =
    parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
  if (currentPointsInner < cost) return;

  currentPointsInner -= cost;
  localStorage.setItem('mini_card_battle_defense_points', currentPointsInner);

  // サーバーに同機
  const myUuid = getOrCreateUUID();
  const totalPointsInner =
    parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) ||
    currentPointsInner;
  fetch('api/update_points.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uuid: myUuid,
      points: currentPointsInner,
      total_points: totalPointsInner,
    }),
  }).catch((err) => console.error('Failed to sync points to server:', err));

  if (type === 'premium') {
    if (!GameState.unlockedPremiumCards.includes(id))
      GameState.unlockedPremiumCards.push(id);
    localStorage.setItem(
      'mini_card_battle_unlocked_premium',
      JSON.stringify(GameState.unlockedPremiumCards)
    );
    playSound(SOUNDS.seSkill);
    showAlertModal(
      `プレミアム特典を解放しました！\n（デッキ編成画面で切り替えられます）`,
      () => renderExchange()
    );
  } else {
    GameState.playerInventory[id] = (GameState.playerInventory[id] || 0) + 1;
    localStorage.setItem(
      'mini_card_battle_inventory',
      JSON.stringify(GameState.playerInventory)
    );
    playSound(SOUNDS.seSkill);
    showAlertModal(
      `カードを獲得しました！\n（デッキ編成画面で登録できます）`,
      () => renderExchange()
    );
  }
}

/**
 * 敵のデッキプレビューを表示
 */
export function openEnemyDeckPreview(level) {
  if (
    GameState.gameMode === 'battle_dungeon' &&
    GameState.enemyConfig &&
    GameState.enemyConfig.dungeonDeck
  ) {
    const titleText = `${GameState.enemyConfig.name} [上級]`;
    if (window.showEnemyDeckModal) {
      window.showEnemyDeckModal(GameState.enemyConfig.dungeonDeck, titleText);
    }
    return;
  }

  if (!GameState.enemyConfig || !ENEMY_DECKS[GameState.enemyConfig.id]) {
    if (window.showAlertModalHook)
      window.showAlertModalHook(
        'このキャラクターのデッキデータが見つかりません。'
      );
    return;
  }

  const levelKeys = { 1: 'easy', 2: 'normal', 3: 'hard' };
  const key = levelKeys[level];
  const deckIds = ENEMY_DECKS[GameState.enemyConfig.id][key];

  if (!deckIds || deckIds.length === 0) {
    if (window.showAlertModalHook)
      window.showAlertModalHook('該難易度のデッキデータが空です。');
    return;
  }

  const titleText = `${GameState.enemyConfig.name} [${level === 1 ? '初級' : level === 2 ? '中級' : '上級'}]`;
  if (window.showEnemyDeckModal) {
    window.showEnemyDeckModal(deckIds, titleText);
  }
}

export let closeEnemyDeckModalHook = null;
export function setCloseEnemyDeckModalHook(h) {
  closeEnemyDeckModalHook = h;
}
export function closeEnemyDeckModal() {
  if (closeEnemyDeckModalHook) return closeEnemyDeckModalHook();
  if (window.closeEnemyDeckPreviewHook) {
    window.closeEnemyDeckPreviewHook();
    return;
  }
  const modal = document.getElementById('modal-enemy-deck');
  if (modal) {
    modal.style.display = 'none';
    playSound(SOUNDS.seClick);
  }
}

export function updateDifficultyCheckButtons() {
  const showChecks = GameState.gameMode === 'free';
  document.querySelectorAll('.btn-check-deck').forEach((btn) => {
    btn.style.display = showChecks ? 'flex' : 'none';
  });
}

// --- Online Routing ---
export function showOnlineMenu() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmOnline);
  switchScreen('screen-online-menu');
}
export function showOnlineRules() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmOnline);
  switchScreen('screen-online-rules');
}
export function showOnlineSearch() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmOnline);
  switchScreen('screen-online-search');
}
export function showOnlineLobby() {
  playSound(SOUNDS.seClick);
  playSound(AUDIO_INSTANCES.bgmOnline);
  setPlayerReadyOnly(false); // バトル終了後などにルームへ戻った際は準備完了状態を解除
  switchScreen('screen-online-lobby');
}

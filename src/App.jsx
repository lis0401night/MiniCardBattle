import React, { useState, useEffect, useRef } from 'react';
import GlobalModals from './components/GlobalModals.jsx';
import DamageOverlay from './components/common/DamageOverlay.jsx';
import TitleScreen from './pages/TitleScreen.jsx';
import ModeSelectScreen from './pages/ModeSelectScreen.jsx';
import RulesScreen from './pages/RulesScreen.jsx';
import OptionsScreen from './pages/OptionsScreen.jsx';
import GalleryMenuScreen from './pages/GalleryMenuScreen.jsx';
import EventMenuScreen from './pages/EventMenuScreen.jsx';
import DefenseMenuScreen from './pages/DefenseMenuScreen.jsx';
import DefenseRulesScreen from './pages/DefenseRulesScreen.jsx';
import HighDifficultyScreen from './pages/HighDifficultyScreen.jsx';
import HighDifficultyRulesScreen from './pages/HighDifficultyRulesScreen.jsx';
import DungeonMenuScreen from './pages/DungeonMenuScreen.jsx';
import DungeonRulesScreen from './pages/DungeonRulesScreen.jsx';
import CardListScreen from './pages/CardListScreen.jsx';
import AchievementsScreen from './pages/AchievementsScreen.jsx';
import ExchangeScreen from './pages/ExchangeScreen.jsx';
import ChallengeExchangeScreen from './pages/ChallengeExchangeScreen.jsx';
import ChallengeUnlockScreen from './pages/ChallengeUnlockScreen.jsx';
import DefenseBattleListScreen from './pages/DefenseBattleListScreen.jsx';
import DeckEditorScreen from './pages/DeckEditorScreen.jsx';
import CharacterSelectScreen from './pages/CharacterSelectScreen.jsx';
import DifficultySelectScreen from './pages/DifficultySelectScreen.jsx';
import StageSelectScreen from './pages/StageSelectScreen.jsx';
import DialogueScreen from './pages/DialogueScreen.jsx';
import BattleScreen from './pages/BattleScreen.jsx';
import BattleDungeonScreen from './pages/BattleDungeonScreen.jsx';
import OnlineMenuScreen from './pages/OnlineMenuScreen.jsx';
import { playSound, sleep, isTransitioning, switchScreen, setSwitchScreenHook, executeSwitchScreen, hasSkill } from './utils/gameUtils.js';
import { SOUNDS } from './utils/sounds.js';
import { checkWinCondition, discardCard, endTurnLogic, playCard, returnToTitle, showEnemySkillConfirm, showSkillConfirm, endPlayerTurn, closeSkillConfirm, executeSkillFromConfirm, showSpeechBubble } from './hooks/battle.js';
import { loadDeck } from './hooks/deck.js';
import { checkCollectionAchievements } from './utils/constants/achievements.js';
import { GameState } from './hooks/gameState.js';
import { updateCardDetail, renderBoard } from './hooks/uiBattle.js';
import { showConfirmModal } from './hooks/uiModals.js';
import ContinueScreen from './pages/ContinueScreen.jsx';
import EndingScreen from './pages/EndingScreen.jsx';
import RewardOverlay from './components/battle/RewardOverlay.jsx';
import CutinOverlay from './components/battle/CutinOverlay.jsx';
import { handleClaimAchievement, debugUnlockCards, debugUnlockAchievements } from './hooks/uiGallery.js';
import { closeSyncDataModal, backupDataToXML, importDataFromXML, reloadGame, closePlayerNameModal, closeEnemyDeckModal } from './hooks/uiMainCore.js';
import { showNextDialogue, executeContinue, executeGameOver } from './hooks/uiDialogue.js';
import { submitDefenseDeck } from './hooks/deck.js';
// レガシーUI用に関数をグローバルに公開
window.returnToTitle = returnToTitle;
window.showEnemySkillConfirm = showEnemySkillConfirm;
window.showSkillConfirm = showSkillConfirm;
window.endPlayerTurn = endPlayerTurn;
window.handleClaimAchievement = handleClaimAchievement;
window.debugUnlockCards = debugUnlockCards;
window.debugUnlockAchievements = debugUnlockAchievements;
window.checkCollectionAchievements = checkCollectionAchievements;
window.closeSyncDataModal = closeSyncDataModal;
window.backupDataToXML = backupDataToXML;
window.importDataFromXML = importDataFromXML;
window.reloadGame = reloadGame;
window.closePlayerNameModal = closePlayerNameModal;
window.closeEnemyDeckModal = closeEnemyDeckModal;
window.showNextDialogue = showNextDialogue;
window.executeContinue = executeContinue;
window.executeGameOver = executeGameOver;
window.closeSkillConfirm = closeSkillConfirm;
window.executeSkillFromConfirm = executeSkillFromConfirm;
window.submitDefenseDeck = submitDefenseDeck;
window.switchScreen = switchScreen;
window.playSound = playSound;
window.SOUNDS = SOUNDS;

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('screen-title');

  // レガシー部分のルーティング互換性（一部のみ残す）
  useEffect(() => {
    // 既存のグローバル関数をオーバーライドしてReactのStateと連携
    setSwitchScreenHook((screenId) => {
        setCurrentScreen(screenId);
        // Reactのレンダリングを待機してから遷移後処理を行うための遅延
        setTimeout(() => {
            executeSwitchScreen(screenId);
        }, 0);
    });

  }, []);

  // レガシー初期化イベントバインド
  useEffect(() => {
    // 既存のmain.jsのロジックを実行
    if (typeof loadDeck === 'function') loadDeck();
    if (typeof window.loadAchievements === 'function') window.loadAchievements();

    setTimeout(() => { 
        const titleScreen = document.getElementById('screen-title');
        if(titleScreen) titleScreen.classList.add('active'); 
    }, 100);
  }, []);

  return (
    <>
      {currentScreen === 'screen-title' && <TitleScreen />}
      {currentScreen === 'screen-mode-select' && <ModeSelectScreen />}
      {currentScreen === 'screen-rules' && <RulesScreen />}
      {currentScreen === 'screen-options' && <OptionsScreen />}
      {currentScreen === 'screen-gallery-menu' && <GalleryMenuScreen />}
      {currentScreen === 'screen-event-menu' && <EventMenuScreen />}
      {currentScreen === 'screen-defense-menu' && <DefenseMenuScreen />}
      {currentScreen === 'screen-defense-rules' && <DefenseRulesScreen />}
      {currentScreen === 'screen-high-difficulty' && <HighDifficultyScreen />}
      {currentScreen === 'screen-high-difficulty-rules' && <HighDifficultyRulesScreen />}
      {currentScreen === 'screen-card-list' && <CardListScreen />}
      {currentScreen === 'screen-achievements' && <AchievementsScreen />}
      {currentScreen === 'screen-exchange' && <ExchangeScreen />}
      {currentScreen === 'screen-challenge-exchange' && <ChallengeExchangeScreen />}
      {currentScreen === 'screen-challenge-unlock' && <ChallengeUnlockScreen />}
      {currentScreen === 'screen-defense-battle-list' && <DefenseBattleListScreen />}
      {currentScreen === 'screen-dungeon-menu' && <DungeonMenuScreen />}
      {currentScreen === 'screen-dungeon-rules' && <DungeonRulesScreen />}
      {currentScreen === 'screen-deck-edit' && <DeckEditorScreen />}
      {currentScreen === 'screen-select' && <CharacterSelectScreen />}
      {currentScreen === 'screen-difficulty' && <DifficultySelectScreen />}
      {currentScreen === 'screen-stage-select' && <StageSelectScreen />}
      {currentScreen === 'screen-dialogue' && <DialogueScreen />}
      {currentScreen === 'screen-battle' && <BattleScreen />}
      {currentScreen === 'screen-battle-dungeon' && <BattleDungeonScreen />}
      {currentScreen === 'screen-online-menu' && <OnlineMenuScreen />}
      {currentScreen === 'screen-continue' && <ContinueScreen />}
      {currentScreen === 'screen-ending-illust' && <EndingScreen />}
      <GlobalModals />
      <DamageOverlay />
      <RewardOverlay />
      <CutinOverlay />
      <div id="fade-overlay" className="fade-overlay"></div>
    </>
  );
}

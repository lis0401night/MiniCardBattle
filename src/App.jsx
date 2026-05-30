import { useState, useEffect } from 'react';
import GlobalModals from './components/GlobalModals.jsx';
import DamageOverlay from './components/common/DamageOverlay.jsx';
import TitleScreen from './pages/TitleScreen.jsx';
import ModeSelectScreen from './pages/ModeSelectScreen.jsx';
import SoloMenuScreen from './pages/SoloMenuScreen.jsx';
import RulesScreen from './pages/RulesScreen.jsx';
import BeginnerGuideScreen from './pages/BeginnerGuideScreen.jsx';
import TutorialSelectScreen from './pages/TutorialSelectScreen.jsx';
import OptionsScreen from './pages/OptionsScreen.jsx';
import GalleryMenuScreen from './pages/GalleryMenuScreen.jsx';
import EventMenuScreen from './pages/EventMenuScreen.jsx';
import TournamentMenuScreen from './pages/TournamentMenuScreen.jsx';
import TournamentResumeScreen from './pages/TournamentResumeScreen.jsx';
import TournamentExchangeScreen from './pages/TournamentExchangeScreen.jsx';
import TournamentRulesScreen from './pages/TournamentRulesScreen.jsx';
import TournamentBracketScreen from './pages/TournamentBracketScreen.jsx';
import DefenseMenuScreen from './pages/DefenseMenuScreen.jsx';
import DefenseRulesScreen from './pages/DefenseRulesScreen.jsx';
import HighDifficultyScreen from './pages/HighDifficultyScreen.jsx';
import HighDifficultyMenuScreen from './pages/HighDifficultyMenuScreen.jsx';
import HighDifficultyRulesScreen from './pages/HighDifficultyRulesScreen.jsx';

import DungeonMenuScreen from './pages/DungeonMenuScreen.jsx';
import StoryResumeScreen from './pages/StoryResumeScreen.jsx';
import DungeonRulesScreen from './pages/DungeonRulesScreen.jsx';
import CardListScreen from './pages/CardListScreen.jsx';
import AchievementsScreen from './pages/AchievementsScreen.jsx';
import DefenseExchangeScreen from './pages/DefenseExchangeScreen.jsx';
import ChallengeExchangeScreen from './pages/ChallengeExchangeScreen.jsx';
import ChallengeUnlockScreen from './pages/ChallengeUnlockScreen.jsx';
import DefenseBattleListScreen from './pages/DefenseBattleListScreen.jsx';
import DeckEditorScreen from './pages/DeckEditorScreen.jsx';
import DeckListScreen from './pages/DeckListScreen.jsx';
import CharacterSelectScreen from './pages/CharacterSelectScreen.jsx';
import DifficultySelectScreen from './pages/DifficultySelectScreen.jsx';
import StageSelectScreen from './pages/StageSelectScreen.jsx';
import DialogueScreen from './pages/DialogueScreen.jsx';
import BattleScreen from './pages/BattleScreen.jsx';
import BattleDungeonScreen from './pages/BattleDungeonScreen.jsx';
import OnlineMenuScreen from './pages/OnlineMenuScreen.jsx';
import OnlineRulesScreen from './pages/OnlineRulesScreen.jsx';
import OnlineRoomSearchScreen from './pages/OnlineRoomSearchScreen.jsx';
import OnlineLobbyScreen from './pages/OnlineLobbyScreen.jsx';
import {
  playSound,
  switchScreen,
  setSwitchScreenHook,
  executeSwitchScreen,
} from './utils/gameUtils.js';
import { SOUNDS } from './utils/sounds.js';
import {
  returnToTitle,
  endPlayerTurn,
  executeSkillFromConfirm,
} from './game/battle.js';
import {
  showEnemySkillConfirm,
  showSkillConfirm,
} from './services/uiBattle.js';
import { loadDeck } from './services/deck.js';
import ContinueScreen from './pages/ContinueScreen.jsx';
import EndingScreen from './pages/EndingScreen.jsx';
import DebugBattleScreen from './pages/DebugBattleScreen.jsx';
import RewardOverlay from './components/battle/RewardOverlay.jsx';
import CutinOverlay from './components/battle/CutinOverlay.jsx';
import VfxOverlay from './components/battle/VfxOverlay.jsx';
import {
  showNextDialogue,
  executeContinue,
  executeGameOver,
} from './services/uiDialogue.js';
import { submitDefenseDeck } from './services/deck.js';
// TODO: レガシーコードからのReact完全移行後に、このwindowグローバルへの公開ブロックを段階的に縮小・撤廃する予定。
// レガシーUI用に関数をグローバルに公開
window.returnToTitle = returnToTitle;
window.showEnemySkillConfirm = showEnemySkillConfirm;
window.showSkillConfirm = showSkillConfirm;
window.endPlayerTurn = endPlayerTurn;
window.showNextDialogue = showNextDialogue;
window.executeContinue = executeContinue;
window.executeGameOver = executeGameOver;
window.executeSkillFromConfirm = executeSkillFromConfirm;
window.submitDefenseDeck = submitDefenseDeck;
window.switchScreen = switchScreen;
window.playSound = playSound;
window.SOUNDS = SOUNDS;

const SCREEN_COMPONENTS = {
  'screen-title': TitleScreen,
  'screen-mode-select': ModeSelectScreen,
  'screen-solo-menu': SoloMenuScreen,
  'screen-rules': RulesScreen,
  'screen-beginner-guide': BeginnerGuideScreen,
  'screen-tutorial-select': TutorialSelectScreen,
  'screen-options': OptionsScreen,
  'screen-gallery-menu': GalleryMenuScreen,
  'screen-event-menu': EventMenuScreen,
  'screen-tournament-menu': TournamentMenuScreen,
  'screen-tournament-resume': TournamentResumeScreen,
  'screen-tournament-exchange': TournamentExchangeScreen,
  'screen-tournament-rules': TournamentRulesScreen,
  'screen-tournament-bracket': TournamentBracketScreen,
  'screen-defense-menu': DefenseMenuScreen,
  'screen-defense-rules': DefenseRulesScreen,
  'screen-high-difficulty-menu': HighDifficultyMenuScreen,
  'screen-high-difficulty': HighDifficultyScreen,
  'screen-high-difficulty-rules': HighDifficultyRulesScreen,
  'screen-card-list': CardListScreen,
  'screen-achievements': AchievementsScreen,
  'screen-exchange': DefenseExchangeScreen,
  'screen-challenge-exchange': ChallengeExchangeScreen,
  'screen-challenge-unlock': ChallengeUnlockScreen,
  'screen-defense-battle-list': DefenseBattleListScreen,
  'screen-dungeon-menu': DungeonMenuScreen,
  'screen-story-resume': StoryResumeScreen,
  'screen-dungeon-rules': DungeonRulesScreen,
  'screen-deck-list': DeckListScreen,
  'screen-deck-edit': DeckEditorScreen,
  'screen-select': CharacterSelectScreen,
  'screen-difficulty': DifficultySelectScreen,
  'screen-stage-select': StageSelectScreen,
  'screen-dialogue': DialogueScreen,
  'screen-battle': BattleScreen,
  'screen-battle-dungeon': BattleDungeonScreen,
  'screen-online-menu': OnlineMenuScreen,
  'screen-online-rules': OnlineRulesScreen,
  'screen-online-search': OnlineRoomSearchScreen,
  'screen-online-lobby': OnlineLobbyScreen,
  'screen-continue': ContinueScreen,
  'screen-ending-illust': EndingScreen,
  'screen-debug-battle': DebugBattleScreen,
};

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
    if (typeof window.loadAchievements === 'function')
      window.loadAchievements();
  }, []);

  const ScreenComponent = SCREEN_COMPONENTS[currentScreen];

  return (
    <>
      {ScreenComponent && <ScreenComponent />}
      <GlobalModals />
      <DamageOverlay />
      <RewardOverlay />
      <CutinOverlay />
      <VfxOverlay />
      <div id="fade-overlay" className="fade-overlay"></div>
    </>
  );
}

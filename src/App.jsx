import { useEffect, useRef, useState } from 'react';

import GlobalModals from './components/GlobalModals.jsx';
import DamageOverlay from './components/common/DamageOverlay.jsx';
import BeginnerGuideScreen from './pages/BeginnerGuideScreen.jsx';
import DefenseMenuScreen from './pages/DefenseMenuScreen.jsx';
import DefenseRulesScreen from './pages/DefenseRulesScreen.jsx';
import EventMenuScreen from './pages/EventMenuScreen.jsx';
import GalleryMenuScreen from './pages/GalleryMenuScreen.jsx';
import HighDifficultyMenuScreen from './pages/HighDifficultyMenuScreen.jsx';
import HighDifficultyRulesScreen from './pages/HighDifficultyRulesScreen.jsx';
import HighDifficultyScreen from './pages/HighDifficultyScreen.jsx';
import ModeSelectScreen from './pages/ModeSelectScreen.jsx';
import OptionsScreen from './pages/OptionsScreen.jsx';
import RulesScreen from './pages/RulesScreen.jsx';
import SoloMenuScreen from './pages/SoloMenuScreen.jsx';
import TitleScreen from './pages/TitleScreen.jsx';
import TournamentBracketScreen from './pages/TournamentBracketScreen.jsx';
import TournamentExchangeScreen from './pages/TournamentExchangeScreen.jsx';
import TournamentMenuScreen from './pages/TournamentMenuScreen.jsx';
import TournamentResumeScreen from './pages/TournamentResumeScreen.jsx';
import TournamentRulesScreen from './pages/TournamentRulesScreen.jsx';
import TutorialSelectScreen from './pages/TutorialSelectScreen.jsx';

import CutinOverlay from './components/battle/CutinOverlay.jsx';
import MatchingScreen from './components/battle/MatchingScreen.jsx';
import RewardOverlay from './components/battle/RewardOverlay.jsx';
import VfxOverlay from './components/battle/VfxOverlay.jsx';
import {
  endPlayerTurn,
  executeSkillFromConfirm,
  returnToTitle,
} from './game/battle.js';
import AchievementsScreen from './pages/AchievementsScreen.jsx';
import BattleDungeonScreen from './pages/BattleDungeonScreen.jsx';
import BattleScreen from './pages/BattleScreen.jsx';
import CardListScreen from './pages/CardListScreen.jsx';
import ChallengeExchangeScreen from './pages/ChallengeExchangeScreen.jsx';
import ChallengeRankingScreen from './pages/ChallengeRankingScreen.jsx';
import ChallengeUnlockScreen from './pages/ChallengeUnlockScreen.jsx';
import CharacterSelectScreen from './pages/CharacterSelectScreen.jsx';
import ContinueScreen from './pages/ContinueScreen.jsx';
import DebugBattleScreen from './pages/DebugBattleScreen.jsx';
import DeckEditorScreen from './pages/DeckEditorScreen.jsx';
import DeckListScreen from './pages/DeckListScreen.jsx';
import DefenseBattleListScreen from './pages/DefenseBattleListScreen.jsx';
import DefenseExchangeScreen from './pages/DefenseExchangeScreen.jsx';
import DefenseRankingScreen from './pages/DefenseRankingScreen.jsx';
import DialogueScreen from './pages/DialogueScreen.jsx';
import DifficultySelectScreen from './pages/DifficultySelectScreen.jsx';
import DungeonMenuScreen from './pages/DungeonMenuScreen.jsx';
import DungeonRulesScreen from './pages/DungeonRulesScreen.jsx';
import EndingScreen from './pages/EndingScreen.jsx';
import OnlineLobbyScreen from './pages/OnlineLobbyScreen.jsx';
import OnlineMenuScreen from './pages/OnlineMenuScreen.jsx';
import OnlineRoomSearchScreen from './pages/OnlineRoomSearchScreen.jsx';
import OnlineRulesScreen from './pages/OnlineRulesScreen.jsx';
import StageSelectScreen from './pages/StageSelectScreen.jsx';
import StoryResumeScreen from './pages/StoryResumeScreen.jsx';
import TournamentRankingScreen from './pages/TournamentRankingScreen.jsx';
import { loadDeck, submitDefenseDeck } from './services/deck.js';
import {
  showEnemySkillConfirm,
  showSkillConfirm,
} from './services/uiBattle.js';
import {
  executeContinue,
  executeGameOver,
  showNextDialogue,
} from './services/uiDialogue.js';
import { appendVersionQuery } from './utils/constants/config.js';
import {
  executeSwitchScreen,
  playSound,
  setSwitchScreenHook,
  switchScreen,
} from './utils/gameUtils.js';
import { SOUNDS } from './utils/sounds.js';
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
window.playSound = playSound;
window.SOUNDS = SOUNDS;

const LoadingScreen = ({ loadingText }) => (
  <div
    id="screen-loading"
    className="screen active"
    style={{
      backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_select.webp')}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}
  >
    <div className="loading-content">
      <div className="loading-spinner"></div>
      <span id="loading-text">{loadingText || 'LOADING...'}</span>
    </div>
  </div>
);

const SCREEN_COMPONENTS = {
  'screen-loading': LoadingScreen,
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
  'screen-defense-ranking': DefenseRankingScreen,
  'screen-challenge-ranking': ChallengeRankingScreen,
  'screen-tournament-ranking': TournamentRankingScreen,
  'screen-dungeon-menu': DungeonMenuScreen,
  'screen-story-resume': StoryResumeScreen,
  'screen-dungeon-rules': DungeonRulesScreen,
  'screen-deck-list': DeckListScreen,
  'screen-deck-edit': DeckEditorScreen,
  'screen-select': {
    component: CharacterSelectScreen,
    initHook: () => {
      if (typeof window.initSelectScreenReact === 'function') {
        window.initSelectScreenReact();
      }
    },
  },
  'screen-difficulty': {
    component: DifficultySelectScreen,
    initHook: () => {
      if (typeof window.initDifficultySelectScreenReact === 'function') {
        window.initDifficultySelectScreenReact();
      }
    },
  },
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
  const [loadingText, setLoadingText] = useState('LOADING...');

  const currentScreenRef = useRef(currentScreen);
  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  useEffect(() => {
    window.updateLoadingTextReact = (text) => {
      setLoadingText(text);
    };
    return () => {
      delete window.updateLoadingTextReact;
    };
  }, []);

  const [rulesVisible, setRulesVisible] = useState(false);
  const [matchingState, setMatchingState] = useState({
    show: false,
    onComplete: null,
  });
  const [isSlowMotion, setIsSlowMotion] = useState(false);

  useEffect(() => {
    window.setSlowMotionReact = (val) => {
      setIsSlowMotion(val);
    };
    return () => {
      delete window.setSlowMotionReact;
    };
  }, []);

  useEffect(() => {
    if (isSlowMotion) {
      document.body.classList.add('slow-motion');
    } else {
      document.body.classList.remove('slow-motion');
    }
  }, [isSlowMotion]);

  useEffect(() => {
    window.showMatchingScreen = (onComplete) => {
      setMatchingState({ show: true, onComplete });
    };
    return () => {
      window.showMatchingScreen = undefined;
    };
  }, []);

  // レガシー部分のルーティング互換性（一部のみ残す）
  useEffect(() => {
    // 既存のグローバル関数をオーバーライドしてReactのStateと連携
    setSwitchScreenHook((screenId) => {
      setCurrentScreen(screenId);
      // Reactのレンダリングを待機してから遷移後処理を行うための遅延
      setTimeout(() => {
        executeSwitchScreen(screenId);
        // 【データ整合性・画面表示保護】画面切り替え時に対応するReact画面の初期化・再評価フックを自動で呼び出す
        const screenEntry = SCREEN_COMPONENTS[screenId];
        if (screenEntry?.initHook) {
          screenEntry.initHook();
        }
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

  const screenEntry = SCREEN_COMPONENTS[currentScreen];
  const ScreenComponent = screenEntry?.component || screenEntry;
  // 未登録の画面IDの場合はタイトル画面をフォールバック表示
  const FinalScreenComponent = ScreenComponent || TitleScreen;

  return (
    <>
      <FinalScreenComponent
        switchScreen={switchScreen}
        showRulesModal={() => setRulesVisible(true)}
        loadingText={loadingText}
      />
      <GlobalModals
        rulesVisible={rulesVisible}
        setRulesVisible={setRulesVisible}
      />
      <DamageOverlay />
      <RewardOverlay />
      <CutinOverlay />
      <VfxOverlay />
      <div id="fade-overlay" className="fade-overlay"></div>
      {matchingState.show && (
        <MatchingScreen
          onComplete={() => {
            // 裏でバトル画面の初期化と遷移を開始
            if (matchingState.onComplete) matchingState.onComplete();
          }}
          onFadeOutComplete={() => {
            // フェードアウト演出が完了した後にアンマウント
            setMatchingState({ show: false, onComplete: null });
          }}
        />
      )}
    </>
  );
}

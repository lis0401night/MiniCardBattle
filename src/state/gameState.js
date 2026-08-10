import { CHARACTERS } from '../utils/constants/characters.js';
import {
  DECK_SIZE,
  PROFILE_NAME_KEY,
  PROFILE_ICON_KEY,
  FAVORITE_CARD_KEY,
  UNLOCKED_SKINS_KEY,
  UNLOCKED_ICONS_KEY,
  DEFAULT_PLAYER_NAME,
  DEFAULT_PLAYER_ICON,
} from '../utils/constants/config.js';
import { safeParseArray } from '../utils/gameUtils.js';
import { resolveValidIconId } from '../utils/constants/avatars.js';

const loadUserProfile = () => {
  try {
    const name = localStorage.getItem(PROFILE_NAME_KEY) || DEFAULT_PLAYER_NAME;
    const rawIcon = localStorage.getItem(PROFILE_ICON_KEY);
    const icon = resolveValidIconId(rawIcon);
    // 不正なアイコンIDがLocalStorageに保存されていた場合、修正値で上書きする
    if (rawIcon !== null && rawIcon !== icon) {
      console.warn(
        `不正なアイコンID "${rawIcon}" を検出しました。"${icon}" に修正します。`
      );
      try {
        localStorage.setItem(PROFILE_ICON_KEY, icon);
      } catch (storageError) {
        console.error('Failed to normalize profile icon:', storageError);
      }
    }
    let favoriteCard = null;
    try {
      const rawFav = localStorage.getItem(FAVORITE_CARD_KEY);
      favoriteCard = rawFav ? JSON.parse(rawFav) : null;
    } catch (e) {
      console.error('Failed to parse favorite card:', e);
    }
    return { name, icon, favoriteCard };
  } catch (e) {
    console.error('Failed to load user profile:', e);
  }
  return {
    name: DEFAULT_PLAYER_NAME,
    icon: DEFAULT_PLAYER_ICON,
    favoriteCard: null,
  };
};

export const GameState = {
  userProfile: loadUserProfile(),
  playerConfig: CHARACTERS.android,
  enemyConfig: CHARACTERS.dragon,
  isInitializing: false,
  playerSkins: {},
  unlockedSkins: safeParseArray(UNLOCKED_SKINS_KEY),
  unlockedIcons: safeParseArray(UNLOCKED_ICONS_KEY),
  decks: [], // 【追加】最大10個の別個デッキ
  currentDeckIndex: 0, // 【追加】現在操作中のデッキインデックス
  playerDeckSelection: [], // （旧）バトルや編集時の作業用として残す
  playerInventory: {},
  playerHP: 0,
  enemyHP: 0,
  playerMaxHP: 0,
  enemyMaxHP: 0,
  playerSP: 0,
  enemySP: 0,
  playerHand: [],
  enemyHand: [],
  playerDeck: [],
  enemyDeck: [],
  playerDiscard: [],
  enemyDiscard: [],
  // バトル開始時の初期デッキ枚数（デッキアイコン表示等で使用）
  initialPlayerDeckCount: DECK_SIZE,
  initialEnemyDeckCount: DECK_SIZE,
  playerBoard: [null, null, null],
  enemyBoard: [null, null, null],
  playerSealedLanes: [0, 0, 0],
  enemySealedLanes: [0, 0, 0],
  appState: 'title',
  gameMode: 'story',
  aiLevel: 1,
  storyDifficulty: 1,
  isProcessing: false,
  isAIThinking: false, // AIのシミュレーション計算中のみtrue（「思考中」UI表示用）
  selectedCardIndex: null,
  fortuneHandicaps: (() => {
    try {
      const saved = localStorage.getItem('mini_card_battle_fortune_handicaps');
      const parsed = saved ? JSON.parse(saved) : {};
      return parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  })(),
  isBattleEnded: false,
  firstPlayer: 'blue',
  turnCount: 0,
  battlePhase: 'INIT',
  turnSubPhase: null, // ターン内サブフェイズの追跡（STATUS_COUNTDOWN, COMBAT, DRAW等）
  actionQueue: [],
  combatStep: 0,
  aiDecision: null,
  selectedBoardLaneIndex: null,
  selectedBoardSide: null,
  isDiscardingMode: false,
  discardMaxCount: 0,
  discardSelectedIndices: [],
  isPlacementMode: false,
  battleCount: 1,
  storyQueue: [],
  dialogueQueue: [],
  currentDialogueIndex: 0,
  pendingCharId: null,
  lastBattleResult: null,
  battleStartPlayerDeckObjects: null,
  longPressTimer: null,
  selectedStageId: null,
  extraTurnCount: 0,
  attackSkipCount: 0,
  gameVolume: 0.5,
  premiumCards: [],
  unlockedPremiumCards: [],
  selectedPlaymatId: null,
  dungeonWinStreak: 0,
  dungeonCards: [],
  dungeonOpponents: [],
  dungeonState: 'none',
  dungeonMaxWinStreak:
    parseInt(localStorage.getItem('mini_card_battle_dungeon_max_streak')) || 0,
  // デバッグ・チュートリアル用：バトル開始時の状態プリセット（適用後に自動クリア）
  battlePreset: null,
  missionProgress: {
    damage_5_single: false,
    sacrifice_count: 0,
    power_10: false,
  },
};

// Global fallback for browser debugging
if (typeof window !== 'undefined') {
  window.GameState = GameState;
}

/**
 * プロフィール情報を保存・同期する
 * @param {Object} profile - プロフィール情報 { name, icon }
 */
export function saveUserProfile(profile) {
  if (!profile) return;

  const currentProfile = GameState.userProfile || loadUserProfile();

  let favToSave = currentProfile.favoriteCard || null;
  if (profile.favoriteCard !== undefined) {
    favToSave = profile.favoriteCard;
  }

  const merged = {
    name:
      typeof profile.name === 'string' && profile.name.trim()
        ? profile.name.trim()
        : currentProfile.name || DEFAULT_PLAYER_NAME,
    icon: resolveValidIconId(
      typeof profile.icon === 'string' && profile.icon
        ? profile.icon
        : currentProfile.icon
    ),
    favoriteCard: favToSave,
  };
  GameState.userProfile = merged;
  try {
    localStorage.setItem(PROFILE_NAME_KEY, merged.name);
    localStorage.setItem(PROFILE_ICON_KEY, merged.icon);
    if (merged.favoriteCard !== null && merged.favoriteCard !== undefined) {
      localStorage.setItem(
        FAVORITE_CARD_KEY,
        JSON.stringify(merged.favoriteCard)
      );
    } else {
      localStorage.removeItem(FAVORITE_CARD_KEY);
    }
  } catch (e) {
    console.error('Failed to save user profile:', e);
  }
}

/**
 * プロフィールがデフォルト（未設定）状態かどうかを判定する。
 * 名前とアイコンが共にデフォルト値の場合のみ true を返す。
 *
 * @returns {boolean} デフォルト状態の場合 true
 */
export function isProfileDefault() {
  const profile = GameState.userProfile;
  return (
    (!profile.name || profile.name === DEFAULT_PLAYER_NAME) &&
    (!profile.icon || profile.icon === DEFAULT_PLAYER_ICON)
  );
}

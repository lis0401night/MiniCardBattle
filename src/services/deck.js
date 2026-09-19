import { prepareBattle } from '../game/battle/index.js';
import { resolveDungeonDeck } from '../game/battleDungeon.js';
import { hydratePlayerConfig } from '../utils/constants/battleDungeon.js';
import { GameState, saveUserProfile } from '../state/gameState.js';
import { resolveValidIconId } from '../utils/constants/avatars.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  BOSS_CHARACTER_IDS,
  CHARACTERS,
  getSkinImage,
} from '../utils/constants/characters.js';
import {
  DECKS_BACKUP_KEY,
  DECKS_KEY,
  DECK_SIZE,
  DEFAULT_DUNGEON_AI_LEVEL,
  DIFFICULTY,
  MAX_DECK_SLOTS,
} from '../utils/constants/config.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { TOURNAMENT_DECKS } from '../utils/constants/enemy_decks/event_tournament/index.js';
import { INITIAL_PLAYER_CARD } from '../utils/constants/initial_cards.js';
import { INITIAL_PLAYER_DECK } from '../utils/constants/initial_decks.js';
import {
  ownedPlaymats,
  setOwnedPlaymats,
} from '../utils/constants/playmats.js';
import {
  getCardImgUrl,
  getOrCreateUUID,
  playSound,
  resolvePlayerName,
  safeParseArray,
  shuffleArray,
  switchScreen,
  VALID_PREMIUM_CARDS,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  closePlayerNameModal,
  showDefenseMenu,
  showOnlineLobby,
} from './uiMainCore.js';
import { showAlertModal, showConfirmModal } from './uiModals.js';
import { asyncPost } from '../utils/fetch.js';

/** 防衛デッキ登録通信のタイムアウト時間 (ms) */
const DEFENSE_DECK_REGISTRATION_TIMEOUT_MS = 8000;

// ==========================================
// カードIDのマイグレーション（後方互換性維持用）
// ==========================================
export const CARD_ID_MIGRATION_MAP = {
  copy: 'eye',
  chameleon: 'instructor',
  mech: 'cop',
  zombie: 'fly',
  bigai: 'bigeye',
  wish: 'rampage',
  nectromancer: 'necromancer', // 互換性維持用の移行マッピング
  atronach: 'lightningatronach',
  valkyrie: 'rocktitan',
  hammer: 'catoblepas',
  ippondatara: 'tomoe',
  flagellant: 'curtain',
  crocodile: 'vulture',
};

export function migrateCardId(id) {
  if (typeof id === 'string') {
    return CARD_ID_MIGRATION_MAP[id] || id;
  }
  if (id && typeof id === 'object' && id.id) {
    return {
      ...id,
      id: CARD_ID_MIGRATION_MAP[id.id] || id.id,
    };
  }
  return id;
}

/**
 * デッキ固有のスキン設定から、現在のキャラクターに対応するスキン画像を
 * playerConfig に適用します（プレイヤースキンの適用）。
 */
function applySkinToPlayerConfig() {
  if (GameState.playerConfig && GameState.playerConfig.id) {
    if (!GameState.playerSkins) GameState.playerSkins = {};
    const skinIdToUse =
      GameState.playerSkins[GameState.playerConfig.id] || 'default';
    // getSkinImage が関数として存在する場合のみ実行（後方互換性維持）
    if (typeof getSkinImage === 'function') {
      const templateChar = CHARACTERS[GameState.playerConfig.id];
      if (templateChar) {
        // スキンに対応する画像を取得、存在しない場合はテンプレート画像にフォールバック
        GameState.playerConfig.image =
          getSkinImage(templateChar, skinIdToUse, 'image') ||
          templateChar.image;
        GameState.playerConfig.imageLose =
          getSkinImage(templateChar, skinIdToUse, 'imageLose') ||
          templateChar.imageLose ||
          templateChar.image;
        GameState.playerConfig.icon =
          getSkinImage(templateChar, skinIdToUse, 'icon') || templateChar.icon;
        GameState.playerConfig.iconDamage =
          getSkinImage(templateChar, skinIdToUse, 'iconDamage') ||
          templateChar.iconDamage ||
          templateChar.icon;
      }
    }
  }
}

// ==========================================
// デッキ生成・編集・セーブ・ロードロジック
// ==========================================

export function generateDeck(owner, config, sessionId) {
  let deck = [];

  // オンラインモード：事前に渡された専用デッキ配列を使用する
  if (GameState.gameMode === 'online' && config && Array.isArray(config.deck)) {
    deck = config.deck.map((t, i) => {
      const isPremium = t.isPremium || false;
      const tempObj = { ...t, isPremium: isPremium };
      const imgUrl = getCardImgUrl(tempObj);
      return {
        ...t,
        baseId: t.id,
        id: `${owner}_${sessionId}_${i}`,
        uid: `${owner}_init_${sessionId}_${i}`,
        owner: owner,
        imgUrl: imgUrl,
        power: t.power,
        basePower: t.power,
        currentPower: t.power,
        isPremium: isPremium,
        skills: Array.isArray(t.skills) ? t.skills.map((s) => ({ ...s })) : [],
        choices: t.choices ? t.choices.map((c) => ({ ...c })) : undefined,
        choices2: t.choices2 ? t.choices2.map((c) => ({ ...c })) : undefined,
      };
    });
    return shuffleArray(deck);
  }

  if (owner === 'blue') {
    deck = GameState.playerDeckSelection.map((t, i) => {
      const isPremium = (GameState.premiumCards || []).includes(t.id);
      const tempObj = { ...t, isPremium: isPremium };
      const imgUrl = getCardImgUrl(tempObj);
      return {
        ...t,
        baseId: t.id,
        id: `${owner}_${sessionId}_${i}`,
        uid: `${owner}_init_${sessionId}_${i}`,
        owner: owner,
        imgUrl: imgUrl,
        power: t.power,
        basePower: t.power,
        currentPower: t.power,
        isPremium: isPremium,
        skills: Array.isArray(t.skills) ? t.skills.map((s) => ({ ...s })) : [],
        choices: t.choices ? t.choices.map((c) => ({ ...c })) : undefined,
        choices2: t.choices2 ? t.choices2.map((c) => ({ ...c })) : undefined,
      };
    });
  } else {
    // 敵のデッキ生成
    let deckIds = [];
    if (GameState.gameMode === 'practice') {
      const enemyDeckData = GameState.decks[GameState.practiceEnemyDeckIndex];
      deckIds = enemyDeckData.cards.map((id) => ({
        id: id,
        isPremium: enemyDeckData.premiumCards
          ? enemyDeckData.premiumCards.includes(id)
          : false,
      }));
    } else if (
      GameState.gameMode === 'battle_dungeon' &&
      config.dungeonDeck &&
      config.dungeonDeck.length > 0
    ) {
      deckIds = config.dungeonDeck;
    } else if (GameState.gameMode === 'battle_dungeon') {
      // 既に空デッキ(0枚)のセーブデータが書き込まれてしまっている場合の強力な救済・フェイルセーフ
      deckIds = resolveDungeonDeck(
        config.leaderCardId,
        config.fixedAiLevel || DEFAULT_DUNGEON_AI_LEVEL
      );
    } else {
      let recipeId = config.id;
      if (GameState.gameMode === 'event_satan_high') recipeId = 'satan_high';
      if (GameState.gameMode === 'event_android_high')
        recipeId = 'android_high';
      if (GameState.gameMode === 'event_dragon_high') recipeId = 'dragon_high';
      if (GameState.gameMode === 'event_knight_high') recipeId = 'knight_high';
      if (GameState.gameMode === 'event_cthulhu_high')
        recipeId = 'cthulhu_high';
      if (GameState.gameMode === 'event_elf_high') recipeId = 'elf_high';
      if (GameState.gameMode === 'event_cleric_high') recipeId = 'cleric_high';
      if (GameState.gameMode === 'event_devilhunter_high')
        recipeId = 'devilhunter_high'; // マリア高難易度
      if (GameState.gameMode === 'event_witch_high') recipeId = 'witch_high'; // クロエ高難易度
      if (GameState.gameMode === 'event_oni_high') recipeId = 'oni_high'; // カグラ高難易度
      if (GameState.gameMode === 'event_priest_high') recipeId = 'priest_high'; // ネフティ高難易度
      if (GameState.gameMode === 'event_automata_fortune')
        recipeId = 'automata_fortune'; // マキナ運命の邂逅
      if (GameState.gameMode === 'event_valkyria_fortune')
        recipeId = 'valkyria_fortune'; // アンジェ運命の邂逅
      if (GameState.gameMode === 'defense_attack') recipeId = 'player_defense'; // 追加

      let recipe;
      if (GameState.gameMode === 'tournament') {
        // トーナメント時は専用デッキ（event_tournament）から取得
        const charId = recipeId;
        const patterns = TOURNAMENT_DECKS[charId];
        if (patterns && patterns.length > 0) {
          // 現在の対戦相手（NPC）に紐づく固定の deckPatternIndex を参照
          const round = GameState.tournament?.round || 1;
          const currentParticipants =
            GameState.tournament?.bracketTree?.[round - 1] || [];
          let opponent = null;
          for (let i = 0; i < currentParticipants.length; i += 2) {
            const p1 = currentParticipants[i];
            const p2 = currentParticipants[i + 1];
            if (p1?.isPlayer) {
              opponent = p2;
              break;
            } else if (p2?.isPlayer) {
              opponent = p1;
              break;
            }
          }
          const patternIdx =
            typeof opponent?.deckPatternIndex === 'number'
              ? opponent.deckPatternIndex % patterns.length
              : 0;
          recipe = patterns[patternIdx] || patterns[0];
        } else {
          recipe = ENEMY_DECKS[charId] || ENEMY_DECKS.android;
        }
      } else {
        recipe = ENEMY_DECKS[recipeId] || ENEMY_DECKS.android;
      }

      if (Array.isArray(recipe)) {
        // パターンデッキの場合
        deckIds = recipe;
      } else if (recipe.easy && recipe.normal && recipe.hard) {
        // 対戦難易度（GameState.difficulty / storyDifficulty）に基づいてデッキを確定する
        const currentDiff =
          GameState.difficulty ||
          GameState.storyDifficulty ||
          DIFFICULTY.NORMAL;
        if (currentDiff === DIFFICULTY.EASY) {
          deckIds = recipe.easy;
        } else if (currentDiff === DIFFICULTY.HARD) {
          deckIds = recipe.hard;
        } else {
          deckIds = recipe.normal;
        }
      } else {
        deckIds = Array.isArray(ENEMY_DECKS.android)
          ? ENEMY_DECKS.android
          : ENEMY_DECKS.android.normal || [];
      }
    }

    deckIds.forEach((cardItem, i) => {
      let cardId = typeof cardItem === 'object' ? cardItem.id : cardItem;
      cardId = migrateCardId(cardId);
      let isPremium =
        typeof cardItem === 'object' ? cardItem.isPremium || false : false;

      const t = CARD_MASTER.find((m) => m.id === cardId) || CARD_MASTER[0];
      let p = t.power;

      const tempObj = { ...t, isPremium: isPremium };
      const imgUrl = getCardImgUrl(tempObj);
      deck.push({
        ...t,
        baseId: t.id,
        id: `${owner}_${sessionId}_${i}`,
        uid: `${owner}_init_${sessionId}_${i}`,
        owner: owner,
        imgUrl: imgUrl,
        power: p,
        basePower: t.power,
        currentPower: p,
        isPremium: isPremium,
        skills: Array.isArray(t.skills) ? t.skills.map((s) => ({ ...s })) : [],
        choices: t.choices ? t.choices.map((c) => ({ ...c })) : undefined,
        choices2: t.choices2 ? t.choices2.map((c) => ({ ...c })) : undefined,
      });
    });
  }
  return shuffleArray(deck);
}

/**
 * リーダー別のおすすめ初期デッキを生成 (20枚・同名5枚制限厳守)
 */
export function getInitialDeck() {
  const deck = [];
  INITIAL_PLAYER_DECK.forEach((id) => {
    const template = CARD_MASTER.find((m) => m.id === id);
    if (template) {
      deck.push({ ...template });
    }
  });
  return deck.slice(0, DECK_SIZE); // 20枚
}

/**
 * 全初期解放リーダーキャラクター分のデフォルトデッキ配列を生成します。
 * 新規開始時やデータ破損からの復旧時に使用されます。
 * @returns {Array<Object>} 生成されたデフォルトデッキ配列
 */
export function createDefaultLeaderDecks() {
  const leaderIds = Object.keys(CHARACTERS).filter(
    (id) =>
      id !== 'player' &&
      id !== 'unknown' &&
      id !== 'npc' &&
      id !== 'automata' && // マキナは初期解放キャラではないため除外
      id !== 'valkyria' && // アンジェは初期解放キャラではないため除外
      !BOSS_CHARACTER_IDS.includes(id)
  );

  const initialDecks = [];
  const defaultCardIds = getInitialDeck().map((c) => c.id);

  leaderIds.forEach((id, idx) => {
    const char = CHARACTERS[id];
    if (char && initialDecks.length < MAX_DECK_SLOTS) {
      const shortName = char.name.split(' ').pop();
      initialDecks.push({
        id: `deck_${Date.now()}_${idx}`,
        name: `${shortName}デッキ`.substring(0, 12),
        leaderId: id,
        playmatId: null,
        playerSkins: {},
        premiumCards: [],
        cards: [...defaultCardIds],
      });
    }
  });
  return initialDecks;
}

/** 試練の宮殿専用デッキの固定ID */
export const DUNGEON_DECK_ID = 'dungeon_deck';
/** 試練の宮殿専用デッキの既定名称 */
export const DUNGEON_DECK_NAME = '試練の宮殿デッキ';
/** 防衛戦専用デッキの固定ID */
export const DEFENSE_DECK_ID = 'defense_deck';
/** 防衛戦専用デッキの既定名称 */
export const DEFENSE_DECK_NAME = '防衛デッキ';
/** トーナメント専用デッキの固定ID */
export const TOURNAMENT_DECK_ID = 'tournament_deck';
/** トーナメント専用デッキの既定名称 */
export const TOURNAMENT_DECK_NAME = 'トーナメントデッキ';

/**
 * 特殊モード専用デッキの識別用ID一覧。
 * 名称（name）はユーザーが自由に編集可能なため、誤上書き・汚染の判定には使用しません。
 * @type {ReadonlyArray<string>}
 */
export const SPECIAL_DECK_IDS = Object.freeze([
  DUNGEON_DECK_ID,
  DEFENSE_DECK_ID,
  TOURNAMENT_DECK_ID,
]);

/**
 * 対象デッキが特殊モード専用デッキ（試練の宮殿・防衛戦・夢幻の闘技祭）かをID基準で安全に判定します。
 *
 * @param {Object|null|undefined} deck - 判定対象のデッキオブジェクト
 * @returns {boolean} 特殊デッキであれば true
 */
export function isSpecialDeck(deck) {
  return Boolean(deck?.id && SPECIAL_DECK_IDS.includes(deck.id));
}

/**
 * 通常デッキ配列を安全にLocalStorageに保存し、バックアップ（DECKS_BACKUP_KEY）も更新します。
 * 書き込みはバックアップを先行して更新するため、途中で容量超過等の障害が発生しても復旧元データは常に有効な状態を保ちます。
 * 特殊デッキ（isSpecialDeck）が混入している場合は自動的に完全に除外（フィルタリング）し、
 * 特殊デッキのみで通常デッキが0個になってしまう場合は書き込みを完全に拒否して安全を守ります。
 *
 * @param {Array<Object>} decks - 保存対象の通常デッキ配列
 * @returns {boolean} 正常に保存された場合は true、保存が拒否または失敗した場合は false
 */
export function saveSafeNormalDecks(decks) {
  if (typeof localStorage === 'undefined') return false;
  if (!Array.isArray(decks)) return false;

  // 1. 特殊デッキ（dungeon_deck, defense_deck, tournament_deck等）を完全に除外
  const cleanDecks = decks.filter((d) => d && !isSpecialDeck(d));

  // 2. 特殊デッキしかなく通常デッキが0個になってしまう場合は、通常デッキ保存箱への書き込みを阻止
  if (cleanDecks.length === 0) {
    console.warn(
      '[saveSafeNormalDecks] 特殊デッキのみで構成された配列のため、通常デッキ保存箱（DECKS_KEY）への書き込みを完全に拒否しました。'
    );
    return false;
  }

  // 3. バックアップを先行更新し、続けて通常デッキ保存箱を更新（容量超過等の例外を捕捉）
  try {
    const serialized = JSON.stringify(cleanDecks);
    localStorage.setItem(DECKS_BACKUP_KEY, serialized);
    localStorage.setItem(DECKS_KEY, serialized);
    return true;
  } catch (e) {
    console.error('[saveSafeNormalDecks] 通常デッキの保存に失敗しました:', e);
    return false;
  }
}

/**
 * LocalStorageから通常デッキ配列（DECKS_KEY）を安全に読み込みます。
 * 特殊デッキの混入やデータ破損を自動検知し、特殊デッキの除外、
 * バックアップからの復旧または初期デッキセットの再生成によって自己修復を行います。
 * @returns {Array<Object>} 健全な通常デッキ配列
 */
export function getSafeNormalDecks() {
  if (typeof localStorage === 'undefined') return [];

  const decksSaved = localStorage.getItem(DECKS_KEY);
  let decks = [];
  if (decksSaved) {
    try {
      decks = JSON.parse(decksSaved);
    } catch {
      decks = [];
    }
  }

  if (!Array.isArray(decks)) {
    decks = [];
  }

  // 特殊デッキ（isSpecialDeck）の混入有無をチェック
  const hasSpecialDeck = decks.some((d) => isSpecialDeck(d));
  // 健全な通常デッキのみを抽出
  const cleanDecks = decks.filter((d) => d && !isSpecialDeck(d));

  // 健全な通常デッキが1つでも残っている場合、特殊デッキをパージして自動保存し返却
  if (cleanDecks.length > 0) {
    if (hasSpecialDeck) {
      console.warn(
        '[getSafeNormalDecks] 通常デッキ内に混入していた特殊デッキをパージしました。'
      );
      saveSafeNormalDecks(cleanDecks);
    } else {
      // 健全な通常デッキが存在する場合はバックアップを更新して安全を担保
      localStorage.setItem(DECKS_BACKUP_KEY, JSON.stringify(cleanDecks));
    }
    return cleanDecks;
  }

  // 健全な通常デッキが0個の場合（特殊デッキしかなかった、または空・破損）
  // 1. バックアップからの自動復旧を試みる
  const backupSaved = localStorage.getItem(DECKS_BACKUP_KEY);
  if (backupSaved) {
    try {
      const backupDecks = JSON.parse(backupSaved);
      if (Array.isArray(backupDecks)) {
        const cleanBackup = backupDecks.filter((d) => d && !isSpecialDeck(d));
        if (cleanBackup.length > 0) {
          console.warn(
            '[getSafeNormalDecks] 通常デッキの汚染または消失を検知したため、バックアップから復旧しました。'
          );
          saveSafeNormalDecks(cleanBackup);
          return cleanBackup;
        }
      }
    } catch (e) {
      console.error('バックアップデッキの復旧に失敗しました:', e);
    }
  }

  // 2. バックアップすらない場合、初期リーダーデッキセットを生成して健全に自己修復
  const defaultDecks = createDefaultLeaderDecks();
  if (defaultDecks && defaultDecks.length > 0) {
    console.warn(
      '[getSafeNormalDecks] 通常デッキを全リーダー初期デッキセットで自動修復しました。'
    );
    saveSafeNormalDecks(defaultDecks);
    return defaultDecks;
  }

  return [];
}

/**
 * ローカルストレージおよび現在のGameState内のセーブデータを安全に新IDに移行します。
 */
export function migrateAllSaveData() {
  try {
    // 1. インベントリ (mini_card_battle_inventory)
    const invKey = 'mini_card_battle_inventory';
    const invSaved = localStorage.getItem(invKey);
    if (invSaved) {
      try {
        const inv = JSON.parse(invSaved);
        let changed = false;
        for (const oldId in CARD_ID_MIGRATION_MAP) {
          if (inv[oldId] !== undefined) {
            const newId = CARD_ID_MIGRATION_MAP[oldId];
            inv[newId] = (inv[newId] || 0) + inv[oldId];
            delete inv[oldId];
            changed = true;
          }
        }
        if (changed) {
          localStorage.setItem(invKey, JSON.stringify(inv));
        }
      } catch (e) {
        console.error('Inventory migration error:', e);
      }
    }

    // 2. 通常デッキ (DECKS_KEY)
    const decksKey = DECKS_KEY;
    const decksSaved = localStorage.getItem(decksKey);
    if (decksSaved) {
      try {
        const decks = JSON.parse(decksSaved);
        let changed = false;
        if (Array.isArray(decks)) {
          decks.forEach((deck) => {
            if (deck.cards && Array.isArray(deck.cards)) {
              const originalCards = [...deck.cards];
              deck.cards = deck.cards.map((id) => migrateCardId(id));
              if (
                JSON.stringify(originalCards) !== JSON.stringify(deck.cards)
              ) {
                changed = true;
              }
            }
            if (deck.premiumCards && Array.isArray(deck.premiumCards)) {
              const originalPremium = [...deck.premiumCards];
              deck.premiumCards = deck.premiumCards.map((id) =>
                migrateCardId(id)
              );
              if (
                JSON.stringify(originalPremium) !==
                JSON.stringify(deck.premiumCards)
              ) {
                changed = true;
              }
            }
          });
        }
        if (changed) {
          localStorage.setItem(decksKey, JSON.stringify(decks));
        }
      } catch (e) {
        console.error('Decks migration error:', e);
      }
    }

    // Helper to migrate a single deck object
    const migrateDeckObj = (key) => {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const deck = JSON.parse(saved);
          let changed = false;
          if (deck.cards && Array.isArray(deck.cards)) {
            const originalCards = [...deck.cards];
            deck.cards = deck.cards.map((id) => migrateCardId(id));
            if (JSON.stringify(originalCards) !== JSON.stringify(deck.cards))
              changed = true;
          }
          if (deck.premiumCards && Array.isArray(deck.premiumCards)) {
            const originalPremium = [...deck.premiumCards];
            deck.premiumCards = deck.premiumCards.map((id) =>
              migrateCardId(id)
            );
            if (
              JSON.stringify(originalPremium) !==
              JSON.stringify(deck.premiumCards)
            )
              changed = true;
          }
          if (changed) {
            localStorage.setItem(key, JSON.stringify(deck));
          }
        } catch (e) {
          console.error(`Deck obj migration error for ${key}:`, e);
        }
      }
    };

    // 3. 防衛、宮殿、トーナメントのデッキオブジェクト
    migrateDeckObj('mini_card_battle_defense_deck_obj');
    migrateDeckObj('mini_card_battle_dungeon_deck_obj');
    migrateDeckObj('mini_card_battle_tournament_deck_obj');

    // 4. 古い防衛デッキの配列 (mini_card_battle_deck_defense)
    const oldDefKey = 'mini_card_battle_deck_defense';
    const oldDefSaved = localStorage.getItem(oldDefKey);
    if (oldDefSaved) {
      try {
        const cards = JSON.parse(oldDefSaved);
        if (Array.isArray(cards)) {
          const originalCards = [...cards];
          const migrated = cards.map((id) => migrateCardId(id));
          if (JSON.stringify(originalCards) !== JSON.stringify(migrated)) {
            localStorage.setItem(oldDefKey, JSON.stringify(migrated));
          }
        }
      } catch (e) {
        console.error('Old defense deck migration error:', e);
      }
    }

    // 5. 試練の宮殿中断データ (mini_card_battle_dungeon_save)
    const dSaveKey = 'mini_card_battle_dungeon_save';
    const dSaveSaved = localStorage.getItem(dSaveKey);
    if (dSaveSaved) {
      try {
        const dSave = JSON.parse(dSaveSaved);
        let changed = false;
        if (dSave.deck && Array.isArray(dSave.deck)) {
          const original = [...dSave.deck];
          dSave.deck = dSave.deck.map((id) => migrateCardId(id));
          if (JSON.stringify(original) !== JSON.stringify(dSave.deck))
            changed = true;
        }
        if (dSave.cards && Array.isArray(dSave.cards)) {
          const original = [...dSave.cards];
          dSave.cards = dSave.cards.map((id) => migrateCardId(id));
          if (JSON.stringify(original) !== JSON.stringify(dSave.cards))
            changed = true;
        }
        if (dSave.dungeonCards && Array.isArray(dSave.dungeonCards)) {
          const original = [...dSave.dungeonCards];
          dSave.dungeonCards = dSave.dungeonCards.map((id) =>
            migrateCardId(id)
          );
          if (JSON.stringify(original) !== JSON.stringify(dSave.dungeonCards))
            changed = true;
        }
        if (changed) {
          localStorage.setItem(dSaveKey, JSON.stringify(dSave));
        }
      } catch (e) {
        console.error('Dungeon save migration error:', e);
      }
    }

    // Helper to migrate plain string arrays in localStorage
    const migratePlainArray = (key) => {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const arr = JSON.parse(saved);
          if (Array.isArray(arr)) {
            const original = [...arr];
            const migrated = arr.map((id) => migrateCardId(id));
            if (JSON.stringify(original) !== JSON.stringify(migrated)) {
              localStorage.setItem(key, JSON.stringify(migrated));
            }
          }
        } catch (e) {
          console.error(`Plain array migration error for ${key}:`, e);
        }
      }
    };

    // 6. プレミアム設定と解放状況
    migratePlainArray('mini_card_battle_premium_cards');
    migratePlainArray('mini_card_battle_unlocked_premium');

    // 7. 現在の GameState にインメモリデータがあればそれらも移行
    if (GameState) {
      if (GameState.dungeonCards && Array.isArray(GameState.dungeonCards)) {
        GameState.dungeonCards = GameState.dungeonCards.map((id) =>
          migrateCardId(id)
        );
      }

      if (GameState.premiumCards && Array.isArray(GameState.premiumCards)) {
        GameState.premiumCards = GameState.premiumCards.map((id) =>
          migrateCardId(id)
        );
      }
      if (
        GameState.unlockedPremiumCards &&
        Array.isArray(GameState.unlockedPremiumCards)
      ) {
        GameState.unlockedPremiumCards = GameState.unlockedPremiumCards.map(
          (id) => migrateCardId(id)
        );
      }
    }
  } catch (e) {
    console.error('General migration error:', e);
  }
}

window.loadDeck = loadDeck;
export function loadDeck() {
  // 自動マイグレーションを実行
  migrateAllSaveData();
  // 1. ダンジョン特殊処理（ダンジョン進行中の保存デッキ構成を正確に維持・復元）
  if (GameState.gameMode === 'battle_dungeon') {
    if (
      Array.isArray(GameState.playerDeckSelection) &&
      GameState.playerDeckSelection.length > 0
    ) {
      GameState.isDungeonSnapshotLoaded = true;
    } else {
      // 一時デッキキャッシュ (mini_card_battle_dungeon_deck_obj) または進行セーブ (mini_card_battle_dungeon_save) から復元
      const dungeonSaved = localStorage.getItem(
        'mini_card_battle_dungeon_deck_obj'
      );
      const dungeonProgressSaved = localStorage.getItem(
        'mini_card_battle_dungeon_save'
      );

      let savedCards = null;
      if (dungeonSaved) {
        try {
          const deckObj = JSON.parse(dungeonSaved);
          if (Array.isArray(deckObj?.cards) && deckObj.cards.length > 0) {
            savedCards = deckObj.cards;
          }
        } catch {
          // ignore
        }
      }

      if (!savedCards && dungeonProgressSaved) {
        try {
          const progObj = JSON.parse(dungeonProgressSaved);
          if (Array.isArray(progObj?.deck) && progObj.deck.length > 0) {
            savedCards = progObj.deck;
          }
        } catch {
          // ignore
        }
      }

      if (savedCards && savedCards.length > 0) {
        GameState.playerDeckSelection = savedCards
          .map((id) => {
            const template = CARD_MASTER.find((c) => c.id === id);
            return template ? { ...template } : null;
          })
          .filter(Boolean);
        GameState.isDungeonSnapshotLoaded = true;
      } else if (
        GameState.dungeonCards &&
        GameState.dungeonCards.length >= DECK_SIZE
      ) {
        GameState.playerDeckSelection = GameState.dungeonCards
          .slice(0, DECK_SIZE)
          .map((id) => {
            const template = CARD_MASTER.find((c) => c.id === id);
            return template ? { ...template } : null;
          })
          .filter(Boolean);
        GameState.isDungeonSnapshotLoaded = true;
      }
    }
  } else {
    GameState.isDungeonSnapshotLoaded = false;
  }

  // 2. 全体（アカウント）設定のベース読み込み
  // 全体スキンは廃止され、デッキ固有のスキン設定のみを使用します
  GameState.playerSkins = {};

  // インベントリ
  const invKey = `mini_card_battle_inventory`;
  const invSaved = localStorage.getItem(invKey);
  if (invSaved) {
    try {
      GameState.playerInventory = JSON.parse(invSaved);
    } catch {
      GameState.playerInventory = {};
    }
  } else {
    GameState.playerInventory = {};
  }

  // 初期デッキのカードは必ず最低限持っているように補填する（アップデート時の後方互換用）
  const initialCounts = {};
  INITIAL_PLAYER_CARD.forEach((id) => {
    initialCounts[id] = (initialCounts[id] || 0) + 1;
  });
  for (const id in initialCounts) {
    GameState.playerInventory[id] = Math.max(
      GameState.playerInventory[id] || 0,
      initialCounts[id]
    );
  }

  // プレミアムカード設定の読み込み（全体デフォルト）
  const premiumKey = `mini_card_battle_premium_cards`;
  const premiumSaved = localStorage.getItem(premiumKey);
  if (premiumSaved) {
    try {
      GameState.premiumCards = JSON.parse(premiumSaved).filter((id) =>
        VALID_PREMIUM_CARDS.includes(id)
      );
    } catch {
      GameState.premiumCards = [];
    }
  } else {
    GameState.premiumCards = [];
  }

  // 解放済みプレミアムカードの読み込み
  const unlockedPremiumKey = `mini_card_battle_unlocked_premium`;
  const unlockedPremiumSaved = localStorage.getItem(unlockedPremiumKey);
  if (unlockedPremiumSaved) {
    try {
      GameState.unlockedPremiumCards = JSON.parse(unlockedPremiumSaved).filter(
        (id) => VALID_PREMIUM_CARDS.includes(id)
      );
    } catch {
      GameState.unlockedPremiumCards = [];
    }
  } else {
    GameState.unlockedPremiumCards = [];
  }

  // 所持プレイマットの読み込み
  const playmatsKey = `mini_card_battle_owned_playmats`;
  const playmatsSaved = localStorage.getItem(playmatsKey);
  let parsedPlaymats = [];
  if (playmatsSaved) {
    try {
      parsedPlaymats = JSON.parse(playmatsSaved);
      if (!Array.isArray(parsedPlaymats)) parsedPlaymats = [];
    } catch {
      parsedPlaymats = [];
    }
  }

  // 【運命の邂逅・達成報酬プレイマットの自己修復】
  // マキナ/アンジェのLv4報酬を受取済みの場合、プレイマット所持リストに自動補填・復元
  let playmatsRecovered = false;
  const checkAndRecoverFortunePlaymat = (charId) => {
    try {
      const key = `mini_card_battle_fortune_claimed_levels_${charId}`;
      const legacyKey = 'mini_card_battle_fortune_claimed_levels';
      let claimed = safeParseArray(key);
      if (claimed.length === 0 && charId === 'automata') {
        claimed = safeParseArray(legacyKey);
      }
      if (claimed.includes(4)) {
        if (!parsedPlaymats.includes(charId)) {
          parsedPlaymats.push(charId);
          playmatsRecovered = true;
        }
      }
    } catch {
      // ignore
    }
  };
  checkAndRecoverFortunePlaymat('automata');
  checkAndRecoverFortunePlaymat('valkyria');

  if (playmatsRecovered) {
    localStorage.setItem(playmatsKey, JSON.stringify(parsedPlaymats));
  }
  setOwnedPlaymats(parsedPlaymats);
  GameState.ownedPlaymats = parsedPlaymats;

  // 3. デッキのロードと固有設定の適用

  if (GameState.gameMode === 'defense_register') {
    GameState.currentDeckIndex = 0; // 防衛時は必ず0番目を使用する
    const defenseSaved = localStorage.getItem(
      'mini_card_battle_defense_deck_obj'
    );
    if (defenseSaved) {
      try {
        GameState.decks = [JSON.parse(defenseSaved)];
        // キャラクター選択直後の場合は選択されたリーダーを強制適用する
        if (
          GameState.playerConfig &&
          GameState.playerConfig.id &&
          GameState.appState === 'select_player'
        ) {
          GameState.decks[0].leaderId = GameState.playerConfig.id;
        }
      } catch {
        GameState.decks = [];
      }
    } else {
      // マイグレーション：古い構造からの引き継ぎ
      const oldDef = localStorage.getItem('mini_card_battle_deck_defense');
      if (oldDef) {
        try {
          const cardsArr = JSON.parse(oldDef);
          GameState.decks = [
            {
              id: 'defense_deck',
              name: '防衛デッキ',
              leaderId: GameState.playerConfig?.id || 'android',
              playmatId:
                localStorage.getItem('mini_card_battle_playmat_defense') ||
                null,
              playerSkins: {},
              premiumCards: [...GameState.premiumCards],
              cards: cardsArr,
            },
          ];
        } catch {
          GameState.decks = [];
        }
      } else {
        GameState.decks = [];
      }
    }
  } else if (GameState.gameMode === 'battle_dungeon') {
    GameState.currentDeckIndex = 0; // ダンジョン時は必ず0番目を使用する
    const dungeonSaved = localStorage.getItem(
      'mini_card_battle_dungeon_deck_obj'
    );
    if (dungeonSaved) {
      try {
        const deckObj = JSON.parse(dungeonSaved);
        // 保存された leaderId が存在しない場合のみフォールバックする（初期値アイギスによる上書き破壊を防止）
        if (deckObj && !deckObj.leaderId) {
          deckObj.leaderId = GameState.playerConfig?.id || 'android';
        }
        if (deckObj) {
          deckObj.id = DUNGEON_DECK_ID;
          deckObj.name = deckObj.name || DUNGEON_DECK_NAME;
        }
        GameState.decks = [deckObj];
      } catch {
        GameState.decks = [];
      }
    } else {
      // マイグレーション：既存の試練の宮殿中断データからの引き継ぎ
      const oldSaveStr = localStorage.getItem('mini_card_battle_dungeon_save');
      if (oldSaveStr) {
        try {
          const data = JSON.parse(oldSaveStr);
          const deckCardsStr =
            data.deck || (data.cards ? data.cards.slice(0, 20) : []);
          GameState.decks = [
            {
              id: DUNGEON_DECK_ID,
              name: DUNGEON_DECK_NAME,
              leaderId:
                data.charId ||
                data.playerConfig?.id ||
                data.leaderId ||
                GameState.playerConfig?.id ||
                'android',
              playmatId: null,
              playerSkins: {},
              premiumCards: [...GameState.premiumCards],
              cards: deckCardsStr,
            },
          ];
        } catch {
          GameState.decks = [];
        }
      } else {
        GameState.decks = [];
      }
    }
  } else if (GameState.gameMode === 'tournament') {
    // トーナメントモードでも GameState.decks には常に通常デッキを安全に読み込む。
    // スナップショットデッキは playerDeckSelection にのみ適用し、
    // デッキ一覧画面に表示されないようにする。
    GameState.decks = getSafeNormalDecks();
    if (
      GameState.currentDeckIndex >= GameState.decks.length ||
      GameState.currentDeckIndex < 0
    ) {
      GameState.currentDeckIndex = 0;
    }

    // トーナメント進行中はスナップショットデッキをplayerDeckSelectionに反映する
    const tournamentSaved = localStorage.getItem(
      'mini_card_battle_tournament_deck_obj'
    );
    if (GameState.tournament && tournamentSaved) {
      try {
        const snapDeck = JSON.parse(tournamentSaved);
        GameState.playerDeckSelection = (snapDeck.cards || [])
          .map((id) => {
            const template = CARD_MASTER.find((c) => c.id === id);
            return template ? { ...template } : null;
          })
          .filter(Boolean);
        if (Array.isArray(snapDeck.premiumCards)) {
          GameState.premiumCards = [...snapDeck.premiumCards];
        }
      } catch {
        // スナップショット読み込みエラー時は通常デッキのselectionを使用
      }
    }
  } else {
    // 通常のデッキ（最大20個）: 汚染を検知して自動復旧・自己修復可能な安全関数を使用
    GameState.decks = getSafeNormalDecks();

    if (
      GameState.currentDeckIndex >= GameState.decks.length ||
      GameState.currentDeckIndex < 0
    ) {
      GameState.currentDeckIndex = 0;
    }
  }

  if (!GameState.decks || GameState.decks.length === 0) {
    if (
      GameState.gameMode === 'defense_register' ||
      GameState.gameMode === 'battle_dungeon' ||
      GameState.gameMode === 'tournament'
    ) {
      createNewDeck('knight');
      if (GameState.gameMode === 'defense_register') {
        GameState.decks[0].name = DEFENSE_DECK_NAME;
        GameState.decks[0].id = DEFENSE_DECK_ID;
      }
      if (GameState.gameMode === 'battle_dungeon') {
        GameState.decks[0].name = DUNGEON_DECK_NAME;
        GameState.decks[0].id = DUNGEON_DECK_ID;
      }
      if (GameState.gameMode === 'tournament') {
        GameState.decks[0].name = TOURNAMENT_DECK_NAME;
        GameState.decks[0].id = TOURNAMENT_DECK_ID;
      }
    } else {
      // 新規プレイヤー向けまたは修復用：全キャラクター（リーダー）分の初期デッキを生成
      GameState.decks = createDefaultLeaderDecks();
      GameState.currentDeckIndex = 0;
      saveSafeNormalDecks(GameState.decks);
    }
  }

  if (GameState.decks.length > 0) {
    let activeDeck = GameState.decks[GameState.currentDeckIndex];

    const templateChar = CHARACTERS[activeDeck.leaderId] || CHARACTERS.android;
    if (!GameState.playerConfig || GameState.appState !== 'select_player') {
      // トーナメント進行中はstartTournamentMatchで設定済みのplayerConfig（名前・スキン設定）を保持する
      // ストーリーモードはinitStoryMode/resumeStoryProgressで設定済みのplayerConfig（選択したリーダー）を保持する
      // 試練の宮殿（ダンジョン）進行中はhydratePlayerConfig等で設定済みのplayerConfig（選択リーダー/モブリーダー）を保持する
      if (
        (GameState.gameMode === 'tournament' &&
          GameState.tournament &&
          GameState.playerConfig) ||
        (GameState.gameMode === 'story' && GameState.playerConfig) ||
        (GameState.gameMode === 'battle_dungeon' && GameState.playerConfig)
      ) {
        // playerConfigは維持し、上書きしない
      } else if (GameState.gameMode === 'battle_dungeon') {
        // ダンジョンモードで万一playerConfigが存在しない場合、hydratePlayerConfigでモブ/キャラ問わず安全に復元
        GameState.playerConfig = hydratePlayerConfig(
          activeDeck.leaderId,
          undefined,
          GameState.playerSkins
        );
      } else {
        GameState.playerConfig = { ...templateChar };
      }
    }
    GameState.selectedPlaymatId = activeDeck.playmatId || null;

    // 【新規】デッキ固有のスキン・プレミアムをロード
    if (!activeDeck.playerSkins) activeDeck.playerSkins = {};
    GameState.playerSkins = {
      ...GameState.playerSkins,
      ...activeDeck.playerSkins,
    };

    // トーナメントモードでは学園スキンを強制設定（デッキスナップショットのスキン情報で上書きされるのを防ぐ）
    if (
      GameState.gameMode === 'tournament' &&
      GameState.tournament &&
      GameState.playerConfig
    ) {
      if (!GameState.playerSkins) GameState.playerSkins = {};
      GameState.playerSkins[GameState.playerConfig.id] = 'school';
      if (!GameState.enemySkins) GameState.enemySkins = {};
      if (GameState.enemyConfig) {
        GameState.enemySkins[GameState.enemyConfig.id] = 'school';
      }
    }

    // プレイヤースキンの適用
    applySkinToPlayerConfig();

    // トーナメント進行中かつスナップショットが存在する場合は通常デッキのpremiumCardsで上書きしない
    const isTournamentSnapshotLoaded =
      GameState.gameMode === 'tournament' &&
      GameState.tournament &&
      localStorage.getItem('mini_card_battle_tournament_deck_obj');

    if (!isTournamentSnapshotLoaded) {
      if (activeDeck.premiumCards) {
        GameState.premiumCards = [...activeDeck.premiumCards];
      } else {
        activeDeck.premiumCards = [...GameState.premiumCards];
      }
    }

    // トーナメント進行中またはダンジョンモード進行中（ダンジョンスナップショットロード済み）の場合は上書きしない
    const isDeckSnapshotProtected =
      (GameState.gameMode === 'tournament' &&
        GameState.tournament &&
        GameState.playerDeckSelection &&
        GameState.playerDeckSelection.length > 0) ||
      (GameState.gameMode === 'battle_dungeon' &&
        GameState.isDungeonSnapshotLoaded &&
        GameState.playerDeckSelection &&
        GameState.playerDeckSelection.length > 0);

    if (!isDeckSnapshotProtected) {
      GameState.playerDeckSelection = activeDeck.cards.map((item) => {
        const id = typeof item === 'string' ? item : item.id || '';
        const t = CARD_MASTER.find((m) => m.id === id);
        return t ? { ...t } : typeof item === 'string' ? { id: item } : item;
      });
    }
  } else {
    GameState.playerDeckSelection = getInitialDeck();
  }
}

export function createNewDeck(leaderId) {
  if (!GameState.decks) GameState.decks = [];
  if (GameState.decks.length >= MAX_DECK_SLOTS) return false;

  // 新規作成時のデフォルトプレミアム設定は常にグローバルの設定（LocalStorage）から取得する
  const globalPremiumSrc = localStorage.getItem(
    'mini_card_battle_premium_cards'
  );
  let globalPremiumCards = [];
  if (globalPremiumSrc) {
    try {
      globalPremiumCards = JSON.parse(globalPremiumSrc).filter((id) =>
        VALID_PREMIUM_CARDS.includes(id)
      );
    } catch (e) {
      console.error(
        'Failed to parse global premium cards in createNewDeck:',
        e
      );
      globalPremiumCards = [];
    }
  }

  const newDeck = {
    id: `deck_${Date.now()}_${GameState.decks.length}`,
    name: `デッキ${GameState.decks.length + 1}`,
    leaderId: leaderId || 'knight',
    playmatId: null,
    playerSkins: {},
    premiumCards: globalPremiumCards,
    cards: getInitialDeck().map((c) => c.id),
  };
  GameState.decks.push(newDeck);
  if (
    GameState.gameMode !== 'defense_register' &&
    GameState.gameMode !== 'battle_dungeon'
  ) {
    saveSafeNormalDecks(GameState.decks);
  }
  return GameState.decks.length - 1; // 生成したデッキのインデックスを返す
}

/**
 * カード配列（カードオブジェクトまたはカードIDの配列）を CARD_MASTER の定義順（ID順）にソートします。
 */
export function sortCardsByMasterOrder(cards) {
  if (!Array.isArray(cards)) return [];
  const cardOrderMap = new Map();
  (CARD_MASTER || []).forEach((c, i) => cardOrderMap.set(c.id, i));

  return [...cards].sort((a, b) => {
    const idA = typeof a === 'string' ? a : a.baseId || a.id;
    const idB = typeof b === 'string' ? b : b.baseId || b.id;
    const idxA = cardOrderMap.get(idA) ?? Number.MAX_SAFE_INTEGER;
    const idxB = cardOrderMap.get(idB) ?? Number.MAX_SAFE_INTEGER;
    return idxA - idxB;
  });
}

export function saveCurrentEditDeck() {
  if (GameState.decks && GameState.decks.length > GameState.currentDeckIndex) {
    const activeDeck = GameState.decks[GameState.currentDeckIndex];

    // 選択デッキのカードを定義順（ID順）に整列
    if (Array.isArray(GameState.playerDeckSelection)) {
      GameState.playerDeckSelection = sortCardsByMasterOrder(
        GameState.playerDeckSelection
      );
    }

    // トーナメントモードでは学園スキンが強制設定されているため、
    // 通常デッキのスキン情報を上書きしない（他モードへの汚染を防止）
    if (GameState.gameMode === 'tournament') {
      const snapshotDeck = {
        ...activeDeck,
        premiumCards: Array.isArray(GameState.premiumCards)
          ? [...GameState.premiumCards]
          : activeDeck.premiumCards
            ? [...activeDeck.premiumCards]
            : [],
        cards: GameState.playerDeckSelection.map((c) =>
          typeof c === 'string' ? c : c.baseId || c.id
        ),
      };
      localStorage.setItem(
        'mini_card_battle_tournament_deck_obj',
        JSON.stringify(snapshotDeck)
      );
      return;
    }

    activeDeck.playmatId = GameState.selectedPlaymatId;
    activeDeck.playerSkins = { ...GameState.playerSkins };

    activeDeck.premiumCards = [...GameState.premiumCards];
    activeDeck.cards = GameState.playerDeckSelection.map((c) =>
      typeof c === 'string' ? c : c.baseId || c.id
    );

    if (GameState.gameMode === 'defense_register') {
      localStorage.setItem(
        'mini_card_battle_defense_deck_obj',
        JSON.stringify(activeDeck)
      );
      // 旧来の他モジュールからの参照のため配列版も残す
      localStorage.setItem(
        'mini_card_battle_deck_defense',
        JSON.stringify(activeDeck.cards)
      );
    } else if (
      GameState.gameMode === 'battle_dungeon' ||
      activeDeck?.id === DUNGEON_DECK_ID
    ) {
      if (activeDeck) {
        const activeLeaderId =
          GameState.playerConfig?.id || activeDeck.leaderId;
        activeDeck.leaderId = activeLeaderId;
        activeDeck.id = DUNGEON_DECK_ID;
        activeDeck.name = activeDeck.name || DUNGEON_DECK_NAME;

        // ダンジョン用デッキの playerSkins をクリーンアップ
        if (
          CHARACTERS[activeLeaderId] &&
          GameState.playerSkins?.[activeLeaderId]
        ) {
          activeDeck.playerSkins = {
            [activeLeaderId]: GameState.playerSkins[activeLeaderId],
          };
        } else {
          activeDeck.playerSkins = {};
        }
      }
      // 試練の宮殿用の一時デッキは通常デッキ配列への誤上書きを避けて専用キーへ保存する
      localStorage.setItem(
        'mini_card_battle_dungeon_deck_obj',
        JSON.stringify(activeDeck)
      );

      // ダンジョン進行セーブデータ (mini_card_battle_dungeon_save) にも編集後のデッキ構成を即座に同期・保存
      if (typeof window.saveDungeonProgress === 'function') {
        window.saveDungeonProgress();
      }
    } else {
      // 【絶対厳守ガード】通常デッキ保存箱への書き込み安全性チェック
      // 先行分岐で tournament / battle_dungeon / defense_register は処理済みのため、
      // 万一通常モード中に特殊デッキオブジェクトが混入している場合をID基準で検査・防御する
      if (isSpecialDeck(activeDeck)) {
        console.warn(
          '特殊モードのデッキが検出されたため、通常デッキ保存箱（DECKS_KEY）への上書きを阻止しました:',
          activeDeck
        );
        return;
      }

      saveSafeNormalDecks(GameState.decks);
    }
  }

  // プレイヤースキンの適用（セーブ後の同期ズレ防止）
  applySkinToPlayerConfig();
}

export function saveDeck() {
  if (GameState.gameMode === 'online_deck_edit') {
    const settings = {
      leaderId: GameState.playerConfig?.id || 'android',
      stage: GameState.selectedStageId || 'plain',
    };
    localStorage.setItem(
      'mini_card_battle_online_last_settings',
      JSON.stringify(settings)
    );
  }

  // 試練・防衛戦含め、デッキ自体の保存は `saveCurrentEditDeck` の分岐に一任する
  saveCurrentEditDeck();

  const invKey = `mini_card_battle_inventory`;
  localStorage.setItem(invKey, JSON.stringify(GameState.playerInventory));

  // プレミアムカード解放状態もセーブ
  localStorage.setItem(
    'mini_card_battle_unlocked_premium',
    JSON.stringify(GameState.unlockedPremiumCards)
  );

  // 所持プレイマットもセーブ
  localStorage.setItem(
    'mini_card_battle_owned_playmats',
    JSON.stringify(ownedPlaymats)
  );
}

export function startBattleFlow() {
  loadDeck();
  renderDeckEdit();
  switchScreen('screen-deck-edit');
}

export let renderDeckEditHook = null;
export function setRenderDeckEditHook(h) {
  renderDeckEditHook = h;
}
export function renderDeckEdit() {
  if (renderDeckEditHook) return renderDeckEditHook();
  executeRenderDeckEdit();
}
export function executeRenderDeckEdit() {
  // DeckEditorScreen.jsx handles the rendering natively.
}

export function addCardToDeck(template) {
  const inDeckCount = GameState.playerDeckSelection.filter(
    (c) => c.id === template.id
  ).length;
  const ownedCount = GameState.playerInventory[template.id] || 0;
  if (inDeckCount >= ownedCount) return;

  GameState.playerDeckSelection.push({ ...template });
  playSound(SOUNDS.seClick);
  renderDeckEdit();
}

export function removeCardFromDeck(cardId) {
  const index = GameState.playerDeckSelection.findIndex((c) => c.id === cardId);
  if (index !== -1) {
    GameState.playerDeckSelection.splice(index, 1);
    playSound(SOUNDS.seClick);
    renderDeckEdit();
  }
}

export function clearDeck() {
  playSound(SOUNDS.seClick);
  showConfirmModal('デッキのカードをすべて削除しますか？', () => {
    GameState.playerDeckSelection = [];
    renderDeckEdit();
  });
}

export function resetDeck() {
  playSound(SOUNDS.seClick);
  showConfirmModal('デッキを初期状態に戻しますか？', () => {
    GameState.playerDeckSelection = getInitialDeck();
    renderDeckEdit();
  });
}

export function finishDeckEdit() {
  if (GameState.playerDeckSelection.length !== DECK_SIZE) {
    playSound(SOUNDS.seClick);
    showAlertModal(`デッキを${DECK_SIZE}枚にしてください！`);
    return;
  }
  playSound(SOUNDS.seClick);
  saveDeck(); // ここでまとめて保存

  if (GameState.gameMode === 'defense_register') {
    submitDefenseDeck();
  } else if (GameState.gameMode === 'online_deck_edit') {
    GameState.appState = 'online';
    if (window.reloadOnlineLobbyConfig) window.reloadOnlineLobbyConfig();
    showOnlineLobby();
  } else {
    GameState.appState = 'battle';
    prepareBattle();
  }
}

/**
 * 現在選択中のデッキを防衛デッキとしてサーバーに登録します。
 *
 * @param {string|null} [providedName=null] 指定されたプレイヤー名（省略時は保存済み名またはデフォルト名を使用）
 * @returns {Promise<void>}
 */
export async function submitDefenseDeck(providedName = null) {
  const playerName = resolvePlayerName(providedName);

  playSound(SOUNDS.seClick);
  saveUserProfile({ name: playerName });

  const sortedSelection = sortCardsByMasterOrder(
    GameState.playerDeckSelection || []
  );

  const uuid = getOrCreateUUID();
  const payload = {
    uuid,
    name: playerName,
    icon: resolveValidIconId(GameState.userProfile?.icon),
    character: GameState.playerConfig.id,
    stage: GameState.selectedStageId || 'plain',
    deck: sortedSelection.map((c) => ({
      id: typeof c === 'string' ? c : c.id,
      isPremium: Boolean(
        GameState.premiumCards &&
        GameState.premiumCards.includes(typeof c === 'string' ? c : c.id)
      ),
    })),
    playmat: GameState.selectedPlaymatId,
    skin: GameState.playerSkins
      ? GameState.playerSkins[GameState.playerConfig.id]
      : null,
    // トークン画像等の正しい表示のため、デッキ固有のスキン設定全体も送信
    skins: GameState.playerSkins || {},
    points:
      parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0,
    total_points:
      parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) ||
      0,
  };

  console.log('Registering defense deck:', payload);

  // UIを閉じる
  closePlayerNameModal();

  try {
    const result = await asyncPost('register_deck.php', payload, {
      timeout: DEFENSE_DECK_REGISTRATION_TIMEOUT_MS,
    });

    if (result && result.success) {
      showAlertModal('防衛デッキの登録が完了しました！', () => {
        showDefenseMenu();
      });
    } else {
      throw new Error(result?.error || 'Unknown error');
    }
  } catch (err) {
    console.error('Registration error:', err);
    showAlertModal(
      '登録に失敗しました。サーバーの設定や接続を確認してください。\n' +
        err.message
    );
  }
}

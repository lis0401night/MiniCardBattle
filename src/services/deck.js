import { CAMPAIGN_DECKS } from '../utils/constants/campaign_decks.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { DECK_SIZE, MAX_DECK_SLOTS } from '../utils/constants/config.js';
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
  shuffleArray,
  switchScreen,
  VALID_PREMIUM_GIFS,
  VALID_PREMIUM_JPGS,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { prepareBattle } from '../game/battle.js';
import { saveCampaignProgress } from '../game/campaign.js';
import { GameState } from '../state/gameState.js';
import {
  closePlayerNameModal,
  showDefenseMenu,
  showOnlineLobby,
} from './uiMainCore.js';
import { showAlertModal, showConfirmModal } from './uiModals.js';

// ==========================================
// カードIDのマイグレーション（後方互換性維持用）
// ==========================================
export const CARD_ID_MIGRATION_MAP = {
  copy: 'eye',
  chameleon: 'instructor',
  zombie: 'fly',
  bigai: 'bigeye',
  wish: 'rampage',
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
        owner: owner,
        imgUrl: imgUrl,
        power: t.power,
        basePower: t.power,
        currentPower: t.power,
        isPremium: isPremium,
        skills: t.skills ? t.skills.map((s) => ({ ...s })) : undefined,
      };
    });
    return shuffleArray(deck);
  }

  if (owner === 'blue') {
    deck = GameState.playerDeckSelection.map((t, i) => {
      const isPremium = GameState.premiumCards.includes(t.id);
      const tempObj = { ...t, isPremium: isPremium };
      const imgUrl = getCardImgUrl(tempObj);
      return {
        ...t,
        baseId: t.id,
        id: `${owner}_${sessionId}_${i}`,
        owner: owner,
        imgUrl: imgUrl,
        power: t.power,
        basePower: t.power,
        currentPower: t.power,
        isPremium: isPremium,
        skills: t.skills ? t.skills.map((s) => ({ ...s })) : undefined,
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
    } else if (GameState.gameMode === 'battle_dungeon' && config.dungeonDeck) {
      deckIds = config.dungeonDeck;
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
      if (GameState.gameMode === 'defense_attack') recipeId = 'player_defense'; // 追加

      let recipe;
      if (GameState.gameMode === 'tournament') {
        // トーナメント時は専用デッキ（event_tournament）から取得
        const charId = recipeId;
        const patterns = TOURNAMENT_DECKS[charId];
        if (patterns && patterns.length > 0) {
          // ランダムにパターンを選ぶ
          const patternIdx = Math.floor(Math.random() * patterns.length);
          recipe = patterns[patternIdx];
        } else {
          recipe = ENEMY_DECKS[charId] || ENEMY_DECKS.android;
        }
      } else if (GameState.gameMode === 'campaign') {
        recipe = CAMPAIGN_DECKS[recipeId];
      } else {
        recipe = ENEMY_DECKS[recipeId] || ENEMY_DECKS.android;
      }

      if (Array.isArray(recipe)) {
        // パターンデッキやキャンペーンデッキの場合
        deckIds = recipe;
      } else if (recipe.easy && recipe.normal && recipe.hard) {
        if (typeof GameState.aiLevel !== 'undefined') {
          if (GameState.aiLevel == 1) deckIds = recipe.easy;
          else if (GameState.aiLevel == 3) deckIds = recipe.hard;
          else deckIds = recipe.normal;
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
        owner: owner,
        imgUrl: imgUrl,
        power: p,
        basePower: t.power,
        currentPower: p,
        isPremium: isPremium,
        skills: t.skills ? t.skills.map((s) => ({ ...s })) : undefined,
      });
    });
  }
  return shuffleArray(deck);
}

/**
 * リーダー別のおすすめ初期デッキを生成 (20枚・同名5枚制限厳守)
 */
export function getInitialDeck(charId) {
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

    // 2. 通常デッキ (mini_card_battle_decks)
    const decksKey = 'mini_card_battle_decks';
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
      if (GameState.campaignDeck && Array.isArray(GameState.campaignDeck)) {
        GameState.campaignDeck = GameState.campaignDeck.map((id) =>
          migrateCardId(id)
        );
      }
      if (GameState.campaignCards && Array.isArray(GameState.campaignCards)) {
        GameState.campaignCards = GameState.campaignCards.map((id) =>
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
  // 1. ダンジョン特殊処理
  if (GameState.gameMode === 'battle_dungeon') {
    if (
      !GameState.playerDeckSelection ||
      GameState.playerDeckSelection.length !== 20
    ) {
      GameState.playerDeckSelection = (GameState.dungeonCards || [])
        .slice(0, 20)
        .map((id) => {
          const template = CARD_MASTER.find((c) => c.id === id);
          return template ? { ...template } : null;
        })
        .filter(Boolean);
    }
    return;
  }

  if (GameState.gameMode === 'campaign') {
    GameState.playerDeckSelection = (GameState.campaignDeck || [])
      .map((id) => {
        const template = CARD_MASTER.find((c) => c.id === id);
        return template ? { ...template } : null;
      })
      .filter(Boolean);

    GameState.playerInventory = {};
    if (GameState.campaignCards) {
      GameState.campaignCards.forEach((id) => {
        GameState.playerInventory[id] =
          (GameState.playerInventory[id] || 0) + 1;
      });
    }
    return;
  }

  // 2. 全体（アカウント）設定のベース読み込み
  // 全体スキン
  const skinsKey = 'mini_card_battle_skins';
  const skinsSaved = localStorage.getItem(skinsKey);
  let globalSkins = {};
  if (skinsSaved) {
    try {
      globalSkins = JSON.parse(skinsSaved);
    } catch (e) {
      globalSkins = {};
    }
  }
  GameState.playerSkins = { ...globalSkins };

  // インベントリ
  const invKey = `mini_card_battle_inventory`;
  const invSaved = localStorage.getItem(invKey);
  if (invSaved) {
    try {
      GameState.playerInventory = JSON.parse(invSaved);
    } catch (e) {
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
      GameState.premiumCards = JSON.parse(premiumSaved).filter(
        (id) =>
          VALID_PREMIUM_GIFS.includes(id) || VALID_PREMIUM_JPGS.includes(id)
      );
    } catch (e) {
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
        (id) =>
          VALID_PREMIUM_GIFS.includes(id) || VALID_PREMIUM_JPGS.includes(id)
      );
    } catch (e) {
      GameState.unlockedPremiumCards = [];
    }
  } else {
    GameState.unlockedPremiumCards = [];
  }

  // 所持プレイマットの読み込み
  const playmatsKey = `mini_card_battle_owned_playmats`;
  const playmatsSaved = localStorage.getItem(playmatsKey);
  if (playmatsSaved) {
    try {
      setOwnedPlaymats(JSON.parse(playmatsSaved));
    } catch (e) {
      setOwnedPlaymats([]);
    }
  } else {
    setOwnedPlaymats([]);
  }

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
      } catch (e) {
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
        } catch (e) {
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
        GameState.decks = [JSON.parse(dungeonSaved)];
      } catch (e) {
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
              id: 'dungeon_deck',
              name: '試練の宮殿デッキ',
              leaderId: data.playerConfig?.id || data.leaderId || 'android',
              playmatId: null,
              playerSkins: {},
              premiumCards: [...GameState.premiumCards],
              cards: deckCardsStr,
            },
          ];
        } catch (e) {
          GameState.decks = [];
        }
      } else {
        GameState.decks = [];
      }
    }
  } else if (GameState.gameMode === 'tournament') {
    // トーナメントモードでも GameState.decks には常に通常デッキを読み込む。
    // スナップショットデッキは playerDeckSelection にのみ適用し、
    // デッキ一覧画面に表示されないようにする。
    const decksSaved = localStorage.getItem('mini_card_battle_decks');
    if (decksSaved) {
      try {
        GameState.decks = JSON.parse(decksSaved);
      } catch (e) {
        GameState.decks = [];
      }
    } else {
      GameState.decks = [];
    }
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
      } catch (e) {
        // スナップショット読み込みエラー時は通常デッキのselectionを使用
      }
    }
  } else {
    // 通常のデッキ（最大20個）
    const decksSaved = localStorage.getItem('mini_card_battle_decks');
    if (decksSaved) {
      try {
        GameState.decks = JSON.parse(decksSaved);
      } catch (e) {
        GameState.decks = [];
      }
    } else {
      GameState.decks = [];
    }

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
      if (GameState.gameMode === 'defense_register')
        GameState.decks[0].name = '防衛デッキ';
      if (GameState.gameMode === 'battle_dungeon')
        GameState.decks[0].name = '試練の宮殿デッキ';
      if (GameState.gameMode === 'tournament')
        GameState.decks[0].name = 'トーナメントデッキ';
    } else {
      // 新規プレイヤー向けの初期設定：全キャラクター（リーダー）分の初期デッキを生成
      const leaderIds = Object.keys(CHARACTERS).filter(
        (id) =>
          id !== 'player' &&
          id !== 'campaign_player' &&
          id !== 'unknown' &&
          id !== 'npc' &&
          id !== 'satan'
      );
      leaderIds.forEach((id) => {
        const char = CHARACTERS[id];
        if (char && (!GameState.decks || GameState.decks.length < MAX_DECK_SLOTS)) {
          const newIndex = createNewDeck(id);
          if (newIndex !== false && GameState.decks[newIndex]) {
            // 名前が長すぎないよう、シンプルにキャラ名+デッキにする
            const shortName = char.name.split(' ').pop(); // 「機動戦姫 アイギス」なら「アイギス」
            GameState.decks[newIndex].name = `${shortName}デッキ`.substring(
              0,
              12
            );
          }
        }
      });
      GameState.currentDeckIndex = 0;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'mini_card_battle_decks',
          JSON.stringify(GameState.decks)
        );
      }
    }
  }

  if (GameState.decks.length > 0) {
    const activeDeck = GameState.decks[GameState.currentDeckIndex];
    const templateChar = CHARACTERS[activeDeck.leaderId] || CHARACTERS.android;
    if (!GameState.playerConfig || GameState.appState !== 'select_player') {
      // トーナメント進行中はstartTournamentMatchで設定済みのplayerConfig（名前・スキン設定）を保持する
      if (
        GameState.gameMode === 'tournament' &&
        GameState.tournament &&
        GameState.playerConfig
      ) {
        // playerConfigは維持し、上書きしない
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

    if (activeDeck.premiumCards) {
      GameState.premiumCards = [...activeDeck.premiumCards];
    } else {
      activeDeck.premiumCards = [...GameState.premiumCards];
    }

    // トーナメント進行中かつスナップショットデッキが既にロード済みの場合は上書きしない
    const tournamentSnapshotLoaded =
      GameState.gameMode === 'tournament' &&
      GameState.tournament &&
      GameState.playerDeckSelection &&
      GameState.playerDeckSelection.length > 0;

    if (!tournamentSnapshotLoaded) {
      GameState.playerDeckSelection = activeDeck.cards.map((item) => {
        const id = typeof item === 'string' ? item : item.id || '';
        const t = CARD_MASTER.find((m) => m.id === id);
        return t ? { ...t } : typeof item === 'string' ? { id: item } : item;
      });
    }
  } else {
    GameState.playerDeckSelection = getInitialDeck(
      GameState.playerConfig?.id || 'knight'
    );
  }

  // 選択中プレイマットの読み込み
  let playmatSelectKey = `mini_card_battle_playmat_${GameState.playerConfig?.id || 'android'}`;
  if (
    typeof GameState.gameMode !== 'undefined' &&
    GameState.gameMode === 'defense_register'
  ) {
    playmatSelectKey = 'mini_card_battle_playmat_defense';
  }
  // デッキに紐付いて無い場合のフォールバック
  if (!GameState.selectedPlaymatId) {
    GameState.selectedPlaymatId =
      localStorage.getItem(playmatSelectKey) || null;
  }
}

export function createNewDeck(leaderId) {
  if (!GameState.decks) GameState.decks = [];
  if (GameState.decks.length >= MAX_DECK_SLOTS) return false;

  // 新規作成時のデフォルトプレミアム設定は常にグローバルの設定（LocalStorage）から取得する
  const globalPremiumSrc = localStorage.getItem(
    'mini_card_battle_premium_cards'
  );
  const globalPremiumCards = globalPremiumSrc
    ? JSON.parse(globalPremiumSrc).filter(
        (id) =>
          VALID_PREMIUM_GIFS.includes(id) || VALID_PREMIUM_JPGS.includes(id)
      )
    : [];

  const newDeck = {
    id: `deck_${Date.now()}_${GameState.decks.length}`,
    name: `デッキ${GameState.decks.length + 1}`,
    leaderId: leaderId || 'knight',
    playmatId: null,
    playerSkins: {},
    premiumCards: globalPremiumCards,
    cards: getInitialDeck(leaderId || 'knight').map((c) => c.id),
  };
  GameState.decks.push(newDeck);
  if (
    GameState.gameMode !== 'defense_register' &&
    GameState.gameMode !== 'battle_dungeon'
  ) {
    localStorage.setItem(
      'mini_card_battle_decks',
      JSON.stringify(GameState.decks)
    );
  }
  return GameState.decks.length - 1; // 生成したデッキのインデックスを返す
}

export function saveCurrentEditDeck() {
  if (GameState.gameMode === 'campaign') {
    GameState.campaignDeck = GameState.playerDeckSelection.map((c) =>
      typeof c === 'string' ? c : c.baseId || c.id
    );
    saveCampaignProgress();
    return;
  }

  if (GameState.decks && GameState.decks.length > GameState.currentDeckIndex) {
    const activeDeck = GameState.decks[GameState.currentDeckIndex];

    // トーナメントモードでは学園スキンが強制設定されているため、
    // 通常デッキのスキン情報を上書きしない（他モードへの汚染を防止）
    if (GameState.gameMode === 'tournament') {
      const snapshotDeck = {
        ...activeDeck,
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
    } else if (GameState.gameMode === 'battle_dungeon') {
      localStorage.setItem(
        'mini_card_battle_dungeon_deck_obj',
        JSON.stringify(activeDeck)
      );
    } else {
      localStorage.setItem(
        'mini_card_battle_decks',
        JSON.stringify(GameState.decks)
      );
    }
  }
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

  // 選択中プレイマットもセーブ
  let playmatSelectKey = GameState.playerConfig
    ? `mini_card_battle_playmat_${GameState.playerConfig.id}`
    : null;
  if (
    typeof GameState.gameMode !== 'undefined' &&
    GameState.gameMode === 'defense_register'
  ) {
    playmatSelectKey = 'mini_card_battle_playmat_defense';
  }
  if (playmatSelectKey) {
    if (GameState.selectedPlaymatId) {
      localStorage.setItem(playmatSelectKey, GameState.selectedPlaymatId);
    } else {
      localStorage.removeItem(playmatSelectKey);
    }
  }

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
  if (GameState.playerDeckSelection.length >= DECK_SIZE) return;
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
    GameState.playerDeckSelection = getInitialDeck(GameState.playerConfig.id);
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
    if (window.showPlayerNameModalState) {
      window.showPlayerNameModalState();
    }
  } else if (GameState.gameMode === 'online_deck_edit') {
    GameState.appState = 'online';
    if (window.reloadOnlineLobbyConfig) window.reloadOnlineLobbyConfig();
    showOnlineLobby();
  } else if (GameState.gameMode === 'campaign') {
    GameState.appState = 'battle';
    prepareBattle();
  } else {
    GameState.appState = 'battle';
    prepareBattle();
  }
}

export async function submitDefenseDeck(providedName = null) {
  const playerName = providedName ? providedName.trim() : '';

  if (!playerName) {
    showAlertModal('プレイヤーネームを入力してください。');
    return;
  }

  playSound(SOUNDS.seClick);
  localStorage.setItem('mini_card_battle_player_name', playerName);

  const uuid = getOrCreateUUID();
  const payload = {
    uuid: uuid,
    name: playerName,
    character: GameState.playerConfig.id,
    stage: GameState.selectedStageId, // 追加
    deck: GameState.playerDeckSelection.map((c) => ({
      id: c.id,
      isPremium: GameState.premiumCards.includes(c.id),
    })),
  };

  console.log('Registering defense deck:', payload);

  // UIを閉じる
  closePlayerNameModal();

  try {
    const response = await fetch('api/register_deck.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid: getOrCreateUUID(),
        name: playerName,
        character: GameState.playerConfig.id,
        stage: GameState.selectedStageId || 'plain',
        deck: GameState.playerDeckSelection.map((c) => ({
          id: c.id,
          isPremium: GameState.premiumCards
            ? GameState.premiumCards.includes(c.id)
            : false,
        })),
        playmat: GameState.selectedPlaymatId,
        skin: GameState.playerSkins
          ? GameState.playerSkins[GameState.playerConfig.id]
          : null,
        // トークン画像等の正しい表示のため、デッキ固有のスキン設定全体も送信
        skins: GameState.playerSkins || {},
        points:
          parseInt(localStorage.getItem('mini_card_battle_defense_points')) ||
          0,
        total_points:
          parseInt(
            localStorage.getItem('mini_card_battle_defense_total_points')
          ) || 0,
      }),
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const result = await response.json();
    if (result.success) {
      showAlertModal('防衛デッキの登録が完了しました！', () => {
        showDefenseMenu();
      });
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (err) {
    console.error('Registration error:', err);
    showAlertModal(
      '登録に失敗しました。サーバーの設定や接続を確認してください。\n' +
        err.message
    );
  }
}

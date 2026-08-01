/**
 * Mini Card Battle - Game Configuration
 */
import { SKIN_MASTER, buildSkinId, buildPlaymatId } from './skins.js';

export const GAME_VERSION = '0.2.7';
export const GAME_KEY_PREFIX = 'mini_card_battle_';
export const DEFAULT_PLAYER_NAME = 'プレイヤー';
export const DEFAULT_PLAYER_ICON = 'player';

// TODO: appStateの全状態名（title, select_deck, battle, pre_dialogue 等）を
// 一括定数化し、文字列リテラルの直接比較を排除する
/** appState: 練習モードの敵デッキ選択状態 */
export const APP_STATE_SELECT_ENEMY_DECK = 'select_enemy_deck';
export const VERSION_CHECK_TIMEOUT_MS = 3000; // バージョン自動チェック時のAbortタイムアウト時間 (ms)
export const MAX_HP = 20;
export const DECK_SIZE = 20;
export const MAX_CARD_COPIES = 4; // 同一カードの最大編成枚数
export const MAX_DECK_SLOTS = 30; // デッキ登録の最大上限数
export const STORY_BANNED_LEADER_IDS = ['automata']; // ストーリーモードで使用できないリーダーキャラクターID
export const TOURNAMENT_BANNED_LEADER_IDS = []; // 夢幻の闘技祭で使用できないリーダーキャラクターID
export const AI_THINKING_DURATION = 800; // 敵AIが対象を選択する際の思考ウェイト時間 (ms)
export const PLACE_ANIMATION_DURATION = 300; // カード登場・配置演出時のウェイト時間 (ms)
export const MAX_DISCARD_PREVIEW_COUNT = 999; // 墓地確認モーダルで全カードを表示するための最大値
export const RELOAD_CACHE_CLEAR_TIMEOUT_MS = 5000; // キャッシュクリア強制リロード時のタイムアウト時間 (ms)
export const PROFILE_NAME_KEY = 'mini_card_battle_player_name';
export const PROFILE_ICON_KEY = 'mini_card_battle_player_icon';
export const FAVORITE_CARD_KEY = 'mini_card_battle_favorite_card';
export const UNLOCKED_SKINS_KEY = 'mini_card_battle_unlocked_skins';
export const UNLOCKED_ICONS_KEY = 'mini_card_battle_unlocked_icons';
export const OWNED_PLAYMATS_KEY = 'mini_card_battle_owned_playmats';
export const UNLOCKED_PREMIUM_CARDS_KEY =
  'mini_card_battle_unlocked_premium_cards';

export const CHALLENGE_POINTS_KEY = 'mini_card_battle_challenge_points';
export const CHALLENGE_TOTAL_POINTS_KEY =
  'mini_card_battle_challenge_total_points';
export const TOURNAMENT_POINTS_KEY = 'mini_card_battle_tournament_points';
export const TOURNAMENT_TOTAL_POINTS_KEY =
  'mini_card_battle_tournament_total_points';
export const DEFENSE_POINTS_KEY = 'mini_card_battle_defense_points';
export const DEFENSE_TOTAL_POINTS_KEY = 'mini_card_battle_defense_total_points';
export const DEFENSE_WINS_KEY = 'mini_card_battle_defense_wins';
export const DEFENSE_HISTORY_KEY = 'mini_card_battle_defense_history';
export const FORTUNE_POINTS_KEY = 'mini_card_battle_fortune_points';
export const FORTUNE_TOTAL_POINTS_KEY = 'mini_card_battle_fortune_total_points';
export const DUNGEON_MAX_STREAK_KEY = 'mini_card_battle_dungeon_max_streak';
export const LAST_HEARTBEAT_KEY = 'mini_card_battle_last_heartbeat'; // ハートビート最終送信日（1日1回制限用）
export const DECK_EDIT_GRID_DENSITY_KEY =
  'mini_card_battle_deck_edit_grid_density';
export const GALLERY_GRID_DENSITY_KEY = 'mini_card_battle_gallery_grid_density';

// カード表示密度：3列表示を最大サイズ(0)とし、段階的に列数を増やして縮小する
export const GRID_DENSITY_COLS = [3, 4, 5];
export const GRID_DENSITY_GAPS = [15, 10, 7];

// 交換コストの定義（カテゴリ・レアリティ別）
export const GOLD_PREMIUM_EXCHANGE_COST = 20; // ゴールド・プレミアムカード
export const SILVER_PREMIUM_EXCHANGE_COST = 10; // シルバー・プレミアムカード
export const GOLD_CARD_EXCHANGE_COST = 5; // ゴールド・非プレミアム（通常）カード

export const SKIN_EXCHANGE_COST = 20; // キャラクタースキン一律
export const PLAYMAT_EXCHANGE_COST = 10; // プレイマット一律
export const ICON_EXCHANGE_COST = 5; // アバターアイコン一律

// 防衛戦 交換所ラインナップ
export const EXCHANGE_LINEUP = [
  { id: 'cyberdragon', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'dragon', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'assassin', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'empress', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'oldgod', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'wolf', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'vampire', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'djinn', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'shogun', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'pharaoh', type: 'premium', cost: GOLD_PREMIUM_EXCHANGE_COST },
  { id: 'dreadnought', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'armsuits', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'hammer', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'berserker', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'horse', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'crusher', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'shark', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'parasite', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'shaman', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'darkelf', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'doom', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'acolyte', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'plaguedoctor', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'servant', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'ring', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'battlemage', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'yukionna', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'muramasa', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'kitepriest', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'snakepriest', type: 'premium', cost: SILVER_PREMIUM_EXCHANGE_COST },
  { id: 'badwolf', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
  { id: 'redhood', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
];

// ---------------------------------------------------------------------------
// 交換所ラインナップ生成ヘルパー
// ---------------------------------------------------------------------------

/**
 * スキンマスタから特定のスキンタイプの交換所アイテムを自動生成する。
 * スキン・プレイマット・アイコンの3種を一括生成する。
 * @param {string} skinType - スキンタイプ ('summer' | 'school')
 * @param {Object} costs - コスト情報 { skin: number, playmat: number, icon: number }
 * @returns {Array<Object>} 交換所アイテム配列
 */
function generateSkinExchangeItems(skinType, costs) {
  const skins = SKIN_MASTER[skinType];
  if (!skins) return [];

  /** @type {Array<Object>} */
  const items = [];

  // スキン商品
  for (const [charId, skinData] of Object.entries(skins)) {
    items.push({
      id: buildSkinId(charId, skinType),
      type: 'skin',
      charId,
      name: skinData.name,
      description: skinData.description || '',
      cost: costs.skin,
    });
  }

  // プレイマット商品
  for (const [charId, skinData] of Object.entries(skins)) {
    items.push({
      id: buildPlaymatId(charId, skinType),
      type: 'playmat',
      name: skinData.name,
      description: skinData.description || '',
      cost: costs.playmat,
    });
  }

  // アイコン商品
  for (const [charId, skinData] of Object.entries(skins)) {
    items.push({
      id: buildSkinId(charId, skinType),
      type: 'icon',
      name: skinData.name,
      description: skinData.description || '',
      cost: costs.icon,
    });
  }

  return items;
}

// 試練の宮殿 交換所ラインナップ（水着スキン + カード）
export const CHALLENGE_EXCHANGE_LINEUP = [
  ...generateSkinExchangeItems('summer', {
    skin: SKIN_EXCHANGE_COST,
    playmat: PLAYMAT_EXCHANGE_COST,
    icon: ICON_EXCHANGE_COST,
  }),
  { id: 'queen', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
  { id: 'snowwhite', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
];

// トーナメント 交換所ラインナップ（学園スキン + カード）
export const TOURNAMENT_EXCHANGE_LINEUP = [
  ...generateSkinExchangeItems('school', {
    skin: SKIN_EXCHANGE_COST,
    playmat: PLAYMAT_EXCHANGE_COST,
    icon: ICON_EXCHANGE_COST,
  }),
  { id: 'threebears', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
  { id: 'goldilocks', type: 'card', cost: GOLD_CARD_EXCHANGE_COST },
];

/**
 * アセットURLにバージョンクエリパラメータを付与してキャッシュを強制破棄します。
 * @param {string} url - アセットURL
 * @returns {string} クエリパラメータが付与されたURL
 */
export function appendVersionQuery(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('assets/')) {
    return url;
  }
  if (/[?&]v=/.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${GAME_VERSION}`;
}

// 防衛戦の選出ターゲット定数
export const DEFENSE_TARGET_COUNT = 5;
export const HIGH_TIER_PICK_COUNT = 1;
export const MID_TIER_PICK_COUNT = 2;
export const LOW_TIER_PICK_COUNT = 2;

/**
 * バージョン付きの背景スタイルオブジェクトを生成します。
 *
 * @param {string} backgroundImage - 背景画像名（例: 'background_select.webp'）または url(...) 指定
 * @param {number} [op1=0.7] - グラデーション開始時の不透明度
 * @param {number} [op2=0.9] - グラデーション終了時の不透明度
 * @returns {object} CSSスタイルオブジェクト
 */
export function getVersionedBackgroundStyle(
  backgroundImage,
  op1 = 0.7,
  op2 = 0.9
) {
  if (!backgroundImage) return {};
  const isUrl = backgroundImage.includes('url');
  if (isUrl) {
    return {
      backgroundImage: backgroundImage.replace(
        /url\(['"]?([^'")\s]+)['"]?\)/g,
        (match, urlPath) => `url('${appendVersionQuery(urlPath)}')`
      ),
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }

  const finalPath = backgroundImage.includes('assets/')
    ? backgroundImage
    : `assets/backgrounds/${backgroundImage}`;

  return {
    backgroundImage: `linear-gradient(rgba(15, 23, 42, ${op1}), rgba(15, 23, 42, ${op2})), url('${appendVersionQuery(finalPath)}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

/**
 * 共通の背景スタイルオブジェクトを生成します。
 * @param {string} imagePath - 背景画像のアセットパス
 * @returns {object} CSSスタイルオブジェクト
 */
export function getScreenBackgroundStyle(imagePath) {
  return getVersionedBackgroundStyle(imagePath, 0.7, 0.9);
}

/**
 * ステージ用の背景スタイルオブジェクトを生成します。
 * @param {string} stageId - ステージID
 * @returns {object} CSSスタイルオブジェクト
 */
export function getStageBackgroundStyle(stageId) {
  return {
    backgroundImage: `url('${appendVersionQuery(`assets/backgrounds/background_${stageId}.webp`)}')`,
  };
}
export const DEFAULT_DUNGEON_AI_LEVEL = 3;

// 運命の邂逅 交換所ラインナップ
export const FORTUNE_EXCHANGE_LINEUP = [
  // マキナのカード
  { id: 'agent', type: 'card', cost: 5 },
  { id: 'motorcycle', type: 'card', cost: 5 },
  { id: 'employee', type: 'card', cost: 3 },
  { id: 'detective', type: 'card', cost: 3 },
  { id: 'scrapper', type: 'card', cost: 1 },
  { id: 'liberator', type: 'card', cost: 1 },
];

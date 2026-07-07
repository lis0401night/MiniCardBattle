import { saveDeck } from '../../services/deck.js';
import { GameState } from '../../state/gameState.js';
import { CARD_MASTER } from './cards.js';
import { INITIAL_PLAYER_CARD } from './initial_cards.js';
import { ownedPlaymats } from './playmats.js';
import { UNLOCKED_SKINS_KEY, UNLOCKED_ICONS_KEY } from './config.js';

/**
 * Mini Card Battle - Achievements Data
 */

// 実績の定義
export const ACHIEVEMENT_MASTER = [
  // --- チュートリアルクリア数 ---
  {
    id: 'tutorial_clear_2',
    title: '入門者の知恵',
    description: 'チュートリアルを2種類クリアする',
    type: 'tutorial_clear',
    targetValue: 2,
    reward: { type: 'card', value: 'light', name: '無垢の光' },
  },
  {
    id: 'tutorial_clear_4',
    title: '探求の道標',
    description: 'チュートリアルを4種類クリアする',
    type: 'tutorial_clear',
    targetValue: 4,
    reward: { type: 'card', value: 'light', name: '無垢の光' },
  },
  {
    id: 'tutorial_clear_6',
    title: '戦術の体得',
    description: 'チュートリアルを6種類クリアする',
    type: 'tutorial_clear',
    targetValue: 6,
    reward: { type: 'card', value: 'light', name: '無垢の光' },
  },
  {
    id: 'tutorial_clear_8',
    title: '万象の理',
    description: 'チュートリアルを8種類クリアする',
    type: 'tutorial_clear',
    targetValue: 8,
    reward: { type: 'card', value: 'light', name: '無垢の光' },
  },
  {
    id: 'tutorial_clear_all',
    title: '完全なる光の導き',
    description: '全てのチュートリアルをクリアする',
    type: 'tutorial_clear',
    targetValue: 11,
    reward: {
      type: 'premium',
      value: 'light',
      name: '無垢の光',
      isPremiumUnlock: true,
    },
  },
  // --- ストーリークリア ---
  {
    id: 'story_android',
    title: '機械人形の帰還',
    description: 'アイギスのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'android',
    reward: { type: 'playmat', value: 'android', name: 'アイギス' },
  },
  {
    id: 'story_android_hard',
    title: '感情の最適解',
    description: 'アイギスのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'android',
    reward: {
      type: 'premium',
      value: 'golem',
      name: '大理石のゴーレム',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_dragon',
    title: '竜姫の凱旋',
    description: 'イグニスのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'dragon',
    reward: { type: 'playmat', value: 'dragon', name: 'イグニス' },
  },
  {
    id: 'story_dragon_hard',
    title: '猛火の灰燼',
    description: 'イグニスのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'dragon',
    reward: {
      type: 'premium',
      value: 'dancer',
      name: '魅惑の踊り子',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_knight',
    title: '光の誓い',
    description: 'セレスティアのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'knight',
    reward: { type: 'playmat', value: 'knight', name: 'セレスティア' },
  },
  {
    id: 'story_knight_hard',
    title: '白銀の誓光',
    description: 'セレスティアのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'knight',
    reward: {
      type: 'premium',
      value: 'clone',
      name: '鏡の戦士',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_cthulhu',
    title: '深淵の呼び声',
    description: 'ナイアのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'cthulhu',
    reward: { type: 'playmat', value: 'cthulhu', name: 'ナイア' },
  },
  {
    id: 'story_cthulhu_hard',
    title: '無窮の深淵',
    description: 'ナイアのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'cthulhu',
    reward: {
      type: 'premium',
      value: 'diviner',
      name: '星詠みの占術士',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_elf',
    title: '記憶の彼方へ',
    description: 'リナのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'elf',
    reward: { type: 'playmat', value: 'elf', name: 'リナ' },
  },
  {
    id: 'story_elf_hard',
    title: '真理の銀矢',
    description: 'リナのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'elf',
    reward: {
      type: 'premium',
      value: 'sniper',
      name: '森の射手',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_cleric',
    title: '偽りの救済',
    description: 'エリシアのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'cleric',
    reward: { type: 'playmat', value: 'cleric', name: 'エリシア' },
  },
  {
    id: 'story_cleric_hard',
    title: '背徳の聖女',
    description: 'エリシアのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'cleric',
    reward: {
      type: 'premium',
      value: 'cleric',
      name: '見習い修道女',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_devilhunter',
    title: '仕事の流儀',
    description: 'マリアのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'devilhunter',
    reward: { type: 'playmat', value: 'devilhunter', name: 'マリア' },
  },
  {
    id: 'story_devilhunter_hard',
    title: '特大の棺桶',
    description: 'マリアのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'devilhunter',
    reward: {
      type: 'premium',
      value: 'necromancer',
      name: 'ヴィス・ガルドの背教者',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_witch',
    title: '魔女の戯れ',
    description: 'クロエのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'witch',
    reward: { type: 'playmat', value: 'witch', name: 'クロエ' },
  },
  {
    id: 'story_witch_hard',
    title: '因果の果てに',
    description: 'クロエのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'witch',
    reward: {
      type: 'premium',
      value: 'beginnermagic',
      name: '初級魔術',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_oni',
    title: '鬼ヶ島の怪火',
    description: 'カグラのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'oni',
    reward: { type: 'playmat', value: 'oni', name: 'カグラ' },
  },
  {
    id: 'story_oni_hard',
    title: '羅生門の鬼',
    description: 'カグラのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'oni',
    reward: {
      type: 'premium',
      value: 'omyouji',
      name: '漆黒の除霊師',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'story_priest',
    title: '千年の眠り',
    description: 'ネフティのストーリーをクリアする',
    type: 'story_clear',
    targetValue: 'priest',
    reward: { type: 'playmat', value: 'priest', name: 'ネフティ' },
  },
  {
    id: 'story_priest_hard',
    title: '王墓の守護者',
    description: 'ネフティのストーリー（上級）をクリアする',
    type: 'story_clear_hard',
    targetValue: 'priest',
    reward: {
      type: 'premium',
      value: 'mummy',
      name: '王墓の番人',
      isPremiumUnlock: true,
    },
  },
  {
    id: 'unique_story_2',
    title: '広がる世界',
    description: '2種類のキャラクターのストーリーをクリアする',
    type: 'unique_story_clear',
    targetValue: 2,
    reward: { type: 'card', value: 'crown', name: '道化師' },
  },
  {
    id: 'unique_story_4',
    title: '紡がれる絆',
    description: '4種類のキャラクターのストーリーをクリアする',
    type: 'unique_story_clear',
    targetValue: 4,
    reward: { type: 'card', value: 'crown', name: '道化師' },
  },
  {
    id: 'unique_story_6',
    title: '歴戦の指導者',
    description: '6種類のキャラクターのストーリーをクリアする',
    type: 'unique_story_clear',
    targetValue: 6,
    reward: { type: 'card', value: 'crown', name: '道化師' },
  },
  {
    id: 'unique_story_8',
    title: '英雄たちの王',
    description: '8種類のキャラクターのストーリーをクリアする',
    type: 'unique_story_clear',
    targetValue: 8,
    reward: { type: 'card', value: 'crown', name: '道化師' },
  },
  {
    id: 'unique_story_hard_2',
    title: '高みへの第一歩',
    description: '2種類のキャラクターのストーリー（上級）をクリアする',
    type: 'unique_story_clear_hard',
    targetValue: 2,
    reward: { type: 'card', value: 'scarecrow', name: '呪いの案山子' },
  },
  {
    id: 'unique_story_hard_4',
    title: '数多の試練を越えて',
    description: '4種類のキャラクターのストーリー（上級）をクリアする',
    type: 'unique_story_clear_hard',
    targetValue: 4,
    reward: { type: 'card', value: 'scarecrow', name: '呪いの案山子' },
  },
  {
    id: 'unique_story_hard_6',
    title: '伝説への歩み',
    description: '6種類のキャラクターのストーリー（上級）をクリアする',
    type: 'unique_story_clear_hard',
    targetValue: 6,
    reward: { type: 'card', value: 'scarecrow', name: '呪いの案山子' },
  },
  {
    id: 'unique_story_hard_8',
    title: '英雄たちの導き手',
    description: '8種類のキャラクターのストーリー（上級）をクリアする',
    type: 'unique_story_clear_hard',
    targetValue: 8,
    reward: { type: 'card', value: 'scarecrow', name: '呪いの案山子' },
  },
  // --- カード収集 ---
  {
    id: 'collect_10',
    title: '見習い収集家',
    description: '異なるカードを20種類集める',
    type: 'collection',
    targetValue: 20,
    reward: { type: 'card', value: 'baldanders', name: 'バルトアンデルス' },
  },
  {
    id: 'collect_20',
    title: 'Mr.コレクター',
    description: '異なるカードを40種類集める',
    type: 'collection',
    targetValue: 40,
    reward: { type: 'card', value: 'baldanders', name: 'バルトアンデルス' },
  },
  {
    id: 'collect_30',
    title: '真理の探究者',
    description: '異なるカードを60種類集める',
    type: 'collection',
    targetValue: 60,
    reward: { type: 'card', value: 'baldanders', name: 'バルトアンデルス' },
  },
  {
    id: 'collect_40',
    title: '魂の目録',
    description: '異なるカードを80種類集める',
    type: 'collection',
    targetValue: 80,
    reward: { type: 'card', value: 'baldanders', name: 'バルトアンデルス' },
  },
  // --- フリーバトル勝利数 ---
  {
    id: 'free_win_10',
    title: '駆け出しの闘士',
    description: 'バトルで累計10回勝利する',
    type: 'free_battle_win',
    targetValue: 10,
    reward: { type: 'card', value: 'shuffler', name: 'シャッフラー' },
  },
  {
    id: 'free_win_20',
    title: '強者',
    description: 'バトルで累計20回勝利する',
    type: 'free_battle_win',
    targetValue: 20,
    reward: { type: 'card', value: 'shuffler', name: 'シャッフラー' },
  },
  {
    id: 'free_win_30',
    title: '百戦錬磨',
    description: 'バトルで累計30回勝利する',
    type: 'free_battle_win',
    targetValue: 30,
    reward: { type: 'card', value: 'shuffler', name: 'シャッフラー' },
  },
  {
    id: 'free_win_40',
    title: '闘技場の覇者',
    description: 'バトルで累計40回勝利する',
    type: 'free_battle_win',
    targetValue: 40,
    reward: { type: 'card', value: 'shuffler', name: 'シャッフラー' },
  },
  // --- 高難易度クリア ---
  {
    id: 'event_satan_clear',
    title: '復活の魔王',
    description: '高難易度イベントでサタンを倒す',
    type: 'event_clear',
    targetValue: 'satan_high',
    reward: { type: 'playmat', value: 'satan', name: 'サタン' },
  },
  {
    id: 'event_satan_clear_icon',
    title: '魔王の肖像',
    description: '高難易度イベントでサタンを倒す',
    type: 'event_clear',
    targetValue: 'satan_high',
    reward: { type: 'icon', value: 'satan', name: 'サタン' },
  },
  {
    id: 'event_android_high_clear_skin',
    title: '機巧の極致',
    description: '高難易度イベントでアイギスを倒す',
    type: 'event_clear',
    targetValue: 'android_high',
    reward: {
      type: 'skin',
      value: 'android_high',
      name: 'フルアーマーユニット',
    },
  },
  {
    id: 'event_android_high_clear_pm',
    title: '鋼鉄の戦場',
    description: '高難易度イベントでアイギスを倒す',
    type: 'event_clear',
    targetValue: 'android_high',
    reward: {
      type: 'playmat',
      value: 'pm_android_high',
      name: 'フルアーマーユニット',
    },
  },
  {
    id: 'event_android_high_clear_icon',
    title: '機巧の肖像',
    description: '高難易度イベントでアイギスを倒す',
    type: 'event_clear',
    targetValue: 'android_high',
    reward: {
      type: 'icon',
      value: 'android_high',
      name: 'フルアーマーユニット',
    },
  },
  {
    id: 'event_dragon_high_clear_skin',
    title: '砂漠の宴の覇者',
    description: '高難易度イベントでイグニスを倒す',
    type: 'event_clear',
    targetValue: 'dragon_high',
    reward: { type: 'skin', value: 'dragon_high', name: '熱砂の客人' },
  },
  {
    id: 'event_dragon_high_clear_pm',
    title: '熱砂の闘技場',
    description: '高難易度イベントでイグニスを倒す',
    type: 'event_clear',
    targetValue: 'dragon_high',
    reward: { type: 'playmat', value: 'pm_dragon_high', name: '熱砂の客人' },
  },
  {
    id: 'event_dragon_high_clear_icon',
    title: '焔竜の紋章',
    description: '高難易度イベントでイグニスを倒す',
    type: 'event_clear',
    targetValue: 'dragon_high',
    reward: {
      type: 'icon',
      value: 'dragon_high',
      name: '熱砂の客人',
    },
  },
  {
    id: 'event_knight_high_clear_skin',
    title: '魔剣の呪い',
    description: '高難易度イベントでセレスティアを倒す',
    type: 'event_clear',
    targetValue: 'knight_high',
    reward: { type: 'skin', value: 'knight_high', name: '暗黒騎士' },
  },
  {
    id: 'event_knight_high_clear_pm',
    title: '血の渓谷',
    description: '高難易度イベントでセレスティアを倒す',
    type: 'event_clear',
    targetValue: 'knight_high',
    reward: { type: 'playmat', value: 'pm_knight_high', name: '暗黒騎士' },
  },
  {
    id: 'event_knight_high_clear_icon',
    title: '魔剣の紋章',
    description: '高難易度イベントでセレスティアを倒す',
    type: 'event_clear',
    targetValue: 'knight_high',
    reward: {
      type: 'icon',
      value: 'knight_high',
      name: '暗黒騎士',
    },
  },
  {
    id: 'event_cthulhu_high_clear_skin',
    title: '魔界の征服者',
    description: '高難易度イベントでナイアを倒す',
    type: 'event_clear',
    targetValue: 'cthulhu_high',
    reward: { type: 'skin', value: 'cthulhu_high', name: '魔界の征服者' },
  },
  {
    id: 'event_cthulhu_high_clear_pm',
    title: '深淵の玉座',
    description: '高難易度イベントでナイアを倒す',
    type: 'event_clear',
    targetValue: 'cthulhu_high',
    reward: { type: 'playmat', value: 'pm_cthulhu_high', name: '魔界の征服者' },
  },
  {
    id: 'event_cthulhu_high_clear_icon',
    title: '深淵の印章',
    description: '高難易度イベントでナイアを倒す',
    type: 'event_clear',
    targetValue: 'cthulhu_high',
    reward: { type: 'icon', value: 'cthulhu_high', name: '魔界の征服者' },
  },
  {
    id: 'event_elf_high_clear_skin',
    title: 'リナ&ヴォイテク',
    description: '高難易度イベントでリナを倒す',
    type: 'event_clear',
    targetValue: 'elf_high',
    reward: { type: 'skin', value: 'elf_high', name: 'リナ&ヴォイテク' },
  },
  {
    id: 'event_elf_high_clear_pm',
    title: 'ロストレイルの森',
    description: '高難易度イベントでリナを倒す',
    type: 'event_clear',
    targetValue: 'elf_high',
    reward: { type: 'playmat', value: 'pm_elf_high', name: 'リナ&ヴォイテク' },
  },
  {
    id: 'event_elf_high_clear_icon',
    title: '流浪の印',
    description: '高難易度イベントでリナを倒す',
    type: 'event_clear',
    targetValue: 'elf_high',
    reward: { type: 'icon', value: 'elf_high', name: 'リナ&ヴォイテク' },
  },
  {
    id: 'event_cleric_high_clear_skin',
    title: '断罪の執行者',
    description: '高難易度イベントでエリシアを倒す',
    type: 'event_clear',
    targetValue: 'cleric_high',
    reward: { type: 'skin', value: 'cleric_high', name: '断罪の執行者' },
  },
  {
    id: 'event_cleric_high_clear_pm',
    title: '断罪の祭壇',
    description: '高難易度イベントでエリシアを倒す',
    type: 'event_clear',
    targetValue: 'cleric_high',
    reward: { type: 'playmat', value: 'pm_cleric_high', name: '断罪の執行者' },
  },
  {
    id: 'event_cleric_high_clear_icon',
    title: '断罪の刻印',
    description: '高難易度イベントでエリシアを倒す',
    type: 'event_clear',
    targetValue: 'cleric_high',
    reward: {
      type: 'icon',
      value: 'cleric_high',
      name: '断罪の執行者',
    },
  },
  {
    id: 'event_devilhunter_high_clear_skin',
    title: 'ゴーストライダー マリア',
    description: '高難易度イベントでマリアを倒す',
    type: 'event_clear',
    targetValue: 'devilhunter_high',
    reward: {
      type: 'skin',
      value: 'devilhunter_high',
      name: 'ゴーストライダー',
    },
  },
  {
    id: 'event_devilhunter_high_clear_pm',
    title: '廃都のレーストラック',
    description: '高難易度イベントでマリアを倒す',
    type: 'event_clear',
    targetValue: 'devilhunter_high',
    reward: {
      type: 'playmat',
      value: 'pm_devilhunter_high',
      name: 'ゴーストライダー',
    },
  },
  {
    id: 'event_devilhunter_high_clear_icon',
    title: '棺の紋章',
    description: '高難易度イベントでマリアを倒す',
    type: 'event_clear',
    targetValue: 'devilhunter_high',
    reward: {
      type: 'icon',
      value: 'devilhunter_high',
      name: 'ゴーストライダー',
    },
  },
  {
    id: 'event_witch_high_clear_skin',
    title: '時空の探索者 クロエ',
    description: '高難易度イベントでクロエを倒す',
    type: 'event_clear',
    targetValue: 'witch_high',
    reward: { type: 'skin', value: 'witch_high', name: '時空の探索者' },
  },
  {
    id: 'event_witch_high_clear_pm',
    title: '時空の裂け目',
    description: '高難易度イベントでクロエを倒す',
    type: 'event_clear',
    targetValue: 'witch_high',
    reward: { type: 'playmat', value: 'pm_witch_high', name: '時空の探索者' },
  },
  {
    id: 'event_witch_high_clear_icon',
    title: '時駆けの刻印',
    description: '高難易度イベントでクロエを倒す',
    type: 'event_clear',
    targetValue: 'witch_high',
    reward: { type: 'icon', value: 'witch_high', name: '時空の探索者' },
  },
  {
    id: 'event_oni_high_clear_skin',
    title: '紅月ノ狂鬼',
    description: '高難易度イベントでカグラを倒す',
    type: 'event_clear',
    targetValue: 'oni_high',
    reward: { type: 'skin', value: 'oni_high', name: '紅月ノ狂鬼' },
  },
  {
    id: 'event_oni_high_clear_pm',
    title: '鬼ヶ島',
    description: '高難易度イベントでカグラを倒す',
    type: 'event_clear',
    targetValue: 'oni_high',
    reward: { type: 'playmat', value: 'pm_oni_high', name: '紅月ノ狂鬼' },
  },
  {
    id: 'event_oni_high_clear_icon',
    title: '紅月の紋章',
    description: '高難易度イベントでカグラを倒す',
    type: 'event_clear',
    targetValue: 'oni_high',
    reward: { type: 'icon', value: 'oni_high', name: '紅月ノ狂鬼' },
  },
  {
    id: 'event_priest_high_clear_skin',
    title: '前世の記憶',
    description: '高難易度イベントでネフティを倒す',
    type: 'event_clear',
    targetValue: 'priest_high',
    reward: { type: 'skin', value: 'priest_high', name: '前世の記憶' },
  },
  {
    id: 'event_priest_high_clear_pm',
    title: '死者の墓廟',
    description: '高難易度イベントでネフティを倒す',
    type: 'event_clear',
    targetValue: 'priest_high',
    reward: { type: 'playmat', value: 'pm_priest_high', name: '前世の記憶' },
  },
  {
    id: 'event_priest_high_clear_icon',
    title: '王墓の印章',
    description: '高難易度イベントでネフティを倒す',
    type: 'event_clear',
    targetValue: 'priest_high',
    reward: {
      type: 'icon',
      value: 'priest_high',
      name: '前世の記憶',
    },
  },
  // --- 防衛戦勝利数 ---
  {
    id: 'defense_win_10',
    title: 'いざ尋常に',
    description: '防衛戦で累計10回勝利する',
    type: 'defense_attack_win',
    targetValue: 10,
    reward: { type: 'card', value: 'invader', name: '彼方からの侵略者' },
  },
  {
    id: 'defense_win_20',
    title: '喧嘩屋',
    description: '防衛戦で累計20回勝利する',
    type: 'defense_attack_win',
    targetValue: 20,
    reward: { type: 'card', value: 'invader', name: '彼方からの侵略者' },
  },
  {
    id: 'defense_win_30',
    title: '城塞の守護者',
    description: '防衛戦で累計30回勝利する',
    type: 'defense_attack_win',
    targetValue: 30,
    reward: { type: 'card', value: 'invader', name: '彼方からの侵略者' },
  },
  {
    id: 'defense_win_40',
    title: '難攻不落',
    description: '防衛戦で累計40回勝利する',
    type: 'defense_attack_win',
    targetValue: 40,
    reward: { type: 'card', value: 'invader', name: '彼方からの侵略者' },
  },
  // --- 試練の宮殿到達階層 ---
  {
    id: 'dungeon_reach_10',
    title: '迷宮への入り口',
    description: '試練の宮殿で10Fに到達する',
    type: 'dungeon_reach',
    targetValue: 10,
    reward: { type: 'card', value: 'dicejuggler', name: 'ダイスジャグラー' },
  },
  {
    id: 'dungeon_reach_20',
    title: '試練の始まり',
    description: '試練の宮殿で20Fに到達する',
    type: 'dungeon_reach',
    targetValue: 20,
    reward: { type: 'card', value: 'dicejuggler', name: 'ダイスジャグラー' },
  },
  {
    id: 'dungeon_reach_30',
    title: '深淵なる探索者',
    description: '試練の宮殿で30Fに到達する',
    type: 'dungeon_reach',
    targetValue: 30,
    reward: { type: 'card', value: 'dicejuggler', name: 'ダイスジャグラー' },
  },
  {
    id: 'dungeon_reach_40',
    title: '宮殿の支配者',
    description: '試練の宮殿で40Fに到達する',
    type: 'dungeon_reach',
    targetValue: 40,
    reward: { type: 'card', value: 'dicejuggler', name: 'ダイスジャグラー' },
  },
  // --- 夢幻の闘技祭 ---
  {
    id: 'tournament_round_1',
    title: '闘技祭の幕開け',
    description: '夢幻の闘技祭で1回戦に勝利する',
    type: 'event_clear',
    targetValue: 'tournament_round_1',
    reward: { type: 'card', value: 'bell', name: '葬送の鐘' },
  },
  {
    id: 'tournament_round_2',
    title: '勝ち上がる闘志',
    description: '夢幻の闘技祭で2回戦に勝利する',
    type: 'event_clear',
    targetValue: 'tournament_round_2',
    reward: { type: 'card', value: 'bell', name: '葬送の鐘' },
  },
  {
    id: 'tournament_round_3',
    title: '決勝への道',
    description: '夢幻の闘技祭で3回戦に勝利する',
    type: 'event_clear',
    targetValue: 'tournament_round_3',
    reward: { type: 'card', value: 'bell', name: '葬送の鐘' },
  },
  {
    id: 'tournament_round_4',
    title: '夢幻の覇者',
    description: '夢幻の闘技祭で決勝戦に勝利する',
    type: 'event_clear',
    targetValue: 'tournament_round_4',
    reward: { type: 'card', value: 'bell', name: '葬送の鐘' },
  },
  // --- 実績達成数 ---
  {
    id: 'total_unlock_5',
    title: '踏み出した一歩',
    description: '実績を累計5個達成する',
    type: 'total_unlock',
    targetValue: 5,
    reward: { type: 'card', value: 'homunculus', name: 'ホムンクルスの実験体' },
  },
  {
    id: 'total_unlock_10',
    title: '確かなる功績',
    description: '実績を累計10個達成する',
    type: 'total_unlock',
    targetValue: 10,
    reward: { type: 'card', value: 'homunculus', name: 'ホムンクルスの実験体' },
  },
  {
    id: 'total_unlock_15',
    title: '語り継がれる偉業',
    description: '実績を累計15個達成する',
    type: 'total_unlock',
    targetValue: 15,
    reward: { type: 'card', value: 'homunculus', name: 'ホムンクルスの実験体' },
  },
  {
    id: 'total_unlock_20',
    title: '神話の紡ぎ手',
    description: '実績を累計20個達成する',
    type: 'total_unlock',
    targetValue: 20,
    reward: { type: 'card', value: 'homunculus', name: 'ホムンクルスの実験体' },
  },
];

// --- 実績・履歴データの管理 ---
export const achievementData = {
  achievements: {}, // id: { progress: number, isUnlocked: boolean, isRewarded: boolean }
  stats: {
    leaderUsage: {}, // leaderId: count
    storyClears: {}, // leaderId: count
    storyClearsHard: {}, // leaderId: count
    freeBattleWins: 0,
    maxDungeonFloor: 0,
    defenseWins: 0,
    defenseAttackWins: 0,
    voidDefeated: 0, // ゼノン撃破フラグ（実績管理）
    succubusDefeated: 0, // ヴィオラ撃破フラグ（実績管理）
    warlockDefeated: 0, // バルタザール撃破フラグ（実績管理）
  },
};

export const ACHIEVEMENTS_STORAGE_KEY = 'mini_card_battle_achievements';

// 実績データの初期化・ロード（メインメニュー遷移時などに呼ぶ）
export function loadAchievements() {
  const saved = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // 構造の互換性維持
      achievementData.achievements = parsed.achievements || {};
      achievementData.stats = parsed.stats || {
        leaderUsage: {},
        storyClears: {},
        storyClearsHard: {},
        eventClear: {},
        freeBattleWins: 0,
        voidDefeated: 0,
        succubusDefeated: 0,
        warlockDefeated: 0,
      };
      if (!achievementData.stats.leaderUsage)
        achievementData.stats.leaderUsage = {};
      if (!achievementData.stats.storyClears)
        achievementData.stats.storyClears = {};
      if (!achievementData.stats.storyClearsHard)
        achievementData.stats.storyClearsHard = {};
      if (!achievementData.stats.eventClear)
        achievementData.stats.eventClear = {};
      if (typeof achievementData.stats.freeBattleWins !== 'number')
        achievementData.stats.freeBattleWins = 0;
      if (typeof achievementData.stats.maxDungeonFloor !== 'number')
        achievementData.stats.maxDungeonFloor = 0;
      if (typeof achievementData.stats.defenseWins !== 'number')
        achievementData.stats.defenseWins = 0;
      if (typeof achievementData.stats.defenseAttackWins !== 'number')
        achievementData.stats.defenseAttackWins = 0;
      if (typeof achievementData.stats.voidDefeated !== 'number')
        achievementData.stats.voidDefeated = 0;
      if (typeof achievementData.stats.succubusDefeated !== 'number')
        achievementData.stats.succubusDefeated = 0;
      if (typeof achievementData.stats.warlockDefeated !== 'number')
        achievementData.stats.warlockDefeated = 0;
    } catch (e) {
      console.error('Failed to parse achievements data', e);
    }
  }
  checkCollectionAchievements(); // カード収集状況はロード時に常に最新化して判定する
  checkUniqueStoryAchievements(); // ストーリーのクリア種類数もロード時に判定
  checkUniqueStoryHardAchievements(); // 上級ストーリーのクリア種類数もロード時に判定
  checkTutorialAchievements(); // チュートリアルのクリア種類数もロード時に判定
  checkTotalAchievementUnlocks(); // 累計実績もロード時に再計算して反映する
  saveAchievements();
}

export function saveAchievements() {
  localStorage.setItem(
    ACHIEVEMENTS_STORAGE_KEY,
    JSON.stringify(achievementData)
  );
}

// 統計データの更新
export function incrementStat(type, key = null, amount = 1) {
  if (type === 'leaderUsage' && key) {
    achievementData.stats.leaderUsage[key] =
      (achievementData.stats.leaderUsage[key] || 0) + amount;
  } else if (type === 'storyClears' && key) {
    achievementData.stats.storyClears[key] =
      (achievementData.stats.storyClears[key] || 0) + amount;
    checkStoryAchievements(key);
  } else if (type === 'storyClearsHard' && key) {
    achievementData.stats.storyClearsHard[key] =
      (achievementData.stats.storyClearsHard[key] || 0) + amount;
    checkStoryHardAchievements(key);
  } else if (type === 'eventClear' && key) {
    achievementData.stats.eventClear = achievementData.stats.eventClear || {};
    achievementData.stats.eventClear[key] =
      (achievementData.stats.eventClear[key] || 0) + amount;
    checkEventAchievements(key);
  } else if (type === 'freeBattleWins') {
    achievementData.stats.freeBattleWins += amount;
    checkFreeBattleAchievements();
  } else if (type === 'maxDungeonFloor') {
    if (amount > (achievementData.stats.maxDungeonFloor || 0)) {
      achievementData.stats.maxDungeonFloor = amount;
      checkDungeonAchievements();
    }
  } else if (type === 'defenseWins') {
    achievementData.stats.defenseWins =
      (achievementData.stats.defenseWins || 0) + amount;
    checkDefenseAchievements();
  } else if (type === 'defenseAttackWins') {
    achievementData.stats.defenseAttackWins =
      (achievementData.stats.defenseAttackWins || 0) + amount;
    checkDefenseAttackAchievements();
  } else if (type === 'voidDefeated') {
    achievementData.stats.voidDefeated =
      (achievementData.stats.voidDefeated || 0) + amount;
  } else if (type === 'succubusDefeated') {
    achievementData.stats.succubusDefeated =
      (achievementData.stats.succubusDefeated || 0) + amount;
  } else if (type === 'warlockDefeated') {
    achievementData.stats.warlockDefeated =
      (achievementData.stats.warlockDefeated || 0) + amount;
  }
  saveAchievements();
}

// 所持カード数の実績チェック（初期カードは収集カウントから除外する）
export function checkCollectionAchievements() {
  if (!GameState.playerInventory) return;

  // 初期カードのIDセット（実績カウントから除外する）
  const initialCardIds = new Set(INITIAL_PLAYER_CARD);

  // トークンと初期カードを除いたマスタカードを対象にする
  const validMasterCards = CARD_MASTER.filter(
    (c) => !c.isToken && !c.id.includes('token') && !initialCardIds.has(c.id)
  );
  const totalValidMasterCount = validMasterCards.length;

  // 所持している有効なカードの種類数
  let ownedCount = 0;
  validMasterCards.forEach((c) => {
    if ((GameState.playerInventory[c.id] || 0) > 0) ownedCount++;
  });

  ACHIEVEMENT_MASTER.filter((a) => a.type === 'collection').forEach((ach) => {
    let maxVal =
      ach.targetValue === -1 ? totalValidMasterCount : ach.targetValue;
    updateAchievement(ach.id, ownedCount, maxVal);
  });
}

// ストーリクリア実績のチェック
function checkStoryAchievements(leaderId) {
  ACHIEVEMENT_MASTER.filter(
    (a) => a.type === 'story_clear' && a.targetValue === leaderId
  ).forEach((ach) => {
    const clears = achievementData.stats.storyClears[leaderId] || 0;
    updateAchievement(ach.id, clears, 1);
  });
  checkUniqueStoryAchievements();
}

// ストーリークリア（上級）実績のチェック
function checkStoryHardAchievements(leaderId) {
  ACHIEVEMENT_MASTER.filter(
    (a) => a.type === 'story_clear_hard' && a.targetValue === leaderId
  ).forEach((ach) => {
    const clears = achievementData.stats.storyClearsHard[leaderId] || 0;
    updateAchievement(ach.id, clears, 1);
  });
  checkUniqueStoryHardAchievements();
}

function checkUniqueStoryHardAchievements() {
  const hardClears = Object.keys(
    achievementData.stats.storyClearsHard || {}
  ).filter((k) => achievementData.stats.storyClearsHard[k] > 0).length;
  ACHIEVEMENT_MASTER.filter(
    (a) => a.type === 'unique_story_clear_hard'
  ).forEach((ach) => {
    updateAchievement(ach.id, hardClears, ach.targetValue);
  });
}

function checkUniqueStoryAchievements() {
  const normalClears = Object.keys(
    achievementData.stats.storyClears || {}
  ).filter((k) => achievementData.stats.storyClears[k] > 0).length;
  ACHIEVEMENT_MASTER.filter((a) => a.type === 'unique_story_clear').forEach(
    (ach) => {
      updateAchievement(ach.id, normalClears, ach.targetValue);
    }
  );
}

// イベントクリア実績のチェック
function checkEventAchievements(eventId) {
  ACHIEVEMENT_MASTER.filter(
    (a) => a.type === 'event_clear' && a.targetValue === eventId
  ).forEach((ach) => {
    const clears = achievementData.stats.eventClear[eventId] || 0;
    updateAchievement(ach.id, clears, 1);
  });
}

// フリーバトル勝利数のチェック
function checkFreeBattleAchievements() {
  const wins = achievementData.stats.freeBattleWins;
  ACHIEVEMENT_MASTER.filter((a) => a.type === 'free_battle_win').forEach(
    (ach) => {
      updateAchievement(ach.id, wins, ach.targetValue);
    }
  );
}

// 試練の宮殿到達階層のチェック
function checkDungeonAchievements() {
  const floor = achievementData.stats.maxDungeonFloor || 0;
  ACHIEVEMENT_MASTER.filter((a) => a.type === 'dungeon_reach').forEach(
    (ach) => {
      updateAchievement(ach.id, floor, ach.targetValue);
    }
  );
}

// 防衛戦勝利数（防衛側のポイント連動等将来用）のチェック
function checkDefenseAchievements() {
  const wins = achievementData.stats.defenseWins || 0;
  ACHIEVEMENT_MASTER.filter((a) => a.type === 'defense_win').forEach((ach) => {
    updateAchievement(ach.id, wins, ach.targetValue);
  });
}

// 防衛戦攻撃勝利数（プレイヤーが能動的に勝った数）のチェック
function checkDefenseAttackAchievements() {
  const wins = achievementData.stats.defenseAttackWins || 0;
  ACHIEVEMENT_MASTER.filter((a) => a.type === 'defense_attack_win').forEach(
    (ach) => {
      updateAchievement(ach.id, wins, ach.targetValue);
    }
  );
}

// チュートリアルクリア数の実績チェック
export function checkTutorialAchievements() {
  let clearedCount = 0;
  try {
    const saved = localStorage.getItem('mini_card_battle_tutorial_progress');
    if (saved) {
      const progress = JSON.parse(saved);
      Object.keys(progress).forEach((key) => {
        if (progress[key] && progress[key].isCleared) {
          clearedCount++;
        }
      });
    }
  } catch (e) {
    console.error('Failed to parse tutorial progress for achievements:', e);
  }

  ACHIEVEMENT_MASTER.filter((a) => a.type === 'tutorial_clear').forEach(
    (ach) => {
      updateAchievement(ach.id, clearedCount, ach.targetValue);
    }
  );
}

// 個別実績の進捗更新処理（内部用）
function updateAchievement(id, currentValue, targetValue) {
  if (!achievementData.achievements[id]) {
    achievementData.achievements[id] = {
      progress: 0,
      isUnlocked: false,
      isRewarded: false,
    };
  }

  const ach = achievementData.achievements[id];
  if (ach.isUnlocked) return; // 既に達成済みなら何もしない

  ach.progress = Math.min(currentValue, targetValue);

  if (ach.progress >= targetValue) {
    ach.isUnlocked = true;
    ach.progress = targetValue;

    if (!id.startsWith('total_unlock_')) {
      checkTotalAchievementUnlocks();
    }
  }
}

// 累計実績達成数のチェック
function checkTotalAchievementUnlocks() {
  let unlockedCount = 0;
  Object.keys(achievementData.achievements).forEach((key) => {
    if (
      achievementData.achievements[key].isUnlocked &&
      !key.startsWith('total_unlock_')
    ) {
      unlockedCount++;
    }
  });

  ACHIEVEMENT_MASTER.filter((a) => a.type === 'total_unlock').forEach((ach) => {
    updateAchievement(ach.id, unlockedCount, ach.targetValue);
  });
}

// 汎用: リストに未登録なら追加し、localStorageへ保存する
function unlockUniqueReward(list, storageKey, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
  localStorage.setItem(storageKey, JSON.stringify(list));
  return list;
}

// 報酬の受け取り処理（将来用）
export function claimAchievementReward(id) {
  const ach = achievementData.achievements[id];
  if (!ach || !ach.isUnlocked || ach.isRewarded) return false;

  const master = ACHIEVEMENT_MASTER.find((a) => a.id === id);
  if (!master || !master.reward) {
    // 報酬が未設定の場合は受け取ったことにするだけ
    ach.isRewarded = true;
    saveAchievements();
    return true;
  }

  // 将来的に報酬（スキン・プレイマット・カード等）を付与する処理をここに記述
  if (master.reward.type === 'playmat') {
    if (!ownedPlaymats.includes(master.reward.value)) {
      ownedPlaymats.push(master.reward.value);
    }
    // プレイマット獲得アニメーション/演出用フラグを返す
    ach.isRewarded = true;
    saveAchievements();
    saveDeck(); // ownedPlaymats を保存するために呼ぶ
    return {
      success: true,
      rewardType: 'playmat',
      rewardValue: master.reward.value,
      rewardName: master.reward.name,
    };
  } else if (master.reward.type === 'card') {
    const cardId = master.reward.value;
    if (!GameState.playerInventory) GameState.playerInventory = {};
    GameState.playerInventory[cardId] =
      (GameState.playerInventory[cardId] || 0) + 1;
    ach.isRewarded = true;
    saveAchievements();
    saveDeck();
    return {
      success: true,
      rewardType: 'card',
      rewardValue: cardId,
      rewardName: master.reward.name,
    };
  } else if (master.reward.type === 'premium') {
    const cardId = master.reward.value;
    // プレミアム解放
    if (!GameState.unlockedPremiumCards.includes(cardId)) {
      GameState.unlockedPremiumCards.push(cardId);
    }
    if (!GameState.premiumCards.includes(cardId)) {
      GameState.premiumCards.push(cardId);
    }
    localStorage.setItem(
      'mini_card_battle_unlocked_premium',
      JSON.stringify(GameState.unlockedPremiumCards)
    );
    localStorage.setItem(
      'mini_card_battle_premium_cards',
      JSON.stringify(GameState.premiumCards)
    );

    ach.isRewarded = true;
    saveAchievements();
    saveDeck();
    return {
      success: true,
      rewardType: 'premium',
      rewardValue: cardId,
      rewardName: master.reward.name,
    };
  } else if (master.reward.type === 'skin') {
    const skinId = master.reward.value;
    if (!GameState.unlockedSkins) {
      GameState.unlockedSkins = [];
    }
    unlockUniqueReward(GameState.unlockedSkins, UNLOCKED_SKINS_KEY, skinId);

    ach.isRewarded = true;
    saveAchievements();
    saveDeck();
    return {
      success: true,
      rewardType: 'skin',
      rewardValue: skinId,
      rewardName: master.reward.name,
    };
  } else if (master.reward.type === 'icon') {
    const iconId = master.reward.value;
    if (!GameState.unlockedIcons) {
      GameState.unlockedIcons = [];
    }
    unlockUniqueReward(GameState.unlockedIcons, UNLOCKED_ICONS_KEY, iconId);

    ach.isRewarded = true;
    saveAchievements();
    saveDeck();
    return {
      success: true,
      rewardType: 'icon',
      rewardValue: iconId,
      rewardName: master.reward.name,
    };
  }

  ach.isRewarded = true;
  saveAchievements();
  return true;
}

export function checkAndFixMissingRewards() {
  if (!achievementData || !achievementData.achievements) return;

  let needsSave = false;
  const cardClaimedCounts = {};

  ACHIEVEMENT_MASTER.forEach((ach) => {
    const data = achievementData.achievements[ach.id];
    if (!data || !data.isRewarded || !ach.reward) return;

    const reward = ach.reward;

    if (reward.type === 'playmat') {
      if (!ownedPlaymats.includes(reward.value)) {
        data.isRewarded = false;
        needsSave = true;
        console.log(`[修正] プレイマット ${reward.value} を未受取に戻しました`);
      }
    } else if (reward.type === 'premium') {
      if (!GameState.unlockedPremiumCards.includes(reward.value)) {
        data.isRewarded = false;
        needsSave = true;
        console.log(
          `[修正] プレミアムカード ${reward.value} を未受取に戻しました`
        );
      }
    } else if (reward.type === 'skin') {
      if (!GameState.unlockedSkins.includes(reward.value)) {
        data.isRewarded = false;
        needsSave = true;
        console.log(`[修正] スキン ${reward.value} を未受取に戻しました`);
      }
    } else if (reward.type === 'icon') {
      const unlocked = GameState.unlockedIcons || [];
      if (!unlocked.includes(reward.value)) {
        data.isRewarded = false;
        needsSave = true;
        console.log(`[修正] アイコン ${reward.value} を未受取に戻しました`);
      }
    } else if (reward.type === 'card') {
      cardClaimedCounts[reward.value] =
        (cardClaimedCounts[reward.value] || 0) + 1;
    }
  });

  const currentInventory = GameState.playerInventory || {};

  Object.keys(cardClaimedCounts).forEach((cardId) => {
    const claimedCount = cardClaimedCounts[cardId];
    const actualCount = currentInventory[cardId] || 0;

    if (actualCount < claimedCount) {
      let missingCount = claimedCount - actualCount;
      ACHIEVEMENT_MASTER.forEach((ach) => {
        const data = achievementData.achievements[ach.id];
        if (
          data &&
          data.isRewarded &&
          ach.reward &&
          ach.reward.type === 'card' &&
          ach.reward.value === cardId
        ) {
          if (missingCount > 0) {
            data.isRewarded = false;
            needsSave = true;
            missingCount--;
            console.log(
              `[修正] カード ${cardId} の不足のため、実績 ${ach.id} を未受取に戻しました`
            );
          }
        }
      });
    }
  });

  if (needsSave) {
    saveAchievements();
  }
}

/**
 * 未受取の実績が存在するかを判定する
 * @returns {boolean} 未受取の実績が存在する場合はtrue
 */
export function hasUnclaimedAchievements() {
  if (!achievementData || !achievementData.achievements) return false;
  return Object.values(achievementData.achievements).some(
    (ach) => ach && ach.isUnlocked && !ach.isRewarded
  );
}

window.loadAchievements = loadAchievements;
window.incrementStat = incrementStat;

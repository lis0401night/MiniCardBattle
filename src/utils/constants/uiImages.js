import { appendVersionQuery } from './config.js';

/** タイトル画面の背景画像の総数（title_img_001.png 〜 の連番。画像を追加したらこの値を増やす） */
export const MAX_TITLE_BGS = 4;

/** タイトル背景画像の連番の最小値 */
export const TITLE_BG_FIRST_INDEX = 1;

/** タイトル背景画像ファイル名の連番桁数（例: 3桁 → 001） */
const TITLE_BG_INDEX_DIGITS = 3;

/**
 * タイトル画面の背景画像URLを取得する
 * @param {number} index - 背景画像の連番（TITLE_BG_FIRST_INDEX 〜 MAX_TITLE_BGS）
 * @return {string} バージョンクエリ付きの背景画像URL
 */
export function getTitleBgUrl(index) {
  const paddedIndex = String(index).padStart(TITLE_BG_INDEX_DIGITS, '0');
  return appendVersionQuery(`assets/ui/title_img_${paddedIndex}.png`);
}

/**
 * タイトル画面の背景画像の連番をランダムに1つ選ぶ
 * @return {number} 背景画像の連番（TITLE_BG_FIRST_INDEX 〜 MAX_TITLE_BGS）
 */
export function pickRandomTitleBgIndex() {
  return Math.floor(Math.random() * MAX_TITLE_BGS) + TITLE_BG_FIRST_INDEX;
}

export const UI_IMAGES = {
  MENU_SOLO: appendVersionQuery('assets/ui/ui_solobutton01.png'),
  MENU_STORY: appendVersionQuery('assets/ui/ui_storybutton01.png'),
  MENU_PRACTICE: appendVersionQuery('assets/ui/ui_practice01.png'),
  MENU_EVENT: appendVersionQuery('assets/ui/ui_eventbutton01.png'),
  MENU_SHOP: appendVersionQuery('assets/ui/ui_shopbutton01.png'),
  MENU_FREE: appendVersionQuery('assets/ui/ui_freebattlebutton01.png'),
  MENU_GALLERY: appendVersionQuery('assets/ui/ui_gallerybutton01.png'),
  EVENT_HIGH_DIFF: appendVersionQuery(
    'assets/ui/ui_event_highdiffbutton01.png'
  ),
  EVENT_DEFENSE: appendVersionQuery('assets/ui/ui_event_defensebutton01.png'),
  GALLERY_CARD_LIST: appendVersionQuery('assets/ui/ui_cardlistbutton01.png'),
  GALLERY_ACHIEVEMENTS: appendVersionQuery(
    'assets/ui/ui_achievementsbutton01.png'
  ),
  GALLERY_GLOSSARY: appendVersionQuery('assets/ui/ui_glossarybutton01.png'),
  MENU_DUNGEON: appendVersionQuery('assets/ui/ui_dungionbutton01.png'),
  MENU_ONLINE: appendVersionQuery('assets/ui/ui_versusbutton01.png'),
  MENU_DECK: appendVersionQuery('assets/ui/ui_deckbutton01.png'),
  EVENT_TOURNAMENT: appendVersionQuery('assets/ui/ui_event_tournament01.png'),
  GUIDE_RULES: appendVersionQuery('assets/ui/ui_Instructionsbutton01.png'),
  GUIDE_TUTORIAL: appendVersionQuery('assets/ui/ui_tutorialbutton01.png'),
  EVENT_FORTUNE: appendVersionQuery('assets/ui/ui_event_fortunebutton01.png'),
  ONLINE_QUICK_MATCH: appendVersionQuery('assets/ui/ui_quickmatchbutton01.png'),
  ONLINE_ROOM_MATCH: appendVersionQuery('assets/ui/ui_roommatchbutton01.png'),
  ONLINE_BATTLE_PASS: appendVersionQuery('assets/ui/ui_battlepassbutton01.png'),
};

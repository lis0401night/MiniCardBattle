/**
 * Mini Card Battle - Skill & Status Emoji Icon Utilities
 *
 * OSやブラウザごとの絵文字デザインの差異を解消するため、
 * スキル・状態異常アイコンの絵文字をローカル同梱の Fluent Emoji 3D（WebP）画像へ変換する共通ユーティリティ。
 */
import { appendVersionQuery } from './constants/config.js';

/** スキル・状態アイコン画像の配置ディレクトリ（public/ からの相対パス） */
const SKILL_ICON_ASSET_DIR = 'assets/icons/skills';

/**
 * ローカルに同梱している Fluent Emoji 3D（64x64 WebP）アイコンのコードポイントキー一覧。
 * 各キーは絵文字のコードポイントから異体字セレクタ（U+FE0F）を除去し、小文字16進数をハイフン連結したもの。
 * 未同梱の絵文字が渡された場合は壊れた画像を出さず元の絵文字テキストへ安全にフォールバックするためのホワイトリストとして機能する。
 */
export const SKILL_ICON_CODEPOINTS = Object.freeze([
  '1f0cf',
  '1f300',
  '1f313',
  '1f317',
  '1f31f',
  '1f32a',
  '1f32b',
  '1f331',
  '1f3a9',
  '1f3ad',
  '1f3af',
  '1f3b2',
  '1f3ba',
  '1f3c3',
  '1f3c6',
  '1f3cd',
  '1f3db',
  '1f406',
  '1f409',
  '1f419',
  '1f43a',
  '1f441',
  '1f451',
  '1f463',
  '1f465',
  '1f46f',
  '1f47b',
  '1f47e',
  '1f480',
  '1f48e',
  '1f496',
  '1f49a',
  '1f49e',
  '1f4a0',
  '1f4a2',
  '1f4a3',
  '1f4a5',
  '1f4ab',
  '1f4b0',
  '1f4dc',
  '1f4e2',
  '1f4e3',
  '1f4ef',
  '1f504',
  '1f506',
  '1f50b',
  '1f513',
  '1f514',
  '1f517',
  '1f525',
  '1f528',
  '1f52a',
  '1f52f',
  '1f531',
  '1f53c',
  '1f56f',
  '1f573',
  '1f578',
  '1f5dd',
  '1f5e1',
  '1f5fa',
  '1f5ff',
  '1f6a9',
  '1f6ab',
  '1f6d1',
  '1f6e1',
  '1f6f8',
  '1f940',
  '1f94b',
  '1f996',
  '1f9a0',
  '1f9be',
  '1f9e0',
  '1f9ea',
  '1f9f1',
  '1f9f2',
  '1f9f5',
  '1f9f9',
  '1fa78',
  '1fa93',
  '1fa96',
  '1faab',
  '1fab5',
  '1fabd',
  '1fae7',
  '1faf3',
  '2195',
  '21a9',
  '23eb',
  '23ec',
  '23ed',
  '23f3',
  '2600',
  '2604',
  '2620',
  '2623',
  '267b',
  '2692',
  '2694',
  '2696',
  '26a1',
  '26aa',
  '26b0',
  '26b1',
  '26d3',
  '26d3-200d-1f4a5',
  '26f0',
  '2728',
  '2744',
  '2753',
]);

/** O(1) ルックアップ用のコードポイントキー集合 */
const SKILL_ICON_CODEPOINT_SET = new Set(SKILL_ICON_CODEPOINTS);

/**
 * HTML属性・本文埋め込み向けに特殊文字をエスケープする内部ヘルパー。
 *
 * @param {string} value - エスケープ対象文字列
 * @returns {string} HTMLエスケープ済み文字列
 */
function escapeHtmlAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * 絵文字文字列を異体字セレクタ（U+FE0F）なしの正規化コードポイントキーへ変換する。
 * 例: '☠️' -> '2620', '⛓' -> '26d3', '🪽' -> '1fabd'
 *
 * @param {string|null|undefined} emoji - 絵文字文字列
 * @returns {string} 正規化コードポイントキー（空または非文字列の場合は空文字列）
 */
export function normalizeEmojiToCodepointKey(emoji) {
  if (!emoji || typeof emoji !== 'string') return '';
  const trimmed = emoji.trim();
  if (!trimmed) return '';
  return [...trimmed]
    .map((ch) => ch.codePointAt(0).toString(16).toLowerCase())
    .filter((cp) => cp !== 'fe0f')
    .join('-');
}

/**
 * 絵文字文字列に対応するローカル同梱 Fluent Emoji 3D（WebP）画像のバージョン付きURLを返す。
 * ホワイトリストに存在しない絵文字の場合は null を返す。
 *
 * @param {string|null|undefined} emoji - スキルまたは状態の絵文字文字列
 * @returns {string|null} 画像URL（未同梱または空の場合は null）
 */
export function getSkillIconPath(emoji) {
  const key = normalizeEmojiToCodepointKey(emoji);
  if (!key || !SKILL_ICON_CODEPOINT_SET.has(key)) {
    return null;
  }
  return appendVersionQuery(`${SKILL_ICON_ASSET_DIR}/${key}.webp`);
}

/**
 * プリロード用に同梱済みスキル・状態アイコン画像のバージョン付きURL一覧を返す。
 *
 * @returns {string[]} 全スキル・状態アイコン画像のURL配列
 */
export function getAllSkillIconUrls() {
  return SKILL_ICON_CODEPOINTS.map((key) =>
    appendVersionQuery(`${SKILL_ICON_ASSET_DIR}/${key}.webp`)
  );
}

/**
 * 絵文字文字列をスキルバッジ・詳細表示用の HTML 文字列（<img> タグ）に変換する。
 * 同梱画像が存在しない場合は元の絵文字文字列を安全にエスケープして返す。
 *
 * @param {string|null|undefined} emoji - 絵文字文字列
 * @param {Object} [options={}] - 表示オプション
 * @param {boolean} [options.trailingSpace=true] - テキストとの間に右余白クラス（または空白）を付与するか
 * @param {string} [options.className=''] - 追加するCSSクラス名
 * @returns {string} 描画用HTML文字列（空入力時は空文字列）
 */
export function renderSkillIconHtml(emoji, options = {}) {
  if (!emoji || typeof emoji !== 'string') return '';
  const trimmed = emoji.trim();
  if (!trimmed) return '';

  const { trailingSpace = true, className = '' } = options;
  const src = getSkillIconPath(trimmed);
  if (!src) {
    const escaped = escapeHtmlAttr(trimmed);
    return trailingSpace ? `${escaped} ` : escaped;
  }

  const classes = [
    'skill-emoji-icon',
    trailingSpace ? 'skill-emoji-icon--trailing' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return `<img class="${escapeHtmlAttr(classes)}" src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(trimmed)}" draggable="false" decoding="async" />`;
}

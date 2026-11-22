import { useState } from 'react';
import { getSkillIconPath } from '../../utils/skillIconUtils.js';

/**
 * スキルおよび状態異常の絵文字をローカル同梱の Fluent Emoji 3D（WebP）画像として描画する共通コンポーネント。
 * 画像が存在しない絵文字やロード失敗時は、元のUnicode絵文字テキストへ安全にフォールバックする。
 *
 * @param {Object} props - コンポーネントプロパティ
 * @param {string|null|undefined} props.icon - スキルまたは状態の絵文字文字列
 * @param {boolean} [props.trailingSpace=false] - 直後に続くラベルテキストとの間に右余白を付与するか
 * @param {string} [props.className=''] - 追加するCSSクラス名
 * @returns {JSX.Element|null} アイコン要素（空入力時は null）
 */
export default function SkillIcon({
  icon,
  trailingSpace = false,
  className = '',
}) {
  // 読み込み失敗した画像URLのみを記録することで、icon変更時に自動リセットされる
  const [failedSrc, setFailedSrc] = useState(null);

  if (!icon || typeof icon !== 'string') return null;
  const trimmed = icon.trim();
  if (!trimmed) return null;

  const src = getSkillIconPath(trimmed);
  if (!src || failedSrc === src) {
    return (
      <span
        className={`skill-emoji-fallback ${trailingSpace ? 'skill-emoji-icon--trailing' : ''} ${className}`.trim()}
      >
        {trimmed}
      </span>
    );
  }

  const classes = [
    'skill-emoji-icon',
    trailingSpace ? 'skill-emoji-icon--trailing' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <img
      className={classes}
      src={src}
      alt={trimmed}
      draggable={false}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}

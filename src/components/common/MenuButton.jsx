import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * 共通メニューボタン
 *
 * @param {string} label - ボタンラベル
 * @param {function} onClick - クリックイベントハンドラ
 * @param {string} [variant='default'] - 'default', 'yellow', 'purple', 'blue', 'orange', 'red', 'emerald'
 * @param {string} [className] - 追加のクラス
 * @param {object} [style] - 追加のインラインスタイル
 * @param {boolean} [disabled] - 無効化状態
 */
export default function MenuButton({
  id,
  label,
  onClick,
  variant = 'default',
  className = '',
  style = {},
  disabled = false,
}) {
  const handleClick = (e) => {
    if (disabled) return;
    playSound(SOUNDS?.seClick);
    if (onClick) onClick(e);
  };

  const btnClassName = `btn btn-fantasy ${disabled ? 'btn-disabled' : `btn-variant-${variant}`} ${className}`;
  const btnStyle = { ...style };

  return (
    <button
      id={id}
      type="button"
      className={btnClassName}
      style={btnStyle}
      onClick={handleClick}
      disabled={disabled}
    >
      <div className="btn-watermark"></div>
      <div className="btn-ornament btn-ornament-tl"></div>
      <div className="btn-ornament btn-ornament-br"></div>
      <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
    </button>
  );
}

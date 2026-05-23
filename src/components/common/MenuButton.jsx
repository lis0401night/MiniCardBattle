import React from 'react';
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

  const getVariantStyle = () => {
    if (disabled) {
      return {
        background: '#475569',
        opacity: 0.5,
        cursor: 'not-allowed',
      };
    }

    switch (variant) {
      case 'purple':
        return { background: 'linear-gradient(45deg, #a855f7, #7e22ce)' };
      case 'blue':
        return { background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)' };
      case 'orange':
        return { background: 'linear-gradient(45deg, #f97316, #ea580c)' };
      case 'red':
        return { background: 'linear-gradient(45deg, #ef4444, #b91c1c)' };
      case 'emerald':
        return { background: 'linear-gradient(45deg, #10b981, #059669)' };
      default:
        return {};
    }
  };

  const btnClassName = `btn ${variant === 'yellow' && !disabled ? 'btn-yellow' : ''} ${className}`;
  const btnStyle = { ...getVariantStyle(), ...style };

  return (
    <button
      className={btnClassName}
      style={btnStyle}
      onClick={handleClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

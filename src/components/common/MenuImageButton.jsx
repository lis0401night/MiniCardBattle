import React from 'react';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * 画像付きの大型メニューボタン
 * 
 * @param {string} label - ボタンのラベルテキスト
 * @param {string} image - 背景画像のURL
 * @param {function} onClick - クリックイベントハンドラ
 */
export default function MenuImageButton({ label, image, onClick }) {
  const handleClick = (e) => {
    playSound(SOUNDS?.seClick);
    if (onClick) onClick(e);
  };

  return (
    <div className="menu-img-btn" onClick={handleClick}>
      <div
        className="menu-img-bg"
        style={{ backgroundImage: `url('${image || ''}')` }}
      ></div>
      <div className="menu-btn-label">{label}</div>
    </div>
  );
}

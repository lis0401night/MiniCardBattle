import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * 画像付きの大型メニューボタン
 *
 * @param {string} label - ボタンのラベルテキスト
 * @param {string} image - 背景画像のURL
 * @param {function} onClick - クリックイベントハンドラ
 * @param {Object} style - 背景（menu-img-bg）に適用する任意のカスタムスタイル（背景色など）
 */
export default function MenuImageButton({ label, image, onClick, style }) {
  const handleClick = (e) => {
    playSound(SOUNDS?.seClick);
    if (onClick) onClick(e);
  };

  return (
    <div className="menu-img-btn" onClick={handleClick}>
      <div
        className="menu-img-bg"
        style={{
          backgroundImage: image ? `url('${image}')` : undefined,
          ...style,
        }}
      ></div>
      <div className="menu-btn-label">{label}</div>
    </div>
  );
}

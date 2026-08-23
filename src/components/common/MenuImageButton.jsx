import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * 画像付きの大型メニューボタン
 *
 * @param {string} label - ボタンのラベルテキスト
 * @param {string} image - 背景画像のURL
 * @param {function} onClick - クリックイベントハンドラ
 * @param {Object} style - 背景（menu-img-bg）に適用する任意のカスタムスタイル（背景色など）。backgroundImageを含めるとimageプロップを上書きします。
 * @param {string} [badgeText] - ボタン上部に表示するバッジテキスト（オプション）
 * @param {boolean} [notificationBadge] - 右上に通知バッジを表示するかどうか（オプション）
 */
export default function MenuImageButton({
  label,
  image,
  onClick,
  style,
  badgeText,
  notificationBadge,
}) {
  const handleClick = (e) => {
    playSound(SOUNDS?.seClick);
    if (onClick) onClick(e);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: 'calc(50% - 12.5px)',
        flex: '0 0 calc(50% - 12.5px)',
        aspectRatio: '1/1',
      }}
    >
      {badgeText && (
        <div
          className="menu-btn-badge badge-animated"
          style={{
            position: 'absolute',
            top: '-15px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(45deg, #22c55e, #16a34a)',
            color: '#000000',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
            border: '1px solid #86efac',
          }}
        >
          {badgeText}
        </div>
      )}
      {notificationBadge && (
        <div
          style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            width: '20px',
            height: '20px',
            background: '#ef4444',
            border: '2px solid white',
            borderRadius: '50%',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
          }}
        />
      )}
      <div
        className="menu-img-btn"
        onClick={handleClick}
        style={{ width: '100%', height: '100%', flex: 'none', margin: 0 }}
      >
        {image ? (
          <img
            className="menu-img-bg"
            src={image}
            alt={label || ''}
            loading="eager"
            decoding="sync"
            draggable={false}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              pointerEvents: 'none',
              borderRadius: 'inherit',
              zIndex: 0,
              ...style,
            }}
          />
        ) : (
          <div
            className="menu-img-bg"
            style={{
              ...style,
            }}
          />
        )}
        <div className="menu-btn-label">{label}</div>
      </div>
    </div>
  );
}

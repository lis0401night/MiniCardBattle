import { useRef, useEffect } from 'react';
import { getCardImgUrl, renderSkillTag } from '../../utils/gameUtils.js';

export default function Card({
  cardObj,
  isBoard = false,
  className = '',
  onClick = undefined,
  onLongPress = undefined,
}) {
  const pressTimer = useRef(null);
  const hasLongPressed = useRef(false);

  useEffect(() => {
    return () => {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
      }
    };
  }, []);

  if (!cardObj) return null;

  const rarityClass = cardObj.isToken
    ? ' rarity-0'
    : cardObj.rarity !== undefined && cardObj.rarity !== null
      ? ` rarity-${cardObj.rarity}`
      : '';
  const filter = cardObj.filter;
  // シャドウ化の特殊処理（敵側のみ）は削除

  const imgUrl = getCardImgUrl(cardObj);

  // スキルタグのHTML生成（Reactレンダー内に安全に埋め込み）
  const skillTagHtml = renderSkillTag(cardObj, isBoard);

  // 長押しとクリックイベントのハンドリング
  const handlePointerDown = (e) => {
    // マウスの場合は左クリックのみ長押し判定開始
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    hasLongPressed.current = false;

    if (onLongPress) {
      pressTimer.current = setTimeout(() => {
        hasLongPressed.current = true;
        onLongPress(cardObj);
        pressTimer.current = null;
      }, 600); // 600ms長押し
    }
  };

  const cancelLongPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleClick = (e) => {
    // 長押しが成立した直後はクリックとして扱わない
    if (hasLongPressed.current) return;
    if (onClick) onClick(e, cardObj);
  };

  const handleContextMenu = (e) => {
    e.preventDefault(); // 右クリックメニューを無効化
  };

  return (
    <div
      className={`card ${cardObj.owner}${rarityClass} ${cardObj.animClass || ''} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
    >
      <div
        className="card-bg"
        style={{
          backgroundImage: `url('${imgUrl}')`,
          filter: filter || 'none',
        }}
      ></div>
      {/* 
        安全確認: skillTagHtml は静的なゲームマスターデータ定義(SKILLS)のみから生成されたバッジHTMLであり、
        外部のユーザー入力が一切混入しないため、XSSなどの脆弱性の恐れはありません。
      */}
      {skillTagHtml && (
        <div dangerouslySetInnerHTML={{ __html: skillTagHtml }} />
      )}
      {isBoard && cardObj.equippedCards && cardObj.equippedCards.length > 0 && (
        <div
          className="card-skill-tag equip-badge"
          style={{
            position: 'absolute',
            top: '-5px',
            left: '-5px',
            background: '#64748b',
            color: '#fff',
            borderColor: '#94a3b8',
            transform: 'scale(0.9)',
            zIndex: 10,
          }}
        >
          ⚔️装備中
        </div>
      )}
      <div className="card-power">
        {cardObj.currentPower !== undefined
          ? cardObj.currentPower
          : cardObj.power}
      </div>
    </div>
  );
}

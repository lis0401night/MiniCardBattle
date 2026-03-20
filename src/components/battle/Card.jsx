import React, { useEffect, useRef } from 'react';
import { getCardImgUrl, renderSkillTag } from '../../utils/gameUtils.js';
import { GameState } from '../../hooks/gameState.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playSound } from '../../utils/gameUtils.js';
import { openCardPreview, setupLongPress } from '../../hooks/uiGallery.js';

export default function Card({ 
    cardObj, 
    isBoard = false, 
    className = "", 
    onClick = undefined, 
    onLongPress = undefined 
}) {
    const cardRef = useRef(null);
    const pressTimer = useRef(null);
    const hasLongPressed = useRef(false);

    if (!cardObj) return null;

    const rarityClass = cardObj.rarity ? ` rarity-${cardObj.rarity}` : '';
    let filter = cardObj.filter;
    // シャドウ化の特殊処理（敵側のみ）
    if (cardObj.owner === 'red' && GameState.enemyConfig && GameState.enemyConfig.isShadow) {
        filter = 'grayscale(1) brightness(0.7) contrast(1.2)';
    }
    // スタン中の色変更
    if (cardObj.stunTurns && cardObj.stunTurns > 0) {
        filter = (filter || '') + ' grayscale(1) brightness(0.5)';
    }

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
            ref={cardRef}
            className={`card ${cardObj.owner}${rarityClass} ${className}`}
            onPointerDown={handlePointerDown}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onContextMenu={handleContextMenu}
            onClick={handleClick}
        >
            <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')`, filter: filter || 'none' }}></div>
            {skillTagHtml && <div dangerouslySetInnerHTML={{ __html: skillTagHtml }} />}
            <div className="card-power">{cardObj.currentPower !== undefined ? cardObj.currentPower : cardObj.power}</div>
        </div>
    );
}

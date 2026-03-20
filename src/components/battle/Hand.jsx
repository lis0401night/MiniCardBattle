import React from 'react';
import Card from './Card.jsx';

export default function Hand({ 
    playerHand, 
    selectedCardIndex, 
    isDiscardingMode, 
    discardSelectedIndices, 
    onCardClick,
    onCardLongPress
}) {
    return (
        <div id="player-hand" className="hand-area">
            {playerHand.map((card, idx) => {
                let classes = "hand-card";
                
                // 選択状態のクラス付与
                if (idx === selectedCardIndex) {
                    classes += " selected";
                }
                
                // 手札入替モード時のクラス付与
                if (isDiscardingMode) {
                    classes += " can-select";
                    if (discardSelectedIndices.includes(idx)) {
                        classes += " selected";
                    }
                }

                return (
                    <Card 
                        key={`${card.id}-${idx}`}
                        cardObj={card} 
                        className={classes}
                        onClick={(e) => onCardClick(idx)}
                        onLongPress={onCardLongPress}
                    />
                );
            })}
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { GameState } from '../../hooks/gameState.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playSound, getCardImgUrl, stopAllBGM } from '../../utils/gameUtils.js';
import { SKILLS } from '../../utils/constants/skills.js';
import { saveDeck } from '../../hooks/deck.js';
import { initSelectScreen } from '../../hooks/uiMainCore.js';
import { handleStoryProgression } from '../../hooks/story.js';
import { setupDialogueScreen } from '../../hooks/uiDialogue.js';
import { switchScreen } from '../../utils/gameUtils.js';
import CardPreviewContent from '../common/CardPreviewContent.jsx';

export default function RewardOverlay() {
    const [isVisible, setIsVisible] = useState(false);
    const [card, setCard] = useState(null);
    const [isRevealed, setIsRevealed] = useState(false);

    useEffect(() => {
        window.showCardRewardReact = (rewardCardId) => {
            const rewardCardTemplate = CARD_MASTER.find(m => m.id === rewardCardId);
            if (rewardCardTemplate) {
                setCard({ ...rewardCardTemplate, owner: 'blue' });
                setIsRevealed(false);
                setIsVisible(true);
            }
        };

        window.closeRewardScreenReact = () => {
            setIsVisible(false);
        };
    }, []);

    if (!isVisible || !card) return null;

    const handleReveal = () => {
        if (isRevealed) return;
        playSound(SOUNDS.seClick);
        setIsRevealed(true);
        GameState.playerInventory[card.id] = (GameState.playerInventory[card.id] || 0) + 1;
        saveDeck();
    };

    const handleNext = (e) => {
        e.stopPropagation();
        playSound(SOUNDS.seClick);
        setIsVisible(false);

        // 報酬確認が終わったら、ダイアログ（会話）シーンへ移行する
        setupDialogueScreen();
    };

    const renderSkillTagReact = (c) => {
        if (!window.renderSkillTag) return null;
        return <div dangerouslySetInnerHTML={{ __html: window.renderSkillTag(c, false) }}></div>;
    };

    return (
        <div className="screen active" style={{ zIndex: 2000, background: 'rgba(0,0,0,0.85)', display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <CardPreviewContent 
                card={card}
                isRevealed={isRevealed}
                onRevealAreaClick={handleReveal}
                renderSkillTagReact={renderSkillTagReact}
                customActionSlot={
                    isRevealed && (
                        <button 
                            className="btn" 
                            style={{ marginTop: '15px', width: '100%', flexShrink: 0, background: 'linear-gradient(45deg, #22c55e, #16a34a)' }} 
                            onClick={handleNext}
                        >
                            次へ
                        </button>
                    )
                }
            />
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { GameState } from '../../hooks/gameState.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playSound, getCardImgUrl } from '../../utils/gameUtils.js';
import { SKILLS } from '../../utils/constants/skills.js';
import { saveDeck } from '../../hooks/deck.js';
import { initSelectScreen } from '../../hooks/uiMainCore.js';
import { handleStoryProgression } from '../../hooks/story.js';
import { setupDialogueScreen } from '../../hooks/uiDialogue.js';
import { switchScreen } from '../../utils/gameUtils.js';

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

        if (GameState.gameMode === 'defense_attack') {
            GameState.appState = 'select_enemy';
            initSelectScreen(false);
            switchScreen('screen-select');
        } else {
            if (GameState.appState === 'post_dialogue') {
                if (GameState.gameMode === 'story') {
                    handleStoryProgression();
                } else {
                    setupDialogueScreen();
                }
            } else {
                setupDialogueScreen();
            }
        }
    };

    const renderSkillTagReact = (c) => {
        if (!window.renderSkillTag) return null;
        return <div dangerouslySetInnerHTML={{ __html: window.renderSkillTag(c, false) }}></div>;
    };

    const renderCardPreviewContent = () => {
        const imgUrl = getCardImgUrl(card);
        const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
        const rarityColors = { 1: '#cd7f32', 2: '#e2e8f0', 3: '#facc15', 4: '#fde047' };
        const nameColor = rarityColors[card.rarity] || '#fff';
        const filter = GameState.playerConfig?.filter || 'none';

        let skillCandidates = [];
        if (card.skill && card.skill !== 'none' && card.skill !== undefined) skillCandidates.push({ id: card.skill, value: card.skillValue });
        if (Array.isArray(card.skills)) card.skills.forEach(sk => skillCandidates.push({ id: sk.id, value: sk.value }));

        return (
            <div className="preview-content" style={{ position: 'relative' }}>
                <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className={`card blue${rarityClass}`} style={{ width: '180px', height: '240px', position: 'relative' }}>
                        {isRevealed ? (
                            <>
                                <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')`, filter: filter }}></div>
                                <div className="card-power" style={{ fontSize: '2.5rem', bottom: '0', right: '5px' }}>{card.currentPower || card.power}</div>
                                {renderSkillTagReact(card)}
                            </>
                        ) : (
                            <div className="card-bg" style={{ background: '#334155' }}></div>
                        )}
                    </div>
                </div>

                <div className="preview-details">
                    <h2 style={{ color: isRevealed ? nameColor : '#fff' }}>
                        {isRevealed ? card.name : '? ? ?'}
                    </h2>
                    
                    <div className="preview-scroll-area">
                        <div className="preview-skills-list">
                            {!isRevealed ? (
                                <p className="preview-skill-desc">クリックしてカードを公開</p>
                            ) : skillCandidates.length > 0 ? skillCandidates.map((sk, idx) => {
                                const s = SKILLS?.[sk.id];
                                if (!s) return null;
                                const val = (sk.value === null || sk.value === undefined) ? '' : sk.value;
                                const desc = typeof s.desc === 'function' ? s.desc(sk.value) : s.desc;
                                return (
                                    <div key={idx} className="preview-skill-item">
                                        <div className="preview-skill-badge">{s.icon} {s.name}{val}</div>
                                        <p className="preview-skill-desc">{desc}</p>
                                    </div>
                                );
                            }) : (
                                <p className="preview-skill-desc">能力なし</p>
                            )}
                        </div>
                        {isRevealed && card.flavor && (
                            <p className="preview-flavor-text" style={{ display: 'block' }}>{card.flavor}</p>
                        )}
                    </div>

                    {isRevealed && (
                        <button 
                            className="btn" 
                            style={{ marginTop: '15px', width: '100%', flexShrink: 0, background: 'linear-gradient(45deg, #22c55e, #16a34a)' }} 
                            onClick={handleNext}
                        >
                            次へ
                        </button>
                    )}
                </div>

                {!isRevealed && (
                    <div 
                        id="reward-mask" 
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.95)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, backdropFilter: 'blur(4px)', cursor: 'pointer' }} 
                        onClick={handleReveal}
                    >
                        <h2 className="reward-title" style={{ marginBottom: '20px', color: '#facc15', textShadow: '0 0 10px rgba(250, 204, 21, 0.5)' }}>カードを獲得！</h2>
                        <div style={{ fontSize: '5rem', color: '#334155' }}>?</div>
                        <div style={{ fontSize: '1rem', color: '#cbd5e1', marginTop: '15px', animation: 'pulse 1.5s infinite' }}>タップして表を開く</div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="screen active" style={{ zIndex: 2000, background: 'rgba(0,0,0,0.85)', display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            {renderCardPreviewContent()}
        </div>
    );
}

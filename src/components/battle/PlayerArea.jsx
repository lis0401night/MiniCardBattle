import React from 'react';

export default function PlayerArea({ 
    playerConfig, 
    playerHP, 
    playerMaxHP, 
    deckCount,
    dropCount,
    spCount,
    maxSpCount,
    onLeaderSkillClick
}) {
    if (!playerConfig) return null;

    return (
        <div className="hp-area">
            <div className="status-container">
                <div className="icon-wrapper" id="player-icon-wrap" onClick={onLeaderSkillClick} style={{ cursor: 'pointer' }}>
                    <img id="player-icon" className="char-icon blue" src={playerConfig.icon} alt="player icon" />
                    <div id="player-sp-orbs" className="sp-orbs">
                        {Array.from({ length: maxSpCount }).map((_, i) => (
                            <div key={`sp-${i}`} className={`orb ${i < spCount ? 'filled' : ''}`}></div>
                        ))}
                    </div>
                </div>
                <div id="player-speech" className="speech-bubble">痛い！</div>
                <div className="player-status">
                    <div className="status-name" id="player-name" style={{ color: 'var(--color-blue)' }}>
                        {playerConfig.name}
                    </div>
                    <div className="hp-bar-bg">
                        <div 
                            className="hp-bar-fill blue" 
                            id="player-hp-fill" 
                            style={{ width: `${Math.max(0, (playerHP / playerMaxHP)) * 100}%` }}
                        ></div>
                        <div className="hp-text" id="player-hp-text">
                            {playerHP} / {playerMaxHP}
                        </div>
                    </div>
                    <div id="deck-info" className="deck-info">
                        Deck: {deckCount} / Drop: {dropCount}
                    </div>
                </div>
            </div>
        </div>
    );
}

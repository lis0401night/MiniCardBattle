import React from 'react';
import { GameState } from '../../hooks/gameState.js';
import { getSkinImage } from '../../utils/constants/characters.js';

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
                    <img id="player-icon" className="char-icon blue" src={getSkinImage(playerConfig, GameState.playerSkins[playerConfig.id], 'icon')} alt="player icon" />
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
                    <div id="deck-info" className="deck-info" style={{ fontSize: '1rem', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <span>山札: {deckCount} / 墓地: {dropCount}</span>
                        <button className="action-btn" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={(e) => { e.stopPropagation(); window.showDiscardSelectionModalReact?.(GameState.playerDiscard, 999, null, true); }}>確認</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import React from 'react';

export default function EnemyArea({ 
    enemyConfig, 
    enemyHP, 
    enemyMaxHP, 
    deckCount,
    dropCount
}) {
    if (!enemyConfig) return null;

    return (
        <div className="hp-area">
            <div className="status-container">
                <div className="icon-wrapper" id="enemy-icon-wrap">
                    <img id="enemy-icon" className="char-icon red" src={enemyConfig.icon} alt="enemy icon" />
                    {enemyConfig?.leaderSkill?.cost && enemyConfig.leaderSkill.cost > 0 && (
                        <div id="enemy-sp-orbs" className="sp-orbs">
                            {Array.from({ length: enemyConfig.leaderSkill.cost }).map((_, i) => (
                                <div key={`enemy-sp-${i}`} className={`orb ${i < (GameState.enemySP || 0) ? 'filled' : ''}`}></div>
                            ))}
                        </div>
                    )}
                </div>
                <div id="enemy-speech" className="speech-bubble">くっ…！</div>
                <div className="player-status">
                    <div className="status-name" id="enemy-name" style={{ color: 'var(--color-red)' }}>
                        {enemyConfig.name}
                    </div>
                    <div className="hp-bar-bg">
                        <div 
                            className="hp-bar-fill red" 
                            id="enemy-hp-fill" 
                            style={{ width: `${Math.max(0, (enemyHP / enemyMaxHP)) * 100}%` }}
                        ></div>
                        <div className="hp-text" id="enemy-hp-text">
                            {enemyHP} / {enemyMaxHP}
                        </div>
                    </div>
                    <div id="enemy-deck-info" className="deck-info">
                        Deck: {deckCount} / Drop: {dropCount}
                    </div>
                </div>
            </div>
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

const UNLOCK_ITEMS = [
    { id: 'deck_easy', name: 'イージーのデッキを追加', cost: 3 },
    { id: 'char_silver', name: 'シルバーのリーダーを追加', cost: 10 },
    { id: 'deck_normal', name: 'ノーマルのデッキを追加', cost: 20 },
    { id: 'char_gold', name: 'ゴールドのリーダーを追加', cost: 40 },
    { id: 'deck_hard', name: 'ハードのデッキを追加', cost: 60 },
    { id: 'char_legend', name: 'レジェンドのリーダーを追加', cost: 80 }
];

export default function ChallengeUnlockScreen() {
    const [totalPoints, setTotalPoints] = useState(0);
    const [unlocks, setUnlocks] = useState({});

    useEffect(() => {
        const tp = parseInt(localStorage.getItem('mini_card_battle_challenge_total_points')) || 0;
        setTotalPoints(tp);

        try {
            const saved = JSON.parse(localStorage.getItem('mini_card_battle_dungeon_unlocks')) || {};
            setUnlocks(saved);
        } catch (e) {
            setUnlocks({});
        }
    }, []);

    const toggleUnlock = (id) => {
        playSound(SOUNDS?.seClick);
        const nextState = { ...unlocks, [id]: !unlocks[id] };
        setUnlocks(nextState);
        localStorage.setItem('mini_card_battle_dungeon_unlocks', JSON.stringify(nextState));
    };

    const handleBack = () => {
        playSound(SOUNDS?.seClick);
        if (window.switchScreen) window.switchScreen('screen-dungeon-menu');
    };

    return (
        <div id="screen-challenge-unlock" className="screen active" style={{
            backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.95)), url('assets/backgrounds/background_challenge.png')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', overflowY: 'auto'
        }}>
            <h2 style={{ color: '#c084fc', marginBottom: '5px', textShadow: '0 0 15px rgba(192, 132, 252, 0.6)' }}>開放</h2>
            <div style={{ fontSize: '0.9rem', marginBottom: '20px', color: '#cbd5e1' }}>
                総試練ポイント: {totalPoints}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '90%', maxWidth: '500px' }}>
                {UNLOCK_ITEMS.map((item) => {
                    const isUnlocked = totalPoints >= item.cost;
                    const isON = !!unlocks[item.id];

                    return (
                        <div key={item.id} style={{
                            background: isUnlocked ? 'rgba(30, 41, 59, 0.9)' : 'rgba(15, 23, 42, 0.6)',
                            border: `1px solid ${isUnlocked ? '#64748b' : '#334155'}`,
                            borderRadius: '8px', padding: '15px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ color: isUnlocked ? '#f8fafc' : '#64748b', fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px' }}>
                                    {item.name}
                                </div>
                                {!isUnlocked && (
                                    <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>
                                        未開放（必要な総試練ポイント：{item.cost}）
                                    </div>
                                )}
                            </div>

                            {isUnlocked && (
                                <button
                                    onClick={() => toggleUnlock(item.id)}
                                    className="btn"
                                    style={{
                                        width: '80px', height: '36px', padding: '0', margin: '0',
                                        background: isON ? 'linear-gradient(45deg, #10b981, #059669)' : '#475569',
                                        color: isON ? '#fff' : '#94a3b8',
                                        border: isON ? '2px solid #34d399' : '2px solid #64748b',
                                        fontWeight: 'bold', fontSize: '0.9rem'
                                    }}
                                >
                                    {isON ? 'ON' : 'OFF'}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <button
                className="btn"
                style={{ background: '#475569', padding: '10px 40px', marginTop: '25px' }}
                onClick={handleBack}
            >
                戻る
            </button>
        </div>
    );
}

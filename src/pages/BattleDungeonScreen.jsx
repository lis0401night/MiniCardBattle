import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GameState } from '../hooks/gameState.js';
import { getRentalDeckOptions } from '../utils/constants/battleDungeon.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { selectRentalDeck, startDungeonBattle, retireDungeon, selectRewardCard, loadDungeonProgress, saveDungeonProgress } from '../hooks/battleDungeon.js';
import { playSound, getCardImgUrl, switchScreen } from '../utils/gameUtils.js';
import { showConfirmModal } from '../hooks/uiModals.js';
import { SOUNDS } from '../utils/sounds.js';
import { setupLongPress } from '../hooks/uiGallery.js';

export default function BattleDungeonScreen() {
    const [dungeonState, setDungeonState] = useState(GameState.dungeonState);
    const [renderTick, setRenderTick] = useState(0);

    useEffect(() => {
        window.renderBattleDungeonReact = () => {
            setDungeonState(GameState.dungeonState);
            setRenderTick(prev => prev + 1);
        };
        return () => { window.renderBattleDungeonReact = null; };
    }, []);

    const handleBack = () => {
        if (dungeonState === 'resume_select' || dungeonState === 'select_rental_deck') {
            // 最初の画面ではセーブデータを消さずに戻る
            playSound(SOUNDS.seClick);
            GameState.gameMode = 'title';
            switchScreen('screen-mode-select');
        } else {
            // 進行中はリタイア確認
            showConfirmModal("試練の宮殿をリタイアしますか？\n（現在の進行状況は失われます）", () => {
                retireDungeon();
            });
        }
    };

    const handleSuspendAction = () => {
        showConfirmModal("一旦中断してメインメニューに戻りますか？\n（進捗は自動的に保存されています）", () => {
            playSound(SOUNDS.seClick);
            saveDungeonProgress();
            switchScreen('screen-mode-select');
        });
    };

    const renderContent = () => {
        switch (dungeonState) {
            case 'resume_select': return <ResumeSelect />;
            case 'select_rental_deck': return <RentalDeckSelect />;
            case 'select_opponent': return <OpponentSelect />;
            case 'reward': return <RewardSelect />;
            case 'battle': return <div style={{ color: '#fff' }}>バトル中...</div>;
            default: return <div style={{ color: '#fff' }}>読み込み中... (state: {dungeonState})</div>;
        }
    };

    const getTitle = () => {
        switch (dungeonState) {
            case 'resume_select': return '試練の宮殿 再開';
            case 'select_rental_deck': return 'レンタルデッキ選択';
            case 'select_opponent': return '対戦相手選択';
            case 'reward': return '報酬選択';
            default: return '試練の宮殿';
        }
    };

    // 画面下部のボタン表示を制御
    const renderBottomButton = () => {
        if (dungeonState === 'select_opponent') {
            return (
                <button className="btn" style={{ background: '#475569' }} onClick={handleSuspendAction}>
                    一時中断して戻る
                </button>
            );
        }
        // 通常の戻るボタン
        return (
            <button className="btn" style={{ background: '#475569' }} onClick={handleBack}>
                戻る
            </button>
        );
    };

    return (
        <div id="screen-battle-dungeon" className="screen active" style={{ overflowY: 'auto' }}>
            <h2 style={{ color: '#facc15', marginBottom: '20px', textAlign: 'center' }}>
                {getTitle()}{dungeonState !== 'resume_select' && ` (${GameState.dungeonWinStreak + 1} 階)`}
            </h2>

            <div className="dungeon-content" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 0' }}>
                {renderContent()}
            </div>

            <div style={{ marginTop: '30px', width: '100%', display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
                {renderBottomButton()}
            </div>
        </div>
    );
}

/**
 * 再開・やり直し選択画面
 */
function ResumeSelect() {
    const handleResume = () => {
        playSound(SOUNDS.seClick);
        loadDungeonProgress();
    };

    const handleRestart = () => {
        showConfirmModal("中断データを消去して、最初からやり直します。よろしいですか？", () => {
            playSound(SOUNDS.seClick);
            localStorage.removeItem('mini_card_battle_dungeon_save');
            GameState.dungeonWinStreak = 0;
            GameState.dungeonCards = [];
            GameState.dungeonOpponents = [];
            GameState.dungeonState = 'select_rental_deck';
            if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
        });
    };

    const handleCheckPocket = () => {
        playSound(SOUNDS.seClick);
        const json = localStorage.getItem('mini_card_battle_dungeon_save');
        if (json) {
            const data = JSON.parse(json);
            if (window.showEnemyDeckModal) {
                window.showEnemyDeckModal(data.cards, "所持カード確認");
            }
        }
    };

    const handleCheckDeck = () => {
        playSound(SOUNDS.seClick);
        const json = localStorage.getItem('mini_card_battle_dungeon_save');
        if (json) {
            const data = JSON.parse(json);
            if (window.showEnemyDeckModal) {
                const deck = data.deck || data.cards.slice(0, 20); // 未保存対処
                window.showEnemyDeckModal(deck, "デッキ確認");
            }
        }
    };

    return (
        <div style={{ textAlign: 'center', color: '#fff', padding: '20px' }}>
            <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '20px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '30px' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>到達階: <span style={{ color: '#facc15', fontWeight: 'bold' }}>{GameState.dungeonWinStreak + 1} 階</span></div>
                <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '15px' }}>最高到達階: {GameState.dungeonMaxWinStreak + 1} 階</div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button className="btn" style={{ fontSize: '0.8rem', padding: '10px 12px', width: 'auto', margin: 0, background: '#475569' }} onClick={handleCheckPocket}>所持カード確認</button>
                    <button className="btn" style={{ fontSize: '0.8rem', padding: '10px 12px', width: 'auto', margin: 0, background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)' }} onClick={handleCheckDeck}>デッキ確認</button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                <button className="btn" style={{ width: '220px', background: 'linear-gradient(45deg, #10b981, #059669)', padding: '12px' }} onClick={handleResume}>
                    再開する
                </button>
                <button className="btn" style={{ width: '220px', background: '#334155', color: '#fff' }} onClick={handleRestart}>
                    リタイア
                </button>
            </div>
        </div>
    );
}

/**
 * カードプレビュー対応のミニカードコンポーネント
 */
function DungeonMiniCard({ id, onClick, isSelected, count, showCount = true, scale = 1 }) {
    const card = CARD_MASTER.find(c => c.id === id);
    const cardRef = useRef(null);

    useEffect(() => {
        if (cardRef.current && card) {
            setupLongPress(cardRef.current, card);
        }
    }, [card]);

    if (!card) return null;

    return (
        <div
            ref={cardRef}
            onClick={onClick}
            className="dungeon-mini-card-wrapper"
            style={{
                position: 'relative',
                width: `${60 * scale}px`,
                height: `${84 * scale}px`,
                cursor: 'pointer',
                border: isSelected ? `${3 * scale}px solid #facc15` : `${1 * scale}px solid #475569`,
                boxSizing: 'border-box',
                borderRadius: `${4 * scale}px`,
                overflow: 'hidden',
                flexShrink: 0
            }}
        >
            <img src={getCardImgUrl(card)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={card.name} />
            {showCount && count > 1 && (
                <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'rgba(0,0,0,0.8)', padding: '1px 3px', fontSize: '9px', color: '#fff', borderTopLeftRadius: '4px' }}>
                    x{count}
                </div>
            )}
            {isSelected && (
                <div style={{ position: 'absolute', top: '0', right: '0', background: '#facc15', color: '#000', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', borderBottomLeftRadius: '6px' }}>
                    ✓
                </div>
            )}
        </div>
    );
}

function RentalDeckSelect() {
    const options = useMemo(() => getRentalDeckOptions(), []);
    const [previewOpt, setPreviewOpt] = useState(null);

    const handleSelectPreview = (opt) => {
        playSound(SOUNDS.seClick);
        setPreviewOpt(opt);
    };

    const handleConfirm = () => {
        playSound(SOUNDS.seClick);
        selectRentalDeck(previewOpt);
    };

    const handleCancel = () => {
        playSound(SOUNDS.seClick);
        setPreviewOpt(null);
    };

    return (
        <div style={{ textAlign: 'center', color: '#fff' }}>
            <h3 style={{ marginBottom: '20px' }}>レンタルするデッキを1つ選んでください</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                {options.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: '10px', width: '100%', maxWidth: '400px' }}>
                        <button
                            className="btn-banner"
                            style={{ flex: 1, margin: 0, borderColor: '#475569' }}
                            onClick={() => handleSelectPreview(opt)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <img src={opt.icon} className="banner-icon" alt={opt.name} />
                                    <span className="banner-text" style={{ color: opt.color || '#f8fafc', textShadow: '0px 0px 4px rgba(0,0,0,0.8)', marginRight: '10px' }}>
                                        {opt.name}
                                    </span>
                                </div>
                            </div>
                        </button>
                    </div>
                ))}
            </div>

            {/* プレビューモーダル */}
            {previewOpt && (
                <div className="modal-overlay" style={{ zIndex: 2000, display: 'flex' }} onClick={handleCancel}>
                    <div className="skill-modal-box modal-pop-animation" style={{ width: '95%', maxWidth: '440px', padding: '20px' }} onClick={(e) => e.stopPropagation()}>
                        <h2 style={{ color: '#facc15', marginBottom: '15px' }}>{previewOpt.name} [レンタル]</h2>
                        <div className="card-list-container" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                            <div className="card-list-grid-3col" style={{ padding: '10px' }}>
                                {(() => {
                                    const grouped = {};
                                    previewOpt.deck.forEach(cardId => {
                                        if (!grouped[cardId]) grouped[cardId] = 0;
                                        grouped[cardId]++;
                                    });

                                    return Object.keys(grouped).map((cardId) => {
                                        const count = grouped[cardId];
                                        const template = CARD_MASTER?.find(m => m.id === cardId);
                                        if (!template) return null;

                                        const displayCard = { ...template, owner: 'red' };
                                        const imgUrl = getCardImgUrl ? getCardImgUrl(displayCard) : '';
                                        const rarityClass = displayCard.rarity ? ` rarity-${displayCard.rarity}` : '';
                                        return (
                                            <div key={cardId} className="deck-card-item gallery-card-wrapper" onClick={() => window.openCardPreview && window.openCardPreview(displayCard)}>
                                                <div className={`card red${rarityClass}`}>
                                                    <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')` }}></div>
                                                    <div className="card-power" style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}>{displayCard.power}</div>
                                                    {window.renderSkillTag && <div dangerouslySetInnerHTML={{ __html: window.renderSkillTag(displayCard, false) }}></div>}
                                                    <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.85)', color: '#facc15', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.75rem', zIndex: 6, border: '1px solid #facc15' }}>
                                                        x{count}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '20px' }}>
                            <button className="btn" style={{ flex: 1, background: '#475569', margin: 0 }} onClick={handleCancel}>戻る</button>
                            <button className="btn" style={{ flex: 1, background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)', margin: 0 }} onClick={handleConfirm}>決定</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );


}

function OpponentSelect() {
    const opps = GameState.dungeonOpponents || [];

    const handleSelect = (idx) => {
        showConfirmModal(`${opps[idx].name} に挑みますか？`, () => {
            startDungeonBattle(idx);
        });
    };

    const handleCheckPocket = () => {
        if (window.showEnemyDeckModal) {
            window.showEnemyDeckModal(GameState.dungeonCards, "所持カード確認");
        }
    };

    const handleCheckDeck = () => {
        if (window.showEnemyDeckModal) {
            const currentDeck = GameState.playerDeckSelection ? GameState.playerDeckSelection.filter(Boolean) : GameState.dungeonCards.slice(0, 20);
            window.showEnemyDeckModal(currentDeck, "デッキ確認");
        }
    };

    return (
        <div style={{ color: '#fff', textAlign: 'center' }}>
            <div style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', padding: '12px', borderRadius: '12px', marginBottom: '20px', fontWeight: 'bold', border: '1px solid rgba(250, 204, 21, 0.3)' }}>
                現在 {GameState.dungeonWinStreak + 1} 階
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
                <button className="btn" style={{ padding: '8px 12px', fontSize: '0.8rem', width: 'auto', background: '#475569' }} onClick={handleCheckPocket}>
                    所持カード確認
                </button>
                <button className="btn" style={{ padding: '8px 12px', fontSize: '0.8rem', width: 'auto', background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)' }} onClick={handleCheckDeck}>
                    デッキ確認
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
                {opps.map((e, i) => (
                    <div key={i} className="dungeon-opponent-card" onClick={() => handleSelect(i)}
                        style={{ background: '#1e293b', border: '2px solid #334155', borderRadius: '12px', padding: '15px', width: '100%', maxWidth: '400px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '3px solid #ef4444', boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)' }}>
                            <img src={e.image} alt={e.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f8fafc' }}>{e.name}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RewardSelect() {
    const deck = GameState.enemyConfig?.dungeonDeck || [];
    const uniqueCards = useMemo(() => [...new Set(deck)], [deck]);

    const handleSelect = (id) => {
        const c = CARD_MASTER.find(m => m.id === id);
        showConfirmModal(`${c.name} を獲得しますか？`, () => {
            selectRewardCard(id);
        });
    };

    const enemy = GameState.enemyConfig;

    return (
        <div id="screen-reward" style={{ color: '#fff', textAlign: 'center', width: '100%', height: '100%' }}>
            <h3 style={{ color: '#facc15' }}>バトル勝利！</h3>

            {enemy && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px', marginTop: '10px' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '3px solid #64748b', marginBottom: '10px' }}>
                        <img src={enemy.image} alt={enemy.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{enemy.name} のデッキ</div>
                </div>
            )}

            <p style={{ marginBottom: '15px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                倒した相手のデッキから1枚選んで獲得できます。<br />
                カードを長押しで詳細をプレビューできます。
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', paddingBottom: '40px' }}>
                {uniqueCards.map((id) => (
                    <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                        <DungeonMiniCard
                            id={id}
                            onClick={() => handleSelect(id)}
                            showCount={false}
                            scale={1.2}
                        />
                        <div style={{ fontSize: '11px', color: '#cbd5e1', width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {CARD_MASTER.find(c => c.id === id)?.name}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

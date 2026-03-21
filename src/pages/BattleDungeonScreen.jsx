import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GameState } from '../hooks/gameState.js';
import { getRentalDeckOptions } from '../utils/constants/battleDungeon.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { selectRentalDeck, selectOwnCards, startDungeonBattle, retireDungeon, selectRewardCard, loadDungeonProgress, saveDungeonProgress } from '../hooks/battleDungeon.js';
import { playSound, getCardImgUrl, switchScreen } from '../utils/gameUtils.js';
import { showConfirmModal } from '../hooks/uiModals.js';
import { SOUNDS } from '../utils/sounds.js';
import { setupLongPress } from '../hooks/uiGallery.js';

export default function BattleDungeonScreen() {
    const [dungeonState, setDungeonState] = useState(GameState.dungeonState);
    const [renderTick, setRenderTick] = useState(0);

    // 画面下部の共通ボタンで使用する情報を保持
    const [selectedOwnCards, setSelectedOwnCards] = useState([]);

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
            showConfirmModal("バトルダンジョンをリタイアしますか？\n（現在の進行状況は失われます）", () => {
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

    const handleConfirmOwnCards = () => {
        if (selectedOwnCards.length === 0) return;
        showConfirmModal(`${selectedOwnCards.length}枚のカードを持ち込みます。よろしいですか？`, () => {
            selectOwnCards(selectedOwnCards);
        });
    };

    const renderContent = () => {
        switch (dungeonState) {
            case 'resume_select': return <ResumeSelect />;
            case 'select_rental_deck': return <RentalDeckSelect />;
            case 'select_own_cards': return <OwnCardSelect selectedCards={selectedOwnCards} setSelectedCards={setSelectedOwnCards} />;
            case 'select_opponent': return <OpponentSelect />;
            case 'reward': return <RewardSelect />;
            case 'battle': return <div style={{ color: '#fff' }}>バトル中...</div>;
            default: return <div style={{ color: '#fff' }}>読み込み中... (state: {dungeonState})</div>;
        }
    };

    const getTitle = () => {
        switch (dungeonState) {
            case 'resume_select': return 'ダンジョン再開確認';
            case 'select_rental_deck': return 'レンタルデッキ選択';
            case 'select_own_cards': return '持ち込みカード選択';
            case 'select_opponent': return '対戦相手選択';
            case 'reward': return '報酬選択';
            default: return 'バトルダンジョン';
        }
    };

    // 画面下部のボタン表示を制御
    const renderBottomButton = () => {
        if (dungeonState === 'select_own_cards') {
            return (
                <button 
                    className={selectedOwnCards.length > 0 ? "btn-primary" : "btn"} 
                    style={{ background: selectedOwnCards.length > 0 ? '' : '#334155' }} 
                    onClick={handleConfirmOwnCards}
                    disabled={selectedOwnCards.length === 0}
                >
                    {selectedOwnCards.length}枚で決定
                </button>
            );
        }
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
        <div id="screen-battle-dungeon" className="screen active">
            <h2 style={{ color: '#facc15', marginBottom: '20px', textAlign: 'center' }}>
                {getTitle()} (連勝: {GameState.dungeonWinStreak})
            </h2>

            <div className="dungeon-content" style={{ flex: 1, width: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '10px 0' }}>
                {renderContent()}
            </div>

            <div style={{ marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '20px', width: '100%', display: 'flex', justifyContent: 'center' }}>
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
            localStorage.removeItem('mini_card_battle_dungeon_save');
            GameState.dungeonWinStreak = 0;
            GameState.dungeonCards = [];
            GameState.dungeonOpponents = [];
            GameState.dungeonState = 'select_rental_deck';
            if (window.renderBattleDungeonReact) window.renderBattleDungeonReact();
        });
    };

    const handleCheckDeck = () => {
        const json = localStorage.getItem('mini_card_battle_dungeon_save');
        if (json) {
            const data = JSON.parse(json);
            if (window.showEnemyDeckModal) {
                window.showEnemyDeckModal(data.cards, "現在のデッキ");
            }
        }
    };

    return (
        <div style={{ textAlign: 'center', color: '#fff', padding: '20px' }}>
            <p style={{ marginBottom: '20px' }}>中断されたデータがあります。続きからプレイしますか？</p>
            
            <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '20px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '30px' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>現在の記録: <span style={{ color: '#facc15', fontWeight: 'bold' }}>{GameState.dungeonWinStreak} 連勝</span></div>
                <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '15px' }}>最高記録: {GameState.dungeonMaxWinStreak} 連勝</div>
                <button className="btn" style={{ fontSize: '0.8rem', padding: '10px', width: 'auto' }} onClick={handleCheckDeck}>現在のデッキを確認</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                <button className="btn-primary" style={{ width: '220px' }} onClick={handleResume}>
                    再開する
                </button>
                <button className="btn" style={{ width: '220px', background: '#334155' }} onClick={handleRestart}>
                    初めからやり直す
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

    const handleSelect = (opt) => {
        showConfirmModal(`${opt.name} のデッキをレンタルしますか？`, () => {
            selectRentalDeck(opt);
        });
    };

    const handlePreviewDeck = (e, opt) => {
        e.stopPropagation();
        playSound(SOUNDS.seClick);
        if (window.showEnemyDeckModal) {
            window.showEnemyDeckModal(opt.deck, `${opt.name} [レンタル]`);
        }
    };

    return (
        <div style={{ textAlign: 'center', color: '#fff' }}>
            <h3>レンタルするデッキを1つ選んでください</h3>
            <p style={{ marginBottom: '20px', fontSize: '0.9rem', color: '#cbd5e1' }}>各キャラクターの[初級]デッキの内容が獲得できます。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                {options.map((opt, i) => (
                    <div key={i} className="dungeon-deck-card" onClick={() => handleSelect(opt)}
                         style={{ background: '#1e293b', border: '2px solid #475569', borderRadius: '12px', padding: '15px', width: '100%', maxWidth: '400px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px', position: 'relative' }}>
                        <img src={opt.icon} alt={opt.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #334155' }} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f8fafc' }}>{opt.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>カード {opt.deck.length}枚</div>
                        </div>
                        <button 
                            className="btn" 
                            style={{ padding: '8px 12px', fontSize: '0.8rem', background: '#334155', margin: 0, width: 'auto' }}
                            onClick={(e) => handlePreviewDeck(e, opt)}
                        >
                            中身を確認
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function OwnCardSelect({ selectedCards, setSelectedCards }) {
    const inventory = GameState.playerInventory || {};
    const inventoryKeys = useMemo(() => Object.keys(inventory).filter(k => inventory[k] > 0), [inventory]);

    const toggleCard = (id) => {
        playSound(SOUNDS.seSelect);
        if (selectedCards.includes(id)) {
            setSelectedCards(selectedCards.filter(c => c !== id));
        } else {
            if (selectedCards.length >= 3) return;
            setSelectedCards([...selectedCards, id]);
        }
    };

    return (
        <div style={{ color: '#fff', textAlign: 'center' }}>
            <h3>自分の所持カードから持ち込む (最大3枚)</h3>
            <p style={{ marginBottom: '15px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                選んだカードはダンジョン用のデッキに追加されます。<br/>
                カードを長押しで詳細をプレビューできます。
            </p>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', paddingBottom: '40px' }}>
                {inventoryKeys.length === 0 && <div style={{ color: '#94a3b8', marginTop: '20px' }}>所持カードがありません</div>}
                {inventoryKeys.map(id => (
                    <DungeonMiniCard 
                        key={id} 
                        id={id} 
                        onClick={() => toggleCard(id)} 
                        isSelected={selectedCards.includes(id)}
                        count={inventory[id]}
                        scale={1.1}
                    />
                ))}
            </div>
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

    const handleCheckDeck = () => {
        if (window.showEnemyDeckModal) {
            window.showEnemyDeckModal(GameState.dungeonCards, "現在のデッキ");
        }
    };

    return (
        <div style={{ color: '#fff', textAlign: 'center' }}>
            <div style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', padding: '12px', borderRadius: '12px', marginBottom: '20px', fontWeight: 'bold', border: '1px solid rgba(250, 204, 21, 0.3)' }}>
                現在 {GameState.dungeonWinStreak} 連勝中
            </div>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
                <button className="btn" style={{ padding: '8px 12px', fontSize: '0.8rem', width: 'auto', background: '#334155' }} onClick={handleCheckDeck}>
                    デッキ確認
                </button>
            </div>

            <h3>対戦相手を選択</h3>
            <p style={{ marginBottom: '20px', fontSize: '0.9rem', color: '#cbd5e1' }}>どちらかの相手を選んでバトルを開始します。</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
                {opps.map((e, i) => (
                    <div key={i} className="dungeon-opponent-card" onClick={() => handleSelect(i)}
                         style={{ background: '#1e293b', border: '2px solid #334155', borderRadius: '12px', padding: '15px', width: '100%', maxWidth: '400px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '3px solid #ef4444', boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)' }}>
                            <img src={e.image} alt={e.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f8fafc' }}>{e.name}</div>
                            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>AIレベル: 上級</div>
                        </div>
                        <div style={{ color: '#ef4444', fontWeight: 'bold' }}>挑む ▷</div>
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
        showConfirmModal(`${c.name} をレンタルカードに加えますか？`, () => {
            selectRewardCard(id);
        });
    };

    return (
        <div id="screen-reward" style={{ color: '#fff', textAlign: 'center', width: '100%', height: '100%' }}>
            <h3 style={{ color: '#facc15' }}>バトル勝利！</h3>
            <p style={{ marginBottom: '15px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                倒した相手のデッキから1枚選んで獲得できます。<br/>
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

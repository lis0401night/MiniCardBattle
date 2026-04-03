import React, { useState, useEffect } from 'react';
import { GameState } from '../hooks/gameState.js';
import { checkWinCondition, discardCard, endTurnLogic, playCard, returnToTitle, showEnemySkillConfirm, showSkillConfirm, endPlayerTurn, drawCard, startTurn, dispatchBattleAction } from '../hooks/battle.js';
import { showConfirmModal } from '../hooks/uiModals.js';
import { SOUNDS } from '../utils/sounds.js';
import { setUpdateCardDetailHook, setUpdateBattleUIHook } from '../hooks/uiBattle.js';
import { playSound, sleep, isTransitioning, hasSkill } from '../utils/gameUtils.js';

import EnemyArea from '../components/battle/EnemyArea.jsx';
import PlayerArea from '../components/battle/PlayerArea.jsx';
import Board from '../components/battle/Board.jsx';
import Hand from '../components/battle/Hand.jsx';
import TurnOrderOverlay from '../components/battle/TurnOrderOverlay.jsx';
import { openCardPreview } from '../hooks/uiGallery.js';

export default function BattleScreen() {
    const [renderVersion, setRenderVersion] = useState(0);
    const [cardDetailHtml, setCardDetailHtml] = useState('');
    const [cardDetailColor, setCardDetailColor] = useState('#94a3b8');
    const [isInitializing, setIsInitializing] = useState(true);
    const [startTurnOrderAnim, setStartTurnOrderAnim] = useState(false);

    // 強制再描画フックの登録
    useEffect(() => {
        setUpdateBattleUIHook(() => setRenderVersion(v => v + 1));

        setUpdateCardDetailHook((html, color) => {
            setCardDetailHtml(html);
            setCardDetailColor(color);
        });

        return () => {
            setUpdateBattleUIHook(null);
            setUpdateCardDetailHook(null);
        };
    }, []);

    const turnOrderResolver = React.useRef(null);

    // バトル進行側(battle.js)からのターン開始シグナルを受け取る
    useEffect(() => {
        window.startTurnOrderReact = (resolve) => {
            turnOrderResolver.current = resolve;
            setStartTurnOrderAnim(true);
        };

        return () => {
            window.startTurnOrderReact = null;
        };
    }, []);

    const handleTurnOrderComplete = React.useCallback((firstPlayer) => {
        setStartTurnOrderAnim(false);
        setIsInitializing(false);
        if (turnOrderResolver.current) {
            turnOrderResolver.current(firstPlayer);
            turnOrderResolver.current = null;
        }
        setRenderVersion(v => v + 1);
    }, []);

    // Board や Hand からのイベントを GameState へ伝える
    const handleCellClick = async (lane, side, card) => {
        if (isInitializing || typeof GameState.isProcessing === 'undefined' || typeof isTransitioning === 'undefined') return;
        if (GameState.isPlacementMode) {
            if (side === 'player' && window.handlePlacementLaneClick) window.handlePlacementLaneClick(lane);
            return;
        }
        if (GameState.isEnemyTargetMode) {
            if (side === 'enemy' && window.handleEnemyLaneClick) window.handleEnemyLaneClick(lane);
            return;
        }
        if (GameState.isAlliedTargetMode) {
            if (side === 'player' && window.handleAlliedLaneClick) window.handleAlliedLaneClick(lane);
            return;
        }
        if (GameState.isAlliedTargetMode) {
            if (side === 'player' && window.handleAlliedLaneClick) window.handleAlliedLaneClick(lane);
            return;
        }
        if (GameState.isProcessing || (typeof isTransitioning === 'function' && isTransitioning())) return;

        // 相手ターン中または戦闘中（攻撃アニメーション等）は操作不可
        if (GameState.currentTurn !== 'player' || GameState.battlePhase === 'COMBAT') return;

        // カード配置処理
        if (GameState.selectedCardIndex !== null && side === 'player') {
            const newCard = GameState.playerHand[GameState.selectedCardIndex];

            if (GameState.turnCount === 1 && GameState.firstPlayer === 'blue' && lane !== 1) {
                playSound(SOUNDS.seDamage);
                showConfirmModal('1ターン目は中央のレーンにしか召喚できません', () => { }, null, true);
                return;
            }

            if (hasSkill && hasSkill(newCard, 'legendary') && lane !== 1) {
                playSound(SOUNDS.seDamage);
                showConfirmModal(`「${newCard.name}」は伝説のカードのため、中央のレーンにしか召喚できません。`, () => { }, null, true);
                return;
            }

            if (hasSkill && hasSkill(newCard, 'takeover') && GameState.playerBoard[lane] === null) {
                playSound(SOUNDS.seDamage);
                showConfirmModal(`「${newCard.name}」は生贄のカードのため、既にカードがあるレーンにしか召喚できません。`, () => { }, null, true);
                return;
            }

            if (GameState.playerBoard[lane] !== null) {
                const existingCard = GameState.playerBoard[lane];
                let confirmed;
                if (hasSkill && hasSkill(newCard, 'equip')) {
                    confirmed = await new Promise(resolve => {
                        showConfirmModal(`「${existingCard.name}」に「${newCard.name}」を装備しますか？`, () => resolve(true), () => resolve(false));
                    });
                } else {
                    confirmed = await new Promise(resolve => {
                        showConfirmModal(`「${existingCard.name}」を破棄して「${newCard.name}」を配置しますか？`, () => resolve(true), () => resolve(false));
                    });
                }
                if (!confirmed) return;
            }

            // 旧UIのもっさり感を消すため、クリック時点で即座に選択状態（ハイライト）を解除
            const targetHandIndex = GameState.selectedCardIndex;
            GameState.selectedCardIndex = null;
            if (window.updateCardDetail) window.updateCardDetail(null);

            dispatchBattleAction({ type: 'playCard', owner: 'blue', handIndex: targetHandIndex, lane });
            setRenderVersion(v => v + 1);
            return;
        }

        // カード選択 / 確認処理
        if (GameState.selectedCardIndex !== null || (GameState.isProcessing && !GameState.isDiscardingMode)) return;
        playSound(SOUNDS.seClick);
        if (GameState.selectedBoardLaneIndex === lane && GameState.selectedBoardSide === side) {
            GameState.selectedBoardLaneIndex = null;
            GameState.selectedBoardSide = null;
            if (window.updateCardDetail) window.updateCardDetail(null);
        } else {
            GameState.selectedBoardLaneIndex = lane;
            GameState.selectedBoardSide = side;
            GameState.selectedCardIndex = null;
            if (window.updateCardDetail) window.updateCardDetail(card);
        }
        setRenderVersion(v => v + 1);
    };

    const handleHandCardClick = (idx) => {
        if (GameState.isProcessing && !GameState.isDiscardingMode) return;
        if (GameState.battlePhase !== 'MULLIGAN' && (GameState.currentTurn !== 'player' || GameState.battlePhase === 'COMBAT')) return;

        playSound(SOUNDS.seClick);

        if (GameState.isDiscardingMode) {
            if (GameState.discardSelectedIndices.includes(idx)) {
                const arrIdx = GameState.discardSelectedIndices.indexOf(idx);
                GameState.discardSelectedIndices.splice(arrIdx, 1);
            } else {
                if (GameState.discardSelectedIndices.length < GameState.discardMaxCount) {
                    GameState.discardSelectedIndices.push(idx);
                }
            }
            setRenderVersion(v => v + 1);
            return;
        }

        if (GameState.selectedCardIndex === idx) {
            GameState.selectedCardIndex = null;
            if (window.updateCardDetail) window.updateCardDetail(null);
        } else {
            GameState.selectedCardIndex = idx;
            GameState.selectedBoardLaneIndex = null;
            GameState.selectedBoardSide = null;
            if (window.updateCardDetail) window.updateCardDetail(GameState.playerHand[idx]);
        }
        setRenderVersion(v => v + 1);
        if (window.highlightLanes) window.highlightLanes();
    };

    const handleCardLongPress = (card) => {
        openCardPreview(card);
    };

    const stageId = GameState.gameMode === 'battle_dungeon' ? 'dungeon' : (GameState.gameMode === 'story') ? (GameState.enemyConfig?.stageId || 'android') : (GameState.selectedStageId || 'android');
    const battleStyle = {
        backgroundColor: '#0f172a',
        backgroundImage: `url('assets/backgrounds/background_${stageId}.png')`
    };

    return (
        <div id="screen-battle" className="screen active" style={battleStyle}>
            <button className="btn-circle btn-battle-help" onClick={(e) => { e.stopPropagation(); playSound(SOUNDS.seClick); window.showRulesModal(); }}>？</button>
            <button
                className={`btn-circle btn-battle-retire ${GameState.lastBattleResult ? 'disabled' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!GameState.lastBattleResult) {
                        playSound(SOUNDS.seClick);
                        returnToTitle();
                    }
                }}
                disabled={!!GameState.lastBattleResult}
            >🏳</button>

            <EnemyArea
                enemyConfig={GameState.enemyConfig}
                enemyHP={GameState.enemyHP}
                enemyMaxHP={GameState.enemyMaxHP === 0 ? 1 : GameState.enemyMaxHP}
                deckCount={GameState.enemyDeck.length}
                dropCount={GameState.enemyDiscard.length}
            />

            <div className="turn-area">
                <div id="turn-status" style={{
                    color: GameState.battlePhase === 'MULLIGAN' ? '#fff' :
                        GameState.lastBattleResult === 'win' ? '#facc15' :
                            GameState.lastBattleResult === 'lose' ? '#fff' :
                                GameState.currentTurn === 'player' ? 'var(--color-blue)' :
                                    GameState.currentTurn === 'enemy' ? 'var(--color-red)' : '#facc15',
                    fontSize: GameState.placementMessage ? '16px' : '24px'
                }}>
                    {GameState.battlePhase === 'MULLIGAN' && GameState.placementMessage ? GameState.placementMessage :
                        GameState.battlePhase === 'MULLIGAN' ? 'MULLIGAN' :
                            GameState.lastBattleResult ? (
                                <div id="battle-result" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.85)', padding: '20px 40px', borderRadius: '16px', color: '#fff', fontSize: 'clamp(2rem, 8vw, 4rem)', fontWeight: 'bold', border: `4px solid ${GameState.lastBattleResult === 'win' ? '#facc15' : GameState.lastBattleResult === 'draw' ? '#94a3b8' : '#38bdf8'}`, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                                    {GameState.lastBattleResult === 'win' ? 'WIN' : GameState.lastBattleResult === 'draw' ? 'DRAW' : 'LOSE'}
                                    <div className="result-controls">
                                        {GameState.gameMode === 'online' ? (
                                            <button className="btn" onClick={async (e) => {
                                                e.stopPropagation(); playSound(SOUNDS.seClick);
                                                try {
                                                    const { clearActionQueueAndRegenerateSeed, setPlayerReadyOnly, getIsHost } = await import('../hooks/multiplayer.js');
                                                    await setPlayerReadyOnly(false);
                                                    if (getIsHost()) {
                                                        await clearActionQueueAndRegenerateSeed();
                                                    }
                                                } catch(err) { console.error(err); }
                                                GameState.appState = 'online';
                                                GameState.gameMode = 'online'; // keep gameMode
                                                window.dispatchEvent(new Event('stopAllBGM'));
                                                playSound(SOUNDS.bgmTitle);
                                                const { switchScreen } = await import('../utils/gameUtils.js');
                                                switchScreen('screen-online-lobby');
                                            }}>ロビーへ戻る</button>
                                        ) : (
                                            <button className="btn" onClick={(e) => { e.stopPropagation(); playSound(SOUNDS.seClick); returnToTitle(); }}>タイトルへ</button>
                                        )}
                                    </div>
                                </div>
                            ) :
                                GameState.currentTurn === 'player' ? 'YOUR TURN' :
                                    GameState.currentTurn === 'enemy' ? 'ENEMY TURN' :
                                        ''}
                </div>
                <button className="action-btn enemy-skill-btn" onClick={(e) => { e.stopPropagation(); playSound(SOUNDS.seClick); showEnemySkillConfirm(); }}>敵スキル</button>
            </div>

            <Board
                playerBoard={GameState.playerBoard}
                enemyBoard={GameState.enemyBoard}
                selectedBoardLaneIndex={GameState.selectedBoardLaneIndex}
                selectedBoardSide={GameState.selectedBoardSide}
                onCellClick={handleCellClick}
                onCardLongPress={handleCardLongPress}
            />

            <PlayerArea
                playerConfig={GameState.playerConfig}
                playerHP={GameState.playerHP}
                playerMaxHP={GameState.playerMaxHP === 0 ? 1 : GameState.playerMaxHP}
                deckCount={GameState.playerDeck.length}
                dropCount={GameState.playerDiscard.length}
                spCount={GameState.playerSP}
                maxSpCount={GameState.playerConfig?.leaderSkill?.cost || 5}
                onLeaderSkillClick={() => {
                    playSound(SOUNDS.seClick);
                    showSkillConfirm();
                }}
            />

            <div className="card-detail-wrapper">
                <div
                    id="card-detail-view"
                    className="card-detail-box"
                    style={{ color: cardDetailColor }}
                    dangerouslySetInnerHTML={{ __html: cardDetailHtml }}
                ></div>
            </div>

            <div className="controls">
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        id="btn-leader-skill"
                        className={`action-btn leader-skill-btn ${GameState.playerSP >= (GameState.playerConfig?.leaderSkill?.cost || 5) && !GameState.isPlacementMode && !GameState.isDiscardingMode && !GameState.isEnemyTargetMode ? 'ready glow active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            playSound(SOUNDS.seClick);
                            showSkillConfirm();
                        }}
                    >
                        リーダースキル
                    </button>
                    {GameState.isPlacementMode ? (
                        <button id="btn-end-turn" className="action-btn" style={{ background: '#ef4444', borderColor: '#dc2626' }} onClick={(e) => { e.stopPropagation(); playSound(SOUNDS.seClick); if (window.finishPlacement) window.finishPlacement(); }}>{GameState.placementButtonText || '配置終了'}</button>
                    ) : GameState.isDiscardingMode ? (
                        <button
                            id="btn-end-turn"
                            className="action-btn"
                            style={{
                                background: GameState.isDiscardingExact && GameState.discardSelectedIndices.length !== Math.min(GameState.playerHand.length, GameState.discardMaxCount) ? '#475569' : '#facc15',
                                color: GameState.isDiscardingExact && GameState.discardSelectedIndices.length !== Math.min(GameState.playerHand.length, GameState.discardMaxCount) ? '#94a3b8' : '#000',
                                borderColor: GameState.isDiscardingExact && GameState.discardSelectedIndices.length !== Math.min(GameState.playerHand.length, GameState.discardMaxCount) ? '#334155' : '#eab308',
                                pointerEvents: GameState.isDiscardingExact && GameState.discardSelectedIndices.length !== Math.min(GameState.playerHand.length, GameState.discardMaxCount) ? 'none' : 'auto'
                            }}
                            onClick={(e) => { e.stopPropagation(); playSound(SOUNDS.seClick); if (window.finishHandSelection) window.finishHandSelection(); }}
                        >
                            選択終了
                        </button>
                    ) : GameState.isEnemyTargetMode ? (
                        <button id="btn-end-turn" className="action-btn" style={{ background: '#475569', borderColor: '#334155' }} onClick={(e) => { e.stopPropagation(); playSound(SOUNDS.seClick); if (window.finishEnemyTargetSelection) window.finishEnemyTargetSelection(); }}>キャンセル</button>
                    ) : GameState.isAlliedTargetMode ? (
                        <button id="btn-end-turn" className="action-btn" style={{ background: '#475569', borderColor: '#334155' }} onClick={(e) => { e.stopPropagation(); playSound(SOUNDS.seClick); if (window.finishAlliedSelection) window.finishAlliedSelection(); }}>キャンセル</button>
                    ) : (
                        <button id="btn-end-turn" className="action-btn" onClick={(e) => { e.stopPropagation(); playSound(SOUNDS.seClick); endPlayerTurn(); }}>ターン終了</button>
                    )}
                </div>
            </div>

            <Hand
                playerHand={GameState.playerHand}
                selectedCardIndex={GameState.selectedCardIndex}
                isDiscardingMode={GameState.isDiscardingMode}
                discardSelectedIndices={GameState.discardSelectedIndices}
                onCardClick={handleHandCardClick}
                onCardLongPress={handleCardLongPress}
            />

            <TurnOrderOverlay
                startAnim={startTurnOrderAnim}
                onComplete={handleTurnOrderComplete}
            />

            {/* リーダースキルカットイン用DOM（レガシー互換） */}
            <div id="screen-cutin" style={{ display: 'none' }}>
                <div id="cutin-bg" className="cutin-bg"></div>
                <img id="cutin-char-img" className="cutin-char" alt="cutin" />
                <div id="cutin-text" className="cutin-text-img"></div>
            </div>
        </div>
    );
}

import React from 'react';
import Card from './Card.jsx';
import { GameState } from '../../hooks/gameState.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playSound, hasSkill } from '../../utils/gameUtils.js';
import { PLAYMAT_MASTER } from '../../utils/constants/playmats.js';
import { showAlertModal } from '../../hooks/uiModals.js';

export default function Board({ 
    playerBoard, 
    enemyBoard, 
    selectedBoardLaneIndex, 
    selectedBoardSide, 
    onCellClick,
    onCardLongPress
}) {
    // 3レーン分ループ
    const lanes = [0, 1, 2];

    const getPlaymatUrl = (idOrUrl) => {
        if (!idOrUrl) return 'none';
        const pm = PLAYMAT_MASTER.find(p => p.id === idOrUrl);
        return pm ? `url('${pm.image}')` : idOrUrl.startsWith('assets/') ? `url('${idOrUrl}')` : `url('assets/playmats/playmat_${idOrUrl}.jpg')`;
    };

    return (
        <div className="battle-board">
            {/* 敵・味方のプレイマット背景領域 */}
            {GameState.enemyConfig && GameState.enemyConfig.playmat && (
                <div id="playmat-enemy" className="playmat enemy" style={{ backgroundImage: getPlaymatUrl(GameState.enemyConfig.playmat) }}></div>
            )}
            {(GameState.selectedPlaymatId || (GameState.playerConfig && GameState.playerConfig.playmat)) && (
                <div id="playmat-player" className="playmat player" style={{ backgroundImage: getPlaymatUrl(GameState.selectedPlaymatId || GameState.playerConfig.playmat) }}></div>
            )}

            {/* 敵陣レーン */}
            <div className="lane-row" id="enemy-lanes">
                {lanes.map(lane => {
                    const card = enemyBoard[lane];
                    const isSelected = selectedBoardLaneIndex === lane && selectedBoardSide === 'enemy';
                    const isSealed = GameState.enemySealedLanes && GameState.enemySealedLanes[lane] > 0;
                    return (
                        <div 
                            key={`enemy-lane-${lane}`} 
                            className={`cell ${isSealed ? 'sealed' : ''}`} 
                            data-lane={lane}
                            onClick={(e) => {
                                if (isSealed && window.handleEnemyLaneClick) {
                                    showAlertModal('封印されています');
                                    return;
                                }
                            }}
                        >
                            {card && (
                                <Card 
                                    key={`enemy-card-${lane}-${card.uid || card.id}`}
                                    cardObj={card} 
                                    isBoard={true} 
                                    className={isSelected ? "selected" : ""}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isSealed && window.handleEnemyLaneClick) {
                                            showAlertModal('封印されています');
                                            return;
                                        }
                                        onCellClick(lane, 'enemy', card);
                                    }}
                                    onLongPress={onCardLongPress}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 自陣レーン */}
            <div className="lane-row" id="player-lanes">
                {lanes.map(lane => {
                    const card = playerBoard[lane];
                    const isSelected = selectedBoardLaneIndex === lane && selectedBoardSide === 'player';
                    const isSealed = GameState.playerSealedLanes && GameState.playerSealedLanes[lane] > 0;
                    
                    // ハイライト(配置可能)判定
                    let isHighlight = false;
                    const selectedCard = GameState.selectedCardIndex !== null && GameState.playerHand ? GameState.playerHand[GameState.selectedCardIndex] : null;
                    
                    if (isSealed) {
                        isHighlight = false; // 封印されていたらハイライトしない
                    } else if (GameState.isPlacementMode) {
                        const tCard = GameState.placementToken;
                        const checkEnv = GameState.placementCheckConstraints !== false; // フラグが明示的にfalseなら制約無視
                        if (GameState.placementSelectedLanes?.includes(lane)) {
                            isHighlight = false;
                        } else if (tCard && checkEnv) {
                            if (hasSkill && hasSkill(tCard, 'legendary')) {
                                isHighlight = (lane === 1);
                            } else if (hasSkill && hasSkill(tCard, 'takeover')) {
                                isHighlight = (card !== null);
                            } else {
                                isHighlight = true;
                            }
                        } else {
                            isHighlight = true;
                        }
                    } else if (selectedCard) {
                        if (GameState.turnCount === 1 && GameState.firstPlayer === 'blue') {
                            isHighlight = (lane === 1);
                        } else if (hasSkill && hasSkill(selectedCard, 'legendary')) {
                            isHighlight = (lane === 1);
                        } else if (hasSkill && hasSkill(selectedCard, 'takeover')) {
                            isHighlight = (card !== null); // 生贄対象がある場所のみ
                        } else {
                            // それ以外はすべて配置可能だが、既にカードがあると上書き（破棄）確認が出る仕様なので通常は光る
                            isHighlight = true;
                        }
                    }

                    return (
                        <div 
                            key={`player-lane-${lane}`} 
                            className={`cell${isHighlight ? ' highlight' : ''}${isSealed ? ' sealed' : ''}`}
                            data-lane={lane}
                            // 配置モード時などのCellクリックに対応したい場合はここで onCellClick を呼ぶ
                            onClick={(e) => {
                                if (isSealed && (GameState.isPlacementMode || GameState.selectedCardIndex !== null)) {
                                    showAlertModal('封印されています');
                                    return;
                                }
                                // 空セルのクリックも親に通知する
                                if (!card) {
                                    onCellClick(lane, 'player', null);
                                }
                            }}
                        >
                            {card && (
                                <Card 
                                    key={`player-card-${lane}-${card.uid || card.id}`}
                                    cardObj={card} 
                                    isBoard={true} 
                                    className={isSelected ? "selected" : ""}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isSealed && (GameState.isPlacementMode || GameState.selectedCardIndex !== null)) {
                                            showAlertModal('封印されています');
                                            return;
                                        }
                                        onCellClick(lane, 'player', card);
                                    }}
                                    onLongPress={onCardLongPress}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

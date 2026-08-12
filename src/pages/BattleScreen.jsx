import React, { useEffect, useState } from 'react';
import {
  confirmOverwrittenLane,
  dispatchBattleAction,
  endPlayerTurn,
  returnToTitle,
} from '../game/battle/index.js';
import {
  setSummonAnimationHook,
  setUpdateBattleUIHook,
  setUpdateCardDetailHook,
  showEnemySkillConfirm,
  showSkillConfirm,
} from '../services/uiBattle.js';
import MissionResultOverlay from '../components/battle/MissionResultOverlay.jsx';
import MissionListModal from '../components/battle/MissionListModal.jsx';
import {
  CHALLENGE_MISSIONS,
  MISSION_MAX_SCORE,
} from '../utils/constants/missions.js';
import { evaluateMission } from '../game/missionLogic.js';
import { showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import {
  checkShowMissionButton,
  getCardImgUrl,
  hasSkill,
  isTransitioning,
  playSound,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  DECK_SIZE,
  getStageBackgroundStyle,
} from '../utils/constants/config.js';

import Board from '../components/battle/Board.jsx';
import EnemyArea from '../components/battle/EnemyArea.jsx';
import Hand from '../components/battle/Hand.jsx';
import PlayerArea from '../components/battle/PlayerArea.jsx';
import TurnOrderOverlay from '../components/battle/TurnOrderOverlay.jsx';
import {
  advanceTutorialMessage,
  filterEndTurn,
  filterFinishEnemyTargetSelection,
  filterFinishHandSelection,
  filterHandCardClick,
  filterLaneClick,
  filterLeaderSkill,
  isTutorialMode,
  notifyTutorialHandLongPress,
  notifyTutorialLongPress,
  setTutorialMessageCallback,
  notifyCardPlaced,
} from '../game/tutorialEngine.js';
import { openCardPreview } from '../services/uiGallery.js';
import { BATTLE_PHASE } from '../game/battle/phases/phaseTypes.js';

export default function BattleScreen() {
  const [_renderVersion, setRenderVersion] = useState(0);
  const [cardDetailHtml, setCardDetailHtml] = useState('');
  const [cardDetailColor, setCardDetailColor] = useState('#94a3b8');
  const [showMissions, setShowMissions] = useState(false);
  // バトルボーナスは対象のモード（ストーリー・フリー対戦・高難易度イベント）でのみ機能する
  const showMissionButton = checkShowMissionButton();
  // バトル中に判定可能な（timing: 'instant'の）ボーナスの現在スコアを集計
  const missionScore = showMissionButton
    ? CHALLENGE_MISSIONS.reduce((sum, m) => {
        if (m.timing !== 'instant') return sum;
        return evaluateMission(m.id, GameState) ? sum + (m.points || 1) : sum;
      }, 0)
    : 0;
  const missionGaugePercent = Math.min(
    (missionScore / MISSION_MAX_SCORE) * 100,
    100
  );
  const isInitializing = GameState.isInitializing;
  const [startTurnOrderAnim, setStartTurnOrderAnim] = useState({
    active: false,
    firstPlayer: 'blue',
  });
  const [summonAnim, setSummonAnim] = useState({
    active: false,
    card: null,
    owner: 'blue',
  });

  // チュートリアルメッセージ表示用
  const [tutorialMessage, setTutorialMessage] = useState(null);

  // 強制再描画フックの登録
  useEffect(() => {
    setUpdateBattleUIHook(() => setRenderVersion((v) => v + 1));

    setUpdateCardDetailHook((html, color) => {
      setCardDetailHtml(html);
      setCardDetailColor(color);
    });

    setSummonAnimationHook((card, owner) => {
      return new Promise((resolve) => {
        setSummonAnim({ active: true, card, owner });
        setTimeout(() => {
          setSummonAnim({ active: false, card: null, owner: 'blue' });
          resolve();
        }, 1100); // 1.1秒間アニメーションを表示
      });
    });

    // チュートリアルメッセージコールバック登録
    setTutorialMessageCallback((msg) => setTutorialMessage(msg));

    return () => {
      setUpdateBattleUIHook(null);
      setUpdateCardDetailHook(null);
      setSummonAnimationHook(null);
      setTutorialMessageCallback(null);
    };
  }, []);

  // バトル進行側(battle.js)からのターン開始シグナルを受け取る
  useEffect(() => {
    window.startTurnOrderReact = (firstPlayer) => {
      setStartTurnOrderAnim({ active: true, firstPlayer });
    };

    // プリセット使用時（TurnOrderOverlayをスキップする場合）の初期化完了通知
    window.onBattlePresetReady = () => {
      GameState.isInitializing = false;
      setRenderVersion((v) => v + 1);
    };

    // マウント時にすでにバトルフェーズが進行している場合のフェイルセーフ
    if (GameState.battlePhase && GameState.battlePhase !== BATTLE_PHASE.INIT) {
      GameState.isInitializing = false;
      setRenderVersion((v) => v + 1);
    }

    // マウント完了と演出関数の準備が整ったことをバトル進行側に通知
    if (typeof window.onBattleScreenReady === 'function') {
      window.onBattleScreenReady();
    }

    return () => {
      window.startTurnOrderReact = null;
      window.onBattlePresetReady = null;
    };
  }, []);

  const handleTurnOrderComplete = React.useCallback(() => {
    setStartTurnOrderAnim({ active: false, firstPlayer: 'blue' });
    if (window.finishTurnOrder) {
      window.finishTurnOrder();
    }
    setRenderVersion((v) => v + 1);
  }, []);

  // Board や Hand からのイベントを GameState へ伝える
  const handleCellClick = async (lane, side, card) => {
    if (
      isInitializing ||
      typeof GameState.isProcessing === 'undefined' ||
      typeof isTransitioning === 'undefined'
    )
      return;

    // チュートリアル: レーンクリックのフィルタリング
    if (
      isTutorialMode() &&
      GameState.selectedCardIndex !== null &&
      side === 'player'
    ) {
      if (filterLaneClick(lane, side)) return;
    }
    if (GameState.isPlacementMode) {
      if (side === 'player' && window.handlePlacementLaneClick)
        window.handlePlacementLaneClick(lane);
      return;
    }
    if (GameState.isEnemyTargetMode) {
      if (side === 'enemy' && window.handleEnemyLaneClick)
        window.handleEnemyLaneClick(lane);
      return;
    }
    if (GameState.isAlliedTargetMode) {
      if (side === 'player' && window.handleAlliedLaneClick)
        window.handleAlliedLaneClick(lane);
      return;
    }
    if (
      GameState.isProcessing ||
      (typeof isTransitioning === 'function' && isTransitioning())
    )
      return;

    // 相手ターン中または戦闘中（攻撃アニメーション等）は操作不可
    if (
      GameState.currentTurn !== 'player' ||
      GameState.battlePhase === BATTLE_PHASE.COMBAT
    )
      return;

    // カード配置処理
    if (GameState.selectedCardIndex !== null && side === 'player') {
      const newCard = GameState.playerHand[GameState.selectedCardIndex];

      if (
        GameState.turnCount === 1 &&
        GameState.firstPlayer === 'blue' &&
        lane !== 1
      ) {
        playSound(SOUNDS.seDamage);
        showConfirmModal(
          '1ターン目は中央のレーンにしか召喚できません',
          () => {},
          null,
          true
        );
        return;
      }

      if (hasSkill && hasSkill(newCard, 'legendary') && lane !== 1) {
        playSound(SOUNDS.seDamage);
        showConfirmModal(
          `「${newCard.name}」は伝説を持つため、中央のレーンにしか召喚できません。`,
          () => {},
          null,
          true
        );
        return;
      }

      if (
        hasSkill &&
        hasSkill(newCard, 'takeover') &&
        GameState.playerBoard[lane] === null
      ) {
        playSound(SOUNDS.seDamage);
        showConfirmModal(
          `「${newCard.name}」は生贄を持つため、既にカードがあるレーンにしか召喚できません。`,
          () => {},
          null,
          true
        );
        return;
      }

      if (
        hasSkill &&
        hasSkill(newCard, 'challenge') &&
        GameState.enemyBoard[lane] === null
      ) {
        playSound(SOUNDS.seDamage);
        showConfirmModal(
          `「${newCard.name}」は挑戦を持つため、相手のカードの正面のレーンにしか召喚できません。`,
          () => {},
          null,
          true
        );
        return;
      }

      // 頂点（apex）制約チェック：自分の場の同レーンに伝説カードがいることが必要
      if (hasSkill && hasSkill(newCard, 'apex')) {
        if (
          !GameState.playerBoard[lane] ||
          !hasSkill(GameState.playerBoard[lane], 'legendary')
        ) {
          playSound(SOUNDS.seDamage);
          showConfirmModal(
            `「${newCard.name}」は頂点を持つため、自分の場に伝説カードが置かれているレーンにしか召喚できません。`,
            () => {},
            null,
            true
          );
          return;
        }
      }

      // 既存カードがあるレーンへの召喚時の確認モーダル（起動・合体・装備・破棄を共通関数で一元管理）
      if (GameState.playerBoard[lane] !== null) {
        const confirmed = await confirmOverwrittenLane('blue', newCard, lane);
        if (!confirmed) return;
      }

      // 旧UIのもっさり感を消すため、クリック時点で即座に選択状態（ハイライト）を解除
      const targetHandIndex = GameState.selectedCardIndex;
      GameState.selectedCardIndex = null;
      if (window.updateCardDetail) window.updateCardDetail(null);

      if (isTutorialMode()) {
        notifyCardPlaced(newCard.id, newCard.baseId, lane);
      }

      dispatchBattleAction({
        type: 'playCard',
        owner: 'blue',
        handIndex: targetHandIndex,
        lane,
      });
      setRenderVersion((v) => v + 1);
      return;
    }

    // カード選択 / 確認処理
    if (
      GameState.selectedCardIndex !== null ||
      (GameState.isProcessing && !GameState.isDiscardingMode)
    )
      return;
    playSound(SOUNDS.seClick);
    if (
      GameState.selectedBoardLaneIndex === lane &&
      GameState.selectedBoardSide === side
    ) {
      GameState.selectedBoardLaneIndex = null;
      GameState.selectedBoardSide = null;
      if (window.updateCardDetail) window.updateCardDetail(null);
    } else {
      GameState.selectedBoardLaneIndex = lane;
      GameState.selectedBoardSide = side;
      GameState.selectedCardIndex = null;
      if (window.updateCardDetail) window.updateCardDetail(card);
    }
    setRenderVersion((v) => v + 1);
  };

  const handleHandCardClick = (idx) => {
    // 【重要システム処理】手札破棄モード（isDiscardingMode）中は、
    // システムが明示的にプレイヤーへ手札選択を要求しているため、
    // ターン制限（敵ターン中である等）や処理中フラグ（isProcessing）などのすべての制限を完全にバイパスしてクリックを許可する。
    if (!GameState.isDiscardingMode) {
      if (GameState.isProcessing) return;
      if (
        GameState.battlePhase !== BATTLE_PHASE.MULLIGAN &&
        (GameState.currentTurn !== 'player' ||
          GameState.battlePhase === BATTLE_PHASE.COMBAT)
      ) {
        return;
      }
    }

    // チュートリアル: 手札クリックのフィルタリング
    if (isTutorialMode() && filterHandCardClick(idx)) return;

    playSound(SOUNDS.seClick);

    if (GameState.isDiscardingMode) {
      if (GameState.discardSelectedIndices.includes(idx)) {
        const arrIdx = GameState.discardSelectedIndices.indexOf(idx);
        GameState.discardSelectedIndices.splice(arrIdx, 1);
      } else {
        if (
          GameState.discardSelectedIndices.length < GameState.discardMaxCount
        ) {
          GameState.discardSelectedIndices.push(idx);
        }
      }
      setRenderVersion((v) => v + 1);
      return;
    }

    if (GameState.selectedCardIndex === idx) {
      GameState.selectedCardIndex = null;
      if (window.updateCardDetail) window.updateCardDetail(null);
    } else {
      GameState.selectedCardIndex = idx;
      GameState.selectedBoardLaneIndex = null;
      GameState.selectedBoardSide = null;
      if (window.updateCardDetail)
        window.updateCardDetail(GameState.playerHand[idx]);
    }
    setRenderVersion((v) => v + 1);
    if (window.highlightLanes) window.highlightLanes();
  };

  const handleCardLongPress = (card, side, lane) => {
    openCardPreview(card);
    // チュートリアル: 場のカード長押し通知
    if (isTutorialMode() && side !== undefined && lane !== undefined) {
      notifyTutorialLongPress(side, lane);
    }
  };

  // チュートリアル: 手札のカード長押し
  const handleHandCardLongPress = (card) => {
    openCardPreview(card);
    if (isTutorialMode() && card) {
      notifyTutorialHandLongPress(card.id, card.baseId);
    }
  };

  const stageId =
    GameState.gameMode === 'battle_dungeon'
      ? 'dungeon'
      : GameState.gameMode === 'story'
        ? GameState.enemyConfig?.stageId || 'android'
        : GameState.selectedStageId || 'android';
  const battleStyle = {
    backgroundColor: '#0f172a',
    ...getStageBackgroundStyle(stageId),
  };

  return (
    <div id="screen-battle" className="screen active" style={battleStyle}>
      {showMissionButton && (
        <div
          className="mission-gauge-ring btn-battle-mission-ring"
          style={{
            background: `conic-gradient(#22c55e ${missionGaugePercent}%, #000 ${missionGaugePercent}%)`,
          }}
        >
          <button
            className="btn-circle btn-battle-missions"
            aria-label="バトルボーナスを確認"
            onClick={(e) => {
              e.stopPropagation();
              playSound(SOUNDS.seClick);
              setShowMissions(true);
            }}
          >
            📋
          </button>
        </div>
      )}
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
      >
        🏳
      </button>

      <EnemyArea
        enemyConfig={GameState.enemyConfig}
        enemyHP={GameState.enemyHP}
        enemyMaxHP={GameState.enemyMaxHP === 0 ? 1 : GameState.enemyMaxHP}
        deckCount={GameState.enemyDeck.length}
        maxDeckCount={GameState.initialEnemyDeckCount || DECK_SIZE}
        dropCount={GameState.enemyDiscard.length}
      />

      <div className="turn-area">
        <div
          id="turn-status"
          style={{
            color:
              GameState.battlePhase === BATTLE_PHASE.MULLIGAN
                ? '#fff'
                : GameState.lastBattleResult === 'win'
                  ? '#facc15'
                  : GameState.lastBattleResult === 'lose'
                    ? '#fff'
                    : GameState.currentTurn === 'player'
                      ? 'var(--color-blue)'
                      : GameState.currentTurn === 'enemy'
                        ? 'var(--color-red)'
                        : '#facc15',
            fontSize: '16px',
          }}
        >
          {GameState.battlePhase === BATTLE_PHASE.MULLIGAN &&
          GameState.placementMessage
            ? GameState.placementMessage
            : GameState.battlePhase === BATTLE_PHASE.MULLIGAN
              ? 'MULLIGAN'
              : GameState.lastBattleResult === 'win'
                ? 'YOU WIN!'
                : GameState.lastBattleResult === 'lose'
                  ? 'YOU LOSE...'
                  : GameState.lastBattleResult === 'draw'
                    ? 'DRAW'
                    : GameState.currentTurn === 'player'
                      ? 'YOUR TURN'
                      : GameState.currentTurn === 'enemy'
                        ? GameState.isAIThinking
                          ? '思考中・・・'
                          : 'ENEMY TURN'
                        : ''}
        </div>
        {GameState.enemyConfig?.leaderSkill && (
          <button
            className="action-btn enemy-skill-btn"
            onClick={(e) => {
              e.stopPropagation();
              playSound(SOUNDS.seClick);
              showEnemySkillConfirm();
            }}
          >
            敵スキル
          </button>
        )}
      </div>

      <Board
        playerBoard={GameState.playerBoard}
        enemyBoard={GameState.enemyBoard}
        selectedBoardLaneIndex={GameState.selectedBoardLaneIndex}
        selectedBoardSide={GameState.selectedBoardSide}
        onCellClick={handleCellClick}
        onCardLongPress={(card, lane) =>
          handleCardLongPress(card, lane >= 3 ? 'enemy' : 'player', lane % 3)
        }
        tutorialMode={isTutorialMode()}
      />

      <PlayerArea
        playerConfig={GameState.playerConfig}
        playerHP={GameState.playerHP}
        playerMaxHP={GameState.playerMaxHP === 0 ? 1 : GameState.playerMaxHP}
        deckCount={GameState.playerDeck.length}
        maxDeckCount={GameState.initialPlayerDeckCount || DECK_SIZE}
        dropCount={GameState.playerDiscard.length}
        spCount={GameState.playerSP}
        maxSpCount={
          GameState.playerConfig?.leaderSkill
            ? GameState.playerConfig.leaderSkill.cost
            : 0
        }
        onLeaderSkillClick={() => {
          playSound(SOUNDS.seClick);
          if (isTutorialMode() && filterLeaderSkill()) return;
          showSkillConfirm();
        }}
      />

      <div className="card-detail-wrapper">
        <div
          id="card-detail-view"
          className="card-detail-box"
          style={{ color: cardDetailColor }}
          dangerouslySetInnerHTML={{
            __html:
              cardDetailHtml ||
              (GameState.isDiscardingMode
                ? `<div class="skill-info" style="color:#facc15; font-weight:bold;">${GameState.battlePhase === BATTLE_PHASE.MULLIGAN ? `${GameState.firstPlayer === 'blue' ? '先攻' : '後攻'}：引き直すカードを` : '捨てるカードを'}${GameState.discardMaxCount}枚${GameState.isDiscardingExact ? '' : 'まで'}選んでください</div>`
                : ''),
          }}
        ></div>
      </div>

      {/* 初期化中（ターン順アニメーション中）はコントロール領域全体を無効化 */}
      <div
        className="controls"
        style={{ pointerEvents: isInitializing ? 'none' : 'auto' }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            id="btn-leader-skill"
            className={`action-btn leader-skill-btn ${GameState.playerConfig?.leaderSkill && GameState.playerSP >= GameState.playerConfig.leaderSkill.cost && !GameState.isPlacementMode && !GameState.isDiscardingMode && !GameState.isEnemyTargetMode ? 'ready glow active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              playSound(SOUNDS.seClick);
              if (isTutorialMode() && filterLeaderSkill()) return;
              showSkillConfirm();
            }}
          >
            リーダースキル
          </button>
          {GameState.isPlacementMode ? (
            <button
              id="btn-end-turn"
              className="action-btn"
              style={{ background: '#ef4444', borderColor: '#dc2626' }}
              onClick={(e) => {
                e.stopPropagation();
                playSound(SOUNDS.seClick);
                if (window.finishPlacement) window.finishPlacement();
              }}
            >
              {GameState.placementButtonText || '配置完了'}
            </button>
          ) : GameState.isDiscardingMode ? (
            <button
              id="btn-end-turn"
              className="action-btn"
              style={{
                background:
                  GameState.isDiscardingExact &&
                  GameState.discardSelectedIndices.length !==
                    Math.min(
                      GameState.playerHand.length,
                      GameState.discardMaxCount
                    )
                    ? '#475569'
                    : '#ef4444',
                color:
                  GameState.isDiscardingExact &&
                  GameState.discardSelectedIndices.length !==
                    Math.min(
                      GameState.playerHand.length,
                      GameState.discardMaxCount
                    )
                    ? '#94a3b8'
                    : '#fff',
                borderColor:
                  GameState.isDiscardingExact &&
                  GameState.discardSelectedIndices.length !==
                    Math.min(
                      GameState.playerHand.length,
                      GameState.discardMaxCount
                    )
                    ? '#334155'
                    : '#dc2626',
                pointerEvents:
                  GameState.isDiscardingExact &&
                  GameState.discardSelectedIndices.length !==
                    Math.min(
                      GameState.playerHand.length,
                      GameState.discardMaxCount
                    )
                    ? 'none'
                    : 'auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                playSound(SOUNDS.seClick);
                if (isTutorialMode() && filterFinishHandSelection()) return;
                if (window.finishHandSelection) window.finishHandSelection();
              }}
            >
              選択完了
            </button>
          ) : GameState.isEnemyTargetMode ? (
            <button
              id="btn-end-turn"
              className="action-btn"
              style={{
                background:
                  !GameState.isTargetCancelable &&
                  GameState.targetSelectedLanes.length <
                    GameState.targetMaxCount
                    ? '#475569'
                    : '#ef4444',
                color:
                  !GameState.isTargetCancelable &&
                  GameState.targetSelectedLanes.length <
                    GameState.targetMaxCount
                    ? '#94a3b8'
                    : '#fff',
                borderColor:
                  !GameState.isTargetCancelable &&
                  GameState.targetSelectedLanes.length <
                    GameState.targetMaxCount
                    ? '#334155'
                    : '#dc2626',
                pointerEvents:
                  !GameState.isTargetCancelable &&
                  GameState.targetSelectedLanes.length <
                    GameState.targetMaxCount
                    ? 'none'
                    : 'auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                playSound(SOUNDS.seClick);
                if (isTutorialMode() && filterFinishEnemyTargetSelection())
                  return;
                if (window.finishEnemyTargetSelection)
                  window.finishEnemyTargetSelection();
              }}
            >
              選択完了
            </button>
          ) : GameState.isAlliedTargetMode ? (
            <button
              id="btn-end-turn"
              className="action-btn"
              style={{
                background:
                  !GameState.isTargetCancelable &&
                  GameState.targetSelectedLanes.length <
                    GameState.targetMaxCount
                    ? '#475569'
                    : '#ef4444',
                color:
                  !GameState.isTargetCancelable &&
                  GameState.targetSelectedLanes.length <
                    GameState.targetMaxCount
                    ? '#94a3b8'
                    : '#fff',
                borderColor:
                  !GameState.isTargetCancelable &&
                  GameState.targetSelectedLanes.length <
                    GameState.targetMaxCount
                    ? '#334155'
                    : '#dc2626',
                pointerEvents:
                  !GameState.isTargetCancelable &&
                  GameState.targetSelectedLanes.length <
                    GameState.targetMaxCount
                    ? 'none'
                    : 'auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                playSound(SOUNDS.seClick);
                if (window.finishAlliedSelection)
                  window.finishAlliedSelection();
              }}
            >
              選択完了
            </button>
          ) : (
            <button
              id="btn-end-turn"
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                playSound(SOUNDS.seClick);
                if (isTutorialMode() && filterEndTurn()) return;
                endPlayerTurn();
              }}
            >
              ターン終了
            </button>
          )}
        </div>
      </div>

      <Hand
        playerHand={GameState.playerHand}
        selectedCardIndex={GameState.selectedCardIndex}
        isDiscardingMode={GameState.isDiscardingMode}
        discardSelectedIndices={GameState.discardSelectedIndices}
        onCardClick={handleHandCardClick}
        onCardLongPress={handleHandCardLongPress}
      />

      <TurnOrderOverlay
        startAnim={startTurnOrderAnim.active}
        firstPlayer={startTurnOrderAnim.firstPlayer}
        onComplete={handleTurnOrderComplete}
      />

      {/* 召喚アニメーション用DOM */}
      {summonAnim.active && summonAnim.card && (
        <div className="summon-anim-overlay">
          <div
            className={`summon-anim-card card ${summonAnim.card.owner || summonAnim.owner} rarity-${summonAnim.card.rarity || 1} ${summonAnim.owner === 'blue' ? 'from-bottom' : 'from-top'}`}
          >
            <div
              className="card-bg"
              style={{
                backgroundImage: `url('${getCardImgUrl(summonAnim.card)}')`,
                filter: summonAnim.card.filter || 'none',
              }}
            ></div>
            <div
              className="card-power"
              style={{ fontSize: '3.5rem', right: '10px', bottom: '5px' }}
            >
              {summonAnim.card.currentPower !== undefined
                ? summonAnim.card.currentPower
                : summonAnim.card.power}
            </div>
          </div>
        </div>
      )}

      {/* チュートリアルメッセージUI */}
      {tutorialMessage && (
        <div
          className="tutorial-overlay"
          onClick={() => advanceTutorialMessage()}
        >
          <div className="tutorial-message-box">
            <div className="tutorial-icon-wrapper">
              <img
                src="assets/icons/icon_light.webp"
                alt=""
                className="tutorial-icon"
              />
            </div>
            <div className="tutorial-text">
              {tutorialMessage.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < tutorialMessage.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
            <div className="tutorial-tap-hint">▼ タップで次へ</div>
          </div>
        </div>
      )}

      <MissionResultOverlay />
      {showMissions && (
        <MissionListModal onClose={() => setShowMissions(false)} />
      )}
    </div>
  );
}

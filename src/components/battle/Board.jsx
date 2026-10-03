import { showAlertModal } from '../../services/uiModals.js';
import { GameState } from '../../state/gameState.js';
import { PLAYMAT_MASTER } from '../../utils/constants/playmats.js';
import { hasSkill } from '../../utils/gameUtils.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import { isValkyriaGuardActive } from '../../game/engine.js';
import Card from './Card.jsx';

/**
 * 召喚時の配置制約条件をチェックします。
 * 1. 1ターン目先攻制限（中央レーン固定）
 * 2. 伝説（中央レーン固定）
 * 3. 生贄（味方既存カードがあるレーンのみ）
 * 4. 頂点（味方伝説カードがあるレーンのみ）
 * 5. 挑戦（正面に敵がいるレーンのみ）
 *
 * @param {object} targetCard - 召喚しようとしているカード
 * @param {number} lane - 判定対象のレーンID
 * @param {object|null} existingCard - 自陣レーンにある既存カード
 * @param {object|null} enemyCardAtLane - 正面（敵陣レーン）にあるカード
 * @returns {boolean} 配置可能ならtrue
 */
const checkPlacementConstraints = (
  targetCard,
  lane,
  existingCard,
  enemyCardAtLane
) => {
  let valid = true;
  // 1ターン目先攻制限: 中央レーンのみ配置可能
  if (GameState.turnCount === 1 && GameState.firstPlayer === 'blue') {
    valid = valid && lane === 1;
  }
  // 「伝説」スキル: 中央レーンのみ
  if (hasSkill(targetCard, 'legendary')) {
    valid = valid && lane === 1;
  }
  // 「生贄」スキル: 既存カードがあるレーンのみ
  if (hasSkill(targetCard, 'takeover')) {
    valid = valid && existingCard !== null;
  }
  // 「頂点」スキル: 伝説カードがあるレーンのみ
  if (hasSkill(targetCard, 'apex')) {
    valid =
      valid && existingCard !== null && hasSkill(existingCard, 'legendary');
  }
  // 「挑戦」スキル: 正面に敵がいるレーンのみ
  if (hasSkill(targetCard, 'challenge')) {
    valid = valid && enemyCardAtLane !== null;
  }
  return valid;
};

export default function Board({
  playerBoard,
  enemyBoard,
  selectedBoardLaneIndex,
  selectedBoardSide,
  onCellClick,
  onCardLongPress,
}) {
  // 3レーン分ループ
  const lanes = [0, 1, 2];

  // 戦乙女の加護は陣営単位の状態のため、レーンループの外で1度だけ判定する
  const isEnemyGuardActive = isValkyriaGuardActive(GameState, 'red');
  const isPlayerGuardActive = isValkyriaGuardActive(GameState, 'blue');

  const getPlaymatUrl = (idOrUrl) => {
    if (!idOrUrl) return 'none';
    const pm = PLAYMAT_MASTER.find((p) => p.id === idOrUrl);
    const rawPath = pm
      ? pm.image
      : idOrUrl.startsWith('assets/')
        ? idOrUrl
        : `assets/playmats/playmat_${idOrUrl}.webp`;
    return `url('${appendVersionQuery(rawPath)}')`;
  };

  return (
    <div className="battle-board">
      {/* 敵・味方のプレイマット背景領域 */}
      {GameState.enemyConfig && GameState.enemyConfig.playmat && (
        <div
          id="playmat-enemy"
          className="playmat enemy"
          style={{
            backgroundImage: getPlaymatUrl(GameState.enemyConfig.playmat),
          }}
        ></div>
      )}
      {(GameState.selectedPlaymatId ||
        (GameState.playerConfig && GameState.playerConfig.playmat)) && (
        <div
          id="playmat-player"
          className="playmat player"
          style={{
            backgroundImage: getPlaymatUrl(
              GameState.selectedPlaymatId || GameState.playerConfig.playmat
            ),
          }}
        ></div>
      )}

      {/* 敵陣レーン */}
      <div className="lane-row" id="enemy-lanes">
        {lanes.map((lane) => {
          const card = enemyBoard[lane];
          const isSelected =
            selectedBoardLaneIndex === lane && selectedBoardSide === 'enemy';
          const isSealed =
            GameState.enemySealedLanes && GameState.enemySealedLanes[lane] > 0;
          let isEnemyHighlight = false;
          if (
            GameState.isEnemyTargetMode &&
            !GameState.targetSelectedLanes?.includes(lane)
          ) {
            if (GameState.isEnemyTargetAllowEmpty || card !== null) {
              isEnemyHighlight = true;
            }
          }

          return (
            <div
              key={`enemy-lane-${lane}`}
              className={`cell ${isSealed ? 'sealed' : ''} ${isEnemyHighlight ? 'highlight' : ''}`}
              data-lane={lane}
              onClick={() => {
                if (isSealed && window.handleEnemyLaneClick) {
                  showAlertModal('封印されています');
                  return;
                }
                if (!card) {
                  onCellClick(lane, 'enemy', null);
                }
              }}
            >
              {card && (
                <Card
                  key={`enemy-card-${lane}-${card.uid || card.id}`}
                  cardObj={card}
                  isBoard={true}
                  isValkyriaGuardActive={isEnemyGuardActive}
                  className={isSelected ? 'selected' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSealed && window.handleEnemyLaneClick) {
                      showAlertModal('封印されています');
                      return;
                    }
                    onCellClick(lane, 'enemy', card);
                  }}
                  onLongPress={(card) => onCardLongPress(card, lane + 3)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 自陣レーン */}
      <div className="lane-row" id="player-lanes">
        {lanes.map((lane) => {
          const card = playerBoard[lane];
          const isSelected =
            selectedBoardLaneIndex === lane && selectedBoardSide === 'player';
          const isSealed =
            GameState.playerSealedLanes &&
            GameState.playerSealedLanes[lane] > 0;

          // ハイライト(配置可能)判定
          let isHighlight = false;
          const selectedCard =
            GameState.selectedCardIndex !== null && GameState.playerHand
              ? GameState.playerHand[GameState.selectedCardIndex]
              : null;

          if (isSealed) {
            isHighlight = false; // 封印されていたらハイライトしない
          } else if (GameState.isPlacementMode) {
            const tCard = GameState.placementToken;
            const checkEnv = GameState.placementCheckConstraints !== false; // フラグが明示的にfalseなら制約無視
            if (GameState.placementSelectedLanes?.includes(lane)) {
              isHighlight = false;
            } else if (
              GameState.placementRestrictLanes &&
              !GameState.placementRestrictLanes.includes(lane)
            ) {
              isHighlight = false;
            } else if (tCard && checkEnv) {
              // 「召喚」時は制約チェックを実行（「配置」時は checkEnv=false でスキップ）
              isHighlight = checkPlacementConstraints(
                tCard,
                lane,
                card,
                enemyBoard[lane]
              );
            } else {
              isHighlight = true;
            }
          } else if (selectedCard) {
            // 手札からの「召喚」: 配置制約ルールに従う
            isHighlight = checkPlacementConstraints(
              selectedCard,
              lane,
              card,
              enemyBoard[lane]
            );
          }

          return (
            <div
              key={`player-lane-${lane}`}
              className={`cell${isHighlight ? ' highlight' : ''}${isSealed ? ' sealed' : ''}`}
              data-lane={lane}
              // 配置モード時などのCellクリックに対応したい場合はここで onCellClick を呼ぶ
              onClick={() => {
                if (
                  isSealed &&
                  (GameState.isPlacementMode ||
                    GameState.selectedCardIndex !== null)
                ) {
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
                  isValkyriaGuardActive={isPlayerGuardActive}
                  className={isSelected ? 'selected' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      isSealed &&
                      (GameState.isPlacementMode ||
                        GameState.selectedCardIndex !== null)
                    ) {
                      showAlertModal('封印されています');
                      return;
                    }
                    onCellClick(lane, 'player', card);
                  }}
                  onLongPress={(card) => onCardLongPress(card, lane)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

/**
 * バトル盤面（敵陣3レーン・自陣3レーン・プレイマット背景）を描画するコンポーネント。
 * 通常の手札選択・スキル配置モード・敵/味方ターゲット選択・「招来」破棄選択モードに応じた
 * レーンハイライトおよびカード選択状態の表示を管理する。
 *
 * @param {object} props - コンポーネントプロパティ
 * @param {Array<object|null>} props.playerBoard - 自陣レーンのカード配列（長さ3）
 * @param {Array<object|null>} props.enemyBoard - 敵陣レーンのカード配列（長さ3）
 * @param {number|null} props.selectedBoardLaneIndex - 詳細確認用に選択中の盤面レーン番号
 * @param {string|null} props.selectedBoardSide - 詳細確認用に選択中の陣営 ('player' | 'enemy')
 * @param {Function} props.onCellClick - セルまたは盤面カードクリック時のコールバック
 * @param {Function} props.onCardLongPress - 盤面カード長押し時のコールバック
 * @returns {JSX.Element} バトル盤面要素
 */
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

  /**
   * プレイマットIDまたは画像パスからCSSの background-image 用URL文字列を生成する。
   * @param {string|null|undefined} idOrUrl - プレイマットIDまたはアセットパス
   * @returns {string} CSS url(...) 形式の文字列、または未指定時は 'none'
   */
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
          const isEnemyTargetChosen =
            GameState.isEnemyTargetMode &&
            Boolean(GameState.targetSelectedLanes?.includes(lane));
          // 1個しか選ばない即決定時は青い選択済みハイライトを付けず、複数選択トグル時のみ表示する
          const isEnemyTargetSelected =
            isEnemyTargetChosen && (GameState.targetMaxCount || 0) > 1;
          let isEnemyHighlight = false;
          if (GameState.isEnemyTargetMode && !isEnemyTargetChosen) {
            if (Array.isArray(GameState.targetValidLanes)) {
              isEnemyHighlight = GameState.targetValidLanes.includes(lane);
            } else if (GameState.isEnemyTargetAllowEmpty || card !== null) {
              isEnemyHighlight = true;
            }
          }
          const enemyCardClassNames = [
            isSelected ? 'selected' : '',
            isEnemyTargetSelected ? 'board-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={`enemy-lane-${lane}`}
              className={`cell${isSealed ? ' sealed' : ''}${isEnemyHighlight ? ' highlight' : ''}${isEnemyTargetSelected ? ' lane-selected' : ''}`}
              data-lane={lane}
              onClick={() => {
                // 封印は召喚・配置・移動の制限であり、敵カード・敵レーンを対象選択するスキルでは
                // 封印中の相手レーンも選択可能なため、ここでは封印ブロックを行わない
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
                  className={enemyCardClassNames}
                  onClick={(e) => {
                    e.stopPropagation();
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

          const isInvokeBoardSelected =
            GameState.isInvokeSelectMode &&
            Boolean(GameState.targetSelectedLanes?.includes(lane));
          const isAlliedTargetChosen =
            GameState.isAlliedTargetMode &&
            Boolean(GameState.targetSelectedLanes?.includes(lane));
          // 1個しか選ばない即決定時は青い選択済みハイライトを付けず、複数選択トグル時のみ表示する
          const isAlliedTargetSelected =
            isAlliedTargetChosen && (GameState.targetMaxCount || 0) > 1;
          const isPlacementLaneChosen =
            GameState.isPlacementMode &&
            Boolean(GameState.placementSelectedLanes?.includes(lane));
          const isPlacementLaneSelected =
            isPlacementLaneChosen && (GameState.placementCount || 0) > 1;
          // ターン開始時の「移動（move）」発動中、現在移動させようとしている移動元カード（レーン）を青枠ハイライトする
          const isMoveSourceSelected = GameState.moveSourceLane === lane;
          const isPlayerLaneSelected =
            isInvokeBoardSelected ||
            isAlliedTargetSelected ||
            isPlacementLaneSelected ||
            isMoveSourceSelected;

          // ハイライト(選択・配置可能)判定
          let isHighlight = false;
          const selectedCard =
            GameState.selectedCardIndex !== null && GameState.playerHand
              ? GameState.playerHand[GameState.selectedCardIndex]
              : null;

          if (GameState.isInvokeSelectMode) {
            // 「招来」の破棄対象選択モード時は、カードが存在し未選択の自陣レーンをハイライトする
            isHighlight = card !== null && !isInvokeBoardSelected;
          } else if (GameState.isAlliedTargetMode) {
            // 味方対象選択モード（処刑・選別・鼓舞・保護等）時は、封印状態に関わらず未選択の対象可能カードレーンをハイライトする
            if (!isAlliedTargetChosen) {
              isHighlight = Array.isArray(GameState.targetValidLanes)
                ? GameState.targetValidLanes.includes(lane)
                : card !== null;
            }
          } else if (isSealed) {
            isHighlight = false; // 封印されていたら配置・召喚ハイライトしない
          } else if (GameState.isPlacementMode) {
            const tCard = GameState.placementToken;
            const checkEnv = GameState.placementCheckConstraints !== false; // フラグが明示的にfalseなら制約無視
            if (isPlacementLaneChosen) {
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
            // 手札からの通常「召喚」: 「降臨」を持たず、かつ配置制約ルールを満たすレーンのみハイライト
            isHighlight =
              !hasSkill(selectedCard, 'advent') &&
              checkPlacementConstraints(
                selectedCard,
                lane,
                card,
                enemyBoard[lane]
              );
          }

          const cardClassNames = [
            isSelected ? 'selected' : '',
            isPlayerLaneSelected ? 'board-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={`player-lane-${lane}`}
              className={`cell${isHighlight ? ' highlight' : ''}${isPlayerLaneSelected ? ' lane-selected' : ''}${isSealed ? ' sealed' : ''}`}
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
                  className={cardClassNames}
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

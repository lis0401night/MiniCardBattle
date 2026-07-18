import { GameState } from '../../state/gameState.js';
import { CHALLENGE_MISSIONS } from '../../utils/constants/missions.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playSound } from '../../utils/gameUtils.js';
import { evaluateMission } from '../../game/missionLogic.js';

export default function MissionListModal({ onClose }) {
  // battlePhaseは戦闘終了後もリセットされないため、isBattleEndedも合わせて確認する
  // （そうしないと前回のバトルの達成状況が次のバトル開始前まで残ってしまう）
  const isInBattle =
    GameState.battlePhase &&
    GameState.battlePhase !== 'INIT' &&
    !GameState.isBattleEnded;

  const handleClose = () => {
    playSound(SOUNDS.seClick);
    if (onClose) onClose();
  };

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 3000, display: 'flex' }}
      onClick={handleClose}
    >
      <div
        className="skill-modal-box modal-pop-animation mission-list-box"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mission-list-title">バトルボーナス</h2>

        <div className="card-list-container mission-list-scroll">
          {CHALLENGE_MISSIONS.map((m) => ({
            ...m,
            isAchieved:
              isInBattle &&
              m.timing === 'instant' &&
              evaluateMission(m.id, GameState),
          }))
            .sort((a, b) => (b.isAchieved ? 1 : 0) - (a.isAchieved ? 1 : 0))
            .map((m) => (
              <div
                key={m.id}
                className={`mission-row${m.isAchieved ? ' achieved' : ''}`}
              >
                <span className="mission-row-name">{m.name}</span>
                <div className="mission-row-status">
                  <div className="mission-clear-badge-wrap">
                    {m.isAchieved && (
                      <span className="mission-clear-text">CLEAR!</span>
                    )}
                  </div>
                  <span className="mission-row-points">
                    +{m.points || 1}点
                  </span>
                </div>
              </div>
            ))}
        </div>

        <div className="mission-list-note">
          スコア2点につき+1パック貰えます
          <br />
          （最大: 3パック）
        </div>

        <button
          className="btn mission-list-close-btn"
          onClick={handleClose}
        >
          閉じる
        </button>
      </div>

      <style>{`
        .mission-list-box {
          width: 95%;
          max-width: 440px;
          padding: 20px;
        }
        .mission-list-title {
          color: #facc15;
          margin-bottom: 15px;
          text-align: center;
        }
        .mission-list-scroll {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          height: 60vh;
          max-height: 500px;
          padding-right: 5px;
        }
        .mission-row {
          background: rgba(255, 255, 255, 0.05);
          border-left: 3px solid #64748b;
          padding: 10px;
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .mission-row.achieved {
          background: rgba(34, 197, 94, 0.15);
          border-left-color: #22c55e;
        }
        .mission-row-name {
          color: #cbd5e1;
          font-size: 0.9rem;
          flex: 1;
        }
        .mission-row.achieved .mission-row-name {
          color: #fff;
          font-weight: bold;
        }
        .mission-row-status {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          width: 120px;
        }
        .mission-clear-badge-wrap {
          width: 65px;
          text-align: center;
        }
        .mission-clear-text {
          color: #22c55e;
          font-size: 1rem;
          font-weight: 900;
          text-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
        }
        .mission-row-points {
          color: #fbbf24;
          font-size: 0.85rem;
          width: 45px;
          text-align: right;
        }
        .mission-list-note {
          margin-top: 15px;
          color: #94a3b8;
          font-size: 0.85rem;
          line-height: 1.4;
          text-align: center;
        }
        .mission-list-close-btn {
          margin-top: 10px;
          width: 100%;
        }
      `}</style>
    </div>
  );
}

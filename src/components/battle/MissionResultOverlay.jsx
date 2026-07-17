import { useEffect, useState } from 'react';
import { GameState } from '../../state/gameState.js';
import { CHALLENGE_MISSIONS } from '../../utils/constants/missions.js';
import { getSkinImage } from '../../utils/constants/characters.js';
import { getSeededRandom, playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import MenuButton from '../common/MenuButton.jsx';
import { evaluateMission } from '../../game/missionLogic.js';

export default function MissionResultOverlay() {
  const [isVisible, setIsVisible] = useState(false);
  const [baseCards, setBaseCards] = useState([]);
  const [missionResults, setMissionResults] = useState([]);
  const [bonusCards, setBonusCards] = useState([]);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // アニメーション用
  const [revealedCount, setRevealedCount] = useState(0);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    window.showMissionResultReact = (bCards, uCards) => {
      setBaseCards(bCards);

      // Evaluate missions
      const results = [];
      let totalPoints = 0;

      CHALLENGE_MISSIONS.forEach((mission) => {
        let isAchieved = evaluateMission(mission.id, GameState);

        results.push({ ...mission, isAchieved });
        if (isAchieved) totalPoints += mission.points || 1;
      });

      // Sort results: achieved missions first
      results.sort((a, b) => {
        if (a.isAchieved && !b.isAchieved) return -1;
        if (!a.isAchieved && b.isAchieved) return 1;
        return 0;
      });

      setMissionResults(results);

      // ボーナスカードの抽選
      const cappedPoints = Math.min(totalPoints, 6);
      const expectedBonus = Math.floor(cappedPoints / 2);

      const maxBonus = Math.min(expectedBonus, 3);
      const bCardsDrawn = [];
      const tempInventory = { ...GameState.playerInventory };
      // ベースカード分を仮インベントリに追加
      bCards.forEach((cid) => {
        tempInventory[cid] = (tempInventory[cid] || 0) + 1;
      });

      for (let i = 0; i < maxBonus; i++) {
        const currentAvailable = uCards.filter((cid) => {
          const count = tempInventory[cid] || 0;
          return count < 4;
        });

        if (currentAvailable.length > 0) {
          const rewardCardId = currentAvailable[Math.floor(getSeededRandom() * currentAvailable.length)];
          bCardsDrawn.push(rewardCardId);
          tempInventory[rewardCardId] = (tempInventory[rewardCardId] || 0) + 1;
        }
      }

      setBonusCards(bCardsDrawn);
      setIsFadingOut(false);
      setIsVisible(true);
      setRevealedCount(0);
      setAnimatedScore(0);
      playSound(SOUNDS.seSelect);
    };

    return () => {
      delete window.showMissionResultReact;
    };
  }, []);

  useEffect(() => {
    if (isVisible && revealedCount < missionResults.length) {
      const timer = setTimeout(() => {
        const currentMission = missionResults[revealedCount];
        setRevealedCount((prev) => prev + 1);
        if (currentMission.isAchieved) {
          setAnimatedScore((prev) => Math.min(prev + (currentMission.points || 1), 6));
          playSound(SOUNDS.seClick);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else if (isVisible && revealedCount === missionResults.length && missionResults.length > 0) {
      playSound(SOUNDS.seSkill); // 全部表示完了
    }
  }, [isVisible, revealedCount, missionResults]);

  const handleNext = (e) => {
    e.stopPropagation();
    playSound(SOUNDS.seClick);
    setIsFadingOut(true);

    setTimeout(() => {
      setIsVisible(false);
      if (window.showCardRewardReact) {
        window.showCardRewardReact([...baseCards, ...bonusCards]);
      }
    }, 300);
  };

  if (!isVisible) return null;

  const enemyImg = getSkinImage(
    GameState.enemyConfig,
    GameState.enemySkins?.[GameState.enemyConfig?.id],
    'main'
  ) || GameState.enemyConfig?.image;

  const bonusCount = Math.min(Math.floor(animatedScore / 2), bonusCards.length);
  const isCardCapped = Math.floor(animatedScore / 2) > bonusCards.length;
  const isAllRevealed = revealedCount >= missionResults.length;

  return (
    <div
      className={`screen active mission-result-overlay ${isFadingOut ? 'fade-out' : ''}`}
      style={{
        zIndex: 2500,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div className="mission-result-modal">
        <h2 className="mission-result-title">ミッション評価</h2>

        <div className="mission-result-list">
          {missionResults.map((m, idx) => (
            <div
              key={m.id}
              className={`mission-result-row${m.isAchieved ? ' achieved' : ''}${idx < revealedCount ? ' revealed' : ''}`}
            >
              <div className="mission-result-name">{m.name}</div>
              <div className="mission-result-status">
                <div className="mission-result-badge-wrap">
                  {m.isAchieved && (
                    <span className="mission-result-badge-text">CLEAR!</span>
                  )}
                </div>
                <div className="mission-result-points">
                  +{m.points || 1}点
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mission-result-bottom">
          {/* Progress Bar */}
          <div className="mission-result-progress-wrap">
            <div className="mission-result-score-label">
              スコア: <span className="mission-result-score-value">{animatedScore}</span> / 6
            </div>
            <div className="mission-result-bar-track">
              <div
                className="mission-result-bar-fill"
                style={{ width: `${(animatedScore / 6) * 100}%` }}
              />
              {/* Dividers at 2, 4 (最大値6は固定なので位置も固定) */}
              <div className="mission-result-bar-divider at-2" />
              <div className="mission-result-bar-divider at-4" />
            </div>
          </div>

          <div className="mission-result-bonus-label">
            ボーナスパック獲得: <span className="mission-result-bonus-value">{bonusCount}</span>
          </div>

          {/* 上限メッセージ */}
          {isCardCapped && (
            <div className="mission-result-cap-message">
              ※ 入手可能カードの上限に達しました
            </div>
          )}

          <div className="mission-result-pack-row">
            {[0, 1, 2].map((i) => {
              const isActive = i < bonusCount;
              return (
                <div
                  key={i}
                  className={`mission-result-pack-slot${isActive ? ' active' : ''}`}
                >
                  {isActive && (
                    <div className="mission-result-pack-flash">
                      <img
                        src="assets/ui/packimg01.png"
                        alt="pack"
                        className="mission-result-pack-img"
                      />
                      {enemyImg && (
                        <div className="mission-result-pack-mask">
                          <img
                            src={enemyImg}
                            alt="enemy"
                            className="mission-result-pack-enemy-img"
                          />
                        </div>
                      )}
                      <img
                        src="assets/ui/packimg01.png"
                        alt="pack specular"
                        className="mission-result-pack-img mission-result-pack-specular"
                      />
                      <img
                        src="assets/ui/packtextimg01.png"
                        alt="pack text"
                        className="mission-result-pack-img mission-result-pack-text"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <MenuButton
            variant="yellow"
            label="報酬を入手"
            onClick={handleNext}
            style={{
              width: '80%',
              opacity: isAllRevealed ? 1 : 0.5,
              pointerEvents: isAllRevealed ? 'auto' : 'none',
              transition: 'opacity 0.3s',
            }}
          />
        </div>
      </div>
      <style>{`
        .mission-result-modal {
          background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
          border: 3px solid #eab308;
          border-radius: 12px;
          padding: 30px 20px;
          width: 100%;
          max-width: 400px;
          max-height: 95vh;
          box-shadow: 0 0 30px rgba(234, 179, 8, 0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .mission-result-title {
          color: #facc15;
          text-shadow: 0 2px 4px rgba(0,0,0,0.8);
          margin: 0 0 20px 0;
          font-size: 1.8rem;
          text-align: center;
          border-bottom: 2px solid rgba(250, 204, 21, 0.3);
          padding-bottom: 10px;
          width: 100%;
        }

        .mission-result-list {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 20px;
          flex: 0 1 auto;
          min-height: 0;
          max-height: 350px;
          overflow-y: auto;
          padding-right: 5px;
        }
        .mission-result-list::-webkit-scrollbar {
          width: 6px;
        }
        .mission-result-list::-webkit-scrollbar-thumb {
          background: rgba(250, 204, 21, 0.4);
          border-radius: 3px;
        }
        .mission-result-list::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
        }

        .mission-result-row {
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.3s ease;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255, 255, 255, 0.05);
          border-left: 4px solid #475569;
          padding: 10px 15px;
          border-radius: 4px;
        }
        .mission-result-row.revealed {
          opacity: 1;
          transform: translateY(0);
        }
        .mission-result-row.achieved {
          background: rgba(34, 197, 94, 0.15);
          border-left-color: #22c55e;
        }

        .mission-result-name {
          color: #94a3b8;
          font-size: 0.9rem;
          flex: 1;
        }
        .mission-result-row.achieved .mission-result-name {
          color: #fff;
          font-weight: bold;
        }

        .mission-result-status {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          width: 130px;
        }
        .mission-result-badge-wrap {
          width: 75px;
          text-align: center;
        }
        .mission-result-badge-text {
          color: #22c55e;
          font-weight: 900;
          font-size: 1.2rem;
          text-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
        }
        .mission-result-points {
          color: #fbbf24;
          font-size: 0.9rem;
          width: 45px;
          text-align: right;
        }

        .mission-result-bottom {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .mission-result-progress-wrap {
          width: 100%;
          max-width: 300px;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .mission-result-score-label {
          color: #fff;
          font-size: 1rem;
          margin-bottom: 8px;
        }
        .mission-result-score-value {
          color: #facc15;
          font-size: 1.3rem;
          font-weight: bold;
        }
        .mission-result-bar-track {
          position: relative;
          width: 100%;
          height: 14px;
          background: rgba(0,0,0,0.5);
          border-radius: 7px;
          border: 1px solid #475569;
          overflow: hidden;
        }
        .mission-result-bar-fill {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          background: linear-gradient(90deg, #ca8a04, #facc15);
          transition: width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 0 10px rgba(250, 204, 21, 0.5);
        }
        .mission-result-bar-divider {
          position: absolute;
          top: 0;
          height: 100%;
          width: 2px;
          background: rgba(255,255,255,0.4);
          z-index: 2;
        }
        .mission-result-bar-divider.at-2 { left: 33.333%; }
        .mission-result-bar-divider.at-4 { left: 66.667%; }

        .mission-result-bonus-label {
          color: #fff;
          font-size: 1.2rem;
          margin-bottom: 15px;
        }
        .mission-result-bonus-value {
          color: #facc15;
          font-size: 1.5rem;
          font-weight: bold;
        }

        .mission-result-cap-message {
          color: #ef4444;
          font-size: 0.9rem;
          margin-bottom: 10px;
          font-weight: bold;
          animation: fade-in-up 0.3s ease;
        }

        .mission-result-pack-row {
          display: flex;
          gap: 15px;
          margin-bottom: 30px;
        }
        .mission-result-pack-slot {
          position: relative;
          width: 60px;
          height: 80px;
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
          border: 2px dashed #475569;
          opacity: 0.4;
          transition: all 0.3s ease;
        }
        .mission-result-pack-slot.active {
          background: none;
          border: none;
          opacity: 1;
        }
        .mission-result-pack-flash {
          width: 100%;
          height: 100%;
          animation: pack-flash 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .mission-result-pack-img {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .mission-result-pack-mask {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 11;
          -webkit-mask-image: url(assets/ui/packimg01.png);
          -webkit-mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-image: url(assets/ui/packimg01.png);
          mask-size: contain;
          mask-repeat: no-repeat;
          mask-position: center;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mission-result-pack-enemy-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          mix-blend-mode: multiply;
          filter: contrast(1.08) saturate(1.15) brightness(0.98);
        }
        .mission-result-pack-specular {
          mix-blend-mode: overlay;
          opacity: 0.55;
          z-index: 12;
        }
        .mission-result-pack-text {
          z-index: 13;
        }

        @keyframes pack-flash {
          0% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.2); filter: brightness(2) drop-shadow(0 0 15px #facc15); }
          100% { transform: scale(1.1); filter: brightness(1); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .mission-result-overlay.fade-out {
          animation: reward-fade-out 0.3s forwards;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

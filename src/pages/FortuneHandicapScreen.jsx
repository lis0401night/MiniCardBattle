import { useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import { CHAR_FORTUNE_HANDICAPS } from '../utils/constants/fortuneHandicaps.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function FortuneHandicapScreen() {
  const enemyCharId =
    typeof GameState !== 'undefined' &&
    GameState.gameMode?.startsWith('event_') &&
    GameState.gameMode?.endsWith('_fortune')
      ? GameState.gameMode.replace('event_', '').replace('_fortune', '')
      : 'automata';

  const fortuneHandicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];

  const storageKey = `mini_card_battle_fortune_handicaps_${enemyCharId}`;

  const [handicaps, setHandicaps] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : {};
      if (typeof GameState !== 'undefined') {
        GameState.fortuneHandicaps = parsed;
      }
      return parsed;
    } catch {
      return {};
    }
  });

  const totalPoints = fortuneHandicapsList.reduce(
    (sum, item) => sum + (handicaps[item.id] ? item.cost : 0),
    0
  );

  const toggleHandicap = (id, cost) => {
    const isON = !!handicaps[id];
    if (!isON && totalPoints + cost > 24) {
      playSound(SOUNDS?.seError || SOUNDS?.seClick);
      if (window.showAlertModalHook) {
        window.showAlertModalHook(
          '特級目標の合計ポイントは最大24ポイントまでです。'
        );
      } else {
        alert('特級目標の合計ポイントは最大24ポイントまでです。');
      }
      return;
    }

    playSound(SOUNDS?.seClick);
    const nextState = { ...handicaps, [id]: !isON };
    setHandicaps(nextState);
    if (typeof GameState !== 'undefined') {
      GameState.fortuneHandicaps = nextState;
    }
    localStorage.setItem(storageKey, JSON.stringify(nextState));
  };

  return (
    <div
      id="screen-fortune-handicap"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.95)), url('assets/backgrounds/background_highdifficulty.webp')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <h2
          style={{
            color: '#f97316',
            marginBottom: '5px',
            textShadow: '0 0 15px rgba(249, 115, 22, 0.6)',
          }}
        >
          特級目標
        </h2>
      </div>

      {/* 合計目標値とゲージバー（タイトルとは別要素で全幅確保） */}
      {(() => {
        // 合計目標値の色段階: 0=灰色, 1-4=白, 5-9=緑, 10-14=黄, 15-19=オレンジ, 20-24=赤
        const gradeColor =
          totalPoints === 0
            ? '#94a3b8'
            : totalPoints <= 4
              ? '#ffffff'
              : totalPoints <= 9
                ? '#10b981'
                : totalPoints <= 14
                  ? '#eab308'
                  : totalPoints <= 19
                    ? '#f97316'
                    : '#ef4444';
        const gradeGlow =
          totalPoints === 0
            ? 'none'
            : totalPoints <= 4
              ? '0 0 10px rgba(255, 255, 255, 0.4)'
              : totalPoints <= 9
                ? '0 0 10px rgba(16, 185, 129, 0.4)'
                : totalPoints <= 14
                  ? '0 0 10px rgba(234, 179, 8, 0.4)'
                  : totalPoints <= 19
                    ? '0 0 10px rgba(249, 115, 22, 0.4)'
                    : '0 0 10px rgba(239, 68, 68, 0.4)';
        const MAX_TOTAL = 24;
        const barPercent = (totalPoints / MAX_TOTAL) * 100;

        return (
          <div
            style={{
              flexShrink: 0,
              width: '100%',
              padding: '0 50px',
              boxSizing: 'border-box',
              marginBottom: '10px',
            }}
          >
            <div
              style={{
                fontSize: '1rem',
                fontWeight: 'bold',
                color: gradeColor,
                textShadow: gradeGlow,
                textAlign: 'center',
                marginBottom: '6px',
              }}
            >
              合計目標値: {totalPoints} / {MAX_TOTAL}
            </div>
            {/* ゲージバー（目盛り付き） */}
            <div
              style={{
                width: '100%',
                position: 'relative',
                height: '12px',
              }}
            >
              {/* バー本体 */}
              <div
                style={{
                  width: '100%',
                  height: '10px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  borderRadius: '5px',
                  border: '1px solid #475569',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${barPercent}%`,
                    height: '100%',
                    background: gradeColor,
                    borderRadius: '4px',
                    transition: 'width 0.3s ease, background 0.3s ease',
                    boxShadow: totalPoints > 0 ? `0 0 6px ${gradeColor}` : 'none',
                  }}
                />
              </div>
              {/* 目盛り線（ラベルなし） */}
              {[5, 10, 15, 20].map((value) => (
                <div
                  key={value}
                  style={{
                    position: 'absolute',
                    left: `${(value / MAX_TOTAL) * 100}%`,
                    top: 0,
                    width: '1px',
                    height: '10px',
                    background: 'rgba(148, 163, 184, 0.5)',
                    transform: 'translateX(-50%)',
                  }}
                />
              ))}
            </div>
          </div>
        );
      })()}

      <div
        style={{
          flex: 1,
          width: '100%',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 0',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            width: '90%',
            maxWidth: '500px',
            paddingBottom: '20px',
          }}
        >
          {fortuneHandicapsList.map((item) => {
            const isON = !!handicaps[item.id];

            return (
              <div
                key={item.id}
                style={{
                  background: 'rgba(30, 41, 59, 0.9)',
                  border: `1px solid ${isON ? '#f97316' : '#334155'}`,
                  boxShadow: isON ? '0 0 10px rgba(249, 115, 22, 0.2)' : 'none',
                  borderRadius: '8px',
                  padding: '12px 15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1, paddingRight: '15px' }}>
                  <div
                    style={{
                      color: '#f8fafc',
                      fontWeight: 'bold',
                      fontSize: '0.95rem',
                      marginBottom: '2px',
                    }}
                  >
                    {item.name}
                  </div>
                </div>

                <div
                  style={{
                    color: '#10b981',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    marginRight: '12px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  +{item.cost}pt
                </div>

                <button
                  onClick={() => toggleHandicap(item.id, item.cost)}
                  className="btn"
                  style={{
                    width: '80px',
                    height: '36px',
                    padding: '0',
                    margin: '0',
                    flexShrink: 0,
                    background: isON
                      ? 'linear-gradient(45deg, #f97316, #ea580c)'
                      : '#475569',
                    color: isON ? '#fff' : '#94a3b8',
                    border: isON ? '2px solid #fdba74' : '2px solid #64748b',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                  }}
                >
                  {isON ? 'ON' : 'OFF'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          marginTop: '15px',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <BackButton
          to="screen-difficulty"
          style={{ padding: '10px 40px', margin: 0 }}
        />
      </div>
    </div>
  );
}

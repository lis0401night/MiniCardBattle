import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import {
  CHAR_FORTUNE_HANDICAPS,
} from '../utils/constants/fortuneHandicaps.js';
import {
  loadFortuneClearedData,
  FORTUNE_GRADE_THRESHOLDS,
} from '../utils/constants/fortuneRewards.js';
import { getScreenBackgroundStyle } from '../utils/constants/config.js';

/**
 * 運命の邂逅：特級目標の達成状況画面
 * 各特級目標の達成済み/未達成と、合計達成レベルの一覧を表示する
 */
export default function FortuneAchievementScreen() {
  const enemyCharId =
    typeof GameState !== 'undefined' &&
    GameState.gameMode?.startsWith('event_') &&
    GameState.gameMode?.endsWith('_fortune')
      ? GameState.gameMode.replace('event_', '').replace('_fortune', '')
      : 'automata';

  const fortuneHandicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];
  const clearedData = loadFortuneClearedData(enemyCharId);

  const bgStyle = getScreenBackgroundStyle(
    'assets/backgrounds/background_highdifficulty.webp'
  );

  return (
    <div
      id="screen-fortune-achievement"
      className="screen active"
      style={{
        ...bgStyle,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* 固定タイトル */}
      <h2
        style={{
          color: '#f97316',
          marginBottom: '5px',
          marginTop: '20px',
          textShadow: '0 0 15px rgba(249, 115, 22, 0.6)',
          flexShrink: 0,
        }}
      >
        達成状況
      </h2>

      {/* 2つの独立したスクロール領域（高さを等分し、それぞれでスクロール可能） */}
      <div
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '15px',
          padding: '10px 0',
          boxSizing: 'border-box',
          minHeight: 0,
        }}
      >
        {/* 特級目標の枠 */}
        <div
          style={{
            flex: 1,
            width: 'calc(90% + 30px)',
            maxWidth: '530px',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '12px 15px',
            boxSizing: 'border-box',
            minHeight: 0,
          }}
        >
          <div
            style={{
              color: '#cbd5e1',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              marginBottom: '8px',
              flexShrink: 0,
            }}
          >
            特級目標
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px',
            }}
          >
            {fortuneHandicapsList.map((item) => {
              const isCleared = !!clearedData.clearedHandicaps[item.id];
              return (
                <div
                  key={item.id}
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    border: `1px solid ${isCleared ? '#f97316' : '#334155'}`,
                    boxShadow: isCleared ? '0 0 10px rgba(249, 115, 22, 0.2)' : 'none',
                    borderRadius: '8px',
                    padding: '12px 15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '0.95rem' }}>
                      {item.name}
                    </span>
                  </div>
                  <div
                    style={{
                      color: '#10b981',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                      marginRight: '12px',
                    }}
                  >
                    +{item.cost}pt
                  </div>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: isCleared ? '#10b981' : '#64748b',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isCleared ? '達成済み' : '未達成'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 合計達成レベルの枠 */}
        <div
          style={{
            flex: 1,
            width: 'calc(90% + 30px)',
            maxWidth: '530px',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '12px 15px',
            boxSizing: 'border-box',
            minHeight: 0,
          }}
        >
          <div
            style={{
              color: '#cbd5e1',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              marginBottom: '8px',
              flexShrink: 0,
            }}
          >
            合計達成レベル
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px',
            }}
          >
            {FORTUNE_GRADE_THRESHOLDS.map((threshold) => {
              const isCleared = clearedData.maxGradeLevel >= threshold.level;
              return (
                <div
                  key={threshold.level}
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    border: `1px solid ${isCleared ? '#f97316' : '#334155'}`,
                    boxShadow: isCleared ? '0 0 10px rgba(249, 115, 22, 0.2)' : 'none',
                    borderRadius: '8px',
                    padding: '12px 15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '0.95rem' }}>
                      Lv.{threshold.level} ({threshold.min}～{threshold.max}pt)
                    </span>
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
                    +{threshold.bonus}pt
                  </div>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: isCleared ? '#10b981' : '#64748b',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isCleared ? '達成済み' : '未達成'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 固定の戻るボタン */}
      <div
        style={{
          flexShrink: 0,
          marginTop: '15px',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '0 0 20px 0',
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

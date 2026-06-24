import { useId } from 'react';

const DeckIcon = ({ count, max = 20 }) => {
  const uniqueId = useId();
  // SVGのdefs定義IDがインスタンス間で競合して参照バグが発生するのを防ぐため、各IDを一意化する
  const shadowId = `deck-shadow-${uniqueId}`;
  const edgeGradientId = `edge-gradient-${uniqueId}`;
  const bodyGradientId = `body-gradient-${uniqueId}`;
  const cardBackPatternId = `card-back-pattern-${uniqueId}`;

  const displayCount = Math.min(Math.max(0, count), max);

  // SVGのサイズ
  const SVG_WIDTH = 44;
  const SVG_HEIGHT = 36;

  // デッキの厚みの最大値
  const MAX_THICKNESS = 14;
  const thickness = (displayCount / max) * MAX_THICKNESS;

  // デッキの最下部のY座標
  const STACK_BOTTOM = 32;

  // 台形の底辺（白い直方体の上部）のY座標
  const baseY = STACK_BOTTOM - thickness;

  // 台形の高さ
  const TRAPEZOID_HEIGHT = 12;
  const topY = baseY - TRAPEZOID_HEIGHT;

  // 積み重なっているカードの層を表現する横線
  const lines = [];
  if (thickness > 0) {
    // 線の間隔を3にして本数を増やし、太さを1にする
    for (let y = baseY + 3; y < STACK_BOTTOM - 1; y += 3) {
      lines.push(
        <line
          key={y}
          x1="4"
          y1={y}
          x2="40"
          y2={y}
          stroke="#8a8a8a"
          strokeWidth="1"
        />
      );
    }
  }

  return (
    <div
      className="deck-icon"
      style={{
        width: `${SVG_WIDTH}px`,
        height: `${SVG_HEIGHT}px`,
        marginRight: '4px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={`山札: ${count}枚`}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="1.5"
              floodColor="#000"
              floodOpacity="0.5"
            />
          </filter>
          <linearGradient id={edgeGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c0c0c0" />
            <stop offset="100%" stopColor="#f0f0f0" />
          </linearGradient>
          <linearGradient
            id={bodyGradientId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#eaeaea" />
            <stop offset="100%" stopColor="#cccccc" />
          </linearGradient>
          <pattern
            id={cardBackPatternId}
            patternUnits="userSpaceOnUse"
            width="40"
            height={TRAPEZOID_HEIGHT}
            x="2"
            y={topY}
          >
            <image
              href="assets/ui/ui_card_back.png"
              x="0"
              y="0"
              width="40"
              height={TRAPEZOID_HEIGHT}
              preserveAspectRatio="none"
            />
          </pattern>
        </defs>

        {displayCount > 0 ? (
          <g filter={`url(#${shadowId})`}>
            {/* 白系の土台（カードの厚み部分） */}
            <path
              d={`M 2,${baseY} L 42,${baseY} L 42,${STACK_BOTTOM - 2} Q 42,${STACK_BOTTOM} 40,${STACK_BOTTOM} L 4,${STACK_BOTTOM} Q 2,${STACK_BOTTOM} 2,${STACK_BOTTOM - 2} Z`}
              fill={`url(#${bodyGradientId})`}
              stroke={`url(#${bodyGradientId})`}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* カードの層（横線） */}
            {lines}
            {/* 上部の台形 */}
            <path
              d={`M 8,${topY} L 36,${topY} L 42,${baseY} L 2,${baseY} Z`}
              fill={`url(#${cardBackPatternId})`}
              stroke={`url(#${edgeGradientId})`}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </g>
        ) : (
          /* 0枚のときのプレースホルダー（うっすらとした枠） */
          <path
            d={`M 2,${STACK_BOTTOM} L 42,${STACK_BOTTOM} L 42,${STACK_BOTTOM + 2} L 2,${STACK_BOTTOM + 2} Z`}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
        )}
      </svg>
    </div>
  );
};

export default DeckIcon;

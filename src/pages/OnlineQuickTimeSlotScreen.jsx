import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { showOnlineQuickMatch } from '../services/uiMainCore.js';
import { fetchQuickBattleHistory } from '../utils/apiUtils.js';
import { calculateHourlyAverages } from '../utils/timeSlotUtils.js';

/**
 * オンライン対戦 - クイックマッチ時間帯傾向画面コンポーネント
 * ピーク時間帯と24時間のマッチング割合折れ線グラフを表示します。
 * @returns {import('react').ReactElement} 時間帯傾向画面
 */
export default function OnlineQuickTimeSlotScreen() {
  const [battles, setBattles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * サーバーから対人履歴を取得する非同期ハンドラ
   * @returns {Promise<void>}
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQuickBattleHistory();
      setBattles(data);
    } catch (err) {
      console.error('Failed to load quick battle history:', err);
      setError('データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 集計データの計算
  const stats = useMemo(() => {
    return calculateHourlyAverages(battles);
  }, [battles]);

  // SVG グラフ寸法パラメータ
  const svgWidth = 700;
  const svgHeight = 340;
  const paddingLeft = 55;
  const paddingRight = 25;
  const paddingTop = 30;
  const paddingBottom = 45;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  // 縦軸の最大値（%）の決定（最低5%、5%刻みで切り上げ）
  const yMax = Math.max(5, Math.ceil((stats.peakPercentage || 5) / 5) * 5);
  const ySteps = 5; // 縦軸目盛り分割数

  /**
   * 指定した時間帯のSVG内X座標を算出します。
   * @param {number} hour - 時間帯 (0〜23)
   * @returns {number} SVG内X座標
   */
  const getX = (hour) => {
    return paddingLeft + (hour / 23) * chartWidth;
  };

  /**
   * 指定したパーセンテージのSVG内Y座標を算出します。
   * @param {number} percentage - 割合(%)
   * @returns {number} SVG内Y座標
   */
  const getY = (percentage) => {
    const clamped = Math.max(0, Math.min(percentage, yMax));
    return paddingTop + chartHeight - (clamped / yMax) * chartHeight;
  };

  // 折れ線パスおよびエリア（塗りつぶし）パスの構築
  const points = stats.percentages.map((pct, h) => `${getX(h)},${getY(pct)}`);
  const linePointsString = points.join(' ');
  const areaPointsString = `${getX(0)},${paddingTop + chartHeight} ${linePointsString} ${getX(23)},${paddingTop + chartHeight}`;

  return (
    <ScreenLayout
      id="screen-online-quick-timeslot"
      title="時間帯"
      titleColor="#38bdf8"
      titleGlow={true}
      backgroundImage="background_online.webp"
      onBackClick={() => showOnlineQuickMatch?.()}
      showBackButton={true}
      backHasBorder={false}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          padding: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        {/* ピーク時間帯表示カード */}
        <div
          style={{
            width: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid #eab308',
            borderRadius: '8px',
            padding: '12px 18px',
            marginBottom: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                marginBottom: '2px',
              }}
            >
              ピーク時間帯
            </div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: '#fbbf24',
              }}
            >
              {stats.validDaysCount > 0
                ? `${stats.peakHour}:00 〜 ${stats.peakHour}:59`
                : '-'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: '#fbbf24',
              }}
            >
              {stats.validDaysCount > 0
                ? `${stats.peakPercentage.toFixed(1)}%`
                : '-'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#fef08a' }}>
              マッチング割合
            </div>
          </div>
        </div>

        {/* グラフ描画エリア */}
        <div
          style={{
            width: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '14px 8px 10px 4px',
            boxSizing: 'border-box',
            position: 'relative',
          }}
        >
          {loading ? (
            <div
              style={{
                height: '240px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#94a3b8',
                fontSize: '0.9rem',
              }}
            >
              対戦データを読み込み中...
            </div>
          ) : error ? (
            <div
              style={{
                height: '240px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#ef4444',
                fontSize: '0.9rem',
                gap: '8px',
              }}
            >
              <span>{error}</span>
              <button
                type="button"
                className="btn btn-fantasy btn-variant-blue"
                onClick={loadData}
                style={{ padding: '4px 14px', fontSize: '0.8rem' }}
              >
                再読み込み
              </button>
            </div>
          ) : stats.validDaysCount === 0 ? (
            <div
              style={{
                height: '240px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#94a3b8',
                fontSize: '0.9rem',
              }}
            >
              記録された対戦履歴がありません
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                overflow: 'visible',
              }}
            >
              <defs>
                {/* 折れ線下の透過グラデーション */}
                <linearGradient
                  id="timeSlotAreaGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* 水平グリッド線 & 縦軸ラベル */}
              {Array.from({ length: ySteps + 1 }).map((_, i) => {
                const val = (yMax / ySteps) * i;
                const y = getY(val);
                return (
                  <g key={`grid-y-${i}`}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={paddingLeft + chartWidth}
                      y2={y}
                      stroke="#1e293b"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 4}
                      fill="#94a3b8"
                      fontSize="12"
                      textAnchor="end"
                      fontFamily="sans-serif"
                    >
                      {val.toFixed(0)}%
                    </text>
                  </g>
                );
              })}

              {/* 垂直グリッド線 & 横軸ラベル（24時間） */}
              {Array.from({ length: 24 }).map((_, h) => {
                const x = getX(h);
                // ラベルは 0時, 3時, 6時, 9時, 12時, 15時, 18時, 21時, 23時
                const showLabel = h % 3 === 0 || h === 23;
                return (
                  <g key={`grid-x-${h}`}>
                    {showLabel && (
                      <line
                        x1={x}
                        y1={paddingTop}
                        x2={x}
                        y2={paddingTop + chartHeight}
                        stroke="#1e293b"
                        strokeWidth="1"
                        strokeDasharray={h === 0 || h === 23 ? 'none' : '2 2'}
                      />
                    )}
                    {/* 横軸下部の目盛り線（ティック） */}
                    <line
                      x1={x}
                      y1={paddingTop + chartHeight}
                      x2={x}
                      y2={paddingTop + chartHeight + (showLabel ? 5 : 3)}
                      stroke="#475569"
                      strokeWidth="1"
                    />
                    {showLabel && (
                      <text
                        x={x}
                        y={paddingTop + chartHeight + 20}
                        fill="#94a3b8"
                        fontSize="12"
                        textAnchor="middle"
                        fontFamily="sans-serif"
                      >
                        {h}時
                      </text>
                    )}
                  </g>
                );
              })}

              {/* 折れ線下の塗りグラデーション領域 */}
              <polygon
                points={areaPointsString}
                fill="url(#timeSlotAreaGradient)"
              />

              {/* 折れ線本体 */}
              <polyline
                points={linePointsString}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* 各時間帯のデータポイント（円） */}
              {stats.percentages.map((pct, h) => {
                const cx = getX(h);
                const cy = getY(pct);
                const isPeak = h === stats.peakHour;

                return (
                  <g key={`point-${h}`}>
                    {/* ピーク時間帯の外側光彩 */}
                    {isPeak && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r="7"
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="2"
                        opacity="0.8"
                      />
                    )}
                    {/* メインドット */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isPeak ? 4.5 : 3.5}
                      fill={isPeak ? '#fbbf24' : '#0284c7'}
                      stroke={isPeak ? '#fef08a' : '#38bdf8'}
                      strokeWidth={1.5}
                    />
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </ScreenLayout>
  );
}

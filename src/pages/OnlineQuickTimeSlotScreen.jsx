import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { showOnlineQuickMatch } from '../services/uiMainCore.js';
import { fetchQuickBattleHistory } from '../utils/apiUtils.js';
import {
  calculateHourlyAverages,
  HOURS_PER_DAY,
} from '../utils/timeSlotUtils.js';

/**
 * 時間帯傾向グラフの描画寸法および余白設定定数
 */
const CHART_DIMENSIONS = Object.freeze({
  svgWidth: 700,
  svgHeight: 340,
  paddingLeft: 55,
  paddingRight: 25,
  paddingTop: 30,
  paddingBottom: 45,
  chartWidth: 700 - 55 - 25, // 620
  chartHeight: 340 - 30 - 45, // 265
  ySteps: 5, // 縦軸目盛り分割数
});

/**
 * オンライン対戦 - クイックマッチ時間帯傾向画面コンポーネント
 * ピーク時間帯と24時間のマッチング割合折れ線グラフを表示します。
 * @returns {import('react').ReactElement} 時間帯傾向画面
 */
export default function OnlineQuickTimeSlotScreen() {
  const [battles, setBattles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  /**
   * サーバーから対人履歴を取得する非同期ハンドラ
   * 最新のリクエストのみを反映し、古いレスポンスによる上書きやアンマウント後の状態更新を防ぎます。
   * @returns {Promise<void>}
   */
  const loadData = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQuickBattleHistory();
      if (requestIdRef.current !== currentRequestId) {
        return;
      }
      setBattles(data);
    } catch (err) {
      if (requestIdRef.current !== currentRequestId) {
        return;
      }
      console.error('Failed to load quick battle history:', err);
      setError('データの読み込みに失敗しました。');
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      // アンマウント時にリクエストIDを進めて、進行中のレスポンス反映を破棄
      requestIdRef.current += 1;
    };
  }, [loadData]);

  // 集計データの計算
  const stats = useMemo(() => {
    return calculateHourlyAverages(battles);
  }, [battles]);

  // 縦軸の最大値（%）の決定（最低5%、5%刻みで切り上げ）
  const yMax = Math.max(5, Math.ceil((stats.peakPercentage || 5) / 5) * 5);

  /**
   * 指定した時間帯のSVG内X座標を算出します。
   * @param {number} hour - 時間帯 (0〜23)
   * @returns {number} SVG内X座標
   */
  const getX = (hour) => {
    return (
      CHART_DIMENSIONS.paddingLeft +
      (hour / (HOURS_PER_DAY - 1)) * CHART_DIMENSIONS.chartWidth
    );
  };

  /**
   * 指定したパーセンテージのSVG内Y座標を算出します。
   * @param {number} percentage - 割合(%)
   * @returns {number} SVG内Y座標
   */
  const getY = (percentage) => {
    const clamped = Math.max(0, Math.min(percentage, yMax));
    return (
      CHART_DIMENSIONS.paddingTop +
      CHART_DIMENSIONS.chartHeight -
      (clamped / yMax) * CHART_DIMENSIONS.chartHeight
    );
  };

  // 折れ線パスおよびエリア（塗りつぶし）パスの構築
  const points = stats.percentages.map((pct, h) => `${getX(h)},${getY(pct)}`);
  const linePointsString = points.join(' ');
  const areaBottomY =
    CHART_DIMENSIONS.paddingTop + CHART_DIMENSIONS.chartHeight;
  const areaPointsString = `${getX(0)},${areaBottomY} ${linePointsString} ${getX(HOURS_PER_DAY - 1)},${areaBottomY}`;

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
              viewBox={`0 0 ${CHART_DIMENSIONS.svgWidth} ${CHART_DIMENSIONS.svgHeight}`}
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
              {Array.from({ length: CHART_DIMENSIONS.ySteps + 1 }).map(
                (_, i) => {
                  const val = (yMax / CHART_DIMENSIONS.ySteps) * i;
                  const y = getY(val);
                  return (
                    <g key={`grid-y-${i}`}>
                      <line
                        x1={CHART_DIMENSIONS.paddingLeft}
                        y1={y}
                        x2={
                          CHART_DIMENSIONS.paddingLeft +
                          CHART_DIMENSIONS.chartWidth
                        }
                        y2={y}
                        stroke="#1e293b"
                        strokeWidth="1"
                      />
                      <text
                        x={CHART_DIMENSIONS.paddingLeft - 8}
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
                }
              )}

              {/* 垂直グリッド線 & 横軸ラベル（24時間） */}
              {Array.from({ length: HOURS_PER_DAY }).map((_, h) => {
                const x = getX(h);
                // ラベルは 0時, 3時, 6時, 9時, 12時, 15時, 18時, 21時, 23時
                const showLabel = h % 3 === 0 || h === HOURS_PER_DAY - 1;
                return (
                  <g key={`grid-x-${h}`}>
                    {showLabel && (
                      <line
                        x1={x}
                        y1={CHART_DIMENSIONS.paddingTop}
                        x2={x}
                        y2={
                          CHART_DIMENSIONS.paddingTop +
                          CHART_DIMENSIONS.chartHeight
                        }
                        stroke="#1e293b"
                        strokeWidth="1"
                        strokeDasharray={
                          h === 0 || h === HOURS_PER_DAY - 1 ? 'none' : '2 2'
                        }
                      />
                    )}
                    {/* 横軸下部の目盛り線（ティック） */}
                    <line
                      x1={x}
                      y1={
                        CHART_DIMENSIONS.paddingTop +
                        CHART_DIMENSIONS.chartHeight
                      }
                      x2={x}
                      y2={
                        CHART_DIMENSIONS.paddingTop +
                        CHART_DIMENSIONS.chartHeight +
                        (showLabel ? 5 : 3)
                      }
                      stroke="#475569"
                      strokeWidth="1"
                    />
                    {showLabel && (
                      <text
                        x={x}
                        y={
                          CHART_DIMENSIONS.paddingTop +
                          CHART_DIMENSIONS.chartHeight +
                          20
                        }
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

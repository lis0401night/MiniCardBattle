/**
 * シャインチケット交換モーダルコンポーネント
 *
 * 共通交換所において、共通ポイントを消費してシャインチケットを1枚〜複数枚まとめて交換できる専用モーダルUI。
 * ポイント変換や拡張パックの詳細モーダルと統一された枠内説明デザインを提供し、数量増減コントローラーと残高プレビューを備えます。
 */

import { useState } from 'react';
import { getShineTicketsCount, playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * シャインチケット交換モーダルコンポーネント。
 *
 * @param {Object} props
 * @param {number} props.commonPoints - 現在の所持共通ポイント
 * @param {number} [props.costPerTicket=10] - チケット1枚あたりの必要ポイント
 * @param {Function} props.onConfirm - 交換確定時コールバック (count: number) => void
 * @param {Function} props.onClose - モーダル終了時コールバック () => void
 * @returns {JSX.Element} シャインチケット交換モーダル要素
 */
export default function ShineTicketExchangeModal({
  commonPoints = 0,
  costPerTicket = 10,
  onConfirm,
  onClose,
}) {
  const maxAffordable = Math.floor(commonPoints / costPerTicket);
  const [count, setCount] = useState(() => (maxAffordable > 0 ? 1 : 1));

  const totalCost = count * costPerTicket;
  const canAfford = commonPoints >= totalCost && count > 0;
  const remainingPoints = Math.max(0, commonPoints - totalCost);
  const ownedTickets = getShineTicketsCount();

  /**
   * 数量を相対増減させるハンドラ
   *
   * @param {number} delta - 増減量
   */
  const handleAdjustCount = (delta) => {
    playSound(SOUNDS?.seClick);
    setCount((prev) => {
      const next = prev + delta;
      const upper = Math.max(1, maxAffordable);
      return Math.max(1, Math.min(upper, next));
    });
  };

  /**
   * 所持ポイントから交換可能な最大枚数を設定するハンドラ
   */
  const handleSetMax = () => {
    playSound(SOUNDS?.seClick);
    setCount(Math.max(1, maxAffordable));
  };

  /**
   * 交換実行ハンドラ
   */
  const handleExecute = () => {
    if (!canAfford) return;
    playSound(SOUNDS?.seClick);
    onConfirm?.(count);
  };

  /**
   * モーダルを閉じるハンドラ（SEクリック音を再生）
   * @returns {void}
   */
  const handleClose = () => {
    playSound(SOUNDS?.seClick);
    onClose?.();
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 4200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={handleClose}
    >
      <div
        className="skill-modal-box modal-pop-animation"
        style={{
          width: '95%',
          maxWidth: '380px',
          maxHeight: '90dvh',
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: '1px solid #eab308',
          borderRadius: '12px',
          padding: '16px',
          boxShadow:
            '0 10px 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(234, 179, 8, 0.2)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div
          style={{
            borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
            paddingBottom: '8px',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '1.2rem',
              color: '#facc15',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>🌟</span> シャインチケット交換
          </h3>
          <div
            style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              marginTop: '4px',
            }}
          >
            共通ポイントを消費してチケットを獲得します
          </div>
        </div>

        {/* パックとデザイン統一された枠内説明 */}
        <div
          style={{
            fontSize: '0.85rem',
            color: '#cbd5e1',
            lineHeight: '1.5',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            whiteSpace: 'pre-wrap',
          }}
        >
          カード一覧画面またはデッキ編集画面から、カードをシャイン化できる専用チケットです。
          <br />
          シャイン化後はいつでも🌟ボタンでON/OFFを自由に切り替えることができます。
        </div>

        {/* 所持・レート情報パネル */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '0.8rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#94a3b8' }}>所持共通ポイント</span>
            <span style={{ fontWeight: 'bold', color: '#facc15' }}>
              {commonPoints.toLocaleString()} Pt
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#94a3b8' }}>現在所持チケット数</span>
            <span style={{ fontWeight: 'bold', color: '#ffffff' }}>
              {ownedTickets.toLocaleString()} 枚
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px dashed rgba(148, 163, 184, 0.2)',
              paddingTop: '6px',
            }}
          >
            <span style={{ color: '#94a3b8' }}>交換レート</span>
            <span style={{ color: '#38bdf8' }}>1枚 ＝ {costPerTicket} Pt</span>
          </div>
        </div>

        {/* 数量セレクター */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: '#cbd5e1',
              fontWeight: 'bold',
            }}
          >
            交換枚数指定
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="btn"
                disabled={count <= 1}
                onClick={() => handleAdjustCount(-10)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  margin: 0,
                  background: count <= 1 ? '#334155' : '#475569',
                  color: count <= 1 ? '#64748b' : '#ffffff',
                  borderRadius: '4px',
                  border: 'none',
                }}
              >
                -10
              </button>
              <button
                className="btn"
                disabled={count <= 1}
                onClick={() => handleAdjustCount(-1)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  margin: 0,
                  background: count <= 1 ? '#334155' : '#475569',
                  color: count <= 1 ? '#64748b' : '#ffffff',
                  borderRadius: '4px',
                  border: 'none',
                }}
              >
                -1
              </button>
            </div>

            <div
              style={{
                fontSize: '1.2rem',
                fontWeight: 'bold',
                color: '#facc15',
                minWidth: '50px',
                textAlign: 'center',
              }}
            >
              {count} 枚
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="btn"
                disabled={maxAffordable > 0 && count >= maxAffordable}
                onClick={() => handleAdjustCount(1)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  margin: 0,
                  background:
                    maxAffordable > 0 && count >= maxAffordable
                      ? '#334155'
                      : '#475569',
                  color:
                    maxAffordable > 0 && count >= maxAffordable
                      ? '#64748b'
                      : '#ffffff',
                  borderRadius: '4px',
                  border: 'none',
                }}
              >
                +1
              </button>
              <button
                className="btn"
                disabled={maxAffordable > 0 && count >= maxAffordable}
                onClick={() => handleAdjustCount(10)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  margin: 0,
                  background:
                    maxAffordable > 0 && count >= maxAffordable
                      ? '#334155'
                      : '#475569',
                  color:
                    maxAffordable > 0 && count >= maxAffordable
                      ? '#64748b'
                      : '#ffffff',
                  borderRadius: '4px',
                  border: 'none',
                }}
              >
                +10
              </button>
              <button
                className="btn"
                disabled={maxAffordable <= 0 || count >= maxAffordable}
                onClick={handleSetMax}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  margin: 0,
                  background:
                    maxAffordable <= 0 || count >= maxAffordable
                      ? '#334155'
                      : '#eab308',
                  color:
                    maxAffordable <= 0 || count >= maxAffordable
                      ? '#64748b'
                      : '#000000',
                  borderRadius: '4px',
                  border: 'none',
                }}
              >
                最大
              </button>
            </div>
          </div>
        </div>

        {/* コストサマリーパネル */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '0.8rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#94a3b8' }}>必要共通ポイント</span>
            <span
              style={{
                fontWeight: 'bold',
                color: canAfford ? '#facc15' : '#ef4444',
                fontSize: '0.95rem',
              }}
            >
              {totalCost.toLocaleString()} Pt
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#94a3b8' }}>交換後ポイント残高</span>
            <span
              style={{
                color: canAfford ? '#cbd5e1' : '#ef4444',
                fontWeight: canAfford ? 'normal' : 'bold',
              }}
            >
              {canAfford
                ? `${remainingPoints.toLocaleString()} Pt`
                : 'ポイント不足'}
            </span>
          </div>
        </div>

        {/* アクションボタン */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '4px',
          }}
        >
          <button
            className="btn"
            style={{
              flex: 1,
              minHeight: '40px',
              padding: '8px',
              background: '#475569',
              margin: 0,
              fontSize: '0.9rem',
            }}
            onClick={handleClose}
          >
            キャンセル
          </button>
          <button
            className="btn"
            disabled={!canAfford}
            style={{
              flex: 1.5,
              minHeight: '40px',
              padding: '8px',
              background: canAfford
                ? 'linear-gradient(45deg, #eab308, #ca8a04)'
                : '#334155',
              color: canAfford ? '#000000' : '#64748b',
              cursor: canAfford ? 'pointer' : 'not-allowed',
              opacity: canAfford ? 1 : 0.5,
              margin: 0,
              fontSize: '0.9rem',
              fontWeight: 'bold',
              boxShadow: canAfford
                ? '0 4px 12px rgba(234, 179, 8, 0.4)'
                : 'none',
            }}
            onClick={handleExecute}
          >
            {canAfford ? `交換する (${totalCost} Pt)` : 'ポイント不足'}
          </button>
        </div>
      </div>
    </div>
  );
}

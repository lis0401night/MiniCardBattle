/**
 * 交換個数確認モーダルコンポーネント
 *
 * 交換所でのアイテム交換ボタン押下時に表示される個数確認モーダル。
 * プレイヤーの所持ポイントや各アイテムの所持上限（カードは4-所持数、パックは全封入カードの未所持枠、
 * スキン・プレミアム等は1個限定）に基づき、左右のボタンで交換個数を決定します。
 */

import { useCallback, useState } from 'react';
import { MAX_CARD_COPIES } from '../../utils/constants/config.js';
import {
  calculateExchangeMaxCount,
  getPackById,
  PACK_VOL01_CARD_IDS,
} from '../../utils/constants/packs.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * 交換個数確認モーダル。
 *
 * @param {Object} props
 * @param {Object} props.item - 交換対象アイテムオブジェクト
 * @param {number} props.currentPoints - プレイヤーの現在の所持ポイント
 * @param {Record<string, number>} [props.inventory={}] - プレイヤーの所持カードインベントリ
 * @param {Function} props.onConfirm - 交換確定時コールバック関数 (item, count) => void
 * @param {Function} props.onCancel - キャンセル時コールバック関数 () => void
 * @returns {JSX.Element|null} 個数確認モーダル要素
 */
export default function ExchangeQuantityModal({
  item,
  currentPoints,
  inventory = {},
  onConfirm,
  onCancel,
}) {
  const cost = Number(item?.cost) || 0;
  // アイテム種別は item.type を唯一の判定基準とする（構造からの推測を行わない）
  const itemType = item?.type;
  const isPack = itemType === 'pack';
  const isCard = itemType === 'card';
  const isOneTimeItem =
    itemType === 'skin' ||
    itemType === 'premium' ||
    itemType === 'playmat' ||
    itemType === 'icon';

  // 交換可能な最大個数を計算（ポイントおよびアイテム所持上限を考慮）
  const maxCount = calculateExchangeMaxCount(
    item,
    currentPoints,
    inventory,
    item?.packObj || null
  );

  // 選択個数の初期値（交換可能なら1個、交換上限到達やポイント不足で最大可能数が0なら0として表示）
  const [count, setCount] = useState(() => (maxCount > 0 ? 1 : 0));

  // 現在の所持枚数または未所持枠の取得
  const ownedCount = isCard && item ? Number(inventory[item.id]) || 0 : 0;
  let packMissingCopies = 0;
  if (isPack && item) {
    const pack = getPackById(item.packObj || item.id || item.packId || item);
    const cardIds =
      pack?.cardIds ||
      item.packObj?.cardIds ||
      item.cardIds ||
      PACK_VOL01_CARD_IDS;
    cardIds.forEach((cId) => {
      const o = Number(inventory[cId]) || 0;
      packMissingCopies += Math.max(0, MAX_CARD_COPIES - o);
    });
  }

  /**
   * 個数を減らすハンドラ
   */
  const handleDecrement = useCallback(() => {
    // 1個限定アイテムは無反応
    if (isOneTimeItem || maxCount <= 1) return;
    if (count > 1) {
      playSound(SOUNDS?.seClick);
      setCount((prev) => Math.max(1, prev - 1));
    }
  }, [isOneTimeItem, maxCount, count]);

  /**
   * 個数を増やすハンドラ
   */
  const handleIncrement = useCallback(() => {
    // 1個限定アイテムは無反応
    if (isOneTimeItem || maxCount <= 1) return;
    if (count < maxCount) {
      playSound(SOUNDS?.seClick);
      setCount((prev) => Math.min(maxCount, prev + 1));
    }
  }, [isOneTimeItem, maxCount, count]);

  /**
   * 最大数に設定するハンドラ
   */
  const handleSetMax = useCallback(() => {
    if (isOneTimeItem || maxCount <= 1) return;
    if (count !== maxCount) {
      playSound(SOUNDS?.seClick);
      setCount(maxCount);
    }
  }, [isOneTimeItem, maxCount, count]);

  /**
   * 交換実行ハンドラ
   */
  const handleExecute = useCallback(() => {
    playSound(SOUNDS?.seClick);
    if (typeof onConfirm === 'function') {
      onConfirm(item, count);
    }
  }, [onConfirm, item, count]);

  if (!item) return null;

  // 合計必要ポイントと交換後残りポイントの算出
  const totalCost = cost * count;
  const remainingPoints = currentPoints - totalCost;
  const canAfford =
    currentPoints >= totalCost && count <= maxCount && count > 0;

  // ボタン無効化判定（1個限定アイテム、または現在値が端数の場合）
  const isDecrementDisabled = isOneTimeItem || count <= 1;
  const isIncrementDisabled = isOneTimeItem || count >= maxCount;

  // 表示用タイプラベル
  const typeLabelMap = {
    card: 'カード',
    premium: 'プレミアム',
    playmat: 'プレイマット',
    icon: 'アイコン',
    skin: 'スキン',
    pack: 'パック',
  };
  const typeLabel = item.displayType || typeLabelMap[itemType] || 'アイテム';
  const itemName =
    item.displayName || item.name || item.titleName || 'アイテム';

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 6000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={onCancel}
    >
      <div
        className="skill-modal-box modal-pop-animation"
        style={{
          width: '95%',
          maxWidth: '380px',
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: '1px solid #475569',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルタイトル */}
        <h3
          style={{
            margin: 0,
            fontSize: '1.2rem',
            textAlign: 'center',
            color: '#facc15',
            fontWeight: 'bold',
            borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
            paddingBottom: '10px',
          }}
        >
          交換個数の確認
        </h3>

        {/* 対象アイテム概要表示 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.15)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                marginBottom: '2px',
              }}
            >
              {typeLabel}
            </div>
            <div
              style={{
                fontSize: '1.05rem',
                fontWeight: 'bold',
                color: '#ffffff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {itemName}
            </div>
            {/* 所持状況補足 */}
            <div
              style={{
                fontSize: '0.75rem',
                color: '#cbd5e1',
                marginTop: '4px',
              }}
            >
              {isCard &&
                (ownedCount >= MAX_CARD_COPIES
                  ? `所持上限（${MAX_CARD_COPIES}枚）達成済み`
                  : `現在の所持数: ${ownedCount} / ${MAX_CARD_COPIES}枚`)}
              {isPack &&
                (packMissingCopies <= 0
                  ? '封入カードをすべて最大所持しています'
                  : `未所持カード枠: 計${packMissingCopies}枚`)}
              {isOneTimeItem && '1個限定アイテム'}
            </div>
          </div>
        </div>

        {/* 個数選択コントローラー */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 0',
          }}
        >
          <div
            style={{
              fontSize: '0.85rem',
              color: '#94a3b8',
            }}
          >
            交換個数（最大: {maxCount}個）
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%',
            }}
          >
            {/* マイナスボタン */}
            <button
              className="btn"
              disabled={isDecrementDisabled}
              onClick={handleDecrement}
              style={{
                width: '46px',
                height: '46px',
                fontSize: '1.4rem',
                fontWeight: 'bold',
                padding: 0,
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isDecrementDisabled ? '#334155' : '#475569',
                color: isDecrementDisabled ? '#64748b' : '#ffffff',
                cursor: isDecrementDisabled ? 'not-allowed' : 'pointer',
                opacity: isDecrementDisabled ? 0.5 : 1,
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.15s ease',
              }}
              title="個数を減らす"
            >
              －
            </button>

            {/* 個数表示枠 */}
            <div
              style={{
                minWidth: '80px',
                height: '46px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '2px solid #facc15',
                borderRadius: '8px',
                fontSize: '1.4rem',
                fontWeight: 'bold',
                color: '#facc15',
                padding: '0 16px',
                boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.5)',
              }}
            >
              {count}
            </div>

            {/* プラスボタン */}
            <button
              className="btn"
              disabled={isIncrementDisabled}
              onClick={handleIncrement}
              style={{
                width: '46px',
                height: '46px',
                fontSize: '1.4rem',
                fontWeight: 'bold',
                padding: 0,
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isIncrementDisabled ? '#334155' : '#475569',
                color: isIncrementDisabled ? '#64748b' : '#ffffff',
                cursor: isIncrementDisabled ? 'not-allowed' : 'pointer',
                opacity: isIncrementDisabled ? 0.5 : 1,
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.15s ease',
              }}
              title="個数を増やす"
            >
              ＋
            </button>

            {/* MAXボタン（複数個交換可能な場合のみ活性） */}
            {!isOneTimeItem && maxCount > 1 && (
              <button
                className="btn"
                onClick={handleSetMax}
                disabled={count === maxCount}
                style={{
                  height: '46px',
                  padding: '0 12px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  margin: 0,
                  background: count === maxCount ? '#334155' : '#f59e0b',
                  color: count === maxCount ? '#64748b' : '#000000',
                  opacity: count === maxCount ? 0.5 : 1,
                  cursor: count === maxCount ? 'not-allowed' : 'pointer',
                  borderRadius: '8px',
                }}
              >
                MAX
              </button>
            )}
          </div>
        </div>

        {/* ポイント計算サマリー */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '0.85rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#94a3b8',
            }}
          >
            <span>単価 × 個数</span>
            <span>
              {cost} Pt × {count}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 'bold',
              color: '#facc15',
              fontSize: '0.95rem',
              borderTop: '1px solid rgba(148, 163, 184, 0.1)',
              paddingTop: '6px',
            }}
          >
            <span>消費ポイント合計</span>
            <span>{totalCost} Pt</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#cbd5e1',
              marginTop: '2px',
            }}
          >
            <span>交換後所持ポイント</span>
            <span
              style={{ color: remainingPoints >= 0 ? '#4ade80' : '#ef4444' }}
            >
              {remainingPoints} Pt
            </span>
          </div>
        </div>

        {/* アクションボタン */}
        <div
          style={{
            display: 'flex',
            gap: '10px',
            marginTop: '4px',
          }}
        >
          <button
            className="btn"
            style={{
              flex: 1,
              minHeight: '42px',
              padding: '8px',
              background: '#475569',
              margin: 0,
              fontSize: '0.95rem',
            }}
            onClick={onCancel}
          >
            キャンセル
          </button>
          <button
            className="btn"
            disabled={!canAfford}
            style={{
              flex: 1.3,
              minHeight: '42px',
              padding: '8px',
              background: canAfford
                ? 'linear-gradient(45deg, #f97316, #ea580c)'
                : '#334155',
              color: canAfford ? '#ffffff' : '#64748b',
              cursor: canAfford ? 'pointer' : 'not-allowed',
              opacity: canAfford ? 1 : 0.5,
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 'bold',
              boxShadow: canAfford
                ? '0 4px 12px rgba(249, 115, 22, 0.4)'
                : 'none',
            }}
            onClick={handleExecute}
          >
            {canAfford
              ? `交換する (${count}個)`
              : maxCount <= 0
                ? isCard && ownedCount >= MAX_CARD_COPIES
                  ? '所持上限達成'
                  : isPack && packMissingCopies <= 0
                    ? '所持上限達成'
                    : 'ポイント不足'
                : '交換不可'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { ExchangeQuantityModal };

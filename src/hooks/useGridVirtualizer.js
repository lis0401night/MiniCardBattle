import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

// グリッドレイアウト用の共通デフォルト定数
export const DEFAULT_GRID_COLS = 3;
export const DEFAULT_GRID_GAP_PX = 15;
export const DEFAULT_GRID_PADDING_PX = 5;
export const DEFAULT_CARD_ASPECT_RATIO = 1.5;

/**
 * アイテム一覧を行単位で仮想化（Virtual Scroll）する共通カスタムフック。
 * コンテナ幅の動的測定、列分割、行高の事前計算、TanStack Virtual のセットアップと同期再計算を一元管理する。
 *
 * @param {Object} options
 * @param {Array<*>} options.items - 表示対象の全アイテム配列
 * @param {number} [options.cols=3] - グリッドの列数
 * @param {number} [options.gap=15] - アイテム間の隙間（px）
 * @param {number} [options.padding=5] - コンテナ左右のパディング（px）
 * @param {number} [options.aspectRatio=1.5] - アイテムのアスペクト比（高さ / 幅）
 * @param {number} [options.overscan=6] - 仮想スクロールの事前描画バッファ行数
 * @param {number} [options.defaultFallbackHeight=200] - 幅未取得時のフォールバック行高（px）
 * @returns {Object} 仮想スクロール制御オブジェクト
 * @returns {import('react').RefObject<HTMLDivElement>} return.listContainerRef - スクロールコンテナ要素の参照
 * @returns {import('@tanstack/react-virtual').Virtualizer} return.rowVirtualizer - TanStack Virtual インスタンス
 * @returns {Array<Array<*>>} return.itemRows - 列数ごとに分割されたアイテム行配列
 * @returns {number} return.containerWidth - 監視中のコンテナ幅（px）
 * @returns {number} return.estimatedRowHeight - 事前計算された1行の高さ（px）
 * @returns {number} return.gridCols - 適用中の列数
 * @returns {number} return.gridGap - 適用中のギャップ（px）
 */
export function useGridVirtualizer({
  items = [],
  cols = DEFAULT_GRID_COLS,
  gap = DEFAULT_GRID_GAP_PX,
  padding = DEFAULT_GRID_PADDING_PX,
  aspectRatio = DEFAULT_CARD_ASPECT_RATIO,
  overscan = 6,
  defaultFallbackHeight = 200,
}) {
  const listContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(() => {
    if (typeof window === 'undefined') return 400;
    return Math.min(Math.round(window.innerWidth * 0.95), 440);
  });

  // コンテナ要素のリサイズ監視（クライアント領域幅の変化を即座に検知）
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return undefined;
    const updateSize = () => {
      const width = el.clientWidth;
      setContainerWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const safeCols = Math.max(1, cols);

  // アイテム配列を指定列数ごとに行配列へ分割
  const itemRows = useMemo(() => {
    const rows = [];
    const safeItems = items || [];
    for (let i = 0; i < safeItems.length; i += safeCols) {
      rows.push(safeItems.slice(i, i + safeCols));
    }
    return rows;
  }, [items, safeCols]);

  // 列数とコンテナ幅に応じた正確な1行の高さを事前計算（アスペクト比 1:1.5、gapはuseVirtualizerが管理）
  const estimatedRowHeight = useMemo(() => {
    const innerWidth = Math.max(0, containerWidth - padding * 2);
    const cardWidthPx = Math.max(
      0,
      (innerWidth - gap * (safeCols - 1)) / safeCols
    );
    return cardWidthPx > 0 ? cardWidthPx * aspectRatio : defaultFallbackHeight;
  }, [
    containerWidth,
    padding,
    gap,
    safeCols,
    aspectRatio,
    defaultFallbackHeight,
  ]);

  // @tanstack/react-virtual による行単位仮想化
  const rowVirtualizer = useVirtualizer({
    count: itemRows.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    gap: gap,
    overscan: overscan,
  });

  // 初回マウント時および幅・列数・ギャップ・推定高さ変更時に仮想スクロールキャッシュを同期再計算（チラつき防止）
  useLayoutEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, containerWidth, safeCols, gap, estimatedRowHeight]);

  return {
    listContainerRef,
    rowVirtualizer,
    itemRows,
    containerWidth,
    estimatedRowHeight,
    gridCols: safeCols,
    gridGap: gap,
  };
}

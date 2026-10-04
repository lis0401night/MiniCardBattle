import React, { useLayoutEffect, useRef } from 'react';

/**
 * 全カード共通で完全に同一タイミングで光彩を走らせるシャインオーバーレイコンポーネント。
 *
 * DOMマウント直後の `useLayoutEffect` 内で `performance.now()` から6秒周期に対する
 * 負の遅延時間（animationDelay）を算出してDOM要素に直接適用することで、
 * レンダー純粋性（react-hooks/purity）を保ちつつ、どのタイミングでカードが描画されても
 * 画面上のすべてのカードが同一のタイムライン・位相で完全に同期して光彩を放つ。
 *
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} [props.className] - 追加のCSSクラス名
 * @param {React.CSSProperties} [props.style] - 追加のインラインスタイル
 * @returns {React.ReactElement} シャイン加工オーバーレイ要素
 */
export default function CardShineOverlay({ className = '', style = {} }) {
  const overlayRef = useRef(null);

  useLayoutEffect(() => {
    if (!overlayRef.current) return;
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const offset = (now / 1000) % 6;
    overlayRef.current.style.animationDelay = `-${offset.toFixed(3)}s`;
  }, []);

  return (
    <div
      ref={overlayRef}
      className={`card-shine-overlay ${className}`.trim()}
      style={style}
    />
  );
}

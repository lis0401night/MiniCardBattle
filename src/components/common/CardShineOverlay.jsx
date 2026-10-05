import React, { useLayoutEffect, useRef } from 'react';

/**
 * 全カード共通で完全に同一タイミングで同期して輝くシャインオーバーレイコンポーネント。
 *
 * 枠の改造を行わず、カード本来のフレームデザインを保ったまま、
 * 上品なクリスタル光線スイープと繊細な幾何学ダイヤモンドファセット（ステンドグラス風）
 * が光の通過に合わせて上品に走る洗練されたエフェクトを提供。
 *
 * DOMマウント直後の `useLayoutEffect` 内で `performance.now()` から4秒周期に対する
 * 負の遅延時間（animationDelay）を算出してCSSカスタムプロパティ（--shine-delay）としてDOM要素に直接適用する。
 * レンダー純粋性（react-hooks/purity）を保ちつつ、どのタイミングでカードが描画されても
 * 画面上のすべてのカードが同一のタイムライン・位相で完全に同期して美しく輝く。
 *
 * レイヤー構造（2層）:
 * 1. .card-shine-glass-facets: 60度等角幾何学（アイソメトリック・ダイヤモンド）ファセット（光線通過時のみ上品に浮き彫り）
 * 2. .card-shine-prism-sweep: 澄んだハイライト芯と淡いステンドグラス偏光を持つクリスタル光線スイープ
 *
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} [props.className] - 追加のCSSクラス名
 * @param {React.CSSProperties} [props.style] - 追加のインラインスタイル
 * @returns {React.ReactElement} 洗練されたシャイン加工オーバーレイ要素
 */
export default function CardShineOverlay({ className = '', style = {} }) {
  const overlayRef = useRef(null);

  useLayoutEffect(() => {
    if (!overlayRef.current) return;
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const offset = (now / 1000) % 4;
    overlayRef.current.style.setProperty(
      '--shine-delay',
      `-${offset.toFixed(3)}s`
    );
  }, []);

  return (
    <div
      ref={overlayRef}
      className={`card-shine-overlay ${className}`.trim()}
      style={style}
    >
      {/* レイヤー1: 繊細なステンドグラス・幾何学プリズムファセット（光線通過時のみ上品に浮き彫り） */}
      <div className="card-shine-glass-facets" />
      {/* レイヤー2: 澄んだハイライト芯と淡いステンドグラス偏光を持つクリスタル光線スイープ */}
      <div className="card-shine-prism-sweep" />
    </div>
  );
}

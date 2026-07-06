import React from 'react';
import BackButton from '../BackButton.jsx';
import { getVersionedBackgroundStyle } from '../../utils/constants/config.js';

/**
 * カード一覧・交換所専用のコンパクトレイアウトコンポーネント
 * 以前の個別画面のレイアウト（余白・文字サイズ）と100%同一のものを再現し、共通化します。
 *
 * @param {string} id - スクリーン用のID
 * @param {string} [className] - 追加のクラス名
 * @param {string} [backgroundImage] - 背景画像名
 * @param {string} title - 画面タイトル
 * @param {string} [titleColor='#facc15'] - タイトルの文字色
 * @param {boolean} [titleGlow=false] - タイトルに光彩を当てるか
 * @param {function} [onTitleClick] - タイトルクリック時のハンドラ（隠しデバッグ起動用）
 * @param {boolean} [showBackButton=true] - 戻るボタンを表示するかどうか
 * @param {function} [onBackClick] - 戻るボタンクリック時のカスタムハンドラ
 * @param {string} [backTo] - BackButtonのto属性（遷移先画面ID）
 * @param {React.ReactNode} children - 画面中央のコンテンツ
 */
export default function CompactScreenLayout({
  id,
  className = '',
  backgroundImage,
  title,
  titleColor = '#facc15',
  titleGlow = false,
  onTitleClick,
  showBackButton = true,
  onBackClick,
  backTo,
  children,
}) {
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 0',
    overflowY: 'auto',
    ...getVersionedBackgroundStyle(backgroundImage, 0.85, 0.95),
  };

  const titleStyle = {
    color: titleColor,
    margin: '0 0 5px 0', // 上部余白なし、下部5pxで極限までコンパクトに
    fontSize: '1.2rem', // 今までの美しい交換所のタイトルサイズ（1.2rem）に復元・同期
    cursor: onTitleClick ? 'pointer' : 'default',
    userSelect: 'none',
    textAlign: 'center',
    ...(titleGlow && { textShadow: `0 0 15px ${titleColor}99` }),
  };

  return (
    <div
      id={id}
      className={`screen active ${className}`}
      style={containerStyle}
    >
      <h2 onClick={onTitleClick} style={titleStyle}>
        {title}
      </h2>
      {children}
      {showBackButton && (
        <BackButton
          onClick={onBackClick}
          to={backTo}
          style={{ marginTop: '15px' }} // 以前と同じ上部マージン15pxのみ
        />
      )}
    </div>
  );
}

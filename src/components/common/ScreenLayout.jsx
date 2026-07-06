import React from 'react';
import BackButton from '../BackButton.jsx';
import { getVersionedBackgroundStyle } from '../../utils/constants/config.js';

/**
 * 共通レイアウトページコンポーネント
 *
 * @param {string} id - スクリーン用のID
 * @param {string} [className] - 追加のクラス名
 * @param {string} [backgroundImage] - 背景画像名（例: 'background_select.png'）またはグラデーション付きスタイル
 * @param {string} title - 画面タイトル
 * @param {string} [titleColor='#facc15'] - タイトルの文字色
 * @param {boolean} [titleGlow=false] - タイトルに光彩（シャドウ）を当てるか
 * @param {function} [onTitleClick] - タイトルクリック時のハンドラ（隠し機能用）
 * @param {boolean} [showBackButton=true] - 戻るボタンを表示するかどうか
 * @param {function} [onBackClick] - 戻るボタンクリック時のハンドラ
 * @param {string} [backTo] - BackButtonのto属性に渡す画面ID
 * @param {boolean} [backHasBorder=false] - 戻るボタンの上にボーダー（borderTop）を引くか
 * @param {React.ReactNode} children - 画面中央のコンテンツ
 */
export default function ScreenLayout({
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
  backHasBorder = false,
  children,
}) {
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 0',
    overflowY: 'auto',
    ...getVersionedBackgroundStyle(backgroundImage, 0.7, 0.9),
  };

  const titleStyle = {
    color: titleColor,
    margin: '20px 0',
    cursor: onTitleClick ? 'pointer' : 'default',
    userSelect: 'none',
    textAlign: 'center',
    ...(titleGlow && { textShadow: `0 0 15px ${titleColor}99` }),
  };

  const footerStyle = {
    marginTop: backHasBorder ? '20px' : '0px',
    paddingTop: backHasBorder ? '20px' : '15px',
    paddingBottom: '20px',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    flexShrink: 0,
    background: 'transparent',
    ...(backHasBorder && { borderTop: '1px solid #334155' }),
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
        <div style={footerStyle}>
          <BackButton onClick={onBackClick} to={backTo} style={{ margin: 0 }} />
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { appendVersionQuery } from '../../utils/constants/config.js';

/**
 * イベントバナー用アイコン画像コンポーネント。
 * 指定されたアイコンの読み込みに失敗した場合、安全にフォールバック用アイコンへ切り替える。
 * また、キャッシュ更新用のバージョンクエリを自動付与する。
 *
 * @param {Object} props
 * @param {string} props.src - 優先して表示するアイコンURL
 * @param {string} [props.fallbackSrc] - 読み込み失敗時に表示する代替アイコンURL
 * @param {string} [props.className='banner-icon'] - CSSクラス名
 * @param {string} [props.alt=''] - alt属性
 * @returns {JSX.Element} アイコン画像要素
 */
export default function EventIcon({
  src,
  fallbackSrc,
  className = 'banner-icon',
  alt = '',
}) {
  const [failedSrc, setFailedSrc] = useState(null);

  // 現在の src が読み込み失敗済みの場合のみフォールバック画像を採用
  const isUsingFallback =
    failedSrc === src && Boolean(fallbackSrc) && fallbackSrc !== src;
  const currentPath = isUsingFallback ? fallbackSrc : src;
  const resolvedSrc = appendVersionQuery(currentPath);

  /**
   * 画像読み込み失敗時のハンドラ。
   * フォールバック画像が存在し、かつまだフォールバック状態でない場合のみ失敗URLを記録する。
   */
  const handleError = () => {
    if (!isUsingFallback && fallbackSrc && src !== fallbackSrc) {
      setFailedSrc(src);
    }
  };

  return (
    <img
      src={resolvedSrc}
      onError={handleError}
      className={className}
      decoding="async"
      loading="lazy"
      alt={alt}
    />
  );
}

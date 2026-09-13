/**
 * 円形の通知バッジコンポーネント（未受取・未読を示す赤丸）
 *
 * アイコンボタンやメニューボタンの右上に配置され、未受取の報酬やデフォルト設定などの
 * ユーザーアクションを促すための視覚的通知バッジを提供します。
 *
 * @param {Object} [props]
 * @param {string} [props.className=''] - 追加のCSSクラス名
 * @param {import('react').CSSProperties} [props.style={}] - 追加のインラインスタイル
 * @returns {import('react').ReactElement} 通知バッジ要素
 */
export default function NotificationBadge({ className = '', style = {} }) {
  return (
    <div
      className={`notification-badge ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}

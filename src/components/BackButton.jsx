import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * 共通戻るボタンコンポーネント
 *
 * 使い方:
 * - <BackButton to="screen-xxx" />
 *     → コンポーネントがクリック音を鳴らし、screen-xxxに遷移する
 * - <BackButton onClick={handler} />
 *     → handlerを実行する（音の再生はハンドラー側の責任）
 *     ※ goToModeSelect, showEventMenu 等のヘルパーは内部でplaySound済みのため、
 *       このモードでは音の二重再生を防止できる
 *
 * @param {string}   to        - 遷移先の画面ID（クリック音を自動再生）
 * @param {Function} onClick   - カスタムクリックハンドラー（音の再生はハンドラー側の責任）
 * @param {string}   label     - ボタンのラベル（デフォルト: '戻る'）
 * @param {Object}   style     - 追加のインラインスタイル
 * @param {string}   className - CSSクラス名（デフォルト: 'btn'）
 * @param {boolean}  disabled  - 無効状態
 */
export default function BackButton({
  to,
  onClick,
  label = '戻る',
  style,
  className,
  disabled,
}) {
  const handleClick = () => {
    if (disabled) return;
    if (onClick) {
      // カスタムハンドラーに音の制御を委ねる
      onClick();
    } else if (to) {
      // 直接遷移の場合はコンポーネントがクリック音を鳴らす
      playSound?.(SOUNDS?.seClick);
      switchScreen(to);
    }
  };

  return (
    <button
      className={className || 'btn'}
      style={{ background: '#475569', ...style }}
      onClick={handleClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

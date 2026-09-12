import IntegratedExchangeScreen from '../components/exchange/IntegratedExchangeScreen.jsx';

/**
 * 高難易度イベント専用のアイテム交換所画面コンポーネント。
 * 統合交換所（IntegratedExchangeScreen）を高難易度モードで起動するラッパーとして動作します。
 *
 * @param {Object} props
 * @param {Function} [props.switchScreen] - 画面遷移コールバック
 * @returns {JSX.Element} 高難易度交換所画面
 */
export default function HighDifficultyExchangeScreen({ switchScreen }) {
  return (
    <IntegratedExchangeScreen
      id="screen-high-difficulty-exchange"
      initialMode="high_difficulty"
      backTo="screen-high-difficulty-menu"
      switchScreen={switchScreen}
    />
  );
}

import IntegratedExchangeScreen from '../components/exchange/IntegratedExchangeScreen.jsx';

/**
 * 運命の邂逅（Fortuneモード）専用のアイテム交換所画面コンポーネント。
 * 統合交換所（IntegratedExchangeScreen）を運命の邂逅モードで起動するラッパーとして動作します。
 *
 * @param {Object} props
 * @param {Function} [props.switchScreen] - 画面遷移コールバック
 * @returns {JSX.Element} 運命交換所画面
 */
export default function FortuneExchangeScreen({ switchScreen }) {
  return (
    <IntegratedExchangeScreen
      id="screen-fortune-exchange"
      initialMode="fortune"
      backTo="screen-fortune-menu"
      switchScreen={switchScreen}
    />
  );
}

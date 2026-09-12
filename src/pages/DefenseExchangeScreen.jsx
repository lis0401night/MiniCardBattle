import IntegratedExchangeScreen from '../components/exchange/IntegratedExchangeScreen.jsx';

/**
 * 防衛戦専用のアイテム交換所画面コンポーネント。
 * 統合交換所（IntegratedExchangeScreen）を防衛戦モードで起動するラッパーとして動作します。
 *
 * @param {Object} props
 * @param {Function} [props.switchScreen] - 画面遷移コールバック
 * @returns {JSX.Element} 防衛戦交換所画面
 */
export default function DefenseExchangeScreen({ switchScreen }) {
  return (
    <IntegratedExchangeScreen
      id="screen-exchange"
      initialMode="defense"
      backTo="screen-defense-menu"
      switchScreen={switchScreen}
    />
  );
}

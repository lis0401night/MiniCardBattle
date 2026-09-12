import IntegratedExchangeScreen from '../components/exchange/IntegratedExchangeScreen.jsx';

/**
 * 試練の宮殿（ダンジョンモード）専用のアイテム交換所画面コンポーネント。
 * 統合交換所（IntegratedExchangeScreen）を試練モードで起動するラッパーとして動作します。
 *
 * @param {Object} props
 * @param {Function} [props.switchScreen] - 画面遷移コールバック
 * @returns {JSX.Element} 試練交換所画面
 */
export default function ChallengeExchangeScreen({ switchScreen }) {
  return (
    <IntegratedExchangeScreen
      id="screen-challenge-exchange"
      initialMode="challenge"
      backTo="screen-dungeon-menu"
      switchScreen={switchScreen}
    />
  );
}

import IntegratedExchangeScreen from '../components/exchange/IntegratedExchangeScreen.jsx';

/**
 * 夢幻の闘技祭（トーナメントモード）専用のアイテム交換所画面コンポーネント。
 * 統合交換所（IntegratedExchangeScreen）をトーナメントモードで起動するラッパーとして動作します。
 *
 * @param {Object} props
 * @param {Function} [props.switchScreen] - 画面遷移コールバック
 * @returns {JSX.Element} トーナメント交換所画面
 */
export default function TournamentExchangeScreen({ switchScreen }) {
  return (
    <IntegratedExchangeScreen
      id="screen-tournament-exchange"
      initialMode="tournament"
      backTo="screen-tournament-menu"
      switchScreen={switchScreen}
    />
  );
}

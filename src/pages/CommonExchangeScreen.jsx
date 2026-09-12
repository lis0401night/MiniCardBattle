import IntegratedExchangeScreen from '../components/exchange/IntegratedExchangeScreen.jsx';

/**
 * 共通アイテム交換所画面コンポーネント。
 * 統合交換所（IntegratedExchangeScreen）を「共通」タブ（common）で直接起動し、
 * 戻るボタンでメインメニュー（screen-mode-select）へ戻る画面。
 *
 * @param {Object} props
 * @param {Function} [props.switchScreen] - 画面遷移コールバック
 * @returns {JSX.Element} 共通交換所画面
 */
export default function CommonExchangeScreen({ switchScreen }) {
  return (
    <IntegratedExchangeScreen
      id="screen-common-exchange"
      initialMode="common"
      backTo="screen-mode-select"
      switchScreen={switchScreen}
    />
  );
}

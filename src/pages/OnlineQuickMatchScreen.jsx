import MenuButton from '../components/common/MenuButton.jsx';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import {
  showOnlineMenu,
  showOnlineQuickRanking,
  showOnlineQuickRules,
  showOnlineQuickTimeSlot,
  startQuickMatchChallenge,
} from '../services/uiMainCore.js';

/**
 * オンライン対戦 - クイックマッチ画面コンポーネント
 * ルール、ランキング、挑戦（デッキ一覧への遷移）、時間帯傾向を提供する。
 * @returns {import('react').ReactElement} クイックマッチ画面
 */
export default function OnlineQuickMatchScreen() {
  /**
   * ルールボタンクリック時のハンドラ
   * クイックマッチのルール画面へ遷移する
   * @returns {void}
   */
  const handleRulesClick = () => {
    showOnlineQuickRules?.();
  };

  /**
   * ランキングボタンクリック時のハンドラ
   * クイックマッチのレートランキング画面へ遷移する
   * @returns {void}
   */
  const handleRankingClick = () => {
    showOnlineQuickRanking?.();
  };

  /**
   * 挑戦ボタンクリック時のハンドラ
   * クイックマッチ挑戦フロー（デッキ選択一覧へ遷移）を開始する
   * @returns {void}
   */
  const handleChallengeClick = () => {
    startQuickMatchChallenge?.();
  };

  /**
   * 時間帯ボタンクリック時のハンドラ
   * クイックマッチの時間帯傾向画面へ遷移する
   * @returns {void}
   */
  const handleTimeSlotClick = () => {
    showOnlineQuickTimeSlot?.();
  };

  return (
    <ScreenLayout
      id="screen-online-quick-match"
      title="クイックマッチ"
      titleColor="#38bdf8"
      titleGlow={true}
      backgroundImage="background_online.webp"
      onBackClick={() => showOnlineMenu?.()}
      showBackButton={true}
      backHasBorder={false}
    >
      <div className="menu-button-container">
        <MenuButton
          label="ルール"
          variant="yellow"
          onClick={handleRulesClick}
        />
        <MenuButton
          label="ランキング"
          variant="blue"
          onClick={handleRankingClick}
        />
        <MenuButton label="挑戦" variant="red" onClick={handleChallengeClick} />
        <MenuButton
          label="時間帯"
          variant="emerald"
          onClick={handleTimeSlotClick}
        />
      </div>
    </ScreenLayout>
  );
}

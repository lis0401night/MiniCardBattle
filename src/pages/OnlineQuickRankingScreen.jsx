/**
 * Mini Card Battle - クイックマッチ レートランキング画面
 *
 * クイックマッチで獲得した「レート」のランキングを表示します。
 * 共通のRankingScreenコンポーネントを使用し、全国のプレイヤーとレートを競います。
 */

import RankingScreen from '../components/common/RankingScreen.jsx';

/**
 * クイックマッチ レートランキング画面コンポーネント
 * @returns {import('react').ReactElement} クイックマッチランキング画面
 */
export default function OnlineQuickRankingScreen() {
  return (
    <RankingScreen
      id="screen-online-quick-ranking"
      backgroundImage="background_online.webp"
      titleColor="#38bdf8"
      backTo="screen-online-quick-match"
      tabs={[
        {
          label: 'レート',
          pointField: 'quick_rating',
          fallbackPointField: 'quick_rating',
          unit: 'Pt',
        },
      ]}
    />
  );
}

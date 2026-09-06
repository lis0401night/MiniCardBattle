import RankingScreen from '../components/common/RankingScreen.jsx';

/**
 * 運命の邂逅ランキング画面コンポーネント
 * @returns {JSX.Element} 運命の邂逅ランキング画面
 */
export default function FortuneRankingScreen() {
  return (
    <RankingScreen
      id="screen-fortune-ranking"
      backgroundImage="background_fortune01.webp"
      titleColor="#f97316"
      backTo="screen-fortune-menu"
      tabs={[
        {
          label: '総運命ポイント',
          pointField: 'fortune_total_points',
          fallbackPointField: 'fortune_points',
          unit: '',
        },
        {
          label: '合計目標値（マキナ）',
          pointField: 'fortune_total_cost_automata',
          unit: '',
        },
        {
          label: '合計目標値（アンジェ）',
          pointField: 'fortune_total_cost_valkyria',
          unit: '',
        },
      ]}
    />
  );
}

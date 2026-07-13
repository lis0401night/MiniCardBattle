import RankingScreen from '../components/common/RankingScreen.jsx';

export default function DefenseRankingScreen() {
  return (
    <RankingScreen
      id="screen-defense-ranking"
      backgroundImage="background_defense.webp"
      titleColor="#10b981"
      backTo="screen-defense-menu"
      tabs={[
        {
          label: '総防衛ポイント',
          pointField: 'total_points',
          fallbackPointField: 'points',
          unit: 'Pt',
        },
        {
          label: '防衛成功数',
          pointField: 'defense_wins',
          fallbackPointField: 'defense_wins',
          unit: '回',
        },
      ]}
    />
  );
}

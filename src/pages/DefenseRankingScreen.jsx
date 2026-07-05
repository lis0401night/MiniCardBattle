import RankingScreen from '../components/common/RankingScreen.jsx';

export default function DefenseRankingScreen() {
  return (
    <RankingScreen
      id="screen-defense-ranking"
      backgroundImage="background_defense.png"
      titleColor="#10b981"
      backTo="screen-defense-menu"
      pointField="total_points"
      fallbackPointField="points"
    />
  );
}

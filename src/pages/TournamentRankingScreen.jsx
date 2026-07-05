import RankingScreen from '../components/common/RankingScreen.jsx';

export default function TournamentRankingScreen() {
  return (
    <RankingScreen
      id="screen-tournament-ranking"
      backgroundImage="background_tournament01.png"
      titleColor="#60a5fa"
      backTo="screen-tournament-menu"
      pointField="tournament_total_points"
      fallbackPointField="tournament_points"
    />
  );
}

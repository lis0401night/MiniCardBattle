import RankingScreen from '../components/common/RankingScreen.jsx';

export default function ChallengeRankingScreen() {
  return (
    <RankingScreen
      id="screen-challenge-ranking"
      backgroundImage="background_challenge.png"
      titleColor="#c084fc"
      backTo="screen-dungeon-menu"
      pointField="challenge_total_points"
      fallbackPointField="challenge_points"
    />
  );
}

import RankingScreen from '../components/common/RankingScreen.jsx';

export default function ChallengeRankingScreen() {
  return (
    <RankingScreen
      id="screen-challenge-ranking"
      backgroundImage="background_challenge.webp"
      titleColor="#c084fc"
      backTo="screen-dungeon-menu"
      tabs={[
        {
          label: '総試練ポイント',
          pointField: 'challenge_total_points',
          fallbackPointField: 'challenge_points',
          unit: 'Pt',
        },
        {
          label: '最高到達階',
          pointField: 'challenge_max_streak',
          fallbackPointField: 'challenge_max_streak',
          unit: '階',
        },
      ]}
    />
  );
}

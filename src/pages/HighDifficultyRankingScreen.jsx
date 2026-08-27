import RankingScreen from '../components/common/RankingScreen.jsx';

/**
 * 高難易度イベントランキング画面コンポーネント。
 * 夢幻の闘技祭と同様に、累計高難易度ポイント（high_difficulty_total_points）でランキングを表示する。
 *
 * @returns {JSX.Element} 高難易度ランキング画面
 */
export default function HighDifficultyRankingScreen() {
  return (
    <RankingScreen
      id="screen-high-difficulty-ranking"
      backgroundImage="background_highdifficulty.webp"
      titleColor="#ef4444"
      backTo="screen-high-difficulty-menu"
      pointField="high_difficulty_total_points"
      fallbackPointField="high_difficulty_points"
    />
  );
}

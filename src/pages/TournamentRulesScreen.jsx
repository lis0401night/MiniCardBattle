import ScreenLayout from '../components/common/ScreenLayout.jsx';

/**
 * 夢幻の闘技祭ルール説明画面
 * 共通コンポーネント ScreenLayout を適用してリファクタリングを完了。
 */
export default function TournamentRulesScreen() {
  return (
    <ScreenLayout
      id="screen-tournament-rules"
      backgroundImage="background_tournament01.webp"
      title="ルール"
      titleColor="#60a5fa"
      titleGlow={true}
      backTo="screen-tournament-menu"
      backHasBorder={false}
    >
      <div className="rule-box">
        <ul>
          <li>最大4回戦、同じデッキで戦うモードです。</li>
          <li>トーナメント形式で、対戦相手は毎回変わります。</li>
          <li>勝利数に応じて、大会ポイントを獲得できます。</li>
          <li
            style={{ color: '#fb7185', marginTop: '10px', listStyle: 'none' }}
          >
            <b>※夢幻の闘技祭のバトルではカードを獲得できません。</b>
          </li>
        </ul>
      </div>
    </ScreenLayout>
  );
}

import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function TournamentRulesScreen() {
  return (
    <div
      id="screen-tournament-rules"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0.95)), url('assets/backgrounds/background_tournament01.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#60a5fa',
          textShadow: '0 0 10px rgba(96, 165, 250, 0.5)',
        }}
      >
        ルール
      </h2>
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
      <button
        className="btn"
        style={{ background: '#475569' }}
        onClick={() => {
          playSound?.(SOUNDS?.seClick);
          switchScreen?.('screen-tournament-menu');
        }}
      >
        戻る
      </button>
    </div>
  );
}

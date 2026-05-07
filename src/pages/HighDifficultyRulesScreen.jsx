import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function HighDifficultyRulesScreen() {
  return (
    <div
      id="screen-high-difficulty-rules"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#ef4444',
          textShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
        }}
      >
        ルール
      </h2>
      <div className="rule-box">
        <ul>
          <li>高難易度は、特別な対戦相手と戦うモードです。</li>
          <li>ここでしか手に入らない限定の報酬を手に入れましょう。</li>
          <li
            style={{ color: '#fb7185', marginTop: '10px', listStyle: 'none' }}
          >
            <b>
              ※遥かに強力な相手のため、ストーリーやフリーバトルでカードを集めてから挑むように注意してください。
            </b>
          </li>
        </ul>
      </div>
      <button
        className="btn"
        style={{ background: '#475569' }}
        onClick={() => {
          playSound?.(SOUNDS?.seClick);
          switchScreen?.('screen-high-difficulty-menu');
        }}
      >
        戻る
      </button>
    </div>
  );
}

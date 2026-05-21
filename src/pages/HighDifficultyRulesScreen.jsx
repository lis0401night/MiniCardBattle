import BackButton from '../components/BackButton.jsx';

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
          margin: '20px 0',
          textAlign: 'center',
        }}
      >
        ルール
      </h2>
      <div className="rule-box">
        <ul>
          <li>特別な対戦相手と戦うモードです。</li>
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
      <div
        style={{
          padding: '15px 0 20px 0',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
        }}
      >
        <BackButton to="screen-high-difficulty-menu" style={{ margin: 0 }} />
      </div>
    </div>
  );
}

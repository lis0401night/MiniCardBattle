import BackButton from '../components/BackButton.jsx';

export default function DefenseRulesScreen() {
  return (
    <div
      id="screen-defense-rules"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_defense.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#10b981',
          textShadow: '0 0 10px rgba(16, 185, 129, 0.5)',
          margin: '20px 0',
          textAlign: 'center',
        }}
      >
        ルール
      </h2>
      <div className="rule-box">
        <ul>
          <li>他のプレイヤーのデッキと戦うモードです。</li>
          <li>
            自分の「防衛デッキ」を登録すると、他のプレイヤーの攻撃対象になります。
          </li>
          <li>防衛に成功すると、防衛ポイントを3獲得できます。</li>
          <li>
            攻撃に成功すると、相手の強さに応じて防衛ポイントを獲得できます。
          </li>
          <li
            style={{ color: '#fb7185', marginTop: '10px', listStyle: 'none' }}
          >
            <b>※防衛戦のバトルではカードを獲得できません。</b>
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
        <BackButton to="screen-defense-menu" style={{ margin: 0 }} />
      </div>
    </div>
  );
}

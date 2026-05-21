import BackButton from '../components/BackButton.jsx';

export default function DungeonRulesScreen() {
  return (
    <div
      id="screen-dungeon-rules"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_challenge.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#c084fc',
          textShadow: '0 0 10px rgba(192, 132, 252, 0.5)',
          margin: '20px 0',
          textAlign: 'center',
        }}
      >
        ルール
      </h2>
      <div className="rule-box">
        <ul>
          <li>次々と現れる敵を倒しながらどこまで進めるかを競うモードです。</li>
          <li>10階層ごとに強力なボスキャラクターが登場します。</li>
          <li>
            バトル終了後、減ったHPは回復せずにそのまま次の戦闘へ持ち越されます。
          </li>
          <li>勝利すると対戦相手のデッキから1枚カードを獲得します。</li>
          <li>
            HPが0になると挑戦終了です。階層に応じて、試練ポイントを獲得できます。
          </li>
          <li
            style={{ color: '#fb7185', marginTop: '10px', listStyle: 'none' }}
          >
            <b>※試練の宮殿のバトルではカードを獲得できません。</b>
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
        <BackButton to="screen-dungeon-menu" style={{ margin: 0 }} />
      </div>
    </div>
  );
}

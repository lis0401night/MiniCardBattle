import { useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function RulesScreen() {
  const [clickCount, setClickCount] = useState(0);

  // 「ルール」タイトルを10回クリックでデバッグバトル画面を起動
  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 10) {
      playSound(SOUNDS?.seClick);
      switchScreen('screen-debug-battle');
      setClickCount(0);
    }
  };

  return (
    <div id="screen-rules" className="screen active">
      <h2
        onClick={handleTitleClick}
        style={{
          color: '#facc15',
          margin: '20px 0',
          cursor: 'pointer',
          userSelect: 'none',
          textAlign: 'center',
        }}
      >
        ルール
      </h2>
      <div className="rule-box">
        <div className="rule-section">
          <div className="rule-category">【デッキ編成】</div>
          <ul>
            <li>デッキに同じカードは4枚まで入れられます。</li>
          </ul>
        </div>
        <div className="rule-section">
          <div className="rule-category">【バトル】</div>
          <ul>
            <li>
              毎ターン、手札から1枚を自分のレーンに召喚します。
              <span style={{ color: '#94a3b8' }}>
                （先攻1ターン目は中央のみ）
              </span>
            </li>
            <li>置き直しの場合、下のカードは破棄されます。</li>
            <li>
              <b>自分のターン開始時</b>に、場のカードが一斉に正面へ<b>攻撃</b>
              します。
            </li>
            <li>
              正面に敵がいれば戦闘となり、お互いにパワー分ダメージを与えます。
            </li>
            <li>正面が空いていれば相手リーダーに直接ダメージ！</li>
            <li>先に相手リーダーのHPを0にすれば勝利です。</li>
            <li>
              山札が0枚になると墓地から補充されますが、ペナルティとして
              <b>体力が半分（切り上げ）になるダメージ</b>を受けます。
            </li>
          </ul>
        </div>
        <div className="rule-section">
          <div className="rule-category">【リーダー能力】</div>
          <ul>
            <li>
              毎ターン「SP」が溜まります。
              <span style={{ color: '#94a3b8' }}>
                （先攻1ターン目は溜まりません）
              </span>
            </li>
            <li>
              SPがMAXになると、カードの配置前に「リーダースキル」ボタンから必殺技を発動できます！
            </li>
          </ul>
        </div>
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
        <BackButton to="screen-beginner-guide" style={{ margin: 0 }} />
      </div>
    </div>
  );
}

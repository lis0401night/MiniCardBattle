import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * ソロルール説明画面
 * useEasterEggカスタムフックによりデバッグモード起動処理をスマートに共通化。
 */
export default function RulesScreen() {
  // 「ルール」タイトルを10回クリックでデバッグバトル画面を起動
  const handleTitleClick = useEasterEgg(() => {
    playSound(SOUNDS?.seClick);
    switchScreen?.('screen-debug-battle');
  });

  return (
    <ScreenLayout
      id="screen-rules"
      title="ルール"
      titleColor="#facc15"
      backgroundImage="background_select.webp"
      onTitleClick={handleTitleClick}
      backTo="screen-beginner-guide"
    >
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
          <div className="rule-category">【リーダースキル】</div>
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
    </ScreenLayout>
  );
}

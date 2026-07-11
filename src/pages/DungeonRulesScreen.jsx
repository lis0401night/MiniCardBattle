import ScreenLayout from '../components/common/ScreenLayout.jsx';

/**
 * 試練の宮殿ルール説明画面
 * 共通コンポーネント ScreenLayout を適用してリファクタリングを完了。
 */
export default function DungeonRulesScreen() {
  return (
    <ScreenLayout
      id="screen-dungeon-rules"
      backgroundImage="background_challenge.webp"
      title="ルール"
      titleColor="#c084fc"
      titleGlow={true}
      backTo="screen-dungeon-menu"
      backHasBorder={false}
    >
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
    </ScreenLayout>
  );
}

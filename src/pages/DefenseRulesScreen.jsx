import ScreenLayout from '../components/common/ScreenLayout.jsx';

/**
 * 防衛戦ルール説明画面
 * 共通コンポーネント ScreenLayout を適用してリファクタリングを完了。
 */
export default function DefenseRulesScreen() {
  return (
    <ScreenLayout
      id="screen-defense-rules"
      backgroundImage="background_defense.png"
      title="ルール"
      titleColor="#10b981"
      titleGlow={true}
      backTo="screen-defense-menu"
      backHasBorder={false}
    >
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
    </ScreenLayout>
  );
}

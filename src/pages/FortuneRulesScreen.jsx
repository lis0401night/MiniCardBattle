import ScreenLayout from '../components/common/ScreenLayout.jsx';

/**
 * 運命の邂逅ルール説明画面
 */
export default function FortuneRulesScreen() {
  return (
    <ScreenLayout
      id="screen-fortune-rules"
      backgroundImage="background_fortune01.webp"
      title="ルール"
      titleColor="#f97316"
      titleGlow={true}
      backTo="screen-fortune-menu"
      backHasBorder={false}
    >
      <div className="rule-box">
        <ul>
          <li>特別な対戦相手と戦うモードです。</li>
          <li>
            様々な制限（特級目標）を有効にして勝利することで、運命ポイントを獲得できます。
          </li>
          <li>
            有効にした「合計目標値」に応じて、限定の報酬を受け取ることができます。
          </li>
          <li
            style={{ color: '#fb7185', marginTop: '10px', listStyle: 'none' }}
          >
            <b>※運命の邂逅のバトルではカードを獲得できません。</b>
          </li>
        </ul>
      </div>
    </ScreenLayout>
  );
}

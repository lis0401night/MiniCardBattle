import ScreenLayout from '../components/common/ScreenLayout.jsx';

/**
 * 高難易度挑戦ルール説明画面
 * 共通コンポーネント ScreenLayout を適用してリファクタリングを完了。
 */
export default function HighDifficultyRulesScreen() {
  return (
    <ScreenLayout
      id="screen-high-difficulty-rules"
      backgroundImage="background_highdifficulty.webp"
      title="ルール"
      titleColor="#ef4444"
      titleGlow={true}
      backTo="screen-high-difficulty-menu"
      backHasBorder={false}
    >
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
    </ScreenLayout>
  );
}

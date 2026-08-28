import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { HIGH_DIFFICULTY_REWARD_POINTS } from '../utils/constants/config.js';

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
          <li>
            勝利することで高難易度ポイントを獲得できます（初回クリア:{' '}
            {HIGH_DIFFICULTY_REWARD_POINTS.FIRST_CLEAR} Pt、2回目以降:{' '}
            {HIGH_DIFFICULTY_REWARD_POINTS.REPEAT_CLEAR} Pt）。
          </li>
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

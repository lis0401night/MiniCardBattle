import { useEffect } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { GameState } from '../state/gameState.js';
import { showOnlineMenu } from '../services/uiMainCore.js';

/**
 * オンライン対戦ルール説明画面
 * 共通コンポーネント ScreenLayout を適用してリファクタリングを完了。
 */
export default function OnlineRulesScreen() {
  useEffect(() => {
    // 画面切り替え時にルールテキストボックスのスクロール位置を最上部に初期化
    const c = document.getElementById('online-rules-container');
    if (c) c.scrollTop = 0;
  }, []);

  const getBackgroundImage = () => {
    if (GameState.gameMode === 'tournament') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_tournament01.png')`;
    }
    return undefined; // デフォルト背景を使用
  };

  return (
    <ScreenLayout
      id="screen-online-rules"
      backgroundImage={getBackgroundImage()}
      title="ルール"
      titleColor="#facc15"
      titleGlow={true}
      onBackClick={() => showOnlineMenu?.()}
      backHasBorder={false}
    >
      <div
        id="online-rules-container"
        className="rule-box"
        style={{ overflowY: 'auto' }}
      >
        <ul>
          <li>他のプレイヤーとリアルタイムで対戦ができるモードです。</li>
          <li>
            オンライン対戦中はお互いの画面が常に同期されます。
            <br />
            通信環境の良い場所でプレイしてください。
          </li>
          <li
            style={{ color: '#fb7185', marginTop: '10px', listStyle: 'none' }}
          >
            <b>※オンライン対戦のバトルではカードを獲得できません。</b>
          </li>
        </ul>
      </div>
    </ScreenLayout>
  );
}

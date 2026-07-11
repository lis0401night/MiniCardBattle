import { useEffect, useRef } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { GameState } from '../state/gameState.js';
import { showOnlineMenu } from '../services/uiMainCore.js';

/**
 * オンライン対戦ルール説明画面
 * 共通コンポーネント ScreenLayout を適用してリファクタリングを完了。
 */
export default function OnlineRulesScreen() {
  const containerRef = useRef(null);

  useEffect(() => {
    // 画面切り替え時にルールテキストボックスのスクロール位置を最上部に初期化
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  const getBackgroundImage = () => {
    if (GameState.gameMode === 'tournament') {
      return 'background_tournament01.webp';
    }
    return 'background_online.webp';
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
        ref={containerRef}
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

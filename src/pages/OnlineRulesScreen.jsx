import { useEffect, useRef } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { showOnlineRoomMatch } from '../services/uiMainCore.js';
import { GameState } from '../state/gameState.js';

/**
 * オンライン対戦 - ルームマッチ ルール説明画面コンポーネント
 * ルーム作成（公開/非公開）、検索、対戦の流れ、制限時間、通信切断復帰ルールなどを説明する。
 * @returns {import('react').ReactElement} ルームマッチルール画面
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
      onBackClick={() => showOnlineRoomMatch?.()}
      backHasBorder={false}
    >
      <div
        ref={containerRef}
        id="online-rules-container"
        className="rule-box"
        style={{ overflowY: 'auto' }}
      >
        <ul>
          <li>
            友達や特定のプレイヤーとルームを作成・検索してリアルタイムに対戦するモードです。
          </li>
          <li>
            誰でも入れる「公開ルーム」と、合言葉で合流する「非公開ルーム」を選択できます。
          </li>
          <li>
            各ターンに60秒の制限時間があり、時間切れになると自動でターンが終了します。
          </li>
          <li>
            通信が切断された場合でも、60秒以内であれば直前の対戦状態から復帰できます。
          </li>
          <li
            style={{ color: '#fb7185', marginTop: '10px', listStyle: 'none' }}
          >
            <b>※ルームマッチのバトルではカードを獲得できません。</b>
          </li>
        </ul>
      </div>
    </ScreenLayout>
  );
}

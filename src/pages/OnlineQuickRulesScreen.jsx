import { useEffect, useRef } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { showOnlineQuickMatch } from '../services/uiMainCore.js';

/**
 * オンライン対戦 - クイックマッチ ルール説明画面コンポーネント
 * クイックマッチの対戦仕様、マッチング、制限時間、通信切断復帰ルールなどを説明する。
 * @returns {import('react').ReactElement} クイックマッチルール画面
 */
export default function OnlineQuickRulesScreen() {
  const containerRef = useRef(null);

  useEffect(() => {
    // 画面切り替え時にルールテキストボックスのスクロール位置を最上部に初期化
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  return (
    <ScreenLayout
      id="screen-online-quick-rules"
      backgroundImage="background_online.webp"
      title="ルール"
      titleColor="#38bdf8"
      titleGlow={true}
      onBackClick={() => showOnlineQuickMatch?.()}
      backHasBorder={false}
    >
      <div
        ref={containerRef}
        id="online-quick-rules-container"
        className="rule-box"
        style={{ overflowY: 'auto' }}
      >
        <ul>
          <li>
            全国の待機プレイヤーと自動でマッチングし、リアルタイムで対戦を行うモードです。
          </li>
          <li>デッキとステージを選択すると、マッチング待機が開始されます。</li>
          <li>
            マッチング待機中に60秒が経過しても対戦相手が見つからない場合、自動的にCPU対戦へ移行します。
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
            <b>※クイックマッチのバトルではカードを獲得できません。</b>
          </li>
        </ul>
      </div>
    </ScreenLayout>
  );
}

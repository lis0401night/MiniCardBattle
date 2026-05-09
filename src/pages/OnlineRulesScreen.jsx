import { useEffect } from 'react';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { showOnlineMenu } from '../hooks/uiMainCore.js';
import { GameState } from '../hooks/gameState.js';

export default function OnlineRulesScreen() {
  useEffect(() => {
    const c = document.getElementById('online-rules-container');
    if (c) c.scrollTop = 0;
  }, []);

  const getBackgroundImage = () => {
    if (GameState.gameMode === 'tournament') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_tournament01.png')`;
    }
    return undefined; // デフォルトはCSSの指定に任せるか親の背景を透かす
  };

  return (
    <div
      id="screen-online-rules"
      className="screen active"
      style={
        getBackgroundImage()
          ? {
              backgroundImage: getBackgroundImage(),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : {}
      }
    >
      <h2
        style={{
          color: '#facc15',
          marginBottom: '15px',
          textShadow: '0 0 10px rgba(250, 204, 21, 0.5)',
        }}
      >
        ルール
      </h2>
      <div className="rule-box">
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
      <button
        className="btn"
        style={{ background: '#475569' }}
        onClick={() => {
          playSound?.(SOUNDS.seClick);
          showOnlineMenu?.();
        }}
      >
        戻る
      </button>
    </div>
  );
}

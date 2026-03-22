import React from 'react';

import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function DefenseRulesScreen() {
  return (
    <div
      id="screen-defense-rules"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('/assets/backgrounds/background_select.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <h2 style={{ color: '#10b981', textShadow: '0 0 10px rgba(16, 185, 129, 0.5)' }}>ルール</h2>
      <div className="rule-box">
        <ul>
          <li>防衛戦は、他のプレイヤーのデッキと戦うモードです。</li>
          <li>自分の「防衛デッキ」を登録すると、他のプレイヤーの攻撃対象になります。</li>
          <li>防衛に成功すると、防衛戦ポイントを3獲得できます。</li>
          <li>攻撃に成功すると、相手の強さに応じて防衛戦ポイントを獲得できます。</li>
          <li style={{ color: '#fb7185', marginTop: '10px', listStyle: 'none' }}>
            <b>※防衛戦のバトルではカードを獲得できません。</b>
          </li>
        </ul>
      </div>
      <button
        className="btn"
        style={{ background: '#475569' }}
        onClick={() => {
          playSound?.(SOUNDS?.seClick);
          switchScreen?.('screen-defense-menu');
        }}
      >
        戻る
      </button>
    </div>
  );
}

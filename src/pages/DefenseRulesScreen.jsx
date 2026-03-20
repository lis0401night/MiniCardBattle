import React from 'react';

import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function DefenseRulesScreen() {
  return (
    <div id="screen-defense-rules" className="screen active">
      <h2 style={{ color: '#10b981' }}>ルール</h2>
      <div className="rule-box">
        <ul>
          <li>自分の「防衛デッキ」を登録すると、他のプレイヤーの攻撃対象になります。</li>
          <li>キャラクター、ステージ、20枚のデッキを登録します。</li>
          <li>防衛に成功すると、防衛戦ポイントを3獲得できます。</li>
          <li>「攻撃開始」は他のプレイヤーの防衛デッキに攻撃を仕掛けます！</li>
          <li>攻撃に成功すると、防衛戦ポイントを相手の強さに応じて獲得できます。</li>
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

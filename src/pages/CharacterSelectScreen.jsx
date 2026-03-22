import React, { useState, useEffect } from 'react';

import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { GameState } from '../hooks/gameState.js';
import { goBackFromSelect, showCharDetail } from '../hooks/uiMainCore.js';

export default function CharacterSelectScreen() {
  const [characters, setCharacters] = useState([]);
  const [title, setTitle] = useState("キャラクター選択");
  const [renderVersion, setRenderVersion] = useState(0);

  useEffect(() => {
    // CHARACTERSはオブジェクト形式
    const charsObj = CHARACTERS || {};
    const charsList = Object.values(charsObj).filter(c => c.id !== 'satan'); // サタンは除外
    setCharacters(charsList);

    const updateTitle = () => {
      if (GameState.appState === 'select_enemy') {
        setTitle('対戦相手');
      } else if (GameState.gameMode === 'defense_register') {
        setTitle('防衛キャラクター選択');
      } else if (GameState.appState === 'select_player' && GameState.gameMode === 'defense_attack') {
        setTitle('自分のキャラクター選択');
      } else {
        setTitle('キャラクター選択');
      }
    };
    
    updateTitle();
    // 画面切り替え時に再評価させるためのフックを追加
    const originalInit = window.initSelectScreenReact;
    window.initSelectScreenReact = updateTitle;
    window.forceUpdateSelectScreen = () => setRenderVersion(v => v + 1);

    return () => {
      window.initSelectScreenReact = originalInit;
      window.forceUpdateSelectScreen = null;
    };
  }, []);

  const handleSelect = (char) => {
    if (showCharDetail) {
       showCharDetail(char.id);
    }
  };

  return (
    <div id="screen-select" className="screen active">
      <h2 id="select-title">{title}</h2>
      
      <div className="select-scroll-area">
        <div className="char-grid" id="char-grid">
          {characters.map(char => {
            const isEnemySelection = GameState.appState === 'select_enemy';
            const bgImage = isEnemySelection ? char.image : getSkinImage(char, GameState.playerSkins[char.id], 'image');
            return (
              <div 
                key={char.id} 
                className="char-card" 
                style={{ backgroundImage: `url('${bgImage}')` }}
                onClick={() => handleSelect(char)}
              >
                <div className="char-name" style={{ color: char.color }}>{char.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className="btn"
        style={{ marginTop: '20px', background: '#475569' }}
        onClick={() => goBackFromSelect?.()}
      >
        戻る
      </button>
    </div>
  );
}

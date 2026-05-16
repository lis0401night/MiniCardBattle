import { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { GameState } from '../hooks/gameState.js';
import { goBackFromSelect, showCharDetail } from '../hooks/uiMainCore.js';
import { achievementData } from '../utils/constants/achievements.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';

export default function CharacterSelectScreen() {
  const [characters, setCharacters] = useState(() => {
    // CHARACTERSはオブジェクト形式
    const charsObj = CHARACTERS || {};

    // 【サタン解放条件】フリーバトルの対戦相手選択画面でのみ、
    // 一度でもストーリーをクリアしていればサタンを対戦相手として表示する。
    // 実績データの storyClears にいずれかのキャラクターの記録があれば解放。
    // プレイヤーキャラクター選択ではサタンは常に非表示。
    const isEnemySelect = GameState.appState === 'select_enemy';
    const hasStoryClear = Object.values(
      achievementData.stats?.storyClears || {}
    ).some((v) => v >= 1);
    return Object.values(charsObj).filter((c) => {
      if (c.id === 'satan') return isEnemySelect && hasStoryClear;
      if (c.id.startsWith('campaign_')) return false;
      return true;
    });
  });

  const [title, setTitle] = useState(() => {
    if (GameState.appState === 'select_enemy') {
      return '対戦相手';
    } else if (GameState.gameMode === 'defense_register') {
      return '防衛キャラクター選択';
    } else if (
      GameState.appState === 'select_player' &&
      GameState.gameMode === 'defense_attack'
    ) {
      return '自分のキャラクター選択';
    } else {
      return 'キャラクター選択';
    }
  });

  const [renderVersion, setRenderVersion] = useState(0);

  useEffect(() => {
    const charsObj = CHARACTERS || {};

    const updateTitle = () => {
      if (GameState.appState === 'select_enemy') {
        setTitle('対戦相手');
      } else if (GameState.gameMode === 'defense_register') {
        setTitle('防衛キャラクター選択');
      } else if (
        GameState.appState === 'select_player' &&
        GameState.gameMode === 'defense_attack'
      ) {
        setTitle('自分のキャラクター選択');
      } else {
        setTitle('キャラクター選択');
      }
    };
    // 画面切り替え時に再評価させるためのフックを追加
    const originalInit = window.initSelectScreenReact;
    window.initSelectScreenReact = () => {
      updateTitle();
      // 画面切り替え時にサタンの表示状態を再評価する
      const newIsEnemySelect = GameState.appState === 'select_enemy';
      const newHasStoryClear = Object.values(
        achievementData.stats?.storyClears || {}
      ).some((v) => v >= 1);
      const newList = Object.values(charsObj).filter((c) => {
        if (c.id === 'satan') return newIsEnemySelect && newHasStoryClear;
        if (c.id.startsWith('campaign_')) return false;
        return true;
      });
      setCharacters(newList);
      setRenderVersion((v) => v + 1);
    };
    window.forceUpdateSelectScreen = () => setRenderVersion((v) => v + 1);

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
  const getBackgroundImage = () => {
    // 新規デッキ作成中はgameModeが'create_deck'になるため、元のモードを参照する
    const mode =
      GameState.gameMode === 'create_deck'
        ? GameState.prevGameModeForCreate || 'free_deck_edit'
        : GameState.gameMode;

    if (mode === 'tournament') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_tournament01.png')`;
    } else if (
      mode === 'event_satan' ||
      (mode?.startsWith('event_') && mode?.endsWith('_high'))
    ) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_highdifficulty.png')`;
    } else if (mode === 'defense_register' || mode === 'defense_attack') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_defense.png')`;
    } else if (mode === 'battle_dungeon') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_challenge.png')`;
    } else if (mode === 'online_deck_edit') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_online.png')`;
    }
    return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_select.png')`;
  };

  return (
    <div
      id="screen-select"
      className="screen active"
      style={{
        backgroundImage: getBackgroundImage(),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2 id="select-title">{title}</h2>

      <div className="select-scroll-area">
        <div className="char-grid" id="char-grid">
          {characters.map((char) => {
            const isEnemySelection = GameState.appState === 'select_enemy';
            const skinIdToUse = isEnemySelection
              ? 'default'
              : GameState.playerSkins?.[char.id] || 'default';
            const bgImage = getSkinImage
              ? getSkinImage(char, skinIdToUse, 'image')
              : char.image;
            return (
              <div
                key={char.id + '_' + renderVersion}
                className="char-card"
                style={{ backgroundImage: `url('${bgImage}')` }}
                onClick={() => handleSelect(char)}
              >
                <div className="char-name" style={{ color: char.color }}>
                  {char.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BackButton
        onClick={() => goBackFromSelect?.()}
        style={{ marginTop: '20px' }}
      />
    </div>
  );
}

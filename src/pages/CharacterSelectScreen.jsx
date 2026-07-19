import { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import { goBackFromSelect, showCharDetail } from '../services/uiMainCore.js';
import { achievementData } from '../utils/constants/achievements.js';
import {
  CHARACTERS,
  getSkinImage,
  BOSS_CHARACTER_IDS,
} from '../utils/constants/characters.js';
import { appendVersionQuery } from '../utils/constants/config.js';

// キャラクターフィルタリングの共通処理 (DRY原則を保ちます)
const getFilteredCharacters = () => {
  const charsObj = CHARACTERS || {};

  // 【サタン・ゼノン・ヴィオラ解放条件】フリーバトルの対戦相手選択画面でのみ、
  // それぞれストーリーモードで撃破（サタンはクリア）していれば対戦相手として表示する。
  // プレイヤーキャラクター選択ではこれらボスキャラクターは常に非表示。
  const isEnemySelect = GameState.appState === 'select_enemy';
  const hasStoryClear = Object.values(
    achievementData.stats?.storyClears || {}
  ).some((v) => v >= 1);
  const isVoidUnlocked = (achievementData.stats?.voidDefeated || 0) >= 1;
  const isSuccubusUnlocked =
    (achievementData.stats?.succubusDefeated || 0) >= 1;
  const isWarlockUnlocked = (achievementData.stats?.warlockDefeated || 0) >= 1;

  return Object.values(charsObj).filter((c) => {
    // if (c.id === 'automata') return false; // マキナはイベント専用のため除外
    if (BOSS_CHARACTER_IDS.includes(c.id)) {
      if (!isEnemySelect) return false;
      if (c.id === 'satan') return hasStoryClear;
      if (c.id === 'void') return isVoidUnlocked;
      if (c.id === 'succubus') return isSuccubusUnlocked;
      if (c.id === 'warlock') return isWarlockUnlocked;
    }
    return true;
  });
};

export default function CharacterSelectScreen() {
  const [characters, setCharacters] = useState(getFilteredCharacters);

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
    const originalForceUpdate = window.forceUpdateSelectScreen;

    window.initSelectScreenReact = () => {
      updateTitle();
      // 画面切り替え時にサタン・ゼノン・ヴィオラの表示状態を再評価する
      setCharacters(getFilteredCharacters());
      setRenderVersion((v) => v + 1);
    };
    window.forceUpdateSelectScreen = () => {
      updateTitle();
      // 【CodeRabbit指摘反映】ボス解放直後などの強制更新時にも、表示キャラクター一覧とタイトルを最新に再評価する
      setCharacters(getFilteredCharacters());
      setRenderVersion((v) => v + 1);
    };

    return () => {
      window.initSelectScreenReact = originalInit;
      window.forceUpdateSelectScreen = originalForceUpdate;
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
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_tournament01.webp')}')`;
    } else if (mode?.startsWith('event_') && mode?.endsWith('_high')) {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_highdifficulty.webp')}')`;
    } else if (mode === 'defense_register' || mode === 'defense_attack') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_defense.webp')}')`;
    } else if (mode === 'battle_dungeon') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_challenge.webp')}')`;
    } else if (mode === 'online_deck_edit') {
      return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_online.webp')}')`;
    }
    return `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_select.webp')}')`;
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

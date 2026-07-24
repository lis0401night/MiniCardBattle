import { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { fetchPlayerDecks } from '../utils/apiUtils.js';
import {
  CHARACTERS,
  getIconFramePath,
  getPlayerColor,
  getSkinImage,
} from '../utils/constants/characters.js';
import {
  appendVersionQuery,
  DEFENSE_HISTORY_KEY,
} from '../utils/constants/config.js';
import { getOrCreateUUID, playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/** LocalStorageから防衛履歴を読み込む共通ヘルパー */
const loadHistoryFromLocalStorage = () => {
  const raw = localStorage.getItem(DEFENSE_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse defense history from localStorage:', e);
    return [];
  }
};

export default function DefenseBattleHistoryScreen() {
  const [historyList, setHistoryList] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error', 'empty'

  useEffect(() => {
    const loadHistory = async () => {
      setStatus('loading');
      try {
        const myUuid = getOrCreateUUID ? getOrCreateUUID() : null;
        let history = [];
        let serverFetchSucceeded = false;

        // サーバーから自身のプレイヤーデータを取得して防衛履歴を同期・復元
        const result = await fetchPlayerDecks();
        if (result.success && result.players && myUuid) {
          const myData = result.players.find((p) => p.uuid === myUuid);
          if (myData && Array.isArray(myData.defense_history)) {
            history = myData.defense_history;
            localStorage.setItem(DEFENSE_HISTORY_KEY, JSON.stringify(history));
            serverFetchSucceeded = true;
          }
        }

        // サーバーから取得できなかった場合のみ、LocalStorageからのフォールバック
        if (!serverFetchSucceeded && history.length === 0) {
          history = loadHistoryFromLocalStorage();
        }

        if (history.length === 0) {
          setStatus('empty');
        } else {
          setHistoryList(history);
          setStatus('success');
        }
      } catch (err) {
        console.error('Failed to load defense history:', err);
        // エラー時もLocalStorage試行
        const fallback = loadHistoryFromLocalStorage();
        if (fallback.length > 0) {
          setHistoryList(fallback);
          setStatus('success');
          return;
        }
        setStatus('error');
      }
    };

    loadHistory();
  }, []);

  const handleRecordClick = (item) => {
    playSound?.(SOUNDS?.seClick);
    const deckCards = Array.isArray(item.attackerDeck) ? item.attackerDeck : [];
    const attackerName = item.attackerName || '挑戦者';

    const charKey = item.attackerCharacter || 'android';
    const charData = CHARACTERS?.[charKey] || CHARACTERS?.android;
    const leaderSkill = charData?.leaderSkill || null;

    if (window.showEnemyDeckModal) {
      window.showEnemyDeckModal(
        deckCards,
        `${attackerName} の攻撃デッキ`,
        leaderSkill
      );
    }
  };

  return (
    <div
      id="screen-defense-battle-history"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('${appendVersionQuery('assets/backgrounds/background_defense.webp')}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#a855f7',
          margin: '20px 0 5px 0',
          fontSize: '1.2rem',
          textAlign: 'center',
        }}
      >
        防衛履歴
      </h2>
      <div
        style={{
          fontSize: '0.9rem',
          marginBottom: '15px',
          color: '#cbd5e1',
          textAlign: 'center',
        }}
      >
        直近5戦の防衛記録（タップでデッキ確認）
      </div>

      <div
        className="deck-edit-container"
        id="defense-history-list"
        style={{
          justifyContent: 'flex-start',
          overflowY: 'auto',
          width: '100%',
          maxWidth: '480px',
          minHeight: '492px',
          maxHeight: '492px',
          height: 'auto',
          flex: 'none',
        }}
      >
        {status === 'loading' && (
          <div
            style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}
          >
            読み込み中...
          </div>
        )}
        {status === 'error' && (
          <div
            style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}
          >
            読み込みに失敗しました
          </div>
        )}
        {status === 'empty' && (
          <div
            style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}
          >
            防衛履歴はありません
          </div>
        )}

        {status === 'success' &&
          historyList.map((item, index) => {
            const charKey = item.attackerCharacter || 'android';
            const skinId = item.attackerSkin || 'default';
            const char =
              (CHARACTERS && CHARACTERS[charKey]) || CHARACTERS?.android;

            // 攻撃に使用されたリーダーのアイコン（スキン適用）
            const iconSrc =
              getSkinImage(char, skinId, 'icon') ||
              appendVersionQuery(
                char?.icon || 'assets/icons/icon_android.webp'
              );
            const frameSrc = getIconFramePath(char?.id || 'android');

            const isWin = item.result === 'win'; // 防衛成功
            const ptsVal = item.attackerTotalPoints || 0;

            return (
              <button
                key={`${item.timestamp || index}_${index}`}
                className="btn-banner"
                style={{
                  flexShrink: 0,
                }}
                onClick={() => handleRecordClick(item)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="banner-icon-wrapper">
                      <img src={iconSrc} className="banner-icon" alt="" />
                      <img
                        src={frameSrc}
                        className="banner-icon-frame"
                        alt="frame"
                      />
                    </div>
                    <span
                      className="banner-text"
                      style={{
                        color: getPlayerColor({
                          character: charKey,
                          name: item.attackerName,
                        }),
                        marginRight: '10px',
                      }}
                    >
                      {item.attackerName || '挑戦者'}
                    </span>
                    <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                      (Pt: {ptsVal})
                    </span>
                  </div>
                  <div
                    style={{
                      color: isWin ? '#10b981' : '#ef4444',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                    }}
                  >
                    {isWin ? '防衛成功' : '防衛失敗'}
                  </div>
                </div>
              </button>
            );
          })}
      </div>

      <div
        style={{
          padding: '15px 0 20px 0',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
        }}
      >
        <BackButton to="screen-defense-menu" style={{ margin: 0 }} />
      </div>
    </div>
  );
}

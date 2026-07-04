import { useEffect, useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { getOrCreateUUID } from '../utils/gameUtils.js';

export default function TournamentRankingScreen() {
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error', 'empty'

  useEffect(() => {
    const fetchPlayers = async () => {
      setStatus('loading');
      try {
        const response = await fetch('api/get_player_decks.php');
        const result = await response.json();

        if (result.success) {
          const myUuid = getOrCreateUUID ? getOrCreateUUID() : null;
          let activePlayers = result.players;

          if (activePlayers.length === 0) {
            setStatus('empty');
            return;
          }

          // ランキングソート (夢幻の闘技祭ポイントの降順)
          activePlayers.sort(
            (a, b) =>
              (b.tournament_total_points || b.tournament_points || 0) -
              (a.tournament_total_points || a.tournament_points || 0)
          );

          // 各プレイヤーに対する計算を追加
          activePlayers = activePlayers.map((p, index) => {
            const pTotalPoints =
              p.tournament_total_points || p.tournament_points || 0;
            return {
              ...p,
              rankIndex: index,
              displayTotalPoints: pTotalPoints,
              isMe: p.uuid === myUuid,
            };
          });

          setPlayers(activePlayers);
          setStatus('success');
        } else {
          throw new Error(result.error);
        }
      } catch (err) {
        console.error('Failed to fetch player list:', err);
        setStatus('error');
      }
    };

    fetchPlayers();
  }, []);

  return (
    <ScreenLayout
      id="screen-tournament-ranking"
      backgroundImage="background_tournament01.png"
      title="ランキング"
      titleColor="#60a5fa"
      titleGlow={true}
      backTo="screen-tournament-menu"
    >
      <div
        className="deck-edit-container"
        id="tournament-ranking-list"
        style={{
          justifyContent: 'flex-start',
          paddingTop: '10px',
          gap: '10px',
          overflowY: 'auto',
          width: '100%',
          maxWidth: '480px',
          flex: 1,
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
            登録プレイヤーがいません
          </div>
        )}

        {status === 'success' &&
          players.map((p) => {
            const char =
              (CHARACTERS && CHARACTERS[p.character]) || CHARACTERS?.android;
            if (!char) return null;

            let borderColor = '#cd7f32';
            let extraClass = '';
            if (p.rankIndex === 0) {
              extraClass = 'legendary';
              borderColor = 'transparent';
            } else if (p.rankIndex === 1) {
              borderColor = '#facc15';
            } else if (p.rankIndex === 2) {
              borderColor = '#e2e8f0';
            }

            return (
              <div
                key={p.uuid}
                className={`btn-banner ${extraClass}`}
                style={{
                  borderColor,
                  flexShrink: 0,
                  cursor: 'default',
                  opacity: 0.9,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 15px',
                  boxSizing: 'border-box',
                  width: '100%',
                }}
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
                    <div
                      style={{
                        marginRight: '12px',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        color:
                          p.rankIndex === 0
                            ? '#facc15'
                            : p.rankIndex === 1
                              ? '#94a3b8'
                              : p.rankIndex === 2
                                ? '#cd7f32'
                                : '#94a3b8',
                        width: '40px',
                        textAlign: 'center',
                      }}
                    >
                      {p.rankIndex + 1}位
                    </div>
                    <div className="banner-icon-wrapper">
                      <img
                        src={
                          p.icon
                            ? `assets/icons/icon_${p.icon}.png`
                            : getSkinImage
                              ? getSkinImage(char, p.skin || 'default', 'icon')
                              : char.icon
                        }
                        className="banner-icon"
                        alt=""
                      />
                      <img
                        src={`assets/icons/iconframe_${['satan', 'void', 'succubus', 'warlock'].includes(char.id) ? 'red' : 'gold'}.png`}
                        className="banner-icon-frame"
                        alt="frame"
                      />
                    </div>
                    <span
                      className="banner-text"
                      style={{ color: char.color, marginRight: '10px' }}
                    >
                      {p.name}
                    </span>
                    {p.isMe && (
                      <span
                        style={{
                          color: 'var(--color-blue)',
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                          textShadow: '0 0 10px rgba(56, 189, 248, 0.8)',
                          marginLeft: '5px',
                        }}
                      >
                        (YOU)
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      color: '#cbd5e1',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                    }}
                  >
                    {p.displayTotalPoints} Pt
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </ScreenLayout>
  );
}

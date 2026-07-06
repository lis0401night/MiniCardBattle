import { useEffect, useState } from 'react';
import ScreenLayout from './ScreenLayout.jsx';
import {
  CHARACTERS,
  getPlayerIconPath,
  getIconFramePath,
  getPlayerColor,
} from '../../utils/constants/characters.js';
import { getOrCreateUUID } from '../../utils/gameUtils.js';
import { savePointsToServer, fetchPlayerDecks } from '../../utils/apiUtils.js';

const RANK_ACCENTS = {
  0: {
    extraClass: 'legendary',
    borderColor: 'transparent',
    textColor: '#facc15',
  },
  1: { extraClass: '', borderColor: '#e2e8f0', textColor: '#94a3b8' },
  2: { extraClass: '', borderColor: '#cd7f32', textColor: '#cd7f32' },
};
const DEFAULT_RANK_ACCENT = {
  extraClass: '',
  borderColor: undefined,
  textColor: '#94a3b8',
};

export default function RankingScreen({
  id,
  backgroundImage,
  titleColor,
  backTo,
  pointField, // 'challenge_total_points', 'defense_total_points', 'tournament_total_points' など
  fallbackPointField, // 'challenge_points' など（以前の古いフィールド用）
}) {
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error', 'empty'

  useEffect(() => {
    const fetchPlayers = async () => {
      setStatus('loading');
      try {
        const result = await fetchPlayerDecks();

        if (result.success) {
          const myUuid = getOrCreateUUID ? getOrCreateUUID() : null;
          let activePlayers = result.players;

          // 自分のローカルストレージの最新データをサーバーに自動同期（交換所を介さない自動リカバリー）
          if (myUuid) {
            const myData = activePlayers.find((p) => p.uuid === myUuid);

            const challengePts =
              parseInt(
                localStorage.getItem('mini_card_battle_challenge_points'),
                10
              ) || 0;
            const challengeTotalPts =
              parseInt(
                localStorage.getItem('mini_card_battle_challenge_total_points'),
                10
              ) || 0;
            const maxStreak =
              parseInt(
                localStorage.getItem('mini_card_battle_dungeon_max_streak'),
                10
              ) || 0;

            const tournamentPts =
              parseInt(
                localStorage.getItem('mini_card_battle_tournament_points'),
                10
              ) || 0;
            const tournamentTotalPts =
              parseInt(
                localStorage.getItem(
                  'mini_card_battle_tournament_total_points'
                ),
                10
              ) || 0;

            const defensePts =
              parseInt(
                localStorage.getItem('mini_card_battle_defense_points'),
                10
              ) || 0;
            const defenseTotalPts =
              parseInt(
                localStorage.getItem('mini_card_battle_defense_total_points'),
                10
              ) || 0;
            const defenseWins =
              parseInt(
                localStorage.getItem('mini_card_battle_defense_wins'),
                10
              ) || 0;

            if (myData) {
              const sChallengePts = myData.challenge_points || 0;
              const sChallengeTotalPts = myData.challenge_total_points || 0;

              const sTournamentPts = myData.tournament_points || 0;
              const sTournamentTotalPts = myData.tournament_total_points || 0;

              const sDefensePts = myData.points || 0;
              const sDefenseTotalPts = myData.total_points || 0;

              if (
                challengeTotalPts > sChallengeTotalPts ||
                challengePts > sChallengePts
              ) {
                savePointsToServer(
                  'update_challenge_points.php',
                  challengePts,
                  challengeTotalPts,
                  { max_streak: maxStreak }
                );
                myData.challenge_points = challengePts;
                myData.challenge_total_points = challengeTotalPts;
              }
              if (
                tournamentTotalPts > sTournamentTotalPts ||
                tournamentPts > sTournamentPts
              ) {
                savePointsToServer(
                  'update_tournament_points.php',
                  tournamentPts,
                  tournamentTotalPts
                );
                myData.tournament_points = tournamentPts;
                myData.tournament_total_points = tournamentTotalPts;
              }
              if (
                defenseTotalPts > sDefenseTotalPts ||
                defensePts > sDefensePts
              ) {
                savePointsToServer(
                  'update_points.php',
                  defensePts,
                  defenseTotalPts,
                  { defense_wins: defenseWins }
                );
                myData.points = defensePts;
                myData.total_points = defenseTotalPts;
              }
            } else {
              // サーバー上にまだアカウントファイルが存在しない新規ユーザーの場合、ここで作成同期する
              let hasCreated = false;
              if (challengeTotalPts > 0) {
                savePointsToServer(
                  'update_challenge_points.php',
                  challengePts,
                  challengeTotalPts,
                  { max_streak: maxStreak }
                );
                hasCreated = true;
              }
              if (tournamentTotalPts > 0) {
                savePointsToServer(
                  'update_tournament_points.php',
                  tournamentPts,
                  tournamentTotalPts
                );
                hasCreated = true;
              }
              if (defenseTotalPts > 0) {
                savePointsToServer(
                  'update_points.php',
                  defensePts,
                  defenseTotalPts,
                  { defense_wins: defenseWins }
                );
                hasCreated = true;
              }

              // 初回のみ仮想的な自分のレコードをソート用に追加（再読み込みを不要にするため）
              if (hasCreated) {
                const playerName =
                  localStorage.getItem('mini_card_battle_player_name') ||
                  'Player';
                const virtualPlayer = {
                  uuid: myUuid,
                  name: playerName,
                  icon: 'android',
                  character: 'oni',
                  skin: 'default',
                  playmat: null,
                  stage: 'oni',
                  challenge_points: challengePts,
                  challenge_total_points: challengeTotalPts,
                  challenge_max_streak: maxStreak,
                  tournament_points: tournamentPts,
                  tournament_total_points: tournamentTotalPts,
                  points: defensePts,
                  total_points: defenseTotalPts,
                  defense_wins: defenseWins,
                };
                activePlayers.push(virtualPlayer);
              }
            }
          }

          if (activePlayers.length === 0) {
            setStatus('empty');
            return;
          }

          // pointField が明示的に0の場合でも正しく現在の値を使うためのヘルパー
          const getPoints = (p) =>
            p[pointField] !== undefined && p[pointField] !== null
              ? p[pointField]
              : p[fallbackPointField] || 0;

          // ランキングソート (指定ポイントフィールドの降順)
          activePlayers.sort((a, b) => getPoints(b) - getPoints(a));

          // 各プレイヤーに対する計算を追加
          activePlayers = activePlayers.map((p, index) => {
            const pTotalPoints = getPoints(p);
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
  }, [pointField, fallbackPointField]);

  return (
    <ScreenLayout
      id={id}
      backgroundImage={backgroundImage}
      title="ランキング"
      titleColor={titleColor}
      titleGlow={true}
      backTo={backTo}
    >
      <div
        className="deck-edit-container"
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

            const { extraClass, borderColor, textColor } =
              RANK_ACCENTS[p.rankIndex] || DEFAULT_RANK_ACCENT;

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
                        color: textColor,
                        width: '40px',
                        textAlign: 'center',
                      }}
                    >
                      {p.rankIndex + 1}位
                    </div>
                    <div className="banner-icon-wrapper">
                      <img
                        src={getPlayerIconPath(p)}
                        className="banner-icon"
                        alt=""
                      />
                      <img
                        src={getIconFramePath(char.id)}
                        className="banner-icon-frame"
                        alt="frame"
                      />
                    </div>
                    <span
                      className="banner-text"
                      style={{
                        color: getPlayerColor(p),
                        marginRight: '10px',
                      }}
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

import { useEffect, useMemo, useState } from 'react';
import { loadFortuneClearedData } from '../../utils/constants/fortuneRewards.js';

import ScreenLayout from './ScreenLayout.jsx';
import {
  CHARACTERS,
  getPlayerIconPath,
  getIconFramePath,
  getPlayerColor,
} from '../../utils/constants/characters.js';
import {
  getOrCreateUUID,
  playSound,
  resolvePlayerName,
} from '../../utils/gameUtils.js';
import {
  fetchPlayerDecks,
  syncModePoints,
  resolveFortuneMaxCostAutomata,
} from '../../utils/apiUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import {
  CHALLENGE_POINTS_KEY,
  CHALLENGE_TOTAL_POINTS_KEY,
  DUNGEON_MAX_STREAK_KEY,
  TOURNAMENT_POINTS_KEY,
  TOURNAMENT_TOTAL_POINTS_KEY,
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
  DEFENSE_WINS_KEY,
  FORTUNE_POINTS_KEY,
  FORTUNE_TOTAL_POINTS_KEY,
} from '../../utils/constants/config.js';

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

/**
 * ランキング画面コンポーネント
 *
 * @param {Array} tabs - タブ定義の配列（省略時は従来のpointField/fallbackPointFieldで動作）
 *   各要素: { label: 'タブ表示名', pointField: 'ソートフィールド', fallbackPointField: 'フォールバック', unit: '単位' }
 */
export default function RankingScreen({
  id,
  backgroundImage,
  titleColor,
  backTo,
  pointField, // 'challenge_total_points', 'defense_total_points', 'tournament_total_points' など
  fallbackPointField, // 'challenge_points' など（以前の古いフィールド用）
  tabs, // タブ定義の配列（省略可能）
}) {
  const [rawPlayers, setRawPlayers] = useState([]);
  const [totalPlayerCount, setTotalPlayerCount] = useState(0);
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error', 'empty'
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // タブが定義されている場合、現在のタブの設定を使用する
  const currentPointField = tabs
    ? tabs[activeTabIndex]?.pointField
    : pointField;
  const currentFallbackField = tabs
    ? tabs[activeTabIndex]?.fallbackPointField
    : fallbackPointField;
  const currentUnit = tabs
    ? tabs[activeTabIndex]?.unit !== undefined
      ? tabs[activeTabIndex].unit
      : 'Pt'
    : 'Pt';

  useEffect(() => {
    const fetchPlayers = async () => {
      setStatus('loading');
      try {
        const result = await fetchPlayerDecks();

        if (result.success) {
          const myUuid = getOrCreateUUID ? getOrCreateUUID() : null;
          let activePlayers = result.players.map((p) => {
            return {
              ...p,
              // サーバーに保存された「一度に有効化した合計目標値の最大値」を使用
              fortune_total_cost: p.fortune_max_total_cost || 0,
              fortune_total_cost_automata: resolveFortuneMaxCostAutomata(p),
              fortune_total_cost_valkyria:
                p.fortune_max_total_cost_valkyria || 0,
            };
          });

          // 自分のローカルストレージの最新データをサーバーに自動同期（交換所を介さない自動リカバリー）
          if (myUuid) {
            const myData = activePlayers.find((p) => p.uuid === myUuid);

            // pointField に応じて同期するモードを決定 (必要なモードのみ同期して無駄な通信を排除)
            // タブがある場合は最初のタブのpointFieldで判定する
            const baseField = tabs ? tabs[0]?.pointField : pointField;
            let syncMode = '';
            if (baseField?.includes('challenge')) {
              syncMode = 'challenge';
            } else if (baseField?.includes('tournament')) {
              syncMode = 'tournament';
            } else if (
              baseField?.includes('defense') ||
              baseField === 'points' ||
              baseField === 'total_points'
            ) {
              syncMode = 'defense';
            } else if (baseField?.includes('fortune')) {
              syncMode = 'fortune';
            }

            if (syncMode && myData) {
              const syncResult = await syncModePoints(syncMode, myData);
              if (syncResult) {
                // ローカル側の変更が適用されてサーバーへ同期した場合、ローカルの最新データに更新
                if (syncMode === 'challenge') {
                  myData.challenge_points = syncResult.points;
                  myData.challenge_total_points = syncResult.totalPoints;
                } else if (syncMode === 'tournament') {
                  myData.tournament_points = syncResult.points;
                  myData.tournament_total_points = syncResult.totalPoints;
                } else if (syncMode === 'defense') {
                  myData.points = syncResult.points;
                  myData.total_points = syncResult.totalPoints;
                } else if (syncMode === 'fortune') {
                  myData.fortune_points = syncResult.points;
                  myData.fortune_total_points = syncResult.totalPoints;
                  myData.fortune_max_grade =
                    syncResult.fortune_max_grade ?? myData.fortune_max_grade;
                  myData.fortune_total_cost_automata =
                    syncResult.fortune_max_total_cost_automata ??
                    myData.fortune_total_cost_automata;
                  myData.fortune_total_cost_valkyria =
                    syncResult.fortune_max_total_cost_valkyria ??
                    myData.fortune_total_cost_valkyria;
                }
              }
            }

            if (!myData) {
              // サーバー上にまだアカウントファイルが存在しない新規ユーザーの場合、表示中のモードデータがあれば作成同期する
              const challengePts =
                parseInt(localStorage.getItem(CHALLENGE_POINTS_KEY), 10) || 0;
              const challengeTotalPts =
                parseInt(
                  localStorage.getItem(CHALLENGE_TOTAL_POINTS_KEY),
                  10
                ) || 0;
              const maxStreak =
                parseInt(localStorage.getItem(DUNGEON_MAX_STREAK_KEY), 10) || 0;

              const tournamentPts =
                parseInt(localStorage.getItem(TOURNAMENT_POINTS_KEY), 10) || 0;
              const tournamentTotalPts =
                parseInt(
                  localStorage.getItem(TOURNAMENT_TOTAL_POINTS_KEY),
                  10
                ) || 0;

              const defensePts =
                parseInt(localStorage.getItem(DEFENSE_POINTS_KEY), 10) || 0;
              const defenseTotalPts =
                parseInt(localStorage.getItem(DEFENSE_TOTAL_POINTS_KEY), 10) ||
                0;
              const defenseWins =
                parseInt(localStorage.getItem(DEFENSE_WINS_KEY), 10) || 0;

              const fortunePts =
                parseInt(localStorage.getItem(FORTUNE_POINTS_KEY), 10) || 0;
              const fortuneTotalPts =
                parseInt(localStorage.getItem(FORTUNE_TOTAL_POINTS_KEY), 10) ||
                0;
              const clearedDataAutomata = loadFortuneClearedData('automata');
              const clearedDataValkyria = loadFortuneClearedData('valkyria');
              const fortuneMaxGrade = Math.max(
                clearedDataAutomata.maxGradeLevel || 0,
                clearedDataValkyria.maxGradeLevel || 0,
                0
              );
              const fortuneTotalCostAutomata =
                clearedDataAutomata.maxTotalCost || 0;
              const fortuneTotalCostValkyria =
                clearedDataValkyria.maxTotalCost || 0;
              const fortuneTotalCost = fortuneTotalCostAutomata;

              let hasCreated = false;
              if (syncMode === 'challenge' && challengeTotalPts > 0) {
                await syncModePoints('challenge', null);
                hasCreated = true;
              } else if (syncMode === 'tournament' && tournamentTotalPts > 0) {
                await syncModePoints('tournament', null);
                hasCreated = true;
              } else if (syncMode === 'defense' && defenseTotalPts > 0) {
                await syncModePoints('defense', null);
                hasCreated = true;
              } else if (syncMode === 'fortune' && fortuneTotalPts > 0) {
                await syncModePoints('fortune', null);
                hasCreated = true;
              }

              // 初回のみ仮想的な自分のレコードをソート用に追加（再読み込みを不要にするため）
              if (hasCreated) {
                const playerName = resolvePlayerName();
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
                  fortune_points: fortunePts,
                  fortune_total_points: fortuneTotalPts,
                  fortune_max_grade: fortuneMaxGrade,
                  fortune_total_cost: fortuneTotalCost,
                  fortune_total_cost_automata: fortuneTotalCostAutomata,
                  fortune_total_cost_valkyria: fortuneTotalCostValkyria,
                };
                activePlayers.push(virtualPlayer);
              }
            }
          }

          if (activePlayers.length === 0) {
            setStatus('empty');
            return;
          }

          setRawPlayers(activePlayers);
          setTotalPlayerCount(result.totalPlayerCount ?? activePlayers.length);
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
    // タブが定義されていても、データフェッチはpointFieldの変更に依存しない（初回のみ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タブ切り替え時にソート結果を再計算する
  const players = useMemo(() => {
    if (rawPlayers.length === 0) return [];

    const myUuid = getOrCreateUUID ? getOrCreateUUID() : null;
    const field = currentPointField;
    const fallback = currentFallbackField;

    const getPoints = (p) =>
      p[field] !== undefined && p[field] !== null ? p[field] : p[fallback] || 0;

    const sorted = [...rawPlayers].sort((a, b) => getPoints(b) - getPoints(a));

    let lastPoints = null;
    let lastRank = 0;

    return sorted.map((p, index) => {
      const currentPoints = getPoints(p);
      let displayRank = index + 1;

      if (lastPoints !== null && currentPoints === lastPoints) {
        displayRank = lastRank;
      } else {
        lastRank = displayRank;
      }
      lastPoints = currentPoints;

      return {
        ...p,
        rankIndex: index,
        displayRank,
        displayTotalPoints: currentPoints,
        isMe: p.uuid === myUuid,
      };
    });
  }, [rawPlayers, currentPointField, currentFallbackField]);

  return (
    <ScreenLayout
      id={id}
      backgroundImage={backgroundImage}
      title="ランキング"
      titleColor={titleColor}
      titleGlow={true}
      backTo={backTo}
    >
      {status === 'success' && (
        <div
          style={{
            fontSize: '0.9rem',
            color: '#cbd5e1',
            textAlign: 'center',
            marginBottom: '10px',
            flexShrink: 0,
          }}
        >
          総プレイヤー数: {totalPlayerCount}人
        </div>
      )}
      <div
        className="deck-edit-container"
        style={{
          justifyContent: 'flex-start',
          paddingTop: '10px',
          gap: '10px',
          width: '100%',
          maxWidth: '480px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* タブUI */}
        {tabs && tabs.length > 1 && (
          <div
            style={{
              display: 'flex',
              width: '100%',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              flexShrink: 0,
            }}
          >
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => {
                  if (activeTabIndex !== i) {
                    playSound(SOUNDS.seClick);
                    setActiveTabIndex(i);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s ease',
                  background:
                    activeTabIndex === i
                      ? `linear-gradient(135deg, ${titleColor}dd, ${titleColor}88)`
                      : 'rgba(30, 41, 59, 0.8)',
                  color: activeTabIndex === i ? '#fff' : '#94a3b8',
                  borderBottom:
                    activeTabIndex === i
                      ? `2px solid ${titleColor}`
                      : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

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

        {status === 'success' && (
          <div
            style={{
              overflowY: 'auto',
              width: '100%',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              paddingRight: '2px',
            }}
          >
            {players.map((p) => {
              const char =
                (CHARACTERS && CHARACTERS[p.character]) || CHARACTERS?.android;
              if (!char) return null;

              const rankForAccent = p.displayRank - 1;
              const { extraClass, borderColor, textColor } =
                RANK_ACCENTS[rankForAccent] || DEFAULT_RANK_ACCENT;

              return (
                <div
                  key={p.uuid}
                  className={`btn-banner ${extraClass}`}
                  style={{
                    borderColor,
                    flexShrink: 0,
                    cursor: 'pointer',
                    opacity: 0.9,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 15px',
                    boxSizing: 'border-box',
                    width: '100%',
                  }}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    if (window.showPlayerProfileModal) {
                      window.showPlayerProfileModal(p);
                    }
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
                        {p.displayRank}位
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
                      {p.displayTotalPoints}
                      {/^[A-Za-z]+$/.test(currentUnit)
                        ? ` ${currentUnit}`
                        : currentUnit}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}

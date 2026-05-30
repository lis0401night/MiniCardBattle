import { useEffect, useState } from 'react';
import {
  clearTournamentSave,
  saveTournamentProgress,
  startTournamentMatch,
} from '../game/tournament.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { SCHOOL_NAMES } from '../utils/constants/eventTournamentDialogues.js';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import { SOUNDS } from '../utils/sounds.js';

const SVG_WIDTH = 1100;
const SVG_HEIGHT = 900;
const BOX_WIDTH = 300;
const BOX_HEIGHT = 70;
const CHAMPION_WIDTH = 180;
const CHAMPION_X = 460;

const getYPos = (r, idx) => {
  if (r === 0) {
    const sideIdx = idx % 8;
    return 80 + sideIdx * 105;
  }
  return (getYPos(r - 1, idx * 2) + getYPos(r - 1, idx * 2 + 1)) / 2;
};

const getVX = (r, isRight) => {
  const leftVX = [360, 400, 440];
  const rightVX = [740, 700, 660];
  return isRight ? rightVX[r] : leftVX[r];
};

export default function TournamentBracketScreen() {
  const [, setRenderCounter] = useState(0);

  useEffect(() => {
    const handleActive = () => setRenderCounter((c) => c + 1);
    const screen = document.getElementById('screen-tournament-bracket');
    if (screen) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.attributeName === 'class' &&
            screen.classList.contains('active')
          ) {
            handleActive();
          }
        });
      });
      observer.observe(screen, { attributes: true });
      return () => observer.disconnect();
    }
  }, []);

  const t = GameState.tournament;
  if (!t)
    return <div id="screen-tournament-bracket" className="screen active"></div>;

  const currentRound = t.round; // 1..5
  const isFinished = t.playerLost || currentRound > 4;

  const handleNext = () => {
    playSound?.(SOUNDS?.seClick);
    if (isFinished) {
      let winCount = t.playerLost ? currentRound - 1 : 4;
      // 勝利数に応じたポイント: 0勝=0pt, 1勝=1pt, 2勝=3pt, 3勝=6pt, 4勝(優勝)=10pt
      const pointsMap = [0, 1, 3, 6, 10];
      let points = pointsMap[winCount] || 0;
      clearTournamentSave();
      // トーナメント終了後、通常モードに戻すためGameStateをリセット
      GameState.tournament = null;
      GameState.gameMode = 'free';
      if (points > 0) {
        let currentPts =
          parseInt(
            localStorage.getItem('mini_card_battle_tournament_points')
          ) || 0;
        let totalPts =
          parseInt(
            localStorage.getItem('mini_card_battle_tournament_total_points')
          ) || 0;
        currentPts += points;
        totalPts += points;
        localStorage.setItem('mini_card_battle_tournament_points', currentPts);
        localStorage.setItem(
          'mini_card_battle_tournament_total_points',
          totalPts
        );

        // サーバーにポイントを同期 (DRY原則を適用し、共通のsavePointsToServerを使用)
        savePointsToServer(
          'update_tournament_points.php',
          currentPts,
          totalPts
        );
      }

      showAlertModal?.(
        `トーナメント終了！\n${winCount}勝しました。\n大会ポイントを ${points} Pt 獲得！`,
        () => {
          switchScreen?.('screen-tournament-menu');
        }
      );
    } else {
      startTournamentMatch();
    }
  };

  const handleSuspend = () => {
    showConfirmModal?.(
      '一旦中断してメインメニューに戻りますか？\n（進捗は自動的に保存されています）',
      () => {
        playSound?.(SOUNDS?.seClick);
        saveTournamentProgress();
        switchScreen?.('screen-tournament-menu');
      }
    );
  };

  const lines = [];
  const texts = [];

  // トーナメントの線 (r=0, 1, 2)
  for (let r = 0; r < 3; r++) {
    const matches = 8 >> r;
    for (let m = 0; m < matches; m++) {
      const isRight = m >= matches / 2;
      const p1_idx = m * 2;
      const p2_idx = m * 2 + 1;
      const p1_y = getYPos(r, p1_idx);
      const p2_y = getYPos(r, p2_idx);
      const mid_y = (p1_y + p2_y) / 2;

      let startX, vX, nextX;

      vX = getVX(r, isRight);

      if (!isRight) {
        startX = r === 0 ? 20 + BOX_WIDTH : getVX(r - 1, false);
        nextX = r === 2 ? CHAMPION_X : getVX(r + 1, false);
      } else {
        startX = r === 0 ? SVG_WIDTH - 20 - BOX_WIDTH : getVX(r - 1, true);
        nextX = r === 2 ? CHAMPION_X + CHAMPION_WIDTH : getVX(r + 1, true);
      }

      // 線の色判定
      const p1 = t.bracketTree[r] ? t.bracketTree[r][p1_idx] : null;
      const p2 = t.bracketTree[r] ? t.bracketTree[r][p2_idx] : null;
      const winner = t.bracketTree[r + 1] ? t.bracketTree[r + 1][m] : null;

      const p1_color = winner && winner.id === p1?.id ? '#ef4444' : '#cbd5e1';
      const p2_color = winner && winner.id === p2?.id ? '#ef4444' : '#cbd5e1';
      const w_color = winner ? '#ef4444' : '#cbd5e1';
      const p1_width = winner && winner.id === p1?.id ? '3' : '2';
      const p2_width = winner && winner.id === p2?.id ? '3' : '2';
      const w_width = winner ? '3' : '2';

      // p1 横線
      lines.push(
        <line
          key={`l-p1-${r}-${m}`}
          x1={startX}
          y1={p1_y}
          x2={vX}
          y2={p1_y}
          stroke={p1_color}
          strokeWidth={p1_width}
        />
      );
      // p2 横線
      lines.push(
        <line
          key={`l-p2-${r}-${m}`}
          x1={startX}
          y1={p2_y}
          x2={vX}
          y2={p2_y}
          stroke={p2_color}
          strokeWidth={p2_width}
        />
      );
      // 縦線
      // p1_y is higher (smaller number) than p2_y
      lines.push(
        <line
          key={`l-v1-${r}-${m}`}
          x1={vX}
          y1={p1_y}
          x2={vX}
          y2={mid_y}
          stroke={p1_color}
          strokeWidth={p1_width}
        />
      );
      lines.push(
        <line
          key={`l-v2-${r}-${m}`}
          x1={vX}
          y1={mid_y}
          x2={vX}
          y2={p2_y}
          stroke={p2_color}
          strokeWidth={p2_width}
        />
      );
      // 勝者の横線
      lines.push(
        <line
          key={`l-w-${r}-${m}`}
          x1={vX}
          y1={mid_y}
          x2={nextX}
          y2={mid_y}
          stroke={w_color}
          strokeWidth={w_width}
        />
      );
    }
  }

  // 参加者の名前（枠付き）
  for (let r = 0; r < 1; r++) {
    const participants = t.bracketTree[r] || [];
    participants.forEach((p, i) => {
      if (!p) return;
      const isRight = i >= 8;
      const x = isRight ? SVG_WIDTH - 20 - BOX_WIDTH : 20;
      const y = getYPos(r, i);
      const isPlayer = p.isPlayer;

      const bgColor = isPlayer ? '#eff6ff' : '#f8fafc';
      const borderColor = isPlayer ? '#3b82f6' : '#94a3b8';
      const textColor = isPlayer ? '#1e40af' : '#334155';
      const fontWeight = isPlayer ? 'bold' : 'normal';

      texts.push(
        <g key={`box-${r}-${i}`}>
          <rect
            x={x}
            y={y - BOX_HEIGHT / 2}
            width={BOX_WIDTH}
            height={BOX_HEIGHT}
            fill={bgColor}
            stroke={borderColor}
            strokeWidth="2"
            rx="6"
          />
          <text
            x={x + BOX_WIDTH / 2}
            y={y + 10}
            textAnchor="middle"
            fontSize="28"
            fill={textColor}
            fontWeight={fontWeight}
            letterSpacing="1"
          >
            {p.isDummy ? 'その他' : SCHOOL_NAMES[p.charId] || 'その他'}
          </text>
        </g>
      );
    });
  }

  // 優勝者
  const champion = t.bracketTree[4] ? t.bracketTree[4][0] : null;
  const champY = getYPos(3, 0); // 322.5

  if (champion) {
    const isPlayer = champion.isPlayer;
    const bgColor = isPlayer ? '#fff7ed' : '#fef2f2';
    const borderColor = isPlayer ? '#f59e0b' : '#ef4444';
    const textColor = isPlayer ? '#b45309' : '#b91c1c';

    texts.push(
      <g key="champion-box">
        <rect
          x={CHAMPION_X}
          y={champY - 50}
          width={CHAMPION_WIDTH}
          height={100}
          fill={bgColor}
          stroke={borderColor}
          strokeWidth="4"
          rx="10"
        />
        <text
          x={CHAMPION_X + CHAMPION_WIDTH / 2}
          y={champY - 10}
          textAnchor="middle"
          fontSize="26"
          fill={textColor}
          fontWeight="bold"
        >
          👑 優勝
        </text>
        <text
          x={CHAMPION_X + CHAMPION_WIDTH / 2}
          y={champY + 34}
          textAnchor="middle"
          fontSize="30"
          fill={textColor}
          fontWeight="bold"
          letterSpacing="1"
        >
          {champion.isDummy
            ? 'その他'
            : SCHOOL_NAMES[champion.charId] || 'その他'}
        </text>
      </g>
    );
  } else {
    // 優勝者がまだ決まっていない場合の空枠
    texts.push(
      <g key="champion-box-empty">
        <rect
          x={CHAMPION_X}
          y={champY - 50}
          width={CHAMPION_WIDTH}
          height={100}
          fill="#f1f5f9"
          stroke="#cbd5e1"
          strokeWidth="3"
          strokeDasharray="6 3"
          rx="10"
        />
        <text
          x={CHAMPION_X + CHAMPION_WIDTH / 2}
          y={champY + 12}
          textAnchor="middle"
          fontSize="32"
          fill="#94a3b8"
          fontWeight="bold"
        >
          優勝
        </text>
      </g>
    );
  }

  return (
    <div
      id="screen-tournament-bracket"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.5), rgba(15, 23, 42, 0.7)), url('assets/backgrounds/background_tournament02.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#60a5fa',
          marginBottom: '15px',
          textAlign: 'center',
          textShadow: '0 0 15px rgba(59, 130, 246, 0.6)',
        }}
      >
        夢幻の闘技祭
      </h2>

      {isFinished && t.playerLost && (
        <h3
          style={{
            color: '#ef4444',
            textAlign: 'center',
            marginBottom: '10px',
          }}
        >
          敗退...
        </h3>
      )}
      {isFinished && !t.playerLost && (
        <h3
          style={{
            color: '#fbbf24',
            textAlign: 'center',
            marginBottom: '10px',
          }}
        >
          優勝！
        </h3>
      )}

      <div
        style={{
          background: '#ffffff',
          width: '100%',
          maxWidth: '1000px',
          margin: '0 auto 20px',
          borderRadius: '8px',
          border: '2px solid #cbd5e1',
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
          padding: '10px 0',
        }}
      >
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            margin: '0 auto',
          }}
        >
          {lines}
          {texts}
        </svg>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '15px',
        }}
      >
        <button
          className="btn"
          style={{
            background: 'linear-gradient(45deg, #2563eb, #1e40af)',
            width: '250px',
            fontSize: '1.2rem',
            padding: '15px',
            margin: 0,
          }}
          onClick={handleNext}
        >
          {isFinished ? 'メニューへ戻る' : `第${currentRound}回戦を開始`}
        </button>
        {!isFinished && (
          <button
            className="btn"
            style={{
              background: '#475569',
              width: '250px',
              fontSize: '1.2rem',
              padding: '15px',
              margin: 0,
            }}
            onClick={handleSuspend}
          >
            一時中断して戻る
          </button>
        )}
      </div>
    </div>
  );
}

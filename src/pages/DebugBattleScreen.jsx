import { useMemo, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import { prepareBattle } from '../game/battle.js';
import { GameState } from '../state/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';

/**
 * デバッグ用バトル設定画面
 *
 * 戦闘プリセット（手札・山札・墓地・場・SP・HP・先攻/後攻）を指定し、
 * 即座にバトルを開始できるデバッグ専用画面。
 * GameState.battlePreset を設定して prepareBattle() を呼ぶ。
 */

// 使用するカードのみ抽出（トークンを除外）
const PLAYABLE_CARDS = CARD_MASTER.filter((c) => !c.isToken);
const TOKEN_CARDS = CARD_MASTER.filter((c) => c.isToken);

// 基本キャラクターリスト（短縮名付き）
const BASE_CHARACTERS = [
  { id: 'android', label: 'アイギス' },
  { id: 'dragon', label: 'イグニス' },
  { id: 'knight', label: 'セレスティア' },
  { id: 'cthulhu', label: 'ナイア' },
  { id: 'elf', label: 'リナ' },
  { id: 'cleric', label: 'エリシア' },
  { id: 'devilhunter', label: 'マリア' },
  { id: 'witch', label: 'クロエ' },
  { id: 'oni', label: 'カグラ' },
  { id: 'priest', label: 'ネフティ' },
];

// ゲームモード選択肢
const GAME_MODES = [
  { value: 'free', label: 'フリーバトル' },
  { value: 'high', label: '高難易度' },
];

// AI難易度
const AI_LEVELS = [
  { value: 1, label: '弱い' },
  { value: 2, label: '普通' },
  { value: 3, label: '強い' },
];

export default function DebugBattleScreen() {
  // --- キャラ選択 ---
  const [playerCharId, setPlayerCharId] = useState('android');
  const [enemyCharId, setEnemyCharId] = useState('witch');
  const [gameMode, setGameMode] = useState('free');
  const [aiLevel, setAiLevel] = useState(2);
  const [firstPlayer, setFirstPlayer] = useState('random');

  // --- プリセットフィールド ---
  const [playerSP, setPlayerSP] = useState('');
  const [enemySP, setEnemySP] = useState('');
  const [playerHP, setPlayerHP] = useState('');
  const [enemyHP, setEnemyHP] = useState('');
  const [turnCount, setTurnCount] = useState('');

  // --- カード配列（カンマ区切りのカードID文字列） ---
  const [playerHand, setPlayerHand] = useState('');
  const [enemyHand, setEnemyHand] = useState('');
  const [playerDeck, setPlayerDeck] = useState('');
  const [enemyDeck, setEnemyDeck] = useState('');
  const [playerDiscard, setPlayerDiscard] = useState('');
  const [enemyDiscard, setEnemyDiscard] = useState('');
  const [playerBoard, setPlayerBoard] = useState(',,');
  const [enemyBoard, setEnemyBoard] = useState(',,');

  // --- カード検索 ---
  const [searchQuery, setSearchQuery] = useState('');
  const [showTokens, setShowTokens] = useState(false);

  // カード検索結果
  const filteredCards = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    const pool = showTokens
      ? [...PLAYABLE_CARDS, ...TOKEN_CARDS]
      : PLAYABLE_CARDS;
    return pool
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [searchQuery, showTokens]);

  // --- バトル開始 ---
  const handleStartBattle = () => {
    // プレイヤーは常に通常キャラ、敵はモードに応じて通常/高難易度を自動選択
    const playerChar = CHARACTERS[playerCharId];
    const actualEnemyId =
      gameMode === 'high' ? `${enemyCharId}_high` : enemyCharId;
    const enemyChar = CHARACTERS[actualEnemyId];
    if (!playerChar || !enemyChar) {
      alert(
        `キャラクターが見つかりません (player: ${playerCharId}, enemy: ${actualEnemyId})`
      );
      return;
    }

    // ゲームモードの決定（高難易度の場合はevent_XXX_high形式にする）
    const actualGameMode =
      gameMode === 'high' ? `event_${enemyCharId}_high` : gameMode;

    GameState.playerConfig = JSON.parse(JSON.stringify(playerChar));
    GameState.enemyConfig = JSON.parse(JSON.stringify(enemyChar));
    GameState.gameMode = actualGameMode;
    GameState.aiLevel = aiLevel;
    GameState.appState = 'battle';

    // プリセットの構築
    const preset = {};

    // 数値フィールド
    if (playerSP !== '') preset.playerSP = parseInt(playerSP, 10);
    if (enemySP !== '') preset.enemySP = parseInt(enemySP, 10);
    if (playerHP !== '') preset.playerHP = parseInt(playerHP, 10);
    if (enemyHP !== '') preset.enemyHP = parseInt(enemyHP, 10);
    if (turnCount !== '') preset.turnCount = parseInt(turnCount, 10);

    // 先攻/後攻
    if (firstPlayer !== 'random') {
      preset.firstPlayer = firstPlayer;
    }

    // カード配列のパース（カンマ区切りのID文字列 → 配列）
    const parseCardIds = (str) => {
      if (!str || !str.trim()) return undefined;
      return str
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    };

    const pH = parseCardIds(playerHand);
    const eH = parseCardIds(enemyHand);
    const pDk = parseCardIds(playerDeck);
    const eDk = parseCardIds(enemyDeck);
    const pDc = parseCardIds(playerDiscard);
    const eDc = parseCardIds(enemyDiscard);

    if (pH) preset.playerHand = pH;
    if (eH) preset.enemyHand = eH;
    if (pDk) preset.playerDeck = pDk;
    if (eDk) preset.enemyDeck = eDk;
    if (pDc) preset.playerDiscard = pDc;
    if (eDc) preset.enemyDiscard = eDc;

    // 場のパース（カンマ区切り、空はnull）
    const parseBoardIds = (str) => {
      if (!str) return undefined;
      const parts = str.split(',').map((s) => s.trim() || null);
      if (parts.every((p) => p === null)) return undefined;
      return parts;
    };

    const pB = parseBoardIds(playerBoard);
    const eB = parseBoardIds(enemyBoard);
    if (pB) preset.playerBoard = pB;
    if (eB) preset.enemyBoard = eB;

    // プリセットが空でない場合のみ設定
    if (Object.keys(preset).length > 0) {
      GameState.battlePreset = preset;
      console.log('[Debug] BattlePreset:', JSON.stringify(preset));
    }

    // デッキ選択（プレイヤーのデッキをセット）
    const defaultDeck =
      GameState.decks && GameState.decks.length > 0 ? GameState.decks[0] : null;
    if (defaultDeck) {
      GameState.playerDeckSelection = defaultDeck.cards
        .map((id) => {
          const master = CARD_MASTER.find((m) => m.id === id);
          return master ? { ...master } : null;
        })
        .filter(Boolean);
      GameState.selectedDeckIndex = 0;
    }

    prepareBattle();
  };

  // スタイル
  const containerStyle = {
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    minHeight: '100%',
    color: '#e2e8f0',
    padding: '12px 16px 40px 16px',
    fontFamily: "'Inter', sans-serif",
    maxWidth: '500px',
    margin: '0 auto',
  };

  const sectionStyle = {
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  const labelStyle = {
    fontSize: '11px',
    color: '#94a3b8',
    display: 'block',
    marginBottom: '3px',
    fontWeight: 600,
  };

  const inputStyle = {
    width: '100%',
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '4px',
    color: '#e2e8f0',
    padding: '6px 8px',
    fontSize: '12px',
    boxSizing: 'border-box',
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const rowStyle = {
    display: 'flex',
    gap: '8px',
    marginBottom: '6px',
  };

  const btnStyle = {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
    marginTop: '8px',
  };

  const backBtnStyle = {
    background: 'rgba(255,255,255,0.1)',
    color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    cursor: 'pointer',
  };

  const cardChipStyle = {
    display: 'inline-block',
    background: 'rgba(99,102,241,0.2)',
    border: '1px solid rgba(99,102,241,0.4)',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '10px',
    color: '#a5b4fc',
    cursor: 'pointer',
    margin: '2px',
  };

  return (
    <div
      id="screen-debug-battle"
      className="screen active"
      style={{ overflowY: 'auto', padding: 0 }}
    >
      <div style={containerStyle}>
        {/* ヘッダー */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              margin: 0,
              color: '#a5b4fc',
            }}
          >
            🔧 デバッグバトル
          </h2>
          <BackButton to="screen-mode-select" style={backBtnStyle} />
        </div>

        {/* キャラ＆モード設定 */}
        <div style={sectionStyle}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '6px',
              color: '#a5b4fc',
            }}
          >
            キャラクター & モード
          </div>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>プレイヤー</label>
              <select
                style={selectStyle}
                value={playerCharId}
                onChange={(e) => setPlayerCharId(e.target.value)}
              >
                {BASE_CHARACTERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>敵</label>
              <select
                style={selectStyle}
                value={enemyCharId}
                onChange={(e) => setEnemyCharId(e.target.value)}
              >
                {BASE_CHARACTERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>ゲームモード</label>
              <select
                style={selectStyle}
                value={gameMode}
                onChange={(e) => setGameMode(e.target.value)}
              >
                {GAME_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>AI難易度</label>
              <select
                style={selectStyle}
                value={aiLevel}
                onChange={(e) => setAiLevel(Number(e.target.value))}
              >
                {AI_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>先攻</label>
              <select
                style={selectStyle}
                value={firstPlayer}
                onChange={(e) => setFirstPlayer(e.target.value)}
              >
                <option value="random">ランダム</option>
                <option value="blue">プレイヤー</option>
                <option value="red">敵</option>
              </select>
            </div>
          </div>
        </div>

        {/* HP / SP / ターン */}
        <div style={sectionStyle}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '6px',
              color: '#a5b4fc',
            }}
          >
            ステータス (空欄=デフォルト)
          </div>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>プレイヤーHP</label>
              <input
                style={inputStyle}
                type="number"
                value={playerHP}
                onChange={(e) => setPlayerHP(e.target.value)}
                placeholder="20"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>敵HP</label>
              <input
                style={inputStyle}
                type="number"
                value={enemyHP}
                onChange={(e) => setEnemyHP(e.target.value)}
                placeholder="20"
              />
            </div>
          </div>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>プレイヤーSP</label>
              <input
                id="input-player-sp"
                style={inputStyle}
                type="number"
                value={playerSP}
                onChange={(e) => setPlayerSP(e.target.value)}
                placeholder="0"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>敵SP</label>
              <input
                style={inputStyle}
                type="number"
                value={enemySP}
                onChange={(e) => setEnemySP(e.target.value)}
                placeholder="0"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>ターン数</label>
              <input
                style={inputStyle}
                type="number"
                value={turnCount}
                onChange={(e) => setTurnCount(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>
        </div>

        {/* 手札 */}
        <div style={sectionStyle}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '6px',
              color: '#a5b4fc',
            }}
          >
            手札 (カードIDをカンマ区切り、空=デフォルト)
          </div>
          <div style={{ marginBottom: '4px' }}>
            <label style={labelStyle}>プレイヤー手札</label>
            <input
              id="input-player-hand"
              style={inputStyle}
              value={playerHand}
              onChange={(e) => setPlayerHand(e.target.value)}
              placeholder="例: beginner_magic,golem,knight"
            />
          </div>
          <div>
            <label style={labelStyle}>敵手札</label>
            <input
              style={inputStyle}
              value={enemyHand}
              onChange={(e) => setEnemyHand(e.target.value)}
              placeholder="例: beginner_magic,golem,knight"
            />
          </div>
        </div>

        {/* 山札・墓地 */}
        <div style={sectionStyle}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '6px',
              color: '#a5b4fc',
            }}
          >
            山札・墓地 (空=デフォルト)
          </div>
          <div style={{ marginBottom: '4px' }}>
            <label style={labelStyle}>プレイヤー山札</label>
            <input
              style={inputStyle}
              value={playerDeck}
              onChange={(e) => setPlayerDeck(e.target.value)}
              placeholder="カードIDをカンマ区切り"
            />
          </div>
          <div style={{ marginBottom: '4px' }}>
            <label style={labelStyle}>敵山札</label>
            <input
              style={inputStyle}
              value={enemyDeck}
              onChange={(e) => setEnemyDeck(e.target.value)}
              placeholder="カードIDをカンマ区切り"
            />
          </div>
          <div style={{ marginBottom: '4px' }}>
            <label style={labelStyle}>プレイヤー墓地</label>
            <input
              style={inputStyle}
              value={playerDiscard}
              onChange={(e) => setPlayerDiscard(e.target.value)}
              placeholder="カードIDをカンマ区切り"
            />
          </div>
          <div>
            <label style={labelStyle}>敵墓地</label>
            <input
              style={inputStyle}
              value={enemyDiscard}
              onChange={(e) => setEnemyDiscard(e.target.value)}
              placeholder="カードIDをカンマ区切り"
            />
          </div>
        </div>

        {/* 場 */}
        <div style={sectionStyle}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '6px',
              color: '#a5b4fc',
            }}
          >
            場 (左,中,右 | 空=なし)
          </div>
          <div style={{ marginBottom: '4px' }}>
            <label style={labelStyle}>プレイヤーの場</label>
            <input
              style={inputStyle}
              value={playerBoard}
              onChange={(e) => setPlayerBoard(e.target.value)}
              placeholder="例: knight,,golem"
            />
          </div>
          <div>
            <label style={labelStyle}>敵の場</label>
            <input
              id="input-enemy-board"
              style={inputStyle}
              value={enemyBoard}
              onChange={(e) => setEnemyBoard(e.target.value)}
              placeholder="例: ,dragon,"
            />
          </div>
        </div>

        {/* カード検索ヘルパー */}
        <div style={sectionStyle}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '6px',
              color: '#a5b4fc',
            }}
          >
            🔍 カードID検索
          </div>
          <div style={rowStyle}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="カード名 or IDで検索..."
            />
            <label
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={showTokens}
                onChange={(e) => setShowTokens(e.target.checked)}
              />
              トークン
            </label>
          </div>
          {filteredCards.length > 0 && (
            <div
              style={{
                maxHeight: '120px',
                overflowY: 'auto',
                marginTop: '4px',
              }}
            >
              {filteredCards.map((c) => (
                <div
                  key={c.id}
                  style={cardChipStyle}
                  title={`クリックしてコピー: ${c.id}`}
                  onClick={() => navigator.clipboard.writeText(c.id)}
                >
                  {c.name} <span style={{ opacity: 0.6 }}>({c.id})</span> P:
                  {c.power}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 開始ボタン */}
        <button
          id="btn-start-debug-battle"
          style={btnStyle}
          onClick={handleStartBattle}
        >
          ⚔️ バトル開始
        </button>
      </div>
    </div>
  );
}

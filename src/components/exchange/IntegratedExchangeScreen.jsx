import { useCallback, useEffect, useRef, useState } from 'react';
import CompactScreenLayout from '../common/CompactScreenLayout.jsx';
import ExchangeItemCard from '../common/ExchangeItemCard.jsx';
import { useEasterEgg } from '../../hooks/useEasterEgg.js';
import { useExchangeScreen } from '../../hooks/useExchangeScreen.js';
import { useGridVirtualizer } from '../../hooks/useGridVirtualizer.js';
import { showAlertModal, showConfirmModal } from '../../services/uiModals.js';
import {
  DEFENSE_POINTS_KEY,
  DEFENSE_TOTAL_POINTS_KEY,
  CHALLENGE_POINTS_KEY,
  CHALLENGE_TOTAL_POINTS_KEY,
  TOURNAMENT_POINTS_KEY,
  TOURNAMENT_TOTAL_POINTS_KEY,
  HIGH_DIFFICULTY_POINTS_KEY,
  HIGH_DIFFICULTY_TOTAL_POINTS_KEY,
  FORTUNE_POINTS_KEY,
  FORTUNE_TOTAL_POINTS_KEY,
} from '../../utils/constants/config.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * 統合交換所の各イベントタブ設定定義一覧
 * 各イベントのテーマカラー、背景画像、APIエンドポイント、ポイントキー、戻り先メニューを一元管理します。
 * @type {ReadonlyArray<Readonly<{
 *   mode: string,
 *   label: string,
 *   pointLabel: string,
 *   color: string,
 *   bg: string,
 *   backTo: string,
 *   apiEndpoint: string,
 *   pointsKey: string,
 *   pointsLocalKey: string,
 *   pointsTotalLocalKey: string,
 *   easterEggName: string
 * }>>}
 */
const EXCHANGE_TABS = Object.freeze([
  {
    mode: 'high_difficulty',
    label: '高難易度',
    pointLabel: '高難易度ポイント',
    color: '#ef4444',
    bg: 'background_highdifficulty.webp',
    backTo: 'screen-high-difficulty-menu',
    apiEndpoint: 'update_high_difficulty_points.php',
    pointsKey: 'high_difficulty',
    pointsLocalKey: HIGH_DIFFICULTY_POINTS_KEY,
    pointsTotalLocalKey: HIGH_DIFFICULTY_TOTAL_POINTS_KEY,
    easterEggName: '高難易度',
  },
  {
    mode: 'defense',
    label: '防衛戦',
    pointLabel: '防衛ポイント',
    color: '#10b981',
    bg: 'background_defense.webp',
    backTo: 'screen-defense-menu',
    apiEndpoint: 'update_points.php',
    pointsKey: 'defense',
    pointsLocalKey: DEFENSE_POINTS_KEY,
    pointsTotalLocalKey: DEFENSE_TOTAL_POINTS_KEY,
    easterEggName: '防衛',
  },
  {
    mode: 'challenge',
    label: '試練の宮殿',
    pointLabel: '試練ポイント',
    color: '#c084fc',
    bg: 'background_challenge.webp',
    backTo: 'screen-dungeon-menu',
    apiEndpoint: 'update_challenge_points.php',
    pointsKey: 'challenge',
    pointsLocalKey: CHALLENGE_POINTS_KEY,
    pointsTotalLocalKey: CHALLENGE_TOTAL_POINTS_KEY,
    easterEggName: '試練',
  },
  {
    mode: 'tournament',
    label: '夢幻の闘技祭',
    pointLabel: '大会ポイント',
    color: '#60a5fa',
    bg: 'background_tournament01.webp',
    backTo: 'screen-tournament-menu',
    apiEndpoint: 'update_tournament_points.php',
    pointsKey: 'tournament',
    pointsLocalKey: TOURNAMENT_POINTS_KEY,
    pointsTotalLocalKey: TOURNAMENT_TOTAL_POINTS_KEY,
    easterEggName: '大会',
  },
  {
    mode: 'fortune',
    label: '運命の邂逅',
    pointLabel: '運命ポイント',
    color: '#f97316',
    bg: 'background_fortune01.webp',
    backTo: 'screen-fortune-menu',
    apiEndpoint: 'update_fortune_points.php',
    pointsKey: 'fortune',
    pointsLocalKey: FORTUNE_POINTS_KEY,
    pointsTotalLocalKey: FORTUNE_TOTAL_POINTS_KEY,
    easterEggName: '運命の邂逅',
  },
]);

/**
 * 交換所タブコンテンツコンポーネント。
 * 指定されたイベント設定（tabConfig）に基づき、ポイント管理・サーバー同期・仮想化リスト描画・交換処理を行います。
 * key属性によってイベント切り替えごとに再マウントされ、各モードのデータが完全に分離されます。
 *
 * @param {Object} props
 * @param {Object} props.tabConfig - 選択中イベントの定義オブジェクト
 * @param {Function} [props.onMountDebugGrant] - デバッグポイント付与関数の登録コールバック
 * @returns {JSX.Element} タブコンテンツ要素
 */
function ExchangeTabContent({ tabConfig, onMountDebugGrant }) {
  const {
    points,
    inventory,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    unlockedPremium = [],
    lineup,
    handleExchange,
    grantDebugPoints,
  } = useExchangeScreen({
    pointsKey: tabConfig.pointsKey,
    pointsLocalKey: tabConfig.pointsLocalKey,
    pointsTotalLocalKey: tabConfig.pointsTotalLocalKey,
    apiEndpoint: tabConfig.apiEndpoint,
  });

  // 親コンポーネントのタイトルイースターエッグからポイント付与できるようハンドラを登録
  useEffect(() => {
    if (typeof onMountDebugGrant === 'function') {
      onMountDebugGrant(grantDebugPoints);
    }
  }, [grantDebugPoints, onMountDebugGrant]);

  // 大量アイテムでも高速スクロール可能な仮想化グリッドフック
  const { listContainerRef, rowVirtualizer, itemRows, gridCols, gridGap } =
    useGridVirtualizer({
      items: lineup || [],
    });

  return (
    <>
      <div
        id="exchange-points-display"
        style={{
          fontSize: '0.9rem',
          marginBottom: '10px',
          color: '#cbd5e1',
          textAlign: 'center',
        }}
      >
        {tabConfig.pointLabel || 'ポイント'}：所持 {points.current} Pt / 総{' '}
        {points.total} Pt
      </div>

      <div
        ref={listContainerRef}
        className="card-list-container"
        style={{
          flex: 1,
          minHeight: 0,
          maxHeight: '500px',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = itemRows[virtualRow.index] || [];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="card-list-grid-3col"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  gap: `${gridGap}px`,
                }}
              >
                {row.map((item) => (
                  <ExchangeItemCard
                    key={`${item.type}_${item.id}`}
                    item={item}
                    currentPoints={points.current}
                    inventory={inventory}
                    unlockedSkins={unlockedSkins}
                    unlockedPlaymats={unlockedPlaymats}
                    unlockedIcons={unlockedIcons}
                    unlockedPremium={unlockedPremium}
                    onExchange={handleExchange}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * 統合交換所メイン画面コンポーネント。
 * 全イベントの交換所を1画面に統合し、タブ切り替えによって閲覧・交換を提供します。
 *
 * @param {Object} props
 * @param {string} [props.id='screen-exchange'] - 画面ID（後方互換性用）
 * @param {string} [props.initialMode='high_difficulty'] - 初期選択イベントモード ('high_difficulty' | 'defense' | 'challenge' | 'tournament' | 'fortune')
 * @param {string} [props.backTo] - 戻るボタンの遷移先画面ID（省略時は現在の初期タブに応じたメニュー画面）
 * @param {Function} [props.switchScreen] - 画面遷移用コールバック（一部の画面から渡される場合に対応）
 * @returns {JSX.Element} 統合交換所画面
 */
export default function IntegratedExchangeScreen({
  id = 'screen-exchange',
  initialMode = 'high_difficulty',
  backTo: propBackTo,
  switchScreen,
}) {
  const [activeMode, setActiveMode] = useState(initialMode);
  const debugGrantRef = useRef(null);

  // 初期モードがプロパティから切り替わった場合に同期（ルーティング再訪時）
  useEffect(() => {
    setActiveMode(initialMode);
  }, [initialMode]);

  // 現在アクティブなイベントの設定オブジェクトを解決
  const currentTab =
    EXCHANGE_TABS.find((tab) => tab.mode === activeMode) || EXCHANGE_TABS[0];

  // タイトル10回クリックによるデバッグポイント獲得（アクティブなイベントに対して付与）
  const handleTitleClick = useEasterEgg(() => {
    const modeName = currentTab.easterEggName || currentTab.label;
    if (showConfirmModal) {
      showConfirmModal(
        `デバッグモードを起動して${modeName}ポイントを100Pt獲得しますか？`,
        () => {
          playSound?.(SOUNDS?.seSkill);
          debugGrantRef.current?.(100);
          if (showAlertModal) {
            showAlertModal(
              `【デバッグ】${modeName}ポイントを100Pt獲得しました！`
            );
          }
        }
      );
    }
  });

  /**
   * タブ切り替えクリックハンドラ
   * @param {string} mode - 切り替え先イベントモード
   */
  const handleTabChange = (mode) => {
    if (mode !== activeMode) {
      playSound(SOUNDS?.seClick);
      setActiveMode(mode);
    }
  };

  /**
   * 子コンポーネントからデバッグポイント付与関数を受け取るコールバック
   */
  const handleMountDebugGrant = useCallback((grantFn) => {
    debugGrantRef.current = grantFn;
  }, []);

  // 戻るボタンの遷移先: 指定されたpropBackToを最優先、なければ初期モードの戻り先
  const resolvedBackTo =
    propBackTo ||
    EXCHANGE_TABS.find((t) => t.mode === initialMode)?.backTo ||
    currentTab.backTo;

  /**
   * 戻るボタンクリックハンドラ（switchScreenが提供されている場合はそれを優先呼び出し）
   */
  const handleBackClick = () => {
    playSound(SOUNDS?.seClick);
    if (typeof switchScreen === 'function') {
      switchScreen(resolvedBackTo);
    }
  };

  return (
    <CompactScreenLayout
      id={id}
      backgroundImage={currentTab.bg}
      title="交換所"
      titleColor={currentTab.color}
      titleGlow={true}
      onTitleClick={handleTitleClick}
      onBackClick={switchScreen ? handleBackClick : undefined}
      backTo={resolvedBackTo}
    >
      {/* イベントタブ切り替えバー */}
      <div
        className="exchange-tab-bar"
        style={{
          display: 'flex',
          width: '95%',
          maxWidth: '440px',
          margin: '0 auto 10px auto',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          flexShrink: 0,
          background: 'rgba(15, 23, 42, 0.85)',
        }}
      >
        {EXCHANGE_TABS.map((tab) => {
          const isActive = activeMode === tab.mode;
          return (
            <button
              key={tab.mode}
              type="button"
              onClick={() => handleTabChange(tab.mode)}
              style={{
                flex: 1,
                padding: '8px 2px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                transition: 'all 0.2s ease',
                background: isActive
                  ? `linear-gradient(135deg, ${tab.color}dd, ${tab.color}88)`
                  : 'transparent',
                color: isActive ? '#fff' : '#94a3b8',
                borderBottom: isActive
                  ? `2px solid ${tab.color}`
                  : '2px solid transparent',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 選択中イベントのコンテンツ（keyによってタブ切り替え時にクリーンに再初期化） */}
      <ExchangeTabContent
        key={activeMode}
        tabConfig={currentTab}
        onMountDebugGrant={handleMountDebugGrant}
      />
    </CompactScreenLayout>
  );
}

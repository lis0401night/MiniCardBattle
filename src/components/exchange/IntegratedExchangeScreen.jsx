import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CompactScreenLayout from '../common/CompactScreenLayout.jsx';
import ExchangeItemCard from '../common/ExchangeItemCard.jsx';
import { useEasterEgg } from '../../hooks/useEasterEgg.js';
import { useExchangeScreen } from '../../hooks/useExchangeScreen.js';
import { useGridVirtualizer } from '../../hooks/useGridVirtualizer.js';
import { saveDeck } from '../../services/deck.js';
import { showAlertModal, showConfirmModal } from '../../services/uiModals.js';
import ExchangeQuantityModal from './ExchangeQuantityModal.jsx';
import PackOpeningModal from './PackOpeningModal.jsx';
import PointConversionModal from './PointConversionModal.jsx';
import { GameState } from '../../state/gameState.js';
import {
  getLatestOwnership,
  savePointsToServer,
  fetchPlayerDecks,
} from '../../utils/apiUtils.js';
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
  COMMON_POINTS_KEY,
  COMMON_TOTAL_POINTS_KEY,
  PACK_EXCHANGE_COST,
  INVENTORY_KEY,
} from '../../utils/constants/config.js';
import {
  PACK_MASTER,
  drawCardFromPack,
  getPackById,
} from '../../utils/constants/packs.js';
import {
  currentBgmAudio,
  getOrCreateUUID,
  playSound,
  switchScreen as defaultSwitchScreen,
} from '../../utils/gameUtils.js';
import { AUDIO_INSTANCES, getScreenBgm, SOUNDS } from '../../utils/sounds.js';

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
    mode: 'common',
    label: '共通',
    pointLabel: '共通ポイント',
    color: '#facc15',
    bg: 'background_shop.webp',
    backTo: 'screen-mode-select',
    apiEndpoint: 'update_common_points.php',
    pointsKey: 'common',
    pointsLocalKey: COMMON_POINTS_KEY,
    pointsTotalLocalKey: COMMON_TOTAL_POINTS_KEY,
    easterEggName: '共通',
  },
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
 * 共通交換所のコンテンツコンポーネント。
 * 共通ポイントの管理・表示、イースターエッグによるデバッグポイントチャージ、
 * パックの表示・開封および戦闘終了後と同様のカード入手演出（モーダル）を提供します。
 *
 * @param {Object} props
 * @param {Object} props.tabConfig - 共通交換所の定義オブジェクト
 * @param {Function} [props.onMountDebugGrant] - 親のイースターエッグ連動用デバッグポイント付与関数の登録コールバック
 * @returns {JSX.Element} 共通交換所コンテンツ要素
 */
function CommonExchangeTabContent({ tabConfig, onMountDebugGrant }) {
  // 共通ポイントステート（LocalStorageから読み込み）
  const [currentPoints, setCurrentPoints] = useState(() => {
    const savedCurrent = localStorage.getItem(COMMON_POINTS_KEY);
    return savedCurrent !== null ? parseInt(savedCurrent, 10) || 0 : 0;
  });
  const [totalPoints, setTotalPoints] = useState(() => {
    const savedTotal = localStorage.getItem(COMMON_TOTAL_POINTS_KEY);
    return savedTotal !== null ? parseInt(savedTotal, 10) || 0 : 0;
  });

  // パック開封演出中の二重実行防止フラグ
  const [isOpening, setIsOpening] = useState(false);
  // パック開封演出モーダル（パック画面）用データ
  const [packOpeningData, setPackOpeningData] = useState(null);
  // 個数確認モーダル対象アイテム
  const [quantityModalItem, setQuantityModalItem] = useState(null);
  // ポイント変換モーダル表示フラグ
  const [isConversionModalOpen, setIsConversionModalOpen] = useState(false);
  // プレイヤーの最新カードインベントリ
  const [inventory, setInventory] = useState(
    () => getLatestOwnership()?.inventory || {}
  );

  /**
   * デバッグ用ポイント付与ハンドラ
   * タイトルクリック等のイースターエッグから呼び出されます。
   *
   * @param {number} [amount=100] - 付与するポイント量
   */
  const grantDebugPoints = useCallback((amount = 100) => {
    let nextCurrent = 0;
    let nextTotal = 0;
    setCurrentPoints((prev) => {
      const next = prev + amount;
      localStorage.setItem(COMMON_POINTS_KEY, String(next));
      nextCurrent = next;
      return next;
    });
    setTotalPoints((prev) => {
      const next = prev + amount;
      localStorage.setItem(COMMON_TOTAL_POINTS_KEY, String(next));
      nextTotal = next;
      return next;
    });
    // サーバーへ共通ポイントを同期保存
    savePointsToServer('update_common_points.php', nextCurrent, nextTotal);
  }, []);

  // 親コンポーネントのタイトルイースターエッグへデバッグ付与関数を登録
  useEffect(() => {
    if (typeof onMountDebugGrant === 'function') {
      onMountDebugGrant(grantDebugPoints);
    }
  }, [grantDebugPoints, onMountDebugGrant]);

  // マウント時: サーバーからプレイヤーデータを取得し、共通ポイントをローカルと同期・復元
  useEffect(() => {
    let cancelled = false;

    /**
     * サーバー上の共通ポイントを取得し、ローカルデータと安全にマージする非同期処理
     */
    const fetchCommonPoints = async () => {
      try {
        const result = await fetchPlayerDecks();
        if (cancelled) return;
        if (result?.success) {
          const myUuid = getOrCreateUUID?.();
          const myData = result.players?.find((p) => p.uuid === myUuid);
          if (myData) {
            const serverPts = myData.common_points || 0;
            const serverTotalPts = myData.common_total_points || serverPts || 0;

            const curLocal =
              parseInt(localStorage.getItem(COMMON_POINTS_KEY), 10) || 0;
            const totLocal =
              parseInt(localStorage.getItem(COMMON_TOTAL_POINTS_KEY), 10) || 0;

            const mergedCur = Math.max(curLocal, serverPts);
            const mergedTot = Math.max(totLocal, serverTotalPts);

            if (mergedCur !== curLocal) {
              localStorage.setItem(COMMON_POINTS_KEY, String(mergedCur));
              setCurrentPoints(mergedCur);
            }
            if (mergedTot !== totLocal) {
              localStorage.setItem(COMMON_TOTAL_POINTS_KEY, String(mergedTot));
              setTotalPoints(mergedTot);
            }
          }
        }
      } catch (err) {
        console.warn(
          '[CommonExchange] サーバーからの共通ポイント取得をスキップしました:',
          err
        );
      }
    };

    fetchCommonPoints();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * パック交換・開封処理ハンドラ
   * 指定個数分の共通ポイントを消費し、パックからカードを抽選してインベントリに保存後、
   * パック画面（タップしてパックを開封する演出モーダル）を表示します。
   *
   * @param {Object} pack - 交換対象のパック定義オブジェクト
   * @param {number} [count=1] - 交換パック個数
   */
  const handleOpenPack = useCallback(
    (pack, count = 1) => {
      if (isOpening) return;
      const safeCount = Math.max(1, Math.floor(Number(count) || 1));
      const singleCost = pack.cost ?? PACK_EXCHANGE_COST;
      const totalCost = singleCost * safeCount;

      // ポイント残高チェック
      if (currentPoints < totalCost) {
        showAlertModal('ポイントが不足しています。');
        return;
      }

      setIsOpening(true);

      try {
        playSound?.(SOUNDS?.seCardPlace);

        // 1. 共通ポイントを減算してLocalStorageに保存
        const newCurrent = currentPoints - totalCost;
        setCurrentPoints(newCurrent);
        localStorage.setItem(COMMON_POINTS_KEY, String(newCurrent));
        // サーバーへ共通ポイントを同期保存
        savePointsToServer('update_common_points.php', newCurrent, totalPoints);

        // 2. 最新の所持状況を取得してパックからカードを抽選（4枚所持カードは除外）
        const latestOwnership = getLatestOwnership();
        const currentInventory = { ...(latestOwnership?.inventory || {}) };
        const drawnCardIds = [];

        for (let i = 0; i < safeCount; i++) {
          const drawnCardId = drawCardFromPack(pack.id, currentInventory);
          if (!drawnCardId) break;
          drawnCardIds.push(drawnCardId);
          // 4枚カンスト除外ルールを次回の抽選ループに反映するため一時カウント
          currentInventory[drawnCardId] =
            (currentInventory[drawnCardId] || 0) + 1;
        }

        if (drawnCardIds.length === 0) {
          showAlertModal('カードの抽選に失敗しました。');
          setIsOpening(false);
          return;
        }

        // 3. インベントリを更新・保存
        Object.assign(GameState, { playerInventory: currentInventory });
        localStorage.setItem(INVENTORY_KEY, JSON.stringify(currentInventory));
        setInventory({ ...currentInventory });
        if (typeof saveDeck === 'function') {
          saveDeck();
        }

        // 4. パック開封画面（パックをタップして開封しカードを入手するモーダル）を表示
        setPackOpeningData({
          cardIds: drawnCardIds,
          coverCardId: pack.coverCardId || 'catastrophe',
          logoUrl: pack.logoUrl,
        });
      } catch (err) {
        console.error(
          '[CommonExchange] パック開封中にエラーが発生しました:',
          err
        );
        showAlertModal('パック開封中にエラーが発生しました。');
        setIsOpening(false);
      }
    },
    [isOpening, currentPoints, totalPoints]
  );

  // 共通交換所ラインナップ
  const lineup = useMemo(
    () =>
      PACK_MASTER.map((pack) => ({
        id: pack.id,
        type: 'pack',
        cost: pack.cost,
        name: pack.name,
        description: pack.description,
        coverCardId: pack.coverCardId || 'catastrophe',
        logoUrl: pack.logoUrl,
        packObj: pack,
      })),
    []
  );

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
        {tabConfig?.pointLabel || '共通ポイント'}：所持 {currentPoints} Pt / 総{' '}
        {totalPoints} Pt
      </div>

      <div
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
          className="card-list-grid-3col"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            padding: '4px',
          }}
        >
          {/* ポイント変換枠（パックの左に商品として配置） */}
          <div
            className="deck-card-item point-conversion-item"
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'transform 0.15s ease',
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              setIsConversionModalOpen(true);
            }}
            title="他イベントのポイントを共通ポイントに変換します"
          >
            <div
              className="card blue"
              style={{
                backgroundColor: '#0f172a',
                border: '2px solid #eab308',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(234, 179, 8, 0.25)',
                overflow: 'hidden',
              }}
            >
              {/* カード内部コンテンツ全体を上下左右中央揃えにするラッパー */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 4px',
                  boxSizing: 'border-box',
                  position: 'relative',
                  textAlign: 'center',
                }}
              >
                {/* 背景グロー装飾（中央配置） */}
                <div
                  style={{
                    position: 'absolute',
                    width: '120px',
                    height: '120px',
                    background:
                      'radial-gradient(circle, rgba(234, 179, 8, 0.2) 0%, transparent 70%)',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                  }}
                />

                {/* 上部バッジ */}
                <div
                  style={{
                    position: 'absolute',
                    top: '4px',
                    left: '4px',
                    background: 'rgba(234, 179, 8, 0.95)',
                    color: '#000000',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontWeight: 'bold',
                    fontSize: '0.65rem',
                    zIndex: 2,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                  }}
                >
                  変換
                </div>

                {/* アイコン */}
                <div
                  style={{
                    fontSize: '2.2rem',
                    marginBottom: '6px',
                    filter:
                      'drop-shadow(0 2px 8px rgba(56, 189, 248, 0.7)) drop-shadow(0 0 12px rgba(250, 204, 21, 0.5))',
                    lineHeight: 1,
                    zIndex: 1,
                  }}
                >
                  💎
                </div>

                {/* タイトル */}
                <div
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    color: '#facc15',
                    marginBottom: '4px',
                    textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)',
                    zIndex: 1,
                  }}
                >
                  ポイント変換
                </div>

                {/* 説明テキスト */}
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: '#94a3b8',
                    lineHeight: '1.25',
                    zIndex: 1,
                    padding: '0 2px',
                    marginBottom: '8px',
                  }}
                >
                  各イベントPtを
                  <br />
                  共通Ptへ変換
                </div>

                {/* アクションボタン風表示 */}
                <div
                  style={{
                    padding: '2px 10px',
                    background: 'linear-gradient(45deg, #eab308, #ca8a04)',
                    color: '#000000',
                    borderRadius: '12px',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    zIndex: 1,
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  変換する
                </div>
              </div>
            </div>
          </div>

          {/* 拡張パック */}
          {lineup.map((item) => (
            <ExchangeItemCard
              key={`${item.type}_${item.id}`}
              item={item}
              currentPoints={currentPoints}
              inventory={inventory}
              onExchange={(clickedItem) => {
                const target = clickedItem || item;
                const pack =
                  target.packObj ||
                  getPackById(target.packId || target.id || target) ||
                  PACK_MASTER[0];
                setQuantityModalItem({
                  ...pack,
                  ...target,
                  type: 'pack',
                  packObj: pack,
                  cost: target.cost ?? pack.cost ?? PACK_EXCHANGE_COST,
                });
              }}
            />
          ))}
        </div>
      </div>

      {/* ポイント変換モーダル */}
      {isConversionModalOpen && (
        <PointConversionModal
          commonPoints={currentPoints}
          onSuccess={(_summary, totalAmount, newCommon) => {
            setCurrentPoints(newCommon);
            const savedTot =
              parseInt(localStorage.getItem(COMMON_TOTAL_POINTS_KEY), 10) ||
              totalPoints + totalAmount;
            setTotalPoints(savedTot);
          }}
          onClose={() => setIsConversionModalOpen(false)}
        />
      )}

      {/* 交換個数確認モーダル */}
      {quantityModalItem && (
        <ExchangeQuantityModal
          item={quantityModalItem}
          currentPoints={currentPoints}
          inventory={inventory}
          onConfirm={(targetItem, chosenCount) => {
            setQuantityModalItem(null);
            handleOpenPack(targetItem.packObj || targetItem, chosenCount);
          }}
          onCancel={() => setQuantityModalItem(null)}
        />
      )}

      {/* パック開封演出モーダル（パック画面から開封してカード入手画面へ遷移） */}
      {packOpeningData && (
        <PackOpeningModal
          cardIds={packOpeningData.cardIds}
          coverCardId={packOpeningData.coverCardId}
          logoUrl={packOpeningData.logoUrl}
          onClose={() => {
            setPackOpeningData(null);
            setIsOpening(false);
          }}
        />
      )}
    </>
  );
}

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

  // 個数確認モーダル対象アイテム
  const [quantityModalItem, setQuantityModalItem] = useState(null);

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
                    onExchange={setQuantityModalItem}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* 交換個数確認モーダル */}
      {quantityModalItem && (
        <ExchangeQuantityModal
          item={quantityModalItem}
          currentPoints={points.current}
          inventory={inventory}
          onConfirm={(targetItem, chosenCount) => {
            setQuantityModalItem(null);
            handleExchange(targetItem, chosenCount);
          }}
          onCancel={() => setQuantityModalItem(null)}
        />
      )}
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
  initialMode = 'common',
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

  // 現在選択されているタブのインデックス
  const currentTabIndex = EXCHANGE_TABS.findIndex(
    (tab) => tab.mode === activeMode
  );

  /**
   * 前のイベントタブへ切り替えるハンドラ
   */
  const handlePrevTab = () => {
    playSound?.(SOUNDS?.seClick);
    const prevIndex =
      (currentTabIndex - 1 + EXCHANGE_TABS.length) % EXCHANGE_TABS.length;
    setActiveMode(EXCHANGE_TABS[prevIndex].mode);
  };

  /**
   * 次のイベントタブへ切り替えるハンドラ
   */
  const handleNextTab = () => {
    playSound?.(SOUNDS?.seClick);
    const nextIndex = (currentTabIndex + 1) % EXCHANGE_TABS.length;
    setActiveMode(EXCHANGE_TABS[nextIndex].mode);
  };

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

  // 交換所画面マウント時にショップBGMを再生し、アンマウント時（画面離脱時）に元の画面のBGMへ復帰
  useEffect(() => {
    playSound(AUDIO_INSTANCES.bgmShop);

    return () => {
      // 交換所から離れる際、再生中のBGMがショップBGMのままの場合は戻り先画面のBGMを復帰
      if (currentBgmAudio === AUDIO_INSTANCES.bgmShop) {
        const restoreBgm = getScreenBgm(resolvedBackTo);
        if (restoreBgm) {
          playSound(restoreBgm);
        }
      }
    };
  }, [resolvedBackTo]);

  /**
   * 戻るボタンクリックハンドラ
   * クリック音および戻り先画面に対応するBGMの復帰を行い、指定の画面へ遷移します。
   */
  const handleBackClick = useCallback(() => {
    playSound(SOUNDS?.seClick);
    const restoreBgm = getScreenBgm(resolvedBackTo);
    if (restoreBgm) {
      playSound(restoreBgm);
    }
    if (typeof switchScreen === 'function') {
      switchScreen(resolvedBackTo);
    } else {
      defaultSwitchScreen(resolvedBackTo);
    }
  }, [resolvedBackTo, switchScreen]);

  return (
    <CompactScreenLayout
      id={id}
      backgroundImage={currentTab.bg}
      title="交換所"
      titleColor={currentTab.color}
      titleGlow={true}
      onTitleClick={handleTitleClick}
      onBackClick={handleBackClick}
      backTo={resolvedBackTo}
    >
      {/* イベントタブ切り替えバー（現在のタブのみ表示＋左右ボタンで切り替え） */}
      <div
        className="exchange-tab-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '90%',
          maxWidth: '340px',
          margin: '0 auto 10px auto',
          borderRadius: '8px',
          padding: '4px',
          border: `1px solid ${currentTab.color}66`,
          flexShrink: 0,
          background: 'rgba(15, 23, 42, 0.85)',
          boxShadow: `0 2px 10px ${currentTab.color}22`,
        }}
      >
        <button
          type="button"
          onClick={handlePrevTab}
          aria-label="前の交換所へ"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: '#cbd5e1',
            fontSize: '1rem',
            width: '38px',
            height: '38px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            userSelect: 'none',
            touchAction: 'manipulation',
          }}
        >
          ◀
        </button>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px 8px',
            userSelect: 'none',
          }}
        >
          <span
            style={{
              fontWeight: 'bold',
              fontSize: '1rem',
              color: currentTab.color,
              textShadow: `0 0 10px ${currentTab.color}88`,
              letterSpacing: '1px',
            }}
          >
            {currentTab.label}
          </span>
          <div
            style={{
              display: 'flex',
              gap: '5px',
              marginTop: '4px',
            }}
          >
            {EXCHANGE_TABS.map((tab, idx) => (
              <span
                key={tab.mode}
                onClick={() => handleTabChange(tab.mode)}
                style={{
                  width: idx === currentTabIndex ? '14px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  background:
                    idx === currentTabIndex
                      ? currentTab.color
                      : 'rgba(148, 163, 184, 0.3)',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleNextTab}
          aria-label="次の交換所へ"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: '#cbd5e1',
            fontSize: '1rem',
            width: '38px',
            height: '38px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            userSelect: 'none',
            touchAction: 'manipulation',
          }}
        >
          ▶
        </button>
      </div>

      {/* 選択中イベントのコンテンツ（keyによってタブ切り替え時にクリーンに再初期化） */}
      {currentTab.mode === 'common' ? (
        <CommonExchangeTabContent
          key="common"
          tabConfig={currentTab}
          onMountDebugGrant={handleMountDebugGrant}
        />
      ) : (
        <ExchangeTabContent
          key={activeMode}
          tabConfig={currentTab}
          onMountDebugGrant={handleMountDebugGrant}
        />
      )}
    </CompactScreenLayout>
  );
}

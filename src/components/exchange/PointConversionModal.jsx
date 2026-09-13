/**
 * ポイント変換モーダルコンポーネント（一括合算変換対応）
 *
 * 共通交換所において、各種イベントポイント（高難易度・防衛・大会・試練）を
 * 複数同時に選択・合算し、1回のアクションで一括して共通ポイントへ不可逆変換できるモーダルUI。
 * 各モードの個別数量セレクター、一括最大・リセット操作、合算内訳プレビュー、
 * 各モードの残高自己修復用累計消費記録（reconcilePointsWithPurchases用）およびサーバー同期を提供します。
 */

import { useCallback, useMemo, useState } from 'react';
import {
  addConvertedPointsByMode,
  savePointsToServer,
} from '../../utils/apiUtils.js';
import {
  COMMON_POINTS_KEY,
  COMMON_TOTAL_POINTS_KEY,
  POINT_CONVERSION_MODES,
} from '../../utils/constants/config.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * ポイント変換モーダルコンポーネント。
 *
 * @param {Object} props
 * @param {number} props.commonPoints - 現在の共通ポイント
 * @param {Function} props.onSuccess - 変換成功時コールバック (summary, totalConverted, newCommonPoints) => void
 * @param {Function} props.onClose - モーダル終了時コールバック () => void
 * @returns {JSX.Element} ポイント変換モーダル要素
 */
export default function PointConversionModal({
  commonPoints,
  onSuccess,
  onClose,
}) {
  // 各モードの最新所持ポイント・累計ポイントの取得
  const modeDataMap = useMemo(() => {
    const map = {};
    POINT_CONVERSION_MODES.forEach((m) => {
      const cur = parseInt(localStorage.getItem(m.pointsKey), 10) || 0;
      const tot = parseInt(localStorage.getItem(m.totalPointsKey), 10) || cur;
      map[m.id] = { current: cur, total: tot };
    });
    return map;
  }, []);

  // 各モードの変換指定数量マップ ({ [modeId]: amount })
  const [amounts, setAmounts] = useState(() => {
    const initial = {};
    POINT_CONVERSION_MODES.forEach((m) => {
      initial[m.id] = 0;
    });
    return initial;
  });

  // 処理中フラグ
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * 特定モードの数量を相対増減させるハンドラ
   *
   * @param {string} modeId - 対象モードID
   * @param {number} delta - 増減量
   */
  const handleAdjustAmount = useCallback(
    (modeId, delta) => {
      if (isProcessing) return;
      const available = modeDataMap[modeId]?.current || 0;
      if (available <= 0) return;

      playSound(SOUNDS?.seClick);
      setAmounts((prev) => {
        const currentVal = prev[modeId] || 0;
        const nextVal = Math.max(0, Math.min(available, currentVal + delta));
        return { ...prev, [modeId]: nextVal };
      });
    },
    [isProcessing, modeDataMap]
  );

  /**
   * 特定モードの数量を最大（所持全額）に設定するハンドラ
   *
   * @param {string} modeId - 対象モードID
   */
  const handleSetMaxForMode = useCallback(
    (modeId) => {
      if (isProcessing) return;
      const available = modeDataMap[modeId]?.current || 0;
      if (available <= 0) return;

      playSound(SOUNDS?.seClick);
      setAmounts((prev) => ({
        ...prev,
        [modeId]: available,
      }));
    },
    [isProcessing, modeDataMap]
  );

  /**
   * 特定モードの数量を0にリセットするハンドラ
   *
   * @param {string} modeId - 対象モードID
   */
  const handleResetForMode = useCallback(
    (modeId) => {
      if (isProcessing) return;
      playSound(SOUNDS?.seClick);
      setAmounts((prev) => ({
        ...prev,
        [modeId]: 0,
      }));
    },
    [isProcessing]
  );

  /**
   * 全モードの変換数を最大（所持全額）に一括設定するハンドラ
   */
  const handleSetAllMax = useCallback(() => {
    if (isProcessing) return;
    playSound(SOUNDS?.seClick);
    const next = {};
    POINT_CONVERSION_MODES.forEach((m) => {
      next[m.id] = modeDataMap[m.id]?.current || 0;
    });
    setAmounts(next);
  }, [isProcessing, modeDataMap]);

  /**
   * 全モードの変換数を0に一括リセットするハンドラ
   */
  const handleResetAll = useCallback(() => {
    if (isProcessing) return;
    playSound(SOUNDS?.seClick);
    const next = {};
    POINT_CONVERSION_MODES.forEach((m) => {
      next[m.id] = 0;
    });
    setAmounts(next);
  }, [isProcessing]);

  /**
   * モーダル終了ハンドラ（SEクリック音を再生）
   */
  const handleClose = useCallback(() => {
    if (isProcessing) return;
    playSound(SOUNDS?.seClick);
    if (typeof onClose === 'function') {
      onClose();
    }
  }, [isProcessing, onClose]);

  // 合計変換ポイント数
  const totalConvertAmount = useMemo(() => {
    return Object.values(amounts).reduce((sum, val) => sum + (val || 0), 0);
  }, [amounts]);

  // 全モードの合計所持ポイント
  const totalAvailableAcrossModes = useMemo(() => {
    return POINT_CONVERSION_MODES.reduce((sum, m) => {
      return sum + (modeDataMap[m.id]?.current || 0);
    }, 0);
  }, [modeDataMap]);

  // 変換可能フラグ
  const canConvert =
    totalConvertAmount > 0 &&
    totalConvertAmount <= totalAvailableAcrossModes &&
    !isProcessing;

  const expectedCommonPoints = commonPoints + totalConvertAmount;

  /**
   * 一括変換実行ハンドラ
   * 指定されたすべてのモードのポイントを減算・保存し、
   * 整合性チェック用累計変換キーを加算保存、サーバー非同期同期、
   * および共通ポイントの加算保存を一括でアトミックに実行します。
   * 書き込み前に全キーのスナップショットを取得し、途中で例外が発生した場合は完全復元（ロールバック）します。
   */
  const handleExecuteBatchConversion = useCallback(async () => {
    if (!canConvert || isProcessing) return;

    setIsProcessing(true);
    playSound(SOUNDS?.seClick);

    // 失敗時に完全復元するため、書き換える全キーの現在値を退避するスナップショット
    const snapshot = new Map();

    /**
     * 指定されたキーの現在のLocalStorageの値をスナップショットに退避する。
     *
     * @param {string} key - 退避対象のLocalStorageキー
     * @returns {void}
     */
    const backupKey = (key) => {
      if (key && !snapshot.has(key)) {
        snapshot.set(key, localStorage.getItem(key));
      }
    };

    /**
     * 退避したスナップショットの値へLocalStorageを完全にロールバック（復元）する。
     *
     * @returns {void}
     */
    const rollback = () => {
      snapshot.forEach((value, key) => {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      });
    };

    try {
      const conversionSummary = {};
      const pendingServerSyncs = [];

      // 1. 各モードのポイント減算・累計変換キー記録（サーバー同期はローカル確定後に行う）
      for (const mode of POINT_CONVERSION_MODES) {
        const convertAmt = amounts[mode.id] || 0;
        if (convertAmt <= 0) continue;

        const currentPts = modeDataMap[mode.id]?.current || 0;
        const totalPts = modeDataMap[mode.id]?.total || currentPts;
        const newSourcePoints = currentPts - convertAmt;

        // 書き換え対象キー（所持ポイントおよび変換累計ポイント）のスナップショットを退避
        backupKey(mode.pointsKey);
        backupKey(mode.convertedKey);

        // LocalStorageの所持ポイントを更新
        localStorage.setItem(mode.pointsKey, String(newSourcePoints));

        // 整合性チェック（reconcile）用の変換累計消費ポイントを加算保存
        addConvertedPointsByMode(mode.id, convertAmt);

        // サーバー同期パラメータを保留リストに記録
        if (mode.apiEndpoint) {
          pendingServerSyncs.push([
            mode.apiEndpoint,
            newSourcePoints,
            totalPts,
          ]);
        }

        conversionSummary[mode.id] = {
          label: mode.label,
          amount: convertAmt,
          remaining: newSourcePoints,
        };
      }

      // 2. 共通ポイントの加算と永続化
      const curCommon =
        parseInt(localStorage.getItem(COMMON_POINTS_KEY), 10) || commonPoints;
      const totCommon =
        parseInt(localStorage.getItem(COMMON_TOTAL_POINTS_KEY), 10) ||
        curCommon;
      const newCommonCurrent = curCommon + totalConvertAmount;
      const newCommonTotal = totCommon + totalConvertAmount;

      // 共通ポイントキーのスナップショットを退避
      backupKey(COMMON_POINTS_KEY);
      backupKey(COMMON_TOTAL_POINTS_KEY);

      localStorage.setItem(COMMON_POINTS_KEY, String(newCommonCurrent));
      localStorage.setItem(COMMON_TOTAL_POINTS_KEY, String(newCommonTotal));

      // 共通ポイントのサーバー同期を保留リストに追加
      pendingServerSyncs.push([
        'update_common_points.php',
        newCommonCurrent,
        newCommonTotal,
      ]);

      // 3. ローカルのデータ整合性が完全に確定した後にのみ、サーバー同期を一括発行する
      pendingServerSyncs.forEach(([endpoint, cur, tot]) => {
        Promise.resolve(savePointsToServer(endpoint, cur, tot)).catch((e) => {
          console.error('[PointConversion] サーバー同期に失敗しました:', e);
        });
      });

      // 4. 成功SE再生
      playSound(SOUNDS?.seLevelUp || SOUNDS?.seSkill);

      // 5. 親コンポーネントへのコールバック通知
      if (typeof onSuccess === 'function') {
        onSuccess(conversionSummary, totalConvertAmount, newCommonCurrent);
      }

      // 6. モーダルを閉じる
      if (typeof onClose === 'function') {
        onClose();
      }
    } catch (err) {
      // ローカルデータを変換前の状態へ完全復元（ロールバック）する
      rollback();
      console.error(
        '[PointConversion] 一括ポイント変換中にエラーが発生しました:',
        err
      );
      setIsProcessing(false);
    }
  }, [
    canConvert,
    isProcessing,
    amounts,
    modeDataMap,
    commonPoints,
    totalConvertAmount,
    onSuccess,
    onClose,
  ]);

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 6000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={handleClose}
    >
      <div
        className="skill-modal-box modal-pop-animation"
        style={{
          width: '95%',
          maxWidth: '380px',
          maxHeight: '90dvh',
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: '1px solid #475569',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div
          style={{
            borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
            paddingBottom: '8px',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '1.2rem',
              color: '#facc15',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>💎</span> ポイント一括変換
          </h3>
          <div
            style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              marginTop: '4px',
            }}
          >
            各イベントのポイントを共通ポイントに変換します
          </div>
        </div>

        {/* 一括操作バー */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 2px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn"
              disabled={isProcessing || totalAvailableAcrossModes <= 0}
              onClick={handleSetAllMax}
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                margin: 0,
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
              }}
            >
              全最大
            </button>
            <button
              className="btn"
              disabled={isProcessing || totalConvertAmount <= 0}
              onClick={handleResetAll}
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                margin: 0,
                background: '#475569',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
              }}
            >
              リセット
            </button>
          </div>
        </div>

        {/* 各モードのポイント変換指定リスト */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {POINT_CONVERSION_MODES.map((mode) => {
            const available = modeDataMap[mode.id]?.current || 0;
            const currentAmount = amounts[mode.id] || 0;
            const isSelected = currentAmount > 0;

            return (
              <div
                key={mode.id}
                style={{
                  background: isSelected
                    ? 'rgba(30, 41, 59, 0.9)'
                    : 'rgba(15, 23, 42, 0.6)',
                  border: isSelected
                    ? `1.5px solid ${mode.color}`
                    : '1px solid rgba(148, 163, 184, 0.15)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  boxShadow: isSelected ? `0 0 8px ${mode.color}33` : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {/* 行ヘッダー: モード名・テーマバッジ & 所持ポイント */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: mode.color,
                        boxShadow: `0 0 6px ${mode.color}`,
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        color: mode.color,
                      }}
                    >
                      {mode.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    所持:{' '}
                    <strong
                      style={{
                        color: available > 0 ? '#ffffff' : '#64748b',
                        fontSize: '0.85rem',
                      }}
                    >
                      {available}
                    </strong>{' '}
                    Pt
                  </div>
                </div>

                {/* 数量コントローラー */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {/* -10ボタン */}
                    <button
                      className="btn"
                      disabled={currentAmount <= 0 || isProcessing}
                      onClick={() => handleAdjustAmount(mode.id, -10)}
                      style={{
                        padding: '3px 6px',
                        fontSize: '0.72rem',
                        margin: 0,
                        background: currentAmount <= 0 ? '#334155' : '#475569',
                        color: currentAmount <= 0 ? '#64748b' : '#ffffff',
                        borderRadius: '4px',
                        border: 'none',
                      }}
                    >
                      -10
                    </button>
                    {/* -1ボタン */}
                    <button
                      className="btn"
                      disabled={currentAmount <= 0 || isProcessing}
                      onClick={() => handleAdjustAmount(mode.id, -1)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        margin: 0,
                        background: currentAmount <= 0 ? '#334155' : '#475569',
                        color: currentAmount <= 0 ? '#64748b' : '#ffffff',
                        borderRadius: '4px',
                        border: 'none',
                      }}
                    >
                      －
                    </button>
                  </div>

                  {/* 変換指定数値表示 */}
                  <div
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: isSelected
                        ? `1px solid ${mode.color}`
                        : '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '6px',
                      padding: '3px 6px',
                      fontSize: '0.95rem',
                      fontWeight: 'bold',
                      color: isSelected ? '#facc15' : '#64748b',
                    }}
                  >
                    {currentAmount}{' '}
                    <span style={{ fontSize: '0.7rem' }}>Pt</span>
                  </div>

                  <div style={{ display: 'flex', gap: '3px' }}>
                    {/* +1ボタン */}
                    <button
                      className="btn"
                      disabled={currentAmount >= available || isProcessing}
                      onClick={() => handleAdjustAmount(mode.id, 1)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        margin: 0,
                        background:
                          currentAmount >= available ? '#334155' : '#475569',
                        color:
                          currentAmount >= available ? '#64748b' : '#ffffff',
                        borderRadius: '4px',
                        border: 'none',
                      }}
                    >
                      ＋
                    </button>
                    {/* +10ボタン */}
                    <button
                      className="btn"
                      disabled={currentAmount >= available || isProcessing}
                      onClick={() => handleAdjustAmount(mode.id, 10)}
                      style={{
                        padding: '3px 6px',
                        fontSize: '0.72rem',
                        margin: 0,
                        background:
                          currentAmount >= available ? '#334155' : '#475569',
                        color:
                          currentAmount >= available ? '#64748b' : '#ffffff',
                        borderRadius: '4px',
                        border: 'none',
                      }}
                    >
                      +10
                    </button>
                    {/* 最大ボタン */}
                    <button
                      className="btn"
                      disabled={currentAmount >= available || isProcessing}
                      onClick={() => handleSetMaxForMode(mode.id)}
                      style={{
                        padding: '3px 6px',
                        fontSize: '0.72rem',
                        fontWeight: 'bold',
                        margin: 0,
                        background:
                          currentAmount >= available ? '#334155' : '#eab308',
                        color:
                          currentAmount >= available ? '#64748b' : '#000000',
                        borderRadius: '4px',
                        border: 'none',
                      }}
                    >
                      最大
                    </button>
                    {/* 個別リセットボタン */}
                    <button
                      className="btn"
                      disabled={currentAmount <= 0 || isProcessing}
                      onClick={() => handleResetForMode(mode.id)}
                      style={{
                        padding: '3px 5px',
                        fontSize: '0.72rem',
                        margin: 0,
                        background: '#334155',
                        color: currentAmount <= 0 ? '#475569' : '#cbd5e1',
                        borderRadius: '4px',
                        border: 'none',
                      }}
                      title="このモードを0にする"
                    >
                      0
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 合算サマリーパネル */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '0.78rem',
          }}
        >
          {/* 獲得共通ポイント（合算） */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 'bold',
              color: '#facc15',
              fontSize: '0.92rem',
            }}
          >
            <span>獲得ポイント</span>
            <span style={{ fontSize: '1.1rem' }}>+{totalConvertAmount} Pt</span>
          </div>

          {/* 共通ポイント残高プレビュー */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#cbd5e1',
            }}
          >
            <span>共通ポイント残高</span>
            <span>
              {commonPoints} Pt →{' '}
              <strong style={{ color: '#4ade80' }}>
                {expectedCommonPoints} Pt
              </strong>
            </span>
          </div>
        </div>

        {/* 不可逆警告 */}
        <div
          style={{
            fontSize: '0.7rem',
            color: '#f87171',
            textAlign: 'center',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: '5px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}
        >
          ⚠ 一度変換したポイントは元に戻せません
        </div>

        {/* アクションボタン */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '2px',
          }}
        >
          <button
            className="btn"
            disabled={isProcessing}
            style={{
              flex: 1,
              minHeight: '40px',
              padding: '8px',
              background: '#475569',
              margin: 0,
              fontSize: '0.9rem',
            }}
            onClick={handleClose}
          >
            キャンセル
          </button>
          <button
            className="btn"
            disabled={!canConvert}
            style={{
              flex: 1.5,
              minHeight: '40px',
              padding: '8px',
              background: canConvert
                ? 'linear-gradient(45deg, #f59e0b, #d97706)'
                : '#334155',
              color: canConvert ? '#ffffff' : '#64748b',
              cursor: canConvert ? 'pointer' : 'not-allowed',
              opacity: canConvert ? 1 : 0.5,
              margin: 0,
              fontSize: '0.9rem',
              fontWeight: 'bold',
              boxShadow: canConvert
                ? '0 4px 12px rgba(245, 158, 11, 0.4)'
                : 'none',
            }}
            onClick={handleExecuteBatchConversion}
          >
            {isProcessing
              ? '変換中...'
              : canConvert
                ? `変換 (合計 ${totalConvertAmount} Pt)`
                : '変換 0 Pt'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { PointConversionModal };

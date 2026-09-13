/**
 * デイリーミッション確認・報酬受取モーダルコンポーネント
 *
 * チュートリアル選択画面に準拠したデザインシステムを採用し、
 * 防衛戦・試練の宮殿・夢幻の闘技祭の各デイリーミッションの進捗ゲージ、達成状態、
 * パックvol01の受け取り機能およびパック開封演出モーダル連携を提供します。
 */

import { useState, useCallback } from 'react';
import { DAILY_MISSIONS } from '../../utils/constants/dailyMissions.js';
import {
  loadDailyMissionsProgress,
  claimDailyMissionReward,
  checkIsPackVol01Completed,
} from '../../services/dailyMissions.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import { showAlertModal } from '../../services/uiModals.js';
import { DEFAULT_PACK_LOGO_URL } from '../../utils/constants/packs.js';
import PackOpeningModal from '../exchange/PackOpeningModal.jsx';

/**
 * デイリーミッションモーダル。
 *
 * @param {Object} props
 * @param {Function} props.onClose - モーダルを閉じる際のコールバック関数
 * @param {Function} [props.onClaimSuccess] - 報酬受取成功時のコールバック関数（バッジ更新用）
 * @returns {JSX.Element} デイリーミッションモーダル要素
 */
export default function DailyMissionsModal({ onClose, onClaimSuccess }) {
  // パックvol01の全カード所持上限コンプリート状態判定
  const isPackCompleted = checkIsPackVol01Completed();

  // 現在の進捗データ（初期ロード）
  const [progressData, setProgressData] = useState(() =>
    loadDailyMissionsProgress()
  );

  // パック開封演出モーダルの表示データ
  const [packOpeningData, setPackOpeningData] = useState(null);

  /**
   * モーダルを閉じるハンドラ
   */
  const handleClose = useCallback(() => {
    playSound?.(SOUNDS?.seClick);
    if (onClose) onClose();
  }, [onClose]);

  /**
   * ミッション報酬（パックvol01）受け取りハンドラ
   *
   * @param {string} missionId - 受取対象のミッションID
   */
  const handleClaim = useCallback(
    (missionId) => {
      playSound?.(SOUNDS?.seClick);
      const result = claimDailyMissionReward(missionId);
      if (!result.success) {
        console.warn('報酬受取失敗:', result.error);
        showAlertModal?.(
          result.error ||
            '報酬の受け取りに失敗しました。時間をおいて再度お試しください。'
        );
        return;
      }

      // 進捗状態を最新に更新
      const updated = loadDailyMissionsProgress();
      setProgressData(updated);
      if (onClaimSuccess) {
        onClaimSuccess();
      }

      // パック開封演出モーダルを起動
      setPackOpeningData({
        cardIds: [result.cardId],
        coverCardId: result.packDef?.coverCardId || 'catastrophe',
        logoUrl: result.packDef?.logoUrl || DEFAULT_PACK_LOGO_URL,
      });
    },
    [onClaimSuccess]
  );

  /**
   * パック開封モーダル終了ハンドラ
   */
  const handleClosePackOpening = useCallback(() => {
    setPackOpeningData(null);
  }, []);

  return (
    <>
      <div
        className="modal-overlay"
        style={{
          zIndex: 3000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
        onClick={handleClose}
      >
        <div
          className="skill-modal-box modal-pop-animation"
          style={{
            width: '90%',
            maxWidth: '400px',
            padding: '24px 20px',
            maxHeight: '90dvh',
            overflowY: 'auto',
            background: 'linear-gradient(135deg, #1e293b, #0f172a)',
            borderRadius: '16px',
            border: '2px solid #334155',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '18px',
            boxSizing: 'border-box',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* モーダルヘッダー */}
          <div
            style={{
              textAlign: 'center',
              width: '100%',
              marginBottom: '16px',
            }}
          >
            <h2
              style={{
                color: '#eab308',
                margin: '0',
                fontSize: '1.3rem',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              デイリーミッション
            </h2>
            <div
              style={{
                fontSize: '0.8rem',
                color: '#94a3b8',
                marginTop: '4px',
              }}
            >
              毎日 <span style={{ color: '#38bdf8' }}>00:00 (JST)</span>{' '}
              にリセットされます
            </div>
          </div>

          {/* プロフィールのお気に入りカードと全く同じ大きな枠 */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(15, 23, 42, 0.5)',
              padding: '16px 10px',
              borderRadius: '12px',
              border: '1px solid #334155',
              boxSizing: 'border-box',
              marginBottom: '16px',
            }}
          >
            {DAILY_MISSIONS.map((mission) => {
              const state = progressData.missions?.[mission.id] || {
                progress: 0,
                isClaimed: false,
              };
              // パックvol01コンプリート時は、達成・未受取フラグをオフにし、ゲージを常に0%にする
              const isCleared =
                !isPackCompleted && state.progress >= mission.targetCount;
              const isClaimable =
                !isPackCompleted && isCleared && !state.isClaimed;
              const displayProgress = isPackCompleted
                ? 0
                : Math.min(state.progress, mission.targetCount);
              // 進捗率は実際の達成数から算出する（部分進捗も反映）
              const progressPercent =
                isPackCompleted || !mission.targetCount
                  ? 0
                  : Math.min(
                      100,
                      Math.round((displayProgress / mission.targetCount) * 100)
                    );

              // カードの枠線・背景色
              const bgColor = isClaimable
                ? 'rgba(16, 185, 129, 0.15)'
                : isCleared
                  ? 'rgba(16, 185, 129, 0.08)'
                  : 'rgba(0, 0, 0, 0.5)';
              const borderColor = isClaimable
                ? '#facc15'
                : isCleared
                  ? '#10b981'
                  : '#475569';
              const boxShadow = isClaimable
                ? '0 0 15px rgba(250, 204, 21, 0.4)'
                : 'none';

              return (
                <div
                  key={mission.id}
                  style={{
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'left',
                    width: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    position: 'relative',
                    boxShadow: boxShadow,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* ミッション上部: アイコン & タイトル & 説明 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: '2px solid #334155',
                        flexShrink: 0,
                        backgroundColor: '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={mission.iconImage}
                        alt={mission.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: isCleared ? '#facc15' : '#ffffff',
                          fontWeight: 'bold',
                          fontSize: '0.95rem',
                          textShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {mission.title}
                      </div>
                    </div>
                  </div>

                  {/* プログレスバー */}
                  <div
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      borderRadius: '4px',
                      height: '10px',
                      overflow: 'hidden',
                      border: '1px solid #334155',
                    }}
                  >
                    <div
                      style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        background: isCleared ? '#10b981' : '#3b82f6',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  {/* 下部: 進捗・報酬表示・受取ボタン */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '2px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.85rem',
                        color: isCleared ? '#10b981' : '#94a3b8',
                        fontWeight: isCleared ? 'bold' : 'normal',
                      }}
                    >
                      {displayProgress} / {mission.targetCount}
                    </span>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: '#facc15',
                          fontWeight: 'bold',
                        }}
                      >
                        報酬: {mission.rewardLabel}
                      </span>

                      {isPackCompleted || state.isClaimed ? (
                        <span
                          style={{
                            color: '#94a3b8',
                            fontSize: '0.8rem',
                            padding: '3px 8px',
                          }}
                        >
                          (取得済)
                        </span>
                      ) : (
                        <button
                          className="btn"
                          style={{
                            padding: '4px 12px',
                            fontSize: '0.8rem',
                            minHeight: '26px',
                            margin: 0,
                            background: isClaimable
                              ? 'linear-gradient(45deg, #22c55e, #16a34a)'
                              : '#475569',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            opacity: isClaimable ? '1' : '0.5',
                            cursor: isClaimable ? 'pointer' : 'not-allowed',
                            boxShadow: isClaimable
                              ? '0 0 10px rgba(34, 197, 94, 0.6)'
                              : 'none',
                          }}
                          disabled={!isClaimable}
                          onClick={() => handleClaim(mission.id)}
                        >
                          受け取る
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* モーダルフッター: 閉じるボタン */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <button
              className="btn"
              style={{
                background: '#475569',
                margin: 0,
                width: '100%',
                maxWidth: '180px',
              }}
              onClick={handleClose}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>

      {/* パック開封演出モーダル（報酬受取時にパックを開封） */}
      {packOpeningData && (
        <PackOpeningModal
          cardIds={packOpeningData.cardIds}
          coverCardId={packOpeningData.coverCardId}
          logoUrl={packOpeningData.logoUrl}
          onClose={handleClosePackOpening}
        />
      )}
    </>
  );
}

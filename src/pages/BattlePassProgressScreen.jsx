/**
 * Mini Card Battle - バトルパス達成状況画面
 *
 * 選択されたバトルパスの蓄積ポイント、および10段階の達成レベル進捗を表示します。
 * 「運命の邂逅」の達成状況画面のUIデザインを踏襲しています。
 */

import { useEffect, useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import {
  showCommonPointsAcquisitionModal,
  showIconAcquisitionModal,
  showItemAcquisitionModal,
  showPlaymatAcquisitionModal,
  showPremiumAcquisitionModal,
  showSkinAcquisitionModal,
} from '../services/uiGallery.js';
import { showBattlePassMenu } from '../services/uiMainCore.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import {
  BATTLE_PASS_MASTER,
  claimLevelReward,
  getBattlePassById,
  getBattlePassClaimedLevels,
  getBattlePassPoints,
  setBattlePassLevelClaimed,
  unlockAllBattlePass,
} from '../utils/constants/battlePass.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * バトルパス達成状況画面コンポーネント
 * @returns {import('react').ReactElement} バトルパス達成状況画面
 */
export default function BattlePassProgressScreen() {
  // 現在選択中のバトルパスID（未設定の場合はvol1）
  const passId = GameState?.activeBattlePassId || 'battle_pass_vol1';
  const passData = getBattlePassById(passId) || BATTLE_PASS_MASTER[0];

  const [currentPoints, setCurrentPoints] = useState(() =>
    getBattlePassPoints(passId)
  );
  const [claimedLevels, setClaimedLevels] = useState(() =>
    getBattlePassClaimedLevels(passId)
  );

  // 画面アクティブ時などに最新ポイントおよび受取済み状況を再取得
  useEffect(() => {
    const handleRefresh = () => {
      const activeId = GameState?.activeBattlePassId || 'battle_pass_vol1';
      setCurrentPoints(getBattlePassPoints(activeId));
      setClaimedLevels(getBattlePassClaimedLevels(activeId));
    };

    window.addEventListener('focus', handleRefresh);
    const screen = document.getElementById('screen-battle-pass-progress');
    let observer = null;
    if (screen) {
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.attributeName === 'class' &&
            screen.classList.contains('active')
          ) {
            handleRefresh();
          }
        });
      });
      observer.observe(screen, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    return () => {
      window.removeEventListener('focus', handleRefresh);
      observer?.disconnect();
    };
  }, []);

  /**
   * デバッグ・イースターエッグによるバトルパス全レベル達成処理
   * （開発環境限定: import.meta.env.DEV のみ動作）
   * タイトルやヘッダーを10回クリックすることで確認ダイアログを表示し、
   * 確定後にポイントを最大化して全レベルの受取ボタンを押せる状態にします。
   *
   * @returns {void}
   */
  const handleDebugUnlockAll = () => {
    // 本番環境では絶対に実行されないよう環境ガード
    if (!import.meta.env.DEV) return;

    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動してバトルパスの全レベルを達成状態にしますか？',
        () => {
          const res = unlockAllBattlePass(passId);
          setCurrentPoints(res.currentPoints);
          setClaimedLevels(res.claimedLevels);
          playSound?.(SOUNDS?.sePowerUp || SOUNDS?.seClick);
          showAlertModal?.(
            '【全レベル達成】\nバトルパスの全レベルを達成しました！\n各レベルの「受取」ボタンを押して報酬をお受け取りください。'
          );
        }
      );
    }
  };

  // 10回クリックで全解放（開発環境のみ発動。本番環境では Infinity となり発動不可）
  const handleTitleClick = useEasterEgg(handleDebugUnlockAll);

  /**
   * 個別達成レベルの報酬受取処理
   * @param {Object} threshold - 達成レベル定義オブジェクト
   */
  const handleClaimReward = (threshold) => {
    if (!threshold.rewardType || claimedLevels.includes(threshold.level))
      return;

    claimLevelReward(threshold);
    const next = setBattlePassLevelClaimed(passId, threshold.level);
    setClaimedLevels(next);
    playSound?.(SOUNDS?.sePowerUp || SOUNDS?.seClick);

    if (threshold.rewardType === 'skin') {
      showSkinAcquisitionModal?.(
        threshold.rewardDisplayName,
        threshold.rewardId
      );
    } else if (threshold.rewardType === 'playmat') {
      showPlaymatAcquisitionModal?.(
        threshold.rewardDisplayName,
        threshold.rewardId
      );
    } else if (threshold.rewardType === 'icon') {
      showIconAcquisitionModal?.(
        threshold.rewardDisplayName,
        threshold.rewardId
      );
    } else if (threshold.rewardType === 'shine_ticket') {
      showItemAcquisitionModal?.(
        threshold.rewardDisplayName || 'シャインチケット',
        threshold.count || 1,
        {
          title: 'バトルパス報酬獲得！',
          description: 'カード一覧画面からカードをシャイン化できます。',
          iconEmoji: '🎟️',
        }
      );
    } else if (threshold.rewardType === 'premium') {
      showPremiumAcquisitionModal?.(threshold.rewardId);
    } else if (threshold.rewardType === 'common_points') {
      showCommonPointsAcquisitionModal?.(threshold.count || 20, {
        title: 'バトルパス報酬獲得！',
        message: `バトルパス報酬として\n共通ポイントを ${threshold.count || 20} Pt 獲得しました！\n共通交換所で様々なアイテムと交換できます。`,
      });
    }
  };

  const maxPoints = passData?.maxPoints || 150;
  const overallPercentage = Math.min(
    100,
    Math.round((currentPoints / maxPoints) * 100)
  );

  return (
    <ScreenLayout
      id="screen-battle-pass-progress"
      title={`${passData?.name || 'バトルパス'} 達成状況`}
      titleColor="#f59e0b"
      titleGlow={true}
      backgroundImage="background_online.webp"
      onBackClick={() => showBattlePassMenu?.()}
      showBackButton={true}
      backHasBorder={true}
      onTitleClick={import.meta.env.DEV ? handleTitleClick : undefined}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          padding: '0 16px',
          boxSizing: 'border-box',
        }}
      >
        {/* 全体サマリー枠 */}
        <div
          style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span
              onClick={import.meta.env.DEV ? handleTitleClick : undefined}
              style={{
                fontSize: '1rem',
                fontWeight: 'bold',
                color: '#f8fafc',
                cursor: import.meta.env.DEV ? 'pointer' : 'default',
                userSelect: 'none',
              }}
              title={import.meta.env.DEV ? '10回タップで全解放' : undefined}
            >
              累計ポイント
            </span>
            <span
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: '#facc15',
                textShadow: '0 0 10px rgba(250, 204, 21, 0.4)',
              }}
            >
              {currentPoints} / {maxPoints} Pt
            </span>
          </div>

          {/* 全体プログレスバー */}
          <div
            style={{
              width: '100%',
              background: '#0f172a',
              borderRadius: '6px',
              height: '14px',
              overflow: 'hidden',
              border: '1px solid #334155',
              marginBottom: '10px',
            }}
          >
            <div
              style={{
                width: `${overallPercentage}%`,
                height: '100%',
                background:
                  overallPercentage >= 100
                    ? '#10b981'
                    : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <p
            style={{
              fontSize: '0.8rem',
              color: '#94a3b8',
              margin: 0,
              lineHeight: 1.4,
              textAlign: 'center',
            }}
          >
            クイックマッチ勝利でポイント獲得（対人: +3Pt / CPU: +1Pt）
          </p>
        </div>

        {/* 達成レベル一覧（15段階） */}
        <div
          style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '12px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#cbd5e1',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              marginBottom: '10px',
              padding: '0 4px',
            }}
          >
            <span>達成レベル</span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              全 {passData?.levels?.length || 10} 段階
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '420px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {passData?.levels?.map((threshold) => {
              const isCleared = currentPoints >= threshold.points;
              const levelProgress = Math.min(
                100,
                Math.round((currentPoints / threshold.points) * 100)
              );

              const bgColor = isCleared
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(0, 0, 0, 0.45)';
              const borderColor = isCleared ? '#10b981' : '#334155';
              const titleColor = isCleared ? '#34d399' : '#f8fafc';

              return (
                <div
                  key={threshold.level}
                  style={{
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    flexShrink: 0,
                    boxShadow: isCleared
                      ? '0 0 8px rgba(16, 185, 129, 0.15)'
                      : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <span
                      style={{
                        color: titleColor,
                        fontWeight: 'bold',
                        fontSize: '0.95rem',
                      }}
                    >
                      Lv.{threshold.level}（必要: {threshold.points} Pt）
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#facc15' }}>
                      報酬: {threshold.rewardName || '準備中'}
                    </span>
                  </div>

                  {/* レベルごとのプログレスバー */}
                  <div
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      borderRadius: '4px',
                      height: '10px',
                      marginBottom: '6px',
                      overflow: 'hidden',
                      border: '1px solid #334155',
                    }}
                  >
                    <div
                      style={{
                        width: `${levelProgress}%`,
                        height: '100%',
                        background: isCleared ? '#10b981' : '#3b82f6',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      進捗: {Math.min(currentPoints, threshold.points)} /{' '}
                      {threshold.points} Pt
                    </span>

                    {threshold.rewardType ? (
                      claimedLevels.includes(threshold.level) ? (
                        <span
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            color: '#94a3b8',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          (取得済)
                        </span>
                      ) : (
                        <button
                          className="btn"
                          disabled={!isCleared}
                          onClick={() => handleClaimReward(threshold)}
                          style={{
                            padding: '3px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            background: isCleared
                              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                              : '#334155',
                            color: isCleared ? '#000000' : '#64748b',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: isCleared ? 'pointer' : 'default',
                            boxShadow: isCleared
                              ? '0 2px 6px rgba(245, 158, 11, 0.4)'
                              : 'none',
                          }}
                        >
                          受取
                        </button>
                      )
                    ) : (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: isCleared
                            ? 'rgba(16, 185, 129, 0.25)'
                            : 'rgba(100, 116, 139, 0.2)',
                          color: isCleared ? '#34d399' : '#94a3b8',
                          border: `1px solid ${isCleared ? '#10b981' : '#475569'}`,
                        }}
                      >
                        {isCleared ? '達成済み' : '未達成'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
}

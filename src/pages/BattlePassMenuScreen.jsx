/**
 * Mini Card Battle - バトルパスメニュー画面
 *
 * プレイヤーが解放したバトルパス一覧を縦並びで表示し、
 * 「進行中」のバトルパス設定（未同期レートの同期）および各パスの達成状況画面への遷移を提供します。
 */

import { useEffect, useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import {
  getUnlockedBattlePasses,
  getBattlePassPoints,
  getBattlePassById,
  getBattlePassClaimedLevels,
  getSelectedBattlePassId,
  setSelectedBattlePass,
  syncSelectedBattlePassWithRating,
  getQuickRating,
  getMaxQuickRatingCap,
  getUnallocatedQuickRating,
} from '../utils/constants/battlePass.js';
import { appendVersionQuery } from '../utils/constants/config.js';
import {
  showOnlineMenu,
  showBattlePassProgress,
  showCommonExchange,
} from '../services/uiMainCore.js';
import { showBattlePassSyncModal } from '../services/uiModals.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * バトルパスメニュー画面コンポーネント
 * @returns {import('react').ReactElement} バトルパスメニュー画面
 */
export default function BattlePassMenuScreen() {
  const [unlockedPassIds, setUnlockedPassIds] = useState(() =>
    getUnlockedBattlePasses()
  );
  const [selectedPassId, setSelectedPassId] = useState(() =>
    getSelectedBattlePassId()
  );
  const [, setRefreshCount] = useState(0);

  // 画面がアクティブになった際やウィンドウフォーカス時に最新の解放状況・進行中設定・ポイントを反映
  useEffect(() => {
    /**
     * 画面状態およびバトルパス同期状態を最新化する内部ハンドラ
     * @returns {void}
     */
    const handleRefresh = () => {
      syncSelectedBattlePassWithRating();
      setUnlockedPassIds(getUnlockedBattlePasses());
      setSelectedPassId(getSelectedBattlePassId());
      setRefreshCount((prev) => prev + 1);
    };

    window.addEventListener('focus', handleRefresh);
    const screen = document.getElementById('screen-battle-pass-menu');
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
   * バトルパスカード選択ハンドラ（達成状況画面へ遷移）
   * @param {string} passId - 選択されたバトルパスID
   * @returns {void}
   */
  const handleSelectPass = (passId) => {
    playSound?.(SOUNDS?.seClick);
    showBattlePassProgress?.(passId);
  };

  /**
   * 指定したバトルパスを「進行中」に設定し、未同期レートを同期して説明モーダルを表示するハンドラ
   * @param {import('react').MouseEvent} e - クリックイベント
   * @param {Object} pass - 対象のバトルパスマスタ定義オブジェクト
   * @returns {void}
   */
  const handleSetActivePass = (e, pass) => {
    e.stopPropagation();
    if (!pass?.id) return;

    const res = setSelectedBattlePass(pass.id);
    if (!res.success) return;

    playSound?.(SOUNDS?.sePowerUp || SOUNDS?.seClick);
    setSelectedPassId(res.passId);
    setRefreshCount((prev) => prev + 1);

    showBattlePassSyncModal(
      pass.name || 'バトルパス',
      res.syncedPoints,
      res.newPoints
    );
  };

  /**
   * 共通交換所へ遷移するハンドラ
   * @returns {void}
   */
  const handleGoToExchange = () => {
    playSound?.(SOUNDS?.seClick);
    showCommonExchange?.();
  };

  // 解放済みのパス一覧データを構築
  const unlockedList = unlockedPassIds
    .map((id) => getBattlePassById(id))
    .filter(Boolean);

  const quickRating = getQuickRating();
  const maxRatingCap = getMaxQuickRatingCap();
  const unallocatedRating = getUnallocatedQuickRating();

  return (
    <ScreenLayout
      id="screen-battle-pass-menu"
      title="バトルパス"
      titleColor="#f59e0b"
      titleGlow={true}
      backgroundImage="background_online.webp"
      onBackClick={() => showOnlineMenu?.()}
      showBackButton={true}
      backHasBorder={true}
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
        <p
          style={{
            fontSize: '0.82rem',
            color: '#94a3b8',
            textAlign: 'center',
            margin: '0',
            lineHeight: 1.4,
          }}
        >
          クイックマッチで勝利してレートを貯め、進行中のパスへ同期しましょう！
          <br />
          （対人戦: +3Pt / CPU戦: +1Pt・レート上限: {maxRatingCap}Pt）
        </p>

        {/* クイックマッチレート＆未同期レートサマリー */}
        <div
          style={{
            width: '100%',
            background: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '10px 14px',
            boxSizing: 'border-box',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
            現在のレート:{' '}
            <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>
              {quickRating} / {maxRatingCap} Pt
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
            未同期レート:{' '}
            <span
              style={{
                color: unallocatedRating > 0 ? '#facc15' : '#94a3b8',
                fontWeight: 'bold',
              }}
            >
              {unallocatedRating} Pt
            </span>
          </div>
        </div>

        {unlockedList.length === 0 ? (
          <div
            style={{
              width: '100%',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '24px 16px',
              textAlign: 'center',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>🎟️</div>
            <div
              style={{
                color: '#e2e8f0',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              解放済みのバトルパスはありません
            </div>
            <p
              style={{
                color: '#94a3b8',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              共通交換所でバトルパスを獲得し、「進行中に設定」すると
              <br />
              レートを同期して報酬を獲得できるようになります。
            </p>
            <div style={{ marginTop: '8px' }}>
              <MenuButton
                label="共通交換所へ"
                variant="yellow"
                onClick={handleGoToExchange}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {unlockedList.map((pass) => {
              const currentPoints = getBattlePassPoints(pass.id);
              const maxPoints = pass.maxPoints || 150;
              const isCompleted = currentPoints >= maxPoints;
              const isSelected = selectedPassId === pass.id;
              const percentage = Math.min(
                100,
                Math.round((currentPoints / maxPoints) * 100)
              );
              const claimedLevels = getBattlePassClaimedLevels(pass.id);
              const claimableCount = (pass.levels || []).filter(
                (lv) =>
                  lv.rewardType &&
                  currentPoints >= lv.points &&
                  !claimedLevels.includes(lv.level)
              ).length;

              const borderColor = isSelected ? '#10b981' : '#f59e0b';
              const baseShadow = isSelected
                ? '0 4px 14px rgba(16, 185, 129, 0.3)'
                : '0 4px 12px rgba(245, 158, 11, 0.2)';
              const hoverShadow = isSelected
                ? '0 6px 18px rgba(16, 185, 129, 0.45)'
                : '0 6px 16px rgba(245, 158, 11, 0.35)';

              return (
                <div
                  key={pass.id}
                  onClick={() => handleSelectPass(pass.id)}
                  style={{
                    width: '100%',
                    background:
                      'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
                    border: `2px solid ${borderColor}`,
                    boxShadow: baseShadow,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = hoverShadow;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = baseShadow;
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '10px',
                    }}
                  >
                    {pass.thumbUrl ? (
                      <img
                        src={appendVersionQuery(pass.thumbUrl)}
                        alt={pass.name}
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          objectPosition: 'top center',
                          border: `1px solid ${borderColor}`,
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          fontSize: '2rem',
                          lineHeight: 1,
                        }}
                      >
                        🎟️
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '6px',
                          marginBottom: '4px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 'bold',
                            color: '#fbbf24',
                          }}
                        >
                          {pass.name}
                        </span>
                        {isSelected && (
                          <span
                            style={{
                              background: 'rgba(16, 185, 129, 0.25)',
                              border: '1px solid #10b981',
                              color: '#34d399',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              padding: '1px 8px',
                              borderRadius: '12px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            進行中
                          </span>
                        )}
                        {claimableCount > 0 && (
                          <span
                            style={{
                              background: 'rgba(239, 68, 68, 0.25)',
                              border: '1px solid #ef4444',
                              color: '#fca5a5',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              padding: '1px 8px',
                              borderRadius: '12px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            未受取 {claimableCount}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#94a3b8',
                          lineHeight: 1.3,
                        }}
                      >
                        {pass.description}
                      </div>
                    </div>
                    <div
                      style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid #f59e0b',
                        color: '#fbbf24',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      達成状況 &gt;
                    </div>
                  </div>

                  {/* 進捗プログレスバー */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ color: '#cbd5e1' }}>進捗状況</span>
                    <span style={{ color: '#facc15', fontWeight: 'bold' }}>
                      {currentPoints} / {maxPoints} Pt ({percentage}%)
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      borderRadius: '6px',
                      height: '10px',
                      overflow: 'hidden',
                      border: '1px solid #334155',
                    }}
                  >
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background:
                          percentage >= 100
                            ? '#10b981'
                            : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  {/* 進行中設定アクション行 */}
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                    }}
                  >
                    {isSelected ? (
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 'bold',
                          color: '#34d399',
                        }}
                      >
                        ✓ 現在進行中に設定されています
                      </span>
                    ) : isCompleted ? (
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 'bold',
                          color: '#10b981',
                        }}
                      >
                        全レベル達成済み
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={(e) => handleSetActivePass(e, pass)}
                        style={{
                          padding: '5px 14px',
                          fontSize: '0.78rem',
                          fontWeight: 'bold',
                          background:
                            'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: '#000000',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(245, 158, 11, 0.35)',
                        }}
                      >
                        進行中に設定
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 共通交換所リンクボタン */}
            <div
              style={{
                marginTop: '8px',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <MenuButton
                label="共通交換所へ"
                variant="yellow"
                onClick={handleGoToExchange}
              />
            </div>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}

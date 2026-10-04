/**
 * Mini Card Battle - バトルパスメニュー画面
 *
 * プレイヤーが解放したバトルパス一覧を縦並びで表示し、
 * 各パスをクリックすることで達成状況画面へ遷移します。
 */

import { useEffect, useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';
import MenuButton from '../components/common/MenuButton.jsx';
import {
  getUnlockedBattlePasses,
  getBattlePassPoints,
  getBattlePassById,
} from '../utils/constants/battlePass.js';
import {
  showOnlineMenu,
  showBattlePassProgress,
  showCommonExchange,
} from '../services/uiMainCore.js';
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

  // 画面がアクティブになった際やウィンドウフォーカス時に最新の解放状況とポイントを反映
  useEffect(() => {
    const handleRefresh = () => {
      setUnlockedPassIds(getUnlockedBattlePasses());
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
   * バトルパス選択ハンドラ
   * @param {string} passId - 選択されたバトルパスID
   */
  const handleSelectPass = (passId) => {
    playSound?.(SOUNDS?.seClick);
    showBattlePassProgress?.(passId);
  };

  /**
   * 共通交換所へ遷移ハンドラ
   */
  const handleGoToExchange = () => {
    playSound?.(SOUNDS?.seClick);
    showCommonExchange?.();
  };

  // 解放済みのパス一覧データを構築
  const unlockedList = unlockedPassIds
    .map((id) => getBattlePassById(id))
    .filter(Boolean);

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
            fontSize: '0.85rem',
            color: '#94a3b8',
            textAlign: 'center',
            margin: '0 0 8px 0',
            lineHeight: 1.4,
          }}
        >
          クイックマッチで勝利してポイントを集め、報酬を達成しましょう！
          <br />
          （対人戦: 3pt / CPU戦: 1pt）
        </p>

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
              共通交換所でバトルパスを獲得すると、
              <br />
              ここに表示されポイントが貯まるようになります。
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
              const percentage = Math.min(
                100,
                Math.round((currentPoints / maxPoints) * 100)
              );

              return (
                <div
                  key={pass.id}
                  onClick={() => handleSelectPass(pass.id)}
                  style={{
                    width: '100%',
                    background:
                      'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
                    border: '1px solid #f59e0b',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow =
                      '0 6px 16px rgba(245, 158, 11, 0.35)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow =
                      '0 4px 12px rgba(245, 158, 11, 0.2)';
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
                    <div
                      style={{
                        fontSize: '2rem',
                        lineHeight: 1,
                        filter:
                          'drop-shadow(0 2px 6px rgba(245, 158, 11, 0.6))',
                      }}
                    >
                      🎟️
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 'bold',
                          color: '#fbbf24',
                          marginBottom: '4px',
                        }}
                      >
                        {pass.name}
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

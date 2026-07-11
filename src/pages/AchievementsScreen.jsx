import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenLayout from '../components/common/ScreenLayout.jsx';

import {
  setRenderAchievementsListHook,
  setRenderAchievementsStatsHook,
  showCardAcquisitionModal,
  showPlaymatAcquisitionModal,
  showPremiumAcquisitionModal,
  showSkinAcquisitionModal,
  showIconAcquisitionModal,
} from '../services/uiGallery.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import {
  ACHIEVEMENT_MASTER,
  achievementData,
  checkAndFixMissingRewards,
  checkCollectionAchievements,
  claimAchievementReward,
  saveAchievements,
} from '../utils/constants/achievements.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

const DEBUG_MODE_CLICK_THRESHOLD = import.meta.env.DEV ? 10 : Infinity;

// リーダー統計から除外すべきキャラクターを判定
// satan: 特殊キャラクター、void/succubus/warlock: トーナメント除外キャラ
const shouldExcludeFromLeaderStats = (charId) => {
  return (
    charId === 'satan' ||
    charId === 'void' ||
    charId === 'succubus' ||
    charId === 'warlock'
  );
};

export default function AchievementsScreen() {
  const [clickCount, setClickCount] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);

  // 初期データの計算（純粋なデータ抽出）
  const computeInitialData = () => {
    const _achievements = ACHIEVEMENT_MASTER || [];
    const _data = achievementData || { achievements: {}, stats: {} };
    const usageObj = _data.stats?.leaderUsage || {};
    const totalUsage = Object.values(usageObj).reduce(
      (sum, count) => sum + count,
      0
    );
    const sortedChars = Object.values(CHARACTERS || {})
      .filter((c) => !shouldExcludeFromLeaderStats(c.id))
      .sort((a, b) => (usageObj[b.id] || 0) - (usageObj[a.id] || 0))
      .map((char) => {
        const count = usageObj[char.id] || 0;
        const percentage =
          totalUsage > 0 ? Math.floor((count / totalUsage) * 100) : 0;
        return { ...char, count, percentage };
      });

    return {
      achievements: [..._achievements],
      stats: _data.stats || {},
      leaderUsage: { totalUsage, chars: sortedChars },
    };
  };

  const initialData = useMemo(() => computeInitialData(), []);

  const [achievements, setAchievements] = useState(initialData.achievements);
  const [stats, setStats] = useState(initialData.stats);
  const [leaderUsage, setLeaderUsage] = useState(initialData.leaderUsage);

  // 実績データのチェックと初期同期（初回マウント時の副作用処理）
  useEffect(() => {
    let hasChanges = false;
    if (typeof checkAndFixMissingRewards === 'function') {
      checkAndFixMissingRewards();
      hasChanges = true;
    }
    if (typeof checkCollectionAchievements === 'function') {
      checkCollectionAchievements();
      if (typeof saveAchievements === 'function') {
        saveAchievements();
      }
      hasChanges = true;
    }

    if (hasChanges) {
      const updated = computeInitialData();
      setAchievements(updated.achievements);
      setStats(updated.stats);
      setLeaderUsage(updated.leaderUsage);
    }
  }, []);

  const updateAchievements = useCallback(() => {
    if (typeof checkAndFixMissingRewards === 'function') {
      checkAndFixMissingRewards();
    }

    if (typeof checkCollectionAchievements === 'function') {
      checkCollectionAchievements();
      if (typeof saveAchievements === 'function') saveAchievements();
    }

    const _achievements = ACHIEVEMENT_MASTER || [];
    const _data = achievementData || { achievements: {}, stats: {} };

    setAchievements([..._achievements]);
    setStats(_data.stats || {});

    // リーダー使用率の計算
    const usageObj = _data.stats?.leaderUsage || {};
    const totalUsage = Object.values(usageObj).reduce(
      (sum, count) => sum + count,
      0
    );

    const sortedChars = Object.values(CHARACTERS || {})
      .filter((c) => !shouldExcludeFromLeaderStats(c.id))
      .sort((a, b) => (usageObj[b.id] || 0) - (usageObj[a.id] || 0))
      .map((char) => {
        const count = usageObj[char.id] || 0;
        const percentage =
          totalUsage > 0 ? Math.floor((count / totalUsage) * 100) : 0;
        return { ...char, count, percentage };
      });

    setLeaderUsage({ totalUsage, chars: sortedChars });
  }, []);

  useEffect(() => {
    setRenderAchievementsListHook(updateAchievements);
    setRenderAchievementsStatsHook(updateAchievements); // 両方カバー
    return () => {
      setRenderAchievementsListHook(null);
      setRenderAchievementsStatsHook(null);
    };
  }, [updateAchievements]);

  const handleClaim = (id) => {
    try {
      const result =
        typeof claimAchievementReward === 'function'
          ? claimAchievementReward(id)
          : null;
      if (result && result.success) {
        if (result.rewardType === 'playmat') {
          showPlaymatAcquisitionModal?.(result.rewardName, result.rewardValue);
        } else if (result.rewardType === 'card') {
          showCardAcquisitionModal?.(result.rewardValue);
        } else if (result.rewardType === 'premium') {
          showPremiumAcquisitionModal?.(result.rewardValue);
        } else if (result.rewardType === 'skin') {
          showSkinAcquisitionModal?.(result.rewardName, result.rewardValue);
        } else if (result.rewardType === 'icon') {
          showIconAcquisitionModal?.(result.rewardName, result.rewardValue);
        }
      }
      updateAchievements();
    } catch (e) {
      console.error('Claim Error:', e);
      if (typeof showAlertModal === 'function') {
        showAlertModal('実績獲得中にエラーが発生しました: ' + e.message);
      }
    }
  };

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= DEBUG_MODE_CLICK_THRESHOLD) {
      setClickCount(0);

      if (showConfirmModal) {
        showConfirmModal(
          'デバッグモードを起動して全ての実績を解除しますか？',
          () => {
            if (ACHIEVEMENT_MASTER && achievementData) {
              ACHIEVEMENT_MASTER.forEach((ach) => {
                const data = achievementData.achievements[ach.id] || {
                  progress: 0,
                  isUnlocked: false,
                };
                data.isUnlocked = true;
                if (
                  ach.type === 'story_clear' ||
                  ach.type === 'story_clear_hard'
                ) {
                  data.progress = 1;
                } else {
                  data.progress = ach.targetValue || 100;
                }
                achievementData.achievements[ach.id] = data;
              });
            }
            if (achievementData && achievementData.stats) {
              achievementData.stats.voidDefeated = 1;
              achievementData.stats.succubusDefeated = 1;
              achievementData.stats.warlockDefeated = 1;
              achievementData.stats.storyClears =
                achievementData.stats.storyClears || {};
              achievementData.stats.storyClears['knight'] = 1; // サタン解放用
            }

            if (typeof saveAchievements === 'function') saveAchievements();
            updateAchievements(); // リアクティブに再描画
            if (typeof playSound === 'function' && SOUNDS)
              playSound(SOUNDS.seSkill);
            if (typeof showAlertModal === 'function')
              showAlertModal('デバッグモード：すべての実績を解除しました！');
          }
        );
      }
    }
  };

  return (
    <ScreenLayout
      id="screen-achievements"
      title="実績"
      titleColor="#facc15"
      backgroundImage="background_gallery.webp"
      onTitleClick={handleTitleClick}
      backTo="screen-gallery-menu"
      showBackButton={true}
    >
      <div
        className="accordion-container"
        style={{ width: '100%', maxWidth: '400px', marginBottom: '15px' }}
      >
        <div
          className="accordion-header"
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            setStatsOpen(!statsOpen);
          }}
          style={{
            background: '#334155',
            padding: '10px',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#fff',
            fontWeight: 'bold',
          }}
        >
          {statsOpen ? '▼' : '▶'} プレイ統計（リーダー使用率など）
        </div>

        {statsOpen && (
          <div
            className="accordion-content"
            style={{
              display: 'block',
              padding: '10px',
              background: '#1e293b',
              borderRadius: '0 0 8px 8px',
            }}
          >
            <div
              style={{
                fontSize: '0.9rem',
                color: '#cbd5e1',
                marginBottom: '15px',
                borderBottom: '1px solid #334155',
                paddingBottom: '5px',
              }}
            >
              <div>
                バトル勝利数:{' '}
                <span style={{ color: '#facc15', fontWeight: 'bold' }}>
                  {stats.freeBattleWins || 0}
                </span>{' '}
                回
              </div>
            </div>
            <div
              style={{
                fontWeight: 'bold',
                color: '#f8fafc',
                marginBottom: '10px',
                fontSize: '0.95rem',
              }}
            >
              各リーダー利用率 (合計: {leaderUsage.totalUsage || 0}回)
            </div>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {leaderUsage.chars?.map((char) => (
                <div
                  key={char.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                  }}
                >
                  <img
                    src={char.icon}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '4px',
                      border: `1px solid ${char.color}`,
                    }}
                    alt={char.name}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem',
                        marginBottom: '2px',
                      }}
                    >
                      <span style={{ color: char.color }}>{char.name}</span>
                      <span style={{ color: '#cbd5e1' }}>
                        {char.count} 回 ({char.percentage}%)
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        background: '#0f172a',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: '1px solid #334155',
                      }}
                    >
                      <div
                        style={{
                          width: `${char.percentage}%`,
                          height: '100%',
                          background: char.color,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card-list-container" style={{ flex: 1, minHeight: 0 }}>
        <div
          id="achievements-list-container"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: '100%',
          }}
        >
          {achievements.map((ach) => {
            const savedData = achievementData?.achievements?.[ach.id] || {
              progress: 0,
              isUnlocked: false,
            };
            const progress = savedData.progress;
            const isStory =
              ach.type === 'story_clear' ||
              ach.type === 'story_clear_hard' ||
              ach.type === 'event_clear';

            let target = ach.targetValue;
            if (target === -1 && CARD_MASTER) {
              target = CARD_MASTER.filter(
                (c) => !c.isToken && !c.id.includes('token')
              ).length;
            }

            let displayProgress = isStory ? (progress > 0 ? 1 : 0) : progress;
            const displayTarget = isStory ? 1 : target;

            const isUnlocked = savedData.isUnlocked;

            // 既存プレイヤー影響防止策：すでにロック解除されている場合は表示上のプログレスをターゲット値に合わせる
            if (isUnlocked && displayProgress < displayTarget) {
              displayProgress = displayTarget;
            }

            const safeTarget = displayTarget > 0 ? displayTarget : 1;
            const percentage = Math.min(
              100,
              Math.floor((displayProgress / safeTarget) * 100)
            );

            const bgColor = isUnlocked
              ? 'rgba(16, 185, 129, 0.2)'
              : 'rgba(0, 0, 0, 0.5)';
            const borderColor = isUnlocked ? '#10b981' : '#475569';
            const titleColor = isUnlocked ? '#34d399' : '#f8fafc';

            const isClaimable =
              ach.reward && isUnlocked && !savedData.isRewarded;

            return (
              <div
                key={ach.id}
                onClick={() => isClaimable && handleClaim(ach.id)}
                style={{
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '8px',
                  padding: '10px',
                  textAlign: 'left',
                  width: '100%',
                  boxSizing: 'border-box',
                  position: 'relative',
                  cursor: isClaimable ? 'pointer' : 'default',
                  /* Reactではanimationもstyleオブジェクトやcssで可能 */
                  boxShadow: isClaimable ? '0 0 15px #facc15' : 'none',
                  borderColor: isClaimable ? '#facc15' : borderColor,
                }}
              >
                <div
                  style={{
                    fontWeight: 'bold',
                    color: titleColor,
                    marginBottom: '5px',
                    fontSize: '1rem',
                  }}
                >
                  {ach.title}
                </div>
                <div
                  style={{
                    color: '#cbd5e1',
                    fontSize: '0.85rem',
                    marginBottom: '8px',
                  }}
                >
                  {ach.description}
                </div>
                <div
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    borderRadius: '4px',
                    height: '12px',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    border: '1px solid #334155',
                  }}
                >
                  <div
                    style={{
                      width: `${percentage}%`,
                      height: '100%',
                      background: isUnlocked ? '#10b981' : '#3b82f6',
                      transition: 'width 0.3s ease',
                    }}
                  ></div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '5px',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {displayProgress} / {displayTarget}
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    {ach.reward ? (
                      <>
                        <span style={{ fontSize: '0.8rem', color: '#facc15' }}>
                          報酬:{' '}
                          {ach.reward.type === 'playmat'
                            ? 'プレイマット'
                            : ach.reward.type === 'premium'
                              ? 'プレミアム'
                              : ach.reward.type === 'skin'
                                ? 'スキン'
                                : ach.reward.type === 'icon'
                                  ? 'アイコン'
                                  : 'カード'}
                        </span>
                        {savedData.isRewarded ? (
                          <span style={{ color: '#94a3b8' }}>(取得済)</span>
                        ) : (
                          <button
                            className="btn"
                            style={{
                              padding: '2px 8px',
                              fontSize: '0.7rem',
                              minHeight: '20px',
                              margin: 0,
                              background: isUnlocked ? '' : '#475569',
                              opacity: isUnlocked ? '1' : '0.6',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isUnlocked) handleClaim(ach.id);
                            }}
                          >
                            受け取る
                          </button>
                        )}
                      </>
                    ) : (
                      isUnlocked && (
                        <div
                          style={{
                            fontSize: '0.8rem',
                            marginTop: '5px',
                            fontWeight: 'bold',
                            color: '#facc15',
                          }}
                        >
                          ✨ 達成！ ✨
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScreenLayout>
  );
}

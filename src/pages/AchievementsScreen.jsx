import React, { useState, useEffect } from 'react';

import { ACHIEVEMENT_MASTER, achievementData, claimAchievementReward, saveAchievements, checkCollectionAchievements } from '../utils/constants/achievements.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { playSound, isTransitioning, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { setRenderAchievementsListHook, showCardAcquisitionModal, showPremiumAcquisitionModal, showPlaymatAcquisitionModal, setRenderAchievementsStatsHook } from '../hooks/uiGallery.js';
import { showAlertModal } from '../hooks/uiModals.js';

export default function AchievementsScreen() {
  const [clickCount, setClickCount] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [stats, setStats] = useState({});
  const [statsOpen, setStatsOpen] = useState(true);
  const [leaderUsage, setLeaderUsage] = useState([]);

  const updateAchievements = () => {
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
    const totalUsage = Object.values(usageObj).reduce((sum, count) => sum + count, 0);
    
    const sortedChars = Object.values(CHARACTERS || {})
      .filter(c => c.id !== 'satan')
      .sort((a, b) => (usageObj[b.id] || 0) - (usageObj[a.id] || 0))
      .map(char => {
         const count = usageObj[char.id] || 0;
         const percentage = totalUsage > 0 ? Math.floor((count / totalUsage) * 100) : 0;
         return { ...char, count, percentage };
      });
      
    setLeaderUsage({ totalUsage, chars: sortedChars });
  };

  useEffect(() => {
    updateAchievements();
    setRenderAchievementsListHook(updateAchievements);
    setRenderAchievementsStatsHook(updateAchievements); // 両方カバー
  }, []);

  const handleClaim = (id) => {
    try {
        const result = typeof claimAchievementReward === 'function' ? claimAchievementReward(id) : null;
        if (result && result.success) {
            if (result.rewardType === 'playmat') {
                showPlaymatAcquisitionModal?.(result.rewardName, result.rewardValue);
            } else if (result.rewardType === 'card') {
                showCardAcquisitionModal?.(result.rewardValue);
            } else if (result.rewardType === 'premium') {
                showPremiumAcquisitionModal?.(result.rewardValue);
            }
        }
        updateAchievements();
    } catch (e) {
        console.error("Claim Error:", e);
        if (typeof showAlertModal === 'function') {
            showAlertModal("実績獲得中にエラーが発生しました: " + e.message);
        }
    }
  };

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 10) {
      setClickCount(0);
      
      if (ACHIEVEMENT_MASTER && achievementData) {
        ACHIEVEMENT_MASTER.forEach(ach => {
            const data = achievementData.achievements[ach.id] || { progress: 0, isUnlocked: false };
            data.isUnlocked = true;
            if (ach.type === 'story_clear' || ach.type === 'story_clear_hard') {
                data.progress = 1;
            } else {
                data.progress = ach.targetValue || 100;
            }
            achievementData.achievements[ach.id] = data;
        });
      }
      
      if (typeof saveAchievements === 'function') saveAchievements();
      updateAchievements(); // リアクティブに再描画
      if (typeof playSound === 'function' && SOUNDS) playSound(SOUNDS.seSkill);
      if (typeof showAlertModal === 'function') showAlertModal("デバッグモード：すべての実績を解除しました！");
    }
  };

  return (
    <div id="screen-achievements" className="screen active">
      <h2 
        style={{ color: '#facc15', marginBottom: '5px', fontSize: '1.2rem', cursor: 'pointer', userSelect: 'none' }}
        onClick={handleTitleClick}
      >
        実績
      </h2>

      <div className="accordion-container" style={{ width: '100%', maxWidth: '400px', marginBottom: '15px' }}>
        <div 
          className="accordion-header" 
          onClick={() => { playSound?.(SOUNDS?.seClick); setStatsOpen(!statsOpen); }}
          style={{ background: '#334155', padding: '10px', borderRadius: '8px', cursor: 'pointer', color: '#fff', fontWeight: 'bold' }}
        >
          {statsOpen ? '▼' : '▶'} プレイ統計（リーダー使用率など）
        </div>
        
        {statsOpen && (
          <div className="accordion-content" style={{ display: 'block', padding: '10px', background: '#1e293b', borderRadius: '0 0 8px 8px' }}>
            <div style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '15px', borderBottom: '1px solid #334155', paddingBottom: '5px' }}>
              <div>バトル勝利数: <span style={{ color: '#facc15', fontWeight: 'bold' }}>{stats.freeBattleWins || 0}</span> 回</div>
            </div>
            <div style={{ fontWeight: 'bold', color: '#f8fafc', marginBottom: '10px', fontSize: '0.95rem' }}>
              各リーダー利用率 (合計: {leaderUsage.totalUsage || 0}回)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaderUsage.chars?.map(char => (
                <div key={char.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                  <img src={char.icon} style={{ width: '32px', height: '32px', borderRadius: '4px', border: `1px solid ${char.color}` }} alt={char.name} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                      <span style={{ color: char.color }}>{char.name}</span>
                      <span style={{ color: '#cbd5e1' }}>{char.count} 回 ({char.percentage}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden', border: '1px solid #334155' }}>
                      <div style={{ width: `${char.percentage}%`, height: '100%', background: char.color }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className="card-list-container" style={{ flex: 1, minHeight: 0 }}>
        <div id="achievements-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          {achievements.map((ach) => {
             const savedData = achievementData?.achievements?.[ach.id] || { progress: 0, isUnlocked: false };
             const progress = savedData.progress;
             const isStory = ach.type === 'story_clear' || ach.type === 'story_clear_hard' || ach.type === 'event_clear';
             
             let target = ach.targetValue;
             if (target === -1 && CARD_MASTER) {
                 target = CARD_MASTER.filter(c => !c.isToken && !c.id.includes('token')).length;
             }

             const displayProgress = isStory ? (progress > 0 ? 1 : 0) : progress;
             const displayTarget = isStory ? 1 : target;
             
             const isUnlocked = savedData.isUnlocked;
             const percentage = Math.min(100, Math.floor((displayProgress / displayTarget) * 100));
             
             const bgColor = isUnlocked ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0, 0, 0, 0.5)';
             const borderColor = isUnlocked ? '#10b981' : '#475569';
             const titleColor = isUnlocked ? '#34d399' : '#f8fafc';

             const isClaimable = ach.reward && isUnlocked && !savedData.isRewarded;

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
                   borderColor: isClaimable ? '#facc15' : borderColor
                 }}
               >
                 <div style={{ fontWeight: 'bold', color: titleColor, marginBottom: '5px', fontSize: '1rem' }}>{ach.title}</div>
                 <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '8px' }}>{ach.description}</div>
                 <div style={{ width: '100%', background: '#0f172a', borderRadius: '4px', height: '12px', marginBottom: '4px', overflow: 'hidden', border: '1px solid #334155' }}>
                   <div style={{ width: `${percentage}%`, height: '100%', background: isUnlocked ? '#10b981' : '#3b82f6', transition: 'width 0.3s ease' }}></div>
                 </div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                   <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{displayProgress} / {displayTarget}</span>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     {ach.reward ? (
                       <>
                         <span style={{ fontSize: '0.8rem', color: '#facc15' }}>
                           報酬: {ach.reward.type === 'playmat' ? 'プレイマット' : (ach.reward.type === 'premium' ? 'プレミアム' : 'カード')}
                         </span>
                         {savedData.isRewarded ? (
                           <span style={{ color: '#94a3b8' }}>(取得済)</span>
                         ) : (
                           <button 
                             className="btn" 
                             style={{ padding: '2px 8px', fontSize: '0.7rem', minHeight: '20px', margin: 0, background: isUnlocked ? '' : '#475569', opacity: isUnlocked ? '1' : '0.6' }}
                             onClick={(e) => { e.stopPropagation(); if (isUnlocked) handleClaim(ach.id); }}
                           >
                             受け取る
                           </button>
                         )}
                       </>
                     ) : (
                       isUnlocked && <div style={{ fontSize: '0.8rem', marginTop: '5px', fontWeight: 'bold', color: '#facc15' }}>✨ 達成！ ✨</div>
                     )}
                   </div>
                 </div>
               </div>
             );
          })}
        </div>
      </div>

      <button
        className="btn"
        style={{ marginTop: '15px', background: '#475569' }}
        onClick={() => switchScreen?.('screen-gallery-menu')}
      >
        戻る
      </button>
    </div>
  );
}

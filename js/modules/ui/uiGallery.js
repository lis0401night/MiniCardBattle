// ==========================================
// UI Gallery Logic (Card List & Previews)
// ==========================================

function showGallery() {
    playSound(SOUNDS.seClick);
    switchScreen('screen-gallery-menu');
}

function showCardList() {
    playSound(SOUNDS.seClick);
    if (typeof loadDeck === 'function') {
        loadDeck();
    }
    renderCardList();
    switchScreen('screen-card-list');
}

function renderCardList() {
    const grid = document.getElementById('gallery-card-grid');
    const countEl = document.getElementById('card-list-count');
    if (!grid || !countEl) return;

    grid.innerHTML = '';
    const masterCards = CARD_MASTER.filter(c => !c.isToken);
    let ownedKindCount = 0;

    masterCards.forEach(template => {
        const ownedCount = playerInventory[template.id] || 0;
        const inDeckCount = playerDeckSelection.filter(c => c.id === template.id).length;
        if (ownedCount > 0) ownedKindCount++;

        const item = document.createElement('div');
        item.className = 'deck-card-item gallery-card-wrapper';

        const imgUrl = getCardImgUrl(template);
        const rarityClass = template.rarity ? ` rarity-${template.rarity}` : '';
        const isOwned = ownedCount > 0;
        const opacity = isOwned ? "1" : "0.4";

        const premiumIcon = unlockedPremiumCards.includes(template.id) ?
            `<div class="premium-toggle-icon" onclick="event.stopPropagation(); if(isTransitioning)return; playSound(SOUNDS.seClick); togglePremiumCard('${template.id}'); renderCardList();" style="position:absolute; top:4px; left:4px; background:rgba(0,0,0,0.85); color:${premiumCards.includes(template.id) ? '#d946ef' : '#94a3b8'}; padding:2px 6px; border-radius:10px; font-size:0.8rem; z-index:7; border:1px solid ${premiumCards.includes(template.id) ? '#d946ef' : '#475569'}; cursor:pointer;">✨</div>` : '';

        item.innerHTML = `
            <div class="card blue${rarityClass}" style="opacity:${opacity};">
                <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${playerConfig.filter};"></div>
                ${premiumIcon}
                <div class="card-power" style="font-size:1.4rem; bottom:0; right:4px;">${template.power}</div>
                ${renderSkillTag(template)}
                <div style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.85); color:#facc15; padding:1px 6px; border-radius:10px; font-weight:bold; font-size:0.75rem; z-index:6; border:1px solid #facc15;">
                    ${ownedCount}/4
                </div>
            </div>
        `;
        item.onclick = () => { if(!isTransitioning) openCardPreview(template); };
        grid.appendChild(item);
    });

    countEl.innerText = `カード枚数: ${ownedKindCount} / ${masterCards.length}`;
}

// --- 実績UI ---

function showAchievements() {
    if (typeof isTransitioning !== 'undefined' && isTransitioning) return;
    playSound(SOUNDS.seClick);
    
    // 最新の所持カード情報を反映
    if (typeof checkCollectionAchievements === 'function') {
        checkCollectionAchievements();
        saveAchievements();
    }
    
    renderAchievementsList();
    renderAchievementsStats();
    switchScreen('screen-achievements');
}

function toggleAchievementSection(sectionId) {
    if (typeof isTransitioning !== 'undefined' && isTransitioning) return;
    playSound(SOUNDS.seClick);
    const content = document.getElementById(`achievements-${sectionId}-content`);
    // 表示状態のトグル
    if (content.style.display === 'none') {
        content.style.display = 'block';
    } else {
        content.style.display = 'none';
    }
}

function renderAchievementsList() {
    const container = document.getElementById('achievements-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    ACHIEVEMENT_MASTER.forEach(ach => {
        const savedData = achievementData.achievements[ach.id] || { progress: 0, isUnlocked: false };
        const progress = savedData.progress;
        const target = ach.targetValue === -1 ? 
            CARD_MASTER.filter(c => !c.isToken && !c.id.includes('token')).length : 
            ach.targetValue;
            
        // ストーリー系はターゲット値がキャラID、プログレスがクリア回数（基本1で最大1にする）
        const isStory = ach.type === 'story_clear';
        const displayProgress = isStory ? (progress > 0 ? 1 : 0) : progress;
        const displayTarget = isStory ? 1 : target;
        
        const isUnlocked = savedData.isUnlocked;
        const percentage = Math.min(100, Math.floor((displayProgress / displayTarget) * 100));
        
        const bgColor = isUnlocked ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0, 0, 0, 0.5)';
        const borderColor = isUnlocked ? '#10b981' : '#475569';
        const titleColor = isUnlocked ? '#34d399' : '#f8fafc';
        
        let rewardHtml = '';
        if (ach.reward) {
            // 将来的な報酬表示
            const rewardStatus = savedData.isRewarded ? '<span style="color:#94a3b8">(取得済)</span>' : `<button class="btn" style="padding:2px 8px; font-size:0.7rem; min-height:20px; margin:0;" onclick="if(typeof isTransitioning === 'undefined' || !isTransitioning){claimAchievementReward('${ach.id}'); renderAchievementsList();}">受け取る</button>`;
            rewardHtml = `<div style="font-size: 0.8rem; margin-top: 5px; color: #facc15;">報酬: ${ach.reward.type} ${rewardStatus}</div>`;
        } else if (isUnlocked) {
            rewardHtml = `<div style="font-size: 0.8rem; margin-top: 5px; font-weight:bold; color: #facc15;">✨ 達成！ ✨</div>`;
        }

        const el = document.createElement('div');
        el.style.cssText = `background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 10px; text-align: left; width: 100%; box-sizing: border-box;`;
        el.innerHTML = `
            <div style="font-weight: bold; color: ${titleColor}; margin-bottom: 5px; font-size: 1rem;">${ach.title}</div>
            <div style="color: #cbd5e1; font-size: 0.85rem; margin-bottom: 8px;">${ach.description}</div>
            <div style="width: 100%; background: #0f172a; border-radius: 4px; height: 12px; margin-bottom: 4px; overflow: hidden; border: 1px solid #334155;">
                <div style="width: ${percentage}%; height: 100%; background: ${isUnlocked ? '#10b981' : '#3b82f6'}; transition: width 0.3s ease;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8rem; color: #94a3b8;">${displayProgress} / ${displayTarget}</span>
                ${rewardHtml}
            </div>
        `;
        container.appendChild(el);
    });
}

function renderAchievementsStats() {
    const container = document.getElementById('achievements-stats-content');
    if (!container) return;
    
    const stats = achievementData.stats;
    const usageObj = stats.leaderUsage || {};
    
    // 合計使用回数を計算
    const totalUsage = Object.values(usageObj).reduce((sum, count) => sum + count, 0);
    
    // キャラクターを使用回数の降順でソート
    const sortedChars = Object.values(CHARACTERS)
        .filter(c => c.id !== 'satan') // サタンは除外
        .sort((a, b) => (usageObj[b.id] || 0) - (usageObj[a.id] || 0));

    let html = `<div style="font-size: 0.9rem; color: #cbd5e1; margin-bottom: 15px; border-bottom: 1px solid #334155; padding-bottom: 5px;">
        <div>フリーバトル勝利数: <span style="color:#facc15; font-weight:bold;">${stats.freeBattleWins || 0}</span> 回</div>
    </div>
    <div style="font-weight: bold; color: #f8fafc; margin-bottom: 10px; font-size: 0.95rem;">各リーダー利用率 (合計: ${totalUsage}回)</div>
    <div style="display: flex; flex-direction: column; gap: 8px;">`;

    sortedChars.forEach(char => {
        const count = usageObj[char.id] || 0;
        const percentage = totalUsage > 0 ? Math.floor((count / totalUsage) * 100) : 0;
        
        html += `
            <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <img src="${char.icon}" style="width: 32px; height: 32px; border-radius: 4px; border: 1px solid ${char.color};">
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 2px;">
                        <span style="color: ${char.color};">${char.name}</span>
                        <span style="color: #cbd5e1;">${count} 回 (${percentage}%)</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: #0f172a; border-radius: 4px; overflow: hidden; border: 1px solid #334155;">
                        <div style="width: ${percentage}%; height: 100%; background: ${char.color};"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

function showRulesModal() {
    playSound(SOUNDS.seClick);
    const modal = document.getElementById('modal-rules');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeRulesModal() {
    playSound(SOUNDS.seClick);
    const modal = document.getElementById('modal-rules');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function debugUnlockCards() {
    rulesClickCount++;
    if (rulesClickCount >= 10) {
        rulesClickCount = 0;
        CARD_MASTER.forEach(card => {
            if (!card.isToken) {
                playerInventory[card.id] = 4;
            }
        });

        // プレミアムカード(empress, assassin, cyberdragon, dragon, oldgod, wolf)の解放
        const premiumTargets = ['empress', 'assassin', 'cyberdragon', 'dragon', 'oldgod', 'wolf'];
        premiumTargets.forEach(id => {
            if (!unlockedPremiumCards.includes(id)) {
                unlockedPremiumCards.push(id);
            }
        });

        saveDeck();
        playSound(SOUNDS.seSkill);
        showAlertModal("デバッグモード：全カードを4枚所持状態にしました！");
    }
}

function setupLongPress(element, cardData) {
    let startX = 0;
    let startY = 0;

    const start = (e) => {
        if (e.type === 'touchstart') {
            e.stopPropagation();
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }

        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            openCardPreview(cardData);
        }, 500);
    };

    const move = (e) => {
        if (!longPressTimer) return;
        let currentX = 0;
        let currentY = 0;
        if (e.type === 'touchmove') {
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
        } else {
            currentX = e.clientX;
            currentY = e.clientY;
        }
        const deltaX = Math.abs(currentX - startX);
        const deltaY = Math.abs(currentY - startY);
        if (deltaX > 10 || deltaY > 10) {
            cancel();
        }
    };

    const cancel = () => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    };

    element.addEventListener('mousedown', start);
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('mousemove', move);
    element.addEventListener('touchmove', move, { passive: true });
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
    element.addEventListener('touchend', cancel);
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openCardPreview(cardData);
        return false;
    });
}

function populateCardPreview(prefix, card) {
    if (!card) return;
    const container = document.getElementById(`${prefix}-card-container`);
    const nameEl = document.getElementById(`${prefix}-card-name`);
    const flavorEl = document.getElementById(`${prefix}-card-flavor`);
    const skillsList = document.getElementById(`${prefix}-skills-list`);

    if (container) {
        container.innerHTML = '';
        const cardImgUrl = getCardImgUrl(card);
        const cardClone = document.createElement('div');
        const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
        cardClone.className = `card blue${rarityClass}`;
        cardClone.style.width = "180px";
        cardClone.style.height = "270px";
        cardClone.innerHTML = `
            <div class="card-bg" style="background-image: url('${cardImgUrl}'); filter: ${playerConfig.filter};"></div>
            <div class="card-power">${card.currentPower || card.power}</div>
        `;
        // スキルバッジの描画（BaseUI.js の renderSkillTag を再利用）
        if (typeof renderSkillTag === 'function') {
            const skillTagHtml = renderSkillTag(card, false);
            if (skillTagHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = skillTagHtml;
                if (tempDiv.firstChild) {
                    const badges = tempDiv.firstChild;
                    cardClone.appendChild(badges);
                }
            }
        }
        container.appendChild(cardClone);
    }

    if (nameEl) {
        nameEl.innerText = card.name;
        const rarityColors = { 1: '#cd7f32', 2: '#e2e8f0', 3: '#facc15', 4: '#fde047' };
        nameEl.style.color = rarityColors[card.rarity] || '#fff';
    }

    if (skillsList) {
        skillsList.innerHTML = '';
        let skillCandidates = [];

        // 1. 基本スキル
        if (card.skill && card.skill !== 'none' && card.skill !== undefined) {
            skillCandidates.push({ id: card.skill, value: card.skillValue });
        }
        // 2. 複数スキル配列
        if (Array.isArray(card.skills)) {
            card.skills.forEach(sk => {
                skillCandidates.push({ id: sk.id, value: sk.value });
            });
        }

        if (skillCandidates.length > 0) {
            skillCandidates.forEach(sk => {
                const s = SKILLS[sk.id];
                if (s) {
                    const item = document.createElement('div');
                    item.className = 'preview-skill-item';
                    const val = (sk.value === null || sk.value === undefined) ? '' : sk.value;
                    const desc = typeof s.desc === 'function' ? s.desc(sk.value) : s.desc;

                    if (sk.id === 'choice' && Array.isArray(card.choices)) {
                        let subDetailsHtml = '';
                        card.choices.forEach(cho => {
                            const cs = SKILLS[cho.id];
                            if (cs) {
                                const cVal = (cho.value === null || cho.value === undefined) ? '' : cho.value;
                                const cDesc = typeof cs.desc === 'function' ? cs.desc(cho.value) : cs.desc;
                                subDetailsHtml += `
                                    <div style="margin-left: 10px; border-left: 2px solid #475569; padding-left: 10px; margin-top: 8px; margin-bottom: 8px;">
                                        <div class="preview-skill-badge" style="background: rgba(148, 163, 184, 0.2); border-color: #94a3b8; color: #94a3b8; font-size: 0.75rem;">${cs.icon} ${cs.name}${cVal}</div>
                                        <p class="preview-skill-desc" style="font-size: 0.8rem; color: #94a3b8; margin: 4px 0 0 0;">${cDesc}</p>
                                    </div>
                                `;
                            }
                        });

                        item.innerHTML = `
                            <details class="choice-accordion" style="width: 100%;">
                                <summary style="list-style: none; cursor: pointer; outline: none; width: 100%;">
                                    <div class="preview-skill-badge" style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 110px; position: relative; margin: 0 auto;">
                                        <span>${s.icon} ${s.name}${val}</span>
                                        <span class="accordion-icon" style="font-size: 0.8rem; transition: transform 0.2s; position: absolute; right: 8px;">▼</span>
                                    </div>
                                    <p class="preview-skill-desc" style="margin-top: 6px; margin-bottom: 8px; color: #f8fafc; text-align: center;">${desc}</p>
                                </summary>
                                <div class="accordion-content" style="margin-top: 5px;">
                                    ${subDetailsHtml}
                                </div>
                            </details>
                        `;
                    } else {
                        item.innerHTML = `
                            <div class="preview-skill-badge">${s.icon} ${s.name}${val}</div>
                            <p class="preview-skill-desc">${desc}</p>
                        `;
                    }
                    skillsList.appendChild(item);
                }
            });
        } else {
            skillsList.innerHTML = '<p class="preview-skill-desc">能力なし</p>';
        }
    }

    if (flavorEl) {
        if (card.flavor) {
            flavorEl.innerText = card.flavor;
            flavorEl.style.display = 'block';
        } else {
            flavorEl.innerText = '';
            flavorEl.style.display = 'none';
        }
    }

    // プレミアム切替ボタンの表示制御
    const premiumToggleBtn = document.getElementById(`${prefix}-premium-toggle`);
    if (premiumToggleBtn) {
        if (unlockedPremiumCards.includes(card.id)) {
            premiumToggleBtn.style.display = 'block';
            premiumToggleBtn.innerText = premiumCards.includes(card.id) ? '✨ プレミアムON' : '✨ プレミアムOFF';
            premiumToggleBtn.style.background = premiumCards.includes(card.id) ? 'linear-gradient(45deg, #d946ef, #9333ea)' : '#475569';
            premiumToggleBtn.onclick = (e) => {
                e.stopPropagation();
                playSound(SOUNDS.seClick);
                togglePremiumCard(card.id);
                populateCardPreview(prefix, card);
                if (typeof renderCardList === 'function' && document.getElementById('screen-card-list') && document.getElementById('screen-card-list').classList.contains('active')) {
                    renderCardList();
                }
                if (typeof renderDeckEdit === 'function' && document.getElementById('screen-deck-edit') && document.getElementById('screen-deck-edit').classList.contains('active')) {
                    renderDeckEdit();
                }
            };
        } else {
            premiumToggleBtn.style.display = 'none';
        }
    }
}

function openCardPreview(card) {
    const modal = document.getElementById('card-preview-modal');
    if (!modal) {
        console.error("Card preview modal not found!");
        return;
    }
    populateCardPreview('preview', card);
    modal.style.display = 'flex';
    playSound(SOUNDS.seClick);
}

function closeCardPreview() {
    const modal = document.getElementById('card-preview-modal');
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
        playSound(SOUNDS.seClick);
    }
}

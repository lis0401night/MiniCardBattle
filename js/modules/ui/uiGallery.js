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
            `<div class="premium-toggle-icon" onclick="event.stopPropagation(); playSound(SOUNDS.seClick); togglePremiumCard('${template.id}'); renderCardList();" style="position:absolute; top:4px; left:4px; background:rgba(0,0,0,0.85); color:${premiumCards.includes(template.id) ? '#d946ef' : '#94a3b8'}; padding:2px 6px; border-radius:10px; font-size:0.8rem; z-index:7; border:1px solid ${premiumCards.includes(template.id) ? '#d946ef' : '#475569'}; cursor:pointer;">✨</div>` : '';

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
        item.onclick = () => openCardPreview(template);
        grid.appendChild(item);
    });

    countEl.innerText = `カード枚数: ${ownedKindCount} / ${masterCards.length}`;
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

        // プレミアムカード(empress, assassin, cyberdragoon, dragon)の解放
        const premiumTargets = ['empress', 'assassin', 'cyberdragoon', 'dragon'];
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

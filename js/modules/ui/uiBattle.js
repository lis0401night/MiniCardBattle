// ==========================================
// UI Battle Logic (Hand, Board, & Detail)
// ==========================================

function updateCardDetail(c) {
    const b = document.getElementById('card-detail-view');
    if (!c) {
        if (isDiscardingMode) {
            b.innerHTML = `<div class="skill-info" style="color:#facc15; font-weight:bold;">捨てるカードを${discardMaxCount}枚まで選んでください</div>`;
        } else if (isPlacementMode) {
            b.innerHTML = `<div class="skill-info" style="color:#facc15; font-weight:bold;">配置する場所を選んでください</div>`;
        } else {
            b.innerHTML = '';
        }
        b.style.color = (isDiscardingMode || isPlacementMode) ? '#facc15' : '#94a3b8';
    } else {
        let skillCandidates = [];
        if (c.skill && c.skill !== 'none' && c.skill !== undefined) {
            skillCandidates.push({ id: c.skill, value: c.skillValue });
        }
        if (Array.isArray(c.skills)) {
            c.skills.forEach(sk => {
                skillCandidates.push({ id: sk.id, value: sk.value });
            });
        }
        if (c.stunTurns > 0) {
            skillCandidates.push({ id: 'defender', value: null, isBind: true });
        }

        let grouped = [];
        skillCandidates.forEach(c => {
            const existing = grouped.find(g => g.id === c.id && g.value === c.value && g.isBind === c.isBind);
            if (existing) {
                existing.count++;
            } else {
                grouped.push({ ...c, count: 1 });
            }
        });

        const rarityColors = { 1: '#cd7f32', 2: '#e2e8f0', 3: '#facc15' };
        let html = '<div class="card-detail-content">';
        if (grouped.length > 0) {
            grouped.forEach(sk => {
                const s = SKILLS[sk.id];
                if (s) {
                    const isBind = sk.isBind;
                    const skillName = isBind ? '拘束' : s.name;
                    const val = isBind ? '' : (sk.value ?? '');
                    const skillEffect = typeof s.desc === 'function' ? s.desc(sk.value) : s.desc;
                    const countSuffix = sk.count > 1 ? ` * ${sk.count}` : '';
                    html += `<div class="skill-header">
                        <div class="card-skill-tag" style="background:${isBind ? '#475569' : ''}; border-color:${isBind ? '#ef4444' : ''}; color:${isBind ? '#fca5a5' : ''};">
                            ${s.icon} ${skillName}${val}${countSuffix}
                        </div>
                    </div>
                    <div class="skill-desc">${skillEffect}</div>`;
                }
            });
        } else {
            html += `<div class="skill-desc">能力なし</div>`;
        }
        html += '</div>';
        b.innerHTML = html;
        b.style.color = '#fff';
    }
}

function createCardDOM(c, isBoard = false) {
    const rarityClass = c.rarity ? ` rarity-${c.rarity}` : '';
    const d = document.createElement('div'); d.className = `card ${c.owner}${rarityClass}`;
    let sH = renderSkillTag(c, isBoard);
    let filter = c.filter;
    if (c.owner === 'red' && enemyConfig.isShadow) {
        filter = 'grayscale(1) brightness(0.7) contrast(1.2)';
    }
    if (c.stunTurns > 0) {
        filter = (filter || '') + ' grayscale(1) brightness(0.5)';
    }
    const imgUrl = getCardImgUrl(c);
    d.innerHTML = `
        <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${filter};"></div>
        ${sH}
        <div class="card-power">${c.currentPower}</div>
    `;
    return d;
}

function renderHand() {
    const e = document.getElementById('player-hand'); e.innerHTML = '';
    playerHand.forEach((c, i) => {
        const d = createCardDOM(c, false); d.className += " hand-card" + (i === selectedCardIndex ? " selected" : "");
        d.onclick = () => {
            if (isProcessing && !isDiscardingMode) return;
            playSound(SOUNDS.seClick);
            if (selectedCardIndex === i) {
                selectedCardIndex = null;
                updateCardDetail(null);
            } else {
                selectedCardIndex = i;
                selectedBoardLaneIndex = null;
                selectedBoardSide = null;
                updateCardDetail(playerHand[i]);
            }
            renderHand();
            renderBoard();
            highlightLanes();
        };
        setupLongPress(d, c);
        e.appendChild(d);
    });
}

function highlightLanes() {
    document.querySelectorAll('#player-lanes .cell').forEach((c, i) => {
        if (selectedCardIndex === null) {
            c.classList.remove('highlight');
        } else {
            const card = playerHand[selectedCardIndex];
            if (hasSkill(card, 'legendary')) {
                if (i === 1) c.classList.add('highlight');
                else c.classList.remove('highlight');
            } else {
                c.classList.add('highlight');
            }
        }
    });
}

function renderBoard() {
    for (let i = 0; i < 3; i++) {
        const p = document.querySelector(`#player-lanes .cell[data-lane="${i}"]`), e = document.querySelector(`#enemy-lanes .cell[data-lane="${i}"]`);
        p.innerHTML = ''; p.className = 'cell'; e.innerHTML = ''; e.className = 'cell';
        if (playerBoard[i]) {
            const d = createCardDOM(playerBoard[i], true);
            if (selectedBoardLaneIndex === i && selectedBoardSide === 'player') d.classList.add('selected');
            d.onclick = (ev) => {
                if (selectedCardIndex !== null || (isProcessing && !isDiscardingMode)) return;
                ev.stopPropagation();
                playSound(SOUNDS.seClick);
                if (selectedBoardLaneIndex === i && selectedBoardSide === 'player') {
                    selectedBoardLaneIndex = null;
                    selectedBoardSide = null;
                    updateCardDetail(null);
                } else {
                    selectedBoardLaneIndex = i;
                    selectedBoardSide = 'player';
                    selectedCardIndex = null;
                    updateCardDetail(playerBoard[i]);
                }
                renderBoard();
                renderHand();
            };
            setupLongPress(d, playerBoard[i]);
            p.appendChild(d);
        }
        if (enemyBoard[i]) {
            const d = createCardDOM(enemyBoard[i], true);
            if (selectedBoardLaneIndex === i && selectedBoardSide === 'enemy') d.classList.add('selected');
            d.onclick = (ev) => {
                if (selectedCardIndex !== null || (isProcessing && !isDiscardingMode)) return;
                ev.stopPropagation();
                playSound(SOUNDS.seClick);
                if (selectedBoardLaneIndex === i && selectedBoardSide === 'enemy') {
                    selectedBoardLaneIndex = null;
                    selectedBoardSide = null;
                    updateCardDetail(null);
                } else {
                    selectedBoardLaneIndex = i;
                    selectedBoardSide = 'enemy';
                    selectedCardIndex = null;
                    updateCardDetail(enemyBoard[i]);
                }
                renderBoard();
                renderHand();
            };
            setupLongPress(d, enemyBoard[i]);
            e.appendChild(d);
        }
    }
}

function showDeckRefreshEffect(owner) {
    const battleScreen = document.getElementById('screen-battle');
    if (!battleScreen) return;
    const effectEl = document.createElement('div');
    effectEl.className = 'deck-refresh-effect';
    effectEl.innerText = '山札補充';
    if (owner === 'blue') effectEl.style.top = '65%';
    else effectEl.style.top = '35%';
    battleScreen.appendChild(effectEl);
    setTimeout(() => { if (effectEl.parentNode) effectEl.parentNode.removeChild(effectEl); }, 1500);
}

function returnToTitle() {
    showConfirmModal(
        "バトルを中断してタイトルに戻りますか？",
        () => {
            stopAllBGM();
            appState = 'title';
            switchScreen('screen-mode-select');
            playSound(SOUNDS.bgmTitle);
        }
    );
}

// --- 報酬システム ---
let pendingRewardCard = null;

function showCardReward(enemyId) {
    // 防衛戦では報酬（カード獲得）をスキップ
    if (gameMode === 'defense_attack') {
        appState = 'select_enemy';
        initSelectScreen(true);
        switchScreen('screen-select');
        return;
    }

    let recipeId = enemyId;
    if (gameMode === 'event_satan' && enemyId === 'satan') recipeId = 'satan_high';

    let recipe = ENEMY_DECKS[recipeId] || ENEMY_DECKS.android;
    let enemyDeckIds = [];
    if (recipe.easy && recipe.normal && recipe.hard) {
        if (typeof aiLevel !== 'undefined') {
            if (aiLevel == 1) enemyDeckIds = recipe.easy;
            else if (aiLevel == 3) enemyDeckIds = recipe.hard;
            else enemyDeckIds = recipe.normal;
        } else {
            enemyDeckIds = recipe.normal;
        }
    } else if (Array.isArray(recipe)) {
        enemyDeckIds = recipe;
    } else {
        enemyDeckIds = recipe.normal || [];
    }
    const eligibleIds = [...new Set(enemyDeckIds)].filter(id => {
        const owned = playerInventory[id] || 0;
        return owned < 4;
    });

    if (eligibleIds.length === 0) {
        if (gameMode === 'free' || gameMode === 'defense_attack') {
            appState = 'select_enemy';
            initSelectScreen(true);
            switchScreen('screen-select');
        } else {
            // ストーリーモードで報酬がない場合は、appStateを更新してから進行
            if (gameMode === 'story' && appState === 'post_dialogue') {
                handleStoryProgression();
            } else {
                setupDialogueScreen();
            }
        }
        return;
    }

    const rewardId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
    pendingRewardCard = { ...CARD_MASTER.find(m => m.id === rewardId) };
    populateCardPreview('reward', pendingRewardCard);

    const nameEl = document.getElementById('reward-card-name');
    const skillsList = document.getElementById('reward-skills-list');
    const flavorEl = document.getElementById('reward-card-flavor');
    const mask = document.getElementById('reward-mask');
    const nextBtn = document.getElementById('btn-reward-next');

    nameEl.innerText = "???";
    nameEl.style.color = "#fff";
    skillsList.innerHTML = '<p class="preview-skill-desc">クリックしてカードを公開</p>';
    flavorEl.innerText = "";
    mask.style.display = 'flex';
    nextBtn.style.display = 'none';
    document.getElementById('screen-reward').classList.add('active');
}

function revealRewardCard() {
    const mask = document.getElementById('reward-mask');
    if (mask.style.display === 'none') return;
    mask.style.display = 'none';
    playSound(SOUNDS.seClick);
    populateCardPreview('reward', pendingRewardCard);
    document.getElementById('btn-reward-next').style.display = 'block';
    playerInventory[pendingRewardCard.id] = (playerInventory[pendingRewardCard.id] || 0) + 1;
    saveDeck();
}

function closeRewardScreen() {
    playSound(SOUNDS.seClick);
    document.getElementById('screen-reward').classList.remove('active');
    
    if (gameMode === 'free' || gameMode === 'defense_attack') {
        appState = 'select_enemy';
        initSelectScreen(true);
        switchScreen('screen-select');
    } else {
        // ストーリーモードでは重複再生を防ぐため、既に演出が始まっていないか確認
        if (appState === 'post_dialogue') {
            handleStoryProgression();
        } else {
            setupDialogueScreen();
        }
    }
}

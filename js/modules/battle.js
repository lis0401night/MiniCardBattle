// ==========================================
// バトル進行とスキルロジック
// ==========================================

function prepareBattle() {
    switchScreen('screen-loading');
    const sessionId = Date.now();
    playerDeck = generateDeck('blue', playerConfig, sessionId);
    enemyDeck = generateDeck('red', enemyConfig, sessionId);
    const allCards = [...playerDeck, ...enemyDeck];
    let loaded = 0;
    const finishLoading = () => setTimeout(initBattleState, 500);
    const updateProgress = () => {
        loaded++;
        document.getElementById('loading-text').innerText = `Generating Cards... ${Math.floor((loaded / allCards.length) * 100)}%`;
        if (loaded === allCards.length) finishLoading();
    };
    if (allCards.length === 0) finishLoading();
    allCards.forEach(card => {
        const img = new Image();
        img.onload = updateProgress; img.onerror = updateProgress;
        img.src = card.imgUrl;
    });
}

function initBattleState() {
    stopSound(SOUNDS.bgmTitle); stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle);
    if (gameMode === 'story' && enemyConfig.id === 'satan') playSound(SOUNDS.bgmLastBattle);
    else playSound(SOUNDS.bgmBattle);
    playerMaxHP = MAX_HP; enemyMaxHP = (enemyConfig.id === 'satan') ? 40 : MAX_HP;
    playerHP = playerMaxHP; enemyHP = enemyMaxHP; playerSP = 0; enemySP = 0;
    playerHand = []; enemyHand = []; playerDiscard = []; enemyDiscard = [];
    playerBoard = [null, null, null]; enemyBoard = [null, null, null];
    isProcessing = false; selectedCardIndex = null; isBattleEnded = false; updateCardDetail(null);
    document.getElementById('player-icon').src = playerConfig.icon;
    document.getElementById('enemy-icon').src = enemyConfig.icon;
    document.getElementById('player-name').innerText = playerConfig.name;
    document.getElementById('enemy-name').innerText = enemyConfig.name;

    // 敵アイコンのフィルタ処理（シャドウ対応）
    const enemyIconImg = document.getElementById('enemy-icon');
    enemyIconImg.src = enemyConfig.icon;
    if (enemyConfig.isShadow) {
        enemyIconImg.style.filter = 'grayscale(1) brightness(0.6) contrast(1.2)';
    } else {
        enemyIconImg.style.filter = 'none';
    }

    const bs = document.getElementById('screen-battle');
    bs.style.backgroundColor = '#0f172a';
    const stageId = (gameMode === 'story') ? (enemyConfig.stageId || 'android') : (selectedStageId || 'android');
    bs.style.backgroundImage = `url('assets/background_${stageId}.png')`;
    updateHPBar(); updateSPOrbs('blue'); updateSPOrbs('red'); renderBoard();
    for (let i = 0; i < 5; i++) { drawCard('blue'); drawCard('red'); }
    switchScreen('screen-battle'); startTurn('blue');
}

function updateHPBar() {
    document.getElementById('player-hp-fill').style.width = `${Math.max(0, (playerHP / playerMaxHP) * 100)}%`;
    document.getElementById('player-hp-text').innerText = `${Math.max(0, playerHP)} / ${playerMaxHP}`;
    document.getElementById('enemy-hp-fill').style.width = `${Math.max(0, (enemyHP / enemyMaxHP) * 100)}%`;
    document.getElementById('enemy-hp-text').innerText = `${Math.max(0, enemyHP)} / ${enemyMaxHP}`;
}

function updateSPOrbs(owner) {
    const sp = owner === 'blue' ? playerSP : enemySP;
    const config = owner === 'blue' ? playerConfig : enemyConfig;
    const cost = config.leaderSkill.cost;
    const container = document.getElementById(owner === 'blue' ? 'player-sp-orbs' : 'enemy-sp-orbs');
    if (!container || !cost) { if (container) container.style.display = 'none'; return; }
    container.style.display = 'flex'; container.innerHTML = '';
    for (let i = 0; i < cost; i++) {
        const orb = document.createElement('div');
        orb.className = 'orb' + (i < sp ? ' filled' : '');
        container.appendChild(orb);
    }
    if (owner === 'blue') {
        const btn = document.getElementById('btn-leader-skill');
        if (btn) sp >= cost ? btn.classList.add('ready') : btn.classList.remove('ready');
    }
}

function checkWinCondition() {
    if ((playerHP <= 0 || enemyHP <= 0) && !isBattleEnded) {
        isBattleEnded = true;
        triggerFinishVisuals();
        setTimeout(endBattle, 2000);
        return true;
    }
    return false;
}

function triggerFinishVisuals() {
    // 画面全体のスローモーションと揺れ
    document.body.classList.add('slow-motion');
    document.body.classList.add('anim-mega-shake');
    playSound(SOUNDS.seDamage); // 重厚な音（既存のSEを流用）

    setTimeout(() => {
        document.body.classList.remove('anim-mega-shake');
    }, 1000);
}

function showSpeechBubble(target) {
    const config = target === 'blue' ? playerConfig : enemyConfig;
    let phrases = config.dialogue.damage;

    // シャドウ（ドッペルゲンガー）は無言
    if (target === 'red' && enemyConfig.isShadow) {
        phrases = ['・・・・'];
    }

    const bubble = document.getElementById(target === 'blue' ? 'player-speech' : 'enemy-speech');
    if (bubble) {
        bubble.innerText = phrases[Math.floor(Math.random() * phrases.length)];
        bubble.classList.add('active'); setTimeout(() => bubble.classList.remove('active'), 1500);
    }
}

function showSkillConfirm() {
    if (isProcessing || isBattleEnded || document.getElementById('turn-status').innerText !== "YOUR TURN") return;
    playSound(SOUNDS.seClick);
    const s = playerConfig.leaderSkill; if (!s.cost) return;
    document.getElementById('skill-confirm-name').innerText = s.name;
    document.getElementById('skill-confirm-desc').innerText = s.desc;
    const st = document.getElementById('skill-confirm-status');
    const ex = document.getElementById('btn-execute-skill');
    if (playerSP >= s.cost) { st.innerText = "発動可能です！"; st.style.color = "#4ade80"; ex.style.display = "block"; }
    else { st.innerText = `発動まであと ${s.cost - playerSP} SP`; st.style.color = "#f87171"; ex.style.display = "none"; }
    document.getElementById('screen-skill-confirm').style.display = 'flex';
}

function showEnemySkillConfirm() {
    playSound(SOUNDS.seClick);
    const s = enemyConfig.leaderSkill;
    document.getElementById('skill-confirm-name').innerText = s.name;
    document.getElementById('skill-confirm-desc').innerText = s.desc;
    const st = document.getElementById('skill-confirm-status');
    const ex = document.getElementById('btn-execute-skill');
    if (!s.cost) { st.innerText = "パッシブスキル（常に発動）"; st.style.color = "#4ade80"; }
    else {
        const r = Math.max(0, s.cost - enemySP);
        if (r === 0) { st.innerText = "発動可能状態です！注意！"; st.style.color = "#ef4444"; }
        else { st.innerText = `発動まであと ${r} SP`; st.style.color = "#f87171"; }
    }
    ex.style.display = "none"; document.getElementById('screen-skill-confirm').style.display = 'flex';
}

function closeSkillConfirm() { playSound(SOUNDS.seClick); document.getElementById('screen-skill-confirm').style.display = 'none'; }
function executeSkillFromConfirm() { closeSkillConfirm(); activateLeaderSkill('blue'); }

/**
 * プレイヤーまたはAIに配置レーンを選択させるユーティリティ
 */
async function waitPlayerLaneSelection(count, owner, tokenCard) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    const emptyLanes = board.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
    const allLanes = [0, 1, 2];

    // AIの場合：空きレーンを優先、無ければ最弱カードのレーンを選択
    if (owner === 'red') {
        if (emptyLanes.length === 0) return [];
        if (count >= emptyLanes.length) return emptyLanes;
        return evaluateBestLanesForToken(emptyLanes, owner, tokenCard, count);
    }

    // プレイヤーの場合
    if (emptyLanes.length === 0 && count === 0) return [];

    // 空きレーンが必要数以下でトークン全配置可能な場合は自動選択
    if (emptyLanes.length > 0 && count >= emptyLanes.length) return emptyLanes;

    return new Promise((resolve) => {
        const selected = [];
        const cells = document.querySelectorAll(`#player-lanes .cell`);
        const originalListeners = Array.from(cells).map(c => c.onclick);

        const cleanUp = () => {
            cells.forEach((cell, i) => {
                cell.classList.remove('highlight');
                cell.classList.remove('selected-highlight');
                cell.onclick = originalListeners[i];
            });
        };

        cells.forEach((cell, i) => {
            // 全レーンをハイライト
            cell.classList.add('highlight');
            cell.onclick = async (ev) => {
                ev.stopPropagation();
                playSound(SOUNDS.seClick);

                // 既にカードがあるレーンの場合は確認
                if (board[i] !== null) {
                    const existingCard = board[i];
                    const tokenName = tokenCard ? tokenCard.name : 'トークン';
                    const confirmed = await new Promise(res => {
                        showConfirmModal(
                            `「${existingCard.name}」を破棄して「${tokenName}」を配置しますか？`,
                            () => res(true),
                            () => res(false)
                        );
                    });
                    if (!confirmed) return;
                    // 既存カードを破棄
                    board[i] = null;
                    renderBoard();
                }

                if (!selected.includes(i)) {
                    selected.push(i);
                    cell.classList.remove('highlight');
                    cell.classList.add('selected-highlight');
                    if (selected.length >= count) {
                        setTimeout(() => {
                            cleanUp();
                            resolve(selected);
                        }, 300);
                    }
                }
            };
        });
    });
}

/**
 * 相手の場のカードを選択させるユーティリティ（破壊スキル用など）
 */
async function waitPlayerEnemyLaneSelection(count, owner) {
    const isBlue = owner === 'blue';
    const targetBoard = isBlue ? enemyBoard : playerBoard;
    const targetSide = isBlue ? 'enemy' : 'player';

    // ターゲット可能なレーン（配置されている場所）を取得
    const occupiedLanes = targetBoard.map((c, i) => c !== null ? i : -1).filter(i => i !== -1);

    if (occupiedLanes.length === 0) return [];

    // AIの場合：最もパワーが高いカードを選択
    if (owner === 'red') {
        const sortedLanes = [...occupiedLanes].sort((a, b) => targetBoard[b].currentPower - targetBoard[a].currentPower);
        return sortedLanes.slice(0, count);
    }

    // ターゲット数以下の場合は全選択
    if (occupiedLanes.length <= count) return occupiedLanes;

    return new Promise((resolve) => {
        const selected = [];
        const cells = document.querySelectorAll(`#${targetSide}-lanes .cell`);
        const originalListeners = Array.from(cells).map(c => c.onclick);

        const cleanUp = () => {
            cells.forEach((cell, i) => {
                cell.classList.remove('highlight-target');
                cell.classList.remove('selected-highlight');
                cell.onclick = originalListeners[i];
                // カードのクリック判定を元に戻す
                const card = cell.querySelector('.card');
                if (card) card.style.pointerEvents = '';
            });
        };

        cells.forEach((cell, i) => {
            if (targetBoard[i] !== null) {
                cell.classList.add('highlight-target');
                // カードがクリックを遮らないようにする
                const card = cell.querySelector('.card');
                if (card) card.style.pointerEvents = 'none';

                cell.onclick = (ev) => {
                    ev.stopPropagation();
                    playSound(SOUNDS.seClick);
                    if (!selected.includes(i)) {
                        selected.push(i);
                        cell.classList.remove('highlight-target');
                        cell.classList.add('selected-highlight');
                        if (selected.length >= count) {
                            setTimeout(() => {
                                cleanUp();
                                resolve(selected);
                            }, 300);
                        }
                    }
                };
            }
        });
    });
}

function evaluateBestLanesForToken(emptyLanes, owner, tokenCard, count) {
    if (aiLevel <= 1) {
        // EASY: ランダム
        return [...emptyLanes].sort(() => Math.random() - 0.5).slice(0, count);
    }

    // NORMAL/HARD: 簡易的な評価
    const scores = emptyLanes.map(l => {
        let score = 0;
        const pCard = playerBoard[l];

        if (pCard) {
            // 敵（プレイヤー）がいる場合：ブロック評価
            // トークンの攻撃力で倒せるなら高評価
            if (tokenCard.power >= pCard.currentPower) {
                score += 1000 + pCard.currentPower * 10;
            } else {
                // 倒せなくても、敵の攻撃力が高いなら壁として評価
                score += 500 + pCard.currentPower * 5;
            }
        } else {
            // 敵がいない場合：一匹狼シナジーなどを考慮
            score += 200 + tokenCard.power;
            // 他のレーンが一匹狼なら、敢えてここには置かないほうがいい場合もあるが
            // 基本は高いパワーを空きレーンに出すのも有効
        }
        return { lane: l, score };
    });

    return scores.sort((a, b) => b.score - a.score).slice(0, count).map(s => s.lane);
}


function discardCard(owner, card, lane) {
    if (card.skill === 'split' && lane !== undefined) {
        triggerSplitSkill(owner, lane, card);
        return true; // 分裂した場合は墓地に行かず場に残る（上書きされる）
    }
    if (card.isToken) return false;
    if ('basePower' in card) { card.power = card.basePower; }
    card.currentPower = card.power;
    (owner === 'blue' ? playerDiscard : enemyDiscard).push(card);
    return false;
}

function triggerSplitSkill(owner, lane, card) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    const tL = CARD_MASTER.find(m => m.id === 'legs');
    const val = card.skillValue || 1;

    board[lane] = {
        id: `sp_${Date.now()}_${lane}`,
        owner,
        ...tL,
        imgUrl: 'assets/card_legs.jpg',
        power: val,
        currentPower: val,
        rarity: tL.rarity || 1
    };

    setTimeout(() => {
        playSound(SOUNDS.sePlace);
        renderBoard();
        const cEl = document.querySelector(`#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${lane}"] .card`);
        if (cEl) createDamagePopup(cEl, 'SPLIT', '#facc15');
    }, 100);
}
function drawCard(owner) {
    let d = owner === 'blue' ? playerDeck : enemyDeck, h = owner === 'blue' ? playerHand : enemyHand, ds = owner === 'blue' ? playerDiscard : enemyDiscard;
    if (d.length === 0 && ds.length > 0) {
        d.push(...ds.sort(() => Math.random() - 0.5));
        ds.length = 0;
        playSound(SOUNDS.seSkill);
        createDamagePopup(document.getElementById(owner === 'blue' ? 'player-hp-fill' : 'enemy-hp-fill'), 'RELOAD', '#38bdf8');
        showDeckRefreshEffect(owner);
    }
    if (d.length > 0 && h.length < 5) h.push(d.pop());
    if (owner === 'blue') { document.getElementById('deck-info').innerText = `Deck: ${playerDeck.length} / Drop: ${playerDiscard.length}`; renderHand(); }
}

async function startTurn(owner) {
    if (isBattleEnded) return; isProcessing = true;
    const s = document.getElementById('turn-status'); s.innerText = owner === 'blue' ? "YOUR TURN" : "ENEMY TURN"; s.style.color = owner === 'blue' ? "var(--color-blue)" : "var(--color-red)";
    const c = owner === 'blue' ? playerConfig : enemyConfig;
    if (c.leaderSkill.cost) { if (owner === 'blue') playerSP = Math.min(c.leaderSkill.cost, playerSP + 1); else enemySP = Math.min(c.leaderSkill.cost, enemySP + 1); }
    updateSPOrbs(owner);

    // ターン開始時スキルの発動
    await triggerStartTurnSkills(owner);

    if ((owner === 'blue' ? playerBoard : enemyBoard).some(x => x !== null)) { await executeCombatPhase(owner); if (checkWinCondition()) return; }

    drawCard(owner);
    if (owner === 'blue') {
        selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard();
        isProcessing = false;
    } else { await sleep(500); await executeEnemyAI(); }
}

async function endPlayerTurn() {
    if (isProcessing) return; isProcessing = true;
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
    selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard(); endTurnLogic('blue');
}

function endTurnLogic(o) {
    // 全ボードの拘束（スタン）状態の更新（ターン終了時に減算）
    [playerBoard, enemyBoard].forEach(board => {
        board.forEach(c => {
            if (c && c.stunTurns > 0) {
                if (c.stunAppliedThisTurn) {
                    // 出した直後のターンは減らしすぎないようにスキップ
                    c.stunAppliedThisTurn = false;
                } else {
                    c.stunTurns--;
                }
            }
        });
    });

    if (!isBattleEnded) {
        renderBoard();
        startTurn(o === 'blue' ? 'red' : 'blue');
    }
}



async function playCard(o, hI, l) {
    const h = o === 'blue' ? playerHand : enemyHand, b = o === 'blue' ? playerBoard : enemyBoard;
    b[l] = h.splice(hI, 1)[0]; playSound(SOUNDS.sePlace); renderHand(); renderBoard();
    const c = b[l];
    // 出現時スキルの発動（単一または複数）
    if (hasActiveSkill(c)) {
        await resolveOnPlaySkill(o, l, c);
    }
}

// 判定補助: カードが何らかのアクティブスキルを持っているか
function hasActiveSkill(c) {
    if (!c) return false;
    const activeSkills = ['draw', 'heal', 'snipe', 'spread', 'copy', 'support', 'clone', 'lone_wolf', 'berserk', 'sacrifice', 'bind', 'quick', 'hero', 'charge'];
    if (activeSkills.includes(c.skill)) return true;
    if (Array.isArray(c.skills)) {
        return c.skills.some(s => activeSkills.includes(s.id));
    }
    return false;
}

// 判定補助: 特定のスキルを所持しているか
function hasSkill(c, skillId) {
    if (!c) return false;
    if (c.skill === skillId) return true;
    if (Array.isArray(c.skills)) {
        return c.skills.some(s => s.id === skillId);
    }
    return false;
}

// 判定補助: スキルの数値を取得
function getSkillValue(c, skillId) {
    if (!c) return 0;
    if (c.skill === skillId) return c.skillValue || 0;
    if (Array.isArray(c.skills)) {
        const s = c.skills.find(s => s.id === skillId);
        return s ? s.value || 0 : 0;
    }
    return 0;
}

async function triggerStartTurnSkills(owner) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    const side = owner === 'blue' ? 'player' : 'enemy';
    let triggered = false;

    for (let i = 0; i < 3; i++) {
        const c = board[i];
        if (c && hasSkill(c, 'growth')) {
            const val = getSkillValue(c, 'growth') || 1;
            c.power += val;
            c.currentPower += val;
            const prefix = val > 0 ? '+' : '';
            const color = val > 0 ? '#4ade80' : '#ef4444';
            triggered = true;

            const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${i}"] .card`);
            if (cEl) {
                createDamagePopup(cEl, `成長 ${prefix}${val}`, color);
            }
            if (c.currentPower <= 0) {
                if (!discardCard(owner, c, i)) board[i] = null;
                playSound(SOUNDS.seDestroy);
            } else {
                playSound(SOUNDS.seSkill);
            }
        }
    }
    if (triggered) {
        renderBoard();
        await sleep(600);
    }
}

async function resolveOnPlaySkill(o, l, c) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    if (!cEl) return;
    const h = o === 'blue' ? playerHand : enemyHand, b = o === 'blue' ? playerBoard : enemyBoard, eB = o === 'blue' ? enemyBoard : playerBoard, dO = o === 'blue' ? 'red' : 'blue', dS = o === 'blue' ? 'enemy' : 'player';

    // 発動対象スキルのリストを作成
    let skillsToResolve = [];
    if (c.skill && c.skill !== 'none') skillsToResolve.push({ id: c.skill, value: c.skillValue });
    if (Array.isArray(c.skills)) skillsToResolve = skillsToResolve.concat(c.skills);

    for (const sk of skillsToResolve) {
        const skillId = sk.id;
        const skillValue = sk.value;

        if (skillId === 'draw') {
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'REPLACE', '#facc15');
            if (h.length > 0) { let mp = Math.min(...h.map(x => x.power)), dc = 0; for (let i = h.length - 1; i >= 0; i--) if (h[i].power === mp) { discardCard(o, h.splice(i, 1)[0]); dc++; } for (let i = 0; i < dc; i++) drawCard(o); }
            else drawCard(o);
            await sleep(500);
        } else if (skillId === 'charge') {
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, `CHARGE -${skillValue}`, '#facc15');
            if (o === 'blue') { playerSP = Math.max(0, playerSP - skillValue); updateSPOrbs('blue'); }
            else { enemySP = Math.max(0, enemySP - skillValue); updateSPOrbs('red'); }
            await sleep(500);
        } else if (skillId === 'heal') {
            const val = skillValue || 3;
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, `+${val} HP`, '#4ade80');
            if (o === 'blue') playerHP = Math.min(MAX_HP, playerHP + val); else enemyHP = Math.min(MAX_HP, enemyHP + val); updateHPBar(); await sleep(500);
        } else if (skillId === 'snipe') {
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SNIPE', '#facc15');
            const ts = eB.map((x, i) => x ? i : -1).filter(i => i !== -1);
            if (ts.length > 0) {
                let mL = ts[0]; for (let i of ts) if (eB[i].currentPower > eB[mL].currentPower) mL = i;
                const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${mL}"] .card`);
                const val = skillValue || 4;
                if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, `-${val}`, '#ef4444'); }
                playSound(SOUNDS.seDamage); eB[mL].currentPower -= val; renderBoard(); await sleep(500);
                if (eB[mL].currentPower <= 0) { if (!discardCard(dO, eB[mL], mL)) eB[mL] = null; playSound(SOUNDS.seDestroy); renderBoard(); }
            }
        } else if (skillId === 'spread') {
            const val = skillValue || 2;
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SPREAD', '#facc15'); let hit = false;
            for (let i = 0; i < 3; i++) if (eB[i]) { const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${i}"] .card`); if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, `-${val}`, '#ef4444'); } eB[i].currentPower -= val; hit = true; }
            if (hit) { renderBoard(); playSound(SOUNDS.seDamage); await sleep(500); for (let i = 0; i < 3; i++) if (eB[i] && eB[i].currentPower <= 0) { if (!discardCard(dO, eB[i], i)) eB[i] = null; playSound(SOUNDS.seDestroy); } renderBoard(); }
        } else if (skillId === 'copy') {
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'COPY', '#facc15');
            const adj = l === 1 ? [0, 2] : [1];
            let total = 0;
            for (let i of adj) { if (b[i]) total += b[i].currentPower; }
            if (total > 0) { c.power += total; c.currentPower += total; createDamagePopup(cEl, `+${total}`, '#4ade80'); renderBoard(); await sleep(500); }
        } else if (skillId === 'support') {
            const val = skillValue || 2;
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SUPPORT', '#facc15');
            const adj = l === 1 ? [0, 2] : [1];
            let hit = false;
            for (let i of adj) { if (b[i]) { b[i].currentPower += val; const tEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`); if (tEl) createDamagePopup(tEl, `+${val}`, '#4ade80'); hit = true; } }
            if (hit) { renderBoard(); await sleep(500); }
        } else if (skillId === 'clone') {
            const count = skillValue || 1;
            const tC = CARD_MASTER.find(m => m.id === 'token_clone');
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'CLONE', '#facc15');
            const selectedLanes = await waitPlayerLaneSelection(count, o, tC);
            for (let i = 0; i < selectedLanes.length; i++) {
                const tL = selectedLanes[i];
                b[tL] = { id: `cl_${Date.now()}_${i}`, owner: o, ...tC, imgUrl: c.imgUrl, filter: c.filter, power: c.power, currentPower: c.currentPower, rarity: c.rarity || 1 };
                renderBoard(); await sleep(300);
            }
        } else if (skillId === 'lone_wolf') {
            playSound(SOUNDS.seSkill); const e = b.filter(x => x === null).length;
            const val = skillValue || 3;
            if (e * val > 0) { c.power += e * val; c.currentPower += e * val; createDamagePopup(cEl, `+${e * val}`, '#4ade80'); renderBoard(); }
            else createDamagePopup(cEl, `+0`, '#94a3b8'); await sleep(500);
        } else if (skillId === 'hero') {
            playSound(SOUNDS.seSkill); const occ = b.filter(x => x !== null).length; // 自身のレーンも含まれるため最低1
            const val = skillValue || 3;
            if (occ * val > 0) { c.power += occ * val; c.currentPower += occ * val; createDamagePopup(cEl, `+${occ * val}`, '#4ade80'); renderBoard(); }
            await sleep(500);

        } else if (skillId === 'berserk') {
            const val = skillValue || 2;
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'BERSERK', '#ef4444');
            const adj = l === 1 ? [0, 2] : [1];
            let hit = false;
            for (let i of adj) {
                if (b[i]) {
                    const tEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`);
                    if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, `-${val}`, '#ef4444'); }
                    b[i].currentPower -= val; hit = true;
                }
            }
            if (hit) {
                renderBoard(); playSound(SOUNDS.seDamage); await sleep(500);
                for (let i of adj) { if (b[i] && b[i].currentPower <= 0) { if (!discardCard(o, b[i], i)) b[i] = null; playSound(SOUNDS.seDestroy); } }
                renderBoard();
            }
        } else if (skillId === 'sacrifice') {
            const val = skillValue || 3;
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SACRIFICE', '#ef4444');
            const lEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-hp-container`);
            if (lEl) { lEl.classList.add('anim-shake'); createDamagePopup(lEl, `-${val} HP`, '#ef4444'); }
            if (o === 'blue') playerHP -= val; else enemyHP -= val;
            updateHPBar(); playSound(SOUNDS.seDamage); await sleep(500); checkWinCondition();
        } else if (skillId === 'bind') {
            const val = skillValue || 1;
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'BIND', '#facc15');
            if (eB[l]) { eB[l].stunTurns = 2; eB[l].stunAppliedThisTurn = true; const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${l}"] .card`); if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, '拘束', '#94a3b8'); } }
            await sleep(500);
        } else if (skillId === 'quick') {
            playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'QUICK', '#facc15'); await sleep(400); await executeSingleCombat(o, l);
        }
    }
}

async function executeSingleCombat(atk, l) {
    const aB = atk === 'blue' ? playerBoard : enemyBoard, dB = atk === 'blue' ? enemyBoard : playerBoard, aR = atk === 'blue' ? '#player-lanes' : '#enemy-lanes', dR = atk === 'blue' ? '#enemy-lanes' : '#player-lanes', an = atk === 'blue' ? 'anim-attack-up' : 'anim-attack-down';
    const aC = aB[l]; if (!aC || hasSkill(aC, 'defender') || aC.stunTurns > 0) return;
    const aE = document.querySelector(`${aR} .cell[data-lane="${l}"] .card`); if (!aE) return;
    aE.classList.add(an); playSound(SOUNDS.seAttack); await sleep(300);
    if (dB[l]) {
        let dDef = aC.currentPower, dAtk = dB[l].currentPower;
        if (hasSkill(dB[l], 'sturdy')) dDef = Math.floor(dDef / 2); if (hasSkill(aC, 'sturdy')) dAtk = Math.floor(dAtk / 2);

        // 拘束（スタン）状態の相手には反撃を受けない
        if (dB[l].stunTurns > 0) dAtk = 0;

        dB[l].currentPower -= dDef; if (!hasSkill(dB[l], 'defender')) aC.currentPower -= dAtk;
        const dE = document.querySelector(`${dR} .cell[data-lane="${l}"] .card`); if (dE) dE.classList.add('anim-shake');
        playSound(SOUNDS.seDamage); createDamagePopup(dE, `-${dDef}`); if (!hasSkill(dB[l], 'defender')) createDamagePopup(aE, `-${dAtk}`);
        renderBoard(); await sleep(400);
        if (hasSkill(aC, 'deadly')) dB[l].currentPower = 0; if (hasSkill(dB[l], 'deadly')) aC.currentPower = 0;
        let aD = aC.currentPower <= 0, dD = dB[l].currentPower <= 0, tr = false;
        if (dD && !aD && hasSkill(aC, 'soul_bind')) { const val = getSkillValue(aC, 'soul_bind') || 2; aC.currentPower += val; aC.power += val; createDamagePopup(aE, `+${val}`, '#4ade80'); tr = true; }
        if (aD && !dD && hasSkill(dB[l], 'soul_bind')) { const val = getSkillValue(dB[l], 'soul_bind') || 2; dB[l].currentPower += val; dB[l].power += val; createDamagePopup(dE, `+${val}`, '#4ade80'); tr = true; }
        if (tr) { playSound(SOUNDS.seSkill); renderBoard(); await sleep(300); }
        if (aD) { if (!discardCard(atk, aC, l)) aB[l] = null; } if (dD) { if (!discardCard(atk === 'blue' ? 'red' : 'blue', dB[l], l)) dB[l] = null; }
        if (aD || dD) playSound(SOUNDS.seDestroy);
    } else {
        const d = aC.currentPower; playSound(SOUNDS.seDamage); document.body.classList.add('anim-shake');
        if (atk === 'blue') { enemyHP -= d; createDamagePopup(document.getElementById('enemy-hp-fill'), `-${d}`); showSpeechBubble('red'); }
        else { playerHP -= d; createDamagePopup(document.getElementById('player-hp-fill'), `-${d}`); showSpeechBubble('blue'); }
        updateHPBar(); if (checkWinCondition()) return; await sleep(400); document.body.classList.remove('anim-shake');
    }
    if (aE) aE.classList.remove(an); renderBoard();
}

async function executeCombatPhase(atk) {
    const b = atk === 'blue' ? playerBoard : enemyBoard;
    for (let i = 0; i < 3; i++) if (b[i]) {
        await executeSingleCombat(atk, i);
        if (isBattleEnded) break;
        await sleep(200);
    }
}

function endBattle() {
    document.body.classList.remove('slow-motion');
    stopSound(SOUNDS.bgmBattle); stopSound(SOUNDS.bgmLastBattle);
    lastBattleResult = playerHP > 0 ? (enemyHP <= 0 ? 'win' : 'draw') : (enemyHP > 0 ? 'lose' : 'draw');
    const t = document.getElementById('turn-status'); t.innerText = lastBattleResult === 'win' ? "YOU WIN!" : (lastBattleResult === 'lose' ? "YOU LOSE..." : "DRAW");
    t.style.color = lastBattleResult === 'win' ? "#facc15" : "#fff";
    isProcessing = false; // バトル結果表示と同時にフラグをリセット
    setTimeout(() => {
        playSound(SOUNDS.bgmTitle); appState = 'post_dialogue';
        if (lastBattleResult === 'win') {
            dialogueQueue = [{ speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'lose') }, { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'win') }];
            showCardReward(enemyConfig.id);
        } else {
            dialogueQueue = [{ speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'lose') }, { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'win') }];
            setupDialogueScreen();
        }
    }, 1500);
}

function returnToTitle() {
    showConfirmModal('バトルを諦めてタイトルに戻りますか？', () => {
        stopSound(SOUNDS.bgmBattle);
        stopSound(SOUNDS.bgmLastBattle);
        playSound(SOUNDS.bgmTitle);
        appState = 'title';
        isProcessing = false;
        switchScreen('screen-mode-select');
    });
}

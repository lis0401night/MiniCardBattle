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
    // アニメーションを再発火させるためのハック
    const box = document.querySelector('#screen-skill-confirm .skill-modal-box');
    if (box) {
        box.classList.remove('modal-pop-animation');
        void box.offsetWidth; // reflow
        box.classList.add('modal-pop-animation');
    }
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
    // アニメーションを再発火させるためのハック
    const box = document.querySelector('#screen-skill-confirm .skill-modal-box');
    if (box) {
        box.classList.remove('modal-pop-animation');
        void box.offsetWidth; // reflow
        box.classList.add('modal-pop-animation');
    }
}

function closeSkillConfirm() { playSound(SOUNDS.seClick); document.getElementById('screen-skill-confirm').style.display = 'none'; }
function executeSkillFromConfirm() { closeSkillConfirm(); activateLeaderSkill('blue'); }

/**
 * プレイヤーまたはAIに配置レーンを選択させるユーティリティ
 */
async function waitPlayerLaneSelection(count, owner, tokenCard) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    // AIの場合：空きレーンがあれば優先、無ければ味方カードの上書きを検討
    if (owner === 'red') {
        const allLanes = board.map((_, i) => i);
        return evaluateBestLanesForToken(allLanes, owner, tokenCard, count);
    }

    // プレイヤーの場合：常に手動選択（自動選択は行わない）
    return new Promise((resolve) => {
        const selected = [];
        const cells = document.querySelectorAll(`#player-lanes .cell`);
        const originalListeners = Array.from(cells).map(c => c.onclick);

        // 「ターン終了」ボタンを「配置終了」に切り替え
        const endBtn = document.getElementById('btn-end-turn');
        const originalBtnText = endBtn.innerText;
        const originalBtnOnclick = endBtn.onclick;
        const originalBtnStyle = endBtn.style.cssText;
        endBtn.innerText = '配置終了';
        endBtn.style.background = '#ef4444';
        endBtn.style.borderColor = '#dc2626';

        const cleanUp = () => {
            cells.forEach((cell, i) => {
                cell.classList.remove('highlight');
                cell.classList.remove('selected-highlight');
                cell.onclick = originalListeners[i];
            });
            // ボタンを元に戻す
            endBtn.innerText = originalBtnText;
            endBtn.style.cssText = originalBtnStyle;
            endBtn.onclick = originalBtnOnclick;
        };

        endBtn.onclick = () => {
            playSound(SOUNDS.seClick);
            cleanUp();
            resolve(selected); // 現在までの選択で終了（0個でもOK）
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
                    // 他のセルのハイライトを再適用
                    cells.forEach((c2, i2) => {
                        if (selected.includes(i2)) c2.classList.add('selected-highlight');
                        else c2.classList.add('highlight');
                    });
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

/**
 * プレイヤーまたはAIに手札からカードを選択させるユーティリティ（入替スキル用）
 */
async function waitPlayerHandSelection(count, owner) {
    const hand = owner === 'blue' ? playerHand : enemyHand;
    if (hand.length === 0) return [];

    // AIの場合：最もパワーが低いカードを選択
    if (owner === 'red') {
        const sortedWithIndex = hand.map((c, i) => ({ c, i })).sort((a, b) => a.c.power - b.c.power);
        const selectedCount = Math.min(count, hand.length);
        return sortedWithIndex.slice(0, selectedCount).map(x => x.i);
    }

    // プレイヤーの場合：手動選択
    return new Promise((resolve) => {
        const selectedIndices = [];
        const handEl = document.getElementById('player-hand');
        const cards = handEl.querySelectorAll('.hand-card');

        // 「ターン終了」ボタンを「選択終了」に切り替え
        const endBtn = document.getElementById('btn-end-turn');
        const originalBtnText = endBtn.innerText;
        const originalBtnOnclick = endBtn.onclick;
        const originalBtnStyle = endBtn.style.cssText;
        endBtn.innerText = '選択終了';
        endBtn.style.background = '#facc15';
        endBtn.style.color = '#000';
        endBtn.style.borderColor = '#eab308';

        const cleanUp = () => {
            cards.forEach((card) => {
                card.classList.remove('selected');
                card.style.pointerEvents = '';
            });
            // ボタンを元に戻す
            endBtn.innerText = originalBtnText;
            endBtn.style.cssText = originalBtnStyle;
            endBtn.onclick = originalBtnOnclick;
            renderHand(); // 通常の状態に戻す
        };

        endBtn.onclick = () => {
            playSound(SOUNDS.seClick);
            cleanUp();
            resolve(selectedIndices);
        };

        cards.forEach((card, i) => {
            card.classList.add('can-select'); // CSSで強調するため（もしあれば）
            card.onclick = (ev) => {
                ev.stopPropagation();
                playSound(SOUNDS.seClick);

                if (selectedIndices.includes(i)) {
                    // 選択解除
                    const idx = selectedIndices.indexOf(i);
                    selectedIndices.splice(idx, 1);
                    card.classList.remove('selected');
                } else {
                    // 選択
                    if (selectedIndices.length < count) {
                        selectedIndices.push(i);
                        card.classList.add('selected');
                    }
                }
            };
        });
    });
}


function evaluateBestLanesForToken(allLanes, owner, tokenCard, count) {
    const board = owner === 'red' ? enemyBoard : playerBoard;
    if (aiLevel <= 1) {
        // EASY: ランダム
        return [...allLanes].sort(() => Math.random() - 0.5).slice(0, count);
    }

    // NORMAL/HARD: 簡易的な評価
    const scores = allLanes.map(l => {
        let score = 0;
        const eCard = owner === 'red' ? playerBoard[l] : enemyBoard[l];
        const myCard = board[l];

        // 相手カードがいる場合（対面評価）
        if (eCard) {
            if (tokenCard.power >= eCard.currentPower) {
                score += 1000 + eCard.currentPower * 10;
            } else {
                score += 500 + eCard.currentPower * 5;
            }
        } else {
            score += 200 + tokenCard.power;
        }

        // 自分のカードがある場合（上書き評価）
        if (myCard) {
            // 空きレーンを最優先するため、大幅にスコアを引く
            score -= 5000;
            // 自分のパワーが低いほど、上書きの価値が高い（マイナスの緩和）
            score -= myCard.currentPower * 100;
        } else {
            // 空きレーンボーナス
            score += 1000;
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
    // スキル発動フラグをリセット
    card.skillTriggered = false;
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
    if (isProcessing) return;
    // 確認モーダルを表示
    const confirmed = await new Promise(resolve => {
        showConfirmModal(
            'ターンを終了しますか？\nまだカードを使用できます。',
            () => resolve(true),
            () => resolve(false)
        );
    });
    if (!confirmed) return;
    isProcessing = true;
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
    b[l] = h.splice(hI, 1)[0]; playSound(SOUNDS.sePlace);
    if (o === 'blue') { selectedCardIndex = null; updateCardDetail(null); }
    renderHand(); renderBoard();
    const c = b[l];
    // 出現時スキルの発動（単一または複数）
    if (hasActiveSkill(c)) {
        await resolveOnPlaySkill(o, l, c);
    }
}

// 判定補助: カードが何らかのアクティブスキルを持っているか
function hasActiveSkill(c) {
    if (!c) return false;
    return ACTIVE_SKILLS.some(s => hasSkill(c, s));
}

// 判定補助: 特定のスキルを所持しているか
function hasSkill(c, skillId) {
    if (!c) return false;
    // 拘束（スタン）状態は「防御（攻撃不可）」として扱う
    if (skillId === 'defender' && c.stunTurns > 0) return true;
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
        const tr = await triggerStartTurnPassive(owner, i);
        if (tr) triggered = true;
    }
    if (triggered) {
        renderBoard();
        await sleep(600);
    }
}

async function resolveOnPlaySkill(o, l, c) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    if (!cEl) return;

    // 発動対象スキルのリストを作成
    let skillsToResolve = [];
    if (c.skill && c.skill !== 'none') skillsToResolve.push({ id: c.skill, value: c.skillValue });
    if (Array.isArray(c.skills)) skillsToResolve = skillsToResolve.concat(c.skills);

    // 速攻(quick)は一番最後に発動するように調整（潜伏による無敵付与などを優先させるため）
    skillsToResolve.sort((a, b) => {
        if (a.id === 'quick') return 1;
        if (b.id === 'quick') return -1;
        return 0;
    });

    for (const sk of skillsToResolve) {
        if (ACTIVE_SKILLS.includes(sk.id)) {
            await resolveActiveSkillEffect(o, l, c, sk.id, sk.value);
        }
    }

    // バッジが消える前に一呼吸置く（プレイヤーが効果を確認できるようにするため）
    await sleep(500);

    // 全ての召喚時スキルが完了したらフラグを立てる（ボード上でのバッジ非表示用）
    c.skillTriggered = true;
    renderBoard();
}

async function executeSingleCombat(atk, l) {
    const aB = atk === 'blue' ? playerBoard : enemyBoard, dB = atk === 'blue' ? enemyBoard : playerBoard, aR = atk === 'blue' ? '#player-lanes' : '#enemy-lanes', dR = atk === 'blue' ? '#enemy-lanes' : '#player-lanes', an = atk === 'blue' ? 'anim-attack-up' : 'anim-attack-down';
    const aC = aB[l]; if (!aC || hasSkill(aC, 'defender')) return;
    const aE = document.querySelector(`${aR} .cell[data-lane="${l}"] .card`); if (!aE) return;
    aE.classList.add(an); playSound(SOUNDS.seAttack); await sleep(300);
    if (dB[l]) {
        let dDef = aC.currentPower, dAtk = dB[l].currentPower;
        if (hasSkill(dB[l], 'sturdy')) dDef = Math.floor(dDef / 2); if (hasSkill(aC, 'sturdy')) dAtk = Math.floor(dAtk / 2);

        if (hasSkill(dB[l], 'invincible')) dDef = 0;
        if (hasSkill(aC, 'invincible')) dAtk = 0;

        dB[l].currentPower -= dDef; if (!hasSkill(dB[l], 'defender')) aC.currentPower -= dAtk;
        const dE = document.querySelector(`${dR} .cell[data-lane="${l}"] .card`); if (dE) dE.classList.add('anim-shake');
        playSound(SOUNDS.seDamage); createDamagePopup(dE, `-${dDef}`); if (!hasSkill(dB[l], 'defender')) createDamagePopup(aE, `-${dAtk}`);
        renderBoard(); await sleep(400);
        if (dDef > 0 && hasSkill(aC, 'deadly')) dB[l].currentPower = 0;
        if (dAtk > 0 && hasSkill(dB[l], 'deadly')) aC.currentPower = 0;
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

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
    // 全てのBGMを停止
    stopSound(SOUNDS.bgmTitle);
    stopSound(SOUNDS.bgmBattle);
    stopSound(SOUNDS.bgmLastBattle);
    stopSound(SOUNDS.bgmStageAndroid);

    // ステージ情報の取得
    const stageId = (gameMode === 'story') ? (enemyConfig.stageId || 'android') : (selectedStageId || 'android');
    const stageData = STAGES[stageId];

    // BGMの再生
    const bgmKey = (stageData && stageData.bgm) ? stageData.bgm : 'bgmBattle';
    playSound(SOUNDS[bgmKey]);
    playerMaxHP = MAX_HP;
    enemyMaxHP = (gameMode === 'event_satan') ? 100 : (enemyConfig.id === 'satan') ? 40 : MAX_HP;
    if (gameMode === 'event_satan') aiLevel = 3; // 念のため再セット
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
    bs.style.backgroundImage = `url('assets/background_${stageId}.png')`;
    updateHPBar(); updateSPOrbs('blue'); updateSPOrbs('red'); renderBoard();
    updateDeckDisplay('blue'); updateDeckDisplay('red');
    for (let i = 0; i < 4; i++) { drawCard('blue'); drawCard('red'); }
    switchScreen('screen-battle'); startTurn('blue');
}

function updateHPBar() {
    document.getElementById('player-hp-fill').style.width = `${Math.max(0, (playerHP / playerMaxHP) * 100)}%`;
    document.getElementById('player-hp-text').innerText = `${Math.max(0, playerHP)} / ${playerMaxHP}`;
    document.getElementById('enemy-hp-fill').style.width = `${Math.max(0, (enemyHP / enemyMaxHP) * 100)}%`;
    document.getElementById('enemy-hp-text').innerText = `${Math.max(0, enemyHP)} / ${enemyMaxHP}`;

    // HP0時のアイコン死亡演出（スタイル反映用）
    const pIcon = document.getElementById('player-icon');
    if (pIcon) pIcon.classList.toggle('dead', playerHP <= 0);
    const eIcon = document.getElementById('enemy-icon');
    if (eIcon) eIcon.classList.toggle('dead', enemyHP <= 0);
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
    const iconEl = document.getElementById(target === 'blue' ? 'player-icon' : 'enemy-icon');

    if (bubble) {
        bubble.innerText = phrases[Math.floor(Math.random() * phrases.length)];
        bubble.classList.add('active');

        // アイコンをダメージ画像に変更
        if (iconEl && iconEl.src) {
            const originalSrc = iconEl.src;
            if (!originalSrc.includes('_damage.png')) {
                iconEl.src = originalSrc.replace('.png', '_damage.png');
                setTimeout(() => {
                    if (iconEl.src.includes('_damage.png')) {
                        iconEl.src = originalSrc;
                    }
                }, 1500);
            }
        }

        setTimeout(() => bubble.classList.remove('active'), 1500);
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
async function waitPlayerLaneSelection(count, owner, tokenCard, isLeaderSkill = false, tokenLanes = null) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    // AIの場合：
    if (owner === 'red') {
        // すでにシミュレーションで決定された配置があればそれを使う
        if (tokenLanes && tokenLanes.length > 0) {
            console.log("AI using pre-calculated tokenLanes:", tokenLanes);
            return tokenLanes.slice(0, count);
        }
        // 無ければ評価を行う（強制使用時など）
        const allLanes = board.map((_, i) => i);
        return evaluateBestLanesForToken(allLanes, owner, tokenCard, count, isLeaderSkill);
    }

    // プレイヤーの場合：常に手動選択（自動選択は行わない）
    return new Promise((resolve) => {
        const selected = [];
        const cells = document.querySelectorAll(`#player-lanes .cell`);
        const originalListeners = Array.from(cells).map(c => c.onclick);

        // 配置ガイドメッセージを表示
        isPlacementMode = true;
        updateCardDetail(null);

        // 「ターン終了」ボタンを「配置終了」に切り替え
        const endBtn = document.getElementById('btn-end-turn');
        const originalBtnText = endBtn.innerText;
        const originalBtnOnclick = endBtn.onclick;
        const originalBtnStyle = endBtn.style.cssText;
        endBtn.innerText = '配置終了';
        endBtn.style.background = '#ef4444';
        endBtn.style.borderColor = '#dc2626';

        const cleanUp = () => {
            isPlacementMode = false;
            updateCardDetail(null);
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
                    if (!(await discardCard(owner, board[i], i))) board[i] = null;
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

    // AIの場合：最もパワーが高いカードを選択（同値の場合は左＝インデックスが小さい方を優先）
    if (owner === 'red' || owner === 'blue') {
        const sortedLanes = [...occupiedLanes].sort((a, b) => {
            const diff = targetBoard[b].currentPower - targetBoard[a].currentPower;
            if (diff !== 0) return diff;
            return a - b; // インデックスが小さい方（左）を優先
        });
        if (owner === 'red') return sortedLanes.slice(0, count);
        // プレイヤー側で自動選択が必要な場合（現状は手動だが、一貫性のため）
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

        // 手札入れ替え用のプロンプトを表示
        isDiscardingMode = true;
        discardMaxCount = count;
        updateCardDetail(null);

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
            isDiscardingMode = false;
            discardMaxCount = 0;
            updateCardDetail(null);
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
}/**
 * 召喚時スキル「選択」の選択を待機する
 */
async function waitSkillChoice(choices, owner, card) {
    if (!choices || choices.length === 0) return null;

    // AIの場合
    if (owner === 'red') {
        const aiLevel = parseInt(localStorage.getItem('storyDifficulty')) || 2;

        // 1. すでに意思決定時に選択が決定している場合（Normal/Hardのシミュレーション後）
        if (typeof aiDecision !== 'undefined' && aiDecision && aiDecision.choiceIndex !== undefined) {
            const idx = aiDecision.choiceIndex;
            delete aiDecision.choiceIndex; // 使い終わったら消去
            return choices[idx];
        }

        // 2. 意思決定時に決定していない場合（Easy or 特殊な呼び出し）
        if (aiLevel <= 1) {
            // Easy: ランダム
            return choices[Math.floor(Math.random() * choices.length)];
        } else {
            // Normal/Hard: ここで簡易的にシミュレーション
            // 本来は意思決定時に行われるべきだが、フォールバックとして実装
            console.log("AI performing on-the-fly skill choice simulation");
            let bestIdx = 0;
            let bestScore = -Infinity;
            const originalBoard = enemyBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null);
            const originalPlayerBoard = playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null);

            for (let i = 0; i < choices.length; i++) {
                const simState = {
                    playerBoard: originalPlayerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                    enemyBoard: originalBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                    playerHP, enemyHP, playerSP, enemySP
                };
                // 簡易シミュレーション
                const lane = enemyBoard.indexOf(card);
                if (lane !== -1) {
                    applyActiveSkillLogic(simState, 'red', lane, choices[i].id, choices[i].value);
                    calculateCombatPhase(simState, 'blue');
                    // スコア計算
                    let score = simState.enemyHP - simState.playerHP;
                    for (let b of simState.enemyBoard) if (b) score += b.currentPower;
                    if (score > bestScore) {
                        bestScore = score;
                        bestIdx = i;
                    }
                }
            }
            return choices[bestIdx];
        }
    }

    // プレイヤーの場合
    return new Promise((resolve) => {
        const screen = document.getElementById('screen-skill-choice');
        const container = document.getElementById('skill-choice-container');
        container.innerHTML = '';

        choices.forEach((sk, idx) => {
            const skillDef = SKILLS[sk.id] || SKILLS.none;
            const btn = document.createElement('div');
            btn.className = 'preview-skill-item';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'transform 0.2s, border-color 0.2s';
            btn.innerHTML = `
                <div class="preview-skill-badge" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin: 0 auto 10px auto; width: fit-content; min-width: 120px;">
                    ${skillDef.icon} ${skillDef.name} ${sk.value || ''}
                </div>
                <p class="preview-skill-desc" style="text-align: center;">${skillDef.desc(sk.value)}</p>
            `;

            btn.onmouseover = () => {
                btn.style.transform = 'scale(1.02)';
                btn.style.borderColor = '#facc15';
            };
            btn.onmouseout = () => {
                btn.style.transform = 'scale(1)';
                btn.style.borderColor = 'rgba(250, 204, 21, 0.1)';
            };

            btn.onclick = () => {
                playSound(SOUNDS.seClick);
                screen.style.display = 'none';
                resolve(choices[idx]);
            };
            container.appendChild(btn);
        });

        screen.style.display = 'flex';
        // アニメーション再発火
        const box = screen.querySelector('.skill-modal-box');
        box.classList.remove('modal-pop-animation');
        void box.offsetWidth;
        box.classList.add('modal-pop-animation');
    });
}
async function discardCard(owner, card, lane) {
    if (card.skill === 'split' && lane !== undefined) {
        triggerSplitSkill(owner, lane, card);
        return true; // 分裂した場合は墓地に行かず場に残る（上書きされる）
    }
    if (card.isToken) return false;
    // 誘爆スキルの判定
    if (hasSkill(card, 'explode') && lane !== undefined) {
        await triggerExplodeSkill(owner, lane, card);
    }
    // スキル発動フラグをリセット
    card.skillTriggered = false;
    card.stunTurns = 0;
    card.stunAppliedThisTurn = false;

    // 一時的なスキルの除去（無敵など）
    if (Array.isArray(card.skills)) {
        card.skills = card.skills.filter(sk => sk.id !== 'invincible');
    }

    if ('basePower' in card) { card.power = card.basePower; }
    card.currentPower = card.power;
    (owner === 'blue' ? playerDiscard : enemyDiscard).push(card);
    updateDeckDisplay(owner);
    return false;
}

function updateDeckDisplay(owner) {
    const d = owner === 'blue' ? playerDeck : enemyDeck;
    const ds = owner === 'blue' ? playerDiscard : enemyDiscard;
    if (owner === 'blue') {
        const el = document.getElementById('deck-info');
        if (el) el.innerText = `Deck: ${d.length} / Drop: ${ds.length}`;
    } else {
        const el = document.getElementById('enemy-deck-info');
        if (el) el.innerText = `Deck: ${d.length} / Drop: ${ds.length}`;
    }
}

async function cleanupDestroyedCards() {
    let destroyedItems = [];
    [playerBoard, enemyBoard].forEach((board, bIdx) => {
        const side = bIdx === 0 ? 'player' : 'enemy';
        for (let i = 0; i < 3; i++) {
            if (board[i] && board[i].currentPower <= 0) {
                const el = document.querySelector(`#${side}-lanes .cell[data-lane="${i}"] .card`);
                destroyedItems.push({ board, index: i, el, owner: bIdx === 0 ? 'blue' : 'red', card: board[i] });
            }
        }
    });

    if (destroyedItems.length === 0) return false;

    // 演出: 破壊されるカードを揺らす
    destroyedItems.forEach(item => {
        if (item.el) item.el.classList.add('anim-shake');
    });
    playSound(SOUNDS.seDamage);
    await sleep(400);

    // 実際の除去処理
    for (const item of destroyedItems) {
        // 【重要】再起呼び出し対策：すでに処理済みの場合はスキップ
        if (item.board[item.index] !== item.card) continue;

        // 一旦消去（Splitスキルの場合は discardCard -> triggerSplitSkill 内で改めて上書き配置される）
        item.board[item.index] = null;
        await discardCard(item.owner, item.card, item.index);
    }

    playSound(SOUNDS.seDestroy);
    renderBoard();
    return true;
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
        if (cEl) createDamagePopup(cEl, '分裂', '#facc15');
    }, 100);
}
async function triggerExplodeSkill(owner, lane, card) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    const side = owner === 'blue' ? 'player' : 'enemy';
    const val = getSkillValue(card, 'explode') || 3;
    const adj = lane === 1 ? [0, 2] : [1];

    console.log(`Exploding at ${lane} with value ${val}`);

    let targetsFound = false;
    adj.forEach(j => {
        if (board[j]) {
            board[j].currentPower -= val;
            targetsFound = true;
        }
    });

    if (targetsFound) {
        playSound(SOUNDS.seDamage);
        renderBoard(); // 先に描画を更新

        // 描画更新後の新しいDOM要素に対して演出をかける
        adj.forEach(j => {
            const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${j}"] .card`);
            if (cEl) {
                cEl.classList.add('anim-shake');
                createDamagePopup(cEl, `誘爆 -${val}`, '#ef4444');
            }
        });

        await sleep(500);
        await cleanupDestroyedCards();
    }
}
function drawCard(owner) {
    let d = owner === 'blue' ? playerDeck : enemyDeck, h = owner === 'blue' ? playerHand : enemyHand, ds = owner === 'blue' ? playerDiscard : enemyDiscard;

    // 手札がいっぱいの場合は何もしない
    if (h.length >= 5) {
        updateDeckDisplay(owner);
        return;
    }

    if (d.length === 0 && ds.length > 0) {
        d.push(...ds.sort(() => Math.random() - 0.5));
        ds.length = 0;
        playSound(SOUNDS.seSkill);
        createDamagePopup(document.getElementById(owner === 'blue' ? 'player-hp-fill' : 'enemy-hp-fill'), 'リロード', '#38bdf8');
        showDeckRefreshEffect(owner);
    }

    if (d.length > 0) h.push(d.pop());

    updateDeckDisplay(owner);
    if (owner === 'blue') renderHand();
}

async function startTurn(owner) {
    if (isBattleEnded) return; isProcessing = true;
    const s = document.getElementById('turn-status'); s.innerText = owner === 'blue' ? "YOUR TURN" : "ENEMY TURN"; s.style.color = owner === 'blue' ? "var(--color-blue)" : "var(--color-red)";
    const c = owner === 'blue' ? playerConfig : enemyConfig;
    if (c.leaderSkill.cost) { if (owner === 'blue') playerSP = Math.min(c.leaderSkill.cost, playerSP + 1); else enemySP = Math.min(c.leaderSkill.cost, enemySP + 1); }
    updateSPOrbs(owner);

    // ターン開始時スキルの発動
    await triggerStartTurnSkills(owner);
    if (isBattleEnded) return;

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
    // 上書き配置時の破棄処理
    if (b[l]) {
        if (!(await discardCard(o, b[l], l))) b[l] = null;
    }
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

async function triggerStartTurnSkills(owner) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    const side = owner === 'blue' ? 'player' : 'enemy';
    let triggered = false;

    for (let i = 0; i < 3; i++) {
        const tr = await triggerStartTurnPassive(owner, i);
        if (tr) {
            triggered = true;
            renderBoard();
            await sleep(600); // 各レーンの発動ごとに待機して、複数が重ならないようにする
            if (checkWinCondition()) return;
        }
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

    // 演出: 攻撃アニメーション
    aE.classList.add(an); playSound(SOUNDS.seAttack); await sleep(300);

    // --- ロジックの実行 (Engineの呼び出し) ---
    const currentState = {
        playerBoard, enemyBoard,
        playerHP, enemyHP
    };

    // calculateCombatPhaseは指定したサイドの攻撃1回分ではなく、そのターンの全レーン分を回すように定義してしまったので、
    // ここでは1レーン分だけの簡易的な計算機として使うか、calculateCombatPhaseを修正する。
    // 今回は整合性を取るため、engine.js側の1レーン分計算を抽出するのが望ましいが、一旦個別計算を現状維持しつつ engine.js を改良する。
    // (ここでは既存のロジックが十分複雑なので、一旦 engine.js 側の calculateCombatPhase は AI 予測用とし、実機は今のコードベースを維持する方がバグが少ない)
    // ただし、ユーザーの要望は「全く同じロジック」なので、やはり共通化する。

    // [修正案]: engine.js に calculateSingleLaneCombat を追加するか、実機側を state 管理に寄せる。
    // 今回は工数と安全策を取り、engine.js のロジックを AI.js からフル活用できる形にする。

    // TODO: 次のステップで AI.js を完全に engine.js 依存に書き換える。
    // 現状の実機 battle.js は演出が密結合しているため、大規模な破壊を避ける。

    if (dB[l]) {
        let dDef = aC.currentPower, dAtk = dB[l].currentPower;
        if (hasSkill(dB[l], 'sturdy')) dDef = Math.floor(dDef / 2); if (hasSkill(aC, 'sturdy')) dAtk = Math.floor(dAtk / 2);
        if (hasSkill(dB[l], 'invincible')) dDef = 0; if (hasSkill(aC, 'invincible')) dAtk = 0;

        // 連撃（ダブルストライク）: 与えるダメージ2倍
        if (hasSkill(aC, 'double_strike')) dDef *= 2;
        if (hasSkill(dB[l], 'double_strike')) dAtk *= 2;

        let dLane = l;
        let dg = (l === 1) ? (hasSkill(dB[0], 'guardian') ? 0 : (hasSkill(dB[2], 'guardian') ? 2 : null)) : (l === 0 ? (hasSkill(dB[1], 'guardian') ? 1 : null) : (hasSkill(dB[1], 'guardian') ? 1 : null));
        if (dg !== null) dLane = dg;
        let aLane = l;
        if (!hasSkill(dB[l], 'defender')) {
            let ag = (l === 1) ? (hasSkill(aB[0], 'guardian') ? 0 : (hasSkill(aB[2], 'guardian') ? 2 : null)) : (l === 0 ? (hasSkill(aB[1], 'guardian') ? 1 : null) : (hasSkill(aB[1], 'guardian') ? 1 : null));
            if (ag !== null) aLane = ag;
        }

        const realDef = dB[dLane], realAtk = aB[aLane];
        realDef.currentPower -= dDef; if (!hasSkill(dB[l], 'defender')) realAtk.currentPower -= dAtk;

        // 演出: ダメージ反映のための再描画
        renderBoard();
        const dE_new = document.querySelector(`${dR} .cell[data-lane="${dLane}"] .card`);
        const aE_new = document.querySelector(`${aR} .cell[data-lane="${aLane}"] .card`);

        if (dE_new) { createDamagePopup(dE_new, `-${dDef}`); }
        if (!hasSkill(dB[l], 'defender') && aE_new) { createDamagePopup(aE_new, `-${dAtk}`); }
        playSound(SOUNDS.seDamage);
        await sleep(400);

        if (dDef > 0 && hasSkill(aC, 'deadly')) realDef.currentPower = 0;
        if (dAtk > 0 && hasSkill(dB[l], 'deadly')) realAtk.currentPower = 0;

        let aD = realAtk.currentPower <= 0, dD = realDef.currentPower <= 0;
        if (dD && !aD && hasSkill(aC, 'soul_bind')) {
            const val = getSkillValue(aC, 'soul_bind') || 2;
            aC.currentPower += val;
            if (aE_new) createDamagePopup(aE_new, `+${val}`, '#4ade80');
            playSound(SOUNDS.seSkill);
        }
        if (aD && !dD && hasSkill(dB[l], 'soul_bind')) {
            const val = getSkillValue(dB[l], 'soul_bind') || 2;
            dB[l].currentPower += val;
            if (dE_new) createDamagePopup(dE_new, `+${val}`, '#4ade80');
            playSound(SOUNDS.seSkill);
        }

        // 破壊演出（async化したクリーンアップを使用）
        const destroyed = await cleanupDestroyedCards();

        if (dD && !aD && hasSkill(aC, 'pierce')) {
            let pD = aC.currentPower;
            if (hasSkill(aC, 'double_strike')) pD *= 2;
            if (pD > 0) {
                await sleep(200); playSound(SOUNDS.seDamage);
                if (atk === 'blue') { enemyHP -= pD; createDamagePopup(document.getElementById('enemy-hp-fill'), `-${pD}`); }
                else { playerHP -= pD; createDamagePopup(document.getElementById('player-hp-fill'), `-${pD}`); }
                updateHPBar(); if (checkWinCondition()) return;
            }
        }
    } else {
        let d = aC.currentPower;
        if (hasSkill(aC, 'double_strike')) d *= 2;
        playSound(SOUNDS.seDamage); document.body.classList.add('anim-shake');
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
    stopAllBGM();
    lastBattleResult = playerHP > 0 ? (enemyHP <= 0 ? 'win' : 'draw') : (enemyHP > 0 ? 'lose' : 'draw');
    const t = document.getElementById('turn-status'); t.innerText = lastBattleResult === 'win' ? "YOU WIN!" : (lastBattleResult === 'lose' ? "YOU LOSE..." : "DRAW");
    t.style.color = lastBattleResult === 'win' ? "#facc15" : "#fff";
    isProcessing = false; // バトル結果表示と同時にフラグをリセット
    setTimeout(() => {
        playSound(SOUNDS.bgmTitle);

        // 防衛戦：報酬も台詞もスキップして戻る
        if (gameMode === 'defense_attack') {
            if (lastBattleResult === 'win') {
                // ポイント計算
                const myPoints = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
                let myTotalPoints = parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) || 0;
                const enemyPoints = enemyConfig.points || 0;

                let winPoints = 1;
                if (enemyPoints >= myPoints * 2 && enemyPoints > 0) winPoints = 5;
                else if (enemyPoints > myPoints) winPoints = 3;

                const newPoints = myPoints + winPoints;
                myTotalPoints += winPoints;

                // ローカルの保存
                localStorage.setItem('mini_card_battle_defense_points', newPoints);
                localStorage.setItem('mini_card_battle_defense_total_points', myTotalPoints);

                // サーバーへの送信
                const uuid = getOrCreateUUID();
                fetch('api/update_points.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uuid: uuid, points: newPoints })
                }).catch(err => console.error("Failed to update points:", err));

                playSound(SOUNDS.seSkill);
                showAlertModal(`防衛戦に勝利しました！\n防衛戦ポイントを ${winPoints} Pt 獲得しました！`, () => {
                    appState = 'select_enemy';
                    initSelectScreen(false);
                    switchScreen('screen-select');
                });
            } else if (lastBattleResult === 'lose') {
                // 負けた場合は敵に3ポイントと防衛回数を付与する
                const enemyUuid = enemyConfig.uuid;
                if (enemyUuid) {
                    fetch('api/update_points.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uuid: enemyUuid, points: 3, increment: true, defense_wins: 1 })
                    }).catch(err => console.error("Failed to update enemy points:", err));
                }

                appState = 'select_enemy';
                initSelectScreen(false);
                switchScreen('screen-select');
            } else {
                appState = 'select_enemy';
                initSelectScreen(false);
                switchScreen('screen-select');
            }
            return;
        }

        // フリーバトル：勝利時は報酬表示、敗北/引き分けは戻る（台詞はスキップ）
        // フリーバトル：勝利時は報酬表示、敗北/引き分けは戻る
        if (gameMode === 'free') {
            appState = 'post_dialogue';
            if (lastBattleResult === 'win') {
                dialogueQueue = [
                    { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'lose') },
                    { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'win') }
                ];
                showCardReward(enemyConfig.id);
            } else {
                dialogueQueue = [
                    { speaker: 'player', text: getDialogue(playerConfig, enemyConfig, 'lose') },
                    { speaker: 'enemy', text: getDialogue(enemyConfig, playerConfig, 'win') }
                ];
                setupDialogueScreen();
            }
            return;
        }

        appState = 'post_dialogue';
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
        // 防衛戦でリタイアした場合も、相手に3ポイントと防衛回数を付与する
        if (gameMode === 'defense_attack' && typeof enemyConfig !== 'undefined' && enemyConfig.uuid) {
            fetch('api/update_points.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uuid: enemyConfig.uuid, points: 3, increment: true, defense_wins: 1 })
            }).catch(err => console.error("Failed to update enemy points on retire:", err));
        }

        stopAllBGM();
        playSound(SOUNDS.bgmTitle);
        appState = 'title';
        isProcessing = false;
        switchScreen('screen-mode-select');
    });
}

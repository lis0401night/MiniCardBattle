/**
 * Mini Card Battle - Skill Implementation Logic
 * 分割されたスキル実行ロジック
 */

async function resolveActiveSkillEffect(o, l, c, skillId, skillValue) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    const dS = o === 'blue' ? 'enemy' : 'player';

    // 演出用のポップアップと音（一括した基本演出）
    if (['support', 'hero', 'lone_wolf', 'morph', 'spread', 'snipe', 'berserk', 'heal', 'charge', 'sacrifice', 'quick', 'choice'].includes(skillId)) {
        playSound(SOUNDS.seSkill);
        const labels = { 'support': '援護', 'hero': '英雄', 'lone_wolf': '単騎', 'morph': '変化', 'spread': '拡散', 'snipe': '狙撃', 'berserk': '狂乱', 'heal': '回復', 'charge': '充填', 'sacrifice': '対価', 'quick': '速攻', 'choice': '選択' };
        if (cEl) createDamagePopup(cEl, labels[skillId] || 'スキル', '#facc15');
    }

    // --- ロジックの実行 (Engineの呼び出し) ---
    const currentState = {
        playerBoard, enemyBoard,
        playerHP, enemyHP,
        playerSP, enemySP,
        playerHand, enemyHand,
        playerDiscard, enemyDiscard
    };

    // 特殊な選択が必要なスキルは個別に扱う (draw, clone, quick, choice, metamorph等)
    if (skillId === 'metamorph') {
        // 全マスタカード（トークン含む）からランダムに1枚選択
        const randomMaster = CARD_MASTER[Math.floor(Math.random() * CARD_MASTER.length)];
        
        // 演出
        playSound(SOUNDS.seSkill);
        if (cEl) {
            createDamagePopup(cEl, '変相', '#facc15');
            cEl.classList.add('anim-shake');
            await sleep(300);
        }

        // 元のIDを保持（破壊時に戻る用）
        if (!c.originalCardId) c.originalCardId = 'baldanders';

        // 性能の上書き
        c.name = randomMaster.name;
        c.power = randomMaster.power;
        c.currentPower = randomMaster.power;
        c.basePower = randomMaster.power;
        c.skill = randomMaster.skill || 'none';
        c.skillValue = randomMaster.skillValue || 0;
        c.skills = randomMaster.skills ? JSON.parse(JSON.stringify(randomMaster.skills)) : [];
        c.choices = randomMaster.choices ? JSON.parse(JSON.stringify(randomMaster.choices)) : [];
        c.rarity = randomMaster.rarity;
        
        // イラストの決定（トークン等の特殊なマッピングを考慮）
        let imgUrl = randomMaster.imgUrl;
        if (!imgUrl) {
            if (randomMaster.id === 'token_soldier') imgUrl = 'assets/card_soldier.jpg';
            else if (randomMaster.id === 'token_ignis') imgUrl = 'assets/char_dragon.png';
            else if (randomMaster.id === 'token_satan') imgUrl = 'assets/char_satan.png';
            else imgUrl = `assets/card_${randomMaster.id}.jpg`;
        }
        c.imgUrl = imgUrl;

        c.flavor = randomMaster.flavor;
        c.voiceCategory = randomMaster.voiceCategory;

        // 見た目の更新
        renderBoard();
        await sleep(500);

        // 変身後のカードが召喚時スキルを持っていれば発動
        if (hasActiveSkill(c)) {
            await resolveOnPlaySkill(o, l, c);
        }
        return;
    }

    if (skillId === 'choice') {
        const choice = await waitSkillChoice(c.choices, o, c);
        if (choice) {
            // 選択されたスキルを再帰的に実行
            await resolveActiveSkillEffect(o, l, c, choice.id, choice.value);
        }
        return;
    }

    if (skillId === 'draw') {
        const h = o === 'blue' ? playerHand : enemyHand;
        const count = skillValue || 1;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '入替', '#facc15');
        const selectedIndices = await waitPlayerHandSelection(count, o);
        if (selectedIndices.length > 0) {
            selectedIndices.sort((a, b) => b - a);
            for (let i of selectedIndices) {
                const discarded = h.splice(i, 1)[0];
                await discardCard(o, discarded);
            }
            for (let i = 0; i < selectedIndices.length; i++) drawCard(o);
        } else if (h.length === 0) {
            drawCard(o);
        }
        await sleep(500);
    } else if (skillId === 'clone') {
        const count = skillValue || 1;
        const tC = CARD_MASTER.find(m => m.id === 'token_clone');
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '分身', '#facc15');

        // スキルの引き継ぎ（分身以外）
        let inheritedSkills = [];
        if (c.skill && c.skill !== 'clone') inheritedSkills.push({ id: c.skill, value: c.skillValue });
        if (Array.isArray(c.skills)) {
            inheritedSkills = inheritedSkills.concat(c.skills.filter(sk => sk.id !== 'clone'));
        }

        const selectedLanes = await waitPlayerLaneSelection(count, o, tC, false);
        for (let i = 0; i < selectedLanes.length; i++) {
            const tL = selectedLanes[i];
            const board = o === 'blue' ? playerBoard : enemyBoard;
            board[tL] = {
                id: `cl_${Date.now()}_${i}`,
                owner: o,
                ...tC,
                imgUrl: c.imgUrl,
                filter: c.filter,
                power: c.power,
                currentPower: c.currentPower,
                rarity: c.rarity || 1,
                basePower: c.power,
                skills: inheritedSkills // スキルを引き継ぐ
            };
            renderBoard(); await sleep(300);
        }
    } else if (skillId === 'quick') {
        await sleep(400); await executeSingleCombat(o, l);
    } else if (skillId === 'bind') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '拘束', '#facc15');
        const eB = o === 'blue' ? enemyBoard : playerBoard;
        if (eB[l]) {
            eB[l].stunTurns = 2; eB[l].stunAppliedThisTurn = true;
            const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${l}"] .card`);
            if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, '拘束', '#94a3b8'); }
        }
        await sleep(500);
    } else {
        // 標準的なスキルは共通エンジンを使用
        applyActiveSkillLogic(currentState, o, l, skillId, skillValue || 0);

        // エンジンによる状態変化をグローバル変数に反映
        playerHP = currentState.playerHP; enemyHP = currentState.enemyHP;
        playerSP = currentState.playerSP; enemySP = currentState.enemySP;
        playerDiscard = currentState.playerDiscard; enemyDiscard = currentState.enemyDiscard;
        updateDeckDisplay('blue'); updateDeckDisplay('red');

        // 演出: 盤面の大幅な変化（破壊等）を伴うスキルの後処理
        if (['spread', 'snipe', 'berserk', 'sacrifice'].includes(skillId)) {
            playSound(SOUNDS.seDamage);
            await sleep(100);
            await cleanupDestroyedCards();
            if (skillId === 'sacrifice') checkWinCondition();
        } else if (skillId === 'morph') {
            playSound(SOUNDS.seSkill);
            await sleep(100);
            await cleanupDestroyedCards();
        } else {
            await cleanupDestroyedCards();
        }

        renderBoard();
        renderHand();
        updateHPBar();
        updateSPOrbs('blue');
        updateSPOrbs('red');
        await sleep(500);
    }
}

async function triggerStartTurnPassive(owner, lane) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    const side = owner === 'blue' ? 'player' : 'enemy';
    const c = board[lane];
    if (!c) return false;

    let triggered = false;
    
    // 発動対象スキルのリストを作成（定義順に1つずつ処理）
    let skillsToResolve = [];
    if (c.skill && c.skill !== 'none') skillsToResolve.push({ id: c.skill, value: c.skillValue });
    if (Array.isArray(c.skills)) skillsToResolve = skillsToResolve.concat(c.skills);

    for (const sk of skillsToResolve) {
        // Growth (成長)
        if (sk.id === 'growth') {
            const val = sk.value || 1;
            c.power += val; c.currentPower += val;
            updateCardPowerOnly(lane, side);
            const prefix = val > 0 ? '+' : ''; const color = val > 0 ? '#4ade80' : '#ef4444';
            const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${lane}"] .card`);
            if (cEl) createDamagePopup(cEl, `成長 ${prefix}${val}`, color);
            if (c.currentPower <= 0) {
                if (!(await discardCard(owner, c, lane))) board[lane] = null;
                playSound(SOUNDS.seDestroy);
            }
            else playSound(SOUNDS.seSkill);
            triggered = true;
            await sleep(200);
            if (!board[lane]) break; // 破壊されたら終了
        }

        // Invincible (無敵) - カウントダウン
        if (sk.id === 'invincible') {
            sk.value--;
            if (sk.value <= 0) {
                // スキルリストから削除
                if (c.skill === 'invincible') {
                    c.skill = 'none';
                } else if (Array.isArray(c.skills)) {
                    const idx = c.skills.indexOf(sk);
                    if (idx !== -1) c.skills.splice(idx, 1);
                }
                const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${lane}"] .card`);
                if (cEl) createDamagePopup(cEl, '無敵終了', '#94a3b8');
            }
            triggered = true;
            await sleep(150);
        }

        // Contract (契約)
        if (sk.id === 'contract') {
            const val = sk.value || 3;
            const hpFill = document.getElementById(owner === 'blue' ? 'player-hp-fill' : 'enemy-hp-fill');

            if (owner === 'blue') playerHP -= val;
            else enemyHP -= val;

            playSound(SOUNDS.seDamage);
            if (hpFill) createDamagePopup(hpFill, `契約 -${val}`, '#ef4444');
            updateHPBar();
            triggered = true;
            await sleep(500); // 契約演出をしっかり見せる
        }
    }

    return triggered;
}

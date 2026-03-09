/**
 * Mini Card Battle - Skill Implementation Logic
 * 分割されたスキル実行ロジック
 */

async function resolveActiveSkillEffect(o, l, c, skillId, skillValue) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    const h = o === 'blue' ? playerHand : enemyHand, b = o === 'blue' ? playerBoard : enemyBoard, eB = o === 'blue' ? enemyBoard : playerBoard, dO = o === 'blue' ? 'red' : 'blue', dS = o === 'blue' ? 'enemy' : 'player';

    if (skillId === 'draw') {
        const count = skillValue || 1;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'REPLACE', '#facc15');
        const selectedIndices = await waitPlayerHandSelection(count, o);
        if (selectedIndices.length > 0) {
            // インデックスが大きい順にソートして、spliceでズレないようにする
            selectedIndices.sort((a, b) => b - a);
            for (let i of selectedIndices) {
                const discarded = h.splice(i, 1)[0];
                discardCard(o, discarded);
            }
            for (let i = 0; i < selectedIndices.length; i++) drawCard(o);
        } else if (h.length === 0) {
            drawCard(o);
        }
        await sleep(500);
    } else if (skillId === 'charge') {
        const val = skillValue;
        playSound(SOUNDS.seSkill);
        createDamagePopup(cEl, `COST ${val >= 0 ? '+' : ''}${val}`, '#facc15');
        if (o === 'blue') { playerSP = Math.max(0, playerSP + val); updateSPOrbs('blue'); }
        else { enemySP = Math.max(0, enemySP + val); updateSPOrbs('red'); }
        await sleep(500);
    } else if (skillId === 'heal') {
        const val = skillValue || 3;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, `+${val} HP`, '#4ade80');
        if (o === 'blue') playerHP = Math.min(MAX_HP, playerHP + val);
        else enemyHP = Math.min(MAX_HP, enemyHP + val);
        updateHPBar(); await sleep(500);
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
        } else {
            await sleep(500);
        }
    } else if (skillId === 'spread') {
        const val = skillValue || 2;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SPREAD', '#facc15');
        let hit = false;
        const targets = [l, l - 1, l + 1].filter(i => i >= 0 && i < 3);
        for (let i of targets) {
            if (eB[i]) {
                const tEl = document.querySelector(`#${dS}-lanes .cell[data-lane="${i}"] .card`);
                if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, `-${val}`, '#ef4444'); }
                eB[i].currentPower -= val; hit = true;
            }
        }
        if (hit) {
            renderBoard(); playSound(SOUNDS.seDamage); await sleep(500);
            for (let i of targets) if (eB[i] && eB[i].currentPower <= 0) { if (!discardCard(dO, eB[i], i)) eB[i] = null; playSound(SOUNDS.seDestroy); }
            renderBoard();
        } else {
            await sleep(500);
        }
    } else if (skillId === 'stealth') {
        const val = skillValue || 1;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, '無敵付与', '#facc15');
        if (!Array.isArray(c.skills)) { c.skills = []; }
        else { c.skills = [...c.skills.map(s => ({ ...s }))]; }
        c.skills.push({ id: 'invincible', value: val });
        renderBoard(); await sleep(500);
    } else if (skillId === 'copy') {
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'COPY', '#facc15');
        const adj = l === 1 ? [0, 2] : [1];
        let total = 0; for (let i of adj) if (b[i]) total += b[i].currentPower;
        if (total > 0) { c.power += total; c.currentPower += total; createDamagePopup(cEl, `+${total}`, '#4ade80'); renderBoard(); await sleep(500); }
        else { await sleep(500); }
    } else if (skillId === 'support') {
        const val = skillValue || 2;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'SUPPORT', '#facc15');
        const adj = l === 1 ? [0, 2] : [1];
        let hit = false;
        for (let i of adj) if (b[i]) { b[i].currentPower += val; const tEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`); if (tEl) createDamagePopup(tEl, `+${val}`, '#4ade80'); hit = true; }
        if (hit) { renderBoard(); await sleep(500); }
        else { await sleep(500); }
    } else if (skillId === 'clone') {
        const count = skillValue || 1;
        const tC = CARD_MASTER.find(m => m.id === 'token_clone');
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'CLONE', '#facc15');
        const selectedLanes = await waitPlayerLaneSelection(count, o, tC, false);
        for (let i = 0; i < selectedLanes.length; i++) {
            const tL = selectedLanes[i];
            b[tL] = { id: `cl_${Date.now()}_${i}`, owner: o, ...tC, imgUrl: c.imgUrl, filter: c.filter, power: c.power, currentPower: c.currentPower, rarity: c.rarity || 1, basePower: c.power };
            renderBoard(); await sleep(300);
        }
    } else if (skillId === 'lone_wolf') {
        playSound(SOUNDS.seSkill); const e = b.filter(x => x === null).length;
        const val = skillValue || 3;
        if (e * val > 0) { c.power += e * val; c.currentPower += e * val; createDamagePopup(cEl, `+${e * val}`, '#4ade80'); renderBoard(); }
        else createDamagePopup(cEl, `+0`, '#94a3b8'); await sleep(500);
    } else if (skillId === 'hero') {
        playSound(SOUNDS.seSkill); const occ = b.filter(x => x !== null).length;
        const val = skillValue || 3;
        if (occ * val > 0) { c.power += occ * val; c.currentPower += occ * val; createDamagePopup(cEl, `+${occ * val}`, '#4ade80'); renderBoard(); }
        await sleep(500);
    } else if (skillId === 'berserk') {
        const val = skillValue || 2;
        playSound(SOUNDS.seSkill); createDamagePopup(cEl, 'BERSERK', '#ef4444');
        const adj = l === 1 ? [0, 2] : [1];
        let hit = false;
        for (let i of adj) if (b[i]) {
            const tEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${i}"] .card`);
            if (tEl) { tEl.classList.add('anim-shake'); createDamagePopup(tEl, `-${val}`, '#ef4444'); }
            b[i].currentPower -= val; hit = true;
        }
        if (hit) {
            renderBoard(); playSound(SOUNDS.seDamage); await sleep(500);
            for (let i of adj) if (b[i] && b[i].currentPower <= 0) { if (!discardCard(o, b[i], i)) b[i] = null; playSound(SOUNDS.seDestroy); }
            renderBoard();
        } else {
            await sleep(500);
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

async function triggerStartTurnPassive(owner, lane) {
    const board = owner === 'blue' ? playerBoard : enemyBoard;
    const side = owner === 'blue' ? 'player' : 'enemy';
    const c = board[lane];
    if (!c) return false;

    let triggered = false;
    // Growth
    if (hasSkill(c, 'growth')) {
        const val = getSkillValue(c, 'growth') || 1;
        c.power += val; c.currentPower += val;
        const prefix = val > 0 ? '+' : ''; const color = val > 0 ? '#4ade80' : '#ef4444';
        const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${lane}"] .card`);
        if (cEl) createDamagePopup(cEl, `成長 ${prefix}${val}`, color);
        if (c.currentPower <= 0) { if (!discardCard(owner, c, lane)) board[lane] = null; playSound(SOUNDS.seDestroy); }
        else playSound(SOUNDS.seSkill);
        triggered = true;
    }

    // Invincible
    if (c) {
        if (Array.isArray(c.skills)) {
            const invIdx = c.skills.findIndex(sk => sk.id === 'invincible');
            if (invIdx !== -1) {
                c.skills[invIdx].value--;
                if (c.skills[invIdx].value <= 0) {
                    c.skills.splice(invIdx, 1);
                    const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${lane}"] .card`);
                    if (cEl) createDamagePopup(cEl, '無敵終了', '#94a3b8');
                }
                triggered = true;
            }
        } else if (c.skill === 'invincible') {
            c.skillValue--;
            if (c.skillValue <= 0) {
                c.skill = 'none';
                const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${lane}"] .card`);
                if (cEl) createDamagePopup(cEl, '無敵終了', '#94a3b8');
            }
            triggered = true;
        }
    }
    return triggered;
}

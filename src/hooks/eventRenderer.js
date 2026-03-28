import { createDamagePopup, playSound, sleep, getSeededRandom } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { playCardVoice } from '../utils/constants/voices.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { updateHPBar, updateSPOrbs, updateDeckDisplay, cleanupDestroyedCards } from './battle.js';
import { updateCardPowerOnly, renderBoard, renderHand } from './uiBattle.js';
import { GameState } from './gameState.js';

/**
 * engine.js が生成したイベントログの配列を受け取り、
 * 順番にアニメーション、ポップアップ、効果音を再生する描画専用モジュール (Renderer)
 * 
 * @param {Array} events - { type, side, lane, amount, source, ... } の配列
 */
export async function playEvents(events) {
    if (!events || !Array.isArray(events) || events.length === 0) return;

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const sidePrefix = ev.side === 'blue' ? 'player' : 'enemy';
        const oppPrefix = ev.side === 'blue' ? 'enemy' : 'player';
        const nextEv = events[i + 1];
        const isNextDamage = nextEv && ['damage_card', 'damage_player', 'deadly'].includes(nextEv.type);

        switch (ev.type) {
            case 'damage_card': {
                const board = ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                if (board[ev.lane]) board[ev.lane].currentPower -= ev.amount;

                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    cEl.classList.remove('anim-shake');
                    void cEl.offsetWidth; // reflow
                    cEl.classList.add('anim-shake');

                    let label = `-${ev.amount}`;
                    if (ev.source === 'explode') label = `誘爆 ${label}`;

                    createDamagePopup(cEl, label, '#ef4444');
                }
                updateCardPowerOnly(ev.lane, sidePrefix);
                if (!isNextDamage) {
                    playSound(SOUNDS.seDamage);
                    await sleep(300);
                }
                break;
            }
            case 'immune_block': {
                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    createDamagePopup(cEl, '無効', '#94a3b8');
                }
                playSound(SOUNDS.seSkill);
                await sleep(200);
                break;
            }
            case 'sturdy_block': {
                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    createDamagePopup(cEl, '頑丈', '#64748b');
                }
                playSound(SOUNDS.seSkill);
                await sleep(200);
                break;
            }
            case 'double_strike_proc': {
                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    createDamagePopup(cEl, '連撃', '#fbbf24');
                }
                playSound(SOUNDS.seSkill);
                await sleep(200);
                break;
            }
            case 'power_change': {
                const board = ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                if (board[ev.lane]) {
                    board[ev.lane].currentPower += ev.amount; // 増減そのまま
                    if (ev.source === 'holy_march') {
                        board[ev.lane].power += ev.amount; // 永続バフとして記録
                        board[ev.lane].basePower = board[ev.lane].power;
                    }
                }

                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    const isBuff = ev.amount > 0;
                    const prefix = isBuff ? '+' : '';
                    const color = isBuff ? '#4ade80' : '#ef4444';

                    let label = `${prefix}${ev.amount}`;
                    if (ev.source === 'growth') label = `成長 ${label}`;
                    else if (ev.source === 'soul_bind') label = `魂縛 ${label}`;

                    createDamagePopup(cEl, label, color);
                }
                updateCardPowerOnly(ev.lane, sidePrefix);
                playSound(SOUNDS.seSkill);
                await sleep(200);
                break;
            }
            case 'deadly': {
                const board = ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                if (board[ev.lane]) board[ev.lane].currentPower = 0;

                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    createDamagePopup(cEl, '破壊', '#991b1b');
                }
                updateCardPowerOnly(ev.lane, sidePrefix);
                if (!isNextDamage) {
                    playSound(SOUNDS.seDamage);
                    await sleep(300);
                }
                break;
            }
            case 'damage_player': {
                if (ev.side === 'blue') GameState.playerHP -= ev.amount;
                else GameState.enemyHP -= ev.amount;

                const hpFill = document.getElementById(`${sidePrefix}-hp-fill`);
                if (hpFill) {
                    let label = `-${ev.amount}`;
                    if (ev.source === 'contract') label = `契約 ${label}`;
                    createDamagePopup(hpFill, label, '#ef4444');
                }

                // プレイヤー側の画面揺らし
                const playmat = document.getElementById(`playmat-${sidePrefix}`);
                if (playmat) {
                    playmat.classList.remove('anim-shake');
                    void playmat.offsetWidth;
                    playmat.classList.add('anim-shake');
                } else if (ev.source === 'artillery') {
                    document.body.classList.remove('anim-shake');
                    void document.body.offsetWidth;
                    document.body.classList.add('anim-shake');
                }

                updateHPBar();
                if (!isNextDamage) {
                    playSound(SOUNDS.seDamage);
                    await sleep(300);
                }
                break;
            }
            case 'heal_player': {
                let actualHeal = 0;
                if (ev.side === 'blue') {
                    const before = GameState.playerHP;
                    GameState.playerHP = Math.min(GameState.playerMaxHP, GameState.playerHP + ev.amount);
                    actualHeal = GameState.playerHP - before;
                } else {
                    const before = GameState.enemyHP;
                    GameState.enemyHP = Math.min(GameState.enemyMaxHP, GameState.enemyHP + ev.amount);
                    actualHeal = GameState.enemyHP - before;
                }

                if (actualHeal > 0) {
                    const hpFill = document.getElementById(`${sidePrefix}-hp-fill`);
                    if (hpFill) createDamagePopup(hpFill, `+${actualHeal}`, '#4ade80');
                }
                updateHPBar();
                playSound(SOUNDS.seSkill);
                await sleep(300);
                break;
            }
            case 'charge_sp': {
                if (ev.side === 'blue') {
                    const pMaxSP = GameState.playerConfig?.leaderSkill?.cost || 5;
                    GameState.playerSP = Math.min(pMaxSP, Math.max(0, GameState.playerSP + ev.amount));
                } else {
                    const eMaxSP = GameState.enemyConfig?.leaderSkill?.cost || 5;
                    GameState.enemySP = Math.min(eMaxSP, Math.max(0, GameState.enemySP + ev.amount));
                }
                updateSPOrbs(ev.side);
                playSound(SOUNDS.seSkill);
                await sleep(200);
                break;
            }
            case 'summon_token':
            case 'summon_card': {
                const board = ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                board[ev.lane] = ev.card;
                renderBoard();
                playSound(SOUNDS.sePlace);

                let voiceCat = ev.card ? ev.card.voiceCategory : null;
                if (!voiceCat && ev.card) {
                    const baseId = ev.card.baseId || ev.card.id;
                    const cMaster = CARD_MASTER.find(m => m.id === baseId || m.name === ev.card.name);
                    if (cMaster && cMaster.voiceCategory) {
                        voiceCat = cMaster.voiceCategory;
                        ev.card.voiceCategory = voiceCat;
                    }
                }

                if (voiceCat) {
                    playCardVoice(voiceCat, 'play');
                }

                setTimeout(() => {
                    const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                    if (cEl) {
                        if (ev.source === 'split') {
                            createDamagePopup(cEl, '分裂', '#facc15');
                        }
                    }
                }, 50);

                await sleep(300);
                break;
            }
            case 'add_hand': {
                const hand = ev.side === 'blue' ? GameState.playerHand : GameState.enemyHand;
                if (hand.length < 5) {
                    if (!ev.card.uid) {
                        ev.card.uid = `${ev.side}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
                    }
                    hand.push(ev.card);
                }
                renderHand();
                updateDeckDisplay(ev.side);
                playSound(SOUNDS.seDraw);
                await sleep(200);
                break;
            }
            case 'discard': {
                const hand = ev.side === 'blue' ? GameState.playerHand : GameState.enemyHand;
                if (ev.card) {
                    let idx = -1;
                    if (ev.card.uid) {
                        idx = hand.findIndex(c => c.uid === ev.card.uid);
                    }
                    // フォールバック: UIDで見つからなかった場合、非同期ズレ対策として名前やIDが一致するカードを手札の最後から探して破棄する
                    if (idx === -1) {
                         // uid比較ではなく、最も一致度が高いもの（基本は後ろのもの）を選ぶ
                         for (let j = hand.length - 1; j >= 0; j--) {
                             const c = hand[j];
                             if ((c.uid && ev.card.uid && c.uid === ev.card.uid) || 
                                 (c.id === ev.card.id) || 
                                 (c.name === ev.card.name && c.power === ev.card.power)) {
                                 idx = j;
                                 break;
                             }
                         }
                    }
                    if (idx !== -1) {
                        const discardedCard = hand.splice(idx, 1)[0];
                        const discardArr = ev.side === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;

                        // 墓地送り時の完全リセット
                        const masterData = CARD_MASTER.find(m => m.id === (discardedCard.baseId || discardedCard.id));
                        let restoredCard;
                        if (masterData) {
                            restoredCard = JSON.parse(JSON.stringify(masterData));
                            restoredCard.uid = discardedCard.uid;
                            restoredCard.owner = ev.side;
                            restoredCard.baseId = discardedCard.baseId || discardedCard.id;
                            if (discardedCard.isPremium !== undefined) restoredCard.isPremium = discardedCard.isPremium;
                            restoredCard.basePower = restoredCard.power;
                            restoredCard.currentPower = restoredCard.power;
                        } else {
                            restoredCard = { ...discardedCard };
                            if ('basePower' in restoredCard) restoredCard.power = restoredCard.basePower;
                            restoredCard.currentPower = restoredCard.power;
                            restoredCard.skills = [];
                        }
                        discardArr.push(restoredCard);
                    }
                }
                updateDeckDisplay(ev.side);
                renderHand();
                break;
            }
            case 'add_skill': {
                const board = ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                const targetCard = board[ev.lane];
                if (targetCard) {
                    if (!Array.isArray(targetCard.skills)) targetCard.skills = [];
                    targetCard.skills.push({ id: ev.skillId, value: ev.value || 1 });
                }

                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                let skillNameText = ev.skillId === 'invincible' ? '無敵' : 'スキル付与';
                if (ev.source === 'stealth') skillNameText = '潜伏';
                if (cEl) createDamagePopup(cEl, skillNameText, '#facc15');
                playSound(SOUNDS.seSkill);
                await sleep(200);
                break;
            }
            case 'invincible_block': {
                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    createDamagePopup(cEl, '無敵', '#cbd5e1');
                    playSound(SOUNDS.seSkill);
                }
                await sleep(300);
                break;
            }
            case 'skill_popup': {
                const atkPfx = ev.side === 'blue' ? 'player' : 'enemy';
                const cEl = document.querySelector(`#${atkPfx}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    createDamagePopup(cEl, ev.skillName, '#facc15');
                    playSound(SOUNDS.seSkill);
                    await sleep(300);
                }
                break;
            }
            case 'leader_skill': {
                playSound(SOUNDS.seSkill);
                await sleep(400);
                break;
            }
            case 'attack': {
                const atkPfx = ev.attackerSide === 'blue' ? 'player' : 'enemy';
                const atkEl = document.querySelector(`#${atkPfx}-lanes .cell[data-lane="${ev.lane}"]`);
                if (atkEl) {
                    atkEl.style.animation = 'none'; // リセット
                    void atkEl.offsetHeight; // リフロー

                    if (ev.attackerSide === 'blue') {
                        atkEl.style.animation = 'attack-up 1.0s cubic-bezier(0.4, 0, 0.2, 1) forwards';
                    } else {
                        atkEl.style.animation = 'attack-down 1.0s cubic-bezier(0.4, 0, 0.2, 1) forwards';
                    }
                    atkEl.style.zIndex = '20';
                    playSound(SOUNDS.seAttack);

                    // 1秒のアニメーション終了後にスタイルを元に戻す
                    setTimeout(() => {
                        if (atkEl) {
                            atkEl.style.animation = '';
                            atkEl.style.zIndex = '';
                        }
                    }, 1000);
                }
                // アニメーションが衝突するタイミング（約0.5秒）まで待機してから次のダメージ処理へ進む
                await sleep(500);
                break;
            }
            case 'destroy_cards': {
                if (!ev.targets || ev.targets.length === 0) break;

                let anyValidTarget = false;
                let playedVoices = new Set();

                // フェーズ1: 一斉にアニメーションと音を再生
                for (const target of ev.targets) {
                    const sidePrefix = target.side === 'blue' ? 'player' : 'enemy';
                    const board = target.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                    const deadCard = board[target.lane];

                    if (deadCard) {
                        const cell = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${target.lane}"]`);
                        if (cell) {
                            const cardEl = cell.querySelector('.card');
                            if (cardEl) {
                                cardEl.classList.add('anim-shake');
                                cardEl.classList.add('anim-card-destroy');
                            }
                        }

                        if (deadCard.voiceCategory && !playedVoices.has(deadCard.voiceCategory)) {
                            playCardVoice(deadCard.voiceCategory, 'death');
                            playedVoices.add(deadCard.voiceCategory);
                        }
                        anyValidTarget = true;
                    }
                }

                if (!anyValidTarget) break;

                playSound(SOUNDS.seDestroy); // SEは1回だけ
                await sleep(400); // 破壊アニメーション待ち

                // フェーズ2: 一斉にデータを消去・墓地送りにして再描画
                for (const target of ev.targets) {
                    const sidePrefix = target.side === 'blue' ? 'player' : 'enemy';
                    const board = target.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                    const deadCard = board[target.lane];

                    if (deadCard) {
                        if (!deadCard.isToken) {
                            const discard = target.side === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;

                            const masterData = CARD_MASTER.find(m => m.id === (deadCard.baseId || deadCard.id));
                            let restoredCard;
                            if (masterData) {
                                restoredCard = JSON.parse(JSON.stringify(masterData));
                                restoredCard.uid = deadCard.uid;
                                restoredCard.owner = target.side;
                                restoredCard.baseId = deadCard.baseId || deadCard.id;
                                if (deadCard.isPremium !== undefined) restoredCard.isPremium = deadCard.isPremium;
                                restoredCard.basePower = restoredCard.power;
                                restoredCard.currentPower = restoredCard.power;
                            } else {
                                restoredCard = { ...deadCard };
                                if ('basePower' in restoredCard) restoredCard.power = restoredCard.basePower;
                                restoredCard.currentPower = restoredCard.power;
                                restoredCard.skills = [];
                            }

                            discard.push(restoredCard);
                            updateDeckDisplay(target.side);
                        }
                        board[target.lane] = null;

                        // アニメーション用クラスのクリーンアップ
                        const cell = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${target.lane}"]`);
                        if (cell) {
                            const cardEl = cell.querySelector('.card');
                            if (cardEl) {
                                cardEl.classList.remove('anim-shake');
                                cardEl.classList.remove('anim-card-destroy');
                            }
                        }
                    }
                }

                renderBoard();
                break;
            }
        }
    }

    // 全てのアニメーションが完了するのを確実に待つためのバッファ
    await sleep(600);
}

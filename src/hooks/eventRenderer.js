import { createDamagePopup, playSound, sleep } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { playCardVoice } from '../utils/constants/voices.js';
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

    for (const ev of events) {
        const sidePrefix = ev.side === 'blue' ? 'player' : 'enemy';
        const oppPrefix = ev.side === 'blue' ? 'enemy' : 'player';

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
                playSound(SOUNDS.seDamage);
                await sleep(200);
                break;
            }
            case 'power_change': {
                const board = ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
                if (board[ev.lane]) board[ev.lane].currentPower += ev.amount; // 増減そのまま

                const cEl = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`);
                if (cEl) {
                    const isBuff = ev.amount > 0;
                    const prefix = isBuff ? '+' : '';
                    const color = isBuff ? '#4ade80' : '#ef4444';
                    
                    let label = `${prefix}${ev.amount}`;
                    if (ev.source === 'growth') label = `成長 ${label}`;
                    else if (ev.source === 'soul_bind') label = `吸収 ${label}`;
                    
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
                    createDamagePopup(cEl, '必殺', '#991b1b');
                }
                updateCardPowerOnly(ev.lane, sidePrefix);
                playSound(SOUNDS.seDamage);
                await sleep(200);
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
                playSound(SOUNDS.seDamage);
                await sleep(300);
                break;
            }
            case 'heal_player': {
                if (ev.side === 'blue') GameState.playerHP += ev.amount;
                else GameState.enemyHP += ev.amount;

                const hpFill = document.getElementById(`${sidePrefix}-hp-fill`);
                if (hpFill) createDamagePopup(hpFill, `+${ev.amount}`, '#4ade80');
                updateHPBar();
                playSound(SOUNDS.seSkill);
                await sleep(300);
                break;
            }
            case 'charge_sp': {
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
                
                if (ev.card && ev.card.voiceCategory) {
                    playCardVoice(ev.card.voiceCategory, 'play');
                }
                
                await sleep(300);
                break;
            }
            case 'add_hand': {
                renderHand();
                updateDeckDisplay(ev.side);
                playSound(SOUNDS.seDraw);
                await sleep(200);
                break;
            }
            case 'discard': {
                updateDeckDisplay(ev.side);
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
                const skillNameText = ev.skillId === 'invincible' ? '無敵' : 'スキル付与';
                if (cEl) createDamagePopup(cEl, skillNameText, '#facc15');
                playSound(SOUNDS.seSkill);
                await sleep(200);
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
                            if (cardEl) cardEl.classList.add('anim-card-destroy');
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
                            discard.push(deadCard);
                            updateDeckDisplay(target.side);
                        }
                        board[target.lane] = null;
                        
                        // アニメーション用クラスのクリーンアップ
                        const cell = document.querySelector(`#${sidePrefix}-lanes .cell[data-lane="${target.lane}"]`);
                        if (cell) {
                             const cardEl = cell.querySelector('.card');
                             if (cardEl) cardEl.classList.remove('anim-card-destroy');
                        }
                    }
                }
                
                renderBoard();
                break;
            }
        }
    }
}

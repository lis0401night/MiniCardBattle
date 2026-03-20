import { CARD_MASTER } from '../utils/constants/cards.js';
import { MAX_HP } from '../utils/constants/config.js';
import { PLAYMAT_MASTER } from '../utils/constants/playmats.js';
import { SKILLS, ACTIVE_SKILLS } from '../utils/constants/skills.js';
import { STAGES } from '../utils/constants/stages.js';
import { playCardVoice } from '../utils/constants/voices.js';
import { createDamagePopup, getDialogue, playSound, stopAllBGM, sleep, switchScreen, hasSkill, getSkillValue, getOrCreateUUID } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { executeEnemyAI, evaluateBestLanesForToken } from './ai.js';
import { updateCardDetail, renderHand, updateCardVisuals, removeCardFromBoard, renderBoard, updateCardPowerOnly, showDeckRefreshEffect, showCardReward, updateBattleUIHook } from './uiBattle.js';
import { generateDeck } from './deck.js';
import { applyActiveSkillLogic, calculateCombatPhase } from './engine.js';
import { GameState } from './gameState.js';
import { activateLeaderSkill } from './leaderSkills.js';
import { resolveActiveSkillEffect, triggerStartTurnPassive } from './skillLogic.js';
import { setupDialogueScreen } from './uiDialogue.js';
import { showDefenseBattleList } from './uiMainCore.js';
import { showConfirmModal, showAlertModal } from './uiModals.js';

// ==========================================
// イベント駆動型タスクキューエンジン (State Machine Core)
// ==========================================

export async function dispatchBattleAction(action) {
    GameState.actionQueue.push(action);
    if (!GameState.isProcessing) {
        await processActionQueue();
    }
}

export async function processActionQueue() {
    if (GameState.isProcessing) return;
    GameState.isProcessing = true;

    while (GameState.actionQueue.length > 0) {
        const action = GameState.actionQueue.shift();
        
        if (action.type === 'playCard') {
            await playCard(action.owner, action.handIndex, action.lane);
            if (checkWinCondition()) break;
            GameState.selectedCardIndex = null;
            if (window.updateCardDetail) window.updateCardDetail(null);
            await sleep(500);
            await endTurnLogic(action.owner);
        } else if (action.type === 'endTurn') {
            await endTurnLogic(action.owner);
        } else if (action.type === 'enemyTurn') {
            await sleep(500);
            await executeEnemyAI();
        }
        
        if (updateBattleUIHook) updateBattleUIHook(); // React側に再描画を通知
    }
    
    GameState.isProcessing = false;
    if (updateBattleUIHook) updateBattleUIHook();
}

// ==========================================
// バトル進行とスキルロジック
// ==========================================

export function prepareBattle() {
    switchScreen('screen-loading');
    const sessionId = Date.now();
    let isFinished = false;

    // プレイマット設定の引き継ぎロード
    if (GameState.playerConfig && GameState.playerConfig.id) {
        let playmatSelectKey = `mini_card_battle_playmat_${GameState.playerConfig.id}`;
        if (GameState.gameMode === 'defense_attack') {
            playmatSelectKey = 'mini_card_battle_playmat_defense';
        }
        GameState.selectedPlaymatId = localStorage.getItem(playmatSelectKey) || null;
    }

    try {
        GameState.playerDeck = generateDeck('blue', GameState.playerConfig, sessionId);
        GameState.enemyDeck = generateDeck('red', GameState.enemyConfig, sessionId);
    } catch (e) {
        console.error("Deck generation error:", e);
        // エラー時も空のデッキで続行を試みる（フリーズ回避）
        GameState.playerDeck = GameState.playerDeck || [];
        GameState.enemyDeck = GameState.enemyDeck || [];
    }

    const allCards = [...GameState.playerDeck, ...GameState.enemyDeck];
    let loaded = 0;

    const finishLoading = () => {
        if (isFinished) return;
        isFinished = true;
        setTimeout(initBattleState, 500);
    };

    // セーフティタイムアウト: 5秒経過したら強制的に開始
    setTimeout(() => {
        if (!isFinished) {
            console.warn("Battle loading timed out. Forcing start...");
            finishLoading();
        }
    }, 5000);

    const updateProgress = () => {
        if (isFinished) return;
        loaded++;
        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            loadingText.innerText = `Generating Cards... ${Math.floor((loaded / Math.max(1, allCards.length)) * 100)}%`;
        }
        if (loaded >= allCards.length) finishLoading();
    };

    if (allCards.length === 0) {
        finishLoading();
        return;
    }

    allCards.forEach(card => {
        const img = new Image();
        img.onload = updateProgress;
        img.onerror = updateProgress;
        img.src = card.imgUrl;
    });
}

export function initBattleState() {
    try {
        // 全てのBGMを停止
        stopAllBGM();

        // ステージ情報の取得
        const stageId = (GameState.gameMode === 'story') ? (GameState.enemyConfig.stageId || 'android') : (GameState.selectedStageId || 'android');
        const stageData = STAGES[stageId];

        // BGMの再生
        const bgmKey = (stageData && stageData.bgm) ? stageData.bgm : 'bgmBattle';
        playSound(SOUNDS[bgmKey]);
        GameState.playerMaxHP = MAX_HP;
        GameState.enemyMaxHP = (GameState.gameMode === 'event_satan') ? 100 : (GameState.enemyConfig.id === 'satan') ? 40 : MAX_HP;
        if (GameState.gameMode === 'event_satan') GameState.aiLevel = 3; // 念のため再セット
        GameState.playerHP = GameState.playerMaxHP; GameState.enemyHP = GameState.enemyMaxHP; GameState.playerSP = 0; GameState.enemySP = 0;
        GameState.playerHand = []; GameState.enemyHand = []; GameState.playerDiscard = []; GameState.enemyDiscard = [];
        GameState.playerBoard = [null, null, null]; GameState.enemyBoard = [null, null, null];
        GameState.isProcessing = false; GameState.selectedCardIndex = null; GameState.isBattleEnded = false; 
        GameState.isPlacementMode = false; GameState.placementToken = null; GameState.placementSelectedLanes = [];
        GameState.isEnemyTargetMode = false; GameState.enemyTargetSkillId = null; GameState.targetSelectResolve = null;
        updateCardDetail(null);
        if (updateBattleUIHook) updateBattleUIHook();

        // 実績: リーダー使用率のカウント (プレイヤーが選択したキャラ)
        if (typeof incrementStat === 'function' && GameState.playerConfig && GameState.playerConfig.id) {
            incrementStat('leaderUsage', GameState.playerConfig.id, 1);
        }

        // バトル画面への遷移シグナル。ここから先は BattleScreen.jsx のマウント時フックに委ねる
        switchScreen('screen-battle');
    } catch (e) {
        console.error("Critical error in initBattleState:", e);
        showAlertModal("バトルの初期化中にエラーが発生しました。タイトルに戻ります。", () => {
            location.reload();
        });
    }
}

export function updateHPBar() {
    // DOMから直接更新しつつ、Reactにも同期させる
    const pFill = document.getElementById('player-hp-fill');
    if (pFill) pFill.style.width = `${Math.max(0, (GameState.playerHP / GameState.playerMaxHP) * 100)}%`;
    const pText = document.getElementById('player-hp-text');
    if (pText) pText.innerText = `${Math.max(0, GameState.playerHP)} / ${GameState.playerMaxHP}`;
    const eFill = document.getElementById('enemy-hp-fill');
    if (eFill) eFill.style.width = `${Math.max(0, (GameState.enemyHP / GameState.enemyMaxHP) * 100)}%`;
    const eText = document.getElementById('enemy-hp-text');
    if (eText) eText.innerText = `${Math.max(0, GameState.enemyHP)} / ${GameState.enemyMaxHP}`;

    // HP0時のアイコン死亡演出（スタイル反映用）
    const pIcon = document.getElementById('player-icon');
    if (pIcon) pIcon.classList.toggle('dead', GameState.playerHP <= 0);
    const eIcon = document.getElementById('enemy-icon');
    if (eIcon) eIcon.classList.toggle('dead', GameState.enemyHP <= 0);

    if (updateBattleUIHook) updateBattleUIHook();
}

export function updateSPOrbs(owner) {
    // innerHTML操作はReactのDOMツリーを破壊するため削除し、Reactフックを発火
    if (updateBattleUIHook) updateBattleUIHook();
}

export function checkWinCondition() {
    if ((GameState.playerHP <= 0 || GameState.enemyHP <= 0) && !GameState.isBattleEnded) {
        GameState.isBattleEnded = true;
        triggerFinishVisuals();
        setTimeout(endBattle, 2000);
        return true;
    }
    return false;
}

export function triggerFinishVisuals() {
    // 画面全体のスローモーションと揺れ
    document.body.classList.add('slow-motion');
    document.body.classList.add('anim-mega-shake');
    playSound(SOUNDS.seDamage); // 重厚な音（既存のSEを流用）

    setTimeout(() => {
        document.body.classList.remove('anim-mega-shake');
    }, 1000);
}

export function showSpeechBubble(target) {
    const config = target === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
    let phrases = config.dialogue.damage;

    // シャドウ（ドッペルゲンガー）は無言
    if (target === 'red' && GameState.enemyConfig.isShadow) {
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

export function showSkillConfirm() {
    const s = GameState.playerConfig.leaderSkill; if (!s) return;
    playSound(SOUNDS.seClick);
    
    let statusText = "";
    let color = "";
    let canExecute = false;

    if (!s.cost) {
        statusText = "パッシブスキル（常に発動）";
        color = "#4ade80";
        canExecute = false;
    } else if (GameState.playerSP >= s.cost) { 
        if (!GameState.isProcessing && !GameState.isBattleEnded && GameState.currentTurn === 'player' && !GameState.isPlacementMode) {
            statusText = "発動可能です！"; 
            color = "#4ade80"; 
            canExecute = true; 
        } else {
            statusText = "現在発動できません（自分のターン待機中のみ）"; 
            color = "#facc15"; 
            canExecute = false; 
        }
    } else { 
        statusText = `発動まであと ${s.cost - GameState.playerSP} SP`; 
        color = "#f87171"; 
        canExecute = false; 
    }

    if (window.showSkillConfirmModalReact) {
        window.showSkillConfirmModalReact({
            skill: s,
            statusText,
            color,
            canExecute,
            onExecute: () => executeSkillFromConfirm()
        });
    }
}

export function showEnemySkillConfirm() {
    playSound(SOUNDS.seClick);
    const s = GameState.enemyConfig.leaderSkill;
    
    let statusText = "";
    let color = "";

    if (!s.cost) { 
        statusText = "パッシブスキル（常に発動）"; 
        color = "#4ade80"; 
    } else {
        const r = Math.max(0, s.cost - GameState.enemySP);
        if (r === 0) { 
            statusText = "発動可能状態です！注意！"; 
            color = "#ef4444"; 
        } else { 
            statusText = `発動まであと ${r} SP`; 
            color = "#f87171"; 
        }
    }

    if (window.showSkillConfirmModalReact) {
        window.showSkillConfirmModalReact({
            skill: s,
            statusText,
            color,
            canExecute: false // 敵のスキルはプレイヤーが実行ボタンを押せない
        });
    }
}

export function closeSkillConfirm() { playSound(SOUNDS.seClick); if (window.closeSkillConfirmModalReact) window.closeSkillConfirmModalReact(); }
export function executeSkillFromConfirm() {
    // 実行直前にもう一度チェック（モーダル表示中に状態が変わった可能性への備え）
    if (GameState.isProcessing || GameState.isBattleEnded || GameState.currentTurn !== 'player') {
        return;
    }
    closeSkillConfirm();
    activateLeaderSkill('blue');
}

/**
 * プレイヤーまたはAIに配置レーンを選択させるユーティリティ
 */
export async function waitPlayerLaneSelection(count, owner, tokenCard, isLeaderSkill = false, tokenLanes = null) {
    const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    // AIの場合：
    if (owner === 'red') {
        // すでにシミュレーションで決定された配置があればそれを使う
        if (tokenLanes && tokenLanes.length > 0) {
            console.log("AI using pre-calculated tokenLanes:", tokenLanes);
            return tokenLanes.slice(0, count);
        }
        // 無ければ評価を行う（強制使用時など）
        const emptyLanes = board.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
        const actualCount = Math.min(count, emptyLanes.length);
        if (actualCount === 0) return [];
        return evaluateBestLanesForToken(emptyLanes, owner, tokenCard, actualCount, isLeaderSkill);
    }

    // プレイヤーの場合：手動選択
    return new Promise((resolve) => {
        GameState.isPlacementMode = true;
        GameState.placementCount = count;
        GameState.placementToken = tokenCard;
        GameState.placementSelectedLanes = [];
        updateCardDetail(null);

        const cleanUp = () => {
            GameState.isPlacementMode = false;
            GameState.placementCount = 0;
            GameState.placementToken = null;
            const result = [...GameState.placementSelectedLanes];
            GameState.placementSelectedLanes = [];
            window.handlePlacementLaneClick = null;
            window.finishPlacement = null;
            updateCardDetail(null);
            if (updateBattleUIHook) updateBattleUIHook();
            return result;
        };

        window.finishPlacement = () => {
            playSound(SOUNDS.seClick);
            resolve(cleanUp());
        };

        window.handlePlacementLaneClick = async (laneIndex) => {
            if (GameState.placementSelectedLanes.includes(laneIndex)) return;
            playSound(SOUNDS.seClick);

            // 既にカードがあるレーンの場合は確認
            if (board[laneIndex] !== null) {
                const existingCard = board[laneIndex];
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
                if (!(await discardCard(owner, board[laneIndex], laneIndex))) board[laneIndex] = null;
                if (updateBattleUIHook) updateBattleUIHook();
            }

            GameState.placementSelectedLanes.push(laneIndex);
            if (updateBattleUIHook) updateBattleUIHook();

            if (GameState.placementSelectedLanes.length >= count) {
                setTimeout(() => {
                    resolve(cleanUp());
                }, 300);
            }
        };

        if (updateBattleUIHook) updateBattleUIHook();
    });
}

/**
 * 相手の場のカードを選択させるユーティリティ（破壊スキル用など）
 */
export async function waitPlayerEnemyLaneSelection(count, owner) {
    const isBlue = owner === 'blue';
    const targetBoard = isBlue ? GameState.enemyBoard : GameState.playerBoard;
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
        GameState.isEnemyTargetMode = true;
        GameState.targetMaxCount = count;
        GameState.targetSelectedLanes = [];

        window.handleEnemyLaneClick = (laneIndex) => {
            if (targetBoard[laneIndex] === null) return;
            playSound(SOUNDS.seClick);
            
            if (!GameState.targetSelectedLanes.includes(laneIndex)) {
                GameState.targetSelectedLanes.push(laneIndex);
                if (updateBattleUIHook) updateBattleUIHook(); // 選択ハイライト更新
                
                if (GameState.targetSelectedLanes.length >= count) {
                    setTimeout(() => {
                        GameState.isEnemyTargetMode = false;
                        const result = [...GameState.targetSelectedLanes];
                        GameState.targetSelectedLanes = [];
                        GameState.targetMaxCount = 0;
                        window.handleEnemyLaneClick = null;
                        if (updateBattleUIHook) updateBattleUIHook();
                        resolve(result);
                    }, 300);
                }
            }
        };

        if (updateBattleUIHook) updateBattleUIHook();
    });
}

/**
 * プレイヤーまたはAIに手札からカードを選択させるユーティリティ（入替スキル用）
 */
export async function waitPlayerHandSelection(count, owner) {
    const hand = owner === 'blue' ? GameState.playerHand : GameState.enemyHand;
    if (hand.length === 0) return [];

    // AIの場合：最もパワーが低いカードを選択
    if (owner === 'red') {
        const sortedWithIndex = hand.map((c, i) => ({ c, i })).sort((a, b) => a.c.power - b.c.power);
        const selectedCount = Math.min(count, hand.length);
        return sortedWithIndex.slice(0, selectedCount).map(x => x.i);
    }

    // プレイヤーの場合：手動選択
    return new Promise((resolve) => {
        GameState.discardSelectedIndices = [];

        // 手札入れ替え用のプロンプトを表示
        GameState.isDiscardingMode = true;
        GameState.discardMaxCount = count;
        updateCardDetail(null);
        renderHand(); // 描画更新

        const cleanUp = () => {
            GameState.isDiscardingMode = false;
            const result = [...GameState.discardSelectedIndices];
            GameState.discardSelectedIndices = [];
            GameState.discardMaxCount = 0;
            window.finishHandSelection = null;
            updateCardDetail(null);
            renderHand(); // 通常の状態に戻す
            if (updateBattleUIHook) updateBattleUIHook();
            return result;
        };

        window.finishHandSelection = () => {
            playSound(SOUNDS.seClick);
            const indices = cleanUp();
            resolve(indices);
        };
    });
}/**
 * 召喚時スキル「選択」の選択を待機する
 */
export async function waitSkillChoice(choices, owner, card) {
    if (!choices || choices.length === 0) return null;

    // AIの場合
    if (owner === 'red') {
        const localAiLevel = parseInt(localStorage.getItem('storyDifficulty')) || 2;

        // 1. すでに意思決定時に選択が決定している場合（Normal/Hardのシミュレーション後）
        if (typeof GameState.aiDecision !== 'undefined' && GameState.aiDecision && GameState.aiDecision.choiceIndex !== undefined) {
            const idx = GameState.aiDecision.choiceIndex;
            delete GameState.aiDecision.choiceIndex; // 使い終わったら消去
            return choices[idx];
        }

        // 2. 意思決定時に決定していない場合（Easy or 特殊な呼び出し）
        if (localAiLevel <= 1) {
            // Easy: ランダム
            return choices[Math.floor(Math.random() * choices.length)];
        } else {
            // Normal/Hard: ここで簡易的にシミュレーション
            // 本来は意思決定時に行われるべきだが、フォールバックとして実装
            console.log("AI performing on-the-fly skill choice simulation");
            let bestIdx = 0;
            let bestScore = -Infinity;
            const originalBoard = GameState.enemyBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null);
            const originalPlayerBoard = GameState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null);

            for (let i = 0; i < choices.length; i++) {
                const simState = {
                    playerBoard: originalPlayerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                    enemyBoard: originalBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                    playerHP: GameState.playerHP, enemyHP: GameState.enemyHP, playerSP: GameState.playerSP, enemySP : GameState.enemySP
                };
                // 簡易シミュレーション
                const lane = GameState.enemyBoard.indexOf(card);
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
        if (window.showSkillChoiceModalReact) {
            window.showSkillChoiceModalReact(choices, (selectedSkill) => {
                resolve(selectedSkill);
            });
        } else {
            // フォールバック（通常は発生しない）
            resolve(choices[Math.floor(Math.random() * choices.length)]);
        }
    });
}
export async function discardCard(owner, card, lane) {
    if (card.isToken) return false;
    let skillsToResolve = [];
    if (card.skill && card.skill !== 'none') skillsToResolve.push({ id: card.skill, value: card.skillValue });
    if (Array.isArray(card.skills)) skillsToResolve = skillsToResolve.concat(card.skills);

    for (const sk of skillsToResolve) {
        // 分裂(split)
        if (sk.id === 'split' && lane !== undefined) {
            await triggerSplitSkill(owner, lane, card);
            return true; // 分裂した場合は墓地に行かず場に残る
        }
        // 誘爆(explode)
        if (sk.id === 'explode' && lane !== undefined) {
            await triggerExplodeSkill(owner, lane, card);
        }
    }

    // スキル発動フラグをリセット
    card.skillTriggered = false;
    card.stunTurns = 0;
    card.stunAppliedThisTurn = false;

    // 一時的なスキルの除去（無敵など）
    if (Array.isArray(card.skills)) {
        card.skills = card.skills.filter(sk => sk.id !== 'invincible');
    }
    
    // 変相の復帰処理
    if (card.originalCardId) {
        const originalMaster = CARD_MASTER.find(m => m.id === card.originalCardId);
        if (originalMaster) {
            card.name = originalMaster.name;
            card.power = originalMaster.power || 0;
            card.basePower = originalMaster.power || 0;
            card.currentPower = originalMaster.power || 0;
            card.skill = originalMaster.skill || 'none';
            card.skillValue = originalMaster.skillValue || 0;
            card.skills = originalMaster.skills ? JSON.parse(JSON.stringify(originalMaster.skills)) : [];
            card.choices = originalMaster.choices ? JSON.parse(JSON.stringify(originalMaster.choices)) : [];
            card.rarity = originalMaster.rarity;
            card.imgUrl = originalMaster.imgUrl;
            card.flavor = originalMaster.flavor;
            card.voiceCategory = originalMaster.voiceCategory;
            delete card.originalCardId;
        }
    }

    if ('basePower' in card) { card.power = card.basePower; }
    card.currentPower = card.power;
    (owner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard).push(card);
    updateDeckDisplay(owner);
    return false;
}

export async function triggerSplitSkill(owner, lane, card) {
    const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    const tL = CARD_MASTER.find(m => m.id === 'legs') || { name: '蛸足', power: 1 };
    const val = card.skillValue || 2;

    board[lane] = {
        id: `sp_${Date.now()}_${lane}`,
        owner,
        ...tL,
        imgUrl: 'assets/cards/card_legs.jpg',
        power: val,
        currentPower: val,
        rarity: tL.rarity || 1
    };

    playSound(SOUNDS.sePlace);
    renderBoard();
    const cEl = document.querySelector(`#${owner === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${lane}"] .card`);
    if (cEl) createDamagePopup(cEl, '分裂', '#facc15');
    await sleep(300);
}

export function updateDeckDisplay(owner) {
    // DOMによる deck-info の innerText 上書きは React のツリーを破壊するため削除。
    // 代わりに React 側の再描画フックを呼び出します（PlayerArea / EnemyArea に反映される）
    if (updateBattleUIHook) updateBattleUIHook();
}

export async function cleanupDestroyedCards() {
    let anyDestroyedAtAll = false;
    while (true) {
        let destroyedItems = [];
        [GameState.playerBoard, GameState.enemyBoard].forEach((board, bIdx) => {
            const side = bIdx === 0 ? 'player' : 'enemy';
            for (let i = 0; i < 3; i++) {
                if (board[i] && board[i].currentPower <= 0) {
                    const el = document.querySelector(`#${side}-lanes .cell[data-lane="${i}"] .card`);
                    destroyedItems.push({ board, index: i, el, owner: bIdx === 0 ? 'blue' : 'red', card: board[i] });
                }
            }
        });

        if (destroyedItems.length === 0) break;
        anyDestroyedAtAll = true;

        // 演出: 死亡ボイス再生（揺れよりも先に開始）
        destroyedItems.forEach(item => {
            if (item.card && item.card.voiceCategory) {
                playCardVoice(item.card.voiceCategory, 'death');
            }
        });
        // その後に揺らす
        destroyedItems.forEach(item => {
            if (item.el) {
                requestAnimationFrame(() => {
                    item.el.classList.add('anim-shake');
                });
            }
        });
        playSound(SOUNDS.seDamage);
        await sleep(400);

        // 実際の除去処理
        for (const item of destroyedItems) {
            if (item.board[item.index] !== item.card) continue;
            item.board[item.index] = null;
            await discardCard(item.owner, item.card, item.index);
        }

        playSound(SOUNDS.seDestroy);
        renderBoard();
        await sleep(400); // 連続破壊の際の間隔
    }
    return anyDestroyedAtAll;
}

// 以前の定義を削除
export async function triggerExplodeSkill(owner, lane, card) {
    const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
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
        // renderBoard(); // アニメーションを壊すため避ける
        adj.forEach(j => updateCardPowerOnly(j, side));

        // 描画更新後の新しいDOM要素に対して演出をかける
        adj.forEach(j => {
            const cEl = document.querySelector(`#${side}-lanes .cell[data-lane="${j}"] .card`);
            if (cEl) {
                requestAnimationFrame(() => {
                    cEl.classList.add('anim-shake');
                });
                createDamagePopup(cEl, `誘爆 -${val}`, '#ef4444');
            }
        });

        await sleep(500);
        await cleanupDestroyedCards();
    }
}
export function drawCard(owner) {
    let d = owner === 'blue' ? GameState.playerDeck : GameState.enemyDeck, h = owner === 'blue' ? GameState.playerHand : GameState.enemyHand, ds = owner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;

    // 手札がいっぱいの場合は何もしない
    if (h.length >= 5) {
        updateDeckDisplay(owner);
        return;
    }

    if (d.length === 0 && ds.length > 0) {
        d.push(...ds.sort(() => Math.random() - 0.5));
        ds.length = 0;
        playSound(SOUNDS.seSkill);
        showDeckRefreshEffect(owner);
    }

    if (d.length > 0) h.push(d.pop());

    updateDeckDisplay(owner);
    if (owner === 'blue') renderHand();
}

export async function startTurn(owner) {
    if (GameState.isBattleEnded) return; GameState.isProcessing = true;
    GameState.currentTurn = owner === 'blue' ? 'player' : 'enemy';
    if (updateBattleUIHook) updateBattleUIHook();
    const c = owner === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
    // ターン数のカウント
    GameState.turnCount++;

    // ターン開始時スキルの発動
    await triggerStartTurnSkills(owner);
    if (GameState.isBattleEnded) return;

    // SPの増加（先攻の1ターン目は増えない）
    if (GameState.turnCount > 1) {
        if (c.leaderSkill.cost) {
            if (owner === 'blue') GameState.playerSP = Math.min(c.leaderSkill.cost, GameState.playerSP + 1);
            else GameState.enemySP = Math.min(c.leaderSkill.cost, GameState.enemySP + 1);
        }
        updateSPOrbs(owner);
    }

    if ((owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard).some(x => x !== null)) { await executeCombatPhase(owner); if (checkWinCondition()) return; }

    drawCard(owner);
    if (owner === 'blue') {
        GameState.selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard();
        GameState.isProcessing = false;
        GameState.battlePhase = 'MAIN_ACTION';
    } else { 
        GameState.isProcessing = false; // ★ロックを解除してからキューに積む
        dispatchBattleAction({ type: 'enemyTurn' }); 
    }
}

export async function endPlayerTurn() {
    if (GameState.isProcessing) return;
    // 確認モーダルを表示
    const confirmed = await new Promise(resolve => {
        showConfirmModal(
            'ターンを終了しますか？\nまだカードを使用できます。',
            () => resolve(true),
            () => resolve(false)
        );
    });
    if (!confirmed) return;
    GameState.isProcessing = true;
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
    GameState.selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard();
    dispatchBattleAction({ type: 'endTurn', owner: 'blue' });
}

export async function endTurnLogic(o) {
    // 全ボードの拘束（スタン）状態の更新（ターン終了時に減算）
    [GameState.playerBoard, GameState.enemyBoard].forEach(board => {
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

    if (!GameState.isBattleEnded) {
        renderBoard();
        await startTurn(o === 'blue' ? 'red' : 'blue');
    }
}



export async function playCard(o, hI, l) {
    const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand, b = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    // 上書き配置時の破棄処理
    if (b[l]) {
        if (!(await discardCard(o, b[l], l))) b[l] = null;
    }
    b[l] = h.splice(hI, 1)[0];
    const c = b[l];

    // 配置音とボイスの再生
    playSound(SOUNDS.sePlace);
    if (c.voiceCategory) {
        playCardVoice(c.voiceCategory, 'play');
    }

    if (o === 'blue') { GameState.selectedCardIndex = null; updateCardDetail(null); }
    renderHand(); renderBoard();

    // 出現時スキルの発動（単一または複数）
    if (hasActiveSkill(c)) {
        await sleep(50); // React DOMコミット待機
        await resolveOnPlaySkill(o, l, c);
    }
}

// 判定補助: カードが何らかのアクティブスキルを持っているか
export function hasActiveSkill(c) {
    if (!c) return false;
    return ACTIVE_SKILLS.some(s => hasSkill(c, s));
}

export async function triggerStartTurnSkills(owner) {
    const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    let triggered = false;

    for (let i = 0; i < 3; i++) {
        const tr = await triggerStartTurnPassive(owner, i);
        if (tr) {
            triggered = true;
            if (checkWinCondition()) return;
            updateHPBar();
            await sleep(300);
        }
    }
    if (triggered) {
        renderBoard();
        await sleep(200);
    }
}

/**
 * 先攻・後攻を決定する演出
 */
export async function determineTurnOrder() {
    GameState.isProcessing = true;
    GameState.turnCount = 0;

    if (window.startTurnOrderReact) {
        window.startTurnOrderReact((firstPlayer) => {
            GameState.isProcessing = false;
            startTurn(firstPlayer);
        });
    } else {
        // フォールバック
        GameState.firstPlayer = Math.random() < 0.5 ? 'blue' : 'red';
        GameState.isProcessing = false;
        startTurn(GameState.firstPlayer);
    }
}

export async function resolveOnPlaySkill(o, l, c) {
    const cEl = document.querySelector(`#${o === 'blue' ? 'player' : 'enemy'}-lanes .cell[data-lane="${l}"] .card`);
    if (!cEl) return;

    // 発動対象スキルのリストを作成
    let skillsToResolve = [];
    if (c.skill && c.skill !== 'none') skillsToResolve.push({ id: c.skill, value: c.skillValue });
    if (Array.isArray(c.skills)) skillsToResolve = skillsToResolve.concat(c.skills);

    // スキル定義順に1つずつ処理（quickはゲームバランス上の理由で最後に調整する場合があるが、基本は定義順）
    // ユーザー要求に従い、一旦純粋な定義順（上から順）にするが、quickの特殊性は維持が必要か検討
    skillsToResolve.sort((a, b) => {
        if (a.id === 'quick') return 1;
        if (b.id === 'quick') return -1;
        return 0; // 基本は順番維持
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

export async function executeSingleCombat(atk, l) {
    const aB = atk === 'blue' ? GameState.playerBoard : GameState.enemyBoard, dB = atk === 'blue' ? GameState.enemyBoard : GameState.playerBoard, aR = atk === 'blue' ? '#player-lanes' : '#enemy-lanes', dR = atk === 'blue' ? '#enemy-lanes' : '#player-lanes', an = atk === 'blue' ? 'anim-attack-up' : 'anim-attack-down';
    const aC = aB[l];
    if (!aC || hasSkill(aC, 'defender')) return;
    if (aC.stunTurns > 0) return; // スタン（拘束）中は攻撃しない

    const aE = document.querySelector(`${aR} .cell[data-lane="${l}"] .card`);
    if (!aE) return;

    // 演出: 攻撃アニメーション
    // Safari等での不発を防ぐため、一度ステータスを確定させてから次のフレームでクラスを追加
    aE.classList.remove(an); // 念のため削除
    void aE.offsetHeight;    // 強制リフロー (VOiDで副作用を明示)

    await new Promise(resolve => requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            aE.classList.add(an);
            playSound(SOUNDS.seAttack);
            resolve();
        });
    }));

    await sleep(400); // アニメーション衝突タイミング(0.8sの50%)

    // ロジカルなダメージ処理の前に少し待機して衝撃を表現
    // (この間にDamagePopupが表示されると気持ちいい)


    // --- ロジックの実行 (Engineの呼び出し) ---
    const currentState = {
        playerBoard: GameState.playerBoard, enemyBoard: GameState.enemyBoard,
        playerHP: GameState.playerHP, enemyHP: GameState.enemyHP
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

        // 演出: ダメージ反映のためのピンポイント更新（renderBoardはアニメーションを壊すため避ける）
        updateCardPowerOnly(dLane, atk === 'blue' ? 'enemy' : 'player');
        if (!hasSkill(dB[l], 'defender')) {
            updateCardPowerOnly(aLane, atk === 'blue' ? 'player' : 'enemy');
        }
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
            updateCardPowerOnly(aLane, atk === 'blue' ? 'player' : 'enemy');
            if (aE_new) createDamagePopup(aE_new, `+${val}`, '#4ade80');
            playSound(SOUNDS.seSkill);
        }
        if (aD && !dD && hasSkill(dB[l], 'soul_bind')) {
            const val = getSkillValue(dB[l], 'soul_bind') || 2;
            dB[l].currentPower += val;
            updateCardPowerOnly(dLane, atk === 'blue' ? 'enemy' : 'player');
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
                if (atk === 'blue') { GameState.enemyHP -= pD; createDamagePopup(document.getElementById('enemy-hp-fill'), `-${pD}`); }
                else { GameState.playerHP -= pD; createDamagePopup(document.getElementById('player-hp-fill'), `-${pD}`); }
                updateHPBar(); if (checkWinCondition()) return;
            }
        }
    } else {
        let d = aC.currentPower;
        if (hasSkill(aC, 'double_strike')) d *= 2;
        playSound(SOUNDS.seDamage); document.body.classList.add('anim-shake');
        if (atk === 'blue') { GameState.enemyHP -= d; createDamagePopup(document.getElementById('enemy-hp-fill'), `-${d}`); showSpeechBubble('red'); }
        else { GameState.playerHP -= d; createDamagePopup(document.getElementById('player-hp-fill'), `-${d}`); showSpeechBubble('blue'); }
        updateHPBar(); if (checkWinCondition()) return; await sleep(400); document.body.classList.remove('anim-shake');
    }
    if (aE) aE.classList.remove(an);
    // renderBoard(); // アニメーション消失防止のため、各レーン終了時の全体描画は避ける
}

export async function executeCombatPhase(atk) {
    const b = atk === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    for (let i = 0; i < 3; i++) if (b[i]) {
        await executeSingleCombat(atk, i);
        if (GameState.isBattleEnded) break;
        await sleep(200);
    }
    renderBoard(); // 全ての戦闘終了後に一度だけ整合性を取るために描画
}

export function endBattle() {
    document.body.classList.remove('slow-motion');
    stopAllBGM();
    GameState.lastBattleResult = GameState.playerHP > 0 ? (GameState.enemyHP <= 0 ? 'win' : 'draw') : (GameState.enemyHP > 0 ? 'lose' : 'draw');
    GameState.currentTurn = null;
    if (updateBattleUIHook) updateBattleUIHook();
    GameState.isProcessing = false; // バトル結果表示と同時にフラグをリセット
    setTimeout(() => {
        playSound(SOUNDS.bgmTitle);

        // 防衛戦：報酬も台詞もスキップして戻る
        if (GameState.gameMode === 'defense_attack') {
            if (GameState.lastBattleResult === 'win') {
                // ポイント計算（総ポイント基準）
                const myCurrentPoints = parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
                const myTotalPoints = parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) || myCurrentPoints;
                const enemyTotalPoints = GameState.enemyConfig.total_points || GameState.enemyConfig.points || 0;

                let winPoints = 1;
                if (enemyTotalPoints > myTotalPoints) {
                    if (enemyTotalPoints >= myTotalPoints * 2 && myTotalPoints > 0) {
                        winPoints = 5;
                    } else {
                        winPoints = 3;
                    }
                }

                // UI表示の整合性を優先する場合（もし敵設定に保持されていたらそちらを信頼）
                if (GameState.enemyConfig.calculatedWinPoints) {
                    winPoints = GameState.enemyConfig.calculatedWinPoints;
                }

                const newCurrentPoints = myCurrentPoints + winPoints;
                const newTotalPoints = myTotalPoints + winPoints;

                // ローカルの保存
                localStorage.setItem('mini_card_battle_defense_points', newCurrentPoints);
                localStorage.setItem('mini_card_battle_defense_total_points', newTotalPoints);

                // サーバーへの送信
                const uuid = getOrCreateUUID();
                fetch('api/update_points.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uuid: uuid,
                        points: newCurrentPoints,
                        total_points: newTotalPoints
                    })
                }).catch(err => console.error("Failed to update points:", err));

                playSound(SOUNDS.seSkill);
                showAlertModal(`防衛戦に勝利しました！\n防衛戦ポイントを ${winPoints} Pt 獲得しました！`, () => {
                    showDefenseBattleList();
                });
            } else if (GameState.lastBattleResult === 'lose') {
                // 負けた場合は敵に3ポイントと防衛回数を付与する
                const enemyUuid = GameState.enemyConfig.uuid;
                if (enemyUuid) {
                    fetch('api/update_points.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            uuid: enemyUuid,
                            points: 3,
                            total_points: 3, // 総ポイントも加算
                            increment: true,
                            defense_wins: 1
                        })
                    }).catch(err => console.error("Failed to update enemy points:", err));
                }

                showDefenseBattleList();
            } else {
                showDefenseBattleList();
            }
            return;
        }

        // フリーバトル：勝利時は報酬表示、敗北/引き分けは戻る（台詞はスキップ）
        // フリーバトル：勝利時は報酬表示、敗北/引き分けは戻る
        if (GameState.gameMode === 'free') {
            GameState.appState = 'post_dialogue';
            if (GameState.lastBattleResult === 'win') {
                GameState.dialogueQueue = [
                    { speaker: 'enemy', text: getDialogue(GameState.enemyConfig, GameState.playerConfig, 'lose') },
                    { speaker: 'player', text: getDialogue(GameState.playerConfig, GameState.enemyConfig, 'win') }
                ];
                // 実績: フリーバトル勝利
                if (typeof incrementStat === 'function') {
                    incrementStat('freeBattleWins');
                }
                showCardReward(GameState.enemyConfig.id);
            } else {
                GameState.dialogueQueue = [
                    { speaker: 'player', text: getDialogue(GameState.playerConfig, GameState.enemyConfig, 'lose') },
                    { speaker: 'enemy', text: getDialogue(GameState.enemyConfig, GameState.playerConfig, 'win') }
                ];
                setupDialogueScreen();
            }
            return;
        }

        GameState.appState = 'post_dialogue';
        if (GameState.lastBattleResult === 'win') {
            GameState.dialogueQueue = [{ speaker: 'enemy', text: getDialogue(GameState.enemyConfig, GameState.playerConfig, 'lose') }, { speaker: 'player', text: getDialogue(GameState.playerConfig, GameState.enemyConfig, 'win') }];

            // 実績: ストーリークリア
            if (GameState.gameMode === 'story' && GameState.enemyConfig && GameState.enemyConfig.id === 'satan' && typeof incrementStat === 'function') {
                incrementStat('storyClears', GameState.playerConfig.id);
                if (typeof GameState.aiLevel !== 'undefined' && GameState.aiLevel === 3) {
                    incrementStat('storyClearsHard', GameState.playerConfig.id);
                }
            }

            showCardReward(GameState.enemyConfig.id);
        } else {
            GameState.dialogueQueue = [{ speaker: 'player', text: getDialogue(GameState.playerConfig, GameState.enemyConfig, 'lose') }, { speaker: 'enemy', text: getDialogue(GameState.enemyConfig, GameState.playerConfig, 'win') }];
            setupDialogueScreen();
        }
    }, 1500);
}

export function returnToTitle() {
    showConfirmModal('バトルを諦めてタイトルに戻りますか？', () => {
        // 防衛戦でリタイアした場合も、相手に3ポイントと防衛回数を付与する
        if (GameState.gameMode === 'defense_attack' && typeof GameState.enemyConfig !== 'undefined' && GameState.enemyConfig.uuid) {
            fetch('api/update_points.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uuid: GameState.enemyConfig.uuid,
                    points: 3,
                    total_points: 3, // 総ポイントも加算
                    increment: true,
                    defense_wins: 1
                })
            }).catch(err => console.error("Failed to update enemy points on retire:", err));
        }

        stopAllBGM();
        playSound(SOUNDS.bgmTitle);
        GameState.appState = 'title';
        GameState.isProcessing = false;
        switchScreen('screen-mode-select');
    });
}


import { CARD_MASTER } from '../utils/constants/cards.js';
import { MAX_HP } from '../utils/constants/config.js';
import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { PLAYMAT_MASTER } from '../utils/constants/playmats.js';
import { incrementStat } from '../utils/constants/achievements.js';
import { SKILLS, ACTIVE_SKILLS } from '../utils/constants/skills.js';
import { STAGES } from '../utils/constants/stages.js';
import { playCardVoice } from '../utils/constants/voices.js';
import { createDamagePopup, getDialogue, playSound, stopAllBGM, sleep, switchScreen, hasSkill, getSkillValue, getOrCreateUUID, getSeededRandom, setRNGSeed, shuffleArray } from '../utils/gameUtils.js';
import { setPlayerReadyOnly, clearActionQueueAndRegenerateSeed } from './multiplayer.js';
import { SOUNDS, playSkillSound } from '../utils/sounds.js';
import { executeEnemyAI, evaluateBestLanesForToken } from './ai.js';
import { updateCardDetail, renderHand, updateCardVisuals, removeCardFromBoard, renderBoard, updateCardPowerOnly, showDeckRefreshEffect, showCardReward, updateBattleUIHook } from './uiBattle.js';
import { generateDeck } from './deck.js';
import { applyActiveSkillLogic, calculateCombatPhase, applySingleCombat } from './engine.js';
import { getIsHost, cachedRoomData, sendOnlineAction, listenToRoomActions, stopListeningToRoomActions } from './multiplayer.js';
import { GameState } from './gameState.js';
import { activateLeaderSkill } from './leaderSkills.js';
import { resolveActiveSkillEffect, triggerStartTurnPassive } from './skillLogic.js';
import { playEvents } from './eventRenderer.js';
import { setupDialogueScreen } from './uiDialogue.js';
import { showDefenseBattleList } from './uiMainCore.js';
import { showConfirmModal, showAlertModal } from './uiModals.js';
import { winDungeonBattle, loseDungeonBattle, retireDungeon } from './battleDungeon.js';
import { getDungeonCharacterDialogue } from '../utils/constants/battleDungeonCharacter.js';

export let pendingChoiceResolver = null;

// ==========================================
// イベント駆動型タスクキューエンジン (State Machine Core)
// ==========================================

export async function dispatchBattleAction(action, isRemote = false) {
    if (GameState.gameMode === 'online' && !isRemote) {
        // ローカルのアクションは直接キューに入れず、Firebaseのルームへ送信
        await sendOnlineAction(action);
        return;
    }

    if (action.type === 'submitChoice') {
        // 自分が送信した選択結果の反響(echo)は完全に無視する（自分のローカルはUIのPromiseで既に勝手に解決されているため）
        if (action.owner === 'blue') return;

        // Firebase仕様で空配列[]が送信されないため、undefinedで来た場合は空配列とみなす
        const choiceData = action.choiceData !== undefined ? action.choiceData : [];

        if (pendingChoiceResolver) {
            pendingChoiceResolver(choiceData);
            pendingChoiceResolver = null;
        } else {
            if (!GameState.pendingChoices) GameState.pendingChoices = [];
            GameState.pendingChoices.push(choiceData);
        }
        return; // Do not process via queue, evaluate synchronously
    }

    if (action.type === 'retire') {
        if (action.owner === 'blue') {
            GameState.playerConfig.hp = 0;
            GameState.playerHP = 0;
        } else {
            GameState.enemyConfig.hp = 0;
            GameState.enemyHP = 0;
        }
        playSound(SOUNDS.seDamage);
        if (updateBattleUIHook) updateBattleUIHook();
        checkWinCondition();
        return;
    }

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
        } else if (action.type === 'leaderSkill') {
            await activateLeaderSkill(action.owner);
        } else if (action.type === 'enemyTurn') {
            if (GameState.gameMode !== 'online') {
                await sleep(500);
                await executeEnemyAI();
            }
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
    const isOnline = GameState.gameMode === 'online';
    const sessionId = isOnline ? (GameState.battleSeed || cachedRoomData?.battleSeed || Date.now()) : Date.now();
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
        setRNGSeed(sessionId); // シードを完全に固定して初期化

        if (isOnline) {
            const isHost = getIsHost();
            const hostConfig = isHost ? GameState.playerConfig : GameState.enemyConfig;
            const clientConfig = isHost ? GameState.enemyConfig : GameState.playerConfig;

            // オンライン時はホスト -> クライアントの順でデッキを生成し、乱数消費順を世界共通に固定する
            const hostDeck = generateDeck(isHost ? 'blue' : 'red', hostConfig, sessionId);
            const clientDeck = generateDeck(isHost ? 'red' : 'blue', clientConfig, sessionId);

            GameState.playerDeck = isHost ? hostDeck : clientDeck;
            GameState.enemyDeck = isHost ? clientDeck : hostDeck;

            // アクション受信リスナー起動
            listenToRoomActions((snapshotVal) => {
                const { action, actor } = snapshotVal;
                // 自分自身が出したアクションか判定
                const isMe = (actor === (getIsHost() ? 'host' : 'client'));
                // 送信者は常に自己視点の 'blue' として出しているので、それを変換する
                action.owner = isMe ? 'blue' : 'red';

                dispatchBattleAction(action, true);
            });
        } else {
            GameState.playerDeck = generateDeck('blue', GameState.playerConfig, sessionId);
            GameState.enemyDeck = generateDeck('red', GameState.enemyConfig, sessionId);
        }
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
        let stageId = (GameState.gameMode === 'story') ? (GameState.enemyConfig.stageId || 'android') : (GameState.selectedStageId || 'android');
        if (GameState.gameMode === 'battle_dungeon') {
            stageId = 'dungeon';
        }
        const stageData = STAGES[stageId];

        // BGMの再生
        const bgmKey = (stageData && stageData.bgm) ? stageData.bgm : 'bgmBattle';
        playSound(SOUNDS[bgmKey]);
        GameState.playerMaxHP = MAX_HP;
        GameState.enemyMaxHP = (GameState.gameMode === 'event_satan') ? 100 : (GameState.enemyConfig.hp || (GameState.enemyConfig.id === 'satan' ? 40 : MAX_HP));
        if (GameState.gameMode === 'event_satan') GameState.aiLevel = 3; // 念のため再セット

        if (GameState.gameMode === 'battle_dungeon') {
            // 敵のHPは汎用モンスターのみレアリティで決定。固有キャラの場合は元のHPを優先
            if (GameState.enemyConfig.leaderSkill && GameState.enemyConfig.leaderSkill.action === 'dungeon_summon_leader') {
                const eRarity = GameState.enemyConfig.rarity || 4;
                GameState.enemyMaxHP = eRarity === 1 ? 10 : (eRarity === 2 ? 15 : 20);
            } else {
                GameState.enemyMaxHP = GameState.enemyConfig.hp || 20;
            }

            // リーダースキルのSP要件も、汎用モンスターのみレアリティで決定
            if (GameState.playerConfig && GameState.playerConfig.leaderSkill && GameState.playerConfig.leaderSkill.action === 'dungeon_summon_leader') {
                const pRarity = GameState.playerConfig.rarity || 4;
                GameState.playerConfig = { ...GameState.playerConfig, leaderSkill: { ...GameState.playerConfig.leaderSkill } };
                GameState.playerConfig.leaderSkill.cost = pRarity === 1 ? 3 : (pRarity === 2 ? 4 : 5);
            }
            if (GameState.enemyConfig && GameState.enemyConfig.leaderSkill && GameState.enemyConfig.leaderSkill.action === 'dungeon_summon_leader') {
                const eRarity = GameState.enemyConfig.rarity || 4;
                GameState.enemyConfig = { ...GameState.enemyConfig, leaderSkill: { ...GameState.enemyConfig.leaderSkill } };
                GameState.enemyConfig.leaderSkill.cost = eRarity === 1 ? 3 : (eRarity === 2 ? 4 : 5);
            }

            GameState.playerHP = (typeof GameState.dungeonPlayerHP !== 'undefined') ? GameState.dungeonPlayerHP : GameState.playerMaxHP;
        } else {
            GameState.playerHP = GameState.playerMaxHP;
        }

        GameState.enemyHP = GameState.enemyMaxHP; 
        GameState.playerSP = 0; GameState.enemySP = 0;
        GameState.turnCount = 0; GameState.firstPlayer = 'blue';
        GameState.battlePhase = 'INIT'; GameState.combatStep = 0;
        GameState.playerHand = []; GameState.enemyHand = []; 
        GameState.playerDiscard = []; GameState.enemyDiscard = [];
        GameState.playerBoard = [null, null, null]; GameState.enemyBoard = [null, null, null];
        GameState.actionQueue = []; GameState.pendingChoices = [];
        GameState.isProcessing = false; GameState.isBattleEnded = false; GameState.lastBattleResult = null;
        GameState.selectedCardIndex = null; GameState.selectedBoardLaneIndex = null; GameState.selectedBoardSide = null;
        GameState.aiDecision = null; GameState.extraTurnCount = 0; GameState.attackSkipCount = 0;
        
        // --- モード系フラグの完全リセット ---
        GameState.isPlacementMode = false; GameState.placementCount = 0; GameState.placementToken = null; GameState.placementSelectedLanes = [];
        GameState.isEnemyTargetMode = false; GameState.isAlliedTargetMode = false; GameState.enemyTargetSkillId = null; GameState.targetSelectResolve = null;
        GameState.isDiscardingMode = false; GameState.discardSelectedIndices = []; GameState.discardMaxCount = 0; GameState.isDiscardingExact = false;
        
        // --- グローバルコールバック・リゾルバの確実なリセット ---
        pendingChoiceResolver = null;
        window.finishHandSelection = null;
        window.handlePlacementLaneClick = null; window.finishPlacement = null;
        window.handleEnemyLaneClick = null; window.finishEnemyTargetSelection = null;
        window.handleAlliedLaneClick = null; window.finishAlliedSelection = null;
        updateCardDetail(null);
        if (updateBattleUIHook) updateBattleUIHook();

        // 実績: リーダー使用率のカウント (プレイヤーが選択したキャラ)
        if (typeof incrementStat === 'function' && GameState.playerConfig && GameState.playerConfig.id) {
            incrementStat('leaderUsage', GameState.playerConfig.id, 1);
        }

        // バトル画面への遷移シグナル。ここから先は BattleScreen.jsx に委ねる
        switchScreen('screen-battle');
        
        // 画面切り替えとDOM構成を待機してから戦闘開始処理へ
        setTimeout(() => {
            determineTurnOrder();
        }, 1000);
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
    // ダメージ音は攻撃処理側ですでに鳴っているため、ここでの二重再生は避ける

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
    // 実行直前にもう一度チェック
    if (GameState.isProcessing || GameState.isBattleEnded || GameState.currentTurn !== 'player') {
        return;
    }
    closeSkillConfirm();
    dispatchBattleAction({ type: 'leaderSkill', owner: 'blue' });
}

/**
 * プレイヤーまたはAIに配置レーンを選択させるユーティリティ
 */
export async function waitPlayerLaneSelection(count, owner, tokenCard, isLeaderSkill = false, tokenLanes = null, checkConstraints = true, buttonText = '配置終了') {
    const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    // Check for Remote Choice Wait
    if (GameState.gameMode === 'online' && owner === 'red') {
        return new Promise(resolve => {
            if (GameState.pendingChoices && GameState.pendingChoices.length > 0) resolve(GameState.pendingChoices.shift());
            else pendingChoiceResolver = resolve;
        });
    }

    // AIの場合：
    if (owner === 'red') {
        // すでにシミュレーションで決定された配置があればそれを使う
        const aiLanes = (tokenLanes && tokenLanes.length > 0) ? tokenLanes : (GameState.aiTokenLanes || []);
        if (aiLanes.length > 0) {
            console.log("AI using pre-calculated tokenLanes:", aiLanes);
            return aiLanes.slice(0, count);
        }
        // 無ければ評価を行う（強制使用時など）
        let validEmptyLanes = board.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
        let validOccupiedLanes = [0, 1, 2].filter(i => !validEmptyLanes.includes(i));

        // カード制約の適用
        if (checkConstraints && tokenCard) {
            const hasLegendary = tokenCard.skill === 'legendary' || (tokenCard.skills && tokenCard.skills.some(s => s.id === 'legendary'));
            const hasTakeover = tokenCard.skill === 'takeover' || (tokenCard.skills && tokenCard.skills.some(s => s.id === 'takeover'));

            if (hasLegendary) {
                // 伝説は中央(lane 1)のみ
                validEmptyLanes = validEmptyLanes.filter(i => i === 1);
                validOccupiedLanes = validOccupiedLanes.filter(i => i === 1);
            }
            if (hasTakeover) {
                // 生贄は必ず上書きされる（空きレーンには配置できない）
                validEmptyLanes = [];
            }
        }

        // リーダースキルや通常の召喚スキルで、空きが足りない場合は上書きを許容する
        let selectedLanes = [...validEmptyLanes];

        // 生贄（takeover）等で空きレーンに置けない、あるいは空きスペース以上のcountが要求されている場合、埋まっているレーンから選ぶ
        if (selectedLanes.length < count && validOccupiedLanes.length > 0) {
            // 上書き対象を決める簡易評価（パワーが低い順）
            let occupiedLanes = [...validOccupiedLanes];
            occupiedLanes.sort((a, b) => (board[a]?.currentPower || 0) - (board[b]?.currentPower || 0));
            while (selectedLanes.length < count && occupiedLanes.length > 0) {
                selectedLanes.push(occupiedLanes.shift());
            }
        }

        // 最終的に必要な数に達していなくても、あるだけ返す
        return selectedLanes.slice(0, count);
    }

    // プレイヤーの場合：手動選択
    return new Promise((resolve) => {
        GameState.isPlacementMode = true;
        GameState.placementCount = count;
        GameState.placementToken = tokenCard || null;
        GameState.placementSelectedLanes = [];
        GameState.placementCheckConstraints = checkConstraints;
        GameState.placementButtonText = buttonText;
        updateCardDetail(null);

        const cleanUp = () => {
            GameState.isPlacementMode = false;
            GameState.placementCount = 0;
            GameState.placementToken = null;
            GameState.placementCheckConstraints = true;
            GameState.placementButtonText = '配置終了';
            const result = [...GameState.placementSelectedLanes];
            GameState.placementSelectedLanes = [];
            window.handlePlacementLaneClick = null;
            window.finishPlacement = null;
            updateCardDetail(null);

            if (GameState.gameMode === 'online') {
                // 送信先を同期
                sendOnlineAction({ type: 'submitChoice', owner: 'blue', choiceData: result });
            }

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

            const newCard = GameState.placementToken;
            if (newCard && checkConstraints) {
                if (hasSkill(newCard, 'legendary') && laneIndex !== 1) {
                    playSound(SOUNDS.seDamage);
                    showAlertModal(`「${newCard.name}」は伝説のカードのため、中央のレーンにしか召喚できません。`);
                    return;
                }
                if (hasSkill(newCard, 'takeover') && board[laneIndex] === null) {
                    playSound(SOUNDS.seDamage);
                    showAlertModal(`「${newCard.name}」は生贄のカードのため、既にカードがあるレーンにしか召喚できません。`);
                    return;
                }
            }

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

                // 既存カードを破棄（上書き配置のため破壊効果等は発動させない）
                if (!(await discardCard(owner, board[laneIndex], laneIndex, false))) board[laneIndex] = null;
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

    // ターゲット数以下の場合は全選択
    if (occupiedLanes.length <= count) return occupiedLanes;

    // Check for Remote Choice Wait
    if (GameState.gameMode === 'online' && owner === 'red') {
        return new Promise(resolve => {
            if (GameState.pendingChoices && GameState.pendingChoices.length > 0) resolve(GameState.pendingChoices.shift());
            else pendingChoiceResolver = resolve;
        });
    }

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

    return new Promise((resolve) => {
        GameState.isEnemyTargetMode = true;
        GameState.targetMaxCount = count;
        GameState.targetSelectedLanes = [];
        updateCardDetail(null);

        window.handleEnemyLaneClick = (laneIndex) => {
            if (targetBoard[laneIndex] === null) return;
            playSound(SOUNDS.seClick);

            if (!GameState.targetSelectedLanes.includes(laneIndex)) {
                GameState.targetSelectedLanes.push(laneIndex);
                if (updateBattleUIHook) updateBattleUIHook(); // 選択ハイライト更新

                if (GameState.targetSelectedLanes.length >= count) {
                    setTimeout(() => {
                        window.finishEnemySelection();
                    }, 300);
                }
            }
        };

        window.finishEnemySelection = () => {
            playSound(SOUNDS.seClick);
            GameState.isEnemyTargetMode = false;
            const result = [...GameState.targetSelectedLanes];
            GameState.targetSelectedLanes = [];
            GameState.targetMaxCount = 0;
            window.handleEnemyLaneClick = null;
            window.finishEnemySelection = null;
            updateCardDetail(null);

            if (GameState.gameMode === 'online') {
                sendOnlineAction({ type: 'submitChoice', owner: 'blue', choiceData: result });
            }

            if (updateBattleUIHook) updateBattleUIHook();
            resolve(result);
        };

        if (updateBattleUIHook) updateBattleUIHook();
    });
}

/**
 * 自分の場のカードを選択させるユーティリティ（強化スキル用など）
 */
export async function waitPlayerAlliedLaneSelection(count, owner) {
    const isBlue = owner === 'blue';
    const targetBoard = isBlue ? GameState.playerBoard : GameState.enemyBoard;

    // ターゲット可能なレーン（配置されている場所）を取得
    const occupiedLanes = targetBoard.map((c, i) => c !== null ? i : -1).filter(i => i !== -1);

    if (occupiedLanes.length === 0) return [];

    // ターゲット数以下の場合は全選択
    if (occupiedLanes.length <= count) return occupiedLanes;

    // Check for Remote Choice Wait
    if (GameState.gameMode === 'online' && owner === 'red') {
        return new Promise(resolve => {
            if (GameState.pendingChoices && GameState.pendingChoices.length > 0) resolve(GameState.pendingChoices.shift());
            else pendingChoiceResolver = resolve;
        });
    }

    // AIの場合：パワーが最も高いカード優先
    if (owner === 'red') {
        const sortedLanes = [...occupiedLanes].sort((a, b) => {
            const diff = targetBoard[b].currentPower - targetBoard[a].currentPower;
            if (diff !== 0) return diff;
            return a - b;
        });
        return sortedLanes.slice(0, count);
    }

    return new Promise((resolve) => {
        GameState.isAlliedTargetMode = true;
        GameState.targetMaxCount = count;
        GameState.targetSelectedLanes = [];
        updateCardDetail(null);

        window.handleAlliedLaneClick = (laneIndex) => {
            if (targetBoard[laneIndex] === null) return;
            playSound(SOUNDS.seClick);

            if (!GameState.targetSelectedLanes.includes(laneIndex)) {
                GameState.targetSelectedLanes.push(laneIndex);
                if (updateBattleUIHook) updateBattleUIHook(); // 選択ハイライト更新

                if (GameState.targetSelectedLanes.length >= count) {
                    setTimeout(() => {
                        window.finishAlliedSelection();
                    }, 300);
                }
            }
        };

        window.finishAlliedSelection = () => {
            playSound(SOUNDS.seClick);
            GameState.isAlliedTargetMode = false;
            const result = [...GameState.targetSelectedLanes];
            GameState.targetSelectedLanes = [];
            GameState.targetMaxCount = 0;
            window.handleAlliedLaneClick = null;
            window.finishAlliedSelection = null;
            updateCardDetail(null);

            if (GameState.gameMode === 'online') {
                sendOnlineAction({ type: 'submitChoice', owner: 'blue', choiceData: result });
            }

            if (updateBattleUIHook) updateBattleUIHook();
            resolve(result);
        };

        if (updateBattleUIHook) updateBattleUIHook();
    });
}

/**
 * プレイヤーまたはAIに手札からカードを選択させるユーティリティ（入替スキル用）
 */
export async function waitPlayerHandSelection(count, owner, forceExact = false) {
    const hand = owner === 'blue' ? GameState.playerHand : GameState.enemyHand;
    if (hand.length === 0) return [];

    // Check for Remote Choice Wait
    if (GameState.gameMode === 'online' && owner === 'red') {
        return new Promise(resolve => {
            if (GameState.pendingChoices && GameState.pendingChoices.length > 0) resolve(GameState.pendingChoices.shift());
            else pendingChoiceResolver = resolve;
        });
    }

    // AIの場合：ランダムにカードを選択
    if (owner === 'red') {
        const indices = shuffleArray(hand.map((_, i) => i));
        const selectedCount = Math.min(count, hand.length);
        return indices.slice(0, selectedCount);
    }

    // プレイヤーの場合：手動選択
    return new Promise((resolve) => {
        GameState.discardSelectedIndices = [];

        // 手札入れ替え用のプロンプトを表示
        GameState.isDiscardingMode = true;
        GameState.isDiscardingExact = forceExact;
        GameState.discardMaxCount = count;
        updateCardDetail(null);
        renderHand(); // 描画更新

        const cleanUp = () => {
            GameState.isDiscardingMode = false;
            GameState.isDiscardingExact = false;
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

            if (GameState.gameMode === 'online') {
                sendOnlineAction({ type: 'submitChoice', owner: 'blue', choiceData: indices });
            }

            resolve(indices);
        };
    });
}

/**
 * 墓地から選択する共有ユーティリティ（復活、回収等）
 */
export async function waitPlayerDiscardSelection(validCards, maxPow, owner, title, desc) {
    if (!validCards || validCards.length === 0) return null;

    // Check for Remote Choice Wait
    if (GameState.gameMode === 'online' && owner === 'red') {
        const choiceStr = await new Promise(resolve => {
            if (GameState.pendingChoices && GameState.pendingChoices.length > 0) resolve(GameState.pendingChoices.shift());
            else pendingChoiceResolver = resolve;
        });
        if (!choiceStr || choiceStr === -1) return null;
        // UID優先、なければidで検索して同期ズレを防ぐ
        const matchingCard = validCards.find(c => c.uid === choiceStr || c.id === choiceStr);
        return matchingCard || validCards[0];
    }

    // AIの場合
    if (owner === 'red') {
        const sorted = [...validCards].sort((a, b) => b.power - a.power);
        return sorted[0];
    }

    // プレイヤーの場合
    if (window.showDiscardSelectionModalReact) {
        const card = await new Promise(resolve => {
            window.showDiscardSelectionModalReact(validCards, maxPow, (c) => resolve(c), { title, desc });
        });
        
        if (GameState.gameMode === 'online') {
            const choiceStr = card ? (card.uid || card.id) : null;
            sendOnlineAction({ type: 'submitChoice', owner: 'blue', choiceData: choiceStr });
        }
        return card;
    } else {
        return validCards[0];
    }
}

/**
 * 召喚時スキル「選択」の選択を待機する
 */
export async function waitSkillChoice(choices, owner, card, maxChoices = 1) {
    if (!choices || choices.length === 0) return null;

    // Check for Remote Choice Wait
    if (GameState.gameMode === 'online' && owner === 'red') {
        return new Promise(resolve => {
            if (GameState.pendingChoices && GameState.pendingChoices.length > 0) resolve(GameState.pendingChoices.shift());
            else pendingChoiceResolver = resolve;
        });
    }

    // AIの場合
    if (owner === 'red') {
        const localAiLevel = parseInt(localStorage.getItem('storyDifficulty')) || 2;

        // 1. すでに意思決定時に選択が決定している場合（Normal/Hardのシミュレーション後）
        if (typeof GameState.aiDecision !== 'undefined' && GameState.aiDecision && GameState.aiDecision.choiceIndex !== undefined) {
            const idx = GameState.aiDecision.choiceIndex;
            delete GameState.aiDecision.choiceIndex; // 使い終わったら消去
            const indices = Array.isArray(idx) ? idx : [idx];
            return indices.map(i => choices[i]);
        }

        // 2. 意思決定時に決定していない場合（Easy or 特殊な呼び出し）
        if (localAiLevel <= 1) {
            // Easy: ランダム
            const shuffled = shuffleArray([...choices]);
            return shuffled.slice(0, Math.min(maxChoices, choices.length));
        } else {
            // Normal/Hard: ここで簡易的にシミュレーション
            // 本来は意思決定時に行われるべきだが、フォールバックとして実装
            console.log("AI performing on-the-fly skill choice simulation");
            const scoredChoices = [];
            const originalBoard = GameState.enemyBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null);
            const originalPlayerBoard = GameState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null);

            for (let i = 0; i < choices.length; i++) {
                const simState = {
                    playerBoard: originalPlayerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                    enemyBoard: originalBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
                    playerHP: GameState.playerHP, enemyHP: GameState.enemyHP, playerSP: GameState.playerSP, enemySP: GameState.enemySP
                };
                // 簡易シミュレーション
                const lane = GameState.enemyBoard.indexOf(card);
                let score = -Infinity;
                if (lane !== -1) {
                    applyActiveSkillLogic(simState, 'red', lane, choices[i].id, choices[i].value);
                    calculateCombatPhase(simState, 'blue');
                    // スコア計算
                    score = simState.enemyHP - simState.playerHP;
                    for (let b of simState.enemyBoard) if (b) score += b.currentPower;
                }
                scoredChoices.push({ choice: choices[i], score });
            }
            scoredChoices.sort((a, b) => b.score - a.score);
            return scoredChoices.slice(0, Math.min(maxChoices, choices.length)).map(x => x.choice);
        }
    }

    // プレイヤーの場合
    return new Promise((resolve) => {
        if (window.showSkillChoiceModalReact) {
            window.showSkillChoiceModalReact(choices, (selectedSkill) => {
                if (GameState.gameMode === 'online') {
                    sendOnlineAction({ type: 'submitChoice', owner: 'blue', choiceData: selectedSkill });
                }
                resolve(selectedSkill); // App returns Array here automatically handled in UI
            }, maxChoices);
        } else {
            // フォールバック（通常は発生しない）
            const shuffled = shuffleArray([...choices]);
            resolve(shuffled.slice(0, Math.min(maxChoices, choices.length)));
        }
    });
}
export async function discardCard(owner, card, lane, isDestroyed = true) {
    if (card.isToken) return false;
    let skillsToResolve = [];
    if (card.skill && card.skill !== 'none') skillsToResolve.push({ id: card.skill, value: card.skillValue });
    if (Array.isArray(card.skills)) skillsToResolve = skillsToResolve.concat(card.skills);

    for (const sk of skillsToResolve) {
        if (isDestroyed) {
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

    // マスターデータから完全な初期状態を再構成して墓地へ
    let restoredCard;
    const masterData = CARD_MASTER.find(m => m.id === (card.baseId || card.id));
    if (masterData) {
        restoredCard = JSON.parse(JSON.stringify(masterData));
        restoredCard.uid = card.uid; // IDなどの一意のプロパティは引き継ぐ
        restoredCard.owner = owner;
        restoredCard.baseId = card.baseId || card.id; // 画像URL等の解決に必須
        if (card.isPremium !== undefined) restoredCard.isPremium = card.isPremium;
        restoredCard.basePower = restoredCard.power;
        restoredCard.currentPower = restoredCard.power;
    } else {
        // マスターデータが見つからない場合（特殊トークン等）のフォールバック
        restoredCard = { ...card };
        if ('basePower' in restoredCard) restoredCard.power = restoredCard.basePower;
        restoredCard.currentPower = restoredCard.power;
        restoredCard.skills = []; // 付与されたスキルなどをクリア
    }

    (owner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard).push(restoredCard);
    updateDeckDisplay(owner);
    return false;
}

export async function triggerSplitSkill(owner, lane, card) {
    const board = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    const tokenMap = { 'bird': 'token_ent', 'octopus': 'legs' };
    const testId = card.baseId || card.id;
    const tokenId = tokenMap[testId] || 'legs';
    const tL = CARD_MASTER.find(m => m.id === tokenId) || { name: 'トークン', power: 1 };

    // skillValueが取得できない場合の安全策としてトークンのデフォルトpowerを使用
    let val = card.skillValue;
    if (val === undefined || val === null || isNaN(val)) {
        val = tL.power || 2;
    }

    board[lane] = {
        id: `sp_${Math.floor(Math.random() * 1000000000)}_${lane}`,
        owner,
        ...tL,
        imgUrl: `assets/cards/card_${tokenId}.jpg`,
        power: val,
        currentPower: val,
        basePower: val,
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
                // アニメーションを再トリガーするために一度クラスを外してリフロー
                item.el.classList.remove('anim-shake');
                void item.el.offsetWidth;
                item.el.classList.add('anim-shake');
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
        d.push(...shuffleArray(ds));
        ds.length = 0;
        playSound(SOUNDS.seSkill);
        showDeckRefreshEffect(owner);
    }

    if (d.length > 0) {
        const drawn = d.pop();
        if (drawn.currentPower === undefined || Number.isNaN(drawn.currentPower) || (drawn.currentPower <= 0 && (drawn.power || 0) > 0)) {
            drawn.currentPower = drawn.power || 0;
        }
        h.push(drawn);
    }

    updateDeckDisplay(owner);
    if (owner === 'blue') renderHand();
}

export async function startTurn(owner) {
    if (GameState.isBattleEnded) return; GameState.isProcessing = true;

    // スタン（拘束/待機）状態の更新（そのプレイヤーのターン開始時に減算）
    const myBoard = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    myBoard.forEach(c => {
        if (c && c.stunTurns > 0) {
            c.stunTurns--;
        }
    });

    GameState.currentTurn = owner === 'blue' ? 'player' : 'enemy';
    if (updateBattleUIHook) updateBattleUIHook();
    renderBoard(); // スタン状態の見た目更新のため描画
    await sleep(50); // Reactの再描画(DOM更新)を確実に行わせるための待機時間

    const c = owner === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
    // ターン数のカウント
    GameState.turnCount++;

    // ターン開始時スキルの発動
    await triggerStartTurnSkills(owner);
    if (GameState.isBattleEnded) return;

    // SPの増加（先攻の1ターン目や追加ターン中は増えない）
    if (GameState.turnCount > 1 && GameState.attackSkipCount === 0) {
        if (c.leaderSkill.cost) {
            if (owner === 'blue') GameState.playerSP = Math.min(c.leaderSkill.cost, GameState.playerSP + 1);
            else GameState.enemySP = Math.min(c.leaderSkill.cost, GameState.enemySP + 1);
        }
        updateSPOrbs(owner);
    }

    let skipAttack = false;
    if (GameState.attackSkipCount > 0) {
        skipAttack = true;
        GameState.attackSkipCount--;
    }

    if (skipAttack) {
        // 何もせず攻撃フェーズをスキップ
    } else {
        if ((owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard).some(x => x !== null)) { await executeCombatPhase(owner); if (checkWinCondition()) return; }
    }

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
    document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
    GameState.selectedCardIndex = null; updateCardDetail(null); renderHand(); renderBoard();
    // processActionQueue内でロックするため、ここは解除しておく（または最初からセットしない）
    GameState.isProcessing = false;
    dispatchBattleAction({ type: 'endTurn', owner: 'blue' });
}

export async function endTurnLogic(o) {
    if (!GameState.isBattleEnded) {
        renderBoard();
        let nextOwner = o === 'blue' ? 'red' : 'blue';
        if (GameState.extraTurnCount > 0) {
            GameState.extraTurnCount--;
            nextOwner = o;
        }
        await startTurn(nextOwner);
    }
}



export async function playCard(o, hI, l) {
    const h = o === 'blue' ? GameState.playerHand : GameState.enemyHand, b = o === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    const playingCard = h[hI];
    if (!playingCard) return;

    if (b[l]) {
        if (hasSkill(playingCard, 'equip')) {
            const targetCard = b[l];

            // 装備によるパワー加算
            targetCard.basePower = (targetCard.basePower || 0) + (playingCard.power || 0);
            targetCard.currentPower = (targetCard.currentPower || 0) + (playingCard.power || 0);

            // スキルの統合
            if (!targetCard.skills) {
                targetCard.skills = targetCard.skill !== 'none' ? [{ id: targetCard.skill, value: targetCard.skillValue }] : [];
                targetCard.skill = 'none';
            }

            const equipSkills = [];
            if (playingCard.skill && playingCard.skill !== 'none' && playingCard.skill !== 'equip') {
                equipSkills.push({ id: playingCard.skill, value: playingCard.skillValue });
            }
            if (playingCard.skills) {
                playingCard.skills.forEach(s => {
                    if (s.id !== 'equip') equipSkills.push(s);
                });
            }
            targetCard.skills = targetCard.skills.concat(equipSkills);

            // 手札の装備カードを消費して墓地へ
            const consumedCard = h.splice(hI, 1)[0];
            const discardPile = o === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
            discardPile.push(consumedCard);

            // 配置音・ボイス
            playSound(SOUNDS.sePlace);
            if (playingCard.voiceCategory) {
                playCardVoice(playingCard.voiceCategory, 'play');
            }

            if (o === 'blue') { GameState.selectedCardIndex = null; updateCardDetail(null); }
            renderHand(); renderBoard();

            // 装備カードが持っていたアクティブスキルを即時発動させる
            for (const sk of equipSkills) {
                if (ACTIVE_SKILLS.includes(sk.id)) {
                    await sleep(50);
                    await resolveActiveSkillEffect(o, l, targetCard, sk.id, sk.value);
                }
            }
            
            await sleep(100);
            renderBoard();
            return; // 装備完了
        } else {
            // 通常の上書き配置時の破棄処理（破壊効果は発動させない）
            if (!(await discardCard(o, b[l], l, false))) b[l] = null;
        }
    }
    
    b[l] = h.splice(hI, 1)[0];
    const c = b[l];

    // 旧環境データ由来等のパワー欠落・異常(手札なのに0やNaN)を自動修復
    if (c.currentPower === undefined || Number.isNaN(c.currentPower) || (c.currentPower <= 0 && (c.power || 0) > 0)) {
        c.currentPower = c.power || 0;
        c.basePower = c.power || 0;
    }

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

    // 使い捨てスペル等のパワー0以下のカードは効果解決後に消去する
    const finalCard = b[l];
    if (finalCard && finalCard.currentPower <= 0) {
        const events = [{ type: 'destroy_cards', targets: [{ side: o, lane: l, card: finalCard }] }];
        // 破壊アニメーションと墓地送りを実行
        await playEvents(events);
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

    // ゲーム開始時の初期ドロー（両者4枚ずつ）
    if (GameState.playerHand.length === 0 && GameState.enemyHand.length === 0) {
        for (let i = 0; i < 4; i++) {
            drawCard('blue');
            drawCard('red');
        }
    }

    if (window.startTurnOrderReact) {
        window.startTurnOrderReact((firstPlayer) => {
            GameState.firstPlayer = firstPlayer;
            GameState.isProcessing = false;
            startTurn(firstPlayer);
        });
    } else {
        // フォールバック
        GameState.firstPlayer = getSeededRandom() < 0.5 ? 'blue' : 'red';
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

    // 召喚時に複数のスキルがある場合は、特定のスキル（quickやchoice等）を後回しにするなどして安全な順序で処理する
    skillsToResolve.sort((a, b) => {
        const order = { 'quick': 100, 'choice': 90 }; // 数値が大きいほど後回し
        const orderA = order[a.id] || 0;
        const orderB = order[b.id] || 0;
        return orderA - orderB;
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
    // quick スキル等での単発攻撃に対応するための簡易ラッパー
    const state = {
        playerBoard: GameState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
        enemyBoard: GameState.enemyBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
        playerHP: GameState.playerHP, enemyHP: GameState.enemyHP,
        playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
        enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
        playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
        enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard))
    };

    // 特定のレーンだけ発火させるための個別処理
    const events = [];
    applySingleCombat(state, atk, l, events);


    // UI/演出の実行（イベントログ内で状態も同期更新される）
    await playEvents(events);
    checkWinCondition();
}

export async function executeCombatPhase(atk) {
    // 盤面に攻撃可能なカードが1枚もなければ何もしない
    const b = atk === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    if (!b.some(x => x !== null)) return;

    // --- ロジックの実行 (Engineの呼び出し) ---
    const currentState = {
        playerBoard: GameState.playerBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
        enemyBoard: GameState.enemyBoard.map(c => c ? JSON.parse(JSON.stringify(c)) : null),
        playerHP: GameState.playerHP, enemyHP: GameState.enemyHP,
        playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
        enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
        playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard)),
        enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard))
    };

    // Engineで全レーンの戦闘結果をシミュレートし、イベントログを受け取る
    const events = calculateCombatPhase(currentState, atk, []);

    // --- UI/演出の実行 (Rendererの呼び出し) ---
    // 蓄積されたイベントを順番に再生（攻撃モーション、ダメージポップアップ、破壊音など）
    // イベント再生中にGameStateも連動して更新される
    await playEvents(events);

    // 整合性を取るために最終的な盤面状態を描画
    renderBoard();

    // 勝敗判定
    checkWinCondition();
}

export function endBattle() {
    document.body.classList.remove('slow-motion');
    stopAllBGM();
    GameState.lastBattleResult = GameState.playerHP > 0 ? (GameState.enemyHP <= 0 ? 'win' : 'draw') : (GameState.enemyHP > 0 ? 'lose' : 'draw');
    GameState.currentTurn = null;
    if (updateBattleUIHook) updateBattleUIHook();
    GameState.isProcessing = false; // バトル結果表示と同時にフラグをリセット

    if (GameState.gameMode === 'online') {
        setPlayerReadyOnly(false);
        if (getIsHost()) {
            clearActionQueueAndRegenerateSeed();
        }
    }

    // 全モード共通：実績用の勝利カウントアップ
    if (GameState.lastBattleResult === 'win' && typeof incrementStat === 'function') {
        incrementStat('freeBattleWins');
    }

    setTimeout(() => {
        if (GameState.gameMode === 'battle_dungeon') {
            playSound(SOUNDS.bgmChallenge);
        } else if (GameState.gameMode === 'defense_attack') {
            playSound(SOUNDS.bgmDefense);
        } else if (GameState.gameMode === 'high_difficulty') {
            playSound(SOUNDS.bgmHighDifficulty);
        } else {
            playSound(SOUNDS.bgmTitle);
        }

        GameState.appState = 'post_dialogue'; // 全モード共通の設定

        // 勝敗に応じたダイアログのセット (全モード共通)
        if (GameState.lastBattleResult === 'win') {
            GameState.dialogueQueue = [
                { speaker: 'enemy', text: getDialogue(GameState.enemyConfig, GameState.playerConfig, 'lose') },
                { speaker: 'player', text: getDialogue(GameState.playerConfig, GameState.enemyConfig, 'win') }
            ];
        } else {
            GameState.dialogueQueue = [
                { speaker: 'player', text: getDialogue(GameState.playerConfig, GameState.enemyConfig, 'lose') },
                { speaker: 'enemy', text: getDialogue(GameState.enemyConfig, GameState.playerConfig, 'win') }
            ];
        }

        if (GameState.gameMode === 'battle_dungeon') {
            const dialogueData = getDungeonCharacterDialogue(GameState.enemyConfig.id);
            let endText = GameState.lastBattleResult === 'win' ?
                (dialogueData.dialogue?.lose?.default || '') :
                (dialogueData.dialogue?.win?.default || '');

            GameState.dialogueQueue = [
                { speaker: 'enemy', text: endText }
            ];
            setupDialogueScreen();
            return;
        }

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

                // 自身が攻撃して勝利した場合も実績「防衛戦勝利数」としてカウントする
                if (typeof incrementStat === 'function') {
                    incrementStat('defenseAttackWins');
                }

                // ポイント獲得のアラートを出してから、会話へ進む
                playSound(SOUNDS.seSkill);
                showAlertModal(`防衛戦に勝利しました！\n防衛戦ポイントを ${winPoints} Pt 獲得しました！`, () => {
                    setupDialogueScreen();
                });
                return;
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

        // --- 防衛戦以外（フリー、ストーリー、高難易度など）の処理 ---
        if (GameState.lastBattleResult === 'win' && GameState.gameMode !== 'online') {
            // 実績の加算処理
            if (GameState.gameMode === 'story' && GameState.enemyConfig && GameState.enemyConfig.id === 'satan' && typeof incrementStat === 'function') {
                incrementStat('storyClears', GameState.playerConfig.id);
                if (typeof GameState.aiLevel !== 'undefined' && GameState.aiLevel === 3) {
                    incrementStat('storyClearsHard', GameState.playerConfig.id);
                }
            }
            if (GameState.gameMode === 'event_satan' && typeof incrementStat === 'function') {
                incrementStat('eventClear', 'satan_high');
            }

            // --- カードドロップ抽選・表示処理 ---
            let recipeId = GameState.enemyConfig.id;
            if (GameState.gameMode === 'event_satan' && recipeId === 'satan') recipeId = 'satan_high';

            const diffKey = GameState.aiLevel === 1 ? 'easy' : (GameState.aiLevel === 3 ? 'hard' : 'normal');

            let deckList = [];
            if (Array.isArray(ENEMY_DECKS[recipeId])) {
                deckList = ENEMY_DECKS[recipeId];
            } else if (ENEMY_DECKS[recipeId] && ENEMY_DECKS[recipeId][diffKey]) {
                deckList = ENEMY_DECKS[recipeId][diffKey];
            } else if (ENEMY_DECKS[recipeId] && ENEMY_DECKS[recipeId]['normal']) {
                deckList = ENEMY_DECKS[recipeId]['normal'];
            }

            if (deckList.length > 0) {
                const uniqueCards = [...new Set(deckList)];
                // 所持数が4枚未満（4枚以上持っていない）カードのみを抽出
                const availableCards = uniqueCards.filter(cid => {
                    const count = GameState.playerInventory[cid] || 0;
                    return count < 4;
                });

                if (availableCards.length > 0) {
                    const rewardCardId = availableCards[Math.floor(getSeededRandom() * availableCards.length)];
                    if (window.showCardRewardReact) {
                        window.showCardRewardReact(rewardCardId);
                    }
                    return; // 報酬画面が表示されたらここで一旦終了（OK押下後に setupDialogueScreen が呼ばれる）
                }
            }
        }

        // ドロップがない、全所持、または敗北/引き分けの場合はそのまま会話画面へ
        setupDialogueScreen();
    }, 1500);
}

export function returnToTitle() {
    showConfirmModal('バトルを諦めますか？', () => {
        dispatchBattleAction({ type: 'retire', owner: 'blue' });
    });
}

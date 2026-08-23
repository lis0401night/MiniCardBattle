/**
 * バトル初期化モジュール
 * バトルの準備、ステートの初期化、プリセット適用、ターンの開始決定などを担当する。
 */
import { generateDeck } from '../../services/deck.js';
import {
  cachedRoomData,
  getIsHost,
  listenToRoomActions,
  multiplayerCallbacks,
} from '../../services/multiplayer.js';
import {
  renderBoard,
  renderHand,
  updateBattleUIHook,
  updateCardDetail,
  updateDeckDisplay,
  updateHPBar,
  updateSPOrbs,
} from '../../services/uiBattle.js';
import { showOnlineLobby } from '../../services/uiMainCore.js';
import { showAlertModal } from '../../services/uiModals.js';
import { GameState } from '../../state/gameState.js';
import { incrementStat } from '../../utils/constants/achievements.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../../utils/constants/characters.js';
import {
  AI_THINKING_DURATION,
  BATTLE_ASSET_LOAD_TIMEOUT_MS,
  BATTLE_SCREEN_READY_TIMEOUT_MS,
  INITIAL_DRAW_COUNT,
  MAX_HP,
  PLACE_ANIMATION_DURATION,
  PREPARE_BATTLE_LOCK_TIMEOUT_MS,
  TURN_ORDER_START_DELAY_MS,
  appendVersionQuery,
} from '../../utils/constants/config.js';
import {
  CHAR_FORTUNE_HANDICAPS,
  HANDICAP_TYPES,
} from '../../utils/constants/fortuneHandicaps.js';
import { LEADER_SKILLS } from '../../utils/constants/leaderSkills.js';
import {
  STAGES,
  resolveBattleStageId,
  getStageImgUrl,
} from '../../utils/constants/stages.js';
import { getPlaymatImgUrl } from '../../utils/constants/playmats.js';
import { toDeckObjects } from '../../utils/deckUtils.js';
import {
  checkIsFreeMode,
  checkIsStoryMode,
  checkIsTutorialMode,
  decodedBgms,
  getCardImgUrl,
  getOrCreateUUID,
  getSeededRandom,
  hasPremiumVariant,
  hasSkill,
  playSound,
  setRNGSeed,
  shuffleArray,
  sleep,
  stopAllBGM,
  switchScreen,
} from '../../utils/gameUtils.js';
import {
  getAllVfxImageUrls,
  getLeaderPreloadUrls,
} from '../../utils/resourceLoader.js';
import {
  AUDIO_INSTANCES,
  loadAndDecodeAudio,
  registerDecodedBgm,
  SOUNDS,
} from '../../utils/sounds.js';
import { loadAllVoices } from '../../utils/constants/voices.js';
import { isTutorialMode, runTutorialFlow } from '../tutorialEngine.js';
import { drawCard, playCard } from './battleCombat.js';
import {
  dispatchBattleAction,
  resetQueueProcessing,
  setPendingChoiceResolver,
} from './battleQueue.js';
import { checkWinCondition } from './battleResult.js';
import { waitPlayerHandSelection } from './battleSelection.js';
import { endTurnLogic, startTurn } from './battleTurn.js';
import { battleEvents } from './events/battleEventEmitter.js';
import { BATTLE_PHASE } from './phases/phaseTypes.js';

/** リーダー固有の最大HP定義。未定義のキャラクターは MAX_HP を使用する */
const LEADER_MAX_HP_OVERRIDES = {
  satan: 40,
  void: 30,
  succubus: 30,
  warlock: 30,
};

/**
 * 対戦準備中（裏でアセットロード中）の画面操作遮断（連打防止）状態を制御する。
 *
 * @function setBattlePreparingLock
 * @param {boolean} isPreparing - 対戦準備中（ロック状態）にするかどうか
 * @returns {void}
 */
function setBattlePreparingLock(isPreparing) {
  if (typeof document !== 'undefined' && document.body) {
    if (isPreparing) {
      document.body.classList.add('is-preparing-battle');
    } else {
      document.body.classList.remove('is-preparing-battle');
    }
  }
}

/**
 * マッチング画面（VS演出画面）で使用する必須画像アセット（立ち絵・枠・VSロゴ・背景等）を
 * 画面表示前に100%事前ロード完了させるヘルパー関数。
 *
 * @function preloadMatchingAssets
 * @param {Function} onComplete - 全マッチング用画像が読み込み完了した際に呼ばれるコールバック
 * @returns {void}
 */
function preloadMatchingAssets(onComplete) {
  const playerSkin = GameState.playerSkins?.[GameState.playerConfig?.id];
  const enemySkin = GameState.enemySkins?.[GameState.enemyConfig?.id];

  const playerLeaderUrls = getLeaderPreloadUrls(
    GameState.playerConfig,
    playerSkin
  );
  const enemyLeaderUrls = getLeaderPreloadUrls(
    GameState.enemyConfig,
    enemySkin
  );

  const matchingAssetUrls = Array.from(
    new Set([
      ...playerLeaderUrls,
      ...enemyLeaderUrls,
      appendVersionQuery('assets/ui/vs_logo.png'),
      appendVersionQuery('assets/ui/chara_frame.png'),
    ])
  );

  if (matchingAssetUrls.length === 0) {
    if (onComplete) onComplete();
    return;
  }

  let loadedCount = 0;
  let isDone = false;

  const checkDone = () => {
    if (isDone) return;
    loadedCount++;
    if (loadedCount >= matchingAssetUrls.length) {
      isDone = true;
      if (onComplete) onComplete();
    }
  };

  // 読み込み遅延時のセーフティタイムアウト (最大1500msで強制進行)
  const safetyTimeout = setTimeout(() => {
    if (!isDone) {
      isDone = true;
      if (onComplete) onComplete();
    }
  }, 1500);

  matchingAssetUrls.forEach((url) => {
    const img = new Image();
    img.onload = () => {
      clearTimeout(safetyTimeout);
      checkDone();
    };
    img.onerror = () => {
      clearTimeout(safetyTimeout);
      checkDone();
    };
    img.src = url;
  });
}

/** バトル準備の連打防止・二重呼び出しローディングロックフラグ */
let isBattleLoading = false;

/** prepareBattle の呼び出し世代管理カウンター（競合制御用） */
let prepareBattleGeneration = 0;

/**
 * 現在のゲームモードから、使用するステージIDとBGMキーを決定する。
 * プリロード処理とBGM再生処理の両方が同じ結果を使うように一元化する（DRY徹底）。
 * @returns {{ stageId: string, bgmKey: string }} ステージIDとBGMキー
 */
function resolveStageAndBgm() {
  const stageId = resolveBattleStageId();
  const stageData = STAGES[stageId];
  let bgmKey = stageData && stageData.bgm ? stageData.bgm : 'bgmBattle';
  if (GameState.gameMode === 'story' && GameState.enemyConfig?.id === 'satan') {
    bgmKey = 'bgmLastBattle';
  } else if (
    GameState.gameMode?.startsWith('event_') &&
    GameState.gameMode?.endsWith('_high')
  ) {
    bgmKey = 'bgmStageHighDifficulty';
  }

  return { stageId, bgmKey };
}

/**
 * 指定した対戦者のConfigへ、選択中スキンの画像・敗北画像・アイコンを適用する。
 * @param {object} config - GameState.playerConfig または GameState.enemyConfig
 * @param {object} skinMap - GameState.playerSkins または GameState.enemySkins
 */
function applySkinToConfig(config, skinMap) {
  if (!config || !skinMap || !skinMap[config.id]) return;
  if (typeof getSkinImage !== 'function') return;

  const selSkin = skinMap[config.id];
  const charObj = CHARACTERS[config.id] || config;
  config.image = getSkinImage(charObj, selSkin, 'image') || charObj.image;
  config.imageLose =
    getSkinImage(charObj, selSkin, 'imageLose') ||
    charObj.imageLose ||
    charObj.image;
  config.icon = getSkinImage(charObj, selSkin, 'icon') || charObj.icon;
}

/**
 * 現在のゲームモードに応じて、プレイヤーと敵のスキンを同期する。
 * フリーバトル・ストーリー・チュートリアルは標準キャラクター画像を使うため、敵スキンを適用しない。
 */
function syncConfigSkins() {
  if (checkIsTutorialMode()) return;
  applySkinToConfig(GameState.playerConfig, GameState.playerSkins);
  if (checkIsStoryMode() || checkIsFreeMode()) return;
  applySkinToConfig(GameState.enemyConfig, GameState.enemySkins);
}

// ==========================================
// バトル進行とスキルロジック
// ==========================================

/**
 * 新しい対戦の準備に入る直前に、前戦の残像（盤面・手札・HP・墓地等）が露出するのを防ぐため
 * GameState の対戦パラメータを事前にクリーン初期化する。
 *
 * @function clearBattleStateData
 * @returns {void}
 */
export function clearBattleStateData() {
  GameState.isInitializing = true;
  GameState.playerBoard = [null, null, null];
  GameState.enemyBoard = [null, null, null];
  GameState.playerHand = [];
  GameState.enemyHand = [];
  GameState.playerDiscard = [];
  GameState.enemyDiscard = [];
  GameState.playerSealedLanes = [0, 0, 0];
  GameState.enemySealedLanes = [0, 0, 0];
  GameState.actionQueue = [];
  GameState.pendingChoices = [];
  GameState.isProcessing = false;
  GameState.isBattleEnded = false;
}

/**
 * バトルの準備（アセットのプリロード、デッキ/スキル設定、初期化スクリプトの実行）を行う。
 * 連打による二重呼び出しを防止する。
 */
export function prepareBattle() {
  // ローディング画面連打による二重呼び出し防止および操作遮断ガード適用
  if (isBattleLoading) return;
  isBattleLoading = true;
  setBattlePreparingLock(true);

  // 【前戦データクリア】新対戦に入る直前に前戦の盤面・手札データをクリーンリセット
  clearBattleStateData();

  const currentGeneration = ++prepareBattleGeneration;
  const isCurrentPreparation = () =>
    currentGeneration === prepareBattleGeneration;

  // 想定外の例外等で initBattleState へ到達しなかった場合でも、一定時間後にロックを解除してデッドロックを防ぐ
  setTimeout(() => {
    if (isBattleLoading && isCurrentPreparation()) {
      console.warn(
        'prepareBattle: セーフティタイマーによりローディングロックを解除します'
      );
      isBattleLoading = false;
      setBattlePreparingLock(false);
    }
  }, PREPARE_BATTLE_LOCK_TIMEOUT_MS);

  // 0. 最新のスキン情報でConfigを同期（対戦相手のスキンなどが確実に反映されるようにする）
  syncConfigSkins();

  // 1. 以前のBGMを強制停止
  stopAllBGM();

  // 2. 裏でアセット読み込みと対戦状態の構築を進行させる
  const startLoadingAndBattle = (onLoadComplete) => {
    const isOnline = GameState.gameMode === 'online';
    const sessionId = isOnline
      ? GameState.battleSeed || cachedRoomData?.battleSeed || Date.now()
      : Date.now();
    let isFinished = false;

    // プレイマットは loadDeck() 時にデッキ固有のものが GameState.selectedPlaymatId に設定済みなのを使用する

    try {
      setRNGSeed(sessionId); // シードを完全に固定して初期化

      if (isOnline) {
        const isHost = getIsHost();
        const hostConfig = isHost
          ? GameState.playerConfig
          : GameState.enemyConfig;
        const clientConfig = isHost
          ? GameState.enemyConfig
          : GameState.playerConfig;

        // オンライン時はホスト -> クライアントの順で客観的ロール名（'host'/'client'）をキーにしてデッキを生成し、UIDとIDの決定論的一致を保証する。
        const hostDeck = generateDeck('host', hostConfig, sessionId);
        const clientDeck = generateDeck('client', clientConfig, sessionId);

        // 生成完了後、各カードのownerプロパティをそれぞれのプレイヤー視点（自分='blue'、相手='red'）に補正して適用する
        hostDeck.forEach((c) => {
          c.owner = isHost ? 'blue' : 'red';
        });
        clientDeck.forEach((c) => {
          c.owner = isHost ? 'red' : 'blue';
        });

        GameState.playerDeck = isHost ? hostDeck : clientDeck;
        GameState.enemyDeck = isHost ? clientDeck : hostDeck;

        // アクション受信リスナー起動
        listenToRoomActions((snapshotVal) => {
          const { action, actor } = snapshotVal;
          // 自分自身が出したアクションか判定
          const isMe = actor === (getIsHost() ? 'host' : 'client');
          // 送信者は常に自己視点の 'blue' として出しているので、それを変換する
          action.owner = isMe ? 'blue' : 'red';

          dispatchBattleAction(action, true);
        });

        // ホスト側：クライアントが切断して status が waiting に戻った（または client が消去された）場合の検知
        if (isHost) {
          multiplayerCallbacks.onRoomUpdated = (data) => {
            if (!data || GameState.isBattleEnded) return;

            if (!data.client || data.status === 'waiting') {
              GameState.isBattleEnded = true;
              if (typeof window.setSlowMotionReact === 'function') {
                window.setSlowMotionReact(false);
              }
              stopAllBGM();

              if (typeof showAlertModal === 'function') {
                showAlertModal('接続が切れました。', () => {
                  if (typeof showOnlineLobby === 'function') {
                    showOnlineLobby();
                  } else {
                    switchScreen('screen-online-lobby');
                  }
                });
              } else {
                if (typeof showOnlineLobby === 'function') {
                  showOnlineLobby();
                } else {
                  switchScreen('screen-online-lobby');
                }
              }
            }
          };
        }
      } else {
        GameState.playerDeck = generateDeck(
          'blue',
          GameState.playerConfig,
          sessionId
        );
        GameState.enemyDeck = generateDeck(
          'red',
          GameState.enemyConfig,
          sessionId
        );
      }
    } catch (e) {
      console.error('Deck generation error:', e);
      // エラー時も空のデッキで続行を試みる（フリーズ回避）
      GameState.playerDeck = GameState.playerDeck || [];
      GameState.enemyDeck = GameState.enemyDeck || [];
    }

    // バトル開始時点のプレイヤー使用デッキのスナップショットを保存（防衛履歴送信などの正確性向上）
    // ※ 例外発生時でも前戦の古いスナップショットが残留せず、常に最新または適切な状態へ更新されるように try-catch 外で実行
    const snapshotSource =
      Array.isArray(GameState.playerDeckSelection) &&
      GameState.playerDeckSelection.length > 0
        ? GameState.playerDeckSelection
        : GameState.playerDeck;

    GameState.battleStartPlayerDeckObjects =
      Array.isArray(snapshotSource) && snapshotSource.length > 0
        ? toDeckObjects(snapshotSource, GameState.premiumCards)
        : null;

    // 対戦で使用される初期デッキのカードに加え、スキルやリーダースキルで生成される全トークンカードも事前ロード対象に含める
    const tokenCards = CARD_MASTER.filter(
      (c) => c.isToken || (c.id && c.id.startsWith('token_'))
    );
    const allCards = [
      ...GameState.playerDeck,
      ...GameState.enemyDeck,
      ...tokenCards,
    ];
    const cardUrls = [];
    allCards.forEach((c) => {
      if (!c) return;
      // フルサイズ画像および盤面表示用サムネイル画像の両方を事前ロード対象に確実に追加
      const fullUrl = getCardImgUrl(c, false);
      const thumbUrl = getCardImgUrl(c, true);
      if (fullUrl) cardUrls.push(fullUrl);
      if (thumbUrl) cardUrls.push(thumbUrl);
      if (c.imgUrl) cardUrls.push(c.imgUrl);

      const lookupId = c.baseId || c.id;
      // プレミアム版が存在するカードについては、設定や同期状況に関わらず通常版・プレミアム版双方の画像URL（フル＆サムネ）を事前ロード対象に追加
      if (hasPremiumVariant(lookupId)) {
        const premThumb = getCardImgUrl({ ...c, isPremium: true }, true);
        const premFull = getCardImgUrl({ ...c, isPremium: true }, false);
        const normThumb = getCardImgUrl({ ...c, isPremium: false }, true);
        const normFull = getCardImgUrl({ ...c, isPremium: false }, false);
        if (premThumb) cardUrls.push(premThumb);
        if (premFull) cardUrls.push(premFull);
        if (normThumb) cardUrls.push(normThumb);
        if (normFull) cardUrls.push(normFull);
      }
    });

    // 対戦で使用する自プレイヤーおよび敵リーダーのカットイン・立ち絵・スキン画像
    const playerSkin = GameState.playerSkins?.[GameState.playerConfig?.id];
    const enemySkin = GameState.enemySkins?.[GameState.enemyConfig?.id];
    const playerLeaderUrls = getLeaderPreloadUrls(
      GameState.playerConfig,
      playerSkin
    );
    const enemyLeaderUrls = getLeaderPreloadUrls(
      GameState.enemyConfig,
      enemySkin
    );

    // 全VFX演出画像（スキル演出、カットイン、ジョーカー演出等）
    const vfxUrls = getAllVfxImageUrls();

    // 対戦で使用するステージ背景画像（フルサイズ）
    const battleStageId = resolveBattleStageId();
    const stageImageUrl = getStageImgUrl(battleStageId, false);
    const stageUrls = stageImageUrl ? [stageImageUrl] : [];

    // 対戦で使用する自プレイヤーおよび敵のプレイマット画像（フルサイズ）
    const playmatUrls = [];
    const playerPlaymatId =
      GameState.selectedPlaymatId || GameState.playerConfig?.playmat;
    if (playerPlaymatId) {
      const playerPmUrl = getPlaymatImgUrl(playerPlaymatId, false);
      if (playerPmUrl) playmatUrls.push(playerPmUrl);
    }
    const enemyPlaymatId = GameState.enemyConfig?.playmat;
    if (enemyPlaymatId) {
      const enemyPmUrl = getPlaymatImgUrl(enemyPlaymatId, false);
      if (enemyPmUrl) playmatUrls.push(enemyPmUrl);
    }

    // 重複を排除した対戦用全画像アセットURL配列
    const battleImageUrls = Array.from(
      new Set([
        ...cardUrls,
        ...playerLeaderUrls,
        ...enemyLeaderUrls,
        ...vfxUrls,
        ...stageUrls,
        ...playmatUrls,
      ])
    );

    let loaded = 0;
    let bgmLoaded = false;
    let cardsLoaded = false;

    const finishLoading = () => {
      if (!isCurrentPreparation() || isFinished) return;
      // 両方のロードが完了するまで進めない
      if (!bgmLoaded || !cardsLoaded) return;

      isFinished = true;
      if (onLoadComplete) {
        onLoadComplete();
      } else {
        setTimeout(() => {
          if (isCurrentPreparation()) {
            initBattleState();
          }
        }, 500);
      }
    };

    // セーフティタイムアウト: 設定時間（15秒）経過したら強制的に開始
    setTimeout(() => {
      if (isCurrentPreparation() && !isFinished) {
        console.warn('Battle loading timed out. Forcing start...');
        bgmLoaded = true;
        cardsLoaded = true;
        finishLoading();
      }
    }, BATTLE_ASSET_LOAD_TIMEOUT_MS);

    const updateProgress = () => {
      if (!isCurrentPreparation() || isFinished) return;
      loaded++;
      const progressText = `Loading Battle Assets... ${Math.floor(
        (loaded / Math.max(1, battleImageUrls.length)) * 100
      )}%`;
      if (window.updateLoadingTextReact) {
        window.updateLoadingTextReact(progressText);
      }
      if (loaded >= battleImageUrls.length) {
        cardsLoaded = true;
        finishLoading();
      }
    };

    // --- カードボイスの事前デコード（バルトアンデルス等の変身スキルに対応するため全ボイスを展開。4並列制限でスパイクを防止） ---
    loadAllVoices().catch((e) => {
      console.warn('Failed to preload battle voices:', e);
    });

    // --- BGMのロードとデコード処理 ---
    const { bgmKey } = resolveStageAndBgm();

    const bgmAudio = AUDIO_INSTANCES[bgmKey];
    if (bgmAudio && bgmAudio.src) {
      let fetchUrl = bgmAudio.src;
      if (fetchUrl.includes('assets/audio/bgm/')) {
        fetchUrl = fetchUrl.substring(fetchUrl.indexOf('assets/audio/bgm/'));
      }

      if (!decodedBgms[fetchUrl]) {
        if (window.updateLoadingTextReact) {
          window.updateLoadingTextReact('Loading Stage BGM...');
        }
        loadAndDecodeAudio(fetchUrl)
          .then((buffer) => {
            if (!isCurrentPreparation()) return;
            if (buffer) {
              registerDecodedBgm(fetchUrl, buffer);
            }
            bgmLoaded = true;
            finishLoading();
          })
          .catch((e) => {
            if (!isCurrentPreparation()) return;
            console.warn('Failed to preload battle BGM:', e);
            bgmLoaded = true; // エラー時も進行を止めない
            finishLoading();
          });
      } else {
        registerDecodedBgm(fetchUrl, decodedBgms[fetchUrl]);
        bgmLoaded = true;
        finishLoading();
      }
    } else {
      bgmLoaded = true;
      finishLoading();
    }

    if (battleImageUrls.length === 0) {
      cardsLoaded = true;
      finishLoading();
      return;
    }

    // デコード済みHTMLImageElementを対戦中保持する配列を初期化（GCによるテクスチャ解放を防止）
    GameState.battleImageCache = [];

    // iOS (WebKit) の瞬間メモリスパイクを防止するため、画像の同時デコード数を制限する
    const IMG_CONCURRENCY_LIMIT = 4;
    let imgIndex = 0;
    const loadNextImage = async () => {
      if (imgIndex >= battleImageUrls.length) return;
      const url = battleImageUrls[imgIndex++];
      const img = new Image();
      img.src = url;
      if (GameState.battleImageCache) {
        GameState.battleImageCache.push(img);
      }

      try {
        // img.decode() でGPU/メモリへのピクセル展開（デコード）を確実に完了させる
        if (typeof img.decode === 'function') {
          await img.decode();
        } else {
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }
      } catch {
        // 画像破損やデコード失敗時も対戦進行をブロックしない
      } finally {
        updateProgress();
        loadNextImage();
      }
    };
    for (
      let i = 0;
      i < Math.min(IMG_CONCURRENCY_LIMIT, battleImageUrls.length);
      i++
    ) {
      loadNextImage();
    }
  };

  if (typeof window.showMatchingScreen === 'function') {
    if (!isCurrentPreparation()) return;

    // アセットロード完了をPromiseで通知する（レース条件防止）
    // Promiseはresolve済みでも.then()が確実に実行されるため、
    // MatchingScreenのマウントタイミングに依存しない安全な設計となる。
    let resolveLoading;
    const loadingPromise = new Promise((r) => {
      resolveLoading = r;
    });

    // マッチング画面に必要な必須アセット（立ち絵・枠・ロゴ）を事前に100%ロード完了させてからマッチング画面を表示する
    preloadMatchingAssets(() => {
      if (!isCurrentPreparation()) return;

      window.showMatchingScreen(() => {
        if (isCurrentPreparation()) {
          initBattleState();
        }
      }, loadingPromise);
    });

    // 裏側で対戦用の全アセット読み込み（カード20枚・VFX・BGM等）を開始
    startLoadingAndBattle(() => {
      if (!isCurrentPreparation()) return;
      // アセットロード完了をPromise経由でMatchingScreenへ通知
      resolveLoading();
    });
  } else {
    // マッチング画面がない場合はロード完了後すぐに initBattleState を実行して対戦画面へ遷移
    startLoadingAndBattle(() => {
      if (isCurrentPreparation()) {
        initBattleState();
      }
    });
  }
}

/**
 * バトル状態の初期化を行う関数。
 *
 * 【主な機能・目的】
 * - ゲーム開始・リトライ・コンティニュー時に、GameStateの各種パラメータ（HP、SP、手札、墓地、レーン状態等）をクリア・初期化する。
 * - 事前に生成した GameState.playerDeck と GameState.enemyDeck は保持する。
 * - BGMの再生制御、スキン画像の再適用、各ゲームモード（ストーリー、高難易度、運命の邂逅、トーナメント等）固有のHP/スキル補正を行う。
 * - 「運命の邂逅」モードでは、コンティニュー時に特級目標のハンディキャップ（SP増減等）が二重適用・累積計算されないよう、
 *   未加工のベースリーダースキルからクリーンに1回だけハンディキャップを計算・適用する。
 *
 * @function initBattleState
 * @returns {void}
 */
export function initBattleState() {
  // バトル準備フラグおよび操作遮断ロックをリセット（次回のprepareBattle呼び出しを許可）
  isBattleLoading = false;
  setBattlePreparingLock(false);
  GameState.isInitializing = true;

  try {
    // 全てのBGMを停止
    stopAllBGM();

    // ステージ情報とBGMの再生
    const { bgmKey } = resolveStageAndBgm();
    playSound(SOUNDS[bgmKey]);

    // 既存のplayerConfig/enemyConfigをベースキャラクター定義からディープコピーして初期化する（コンティニュー時の二重適用バグ対策）
    if (
      GameState.playerConfig &&
      GameState.playerConfig.id &&
      CHARACTERS[GameState.playerConfig.id]
    ) {
      // 各モード固有のカスタム設定（闘技祭での学園名、宮殿でのHP/スキル、オンラインのプレイマットなど）を退避
      const savedPlayerProps = {
        name: GameState.playerConfig.name,
        hp: GameState.playerConfig.hp,
        leaderSkill: GameState.playerConfig.leaderSkill,
        playmat: GameState.playerConfig.playmat,
      };

      GameState.playerConfig = JSON.parse(
        JSON.stringify(CHARACTERS[GameState.playerConfig.id])
      );

      // 退避した情報を復元
      Object.assign(GameState.playerConfig, savedPlayerProps);
    }
    if (
      GameState.enemyConfig &&
      GameState.enemyConfig.id &&
      CHARACTERS[GameState.enemyConfig.id]
    ) {
      // 各モード固有のカスタム設定（高難易度のHP/スキル/リーダースキル、防衛戦情報、影戦フラグ、闘技祭での学園名など）を退避
      const savedEnemyProps = {
        name: GameState.enemyConfig.name,
        hp: GameState.enemyConfig.hp,
        leaderSkill: GameState.enemyConfig.leaderSkill,
        isShadow: GameState.enemyConfig.isShadow,
        playmat: GameState.enemyConfig.playmat,
        playerName: GameState.enemyConfig.playerName,
        uuid: GameState.enemyConfig.uuid,
        points: GameState.enemyConfig.points,
        total_points: GameState.enemyConfig.total_points,
        calculatedWinPoints: GameState.enemyConfig.calculatedWinPoints,
      };

      GameState.enemyConfig = JSON.parse(
        JSON.stringify(CHARACTERS[GameState.enemyConfig.id])
      );

      // 退避した情報を復元
      Object.assign(GameState.enemyConfig, savedEnemyProps);
    }

    // --- JSON.stringifyによる初期化リセット後のスキン再適用（一瞬初期スキン画像に戻るチラつきを防止） ---
    // ※チュートリアルモードでは常にデフォルトスキンを使用するためスキン再適用をスキップする
    if (
      !checkIsTutorialMode() &&
      GameState.playerConfig &&
      GameState.playerSkins &&
      GameState.playerSkins[GameState.playerConfig.id]
    ) {
      const selSkin = GameState.playerSkins[GameState.playerConfig.id];
      const charObj =
        CHARACTERS[GameState.playerConfig.id] || GameState.playerConfig;
      if (typeof getSkinImage === 'function') {
        GameState.playerConfig.image =
          getSkinImage(charObj, selSkin, 'image') || charObj.image;
        GameState.playerConfig.imageLose =
          getSkinImage(charObj, selSkin, 'imageLose') ||
          charObj.imageLose ||
          charObj.image;
        GameState.playerConfig.icon =
          getSkinImage(charObj, selSkin, 'icon') || charObj.icon;
      }
    }
    // フリーバトル・ストーリー・チュートリアルは標準キャラクター画像を使用するため敵スキン自動同期を適用しない
    if (
      !checkIsTutorialMode() &&
      !checkIsStoryMode() &&
      !checkIsFreeMode() &&
      GameState.enemyConfig &&
      GameState.enemySkins &&
      GameState.enemySkins[GameState.enemyConfig.id]
    ) {
      const selSkin = GameState.enemySkins[GameState.enemyConfig.id];
      const charObj =
        CHARACTERS[GameState.enemyConfig.id] || GameState.enemyConfig;
      if (typeof getSkinImage === 'function') {
        GameState.enemyConfig.image =
          getSkinImage(charObj, selSkin, 'image') || charObj.image;
        GameState.enemyConfig.imageLose =
          getSkinImage(charObj, selSkin, 'imageLose') ||
          charObj.imageLose ||
          charObj.image;
        GameState.enemyConfig.icon =
          getSkinImage(charObj, selSkin, 'icon') || charObj.icon;
      }
    }

    let fortuneHPPlayerMod = 0;
    let fortuneHPEnemyMod = 0;

    const isFortuneMode =
      GameState.gameMode?.startsWith('event_') &&
      GameState.gameMode?.endsWith('_fortune');

    if (isFortuneMode && GameState.fortuneHandicaps) {
      const enemyCharId = GameState.gameMode
        .replace('event_', '')
        .replace('_fortune', '');
      const handicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];

      // 【コンティニュー時等のSP累積加減算バグ対策】
      // savedPlayerProps/savedEnemyPropsの復元により、過去に特級目標で補正された状態のleaderSkillが退避・復元されている場合がある。
      // 二重計算（累積減算・加算）を防ぐため、ハンディキャップ計算直前にマスターデータから未補正のベース定義をクリーンに復元する。
      if (
        GameState.playerConfig &&
        GameState.playerConfig.id &&
        CHARACTERS[GameState.playerConfig.id]?.leaderSkill
      ) {
        GameState.playerConfig.leaderSkill = JSON.parse(
          JSON.stringify(CHARACTERS[GameState.playerConfig.id].leaderSkill)
        );
      }
      if (
        GameState.enemyConfig &&
        GameState.enemyConfig.id &&
        CHARACTERS[GameState.enemyConfig.id]?.leaderSkill
      ) {
        GameState.enemyConfig.leaderSkill = JSON.parse(
          JSON.stringify(CHARACTERS[GameState.enemyConfig.id].leaderSkill)
        );
      }

      // 1. 最優先でリーダースキル変更を適用
      handicapsList.forEach((h) => {
        if (!GameState.fortuneHandicaps[h.id]) return;

        if (h.type === HANDICAP_TYPES.ENEMY_LEADER_SKILL_CHANGE) {
          if (GameState.enemyConfig.id === 'automata') {
            GameState.enemyConfig = {
              ...GameState.enemyConfig,
              // マスターデータを単一の情報源とし、定義の二重管理を避ける
              leaderSkill: { ...LEADER_SKILLS.last_battalion },
            };
          } else if (GameState.enemyConfig.id === 'valkyria') {
            GameState.enemyConfig = {
              ...GameState.enemyConfig,
              // マスターデータを単一の情報源とし、定義の二重管理を避ける
              leaderSkill: { ...LEADER_SKILLS.ragnarok },
            };
          }
        }
      });

      // 2. その他の変更（SP・HP等）を適用
      handicapsList.forEach((h) => {
        if (!GameState.fortuneHandicaps[h.id]) return;

        if (h.type === HANDICAP_TYPES.PLAYER_HP) {
          fortuneHPPlayerMod += h.value;
        } else if (h.type === HANDICAP_TYPES.ENEMY_HP) {
          fortuneHPEnemyMod += h.value;
        } else if (h.type === HANDICAP_TYPES.PLAYER_SP) {
          if (GameState.playerConfig.leaderSkill) {
            const nextCost = GameState.playerConfig.leaderSkill.cost + h.value;
            GameState.playerConfig = {
              ...GameState.playerConfig,
              leaderSkill: {
                ...GameState.playerConfig.leaderSkill,
                cost: nextCost,
                desc: GameState.playerConfig.leaderSkill.desc?.replace(
                  /\(SP:\d+\)/,
                  `(SP:${nextCost})`
                ),
              },
            };
          }
        } else if (h.type === HANDICAP_TYPES.ENEMY_SP) {
          if (GameState.enemyConfig.leaderSkill) {
            const nextCost = Math.max(
              1,
              GameState.enemyConfig.leaderSkill.cost + h.value
            );
            GameState.enemyConfig = {
              ...GameState.enemyConfig,
              leaderSkill: {
                ...GameState.enemyConfig.leaderSkill,
                cost: nextCost,
                desc: GameState.enemyConfig.leaderSkill.desc?.replace(
                  /\(SP:\d+\)/,
                  `(SP:${nextCost})`
                ),
              },
            };
          }
        }
      });
    }

    GameState.playerMaxHP = MAX_HP + fortuneHPPlayerMod;
    // 敵の最大HPは、個別設定 > リーダー固有定義 > 既定値 の優先順位で決定する
    const configuredEnemyHP = GameState.enemyConfig?.hp;
    const enemyBaseHP =
      typeof configuredEnemyHP === 'number' && configuredEnemyHP > 0
        ? configuredEnemyHP
        : LEADER_MAX_HP_OVERRIDES[GameState.enemyConfig?.id] || MAX_HP;
    GameState.enemyMaxHP = enemyBaseHP + fortuneHPEnemyMod;

    if (
      GameState.gameMode?.startsWith('event_') &&
      GameState.gameMode?.endsWith('_high')
    )
      GameState.aiLevel = 3; // 念のため再セット

    if (GameState.gameMode === 'battle_dungeon') {
      // 敵のHPは汎用モンスターのみレアリティで決定。固有キャラの場合は元のHPを優先
      if (
        GameState.enemyConfig.leaderSkill &&
        GameState.enemyConfig.leaderSkill.action === 'dungeon_summon_leader'
      ) {
        const eRarity = GameState.enemyConfig.rarity || 4;
        GameState.enemyMaxHP = eRarity === 1 ? 10 : eRarity === 2 ? 15 : 20;
      } else {
        GameState.enemyMaxHP = GameState.enemyConfig.hp || 20;
      }

      // リーダースキルのSP要件も、汎用モンスターのみレアリティで決定（一律4ターン＝SP:4に固定）
      if (
        GameState.playerConfig &&
        GameState.playerConfig.leaderSkill &&
        GameState.playerConfig.leaderSkill.action === 'dungeon_summon_leader'
      ) {
        GameState.playerConfig = {
          ...GameState.playerConfig,
          leaderSkill: { ...GameState.playerConfig.leaderSkill },
        };
        GameState.playerConfig.leaderSkill.cost = 4;
        if (GameState.playerConfig.leaderSkill.desc) {
          GameState.playerConfig.leaderSkill.desc =
            GameState.playerConfig.leaderSkill.desc.replace(
              /\(SP:\d+\)/,
              '(SP:4)'
            );
        }
      }
      if (
        GameState.enemyConfig &&
        GameState.enemyConfig.leaderSkill &&
        GameState.enemyConfig.leaderSkill.action === 'dungeon_summon_leader'
      ) {
        GameState.enemyConfig = {
          ...GameState.enemyConfig,
          leaderSkill: { ...GameState.enemyConfig.leaderSkill },
        };
        GameState.enemyConfig.leaderSkill.cost = 4;
        if (GameState.enemyConfig.leaderSkill.desc) {
          GameState.enemyConfig.leaderSkill.desc =
            GameState.enemyConfig.leaderSkill.desc.replace(
              /\(SP:\d+\)/,
              '(SP:4)'
            );
        }
      }

      GameState.playerHP =
        typeof GameState.dungeonPlayerHP !== 'undefined'
          ? GameState.dungeonPlayerHP
          : GameState.playerMaxHP;
    } else {
      GameState.playerHP = GameState.playerMaxHP;
    }

    GameState.enemyHP = GameState.enemyMaxHP;
    GameState.playerSP = 0;
    GameState.enemySP = 0;
    GameState.turnCount = 0;
    GameState.firstPlayer = 'blue';
    GameState.battlePhase = BATTLE_PHASE.INIT;
    GameState.turnSubPhase = null;
    GameState.combatStep = 0;
    GameState.playerHand = [];
    GameState.enemyHand = [];
    GameState.playerDiscard = [];
    GameState.enemyDiscard = [];
    GameState.initialPlayerDeckCount = GameState.playerDeck.length;
    GameState.initialEnemyDeckCount = GameState.enemyDeck.length;
    GameState.playerBoard = [null, null, null];
    GameState.enemyBoard = [null, null, null];

    // 運命の邂逅ハンディキャップ：敵陣への初期カード配置
    if (isFortuneMode && GameState.fortuneHandicaps) {
      const enemyCharId = GameState.gameMode
        .replace('event_', '')
        .replace('_fortune', '');
      const handicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];

      const spawnRules = handicapsList.filter(
        (h) =>
          h.type === HANDICAP_TYPES.SPAWN_ENEMY &&
          GameState.fortuneHandicaps[h.id]
      );

      spawnRules.forEach((rule) => {
        const template = CARD_MASTER.find((c) => c.id === rule.cardId);
        if (template) {
          GameState.enemyBoard[rule.lane] = {
            id: template.id,
            baseId: template.id,
            name: template.name,
            power: template.power,
            basePower: template.power,
            currentPower: template.power,
            skills: Array.isArray(template.skills)
              ? template.skills.map((s) => ({ ...s }))
              : [],
            owner: 'red',
            uid: getOrCreateUUID(null),
            isToken: true, // 破壊された場合に墓地には送られないトークン扱い
            cantAttackTurns: 2, // 初回ターン攻撃禁止（攻撃不能効果。ターン開始時の減衰を考慮して2を設定）
          };
        }
      });
    }
    GameState.missionProgress = {
      damage_5_single: false,
      sacrifice_count: 0,
      power_10: false,
    };
    GameState.playerSealedLanes = [0, 0, 0];
    GameState.enemySealedLanes = [0, 0, 0];
    GameState.actionQueue = [];
    GameState.pendingChoices = [];
    resetQueueProcessing();
    GameState.isProcessing = false;
    GameState.isBattleEnded = false;
    GameState.lastBattleResult = null;
    GameState.selectedCardIndex = null;
    GameState.selectedBoardLaneIndex = null;
    GameState.selectedBoardSide = null;
    GameState.aiDecision = null;
    GameState.currentTurn = null;
    GameState.extraTurnCount = 0;
    GameState.attackSkipCount = 0;

    // --- モード系フラグの完全リセット ---
    GameState.isPlacementMode = false;
    GameState.placementCount = 0;
    GameState.placementToken = null;
    GameState.placementSelectedLanes = [];
    GameState.isEnemyTargetMode = false;
    GameState.isAlliedTargetMode = false;
    GameState.enemyTargetSkillId = null;
    GameState.targetSelectResolve = null;
    GameState.isDiscardingMode = false;
    GameState.discardSelectedIndices = [];
    GameState.discardMaxCount = 0;
    GameState.isDiscardingExact = false;

    // --- グローバルコールバック・リゾルバの確実なリセット ---
    setPendingChoiceResolver(null);
    // 前回バトルの残留リスナー（リタイア・切断・例外で cleanUp に到達しなかった分）を一括解除する
    battleEvents.clearAll();
    window.finishHandSelection = null;
    window.handlePlacementLaneClick = null;
    window.finishPlacement = null;
    window.handleEnemyLaneClick = null;
    window.finishEnemyTargetSelection = null;
    window.handleAlliedLaneClick = null;
    window.finishAlliedSelection = null;
    updateCardDetail(null);
    if (updateBattleUIHook) updateBattleUIHook();

    // 実績: リーダー使用率のカウント (プレイヤーが選択したキャラ)
    if (
      typeof incrementStat === 'function' &&
      GameState.playerConfig &&
      GameState.playerConfig.id &&
      GameState.gameMode !== 'practice' &&
      GameState.gameMode !== 'tutorial'
    ) {
      incrementStat('leaderUsage', GameState.playerConfig.id, 1);
    }

    // バトル画面への遷移シグナル。ここから先は BattleScreen.jsx に委ねる
    switchScreen('screen-battle');

    // セーフティタイムアウト（万が一マウントが完全に失敗した場合のフリーズ防止用保険）
    const safetyTimeout = setTimeout(() => {
      if (window.onBattleScreenReady) {
        console.warn('BattleScreen ready timed out. Forcing start...');
        window.onBattleScreenReady();
      }
    }, BATTLE_SCREEN_READY_TIMEOUT_MS);

    // React側のマウント完了コールバックを待つ
    window.onBattleScreenReady = () => {
      clearTimeout(safetyTimeout);
      window.onBattleScreenReady = null;

      // 演出が唐突に始まらないよう、マウント完了から TURN_ORDER_START_DELAY_MS 待って開始する
      setTimeout(() => {
        determineTurnOrder();
      }, TURN_ORDER_START_DELAY_MS);
    };
  } catch (e) {
    console.error('Critical error in initBattleState:', e);
    showAlertModal(
      'バトルの初期化中にエラーが発生しました。タイトルに戻ります。',
      () => {
        location.reload();
      }
    );
  }
}

/**
 * プリセット用のカードIDからマスタデータを検索し、対戦者・インデックス情報が付与されたカードオブジェクトを生成する。
 * @param {string} cardId - 生成対象のカードID
 * @param {string} owner - 所有者 ('blue' | 'red')
 * @param {number} index - インデックス番号
 * @returns {object|null} 生成されたカードオブジェクト（マスタが存在しない場合はnull）
 */
function resolvePresetCard(cardId, owner, index) {
  const master = CARD_MASTER.find((m) => m.id === cardId);
  if (!master) {
    console.warn(`[BattlePreset] カードID "${cardId}" が見つかりません`);
    return null;
  }
  const card = {
    ...master,
    baseId: master.id,
    id: `${owner}_preset_${index}`,
    owner: owner,
    power: master.power,
    basePower: master.power,
    currentPower: master.power,
    skills: master.skills ? master.skills.map((s) => ({ ...s })) : undefined,
    choices: master.choices ? master.choices.map((c) => ({ ...c })) : undefined,
    choices2: master.choices2
      ? master.choices2.map((c) => ({ ...c }))
      : undefined,
    uid: `${owner}_preset_${Date.now()}_${index}`,
  };
  card.imgUrl = getCardImgUrl(card);
  return card;
}

/**
 * 【デバッグ・チュートリアル用】バトル状態プリセットを適用する
 * プリセットオブジェクトの各フィールド（省略可能）に基づき、GameStateを上書きする。
 * @param {object} preset - プリセットデータ（詳細はdebug_state_plan.mdを参照）
 */
function applyBattlePreset(preset) {
  if (!preset) return;
  console.log('[BattlePreset] プリセットを適用中...', preset);

  // カードID配列からカードオブジェクト配列を生成するヘルパー
  let cardCounter = 0;
  const resolveCards = (cardIds, owner) => {
    if (!Array.isArray(cardIds)) return null;
    return cardIds
      .map((id) => resolvePresetCard(id, owner, cardCounter++))
      .filter(Boolean);
  };

  // --- HP ---
  if (preset.playerHP !== undefined) GameState.playerHP = preset.playerHP;
  if (preset.enemyHP !== undefined) GameState.enemyHP = preset.enemyHP;

  // --- SP ---
  if (preset.playerSP !== undefined) GameState.playerSP = preset.playerSP;
  if (preset.enemySP !== undefined) GameState.enemySP = preset.enemySP;

  // --- ターン数 ---
  if (preset.turnCount !== undefined) GameState.turnCount = preset.turnCount;

  // --- 手札 ---
  if (preset.playerHand) {
    const cards = resolveCards(preset.playerHand, 'blue');
    if (cards) GameState.playerHand = cards;
  }
  if (preset.enemyHand) {
    const cards = resolveCards(preset.enemyHand, 'red');
    if (cards) GameState.enemyHand = cards;
  }

  // --- 山札（指定された場合のみ完全入れ替え。配列の先頭がデッキトップ）---
  if (preset.playerDeck) {
    const cards = resolveCards(preset.playerDeck, 'blue');
    if (cards) GameState.playerDeck = cards.reverse();
  }
  if (preset.enemyDeck) {
    const cards = resolveCards(preset.enemyDeck, 'red');
    if (cards) GameState.enemyDeck = cards.reverse();
  }

  // --- 墓地 ---
  if (preset.playerDiscard) {
    const cards = resolveCards(preset.playerDiscard, 'blue');
    if (cards) GameState.playerDiscard = cards;
  }
  if (preset.enemyDiscard) {
    const cards = resolveCards(preset.enemyDiscard, 'red');
    if (cards) GameState.enemyDiscard = cards;
  }

  // --- 場（3レーン。null = 空きレーン、文字列ID または {id, imgUrl?, ...} オブジェクト）---
  const resolveBoardEntry = (entry, owner) => {
    if (!entry) return null;
    // オブジェクト形式: {id: 'card_id', imgUrl?: '...'} で画像等を上書き可能
    const cardId = typeof entry === 'string' ? entry : entry.id;
    const overrides = typeof entry === 'object' ? entry : {};
    const card = resolvePresetCard(cardId, owner, cardCounter++);
    if (card) {
      card.skillTriggered = true;
      card.stunTurns = 0;
      card.stunAppliedThisTurn = false;
      // オブジェクト形式で指定された追加プロパティを上書き
      if (overrides.imgUrl) card.imgUrl = overrides.imgUrl;
      if (overrides.power !== undefined) {
        card.power = overrides.power;
        card.basePower = overrides.power;
        card.currentPower = overrides.power;
      }
      if (overrides.name) card.name = overrides.name;
    }
    return card;
  };
  if (preset.playerBoard) {
    GameState.playerBoard = preset.playerBoard.map((e) =>
      resolveBoardEntry(e, 'blue')
    );
  }
  if (preset.enemyBoard) {
    GameState.enemyBoard = preset.enemyBoard.map((e) =>
      resolveBoardEntry(e, 'red')
    );
  }

  // --- 封印レーン ---
  if (preset.playerSealedLanes) {
    GameState.playerSealedLanes = [...preset.playerSealedLanes];
  }
  if (preset.enemySealedLanes) {
    GameState.enemySealedLanes = [...preset.enemySealedLanes];
  }

  // デッキ残数表示を更新
  updateDeckDisplay('blue');
  updateDeckDisplay('red');

  console.log('[BattlePreset] プリセット適用完了');
}

/**
 * チュートリアル用: 敵のスクリプト行動
 * ターン数に応じて事前定義されたカードを出す
 */
export async function executeTutorialEnemyTurn() {
  // チュートリアルIDに応じた敵行動スクリプト
  const tutorialId = GameState.tutorial?.id || 'basic_rules';

  const enemyHandIndex = 0; // 常に手札の先頭を使用

  if (GameState.enemyHand.length > 0 && tutorialId !== 'leader_oni') {
    const card = GameState.enemyHand[0];
    let targetLane = 1; // デフォルトは中央

    if (tutorialId === 'basic_rules') {
      // 基本ルール: 鉄亀→左、ゴブリン→中央
      if (card.id === 'tortoise' || card.baseId === 'tortoise') {
        targetLane = 0;
      } else if (card.id === 'goblin' || card.baseId === 'goblin') {
        targetLane = 1;
      }
    } else if (tutorialId === 'leader_dragon') {
      // イグニス: ゴーレムを右に配置
      targetLane = 2;
    } else if (tutorialId === 'leader_knight') {
      // セレスティア: ゴーレムを中央に配置
      targetLane = 1;
    } else if (tutorialId === 'leader_devilhunter') {
      // マリア: ゴーレムを左に配置
      targetLane = 0;
    } else if (tutorialId === 'leader_witch') {
      // クロエ: ゴーレムを中央に配置
      targetLane = 1;
    } else if (tutorialId === 'leader_priest') {
      // ネフティ: ゴーレムを左に配置
      targetLane = 0;
    }

    await playCard('red', enemyHandIndex, targetLane);
    if (checkWinCondition()) return;
    GameState.selectedCardIndex = null;
    await sleep(PLACE_ANIMATION_DURATION);
  }

  await endTurnLogic('red');
}

/**
 * 先攻・後攻を決定する演出
 */
export async function determineTurnOrder() {
  GameState.isProcessing = true;
  GameState.isInitializing = true;
  GameState.turnCount = 0;

  // ゲーム開始時の初期ドロー（両者指定枚数分）
  if (GameState.playerHand.length === 0 && GameState.enemyHand.length === 0) {
    for (let i = 0; i < INITIAL_DRAW_COUNT; i++) {
      drawCard('blue');
      drawCard('red');
    }
  }

  // プリセットが設定されている場合、状態を上書きしてマリガン・先攻決定をスキップ
  if (GameState.battlePreset) {
    const preset = GameState.battlePreset;
    applyBattlePreset(preset);
    GameState.battlePreset = null; // 適用後にクリア（リトライ時の二重適用を防止）
    GameState.firstPlayer =
      preset.firstPlayer || (getSeededRandom() < 0.5 ? 'blue' : 'red');
    GameState.isInitializing = false;
    GameState.isProcessing = false;
    GameState.battlePhase = BATTLE_PHASE.BATTLE;
    renderBoard();
    renderHand();
    updateHPBar();
    updateSPOrbs();
    // BattleScreen側のisInitializingをfalseにする（TurnOrderOverlayをスキップするため）
    if (window.onBattlePresetReady) window.onBattlePresetReady();
    await sleep(PLACE_ANIMATION_DURATION);
    await startTurn(GameState.firstPlayer);
    // チュートリアルモードの場合、最初のターン処理完了後にフローを開始
    if (GameState.gameMode === 'tutorial' && isTutorialMode()) {
      runTutorialFlow();
    }
    return;
  }

  // 先攻後攻の判定
  let isFirst = false;
  if (GameState.gameMode === 'online') {
    const hostGoesFirst = getSeededRandom() < 0.5;
    const iAmHost = getIsHost();
    isFirst = (hostGoesFirst && iAmHost) || (!hostGoesFirst && !iAmHost);
  } else {
    isFirst = getSeededRandom() < 0.5;
  }
  GameState.firstPlayer = isFirst ? 'blue' : 'red';

  window.finishTurnOrder = () => {
    window.finishTurnOrder = null;
    GameState.isInitializing = false;
    GameState.isProcessing = false;
    startMulliganPhase();
  };

  if (window.startTurnOrderReact) {
    window.startTurnOrderReact(GameState.firstPlayer);
  } else {
    window.finishTurnOrder();
  }
}

/**
 * マリガン（初期手札の引き直し）フェイズを開始する。
 * プレイヤーおよびAI/オンライン相手の手札引き直し選択を待機し、ドロー・手札更新を行う。
 */
export async function startMulliganPhase() {
  GameState.battlePhase = BATTLE_PHASE.MULLIGAN;
  GameState.placementMessage = null;
  if (updateBattleUIHook) updateBattleUIHook();

  const orderPrefix = GameState.firstPlayer === 'blue' ? '先攻：' : '後攻：';
  let playerPromise = waitPlayerHandSelection(
    INITIAL_DRAW_COUNT,
    'blue',
    false,
    `${orderPrefix}引き直すカードを${INITIAL_DRAW_COUNT}枚まで選んでください`
  );
  let enemyPromise;

  if (GameState.gameMode === 'online') {
    enemyPromise = waitPlayerHandSelection(INITIAL_DRAW_COUNT, 'red', false);
  } else {
    enemyPromise = new Promise((resolve) => {
      let aiIndices = [];
      const aiHand = GameState.enemyHand;
      const allTakeover =
        aiHand.length > 0 && aiHand.every((card) => hasSkill(card, 'takeover'));
      if (allTakeover) {
        aiIndices = aiHand.map((_, i) => i);
      }
      resolve(aiIndices);
    });
  }

  const [playerMulliganIndices, enemyMulliganIndices] = await Promise.all([
    playerPromise,
    enemyPromise,
  ]);

  const processMulligan = (owner, indices) => {
    if (!indices || indices.length === 0) return;
    const hand = owner === 'blue' ? GameState.playerHand : GameState.enemyHand;
    const deck = owner === 'blue' ? GameState.playerDeck : GameState.enemyDeck;

    // 降順にソートして削除
    const sortedIndices = [...indices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      const card = hand.splice(idx, 1)[0];
      deck.push(card);
    }

    // デッキをシャッフル
    if (owner === 'blue') {
      GameState.playerDeck = shuffleArray(deck);
    } else {
      GameState.enemyDeck = shuffleArray(deck);
    }

    // 戻した枚数だけドロー
    for (let i = 0; i < indices.length; i++) {
      drawCard(owner);
    }
  };

  // 乱数消費順の整合はオンライン対戦でのみ必要。
  // オフラインは常に blue → red の固定順で処理し、シードによる再現性を保証する。
  const processRedFirst = GameState.gameMode === 'online' && !getIsHost();

  if (!processRedFirst) {
    if (playerMulliganIndices && playerMulliganIndices.length > 0) {
      processMulligan('blue', playerMulliganIndices);
    }
    if (enemyMulliganIndices && enemyMulliganIndices.length > 0) {
      processMulligan('red', enemyMulliganIndices);
    }
  } else {
    // 乱数消費順序をホストと完全に一致させるため、クライアント側はホスト(red)から先に処理する
    if (enemyMulliganIndices && enemyMulliganIndices.length > 0) {
      processMulligan('red', enemyMulliganIndices);
    }
    if (playerMulliganIndices && playerMulliganIndices.length > 0) {
      processMulligan('blue', playerMulliganIndices);
    }
  }

  GameState.placementMessage = null;
  GameState.battlePhase = BATTLE_PHASE.BATTLE;

  await sleep(AI_THINKING_DURATION); // マリガン終了後に少し間をあける

  await startTurn(GameState.firstPlayer);
}

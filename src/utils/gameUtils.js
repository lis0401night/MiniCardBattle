import { OWNERSHIP_FILTERS } from '../hooks/useCardFilterSort.js';
import { GameState } from '../state/gameState.js';
import { CARD_MASTER, PREMIUM_CARD_IDS } from './constants/cards.js';
import { CHARACTERS, getSkinImage } from './constants/characters.js';
import {
  appendVersionQuery,
  DAMAGE_TYPE,
  DEFAULT_PLAYER_NAME,
  DEFAULT_SOUND_VOLUME,
  DEFENSE_TARGET_COUNT,
  HEAVY_DAMAGE_THRESHOLD,
  HIGH_DIFFICULTY_CLEARED_KEY,
  HIGH_TIER_PICK_COUNT,
  LOW_TIER_PICK_COUNT,
  MID_TIER_PICK_COUNT,
  PROFILE_NAME_KEY,
  AI_LEVEL,
} from './constants/config.js';
import {
  ACTIVE_SKILLS,
  BOARD_NEVER_SHOW_SKILL_IDS,
  SKILLS,
} from './constants/skills.js';
import { STATUSES } from './constants/statuses.js';
import { setCurrentScreen } from './errorReporter.js';
import {
  audioCtx,
  cleanupOldDecodedBgms,
  decodedBgms,
  getSeMasterGainNode,
  isAudioUnlocked,
  loadAndDecodeAudio,
  recreateAudioSystem,
  registerDecodedBgm,
  seBuffers,
  SOUNDS,
  unlockAudio,
} from './sounds.js';

// LocalStorageに保存する防衛戦選出キャッシュのキー
const DEFENSE_TARGETS_STORAGE_KEY = 'mini_card_battle_defense_targets';

// BGM再生の自動再生ブロック回避のためのグローバルなリトライ機構
export let currentBgmAudio = null;
export let currentWebAudioBgmSource = null;
export let currentWebAudioBgmGain = null;
export { decodedBgms };

/**
 * 現在の GameState から実効BGM音量を算出する（ミュート時は0、それ以外は設定音量）
 * @returns {number} 実効BGM音量（0.0〜1.0）
 */
export function getEffectiveBgmVolume() {
  const isBgmMuted = typeof GameState !== 'undefined' && GameState.isBgmMuted;
  const bgmVol =
    typeof GameState !== 'undefined' &&
    typeof GameState.bgmVolume !== 'undefined'
      ? GameState.bgmVolume
      : typeof GameState !== 'undefined' &&
          typeof GameState.gameVolume !== 'undefined'
        ? GameState.gameVolume
        : DEFAULT_SOUND_VOLUME;
  return isBgmMuted ? 0 : bgmVol;
}

/**
 * 現在の GameState から実効SE音量を算出する（ミュート時は0、それ以外は設定音量）
 * @returns {number} 実効SE音量（0.0〜1.0）
 */
export function getEffectiveSeVolume() {
  const isSeMuted = typeof GameState !== 'undefined' && GameState.isSeMuted;
  const seVol =
    typeof GameState !== 'undefined' &&
    typeof GameState.seVolume !== 'undefined'
      ? GameState.seVolume
      : typeof GameState !== 'undefined' &&
          typeof GameState.gameVolume !== 'undefined'
        ? GameState.gameVolume
        : DEFAULT_SOUND_VOLUME;
  return isSeMuted ? 0 : seVol;
}

export const retryPlayBgm = () => {
  // WebAudioが使える場合はHTML5 Audioのplay()は実行しない（二重再生防止）
  if (!audioCtx && currentBgmAudio && currentBgmAudio.paused) {
    const p = currentBgmAudio.play();
    if (p !== undefined) {
      p.then(() => {
        document.removeEventListener('click', retryPlayBgm, true);
        document.removeEventListener('touchstart', retryPlayBgm, true);
      }).catch(() => {});
    }
  }
  if (audioCtx) {
    const startBgmIfPossible = () => {
      document.removeEventListener('click', retryPlayBgm, true);
      document.removeEventListener('touchstart', retryPlayBgm, true);

      if (currentBgmAudio) {
        let fetchUrl = currentBgmAudio.src;
        if (fetchUrl.includes('assets/audio/bgm/')) {
          fetchUrl = fetchUrl.substring(fetchUrl.indexOf('assets/audio/bgm/'));
        }
        const buffer = decodedBgms[fetchUrl];
        const effectiveBgmVol = getEffectiveBgmVolume();

        if (buffer) {
          registerDecodedBgm(fetchUrl, buffer);
          startWebAudioBgm(buffer, effectiveBgmVol);
        } else {
          // デコードされていない場合はここでデコードして再生
          loadAndDecodeAudio(currentBgmAudio.src)
            .then((buf) => {
              if (
                buf &&
                currentBgmAudio &&
                currentBgmAudio.src.includes(fetchUrl)
              ) {
                registerDecodedBgm(fetchUrl, buf);
                startWebAudioBgm(buf, getEffectiveBgmVolume());
              }
            })
            .catch((e) => console.warn('Failed to decode BGM on retry', e));
        }
      }
    };

    if (audioCtx.state === 'suspended') {
      audioCtx
        .resume()
        .then(startBgmIfPossible)
        .catch(() => {});
    } else if (audioCtx.state === 'running') {
      startBgmIfPossible();
    }
  }
};

window.updateWebAudioBgmVolume = (vol) => {
  if (currentWebAudioBgmGain) {
    currentWebAudioBgmGain.gain.value = vol;
  }
};

// ==========================================
// ユーティリティ関数
// ==========================================

export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(getSeededRandom() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export let addDamagePopupHook = null;
export function setAddDamagePopupHook(h) {
  addDamagePopupHook = h;
}

export function createDamagePopup(targetEl, text, color = '#ef4444') {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const x = rect.left + rect.width / 2 - 10;
  const y = rect.top;

  if (addDamagePopupHook) {
    addDamagePopupHook(x, y, text, color);
    return;
  }

  // React非マウント時のフォールバック
  const popup = document.createElement('div');
  popup.className = 'damage-popup';
  popup.innerText = text;
  popup.style.color = color;
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1000);
}

/**
 * 台詞定義（文字列、配列、または状況別オブジェクト）から適切な台詞を1つ抽出します。
 * 被ダメージ時のダメージ値による分岐（DAMAGE_TYPE.SMALL / BIG）に対応します。
 *
 * @param {string|Array<string>|Object} entry - 台詞定義データ
 * @param {string} type - 台詞種別（'intro' | 'win' | 'lose' | 'skill' | 'damage' 等）
 * @param {Object|null} targetConfig - 対戦相手の設定オブジェクト
 * @param {number|null} contextValue - ダメージ量などのコンテキスト数値
 * @returns {string|null} 抽出された台詞文字列（存在しない場合はnull）
 */
function resolveDialogueText(entry, type, targetConfig, contextValue) {
  if (entry === undefined || entry === null) return null;
  if (typeof entry === 'string') return entry;

  // 被ダメージ時のダメージ量に応じた分岐処理（{ small: [...], big: [...] } 形式）
  if (type === 'damage') {
    const damageKey =
      typeof contextValue === 'number' && contextValue >= HEAVY_DAMAGE_THRESHOLD
        ? DAMAGE_TYPE.BIG
        : DAMAGE_TYPE.SMALL;

    // オブジェクト形式 { small: [...], big: [...] } の場合
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const list = entry[damageKey] || entry.default || entry;
      if (Array.isArray(list) && list.length > 0) {
        return list[Math.floor(getSeededRandom() * list.length)];
      }
      if (typeof list === 'string') return list;
    }
  }

  // 通常の配列の場合（ランダム抽出）
  if (Array.isArray(entry)) {
    if (entry.length === 0) return null;
    return entry[Math.floor(getSeededRandom() * entry.length)];
  }

  // 対戦相手別オブジェクト形式の場合（{ satan: '...', default: '...' }）
  if (typeof entry === 'object') {
    if (targetConfig && entry[targetConfig.id]) {
      const specific = entry[targetConfig.id];
      if (typeof specific === 'string') return specific;
      if (Array.isArray(specific) && specific.length > 0) {
        return specific[Math.floor(getSeededRandom() * specific.length)];
      }
    }
    if (entry.default) {
      if (typeof entry.default === 'string') return entry.default;
      if (Array.isArray(entry.default) && entry.default.length > 0) {
        return entry.default[
          Math.floor(getSeededRandom() * entry.default.length)
        ];
      }
    }
  }

  return null;
}

/**
 * キャラクターまたはスキンの台詞を取得します。
 *
 * @param {Object} speakerConfig - 発話者の設定オブジェクト
 * @param {Object|null} targetConfig - 対戦相手の設定オブジェクト
 * @param {string} type - 台詞種別（'intro' | 'win' | 'lose' | 'skill' | 'damage' 等）
 * @param {string|null} [forceSide=null] - 強制サイド指定（'player' | 'enemy'）
 * @param {number|null} [contextValue=null] - ダメージ量などのコンテキスト数値
 * @returns {string} 取得された台詞文字列（見つからない場合は '...'）
 */
export function getDialogue(
  speakerConfig,
  targetConfig,
  type,
  forceSide = null,
  contextValue = null
) {
  if (!speakerConfig) return '...';

  // スキンによる台詞のオーバーライドをチェック
  let skinId = 'default';
  if (forceSide === 'player') {
    skinId =
      (GameState.playerSkins && GameState.playerSkins[speakerConfig.id]) ||
      'default';
  } else if (forceSide === 'enemy') {
    skinId =
      (GameState.enemySkins && GameState.enemySkins[speakerConfig.id]) ||
      'default';
  } else {
    // forceSideがない場合は、GameState上のconfigと一致するかで推測する
    if (
      GameState.playerConfig &&
      GameState.playerConfig.id === speakerConfig.id
    ) {
      skinId =
        (GameState.playerSkins && GameState.playerSkins[speakerConfig.id]) ||
        'default';
    } else if (
      GameState.enemyConfig &&
      GameState.enemyConfig.id === speakerConfig.id
    ) {
      skinId =
        (GameState.enemySkins && GameState.enemySkins[speakerConfig.id]) ||
        'default';
    }
  }

  if (
    skinId !== 'default' &&
    speakerConfig.skins &&
    speakerConfig.skins[skinId] &&
    speakerConfig.skins[skinId].dialogue
  ) {
    const skinEntry = speakerConfig.skins[skinId].dialogue[type];
    const skinText = resolveDialogueText(
      skinEntry,
      type,
      targetConfig,
      contextValue
    );
    if (skinText !== null) return skinText;
  }

  if (!speakerConfig.dialogue) return '...';
  const defaultEntry = speakerConfig.dialogue[type];
  const text = resolveDialogueText(
    defaultEntry,
    type,
    targetConfig,
    contextValue
  );
  return text !== null ? text : '...';
}

export async function playSound(audioOrKey) {
  if (!audioOrKey) return;

  // 初回再生時に音声をアンロック（モバイル Safari 対策）
  if (typeof unlockAudio === 'function' && !isAudioUnlocked) {
    unlockAudio();
  }

  // バックグラウンド復帰後などに AudioContext が一時停止されたままの場合のフェイルセーフ
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx
      .resume()
      .catch((e) => console.warn('Failed to resume audioCtx', e));
  }

  const isSeMuted = typeof GameState !== 'undefined' && GameState.isSeMuted;

  const effectiveBgmVol = getEffectiveBgmVolume();
  const effectiveSeVol = getEffectiveSeVolume();

  // 1. Web Audio (SE) の処理
  let seKey = null;
  if (typeof audioOrKey === 'string') {
    seKey = audioOrKey;
  } else if (audioOrKey instanceof Audio) {
    for (const [key, val] of Object.entries(SOUNDS)) {
      if (val === audioOrKey) {
        seKey = key;
        break;
      }
    }
  }

  if (seKey && !seKey.startsWith('bgm') && audioCtx && seBuffers[seKey]) {
    if (isSeMuted) return; // SEミュート時は処理をスキップ
    const buffer = seBuffers[seKey];
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    source.buffer = buffer;
    gainNode.gain.value = 1.0;
    source.connect(gainNode);
    const masterGain = getSeMasterGainNode();
    gainNode.connect(masterGain || audioCtx.destination);
    source.start(0);
    return;
  }

  // 2. HTML5 Audio (BGM または Web Audio失敗時のフォールバック)
  const audio =
    typeof audioOrKey === 'string' ? SOUNDS[audioOrKey] : audioOrKey;
  if (audio instanceof Audio) {
    const isBgm = audio.loop || (audio.src && audio.src.includes('bgm'));
    if (!isBgm && isSeMuted) return; // SEミュート時は再生スキップ

    const targetVol = isBgm ? effectiveBgmVol : effectiveSeVol;

    try {
      audio.volume = targetVol;
    } catch {}

    try {
      // BGM (ループ音) の処理
      if (isBgm) {
        // 同じBGMが既に再生中の場合は最初から再生し直さない
        if (currentBgmAudio === audio) {
          if (currentWebAudioBgmGain)
            currentWebAudioBgmGain.gain.value = effectiveBgmVol;
          return;
        }

        // Web Audio APIによるSafari等対策BGM再生へのルーティング
        if (audioCtx) {
          // 古いBGMを停止
          if (currentBgmAudio) stopSound(currentBgmAudio);
          currentBgmAudio = audio; // 互換性維持

          let fetchUrl = audio.src;
          // ローカルパス変換ロジック
          if (fetchUrl.includes('assets/audio/bgm/')) {
            fetchUrl = fetchUrl.substring(
              fetchUrl.indexOf('assets/audio/bgm/')
            );
          }

          const playWebAudioBgm = () => {
            const buffer = decodedBgms[fetchUrl];
            const currentEffectiveBgmVol = getEffectiveBgmVolume();
            if (buffer) {
              registerDecodedBgm(fetchUrl, buffer);
              startWebAudioBgm(buffer, currentEffectiveBgmVol);
            } else {
              loadAndDecodeAudio(audio.src)
                .then((buf) => {
                  if (buf && currentBgmAudio === audio) {
                    registerDecodedBgm(fetchUrl, buf);
                    startWebAudioBgm(buf, getEffectiveBgmVolume());
                  }
                })
                .catch((e) => console.warn('Failed to decode BGM:', e));
            }
          };

          if (audioCtx.state === 'suspended') {
            document.addEventListener('click', retryPlayBgm, { capture: true });
            document.addEventListener('touchstart', retryPlayBgm, {
              capture: true,
            });

            // resume() の完了（running状態）を確実に待ってから再生を開始する
            audioCtx
              .resume()
              .then(playWebAudioBgm)
              .catch(() => {
                // resume失敗時は次回のインタラクションイベント(retryPlayBgm)を待つ
              });
          } else {
            // すでに running 状態なら即座に再生
            playWebAudioBgm();
          }
        } else {
          // HTML5 Audio Fallback (PC or very legacy)
          if (audio.readyState > 0) {
            try {
              audio.currentTime = 0;
            } catch {}
          }
          currentBgmAudio = audio;
          const p = audio.play();
          if (p !== undefined) {
            p.catch((e) => {
              console.warn('BGM playback blocked, waiting interaction...', e);
              document.addEventListener('click', retryPlayBgm, {
                capture: true,
              });
              document.addEventListener('touchstart', retryPlayBgm, {
                capture: true,
              });
            });
          }
        }
      } else {
        // SEとしてAudio要素を鳴らす場合（予備ロジック）
        if (audio.paused || audio.ended) {
          audio.currentTime = 0;
          const p = audio.play();
          if (p !== undefined) p.catch(() => {});
        } else {
          const clone = audio.cloneNode();
          try {
            clone.volume = effectiveSeVol;
          } catch {}
          const p = clone.play();
          if (p !== undefined) p.catch(() => {});
        }
      }
    } catch (e) {
      console.warn('HTML5 Audio playback failed:', e);
    }
  }
}
export function startWebAudioBgm(buffer, baseVol) {
  if (currentWebAudioBgmSource) {
    try {
      currentWebAudioBgmSource.stop();
    } catch {}
    currentWebAudioBgmSource.disconnect();
  }
  if (currentWebAudioBgmGain) {
    currentWebAudioBgmGain.disconnect();
  }

  currentWebAudioBgmGain = audioCtx.createGain();
  currentWebAudioBgmGain.gain.value = baseVol;

  currentWebAudioBgmSource = audioCtx.createBufferSource();
  currentWebAudioBgmSource.buffer = buffer;
  currentWebAudioBgmSource.loop = true;

  currentWebAudioBgmSource.connect(currentWebAudioBgmGain);
  currentWebAudioBgmGain.connect(audioCtx.destination);

  try {
    currentWebAudioBgmSource.start(0);
  } catch (e) {
    console.warn('WebAudio BGM start failed:', e);
  }
}

export function stopSound(audio) {
  if (audio === currentBgmAudio) {
    currentBgmAudio = null;
    if (currentWebAudioBgmSource) {
      try {
        currentWebAudioBgmSource.stop();
      } catch {}
      currentWebAudioBgmSource.disconnect();
      currentWebAudioBgmSource = null;
    }
  }
  if (audio && audio.pause) {
    audio.pause();
  }
}
export function stopAllBGM() {
  if (currentBgmAudio) {
    stopSound(currentBgmAudio);
  }
  currentBgmAudio = null;
  Object.keys(SOUNDS).forEach((key) => {
    if (key.startsWith('bgm')) {
      stopSound(SOUNDS[key]);
    }
  });
}

/**
 * サウンドシステム全体を強制リロード・再構築し、再生状態を復旧します。
 * 古い Web Audio ノードを切断・破棄し、AudioContext およびバッファを再初期化します。
 * @returns {Promise<void>}
 */
export async function forceSoundReload() {
  // 古い WebAudio BGM ノードの停止と切断
  if (currentWebAudioBgmSource) {
    try {
      currentWebAudioBgmSource.stop();
    } catch {}
    try {
      currentWebAudioBgmSource.disconnect();
    } catch {}
    currentWebAudioBgmSource = null;
  }
  if (currentWebAudioBgmGain) {
    try {
      currentWebAudioBgmGain.disconnect();
    } catch {}
    currentWebAudioBgmGain = null;
  }

  if (typeof recreateAudioSystem === 'function') {
    await recreateAudioSystem();
  }

  // BGM用のデコードバッファキャッシュもクリア
  cleanupOldDecodedBgms();

  // 現在再生中のBGMがあった場合、それを再起動
  if (currentBgmAudio) {
    const bgm = currentBgmAudio;
    currentBgmAudio = null;

    // 短いディレイ（アセットロード時間考慮）を挟んで再起動
    setTimeout(() => {
      playSound(bgm);
    }, 150);
  }

  // 復旧のフィードバックとして、テスト用SE（クリック音）を鳴らす
  setTimeout(() => {
    playSound('seClick');
  }, 300);
}
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// PRNG (Pseudo-Random Number Generator) for Multiplayer Sync
let currentRNG = Math.random;

export function setRNGSeed(seed) {
  let a = 0;
  if (typeof seed === 'string') {
    for (let i = 0; i < seed.length; i++) {
      a = (Math.imul(31, a) + seed.charCodeAt(i)) | 0;
    }
  } else {
    a = seed;
  }
  currentRNG = function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resetRNG() {
  currentRNG = Math.random;
}

export function getCurrentRNG() {
  return currentRNG;
}

export function setCurrentRNG(rng) {
  if (typeof rng !== 'function') {
    throw new TypeError('rng must be a function');
  }
  currentRNG = rng;
}

export function getSeededRandom() {
  return currentRNG();
}

// iOS Safari等の長時間のバックグラウンドサスペンドに対するオーディオ復帰機構
const AUDIO_RECOVERY_THRESHOLD_MINUTES = 5;
let backgroundStartTime = 0;
let needsAudioRecovery = false;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      backgroundStartTime = Date.now();
    } else if (document.visibilityState === 'visible') {
      if (backgroundStartTime > 0) {
        const elapsedMinutes = (Date.now() - backgroundStartTime) / 1000 / 60;
        // 5分以上バックグラウンドにいた場合はオーディオエンジンが破棄（クラッシュ）されている可能性が高いと判定
        if (elapsedMinutes >= AUDIO_RECOVERY_THRESHOLD_MINUTES) {
          needsAudioRecovery = true;
        }
        backgroundStartTime = 0;
      }
    }
  });
}

// 画面遷移
export let isTransitioning = false;
let switchScreenHook = null;
export function setSwitchScreenHook(hook) {
  switchScreenHook = hook;
}

export function switchScreen(id) {
  if (isTransitioning) return;

  // エラーレポーター用に現在の画面IDを更新
  setCurrentScreen(id);

  if (switchScreenHook) {
    switchScreenHook(id);
  } else {
    executeSwitchScreen(id);
  }
}

export function executeSwitchScreen(id) {
  if (isTransitioning) return;
  isTransitioning = true;

  // 長時間のバックグラウンド放置からの復帰時で、BGMが鳴っているべき場合に強制再起動を行う
  if (needsAudioRecovery && currentBgmAudio) {
    needsAudioRecovery = false;
    const bgmToRestart = currentBgmAudio;
    currentBgmAudio = null; // 一旦nullにしてプレイ済みチェックを回避させる
    playSound(bgmToRestart);
  }

  // モバイル等でのボタン選択状態（Sticky Focus）を解除
  if (document.activeElement && document.activeElement.tagName !== 'BODY') {
    document.activeElement.blur();
  }
  document
    .querySelectorAll('.screen')
    .forEach((s) => s.classList.remove('active'));
  const targetScreen = document.getElementById(id);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // 300ms間は次の入力を受け付けない（ゴーストクリック対策）
  setTimeout(() => {
    isTransitioning = false;
  }, 150);
}

// ゴーストクリック（pointerdown後の遅延clickイベント）をグローバルで無効化
window.addEventListener(
  'click',
  (e) => {
    if (isTransitioning) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true
); // キャプチャフェーズで阻止

/**
 * 指定したパッシブスキルを持つカードを盤面から検出し、演出イベント配列を生成します。
 * @param {Object} state - バトル状態オブジェクト
 * @param {string} skillId - 検出対象のスキルID
 * @param {string} skillName - ポップアップに表示するスキル名
 * @param {string} color - ポップアップの表示色
 * @returns {Array<Object>} 発生した演出イベントの配列
 */
function createPassiveSkillPopupEvents(state, skillId, skillName, color) {
  const events = [];
  const boards = [
    { board: state?.playerBoard || [], side: 'blue' },
    { board: state?.enemyBoard || [], side: 'red' },
  ];
  boards.forEach(({ board, side }) => {
    if (!Array.isArray(board)) return;
    board.forEach((c, i) => {
      if (c && hasSkill(c, skillId)) {
        events.push({ type: 'skill_popup', side, lane: i, skillName, color });
      }
    });
  });
  return events;
}

/**
 * 墓守スキルの発動チェックを行い、演出イベント配列を生成します。
 * @param {Object} state - バトル状態オブジェクト
 * @returns {Array<Object>} 発生した演出イベントの配列
 */
export function createGraveKeeperEvents(state) {
  return createPassiveSkillPopupEvents(
    state,
    'grave_keeper',
    '墓守',
    '#a8a29e'
  );
}

/**
 * 瘴気スキルの発動チェックを行い、演出イベント配列を生成します。
 * @param {Object} state - バトル状態オブジェクト
 * @returns {Array<Object>} 発生した演出イベントの配列
 */
export function createMiasmaEvents(state) {
  return createPassiveSkillPopupEvents(state, 'miasma', '瘴気', '#a8a29e');
}

// 判定補助: 特定のスキルを所持しているか
export function hasSkill(c, skillId) {
  if (!c) return false;

  // 拘束（スタン）状態は「防御（攻撃不可）」として扱う
  if (skillId === 'defender' && c.stunTurns > 0) return true;
  if (Array.isArray(c.skills)) {
    return c.skills.some((s) => s.id === skillId);
  }
  return false;
}

// 判定補助: スキルの数値を取得
export function getSkillValue(c, skillId) {
  if (!c) return 0;
  if (Array.isArray(c.skills)) {
    const s = c.skills.find((s) => s.id === skillId);
    return s ? s.value || 0 : 0;
  }
  return 0;
}

// 装備時などのスキル統合ロジック
export function mergeCardSkills(targetCard, equipSkills) {
  if (!targetCard.skills) {
    targetCard.skills = [];
  }

  for (const newS of equipSkills) {
    const existingInfo = targetCard.skills.find((s) => s.id === newS.id);
    if (existingInfo) {
      if (newS.value !== undefined && newS.value !== null) {
        existingInfo.value = (existingInfo.value || 0) + newS.value;
      }
    } else {
      targetCard.skills.push({ ...newS });
    }
  }
}

/**
 * 装備解除時などのスキル減算・復元ロジック。
 * 装備カード由来のスキルを対象カードから削除・減算します。
 * 対象カード自身が元々マスターデータで所持している固有スキル（伝説、頑丈、貫通などのフラグ系スキルや基礎数値）は、
 * 誤って消失しないよう保護・維持されます。
 * @param {object} targetCard - 装備を解除される対象のカード
 * @param {Array<object>} equipSkills - 解除する装備品が所持していたスキル配列
 */
export function unmergeCardSkills(targetCard, equipSkills) {
  if (!targetCard || !targetCard.skills || !Array.isArray(equipSkills)) return;

  // 対象カードのマスターデータ（元の基礎定義）を取得
  const masterId = targetCard.baseId || targetCard.id;
  const masterCard = CARD_MASTER.find((m) => m.id === masterId);
  const masterSkills = masterCard?.skills || [];

  for (const eqS of equipSkills) {
    const existingInfo = targetCard.skills.find((s) => s.id === eqS.id);
    if (!existingInfo) continue;

    const originalSkill = masterSkills.find((ms) => ms.id === eqS.id);

    // 1. 数値（value）を持つスキルの場合（回復、援護、サルベージ等）
    if (
      eqS.value !== undefined &&
      eqS.value !== null &&
      existingInfo.value !== undefined &&
      existingInfo.value !== null
    ) {
      existingInfo.value -= eqS.value;
      // 元々マスターデータで持っていた数値スキルであれば、初期数値を下回らないように保護
      if (originalSkill && originalSkill.value !== undefined) {
        if (existingInfo.value < originalSkill.value) {
          existingInfo.value = originalSkill.value;
        }
      } else if (existingInfo.value <= 0) {
        // 元々持っていなかった数値スキルの場合は 0 以下で完全に削除
        targetCard.skills = targetCard.skills.filter((s) => s !== existingInfo);
      }
    } else {
      // 2. 数値を持たないフラグ系スキル（伝説、頑丈、貫通、必殺、生贄、移動等）の場合
      // 元々マスターデータで所持していない（装備によってのみ付与されていた）場合のみ削除する
      if (!originalSkill) {
        targetCard.skills = targetCard.skills.filter((s) => s !== existingInfo);
      }
    }
  }

  // 装備適用時に引き継いだ選択肢（choices / choices2）を元のマスターデータ定義へ復元する
  if (masterCard) {
    targetCard.choices = masterCard.choices
      ? JSON.parse(JSON.stringify(masterCard.choices))
      : undefined;
    targetCard.choices2 = masterCard.choices2
      ? JSON.parse(JSON.stringify(masterCard.choices2))
      : undefined;
  }
}

/**
 * カードが無敵状態（invincible）にあるかを判定する。
 * 独立した状態フラグ（invincibleTurns）またはスキル配列内の無敵スキルのいずれかが有効な場合に true を返す。
 *
 * @param {object|null|undefined} card - 判定対象のカードオブジェクト
 * @returns {boolean} 無敵状態であれば true、それ以外は false
 */
export function isCardInvincible(card) {
  if (!card) return false;
  if ((card.invincibleTurns || 0) > 0) return true;
  if (
    Array.isArray(card.skills) &&
    card.skills.some((s) => {
      if (!s) return false;
      const sid = typeof s === 'string' ? s : s.id;
      if (sid !== 'invincible') return false;
      // 状態スロット（isStatus）または数値を持つスキルの場合は値が0以下なら無敵ではない
      if (s.isStatus || (s.value !== undefined && s.value !== null)) {
        return (s.value ?? 0) > 0;
      }
      return true;
    })
  ) {
    return true;
  }
  return false;
}

/**
 * 状態マスター（STATUSES）の定義に従い、カードの直接プロパティから現在の状態値を取得する内部ヘルパー。
 *
 * @param {object} card - 対象カード
 * @param {string} statusId - 状態ID
 * @returns {number} 状態値（未付与時は0）
 */
function getCardStatusPropertyValue(card, statusId) {
  if (!card) return 0;
  const def = STATUSES[statusId];
  if (!def) return 0;
  if (statusId === 'valkyria_guard') {
    return card.valkyriaGuardTurns || (card.valkyriaGuard ? 1 : 0);
  }
  return card[def.property] || 0;
}

/**
 * 状態マスター（STATUSES）の定義に従い、カードの直接プロパティへ状態値を反映または削除する内部ヘルパー。
 *
 * @param {object} card - 対象カード
 * @param {string} statusId - 状態ID
 * @param {number|null} value - 設定する値。null または 0 以下の場合はプロパティをリセット・削除する
 * @returns {void}
 */
function applyStatusProperties(card, statusId, value) {
  if (!card) return;
  const def = STATUSES[statusId];
  if (!def) return;

  if (value === null || value <= 0) {
    if (def.flagProperty) delete card[def.flagProperty];
    if (def.property) delete card[def.property];
    if (def.turnsProperty) delete card[def.turnsProperty];
    if (statusId === 'stun') card.stunTurns = 0; // スタンは 0 リセット互換を保持
    return;
  }

  if (def.flagProperty) card[def.flagProperty] = true;
  if (def.property) card[def.property] = value;
  if (def.turnsProperty) card[def.turnsProperty] = value;
}

/**
 * カードに状態（ステータス: corrosion, stun, invincible, valkyria_guard, cant_attack）を付与する共通関数。
 * 既存の通常スキルとは独立した「状態エントリ（isStatus: true）」として管理します。
 * 新規付与時はスキル枠（card.skills）の末尾（下のスロット）に追加され、
 * 重ね掛け時は高い方を優先（Math.max）して既存スロットの位置を維持したまま値を更新します。
 * 直接プロパティ（card.corrosion, card.stunTurns 等）とも完全に同期します。
 * ※非正値（0以下）が指定された場合は、状態スロットの追加を行わず解除（removeCardStatus）として統一処理し、0を返します。
 *
 * @param {object|null} card - 対象カード
 * @param {string} statusId - 状態ID ('corrosion' | 'stun' | 'invincible' | 'valkyria_guard' | 'cant_attack')
 * @param {number} [value=1] - 付与する値（腐食の減少値、または持続ターン数）。0以下の場合は解除
 * @returns {number} 最終的に設定された値（解除時は0）
 */
export function grantCardStatus(card, statusId, value = 1) {
  if (!card) return 0;

  const normalizedValue = value !== undefined && value !== null ? value : 1;
  // 非正値（0以下）の指定は状態の解除として統一処理（値0のスロット生成を防止）
  if (normalizedValue <= 0) {
    removeCardStatus(card, statusId);
    return 0;
  }

  if (!Array.isArray(card.skills)) {
    card.skills = [];
  }

  // 既存の状態エントリを検索
  const existingIdx = card.skills.findIndex(
    (s) => s && s.isStatus && s.id === statusId
  );

  // 既存値の取得（直接プロパティもフォールバックとして考慮）
  let currentVal = 0;
  if (existingIdx !== -1) {
    currentVal = card.skills[existingIdx].value || 0;
  } else {
    currentVal = getCardStatusPropertyValue(card, statusId);
  }

  // Bの仕様（高い方を優先、Math.max）
  const finalValue = Math.max(currentVal, normalizedValue);

  if (existingIdx !== -1) {
    // 既存スロットの値を更新（スロット順序・位置は維持）
    card.skills[existingIdx].value = finalValue;
    card.skills[existingIdx].isStatus = true;
  } else {
    // 新たに下のスロット（末尾）に追加
    card.skills.push({
      id: statusId,
      value: finalValue,
      isStatus: true,
    });
  }

  // 直接プロパティの同期（後方互換性および判定ロジック用）
  applyStatusProperties(card, statusId, finalValue);

  return finalValue;
}

/**
 * 対象カードから指定した状態を解除・消去します。
 * card.skills 配列内の該当状態エントリを削除し、直接プロパティもリセットします。
 *
 * @param {object|null} card - 対象カード
 * @param {string} statusId - 解除する状態ID
 */
export function removeCardStatus(card, statusId) {
  if (!card) return;
  if (Array.isArray(card.skills)) {
    card.skills = card.skills.filter(
      (s) => !(s && s.isStatus && s.id === statusId)
    );
  }
  applyStatusProperties(card, statusId, null);
}

/**
 * 対象カードに付与されているすべての一時状態（ステータス: valkyria_guard, invincible, stun, cant_attack, corrosion等）を一括解除します。
 *
 * カードの墓地送り時やリセット時に呼び出され、
 * STATUSES マスターに定義された全状態の直接プロパティ（invincibleTurns, stunTurns, corrosion, cantAttackTurns, valkyriaGuard, valkyriaGuardTurns 等）
 * および card.skills 内の状態スロット（isStatus: true または STATUSES に含まれる状態ID）を完全に消去します。
 * また、付随する一時フラグ（stunAppliedThisTurn 等）もリセットします。
 *
 * @param {object|null} card - 対象カード
 * @returns {void}
 */
export function clearAllCardStatuses(card) {
  if (!card) return;

  // 1. STATUSES 定義に基づく全状態の解除・プロパティ消去
  for (const statusId of Object.keys(STATUSES)) {
    removeCardStatus(card, statusId);
  }

  // 2. card.skills 内の状態スロット（isStatusフラグ付き、またはSTATUSESキー一致）を安全に除去
  if (Array.isArray(card.skills)) {
    card.skills = card.skills.filter(
      (s) => !s || (!s.isStatus && !STATUSES[s.id || s])
    );
  }

  // 3. 付随する一時フラグ・プロパティの安全消去
  card.stunAppliedThisTurn = false;
  card.stunTurns = 0;
  delete card.valkyriaGuard;
  delete card.valkyriaGuardTurns;
  delete card.invincibleTurns;
  delete card.cantAttackTurns;
  delete card.corrosion;
}

/**
 * 対象カードの持続ターン型状態（無敵・スタン・攻撃不能・加護等）を1ターン分減衰させ、
 * ターン数が終了した状態をカードおよびスキル枠から解除します。
 *
 * 直接プロパティ（card.invincibleTurns, card.stunTurns 等）と
 * スキル枠（card.skills 内の状態スロット）の双方を同期して一元的に減衰処理を行います。
 *
 * @param {object|null} card - 対象カード
 * @param {string} statusId - 減衰させる状態ID ('invincible' | 'stun' | 'cant_attack' | 'valkyria_guard' 等)
 * @returns {boolean} 状態が存在し、減衰によって持続時間が終了して解除された場合は true、継続中または未付与時は false
 */
export function decayCardStatus(card, statusId) {
  if (!card) return false;
  const def = STATUSES[statusId];
  // 状態マスターに未定義、または持続ターンを持たない状態（毒等）は減衰対象外
  if (!def || def.hasTurns === false) return false;

  // 直接プロパティおよびスロット値から現在の残りターン数を取得
  let currentVal = getCardStatusPropertyValue(card, statusId);
  const slot = Array.isArray(card.skills)
    ? card.skills.find((s) => s && s.isStatus && s.id === statusId)
    : null;
  if (slot && (slot.value || 0) > currentVal) {
    currentVal = slot.value;
  }

  // 既にターン数が0または未付与の場合は何もしない
  if (currentVal <= 0) return false;

  const nextVal = currentVal - 1;

  if (nextVal <= 0) {
    // 持続ターン終了: 状態を完全に解除
    removeCardStatus(card, statusId);
    return true;
  } else {
    // 持続中: 直接プロパティとスキル枠スロットの値を更新・同期
    applyStatusProperties(card, statusId, nextVal);
    syncCardStatuses(card);
    return false;
  }
}

/**
 * 対象カードの直接プロパティ（stunTurns, corrosion等）の変動を card.skills 内の状態スロットと同期します。
 * ターン経過によるカウントダウンや外部プロパティ更新後に呼び出すことで、スロットとの不整合を防ぎます。
 *
 * @param {object|null} card - 対象カード
 */
export function syncCardStatuses(card) {
  if (!card) return;
  if (!Array.isArray(card.skills)) return;

  for (const statusId of Object.keys(STATUSES)) {
    const val = getCardStatusPropertyValue(card, statusId);
    if (val <= 0) {
      card.skills = card.skills.filter(
        (s) => !(s && s.isStatus && s.id === statusId)
      );
    } else {
      const sEntry = card.skills.find(
        (s) => s && s.isStatus && s.id === statusId
      );
      if (sEntry) {
        sEntry.value = val;
      }
    }
  }
}

/**
 * 起動（startup）能力を持つカードから「起動」および「防御」能力を除去し、「スタン」状態を解除します。
 * カードの上に別のカードを配置した際の起動消滅処理を一元化し、
 * 防御能力の喪失およびスタン状態（待機・拘束・スロットエントリ）の完全消去を保証します。
 *
 * @param {object|null} card - 対象カード
 * @returns {void}
 */
export function consumeStartupSkill(card) {
  if (!card) return;
  if (Array.isArray(card.skills)) {
    card.skills = card.skills.filter(
      (s) => s && s.id !== 'startup' && s.id !== 'defender'
    );
  }
  removeCardStatus(card, 'stun');
}

/**
 * 解放（unleash）能力を持つカードから「防御」能力を除去し、「スタン」状態を解除します。
 * 召喚時に自身の防御スキルとスタン状態（待機・拘束・スロットエントリ）を完全消去し、
 * カードが即座に行動可能な状態へ遷移することを保証します。
 *
 * @param {object|null} card - 対象カード
 * @returns {void}
 */
export function applyUnleashSkill(card) {
  if (!card) return;
  if (Array.isArray(card.skills)) {
    card.skills = card.skills.filter((s) => s && s.id !== 'defender');
  }
  removeCardStatus(card, 'stun');
}

/**
 * 対象カードの全能力と一時効果を消去する共通処理（沈黙・忘却等で共用）。
 * スキル配列、選択肢、召喚ID、スキル解決中フラグ等を初期化します。
 * ※状態（ステータス: isStatus === true / stunTurns / invincibleTurns / corrosion 等）は能力ではないため消去されず、スロット内に保護されます。
 *
 * @param {object|null} targetCard - 対象カード
 */
export function clearCardAbilities(targetCard) {
  if (!targetCard) return;
  targetCard.skills = Array.isArray(targetCard.skills)
    ? targetCard.skills.filter((s) => s && s.isStatus)
    : [];
  targetCard.choices = [];
  targetCard.choices2 = [];
  targetCard.supremacySkills = [];
  if ('summonId' in targetCard) delete targetCard.summonId;
  if ('isSkillResolving' in targetCard) targetCard.isSkillResolving = false;
}

/**
 * カードが「スキル解決中のパワー0スペル保護」の対象かを判定する。
 * 一度もダメージを受けておらず、元々パワーが0のカードのみ保護する。
 * ダメージを受けてパワー0以下になったカードは保護しない。
 *
 * @param {object|null|undefined} card - 判定対象のカード
 * @returns {boolean} 保護対象の場合は true、それ以外は false
 */
export function isProtectedZeroPowerCard(card) {
  if (!card || !card.isSkillResolving) return false;
  if (card.hasTakenDamage) return false;
  // 元々のパワーを basePower から判定する。basePower が無いカードは power を元々のパワーとして扱う
  const originalPower =
    card.basePower !== undefined && card.basePower !== null
      ? card.basePower
      : card.power;
  return (originalPower || 0) === 0;
}

/**
 * 武装(arm_self)スキルの消費・維持処理。
 * 下のカードの武装(1回分)を消費しつつ、上のカード自身が「武装」を持っている場合は
 * 上のカード由来の新たな「武装(1回分)」を付与して保持します。
 * 上のカードが「装備(equip)」を持っている場合は、下のカードの武装は消費せず温存します。
 * @param {object} host - 装備される側のカード（下のカード）
 * @param {object} equipped - 装備する側のカード（上のカード）
 */
export function consumeArmSelf(host, equipped) {
  if (!host || !equipped) return;
  // 上のカードが「装備(equip)」を持っておらず、下のカードが「武装(arm_self)」を持っていた場合のみ消費判定
  if (!hasSkill(equipped, 'equip') && hasSkill(host, 'arm_self')) {
    const equippedHasArmSelf = hasSkill(equipped, 'arm_self');
    if (Array.isArray(host.skills)) {
      // 下のカードが元々持っていた武装(1回分)を消費
      host.skills = host.skills.filter((s) => s.id !== 'arm_self');
      // 上のカード自身が「武装」を持っていた場合は、上のカード由来の新たな「武装(1回分)」を付与して残す
      if (equippedHasArmSelf) {
        const armSkill = equipped.skills?.find((s) => s.id === 'arm_self') || {
          id: 'arm_self',
        };
        host.skills.push({ ...armSkill });
      }
    }
  }
}

export function stripEphemeralSkills(card) {
  if (!card || (!card.baseId && !card.id)) return;
  const masterInfo = CARD_MASTER.find((m) => m.id === (card.baseId || card.id));

  if (masterInfo && masterInfo.skills) {
    // マスターデータのスキルをディープコピーして初期状態に戻す
    card.skills = JSON.parse(JSON.stringify(masterInfo.skills));
  } else {
    // skills配列を持たない旧仕様カードやトークン等は、付与されたスキルをすべてクリアする
    card.skills = [];
  }
}

export const VALID_PREMIUM_CARDS = PREMIUM_CARD_IDS;

/**
 * 指定されたカードIDがプレミアム版（WebPまたはJPGイラスト）を持っているか判定します。
 * @param {string} id - カードID
 * @returns {boolean}
 */
export function hasPremiumVariant(id) {
  if (!id) return false;
  return VALID_PREMIUM_CARDS.includes(id);
}

// カードの画像URLを取得（プレミアム設定を考慮）// IDからの自動解決
export function getCardImgUrl(card, useThumb = false) {
  const getRawUrl = () => {
    if (!card) return 'assets/cards/card_default.webp';
    if (card.imgUrl) return card.imgUrl; // トークン等で直接焼き付けられたURLがある場合は最優先

    // 特定のトークンの例外処理（旧imgUrl設定の復元）
    if (card.id === 'token_knight')
      return 'assets/cards/card_token_knight.webp';
    if (card.id === 'token_ignis' || card.baseId === 'token_ignis') {
      // オーナーのドラゴンスキン設定に応じたキャラクター画像を返す
      // enemy（red）はGameState.enemySkins、player（blue）はGameState.playerSkinsを参照
      const ownerSkins =
        card.owner === 'red'
          ? GameState.enemySkins || {}
          : GameState.playerSkins || {};
      const dragonSkin = ownerSkins['dragon'] || 'default';
      const fullPath = getSkinImage('dragon', dragonSkin, 'image');
      return fullPath.split('?')[0]; // 後続のサムネイル置換を通すため、バージョンクエリなしの生パスを返す
    }
    if (card.id === 'token_satan' || card.baseId === 'token_satan')
      return 'assets/cards/card_token_satan.webp';

    let lookupId = String(card.baseId || card.id || '');
    if (!lookupId) return 'assets/cards/card_default.webp';

    // トークン等は '_' 以降（タイムスタンプ等）を除去したベースIDを使用する
    if (
      lookupId.includes('_') &&
      !lookupId.startsWith('token_') &&
      !lookupId.startsWith('cl_')
    ) {
      lookupId = lookupId.split('_')[0];
    } else if (lookupId.startsWith('token_')) {
      // token_xxx_123 などの場合はベースの token_xxx を使用
      const parts = lookupId.split('_');
      if (parts.length >= 3) lookupId = parts[0] + '_' + parts[1];
    } else if (lookupId.startsWith('cl_')) {
      lookupId = 'token_clone';
    }

    // isPremiumフラグが明示的に設定されている場合はそれを優先
    if (card.isPremium === true) {
      if (VALID_PREMIUM_CARDS.includes(lookupId))
        return `assets/cards/card_${lookupId}_premium.webp`;
    } else if (card.isPremium === false) {
      return `assets/cards/card_${lookupId}.webp`;
    }

    // フラグがない場合は従来のグローバル設定を参照（ただし敵のカードと明示されている場合は除く）
    if (
      card.owner !== 'red' &&
      GameState.premiumCards &&
      GameState.premiumCards.includes(lookupId)
    ) {
      if (VALID_PREMIUM_CARDS.includes(lookupId))
        return `assets/cards/card_${lookupId}_premium.webp`;
    }
    return `assets/cards/card_${lookupId}.webp`;
  };

  let rawUrl = getRawUrl();

  // useThumbがtrueで、カード画像またはキャラクター画像で、まだ_thumbが付いていない場合のみ置換
  if (
    useThumb &&
    (rawUrl.includes('assets/cards/') ||
      rawUrl.includes('assets/characters/')) &&
    !rawUrl.includes('_thumb.webp')
  ) {
    rawUrl = rawUrl.replace('.webp', '_thumb.webp');
  }

  return appendVersionQuery(rawUrl);
}

// プレミアムカード設定の切り替え
export function togglePremiumCard(cardId, saveToGlobal = true) {
  const index = GameState.premiumCards.indexOf(cardId);
  if (index === -1) {
    GameState.premiumCards.push(cardId);
  } else {
    GameState.premiumCards.splice(index, 1);
  }
  if (saveToGlobal) {
    localStorage.setItem(
      'mini_card_battle_premium_cards',
      JSON.stringify(GameState.premiumCards)
    );
  }
}

// プレイヤーの一意なIDを取得または生成
export function getOrCreateUUID() {
  let uuid = localStorage.getItem('mini_card_battle_uuid');
  if (!uuid) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uuid = crypto.randomUUID();
    } else {
      // 代替の簡易UUID生成
      uuid = 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0,
          v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem('mini_card_battle_uuid', uuid);
  }
  return uuid;
}

/**
 * カードのスキルバッジHTMLを生成するユーティリティ関数
/**
 * 召喚(summon)、号令(call)、探索(explore)等のターゲット指定に応じた表示ラベル（カッコ内の文字列）を取得する。
 *
 * 【共通ルール仕様】
 * - 複数のtargetがある場合（targetIdsが2個以上、またはtargetIdsとtargetKeywordの両方が存在する場合）:
 *   「特殊」（例: 「召喚(特殊)」「号令(特殊)」「探索(特殊)」）
 * - 1つのtargetがある場合:
 *   キーワード名またはカード名（例: 「召喚(傭兵)」「号令(傭兵)」「探索(傭兵)」「召喚(騎士)」）
 * - target指定がない場合（通常版）:
 *   null（通常のスキル名と数値を表示）
 *
 * @param {Object|string} sk - スキルオブジェクト（{ id, targetIds, targetId, targetKeyword, ... }）またはスキルID文字列
 * @returns {string|null} カッコ内に表示する対象ラベル文字列（'特殊' または対象の名前）。ターゲット指定がない場合は null
 */
export function getSkillTargetLabel(sk) {
  if (!sk || typeof sk !== 'object') return null;

  // 0. self プロパティ（自分自身を対象とする指定）
  if (sk.self || sk.targetSelf) {
    if (sk.excludeBoard) {
      return '唯一/自身';
    }
    return '自身';
  }

  // 0.5. targetToken プロパティ（トークンを対象とする指定）
  if (sk.targetToken || sk.targetType === 'token') {
    if (sk.excludeBoard) {
      return '唯一/トークン';
    }
    return 'トークン';
  }

  // 1. targetIds（配列）または targetId（単一ID）を配列に正規化
  const rawIds = Array.isArray(sk.targetIds)
    ? sk.targetIds.filter(Boolean)
    : sk.targetId
      ? [sk.targetId]
      : [];
  // 重複を除去
  const targetIds = [...new Set(rawIds)];

  // 2. targetKeyword（キーワード文字列）を取得
  const targetKeyword =
    typeof sk.targetKeyword === 'string' && sk.targetKeyword.trim() !== ''
      ? sk.targetKeyword.trim()
      : null;

  // 3. targetSkills（スキルID配列または文字列）または targetSkill（単一スキルID）を取得
  const rawSkillIds = Array.isArray(sk.targetSkills)
    ? sk.targetSkills.filter(Boolean)
    : typeof sk.targetSkills === 'string' && sk.targetSkills.trim() !== ''
      ? [sk.targetSkills.trim()]
      : sk.targetSkill
        ? [sk.targetSkill]
        : [];
  const targetSkills = [...new Set(rawSkillIds)];

  // 4. ターゲットの合計数をカウント
  const totalTargets =
    targetIds.length + (targetKeyword ? 1 : 0) + targetSkills.length;

  let baseLabel = null;
  // 複数のtargetがある場合は「特殊」を返す
  if (totalTargets > 1) {
    baseLabel = '特殊';
  } else if (targetKeyword) {
    // 1つのtargetとしてキーワードがある場合はそのキーワードを返す
    baseLabel = targetKeyword;
  } else if (targetIds.length === 1) {
    // 1つのtargetとしてカードIDがある場合はカード名（見つからなければID）を返す
    const cardId = targetIds[0];
    const card = CARD_MASTER?.find((c) => c.id === cardId);
    baseLabel = card ? card.name : cardId;
  } else if (targetSkills.length === 1) {
    // 1つのtargetとしてスキルIDがある場合はスキル名（見つからなければID）を返す
    const sId = targetSkills[0];
    const skDef = SKILLS?.[sId];
    baseLabel = skDef ? skDef.name : sId;
  }

  // 5. excludeBoard（自陣盤面存在カード除外）プロパティがある場合
  if (sk.excludeBoard) {
    if (baseLabel) {
      return `唯一/${baseLabel}`;
    }
    return '唯一';
  }

  return baseLabel;
}

/**
 * 対象指定に応じて表示名（ターゲットラベル）を動的に変化させる召喚・探索系スキルID一覧。
 * @type {ReadonlyArray<string>}
 */
export const TARGET_RULE_SKILLS = Object.freeze([
  'summon',
  'call',
  'explore',
  'resurrect',
  'assemble',
]);

/**
 * スキル集約（同一スキルの count++ マージ）から除外すべきかを判定する共通関数。
 * 「選択（choice）」「命令（force）」「覇道（supremacy）」、および
 * ターゲットラベルが付与された特殊召喚スキル（summon, call, explore, resurrect, assemble）は
 * 固有の分岐情報や対象情報を持つため、重複集約せず個別に表示します。
 *
 * @param {Object|string} sk - 判定対象のスキルオブジェクトまたはスキルID
 * @returns {boolean} マージから除外すべき場合は true
 */
export function isSkillMergeExcluded(sk) {
  if (!sk) return false;
  const id = typeof sk === 'string' ? sk : sk.id;
  if (id === 'choice' || id === 'force' || id === 'supremacy') return true;
  return TARGET_RULE_SKILLS.includes(id) && Boolean(getSkillTargetLabel(sk));
}

/**
 * スキルオブジェクトから表示用の名前、値、アイコン、結合名を解決する共通ヘルパー関数
 * @param {object|string} sk - スキル定義オブジェクトまたはスキルID文字列
 * @returns {{ id: string, name: string, value: string|number, icon: string, fullName: string, targetId: string|null, targetIds: Array|null, targetKeyword: string|null }}
 */
export function getSkillBadgeInfo(sk) {
  if (!sk) {
    return {
      id: '',
      name: '',
      value: '',
      icon: '',
      fullName: '',
      targetId: null,
      targetIds: null,
      targetKeyword: null,
      self: false,
    };
  }
  const id = typeof sk === 'string' ? sk : sk.id;
  const val = typeof sk === 'string' ? '' : (sk.value ?? '');
  const targetId = typeof sk === 'object' ? sk.targetId : null;
  const targetIds = typeof sk === 'object' ? sk.targetIds : null;
  const targetKeyword = typeof sk === 'object' ? sk.targetKeyword : null;
  const isSelf =
    typeof sk === 'object' ? Boolean(sk.self || sk.targetSelf) : false;
  const s = SKILLS[id];
  if (!s) {
    const fallbackName = String(id || '');
    return {
      id,
      name: fallbackName,
      value: val,
      icon: '❓',
      fullName: `${fallbackName}${val !== '' && val !== undefined ? val : ''}`,
      targetId,
      targetIds,
      targetKeyword,
      self: isSelf,
    };
  }

  let displayName = s.name;
  let displayVal = val;

  // 召喚(summon)、号令(call)、探索(explore)、復活(resurrect)、召集(assemble)のターゲット別共通表示処理
  if (TARGET_RULE_SKILLS.includes(id)) {
    const targetLabel = getSkillTargetLabel(sk);
    if (targetLabel) {
      displayName = `${s.name}(${targetLabel})`;
      displayVal = '';
    } else {
      displayName = s.name;
      displayVal = val;
    }
  }

  const fullName = `${displayName}${displayVal !== '' && displayVal !== undefined ? displayVal : ''}`;
  return {
    id,
    name: displayName,
    value: displayVal,
    icon: s.icon,
    fullName,
    targetId,
    targetIds,
    targetKeyword,
    self: isSelf,
  };
}

/**
 * 状態（ステータス）のバッジHTML文字列を生成する内部ヘルパー。
 * @param {string} statusId - 状態ID
 * @param {number} [value=1] - 状態の値または持続ターン数
 * @returns {string} バッジHTML
 */
function createStatusBadgeHtml(statusId, value = 1) {
  const def = STATUSES[statusId];
  if (!def) return '';
  const iconStr = def.icon ? `${def.icon} ` : '';
  if (statusId === 'valkyria_guard') {
    return `<div class="card-skill ${def.badgeClass}">${iconStr}${def.name}</div>`;
  }
  return `<div class="card-skill ${def.badgeClass}">${iconStr}${def.name}${value}</div>`;
}

/**
 * カードに付与されているスキルのバッジHTML文字列を生成する。
 * スキル枠（card.skills）のスロット順（付与された時系列順）に従って上から下へ描画します。
 *
 * @param {Object} card - 対象のカードオブジェクト
 * @param {boolean} [isBoard=false] - 盤面配置中かどうか
 * @param {boolean|null} [valkyriaGuardActive=null] - 戦乙女の加護が有効かどうか（nullの場合はGameStateからフォールバック取得）
 * @returns {string} スキルバッジのHTML文字列
 */
export function renderSkillTag(
  card,
  isBoard = false,
  valkyriaGuardActive = null
) {
  if (!card) return '';

  const badges = [];
  const renderedStatuses = new Set();

  // 戦乙女の加護（盤面全体の加護効果発動時、カード自身が持っていなくても付与表示）
  const isGuardActive =
    isBoard &&
    (Boolean(card?.valkyriaGuard) ||
      (card?.valkyriaGuardTurns || 0) > 0 ||
      (valkyriaGuardActive !== null
        ? valkyriaGuardActive
        : card.owner && typeof GameState !== 'undefined'
          ? card.owner === 'blue'
            ? (GameState.valkyriaGuardBlue || 0) > 0
            : (GameState.valkyriaGuardRed || 0) > 0
          : false));

  // 1. スキル枠（card.skills）のスロット順（付与順）にバッジアイテムを生成
  /**
   * スキル対象カードID配列から比較・重複マージ用のキー文字列を生成する。
   *
   * @param {Array<string>|null|undefined} ids - 対象カードID配列
   * @returns {string} カンマ区切りのID文字列（配列でない場合は空文字列）
   */
  const targetIdsKey = (ids) => (Array.isArray(ids) ? ids.join(',') : '');
  const slotItems = [];

  if (Array.isArray(card.skills)) {
    for (const sk of card.skills) {
      if (!sk) continue;
      const id = typeof sk === 'string' ? sk : sk.id;

      // 状態（ステータス）エントリの判定
      const isStatusEntry =
        Boolean(sk.isStatus) ||
        id === 'invincible' ||
        id === 'corrosion' ||
        id === 'stun' ||
        id === 'valkyria_guard' ||
        id === 'cant_attack';

      if (isStatusEntry) {
        if (!renderedStatuses.has(id)) {
          let val = sk.value !== undefined && sk.value !== null ? sk.value : 1;
          // 直接プロパティがあれば最新値を同期（未所持や0の場合は確実に0とする）
          if (id === 'corrosion')
            val = card.corrosion !== undefined ? card.corrosion : val;
          else if (id === 'stun')
            val = card.stunTurns !== undefined ? card.stunTurns : val;
          else if (id === 'invincible')
            val =
              card.invincibleTurns !== undefined ? card.invincibleTurns : val;
          else if (id === 'cant_attack')
            val =
              card.cantAttackTurns !== undefined ? card.cantAttackTurns : val;

          // 加護は盤面全体の加護判定（isGuardActive）を考慮し、それ以外の状態異常は正の値（val > 0）のみ表示
          const shouldShow = id === 'valkyria_guard' ? isGuardActive : val > 0;

          if (shouldShow) {
            slotItems.push({
              type: 'status',
              statusId: id,
              value: val,
              html: createStatusBadgeHtml(id, val),
            });
            renderedStatuses.add(id);
          }
        }
        continue;
      }

      // 通常スキルの判定
      const s = SKILLS[id];
      if (s && id !== 'none' && s.name !== '通常') {
        const isResolved = card.skillTriggered || Boolean(sk && sk.triggered);
        const showBadge =
          !isBoard ||
          (!BOARD_NEVER_SHOW_SKILL_IDS.includes(id) &&
            (!isResolved || !ACTIVE_SKILLS.includes(id)));

        if (showBadge) {
          const info = getSkillBadgeInfo(sk);
          const isExcludedFromMerge = isSkillMergeExcluded(info);
          const existing = isExcludedFromMerge
            ? null
            : slotItems.find(
                (item) =>
                  item.type === 'skill' &&
                  item.id === info.id &&
                  item.value === info.value &&
                  item.targetId === info.targetId &&
                  item.targetKeyword === info.targetKeyword &&
                  targetIdsKey(item.targetIds) === targetIdsKey(info.targetIds)
              );

          if (existing) {
            existing.count++;
          } else {
            slotItems.push({
              type: 'skill',
              id: info.id,
              name: info.name,
              icon: info.icon,
              value: info.value,
              targetId: info.targetId,
              targetIds: info.targetIds,
              targetKeyword: info.targetKeyword,
              count: 1,
            });
          }
        }
      }
    }
  }

  // 2. スロット順のバッジHTMLを構築
  for (const item of slotItems) {
    if (item.type === 'status') {
      badges.push(item.html);
    } else if (item.type === 'skill') {
      const countSuffix = item.count > 1 ? ` * ${item.count}` : '';
      badges.push(
        `<div class="card-skill">${item.icon} ${item.name}${item.value}${countSuffix}</div>`
      );
    }
  }

  // 3. レガシー互換・外部設定（直接プロパティ）のフォールバック
  if (isGuardActive && !renderedStatuses.has('valkyria_guard')) {
    badges.unshift(createStatusBadgeHtml('valkyria_guard', 1));
    renderedStatuses.add('valkyria_guard');
  }

  const invincibleTurns =
    (card.invincibleTurns || 0) > 0
      ? card.invincibleTurns
      : Array.isArray(card.skills)
        ? card.skills.find(
            (s) => s && (s.id === 'invincible' || s === 'invincible')
          )?.value || 0
        : 0;
  if (invincibleTurns > 0 && !renderedStatuses.has('invincible')) {
    badges.push(createStatusBadgeHtml('invincible', invincibleTurns));
    renderedStatuses.add('invincible');
  }

  if (card.stunTurns > 0 && !renderedStatuses.has('stun')) {
    badges.push(createStatusBadgeHtml('stun', card.stunTurns));
    renderedStatuses.add('stun');
  }

  if ((card.corrosion || 0) > 0 && !renderedStatuses.has('corrosion')) {
    badges.push(createStatusBadgeHtml('corrosion', card.corrosion));
    renderedStatuses.add('corrosion');
  }

  if (card.cantAttackTurns > 0 && !renderedStatuses.has('cant_attack')) {
    badges.push(createStatusBadgeHtml('cant_attack', card.cantAttackTurns));
    renderedStatuses.add('cant_attack');
  }

  if (badges.length === 0) return '';
  return `<div class="card-skill-container">${badges.join('')}</div>`;
}
window.renderSkillTag = renderSkillTag;
window.getSkillBadgeInfo = getSkillBadgeInfo;
window.getSkillTargetLabel = getSkillTargetLabel;
window.stripEphemeralSkills = stripEphemeralSkills;
window.grantCardStatus = grantCardStatus;
window.removeCardStatus = removeCardStatus;
window.syncCardStatuses = syncCardStatuses;

/**
 * セーブデータ(LocalStorage)を保持したまま、キャッシュとサービスワーカーを完全にクリアする。
 * 完了時またはエラー時にPromiseを解決します。
 * @returns {Promise<void>}
 */
export async function clearCachesAndServiceWorkers() {
  const appScope = new URL(
    import.meta.env.BASE_URL || '/',
    window.location.origin
  ).href;

  // iOS Safariの getRegistrations ハングバグを完全に回避するため、
  // 登録解除およびキャッシュ削除の Promise は await せず、即座にリロードへ進むためのタイムアウトを設定する。
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 150));

  const cleanPromise = (async () => {
    const tasks = [];
    try {
      // 1. ready から直接解除 (最速・高信頼)
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        tasks.push(
          navigator.serviceWorker.ready
            .then((reg) => {
              if (reg && reg.unregister) return reg.unregister();
            })
            .catch(() => {})
        );
      }

      // 2. getRegistrations による全解除
      if ('serviceWorker' in navigator) {
        tasks.push(
          navigator.serviceWorker
            .getRegistrations()
            .then((registrations) => {
              const unregPromises = registrations.map((reg) => {
                if (reg.scope && reg.scope.startsWith(appScope)) {
                  return reg.unregister().catch(() => {});
                }
              });
              return Promise.all(unregPromises.filter(Boolean));
            })
            .catch(() => {})
        );
      }

      // 3. Cache Storage の削除
      if ('caches' in window) {
        tasks.push(
          caches
            .keys()
            .then((names) => {
              const delPromises = names.map((name) => {
                return caches.delete(name).catch(() => {});
              });
              return Promise.all(delPromises);
            })
            .catch(() => {})
        );
      }

      // すべての削除タスクが完了（成功または失敗）するのを待つ
      await Promise.allSettled(tasks);
    } catch (e) {
      console.warn('[CacheClear] Error during async purge', e);
    }
  })();

  // 150ms 経過するか、または削除が完了したら即座に完了とする
  await Promise.race([cleanPromise, timeoutPromise]);
}

/**
 * 装備カードの合体処理（パワー加算・スキル統合・選択肢引継ぎ・武装消費・重複防止）を実行します。
 * @param {object} target - 装備される対象カード
 * @param {object} equipment - 装備するカード
 * @param {Set} [movedIds] - 移動済みカードID集合（移動による装備時のみ使用）
 * @returns {{ equipSkills: Array<object> }} 統合された装備スキルの配列
 */
export function applyEquipment(target, equipment, movedIds) {
  if (!target || !equipment) return { equipSkills: [] };

  target.equippedCards = target.equippedCards || [];
  if (
    target.equippedCards.some(
      (ec) => ec.uid && equipment.uid && ec.uid === equipment.uid
    )
  ) {
    return { equipSkills: [] };
  }

  const equipPower = equipment.currentPower ?? equipment.power ?? 0;
  const currentPower = target.currentPower ?? target.power ?? 0;

  target.power = (target.power || 0) + equipPower;
  target.basePower = (target.basePower || 0) + equipPower;
  target.currentPower = currentPower + equipPower;

  // 装備前の土台カードが元々「移動」スキルを持っていたかを記録
  const targetHadMove = hasSkill(target, 'move');

  // スキルの統合
  const equipSkills = (equipment.skills || []).filter(
    (skill) => skill.id !== 'equip'
  );
  if (equipSkills.length > 0) {
    mergeCardSkills(target, equipSkills);
  }

  // choice / force スキルがある場合は、装備元の選択肢（重複含む全選択肢）を引き継ぐ
  if (equipment.choices && equipment.choices.length > 0) {
    target.choices = target.choices || [];
    equipment.choices.forEach((pc) => {
      target.choices.push({ ...pc });
    });
  }
  if (equipment.choices2 && equipment.choices2.length > 0) {
    target.choices2 = target.choices2 || [];
    equipment.choices2.forEach((pc) => {
      target.choices2.push({ ...pc });
    });
  }

  // 装備時に実際に加算したパワー値を記録（解除時に同値を正確に減算するため）
  equipment.appliedEquipPower = equipPower;

  target.equippedCards.push(equipment);
  consumeArmSelf(target, equipment);

  if (movedIds) {
    // 移動した装備カード自身のIDを移動済みに追加
    movedIds.add(equipment.uid || equipment.id);
    // 土台カードが元々移動スキルを持っていなかった場合は、装備によって新たに得た移動での即時2重移動を防ぐため移動済みに追加
    if (!targetHadMove) {
      movedIds.add(target.uid || target.id);
    }
  }

  return { equipSkills };
}

/**
 * applyEquipment の後方互換用エイリアス。
 * @param {object} targetCard - 装備される側のカード
 * @param {object} equipCard - 装備する側のカード
 * @returns {{ equipSkills: Array<object> }}
 */
export function applyEquipMerge(targetCard, equipCard) {
  return applyEquipment(targetCard, equipCard);
}

/**
 * 相手のポイントと自分のポイントを比較して獲得ポイント（ティア）を判定する
 * @param {number} pTotalPoints - 相手の総ポイント数
 * @param {number} myTotalPoints - 自分の総ポイント数
 * @returns {number} 獲得ポイント（1 | 3 | 5）
 */
export function resolveWinTier(pTotalPoints, myTotalPoints) {
  if (pTotalPoints > myTotalPoints) {
    if (pTotalPoints >= myTotalPoints * 2 && myTotalPoints > 0) {
      return 5;
    }
    return 3;
  }
  return 1;
}

/**
 * 防衛戦の選出キャッシュを保存する
 * @param {Array} players - 選出されたプレイヤーのリスト
 */
export function saveCachedDefenseTargets(players) {
  if (!players) return;
  const uuids = players.map((p) => p.uuid);
  localStorage.setItem(DEFENSE_TARGETS_STORAGE_KEY, JSON.stringify(uuids));
}

/**
 * 防衛戦の対戦相手プレイヤーを選出する（キャッシュ考慮）
 * @param {Array} otherPlayers - 自分以外の全プレイヤーリスト
 * @param {number} myTotalPoints - 自分の総ポイント数
 * @returns {Array} 選出されたプレイヤーリスト
 */
export function selectDefenseTargets(otherPlayers, myTotalPoints) {
  let selectedPlayers = [];
  const cachedUuidsRaw = localStorage.getItem(DEFENSE_TARGETS_STORAGE_KEY);

  if (cachedUuidsRaw) {
    try {
      const cachedUuids = JSON.parse(cachedUuidsRaw);
      if (Array.isArray(cachedUuids) && cachedUuids.length > 0) {
        selectedPlayers = cachedUuids
          .map((uuid) => otherPlayers.find((p) => p.uuid === uuid))
          .filter(Boolean);
      }
    } catch (e) {
      console.error('Failed to parse cached defense targets:', e);
    }
  }

  // 部分的欠落時の補填処理
  if (
    selectedPlayers.length > 0 &&
    selectedPlayers.length < DEFENSE_TARGET_COUNT &&
    selectedPlayers.length < otherPlayers.length
  ) {
    const chosenUuids = new Set(selectedPlayers.map((p) => p.uuid));
    const remaining = otherPlayers.filter((p) => !chosenUuids.has(p.uuid));
    const shufRemaining = shuffleArray(remaining);
    const needed = DEFENSE_TARGET_COUNT - selectedPlayers.length;
    for (let i = 0; i < Math.min(needed, shufRemaining.length); i++) {
      selectedPlayers.push(shufRemaining[i]);
    }
    // キャッシュを更新
    saveCachedDefenseTargets(selectedPlayers);
  }

  // キャッシュがない場合は新規に選出
  if (selectedPlayers.length === 0) {
    // グループ分け
    // ① 自分より2倍以上（5ポイント獲得可能）
    const group5 = otherPlayers.filter(
      (p) => resolveWinTier(p.displayTotalPoints, myTotalPoints) === 5
    );
    // ② 自分より上（3ポイント獲得可能）
    const group3 = otherPlayers.filter(
      (p) => resolveWinTier(p.displayTotalPoints, myTotalPoints) === 3
    );
    // ③ 自分より下・同等（1ポイント獲得可能）
    const group1 = otherPlayers.filter(
      (p) => resolveWinTier(p.displayTotalPoints, myTotalPoints) === 1
    );

    const shuf5 = shuffleArray(group5);
    const shuf3 = shuffleArray(group3);
    const shuf1 = shuffleArray(group1);

    const picked = [];
    const chosenUuids = new Set();

    // 1. 自分より2倍以上
    for (let i = 0; i < Math.min(HIGH_TIER_PICK_COUNT, shuf5.length); i++) {
      const p = shuf5[i];
      picked.push(p);
      chosenUuids.add(p.uuid);
    }

    // 2. 自分より上
    for (let i = 0; i < Math.min(MID_TIER_PICK_COUNT, shuf3.length); i++) {
      const p = shuf3[i];
      picked.push(p);
      chosenUuids.add(p.uuid);
    }

    // 3. 自分より下・同等
    for (let i = 0; i < Math.min(LOW_TIER_PICK_COUNT, shuf1.length); i++) {
      const p = shuf1[i];
      picked.push(p);
      chosenUuids.add(p.uuid);
    }

    // 5名に満たない場合、残りのプールから補填する
    if (
      picked.length < DEFENSE_TARGET_COUNT &&
      otherPlayers.length > picked.length
    ) {
      const remaining = otherPlayers.filter((p) => !chosenUuids.has(p.uuid));
      const shufRemaining = shuffleArray(remaining);
      const needed = DEFENSE_TARGET_COUNT - picked.length;
      for (let i = 0; i < Math.min(needed, shufRemaining.length); i++) {
        picked.push(shufRemaining[i]);
      }
    }

    selectedPlayers = picked;
    // キャッシュに保存
    saveCachedDefenseTargets(selectedPlayers);
  }

  return selectedPlayers;
}

/**
 * プレイヤー名を解決する共通ユーティリティ（トリム・フォールバック対応）
 * @param {string} [providedName] - 優先的に使用するプレイヤー名（手動入力など）
 * @returns {string} 解決されたプレイヤー名
 */
export function resolvePlayerName(providedName = null) {
  const fromProvided = providedName?.trim();
  if (fromProvided) return fromProvided;

  const fromProfile = GameState.userProfile?.name?.trim();
  if (fromProfile) return fromProfile;

  const fromStorage = localStorage.getItem(PROFILE_NAME_KEY)?.trim();
  if (fromStorage) return fromStorage;

  return DEFAULT_PLAYER_NAME;
}

/**
 * イベントのゲームモード名から敵キャラクターIDを抽出します。
 * @param {string} gameMode - ゲームモード名 (例: 'event_automata_fortune', 'event_oni_high')
 * @returns {string} 敵キャラクターID (例: 'automata', 'oni')
 */
export function getEventEnemyCharId(gameMode) {
  if (!gameMode || !gameMode.startsWith('event_')) return '';
  return gameMode
    .replace('event_', '')
    .replace('_fortune', '')
    .replace('_high', '');
}

/**
 * 指定されたゲームモードが運命の邂逅（_fortune）モードであるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} 運命の邂逅モードであるか
 */
export function checkIsFortuneMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  if (!gameMode) return false;
  return gameMode.startsWith('event_') && gameMode.endsWith('_fortune');
}

/**
 * 指定されたゲームモードが高難易度（_high）モードであるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} 高難易度モードであるか
 */
export function checkIsHighDiffMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  if (!gameMode) return false;
  return (
    gameMode === 'high_difficulty' ||
    (gameMode.startsWith('event_') && gameMode.endsWith('_high'))
  );
}

/**
 * 指定されたゲームモードがストーリーモードであるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} ストーリーモードであるか
 */
export function checkIsStoryMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  if (!gameMode) return false;
  return gameMode === 'story' || gameMode.startsWith('story');
}

/**
 * 指定されたゲームモードが試練の宮殿（ダンジョン）モードであるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} ダンジョンモードであるか
 */
export function checkIsDungeonMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  return gameMode === 'battle_dungeon' || gameMode === 'dungeon';
}

/**
 * 指定されたゲームモードが防衛戦モード（攻撃または防衛登録）であるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} 防衛戦モードであるか
 */
export function checkIsDefenseMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  return gameMode === 'defense_attack' || gameMode === 'defense_register';
}

/**
 * 指定されたゲームモードがフリー対戦であるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} フリー対戦モードであるか
 */
export function checkIsFreeMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  return gameMode === 'free';
}

/**
 * 指定されたゲームモードがバトル勝利時にカードドロップ抽選の対象であるかどうかを判定します（ホワイトリスト方式）。
 * 対象モード: ストーリーモード、フリー対戦、高難易度イベント（超級）
 * ※ 運命の邂逅、トーナメント、防衛戦、試練の宮殿、オンライン、練習戦、チュートリアル等の他モードはすべて自動的に除外（false）されます。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} カードドロップ対象モードであるか
 */
export function checkIsCardDropEligible(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  if (!gameMode) return false;
  return (
    checkIsStoryMode(gameMode) ||
    checkIsFreeMode(gameMode) ||
    checkIsHighDiffMode(gameMode)
  );
}

/**
 * 指定されたゲームモードがバトルボーナス（ミッション）機能の対象であるかどうかを判定します。
 * ストーリーモード、フリー対戦、および高難易度イベントモードが対象となります。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} バトルボーナス対象モードであるか
 */
export function checkIsMissionEligible(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  if (!gameMode) return false;
  // 各ゲームモードの判定ヘルパー関数を組み合わせて、対象モードかどうかを判定する
  return (
    checkIsStoryMode(gameMode) ||
    checkIsFreeMode(gameMode) ||
    checkIsHighDiffMode(gameMode)
  );
}

/**
 * バトルボーナス（ミッション）のボタンを表示するかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @param {Object} [enemyConfig] - 敵設定情報（省略時は GameState.enemyConfig）
 * @returns {boolean} バトルボーナスボタンを表示するか
 */
export function checkShowMissionButton(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined,
  enemyConfig = typeof GameState !== 'undefined'
    ? GameState?.enemyConfig
    : undefined
) {
  return !!enemyConfig && checkIsMissionEligible(gameMode);
}

/**
 * 指定されたゲームモードが勝ち抜き組手（トーナメント）モードであるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} トーナメントモードであるか
 */
export function checkIsTournamentMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  return gameMode === 'tournament';
}

/**
 * 指定されたゲームモードがオンライン通信対戦またはオンラインデッキ編集モードであるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} オンライン関連モードであるか
 */
export function checkIsOnlineMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  return gameMode === 'online' || gameMode === 'online_deck_edit';
}

/**
 * 指定されたゲームモードが練習モード（仮想敵デッキ対戦）であるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} 練習モードであるか
 */
export function checkIsPracticeMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  return gameMode === 'practice';
}

/**
 * 指定されたゲームモードが新規デッキ作成モーダル中の状態であるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} 新規デッキ作成モードであるか
 */
export function checkIsCreateDeckMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  return gameMode === 'create_deck';
}

/**
 * 指定されたゲームモードがチュートリアルモードであるかどうかを判定します。
 * @param {string} [gameMode] - ゲームモード名（省略時は GameState.gameMode）
 * @returns {boolean} チュートリアルモードであるか
 */
export function checkIsTutorialMode(
  gameMode = typeof GameState !== 'undefined' ? GameState?.gameMode : undefined
) {
  return gameMode === 'tutorial';
}

/**
 * 現在のAI思考難易度が「初級（AI_LEVEL.EASY）」であるかを安全に判定します。
 * ホワイトリスト方式で AI_LEVEL.EASY との完全一致のみを真とします。
 *
 * @param {object} [gameState] - 対象のゲームステートオブジェクト（省略時はグローバル GameState）
 * @return {boolean} AI_LEVEL.EASY であれば true、それ以外は false
 */
export function checkIsEasyAI(
  gameState = typeof GameState !== 'undefined' ? GameState : undefined
) {
  return (
    typeof gameState?.aiLevel !== 'undefined' &&
    gameState.aiLevel === AI_LEVEL.EASY
  );
}

/**
 * 現在のAI思考難易度が「通常（AI_LEVEL.NORMAL）」であるかを安全に判定します。
 * ホワイトリスト方式で AI_LEVEL.NORMAL との完全一致のみを真とします。
 *
 * @param {object} [gameState] - 対象のゲームステートオブジェクト（省略時はグローバル GameState）
 * @return {boolean} AI_LEVEL.NORMAL であれば true、それ以外は false
 */
export function checkIsNormalAI(
  gameState = typeof GameState !== 'undefined' ? GameState : undefined
) {
  return (
    typeof gameState?.aiLevel !== 'undefined' &&
    gameState.aiLevel === AI_LEVEL.NORMAL
  );
}

/**
 * 特級目標（ハンディキャップ）のローカルストレージ保存キーを生成します。
 * @param {string} enemyCharId - 敵キャラクターID
 * @returns {string} 保存キー名
 */
export function getFortuneHandicapsStorageKey(enemyCharId) {
  return `mini_card_battle_fortune_handicaps_${enemyCharId}`;
}

/**
 * 特級目標モードのゲームモード名から敵キャラクターIDを抽出する。
 * 有効なキャラクターID（CHARACTERSの所有キー）と一致する場合のみIDを返し、不正な形式やプロトタイプ継承キーの場合は空文字列を返す。
 * @param {string} gameMode - ゲームモード名（例: 'event_valkyria_fortune'）
 * @returns {string} 抽出および検証済みの敵キャラクターID
 */
export function getFortuneEnemyCharId(gameMode) {
  if (typeof gameMode !== 'string') return '';
  const match = /^event_(.+)_fortune$/.exec(gameMode);
  const charId = match?.[1] ?? '';
  const isValidCharId =
    Boolean(charId) && Object.prototype.hasOwnProperty.call(CHARACTERS, charId);
  return isValidCharId ? charId : '';
}

/**
 * 起動(startup)スキルを持つ既存カードへの上書き失敗時の共通処理
 * 対象カードのstartup/defenderを消費し、演出イベントを積む
 * @param {string} owner - プレイヤー ('blue' | 'red')
 * @param {object} existingCard - 盤面の既存カード
 * @param {number} lane - 対象レーン (0 | 1 | 2)
 * @param {object} popupSourceCard - フェードイン/アウト表示する新しいカードオブジェクト
 * @param {Array} events - 追加先イベント配列
 */
export function resolveStartupFade(
  owner,
  existingCard,
  lane,
  popupSourceCard,
  events
) {
  consumeStartupSkill(existingCard);
  events.push({
    type: 'skill_popup',
    side: owner,
    lane,
    skillName: '起動',
    card: existingCard,
  });
  events.push({
    type: 'power_change',
    side: owner,
    lane,
    amount: 0,
    source: 'startup_fade',
    card: popupSourceCard,
  });
}

/**
 * LocalStorageから安全にJSON配列をパースして読み込む共通ヘルパー
 * @param {string} key LocalStorageのキー
 * @returns {Array} パースされた配列（失敗時は空配列）
 */
export function safeParseArray(key) {
  try {
    let raw = localStorage.getItem(key);
    if (raw && typeof raw === 'string') {
      raw = raw.replace(/[\u200B-\u200D]/g, '');
    }
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`Failed to parse localStorage key "${key}":`, e);
    return [];
  }
}

/**
 * LocalStorageから安全にJSON配列をパースして読み込む共通ヘルパー
 * 未保存時（キーが存在しない、またはnull）やパース失敗・非配列時は null を返します。
 * 空配列 [] と未保存状態（null）を明確に区別したい場合に使用します。
 *
 * @param {string} key LocalStorageのキー
 * @returns {Array|null} パースされた配列、または未保存・パース失敗時は null
 */
export function safeParseArrayOrNull(key) {
  try {
    let raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
      raw = raw.replace(/[\u200B-\u200D]/g, '');
    }
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    console.error(
      `Failed to parse array or null for localStorage key "${key}":`,
      e
    );
    return null;
  }
}

/**
 * LocalStorageから安全にJSONオブジェクトをパースして読み込む共通ヘルパー
 * @param {string} key LocalStorageのキー
 * @returns {Object} パースされたオブジェクト（失敗時や非オブジェクト時は空オブジェクト）
 */
export function safeParseObject(key) {
  try {
    let raw = localStorage.getItem(key);
    if (raw && typeof raw === 'string') {
      raw = raw.replace(/[\u200B-\u200D]/g, '');
    }
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (e) {
    console.error(`Failed to parse object for localStorage key "${key}":`, e);
    return {};
  }
}

/**
 * フィルター選択状態が存在するかチェックする共通関数
 * CardListScreen / DeckEditorScreen 等で共通利用
 * @param {object} filters フィルターオブジェクト
 * @param {string} [defaultOwnership=OWNERSHIP_FILTERS.OWNED_ONLY] デフォルトの所持状態
 * @returns {boolean} 有効なフィルターが存在するかどうか
 */
export function hasActiveFilters(
  filters,
  defaultOwnership = OWNERSHIP_FILTERS.OWNED_ONLY
) {
  if (!filters) return false;
  return (
    (filters.ownership && filters.ownership !== defaultOwnership) ||
    (filters.rarity && filters.rarity.length > 0) ||
    (filters.power && filters.power.length > 0) ||
    (filters.skills && filters.skills.length > 0) ||
    (filters.excludeSkills && filters.excludeSkills.length > 0) ||
    !!filters.name
  );
}

/**
 * 指定されたDOM要素に anim-shake クラスを付与し、シェイクアニメーションを（再）トリガーする。
 * 既にアニメーション中の場合もリフローを挟んで確実に再発火させる。
 * アニメーション終了時にクラスを自動的に除去するクリーンアップリスナーも登録する。
 * @param {HTMLElement|null} element - シェイクを適用する対象要素（null の場合は何もしない）
 * @returns {void}
 */
export function triggerShakeAnimation(element) {
  if (!element) return;
  element.classList.remove('anim-shake');
  void element.offsetWidth; // リフローを発生させてアニメーションを再トリガー
  element.classList.add('anim-shake');
  element.addEventListener(
    'animationend',
    () => element.classList.remove('anim-shake'),
    { once: true }
  );
}

/**
 * サーバー由来の画像URLや各種画像パスについて、ローカル開発環境（localhost / 127.0.0.1）では
 * 自動的にローカルのアセットパス（/assets/...）に補正・解決して返却するユーティリティ関数。
 *
 * @param {string} url - 変換前の画像URL（相対パスまたはフルURL）
 * @returns {string} 補正後の画像URL
 */
export function resolveAssetUrl(url) {
  if (!url) return '';
  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.'));

  if (isLocal) {
    try {
      const baseUrl =
        typeof window !== 'undefined' && window.location
          ? window.location.href
          : 'http://localhost';
      const parsedUrl = new URL(url, baseUrl);
      const match = parsedUrl.pathname.match(/\/assets\/(.+)$/i);
      if (match) {
        return `/assets/${match[1]}${parsedUrl.search}${parsedUrl.hash}`;
      }
    } catch {
      // 解析不能な文字列のフォールバック
    }
  }

  // 先頭が assets/ で始まっている場合は相対パス ./assets/ に補正
  if (url.startsWith('assets/')) {
    return './' + url;
  }

  return url;
}

/**
 * 高難易度イベントの初回クリア状況マップを取得する。
 * 各ボスの初回ボーナス（10Pt）受け取り済み判定用。
 *
 * @returns {Record<string, boolean>} ボスIDをキーとするクリア状況マップ (例: { android: true, satan: true })
 */
export function loadHighDifficultyClearedData() {
  try {
    const raw = localStorage.getItem(HIGH_DIFFICULTY_CLEARED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (e) {
    console.error('高難易度クリア状態の読み込みに失敗しました:', e);
    return {};
  }
}

/**
 * 高難易度イベントの特定ボスをクリア済みにマークして保存する。
 *
 * @param {string} charId - クリアしたボスのキャラクターID
 * @returns {Record<string, boolean>} 更新後のクリア状況マップ
 */
export function saveHighDifficultyClearedData(charId) {
  if (!charId) return loadHighDifficultyClearedData();
  const current = loadHighDifficultyClearedData();
  current[charId] = true;
  try {
    localStorage.setItem(HIGH_DIFFICULTY_CLEARED_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('高難易度クリア状態の保存に失敗しました:', e);
  }
  return current;
}

/**
 * カードオブジェクトから選択肢スキル配列（choices / choices2）を解決・取得する共通ユーティリティ関数。
 * カードインスタンス上に choices / choices2 が直接保持されていない場合、
 * 正規化ID（baseId || id）をもとに CARD_MASTER から検索してフォールバック解決を行う。
 *
 * @param {object|null|undefined} card - 対象のカードオブジェクト
 * @returns {{ choices: Array|undefined, choices2: Array|undefined }} 解決された choices および choices2 を含むオブジェクト
 */
export function resolveCardChoices(card) {
  if (!card || typeof card !== 'object') {
    return { choices: undefined, choices2: undefined };
  }
  const lookupId = card.baseId || card.id;
  const master = lookupId
    ? CARD_MASTER.find((m) => m.id === lookupId)
    : undefined;
  const choices = card.choices || master?.choices;
  const choices2 = card.choices2 || master?.choices2;
  return { choices, choices2 };
}

/**
 * カードオブジェクトから覇道スキル配列（supremacySkills）を解決・取得する共通ユーティリティ関数。
 * カードインスタンス上に supremacySkills が直接保持されていない場合、
 * 正規化ID（baseId || id）をもとに CARD_MASTER から検索してフォールバック解決を行う。
 *
 * @param {object|null|undefined} card - 対象のカードオブジェクト
 * @returns {Array|undefined} 解決された supremacySkills 配列
 */
export function resolveCardSupremacySkills(card) {
  if (!card || typeof card !== 'object') {
    return undefined;
  }
  const lookupId = card.baseId || card.id;
  const master = lookupId
    ? CARD_MASTER.find((m) => m.id === lookupId)
    : undefined;
  return card.supremacySkills || master?.supremacySkills;
}

/**
 * カードが特定のスキルを保持しているかを判定する。
 * 通常の skills 配列に加えて、「選択」「命令」の choices / choices2 や、
 * 「覇道」の supremacySkills に内包されるスキルも再帰的・網羅的に精査する。
 *
 * @param {object|null|undefined} card - 判定対象のカードオブジェクト
 * @param {string} skillId - 検索対象のスキルID
 * @returns {boolean} 指定スキルを直接または選択肢/覇道内に保持している場合は true
 */
export function hasSkillDeep(card, skillId) {
  if (!card || typeof card !== 'object') return false;

  // 1. 通常のスキル判定（hasSkill: skills配列や拘束状態チェック）
  if (hasSkill(card, skillId)) return true;

  // 2. 「選択」「命令」などの選択肢候補（choices / choices2）を精査
  const { choices, choices2 } = resolveCardChoices(card);
  if (Array.isArray(choices) && choices.some((s) => s && s.id === skillId)) {
    return true;
  }
  if (Array.isArray(choices2) && choices2.some((s) => s && s.id === skillId)) {
    return true;
  }

  // 3. 「覇道」の候補（supremacySkills）を精査
  const supremacySkills = resolveCardSupremacySkills(card);
  if (
    Array.isArray(supremacySkills) &&
    supremacySkills.some((s) => s && s.id === skillId)
  ) {
    return true;
  }

  return false;
}

/**
 * カードが指定のカードIDに一致するか判定する。
 * 「万相（all_forms）」スキルを持つカードは、すべてのカード名およびカードIDと同じとして扱われるため、
 * targetIdが指定されている場合は常に一致（true）とみなされる。
 *
 * @param {object|null|undefined} card - 判定対象のカードオブジェクト
 * @param {string} targetId - 対象のカードID
 * @returns {boolean} 一致する場合は true
 */
export function matchesCardId(card, targetId) {
  if (!card || !targetId) return false;
  // 万相（all_forms）スキル所持カードはあらゆるカードIDと同じとして扱う
  if (hasSkill(card, 'all_forms')) return true;
  return (
    card.id === targetId || (Boolean(card.baseId) && card.baseId === targetId)
  );
}

/**
 * カードが指定のカードID配列のいずれかに一致するか判定する。
 * 「万相（all_forms）」スキルを持つカードは、targetIdsが指定されている場合、常に一致（true）とみなされる。
 *
 * @param {object|null|undefined} card - 判定対象のカードオブジェクト
 * @param {Array<string>} targetIds - 対象カードIDの配列
 * @returns {boolean} いずれかに一致する場合は true
 */
export function matchesCardIds(card, targetIds) {
  if (!card || !Array.isArray(targetIds) || targetIds.length === 0)
    return false;
  // 万相（all_forms）スキル所持カードは指定ID配列に対して常に一致として扱う
  if (hasSkill(card, 'all_forms')) return true;
  return (
    targetIds.includes(card.id) ||
    (Boolean(card.baseId) && targetIds.includes(card.baseId))
  );
}

/**
 * カードが指定のキーワード（カード名部分一致）に一致するか判定する。
 * 「万相（all_forms）」スキルを持つカードは、targetKeywordが指定されている場合、常に一致（true）とみなされる。
 *
 * @param {object|null|undefined} card - 判定対象のカードオブジェクト
 * @param {string} targetKeyword - 対象キーワード
 * @returns {boolean} キーワードに一致する場合は true
 */
export function matchesCardKeyword(card, targetKeyword) {
  if (!card || typeof targetKeyword !== 'string' || !targetKeyword.trim()) {
    return false;
  }
  // 万相（all_forms）スキル所持カードは指定キーワードに対して常に一致として扱う
  if (hasSkill(card, 'all_forms')) return true;
  return (
    typeof card.name === 'string' && card.name.includes(targetKeyword.trim())
  );
}

/**
 * カードが指定の対象条件（targetId, targetIds, targetKeyword, targetSkill, targetSkills）に合致するか判定する。
 * 「万相（all_forms）」スキルを持つカードは、カードIDおよびキーワード条件について常に合致（true）とみなされる。
 *
 * @param {object|null|undefined} card - 判定対象のカードオブジェクト
 * @param {object} [criteria={}] - 照合条件
 * @param {string} [criteria.targetId] - 単一の対象カードID
 * @param {Array<string>} [criteria.targetIds] - 対象カードID配列
 * @param {string} [criteria.targetKeyword] - 対象キーワード
 * @param {string} [criteria.targetSkill] - 単一の対象スキルID
 * @param {string|Array<string>} [criteria.targetSkills] - 対象スキルIDまたは配列
 * @param {boolean} [criteria.targetToken] - トークンカードを対象とするフラグ
 * @param {string} [criteria.targetType] - 対象タイプ（'token'など）
 * @returns {boolean} 条件に合致する場合は true
 */
export function matchesCardTarget(
  card,
  {
    targetId,
    targetIds,
    targetKeyword,
    targetSkill,
    targetSkills,
    targetToken,
    targetType,
  } = {}
) {
  if (!card) return false;
  // トークン限定指定は絞り込み条件として扱い、他の対象条件も継続評価する
  if (targetToken || targetType === 'token') {
    const isTok = Boolean(
      card.isToken ||
      card.id?.startsWith('token_') ||
      card.baseId?.startsWith('token_')
    );
    if (!isTok) return false;
    const hasOtherCriteria =
      Boolean(targetId) ||
      (Array.isArray(targetIds) && targetIds.length > 0) ||
      (typeof targetKeyword === 'string' && targetKeyword.trim() !== '') ||
      Boolean(targetSkill) ||
      Boolean(targetSkills);
    if (!hasOtherCriteria) return true;
  }
  if (targetId && matchesCardId(card, targetId)) return true;
  if (
    Array.isArray(targetIds) &&
    targetIds.length > 0 &&
    matchesCardIds(card, targetIds)
  ) {
    return true;
  }
  if (
    typeof targetKeyword === 'string' &&
    targetKeyword.trim() !== '' &&
    matchesCardKeyword(card, targetKeyword)
  ) {
    return true;
  }

  // targetSkills（スキルID配列または文字列）または targetSkill（単一スキルID）の判定
  const rawSkillIds = Array.isArray(targetSkills)
    ? targetSkills.filter(Boolean)
    : typeof targetSkills === 'string' && targetSkills.trim() !== ''
      ? [targetSkills.trim()]
      : targetSkill
        ? [targetSkill]
        : [];
  if (rawSkillIds.length > 0) {
    const masterCard = CARD_MASTER?.find((m) => m.id === card.id);
    if (
      rawSkillIds.some(
        (sId) =>
          hasSkillDeep(card, sId) ||
          (masterCard && hasSkillDeep(masterCard, sId))
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * カードが合体スキル（union）の合体素材条件を満たしているか判定する。
 * targetId（カードID単体）、targetIds（カードID配列）、または targetKeyword（カード名キーワード部分一致）
 * のいずれかの条件に合致する場合に true を返す。
 * 「万相（all_forms）」スキルを持つカードは、いずれかの素材指定が存在する場合に常に合致（true）とみなされる。
 *
 * @param {object|null|undefined} card - 盤面に存在する合体対象（素材）カード
 * @param {object|null|undefined} unionSkill - 合体スキル定義オブジェクト（{ id: 'union', targetId, targetIds, targetKeyword, summonId, ... }）
 * @returns {boolean} 合体素材として有効な場合 true、それ以外は false
 */
export function matchesUnionMaterial(card, unionSkill) {
  if (!card || !unionSkill) return false;
  return matchesCardTarget(card, unionSkill);
}

/**
 * 盤面に存在するカード（またはカードID）の中に有効な「万相（all_forms）」スキルを持つカードが含まれているか判定する。
 * 万相を持つカードが自陣盤面に存在する場合、そのカードはすべてのカード名・カードIDと同じとして扱われるため、
 * 「唯一（excludeBoard / 自分の場にいない）」効果を持つスキルにおいて、あらゆるカードが「既に自分の場に存在する」とみなされ、
 * 他のカードの名前をすべて占有して場に出す対象から除外する。
 *
 * 【重要】「沈黙（oblivion）」「忘却（silence）」等で能力消去（clearCardAbilities）されたカードは万相能力を喪失しているため、
 * マスターデータではなく実盤面カードオブジェクトの現在のスキル状態（hasSkillDeep）を最優先で評価する。
 *
 * @param {Array<object|string>} [boardCardsOrIds=[]] - 盤面のカードオブジェクト配列（推奨）またはカードID配列
 * @returns {boolean} 有効な万相を持つカードが存在する場合は true、それ以外は false
 */
export function checkHasAllFormsOnBoard(boardCardsOrIds = []) {
  if (!Array.isArray(boardCardsOrIds) || boardCardsOrIds.length === 0) {
    return false;
  }
  // 実カードオブジェクトが1枚でも含まれている場合は、実オブジェクトの現在のスキル状態のみを厳密に評価する（能力消去を反映するため、マスターデータへのフォールバックは行わない）
  const hasCardObjects = boardCardsOrIds.some(
    (item) => item && typeof item === 'object'
  );

  if (hasCardObjects) {
    return boardCardsOrIds.some(
      (item) =>
        item && typeof item === 'object' && hasSkillDeep(item, 'all_forms')
    );
  }

  // 文字列IDのみが渡された場合のフォールバック（マスターデータを参照）
  return boardCardsOrIds.some((item) => {
    if (!item) return false;
    const masterCard = CARD_MASTER?.find((c) => c.id === item);
    return Boolean(masterCard && hasSkillDeep(masterCard, 'all_forms'));
  });
}

/**
 * 盤面カード配列またはID配列から、比較用のカードID一覧（id / baseId）を正規化して取得する。
 *
 * @param {Array<string>} [presentBoardIds=[]] - 盤面カードID配列
 * @param {Array<object>} [presentBoardCards=[]] - 盤面カードオブジェクト配列
 * @returns {Array<string>} 正規化されたカードID配列
 */
function resolvePresentBoardIds(presentBoardIds = [], presentBoardCards = []) {
  if (Array.isArray(presentBoardIds) && presentBoardIds.length > 0) {
    return presentBoardIds;
  }
  if (!Array.isArray(presentBoardCards)) return [];
  return presentBoardCards
    .filter(Boolean)
    .flatMap((c) => [c.id, c.baseId])
    .filter(Boolean);
}

/**
 * 「唯一（excludeBoard）」条件により、対象カードを盤面存在カードとして除外すべきか判定する。
 * 「万相（all_forms）」スキルを持つカードが自陣盤面に存在する場合、すべてのカード名・カードIDを占有しているとみなされ、
 * あらゆるカードが「既に場に存在する」とみなされて除外対象（true）となる。
 *
 * @param {object} card - 判定対象カード
 * @param {Array<string>} resolvedBoardIds - 正規化された盤面カードID配列
 * @param {Array<object>} presentBoardCards - 盤面カードオブジェクト配列
 * @returns {boolean} 除外すべき場合は true
 */
function isExcludedByBoardPresence(card, resolvedBoardIds, presentBoardCards) {
  const hasCards =
    Array.isArray(presentBoardCards) && presentBoardCards.length > 0;
  if (resolvedBoardIds.length === 0 && !hasCards) return false;
  const boardTarget = hasCards ? presentBoardCards : resolvedBoardIds;
  if (checkHasAllFormsOnBoard(boardTarget)) return true;
  return (
    resolvedBoardIds.includes(card.id) ||
    (Boolean(card.baseId) && resolvedBoardIds.includes(card.baseId))
  );
}

/**
 * 対象カードが「召喚（summon）」または「召集（assemble）」スキルの発動条件・対象指定に合致するか判定する共通実体関数。
 * 手札またはデッキからのカード召喚において、同一の判定ロジック・順序（excludeBoard → self → token → targetIds → targetKeyword → targetSkills → value/reqPower）を一元的に保証します。
 *
 * @param {object|null|undefined} card - 判定対象のカードオブジェクト（手札またはデッキ）
 * @param {object|null|undefined} skill - スキル定義オブジェクト（targetIds, targetSkills, targetToken, value 等）
 * @param {object} [options={}] - 判定用オプション
 * @param {string|null} [options.selfId=null] - 発動元カードのIDまたはbaseId（self/targetSelf 指定時の照合用）
 * @param {Array<string>} [options.presentBoardIds=[]] - 盤面に配置済みのカードID配列（excludeBoard 指定時の除外用）
 * @param {Array<object>} [options.presentBoardCards=[]] - 盤面に配置済みの実カードオブジェクト配列（能力消去の反映用）
 * @returns {boolean} 対象として有効であれば true、そうでなければ false
 */
export function matchesHandOrDeckTarget(card, skill, options = {}) {
  if (
    !card ||
    typeof card !== 'object' ||
    !skill ||
    typeof skill !== 'object'
  ) {
    return false;
  }

  const {
    selfId = null,
    presentBoardIds = [],
    presentBoardCards = [],
  } = options;

  const resolvedBoardIds = resolvePresentBoardIds(
    presentBoardIds,
    presentBoardCards
  );

  // 1. excludeBoard: 盤面に既に存在するカード（同名/baseId含む）を除外
  if (
    skill.excludeBoard &&
    isExcludedByBoardPresence(card, resolvedBoardIds, presentBoardCards)
  ) {
    return false;
  }

  // 2. self / targetSelf: 自身と同じカード指定
  const isSelf = Boolean(skill.self || skill.targetSelf);
  if (isSelf && selfId) {
    return matchesCardId(card, selfId);
  }

  // 3. targetToken / targetType === 'token': トークン限定指定
  const isTargetToken = Boolean(
    skill.targetToken || skill.targetType === 'token'
  );
  if (isTargetToken) {
    const isTok = Boolean(
      card.isToken ||
      card.id?.startsWith('token_') ||
      card.baseId?.startsWith('token_')
    );
    if (!isTok) return false;
  }

  // 4. targetIds / targetId: 特定カードID指定
  const targetIds = Array.isArray(skill.targetIds)
    ? skill.targetIds
    : skill.targetId
      ? [skill.targetId]
      : null;
  if (Array.isArray(targetIds) && targetIds.length > 0) {
    return matchesCardIds(card, targetIds);
  }

  // 5. targetKeyword: キーワード指定（属性や種族等）
  if (typeof skill.targetKeyword === 'string' && skill.targetKeyword) {
    return matchesCardKeyword(card, skill.targetKeyword);
  }

  // 6. targetSkills / targetSkill: 特定スキル所持指定
  const rawSkillIds = Array.isArray(skill.targetSkills)
    ? skill.targetSkills.filter(Boolean)
    : typeof skill.targetSkills === 'string' && skill.targetSkills.trim() !== ''
      ? [skill.targetSkills.trim()]
      : skill.targetSkill
        ? [skill.targetSkill]
        : [];
  const targetSkills = [...new Set(rawSkillIds)];
  if (targetSkills.length > 0) {
    const masterCard = CARD_MASTER?.find((m) => m.id === card.id);
    const hasMatchingSkill = targetSkills.some(
      (sId) =>
        hasSkillDeep(card, sId) || (masterCard && hasSkillDeep(masterCard, sId))
    );
    if (!hasMatchingSkill) return false;
  }

  // 7. value / reqPower: パワー制限（指定パワー以下）
  const reqPower = skill.value !== undefined ? skill.value : skill.reqPower;
  if (reqPower !== undefined && reqPower !== null) {
    return (card.power || 0) <= reqPower;
  }

  return true;
}

/**
 * 対象カードが「召喚（summon）」スキルの発動条件・対象指定に合致するか判定する公開関数。
 *
 * @param {object|null|undefined} card - 判定対象の手札カードオブジェクト
 * @param {object|null|undefined} skill - 召喚スキル定義オブジェクト
 * @param {object} [options={}] - 判定用オプション
 * @param {string|null} [options.selfId=null] - 発動元カードのIDまたはbaseId
 * @param {Array<string>} [options.presentBoardIds=[]] - 盤面に配置済みのカードID配列
 * @param {Array<object>} [options.presentBoardCards=[]] - 盤面に配置済みの実カードオブジェクト配列（能力消去の反映用）
 * @returns {boolean} 召喚対象として有効であれば true、そうでなければ false
 */
export function matchesSummonTarget(card, skill, options = {}) {
  return matchesHandOrDeckTarget(card, skill, options);
}

/**
 * 対象カードが「召集（assemble）」スキルの発動条件・対象指定に合致するか判定する公開関数。
 *
 * @param {object|null|undefined} card - 判定対象のデッキカードオブジェクト
 * @param {object|null|undefined} skill - 召集スキル定義オブジェクト
 * @param {object} [options={}] - 判定用オプション
 * @param {string|null} [options.selfId=null] - 召集元カードのIDまたはbaseId
 * @param {Array<string>} [options.presentBoardIds=[]] - 盤面に配置済みのカードID配列
 * @param {Array<object>} [options.presentBoardCards=[]] - 盤面に配置済みの実カードオブジェクト配列（能力消去の反映用）
 * @returns {boolean} 召集対象として有効であれば true、そうでなければ false
 */
export function matchesAssembleTarget(card, skill, options = {}) {
  return matchesHandOrDeckTarget(card, skill, options);
}

/**
 * 対象カードが「号令（call）」スキルの発動条件・対象指定に合致するか判定する公開関数。
 *
 * @param {object|null|undefined} card - 判定対象のデッキカードオブジェクト
 * @param {object|null|undefined} skill - 号令スキル定義オブジェクト
 * @param {object} [options={}] - 判定用オプション
 * @param {string|null} [options.selfId=null] - 号令元カードのIDまたはbaseId
 * @param {Array<string>} [options.presentBoardIds=[]] - 盤面に配置済みのカードID配列
 * @param {Array<object>} [options.presentBoardCards=[]] - 盤面に配置済みの実カードオブジェクト配列（能力消去の反映用）
 * @returns {boolean} 号令対象として有効であれば true、そうでなければ false
 */
export function matchesCallTarget(card, skill, options = {}) {
  return matchesHandOrDeckTarget(card, skill, options);
}

/**
 * 対象カードが「復活（resurrect）」または「傀儡（puppet）」スキルの発動条件・対象指定に合致するか判定する共通実体関数。
 * 自軍墓地（復活）または敵軍墓地（傀儡）からのカード配置において、同一の判定ロジック・順序を一元的に保証します。
 *
 * 判定順序および論理構造：
 * 1. トークンカードは配置不可（false）
 * 2. excludeBoard: 盤面に既に存在するカード（同名/baseId含む）は除外（false）
 * 3. targetIds / targetId: 特定カードID指定（万相 all_forms を含む一致判定）
 * 4. targetKeyword: カード名のキーワード指定（万相 all_forms を含む一致判定）
 * 5. value / maxPower: パワー制限（マスターカードの基礎パワー基準、未指定時は1以下）
 *
 * @param {object|null|undefined} card - 判定対象の墓地カードオブジェクト
 * @param {object|null|undefined} skill - スキル定義オブジェクト（targetIds, targetKeyword, value 等）
 * @param {object} [options={}] - 判定用オプション
 * @param {Array<string>} [options.presentBoardIds=[]] - 盤面に配置済みのカードID配列（excludeBoard 指定時の除外用）
 * @param {Array<object>} [options.presentBoardCards=[]] - 盤面に配置済みの実カードオブジェクト配列（能力消去の反映用）
 * @returns {boolean} 墓地配置対象として有効であれば true、そうでなければ false
 */
export function matchesGraveyardTarget(card, skill, options = {}) {
  if (
    !card ||
    typeof card !== 'object' ||
    !skill ||
    typeof skill !== 'object'
  ) {
    return false;
  }

  // 1. トークンカードは墓地配置不可
  if (card.isToken) return false;

  const { presentBoardIds = [], presentBoardCards = [] } = options;

  const resolvedBoardIds = resolvePresentBoardIds(
    presentBoardIds,
    presentBoardCards
  );

  // 2. excludeBoard: 盤面に既に存在するカード（同名/baseId含む）を除外
  if (
    skill.excludeBoard &&
    isExcludedByBoardPresence(card, resolvedBoardIds, presentBoardCards)
  ) {
    return false;
  }

  // 3. targetIds / targetId: 特定カードID指定（万相カードは matchesCardIds 内で自動判定）
  const targetIds = Array.isArray(skill.targetIds)
    ? skill.targetIds
    : skill.targetId
      ? [skill.targetId]
      : null;
  if (Array.isArray(targetIds) && targetIds.length > 0) {
    return matchesCardIds(card, targetIds);
  }

  // 4. targetKeyword: キーワード指定（属性や種族等、万相カードは matchesCardKeyword 内で自動判定）
  if (typeof skill.targetKeyword === 'string' && skill.targetKeyword) {
    return matchesCardKeyword(card, skill.targetKeyword);
  }

  // 5. value / maxPower: パワー制限（未指定時は 1）
  const maxPower =
    skill.value !== undefined && skill.value !== null ? skill.value : 1;
  const master = CARD_MASTER?.find(
    (m) => m.id === card.id || (card.baseId && m.id === card.baseId)
  );
  const cardPower = master ? master.power : card.power || 0;
  return cardPower <= maxPower;
}

/**
 * 対象カードが「復活（resurrect）」スキルの発動条件・対象指定に合致するか判定する公開関数。
 *
 * @param {object|null|undefined} card - 判定対象の自軍墓地カードオブジェクト
 * @param {object|null|undefined} skill - 復活スキル定義オブジェクト
 * @param {object} [options={}] - 判定用オプション
 * @param {Array<string>} [options.presentBoardIds=[]] - 盤面に配置済みのカードID配列
 * @param {Array<object>} [options.presentBoardCards=[]] - 盤面に配置済みの実カードオブジェクト配列（能力消去の反映用）
 * @returns {boolean} 復活対象として有効であれば true、そうでなければ false
 */
export function matchesResurrectTarget(card, skill, options = {}) {
  return matchesGraveyardTarget(card, skill, options);
}

/**
 * 対象カードが「傀儡（puppet）」スキルの発動条件・対象指定に合致するか判定する公開関数。
 *
 * @param {object|null|undefined} card - 判定対象の敵軍墓地カードオブジェクト
 * @param {object|null|undefined} skill - 傀儡スキル定義オブジェクト
 * @param {object} [options={}] - 判定用オプション
 * @param {Array<string>} [options.presentBoardIds=[]] - 盤面に配置済みのカードID配列
 * @param {Array<object>} [options.presentBoardCards=[]] - 盤面に配置済みの実カードオブジェクト配列（能力消去の反映用）
 * @returns {boolean} 傀儡対象として有効であれば true、そうでなければ false
 */
export function matchesPuppetTarget(card, skill, options = {}) {
  return matchesGraveyardTarget(card, skill, options);
}

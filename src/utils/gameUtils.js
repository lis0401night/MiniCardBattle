import { OWNERSHIP_FILTERS } from '../hooks/useCardFilterSort.js';
import { GameState } from '../state/gameState.js';
import { CARD_MASTER, PREMIUM_CARD_IDS } from './constants/cards.js';
import { CHARACTERS, getSkinImage } from './constants/characters.js';
import {
  appendVersionQuery,
  DEFAULT_PLAYER_NAME,
  DEFENSE_TARGET_COUNT,
  HIGH_TIER_PICK_COUNT,
  LOW_TIER_PICK_COUNT,
  MID_TIER_PICK_COUNT,
  PROFILE_NAME_KEY,
  HIGH_DIFFICULTY_CLEARED_KEY,
  DEFAULT_SOUND_VOLUME,
  HEAVY_DAMAGE_THRESHOLD,
  DAMAGE_TYPE,
} from './constants/config.js';
import { ACTIVE_SKILLS, SKILLS } from './constants/skills.js';
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

  // 旧仕様互換プロパティ（targetCard.skill）の同期
  if (targetCard.skill && targetCard.skill !== 'none') {
    const stillHasSkill = targetCard.skills.some(
      (s) => s.id === targetCard.skill
    );
    if (!stillHasSkill) {
      // マスターデータに定義されている固有スキルを優先して復元し、存在しない場合は残存スキルへフォールバック
      const fallback =
        targetCard.skills.find((s) =>
          masterSkills.some((ms) => ms.id === s.id)
        ) || targetCard.skills[0];
      targetCard.skill = fallback?.id || 'none';
      targetCard.skillValue = fallback?.value || 0;
    }
  }
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
    if (host.skill === 'arm_self' && !equippedHasArmSelf) {
      host.skill = 'none';
      host.skillValue = 0;
    }
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

    let lookupId = card.baseId || card.id;
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
  let skillCandidates = [];

  // 1. 表示対象のスキルを全てリストアップ
  const addCandidate = (id, val) => {
    const s = SKILLS[id];
    if (s && id !== 'none' && s.name !== '通常') {
      const showBadge =
        !isBoard || !card.skillTriggered || !ACTIVE_SKILLS.includes(id);
      if (showBadge) {
        skillCandidates.push({
          id,
          name: s.name,
          icon: s.icon,
          value: val ?? '',
        });
      }
    }
  };

  if (Array.isArray(card.skills)) {
    card.skills.forEach((sk) => addCandidate(sk.id, sk.value));
  }

  // 2. IDと値が一致するものを集計（「選択」と「命令」はマージせず個別に表示）
  let grouped = [];
  skillCandidates.forEach((c) => {
    const isExcludedFromMerge = c.id === 'choice' || c.id === 'force';
    const existing = isExcludedFromMerge
      ? null
      : grouped.find((g) => g.id === c.id && g.value === c.value);
    if (existing) {
      existing.count++;
    } else {
      grouped.push({ ...c, count: 1 });
    }
  });

  // 3. バッジの生成
  let badges = [];

  // 戦乙女の加護バッジ（盤面配置中のカードで該当プレイヤーの加護がアクティブな場合に優先表示）
  if (isBoard) {
    const isGuardActive =
      valkyriaGuardActive !== null
        ? valkyriaGuardActive
        : card.owner && typeof GameState !== 'undefined'
          ? card.owner === 'blue'
            ? (GameState.valkyriaGuardBlue || 0) > 0
            : (GameState.valkyriaGuardRed || 0) > 0
          : false;

    if (isGuardActive) {
      badges.push(`<div class="card-skill badge-valkyria-guard">🛡️ 加護</div>`);
    }
  }

  grouped.forEach((g) => {
    const countSuffix = g.count > 1 ? ` * ${g.count}` : '';
    badges.push(
      `<div class="card-skill">${g.icon} ${g.name}${g.value}${countSuffix}</div>`
    );
  });

  // 拘束（スタン）状態による「防御」バッジ（集約対象外）
  if (card.stunTurns > 0) {
    const def = SKILLS['defender'];
    badges.push(
      `<div class="card-skill" style="border-color: #ef4444; color: #fca5a5;">${def.icon} 防御${card.stunTurns}</div>`
    );
  }

  // 攻撃不能状態バッジ（絵文字なし）
  if (card.cantAttackTurns > 0) {
    badges.push(
      `<div class="card-skill" style="border-color: #ef4444; color: #fecdd3;">攻撃不能${card.cantAttackTurns}</div>`
    );
  }

  if (badges.length === 0) return '';
  return `<div class="card-skill-container">${badges.join('')}</div>`;
}
window.renderSkillTag = renderSkillTag;
window.stripEphemeralSkills = stripEphemeralSkills;

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
 * 対象カードに装備カードをアタッチ・マージし、パワーとスキルを同期・消費する。
 * 重複アタッチ防止チェックを含みます。
 * @param {Object} targetCard - 装備される側のカード
 * @param {Object} equipCard - 装備する（アタッチされる）側のカード
 */
export function applyEquipMerge(targetCard, equipCard) {
  if (!targetCard || !equipCard) return;

  targetCard.equippedCards = targetCard.equippedCards || [];
  if (targetCard.equippedCards.some((ec) => ec.uid === equipCard.uid)) {
    return; // 既に装備済みの場合は重複加算を防ぐ
  }

  const equipPower = equipCard.currentPower ?? equipCard.power ?? 0;
  equipCard.appliedEquipPower = equipPower;

  const equipSkills = (equipCard.skills || []).filter((s) => s.id !== 'equip');
  mergeCardSkills(targetCard, equipSkills);

  targetCard.power = (targetCard.power || 0) + equipPower;
  targetCard.basePower = (targetCard.basePower || 0) + equipPower;
  targetCard.currentPower = (targetCard.currentPower || 0) + equipPower;

  targetCard.equippedCards.push(equipCard);

  consumeArmSelf(targetCard, equipCard);
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
  existingCard.skills = existingCard.skills.filter(
    (s) => s.id !== 'startup' && s.id !== 'defender'
  );
  existingCard.stunTurns = 0;
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

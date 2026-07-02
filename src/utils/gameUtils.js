import { GameState } from '../state/gameState.js';
import { CARD_MASTER } from './constants/cards.js';
import { getSkinImage } from './constants/characters.js';
import { ACTIVE_SKILLS, SKILLS } from './constants/skills.js';
import {
  audioCtx,
  isAudioUnlocked,
  loadAndDecodeAudio,
  seBuffers,
  SOUNDS,
  unlockAudio,
} from './sounds.js';

// BGM再生の自動再生ブロック回避のためのグローバルなリトライ機構
export let currentBgmAudio = null;
export let currentWebAudioBgmSource = null;
export let currentWebAudioBgmGain = null;
export const decodedBgms = {};

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
    if (audioCtx.state === 'suspended') {
      audioCtx
        .resume()
        .then(() => {
          document.removeEventListener('click', retryPlayBgm, true);
          document.removeEventListener('touchstart', retryPlayBgm, true);
          if (currentWebAudioBgmGain) {
            currentWebAudioBgmGain.gain.value =
              typeof GameState.gameVolume !== 'undefined'
                ? GameState.gameVolume
                : 0.3;
          }
        })
        .catch(() => {});
    } else if (audioCtx.state === 'running') {
      document.removeEventListener('click', retryPlayBgm, true);
      document.removeEventListener('touchstart', retryPlayBgm, true);
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

export function getDialogue(
  speakerConfig,
  targetConfig,
  type,
  forceSide = null
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
    const sd = speakerConfig.skins[skinId].dialogue[type];
    if (sd !== undefined) {
      if (typeof sd === 'string') return sd;
      if (Array.isArray(sd))
        return sd[Math.floor(getSeededRandom() * sd.length)];

      if (targetConfig && sd[targetConfig.id]) return sd[targetConfig.id];
      if (sd.default) return sd.default;
    }
  }

  if (!speakerConfig.dialogue) return '...';
  const dict = speakerConfig.dialogue[type];
  if (dict === undefined) return '...';

  if (typeof dict === 'string') return dict;
  if (Array.isArray(dict))
    return dict[Math.floor(getSeededRandom() * dict.length)];

  if (targetConfig && dict[targetConfig.id]) return dict[targetConfig.id];
  return dict.default || '...';
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

  const baseVol =
    typeof GameState.gameVolume !== 'undefined' ? GameState.gameVolume : 0.3;

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
    const buffer = seBuffers[seKey];
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    source.buffer = buffer;
    gainNode.gain.value = baseVol;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
    return;
  }

  // 2. HTML5 Audio (BGM または Web Audio失敗時のフォールバック)
  const audio =
    typeof audioOrKey === 'string' ? SOUNDS[audioOrKey] : audioOrKey;
  if (audio instanceof Audio) {
    try {
      audio.volume = baseVol;
    } catch {}

    try {
      // BGM (ループ音) の処理
      if (audio.loop || (audio.src && audio.src.includes('bgm'))) {
        // 同じBGMが既に再生中の場合は最初から再生し直さない
        if (currentBgmAudio === audio) {
          if (currentWebAudioBgmGain)
            currentWebAudioBgmGain.gain.value = baseVol;
          return;
        }

        // Web Audio APIによるSafari等対策BGM再生へのルーティング
        if (audioCtx) {
          // 古いBGMを停止
          if (currentBgmAudio) stopSound(currentBgmAudio);
          currentBgmAudio = audio; // 互換性維持

          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
            document.addEventListener('click', retryPlayBgm, { capture: true });
            document.addEventListener('touchstart', retryPlayBgm, {
              capture: true,
            });
          }

          let fetchUrl = audio.src;
          // ローカルパス変換ロジック
          if (fetchUrl.includes('assets/audio/bgm/')) {
            fetchUrl = fetchUrl.substring(
              fetchUrl.indexOf('assets/audio/bgm/')
            );
          }

          if (!decodedBgms[fetchUrl]) {
            // 初回再生時はデコードを待つ（iOS Safariで確実な音量操作を行うための代償）
            loadAndDecodeAudio(fetchUrl)
              .then((buffer) => {
                if (buffer && currentBgmAudio === audio) {
                  decodedBgms[fetchUrl] = buffer;
                  startWebAudioBgm(buffer, baseVol);
                }
              })
              .catch((e) => console.warn('Failed to decode BGM', e));
          } else {
            startWebAudioBgm(decodedBgms[fetchUrl], baseVol);
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
            clone.volume = baseVol;
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

export function forceSoundReload() {
  if (typeof unlockAudio === 'function' && !isAudioUnlocked) {
    unlockAudio();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (currentBgmAudio) {
    const bgm = currentBgmAudio;
    currentBgmAudio = null;
    playSound(bgm);
  }
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

// 墓守スキルの発動チェックとエフェクト表示
export async function triggerGraveKeeperEffect() {
  let activated = false;
  const triggerEffect = (board, side) => {
    board.forEach((c, i) => {
      if (c && hasSkill(c, 'grave_keeper')) {
        activated = true;
        const el = document.querySelector(
          `#${side}-lanes .cell[data-lane="${i}"] .card`
        );
        if (el) {
          playSound(SOUNDS.seSkill);
          createDamagePopup(el, '墓守', '#a8a29e');
        }
      }
    });
  };
  triggerEffect(GameState.playerBoard, 'player');
  triggerEffect(GameState.enemyBoard, 'enemy');

  if (activated) {
    await sleep(500);
  }
  return activated;
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

export function unmergeCardSkills(targetCard, equipSkills) {
  if (!targetCard.skills) return;

  for (const eqS of equipSkills) {
    const existingInfo = targetCard.skills.find((s) => s.id === eqS.id);
    if (existingInfo) {
      if (
        eqS.value !== undefined &&
        eqS.value !== null &&
        existingInfo.value !== undefined &&
        existingInfo.value !== null
      ) {
        existingInfo.value -= eqS.value;
        if (existingInfo.value <= 0) {
          targetCard.skills = targetCard.skills.filter(
            (s) => s !== existingInfo
          );
        }
      } else {
        targetCard.skills = targetCard.skills.filter((s) => s !== existingInfo);
      }
    }
  }
}

// 武装(arm_self)スキルの消費処理
export function consumeArmSelf(host, equipped) {
  if (!host || !equipped) return;
  if (!hasSkill(equipped, 'equip') && hasSkill(host, 'arm_self')) {
    if (host.skill === 'arm_self') {
      host.skill = 'none';
      host.skillValue = 0;
    }
    host.skills = Array.isArray(host.skills)
      ? host.skills.filter((s) => s.id !== 'arm_self')
      : [];
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

export const VALID_PREMIUM_GIFS = [
  'assassin',
  'cleric',
  'clone',
  'cyberdragon',
  'diviner',
  'dragon',
  'empress',
  'golem',
  'dancer',
  'oldgod',
  'sniper',
  'wolf',
  'necromancer',
  'vampire',
  'beginnermagic',
  'djinn',
  'shogun',
  'omyouji',
  'mummy',
  'pharaoh',
];
export const VALID_PREMIUM_JPGS = [
  'dreadnought',
  'armsuits',
  'hammer',
  'berserker',
  'horse',
  'crusher',
  'shark',
  'parasite',
  'shaman',
  'darkelf',
  'doom',
  'acolyte',
  'plaguedoctor',
  'servant',
  'ring',
  'battlemage',
  'yukionna',
  'muramasa',
  'kitepriest',
  'snakepriest',
  'light',
];

/**
 * 指定されたカードIDがプレミアム版（GIFまたはJPGイラスト）を持っているか判定します。
 * @param {string} id - カードID
 * @returns {boolean}
 */
export function hasPremiumVariant(id) {
  if (!id) return false;
  return VALID_PREMIUM_GIFS.includes(id) || VALID_PREMIUM_JPGS.includes(id);
}

// カードの画像URLを取得（プレミアム設定を考慮）// IDからの自動解決
export function getCardImgUrl(card) {
  if (!card) return 'assets/cards/card_default.jpg';
  if (card.imgUrl) return card.imgUrl; // トークン等で直接焼き付けられたURLがある場合は最優先

  // 特定のトークンの例外処理（旧imgUrl設定の復元）
  if (card.id === 'token_knight') return 'assets/cards/card_token_knight.jpg';
  if (card.id === 'token_ignis' || card.baseId === 'token_ignis') {
    // オーナーのドラゴンスキン設定に応じたキャラクター画像を返す
    // enemy（red）はGameState.enemySkins、player（blue）はGameState.playerSkinsを参照
    const ownerSkins =
      card.owner === 'red'
        ? GameState.enemySkins || {}
        : GameState.playerSkins || {};
    const dragonSkin = ownerSkins['dragon'] || 'default';
    return getSkinImage('dragon', dragonSkin, 'image');
  }
  if (card.id === 'token_satan' || card.baseId === 'token_satan')
    return 'assets/cards/card_token_satan.jpg';

  let lookupId = card.baseId || card.id;
  if (!lookupId) return 'assets/cards/card_default.jpg';

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
    if (VALID_PREMIUM_GIFS.includes(lookupId))
      return `assets/cards/card_${lookupId}_premium.gif`;
    if (VALID_PREMIUM_JPGS.includes(lookupId))
      return `assets/cards/card_${lookupId}_premium.jpg`;
  } else if (card.isPremium === false) {
    return `assets/cards/card_${lookupId}.jpg`;
  }

  // フラグがない場合は従来のグローバル設定を参照（ただし敵のカードと明示されている場合は除く）
  if (
    card.owner !== 'red' &&
    GameState.premiumCards &&
    GameState.premiumCards.includes(lookupId)
  ) {
    if (VALID_PREMIUM_GIFS.includes(lookupId))
      return `assets/cards/card_${lookupId}_premium.gif`;
    if (VALID_PREMIUM_JPGS.includes(lookupId))
      return `assets/cards/card_${lookupId}_premium.jpg`;
  }
  return `assets/cards/card_${lookupId}.jpg`;
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

export function renderSkillTag(card, isBoard = false) {
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
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister())
        );
      }
    } catch (err) {
      console.error('Failed to clear cache and service workers:', err);
    }
  }
}

/**
 * 対象カードに装備カードをアタッチ・マージし、パワーとスキルを同期・消費する。
 * 重複アタッチ防止チェックを含みます。
 * @param {Object} targetCard - 装備される側のカード
 * @param {Object} equipCard - 装備する（アタッチされる）側のカード
 */
export function applyEquipMerge(targetCard, equipCard) {
  if (!targetCard || !equipCard) return;

  const equipSkills = (equipCard.skills || []).filter((s) => s.id !== 'equip');
  mergeCardSkills(targetCard, equipSkills);

  targetCard.power = (targetCard.power || 0) + (equipCard.power || 0);
  targetCard.basePower = (targetCard.basePower || 0) + (equipCard.power || 0);
  targetCard.currentPower =
    (targetCard.currentPower || 0) + (equipCard.power || 0);

  targetCard.equippedCards = targetCard.equippedCards || [];
  if (!targetCard.equippedCards.some((ec) => ec.uid === equipCard.uid)) {
    targetCard.equippedCards.push(equipCard);
  }

  consumeArmSelf(targetCard, equipCard);
}

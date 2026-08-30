/**
 * Mini Card Battle - Sound Management (Web Audio API Optimized)
 */
import { GameState } from '../state/gameState.js';
import { DEFAULT_SOUND_VOLUME } from './constants/config.js';

// Web Audio API Context
export let audioCtx = (() => {
  if (typeof window !== 'undefined') {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      try {
        return new AudioCtxClass();
      } catch (e) {
        console.warn('Failed to create AudioContext early:', e);
      }
    }
  }
  return null;
})();
export const seBuffers = {};
export const voiceBuffers = {};
export const decodedBgms = {};
export let isAudioUnlocked = false;

export const SE_PATHS = {
  // 効果音パス (UI用など)
  seClick: 'assets/audio/se/se_click.mp3',
  sePlace: 'assets/audio/se/se_place.mp3',
  seAttack: 'assets/audio/se/se_attack.mp3',
  seDamage: 'assets/audio/se/se_damage.mp3',
  seSkill: 'assets/audio/se/se_skill_default.mp3',
  seDestroy: 'assets/audio/se/se_destroy.mp3',
  seContinue: 'assets/audio/se/se_skill_default.mp3',
  seLegend: 'assets/audio/se/se_legend.mp3',
  seSkillBind: 'assets/audio/se/se_skill_bind.mp3',
  seSkillToxic: 'assets/audio/se/se_skill_toxic.mp3',
  seSkillCharge: 'assets/audio/se/se_skill_charge.mp3',
  seSkillFreeze: 'assets/audio/se/se_skill_freeze.mp3',
  seSkillCrush: 'assets/audio/se/se_skill_crush.mp3',
  seSkillSnipe: 'assets/audio/se/se_skill_snipe.mp3',
  seClock: 'assets/audio/se/se_clock.mp3',
  seMetalBlast: 'assets/audio/se/se_metalblast.mp3',
  seFire: 'assets/audio/se/se_fire.mp3',
  seHyoushigi: 'assets/audio/se/se_hyoushigi.mp3',
  seSkillHeal: 'assets/audio/se/se_skill_heal.mp3',
  seSkillDominate: 'assets/audio/se/se_skill_dominate.mp3',
  seTurnover: 'assets/audio/se/se_turnoverthecard.mp3',
  seMatching: 'assets/audio/bgm/bgm_matching_metal.mp3',
  seVS: 'assets/audio/se/se_heavyslash.mp3',
  seSkillMorph: 'assets/audio/se/se_skill_morph.mp3',
  seSkillGoaCrush: 'assets/audio/se/se_skill_goacrush.mp3',
  seSkillBloodDamage: 'assets/audio/se/se_blooddamage.mp3',
  seSkillExplode: 'assets/audio/se/se_skill_explode.mp3',
  voiceUndeadPlay: 'assets/audio/voice/voice_undead_play.mp3',
  seSkillHero: 'assets/audio/se/se_skill_hero.mp3',
  seSkillExtort: 'assets/audio/se/se_skill_extort.mp3',
  seSkillAdversity: 'assets/audio/se/se_skill_adversity.mp3',
  seSkillBrutal: 'assets/audio/se/se_skill_brutal.mp3',
  seSkillSeal: 'assets/audio/se/se_skill_seal.mp3',
  seSkillArtillery: 'assets/audio/se/se_skill_artillery.mp3',
  seSkillSacrifice: 'assets/audio/se/se_skill_sacrifice.mp3',
  seSkillExecute: 'assets/audio/se/se_skill_execute.mp3',
  seSkillStealth: 'assets/audio/se/se_skill_stealth.mp3',
  seSkillCall: 'assets/audio/se/se_skill_call.mp3',
  seSkillIgnis: 'assets/audio/se/se_summon_ignis.mp3',
};

export const SOUNDS = {
  // 効果音パス (UI用など・文字列として保持) - SE_PATHS から展開して重複を排除
  ...SE_PATHS,
};

/**
 * 現在のアクセス階層（tool/ サブフォルダ等）に応じて音声アセットの相対パスを自動補正します。
 * @param {string} path - 音声アセットパス
 * @returns {string} 補正済みパス
 */
export function resolveAssetPath(path) {
  if (!path || typeof path !== 'string') return path;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('../')
  ) {
    return path;
  }
  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.pathname.includes('/tool/')
  ) {
    if (path.startsWith('/assets/')) return '..' + path;
    if (path.startsWith('assets/')) return '../' + path;
  }
  return path;
}

function createAudioInstance(path) {
  return new Audio(resolveAssetPath(path));
}

export const AUDIO_INSTANCES = {
  // BGM
  bgmTitle: createAudioInstance('assets/audio/bgm/bgm_title.mp3'),
  bgmBattle: createAudioInstance('assets/audio/bgm/bgm_battle.mp3'),
  bgmEnding: createAudioInstance('assets/audio/bgm/bgm_ending.mp3'),
  bgmLastBattle: createAudioInstance('assets/audio/bgm/bgm_lastbattle.mp3'),
  bgmGallery: createAudioInstance('assets/audio/bgm/bgm_gallery.mp3'),
  bgmDefense: createAudioInstance('assets/audio/bgm/bgm_defense.mp3'),
  bgmChallenge: createAudioInstance('assets/audio/bgm/bgm_challenge.mp3'),
  bgmTournament1: createAudioInstance('assets/audio/bgm/bgm_tournament01.mp3'),
  bgmTournament2: createAudioInstance('assets/audio/bgm/bgm_tournament02.mp3'),
  bgmOnline: createAudioInstance('assets/audio/bgm/bgm_online.mp3'),
  bgmHighDifficulty: createAudioInstance(
    'assets/audio/bgm/bgm_high_difficulty.mp3'
  ),
  bgmStageAndroid: createAudioInstance(
    'assets/audio/bgm/bgm_stage_android01.mp3'
  ),
  bgmStageDragon: createAudioInstance(
    'assets/audio/bgm/bgm_stage_dragon01.mp3'
  ),
  bgmStageKnight: createAudioInstance(
    'assets/audio/bgm/bgm_stage_knight01.mp3'
  ),
  bgmStageCthulhu: createAudioInstance(
    'assets/audio/bgm/bgm_stage_cthulhu01.mp3'
  ),
  bgmStageElf: createAudioInstance('assets/audio/bgm/bgm_stage_elf01.mp3'),
  bgmStageCleric: createAudioInstance(
    'assets/audio/bgm/bgm_stage_cleric01.mp3'
  ),
  bgmStageDevilHunter: createAudioInstance(
    'assets/audio/bgm/bgm_stage_devilhunter01.mp3'
  ),
  bgmStageWitch: createAudioInstance('assets/audio/bgm/bgm_stage_witch01.mp3'),
  bgmStageOni: createAudioInstance('assets/audio/bgm/bgm_stage_oni01.mp3'),
  bgmStagePriest: createAudioInstance(
    'assets/audio/bgm/bgm_stage_priest01.mp3'
  ),
  bgmStageSatan: createAudioInstance('assets/audio/bgm/bgm_stage_satan01.mp3'),
  bgmStageDungeon: createAudioInstance(
    'assets/audio/bgm/bgm_stage_dungeon01.mp3'
  ),
  bgmStagePractice: createAudioInstance(
    'assets/audio/bgm/bgm_stage_practice01.mp3'
  ),
  bgmStageAutomata: createAudioInstance(
    'assets/audio/bgm/bgm_stage_automata01.mp3'
  ),
  bgmStageValkyria: createAudioInstance(
    'assets/audio/bgm/bgm_stage_valkyria01.mp3'
  ),
  bgmStageTournament: createAudioInstance(
    'assets/audio/bgm/bgm_tournament02.mp3'
  ),
  bgmStageHighDifficulty: createAudioInstance(
    'assets/audio/bgm/bgm_stage_high_difficulty.mp3'
  ),
  bgmStory01: createAudioInstance('assets/audio/bgm/bgm_story01.mp3'),
  bgmStory02: createAudioInstance('assets/audio/bgm/bgm_story02.mp3'),
  bgmFortune1: createAudioInstance('assets/audio/bgm/bgm_fortune01.mp3'),
  // SE (Web Audio API用フォールバックとしても事前生成しておく)
  seClick: createAudioInstance('assets/audio/se/se_click.mp3'),
  sePlace: createAudioInstance('assets/audio/se/se_place.mp3'),
  seAttack: createAudioInstance('assets/audio/se/se_attack.mp3'),
  seDamage: createAudioInstance('assets/audio/se/se_damage.mp3'),
  seSkill: createAudioInstance('assets/audio/se/se_skill_default.mp3'),
  seDestroy: createAudioInstance('assets/audio/se/se_destroy.mp3'),
  seContinue: createAudioInstance('assets/audio/se/se_skill_default.mp3'),
  seLegend: createAudioInstance('assets/audio/se/se_legend.mp3'),
  seSkillBind: createAudioInstance('assets/audio/se/se_skill_bind.mp3'),
  seSkillToxic: createAudioInstance('assets/audio/se/se_skill_toxic.mp3'),
  seSkillCharge: createAudioInstance('assets/audio/se/se_skill_charge.mp3'),
  seSkillFreeze: createAudioInstance('assets/audio/se/se_skill_freeze.mp3'),
  seSkillCrush: createAudioInstance('assets/audio/se/se_skill_crush.mp3'),
  seSkillSnipe: createAudioInstance('assets/audio/se/se_skill_snipe.mp3'),
  seSkillHeal: createAudioInstance('assets/audio/se/se_skill_heal.mp3'),
  seSkillDominate: createAudioInstance('assets/audio/se/se_skill_dominate.mp3'),
  seTurnover: createAudioInstance('assets/audio/se/se_turnoverthecard.mp3'),
  seMatching: createAudioInstance('assets/audio/bgm/bgm_matching_metal.mp3'),
  seVS: createAudioInstance('assets/audio/se/se_heavyslash.mp3'),
  seSkillMorph: createAudioInstance('assets/audio/se/se_skill_morph.mp3'),
  seSkillGoaCrush: createAudioInstance('assets/audio/se/se_skill_goacrush.mp3'),
  seSkillBloodDamage: createAudioInstance('assets/audio/se/se_blooddamage.mp3'),
  seSkillExplode: createAudioInstance('assets/audio/se/se_skill_explode.mp3'),
  voiceUndeadPlay: createAudioInstance(
    'assets/audio/voice/voice_undead_play.mp3'
  ),
  seSkillHero: createAudioInstance('assets/audio/se/se_skill_hero.mp3'),
  seSkillExtort: createAudioInstance('assets/audio/se/se_skill_extort.mp3'),
  seSkillAdversity: createAudioInstance(
    'assets/audio/se/se_skill_adversity.mp3'
  ),
  seSkillBrutal: createAudioInstance('assets/audio/se/se_skill_brutal.mp3'),
  seSkillSeal: createAudioInstance('assets/audio/se/se_skill_seal.mp3'),
  seSkillArtillery: createAudioInstance(
    'assets/audio/se/se_skill_artillery.mp3'
  ),
  seSkillSacrifice: createAudioInstance(
    'assets/audio/se/se_skill_sacrifice.mp3'
  ),
  seSkillExecute: createAudioInstance('assets/audio/se/se_skill_execute.mp3'),
  seSkillStealth: createAudioInstance('assets/audio/se/se_skill_stealth.mp3'),
  seSkillCall: createAudioInstance('assets/audio/se/se_skill_call.mp3'),
  seSkillIgnis: createAudioInstance('assets/audio/se/se_summon_ignis.mp3'),
};

/**
 * 特定の音声キー（特に起動時に不要なBGM）のプリロードをスキップすべきかを判定する
 * @param {string} key - 音声リソースのキー名
 * @returns {boolean} - スキップすべきなら true、プリロードすべきなら false
 */
const BGM_KEY_PREFIX = 'bgm';
const TITLE_BGM_KEY = 'bgmTitle';

export function shouldSkipAudioPreload(key) {
  const isBgm = key.startsWith(BGM_KEY_PREFIX);
  return isBgm && key !== TITLE_BGM_KEY;
}

// サウンドの初期設定
Object.keys(AUDIO_INSTANCES).forEach((key) => {
  const audio = AUDIO_INSTANCES[key];
  if (key.startsWith(BGM_KEY_PREFIX)) {
    audio.loop = true;
    // BGMのみ、各所での参照互換性（SOUNDS.bgmTitle等）を保つためマージ
    SOUNDS[key] = audio;
  } else {
    // SEについては、SOUNDS[文字列パス] 経由でフォールバックAudioが引けるようにする
    const urlStr = SOUNDS[key];
    if (urlStr) SOUNDS[urlStr] = audio;
  }
  try {
    audio.volume = 0.3;
  } catch {
    // 一部のブラウザでは volume 設定時にエラーが発生する場合があるため無視
  }

  // 起動時に不要な音声は初期ロードをスキップ（必要時にロード）
  if (!shouldSkipAudioPreload(key)) {
    audio.load(); // 事前ロード
  }
});

/**
 * 音声ファイルをロードしてデコードし、バッファとして返す
 */
export async function loadAndDecodeAudio(url) {
  if (!audioCtx) return null;
  try {
    const fetchUrl = resolveAssetPath(url);
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return await new Promise((resolve) => {
      audioCtx.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (e) => {
          console.warn(`decodeAudioData failed for: ${url}`, e);
          resolve(null);
        }
      );
    });
  } catch (e) {
    console.warn(`Failed to load/decode audio: ${url}`, e);
    return null;
  }
}

/**
 * 特定のSEをロードしてデコード
 * @param {string} key - SE識別キー
 * @param {string} url - 音声ファイルURL
 * @returns {Promise<void>}
 */
export async function loadSE(key, url) {
  try {
    const buffer = await loadAndDecodeAudio(url);
    if (buffer) {
      seBuffers[key] = buffer;
      seBuffers[url] = buffer; // 文字列パスでも引けるようにする
    }
  } catch (e) {
    console.warn(`Failed to loadSE: ${key} (${url})`, e);
  }
}

/**
 * 特定のカードボイスをロードしてデコードし、voiceBuffers にキャッシュする
 * @param {string} url - 音声ファイルURL
 * @returns {Promise<void>}
 */
export async function loadVoice(url) {
  try {
    const buffer = await loadAndDecodeAudio(url);
    if (buffer) {
      voiceBuffers[url] = buffer;
    }
  } catch (e) {
    console.warn(`Failed to loadVoice: ${url}`, e);
  }
}

/** BGMアセットの相対パス接頭辞（キー正規化の基準） */
export const BGM_ASSET_PREFIX = 'assets/audio/bgm/';

/**
 * BGMのURLまたはパスを、キャッシュキーとして使う相対パスへ正規化する。
 * （フルURLやクエリパラメータ付きURLから基準相対パスを安全に抽出）
 * @param {string} url - BGMのURLまたはパス
 * @returns {string} 正規化された相対パス
 */
export function normalizeBgmKey(url) {
  if (!url || typeof url !== 'string') return '';
  const idx = url.indexOf(BGM_ASSET_PREFIX);
  const path = idx >= 0 ? url.substring(idx) : url;
  return path.split('?')[0];
}

/**
 * デコード済みBGMバッファの最大保持数 (iOS等のRAM保護のため最大2曲に制限)
 */
const MAX_CACHED_BGMS = 2;
const bgmAccessHistory = [];

/**
 * デコード済みBGMのLRUキャッシュを更新し、保持上限を超えた古いバッファを自動解放する。
 * @param {string} accessedUrl - アクセスされたBGMのURLまたは相対パス
 * @param {AudioBuffer} buffer - デコード済みAudioBuffer
 */
export function registerDecodedBgm(accessedUrl, buffer) {
  if (!accessedUrl || !buffer) return;
  const key = normalizeBgmKey(accessedUrl);
  decodedBgms[key] = buffer;
  if (accessedUrl !== key) {
    decodedBgms[accessedUrl] = buffer;
  }

  // アクセス履歴を更新（最新のものを末尾へ）
  const existingIndex = bgmAccessHistory.indexOf(key);
  if (existingIndex !== -1) {
    bgmAccessHistory.splice(existingIndex, 1);
  }
  bgmAccessHistory.push(key);

  // 保持上限を超えた古いBGMバッファを破棄してメモリ解放
  while (bgmAccessHistory.length > MAX_CACHED_BGMS) {
    const oldestKey = bgmAccessHistory.shift();
    Object.keys(decodedBgms).forEach((k) => {
      if (normalizeBgmKey(k) === oldestKey) {
        delete decodedBgms[k];
      }
    });
  }
}

/**
 * 指定されたURL以外のすべての古いデコード済みBGMバッファを強制解放する。
 * （対戦終了時や画面切り替え時の明示的メモリクリーンアップ用）
 * @param {string|string[]} [keepUrls=[]] - 保持するBGMのURLまたはパス（省略時は全削除）
 */
export function cleanupOldDecodedBgms(keepUrls = []) {
  const keepList = (Array.isArray(keepUrls) ? keepUrls : [keepUrls])
    .filter(Boolean)
    .map(normalizeBgmKey);

  Object.keys(decodedBgms).forEach((key) => {
    const normalized = normalizeBgmKey(key);
    if (!keepList.includes(normalized)) {
      delete decodedBgms[key];
    }
  });

  // アクセス履歴も同期
  for (let i = bgmAccessHistory.length - 1; i >= 0; i--) {
    const histKey = bgmAccessHistory[i];
    if (!keepList.includes(histKey)) {
      bgmAccessHistory.splice(i, 1);
    }
  }
}

/**
 * 特定のBGMをロードしてデコード（事前デコード用・LRU管理対応）
 * @param {string} key - BGMキー
 * @param {string} url - 音声ファイルURL
 */
export async function loadBgm(key, url) {
  try {
    const buffer = await loadAndDecodeAudio(url);
    if (buffer) {
      registerDecodedBgm(url, buffer);
    }
  } catch (e) {
    console.warn(`Failed to loadBgm: ${key} (${url})`, e);
  }
}

export function updateBgmGainNodes(vol) {
  // BGMはHTML5 Audioのvolumeを直接変更
  Object.keys(AUDIO_INSTANCES).forEach((key) => {
    if (key.startsWith(BGM_KEY_PREFIX)) {
      const audio = AUDIO_INSTANCES[key];
      if (audio) {
        try {
          audio.volume = vol;
        } catch {
          // 一部のブラウザでは volume 設定時にエラーが発生する場合があるため無視
        }
      }
    }
  });

  // 今後WebAudio版BGMのゲインノードを一括管理するためのエクスポート関数（連携用）
  if (typeof window.updateWebAudioBgmVolume === 'function') {
    window.updateWebAudioBgmVolume(vol);
  }
}
window.updateBgmGainNodes = updateBgmGainNodes; // Fallback exposing

/** Web Audio SE用マスターゲインノード */
let seMasterGainNode = null;

/**
 * SE用マスターゲインノードを取得・初期化します（遅延初期化）。
 * オーディオコンテキスト再生成時にも現在の audioCtx に適合したノードを安全に取得・再生成します。
 * @returns {GainNode|null} SE用マスターゲインノード
 */
export function getSeMasterGainNode() {
  if (!audioCtx) return null;
  // 未初期化、または保持しているノードが現在の audioCtx と異なるコンテキストの場合は再作成
  if (
    !seMasterGainNode ||
    (seMasterGainNode.context && seMasterGainNode.context !== audioCtx)
  ) {
    seMasterGainNode = audioCtx.createGain();
    const isSeMuted = typeof GameState !== 'undefined' && GameState.isSeMuted;
    const seVol =
      typeof GameState !== 'undefined' &&
      typeof GameState.seVolume !== 'undefined'
        ? GameState.seVolume
        : typeof GameState !== 'undefined' &&
            typeof GameState.gameVolume !== 'undefined'
          ? GameState.gameVolume
          : DEFAULT_SOUND_VOLUME;
    seMasterGainNode.gain.value = isSeMuted ? 0 : seVol;
    seMasterGainNode.connect(audioCtx.destination);
  }
  return seMasterGainNode;
}

/**
 * SE・ボイス用ゲインノードの音量を一括更新します。
 * @param {number} vol - 実効音量（0.0〜1.0）
 */
export function updateSeGainNodes(vol) {
  if (seMasterGainNode) {
    seMasterGainNode.gain.value = vol;
  }
  if (typeof window.updateFallbackVoiceVolume === 'function') {
    window.updateFallbackVoiceVolume(vol);
  }
}
window.updateSeGainNodes = updateSeGainNodes;
window.updateWebAudioSeVolume = updateSeGainNodes;

/**
 * モバイルブラウザの音声制限を解除する
 */
export async function unlockAudio() {
  if (isAudioUnlocked) return;

  try {
    // AudioContext の初期化
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }

    // 同期的に resume() を呼び出し、その完了を確実に await 待機する
    // （リロード後等に発生する、見かけ上 running だが消音されているブラウザバグへの対策）
    if (audioCtx) {
      try {
        await audioCtx.resume();
      } catch (e) {
        console.warn('[Sound] AudioContext resume failed:', e);
      }
    }

    // まだロードされていないSEのみ非同期でロード開始
    const promises = Object.entries(SE_PATHS).map(([key, url]) => {
      if (!seBuffers[key]) {
        return loadSE(key, url);
      }
      return Promise.resolve();
    });

    // 全てのSEロードの完了を待機（エラーハンドリングは各Promise内で解決済み）
    await Promise.all(promises);

    const isBgmMuted = typeof GameState !== 'undefined' && GameState.isBgmMuted;
    const bgmVol =
      typeof GameState !== 'undefined' &&
      typeof GameState.bgmVolume !== 'undefined'
        ? GameState.bgmVolume
        : typeof GameState !== 'undefined' &&
            typeof GameState.gameVolume !== 'undefined'
          ? GameState.gameVolume
          : DEFAULT_SOUND_VOLUME;

    // BGM volume sync
    updateBgmGainNodes(isBgmMuted ? 0 : bgmVol);

    // ダミー再生（サスペンドからの確実な復帰用）
    if (audioCtx) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(0);
      osc.stop(0.1);
    }

    isAudioUnlocked = true;
    console.log('Web Audio Context Unlocked and SE Buffers Loading completed.');

    // バックグラウンド・フォアグラウンド移行時の音声バグ対策 (iOS/Android Safari, Chrome)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        const isHidden = document.visibilityState === 'hidden';

        // 全てのBGM等Audio要素を安全に退避・復帰
        Object.values(AUDIO_INSTANCES).forEach((audio) => {
          if (audio && typeof audio.pause === 'function') {
            if (isHidden) {
              if (!audio.paused) {
                audio._wasPlayingBeforeHide = true;
                audio.pause();
              } else {
                audio._wasPlayingBeforeHide = false;
              }
            } else {
              if (audio._wasPlayingBeforeHide) {
                const p = audio.play();
                if (p !== undefined) p.catch(() => {});
                audio._wasPlayingBeforeHide = false;
              }
            }
          }
        });

        if (!audioCtx) return;
        if (isHidden) {
          if (audioCtx.state === 'running') {
            audioCtx.suspend().catch((e) => console.warn(e));
          }
        } else {
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch((e) => console.warn(e));
          }
        }
      });
    }
  } catch (e) {
    console.warn('Failed to unlock audio context (Browser restriction):', e);
  }
}

export function playSkillSound(skillId) {
  if (typeof GameState !== 'undefined' && GameState.isSeMuted) return;
  const backupSound = SOUNDS.seSkill;
  if (!skillId || skillId === 'none') {
    if (typeof window.playSound === 'function') window.playSound(backupSound);
    return;
  }

  const url = `assets/audio/se/se_skill_${skillId}.mp3`;

  if (audioCtx && typeof fetch === 'function') {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const playBuffer = (buffer) => {
      const source = audioCtx.createBufferSource();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 1.0;
      source.buffer = buffer;
      source.connect(gainNode);
      const masterGain = getSeMasterGainNode();
      gainNode.connect(masterGain || audioCtx.destination);
      source.start(0);
    };

    // デコード済みならキャッシュから即再生
    if (seBuffers[url]) {
      playBuffer(seBuffers[url]);
      return;
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.arrayBuffer();
      })
      .then((ab) => audioCtx.decodeAudioData(ab))
      .then((buffer) => {
        seBuffers[url] = buffer;
        playBuffer(buffer);
      })
      .catch(() => {
        if (typeof window.playSound === 'function')
          window.playSound(backupSound);
      });
  } else {
    if (typeof window.playSound === 'function') window.playSound(backupSound);
  }
}

/**
 * オーディオコンテキストを強制的に再作成し、すべてのSEやBGMのデコードデータを再ロードする
 * @returns {Promise<void>}
 */
export async function recreateAudioSystem() {
  console.log('[Sound] サウンドシステムの強制再構築を開始します...');

  // 1. 既存の AudioContext の破棄
  if (audioCtx) {
    try {
      if (typeof audioCtx.close === 'function') {
        await audioCtx.close();
      }
    } catch (e) {
      console.warn('[Sound] 既存の AudioContext のクローズに失敗しました:', e);
    }
    audioCtx = null;
  }

  // 2. 状態変数のリセット
  isAudioUnlocked = false;
  seMasterGainNode = null;

  // 3. キャッシュ（SE / BGM / ボイスバッファ）の完全初期化
  // (AudioBufferは古いAudioContextに紐づいているため、新しいコンテキスト再生成時は全て破棄・再デコードが必要)
  Object.keys(seBuffers).forEach((key) => {
    delete seBuffers[key];
  });
  Object.keys(decodedBgms).forEach((key) => {
    delete decodedBgms[key];
  });
  bgmAccessHistory.length = 0;
  Object.keys(voiceBuffers).forEach((key) => {
    delete voiceBuffers[key];
  });

  // 4. 新規 AudioContext の作成とアンロック処理の開始
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtxClass();
    console.log('[Sound] 新しい AudioContext を作成しました。');
  } catch (e) {
    console.error('[Sound] 新規 AudioContext の作成に失敗しました:', e);
    return;
  }

  // アンロックを実行（SEアセットの再読み込み＆デコードも内部で走る）
  await unlockAudio();

  // 5. HTML5 Audio (AUDIO_INSTANCES) の強制リロード
  Object.keys(AUDIO_INSTANCES).forEach((key) => {
    const audio = AUDIO_INSTANCES[key];
    if (audio instanceof Audio) {
      try {
        audio.load(); // 再読み込みをブラウザに命じる
      } catch (e) {
        console.warn(`[Sound] HTML5 Audio load failed: ${key}`, e);
      }
    }
  });

  console.log('[Sound] サウンドシステムの再構築が完了しました。');
}

// 確実なオーディアンロックのためのネイティブDOMイベント監視 (React合成イベントの外側で処理)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const unlockHandler = () => {
    if (!isAudioUnlocked) {
      unlockAudio();
    }
    // audioCtxがすでにある場合、resumeだけは確実に行わせる
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    document.removeEventListener('click', unlockHandler, true);
    document.removeEventListener('touchstart', unlockHandler, true);
  };
  document.addEventListener('click', unlockHandler, { capture: true });
  document.addEventListener('touchstart', unlockHandler, { capture: true });
}

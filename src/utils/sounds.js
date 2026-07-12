/**
 * Mini Card Battle - Sound Management (Web Audio API Optimized)
 */
import { GameState } from '../state/gameState.js';

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
  voiceUndeadPlay: 'assets/audio/voice/voice_undead_play.wav',
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
};

export const SOUNDS = {
  // 効果音パス (UI用など・文字列として保持) - SE_PATHS から展開して重複を排除
  ...SE_PATHS,
};

export const AUDIO_INSTANCES = {
  // BGM
  bgmTitle: new Audio('assets/audio/bgm/bgm_title.mp3'),
  bgmBattle: new Audio('assets/audio/bgm/bgm_battle.mp3'),
  bgmEnding: new Audio('assets/audio/bgm/bgm_ending.mp3'),
  bgmLastBattle: new Audio('assets/audio/bgm/bgm_lastbattle.mp3'),
  bgmGallery: new Audio('assets/audio/bgm/bgm_gallery.mp3'),
  bgmDefense: new Audio('assets/audio/bgm/bgm_defense.mp3'),
  bgmChallenge: new Audio('assets/audio/bgm/bgm_challenge.mp3'),
  bgmTournament1: new Audio('assets/audio/bgm/bgm_tournament01.mp3'),
  bgmTournament2: new Audio('assets/audio/bgm/bgm_tournament02.mp3'),
  bgmOnline: new Audio('assets/audio/bgm/bgm_online.mp3'),
  bgmHighDifficulty: new Audio('assets/audio/bgm/bgm_high_difficulty.mp3'),
  bgmStageAndroid: new Audio('assets/audio/bgm/bgm_stage_android01.mp3'),
  bgmStageDragon: new Audio('assets/audio/bgm/bgm_stage_dragon01.mp3'),
  bgmStageKnight: new Audio('assets/audio/bgm/bgm_stage_knight01.mp3'),
  bgmStageCthulhu: new Audio('assets/audio/bgm/bgm_stage_cthulhu01.mp3'),
  bgmStageElf: new Audio('assets/audio/bgm/bgm_stage_elf01.mp3'),
  bgmStageCleric: new Audio('assets/audio/bgm/bgm_stage_cleric01.mp3'),
  bgmStageDevilHunter: new Audio(
    'assets/audio/bgm/bgm_stage_devilhunter01.mp3'
  ),
  bgmStageWitch: new Audio('assets/audio/bgm/bgm_stage_witch01.mp3'),
  bgmStageOni: new Audio('assets/audio/bgm/bgm_stage_oni01.mp3'),
  bgmStagePriest: new Audio('assets/audio/bgm/bgm_stage_priest01.mp3'),
  bgmStageSatan: new Audio('assets/audio/bgm/bgm_stage_satan01.mp3'),
  bgmStageDungeon: new Audio('assets/audio/bgm/bgm_stage_dungeon01.mp3'),
  bgmStagePractice: new Audio('assets/audio/bgm/bgm_stage_practice01.mp3'),
  bgmStageHighDifficulty: new Audio(
    'assets/audio/bgm/bgm_stage_high_difficulty.mp3'
  ),
  bgmStory01: new Audio('assets/audio/bgm/bgm_story01.mp3'),
  bgmStory02: new Audio('assets/audio/bgm/bgm_story02.mp3'),
  // SE (Web Audio API用フォールバックとしても事前生成しておく)
  seClick: new Audio('assets/audio/se/se_click.mp3'),
  sePlace: new Audio('assets/audio/se/se_place.mp3'),
  seAttack: new Audio('assets/audio/se/se_attack.mp3'),
  seDamage: new Audio('assets/audio/se/se_damage.mp3'),
  seSkill: new Audio('assets/audio/se/se_skill_default.mp3'),
  seDestroy: new Audio('assets/audio/se/se_destroy.mp3'),
  seContinue: new Audio('assets/audio/se/se_skill_default.mp3'),
  seLegend: new Audio('assets/audio/se/se_legend.mp3'),
  seSkillBind: new Audio('assets/audio/se/se_skill_bind.mp3'),
  seSkillToxic: new Audio('assets/audio/se/se_skill_toxic.mp3'),
  seSkillCharge: new Audio('assets/audio/se/se_skill_charge.mp3'),
  seSkillFreeze: new Audio('assets/audio/se/se_skill_freeze.mp3'),
  seSkillCrush: new Audio('assets/audio/se/se_skill_crush.mp3'),
  seSkillSnipe: new Audio('assets/audio/se/se_skill_snipe.mp3'),
  seSkillHeal: new Audio('assets/audio/se/se_skill_heal.mp3'),
  seSkillDominate: new Audio('assets/audio/se/se_skill_dominate.mp3'),
  seTurnover: new Audio('assets/audio/se/se_turnoverthecard.mp3'),
  seMatching: new Audio('assets/audio/bgm/bgm_matching_metal.mp3'),
  seVS: new Audio('assets/audio/se/se_heavyslash.mp3'),
  seSkillMorph: new Audio('assets/audio/se/se_skill_morph.mp3'),
  seSkillGoaCrush: new Audio('assets/audio/se/se_skill_goacrush.mp3'),
  seSkillBloodDamage: new Audio('assets/audio/se/se_blooddamage.mp3'),
  seSkillExplode: new Audio('assets/audio/se/se_skill_explode.mp3'),
  voiceUndeadPlay: new Audio('assets/audio/voice/voice_undead_play.wav'),
  seSkillHero: new Audio('assets/audio/se/se_skill_hero.mp3'),
  seSkillExtort: new Audio('assets/audio/se/se_skill_extort.mp3'),
  seSkillAdversity: new Audio('assets/audio/se/se_skill_adversity.mp3'),
  seSkillBrutal: new Audio('assets/audio/se/se_skill_brutal.mp3'),
  seSkillSeal: new Audio('assets/audio/se/se_skill_seal.mp3'),
  seSkillArtillery: new Audio('assets/audio/se/se_skill_artillery.mp3'),
  seSkillSacrifice: new Audio('assets/audio/se/se_skill_sacrifice.mp3'),
  seSkillExecute: new Audio('assets/audio/se/se_skill_execute.mp3'),
  seSkillStealth: new Audio('assets/audio/se/se_skill_stealth.mp3'),
  seSkillCall: new Audio('assets/audio/se/se_skill_call.mp3'),
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
    const response = await fetch(url);
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
 * 特定のBGMをロードしてデコード（事前デコード用）
 */
export async function loadBgm(key, url) {
  try {
    const buffer = await loadAndDecodeAudio(url);
    if (buffer) {
      decodedBgms[url] = buffer;
      let relativePath = url;
      if (url.includes('assets/audio/bgm/')) {
        relativePath = url.substring(url.indexOf('assets/audio/bgm/'));
      }
      decodedBgms[relativePath] = buffer;
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

    const baseVol =
      typeof GameState !== 'undefined' &&
      typeof GameState.gameVolume !== 'undefined'
        ? GameState.gameVolume
        : 0.3;

    // BGM volume sync
    updateBgmGainNodes(baseVol);

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
  const backupSound = SOUNDS.seSkill;
  if (!skillId || skillId === 'none') {
    if (typeof window.playSound === 'function') window.playSound(backupSound);
    return;
  }

  const url = `assets/audio/se/se_skill_${skillId}.mp3`;

  if (audioCtx && typeof fetch === 'function') {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const baseVol =
      typeof GameState !== 'undefined' &&
      typeof GameState.gameVolume !== 'undefined'
        ? GameState.gameVolume
        : 0.3;

    const playBuffer = (buffer) => {
      const source = audioCtx.createBufferSource();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = baseVol;
      source.buffer = buffer;
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
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

  // 3. キャッシュ（SE / BGM / ボイスバッファ）の完全初期化
  // (AudioBufferは古いAudioContextに紐づいているため、新しいコンテキスト再生成時は全て破棄・再デコードが必要)
  Object.keys(seBuffers).forEach((key) => {
    delete seBuffers[key];
  });
  Object.keys(decodedBgms).forEach((key) => {
    delete decodedBgms[key];
  });
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

  // 4. HTML5 Audio (AUDIO_INSTANCES) の強制リロード
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

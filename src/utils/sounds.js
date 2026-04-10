/**
 * Mini Card Battle - Sound Management (Web Audio API Optimized)
 */
import { GameState } from '../hooks/gameState.js';


// Web Audio API Context
export let audioCtx = null;
export const seBuffers = {};
export const voiceBuffers = {};

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
    seClock: 'assets/audio/se/se_clock.mp3'
};

export const SOUNDS = {
    // 効果音パス (UI用など・文字列として保持)
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
    seClock: 'assets/audio/se/se_clock.mp3'
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
    bgmOnline: new Audio('assets/audio/bgm/bgm_online.mp3'),
    bgmHighDifficulty: new Audio('assets/audio/bgm/bgm_high_difficulty.mp3'),
    bgmStageAndroid: new Audio('assets/audio/bgm/bgm_stage_android01.mp3'),
    bgmStageDragon: new Audio('assets/audio/bgm/bgm_stage_dragon01.mp3'),
    bgmStageKnight: new Audio('assets/audio/bgm/bgm_stage_knight01.mp3'),
    bgmStageCthulhu: new Audio('assets/audio/bgm/bgm_stage_cthulhu01.mp3'),
    bgmStageElf: new Audio('assets/audio/bgm/bgm_stage_elf01.mp3'),
    bgmStageCleric: new Audio('assets/audio/bgm/bgm_stage_cleric01.mp3'),
    bgmStageDevilHunter: new Audio('assets/audio/bgm/bgm_stage_devilhunter01.mp3'),
    bgmStageWitch: new Audio('assets/audio/bgm/bgm_stage_witch01.mp3'),
    bgmStageOni: new Audio('assets/audio/bgm/bgm_stage_oni01.mp3'),
    bgmStageSatan: new Audio('assets/audio/bgm/bgm_stage_satan01.mp3'),
    bgmStageDungeon: new Audio('assets/audio/bgm/bgm_stage_dungeon01.mp3'),
    bgmStagePractice: new Audio('assets/audio/bgm/bgm_stage_practice01.mp3'),
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
    seSkillCharge: new Audio('assets/audio/se/se_skill_charge.mp3')
};

// サウンドの初期設定
Object.keys(AUDIO_INSTANCES).forEach(key => {
    const audio = AUDIO_INSTANCES[key];
    if (key.startsWith('bgm')) {
        audio.loop = true;
        // BGMのみ、各所での参照互換性（SOUNDS.bgmTitle等）を保つためマージ
        SOUNDS[key] = audio;
    } else {
        // SEについては、SOUNDS[文字列パス] 経由でフォールバックAudioが引けるようにする
        const urlStr = SOUNDS[key];
        if (urlStr) SOUNDS[urlStr] = audio;
    }
    audio.volume = 0.3;
    audio.load(); // 事前ロード
});

/**
 * 音声ファイルをロードしてデコードし、バッファとして返す
 */
export async function loadAndDecodeAudio(url) {
    if (!audioCtx) return null;
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.warn(`Failed to load/decode audio: ${url}`, e);
        return null;
    }
}

/**
 * 特定のSEをロードしてデコード
 */
export async function loadSE(key, url) {
    const buffer = await loadAndDecodeAudio(url);
    if (buffer) {
        seBuffers[key] = buffer;
        seBuffers[url] = buffer; // 文字列パスでも引けるようにする
    }
}

export let isAudioUnlocked = false;
export const bgmGainNodes = {};

export function updateBgmGainNodes(vol) {
    if (!audioCtx) return;
    Object.values(bgmGainNodes).forEach(gainNode => {
        if (gainNode && gainNode.gain) {
            // Apply volume instantly or with a very short ramp to avoid clicks
            gainNode.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.01);
        }
    });
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
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        // 全てのSEを非同期でロード開始
        const loadPromises = Object.entries(SE_PATHS).map(([key, url]) => loadSE(key, url));

        // AudioContext のレジューム（これがアンロックの肝）
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        // BGMをWeb Audio APIルーターに通す (iOS等での動的音量制御のため)
        Object.keys(AUDIO_INSTANCES).forEach(key => {
            if (key.startsWith('bgm') && !bgmGainNodes[key]) {
                try {
                    const audio = AUDIO_INSTANCES[key];
                    const source = audioCtx.createMediaElementSource(audio);
                    const gainNode = audioCtx.createGain();
                    const baseVol = (typeof GameState !== 'undefined' && typeof GameState.gameVolume !== 'undefined') ? GameState.gameVolume : 0.3;
                    gainNode.gain.value = baseVol;
                    source.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                    bgmGainNodes[key] = gainNode;
                } catch (err) {
                    console.warn("Failed to route BGM to Web Audio API", err);
                }
            }
        });

        // ダミー再生（念のため）
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(0);
        osc.stop(0.1);

        isAudioUnlocked = true;
        console.log("Web Audio Context Unlocked and SE Buffers Loaded");

        // バックグラウンド・フォアグラウンド移行時の音声バグ対策 (iOS/Android Safari, Chrome)
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                const isHidden = document.visibilityState === 'hidden';

                // 全てのBGM等Audio要素を安全に退避・復帰
                Object.values(AUDIO_INSTANCES).forEach(audio => {
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
                                if (p !== undefined) p.catch(() => { });
                                audio._wasPlayingBeforeHide = false;
                            }
                        }
                    }
                });

                if (!audioCtx) return;
                if (isHidden) {
                    if (audioCtx.state === 'running') {
                        audioCtx.suspend().catch(e => console.warn(e));
                    }
                } else {
                    if (audioCtx.state === 'suspended') {
                        audioCtx.resume().catch(e => console.warn(e));
                    }
                }
            });
        }
    } catch (e) {
        console.warn("Failed to unlock audio context (Browser restriction):", e);
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
        const baseVol = (typeof GameState !== 'undefined' && typeof GameState.gameVolume !== 'undefined') ? GameState.gameVolume : 0.3;

        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error("not found");
                return res.arrayBuffer();
            })
            .then(ab => audioCtx.decodeAudioData(ab))
            .then(buffer => {
                const source = audioCtx.createBufferSource();
                const gainNode = audioCtx.createGain();
                gainNode.gain.value = baseVol;
                source.buffer = buffer;
                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                source.start(0);
            })
            .catch(e => {
                if (typeof window.playSound === 'function') window.playSound(backupSound);
            });
    } else {
        if (typeof window.playSound === 'function') window.playSound(backupSound);
    }
}

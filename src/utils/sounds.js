/**
 * Mini Card Battle - Sound Management (Web Audio API Optimized)
 */

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
    seLegend: 'assets/audio/se/se_legend.mp3'
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
    seLegend: 'assets/audio/se/se_legend.mp3'
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
    bgmHighDifficulty: new Audio('assets/audio/bgm/bgm_high_difficulty.mp3'),
    bgmStageAndroid: new Audio('assets/audio/bgm/bgm_stage_android01.mp3'),
    bgmStageDragon: new Audio('assets/audio/bgm/bgm_stage_dragon01.mp3'),
    bgmStageKnight: new Audio('assets/audio/bgm/bgm_stage_knight01.mp3'),
    bgmStageCthulhu: new Audio('assets/audio/bgm/bgm_stage_cthulhu01.mp3'),
    bgmStageElf: new Audio('assets/audio/bgm/bgm_stage_elf01.mp3'),
    bgmStageCleric: new Audio('assets/audio/bgm/bgm_stage_cleric01.mp3'),
    bgmStageDevilHunter: new Audio('assets/audio/bgm/bgm_stage_devilhunter01.mp3'),
    bgmStageSatan: new Audio('assets/audio/bgm/bgm_stage_satan01.mp3'),
    bgmStageDungeon: new Audio('assets/audio/bgm/bgm_stage_dungeon01.mp3'),
    // SE (Web Audio API用フォールバックとしても事前生成しておく)
    seClick: new Audio('assets/audio/se/se_click.mp3'),
    sePlace: new Audio('assets/audio/se/se_place.mp3'),
    seAttack: new Audio('assets/audio/se/se_attack.mp3'),
    seDamage: new Audio('assets/audio/se/se_damage.mp3'),
    seSkill: new Audio('assets/audio/se/se_skill_default.mp3'),
    seDestroy: new Audio('assets/audio/se/se_destroy.mp3'),
    seContinue: new Audio('assets/audio/se/se_skill_default.mp3'),
    seLegend: new Audio('assets/audio/se/se_legend.mp3')
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

// モバイル向けの音声アンロックフラグ
export let isAudioUnlocked = false;

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
    } catch (e) {
        console.warn("Failed to unlock audio context (Browser restriction):", e);
    }
}

export function playSkillSound(skillId) {
    const backupSound = SOUNDS.seSkill;
    if (!skillId || skillId === 'none') {
        playSound(backupSound);
        return;
    }
    
    const url = `assets/audio/se/se_skill_${skillId}.mp3`;
    const audio = new Audio();
    audio.volume = 0.3;
    
    audio.addEventListener('canplaythrough', () => {
        audio.play().catch(e => console.warn(`Failed to play SE for ${skillId}`, e));
    });
    
    audio.addEventListener('error', () => {
        // 読み込みエラー（ファイルが存在しない等）の場合はデフォルトの効果音を再生
        playSound(backupSound);
    });
    
    audio.src = url;
    audio.load();
}

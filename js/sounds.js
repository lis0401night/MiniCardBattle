/**
 * Mini Card Battle - Sound Management (Web Audio API Optimized)
 */

// Web Audio API Context
let audioCtx = null;
const seBuffers = {};
const voiceBuffers = {};

const SE_PATHS = {
    seClick: 'assets/se_click.mp3',
    sePlace: 'assets/se_place.mp3',
    seAttack: 'assets/se_attack.mp3',
    seDamage: 'assets/se_damage.mp3',
    seSkill: 'assets/se_skill.mp3',
    seDestroy: 'assets/se_destroy.mp3',
    seContinue: 'assets/se_skill.mp3',
    seLegend: 'assets/se_legend.mp3'
};

const SOUNDS = {
    // BGM
    bgmTitle: new Audio('assets/bgm_title.mp3'),
    bgmBattle: new Audio('assets/bgm_battle.mp3'),
    bgmEnding: new Audio('assets/bgm_ending.mp3'),
    bgmLastBattle: new Audio('assets/bgm_lastbattle.mp3'),
    bgmGallery: new Audio('assets/bgm_gallery.mp3'),
    bgmDefense: new Audio('assets/bgm_defense.mp3'),
    bgmStageAndroid: new Audio('assets/bgm_stage_android01.mp3'),
    bgmStageDragon: new Audio('assets/bgm_stage_dragon01.mp3'),
    bgmStageKnight: new Audio('assets/bgm_stage_knight01.mp3'),
    bgmStageCthulhu: new Audio('assets/bgm_stage_cthulhu01.mp3'),
    bgmStageElf: new Audio('assets/bgm_stage_elf01.mp3'),
    bgmStageCleric: new Audio('assets/bgm_stage_cleric01.mp3'),
    bgmStageSatan: new Audio('assets/bgm_stage_satan01.mp3'),
    // SE (Web Audioが使えない場合のフォールバック用にAudioインスタンスを保持)
    seClick: new Audio('assets/se_click.mp3'),
    sePlace: new Audio('assets/se_place.mp3'),
    seAttack: new Audio('assets/se_attack.mp3'),
    seDamage: new Audio('assets/se_damage.mp3'),
    seSkill: new Audio('assets/se_skill.mp3'),
    seDestroy: new Audio('assets/se_destroy.mp3'),
    seContinue: new Audio('assets/se_skill.mp3'),
    seLegend: new Audio('assets/se_legend.mp3')
};

// サウンドの初期設定
Object.keys(SOUNDS).forEach(key => {
    const audio = SOUNDS[key];
    if (key.startsWith('bgm')) {
        audio.loop = true;
    }
    audio.volume = 0.3;
    audio.load(); // 事前ロード
});

/**
 * 音声ファイルをロードしてデコードし、バッファとして返す
 */
async function loadAndDecodeAudio(url) {
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
async function loadSE(key, url) {
    const buffer = await loadAndDecodeAudio(url);
    if (buffer) {
        seBuffers[key] = buffer;
    }
}

// モバイル向けの音声アンロックフラグ
let isAudioUnlocked = false;

/**
 * モバイルブラウザの音声制限を解除する
 */
async function unlockAudio() {
    if (isAudioUnlocked) return;
    
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

    await Promise.all(loadPromises);
    isAudioUnlocked = true;
    console.log("Web Audio Context Unlocked and SE Buffers Loaded");
}

/**
 * Mini Card Battle - Sound Management
 */
const SOUNDS = {
    bgmTitle: new Audio('assets/bgm_title.mp3'),
    bgmBattle: new Audio('assets/bgm_battle.mp3'),
    bgmEnding: new Audio('assets/bgm_ending.mp3'),
    bgmLastBattle: new Audio('assets/bgm_lastbattle.mp3'),
    bgmStageAndroid: new Audio('assets/bgm_stage_android01.mp3'),
    bgmStageDragon: new Audio('assets/bgm_stage_dragon01.mp3'),
    bgmStageKnight: new Audio('assets/bgm_stage_knight01.mp3'),
    bgmStageCthulhu: new Audio('assets/bgm_stage_cthulhu01.mp3'),
    bgmStageElf: new Audio('assets/bgm_stage_elf01.mp3'),
    bgmStageCleric: new Audio('assets/bgm_stage_cleric01.mp3'),
    bgmStageSatan: new Audio('assets/bgm_stage_satan01.mp3'),
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
    if (key.startsWith('bgm')) {
        SOUNDS[key].loop = true;
    }
});
Object.values(SOUNDS).forEach(audio => { 
    audio.volume = 0.3; 
    audio.load(); // 事前にロードを開始して遅延を防ぐ
});

// モバイル向けの音声アンロックフラグ
let isAudioUnlocked = false;

/**
 * 全ての音声を一度再生（またはロード完遂）して、モバイルブラウザの制限を解除する
 */
async function unlockAudio() {
    if (isAudioUnlocked) return;
    
    // 全てのサウンドオブジェクトに対してアクションを起こす
    const promises = Object.values(SOUNDS).map(audio => {
        return new Promise(resolve => {
            // 音量0で再生開始
            const originalVol = audio.volume;
            audio.volume = 0;
            const playPromise = audio.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.volume = originalVol;
                    resolve();
                }).catch(() => {
                    // 失敗しても次へ進む
                    audio.volume = originalVol;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });

    await Promise.all(promises);
    isAudioUnlocked = true;
    console.log("Audio Unlocked for Mobile");
}

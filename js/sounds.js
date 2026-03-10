/**
 * Mini Card Battle - Sound Management
 */
const SOUNDS = {
    bgmTitle: new Audio('assets/bgm_title.mp3'),
    bgmBattle: new Audio('assets/bgm_battle.mp3'),
    bgmEnding: new Audio('assets/bgm_ending.mp3'),
    bgmLastBattle: new Audio('assets/bgm_lastbattle.mp3'),
    bgmStageAndroid: new Audio('assets/bgm_stage_android01.mp3'),
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
SOUNDS.bgmTitle.loop = true;
SOUNDS.bgmBattle.loop = true;
SOUNDS.bgmEnding.loop = true;
SOUNDS.bgmLastBattle.loop = true;
SOUNDS.bgmStageAndroid.loop = true;
Object.values(SOUNDS).forEach(audio => { audio.volume = 0.3; });

/**
 * Mini Card Battle - Voice Categories
 * 
 * カードのボイスカテゴリと音声ファイルの定義
 * 将来的に 'attack' や 'death' などのシチュエーションを追加可能
 */

// ボイス専用の全体音量設定（SEに対する倍率。1.0が基準、大きくするとSEより大きく聞こえる）
const VOICE_SETTINGS = {
    globalVolumeMultiplier: 1.5
};

const VOICE_CATEGORIES = {
    // モンスター系
    'monster_large': {
        play: 'assets/voice/voice_monster_large_play.wav',
        death: 'assets/voice/voice_monster_large_death.wav',
        volume: 1.0 // カテゴリごとの個別音量調整
    },
    'monster_small': {
        play: 'assets/voice/voice_monster_small_play.wav',
        death: 'assets/voice/voice_monster_small_death.wav',
        volume: 1.0
    },
    'beast': {
        play: 'assets/voice/voice_beast_play.wav',
        death: 'assets/voice/voice_beast_death.wav',
        volume: 1.0
    },
    'wolf': {
        play: 'assets/voice/voice_wolf_play.wav',
        death: 'assets/voice/voice_wolf_death.wav',
        volume: 1.0
    },
    'dragon': {
        play: 'assets/voice/voice_dragon_play.wav',
        death: 'assets/voice/voice_dragon_death.wav',
        volume: 1.0
    },
    'undead': {
        play: 'assets/voice/voice_undead_play.wav',
        death: 'assets/voice/voice_undead_death.wav',
        volume: 1.0
    },
    'machine': {
        play: 'assets/voice/voice_machine_play.wav',
        death: 'assets/voice/voice_machine_death.wav',
        volume: 1.0
    },
    // 人間・亜人系
    'human_male': {
        play: 'assets/voice/voice_human_male_play.wav',
        death: 'assets/voice/voice_human_male_death.wav',
        volume: 1.0
    },
    'human_male2': {
        play: 'assets/voice/voice_human_male2_play.wav',
        death: 'assets/voice/voice_human_male2_death.wav',
        volume: 1.0
    },
    'human_female': {
        play: 'assets/voice/voice_human_female_play.wav',
        death: 'assets/voice/voice_human_female_death.wav',
        volume: 1.0
    },
    'human_female2': {
        play: 'assets/voice/voice_human_female2_play.wav',
        death: 'assets/voice/voice_human_female2_death.wav',
        volume: 1.0
    },
    'human_female3': {
        play: 'assets/voice/voice_human_female_play.wav',
        death: 'assets/voice/voice_human_female_death.wav',
        volume: 1.0
    },
    'warrior': {
        play: 'assets/voice/voice_warrior_play.wav',
        death: 'assets/voice/voice_warrior_death.wav',
        volume: 1.0
    },
    'mage': {
        play: 'assets/voice/voice_mage_play.wav',
        death: 'assets/voice/voice_mage_death.wav',
        volume: 1.0
    },
    'holy': {
        play: 'assets/voice/voice_holy_play.wav',
        death: 'assets/voice/voice_holy_death.wav',
        volume: 1.0
    },
    'dark': {
        play: 'assets/voice/voice_dark_play.wav',
        death: 'assets/voice/voice_dark_death.wav',
        volume: 1.0
    },
    // 特殊系
    'alien': {
        play: 'assets/voice/voice_alien_play.wav',
        death: 'assets/voice/voice_alien_death.wav',
        volume: 1.0
    },
    'god': {
        play: 'assets/voice/voice_god_play.wav',
        death: 'assets/voice/voice_god_death.wav',
        volume: 1.0
    }
};

// ボイス再生用の関数
function playCardVoice(category, situation = 'play') {
    if (!category || !VOICE_CATEGORIES[category] || !VOICE_CATEGORIES[category][situation]) {
        return;
    }

    try {
        const audioPath = VOICE_CATEGORIES[category][situation];
        const categoryVolume = VOICE_CATEGORIES[category].volume || 1.0;
        const voiceAudio = new Audio(audioPath);

        // ゲームのマスターボリュームを取得
        const baseVol = (typeof gameVolume !== 'undefined') ? gameVolume : 0.3;

        // マスターボリューム × ボイス全体倍率 × カテゴリ個別倍率
        let finalVolume = baseVol * VOICE_SETTINGS.globalVolumeMultiplier * categoryVolume;

        // 音量が1.0（100%）を超えないように制限
        finalVolume = Math.min(1.0, Math.max(0.0, finalVolume));

        voiceAudio.volume = finalVolume;
        voiceAudio.play().catch(e => {
            console.warn("Card voice play failed:", e);
        });
    } catch (e) {
        console.error("Card voice initialization failed:", e);
    }
}

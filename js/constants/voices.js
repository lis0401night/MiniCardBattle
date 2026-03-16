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
    'giant': {
        play: 'assets/voice/voice_giant_play.wav',
        death: 'assets/voice/voice_giant_death.wav',
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
    'bird': {
        play: 'assets/voice/voice_bird_play.wav',
        death: 'assets/voice/voice_bird_death.wav',
        volume: 1.0
    },
    'insect': {
        play: 'assets/voice/voice_insect_play.wav',
        death: 'assets/voice/voice_insect_death.wav',
        volume: 1.0
    },
    'horse': {
        play: 'assets/voice/voice_horse_play.wav',
        death: 'assets/voice/voice_horse_death.wav',
        volume: 1.0
    },
    // 人間・亜人系
    'human_male_normal': {
        play: 'assets/voice/voice_human_male_normal_play.wav',
        death: 'assets/voice/voice_human_male_normal_death.wav',
        volume: 1.0
    },
    'human_male_ikemen': {
        play: 'assets/voice/voice_human_male_ikemen_play.wav',
        death: 'assets/voice/voice_human_male_ikemen_death.wav',
        volume: 1.2
    },
    'human_male3': {
        play: 'assets/voice/voice_human_male2_play.wav',
        death: 'assets/voice/voice_human_male2_death.wav',
        volume: 1.0
    },
    'human_female_ikemen': {
        play: 'assets/voice/voice_human_female_ikemen_play.wav',
        death: 'assets/voice/voice_human_female_ikemen_death.wav',
        volume: 1.0
    },
    'human_female_young': {
        play: 'assets/voice/voice_human_female_young_play.wav',
        death: 'assets/voice/voice_human_female_young_death.wav',
        volume: 1.0
    },
    'human_female_assassin': {
        play: 'assets/voice/voice_human_female_assassin_play.wav',
        death: 'assets/voice/voice_human_female_assassin_death.wav',
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
    'sword': {
        play: 'assets/voice/voice_sword_play.wav',
        death: 'assets/voice/voice_sword_death.wav',
        volume: 1.0
    },
    // 無機物系
    'rock': {
        play: 'assets/voice/voice_rock_play.wav',
        death: 'assets/voice/voice_rock_death.wav',
        volume: 0.5
    },
    'machine_old': {
        play: 'assets/voice/voice_machine_old_play.wav',
        death: 'assets/voice/voice_machine_old_death.wav',
        volume: 1.0
    },
    'machine_new': {
        play: 'assets/voice/voice_machine_new_play.wav',
        death: 'assets/voice/voice_machine_new_death.wav',
        volume: 0.8
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
const voiceAudioCache = {};

function playCardVoice(category, situation = 'play') {
    if (!category || !VOICE_CATEGORIES[category] || !VOICE_CATEGORIES[category][situation]) {
        return;
    }

    try {
        const audioPath = VOICE_CATEGORIES[category][situation];

        // キャッシュからテンプレートを取得し、再生中ならクローンして重ねる
        let voiceAudio = voiceAudioCache[audioPath];
        if (!voiceAudio) {
            voiceAudio = new Audio(audioPath);
            voiceAudio.load();
            voiceAudioCache[audioPath] = voiceAudio;
        }

        const categoryVolume = VOICE_CATEGORIES[category].volume || 1.0;
        const baseVol = (typeof gameVolume !== 'undefined') ? gameVolume : 0.3;
        let finalVolume = baseVol * VOICE_SETTINGS.globalVolumeMultiplier * categoryVolume;
        finalVolume = Math.min(1.0, Math.max(0.0, finalVolume));

        try {
            if (voiceAudio.paused || voiceAudio.ended) {
                voiceAudio.volume = finalVolume;
                voiceAudio.currentTime = 0;
                voiceAudio.play().catch(e => console.warn("Card voice play failed:", e));
            } else {
                const clone = voiceAudio.cloneNode();
                clone.volume = finalVolume;
                clone.play().catch(e => console.warn("Card voice clone play failed:", e));
            }
        } catch (e) {
            console.warn("playCardVoice execution failed:", e);
        }
    } catch (e) {
        console.error("Card voice initialization failed:", e);
    }
}

import { audioCtx, voiceBuffers, loadAndDecodeAudio } from '../sounds.js';
import { GameState } from '../../hooks/gameState.js';

/**
 * Mini Card Battle - Voice Categories
 * 
 * カードのボイスカテゴリと音声ファイルの定義
 * 将来的に 'attack' や 'death' などのシチュエーションを追加可能
 */

// ボイス専用の全体音量設定（SEに対する倍率。1.0が基準、大きくするとSEより大きく聞こえる）
export const VOICE_SETTINGS = {
    globalVolumeMultiplier: 1.5
};

export const VOICE_CATEGORIES = {
    // モンスター系
    'monster': {
        play: 'assets/audio/voice/voice_monster_play.wav',
        death: 'assets/audio/voice/voice_monster_death.wav',
        volume: 1.0 // カテゴリごとの個別音量調整
    },
    'monster_small': {
        play: 'assets/audio/voice/voice_monster_small_play.wav',
        death: 'assets/audio/voice/voice_monster_small_death.wav',
        volume: 1.0
    },
    'devil': {
        play: 'assets/audio/voice/voice_devil_play.wav',
        death: 'assets/audio/voice/voice_devil_death.wav',
        volume: 1.0
    },
    'beast': {
        play: 'assets/audio/voice/voice_beast_play.wav',
        death: 'assets/audio/voice/voice_beast_death.wav',
        volume: 1.0
    },
    'giant': {
        play: 'assets/audio/voice/voice_giant_play.wav',
        death: 'assets/audio/voice/voice_giant_death.wav',
        volume: 1.0
    },
    'wolf': {
        play: 'assets/audio/voice/voice_wolf_play.wav',
        death: 'assets/audio/voice/voice_wolf_death.wav',
        volume: 1.0
    },
    'dragon': {
        play: 'assets/audio/voice/voice_dragon_play.wav',
        death: 'assets/audio/voice/voice_dragon_death.wav',
        volume: 1.0
    },
    'undead': {
        play: 'assets/audio/voice/voice_undead_play.wav',
        death: 'assets/audio/voice/voice_undead_death.wav',
        volume: 1.0
    },
    'bird': {
        play: 'assets/audio/voice/voice_bird_play.wav',
        death: 'assets/audio/voice/voice_bird_death.wav',
        volume: 1.0
    },
    'insect': {
        play: 'assets/audio/voice/voice_insect_play.wav',
        death: 'assets/audio/voice/voice_insect_death.wav',
        volume: 1.0
    },
    'horse': {
        play: 'assets/audio/voice/voice_horse_play.wav',
        death: 'assets/audio/voice/voice_horse_death.wav',
        volume: 1.0
    },
    'lizard': {
        play: 'assets/audio/voice/voice_lizard_play.wav',
        death: 'assets/audio/voice/voice_lizard_death.wav',
        volume: 1.0
    },
    // 人間・亜人系
    'human_male_normal': {
        play: 'assets/audio/voice/voice_human_male_normal_play.wav',
        death: 'assets/audio/voice/voice_human_male_normal_death.wav',
        volume: 1.0
    },
    'human_male_ikemen': {
        play: 'assets/audio/voice/voice_human_male_ikemen_play.wav',
        death: 'assets/audio/voice/voice_human_male_ikemen_death.wav',
        volume: 1.2
    },
    'human_male_warrior': {
        play: 'assets/audio/voice/voice_human_male_warrior_play.wav',
        death: 'assets/audio/voice/voice_human_male_warrior_death.wav',
        volume: 1.0
    },
    'human_female_ikemen': {
        play: 'assets/audio/voice/voice_human_female_ikemen_play.wav',
        death: 'assets/audio/voice/voice_human_female_ikemen_death.wav',
        volume: 1.0
    },
    'human_female_young': {
        play: 'assets/audio/voice/voice_human_female_young_play.wav',
        death: 'assets/audio/voice/voice_human_female_young_death.wav',
        volume: 1.0
    },
    'human_female_assassin': {
        play: 'assets/audio/voice/voice_human_female_assassin_play.wav',
        death: 'assets/audio/voice/voice_human_female_assassin_death.wav',
        volume: 1.0
    },
    'warrior': {
        play: 'assets/audio/voice/voice_warrior_play.wav',
        death: 'assets/audio/voice/voice_warrior_death.wav',
        volume: 1.0
    },
    'mage': {
        play: 'assets/audio/voice/voice_mage_play.wav',
        death: 'assets/audio/voice/voice_mage_death.wav',
        volume: 1.0
    },
    'holy': {
        play: 'assets/audio/voice/voice_holy_play.wav',
        death: 'assets/audio/voice/voice_holy_death.wav',
        volume: 1.0
    },
    'dark': {
        play: 'assets/audio/voice/voice_dark_play.wav',
        death: 'assets/audio/voice/voice_dark_death.wav',
        volume: 1.0
    },
    'sword': {
        play: 'assets/audio/voice/voice_sword_play.wav',
        death: 'assets/audio/voice/voice_sword_death.wav',
        volume: 1.0
    },
    // 無機物系
    'rock': {
        play: 'assets/audio/voice/voice_rock_play.wav',
        death: 'assets/audio/voice/voice_rock_death.wav',
        volume: 1.0
    },
    'machine_old': {
        play: 'assets/audio/voice/voice_machine_old_play.wav',
        death: 'assets/audio/voice/voice_machine_old_death.wav',
        volume: 1.0
    },
    'machine_new': {
        play: 'assets/audio/voice/voice_machine_new_play.wav',
        death: 'assets/audio/voice/voice_machine_new_death.wav',
        volume: 0.8
    },
    // 特殊系
    'alien': {
        play: 'assets/audio/voice/voice_alien_play.wav',
        death: 'assets/audio/voice/voice_alien_death.wav',
        volume: 1.0
    },
    'god': {
        play: 'assets/audio/voice/voice_god_play.wav',
        death: 'assets/audio/voice/voice_god_death.wav',
        volume: 1.0
    }
};

// ボイス再生用の関数
export const voiceAudioCache = {};

export async function playCardVoice(category, situation = 'play') {
    if (!category || !VOICE_CATEGORIES[category] || !VOICE_CATEGORIES[category][situation]) {
        return;
    }

    const audioPath = VOICE_CATEGORIES[category][situation];
    const categoryVolume = VOICE_CATEGORIES[category].volume || 1.0;
    const baseVol = (typeof GameState.gameVolume !== 'undefined') ? GameState.gameVolume : 0.3;
    let finalVolume = baseVol * VOICE_SETTINGS.globalVolumeMultiplier * categoryVolume;
    finalVolume = Math.min(1.0, Math.max(0.0, finalVolume));

    // Web Audio API による再生
    if (audioCtx) {
        try {
            if (audioCtx.state === 'suspended') await audioCtx.resume();

            // キャッシュにバッファがない場合は新しくロード
            if (!voiceBuffers[audioPath]) {
                voiceBuffers[audioPath] = await loadAndDecodeAudio(audioPath);
            }

            const buffer = voiceBuffers[audioPath];
            if (buffer) {
                const source = audioCtx.createBufferSource();
                const gainNode = audioCtx.createGain();
                source.buffer = buffer;
                gainNode.gain.value = finalVolume;
                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                source.start(0);
                return;
            }
        } catch (e) {
            console.warn("Web Audio voice play failed:", e);
        }
    }

    // フォールバック: HTML5 Audio
    try {
        let voiceAudio = voiceAudioCache[audioPath];
        if (!voiceAudio) {
            voiceAudio = new Audio(audioPath);
            voiceAudio.load();
            voiceAudioCache[audioPath] = voiceAudio;
        }

        if (voiceAudio.paused || voiceAudio.ended) {
            voiceAudio.volume = finalVolume;
            voiceAudio.currentTime = 0;
            const p = voiceAudio.play();
            if (p !== undefined) p.catch(e => console.warn("Fallback voice play failed:", e));
        } else {
            const clone = voiceAudio.cloneNode();
            clone.volume = finalVolume;
            const p = clone.play();
            if (p !== undefined) p.catch(e => console.warn("Fallback voice clone play failed:", e));
        }
    } catch (e) {
        console.warn("Fallback voice logic failed:", e);
    }
}

import { audioCtx, voiceBuffers, loadAndDecodeAudio } from '../sounds.js';
import { GameState } from '../../state/gameState.js';
import { CARD_MASTER } from './cards.js';

/**
 * Mini Card Battle - Voice Categories
 *
 * カードのボイスカテゴリと音声ファイルの定義
 * 将来的に 'attack' や 'death' などのシチュエーションを追加可能
 */

// ボイス専用の全体音量設定（SEに対する倍率。1.0が基準、大きくするとSEより大きく聞こえる）
export const VOICE_SETTINGS = {
  globalVolumeMultiplier: 1.5,
};

export const VOICE_CATEGORIES = {
  // モンスター系
  monster: {
    play: 'assets/audio/voice/voice_monster_play.mp3',
    death: 'assets/audio/voice/voice_monster_death.mp3',
    volume: 1.0, // カテゴリごとの個別音量調整
  },
  devil: {
    play: 'assets/audio/voice/voice_devil_play.mp3',
    death: 'assets/audio/voice/voice_devil_death.mp3',
    volume: 1.0,
  },
  beast: {
    play: 'assets/audio/voice/voice_beast_play.mp3',
    death: 'assets/audio/voice/voice_beast_death.mp3',
    volume: 1.0,
  },
  giant: {
    play: 'assets/audio/voice/voice_giant_play.mp3',
    death: 'assets/audio/voice/voice_giant_death.mp3',
    volume: 1.0,
  },
  wolf: {
    play: 'assets/audio/voice/voice_wolf_play.mp3',
    death: 'assets/audio/voice/voice_wolf_death.mp3',
    volume: 1.0,
  },
  dragon: {
    play: 'assets/audio/voice/voice_dragon_play.mp3',
    death: 'assets/audio/voice/voice_dragon_death.mp3',
    volume: 1.0,
  },
  undead: {
    play: 'assets/audio/voice/voice_undead_play.mp3',
    death: 'assets/audio/voice/voice_undead_death.mp3',
    volume: 1.0,
  },
  bird: {
    play: 'assets/audio/voice/voice_bird_play.mp3',
    death: 'assets/audio/voice/voice_bird_death.mp3',
    volume: 1.0,
  },
  insect: {
    play: 'assets/audio/voice/voice_insect_play.mp3',
    death: 'assets/audio/voice/voice_insect_death.mp3',
    volume: 1.0,
  },
  horse: {
    play: 'assets/audio/voice/voice_horse_play.mp3',
    death: 'assets/audio/voice/voice_horse_death.mp3',
    volume: 1.0,
  },
  lizard: {
    play: 'assets/audio/voice/voice_lizard_play.mp3',
    death: 'assets/audio/voice/voice_lizard_death.mp3',
    volume: 1.0,
  },
  snake: {
    play: 'assets/audio/voice/voice_snake_play.mp3',
    death: 'assets/audio/voice/voice_snake_death.mp3',
    volume: 1.0,
  },
  sea: {
    play: 'assets/audio/voice/voice_sea_play.mp3',
    death: 'assets/audio/voice/voice_sea_death.mp3',
    volume: 1.0,
  },
  // 人間・亜人系
  human_male_normal: {
    play: 'assets/audio/voice/voice_human_male_normal_play.mp3',
    death: 'assets/audio/voice/voice_human_male_normal_death.mp3',
    volume: 1.0,
  },
  human_male_ikemen: {
    play: 'assets/audio/voice/voice_human_male_ikemen_play.mp3',
    death: 'assets/audio/voice/voice_human_male_ikemen_death.mp3',
    volume: 1.2,
  },
  human_male_warrior: {
    play: 'assets/audio/voice/voice_human_male_warrior_play.mp3',
    death: 'assets/audio/voice/voice_human_male_warrior_death.mp3',
    volume: 1.0,
  },
  human_male_trickstar: {
    play: 'assets/audio/voice/voice_human_male_trickstar_play.mp3',
    death: 'assets/audio/voice/voice_human_male_trickstar_death.mp3',
    volume: 1.0,
  },
  human_male_old: {
    play: 'assets/audio/voice/voice_human_male_old_play.mp3',
    death: 'assets/audio/voice/voice_human_male_old_death.mp3',
    volume: 1.0,
  },
  human_female_cute: {
    play: 'assets/audio/voice/voice_human_female_cute_play.mp3',
    death: 'assets/audio/voice/voice_human_female_cute_death.mp3',
    volume: 1.0,
  },
  human_female_normal: {
    play: 'assets/audio/voice/voice_human_female_normal_play.mp3',
    death: 'assets/audio/voice/voice_human_female_normal_death.mp3',
    volume: 1.0,
  },
  human_female_cool: {
    play: 'assets/audio/voice/voice_human_female_cool_play.mp3',
    death: 'assets/audio/voice/voice_human_female_cool_death.mp3',
    volume: 1.0,
  },
  human_female_assassin: {
    play: 'assets/audio/voice/voice_human_female_assassin_play.mp3',
    death: 'assets/audio/voice/voice_human_female_assassin_death.mp3',
    volume: 1.0,
  },
  human_female_sexy: {
    play: 'assets/audio/voice/voice_human_female_sexy_play.mp3',
    death: 'assets/audio/voice/voice_human_female_sexy_death.mp3',
    volume: 1.0,
  },
  magic: {
    play: 'assets/audio/voice/voice_magic_play.mp3',
    death: 'assets/audio/voice/voice_magic_death.mp3',
    volume: 1.0,
  },
  // 無機物系
  stone: {
    play: 'assets/audio/voice/voice_stone_play.mp3',
    death: 'assets/audio/voice/voice_stone_death.mp3',
    volume: 1.0,
  },
  machine_old: {
    play: 'assets/audio/voice/voice_machine_old_play.mp3',
    death: 'assets/audio/voice/voice_machine_old_death.mp3',
    volume: 1.0,
  },
  machine_new: {
    play: 'assets/audio/voice/voice_machine_new_play.mp3',
    death: 'assets/audio/voice/voice_machine_new_death.mp3',
    volume: 0.8,
  },
  sword: {
    play: 'assets/audio/voice/voice_sword_play.mp3',
    death: 'assets/audio/voice/voice_sword_death.mp3',
    volume: 1.0,
  },
};

// ボイス再生用の関数
export const voiceAudioCache = {};

// プレミアムカード用ボイスタイプ変更テーブル
export const PREMIUM_VOICE_MAP = {
  cleric: 'human_female_sexy',
  cyberman: 'human_female_normal',
  dancer: 'human_female_normal',
  omyouji: 'human_female_normal',
  mummy: 'human_female_normal',
  commander: 'human_female_cool',
  eye: 'human_female_sexy',
  pray: 'human_female_cute',
  shaman: 'human_male_ikemen',
  necromancer: 'human_female_assassin',
  dreadnought: 'machine_new',
  battlemage: 'human_female_cool',
  muramasa: 'human_male_warrior',
  armsuits: 'bird',
  berserker: 'human_female_cool',
  liberator: 'human_female_cool',
  crusher: 'human_male_ikemen',
};

export async function playCardVoice(categoryOrCard, situation = 'play') {
  let category = '';

  if (categoryOrCard && typeof categoryOrCard === 'object') {
    const card = categoryOrCard;
    const lookupId = card.baseId || card.id;

    // プレミアムカード判定
    const isPremium =
      card.isPremium !== undefined
        ? card.isPremium
        : card.owner !== 'red' &&
          GameState.premiumCards &&
          GameState.premiumCards.includes(lookupId);

    if (isPremium && PREMIUM_VOICE_MAP[lookupId]) {
      category = PREMIUM_VOICE_MAP[lookupId];
    } else {
      category = card.voiceCategory;
      if (!category) {
        const master = CARD_MASTER.find((m) => m.id === lookupId);
        category = master ? master.voiceCategory : null;
      }
    }
  } else {
    category = categoryOrCard;
  }

  if (
    !category ||
    !VOICE_CATEGORIES[category] ||
    !VOICE_CATEGORIES[category][situation]
  ) {
    return;
  }

  const audioPath = VOICE_CATEGORIES[category][situation];
  const categoryVolume = VOICE_CATEGORIES[category].volume || 1.0;
  const baseVol =
    typeof GameState.gameVolume !== 'undefined' ? GameState.gameVolume : 0.3;
  let finalVolume =
    baseVol * VOICE_SETTINGS.globalVolumeMultiplier * categoryVolume;
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
      console.warn('Web Audio voice play failed:', e);
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
      if (p !== undefined)
        p.catch((e) => console.warn('Fallback voice play failed:', e));
    } else {
      const clone = voiceAudio.cloneNode();
      clone.volume = finalVolume;
      const p = clone.play();
      if (p !== undefined)
        p.catch((e) => console.warn('Fallback voice clone play failed:', e));
    }
  } catch (e) {
    console.warn('Fallback voice logic failed:', e);
  }
}

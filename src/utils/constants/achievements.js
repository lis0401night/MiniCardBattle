import { CARD_MASTER } from './cards.js';
import { ownedPlaymats } from './playmats.js';
import { saveDeck } from '../../hooks/deck.js';
import { GameState } from '../../hooks/gameState.js';

/**
 * Mini Card Battle - Achievements Data
 */

// 実績の定義
export const ACHIEVEMENT_MASTER = [
    // --- ストーリークリア ---
    {
        id: 'story_android',
        title: '機械人形の帰還',
        description: 'アイギスのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'android',
        reward: { type: 'playmat', value: 'android', name: 'アイギス' }
    },
    {
        id: 'story_android_hard',
        title: '感情の最適解',
        description: 'アイギスのストーリー（上級）をクリアする',
        type: 'story_clear_hard',
        targetValue: 'android',
        reward: { type: 'premium', value: 'golem', name: '大理石のゴーレム', isPremiumUnlock: true }
    },
    {
        id: 'story_dragon',
        title: '竜姫の凱旋',
        description: 'イグニスのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'dragon',
        reward: { type: 'playmat', value: 'dragon', name: 'イグニス' }
    },
    {
        id: 'story_dragon_hard',
        title: '猛火の灰燼',
        description: 'イグニスのストーリー（上級）をクリアする',
        type: 'story_clear_hard',
        targetValue: 'dragon',
        reward: { type: 'premium', value: 'dinosaur', name: '古代の大蜥蜴', isPremiumUnlock: true }
    },
    {
        id: 'story_knight',
        title: '光の誓い',
        description: 'セレスティアのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'knight',
        reward: { type: 'playmat', value: 'knight', name: 'セレスティア' }
    },
    {
        id: 'story_knight_hard',
        title: '白銀の誓光',
        description: 'セレスティアのストーリー（上級）をクリアする',
        type: 'story_clear_hard',
        targetValue: 'knight',
        reward: { type: 'premium', value: 'clone', name: '鏡の戦士', isPremiumUnlock: true }
    },
    {
        id: 'story_cthulhu',
        title: '深淵の呼び声',
        description: 'ナイアのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'cthulhu',
        reward: { type: 'playmat', value: 'cthulhu', name: 'ナイア' }
    },
    {
        id: 'story_cthulhu_hard',
        title: '無窮の深淵',
        description: 'ナイアのストーリー（上級）をクリアする',
        type: 'story_clear_hard',
        targetValue: 'cthulhu',
        reward: { type: 'premium', value: 'diviner', name: '星詠みの占術士', isPremiumUnlock: true }
    },
    {
        id: 'story_elf',
        title: '記憶の彼方へ',
        description: 'リナのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'elf',
        reward: { type: 'playmat', value: 'elf', name: 'リナ' }
    },
    {
        id: 'story_elf_hard',
        title: '真理の銀矢',
        description: 'リナのストーリー（上級）をクリアする',
        type: 'story_clear_hard',
        targetValue: 'elf',
        reward: { type: 'premium', value: 'sniper', name: '森の射手', isPremiumUnlock: true }
    },
    {
        id: 'story_cleric',
        title: '偽りの救済',
        description: 'エリシアのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'cleric',
        reward: { type: 'playmat', value: 'cleric', name: 'エリシア' }
    },
    {
        id: 'story_cleric_hard',
        title: '背徳の聖女',
        description: 'エリシアのストーリー（上級）をクリアする',
        type: 'story_clear_hard',
        targetValue: 'cleric',
        reward: { type: 'premium', value: 'cleric', name: '見習い修道女', isPremiumUnlock: true }
    },
    {
        id: 'story_devilhunter',
        title: '仕事の流儀',
        description: 'マリアのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'devilhunter',
        reward: { type: 'playmat', value: 'devilhunter', name: 'マリア' }
    },
    {
        id: 'story_devilhunter_hard',
        title: '特大の棺桶',
        description: 'マリアのストーリー（上級）をクリアする',
        type: 'story_clear_hard',
        targetValue: 'devilhunter',
        reward: { type: 'premium', value: 'necromancer', name: 'ヴィス・ガルドの背教者', isPremiumUnlock: true }
    },
    {
        id: 'story_witch',
        title: '魔女の戯れ',
        description: 'クロエのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'witch',
        reward: { type: 'playmat', value: 'witch', name: 'クロエ' }
    },
    {
        id: 'story_witch_hard',
        title: '因果の果てに',
        description: 'クロエのストーリー（上級）をクリアする',
        type: 'story_clear_hard',
        targetValue: 'witch',
        reward: { type: 'premium', value: 'beginnermagic', name: '初級魔術', isPremiumUnlock: true }
    },
    // --- カード収集 ---
    {
        id: 'collect_10',
        title: '見習い収集家',
        description: '異なるカードを10種類集める',
        type: 'collection',
        targetValue: 10,
        reward: { type: 'card', value: 'baldanders', name: 'バルトアンデルス' }
    },
    {
        id: 'collect_20',
        title: 'Mr.コレクター',
        description: '異なるカードを20種類集める',
        type: 'collection',
        targetValue: 20,
        reward: { type: 'card', value: 'baldanders', name: 'バルトアンデルス' }
    },
    {
        id: 'collect_30',
        title: '真理の探究者',
        description: '異なるカードを30種類集める',
        type: 'collection',
        targetValue: 30,
        reward: { type: 'card', value: 'baldanders', name: 'バルトアンデルス' }
    },
    {
        id: 'collect_40',
        title: '魂の目録',
        description: '異なるカードを40種類集める',
        type: 'collection',
        targetValue: 40,
        reward: { type: 'card', value: 'baldanders', name: 'バルトアンデルス' }
    },
    // --- フリーバトル勝利数 ---
    {
        id: 'free_win_10',
        title: '駆け出しの闘士',
        description: 'バトルで累計10回勝利する',
        type: 'free_battle_win',
        targetValue: 10,
        reward: { type: 'card', value: 'shuffler', name: 'シャッフラー' }
    },
    {
        id: 'free_win_20',
        title: '強者',
        description: 'バトルで累計20回勝利する',
        type: 'free_battle_win',
        targetValue: 20,
        reward: { type: 'card', value: 'shuffler', name: 'シャッフラー' }
    },
    {
        id: 'free_win_30',
        title: '百戦錬磨',
        description: 'バトルで累計30回勝利する',
        type: 'free_battle_win',
        targetValue: 30,
        reward: { type: 'card', value: 'shuffler', name: 'シャッフラー' }
    },
    {
        id: 'free_win_40',
        title: '闘技場の覇者',
        description: 'バトルで累計40回勝利する',
        type: 'free_battle_win',
        targetValue: 40,
        reward: { type: 'card', value: 'shuffler', name: 'シャッフラー' }
    },
    // --- 試練の宮殿到達階層 ---
    {
        id: 'dungeon_reach_10',
        title: '迷宮への入り口',
        description: '試練の宮殿で10Fに到達する',
        type: 'dungeon_reach',
        targetValue: 10,
        reward: { type: 'card', value: 'dicejuggler', name: 'ダイスジャグラー' }
    },
    {
        id: 'dungeon_reach_20',
        title: '試練の始まり',
        description: '試練の宮殿で20Fに到達する',
        type: 'dungeon_reach',
        targetValue: 20,
        reward: { type: 'card', value: 'dicejuggler', name: 'ダイスジャグラー' }
    },
    {
        id: 'dungeon_reach_30',
        title: '深淵なる探索者',
        description: '試練の宮殿で30Fに到達する',
        type: 'dungeon_reach',
        targetValue: 30,
        reward: { type: 'card', value: 'dicejuggler', name: 'ダイスジャグラー' }
    },
    {
        id: 'dungeon_reach_40',
        title: '宮殿の支配者',
        description: '試練の宮殿で40Fに到達する',
        type: 'dungeon_reach',
        targetValue: 40,
        reward: { type: 'card', value: 'dicejuggler', name: 'ダイスジャグラー' }
    },
    // --- 防衛戦勝利数 ---
    {
        id: 'defense_win_10',
        title: 'いざ尋常に',
        description: '防衛戦で累計10回勝利する',
        type: 'defense_win',
        targetValue: 10,
        reward: { type: 'card', value: 'invader', name: '彼方からの侵略者' }
    },
    {
        id: 'defense_win_20',
        title: '喧嘩屋',
        description: '防衛戦で累計20回勝利する',
        type: 'defense_win',
        targetValue: 20,
        reward: { type: 'card', value: 'invader', name: '彼方からの侵略者' }
    },
    {
        id: 'defense_win_30',
        title: '城塞の守護者',
        description: '防衛戦で累計30回勝利する',
        type: 'defense_win',
        targetValue: 30,
        reward: { type: 'card', value: 'invader', name: '彼方からの侵略者' }
    },
    {
        id: 'defense_win_40',
        title: '難攻不落',
        description: '防衛戦で累計40回勝利する',
        type: 'defense_win',
        targetValue: 40,
        reward: { type: 'card', value: 'invader', name: '彼方からの侵略者' }
    },
    // --- イベントクリア ---
    {
        id: 'event_satan_clear',
        title: '復活の魔王',
        description: '高難易度イベントでサタンを倒す',
        type: 'event_clear',
        targetValue: 'satan_high',
        reward: { type: 'playmat', value: 'satan', name: 'サタン' }
    }
];

// --- 実績・履歴データの管理 ---
export const achievementData = {
    achievements: {}, // id: { progress: number, isUnlocked: boolean, isRewarded: boolean }
    stats: {
        leaderUsage: {}, // leaderId: count
        storyClears: {}, // leaderId: count
        storyClearsHard: {}, // leaderId: count
        freeBattleWins: 0,
        maxDungeonFloor: 0,
        defenseWins: 0
    }
};

export const ACHIEVEMENTS_STORAGE_KEY = 'mini_card_battle_achievements';

// 実績データの初期化・ロード（メインメニュー遷移時などに呼ぶ）
export function loadAchievements() {
    const saved = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // 構造の互換性維持
            achievementData.achievements = parsed.achievements || {};
            achievementData.stats = parsed.stats || { leaderUsage: {}, storyClears: {}, storyClearsHard: {}, eventClear: {}, freeBattleWins: 0 };
            if (!achievementData.stats.leaderUsage) achievementData.stats.leaderUsage = {};
            if (!achievementData.stats.storyClears) achievementData.stats.storyClears = {};
            if (!achievementData.stats.storyClearsHard) achievementData.stats.storyClearsHard = {};
            if (!achievementData.stats.eventClear) achievementData.stats.eventClear = {};
            if (typeof achievementData.stats.freeBattleWins !== 'number') achievementData.stats.freeBattleWins = 0;
            if (typeof achievementData.stats.maxDungeonFloor !== 'number') achievementData.stats.maxDungeonFloor = 0;
            if (typeof achievementData.stats.defenseWins !== 'number') achievementData.stats.defenseWins = 0;
        } catch (e) {
            console.error("Failed to parse achievements data", e);
        }
    }
    checkCollectionAchievements(); // カード収集状況はロード時に常に最新化して判定する
    saveAchievements();
}

export function saveAchievements() {
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(achievementData));
}

// 統計データの更新
export function incrementStat(type, key = null, amount = 1) {
    if (type === 'leaderUsage' && key) {
        achievementData.stats.leaderUsage[key] = (achievementData.stats.leaderUsage[key] || 0) + amount;
    } else if (type === 'storyClears' && key) {
        achievementData.stats.storyClears[key] = (achievementData.stats.storyClears[key] || 0) + amount;
        checkStoryAchievements(key);
    } else if (type === 'storyClearsHard' && key) {
        achievementData.stats.storyClearsHard[key] = (achievementData.stats.storyClearsHard[key] || 0) + amount;
        checkStoryHardAchievements(key);
    } else if (type === 'eventClear' && key) {
        achievementData.stats.eventClear = achievementData.stats.eventClear || {};
        achievementData.stats.eventClear[key] = (achievementData.stats.eventClear[key] || 0) + amount;
        checkEventAchievements(key);
    } else if (type === 'freeBattleWins') {
        achievementData.stats.freeBattleWins += amount;
        checkFreeBattleAchievements();
    } else if (type === 'maxDungeonFloor') {
        if (amount > (achievementData.stats.maxDungeonFloor || 0)) {
            achievementData.stats.maxDungeonFloor = amount;
            checkDungeonAchievements();
        }
    } else if (type === 'defenseWins') {
        achievementData.stats.defenseWins = (achievementData.stats.defenseWins || 0) + amount;
        checkDefenseAchievements();
    }
    saveAchievements();
}

// 所持カード数の実績チェック
export function checkCollectionAchievements() {
    if (!GameState.playerInventory) return;

    // トークン以外のマスタカード枚数を計算
    const validMasterCards = CARD_MASTER.filter(c => !c.isToken && !c.id.includes('token'));
    const totalValidMasterCount = validMasterCards.length;

    // 所持している有効なカードの種類数
    let ownedCount = 0;
    validMasterCards.forEach(c => {
        if ((GameState.playerInventory[c.id] || 0) > 0) ownedCount++;
    });

    ACHIEVEMENT_MASTER.filter(a => a.type === 'collection').forEach(ach => {
        let maxVal = ach.targetValue === -1 ? totalValidMasterCount : ach.targetValue;
        updateAchievement(ach.id, ownedCount, maxVal);
    });
}

// ストーリクリア実績のチェック
function checkStoryAchievements(leaderId) {
    ACHIEVEMENT_MASTER.filter(a => a.type === 'story_clear' && a.targetValue === leaderId).forEach(ach => {
        const clears = achievementData.stats.storyClears[leaderId] || 0;
        updateAchievement(ach.id, clears, 1);
    });
}

// ストーリークリア（ハード）実績のチェック
function checkStoryHardAchievements(leaderId) {
    ACHIEVEMENT_MASTER.filter(a => a.type === 'story_clear_hard' && a.targetValue === leaderId).forEach(ach => {
        const clears = achievementData.stats.storyClearsHard[leaderId] || 0;
        updateAchievement(ach.id, clears, 1);
    });
}

// イベントクリア実績のチェック
function checkEventAchievements(eventId) {
    ACHIEVEMENT_MASTER.filter(a => a.type === 'event_clear' && a.targetValue === eventId).forEach(ach => {
        const clears = achievementData.stats.eventClear[eventId] || 0;
        updateAchievement(ach.id, clears, 1);
    });
}

// フリーバトル勝利数のチェック
function checkFreeBattleAchievements() {
    const wins = achievementData.stats.freeBattleWins;
    ACHIEVEMENT_MASTER.filter(a => a.type === 'free_battle_win').forEach(ach => {
        updateAchievement(ach.id, wins, ach.targetValue);
    });
}

// 試練の宮殿到達階層のチェック
function checkDungeonAchievements() {
    const floor = achievementData.stats.maxDungeonFloor || 0;
    ACHIEVEMENT_MASTER.filter(a => a.type === 'dungeon_reach').forEach(ach => {
        updateAchievement(ach.id, floor, ach.targetValue);
    });
}

// 防衛戦勝利数のチェック
function checkDefenseAchievements() {
    const wins = achievementData.stats.defenseWins || 0;
    ACHIEVEMENT_MASTER.filter(a => a.type === 'defense_win').forEach(ach => {
        updateAchievement(ach.id, wins, ach.targetValue);
    });
}

// 個別実績の進捗更新処理（内部用）
function updateAchievement(id, currentValue, targetValue) {
    if (!achievementData.achievements[id]) {
        achievementData.achievements[id] = { progress: 0, isUnlocked: false, isRewarded: false };
    }

    const ach = achievementData.achievements[id];
    if (ach.isUnlocked) return; // 既に達成済みなら何もしない

    ach.progress = Math.min(currentValue, targetValue);

    if (ach.progress >= targetValue) {
        ach.isUnlocked = true;
        ach.progress = targetValue;
        // console.log(`Achievement Unlocked: ${id}`);
        // もしバトル中などでなければ、画面の隅に通知を出すような仕組みを追加することも可能
    }
}

// 報酬の受け取り処理（将来用）
export function claimAchievementReward(id) {
    const ach = achievementData.achievements[id];
    if (!ach || !ach.isUnlocked || ach.isRewarded) return false;

    const master = ACHIEVEMENT_MASTER.find(a => a.id === id);
    if (!master || !master.reward) {
        // 報酬が未設定の場合は受け取ったことにするだけ
        ach.isRewarded = true;
        saveAchievements();
        return true;
    }

    // 将来的に報酬（スキン・プレイマット・カード等）を付与する処理をここに記述
    if (master.reward.type === 'playmat') {
        if (!ownedPlaymats.includes(master.reward.value)) {
            ownedPlaymats.push(master.reward.value);
            // プレイマット獲得アニメーション/演出用フラグを返す
            ach.isRewarded = true;
            saveAchievements();
            saveDeck(); // ownedPlaymats を保存するために呼ぶ
            return { success: true, rewardType: 'playmat', rewardValue: master.reward.value, rewardName: master.reward.name };
        }
    } else if (master.reward.type === 'card') {
        const cardId = master.reward.value;
        GameState.playerInventory[cardId] = (GameState.playerInventory[cardId] || 0) + 1;
        ach.isRewarded = true;
        saveAchievements();
        saveDeck();
        return { success: true, rewardType: 'card', rewardValue: cardId, rewardName: master.reward.name };
    } else if (master.reward.type === 'premium') {
        const cardId = master.reward.value;
        // プレミアム解放
        if (!GameState.unlockedPremiumCards.includes(cardId)) {
            GameState.unlockedPremiumCards.push(cardId);
        }
        if (!GameState.premiumCards.includes(cardId)) {
            GameState.premiumCards.push(cardId);
        }
        localStorage.setItem('mini_card_battle_unlocked_premium', JSON.stringify(GameState.unlockedPremiumCards));
        localStorage.setItem('mini_card_battle_premium_cards', JSON.stringify(GameState.premiumCards));

        ach.isRewarded = true;
        saveAchievements();
        saveDeck();
        return { success: true, rewardType: 'premium', rewardValue: cardId, rewardName: master.reward.name };
    }

    ach.isRewarded = true;
    saveAchievements();
    return true;
    return true;
}

window.loadAchievements = loadAchievements;
window.incrementStat = incrementStat;

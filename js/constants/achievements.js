/**
 * Mini Card Battle - Achievements Data
 */

// 実績の定義
const ACHIEVEMENT_MASTER = [
    // --- カード収集 ---
    {
        id: 'collect_10',
        title: '見習い収集家',
        description: '異なるカードを10種類集める',
        type: 'collection',
        targetValue: 10,
        reward: null
    },
    {
        id: 'collect_30',
        title: '熟練の収集家',
        description: '異なるカードを30種類集める',
        type: 'collection',
        targetValue: 30,
        reward: null
    },
    {
        id: 'collect_all',
        title: 'カードマスター',
        description: 'すべてのカードを集める（トークン等を除く）',
        type: 'collection',
        targetValue: -1, // プログラム側で全枚数を計算して判定
        reward: null
    },
    // --- ストーリークリア ---
    {
        id: 'story_android',
        title: '機械人形の帰還',
        description: 'アイギスのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'android',
        reward: null
    },
    {
        id: 'story_dragon',
        title: '竜姫の凱旋',
        description: 'イグニスのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'dragon',
        reward: null
    },
    {
        id: 'story_knight',
        title: '光の誓い',
        description: 'セレスティアのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'knight',
        reward: null
    },
    {
        id: 'story_cthulhu',
        title: '深淵の呼び声',
        description: 'ナイアのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'cthulhu',
        reward: null
    },
    {
        id: 'story_elf',
        title: '記憶の彼方へ',
        description: 'リナのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'elf',
        reward: null
    },
    {
        id: 'story_cleric',
        title: '偽りの救済',
        description: 'エリシアのストーリーをクリアする',
        type: 'story_clear',
        targetValue: 'cleric',
        reward: null
    },
    // --- フリーバトル勝利数 ---
    {
        id: 'free_win_5',
        title: '駆け出しの闘士',
        description: 'フリーバトルで累計5回勝利する',
        type: 'free_battle_win',
        targetValue: 5,
        reward: null
    },
    {
        id: 'free_win_20',
        title: '百戦錬磨',
        description: 'フリーバトルで累計20回勝利する',
        type: 'free_battle_win',
        targetValue: 20,
        reward: null
    },
    {
        id: 'free_win_50',
        title: '闘技場の覇者',
        description: 'フリーバトルで累計50回勝利する',
        type: 'free_battle_win',
        targetValue: 50,
        reward: null
    }
];

// --- 実績・履歴データの管理 ---
let achievementData = {
    achievements: {}, // id: { progress: number, isUnlocked: boolean, isRewarded: boolean }
    stats: {
        leaderUsage: {}, // leaderId: count
        storyClears: {}, // leaderId: count
        freeBattleWins: 0 
    }
};

const ACHIEVEMENTS_STORAGE_KEY = 'mini_card_battle_achievements';

// 実績データの初期化・ロード（メインメニュー遷移時などに呼ぶ）
function loadAchievements() {
    const saved = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // 構造の互換性維持
            achievementData = {
                achievements: parsed.achievements || {},
                stats: parsed.stats || { leaderUsage: {}, storyClears: {}, freeBattleWins: 0 }
            };
            if (!achievementData.stats.leaderUsage) achievementData.stats.leaderUsage = {};
            if (!achievementData.stats.storyClears) achievementData.stats.storyClears = {};
            if (typeof achievementData.stats.freeBattleWins !== 'number') achievementData.stats.freeBattleWins = 0;
        } catch (e) {
            console.error("Failed to parse achievements data", e);
        }
    }
    checkCollectionAchievements(); // カード収集状況はロード時に常に最新化して判定する
    saveAchievements();
}

function saveAchievements() {
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(achievementData));
}

// 統計データの更新
function incrementStat(type, key = null, amount = 1) {
    if (type === 'leaderUsage' && key) {
        achievementData.stats.leaderUsage[key] = (achievementData.stats.leaderUsage[key] || 0) + amount;
    } else if (type === 'storyClears' && key) {
        achievementData.stats.storyClears[key] = (achievementData.stats.storyClears[key] || 0) + amount;
        checkStoryAchievements(key);
    } else if (type === 'freeBattleWins') {
        achievementData.stats.freeBattleWins += amount;
        checkFreeBattleAchievements();
    }
    saveAchievements();
}

// 所持カード数の実績チェック
function checkCollectionAchievements() {
    if (!window.playerInventory) return;
    
    // トークン以外のマスタカード枚数を計算
    const validMasterCards = CARD_MASTER.filter(c => !c.isToken && !c.id.includes('token'));
    const totalValidMasterCount = validMasterCards.length;
    
    // 所持している有効なカードの種類数
    let ownedCount = 0;
    validMasterCards.forEach(c => {
        if ((playerInventory[c.id] || 0) > 0) ownedCount++;
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

// フリーバトル勝利数のチェック
function checkFreeBattleAchievements() {
    const wins = achievementData.stats.freeBattleWins;
    ACHIEVEMENT_MASTER.filter(a => a.type === 'free_battle_win').forEach(ach => {
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
function claimAchievementReward(id) {
    const ach = achievementData.achievements[id];
    if (!ach || !ach.isUnlocked || ach.isRewarded) return false;

    const master = ACHIEVEMENT_MASTER.find(a => a.id === id);
    if (!master || !master.reward) {
        // 報酬が未設定の場合は受け取ったことにするだけ
        ach.isRewarded = true;
        saveAchievements();
        return true;
    }

    // 將来的に報酬（スキン・プレイマット・カード等）を付与する処理をここに記述
    // 例: activateReward(master.reward.type, master.reward.value);

    ach.isRewarded = true;
    saveAchievements();
    return true;
}

import { CARD_MASTER } from './cards.js';
import { CHARACTERS } from './characters.js';
import { ENEMY_DECKS } from './enemy_decks.js';
import { getDungeonCharacterDialogue } from './battleDungeonCharacter.js';

// 敵候補のカードリストを取得（golemからvampireまで）
export const getDungeonEnemyCandidates = () => {
    const startIndex = CARD_MASTER.findIndex(c => c.id === 'golem');
    const endIndex = CARD_MASTER.findIndex(c => c.id === 'vampire');
    if (startIndex === -1 || endIndex === -1) return [];
    return CARD_MASTER.slice(startIndex, endIndex + 1);
};

// 試練の宮殿の初期プレイヤー候補を生成する
export const getRentalDeckOptions = () => {
    let options = [];
    let usedNames = new Set();

    // ヘルパー：指定レアリティの敵を追加
    const addEnemyOption = (rarity) => {
        let enemy = generateGenericDungeonEnemy(rarity);
        let retry = 0;

        while (usedNames.has(enemy.name) && retry < 10) {
            enemy = generateGenericDungeonEnemy(rarity);
            retry++;
        }
        usedNames.add(enemy.name);

        options.push({
            leaderId: enemy.id,
            name: enemy.name,
            icon: enemy.icon,
            desc: enemy.desc,
            color: enemy.color,
            rarity: enemy.rarity || rarity,
            deck: enemy.dungeonDeck,
            originalData: enemy,
            isCardLeader: true
        });
    };

    // デフォルト: 2種類のブロンズキャラクター(rarity 1)を生成
    for (let i = 0; i < 2; i++) {
        addEnemyOption(1);
    }

    // 開放状態を読み取って候補を追加
    try {
        const unlocks = JSON.parse(localStorage.getItem('mini_card_battle_dungeon_unlocks')) || {};

        if (unlocks.char_silver) { addEnemyOption(2); addEnemyOption(2); }
        if (unlocks.char_gold) { addEnemyOption(3); addEnemyOption(3); }
        if (unlocks.char_legend) { addEnemyOption(4); addEnemyOption(4); }

        const addCharDecks = (difficultyKey, label) => {
            const leaderIds = Object.keys(ENEMY_DECKS).filter(id => id !== 'player_defense' && id !== 'satan_high' && id !== 'satan');
            leaderIds.forEach(id => {
                const char = CHARACTERS[id];
                const deck = ENEMY_DECKS[id][difficultyKey];
                if (deck && deck.length > 0) {
                    options.push({
                        leaderId: id,
                        name: `${char.name} [${label}]`,
                        icon: char.icon,
                        desc: char.desc,
                        color: char.color,
                        rarity: difficultyKey === 'easy' ? 1 : difficultyKey === 'normal' ? 2 : 3,
                        deck: deck,
                        originalData: { ...char, preBattleLine: char.preBattleLine || '', hp: 20 },
                        isCharacterLeader: true
                    });
                }
            });
        };

        if (unlocks.deck_easy) addCharDecks('easy', 'イージー');
        if (unlocks.deck_normal) addCharDecks('normal', 'ノーマル');
        if (unlocks.deck_hard) addCharDecks('hard', 'ハード');

    } catch (e) {
        console.error("Failed to load dungeon unlocks:", e);
    }

    return options;
};

// 指定したレアリティの汎用敵を1体生成する
export const generateGenericDungeonEnemy = (targetRarity) => {
    const candidates = getDungeonEnemyCandidates();
    let validLeaders = candidates.filter(c => c.rarity === targetRarity);
    if (validLeaders.length === 0) validLeaders = candidates; // フェイルセーフ

    const leaderCard = validLeaders[Math.floor(Math.random() * validLeaders.length)];

    let deck = [leaderCard.id, leaderCard.id, leaderCard.id, leaderCard.id];
    const poolRarityMax = (leaderCard.rarity === 1) ? 1 : 2;
    const randomPool = candidates.filter(c => c.rarity <= poolRarityMax);
    
    // リーダーカードは既に4枚入っているので抽選プールから除外
    const safePool = randomPool.filter(c => c.id !== leaderCard.id);
    
    const cardCounts = {};
    deck.forEach(id => {
        cardCounts[id] = (cardCounts[id] || 0) + 1;
    });

    for (let i = 0; i < 16; i++) {
        const availablePool = safePool.filter(c => (cardCounts[c.id] || 0) < 4);
        if (availablePool.length === 0) break; // 候補が枯渇した時のフェイルセーフ

        const randomCard = availablePool[Math.floor(Math.random() * availablePool.length)];
        deck.push(randomCard.id);
        cardCounts[randomCard.id] = (cardCounts[randomCard.id] || 0) + 1;
    }

    let hp = 1; // デバッグ用に一律1

    const imagePath = leaderCard.image || `assets/cards/card_${leaderCard.id}.jpg`;
    const dialogueData = getDungeonCharacterDialogue(leaderCard.id);

    return {
        id: `dungeon_${leaderCard.id}_${Date.now()}_${Math.random()}`,
        stageId: 'plain',
        name: leaderCard.name,
        desc: leaderCard.flavor || '試練の宮殿の敵',
        easeOfUse: 3,
        filter: 'none',
        cardType: 'set1',
        cardBg: 'bg2',
        image: imagePath,
        icon: imagePath,
        color: '#dc2626',
        leaderSkill: {
            name: `${leaderCard.name}の召喚`,
            desc: `(SP:3) 自身のレーンに「${leaderCard.name}(P:${leaderCard.power})」を1体召喚する。`,
            cost: 3,
            action: 'dungeon_summon_leader'
        },
        leaderCardId: leaderCard.id,
        isDungeonEnemy: true,
        fixedAiLevel: 3,
        preBattleLine: dialogueData.preBattleLine,
        dialogue: dialogueData.dialogue,
        hp: hp,
        rarity: leaderCard.rarity || targetRarity,
        dungeonDeck: deck
    };
};

// 指定したキャラクターのハード用敵を1体生成する
export const generateCharacterBossEnemy = () => {
    const leaderIds = Object.keys(ENEMY_DECKS).filter(id => id !== 'player_defense' && id !== 'satan_high' && id !== 'satan');
    const bossId = leaderIds[Math.floor(Math.random() * leaderIds.length)];
    const char = CHARACTERS[bossId];
    const deck = ENEMY_DECKS[bossId].hard || ENEMY_DECKS[bossId].normal || [];

    return {
        ...char,
        id: `dungeon_boss_${bossId}_${Date.now()}`,
        isDungeonEnemy: true,
        fixedAiLevel: 3,
        hp: 1, // キャラクターHPもデバッグ用に一律1
        dungeonDeck: deck
    };
};

// 階層に基づいた敵候補の配列を返す
export const generateDungeonOpponentsList = (winStreak) => {
    const battleNumber = winStreak + 1;
    const cyclePos = ((battleNumber - 1) % 10) + 1;

    // ルーティン設定
    // 1,2: 銅(1)*2  3,4: 銀(2)*2  5: 金(3)*2  6,7: 銅(1)*2  8,9: 銀(2)*2  10: キャラ(Hard)*1
    let targetRarity = 1;
    let count = 2;
    let isBoss = false;

    if (cyclePos === 1 || cyclePos === 2 || cyclePos === 6 || cyclePos === 7) {
        targetRarity = 1;
    } else if (cyclePos === 3 || cyclePos === 4 || cyclePos === 8 || cyclePos === 9) {
        targetRarity = 2;
    } else if (cyclePos === 5) {
        targetRarity = 3;
    } else if (cyclePos === 10) {
        isBoss = true;
        count = 1;
    }

    let opponents = [];
    if (isBoss) {
        opponents.push(generateCharacterBossEnemy());
    } else {
        const opp1 = generateGenericDungeonEnemy(targetRarity);
        let opp2 = generateGenericDungeonEnemy(targetRarity);
        let retry = 0;
        // 名前が被らないようにリトライ
        while (opp1.name === opp2.name && retry < 10) {
            opp2 = generateGenericDungeonEnemy(targetRarity);
            retry++;
        }
        opponents.push(opp1);
        opponents.push(opp2);
    }

    return opponents;
};

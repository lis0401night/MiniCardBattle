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

// 提示するレンタルデッキをすべて生成する（各リーダーのイージーデッキ）
export const getRentalDeckOptions = () => {
    const leaderIds = Object.keys(ENEMY_DECKS).filter(id => id !== 'player_defense' && id !== 'satan_high' && id !== 'satan');

    return leaderIds.map(id => {
        const char = CHARACTERS[id];
        const deck = ENEMY_DECKS[id].easy || [];
        return {
            leaderId: id,
            name: char.name,
            icon: char.icon,
            desc: char.desc,
            color: char.color,
            deck: deck
        };
    });
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

    for (let i = 0; i < 16; i++) {
        const randomCard = randomPool[Math.floor(Math.random() * randomPool.length)];
        deck.push(randomCard.id);
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
        while(opp1.name === opp2.name && retry < 10) {
            opp2 = generateGenericDungeonEnemy(targetRarity);
            retry++;
        }
        opponents.push(opp1);
        opponents.push(opp2);
    }

    return opponents;
};

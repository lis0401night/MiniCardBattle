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

// 指定した連勝数に基づいて敵を生成する
export const generateDungeonEnemy = (winStreak) => {
    const candidates = getDungeonEnemyCandidates();
    const battleNumber = winStreak + 1;
    const cyclePos = ((battleNumber - 1) % 10) + 1; // 1 から 10のループ

    let targetRarity = 1;
    if (cyclePos >= 1 && cyclePos <= 4) {
        targetRarity = 1;
    } else if (cyclePos >= 5 && cyclePos <= 9) {
        targetRarity = 2;
    } else if (cyclePos === 10) {
        targetRarity = 3;
    }

    let validLeaders = candidates.filter(c => c.rarity === targetRarity);
    if (validLeaders.length === 0) validLeaders = candidates; // フェイルセーフ

    const leaderCard = validLeaders[Math.floor(Math.random() * validLeaders.length)];

    // デッキ自動生成 (リーダー4枚)
    let deck = [leaderCard.id, leaderCard.id, leaderCard.id, leaderCard.id];

    // レアリティに応じたカードプール制限 (R1リーダーはR1カードのみ、それ以外はR1-2)
    const poolRarityMax = (leaderCard.rarity === 1) ? 1 : 2;
    const randomPool = candidates.filter(c => c.rarity <= poolRarityMax);

    for (let i = 0; i < 16; i++) {
        const randomCard = randomPool[Math.floor(Math.random() * randomPool.length)];
        deck.push(randomCard.id);
    }

    // レアリティに応じたHP設定
    let hp = 1; // 検証用に1に固定 (元はレアリティに応じて 10, 15, 20)
    /*
    if (leaderCard.rarity === 1) hp = 10;
    else if (leaderCard.rarity === 2) hp = 15;
    else if (leaderCard.rarity === 3) hp = 20;
    */

    const imagePath = leaderCard.image || `assets/cards/card_${leaderCard.id}.jpg`;
    const dialogueData = getDungeonCharacterDialogue(leaderCard.id);

    // 敵Configオブジェクト (CHARACTERSに準拠)
    return {
        id: `dungeon_${leaderCard.id}`,
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
            desc: `(SP:3) 自身のレーンに「${leaderCard.name}(P:${leaderCard.power})」を1体配置する。`,
            cost: 3,
            action: 'dungeon_summon_leader'
        },
        leaderCardId: leaderCard.id,
        isDungeonEnemy: true,
        fixedAiLevel: 3, // AIレベル3固定
        preBattleLine: dialogueData.preBattleLine,
        dialogue: dialogueData.dialogue,
        hp: hp,
        dungeonDeck: deck
    };
};

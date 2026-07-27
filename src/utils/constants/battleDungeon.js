import { getDungeonCharacterDialogue } from './battleDungeonCharacter.js';
import { CARD_MASTER } from './cards.js';
import { CHARACTERS, getSkinImage } from './characters.js';
import { ENEMY_DECKS } from './enemy_decks.js';

// 試練の宮殿の敵・レンタル候補から除外するリーダーID
const DUNGEON_EXCLUDED_LEADER_IDS = new Set([
  'player_defense',
  'automata',
  'automata_high',
  'satan_high',
  'satan',
  'void',
  'succubus',
  'warlock',
  'android_high',
  'dragon_high',
  'knight_high',
  'elf_high',
  'cleric_high',
  'devilhunter_high',
  'witch_high',
  'oni_high',
  'priest_high',
  'cthulhu_high',
]);

// 敵候補のカードリストを取得（golemからdicejugglerまで、トークン以外）
export const getDungeonEnemyCandidates = () => {
  const startIndex = CARD_MASTER.findIndex((c) => c.id === 'golem');
  const endIndex = CARD_MASTER.findIndex((c) => c.id === 'dicejuggler');
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
      isCardLeader: true,
    });
  };

  // デフォルト: 2種類のブロンズキャラクター(rarity 1)を生成
  for (let i = 0; i < 2; i++) {
    addEnemyOption(1);
  }

  // 開放状態を読み取って候補を追加
  try {
    const unlocks =
      JSON.parse(localStorage.getItem('mini_card_battle_dungeon_unlocks')) ||
      {};

    if (unlocks.char_silver) {
      addEnemyOption(2);
      addEnemyOption(2);
    }
    if (unlocks.char_gold) {
      addEnemyOption(3);
      addEnemyOption(3);
    }
    if (unlocks.char_legend) {
      addEnemyOption(4);
      addEnemyOption(4);
    }

    const addCharDecks = (difficultyKey, label) => {
      const leaderIds = Object.keys(ENEMY_DECKS).filter(
        (id) => !DUNGEON_EXCLUDED_LEADER_IDS.has(id)
      );
      leaderIds.forEach((id) => {
        const char = CHARACTERS[id];
        if (!char) return; // 存在しないキャラクターはスキップ（NPE防止）
        const deck = ENEMY_DECKS[id][difficultyKey];
        if (deck && deck.length > 0) {
          options.push({
            leaderId: id,
            name: `${char.name} [${label}]`,
            icon: char.icon,
            desc: char.desc,
            color: char.color,
            rarity:
              difficultyKey === 'easy' ? 1 : difficultyKey === 'normal' ? 2 : 3,
            deck: deck,
            originalData: {
              ...char,
              preBattleLine: char.preBattleLine || '',
              hp: 20,
            },
            isCharacterLeader: true,
          });
        }
      });
    };

    if (unlocks.deck_easy) addCharDecks('easy', '初級');
    if (unlocks.deck_normal) addCharDecks('normal', '中級');
    if (unlocks.deck_hard) addCharDecks('hard', '上級');
  } catch (e) {
    console.error('Failed to load dungeon unlocks:', e);
  }

  return options;
};

// 指定したレアリティの汎用敵を1体生成する
export const generateGenericDungeonEnemy = (targetRarity) => {
  const candidates = getDungeonEnemyCandidates();
  let validLeaders = candidates.filter((c) => c.rarity === targetRarity);
  if (validLeaders.length === 0) validLeaders = candidates; // フェイルセーフ

  const leaderCard =
    validLeaders[Math.floor(Math.random() * validLeaders.length)];

  let deck = [leaderCard.id, leaderCard.id, leaderCard.id, leaderCard.id];
  const lRarity = leaderCard.rarity || targetRarity;

  const cardCounts = {};
  deck.forEach((id) => {
    cardCounts[id] = (cardCounts[id] || 0) + 1;
  });

  // ヘルパー: 指定レアリティからN枚ピックしてデッキに追加
  const pickCards = (targetR, count) => {
    let pool = candidates.filter(
      (c) => c.rarity === targetR && c.id !== leaderCard.id
    );
    for (let i = 0; i < count; i++) {
      let available = pool.filter((c) => (cardCounts[c.id] || 0) < 4);
      if (available.length === 0) break;
      let picked = available[Math.floor(Math.random() * available.length)];
      deck.push(picked.id);
      cardCounts[picked.id] = (cardCounts[picked.id] || 0) + 1;
    }
  };

  if (lRarity >= 4) {
    pickCards(4, 3);
    pickCards(3, 3);
    pickCards(2, 3);
  } else if (lRarity === 3) {
    pickCards(3, 3);
    pickCards(2, 3);
  } else if (lRarity === 2) {
    pickCards(2, 3);
  }

  // 残りの枠はすべてブロンズ(レアリティ1)
  pickCards(1, 20 - deck.length);

  // デッキ枯渇のフェイルセーフ(万が一20枚に満たない場合)
  while (deck.length < 20) {
    let available = candidates.filter(
      (c) => c.rarity === 1 && c.id !== leaderCard.id
    );
    if (available.length === 0) break;
    let picked = available[Math.floor(Math.random() * available.length)];
    deck.push(picked.id);
  }

  let hp = 20; // 敵のHPはデフォルト20

  const imagePath =
    leaderCard.image || `assets/cards/card_${leaderCard.id}.webp`;
  const dialogueData = getDungeonCharacterDialogue(leaderCard.id);

  // 試練の宮殿の汎用リーダースキルはレア度に関わらず一律4ターン（SP:4）に固定
  const leaderCost = 4;

  return {
    id: `dungeon_${leaderCard.id}_${Date.now()}_${Math.random()}`,
    stageId: 'plain',
    name: leaderCard.name,
    desc: leaderCard.flavor || '試練の宮殿の敵',
    easeOfUse: 3,
    filter: 'none',
    image: imagePath,
    icon: imagePath,
    color: '#dc2626',
    leaderSkill: {
      name: `${leaderCard.name}の召喚`,
      desc: `(SP:${leaderCost}) 自分のレーンに「${leaderCard.name}(P:${leaderCard.power})」を1体召喚する。`,
      cost: leaderCost,
      action: 'dungeon_summon_leader',
    },
    leaderCardId: leaderCard.id,
    isDungeonEnemy: true,
    fixedAiLevel: 3,
    preBattleLine: dialogueData.preBattleLine,
    dialogue: dialogueData.dialogue,
    hp: hp,
    rarity: leaderCard.rarity || targetRarity,
    dungeonDeck: deck,
  };
};

// 指定したキャラクターのボス用敵を階層に応じて生成する
export const generateCharacterBossEnemy = (floorNum) => {
  // 50階の倍数（50, 100, 150...）は高難易度ボスを生成
  const isHighBoss = floorNum % 50 === 0;

  let bossId;
  let char;
  let deck;

  if (isHighBoss) {
    // 高難易度ボス: event_high を持ち、除外リストに含まれないキャラクターから選出
    const highLeaderIds = Object.keys(CHARACTERS).filter(
      (id) =>
        !DUNGEON_EXCLUDED_LEADER_IDS.has(id) &&
        CHARACTERS[id].event_high &&
        ENEMY_DECKS[`${id}_high`]
    );
    if (highLeaderIds.length > 0) {
      bossId = highLeaderIds[Math.floor(Math.random() * highLeaderIds.length)];
    } else {
      // フォールバック: 通常ボスとして生成
      bossId = 'android';
    }
    char = CHARACTERS[bossId] || CHARACTERS.android;
    // 高難易度専用デッキを使用
    const highDeck = ENEMY_DECKS[`${bossId}_high`];
    if (highDeck) {
      deck = [...highDeck];
    } else {
      // 万が一高難易度用データが取得できなかった場合のセーフティフォールバック（通常の android デッキを使用）
      const fallbackDeck = ENEMY_DECKS.android;
      deck = Array.isArray(fallbackDeck)
        ? [...fallbackDeck]
        : [...(fallbackDeck?.hard || fallbackDeck?.normal || [])];
    }
  } else {
    // 通常ボス: 除外リストにないキャラクターから選出
    const leaderIds = Object.keys(ENEMY_DECKS).filter(
      (id) => !DUNGEON_EXCLUDED_LEADER_IDS.has(id)
    );
    bossId = leaderIds[Math.floor(Math.random() * leaderIds.length)];
    char = CHARACTERS[bossId] || CHARACTERS.android;
    // 30階までは中級、40階以降は上級
    const difficultyMode = floorNum >= 40 ? 'hard' : 'normal';
    const rawDeck = ENEMY_DECKS[bossId];
    deck = Array.isArray(rawDeck)
      ? [...rawDeck]
      : [...(rawDeck[difficultyMode] || rawDeck.normal || [])];
  }

  let bossData = {
    ...char,
    id: `dungeon_boss_${bossId}_${Date.now()}`,
    leaderCardId: bossId,
    charId: bossId,
    isDungeonEnemy: true,
    fixedAiLevel: 3,
    hp: 20, // ダンジョンボスのHPは一律20
    dungeonDeck: deck,
  };

  // 高難易度ボス: event_high のリーダースキル・名前・スキンを適用
  if (isHighBoss && char.event_high) {
    const highConfig = char.event_high;
    bossData.name = highConfig.name || bossData.name;
    bossData.leaderSkill = highConfig.leaderSkill || bossData.leaderSkill;

    // 高難易度スキン（画像・台詞）を適用
    const highSkinId = `${bossId}_high`;
    const highSkin = char.skins && char.skins[highSkinId];
    if (highSkin) {
      bossData = {
        ...bossData,
        image: highSkin.image || bossData.image,
        imageLose: highSkin.imageLose || bossData.imageLose,
        icon: highSkin.icon || bossData.icon,
        iconDamage: highSkin.iconDamage || bossData.iconDamage,
        currentSkin: highSkinId,
      };
      if (highSkin.dialogue) {
        bossData.dialogue = { ...char.dialogue, ...highSkin.dialogue };
        if (typeof highSkin.dialogue.intro === 'string') {
          bossData.preBattleLine = highSkin.dialogue.intro;
        }
      }
    }
  } else {
    // 通常ボス: 水着スキンがあれば適用する
    if (char.skins && char.skins.summer) {
      const skin = char.skins.summer;
      bossData = {
        ...bossData,
        image: skin.image || bossData.image,
        imageLose: skin.imageLose || bossData.imageLose,
        icon: skin.icon || bossData.icon,
        iconDamage: skin.iconDamage || bossData.iconDamage,
        currentSkin: 'summer',
      };
      if (skin.dialogue) {
        bossData.dialogue = { ...char.dialogue, ...skin.dialogue };
        if (typeof skin.dialogue.intro === 'string') {
          bossData.preBattleLine = skin.dialogue.intro;
        }
      }
    }
  }

  return bossData;
};

// 階層に基づいた敵候補の配列を返す
export const generateDungeonOpponentsList = (winStreak) => {
  const battleNumber = winStreak + 1;
  const cyclePos = ((battleNumber - 1) % 10) + 1;

  // ルーティン設定
  // 1,2: 銅(1)*2  3,4: 銀(2)*2  5: 金(3)*2  6,7: 銅(1)*2  8,9: 銀(2)*2  10: キャラ(Hard)*1
  let targetRarity = 1;
  let isBoss = false;

  if (cyclePos === 1 || cyclePos === 2 || cyclePos === 6 || cyclePos === 7) {
    targetRarity = 1;
  } else if (
    cyclePos === 3 ||
    cyclePos === 4 ||
    cyclePos === 8 ||
    cyclePos === 9
  ) {
    targetRarity = 2;
  } else if (cyclePos === 5) {
    targetRarity = 3;
  } else if (cyclePos === 10) {
    isBoss = true;
  }

  let opponents = [];
  if (isBoss) {
    opponents.push(generateCharacterBossEnemy(battleNumber));
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

/**
 * セーブデータの軽量オブジェクトから、マスタデータ（CARD_MASTER / CHARACTERS）を参照して敵の表示用プロパティを動的復元する
 */
export const hydrateDungeonOpponent = (opp) => {
  if (!opp) return null;

  const isBoss =
    typeof opp.id === 'string' && opp.id.startsWith('dungeon_boss_');
  let leaderId = opp.leaderCardId || opp.charId || opp.id;
  if (isBoss) {
    const parts = opp.id.split('_');
    if (parts[2] && CHARACTERS[parts[2]]) {
      leaderId = parts[2];
    }
  }

  const isGenericMob = opp.isDungeonEnemy && !isBoss && !opp.charId;
  const dialogueData = getDungeonCharacterDialogue(leaderId, opp);

  // 1. キャラクターボスの復元（CHARACTERSベース）
  const charMaster =
    !isGenericMob && CHARACTERS[leaderId] ? CHARACTERS[leaderId] : null;
  if (charMaster) {
    const skinId = opp.currentSkin || 'default';
    const skinObj = charMaster.skins && charMaster.skins[skinId];
    const skinImg =
      (typeof getSkinImage === 'function' &&
        getSkinImage(charMaster, skinId, 'image')) ||
      charMaster.image;
    const skinIcon =
      (typeof getSkinImage === 'function' &&
        getSkinImage(charMaster, skinId, 'icon')) ||
      charMaster.icon;

    const skinIntro = skinObj?.dialogue?.intro;
    const skinPreBattleLine = typeof skinIntro === 'string' ? skinIntro : null;
    const mergedDialogue = skinObj?.dialogue
      ? { ...charMaster.dialogue, ...skinObj.dialogue }
      : charMaster.dialogue;

    return {
      ...charMaster,
      ...opp,
      name: opp.name || (skinObj && skinObj.name) || charMaster.name,
      rarity: opp.rarity || charMaster.rarity || 4,
      image: skinImg,
      icon: skinIcon,
      preBattleLine:
        opp.preBattleLine ||
        skinPreBattleLine ||
        dialogueData?.preBattleLine ||
        charMaster.preBattleLine ||
        '我が前に立ち塞がるか。',
      dialogue: opp.dialogue || mergedDialogue || dialogueData?.dialogue || {},
    };
  }

  // 2. モブ敵の復元（CARD_MASTERベース）
  const cardMaster = (CARD_MASTER || []).find(
    (c) => c.id === leaderId || c.id === opp.leaderCardId
  );
  if (cardMaster) {
    return {
      ...opp,
      name: opp.name || cardMaster.name,
      rarity: opp.rarity || cardMaster.rarity || 1,
      image: cardMaster.image || `assets/cards/card_${cardMaster.id}.webp`,
      icon:
        cardMaster.icon ||
        cardMaster.image ||
        `assets/cards/card_${cardMaster.id}.webp`,
      desc: cardMaster.desc || '',
      color: opp.color || '#dc2626',
      leaderSkill: opp.leaderSkill || {
        name: `${cardMaster.name}の召喚`,
        desc: `(SP:4) 自分のレーンに「${cardMaster.name}(P:${cardMaster.power})」を1体召喚する。`,
        cost: 4,
        action: 'dungeon_summon_leader',
      },
      preBattleLine:
        opp.preBattleLine ||
        dialogueData?.preBattleLine ||
        '悪いが、ここを通すわけにはいかないんでね。',
      dialogue: opp.dialogue || dialogueData?.dialogue || {},
    };
  }

  return opp;
};

/**
 * セーブデータおよび GameState からプレイヤーリーダー（キャラリーダー / カードリーダー問わず）の表示用オブジェクトを安全復元する
 */
export const hydratePlayerConfig = (charId, savedConfig, playerSkins) => {
  const id = charId || savedConfig?.id || 'android';

  // 1. キャラクターマスタ (CHARACTERS) に存在する場合
  if (CHARACTERS[id]) {
    const templateChar = CHARACTERS[id];
    const skinId = playerSkins?.[id] || 'default';
    const skinIcon =
      (typeof getSkinImage === 'function' &&
        getSkinImage(templateChar, skinId, 'icon')) ||
      templateChar.icon;
    const skinImg =
      (typeof getSkinImage === 'function' &&
        getSkinImage(templateChar, skinId, 'image')) ||
      templateChar.image;

    // スキン変更時のスキル差分があればマージ
    let activeLeaderSkill = templateChar.leaderSkill;
    if (skinId && templateChar.skins && templateChar.skins[skinId]) {
      const skinObj = templateChar.skins[skinId];
      if (skinObj.leaderSkill) {
        activeLeaderSkill = { ...activeLeaderSkill, ...skinObj.leaderSkill };
      }
    }

    return {
      ...templateChar,
      ...(savedConfig || {}),
      id: id,
      leaderSkill: activeLeaderSkill ? { ...activeLeaderSkill } : null,
      icon: skinIcon ? skinIcon.replace(/\.(png|jpg|jpeg|gif)$/i, '.webp') : '',
      image: skinImg
        ? skinImg.replace(/\.(png|jpg|jpeg|gif)$/i, '.webp')
        : null,
    };
  }

  // 2. モブカードリーダー (CARD_MASTER / enemy オブジェクト) の場合
  const cardId =
    savedConfig?.leaderCardId ||
    id.replace(/^dungeon_/, '').replace(/_\d+.*$/, '');
  const cardMaster = (CARD_MASTER || []).find(
    (c) => c.id === cardId || c.id === id
  );

  if (cardMaster) {
    const icon =
      savedConfig?.icon ||
      cardMaster.icon ||
      cardMaster.image ||
      `assets/cards/card_${cardMaster.id}.webp`;
    const image =
      savedConfig?.image ||
      cardMaster.image ||
      `assets/cards/card_${cardMaster.id}.webp`;

    const defaultLeaderSkill = {
      name: `${cardMaster.name}の召喚`,
      desc: `(SP:4) 自分のレーンに「${cardMaster.name}(P:${cardMaster.power})」を1体召喚する。`,
      cost: 4,
      action: 'dungeon_summon_leader',
    };

    return {
      id: id,
      leaderCardId: cardMaster.id,
      name: savedConfig?.name || cardMaster.name,
      rarity: savedConfig?.rarity || cardMaster.rarity || 1,
      icon: icon.replace(/\.(png|jpg|jpeg|gif)$/i, '.webp'),
      image: image.replace(/\.(png|jpg|jpeg|gif)$/i, '.webp'),
      leaderSkill: savedConfig?.leaderSkill || defaultLeaderSkill,
      ...(savedConfig || {}),
    };
  }

  // 3. savedConfig 自体に name と icon/image が既にある場合（フォールバック）
  if (savedConfig && savedConfig.name) {
    return {
      ...savedConfig,
      icon: savedConfig.icon
        ? savedConfig.icon.replace(/\.(png|jpg|jpeg|gif)$/i, '.webp')
        : savedConfig.image
          ? savedConfig.image.replace(/\.(png|jpg|jpeg|gif)$/i, '.webp')
          : '',
    };
  }

  return CHARACTERS.android;
};

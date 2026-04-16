/**
 * Mini Card Battle - Playmat Constants
 */

export const PLAYMAT_MASTER = [
    {
        id: 'android',
        name: 'アイギス',
        image: 'assets/boards/board_android.png',
        targetCharacter: 'android'
    },
    {
        id: 'dragon',
        name: 'イグニス',
        image: 'assets/boards/board_dragon.png',
        targetCharacter: 'dragon'
    },
    {
        id: 'knight',
        name: 'セレスティア',
        image: 'assets/boards/board_knight.png',
        targetCharacter: 'knight'
    },
    {
        id: 'cthulhu',
        name: 'ナイア',
        image: 'assets/boards/board_cthulhu.png',
        targetCharacter: 'cthulhu'
    },
    {
        id: 'elf',
        name: 'リナ',
        image: 'assets/boards/board_elf.png',
        targetCharacter: 'elf'
    },
    {
        id: 'cleric',
        name: 'エリシア',
        image: 'assets/boards/board_cleric.png',
        targetCharacter: 'cleric'
    },
    {
        id: 'devilhunter',
        name: 'マリア',
        image: 'assets/boards/board_devilhunter.png',
    },
    {
        id: 'witch',
        name: 'クロエ',
        image: 'assets/boards/board_witch.png',
        targetCharacter: 'witch'
    },
    {
        id: 'oni',
        name: 'カグラ',
        image: 'assets/boards/board_oni.png',
        targetCharacter: 'oni'
    },
    {
        id: 'satan',
        name: 'サタン',
        image: 'assets/boards/board_satan.png',
        targetCharacter: 'satan'
    },
    { id: 'pm_android_summer', name: '水陸両用装備', image: 'assets/boards/board_android_summer.png' },
    { id: 'pm_dragon_summer', name: '真夏の焔竜姫', image: 'assets/boards/board_dragon_summer.png' },
    { id: 'pm_knight_summer', name: '波打ち際の騎士', image: 'assets/boards/board_knight_summer.png' },
    { id: 'pm_cthulhu_summer', name: '深海のサマースイム', image: 'assets/boards/board_cthulhu_summer.png' },
    { id: 'pm_elf_summer', name: '水辺の流浪者', image: 'assets/boards/board_elf_summer.png' },
    { id: 'pm_cleric_summer', name: '背徳のサマーバカンス', image: 'assets/boards/board_cleric_summer.png' },
    { id: 'pm_devilhunter_summer', name: '渚の悪魔狩り', image: 'assets/boards/board_devilhunter_summer.png' },
    { id: 'pm_witch_summer', name: '不機嫌なサマー・グリモワール', image: 'assets/boards/board_witch_summer.png' },
    { id: 'pm_oni_summer', name: '涼み鬼の波打ち肌', image: 'assets/boards/board_oni_summer.png' },
    { id: 'pm_android_high', name: 'フルアーマーアイギス', image: 'assets/boards/board_android_high.png' },
    { id: 'pm_dragon_high', name: '熱砂の客人', image: 'assets/boards/board_dragon_high.png' },
    { id: 'pm_knight_high', name: '暗黒騎士セレスティア', image: 'assets/boards/board_knight_high.png' }
];
// 所持プレイマットの管理用（セーブデータ：キー `mini_card_battle_owned_playmats`）
export let ownedPlaymats = []; // ['android', 'dragon', ...]
export function setOwnedPlaymats(newList) { ownedPlaymats = newList; }

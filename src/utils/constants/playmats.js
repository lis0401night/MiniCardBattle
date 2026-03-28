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
        id: 'satan',
        name: 'サタン',
        image: 'assets/boards/board_satan.png',
        targetCharacter: 'satan'
    },
    {
        id: 'witch',
        name: 'クロエ',
        image: 'assets/boards/board_witch.png',
        targetCharacter: 'witch'
    }
];
// 所持プレイマットの管理用（セーブデータ：キー `mini_card_battle_owned_playmats`）
export let ownedPlaymats = []; // ['android', 'dragon', ...]
export function setOwnedPlaymats(newList) { ownedPlaymats = newList; }

/**
 * Mini Card Battle - Playmat Constants
 */

const PLAYMAT_MASTER = [
    {
        id: 'android',
        name: 'アイギス',
        image: 'assets/board_android.png',
        targetCharacter: 'android'
    },
    {
        id: 'dragon',
        name: 'イグニス',
        image: 'assets/board_dragon.png',
        targetCharacter: 'dragon'
    },
    {
        id: 'knight',
        name: 'セレスティア',
        image: 'assets/board_knight.png',
        targetCharacter: 'knight'
    },
    {
        id: 'cthulhu',
        name: 'ナイア',
        image: 'assets/board_cthulhu.png',
        targetCharacter: 'cthulhu'
    },
    {
        id: 'elf',
        name: 'リナ',
        image: 'assets/board_elf.png',
        targetCharacter: 'elf'
    },
    {
        id: 'cleric',
        name: 'エリシア',
        image: 'assets/board_cleric.png',
        targetCharacter: 'cleric'
    }
];

// 所持プレイマットの管理用（セーブデータ：キー `mini_card_battle_owned_playmats`）
let ownedPlaymats = []; // ['android', 'dragon', ...]

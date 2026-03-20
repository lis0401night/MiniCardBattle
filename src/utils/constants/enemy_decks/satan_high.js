import { ENEMY_DECKS } from '../enemy_decks.js';

/**
 * Mini Card Battle - Enemy Deck: High Difficulty Satan
 */
export const ENEMY_DECK_SATAN_HIGH = [
    'whiterider', 'whiterider', 'whiterider',
    'redrider', 'redrider', 'redrider',
    'blackrider', 'blackrider', 'blackrider',
    'palerider', 'palerider', 'palerider',
    'bahamut', 'bahamut',
    'daemon', 'daemon',
    'warlock',
    'dealer',
    'devil',
    'goat',
];
// Register to global decks
if (typeof ENEMY_DECKS !== 'undefined') {
    ENEMY_DECKS.satan_high = ENEMY_DECK_SATAN_HIGH;
}

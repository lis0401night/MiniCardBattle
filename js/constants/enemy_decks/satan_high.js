/**
 * Mini Card Battle - Enemy Deck: High Difficulty Satan
 */
const ENEMY_DECK_SATAN_HIGH = [
    'whiterider', 'whiterider', 'whiterider', 'whiterider',
    'redrider', 'redrider', 'redrider', 'redrider',
    'blackrider', 'blackrider', 'blackrider', 'blackrider',
    'palerider', 'palerider', 'palerider', 'palerider',
    'daemon', 'daemon', 'daemon', 'daemon'
];
// Register to global decks
if (typeof ENEMY_DECKS !== 'undefined') {
    ENEMY_DECKS.satan_high = ENEMY_DECK_SATAN_HIGH;
}

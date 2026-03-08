/**
 * Mini Card Battle - Card Master Data
 */
const CARD_MASTER = [
    { id: 'soldier', name: '通常', power: 7, skill: 'none', desc: '特殊能力を持たない。' },
    { id: 'archer', name: '必殺', power: 2, skill: 'deadly', desc: '戦闘した相手を確実に破壊する。' },
    { id: 'mage', name: '入替', power: 5, skill: 'draw', desc: '手札の低パワーを入れ替える。' },
    { id: 'quick_knight', name: '速攻', power: 2, skill: 'quick', desc: '配置したターンに攻撃可能。' },
    { id: 'cleric', name: '回復', power: 3, skill: 'heal', skillValue: 3, desc: 'リーダーのHPを3回復。' },
    { id: 'sniper', name: '狙撃', power: 2, skill: 'snipe', skillValue: 4, desc: '敵最大パワーに4ダメージ。' },
    { id: 'bomber', name: '拡散', power: 2, skill: 'spread', skillValue: 2, desc: '敵全体に2ダメージ。' },
    { id: 'mimic', name: '複製', power: 1, skill: 'copy', desc: '味方最大パワーと同じになる。' },
    { id: 'commander', name: '援護', power: 3, skill: 'support', skillValue: 2, desc: '他の味方全員のパワー+2。' },
    { id: 'golem', name: '防御', power: 10, skill: 'defender', desc: '攻撃できないが壁になる。' },
    { id: 'wolf', name: '単騎', power: 3, skill: 'lone_wolf', skillValue: 3, desc: '空きレーン数×3パワーアップ。' },
    { id: 'lich', name: '魂縛', power: 4, skill: 'soul_bind', skillValue: 2, desc: '敵破壊時にパワー+2。' },
    { id: 'ent', name: '頑丈', power: 4, skill: 'sturdy', desc: '受けるダメージを半減。' },
    { id: 'mirror', name: '分身', power: 2, skill: 'clone', skillValue: 1, desc: '空レーンに分身を生成。' }
];

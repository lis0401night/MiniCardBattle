/**
 * Mini Card Battle - Skill Definitions
 */
const SKILLS = {
    none: { name: '通常', icon: '', desc: (val) => '' },
    quick: { name: '速攻', icon: '⚡', desc: (val) => '場に出たターンの終わりに攻撃する。' },
    deadly: { name: '必殺', icon: '☠️', desc: (val) => '戦闘した時、相手を破壊する。' },
    draw: { name: '入替', icon: '🃏', desc: (val) => `召喚時、手札を${val || 1}枚まで捨て、同数引く。` },
    heal: { name: '回復', icon: '💚', desc: (val) => `召喚時、リーダーのHPを${val || 3}回復する。` },
    snipe: { name: '狙撃', icon: '🎯', desc: (val) => `召喚時、相手の場で最大パワーのカード1枚に${val || 4}ダメージ。` },
    spread: { name: '拡散', icon: '☄️', desc: (val) => `召喚時、正面とその隣レーンのカードに${val || 2}ダメージ。` },
    copy: { name: '複製', icon: '👯', desc: (val) => '召喚時、自分の場の隣のレーンのカードのパワーの合計を自身に+する。' },
    support: { name: '援護', icon: '🚩', desc: (val) => `召喚時、自分の場の隣のレーンのカードのパワーを+${val || 2}する。` },
    defender: { name: '防御', icon: '🧱', desc: (val) => '敵カードやリーダーにダメージを与えられない。' },
    clone: { name: '分身', icon: '👥', desc: (val) => `召喚時、自分のレーンに、自身と同じパワーと能力のカードを${val || 1}体まで配置する。` },
    lone_wolf: { name: '単騎', icon: '🐺', desc: (val) => `召喚時、自分の空いているレーンの数×${val || 3}だけパワーを上げる。` },
    soul_bind: { name: '魂縛', icon: '⛓️', desc: (val) => `戦闘で敵を破壊した時、パワーを+${val || 2}する。` },
    sturdy: { name: '頑丈', icon: '⛰', desc: (val) => '戦闘時、受けるダメージを半減する（端数切り捨て）。' },
    berserk: { name: '狂乱', icon: '💢', desc: (val) => `召喚時、自分の場の隣のレーンにいるカードに${val}ダメージ。` },
    split: { name: '分裂', icon: '🐙', desc: (val) => `破壊時、同じレーンにパワー${val}のトークンを出す。` },
    sacrifice: { name: '対価', icon: '🩸', desc: (val) => `召喚時、自分のリーダーに${val || 3}ダメージを与える。` },
    bind: { name: '拘束', icon: '🕸️', desc: (val) => `召喚時、正面のカードに${val}ターンの間「防御」を持たせる。` },
    growth: { name: '成長', icon: '🌱', desc: (val) => `自分のターン開始時、パワーを${val >= 0 ? '+' : ''}${val}する。` },
    hero: { name: '英雄', icon: '🏆', desc: (val) => `召喚時、自分の埋まっているレーンにつきパワーを${val >= 0 ? '+' : ''}${val}する` },
    charge: { name: '充填', icon: '🔋', desc: (val) => `召喚時、自分のリーダーのSPを${val >= 0 ? '+' : ''}${val}する` },
    stealth: { name: '潜伏', icon: '👣', desc: (val) => `召喚時、自身に無敵${val || 1}を付与する。` },
    invincible: { name: '無敵', icon: '✨', desc: (val) => `${val}ターンの間、戦闘でダメージを受けない。` },
    guardian: { name: '守護', icon: '🛡️', desc: (val) => '隣のレーンの味方が戦闘で受けるダメージを肩代わりする。' },
    legendary: { name: '伝説', icon: '👑', desc: (val) => '中央のレーンにしか配置できない。' },
    takeover: { name: '生贄', icon: '🦖', desc: (val) => '既にカードの置かれているレーンにしか配置できない。' },
    pierce: { name: '貫通', icon: '🏹', desc: (val) => '自分のターンに、戦闘で敵を破壊した時、自身のパワーの分だけ相手リーダーにダメージを与える。' }
};

// 召喚時にのみ発動するスキル（ボード上では発動後に非表示にする）
const ACTIVE_SKILLS = [
    'draw', 'heal', 'snipe', 'spread', 'copy', 'support', 'clone',
    'lone_wolf', 'berserk', 'sacrifice', 'bind', 'quick', 'hero', 'charge', 'stealth'
];

// 戦闘中やターン開始時など、継続的に影響を与えるスキル
const PASSIVE_SKILLS = [
    'deadly', 'sturdy', 'soul_bind', 'growth', 'defender', 'split', 'invincible', 'legendary', 'takeover', 'pierce'
];

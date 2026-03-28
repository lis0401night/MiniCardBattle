/**
 * Mini Card Battle - Skill Definitions
 */
export const SKILLS = {
    none: { name: '通常', icon: '', desc: (val) => '' },
    quick: { name: '速攻', icon: '⚡', desc: (val) => '召喚時、ただちに正面に攻撃する。' },
    deadly: { name: '必殺', icon: '☠️', desc: (val) => '戦闘した時、相手を破壊する。' },
    draw: { name: '入替', icon: '🃏', desc: (val) => `召喚時、手札を${val || 1}枚まで捨て、同数引く。` },
    heal: { name: '回復', icon: '💚', desc: (val) => `召喚時、リーダーのHPを${val || 3}回復する。` },
    snipe: { name: '狙撃', icon: '🎯', desc: (val) => `召喚時、相手の場で最大パワーのカード1枚に${val || 4}ダメージ。（同値の場合は左優先）` },
    spread: { name: '拡散', icon: '☄️', desc: (val) => `召喚時、正面とその隣のレーンのカードに${val || 2}ダメージ。` },
    morph: { name: '変化', icon: '🌀', desc: (val) => `召喚時、相手の手札の最大パワーのカード${val}枚を捨て、同数「虚空」を加える。（同値の場合は左優先）` },
    double_strike: { name: '連撃', icon: '⚔️', desc: () => '戦闘時、与えるダメージが2倍になる。' },
    support: { name: '援護', icon: '🚩', desc: (val) => `召喚時、自分の場の隣のレーンのカードのパワーを+${val || 2}する。` },
    defender: { name: '防御', icon: '🧱', desc: (val) => '攻撃せず、敵カードやリーダーにダメージを与えられない。' },
    clone: { name: '分身', icon: '👥', desc: (val) => `召喚時、自分のレーンに、自身と同じパワーと能力のトークンを${val || 1}体まで配置する。` },
    lone_wolf: { name: '単騎', icon: '🐺', desc: (val) => `召喚時、自分の空いているレーンの数×${val || 3}だけパワーを上げる。` },
    soul_bind: { name: '魂縛', icon: '⛓️', desc: (val) => `戦闘で敵を破壊した時、パワーを+${val || 2}する。` },
    sturdy: { name: '頑丈', icon: '⛰', desc: (val) => '戦闘時、受けるダメージを半減する（端数切り捨て）。' },
    berserk: { name: '狂乱', icon: '💢', desc: (val) => `召喚時、自分の場の隣のレーンのカードに${val}ダメージ。` },
    split: { name: '分裂', icon: '🐙', desc: (val) => `破壊時、同じレーンにパワー${val}のトークンを出す。` },
    sacrifice: { name: '対価', icon: '🩸', desc: (val) => `召喚時、自分リーダーに${val || 3}ダメージ` },
    bind: { name: '拘束', icon: '🕸️', desc: (val) => `召喚時、正面のカードに${val}ターンの間「防御」を持たせる。` },
    growth: { name: '成長', icon: '🌱', desc: (val) => `自分のターン開始時、パワーを${val >= 0 ? '+' : ''}${val}する。` },
    hero: { name: '英雄', icon: '🏆', desc: (val) => `召喚時、自分の埋まっているレーンにつきパワーを${val >= 0 ? '+' : ''}${val}する` },
    charge: { name: '充填', icon: '🔋', desc: (val) => `召喚時、自分リーダーのSPを${val >= 0 ? '+' : ''}${val}する` },
    stealth: { name: '潜伏', icon: '👣', desc: (val) => `召喚時、自身に無敵${val || 1}を付与する。` },
    invincible: { name: '無敵', icon: '✨', desc: (val) => `${val}ターンの間、戦闘でダメージを受けない。` },
    guardian: { name: '守護', icon: '🛡️', desc: (val) => '隣のレーンの味方が戦闘で受けるダメージを肩代わりする。' },
    legendary: { name: '伝説', icon: '👑', desc: (val) => '中央のレーンにしか召喚できない。' },
    takeover: { name: '生贄', icon: '🦖', desc: (val) => '既にカードの置かれているレーンにしか召喚できない。' },
    pierce: { name: '貫通', icon: '🏹', desc: (val) => '自分のターンに、戦闘で敵を破壊した時、自身のパワーの分だけ相手リーダーにダメージを与える。' },
    explode: { name: '誘爆', icon: '💣', desc: (val) => `破壊時、自分の場の隣のレーンのカードに${val || 3}ダメージ。` },
    contract: { name: '契約', icon: '📜', desc: (val) => `自分のターン開始時、自分リーダーに${val || 3}ダメージ。` },
    choice: { name: '選択', icon: '🌓', desc: (val) => `召喚時、以下のスキルから${val}つを選んで発動する。` },
    metamorph: { name: '変身', icon: '❓', desc: (val) => '召喚時、全カードの中からランダムに1枚に変身し、その能力を発動する。' },
    resurrect: { name: '復活', icon: '⚰️', desc: (val) => `召喚時、自分の墓地からパワー${val}以下のカード1枚を選択して配置する。` },
    standby: { name: '待機', icon: '⏳', desc: (val) => `召喚時、自身に${val}ターン防御を付与する。` },
    artillery: { name: '砲撃', icon: '💥', desc: (val) => `召喚時、相手リーダーに${val}ダメージ` },
    shuffle: { name: '攪乱', icon: '🃏', desc: (val) => '召喚時、お互いの手札を全て捨て、墓地をリセットする。その後、お互いにカードを4枚引く。' },
    summon: { name: '召喚', icon: '✨', desc: (val) => `召喚時、自分のレーンに、パワー${val}のトークンを配置する。` },
    immune: { name: '無効', icon: '🚫', desc: (val) => '能力による破壊やダメージを受けない。' },
    fate: { name: '運命', icon: '🎲', desc: (val) => '召喚時、5/6で相手に1～5ダメージ、1/6で自分に6ダメージ。' },
    salvage: { name: '回収', icon: '🧲', desc: (val) => '召喚時、自分の墓地からカードを1枚選び、手札に加える。' },
    reinforce: { name: '増援', icon: '📣', desc: (val) => `召喚時、手札を${val || 1}枚まで捨て、同数自身と同じパワーのトークンを手札に加える。` },
    extort: { name: '簒奪', icon: '💰', desc: (val) => `相手リーダーにダメージを与えた時、相手の手札からランダムに${val || 1}枚を捨て、同数「虚空」を加える。` },
    toxic: { name: '有毒', icon: '🧪', desc: (val) => `召喚時、正面のレーンのカードに成長${-val}を付与する。` },
    convert: { name: '転換', icon: '♻️', desc: (val) => `召喚時、手札を${val || 1}枚捨て、同数「虚空」を加える。` },
    invade: { name: '侵略', icon: '🛸', desc: (val) => '召喚時、自分の墓地のカードの種類1枚につきパワーを+1する。' },
    enhance: { name: '強化', icon: '💎', desc: (val) => `召喚時、自分の場のカード1枚に成長+${val}を与える。` }
};

export const ACTIVE_SKILLS = [
    'draw', 'heal', 'snipe', 'spread', 'support', 'clone',
    'lone_wolf', 'berserk', 'sacrifice', 'bind', 'quick', 'hero', 'charge', 'stealth', 'morph', 'choice', 'metamorph', 'resurrect', 'standby', 'artillery', 'shuffle', 'summon', 'fate', 'salvage', 'reinforce', 'toxic', 'convert', 'invade', 'enhance'
];

// 戦闘中やターン開始時など、継続的に影響を与えるスキル
export const PASSIVE_SKILLS = [
    'deadly', 'sturdy', 'soul_bind', 'growth', 'defender', 'split', 'invincible', 'legendary', 'takeover', 'pierce', 'explode', 'contract', 'double_strike', 'immune', 'extort'
];

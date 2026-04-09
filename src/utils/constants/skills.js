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
    morph: { name: '変化', icon: '🌀', desc: (val) => `召喚時、相手の手札の最大パワーのカード${val}枚を捨て、同数「虚空（パワー1）」を加える。（同値の場合は左優先）` },
    double_strike: { name: '連撃', icon: '⚔️', desc: () => '戦闘時、敵カードに与えるダメージが2倍になる。' },
    support: { name: '援護', icon: '🚩', desc: (val) => `召喚時、自分の場の隣のレーンのカードのパワーを+${val || 2}する。` },
    defender: { name: '防御', icon: '🧱', desc: (val) => '攻撃せず、敵カードやリーダーにダメージを与えられない。' },
    clone: { name: '分身', icon: '👥', desc: (val) => `召喚時、自分のレーンに、自身と同じパワーと能力のトークンを${val || 1}体まで配置する。` },
    lone_wolf: { name: '単騎', icon: '🐺', desc: (val) => `召喚時、自分の空いているレーンの数×${val || 3}だけパワーを上げる。` },
    soul_bind: { name: '魂縛', icon: '⛓️', desc: (val) => `戦闘で敵を破壊した時、パワーを+${val || 2}する。` },
    sturdy: { name: '頑丈', icon: '⛰', desc: (val) => '戦闘時、受けるダメージを半減する（端数切り捨て）。' },
    berserk: { name: '狂乱', icon: '💢', desc: (val) => `召喚時、自分の場の隣のレーンのカードに${val}ダメージ。` },
    split: { name: '分裂', icon: '🐙', desc: (val) => `破壊時、同じレーンにパワー${val}のトークンを出す。` },
    sacrifice: { name: '代償', icon: '🩸', desc: (val) => `召喚時、自分リーダーに${val || 3}ダメージ` },
    bind: { name: '拘束', icon: '🕸️', desc: (val) => `召喚時、正面のカードに${val}ターンの間「防御」を持たせる。` },
    growth: { name: '成長', icon: '🌱', desc: (val) => `自分のターン開始時、パワーを${val >= 0 ? '+' : ''}${val}する。` },
    hero: { name: '英雄', icon: '🏆', desc: (val) => `召喚時、自分の他の埋まっているレーンにつきパワーを${val >= 0 ? '+' : ''}${val}する` },
    charge: { name: '充填', icon: '🔋', desc: (val) => `召喚時、自分リーダーのSPを${val >= 0 ? '+' : ''}${val}する` },
    stealth: { name: '潜伏', icon: '👣', desc: (val) => `召喚時、自身に無敵${val || 1}を付与する。` },
    invincible: { name: '無敵', icon: '✨', desc: (val) => `${val}ターンの間、戦闘でダメージを受けない。` },
    guardian: { name: '守護', icon: '🛡️', desc: (val) => '隣のレーンの味方が戦闘で受けるダメージを肩代わりする。' },
    legendary: { name: '伝説', icon: '👑', desc: (val) => '中央のレーンにしか召喚できない。' },
    takeover: { name: '生贄', icon: '🦖', desc: (val) => '既にカードが置かれているレーンにしか召喚できない。' },
    pierce: { name: '貫通', icon: '🏹', desc: (val) => '自分のターンに、敵を攻撃した時、自身のパワーの差分だけ相手リーダーにダメージを与える。' },
    explode: { name: '誘爆', icon: '💣', desc: (val) => `破壊時、自分の場の隣のレーンのカードに${val || 3}ダメージ。` },
    contract: { name: '契約', icon: '📜', desc: (val) => `自分のターン開始時、自分リーダーに${val || 3}ダメージ。` },
    choice: { name: '選択', icon: '🌓', desc: (val) => `召喚時、以下のスキルから${val}つを選んで発動する。` },
    metamorph: { name: '変身', icon: '❓', desc: (val) => '召喚時、全カードの中からランダムに1枚に変身し、その能力を発動する。' },
    resurrect: { name: '復活', icon: '⚰️', desc: (val) => `召喚時、自分の墓地からパワー${val}以下のカード1枚を選択して配置する。` },
    standby: { name: '待機', icon: '⏳', desc: (val) => `召喚時、自身に${val}ターン防御を付与する。` },
    artillery: { name: '砲撃', icon: '💥', desc: (val) => `召喚時、相手リーダーに${val}ダメージ` },
    shuffle: { name: '攪乱', icon: '🃏', desc: (val) => '召喚時、お互いの手札を全て捨て、墓地をリセットする。その後、お互いにカードを3枚引く。' },
    summon: { name: '召喚', icon: '✨', desc: (val) => `召喚時、自分のレーンに、パワー${val}のトークンを配置する。` },
    immune: { name: '無効', icon: '🚫', desc: (val) => '能力による破壊やダメージを受けない。' },
    fate: { name: '運命', icon: '🎲', desc: (val) => '召喚時、5/6で相手に1～5ダメージ、1/6で自分に6ダメージ。' },
    salvage: { name: '回収', icon: '🧲', desc: (val) => `召喚時、手札を${val || 1}枚まで捨て、同数自分の墓地からカードを手札に加える。` },
    reinforce: { name: '増援', icon: '📣', desc: (val) => `召喚時、手札を${val || 1}枚まで捨て、同数自身と同じパワーのトークンを手札に加える。` },
    extort: { name: '簒奪', icon: '💰', desc: (val) => `相手リーダーにダメージを与えた時、相手の手札からランダムに${val || 1}枚を捨て、同数「虚空（パワー1）」を加える。` },
    toxic: { name: '有毒', icon: '🧪', desc: (val) => `召喚時、正面のレーンのカードに成長${-val}を付与する。` },
    convert: { name: '対価', icon: '⚖', desc: (val) => `召喚時、手札を${val || 1}枚捨て、同数「虚空（パワー1）」を加える。` },
    dispel: { name: '解除', icon: '🔓', desc: (val) => `召喚時、相手のカード${val || 1}枚を選択し、そのカードが装備中のカードを全て破壊する。対象が「装備」を持つカードならそのカードを破壊する。` },
    invade: { name: '侵略', icon: '🛸', desc: (val) => '召喚時、自分の墓地のカードの種類1枚につきパワーを+1する。' },
    equip: { name: '装備', icon: '🗡️', desc: (val) => '既にカードのあるレーンに配置するとき、下のカードに自身と同じパワーと能力を付与する。' },
    phase: { name: '位相', icon: '🌫️', desc: (val) => '位相を持たないカードと戦闘を行わず、互いにリーダーを直接攻撃する。ただし「防御」にはブロックされる。' },
    petrify: { name: '石化', icon: '🗿', desc: (val) => '召喚時、正面のカードを「石像（パワー5、防御、頑丈）」に変身させる。（破壊時、元のカードが墓地に置かれる）' },
    oblivion: { name: '忘却', icon: '⚪', desc: (val) => '場に居る間、この能力以外の全ての能力を失い、新たな能力も得られない。' },
    call: { name: '号令', icon: '📯', desc: (val) => `召喚時、自分のデッキの一番上のカードを公開し、その数値が${val}以下なら自分のレーンに召喚する。` },
    bless: { name: '祝福', icon: '🕯️', desc: (val) => `召喚時、手札のカード1枚を選び、パワーを+${val}する。` },
    wall_create: { name: '造壁', icon: '🏰', desc: (val) => `召喚時、自分のレーンに、パワー${val}（防御）のトークンを配置する。` },
    challenge: { name: '挑戦', icon: '🥋', desc: (val) => '正面にカードが置かれているレーンにしか召喚できない。' },
    move: { name: '移動', icon: '🏃', desc: (val) => '自分のターン開始時に隣のレーンに移動できる。' },
    freeze: { name: '凍結', icon: '❄️', desc: (val) => `召喚時、正面とその隣のレーンのカードに${val}ターンの間「防御」を持たせる。` },
    loss: { name: '喪失', icon: '🕳️', desc: (val) => `召喚時、自分のデッキの上から${val}枚墓地に送る。` },
    brutal: { name: '暴虐', icon: '🌪️', desc: (val) => `攻撃時、自分の場の隣のレーンのカードに${val}ダメージ。` },
    absorb: { name: '吸収', icon: '💖', desc: (val) => '戦闘で敵にダメージを与えた時、その数値分リーダーを回復する。' }
};

export const ACTIVE_SKILLS = [
    'draw', 'heal', 'snipe', 'spread', 'support', 'clone',
    'lone_wolf', 'berserk', 'sacrifice', 'bind', 'quick', 'hero', 'charge', 'stealth', 'morph', 'choice', 'metamorph', 'resurrect', 'standby', 'artillery', 'shuffle', 'summon', 'fate', 'salvage', 'reinforce', 'toxic', 'convert', 'invade', 'petrify', 'call', 'bless', 'wall_create', 'dispel', 'freeze', 'loss'
];

// 戦闘中やターン開始時など、継続的に影響を与えるスキル
export const PASSIVE_SKILLS = [
    'deadly', 'sturdy', 'soul_bind', 'growth', 'defender', 'split', 'invincible', 'legendary', 'takeover', 'pierce', 'explode', 'contract', 'double_strike', 'immune', 'extort', 'phase', 'oblivion', 'challenge', 'move', 'brutal', 'absorb'
];

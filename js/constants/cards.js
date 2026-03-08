/**
 * Mini Card Battle - Card Master Data
 */
const CARD_MASTER = [
    { id: 'golem', name: '通常', power: 7, skill: 'none', flavor: '古代の遺産である魔導人形。意志を持たず忠実に守りを固める。' },
    { id: 'scorpion', name: '必殺', power: 2, skill: 'deadly', flavor: '必殺の毒針を持つ砂漠の暗殺者。一撃で敵を葬り去る。' },
    { id: 'diviner', name: '入替', power: 5, skill: 'draw', flavor: '星の動きから運命を読み解き、不要な手札を入れ替える預言者。' },
    { id: 'cheetah', name: '速攻', power: 2, skill: 'quick', flavor: '戦場を風のように駆け抜ける俊足の狩人。' },
    { id: 'cleric', name: '回復', power: 3, skill: 'heal', skillValue: 3, flavor: 'リーダーの傷を癒やす聖職者。' },
    { id: 'sniper', name: '狙撃', power: 2, skill: 'snipe', skillValue: 4, flavor: '遠距離から急所を射抜く狙撃手。' },
    { id: 'mage', name: '拡散', power: 2, skill: 'spread', skillValue: 2, flavor: '爆破魔法を操り、広範囲の敵を一度に焼き払う魔導師。' },
    { id: 'copy', name: '複製', power: 1, skill: 'copy', flavor: 'あらゆる姿と力を完璧に模倣する変幻自在の魔物。' },
    { id: 'commander', name: '援護', power: 3, skill: 'support', skillValue: 2, flavor: '味方を鼓舞して力を引き出す指揮官。' },
    { id: 'wall', name: '防御', power: 10, skill: 'defender', flavor: '鉄壁の守りを誇る城壁。あらゆる侵略者を通さない王国の盾。' },
    { id: 'wolf', name: '単騎', power: 3, skill: 'lone_wolf', skillValue: 3, flavor: '一匹狼で戦う誇り高き狼獣人。' },
    { id: 'shade', name: '魂縛', power: 4, skill: 'soul_bind', skillValue: 2, flavor: '死者の影。倒した者の魂を束縛し、自らの糧とする。' },
    { id: 'tortoise', name: '頑丈', power: 4, skill: 'sturdy', flavor: '鋼鉄の甲羅を持つ巨大な亀。あらゆる攻撃を跳ね返す。' },
    { id: 'clone', name: '分身', power: 2, skill: 'clone', skillValue: 1, flavor: '鏡の魔力で自らの鏡像を戦場に作り出す。' },
    // トークンカード
    { id: 'token_soldier', name: '騎士', power: 1, skill: 'none', isToken: true, flavor: 'セレスティアの号令で召喚された騎士。' },
    { id: 'token_ignis', name: 'イグニス', power: 7, skill: 'none', isToken: true, flavor: '降臨した竜族の姫。' },
    { id: 'token_satan', name: '魔王の化身', power: 10, skill: 'none', isToken: true, flavor: '魔王サタンの強大な化身。' },
    { id: 'token_clone', name: '分身', power: 1, skill: 'none', isToken: true, flavor: '本体から生み出された分身。' }
];
